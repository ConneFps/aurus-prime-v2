/**
 * Gravação do plano de migração pelo DataApi (igual no PostgreSQL e no Firebase).
 *
 *  - Ordem de dependência (cadastros → movimentos), blocos de 300 linhas.
 *  - Tolerante a erro: um bloco que falha é regravado linha a linha; erros
 *    ficam no resultado e a importação segue para a próxima tabela.
 *  - Reimportar sobrescreve pelo id (não duplica). Exceções:
 *      settings  → mescla com as configurações atuais (bootstrapped nunca muda);
 *      counters  → nunca diminui um contador existente;
 *      invites   → mantém convites já aceitos e marca como aceitos os e-mails que já têm usuário.
 */
import { withDefaults, SETTINGS_ID } from '../app/settings';
import type { DataApi, StorageApi } from '../data/api';
import type { Row, TableName } from '../domain/schema';
import { TABLES } from '../domain/schema';
import type { AppSettings, Attachment, Counter, Invite } from '../domain/types';
import type { LegacySource } from './source';
import type { LegacyFileCopy, LegacyStorageLink, MigrationPlan } from './transform';

/** Ordem de gravação (pais antes dos filhos). */
export const IMPORT_ORDER: TableName[] = [
  'settings',
  'counters',
  'invites',
  'partners',
  'products',
  'supply_items',
  'feed_types',
  'price_tables',
  'customers',
  'portal_accounts',
  'portal_invites',
  'customer_requests',
  'freight_zones',
  'catalog_items',
  'public_catalog_links',
  'batches',
  'animals',
  'batch_costs',
  'feed_purchases',
  'feed_consumptions',
  'cattle_simulations',
  'processing_orders',
  'stock_lots',
  'stock_movements',
  'stock_losses',
  'sales',
  'deleted_sales',
  'supply_movements',
  'equines',
  'equine_events',
  'equine_sales',
  'semen_purchases',
  'financial_entries',
  'tasks',
  'audit_logs',
];

export const CHUNK_SIZE = 300;

export interface ImportProgress {
  table: TableName;
  label: string;
  /** Linhas gravadas nesta tabela / total da tabela. */
  done: number;
  total: number;
  /** Linhas gravadas no total / total geral. */
  overallDone: number;
  overallTotal: number;
  phase: 'start' | 'chunk' | 'done' | 'error';
  message?: string;
}

export interface TableResult {
  table: TableName;
  label: string;
  total: number;
  written: number;
  failed: number;
  errors: string[];
}

