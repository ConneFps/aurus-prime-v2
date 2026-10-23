/**
 * Exportação do inventário do estoque de venda (CSV e PDF para contagem física).
 */
import { date, money, number, qty as fmtQty, today } from '../../domain/format';
import { COMPANY_LABELS } from '../../domain/labels';
import type { StockLot } from '../../domain/types';
import { createPdf, exportCsv } from '../../ui';
import { expiryBadge, LOT_STATUS, type ProductStock } from './model';

const originLabel = (l: StockLot) =>
  (l.origin || 'PROPRIO') === 'INTERCOMPANY' ? `Intercompany ${l.originCompany ? COMPANY_LABELS[l.originCompany] : ''}`.trim() : 'Próprio';

const situation = (p: ProductStock) =>
  [
    p.qty <= 0 ? 'Sem saldo' : null,
    p.belowMin ? 'Abaixo do mínimo' : null,
    p.expiredQty > 0 ? 'Com vencidos' : null,
    p.soonQty > 0 ? 'Vencendo' : null,
    p.blockedQty > 0 ? 'Com bloqueio' : null,
  ]
    .filter(Boolean)
    .join(', ') || 'OK';

export function exportProductsCsv(rows: ProductStock[]) {
  exportCsv(`estoque-produtos-${today()}`, rows, [
    { header: 'Produto', value: (p) => p.name },
    { header: 'Código', value: (p) => p.product?.code },
    { header: 'Categoria', value: (p) => p.category },
    { header: 'Unidade', value: (p) => p.unit },
    { header: 'Saldo disponível', value: (p) => p.qty },
    { header: 'Próprio', value: (p) => p.proprioQty },
    { header: 'Intercompany', value: (p) => p.intercompanyQty },
    { header: 'Bloqueado', value: (p) => p.blockedQty },
    { header: 'Lotes', value: (p) => p.availableLots },
    { header: 'Custo médio', value: (p) => Math.round(p.avgCost * 100) / 100 },
    { header: 'Valor a custo', value: (p) => p.value },
    { header: 'Validade mais próxima', value: (p) => date(p.nearestExpiry) },
    { header: 'Estoque mínimo', value: (p) => p.minStock },
    { header: 'Situação', value: situation },
  ]);
}

export function exportLotsCsv(lots: StockLot[]) {
  exportCsv(`estoque-lotes-${today()}`, lots, [
    { header: 'Produto', value: (l) => l.productName },
    { header: 'Código do lote', value: (l) => l.lotCode },
    { header: 'Origem', value: originLabel },
    { header: 'NF origem', value: (l) => l.originInvoice?.replace(/^NF[\s.:º°-]*/i, '') },
    { header: 'Lote de gado', value: (l) => l.batchCode },
    { header: 'Entrada', value: (l) => date(l.entryDate) },
    { header: 'Validade', value: (l) => date(l.expiryDate) },
    { header: 'Qtd. inicial', value: (l) => l.initialQty },
    { header: 'Saldo', value: (l) => l.balanceQty },
    { header: 'Unidade', value: (l) => l.unit },
    { header: 'Custo unitário', value: (l) => l.unitCost },
    { header: 'Valor a custo', value: (l) => Math.round(l.balanceQty * l.unitCost * 100) / 100 },
    { header: 'Status', value: (l) => LOT_STATUS[l.status].label },
    { header: 'Local', value: (l) => l.location },
  ]);
}

/** PDF de inventário: resumo por produto + lotes com coluna em branco para contagem. */
export function exportInventoryPdf(input: ProductStock[], filtersLabel: string) {
  const rows = [...input].sort((a, b) => a.category.localeCompare(b.category, 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'));
  const pdf = createPdf({
    title: 'Inventário — estoque de venda',
    subtitle: `Posição em ${date(today())}${filtersLabel ? ` · ${filtersLabel}` : ''}`,
    orientation: 'landscape',
  });
  const totalKg = rows.filter((r) => r.unit === 'KG').reduce((s, r) => s + r.qty, 0);
  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  pdf.keyValues([
    ['Produtos', String(rows.length)],
    ['Saldo total (kg)', `${number(totalKg, 3)} kg`],
    ['Valor a custo', money(totalValue)],
    ['Lotes', String(rows.reduce((s, r) => s + r.lots.length, 0))],
  ]);
  pdf.table(
    rows,
    [
      { header: 'Produto', value: (p) => p.name },
      { header: 'Categoria', value: (p) => p.category },
      { header: 'Saldo', value: (p) => fmtQty(p.qty, p.unit), align: 'right' },
      { header: 'Bloqueado', value: (p) => (p.blockedQty ? fmtQty(p.blockedQty, p.unit) : ''), align: 'right' },
      { header: 'Lotes', value: (p) => p.availableLots, align: 'right' },
      { header: 'Custo médio', value: (p) => money(p.avgCost), align: 'right' },
      { header: 'Valor', value: (p) => money(p.value), align: 'right' },
      { header: 'Validade', value: (p) => date(p.nearestExpiry) },
      { header: 'Mínimo', value: (p) => (p.minStock ? fmtQty(p.minStock, p.unit) : ''), align: 'right' },
      { header: 'Situação', value: situation },
    ],
    { title: 'Resumo por produto', foot: ['Total', '', `${number(totalKg, 3)} kg`, '', '', '', money(totalValue), '', '', ''] },
  );
  const lots = rows.flatMap((r) => r.lots);
  pdf.table(
    lots,
    [
      { header: 'Produto', value: (l) => l.productName },
      { header: 'Lote', value: (l) => l.lotCode || '—' },
      { header: 'Origem', value: originLabel },
      { header: 'Lote de gado', value: (l) => l.batchCode || '—' },
      { header: 'Entrada', value: (l) => date(l.entryDate) },
      { header: 'Validade', value: (l) => `${date(l.expiryDate)}${expiryBadge(l.expiryDate) ? ' !' : ''}` },
      { header: 'Status', value: (l) => LOT_STATUS[l.status].label },
      { header: 'Saldo sistema', value: (l) => fmtQty(l.balanceQty, l.unit), align: 'right' },
      { header: 'Contado', value: () => '', width: 28 },
    ],
    { title: 'Lotes (conferência física)' },
  );
  pdf.text('Conferido por: ____________________________    Data: ____/____/______    Assinatura: ____________________________', { size: 9 });
  pdf.save(`inventario-estoque-${today()}`);
}
