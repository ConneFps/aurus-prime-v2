/**
 * Processamento (desossa): envio de carcaça/quartos e retorno em cortes.
 */
import { addDays, kg, percent } from '../../domain/format';
import type { LossReason, ProcessingLossBreakdown, ProcessingOrder, ProcessingReturnEvent, ProcessingReturnedItem, ProcessingSentItem, StockLot } from '../../domain/types';
import type { Ops, OpsContext } from '../types';
import {
  appendNote,
  assert,
  audit,
  clean,
  isISODate,
  isNonNeg,
  isPos,
  mustGet,
  newId,
  nextProcessingNumber,
  nowIso,
  opsToday,
  requirePerm,
  round2,
  round3,
  round4,
  runTx,
} from './common';
import { insertLot, moveLot } from './stock';

const LOSS_FIELDS: [keyof ProcessingLossBreakdown, LossReason][] = [
  ['bonesKg', 'OSSO'],
  ['fatKg', 'SEBO_GORDURA'],
  ['trimmingKg', 'APARA'],
  ['evaporationKg', 'EVAPORACAO'],
  ['otherKg', 'OUTRO'],
];

/** Custo por kg enviado (matéria-prima + serviço + frete). */
export function costPerKgSent(order: Pick<ProcessingOrder, 'sentItems' | 'sentKg' | 'processingCost' | 'freightCost'>): number {
  if (!order.sentKg) return 0;
  const raw = (order.sentItems || []).reduce((s, i) => s + i.qty * (i.unitCost || 0), 0);
  return round4((raw + (order.processingCost || 0) + (order.freightCost || 0)) / order.sentKg);
}

