/**
 * Financeiro: contas a pagar/receber, pagamentos e o vínculo com as vendas.
 */
import type { NewRow, Tx } from '../../data/api';
import { money } from '../../domain/format';
import { COST_CATEGORIES } from '../../domain/labels';
import type {
  CostCategory,
  EntryCategory,
  EntryPayment,
  FinancialEntry,
  ISODate,
  Sale,
  SalePaymentStatus,
} from '../../domain/types';
import type { Actor, InstallmentPlan, Ops, OpsContext, PaymentInput } from '../types';
import {
  appendNote,
  assert,
  audit,
  buildInstallments,
  clean,
  isISODate,
  isPos,
  mustGet,
  newId,
  nowIso,
  opsToday,
  requirePerm,
  round2,
  runTx,
} from './common';

// ============================================================================
// Helpers de lançamentos
// ============================================================================

export type EntryBase = Omit<
  NewRow<'financial_entries'>,
  'installment' | 'installments' | 'dueDate' | 'amount' | 'paidAmount' | 'status' | 'payments' | 'issueDate'
>;

/** Insere as parcelas de um total conforme o plano. */
export function insertEntryLines(tx: Tx, base: EntryBase, total: number, plan: InstallmentPlan, issueDate: ISODate): FinancialEntry[] {
  const t = round2(total);
  if (t <= 0.005) return [];
  const lines = buildInstallments(t, plan, issueDate);
  const now = nowIso();
  return lines.map((ln) => {
    const row = {
      ...base,
      method: base.method ?? plan.method ?? null,
      issueDate,
      installment: ln.installment,
      installments: ln.installments,
      dueDate: ln.dueDate,
      amount: ln.amount,
      paidAmount: 0,
      status: 'OPEN' as const,
      payments: [] as EntryPayment[],
    };
    const id = tx.insert('financial_entries', row);
    return { ...row, id, createdAt: now, updatedAt: now } as FinancialEntry;
  });
}

/** Categoria financeira de um custo de lote (para a conta a pagar). */
export function entryCategoryForCost(c: CostCategory): EntryCategory {
  if (c.startsWith('PURCHASE')) return 'CATTLE_PURCHASE';
  if (c === 'FEED') return 'FEED';
  if (c.endsWith('FREIGHT')) return 'FREIGHT';
  const group = (COST_CATEGORIES[c] || COST_CATEGORIES.OTHER).group;
  if (group === 'FISCAL') return 'TAX';
  if (c === 'LABOR') return 'PAYROLL';
  if (c === 'DEBONING' || c === 'CUTTING' || c === 'SLAUGHTER_FEE' || c === 'VETERINARY') return 'SERVICES';
  return 'OTHER';
}

/** Registra um pagamento numa parcela (sem checar permissão). */
export function applyPayment(tx: Tx, actor: Actor, e: FinancialEntry, input: PaymentInput): { amount: number; paid: boolean } {
  assert(e.status === 'OPEN', 'Esta parcela não está em aberto.');
  const balance = round2(e.amount - (e.paidAmount || 0));
  const amount = round2(input.amount ?? balance);
  assert(isPos(amount), 'Informe um valor de pagamento maior que zero.');
  assert(amount <= balance + 0.009, `O valor informado é maior que o saldo da parcela (${money(balance)}).`);
  assert(isISODate(input.date), 'Informe a data do pagamento.');
  const paidAmount = round2((e.paidAmount || 0) + amount);
  const paid = paidAmount >= e.amount - 0.005;
  const payment: EntryPayment = {
    id: newId(),
    amount,
    date: input.date,
    method: input.method ?? e.method ?? null,
    byName: actor.name,
    at: nowIso(),
    reversed: false,
    notes: clean(input.notes),
  };
  tx.update('financial_entries', e.id, {
    paidAmount,
    payments: [...(e.payments || []), payment],
    status: paid ? 'PAID' : 'OPEN',
    paidAt: paid ? input.date : null,
    method: e.method ?? input.method ?? null,
  });
  return { amount, paid };
}