export interface ImportResult {
  startedAt: string;
  finishedAt: string;
  tables: TableResult[];
  written: number;
  failed: number;
  ok: boolean;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Ajustes que dependem do que já existe no banco novo. */
async function prepare<K extends TableName>(data: DataApi, table: K, rows: Row<K>[], plan: MigrationPlan): Promise<Row<K>[]> {
  if (table === 'settings') {
    const cur = await data.get('settings', SETTINGS_ID).catch(() => null);
    const base = cur ?? (rows[0] as AppSettings | undefined) ?? null;
    const merged: AppSettings = {
      ...withDefaults({ ...(base || {}), ...plan.settingsPatch }),
      id: SETTINGS_ID,
      createdAt: cur?.createdAt || (rows[0] as AppSettings | undefined)?.createdAt || plan.generatedAt,
      updatedAt: plan.generatedAt,
    };
    // "Sistema já iniciado" nunca muda pela migração.
    if (cur) merged.bootstrapped = cur.bootstrapped ?? null;
    else delete (merged as Partial<AppSettings>).bootstrapped;
    return [merged as Row<K>];
  }
  if (table === 'counters') {
    const out: Counter[] = [];
    for (const r of rows as Counter[]) {
      const cur = await data.get('counters', r.id).catch(() => null);
      out.push(cur && (cur.value || 0) >= r.value ? { ...r, value: cur.value } : r);
    }
    return out as Row<K>[];
  }
  if (table === 'invites') {
    const [profiles, existing] = await Promise.all([data.list('profiles').catch(() => []), data.list('invites').catch(() => [])]);
    const byEmail = new Map(profiles.map((p) => [(p.email || '').toLowerCase(), p]));
    const inv = new Map(existing.map((i) => [i.id, i]));
    return (rows as Invite[]).map((r) => {
      const cur = inv.get(r.id);
      if (cur?.status === 'ACCEPTED') return { ...r, status: 'ACCEPTED', profileId: cur.profileId ?? null, acceptedAt: cur.acceptedAt ?? null, role: cur.role };
      const prof = byEmail.get(r.email);
      if (prof) return { ...r, status: 'ACCEPTED', profileId: prof.id, acceptedAt: prof.createdAt || r.createdAt, role: prof.role };
      return r;
    }) as Row<K>[];
  }
  return rows;
}

/**
 * Grava o plano. `onProgress` é chamado no início/fim de cada tabela e a cada bloco.
 * Nunca lança por erro de gravação: veja `result.tables[].errors`.
 */
export async function importPlan(data: DataApi, plan: MigrationPlan, onProgress?: (p: ImportProgress) => void): Promise<ImportResult> {
  const startedAt = new Date().toISOString();
  const order = [...IMPORT_ORDER, ...(Object.keys(plan.tables) as TableName[]).filter((t) => !IMPORT_ORDER.includes(t))];
  const overallTotal = order.reduce((s, t) => s + (plan.tables[t]?.length || 0), 0);
  let overallDone = 0;
  const results: TableResult[] = [];

  for (const table of order) {
    const planned = (plan.tables[table] || []) as Row<typeof table>[];
    if (!planned.length) continue;
    const label = TABLES[table]?.label || table;
    const res: TableResult = { table, label, total: planned.length, written: 0, failed: 0, errors: [] };
    results.push(res);
    const emit = (phase: ImportProgress['phase'], message?: string) =>
      onProgress?.({ table, label, done: res.written + res.failed, total: res.total, overallDone, overallTotal, phase, message });
    emit('start');
    let rows: Row<typeof table>[];
    try {
      rows = await prepare(data, table, planned, plan);
    } catch (e) {
      rows = planned;
      res.errors.push(`Preparação: ${msg(e)}`);
    }
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      try {
        await data.upsertMany(table, chunk);
        res.written += chunk.length;
      } catch (e) {
        // Isola as linhas com problema e segue com as demais.
        for (const row of chunk) {
          try {
            await data.upsertMany(table, [row]);
            res.written++;
          } catch (e2) {
            res.failed++;
            if (res.errors.length < 5) res.errors.push(`${(row as { id: string }).id}: ${msg(e2)}`);
          }
        }
        if (res.failed && res.errors.length === 0) res.errors.push(msg(e));
      }
      overallDone += chunk.length;
      emit('chunk');
    }
    emit(res.failed ? 'error' : 'done', res.failed ? `${res.failed} linha(s) com erro` : undefined);
  }

  const written = results.reduce((s, r) => s + r.written, 0);
  const failed = results.reduce((s, r) => s + r.failed, 0);
  return { startedAt, finishedAt: new Date().toISOString(), tables: results, written, failed, ok: failed === 0 };
}

// ============================================================================
// PDFs de NF/boleto guardados em pedaços no banco antigo → Storage
// ============================================================================

export interface FileCopyResult {
  total: number;
  copied: number;
  skipped: number;
  failed: number;
  errors: string[];
}

/** Id fixo do anexo copiado: reexecutar a cópia não duplica. */
export const legacyFileAttachmentId = (key: string) => `legado-${key}`;

/**
 * Copia os PDFs para o Storage (pasta do pedido) e anexa ao pedido migrado.
 * Pula os que já foram copiados; um arquivo com erro não interrompe os demais.
 */
export async function copyLegacyFiles(
  backend: { data: DataApi; storage: StorageApi },
  source: Pick<LegacySource, 'readAttachment'>,
  files: LegacyFileCopy[],
  onProgress?: (done: number, total: number) => void,
): Promise<FileCopyResult> {
  const res: FileCopyResult = { total: files.length, copied: 0, skipped: 0, failed: 0, errors: [] };
  if (!source.readAttachment) {
    res.skipped = files.length;
    return res;
  }
  let done = 0;
  for (const f of files) {
    try {
      const sale = await backend.data.get('sales', f.saleId);
      const attId = legacyFileAttachmentId(f.key);
      if (!sale || (sale.attachments || []).some((a) => a.id === attId)) {
        res.skipped++;
      } else {
        const blob = await source.readAttachment(f.key);
        if (!blob) {
          res.failed++;
          if (res.errors.length < 8) res.errors.push(`Pedido ${f.saleNumber}: arquivo não encontrado no banco antigo`);
        } else {
          const up = await backend.storage.upload(`sales/${f.saleId}`, blob, { name: f.name, kind: f.kind });
          const att: Attachment = { ...up, id: attId, kind: f.kind, mimeType: up.mimeType || f.mimeType, uploadedBy: 'Migração' };
          const fresh = (await backend.data.get('sales', f.saleId)) || sale;
          await backend.data.update('sales', f.saleId, { attachments: [...(fresh.attachments || []).filter((a) => a.id !== attId), att] });
          res.copied++;
        }
      }
    } catch (e) {
      res.failed++;
      if (res.errors.length < 8) res.errors.push(`Pedido ${f.saleNumber}: ${msg(e)}`);
    }
    done++;
    onProgress?.(done, files.length);
  }
  return res;
}

