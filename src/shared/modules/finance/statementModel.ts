/**
 * Extrato de cliente: lançamentos em ordem cronológica com saldo corrente,
 * resumo por cliente (ranking) e textos de cobrança.
 */
import { addDays, date, money, round2, today } from '../../domain/format';
import { PAYMENT_METHOD_LABELS } from '../../domain/labels';
import type { Customer, FinancialEntry, ISODate, Sale } from '../../domain/types';
import { activePayments, balanceOf, daysLate, isOverdue, sum } from './helpers';

export interface LedgerLine {
  key: string;
  date: ISODate;
  kind: 'SALE' | 'ENTRY' | 'PAYMENT' | 'REVERSAL' | 'OPENING';
  description: string;
  detail?: string;
  saleId?: string | null;
  debit: number;
  credit: number;
  balance: number;
}

const ORDER: Record<LedgerLine['kind'], number> = { OPENING: 0, SALE: 1, ENTRY: 2, REVERSAL: 3, PAYMENT: 4 };

/** Monta o extrato (débitos = vendas/lançamentos, créditos = pagamentos). */
export function buildLedger(
  entries: FinancialEntry[],
  sales: Sale[],
  from: ISODate | null,
  to: ISODate | null,
): { lines: LedgerLine[]; opening: number; closing: number } {
  const saleMap = new Map(sales.map((s) => [s.id, s]));
  const raw: Omit<LedgerLine, 'balance'>[] = [];
  const active = entries.filter((e) => e.direction === 'IN' && e.status !== 'CANCELLED');

  const bySale = new Map<string, FinancialEntry[]>();
  for (const e of active) {
    if (e.saleId) bySale.set(e.saleId, [...(bySale.get(e.saleId) || []), e]);
    else
      raw.push({
        key: `e-${e.id}`,
        date: e.issueDate,
        kind: 'ENTRY',
        description: `${e.description}${e.installments > 1 ? ` (${e.installment}/${e.installments})` : ''}`,
        detail: `Vencimento ${date(e.dueDate)}${e.documentNumber ? ` · doc. ${e.documentNumber}` : ''}`,
        debit: e.amount,
        credit: 0,
      });
  }
  for (const [saleId, list] of bySale) {
    const s = saleMap.get(saleId);
    const sorted = [...list].sort((a, b) => a.installment - b.installment);
    const first = sorted[0];
    raw.push({
      key: `s-${saleId}`,
      date: s?.date || first.issueDate,
      kind: 'SALE',
      saleId,
      description: `Pedido ${s?.number || first.saleNumber || ''}`.trim(),
      detail:
        sorted.length === 1
          ? `Vencimento ${date(first.dueDate)}`
          : `${sorted.length} parcelas · venc. ${sorted.map((e) => date(e.dueDate).slice(0, 5)).join(', ')}`,
      debit: sum(sorted, (e) => e.amount),
      credit: 0,
    });
  }
  for (const e of active) {
    const ref = e.saleNumber ? `Pedido ${e.saleNumber}` : e.description;
    const inst = e.installments > 1 ? ` · parcela ${e.installment}/${e.installments}` : '';
    for (const p of e.payments || []) {
      raw.push({
        key: `p-${p.id}`,
        date: p.date,
        kind: 'PAYMENT',
        saleId: e.saleId,
        description: `Pagamento recebido${p.method ? ` (${PAYMENT_METHOD_LABELS[p.method]})` : ''}`,
        detail: ref + inst,
        debit: 0,
        credit: p.amount,
      });
      if (p.reversed) {
        raw.push({
          key: `r-${p.id}`,
          date: (p.reversedAt || p.date).slice(0, 10),
          kind: 'REVERSAL',
          saleId: e.saleId,
          description: 'Estorno de pagamento',
          detail: `${ref}${inst}${p.reverseReason ? ` · ${p.reverseReason}` : ''}`,
          debit: p.amount,
          credit: 0,
        });
      }
    }
  }
  raw.sort((a, b) => a.date.localeCompare(b.date) || ORDER[a.kind] - ORDER[b.kind]);

  let bal = 0;
  let opening = 0;
  const lines: LedgerLine[] = [];
  for (const r of raw) {
    bal = round2(bal + r.debit - r.credit);
    if (from && r.date < from) {
      opening = bal;
      continue;
    }
    if (to && r.date > to) continue;
    lines.push({ ...r, balance: bal });
  }
  if (from && Math.abs(opening) > 0.005) {
    lines.unshift({ key: 'opening', date: from, kind: 'OPENING', description: 'Saldo anterior', debit: 0, credit: 0, balance: opening });
  }
  const closing = lines.length ? lines[lines.length - 1].balance : opening;
  return { lines, opening, closing };
}