// ============================================================================
// Contas a receber das vendas
// ============================================================================

const NO_RECEIVABLE_METHODS = ['BONUS', 'SAMPLE'];
const NO_RECEIVABLE_STATUS = ['DRAFT', 'PENDING_APPROVAL', 'CANCELLED', 'REJECTED'];

/** A venda gera contas a receber no status atual? */
export function saleHasReceivables(sale: Pick<Sale, 'paymentMethod' | 'status'>): boolean {
  return !NO_RECEIVABLE_METHODS.includes(sale.paymentMethod) && !NO_RECEIVABLE_STATUS.includes(sale.status);
}

/** Primeira data de vencimento informada no pedido (guardada no histórico). */
export function saleFirstDueDate(sale: Sale): ISODate | null {
  if (sale.firstDueDate) return sale.firstDueDate;
  for (let i = (sale.history || []).length - 1; i >= 0; i--) {
    const d = sale.history[i].data as { firstDueDate?: string | null } | null | undefined;
    if (d && 'firstDueDate' in d) return d.firstDueDate || null;
  }
  return null;
}

export function salePlan(sale: Sale): InstallmentPlan {
  return {
    terms: sale.paymentTerms || null,
    installments: sale.installmentsCount || 1,
    firstDueDate: saleFirstDueDate(sale),
    method: sale.paymentMethod,
  };
}

export function saleEntryBase(sale: Sale): EntryBase {
  return {
    direction: 'IN',
    category: 'SALE',
    description: `Pedido ${sale.number} — ${sale.customerName}`,
    partyType: 'CUSTOMER',
    partyId: sale.customerId,
    partyName: sale.customerName,
    saleId: sale.id,
    saleNumber: sale.number,
    sellerId: sale.sellerId ?? null,
    method: sale.paymentMethod,
    documentNumber: sale.boletoNumber || sale.invoiceNumber || null,
    company: sale.company ?? null,
  };
}

export async function saleEntries(tx: Tx, saleId: string): Promise<FinancialEntry[]> {
  const rows = await tx.query('financial_entries', { where: [['saleId', '==', saleId]] });
  return rows.filter((e) => e.direction === 'IN').sort((a, b) => a.installment - b.installment);
}

/**
 * Deixa as contas a receber coerentes com o total do pedido.
 *  - sem pagamento: refaz as parcelas pelo plano (reaproveitando os registros);
 *  - com pagamento: ajusta a última parcela em aberto pela diferença
 *    (ou cria uma parcela complementar se o total subiu e nada está em aberto).
 * Retorna uma observação para o histórico quando algo relevante aconteceu.
 */
