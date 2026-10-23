/**
 * MIGRAÇÃO v1 → 2.0 — transformação PURA e determinística.
 *
 *   transformLegacy(dump) → MigrationPlan { tables, counts, warnings, unmapped }
 *
 * `dump` = { nomeDaColeçãoAntiga: [ { id, ...campos } ] } (arquivo de backup do
 * sistema antigo ou leitura direta do Firestore). Nada é gravado aqui: o
 * importador (importer.ts) grava o plano pelo DataApi.
 *
 * Ids: o id antigo é reaproveitado como `id` e `legacyId` (1→1); registros
 * derivados usam ids determinísticos (`${saleId}-i1`, `${batchId}-a1`,
 * `${saleId}-p1`, `${batchId}-c-feed`…) — reimportar NÃO duplica.
 */
import type { Row, TableName } from '../domain/schema';
import type { AppSettings, Counter, MeatType } from '../domain/types';
import { BACKUP_FILE_COLLECTIONS, LEGACY_COLLECTIONS, READ_ERRORS_KEY, type LegacyDump } from './collections';
import { Ctx, type LegacyFileCopy, type LegacyStorageLink, type ProductHints, type TransformOptions } from './context';
import { bool, docs, itemKindFromName, normalize, setTzOffset, str, upper, firstStr } from './legacy-utils';
import {
  mapAudit,
  mapCatalog,
  mapCustomerRequests,
  mapCustomers,
  mapInvites,
  mapPartners,
  mapPortalAccounts,
  mapPortalInvites,
  mapPriceTables,
  mapProducts,
  mapPublicLinks,
  mapSettings,
  mapSimulations,
  mapSupplyItems,
  mapTasks,
  settingsRow,
} from './map-base';
import { mapBatches, mapFeed, mapInventory, mapLosses, mapProcessing } from './map-cattle';
import { mapEquines, mapSemen } from './map-equines';
import { txIndex } from './map-finance';
import { mapDeletedSales, mapSales, mapSupplyMovements } from './map-sales';
import { mapStockHistory } from './map-stock-history';
import { withDefaults } from '../app/settings';

export type { LegacyFileCopy, LegacyStorageLink, TransformOptions } from './context';

export type PlanTables = { [K in TableName]?: Row<K>[] };

export interface MigrationPlan {
  /** Linhas prontas para gravar, por tabela nova. */
  tables: PlanTables;
  /** Quantidade de linhas por tabela nova. */
  counts: Partial<Record<TableName, number>>;
  /** Documentos lidos por coleção antiga. */
  sourceCounts: Record<string, number>;
  /** Avisos para o usuário (agregados, em português). */
  warnings: string[];
  /** Coleções do dump que a migração não reconhece. */
  unmapped: string[];
  /** Coleções reconhecidas mas sem equivalente no sistema novo (ignoradas de propósito). */
  ignored: string[];
  /** PDFs de NF/boleto guardados em pedaços no banco antigo — copiados para o Storage depois da gravação. */
  files: LegacyFileCopy[];
  /** Outro projeto: anexos que só têm o caminho no Storage antigo (o link de download é buscado na importação). */
  storageLinks: LegacyStorageLink[];
  /** O plano foi feito para um sistema novo em OUTRO projeto Firebase. */
  otherProject: boolean;
  /** Campos de configuração vindos do sistema antigo (o importador mescla com as configurações atuais). */
  settingsPatch: Partial<AppSettings>;
  /** Momento usado nos carimbos da migração. */
  generatedAt: string;
}

/** Coleções conhecidas sem equivalente (motivo exibido no aviso). */
const IGNORED: Record<string, string> = {
  backups: 'histórico de backups do sistema antigo',
  registered_tags: 'os brincos ficam nos próprios animais',
  test: 'teste de conexão',
};

const MAPPED = new Set<string>([...LEGACY_COLLECTIONS, ...Object.keys(IGNORED), 'metadata', READ_ERRORS_KEY]);

