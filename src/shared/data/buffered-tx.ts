import type { Row, TableName } from '../domain/schema';
import type { ChangeOp, ListQuery, NewRow, Patch, Tx } from './api';
import { applyQuery, clone, matchesQuery, nowIso, uuid } from './query';

/** Como o backend lê dentro de uma transação. */
export interface TxReader {
  readOne(table: TableName, id: string): Promise<Record<string, unknown> | null>;
  readMany(table: TableName, q?: ListQuery<Record<string, unknown>>): Promise<Record<string, unknown>[]>;
}

type Key = string; // `${table}/${id}`
const key = (t: TableName, id: string): Key => `${t}/${id}`;

/**
 * Transação genérica com escrita em buffer.
 * Lê do backend (registrando versões quando existirem) e acumula as escritas
 * até o commit. Leituras enxergam as próprias escritas pendentes.
 */
export class BufferedTx implements Tx {
  private inserts = new Map<Key, { table: TableName; row: Record<string, unknown> }>();
  private updates = new Map<Key, { table: TableName; patch: Record<string, unknown> }>();
  private deletes = new Map<Key, TableName>();
  private order: Key[] = [];
  /** versão lida de cada linha (PostgreSQL). */
  readonly versions = new Map<Key, number>();

  constructor(private reader: TxReader) {}

  private track(k: Key) {
    if (!this.order.includes(k)) this.order.push(k);
  }

  private remember(table: TableName, row: Record<string, unknown> | null) {
    if (row && typeof row.version === 'number') this.versions.set(key(table, String(row.id)), row.version);
  }

  private overlay(table: TableName, row: Record<string, unknown>): Record<string, unknown> | null {
    const k = key(table, String(row.id));
    if (this.deletes.has(k)) return null;
    const u = this.updates.get(k);
    return u ? { ...row, ...clone(u.patch) } : row;
  }

  async get<K extends TableName>(table: K, id: string): Promise<Row<K> | null> {
    const k = key(table, id);
    if (this.deletes.has(k)) return null;
    const ins = this.inserts.get(k);
    if (ins) return clone(ins.row) as unknown as Row<K>;
    const row = await this.reader.readOne(table, id);
    this.remember(table, row);
    if (!row) return null;
    return this.overlay(table, row) as unknown as Row<K> | null;
  }

  async query<K extends TableName>(table: K, q?: ListQuery<Row<K>>): Promise<Row<K>[]> {
    // Busca sem limite para aplicar o overlay corretamente, depois limita.
    const base = await this.reader.readMany(table, { where: q?.where as never, orderBy: q?.orderBy as never });
    const out: Record<string, unknown>[] = [];
    for (const r of base) {
      this.remember(table, r);
      const o = this.overlay(table, r);
      if (o && matchesQuery(o, q as unknown as ListQuery<Record<string, unknown>>)) out.push(o);
    }
    for (const [, ins] of this.inserts) {
      if (ins.table === table && matchesQuery(ins.row, q as unknown as ListQuery<Record<string, unknown>>)) out.push(clone(ins.row));
    }
    return applyQuery(out, { orderBy: q?.orderBy as never, limit: q?.limit }) as unknown as Row<K>[];
  }

  insert<K extends TableName>(table: K, row: NewRow<K>): string {
    const id = row.id || uuid();
    const now = nowIso();
    const full = { ...clone(row), id, createdAt: row.createdAt || now, updatedAt: row.updatedAt || now } as Record<string, unknown>;
    const k = key(table, id);
    this.inserts.set(k, { table, row: full });
    this.deletes.delete(k);
    this.track(k);
    return id;
  }

  update<K extends TableName>(table: K, id: string, patch: Patch<K>): void {
    const k = key(table, id);
    const p = { ...clone(patch), updatedAt: nowIso() } as Record<string, unknown>;
    delete p.id;
    delete p.version;
    const ins = this.inserts.get(k);
    if (ins) {
      Object.assign(ins.row, p);
      return;
    }
    const prev = this.updates.get(k);
    this.updates.set(k, { table, patch: { ...(prev?.patch || {}), ...p } });
    this.track(k);
  }

  delete<K extends TableName>(table: K, id: string): void {
    const k = key(table, id);
    if (this.inserts.has(k)) {
      this.inserts.delete(k);
      this.order = this.order.filter((x) => x !== k);
      return;
    }
    this.updates.delete(k);
    this.deletes.set(k, table);
    this.track(k);
  }

  get isEmpty() {
    return this.order.length === 0;
  }

  /** Lista final de alterações, na ordem em que foram feitas. */
  changes(): ChangeOp[] {
    const ops: ChangeOp[] = [];
    for (const k of this.order) {
      const [table, id] = k.split('/') as [TableName, string];
      const version = this.versions.get(k) ?? null;
      if (this.deletes.has(k)) ops.push({ op: 'delete', table, id, version });
      else if (this.inserts.has(k)) ops.push({ op: 'insert', table, id, row: this.inserts.get(k)!.row });
      else if (this.updates.has(k)) ops.push({ op: 'update', table, id, patch: this.updates.get(k)!.patch, version });
    }
    return ops;
  }
}