export async function syncSaleReceivables(tx: Tx, sale: Sale): Promise<string | null> {
  if (!saleHasReceivables(sale)) {
    // Ex.: pedido virou bonificação/amostra — remove parcelas nunca pagas.
    if (sale.status !== 'CANCELLED' && sale.status !== 'REJECTED') {
      for (const e of await saleEntries(tx, sale.id)) {
        if (e.status === 'OPEN' && (e.paidAmount || 0) <= 0.005) tx.delete('financial_entries', e.id);
      }
    }
    return null;
  }
  const all = await saleEntries(tx, sale.id);
  const entries = all.filter((e) => e.status !== 'CANCELLED');
  const total = round2(sale.totalValue);
  const anyPaid = entries.some((e) => (e.paidAmount || 0) > 0.005);

  if (!anyPaid) {
    const lines = total > 0.005 ? buildInstallments(total, salePlan(sale), sale.date) : [];
    const base = saleEntryBase(sale);
    lines.forEach((ln, i) => {
      const cur = entries[i];
      if (cur) {
        tx.update('financial_entries', cur.id, {
          ...base,
          issueDate: sale.date,
          installment: ln.installment,
          installments: ln.installments,
          dueDate: ln.dueDate,
          amount: ln.amount,
          status: 'OPEN',
        });
      } else {
        tx.insert('financial_entries', {
          ...base,
          issueDate: sale.date,
          installment: ln.installment,
          installments: ln.installments,
          dueDate: ln.dueDate,
          amount: ln.amount,
          paidAmount: 0,
          status: 'OPEN',
          payments: [],
        });
      }
    });
    for (const extra of entries.slice(lines.length)) tx.delete('financial_entries', extra.id);
    return null;
  }

  const current = round2(entries.reduce((s, e) => s + e.amount, 0));
  let diff = round2(total - current);
  if (Math.abs(diff) < 0.01) return null;
  const open = entries.filter((e) => e.status === 'OPEN').sort((a, b) => b.installment - a.installment);
  if (diff > 0) {
    if (open.length) {
      tx.update('financial_entries', open[0].id, { amount: round2(open[0].amount + diff) });
    } else {
      const n = entries.length + 1;
      for (const e of entries) tx.update('financial_entries', e.id, { installments: n });
      tx.insert('financial_entries', {
        ...saleEntryBase(sale),
        issueDate: sale.date,
        installment: n,
        installments: n,
        dueDate: opsToday(),
        amount: diff,
        paidAmount: 0,
        status: 'OPEN',
        payments: [],
        notes: 'Parcela complementar (diferença de pesagem/alteração do pedido).',
      });
    }
    return null;
  }
  // Total caiu: reduz as parcelas em aberto (da última para a primeira) sem ficar abaixo do já pago.
  for (const e of open) {
    const room = round2(e.amount - (e.paidAmount || 0));
    const cut = Math.min(room, -diff);
    if (cut <= 0) continue;
    const amount = round2(e.amount - cut);
    const paid = amount - (e.paidAmount || 0) <= 0.005;
    tx.update('financial_entries', e.id, {
      amount,
      status: paid ? 'PAID' : 'OPEN',
      paidAt: paid ? (e.payments || []).filter((p) => !p.reversed).slice(-1)[0]?.date ?? opsToday() : null,
    });
    diff = round2(diff + cut);
    if (diff >= -0.005) break;
  }
  if (diff < -0.005) return `Valor recebido supera o novo total em ${money(-diff)} — verifique devolução/crédito ao cliente.`;
  return null;
}

/** Status de pagamento do pedido derivado das parcelas. */
export function derivePaymentStatus(sale: Sale, entries: FinancialEntry[]): SalePaymentStatus {
  const cancelled = sale.status === 'CANCELLED' || sale.status === 'REJECTED';
  if (NO_RECEIVABLE_METHODS.includes(sale.paymentMethod)) return cancelled ? 'CANCELLED' : 'PAID';
  const active = entries.filter((e) => e.direction === 'IN' && e.status !== 'CANCELLED');
  const paidSum = round2(active.reduce((s, e) => s + (e.paidAmount || 0), 0));
  if (cancelled) {
    if (paidSum <= 0.005) return 'CANCELLED';
    return active.every((e) => e.status === 'PAID') ? 'PAID' : 'PARTIAL';
  }
  if (!active.length) return sale.paymentStatus === 'RECEIPT_SENT' ? 'RECEIPT_SENT' : 'PENDING';
  if (active.every((e) => e.status === 'PAID')) return 'PAID';
  if (paidSum > 0.005) return 'PARTIAL';
  if (sale.paymentStatus === 'RECEIPT_SENT') return 'RECEIPT_SENT';
  return 'PENDING';
}

/** Recalcula e grava Sale.paymentStatus a partir das contas. */
export async function syncSalePaymentStatus(tx: Tx, saleId: string): Promise<SalePaymentStatus | null> {
  const sale = await tx.get('sales', saleId);
  if (!sale) return null;
  const entries = await saleEntries(tx, saleId);
  const status = derivePaymentStatus(sale, entries);
  if (status !== sale.paymentStatus) tx.update('sales', saleId, { paymentStatus: status });
  return status;
}

