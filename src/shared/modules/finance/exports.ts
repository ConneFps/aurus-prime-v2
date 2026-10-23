/**
 * Exportações (CSV/PDF) das contas.
 */
import { date, money } from '../../domain/format';
import { COMPANY_LABELS, ENTRY_CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from '../../domain/labels';
import type { FinancialEntry } from '../../domain/types';
import { createPdf, exportCsv } from '../../ui';
import { balanceOf, daysLate, ENTRY_STATE, entryState, sum } from './helpers';

export function exportEntriesCsv(name: string, rows: FinancialEntry[]) {
  exportCsv(name, rows, [
    { header: 'Tipo', value: (e) => (e.direction === 'IN' ? 'A receber' : 'A pagar') },
    { header: 'Vencimento', value: (e) => date(e.dueDate) },
    { header: 'Dias de atraso', value: (e) => daysLate(e) || '' },
    { header: 'Cliente/Fornecedor', value: (e) => e.partyName },
    { header: 'Descrição', value: (e) => e.description },
    { header: 'Categoria', value: (e) => ENTRY_CATEGORY_LABELS[e.category] },
    { header: 'Pedido', value: (e) => e.saleNumber },
    { header: 'Parcela', value: (e) => `${e.installment}/${e.installments}` },
    { header: 'Valor', value: (e) => e.amount },
    { header: 'Pago', value: (e) => e.paidAmount || 0 },
    { header: 'Saldo', value: (e) => balanceOf(e) },
    { header: 'Status', value: (e) => ENTRY_STATE[entryState(e)].label },
    { header: 'Pago em', value: (e) => (e.paidAt ? date(e.paidAt) : '') },
    { header: 'Forma', value: (e) => (e.method ? PAYMENT_METHOD_LABELS[e.method] : '') },
    { header: 'Documento', value: (e) => e.documentNumber },
    { header: 'Código de barras', value: (e) => e.barcode },
    { header: 'Empresa', value: (e) => (e.company ? COMPANY_LABELS[e.company] : '') },
    { header: 'Emissão', value: (e) => date(e.issueDate) },
  ]);
}

export function exportEntriesPdf(title: string, subtitle: string, rows: FinancialEntry[], file: string) {
  const pdf = createPdf({ title, subtitle, orientation: 'landscape' });
  const overdue = rows.filter((e) => entryState(e) === 'OVERDUE');
  pdf.keyValues([
    ['Lançamentos', String(rows.length)],
    ['Valor total', money(sum(rows, (e) => e.amount))],
    ['Pago', money(sum(rows, (e) => e.paidAmount || 0))],
    ['Saldo em aberto', money(sum(rows, balanceOf))],
    ['Vencido', `${money(sum(overdue, balanceOf))} (${overdue.length})`],
  ]);
  pdf.table(
    [...rows].sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [
      { header: 'Vencimento', value: (e) => date(e.dueDate) + (daysLate(e) ? ` (${daysLate(e)}d)` : ''), width: 30 },
      { header: 'Cliente / fornecedor', value: (e) => e.partyName },
      { header: 'Descrição', value: (e) => e.description },
      { header: 'Parc.', value: (e) => `${e.installment}/${e.installments}`, align: 'center', width: 14 },
      { header: 'Valor', value: (e) => money(e.amount), align: 'right', width: 28 },
      { header: 'Pago', value: (e) => money(e.paidAmount || 0), align: 'right', width: 28 },
      { header: 'Saldo', value: (e) => money(balanceOf(e)), align: 'right', width: 28 },
      { header: 'Status', value: (e) => ENTRY_STATE[entryState(e)].label, width: 22 },
    ],
    {
      foot: ['Total', '', '', '', money(sum(rows, (e) => e.amount)), money(sum(rows, (e) => e.paidAmount || 0)), money(sum(rows, balanceOf)), ''],
    },
  );
  pdf.save(file);
}