/**
 * Outro projeto: completa o link de download dos anexos que só tinham o caminho no
 * Storage antigo (o arquivo continua lá; o link funciona de qualquer projeto).
 */
export async function resolveLegacyStorageLinks(
  data: DataApi,
  source: Pick<LegacySource, 'storageUrl'>,
  links: LegacyStorageLink[],
  onProgress?: (done: number, total: number) => void,
): Promise<FileCopyResult> {
  const res: FileCopyResult = { total: links.length, copied: 0, skipped: 0, failed: 0, errors: [] };
  if (!source.storageUrl) {
    res.skipped = links.length;
    return res;
  }
  const byRow = new Map<string, LegacyStorageLink[]>();
  for (const l of links) {
    const k = `${l.table}|${l.rowId}`;
    byRow.set(k, [...(byRow.get(k) || []), l]);
  }
  let done = 0;
  for (const list of byRow.values()) {
    const { table, rowId } = list[0];
    try {
      const row = (await data.get(table, rowId)) as Record<string, unknown> | null;
      if (!row) {
        res.skipped += list.length;
      } else {
        const patch: Record<string, unknown> = {};
        for (const l of list) {
          const cur = (patch[l.field] ?? row[l.field]) as unknown;
          const url = await source.storageUrl(l.path).catch(() => null);
          if (!url) {
            res.failed++;
            if (res.errors.length < 8) res.errors.push(`${l.path}: arquivo não encontrado no Storage antigo`);
            continue;
          }
          const fix = (a: unknown) => (a && typeof a === 'object' && (a as { id?: string }).id === l.attachmentId ? { ...(a as object), url } : a);
          patch[l.field] = Array.isArray(cur) ? cur.map(fix) : fix(cur);
          res.copied++;
        }
        if (Object.keys(patch).length) await data.update(table, rowId, patch as never);
      }
    } catch (e) {
      res.failed += list.length;
      if (res.errors.length < 8) res.errors.push(`${table}/${rowId}: ${msg(e)}`);
    }
    done += list.length;
    onProgress?.(done, links.length);
  }
  return res;
}

// ============================================================================
// Arquivo de backup
// ============================================================================

export interface BackupFile {
  /** Coleções do arquivo: { batches: [...], sales: [...], … } (+ metadata). */
  dump: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  fileName: string;
  sizeBytes: number;
  /** Total de documentos no arquivo. */
  totalDocs: number;
}

/**
 * Lê o arquivo JSON gerado em Configurações → Backup do sistema antigo
 * (`{ metadata: {...}, batches: [...], ... }`). Aceita também o formato
 * `{ collections: {...} }` e documentos sem a chave `metadata`.
 */
export async function readBackupFile(file: File): Promise<BackupFile> {
  let text: string;
  try {
    text = typeof file.text === 'function' ? await file.text() : await new Response(file).text();
  } catch {
    throw new Error('Não foi possível ler o arquivo.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new Error('O arquivo não é um JSON válido. Use o arquivo baixado em Configurações → Backup do sistema antigo.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Formato de backup não reconhecido.');
  let root = parsed as Record<string, unknown>;
  if (root.collections && typeof root.collections === 'object' && !Array.isArray(root.collections)) {
    root = { ...(root.collections as Record<string, unknown>), metadata: root.metadata };
  }
  const dump: Record<string, unknown> = {};
  let totalDocs = 0;
  for (const [k, v] of Object.entries(root)) {
    if (Array.isArray(v)) {
      dump[k] = v;
      totalDocs += v.length;
    } else if (v && typeof v === 'object' && k !== 'metadata') {
      // Coleção gravada como objeto { id: {...} }
      const list = Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => x && typeof x === 'object' && !Array.isArray(x))
        .map(([id, x]) => ({ id, ...(x as Record<string, unknown>) }));
      if (list.length) {
        dump[k] = list;
        totalDocs += list.length;
      }
    }
  }
  const metadata = root.metadata && typeof root.metadata === 'object' ? (root.metadata as Record<string, unknown>) : null;
  if (metadata) dump.metadata = metadata;
  if (!totalDocs) throw new Error('O arquivo não contém nenhum registro do sistema antigo.');
  return { dump, metadata, fileName: file.name, sizeBytes: file.size, totalDocs };
}
