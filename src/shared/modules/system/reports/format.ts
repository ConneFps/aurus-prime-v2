/**
 * Formatação, totais e exportação (PDF/CSV) genéricos dos relatórios.
 */
import { date, dateTime, integer, money, number, percent, round2, round3 } from '../../../domain/format';
import { createPdf, exportCsv } from '../../../ui';
import { axisMoney, brlShort } from '../../finance/helpers';
import type { ColKind, ReportColumn, ReportResult } from './types';

/** Peso para relatório: até 2 casas ("1.706,69 kg"). */
export const kgFmt = (v: unknown) => `${number(typeof v === 'number' ? v : 0, 2)} kg`;

export function formatValue(v: string | number | null | undefined, kind: ColKind = 'text'): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string') {
    if (kind === 'date') return date(v);
    if (kind === 'dateTime') return dateTime(v);
    return v;
  }
  switch (kind) {
    case 'money':
      return money(v);
    case 'kg':
      return kgFmt(v);
    case 'int':
      return integer(v);
    case 'percent':
      return percent(v, 1);
    case 'number':
      return number(v, 2);
    default:
      return String(v);
  }
}

/** Valor curto para eixos/cartões no celular. */
export function formatShort(v: number, kind: ColKind): string {
  if (kind === 'money') return brlShort(v);
  if (kind === 'kg') return v >= 10000 ? `${number(v / 1000, 1)} t` : kgFmt(Math.round(v));
  return formatValue(v, kind);
}

export function axisFormat(kind: ColKind) {
  return (v: number) => (kind === 'money' ? axisMoney(v) : kind === 'percent' ? `${integer(v)}%` : axisMoney(v).replace(' mil', 'k'));
}

export const isNumeric = (k: ColKind | undefined) => k === 'money' || k === 'kg' || k === 'int' || k === 'number' || k === 'percent';

/** Texto do total de uma coluna (null = sem total). */
export function columnTotal<T>(c: ReportColumn<T>, rows: T[]): string | null {
  if (!c.total) return null;
  if (typeof c.total === 'function') {
    const v = c.total(rows);
    return v === null || v === undefined ? null : typeof v === 'number' ? formatValue(v, c.kind) : v;
  }
  let s = 0;
  for (const r of rows) {
    const v = c.value(r);
    if (typeof v === 'number' && Number.isFinite(v)) s += v;
  }
  return formatValue(c.kind === 'money' ? round2(s) : round3(s), c.kind);
}

const csvValue = <T,>(c: ReportColumn<T>, r: T): string | number | null | undefined => {
  const v = c.value(r);
  if (typeof v === 'number') return c.kind === 'money' ? round2(v) : c.kind === 'int' ? Math.round(v) : round3(v);
  if (typeof v === 'string' && (c.kind === 'date' || c.kind === 'dateTime')) return formatValue(v, c.kind);
  return v;
};

export function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function reportCsv<T>(name: string, res: ReportResult<T>) {
  exportCsv(
    slug(name),
    res.rows,
    res.columns.map((c) => ({ header: c.header, value: (r: T) => csvValue(c, r) })),
  );
}

export function reportPdf<T>(opts: { title: string; subtitle: string; company?: string }, res: ReportResult<T>) {
  const cols = res.columns.filter((c) => !c.noPdf);
  const pdf = createPdf({
    title: opts.title,
    subtitle: opts.subtitle,
    company: opts.company,
    orientation: res.orientation || (cols.length > 7 ? 'landscape' : 'portrait'),
  });
  if (res.stats?.length) {
    pdf.keyValues(res.stats.map((s) => [s.label, s.hint ? `${s.value} (${s.hint})` : s.value]));
  }
  const hasTotals = cols.some((c) => c.total);
  pdf.table(
    res.rows,
    cols.map((c) => ({
      header: c.header,
      align: isNumeric(c.kind) ? ('right' as const) : ('left' as const),
      value: (r: T) => {
        const v = c.value(r);
        return v === null || v === undefined || v === '' ? '' : formatValue(v, c.kind);
      },
    })),
    hasTotals ? { foot: cols.map((c, i) => columnTotal(c, res.rows) ?? (i === 0 ? 'Total' : '')) } : undefined,
  );
  if (res.note) pdf.text(res.note, { size: 8, color: [110, 110, 110] });
  pdf.save(slug(opts.title));
}
