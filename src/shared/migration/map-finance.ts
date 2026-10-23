/**
 * Migração: parcelas antigas (installments / boletoInstallments / parcelas de
 * equinos e sêmen) → financial_entries, com pagamentos reconstruídos a partir
 * das próprias parcelas e de financial_transactions (data/usuário da baixa).
 */
import type { EntryPayment, FinancialEntry, PaymentMethod } from '../domain/types';
import type { Ctx } from './context';
import { bool, day, docs, isoDateTime, n0, num, round2, str, upper, type Doc } from './legacy-utils';

export interface LegacyTx {
  date: string | null;
  at: string | null;
  by: string | null;
  amount: number | null;
}

/** financial_transactions indexadas por `${venda_id}|${parcela_id}` e `${venda_id}|#${parcela_numero}` (a mais recente vence). */
export function txIndex(ctx: Ctx): Map<string, LegacyTx> {
  const map = new Map<string, LegacyTx & { sort: string }>();
  for (const d of ctx.col('financial_transactions')) {
    const venda = str(d.venda_id);
    if (!venda) continue;
    const at = isoDateTime(d.data_hora) || isoDateTime(d.createdAt);
    const t = { date: day(d.data_hora), at, by: str(d.usuario_email), amount: num(d.valor_pago), sort: at || '' };
    const keys = [str(d.parcela_id) ? `${venda}|${str(d.parcela_id)}` : null, num(d.parcela_numero) !== null ? `${venda}|#${num(d.parcela_numero)}` : null];
    for (const k of keys) {
      if (!k) continue;
      const cur = map.get(k);
      if (!cur || t.sort >= cur.sort) map.set(k, t);
    }
  }
  return map;
}

export interface InstSrc {
  id: string | null;
  number: number;
  dueDate: string | null;
  value: number;
  paid: boolean;
  paymentDate: string | null;
  paidBy: string | null;
  paidAt: string | null;
  boletoNumber?: string | null;
  barcode?: string | null;
}

/** Lê parcelas antigas (qualquer dos formatos). */
export function readInstallments(list: unknown): InstSrc[] {
  return docs(list)
    .map((d: Doc, i) => ({
      id: str(d.id),
      number: num(d.number) ?? i + 1,
      dueDate: day(d.dueDate),
      value: round2(n0(d.value ?? d.amount)),
      paid: upper(d.status) === 'PAID' || (!!str(d.paymentDate) && upper(d.status) !== 'PENDING') || bool(d.paid),
      paymentDate: day(d.paymentDate),
      paidBy: str(d.paidByUser) || str(d.paidBy),
      paidAt: isoDateTime(d.paidAtTime) || isoDateTime(d.paidAt),
      boletoNumber: str(d.boletoNumber),
      barcode: str(d.barcode),
    }))
    .sort((a, b) => a.number - b.number);
}

export type EntryBaseFields = Pick<
  FinancialEntry,
  'direction' | 'category' | 'description' | 'partyType' | 'partyId' | 'partyName'
> &
  Partial<Pick<FinancialEntry, 'saleId' | 'saleNumber' | 'equineSaleId' | 'semenPurchaseId' | 'sellerId' | 'company' | 'notes' | 'batchId'>>;

/**
 * Gera as parcelas (financial_entries) de um documento antigo.
 *  - paga → status PAID com um pagamento (data/usuário da parcela ou da transação);
 *  - em aberto → OPEN (ou CANCELLED quando o documento foi cancelado/recusado).
 */
export function entriesFrom(
  ctx: Ctx,
  p: {
    prefix: string;
    legacyKey: string;
    base: EntryBaseFields;
    insts: InstSrc[];
    issueDate: string;
    createdAt: string;
    method: PaymentMethod | null;
    cancelUnpaid: boolean;
    tx: Map<string, LegacyTx>;
    documentNumber?: string | null;
    barcode?: string | null;
  },
): FinancialEntry[] {
  const n = p.insts.length;
  return p.insts.map((it, i) => {
    const id = `${p.prefix}${i + 1}`;
    const t = (it.id && p.tx.get(`${p.legacyKey}|${it.id}`)) || p.tx.get(`${p.legacyKey}|#${it.number}`) || (n === 1 ? p.tx.get(`${p.legacyKey}|full`) : undefined);
    const dueDate = it.dueDate || p.issueDate;
    let payments: EntryPayment[] = [];
    let paidAt: string | null = null;
    if (it.paid) {
      const date = it.paymentDate || t?.date || dueDate;
      paidAt = date;
      payments = [
        {
          id: `${id}-pg1`,
          amount: it.value,
          date,
          method: p.method,
          byName: it.paidBy || t?.by || null,
          at: it.paidAt || t?.at || `${date}T12:00:00.000Z`,
          reversed: false,
          notes: 'Baixa migrada do sistema antigo',
        },
      ];
      if (!it.paymentDate && !t) ctx.w.add('fin.nodate', 'Parcelas pagas sem data de pagamento no sistema antigo (usado o vencimento)', id);
    }
    const e: FinancialEntry = {
      id,
      createdAt: p.createdAt,
      updatedAt: p.createdAt,
      legacyId: it.id,
      ...p.base,
      saleId: p.base.saleId ?? null,
      saleNumber: p.base.saleNumber ?? null,
      equineSaleId: p.base.equineSaleId ?? null,
      semenPurchaseId: p.base.semenPurchaseId ?? null,
      batchId: p.base.batchId ?? null,
      batchCostId: null,
      installment: i + 1,
      installments: n,
      issueDate: p.issueDate,
      dueDate,
      amount: it.value,
      paidAmount: it.paid ? it.value : 0,
      status: it.paid ? 'PAID' : p.cancelUnpaid ? 'CANCELLED' : 'OPEN',
      method: p.method,
      documentNumber: it.boletoNumber || p.documentNumber || null,
      barcode: it.barcode || p.barcode || null,
      paidAt,
      payments,
      company: p.base.company ?? null,
      sellerId: p.base.sellerId ?? null,
      notes: p.base.notes ?? null,
    };
    ctx.put('financial_entries', e);
    return e;
  });
}
