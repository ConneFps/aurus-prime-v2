/**
 * Vendas / pedidos — o coração do sistema.
 *
 * Ciclo: DRAFT → PENDING_APPROVAL → APPROVED → PICKING → (AWAITING_CUSTOMER) → READY → DISPATCHED → DELIVERED
 * A baixa de estoque acontece UMA vez, ao concluir a separação (finalizePicking).
 */
import type { Tx } from '../../data/api';
import { money } from '../../domain/format';
import { pixTxidFor } from '../../domain/pix';
import type { Sale, SaleStatus } from '../../domain/types';
import { evaluateWeighing, policyFromSettings } from '../../domain/weighing';
import type { Ops, OpsContext, StockAllocationResult } from '../types';
import {
  assert,
  audit,
  clean,
  getSettings,
  isISODate,
  isNonNeg,
  isStaff,
  mustGet,
  nowIso,
  opsToday,
  requireAnyPerm,
  requirePerm,
  round2,
  round3,
  runTx,
} from './common';
import { recalcCustomerStatsTx } from './customers';
import {
  applyPayment,
  closeOpenEntries,
  derivePaymentStatus,
  insertEntryLines,
  saleEntries,
  saleEntryBase,
  saleHasReceivables,
  syncSalePaymentStatus,
  syncSaleReceivables,
} from './finance';
import {
  baseFreightOf,
  buildItems,
  cancelSaleTx,
  computeSaleTotals,
  createSaleTx,
  historyEvent,
  loadSale,
  pixForSale,
  prepareSale,
  saleFields,
  statusLabel,
  validateItemInputs,
} from './sale-core';
import { deductSaleStock, reverseSaleStock } from './sale-stock';
import { reconcilePortalPrices } from './portal';

export { createSaleTx, cancelSaleTx, computeSaleTotals, baseFreightOf, pixForSale } from './sale-core';

// ============================================================================
// Operações
// ============================================================================

type SalesKeys =
  | 'createSale'
  | 'updateSale'
  | 'submitSale'
  | 'approveSale'
  | 'rejectSale'
  | 'startPicking'
  | 'finalizePicking'
  | 'respondWeighing'
  | 'dispatchSale'
  | 'deliverSale'
  | 'cancelSale'
  | 'deleteSale'
  | 'regenerateReceivables'
  | 'attachSaleFile'
  | 'removeSaleFile'
  | 'generateSalePix'
  | 'uploadPaymentReceipt'
  | 'confirmSalePayment';

