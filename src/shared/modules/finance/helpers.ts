/**
 * Regras puras do financeiro (sem React): status derivado, saldos, períodos,
 * aging e agregações usadas pelas telas de contas, extrato e comissões.
 */
import { addDays, daysBetween, endOfMonth, integer, number, round2, startOfMonth, today } from '../../domain/format';
import type { LabelInfo } from '../../domain/labels';
import type { EntryPayment, FinancialEntry, ISODate, Sale } from '../../domain/types';

// ---------------------------------------------------------------------------
// Status da parcela
// ---------------------------------------------------------------------------

export type EntryState = 'OPEN' | 'OVERDUE' | 'PAID' | 'CANCELLED';

export const ENTRY_STATE: Record<EntryState, LabelInfo> = {
  OPEN: { label: 'Em aberto', tone: 'info' },
  OVERDUE: { label: 'Vencida', tone: 'danger' },
  PAID: { label: 'Paga', tone: 'success' },
  CANCELLED: { label: 'Cancelada', tone: 'neutral' },
};

export function entryState(e: FinancialEntry, ref: ISODate = today()): EntryState {
  if (e.status === 'CANCELLED') return 'CANCELLED';
  if (e.status === 'PAID') return 'PAID';
  return e.dueDate < ref ? 'OVERDUE' : 'OPEN';
}

/** Saldo em aberto da parcela (0 se paga/cancelada). */
export const balanceOf = (e: FinancialEntry) => (e.status === 'OPEN' ? Math.max(0, round2(e.amount - (e.paidAmount || 0))) : 0);

export const isOverdue = (e: FinancialEntry, ref: ISODate = today()) => e.status === 'OPEN' && e.dueDate < ref;

/** Dias de atraso (0 se em dia). */
export const daysLate = (e: FinancialEntry, ref: ISODate = today()) => (isOverdue(e, ref) ? daysBetween(e.dueDate, ref) : 0);

export const activePayments = (e: FinancialEntry): EntryPayment[] => (e.payments || []).filter((p) => !p.reversed);

export const sum = <T>(rows: T[], f: (r: T) => number) => round2(rows.reduce((s, r) => s + (f(r) || 0), 0));

export const partyKey = (e: Pick<FinancialEntry, 'partyId' | 'partyName'>) => e.partyId || `name:${e.partyName.trim().toLowerCase()}`;

// ---------------------------------------------------------------------------
// Períodos
// ---------------------------------------------------------------------------

export type PeriodPreset = 'ALL' | 'OVERDUE' | 'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM';

export const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'OVERDUE', label: 'Vencidos' },
  { value: 'TODAY', label: 'Hoje' },
  { value: 'WEEK', label: '7 dias' },
  { value: 'MONTH', label: 'Mês' },
  { value: 'CUSTOM', label: 'Período' },
];

/** Intervalo [from, to] de vencimento do atalho (null = sem limite). */
export function presetRange(p: PeriodPreset, custom: { from: string; to: string }): { from: ISODate | null; to: ISODate | null } {
  const t = today();
  switch (p) {
    case 'OVERDUE':
      return { from: null, to: addDays(t, -1) };
    case 'TODAY':
      return { from: t, to: t };
    case 'WEEK':
      return { from: t, to: addDays(t, 7) };
    case 'MONTH':
      return { from: startOfMonth(t), to: endOfMonth(t) };
    case 'CUSTOM':
      return { from: custom.from || null, to: custom.to || null };
    default:
      return { from: null, to: null };
  }
}

export const inRange = (d: ISODate, r: { from: ISODate | null; to: ISODate | null }) => (!r.from || d >= r.from) && (!r.to || d <= r.to);

/** 'YYYY-MM' somando n meses. */
export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to && out.length < 120) {
    out.push(cur);
    cur = addMonths(cur, 1);
  }
  return out;
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** 'set/26' */
export const shortMonth = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;

