/**
 * Comissões por vendedor: agrega as vendas do período e libera a comissão
 * proporcionalmente ao que já foi recebido de cada venda.
 */
import { date, money, percent } from '../../domain/format';
import { ROLE_LABELS, SALE_STATUS } from '../../domain/labels';
import type { FinancialEntry, Profile, Sale } from '../../domain/types';
import { createPdf, exportCsv } from '../../ui';
import { COMMISSION_EXCLUDED, saleCommission, sum, type SaleCommission } from './helpers';

export interface SellerCommission {
  id: string;
  name: string;
  role: string;
  rate: number | null;
  sales: SaleCommission[];
  count: number;
  revenue: number;
  base: number;
  commission: number;
  received: number;
  released: number;
  pending: number;
  /** 0..1 — parte do faturamento já recebida. */
  receivedRatio: number;
}

export function sellerCommissions(sales: Sale[], entries: FinancialEntry[], profiles: Profile[], from: string, to: string): SellerCommission[] {
  const bySale = new Map<string, FinancialEntry[]>();
  for (const e of entries) if (e.saleId && e.direction === 'IN') bySale.set(e.saleId, [...(bySale.get(e.saleId) || []), e]);
  const map = new Map<string, SellerCommission>();
  const ensure = (id: string, name: string, p?: Profile) => {
    let s = map.get(id);
    if (!s) {
      s = {
        id,
        name: p?.name || name,
        role: p ? ROLE_LABELS[p.role] : 'Vendedor',
        rate: p?.commissionRate ?? null,
        sales: [],
        count: 0,
        revenue: 0,
        base: 0,
        commission: 0,
        received: 0,
        released: 0,
        pending: 0,
        receivedRatio: 0,
      };
      map.set(id, s);
    }
    return s;
  };
  const pmap = new Map(profiles.map((p) => [p.id, p]));
  for (const p of profiles) if (p.active && (p.role === 'SELLER' || p.role === 'EXTERNAL_SELLER')) ensure(p.id, p.name, p);
  for (const s of sales) {
    if (!s.sellerId || COMMISSION_EXCLUDED.includes(s.status) || s.date < from || s.date > to) continue;
    const row = ensure(s.sellerId, s.sellerName || 'Vendedor', pmap.get(s.sellerId));
    row.sales.push(saleCommission(s, bySale.get(s.id) || []));
  }
  return [...map.values()].map((r) => {
    const revenue = sum(r.sales, (x) => x.revenue);
    const received = sum(r.sales, (x) => x.received);
    return {
      ...r,
      count: r.sales.length,
      revenue,
      base: sum(r.sales, (x) => x.base),
      commission: sum(r.sales, (x) => x.commission),
      received,
      released: sum(r.sales, (x) => x.released),
      pending: sum(r.sales, (x) => x.pending),
      receivedRatio: revenue > 0 ? Math.min(1, received / revenue) : 0,
    };
  });
}

const saleColumns = [
  { header: 'Data', value: (x: SaleCommission) => date(x.sale.date) },
  { header: 'Pedido', value: (x: SaleCommission) => x.sale.number },
  { header: 'Cliente', value: (x: SaleCommission) => x.sale.customerName },
  { header: 'Status', value: (x: SaleCommission) => SALE_STATUS[x.sale.status].label },
];

export function exportSellerCsv(s: SellerCommission, periodLabel: string) {
  exportCsv(`comissoes-${slug(s.name)}`, s.sales, [
    ...saleColumns,
    { header: 'Período', value: () => periodLabel },
    { header: 'Faturamento', value: (x) => x.revenue },
    { header: 'Base', value: (x) => x.base },
    { header: '% comissão', value: (x) => x.sale.commissionRate },
    { header: 'Comissão', value: (x) => x.commission },
    { header: '% recebido', value: (x) => Math.round(x.receivedRatio * 1000) / 10 },
    { header: 'Liberada', value: (x) => x.released },
    { header: 'Pendente', value: (x) => x.pending },
  ]);
}