/**
 * Cancela as parcelas em aberto de um conjunto. Parcelas com pagamento parcial
 * são encerradas no valor já recebido. Retorna quanto já havia sido recebido.
 */
export function closeOpenEntries(tx: Tx, entries: FinancialEntry[], reason: string): number {
  let received = 0;
  for (const e of entries) {
    received += e.paidAmount || 0;
    if (e.status !== 'OPEN') continue;
    if ((e.paidAmount || 0) > 0.005) {
      tx.update('financial_entries', e.id, {
        amount: round2(e.paidAmount),
        status: 'PAID',
        paidAt: (e.payments || []).filter((p) => !p.reversed).slice(-1)[0]?.date ?? opsToday(),
        notes: appendNote(e.notes, `Saldo cancelado: ${reason}`),
      });
    } else {
      tx.update('financial_entries', e.id, { status: 'CANCELLED', notes: appendNote(e.notes, `Cancelada: ${reason}`) });
    }
  }
  return round2(received);
}

// ============================================================================
// Operações
// ============================================================================

export function financeOps(ctx: OpsContext): Pick<Ops, 'createEntries' | 'payEntry' | 'reversePayment' | 'cancelEntry' | 'updateEntry'> {
  const { actor } = ctx;
  return {
    async createEntries(input) {
      requirePerm(actor, 'finance.manage');
      assert(input.direction === 'IN' || input.direction === 'OUT', 'Informe se é conta a pagar ou a receber.');
      assert(clean(input.description), 'Informe a descrição do lançamento.');
      assert(clean(input.partyName), 'Informe o nome do cliente/fornecedor.');
      assert(isPos(input.amount), 'Informe um valor maior que zero.');
      const issueDate = input.issueDate || opsToday();
      assert(isISODate(issueDate), 'Data de emissão inválida.');
      const plan = input.plan || {};
      if (plan.firstDueDate) assert(isISODate(plan.firstDueDate), 'Data do primeiro vencimento inválida.');
      return runTx(ctx, async (tx) => {
        let saleNumber: string | null = null;
        if (input.saleId) saleNumber = (await mustGet(tx, 'sales', input.saleId, 'Pedido não encontrado.')).number;
        const rows = insertEntryLines(
          tx,
          {
            direction: input.direction,
            category: input.category,
            description: input.description.trim(),
            partyType: input.partyType,
            partyId: input.partyId ?? null,
            partyName: input.partyName.trim(),
            saleId: input.saleId ?? null,
            saleNumber,
            batchId: input.batchId ?? null,
            documentNumber: clean(input.documentNumber),
            notes: clean(input.notes),
            company: input.company ?? null,
            method: plan.method ?? null,
          },
          input.amount,
          plan,
          issueDate,
        );
        if (input.saleId) await syncSalePaymentStatus(tx, input.saleId);
        audit(
          tx,
          actor,
          'CREATE',
          'financial_entries',
          rows[0]?.id ?? null,
          `${input.direction === 'IN' ? 'Conta a receber' : 'Conta a pagar'} ${money(input.amount)} em ${rows.length}x — ${input.partyName}`,
          { ids: rows.map((r) => r.id) },
        );
        return rows;
      });
    },

    async payEntry(entryId, input) {
      requirePerm(actor, 'finance.pay');
      await runTx(ctx, async (tx) => {
        const e = await mustGet(tx, 'financial_entries', entryId, 'Lançamento não encontrado.');
        const r = applyPayment(tx, actor, e, input);
        if (e.saleId) await syncSalePaymentStatus(tx, e.saleId);
        audit(tx, actor, 'PAYMENT', 'financial_entries', e.id, `${e.direction === 'IN' ? 'Recebimento' : 'Pagamento'} de ${money(r.amount)} — ${e.description} (${e.installment}/${e.installments})`, {
          amount: r.amount,
          date: input.date,
        });
      });
    },

    async reversePayment(entryId, paymentId, reason) {
      requirePerm(actor, 'finance.pay');
      assert(clean(reason), 'Informe o motivo do estorno.');
      await runTx(ctx, async (tx) => {
        const e = await mustGet(tx, 'financial_entries', entryId, 'Lançamento não encontrado.');
        assert(e.status !== 'CANCELLED', 'Lançamento cancelado não pode ter pagamento estornado.');
        const p = (e.payments || []).find((x) => x.id === paymentId);
        assert(p, 'Pagamento não encontrado.');
        assert(!p.reversed, 'Este pagamento já foi estornado.');
        const payments = e.payments.map((x) =>
          x.id === paymentId ? { ...x, reversed: true, reversedAt: nowIso(), reversedBy: actor.name, reverseReason: reason.trim() } : x,
        );
        const paidAmount = Math.max(0, round2((e.paidAmount || 0) - p.amount));
        tx.update('financial_entries', e.id, { payments, paidAmount, status: 'OPEN', paidAt: null });
        if (e.saleId) await syncSalePaymentStatus(tx, e.saleId);
        audit(tx, actor, 'REVERSAL', 'financial_entries', e.id, `Estorno de ${money(p.amount)} — ${e.description}: ${reason.trim()}`);
      });
    },

    async cancelEntry(entryId, reason) {
      requirePerm(actor, 'finance.manage');
      assert(clean(reason), 'Informe o motivo do cancelamento.');
      await runTx(ctx, async (tx) => {
        const e = await mustGet(tx, 'financial_entries', entryId, 'Lançamento não encontrado.');
        assert(e.status === 'OPEN', 'Só é possível cancelar lançamentos em aberto.');
        assert((e.paidAmount || 0) <= 0.005, 'Este lançamento tem pagamentos — estorne-os antes de cancelar.');
        tx.update('financial_entries', e.id, { status: 'CANCELLED', notes: appendNote(e.notes, `Cancelado: ${reason.trim()}`) });
        if (e.saleId) await syncSalePaymentStatus(tx, e.saleId);
        audit(tx, actor, 'CANCEL', 'financial_entries', e.id, `Lançamento cancelado — ${e.description}: ${reason.trim()}`);
      });
    },

    async updateEntry(entryId, patch) {
      requirePerm(actor, 'finance.manage');
      await runTx(ctx, async (tx) => {
        const e = await mustGet(tx, 'financial_entries', entryId, 'Lançamento não encontrado.');
        assert(e.status === 'OPEN', 'Só é possível editar lançamentos em aberto.');
        const upd: Partial<FinancialEntry> = {};
        if (patch.dueDate !== undefined) {
          assert(isISODate(patch.dueDate), 'Data de vencimento inválida.');
          upd.dueDate = patch.dueDate;
        }
        if (patch.amount !== undefined) {
          assert(isPos(patch.amount), 'Informe um valor maior que zero.');
          const amount = round2(patch.amount);
          assert(amount >= (e.paidAmount || 0) - 0.005, `O valor não pode ser menor que o já pago (${money(e.paidAmount)}).`);
          upd.amount = amount;
          if (amount - (e.paidAmount || 0) <= 0.005 && (e.paidAmount || 0) > 0) {
            upd.status = 'PAID';
            upd.paidAt = (e.payments || []).filter((p) => !p.reversed).slice(-1)[0]?.date ?? opsToday();
          }
        }
        if (patch.documentNumber !== undefined) upd.documentNumber = clean(patch.documentNumber);
        if (patch.barcode !== undefined) upd.barcode = clean(patch.barcode);
        if (patch.notes !== undefined) upd.notes = clean(patch.notes);
        if (patch.method !== undefined) upd.method = patch.method;
        if (patch.description !== undefined) {
          assert(clean(patch.description), 'Informe a descrição.');
          upd.description = patch.description.trim();
        }
        tx.update('financial_entries', e.id, upd);
        if (e.saleId) await syncSalePaymentStatus(tx, e.saleId);
        audit(tx, actor, 'UPDATE', 'financial_entries', e.id, `Lançamento alterado — ${e.description}`, { patch: upd });
      });
    },
  };
}
