/**
 * Utilitários compartilhados pelas operações (usados dentro de transações).
 */
import { withDefaults, SETTINGS_ID } from '../../app/settings';
import type { ListQuery, NewRow, Patch, Tx } from '../../data/api';
import { uuid } from '../../data/query';
import type { Row, TableName } from '../../domain/schema';
import { addDays, round2, round3, toISODate, today } from '../../domain/format';
import { can, type Permission } from '../../domain/permissions';
import type { AppSettings, AuditAction, ISODate, StockLot } from '../../domain/types';
import type { Actor, InstallmentPlan, OpsContext } from '../types';

export { round2, round3, today, addDays };

export class OpsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpsError';
  }
}

/** Lança erro de validação com mensagem para o usuário. */
export function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new OpsError(message);
}

/** Exige permissão do ator (clientes do portal têm permissões próprias). */
export function requirePerm(actor: Actor, perm: Permission) {
  if (actor.role === 'CUSTOMER') throw new OpsError('Ação não permitida para clientes do portal.');
  if (!can(actor.role, perm)) throw new OpsError('Seu perfil não tem permissão para esta ação.');
}

export function actorCan(actor: Actor, perm: Permission) {
  return actor.role !== 'CUSTOMER' && can(actor.role, perm);
}

// ----------------------------------------------------------------------------
// Relógio e geração de ids
// ----------------------------------------------------------------------------
// Em produção usam a hora real e uuid(). A carga de demonstração simula datas
// passadas (abril→setembro) e ids determinísticos com setOpsEnv().

interface OpsEnv {
  now: (() => Date) | null;
  id: (() => string) | null;
}
const env: OpsEnv = { now: null, id: null };

/** Substitui relógio e/ou gerador de ids (uso: demonstração e testes). */
export function setOpsEnv(patch: Partial<OpsEnv>) {
  Object.assign(env, patch);
}
export function resetOpsEnv() {
  env.now = null;
  env.id = null;
}
export const opsDate = (): Date => (env.now ? env.now() : new Date());
export const nowIso = () => opsDate().toISOString();
/** "Hoje" das operações ('YYYY-MM-DD', fuso local). */
export const opsToday = () => toISODate(opsDate());
export const newId = () => (env.id ? env.id() : uuid());

/** Transação que carimba createdAt/updatedAt/id com o relógio das operações. */
class StampedTx implements Tx {
  constructor(private tx: Tx) {}
  get<K extends TableName>(table: K, id: string): Promise<Row<K> | null> {
    return this.tx.get(table, id);
  }
  query<K extends TableName>(table: K, q?: ListQuery<Row<K>>): Promise<Row<K>[]> {
    return this.tx.query(table, q);
  }
  insert<K extends TableName>(table: K, row: NewRow<K>): string {
    const n = nowIso();
    return this.tx.insert(table, { ...row, id: row.id || newId(), createdAt: row.createdAt || n, updatedAt: row.updatedAt || n } as NewRow<K>);
  }
  update<K extends TableName>(table: K, id: string, patch: Patch<K>): void {
    this.tx.update(table, id, patch);
  }
  delete<K extends TableName>(table: K, id: string): void {
    this.tx.delete(table, id);
  }
}

/** Executa `fn` numa transação do backend (use em TODAS as operações). */
export function runTx<T>(ctx: OpsContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return ctx.data.runTransaction((raw) => fn(new StampedTx(raw)));
}

/** Registra auditoria dentro da transação. */
export function audit(
  tx: Tx,
  actor: Actor,
  action: AuditAction,
  entity: string,
  entityId: string | null,
  summary: string,
  data?: Record<string, unknown>,
) {
  tx.insert('audit_logs', {
    at: nowIso(),
    userId: actor.id,
    userName: actor.name,
    userEmail: actor.email,
    action,
    entity,
    entityId,
    summary,
    data: data ?? null,
  });
}

/** Configurações com padrões. */
export async function getSettings(tx: Tx): Promise<AppSettings> {
  return withDefaults(await tx.get('settings', SETTINGS_ID));
}

/**
 * Próximo valor de um contador (atômico dentro da transação).
 * Chaves usadas: `sale-AAAA`, `processing-AAAA`, `batch-AAAA`.
 */
export async function nextCounter(tx: Tx, key: string): Promise<number> {
  const cur = await tx.get('counters', key);
  if (!cur) {
    tx.insert('counters', { id: key, value: 1 });
    return 1;
  }
  const value = (cur.value || 0) + 1;
  tx.update('counters', key, { value });
  return value;
}

/** Número de pedido AAAA0001 (mantém o formato da v1). */
export async function nextSaleNumber(tx: Tx, date: ISODate): Promise<{ number: string; sequence: number }> {
  const year = (date || today()).slice(0, 4);
  const seq = await nextCounter(tx, `sale-${year}`);
  return { number: `${year}${String(seq).padStart(4, '0')}`, sequence: seq };
}