export interface CustomerPosition {
  key: string;
  customerId: string | null;
  name: string;
  customer: Customer | null;
  open: number;
  overdue: number;
  overdueCount: number;
  maxLate: number;
  nextDue: ISODate | null;
  creditLimit: number;
  usage: number | null;
  paid90: number;
  entries: FinancialEntry[];
}

export function customerPositions(entries: FinancialEntry[], customers: Customer[]): CustomerPosition[] {
  const cmap = new Map(customers.map((c) => [c.id, c]));
  const groups = new Map<string, FinancialEntry[]>();
  for (const e of entries) {
    if (e.direction !== 'IN' || e.partyType !== 'CUSTOMER') continue;
    const k = e.partyId || `name:${e.partyName}`;
    groups.set(k, [...(groups.get(k) || []), e]);
  }
  const t = today();
  const since = addDays(t, -90);
  return [...groups.entries()].map(([k, list]) => {
    const c = list[0].partyId ? cmap.get(list[0].partyId) || null : null;
    const open = list.filter((e) => e.status === 'OPEN');
    const over = open.filter((e) => isOverdue(e, t));
    const openSum = sum(open, balanceOf);
    const upcoming = open.filter((e) => e.dueDate >= t).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const limit = c?.creditLimit || 0;
    return {
      key: k,
      customerId: c?.id || list[0].partyId || null,
      name: c?.name || list[0].partyName,
      customer: c,
      open: openSum,
      overdue: sum(over, balanceOf),
      overdueCount: over.length,
      maxLate: Math.max(0, ...over.map((e) => daysLate(e, t))),
      nextDue: upcoming[0]?.dueDate || null,
      creditLimit: limit,
      usage: limit > 0 ? openSum / limit : null,
      paid90: sum(
        list.flatMap((e) => activePayments(e)).filter((p) => p.date >= since),
        (p) => p.amount,
      ),
      entries: list,
    };
  });
}

/** Mensagem de cobrança com as parcelas vencidas. */
export function collectionMessage(opts: {
  customer: Pick<Customer, 'name' | 'contactName' | 'tradeName'>;
  overdue: FinancialEntry[];
  companyName: string;
  pixKey?: string | null;
}): string {
  const first = (opts.customer.contactName || opts.customer.tradeName || opts.customer.name).split(' ')[0];
  const lines = [...opts.overdue]
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .map((e) => {
      const ref = e.saleNumber ? `Pedido ${e.saleNumber}` : e.description;
      const inst = e.installments > 1 ? ` (parcela ${e.installment}/${e.installments})` : '';
      return `• ${ref}${inst} — venc. ${date(e.dueDate)} — ${money(balanceOf(e))}`;
    });
  const total = sum(opts.overdue, balanceOf);
  return [
    `Olá, ${first}! Tudo bem?`,
    '',
    `Aqui é do financeiro da ${opts.companyName}. ${opts.overdue.length === 1 ? 'Consta em nosso sistema a seguinte parcela vencida' : 'Constam em nosso sistema as seguintes parcelas vencidas'}:`,
    '',
    ...lines,
    '',
    `*Total em atraso: ${money(total)}*`,
    '',
    ...(opts.pixKey ? [`Para pagamento via Pix, use a chave: ${opts.pixKey}`, ''] : []),
    'Se o pagamento já foi feito, por favor desconsidere e nos envie o comprovante. Qualquer dúvida, estamos à disposição. Obrigado!',
  ].join('\n');
}
