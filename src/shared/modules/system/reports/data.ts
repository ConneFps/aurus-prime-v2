/**
 * Carrega só as tabelas que o relatório aberto precisa (os hooks são fixos;
 * as tabelas não usadas ficam desligadas com `enabled: false`).
 */
import { useMemo } from 'react';
import { useTable } from '../../../data/react';
import { endOfMonth, startOfMonth, toISODate, today } from '../../../domain/format';
import { addMonths } from '../../finance/helpers';
import type { PeriodPreset, ReportData, ReportTable } from './types';

export function useReportData(tables: ReportTable[]): { data: ReportData; loading: boolean } {
  const on = (t: ReportTable) => ({ enabled: tables.includes(t) });
  const sales = useTable('sales', undefined, on('sales'));
  const customers = useTable('customers', undefined, on('customers'));
  const products = useTable('products', undefined, on('products'));
  const profiles = useTable('profiles', undefined, on('profiles'));
  const partners = useTable('partners', undefined, on('partners'));
  const stockLots = useTable('stock_lots', undefined, on('stock_lots'));
  const movements = useTable('stock_movements', undefined, on('stock_movements'));
  const losses = useTable('stock_losses', undefined, on('stock_losses'));
  const batches = useTable('batches', undefined, on('batches'));
  const costs = useTable('batch_costs', undefined, on('batch_costs'));
  const animals = useTable('animals', undefined, on('animals'));
  const orders = useTable('processing_orders', undefined, on('processing_orders'));
  const entries = useTable('financial_entries', undefined, on('financial_entries'));
  const equines = useTable('equines', undefined, on('equines'));
  const events = useTable('equine_events', undefined, on('equine_events'));
  const audit = useTable('audit_logs', undefined, on('audit_logs'));

  const all = [sales, customers, products, profiles, partners, stockLots, movements, losses, batches, costs, animals, orders, entries, equines, events, audit];
  const loading = all.some((x) => x.loading);
  const data = useMemo<ReportData>(
    () => ({
      sales: sales.rows,
      customers: customers.rows,
      products: products.rows,
      profiles: profiles.rows,
      partners: partners.rows,
      stock_lots: stockLots.rows,
      stock_movements: movements.rows,
      stock_losses: losses.rows,
      batches: batches.rows,
      batch_costs: costs.rows,
      animals: animals.rows,
      processing_orders: orders.rows,
      financial_entries: entries.rows,
      equines: equines.rows,
      equine_events: events.rows,
      audit_logs: audit.rows,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    all.map((x) => x.rows),
  );
  return { data, loading };
}

export const PERIOD_PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: 'month', label: 'Este mês' },
  { value: 'lastMonth', label: 'Mês passado' },
  { value: '3m', label: '3 meses' },
  { value: 'year', label: 'Ano' },
  { value: 'all', label: 'Tudo' },
  { value: 'custom', label: 'Período' },
];

/** Intervalo [from, to] do atalho de período. */
export function periodOf(p: PeriodPreset, custom: { from: string; to: string }): { from: string | null; to: string | null } {
  const t = today();
  const ym = t.slice(0, 7);
  switch (p) {
    case 'month':
      return { from: startOfMonth(t), to: endOfMonth(t) };
    case 'lastMonth': {
      const prev = addMonths(ym, -1) + '-01';
      return { from: prev, to: endOfMonth(prev) };
    }
    case '3m':
      return { from: addMonths(ym, -2) + '-01', to: endOfMonth(t) };
    case 'year':
      return { from: t.slice(0, 4) + '-01-01', to: t.slice(0, 4) + '-12-31' };
    case 'custom':
      return { from: custom.from || null, to: custom.to || null };
    default:
      return { from: null, to: null };
  }
}

/** Data dentro do período (sem período = tudo; sem data = fora quando há período). */
export function inPeriod(d: string | null | undefined, f: { from: string | null; to: string | null }): boolean {
  if (!f.from && !f.to) return true;
  if (!d) return false;
  const day = localDay(d);
  return (!f.from || day >= f.from) && (!f.to || day <= f.to);
}

/** Dia local de uma data ('YYYY-MM-DD') ou momento ISO (converte do UTC). */
export function localDay(d: string): string {
  if (d.length <= 10) return d;
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? d.slice(0, 10) : toISODate(x);
}