export async function nextProcessingNumber(tx: Tx, date: ISODate): Promise<string> {
  const year = (date || today()).slice(0, 4);
  const seq = await nextCounter(tx, `processing-${year}`);
  return `OS-${year}-${String(seq).padStart(3, '0')}`;
}

export async function nextBatchCode(tx: Tx, date: ISODate): Promise<string> {
  const year = (date || today()).slice(0, 4);
  const seq = await nextCounter(tx, `batch-${year}`);
  return `L-${year}-${String(seq).padStart(3, '0')}`;
}

export interface InstallmentLine {
  installment: number;
  installments: number;
  dueDate: ISODate;
  amount: number;
}

/**
 * Divide um total em parcelas.
 * - plan.terms "28/35/42" → 3 parcelas vencendo em issue+28, +35, +42 dias;
 * - senão plan.installments (padrão 1) a cada intervalDays (padrão 30) a partir de firstDueDate (padrão = issueDate).
 * Centavos: a última parcela absorve a diferença.
 */
export function buildInstallments(total: number, plan: InstallmentPlan, issueDate: ISODate): InstallmentLine[] {
  const t = round2(total);
  let dues: ISODate[] = [];
  const terms = (plan.terms || '')
    .split(/[\/,;\s]+/)
    .map((x) => parseInt(x, 10))
    .filter((n) => Number.isFinite(n) && n >= 0);
  if (terms.length) {
    dues = terms.map((d) => addDays(issueDate, d));
  } else {
    const n = Math.max(1, Math.floor(plan.installments || 1));
    const first = plan.firstDueDate || issueDate;
    const step = plan.intervalDays || 30;
    dues = Array.from({ length: n }, (_, i) => addDays(first, i * step));
  }
  const n = dues.length;
  const base = Math.floor((t / n) * 100) / 100;
  return dues.map((dueDate, i) => ({
    installment: i + 1,
    installments: n,
    dueDate,
    amount: i === n - 1 ? round2(t - base * (n - 1)) : base,
  }));
}

export interface FifoPick {
  lot: StockLot;
  take: number;
}

/**
 * Consome saldo de lotes em FIFO (validade mais próxima primeiro, depois
 * entrada mais antiga). Lote preferencial (preferredLotId) é usado antes.
 */
export function allocateFifo(lots: StockLot[], qty: number, preferredLotId?: string | null): { picks: FifoPick[]; short: number } {
  const avail = lots
    .filter((l) => l.status === 'AVAILABLE' && l.balanceQty > 0.0005)
    .sort((a, b) => {
      if (preferredLotId) {
        if (a.id === preferredLotId) return -1;
        if (b.id === preferredLotId) return 1;
      }
      const ea = a.expiryDate || '9999-12-31';
      const eb = b.expiryDate || '9999-12-31';
      if (ea !== eb) return ea.localeCompare(eb);
      return (a.entryDate || '').localeCompare(b.entryDate || '') || a.createdAt.localeCompare(b.createdAt);
    });
  let remaining = round3(qty);
  const picks: FifoPick[] = [];
  for (const lot of avail) {
    if (remaining <= 0.0005) break;
    const take = round3(Math.min(lot.balanceQty, remaining));
    if (take <= 0) continue;
    picks.push({ lot, take });
    remaining = round3(remaining - take);
  }
  return { picks, short: Math.max(0, remaining) };
}

export type Ctx = OpsContext;

// ----------------------------------------------------------------------------
// Helpers gerais das operações
// ----------------------------------------------------------------------------

/** Custo unitário (R$/kg) com 4 casas — evita perder centavos em rateios. */
export const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

/** Lê um registro ou lança erro amigável. */
export async function mustGet<K extends TableName>(tx: Tx, table: K, id: string | null | undefined, message: string): Promise<Row<K>> {
  assert(id, message);
  const row = await tx.get(table, id);
  assert(row, message);
  return row;
}

/** Exige ao menos uma das permissões. */
export function requireAnyPerm(actor: Actor, perms: Permission[]) {
  if (actor.role === 'CUSTOMER') throw new OpsError('Ação não permitida para clientes do portal.');
  if (!perms.some((p) => can(actor.role as Exclude<Actor['role'], 'CUSTOMER'>, p))) {
    throw new OpsError('Seu perfil não tem permissão para esta ação.');
  }
}

/** Equipe interna (não é cliente do portal nem vendedor externo). */
export const isStaff = (actor: Actor) => actor.role !== 'CUSTOMER' && actor.role !== 'EXTERNAL_SELLER';

/** Número finito positivo? */
export const isPos = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
/** Número finito ≥ 0? */
export const isNonNeg = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

/** Texto limpo ou null. */
export const clean = (s: string | null | undefined): string | null => {
  const t = (s ?? '').trim();
  return t ? t : null;
};

/** Acrescenta uma linha a um campo de observações. */
export function appendNote(prev: string | null | undefined, line: string): string {
  return prev ? `${prev}\n${line}` : line;
}

/** Data 'YYYY-MM-DD' válida? */
export const isISODate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