/** Junta os nomes de corte de todas as fontes e cria os produtos que faltam (em ordem alfabética). */
function ensureCutProducts(ctx: Ctx) {
  const cuts = new Map<string, { name: string; hints: ProductHints; kinds: Set<string> }>();
  const add = (name: unknown, meat: MeatType | null, unit?: 'KG' | 'UN') => {
    const n = str(name);
    if (!n) return;
    const k = normalize(n);
    const cur = cuts.get(k) || { name: n, hints: {}, kinds: new Set<string>() };
    if (meat) cur.kinds.add(meat);
    if (unit === 'UN' && !cur.hints.unit) cur.hints.unit = 'UN';
    if (unit === 'KG') cur.hints.unit = 'KG';
    cuts.set(k, cur);
  };
  const meat = (v: unknown): MeatType | null => (upper(v) === 'GRILL' ? 'GRILL' : upper(v) === 'PROCESSED' ? 'PROCESSED' : null);
  for (const d of ctx.col('inventory')) add(d.cutType, bool(d.isSlaughterEntry) ? 'RAW' : meat(d.meatType), 'KG');
  for (const d of ctx.col('price_tables')) for (const i of docs(d.items)) add(i.cutType, meat(i.meatType), 'KG');
  for (const s of ctx.col('sales'))
    for (const i of docs(s.items)) {
      const name = firstStr(i.cutType, i.name);
      if (itemKindFromName(name, i) === 'PRODUCT') add(name, null, upper(i.unitType) === 'UN' ? 'UN' : 'KG');
    }
  for (const o of ctx.col('processing_orders')) {
    for (const c of [...docs(o.sentCuts), ...docs(o.finishedCuts), ...docs(o.returnEvents).flatMap((e) => docs(e.cuts))]) add(c.cutType, meat(c.meatType), 'KG');
  }
  for (const l of ctx.col('stock_losses')) add(l.cutType, null, 'KG');
  for (const [, c] of [...cuts].sort(([a], [b]) => a.localeCompare(b))) {
    const meatType: MeatType | null = c.kinds.has('GRILL') ? 'GRILL' : c.kinds.has('PROCESSED') ? 'PROCESSED' : c.kinds.has('RAW') ? 'RAW' : null;
    ctx.products.ensure(c.name, { ...c.hints, meatType });
  }
}

