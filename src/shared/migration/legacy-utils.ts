/**
 * Utilitários PUROS da migração: leitura tolerante de campos do sistema
 * antigo (tipos errados, datas em vários formatos), avisos agregados e ids.
 */
import { normalize, round2, round3 } from '../domain/format';
import type { Attachment, PaymentMethod } from '../domain/types';

export { round2, round3, normalize };

export type Doc = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Avisos agregados (uma linha por tipo de problema, com exemplos)
// ---------------------------------------------------------------------------

export class Warnings {
  private map = new Map<string, { msg: string; count: number; examples: string[] }>();
  add(key: string, msg: string, example?: string | null) {
    let w = this.map.get(key);
    if (!w) {
      w = { msg, count: 0, examples: [] };
      this.map.set(key, w);
    }
    w.count++;
    if (example && w.examples.length < 4 && !w.examples.includes(example)) w.examples.push(example);
  }
  /** Aviso único (sem contagem). */
  note(key: string, msg: string) {
    if (!this.map.has(key)) this.map.set(key, { msg, count: 0, examples: [] });
  }
  list(): string[] {
    return [...this.map.values()].map((w) => {
      if (w.count === 0) return w.msg;
      const ex = w.examples.length ? ` (ex.: ${w.examples.join(', ')}${w.count > w.examples.length ? '…' : ''})` : '';
      return `${w.msg}: ${w.count}${ex}`;
    });
  }
}

// ---------------------------------------------------------------------------
// Leitura tolerante
// ---------------------------------------------------------------------------

