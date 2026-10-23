import type { ListQuery, Where } from './api';

/** Gera um UUID v4 (usa crypto.randomUUID quando disponível). */
export function uuid(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  let d = Date.now();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (d + Math.random() * 16) % 16 | 0;
    d = Math.floor(d / 16);
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const nowIso = () => new Date().toISOString();

function cmp(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return a === b ? 0 : a ? 1 : -1;
  return String(a).localeCompare(String(b), 'pt-BR');
}

export function matchesWhere<T>(row: T, w: Where<T>): boolean {
  const [field, op, value] = w;
  const v = (row as Record<string, unknown>)[field];
  switch (op) {
    case '==':
      return (v ?? null) === (value ?? null);
    case '!=':
      return (v ?? null) !== (value ?? null);
    case '<':
      return v !== null && v !== undefined && cmp(v, value) < 0;
    case '<=':
      return v !== null && v !== undefined && cmp(v, value) <= 0;
    case '>':
      return v !== null && v !== undefined && cmp(v, value) > 0;
    case '>=':
      return v !== null && v !== undefined && cmp(v, value) >= 0;
    case 'in':
      return Array.isArray(value) && value.includes(v as never);
    case 'array-contains':
      return Array.isArray(v) && v.includes(value as never);
    default:
      return false;
  }
}

export function matchesQuery<T>(row: T, q?: ListQuery<T>): boolean {
  if (!q?.where?.length) return true;
  return q.where.every((w) => matchesWhere(row, w));
}

export function sortRows<T>(rows: T[], orderBy?: ListQuery<T>['orderBy']): T[] {
  if (!orderBy) return rows;
  const [field, dir] = orderBy;
  const mult = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => mult * cmp((a as Record<string, unknown>)[field], (b as Record<string, unknown>)[field]));
}

/** Aplica filtro + ordenação + limite em memória. */
export function applyQuery<T>(rows: T[], q?: ListQuery<T>): T[] {
  let out = rows.filter((r) => matchesQuery(r, q));
  out = sortRows(out, q?.orderBy);
  if (q?.limit) out = out.slice(0, q.limit);
  return out;
}

/** Remove chaves com valor undefined (Firestore não aceita undefined). */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripUndefined(v)) as unknown as T;
  if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof Blob)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}

/** Cópia profunda simples (dados JSON). */
export function clone<T>(v: T): T {
  if (v === undefined) return v;
  return JSON.parse(JSON.stringify(v)) as T;
}
