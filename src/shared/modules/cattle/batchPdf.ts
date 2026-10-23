/**
 * Relatório do lote em PDF (resultado, custos, ração e animais).
 */
import type { BatchEconomics } from '../../domain/costs';
import { date, integer, kg, money, percent } from '../../domain/format';
import { ANIMAL_STATUS, BATCH_STATUS, COST_GROUP_LABELS, MANAGEMENT_LABELS } from '../../domain/labels';
import type { Animal, Batch, BatchCost, FeedConsumption } from '../../domain/types';
import { createPdf } from '../../ui';
import { categoryLabel, COST_GROUP_ORDER, daysOnFeed, groupOf, signedAmount } from './helpers';

export const REVENUE_SOURCE_LABELS: Record<BatchEconomics['revenueSource'], string> = {
  OVERRIDE: 'Informada manualmente',
  REALIZED: 'Vendas realizadas',
  MIXED: 'Vendas + estoque restante',
  PROJECTED: 'Projeção (preço de referência)',
  NONE: 'Sem receita ainda',
};

export function exportBatchPdf(batch: Batch, e: BatchEconomics, costs: BatchCost[], animals: Animal[], feed: FeedConsumption[]) {
  const pdf = createPdf({
    title: `Lote ${batch.code} — ${batch.name}`,
    subtitle: [BATCH_STATUS[batch.status].label, MANAGEMENT_LABELS[batch.managementType], batch.supplierName].filter(Boolean).join(' · '),
  });
  const days = daysOnFeed(batch);
  pdf.keyValues(
    [
      ['Fornecedor', batch.supplierName || '—'],
      ['Data de compra', date(batch.purchaseDate)],
      ['NF / GTA', [batch.purchaseInvoice, batch.gtaNumber].filter(Boolean).join(' / ') || '—'],
      ['Dias em engorda', days === null ? '—' : integer(days)],
      ['Cabeças', `${integer(e.headCount)} (${integer(e.aliveCount)} vivas)`],
      ['Peso de compra', kg(e.purchaseWeightKg)],
      ['Abate', batch.slaughterDate ? `${date(batch.slaughterDate)} · ${batch.slaughterhouseName || ''}` : '—'],
      ['Peso de carcaça', e.carcassWeightKg ? `${kg(e.carcassWeightKg)} (${e.carcassYieldPercent ? percent(e.carcassYieldPercent) : '—'})` : '—'],
    ],
    { title: 'Dados do lote' },
  );

  const groups = COST_GROUP_ORDER.filter((g) => Math.abs(e.byGroup[g]) > 0.004);
  pdf.table(
    [
      ...groups.map((g) => ({ k: g === 'CREDIT' ? '(−) Créditos' : COST_GROUP_LABELS[g], v: money(e.byGroup[g]) })),
      { k: 'Custo total', v: money(e.totalCost) },
      { k: `Receita (${REVENUE_SOURCE_LABELS[e.revenueSource]})`, v: money(e.revenue) },
      { k: e.profit >= 0 ? 'Lucro' : 'Prejuízo', v: money(e.profit) },
      { k: 'Margem / ROI', v: `${percent(e.marginPercent)} / ${percent(e.roiPercent)}` },
      { k: 'Custo por cabeça', v: money(e.costPerHead) },
      { k: 'Custo por @ de carcaça', v: e.costPerArroba ? money(e.costPerArroba) : '—' },
      { k: 'Custo por kg de carcaça (equilíbrio)', v: e.costPerCarcassKg ? money(e.costPerCarcassKg) : '—' },
    ],
    [
      { header: 'Resultado', value: (r) => r.k },
      { header: 'Valor', value: (r) => r.v, align: 'right' },
    ],
    { title: 'Resultado (DRE)' },
  );

  const sorted = [...costs].sort((a, b) => a.date.localeCompare(b.date));
  pdf.table(
    sorted,
    [
      { header: 'Data', value: (c) => date(c.date) },
      { header: 'Grupo', value: (c) => COST_GROUP_LABELS[groupOf(c.category)] },
      { header: 'Categoria', value: (c) => categoryLabel(c.category) },
      { header: 'Descrição', value: (c) => c.description },
      { header: 'Documento', value: (c) => c.documentNumber },
      { header: 'Valor', value: (c) => money(signedAmount(c)), align: 'right' },
    ],
    { title: `Custos (${costs.length})`, foot: ['', '', '', '', 'Total', money(e.totalCost)] },
  );

  if (feed.length)
    pdf.table(
      [...feed].sort((a, b) => a.date.localeCompare(b.date)),
      [
        { header: 'Data', value: (f) => date(f.date) },
        { header: 'Ração', value: (f) => f.feedTypeName },
        { header: 'Quantidade', value: (f) => kg(f.quantityKg), align: 'right' },
        { header: 'Custo', value: (f) => money(f.cost), align: 'right' },
      ],
      {
        title: 'Consumo de ração',
        foot: ['', 'Total', kg(feed.reduce((s, f) => s + f.quantityKg, 0)), money(feed.reduce((s, f) => s + f.cost, 0))],
      },
    );

  if (animals.length)
    pdf.table(
      [...animals].sort((a, b) => a.tag.localeCompare(b.tag, 'pt-BR', { numeric: true })),
      [
        { header: 'Brinco', value: (a) => a.tag },
        { header: 'Situação', value: (a) => ANIMAL_STATUS[a.status].label },
        { header: 'Entrada', value: (a) => kg(a.entryWeightKg), align: 'right' },
        { header: 'Atual/saída', value: (a) => (a.exitWeightKg || a.currentWeightKg ? kg(a.exitWeightKg || a.currentWeightKg) : '—'), align: 'right' },
        { header: 'Carcaça', value: (a) => (a.carcassWeightKg ? kg(a.carcassWeightKg) : '—'), align: 'right' },
        { header: 'Compra', value: (a) => money(a.purchasePrice), align: 'right' },
      ],
      { title: `Animais (${animals.length})` },
    );

  pdf.save(`lote-${batch.code}`);
}
