/**
 * PDF do extrato do cliente (para envio ao cliente).
 */
import { date, formatDocument, money } from '../../domain/format';
import type { AppSettings, Customer, FinancialEntry } from '../../domain/types';
import { createPdf } from '../../ui';
import { aging, AGING_LABELS, balanceOf, daysLate, ENTRY_STATE, entryState, sum, type AgingBucket } from './helpers';
import type { LedgerLine } from './statementModel';

export function statementPdf(opts: { customer: Customer; entries: FinancialEntry[]; lines: LedgerLine[]; periodLabel: string; settings: AppSettings }) {
  const { customer: c, entries, lines, settings } = opts;
  const open = entries.filter((e) => e.status === 'OPEN');
  const overdue = open.filter((e) => entryState(e) === 'OVERDUE');
  const pdf = createPdf({
    title: 'Extrato financeiro',
    subtitle: `${c.name}${c.document ? ` — ${formatDocument(c.document)}` : ''} · ${opts.periodLabel}`,
    company: settings.tradeName || settings.companyName,
  });
  pdf.keyValues([
    ['Cliente', c.tradeName ? `${c.tradeName} (${c.name})` : c.name],
    ['CPF / CNPJ', formatDocument(c.document) || '—'],
    ['Em aberto', money(sum(open, balanceOf))],
    ['Vencido', `${money(sum(overdue, balanceOf))}${overdue.length ? ` (${overdue.length} parcela${overdue.length > 1 ? 's' : ''})` : ''}`],
    ['Limite de crédito', c.creditLimit ? money(c.creditLimit) : 'Não definido'],
    ['Cidade', [c.city, c.state].filter(Boolean).join('/') || '—'],
  ]);

  pdf.table(
    lines,
    [
      { header: 'Data', value: (l) => date(l.date), width: 22 },
      { header: 'Histórico', value: (l) => (l.detail ? `${l.description} — ${l.detail}` : l.description) },
      { header: 'Débito', value: (l) => (l.debit ? money(l.debit) : ''), align: 'right', width: 26 },
      { header: 'Crédito', value: (l) => (l.credit ? money(l.credit) : ''), align: 'right', width: 26 },
      { header: 'Saldo', value: (l) => money(l.balance), align: 'right', width: 28 },
    ],
    { title: 'Movimentação', foot: ['', 'Saldo final', '', '', money(lines.length ? lines[lines.length - 1].balance : 0)] },
  );

  if (open.length) {
    pdf.table(
      [...open].sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
      [
        { header: 'Vencimento', value: (e) => date(e.dueDate), width: 24 },
        { header: 'Referência', value: (e) => (e.saleNumber ? `Pedido ${e.saleNumber}` : e.description) },
        { header: 'Parcela', value: (e) => `${e.installment}/${e.installments}`, align: 'center', width: 18 },
        { header: 'Saldo', value: (e) => money(balanceOf(e)), align: 'right', width: 28 },
        { header: 'Situação', value: (e) => (daysLate(e) ? `Vencida há ${daysLate(e)} dias` : ENTRY_STATE[entryState(e)].label), width: 36 },
      ],
      { title: 'Parcelas em aberto', foot: ['', 'Total', '', money(sum(open, balanceOf)), ''] },
    );
    const ag = aging(open);
    pdf.keyValues(
      (Object.keys(AGING_LABELS) as AgingBucket[]).map((k) => [AGING_LABELS[k], money(ag[k])] as [string, string]),
      { title: 'Posição por atraso' },
    );
  }
  if (settings.pixKey) pdf.text(`Pagamento via Pix — chave: ${settings.pixKey}`, { bold: true });
  pdf.text('Em caso de divergência, entre em contato com nosso financeiro.', { size: 9, color: [110, 110, 110] });
  pdf.save(
    `extrato-${(c.tradeName || c.name)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 40)}`,
  );
}