export function salesOps(ctx: OpsContext): Pick<Ops, SalesKeys> {
  const { actor } = ctx;

  /** Dono (portal/vendedor externo) ou equipe com uma das permissões. */
  function requireSaleAccess(sale: Sale, staffPerms: Parameters<typeof requireAnyPerm>[1]) {
    if (actor.role === 'CUSTOMER') {
      assert(sale.portalAccountId && sale.portalAccountId === actor.id, 'Pedido não encontrado.');
      return;
    }
    if (actor.role === 'EXTERNAL_SELLER') {
      assert(sale.sellerId === actor.id, 'Você só pode alterar os seus pedidos.');
      return;
    }
    requireAnyPerm(actor, staffPerms);
  }

  async function stats(tx: Tx, customerId: string) {
    if (isStaff(actor)) await recalcCustomerStatsTx(tx, customerId);
  }

  /** Transição simples de status. */
  async function transition(
    id: string,
    from: SaleStatus[],
    to: SaleStatus,
    action: string,
    extra: (sale: Sale, now: string) => Partial<Sale> = () => ({}),
    note?: string | null,
  ) {
    await runTx(ctx, async (tx) => {
      const sale = await loadSale(tx, id);
      assert(from.includes(sale.status), `Pedido ${sale.number} está "${statusLabel(sale.status)}" — ação indisponível.`);
      const now = nowIso();
      tx.update('sales', id, {
        status: to,
        ...extra(sale, now),
        history: [...(sale.history || []), historyEvent(actor, action, note ?? null)],
      });
      audit(tx, actor, 'UPDATE', 'sales', id, `Pedido ${sale.number}: ${statusLabel(sale.status)} → ${statusLabel(to)}`);
    });
  }

  return {
    async createSale(input) {
      requirePerm(actor, 'sales.create');
      return runTx(ctx, (tx) => createSaleTx(tx, actor, input));
    },

    async updateSale(id, input) {
      return runTx(ctx, async (tx) => {
        const sale = await loadSale(tx, id);
        if (actor.role === 'EXTERNAL_SELLER') {
          assert(sale.sellerId === actor.id, 'Você só pode alterar os seus pedidos.');
          assert(['DRAFT', 'PENDING_APPROVAL'].includes(sale.status), 'Pedido já aprovado — peça à equipe interna para alterar.');
        } else {
          requirePerm(actor, 'sales.edit');
        }
        assert(!sale.stockDeducted, 'O estoque deste pedido já foi baixado — cancele e refaça, ou refaça a separação.');
        assert(
          ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PICKING'].includes(sale.status),
          `Pedido "${statusLabel(sale.status)}" não pode ser editado.`,
        );
        const settings = await getSettings(tx);
        // Campos omitidos na edição mantêm o vendedor/comissão atuais.
        const sellerId = input.sellerId !== undefined ? input.sellerId : sale.sellerId ?? null;
        const commissionRate =
          input.commissionRate !== undefined ? input.commissionRate : sellerId === (sale.sellerId ?? null) ? sale.commissionRate : undefined;
        const prep = await prepareSale(tx, actor, settings, { ...input, sellerId, commissionRate });
        const items = await buildItems(tx, id, input.items, sale.items || [], 1);
        const discount = round2(input.discountValue || 0);
        const totals = computeSaleTotals(items, round2(input.freightValue || 0), discount, prep.commissionRate);
        assert(discount <= totals.itemsSubtotal + totals.freightValue + 0.005, 'O desconto é maior que o valor do pedido.');
        const oldCustomer = sale.customerId;
        const next: Sale = {
          ...sale,
          channel: sale.channel === 'PORTAL' ? 'PORTAL' : prep.channel,
          customerId: prep.customer.id,
          customerName: prep.customer.name,
          customerDocument: prep.customer.document || null,
          customerCategory: prep.customer.category ?? null,
          sellerId: prep.sellerId,
          sellerName: prep.sellerName,
          commissionRate: prep.commissionRate,
          priceTableId: input.priceTableId ?? sale.priceTableId ?? null,
          date: input.date,
          deliveryDate: input.deliveryDate ?? null,
          deliveryMode: input.deliveryMode,
          deliveryWindow: input.deliveryWindow ?? sale.deliveryWindow ?? null,
          shippingZipCode: clean(input.shippingZipCode) ?? sale.shippingZipCode ?? null,
          shippingAddress: clean(input.shippingAddress) ?? sale.shippingAddress ?? null,
          freightZoneId: input.freightZoneId ?? sale.freightZoneId ?? null,
          freightPending: input.freightPending ?? false,
          paymentMethod: input.paymentMethod,
          billingType: input.billingType || sale.billingType,
          paymentTerms: clean(input.paymentTerms),
          installmentsCount: Math.max(1, Math.floor(input.installmentsCount || 1)),
          discountValue: discount,
          ...totals,
          isIntercompany: prep.isIntercompany,
          company: input.company ?? sale.company ?? null,
          invoiceNumber: clean(input.invoiceNumber) ?? sale.invoiceNumber ?? null,
          boletoNumber: clean(input.boletoNumber) ?? sale.boletoNumber ?? null,
          customerNotes: clean(input.customerNotes),
          notes: clean(input.notes),
          items,
        };
        if (next.paymentTerms) {
          const n = next.paymentTerms.split(/[\/,;\s]+/).filter((x) => /^\d+$/.test(x)).length;
          if (n) next.installmentsCount = n;
        }
        if (next.channel === 'PORTAL' && ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(next.status)) {
          next.estimatedTotal = next.totalValue;
          next.pixPayload = pixForSale(settings, next, next.totalValue);
          next.pixTxid = pixTxidFor(next.number);
        } else if (['DRAFT', 'PENDING_APPROVAL'].includes(next.status)) {
          next.estimatedTotal = next.totalValue;
        }
        next.firstDueDate = input.firstDueDate ?? null;
        next.history = [...(sale.history || []), historyEvent(actor, 'UPDATE', null, { totalValue: next.totalValue, firstDueDate: input.firstDueDate ?? null })];
        const note = await syncSaleReceivables(tx, next);
        if (note) next.history.push(historyEvent(actor, 'NOTE', note));
        next.paymentStatus = derivePaymentStatus(next, await saleEntries(tx, id));
        tx.update('sales', id, saleFields(next));
        if (!['DRAFT', 'PENDING_APPROVAL'].includes(next.status)) {
          await stats(tx, next.customerId);
          if (oldCustomer !== next.customerId) await stats(tx, oldCustomer);
        }
        audit(tx, actor, 'UPDATE', 'sales', id, `Pedido ${sale.number} alterado — ${money(next.totalValue)}`);
        return (await tx.get('sales', id)) as Sale;
      });
    },

    async submitSale(id) {
      await runTx(ctx, async (tx) => {
        const sale = await loadSale(tx, id);
        if (actor.role === 'EXTERNAL_SELLER') assert(sale.sellerId === actor.id, 'Você só pode enviar os seus pedidos.');
        else requireAnyPerm(actor, ['sales.create', 'sales.edit']);
        assert(sale.status === 'DRAFT', 'Somente rascunhos podem ser enviados para aprovação.');
        assert((sale.items || []).length > 0, 'Inclua pelo menos um item antes de enviar.');
        tx.update('sales', id, {
          status: 'PENDING_APPROVAL',
          history: [...(sale.history || []), historyEvent(actor, 'SUBMIT')],
        });
        audit(tx, actor, 'UPDATE', 'sales', id, `Pedido ${sale.number} enviado para aprovação`);
      });
    },

    async approveSale(id, note) {
      requirePerm(actor, 'sales.approve');
      await runTx(ctx, async (tx) => {
        const sale = await loadSale(tx, id);
        assert(['DRAFT', 'PENDING_APPROVAL'].includes(sale.status), `Pedido ${sale.number} está "${statusLabel(sale.status)}" — não há o que aprovar.`);
        const customer = await mustGet(tx, 'customers', sale.customerId, 'Cliente do pedido não encontrado.');
        assert(customer.status !== 'BLOCKED', `O cliente ${customer.name} está bloqueado — desbloqueie antes de aprovar.`);
        const now = nowIso();
        let priceNote: string | null = null;
        if (sale.channel === 'PORTAL') {
          // Preço oficial: tabela do cliente → catálogo (o pedido veio do navegador do cliente).
          const fixes = await reconcilePortalPrices(tx, sale, customer);
          if (fixes.length) {
            const totals = computeSaleTotals(sale.items, baseFreightOf(sale), sale.discountValue, sale.commissionRate);
            Object.assign(sale, totals);
            sale.estimatedTotal = totals.totalValue;
            priceNote = `Preços conferidos com a tabela/catálogo: ${fixes.join('; ')}`;
          }
        }
        sale.status = 'APPROVED';
        sale.approvedById = actor.id;
        sale.approvedByName = actor.name;
        sale.approvedAt = now;
        if (sale.channel === 'PORTAL' && sale.sellerId) {
          // No portal o cliente não lê perfis: a comissão do vendedor é confirmada na aprovação.
          const seller = await tx.get('profiles', sale.sellerId);
          if (seller) {
            sale.sellerName = seller.name;
            if (seller.commissionRate != null) {
              sale.commissionRate = seller.commissionRate;
              sale.commissionValue = round2((sale.itemsSubtotal * seller.commissionRate) / 100);
            }
          }
        }
        sale.history = [...(sale.history || []), historyEvent(actor, 'APPROVE', [clean(note), priceNote].filter(Boolean).join(' — ') || null)];
        tx.update('sales', id, saleFields(sale));
        await syncSaleReceivables(tx, sale);
        await syncSalePaymentStatus(tx, id);
        await stats(tx, sale.customerId);
        audit(tx, actor, 'APPROVE', 'sales', id, `Pedido ${sale.number} aprovado — ${sale.customerName} — ${money(sale.totalValue)}`);
      });
    },

    async rejectSale(id, reason) {
      requirePerm(actor, 'sales.approve');
      assert(clean(reason), 'Informe o motivo da recusa.');
      await runTx(ctx, async (tx) => {
        const sale = await loadSale(tx, id);
        assert(['DRAFT', 'PENDING_APPROVAL'].includes(sale.status), 'Somente pedidos aguardando aprovação podem ser recusados. Use cancelar.');
        const entries = await saleEntries(tx, id);
        closeOpenEntries(tx, entries, `Pedido ${sale.number} recusado`);
        sale.status = 'REJECTED';
        sale.cancelReason = reason.trim();
        sale.cancelledAt = nowIso();
        sale.history = [...(sale.history || []), historyEvent(actor, 'REJECT', reason.trim())];
        sale.paymentStatus = derivePaymentStatus(sale, await saleEntries(tx, id));
        tx.update('sales', id, saleFields(sale));
        audit(tx, actor, 'REJECT', 'sales', id, `Pedido ${sale.number} recusado: ${reason.trim()}`);
      });
    },

    async startPicking(id) {
      requirePerm(actor, 'picking.perform');
      await transition(id, ['APPROVED'], 'PICKING', 'PICKING_STARTED', () => ({ pickedByName: actor.name }));
    },

    async finalizePicking(id, input) {
      requirePerm(actor, 'picking.perform');
      return runTx(ctx, async (tx): Promise<StockAllocationResult> => {
        const sale = await loadSale(tx, id);
        assert(
          ['APPROVED', 'PICKING', 'AWAITING_CUSTOMER'].includes(sale.status),
          `Pedido ${sale.number} está "${statusLabel(sale.status)}" — não pode ser separado.`,
        );
        const settings = await getSettings(tx);
        const today = opsToday();
        const now = nowIso();
        if (sale.stockDeducted) await reverseSaleStock(tx, actor, sale, today, 'Nova pesagem');
        const baseFreight = baseFreightOf(sale);

        const byId = new Map((sale.items || []).map((i) => [i.id, i]));
        for (const p of input.items || []) {
          const it = byId.get(p.itemId);
          assert(it, 'Item da separação não pertence a este pedido.');
          assert(isNonNeg(p.qty), `Quantidade inválida para ${it.productName}.`);
          it.qty = round3(p.qty);
          if (p.lotId !== undefined) it.lotId = p.lotId;
          if (p.packages !== undefined) it.packages = p.packages;
          it.total = round2(it.qty * it.unitPrice);
          it.updatedAt = now;
        }
        const remove = new Set(input.removeItemIds || []);
        let items = (sale.items || []).filter((i) => !remove.has(i.id));
        if (input.addItems?.length) {
          validateItemInputs(input.addItems, true);
          const maxPos = items.reduce((m, i) => Math.max(m, i.position || 0), 0);
          items = [...items, ...(await buildItems(tx, id, input.addItems, [], maxPos + 1))];
        }
        assert(items.length > 0, 'O pedido ficaria sem itens.');
        sale.items = items;

        const r = await deductSaleStock(tx, actor, sale, today);
        const totals = computeSaleTotals(sale.items, baseFreight, sale.discountValue, sale.commissionRate);
        Object.assign(sale, totals, {
          stockDeducted: true,
          stockShortKg: r.shortQty > 0 ? r.shortQty : null,
          pickedAt: now,
          pickedByName: actor.name,
        });
        let needs = false;
        if (sale.channel === 'PORTAL') {
          const w = evaluateWeighing(sale.estimatedTotal ?? totals.totalValue, totals.totalValue, policyFromSettings(settings));
          needs = w.needsCustomerApproval;
          sale.weighing = needs ? w : { ...w, decision: 'AUTO', decidedAt: now };
          sale.status = needs ? 'AWAITING_CUSTOMER' : 'READY';
          sale.pixPayload = pixForSale(settings, sale, sale.totalValue);
          sale.pixTxid = pixTxidFor(sale.number);
        } else {
          sale.status = 'READY';
        }
        sale.history = [
          ...(sale.history || []),
          historyEvent(actor, 'PICKING_DONE', clean(input.notes), {
            totalValue: sale.totalValue,
            totalWeightKg: sale.totalWeightKg,
            shortQty: r.shortQty,
            shortItems: r.shortItems.length ? r.shortItems : undefined,
          }),
        ];
        const note = await syncSaleReceivables(tx, sale);
        if (note) sale.history.push(historyEvent(actor, 'NOTE', note));
        sale.paymentStatus = derivePaymentStatus(sale, await saleEntries(tx, id));
        tx.update('sales', id, saleFields(sale));
        await stats(tx, sale.customerId);
        audit(
          tx,
          actor,
          'UPDATE',
          'sales',
          id,
          `Separação do pedido ${sale.number} concluída — ${money(sale.totalValue)}${r.shortQty > 0 ? ` (faltou ${r.shortQty} no estoque)` : ''}`,
          { shortQty: r.shortQty, needsCustomerApproval: needs },
        );
        return { shortQty: r.shortQty, shortItems: r.shortItems, needsCustomerApproval: needs, totalValue: sale.totalValue };
      });
    },

    async respondWeighing(id, accept) {
      await runTx(ctx, async (tx) => {
        const sale = await loadSale(tx, id);
        if (actor.role === 'CUSTOMER') assert(sale.portalAccountId === actor.id, 'Pedido não encontrado.');
        else requireAnyPerm(actor, ['sales.edit', 'sales.approve']);
        assert(sale.status === 'AWAITING_CUSTOMER', 'Este pedido não está aguardando aprovação de peso.');
        const now = nowIso();
        const base = sale.weighing || evaluateWeighing(sale.estimatedTotal ?? sale.totalValue, sale.totalValue);
        const weighing = { ...base, decidedAt: now, decision: accept ? ('ACCEPTED' as const) : ('REJECTED' as const) };
        if (accept) {
          tx.update('sales', id, {
            status: 'READY',
            weighing,
            history: [...(sale.history || []), historyEvent(actor, 'WEIGHING_ACCEPTED')],
          });
          audit(tx, actor, 'APPROVE', 'sales', id, `Diferença de peso aceita — pedido ${sale.number} (${money(sale.totalValue)})`);
        } else if (actor.role === 'CUSTOMER') {
          tx.update('sales', id, {
            weighing,
            history: [...(sale.history || []), historyEvent(actor, 'WEIGHING_REJECTED', 'Cliente recusou a diferença de peso — aguardando a equipe.')],
          });
          audit(tx, actor, 'REJECT', 'sales', id, `Cliente recusou a diferença de peso — pedido ${sale.number}`);
        } else {
          requirePerm(actor, 'sales.cancel');
          sale.weighing = weighing;
          await cancelSaleTx(tx, actor, sale, 'Cliente recusou a diferença de peso');
          await stats(tx, sale.customerId);
          audit(tx, actor, 'CANCEL', 'sales', id, `Pedido ${sale.number} cancelado — cliente recusou a diferença de peso`);
        }
      });
    },

    async dispatchSale(id) {
      requirePerm(actor, 'picking.perform');
      await transition(id, ['READY'], 'DISPATCHED', 'DISPATCH', (_s, now) => ({ dispatchedAt: now }));
    },

    async deliverSale(id) {
      requirePerm(actor, 'picking.perform');
      await transition(id, ['READY', 'DISPATCHED'], 'DELIVERED', 'DELIVER', (s, now) => ({
        deliveredAt: now,
        dispatchedAt: s.dispatchedAt || now,
      }));
    },

    async cancelSale(id, reason) {
      requirePerm(actor, 'sales.cancel');
      assert(clean(reason), 'Informe o motivo do cancelamento.');
      await runTx(ctx, async (tx) => {
        const sale = await loadSale(tx, id);
        assert(sale.status !== 'REJECTED', 'Pedido recusado não precisa ser cancelado.');
        await cancelSaleTx(tx, actor, sale, reason.trim());
        await stats(tx, sale.customerId);
        audit(tx, actor, 'CANCEL', 'sales', id, `Pedido ${sale.number} cancelado: ${reason.trim()}`);
      });
    },

    async deleteSale(id, reason) {
      requirePerm(actor, 'sales.delete');
      assert(clean(reason), 'Informe o motivo da exclusão.');
      await runTx(ctx, async (tx) => {
        const sale = await loadSale(tx, id);
        if (sale.status !== 'CANCELLED' && sale.status !== 'REJECTED') await cancelSaleTx(tx, actor, sale, `Exclusão: ${reason.trim()}`);
        const now = nowIso();
        tx.insert('deleted_sales', {
          saleId: sale.id,
          number: sale.number,
          customerName: sale.customerName,
          totalValue: sale.totalValue,
          reason: reason.trim(),
          deletedById: actor.id,
          deletedByName: actor.name,
          deletedAt: now,
          snapshot: JSON.parse(JSON.stringify(sale)) as Record<string, unknown>,
        });
        for (const e of await saleEntries(tx, id)) if (e.status === 'CANCELLED') tx.delete('financial_entries', e.id);
        tx.delete('sales', id);
        await stats(tx, sale.customerId);
        audit(tx, actor, 'DELETE', 'sales', id, `Pedido ${sale.number} excluído — ${sale.customerName} — ${money(sale.totalValue)}: ${reason.trim()}`);
      });
    },

    async regenerateReceivables(saleId, plan) {
      requirePerm(actor, 'finance.manage');
      if (plan.firstDueDate) assert(isISODate(plan.firstDueDate), 'Data do primeiro vencimento inválida.');
      await runTx(ctx, async (tx) => {
        const sale = await loadSale(tx, saleId);
        const method = plan.method ?? sale.paymentMethod;
        assert(saleHasReceivables({ status: sale.status, paymentMethod: method }), 'Este pedido não gera contas a receber no status/forma de pagamento atual.');
        const entries = (await saleEntries(tx, saleId)).filter((e) => e.status !== 'CANCELLED');
        const received = closeOpenEntries(tx, entries, 'Parcelas refeitas');
        const balance = round2(sale.totalValue - received);
        assert(balance > 0.005, 'Não há saldo a receber neste pedido.');
        const issue = opsToday();
        const rows = insertEntryLines(tx, { ...saleEntryBase(sale), method }, balance, { ...plan, method }, issue);
        tx.update('sales', saleId, {
          paymentMethod: method,
          paymentTerms: clean(plan.terms),
          installmentsCount: rows.length,
          firstDueDate: plan.firstDueDate ?? null,
          history: [
            ...(sale.history || []),
            historyEvent(actor, 'RECEIVABLES_REGENERATED', `${rows.length} parcela(s) de ${money(balance)}`, {
              firstDueDate: plan.firstDueDate ?? null,
            }),
          ],
        });
        await syncSalePaymentStatus(tx, saleId);
        audit(tx, actor, 'UPDATE', 'sales', saleId, `Parcelas do pedido ${sale.number} refeitas: ${rows.length}x — saldo ${money(balance)}`);
      });
    },

    async attachSaleFile(saleId, att, fields) {
      assert(att && att.path, 'Arquivo inválido.');
      await runTx(ctx, async (tx) => {
        const sale = await loadSale(tx, saleId);
        requireSaleAccess(sale, ['sales.edit', 'finance.manage']);
        const patch: Partial<Sale> = { attachments: [...(sale.attachments || []), att] };
        if (fields?.invoiceNumber !== undefined) patch.invoiceNumber = clean(fields.invoiceNumber);
        if (fields?.invoiceDate !== undefined) patch.invoiceDate = fields.invoiceDate || null;
        if (fields?.boletoNumber !== undefined) patch.boletoNumber = clean(fields.boletoNumber);
        patch.history = [...(sale.history || []), historyEvent(actor, 'ATTACHMENT', att.name, { kind: att.kind ?? null })];
        tx.update('sales', saleId, patch);
        audit(tx, actor, 'UPDATE', 'sales', saleId, `Arquivo anexado ao pedido ${sale.number}: ${att.name}`);
      });
    },

    async removeSaleFile(saleId, attachmentId) {
      await runTx(ctx, async (tx) => {
        const sale = await loadSale(tx, saleId);
        requireSaleAccess(sale, ['sales.edit', 'finance.manage']);
        const att = (sale.attachments || []).find((a) => a.id === attachmentId);
        assert(att, 'Anexo não encontrado.');
        tx.update('sales', saleId, {
          attachments: sale.attachments.filter((a) => a.id !== attachmentId),
          history: [...(sale.history || []), historyEvent(actor, 'ATTACHMENT_REMOVED', att.name)],
        });
        audit(tx, actor, 'UPDATE', 'sales', saleId, `Anexo removido do pedido ${sale.number}: ${att.name}`);
      });
    },

    async generateSalePix(saleId) {
      return runTx(ctx, async (tx) => {
        const sale = await loadSale(tx, saleId);
        requireSaleAccess(sale, ['sales.edit', 'sales.create', 'finance.manage']);
        assert(sale.status !== 'CANCELLED' && sale.status !== 'REJECTED', 'Pedido cancelado não pode gerar cobrança.');
        const entries = (await saleEntries(tx, saleId)).filter((e) => e.status !== 'CANCELLED');
        const amount = entries.length ? round2(entries.reduce((s, e) => s + (e.amount - (e.paidAmount || 0)), 0)) : sale.totalValue;
        assert(amount > 0.005, 'Este pedido não tem valor em aberto.');
        const settings = await getSettings(tx);
        const payload = pixForSale(settings, sale, amount);
        tx.update('sales', saleId, { pixPayload: payload, pixTxid: pixTxidFor(sale.number) });
        audit(tx, actor, 'UPDATE', 'sales', saleId, `Pix gerado para o pedido ${sale.number} — ${money(amount)}`);
        return payload;
      });
    },

    async uploadPaymentReceipt(saleId, att) {
      assert(att && att.path, 'Envie o arquivo do comprovante.');
      await runTx(ctx, async (tx) => {
        const sale = await loadSale(tx, saleId);
        requireSaleAccess(sale, ['sales.edit', 'finance.manage', 'finance.pay']);
        assert(sale.status !== 'CANCELLED' && sale.status !== 'REJECTED', 'Pedido cancelado.');
        tx.update('sales', saleId, {
          paymentReceipt: { ...att, kind: att.kind || 'RECEIPT' },
          paymentStatus: sale.paymentStatus === 'PAID' || sale.paymentStatus === 'PARTIAL' ? sale.paymentStatus : 'RECEIPT_SENT',
          history: [...(sale.history || []), historyEvent(actor, 'RECEIPT_UPLOADED', att.name)],
        });
        audit(tx, actor, 'UPDATE', 'sales', saleId, `Comprovante de pagamento enviado — pedido ${sale.number}`);
      });
    },

    async confirmSalePayment(saleId, input) {
      requirePerm(actor, 'finance.pay');
      await runTx(ctx, async (tx) => {
        const sale = await loadSale(tx, saleId);
        const open = (await saleEntries(tx, saleId)).filter((e) => e.status === 'OPEN');
        assert(open.length > 0, 'Este pedido não tem parcelas em aberto.');
        let total = 0;
        for (const e of open) total += applyPayment(tx, actor, e, { date: input.date, method: input.method, notes: input.notes }).amount;
        tx.update('sales', saleId, {
          history: [...(sale.history || []), historyEvent(actor, 'PAYMENT_CONFIRMED', clean(input.notes), { amount: round2(total), date: input.date })],
        });
        await syncSalePaymentStatus(tx, saleId);
        audit(tx, actor, 'PAYMENT', 'sales', saleId, `Pagamento confirmado — pedido ${sale.number} — ${money(total)}`);
      });
    },
  };
}