// ---------------------------------------------------------------------------
// Aging (posição por faixa de atraso)
// ---------------------------------------------------------------------------

export type AgingBucket = 'CURRENT' | 'D30' | 'D60' | 'D90' | 'D90P';

export const AGING_LABELS: Record<AgingBucket, string> = {
  CURRENT: 'A vencer',
  D30: '1 a 30 dias',
  D60: '31 a 60 dias',
  D90: '61 a 90 dias',
  D90P: 'Mais de 90 dias',
};

export function agingBucket(e: FinancialEntry, ref: ISODate = today()): AgingBucket {
  const d = daysLate(e, ref);
  if (d <= 0) return 'CURRENT';
  if (d <= 30) return 'D30';
  if (d <= 60) return 'D60';
  if (d <= 90) return 'D90';
  return 'D90P';
}

export function aging(entries: FinancialEntry[], ref: ISODate = today()): Record<AgingBucket, number> {
  const out: Record<AgingBucket, number> = { CURRENT: 0, D30: 0, D60: 0, D90: 0, D90P: 0 };
  for (const e of entries) {
    if (e.status !== 'OPEN') continue;
    out[agingBucket(e, ref)] = round2(out[agingBucket(e, ref)] + balanceOf(e));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Comissões
// ---------------------------------------------------------------------------

export const COMMISSION_EXCLUDED: Sale['status'][] = ['CANCELLED', 'REJECTED', 'DRAFT'];

export interface SaleCommission {
  sale: Sale;
  revenue: number;
  base: number;
  commission: number;
  /** 0..1 — parte da venda já recebida. */
  receivedRatio: number;
  received: number;
  released: number;
  pending: number;
}

/** Comissão de uma venda liberada proporcionalmente ao que já foi recebido. */
export function saleCommission(sale: Sale, entries: FinancialEntry[]): SaleCommission {
  const active = entries.filter((e) => e.direction === 'IN' && e.status !== 'CANCELLED');
  const total = sum(active, (e) => e.amount);
  const paid = sum(active, (e) => e.paidAmount || 0);
  let ratio = 0;
  if (total > 0.005) ratio = Math.min(1, paid / total);
  else if (sale.paymentStatus === 'PAID') ratio = 1;
  const commission = round2(sale.commissionValue || 0);
  const released = round2(commission * ratio);
  return {
    sale,
    revenue: round2(sale.totalValue || 0),
    base: round2(sale.itemsSubtotal || 0),
    commission,
    receivedRatio: ratio,
    received: total > 0.005 ? paid : round2((sale.totalValue || 0) * ratio),
    released,
    pending: round2(commission - released),
  };
}

// ---------------------------------------------------------------------------
// Formatação compacta (cartões no celular)
// ---------------------------------------------------------------------------

/** R$ curto: R$ 4.814 · R$ 69,1 mil · R$ 265 mil · R$ 1,2 mi. */
export function brlShort(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (a >= 1e6) return `${s}R$ ${number(a / 1e6, 1)} mi`;
  if (a >= 1e5) return `${s}R$ ${integer(a / 1000)} mil`;
  if (a >= 1e4) return `${s}R$ ${number(a / 1000, 1)} mil`;
  return `${s}R$ ${integer(a)}`;
}

/** Eixo de gráfico em reais: 12 mil, 1,2 mi. */
export function axisMoney(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (a >= 1e6) return `${s}${number(a / 1e6, 1)} mi`;
  if (a >= 1e4) return `${s}${integer(a / 1000)} mil`;
  if (a >= 1e3) return `${s}${number(a / 1000, 1)} mil`;
  return `${s}${integer(a)}`;
}

/** Dígitos de telefone para wa.me (prefixo 55 quando faltar). */
export function waPhone(phone: string | null | undefined): string | null {
  const d = (phone || '').replace(/\D/g, '');
  if (d.length < 10) return null;
  return d.startsWith('55') && d.length >= 12 ? d : `55${d}`;
}