export function isObj(v: unknown): v is Doc {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export function obj(v: unknown): Doc {
  return isObj(v) ? v : {};
}

/** Lista; aceita também objetos com chaves numéricas ({0:…,1:…}) gravados no lugar de arrays. */
export function arr(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (isObj(v)) {
    const keys = Object.keys(v);
    if (keys.length && keys.every((k) => /^\d+$/.test(k))) return keys.sort((a, b) => Number(a) - Number(b)).map((k) => v[k]);
  }
  return [];
}

export function docs(v: unknown): Doc[] {
  return arr(v).filter(isObj);
}

/** Texto limpo ou null (números viram texto). */
export function str(v: unknown): string | null {
  if (typeof v === 'string') {
    const t = v.trim();
    return t ? t : null;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

/** Primeiro texto não vazio. */
export function firstStr(...vs: unknown[]): string | null {
  for (const v of vs) {
    const s = str(v);
    if (s) return s;
  }
  return null;
}

/** Número tolerante: aceita "1.234,56", "12,5", "R$ 10". null se impossível. */
export function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    let s = v.replace(/[^\d,.\-]/g, '');
    if (!s || s === '-' ) return null;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export const n0 = (v: unknown) => num(v) ?? 0;

export function bool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return ['true', 'sim', '1', 'yes'].includes(v.trim().toLowerCase());
  if (typeof v === 'number') return v !== 0;
  return false;
}

export const digits = (v: unknown) => (str(v) || '').replace(/\D/g, '');

export function upper(v: unknown): string {
  return normalize(str(v)).toUpperCase().replace(/\s+/g, '_');
}

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------

/** Deslocamento do fuso do Brasil (UTC-3, sem horário de verão desde 2019). */
let tzOffsetMinutes = -180;
export function setTzOffset(m: number) {
  tzOffsetMinutes = m;
}

const pad = (n: number, l = 2) => String(n).padStart(l, '0');

function fromEpochMs(ms: number): string | null {
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Momento ISO a partir de: ISO, 'YYYY-MM-DD', Timestamp do Firestore
 * ({seconds,nanoseconds} | {_seconds}), Date, epoch (ms/s) e texto pt-BR
 * ("05/10/2026, 14:32:10"). null se impossível.
 */
export function isoDateTime(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (typeof v === 'number') return fromEpochMs(v < 1e11 ? v * 1000 : v);
  if (isObj(v)) {
    const s = num(v.seconds ?? v._seconds);
    if (s !== null) return fromEpochMs(s * 1000 + Math.floor(n0(v.nanoseconds ?? v._nanoseconds) / 1e6));
    return null;
  }
  if (typeof v !== 'string') return null;
  const t = v.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T12:00:00.000Z`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(t);
  if (m) {
    const [, d, mo, y, h, mi, s] = m;
    if (!h) return `${y}-${pad(Number(mo))}-${pad(Number(d))}T12:00:00.000Z`;
    const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s || 0)) - tzOffsetMinutes * 60000;
    return fromEpochMs(ms);
  }
  m = /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/.exec(t);
  if (m) {
    // Sem fuso explícito: hora local do Brasil (não depende do fuso da máquina).
    const [, y, mo, d, h, mi, s] = m;
    return fromEpochMs(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s || 0)) - tzOffsetMinutes * 60000);
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(t)) {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

/** Dia 'YYYY-MM-DD' no fuso do Brasil. */
export function day(v: unknown): string | null {
  if (typeof v === 'string') {
    const t = v.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
    if (m) return `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  }
  const iso = isoDateTime(v);
  if (!iso) return null;
  const d = new Date(new Date(iso).getTime() + tzOffsetMinutes * 60000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export const yearOf = (d: string | null | undefined, fallback: string) => (d && /^\d{4}/.test(d) ? d.slice(0, 4) : fallback.slice(0, 4));

// ---------------------------------------------------------------------------
// Ids e nomes
// ---------------------------------------------------------------------------

/** Trecho seguro para ids derivados ("Contra Filé" → "contra-file"). */
export function slug(s: string | null | undefined): string {
  return (
    normalize(s)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'x'
  );
}

/** Id do documento antigo (ou gerado de forma determinística). */
export function docId(d: Doc, fallback: string): string {
  return str(d.id) || fallback;
}

// ---------------------------------------------------------------------------
// Enums do sistema antigo
// ---------------------------------------------------------------------------

/** Forma de pagamento antiga → nova (null = desconhecida). */
export function payMethod(v: unknown): PaymentMethod | null {
  const u = upper(v);
  if (!u) return null;
  if (u === 'PIX' || u.includes('PIX')) return 'PIX';
  if (u.includes('BOLETO')) return 'BOLETO';
  if (u === 'COM_NF' || u === 'APENAS_NF' || u === 'CREDIT' || u === 'CREDITO' || u === 'A_PRAZO' || u === 'PRAZO') return 'CREDIT';
  if (u.includes('CARD') || u.includes('CARTAO')) return 'CARD';
  if (u.includes('TRANSF') || u === 'TED' || u === 'DOC') return 'TRANSFER';
  if (u === 'DINHEIRO' || u === 'CASH' || u === 'ESPECIE') return 'CASH';
  if (u.startsWith('BONIFIC') || u === 'BONUS') return 'BONUS';
  if (u === 'AMOSTRA' || u === 'SAMPLE') return 'SAMPLE';
  return null;
}

export function personType(v: unknown, document: string): 'F' | 'J' {
  const u = upper(v);
  if (u === 'J' || u === 'PJ' || u.includes('JURID')) return 'J';
  if (u === 'F' || u === 'PF' || u.includes('FISIC')) return 'F';
  return document.length > 11 ? 'J' : 'F';
}

export function customerCategory(v: unknown, pt: 'F' | 'J'): 'INTERNO_PF' | 'EXTERNO_PF' | 'EXTERNO_CNPJ' {
  const u = upper(v);
  if (u === 'INTERNO_PF' || u.includes('INTERNO')) return 'INTERNO_PF';
  if (u === 'EXTERNO_CNPJ' || u.includes('CNPJ')) return 'EXTERNO_CNPJ';
  if (u === 'EXTERNO_PF' || u.includes('EXTERNO')) return 'EXTERNO_PF';
  return pt === 'J' ? 'EXTERNO_CNPJ' : 'EXTERNO_PF';
}

export function companyCode(v: unknown): 'MVGB' | 'GRTB' | 'GIRASSOL' | 'AURUS' | null {
  const u = upper(v);
  if (u.includes('GRTB')) return 'GRTB';
  if (u.includes('GIRASSOL')) return 'GIRASSOL';
  if (u.includes('MVGB')) return 'MVGB';
  if (u.includes('AURUS')) return 'AURUS';
  return null;
}

/** Anexo a partir de {name,url,storagePath,type,size,uploadedAt}. URLs "data:" (base64) são descartadas. */
export function attachmentFrom(
  d: Doc,
  id: string,
  fallbackAt: string,
  kind: Attachment['kind'],
  w: Warnings,
  owner: string,
): Attachment | null {
  const url = str(d.url) || str(d.downloadUrl) || str(d.fileUrl);
  const path = str(d.storagePath) || str(d.path);
  if (url && url.startsWith('data:')) {
    w.add('att.base64', 'Arquivos gravados dentro do banco antigo (base64) não foram copiados — baixe pelo sistema antigo se precisar', owner);
    if (!path) return null;
  }
  const httpUrl = url && /^https?:\/\//.test(url) ? url : null;
  if (!httpUrl && !path) return null;
  return {
    id,
    name: str(d.name) || str(d.fileName) || 'arquivo',
    path: path || '',
    url: httpUrl,
    mimeType: str(d.type) || str(d.contentType) || str(d.fileType),
    size: num(d.size) ?? num(d.fileSize),
    kind,
    uploadedAt: isoDateTime(d.uploadedAt) || fallbackAt,
    uploadedBy: null,
  };
}

// ---------------------------------------------------------------------------
// Nomes de cortes (lógica do sistema antigo: lib/stockDeduction.ts)
// ---------------------------------------------------------------------------

export const normalizeCut = (s: string | null | undefined) => normalize(s);

const stripPrefix = (s: string) => s.replace(/^(corte de|bife de|bife|carne de)\s+/, '');

/** Mesmo critério do cutsMatch antigo. */
export function cutsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  return cutScore(a, b) > 0;
}

/** Força da correspondência entre dois nomes de corte (0 = não casa). */
export function cutScore(a: string | null | undefined, b: string | null | undefined): number {
  const na = normalizeCut(a);
  const nb = normalizeCut(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1000;
  const ca = stripPrefix(na);
  const cb = stripPrefix(nb);
  if (ca && cb && ca === cb) return 900;
  const shorter = Math.min(na.length, nb.length);
  if (na.startsWith(nb) || nb.startsWith(na)) return 500 + shorter;
  if (ca && cb && (ca.startsWith(cb) || cb.startsWith(ca))) return 400 + shorter;
  if (na.includes(nb) || nb.includes(na)) return 100 + shorter;
  return 0;
}

/** Itens de pedido que não são carne (frete, sacola, embalagem…). */
export function itemKindFromName(cut: string | null, d: Doc): 'FREIGHT' | 'SUPPLY' | 'PRODUCT' {
  const u = (cut || '').toUpperCase();
  if (bool(d.isFreight) || u.includes('FRETE')) return 'FREIGHT';
  if (bool(d.isCustomBag) || u.includes('SACOLA') || u.includes('EMBALAGEM') || u.includes('ETIQUETA')) return 'SUPPLY';
  return 'PRODUCT';
}
