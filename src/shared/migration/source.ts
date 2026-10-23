/**
 * Fonte "sistema antigo" para a migração. Cada opção registra a sua
 * (leitura direta do Firebase v1) chamando setLegacySource() no main.tsx.
 */
export interface LegacySource {
  /** Ex.: "Firebase do sistema atual (gen-lang-client-…)" */
  label: string;
  /** Faz login (ex.: Google) no projeto antigo, se necessário. */
  connect(): Promise<void>;
  /** Lê todas as coleções do sistema antigo: { batches: [...], sales: [...], … } (cada doc com `id`). */
  readAll(onProgress?: (collection: string, count: number) => void): Promise<Record<string, unknown[]>>;
  /**
   * Lê um PDF de NF/boleto guardado em pedaços no banco antigo
   * (sales_attachments/{key}/chunks). null = não existe.
   */
  readAttachment?(key: string): Promise<Blob | null>;
}

/** Junta os pedaços (data URL em base64) gravados pelo sistema antigo num arquivo. */
export function chunksToBlob(pieces: { index: number; data: string }[], fallbackType = 'application/pdf'): Blob | null {
  const joined = [...pieces].sort((a, b) => a.index - b.index).map((p) => p.data || '').join('');
  if (!joined) return null;
  const comma = joined.indexOf(',');
  const head = comma >= 0 ? joined.slice(0, comma) : '';
  const b64 = comma >= 0 ? joined.slice(comma + 1) : joined;
  const type = /^data:([^;,]+)/.exec(head)?.[1] || fallbackType;
  const bin = atob(b64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

let current: LegacySource | null = null;
export function setLegacySource(s: LegacySource | null) {
  current = s;
}
export function getLegacySource(): LegacySource | null {
  return current;
}
