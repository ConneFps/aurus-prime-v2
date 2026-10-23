import type { EquineEvent, EquineSale, FinancialEntry } from '../../../domain/types';
import { entryBalance, eventCost, eventIncome } from '../model';

export interface EquineFinance {
  cost: number;
  income: number;
  prizes: number;
  sale: EquineSale | null;
  saleEntries: FinancialEntry[];
  received: number;
  open: number;
  overdue: number;
  result: number;
}

export function equineFinance(events: EquineEvent[], sales: EquineSale[], entries: FinancialEntry[], todayIso: string): EquineFinance {
  const cost = events.reduce((s, e) => s + eventCost(e), 0);
  const income = events.reduce((s, e) => s + eventIncome(e), 0);
  const prizes = events.filter((e) => e.type === 'COMPETITION').reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const sale = sales.find((s) => s.status === 'ACTIVE') || null;
  const saleEntries = sale ? entries.filter((e) => e.equineSaleId === sale.id).sort((a, b) => a.installment - b.installment) : [];
  const live = saleEntries.filter((e) => e.status !== 'CANCELLED');
  const received = live.reduce((s, e) => s + (e.paidAmount || 0), 0);
  const open = live.reduce((s, e) => s + entryBalance(e), 0);
  const overdue = live.filter((e) => e.status === 'OPEN' && e.dueDate < todayIso).reduce((s, e) => s + entryBalance(e), 0);
  return { cost, income, prizes, sale, saleEntries, received, open, overdue, result: income + (sale?.totalPrice || 0) - cost };
}
