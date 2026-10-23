/**
 * Coleções do sistema antigo (Firebase/Firestore v1) e utilitários de leitura
 * SEM dependência do SDK do Firebase (os leitores de cada opção passam funções
 * de listagem; aqui só há a lógica comum).
 */

/** Coleções de nível superior lidas na conexão direta (ordem = ordem de leitura). */
export const LEGACY_COLLECTIONS = [
  'system_config',
  'portal_settings',
  'users',
  'external_sellers',
  'sellers',
  'slaughterhouses',
  'products',
  'supply_items',
  'batches',
  'feed_types',
  'feed_stock',
  'feed_consumption',
  'inventory',
  'price_tables',
  'customers',
  'processing_orders',
  'stock_losses',
  'financial_transactions',
  'sales',
  'sales_attachments',
  'portal_users',
  'portal_catalog',
  'portal_orders',
  'customer_requests',
  'portal_invites',
  'stock_deduction_logs',
  'deleted_sales',
  'supply_movements',
  'operational_tasks',
  'cattle_simulations',
  'audit_logs',
  'public_catalogs',
  'equines',
  'semen_purchases',
  'order_counters',
] as const;

/** Coleções que o arquivo de backup do sistema antigo inclui (Configurações → Backup). */
export const BACKUP_FILE_COLLECTIONS = [
  'batches',
  'inventory',
  'customers',
  'sales',
  'users',
  'products',
  'registered_tags',
  'feed_types',
  'feed_stock',
  'feed_consumption',
  'sellers',
  'slaughterhouses',
  'audit_logs',
  'price_tables',
  'processing_orders',
  'system_config',
  'backups',
  'cattle_simulations',
  'operational_tasks',
  'financial_transactions',
  'equines',
];

/** Chave especial do "dump" com as coleções que não puderam ser lidas: [{ collection, message }]. */
export const READ_ERRORS_KEY = '_readErrors';

export type LegacyDump = Record<string, unknown[]>;

/**
 * Converte valores do SDK do Firestore em JSON simples:
 * Timestamp → ISO, DocumentReference → caminho, GeoPoint → "lat,lng", Bytes → null.
 */
export function plainify(v: unknown): unknown {
  if (v === null || v === undefined) return v ?? null;
  if (typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(plainify);
  const o = v as Record<string, unknown> & { toDate?: () => Date; path?: string; latitude?: number; longitude?: number; toBase64?: () => string };
  if (typeof o.toDate === 'function') {
    try {
      const d = o.toDate();
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    } catch {
      return null;
    }
  }
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (typeof o.toBase64 === 'function') return null;
  if (typeof o.path === 'string' && 'firestore' in o && 'id' in o) return o.path;
  if (typeof o.latitude === 'number' && typeof o.longitude === 'number' && typeof (o as { isEqual?: unknown }).isEqual === 'function') {
    return `${o.latitude},${o.longitude}`;
  }
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(o)) out[k] = plainify(val);
  return out;
}

export interface LegacyLister {
  /** Lista os documentos de uma coleção (id + dados). */
  list(path: string[]): Promise<{ id: string; data: Record<string, unknown> }[]>;
}

/**
 * Lê todas as coleções conhecidas. Coleções negadas/inexistentes não
 * interrompem a leitura: entram em `_readErrors` (a migração mostra aviso).
 * `public_catalogs/{id}/items` é lida e embutida em cada link como `items`.
 */
export async function readAllWith(
  lister: LegacyLister,
  onProgress?: (collection: string, count: number) => void,
  collections: readonly string[] = LEGACY_COLLECTIONS,
): Promise<LegacyDump> {
  const out: LegacyDump = {};
  const errors: { collection: string; message: string }[] = [];
  for (const name of collections) {
    onProgress?.(name, 0);
    try {
      const docs = await lister.list([name]);
      const rows = docs.map((d) => ({ ...(plainify(d.data) as Record<string, unknown>), id: d.id }));
      if (name === 'public_catalogs') {
        for (const r of rows) {
          try {
            const items = await lister.list([name, r.id, 'items']);
            (r as Record<string, unknown>).items = items.map((i) => ({ ...(plainify(i.data) as Record<string, unknown>), id: i.id }));
          } catch {
            /* itens do link são opcionais */
          }
        }
      }
      out[name] = rows;
      onProgress?.(name, rows.length);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push({ collection: name, message });
      out[name] = [];
      onProgress?.(name, -1);
    }
  }
  out[READ_ERRORS_KEY] = errors;
  return out;
}
