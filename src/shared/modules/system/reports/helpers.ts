/**
 * Utilitários compartilhados pelos relatórios.
 */
import { date, parseISODate, round2 } from '../../../domain/format';
import type { Sale } from '../../../domain/types';
import { isCounted, longMonth } from '../../customers/helpers';
import { monthRange } from '../../finance/helpers';
import { inPeriod } from './data';
import type { ReportData, ReportFilters, ReportOption } from './types';

export const SCOPE_OPTION: ReportOption = {
  key: 'scope',
  label: 'Pedidos considerados',
  choices: [
    { value: 'confirmed', label: 'Aprovados em diante' },
    { value: 'all', label: 'Incluir aguardando aprovação' },
  ],
  default: 'confirmed',
};

export const GROUP_DAY_MONTH: ReportOption = {
  key: 'group',
  label: 'Agrupar por',
  choices: [
    { value: 'month', label: 'Mês' },
    { value: 'day', label: 'Dia' },
  ],
  default: 'month',
};

/** Vendas válidas para relatório, com os filtros comuns aplicados. */
export function salesIn(d: ReportData, f: ReportFilters): Sale[] {
  const scope = f.opts.scope || 'confirmed';
  return d.sales.filter(
    (s) =>
      (scope === 'all' ? !['DRAFT', 'CANCELLED', 'REJECTED'].includes(s.status) : isCounted(s)) &&
      inPeriod(s.date, f) &&
      (!f.customerId || s.customerId === f.customerId) &&
      (!f.sellerId || s.sellerId === f.sellerId) &&
      (!f.productId || (s.items || []).some((i) => i.productId === f.productId)),
  );
}

/** Agrupa linhas por chave, criando o acumulador na primeira vez. */
export function groupBy<T, A>(rows: T[], key: (r: T) => string, init: (r: T, k: string) => A, add: (acc: A, r: T) => void): Map<string, A> {
  const m = new Map<string, A>();
  for (const r of rows) {
    const k = key(r);
    let acc = m.get(k);
    if (!acc) {
      acc = init(r, k);
      m.set(k, acc);
    }
    add(acc, r);
  }
  return m;
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
/** "seg, 05/10/2026" */
export function dayLabel(iso: string): string {
  const d = parseISODate(iso);
  return d ? `${WEEKDAYS[d.getDay()]}, ${date(iso)}` : iso;
}

/** Rótulo de período agrupado ('YYYY-MM' ou 'YYYY-MM-DD'). */
export function periodLabel(key: string): string {
  if (key.length === 7) {
    const s = longMonth(key);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return dayLabel(key);
}

/** Meses do período (preenche meses sem movimento) ou só as chaves existentes. */
export function periodKeys(existing: string[], f: ReportFilters, group: 'day' | 'month'): string[] {
  const keys = [...new Set(existing)].sort();
  if (group !== 'month' || !keys.length) return keys;
  const from = (f.from || keys[0]).slice(0, 7);
  const to = (f.to || keys[keys.length - 1]).slice(0, 7);
  return monthRange(from < keys[0] ? from : keys[0], to > keys[keys.length - 1] ? to : keys[keys.length - 1]);
}

export const pct = (part: number, total: number) => (total ? round2((part / total) * 100) : 0);
export const safeDiv = (a: number, b: number) => (b ? a / b : 0);

/** Texto do período para subtítulos ("01/09/2026 a 30/09/2026"). */
export function periodText(f: Pick<ReportFilters, 'from' | 'to'>): string {
  if (!f.from && !f.to) return 'Todo o período';
  if (f.from && f.to) return `${date(f.from)} a ${date(f.to)}`;
  return f.from ? `A partir de ${date(f.from)}` : `Até ${date(f.to)}`;
}