export function transformLegacy(dump: Record<string, unknown[]> | Record<string, unknown>, opts: TransformOptions = {}): MigrationPlan {
  setTzOffset(opts.tzOffsetMinutes ?? -180);
  const ctx = new Ctx(dump as LegacyDump, opts);
  const counters = new Map<string, number>();

  // 1) Configurações e cadastros base
  const settingsPatch = mapSettings(ctx);
  const settings = withDefaults(settingsPatch);
  ctx.put('settings', settingsRow(ctx, settingsPatch));
  mapPartners(ctx);
  mapInvites(ctx);
  mapProducts(ctx);
  mapSupplyItems(ctx);
  // 2) Gado
  mapBatches(ctx, counters);
  mapFeed(ctx);
  // 3) Produtos para todos os nomes de corte usados + estoque, preços, clientes
  ensureCutProducts(ctx);
  mapInventory(ctx);
  mapPriceTables(ctx);
  mapCustomers(ctx);
  mapProcessing(ctx, counters);
  mapLosses(ctx);
  // 4) Portal (contas e catálogo antes dos pedidos)
  mapPortalAccounts(ctx);
  mapPortalInvites(ctx);
  mapCatalog(ctx);
  // 5) Vendas + financeiro
  const tx = txIndex(ctx);
  mapSales(ctx, counters, settings, tx);
  mapCustomerRequests(ctx);
  mapDeletedSales(ctx);
  mapStockHistory(ctx);
  mapSupplyMovements(ctx);
  // 6) Demais
  mapPublicLinks(ctx);
  mapTasks(ctx);
  mapSimulations(ctx);
  mapEquines(ctx, tx);
  mapSemen(ctx, tx);
  mapAudit(ctx);

  // Contadores coerentes com o que foi migrado (o importador nunca diminui um contador existente).
  for (const [key, value] of [...counters].sort(([a], [b]) => a.localeCompare(b))) {
    const c: Counter = { id: key, createdAt: ctx.now, updatedAt: ctx.now, legacyId: null, value };
    ctx.put('counters', c);
  }

  // Avisos de leitura / coleções
  for (const e of ctx.readErrors())
    ctx.w.add('read.denied', 'Coleções que não puderam ser lidas no sistema antigo (sem permissão ou inexistentes) — ficaram de fora', `${e.collection}`);
  const keys = Object.keys(dump);
  const unmapped = keys.filter((k) => !MAPPED.has(k) && Array.isArray((dump as Record<string, unknown>)[k])).sort();
  const ignored = keys.filter((k) => IGNORED[k] && docs((dump as Record<string, unknown>)[k]).length).map((k) => `${k} (${IGNORED[k]})`);
  const looksLikeBackup = keys.includes('metadata') && !keys.includes(READ_ERRORS_KEY);
  if (looksLikeBackup) {
    const absent = LEGACY_COLLECTIONS.filter((c) => !keys.includes(c) && !BACKUP_FILE_COLLECTIONS.includes(c));
    if (absent.length)
      ctx.w.note(
        'backup.partial',
        `O arquivo de backup do sistema antigo não traz: ${absent.join(', ')}. Para migrar portal, vendedores externos, materiais, perdas, sêmen e vendas excluídas use "Conectar direto ao sistema antigo" (ou importe o arquivo agora e conecte depois — nada duplica)`,
      );
  }

  const tables = ctx.tables() as PlanTables;

  // Outro projeto: anexos só com caminho (sem link) apontam para o Storage ANTIGO.
  const storageLinks: LegacyStorageLink[] = [];
  if (ctx.otherProject) {
    const isAtt = (v: unknown): v is { id: string; path: string; url?: string | null; uploadedAt: string } =>
      !!v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string' && typeof (v as { path?: unknown }).path === 'string' && 'uploadedAt' in (v as object);
    for (const [t, rows] of Object.entries(tables) as unknown as [TableName, Record<string, unknown>[]][]) {
      for (const row of rows) {
        for (const [field, val] of Object.entries(row)) {
          const list = Array.isArray(val) ? val : val && typeof val === 'object' ? [val] : [];
          for (const a of list) if (isAtt(a) && a.path && !a.url) storageLinks.push({ table: t, rowId: String(row.id), field, attachmentId: a.id, path: a.path });
        }
      }
    }
    const staff = [...new Set(ctx.legacyUserEmail.values())];
    const missing = staff.filter((e) => !ctx.newUserByEmail.has(e));
    if (missing.length)
      ctx.w.note(
        'users.link',
        `${missing.length} usuário(s) do sistema antigo ainda não entraram no sistema novo (${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}). Carteiras, pedidos e comissões deles ficam ligados quando eles entrarem uma vez e você importar de novo (não duplica)`,
      );
  }
  const counts: Partial<Record<TableName, number>> = {};
  for (const [t, rows] of Object.entries(tables)) counts[t as TableName] = (rows as unknown[]).length;
  const sourceCounts: Record<string, number> = {};
  for (const k of keys) if (k !== READ_ERRORS_KEY && Array.isArray((dump as Record<string, unknown>)[k])) sourceCounts[k] = ((dump as Record<string, unknown>)[k] as unknown[]).length;

  return {
    tables,
    counts,
    sourceCounts,
    warnings: ctx.w.list(),
    unmapped,
    ignored,
    files: ctx.files,
    storageLinks,
    otherProject: ctx.otherProject,
    settingsPatch,
    generatedAt: ctx.now,
  };
}