export function sellerPdf(s: SellerCommission, periodLabel: string) {
  const pdf = createPdf({ title: `Comissões — ${s.name}`, subtitle: `${s.role} · ${periodLabel}`, orientation: 'landscape' });
  pdf.keyValues([
    ['Vendas', String(s.count)],
    ['Faturamento', money(s.revenue)],
    ['Base de comissão', money(s.base)],
    ['Comissão total', money(s.commission)],
    ['Recebido dos clientes', `${money(s.received)} (${percent(s.receivedRatio * 100)})`],
    ['Comissão liberada', money(s.released)],
    ['Comissão pendente', money(s.pending)],
    ['Taxa padrão', s.rate != null ? percent(s.rate) : '—'],
  ]);
  pdf.table(
    [...s.sales].sort((a, b) => a.sale.date.localeCompare(b.sale.date)),
    [
      { header: 'Data', value: (x) => date(x.sale.date), width: 22 },
      { header: 'Pedido', value: (x) => x.sale.number, width: 24 },
      { header: 'Cliente', value: (x) => x.sale.customerName },
      { header: 'Status', value: (x) => SALE_STATUS[x.sale.status].label, width: 30 },
      { header: 'Faturamento', value: (x) => money(x.revenue), align: 'right', width: 28 },
      { header: 'Base', value: (x) => money(x.base), align: 'right', width: 28 },
      { header: '%', value: (x) => percent(x.sale.commissionRate), align: 'right', width: 14 },
      { header: 'Comissão', value: (x) => money(x.commission), align: 'right', width: 26 },
      { header: 'Receb.', value: (x) => percent(x.receivedRatio * 100, 0), align: 'right', width: 16 },
      { header: 'Liberada', value: (x) => money(x.released), align: 'right', width: 26 },
      { header: 'Pendente', value: (x) => money(x.pending), align: 'right', width: 26 },
    ],
    {
      foot: [
        '',
        '',
        'Total',
        '',
        money(s.revenue),
        money(s.base),
        '',
        money(s.commission),
        percent(s.receivedRatio * 100, 0),
        money(s.released),
        money(s.pending),
      ],
    },
  );
  pdf.text('Comissão liberada = comissão da venda × parte já recebida do cliente (parcelas pagas).', { size: 8.5, color: [110, 110, 110] });
  pdf.save(`comissoes-${slug(s.name)}`);
}

export function summaryPdf(rows: SellerCommission[], periodLabel: string) {
  const pdf = createPdf({ title: 'Comissões por vendedor', subtitle: periodLabel, orientation: 'landscape' });
  pdf.table(
    rows,
    [
      { header: 'Vendedor', value: (s) => s.name },
      { header: 'Tipo', value: (s) => s.role, width: 32 },
      { header: 'Vendas', value: (s) => s.count, align: 'right', width: 18 },
      { header: 'Faturamento', value: (s) => money(s.revenue), align: 'right', width: 30 },
      { header: 'Base', value: (s) => money(s.base), align: 'right', width: 30 },
      { header: 'Comissão', value: (s) => money(s.commission), align: 'right', width: 28 },
      { header: 'Receb.', value: (s) => percent(s.receivedRatio * 100, 0), align: 'right', width: 16 },
      { header: 'Liberada', value: (s) => money(s.released), align: 'right', width: 28 },
      { header: 'Pendente', value: (s) => money(s.pending), align: 'right', width: 28 },
    ],
    {
      foot: [
        'Total',
        '',
        String(sum(rows, (s) => s.count)),
        money(sum(rows, (s) => s.revenue)),
        money(sum(rows, (s) => s.base)),
        money(sum(rows, (s) => s.commission)),
        '',
        money(sum(rows, (s) => s.released)),
        money(sum(rows, (s) => s.pending)),
      ],
    },
  );
  pdf.save('comissoes-por-vendedor');
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40);