export function processingOps(ctx: OpsContext): Pick<Ops, 'createProcessingOrder' | 'registerProcessingReturn' | 'cancelProcessingOrder'> {
  const { actor } = ctx;
  return {
    async createProcessingOrder(input) {
      requirePerm(actor, 'production.manage');
      assert(isISODate(input.sentDate), 'Informe a data de envio.');
      if (input.expectedReturnDate) assert(isISODate(input.expectedReturnDate), 'Data prevista de retorno inválida.');
      assert(input.items && input.items.length, 'Selecione o que será enviado para a desossa.');
      input.items.forEach((i) => assert(i.lotId && isPos(i.qty), 'Informe lote e quantidade de cada item enviado.'));
      assert(input.freightCost == null || isNonNeg(input.freightCost), 'Frete inválido.');
      assert(input.processingCost == null || isNonNeg(input.processingCost), 'Custo de desossa inválido.');
      return runTx(ctx, async (tx) => {
        const partner = await mustGet(tx, 'partners', input.partnerId, 'Desossa/processador não encontrado.');
        const qtyByLot = new Map<string, number>();
        for (const i of input.items) qtyByLot.set(i.lotId, round3((qtyByLot.get(i.lotId) || 0) + i.qty));
        const lots: StockLot[] = [];
        for (const [lotId, qty] of qtyByLot) {
          const lot = await mustGet(tx, 'stock_lots', lotId, 'Lote de estoque não encontrado.');
          assert(lot.status === 'AVAILABLE', `O lote ${lot.lotCode || lot.productName} não está disponível (${lot.status === 'BLOCKED' ? 'bloqueado' : 'sem saldo'}).`);
          assert(lot.balanceQty + 0.0005 >= qty, `Saldo insuficiente em ${lot.productName} (${lot.lotCode || 'lote'}): disponível ${kg(lot.balanceQty)}.`);
          lots.push(lot);
        }
        const batchIds = Array.from(new Set(lots.map((l) => l.batchId).filter(Boolean))) as string[];
        const batchId = input.batchId ?? (batchIds.length === 1 && lots.every((l) => l.batchId === batchIds[0]) ? batchIds[0] : null);
        const batch = batchId ? await mustGet(tx, 'batches', batchId, 'Lote de gado não encontrado.') : null;
        const id = newId();
        const number = await nextProcessingNumber(tx, input.sentDate);
        const sentItems: ProcessingSentItem[] = [];
        for (const lot of lots) {
          const qty = qtyByLot.get(lot.id)!;
          moveLot(tx, actor, lot, -qty, { type: 'PROCESSING_OUT', date: input.sentDate, processingOrderId: id, reason: `Envio ${number} — ${partner.name}` });
          sentItems.push({ lotId: lot.id, productId: lot.productId, productName: lot.productName, qty, unitCost: lot.unitCost });
        }
        const sentKg = round3(sentItems.reduce((s, i) => s + i.qty, 0));
        const order: ProcessingOrder = {
          id,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          number,
          batchId: batch?.id ?? null,
          batchCode: batch?.code ?? null,
          partnerId: partner.id,
          partnerName: partner.name,
          sentDate: input.sentDate,
          expectedReturnDate: input.expectedReturnDate ?? null,
          status: 'OPEN',
          driverName: clean(input.driverName),
          vehiclePlate: clean(input.vehiclePlate),
          driverPhone: clean(input.driverPhone),
          dispatchDocument: clean(input.dispatchDocument),
          freightCost: input.freightCost != null ? round2(input.freightCost) : null,
          processingCost: input.processingCost != null ? round2(input.processingCost) : null,
          sentKg,
          returnedKg: 0,
          lossKg: 0,
          yieldPercent: null,
          sentItems,
          returns: [],
          notes: clean(input.notes),
          createdByName: actor.name,
        };
        tx.insert('processing_orders', order);
        if (batch) {
          const costs: [number | null | undefined, 'DEBONING' | 'DEBONING_RETURN_FREIGHT'][] = [
            [input.processingCost, 'DEBONING'],
            [input.freightCost, 'DEBONING_RETURN_FREIGHT'],
          ];
          for (const [amount, category] of costs) {
            if (!amount || amount <= 0) continue;
            tx.insert('batch_costs', {
              batchId: batch.id,
              category,
              date: input.sentDate,
              amount: round2(amount),
              description: `${number} — ${partner.name}`,
              documentNumber: clean(input.dispatchDocument),
              partnerId: category === 'DEBONING' ? partner.id : null,
              partnerName: category === 'DEBONING' ? partner.name : null,
              source: 'PROCESSING',
              sourceId: id,
              createdById: actor.id,
              createdByName: actor.name,
            });
          }
        }
        audit(tx, actor, 'CREATE', 'processing_orders', id, `${number} enviada para ${partner.name}: ${kg(sentKg)}${batch ? ` (lote ${batch.code})` : ''}`);
        return id;
      });
    },

    async registerProcessingReturn(orderId, input) {
      requirePerm(actor, 'production.manage');
      assert(isISODate(input.date), 'Informe a data do retorno.');
      assert(input.type === 'PARTIAL' || input.type === 'TOTAL', 'Informe se o retorno é parcial ou total.');
      (input.items || []).forEach((i) => assert(i.productId && isPos(i.qty), 'Informe produto e peso de cada corte retornado.'));
      for (const [f] of LOSS_FIELDS) assert(input.losses?.[f] == null || isNonNeg(input.losses[f]), 'Perdas não podem ser negativas.');
      await runTx(ctx, async (tx) => {
        const order = await mustGet(tx, 'processing_orders', orderId, 'Ordem de processamento não encontrada.');
        assert(order.status === 'OPEN' || order.status === 'PARTIAL', `A ${order.number} já foi ${order.status === 'COMPLETED' ? 'concluída' : 'cancelada'}.`);
        const items = input.items || [];
        const outKg = round3(items.reduce((s, i) => s + i.qty, 0));
        const declared = round3(LOSS_FIELDS.reduce((s, [f]) => s + (input.losses?.[f] || 0), 0));
        assert(outKg > 0 || declared > 0 || input.type === 'TOTAL', 'Informe os cortes retornados ou as perdas.');
        let unclassified = 0;
        if (input.type === 'TOTAL') {
          const left = round3(order.sentKg - (order.returnedKg + outKg + order.lossKg + declared));
          if (left > 0.0005) unclassified = left;
        }
        const inKg = round3(outKg + declared + unclassified);
        const perKgSent = costPerKgSent(order);
        const defaultUnitCost = outKg > 0 ? round4((perKgSent * inKg) / outKg) : 0;
        const returned: ProcessingReturnedItem[] = [];
        for (const [idx, it] of items.entries()) {
          const product = await mustGet(tx, 'products', it.productId, 'Produto do retorno não encontrado.');
          const unitCost = it.unitCost != null ? round4(it.unitCost) : defaultUnitCost;
          const expiry = it.expiryDate || (product.shelfLifeDays ? addDays(input.date, product.shelfLifeDays) : null);
          const lotId = insertLot(
            tx,
            actor,
            {
              productId: product.id,
              productName: product.name,
              stage: 'FINISHED',
              batchId: order.batchId ?? null,
              batchCode: order.batchCode ?? null,
              processingOrderId: order.id,
              lotCode: clean(it.lotCode) || `${order.number}-${String(order.returns.length + 1)}${String(idx + 1).padStart(2, '0')}`,
              origin: 'PROPRIO',
              originCompany: null,
              originInvoice: clean(input.invoiceNumber),
              entryDate: input.date,
              expiryDate: expiry,
              initialQty: round3(it.qty),
              unit: product.unit,
              unitCost,
              location: null,
              notes: null,
            },
            'PROCESSING_IN',
            `Retorno ${order.number} — ${order.partnerName}`,
          );
          returned.push({ productId: product.id, productName: product.name, qty: round3(it.qty), unitCost, expiryDate: expiry, lotId });
        }
        const lossRows: [LossReason, number][] = LOSS_FIELDS.map(([f, r]) => [r, round3(input.losses?.[f] || 0)] as [LossReason, number]).filter(([, q]) => q > 0);
        if (unclassified > 0) lossRows.push(['DIVERGENCIA_PESAGEM', unclassified]);
        for (const [reason, qty] of lossRows) {
          tx.insert('stock_losses', {
            date: input.date,
            origin: 'PROCESSAMENTO',
            reason,
            qty,
            unitCost: perKgSent,
            totalValue: round2(qty * perKgSent),
            batchId: order.batchId ?? null,
            processingOrderId: order.id,
            processingOrderNumber: order.number,
            partnerId: order.partnerId,
            partnerName: order.partnerName,
            notes: reason === 'DIVERGENCIA_PESAGEM' ? 'Diferença não classificada no fechamento da ordem.' : clean(input.notes),
            registeredBy: actor.name,
          });
        }
        const event: ProcessingReturnEvent = {
          id: newId(),
          date: input.date,
          type: input.type,
          invoiceNumber: clean(input.invoiceNumber),
          returnedKg: outKg,
          items: returned,
          losses: { ...input.losses },
          unclassifiedKg: unclassified,
          notes: clean(input.notes),
          registeredBy: actor.name,
          registeredAt: nowIso(),
        };
        const returnedKg = round3(order.returnedKg + outKg);
        const lossKg = round3(order.lossKg + declared + unclassified);
        const yieldPercent = order.sentKg ? round2((returnedKg / order.sentKg) * 100) : null;
        tx.update('processing_orders', order.id, {
          status: input.type === 'TOTAL' ? 'COMPLETED' : 'PARTIAL',
          returnedKg,
          lossKg,
          yieldPercent,
          returns: [...(order.returns || []), event],
        });
        audit(
          tx,
          actor,
          'UPDATE',
          'processing_orders',
          order.id,
          `Retorno ${input.type === 'TOTAL' ? 'total' : 'parcial'} da ${order.number}: ${kg(outKg)} em cortes, perdas ${kg(declared + unclassified)} — rendimento acumulado ${percent(yieldPercent ?? 0)}`,
        );
      });
    },

    async cancelProcessingOrder(orderId, reason) {
      requirePerm(actor, 'production.manage');
      assert(clean(reason), 'Informe o motivo do cancelamento.');
      await runTx(ctx, async (tx) => {
        const order = await mustGet(tx, 'processing_orders', orderId, 'Ordem de processamento não encontrada.');
        assert(order.status === 'OPEN' && !(order.returns || []).length, 'Só é possível cancelar ordens sem retorno registrado.');
        for (const it of order.sentItems || []) {
          if (!it.lotId) continue;
          const lot = await tx.get('stock_lots', it.lotId);
          if (!lot) continue;
          moveLot(tx, actor, lot, it.qty, {
            type: 'ADJUSTMENT',
            date: opsToday(),
            processingOrderId: order.id,
            reason: `Cancelamento da ${order.number}: ${reason.trim()}`,
          });
        }
        for (const c of await tx.query('batch_costs', { where: [['sourceId', '==', order.id]] })) {
          if (c.source === 'PROCESSING') tx.delete('batch_costs', c.id);
        }
        tx.update('processing_orders', order.id, { status: 'CANCELLED', notes: appendNote(order.notes, `Cancelada: ${reason.trim()}`) });
        audit(tx, actor, 'CANCEL', 'processing_orders', order.id, `${order.number} cancelada — saldo devolvido ao estoque: ${reason.trim()}`);
      });
    },
  };
}
