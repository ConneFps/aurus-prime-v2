/**
 * Estoque de carne: entradas, ajustes, bloqueio e perdas.
 * Toda variação de saldo gera um stock_movements (ledger).
 */
import type { Tx } from '../../data/api';
import { addDays, kg } from '../../domain/format';
import type { StockLot } from '../../domain/types';
import type { Actor, Ops, OpsContext } from '../types';
import {
  allocateFifo,
  appendNote,
  assert,
  audit,
  clean,
  isISODate,
  isNonNeg,
  isPos,
  mustGet,
  newId,
  opsToday,
  requirePerm,
  round2,
  round3,
  round4,
  runTx,
} from './common';

/** Aplica uma variação num lote (atualiza saldo/status) e registra o movimento. */
export function moveLot(
  tx: Tx,
  actor: Actor,
  lot: StockLot,
  delta: number,
  mv: {
    type: 'ENTRY' | 'SLAUGHTER_ENTRY' | 'PROCESSING_OUT' | 'PROCESSING_IN' | 'LOSS' | 'ADJUSTMENT';
    date: string;
    reason?: string | null;
    processingOrderId?: string | null;
    lossId?: string | null;
  },
) {
  const balance = Math.max(0, round3(lot.balanceQty + delta));
  let status = lot.status;
  if (balance <= 0.0005) status = status === 'BLOCKED' ? 'BLOCKED' : 'DEPLETED';
  else if (status === 'DEPLETED') status = 'AVAILABLE';
  lot.balanceQty = balance;
  lot.status = status;
  tx.update('stock_lots', lot.id, { balanceQty: balance, status });
  tx.insert('stock_movements', {
    lotId: lot.id,
    productId: lot.productId,
    productName: lot.productName,
    stage: lot.stage,
    type: mv.type,
    qty: round3(delta),
    unitCost: lot.unitCost,
    batchId: lot.batchId ?? null,
    date: mv.date,
    processingOrderId: mv.processingOrderId ?? null,
    lossId: mv.lossId ?? null,
    reason: mv.reason ?? null,
    userId: actor.id,
    userName: actor.name,
  });
}

/** Cria um lote novo e o movimento de entrada. Retorna o id do lote. */
export function insertLot(
  tx: Tx,
  actor: Actor,
  lot: Omit<StockLot, 'id' | 'createdAt' | 'updatedAt' | 'balanceQty' | 'status'>,
  mvType: 'ENTRY' | 'SLAUGHTER_ENTRY' | 'PROCESSING_IN',
  reason?: string | null,
): string {
  const id = newId();
  tx.insert('stock_lots', { ...lot, id, balanceQty: lot.initialQty, status: 'AVAILABLE' });
  tx.insert('stock_movements', {
    lotId: id,
    productId: lot.productId,
    productName: lot.productName,
    stage: lot.stage,
    type: mvType,
    qty: lot.initialQty,
    unitCost: lot.unitCost,
    batchId: lot.batchId ?? null,
    date: lot.entryDate,
    processingOrderId: lot.processingOrderId ?? null,
    reason: reason ?? null,
    userId: actor.id,
    userName: actor.name,
  });
  return id;
}

export function stockOps(ctx: OpsContext): Pick<Ops, 'addStockEntry' | 'adjustLot' | 'setLotBlocked' | 'registerLoss'> {
  const { actor } = ctx;
  return {
    async addStockEntry(input) {
      requirePerm(actor, 'stock.manage');
      assert(isPos(input.qty), 'Informe uma quantidade maior que zero.');
      assert(isNonNeg(input.unitCost), 'Informe o custo unitário (pode ser zero).');
      assert(isISODate(input.entryDate), 'Informe a data de entrada.');
      if (input.expiryDate) assert(isISODate(input.expiryDate), 'Data de validade inválida.');
      const origin = input.origin || 'PROPRIO';
      if (origin === 'INTERCOMPANY') assert(input.originCompany, 'Informe a empresa de origem do intercompany.');
      return runTx(ctx, async (tx) => {
        const product = await mustGet(tx, 'products', input.productId, 'Produto não encontrado.');
        let batchCode: string | null = null;
        if (input.batchId) batchCode = (await mustGet(tx, 'batches', input.batchId, 'Lote de gado não encontrado.')).code;
        const expiry = input.expiryDate || (product.shelfLifeDays ? addDays(input.entryDate, product.shelfLifeDays) : null);
        const qty = round3(input.qty);
        const id = insertLot(
          tx,
          actor,
          {
            productId: product.id,
            productName: product.name,
            stage: input.stage || 'FINISHED',
            batchId: input.batchId ?? null,
            batchCode,
            processingOrderId: null,
            lotCode: clean(input.lotCode),
            origin,
            originCompany: input.originCompany ?? null,
            originInvoice: clean(input.originInvoice),
            entryDate: input.entryDate,
            expiryDate: expiry,
            initialQty: qty,
            unit: product.unit,
            unitCost: round4(input.unitCost),
            location: clean(input.location),
            notes: clean(input.notes),
          },
          'ENTRY',
          origin === 'INTERCOMPANY' ? `Intercompany ${input.originCompany}${input.originInvoice ? ` — NF ${input.originInvoice}` : ''}` : clean(input.notes),
        );
        audit(tx, actor, 'CREATE', 'stock_lots', id, `Entrada de estoque: ${product.name} ${kg(qty)}${origin === 'INTERCOMPANY' ? ` (intercompany ${input.originCompany})` : ''}`);
        return id;
      });
    },

    async adjustLot(lotId, newBalance, reason) {
      requirePerm(actor, 'stock.manage');
      assert(isNonNeg(newBalance), 'O novo saldo não pode ser negativo.');
      assert(clean(reason), 'Informe o motivo do ajuste.');
      await runTx(ctx, async (tx) => {
        const lot = await mustGet(tx, 'stock_lots', lotId, 'Lote de estoque não encontrado.');
        const delta = round3(newBalance - lot.balanceQty);
        assert(Math.abs(delta) > 0.0005, 'O saldo informado é igual ao atual.');
        const before = lot.balanceQty;
        moveLot(tx, actor, lot, delta, { type: 'ADJUSTMENT', date: opsToday(), reason: reason.trim() });
        audit(tx, actor, 'UPDATE', 'stock_lots', lotId, `Ajuste de estoque: ${lot.productName} ${kg(before)} → ${kg(newBalance)} — ${reason.trim()}`);
      });
    },

    async setLotBlocked(lotId, blocked, reason) {
      requirePerm(actor, 'stock.manage');
      if (blocked) assert(clean(reason), 'Informe o motivo do bloqueio.');
      await runTx(ctx, async (tx) => {
        const lot = await mustGet(tx, 'stock_lots', lotId, 'Lote de estoque não encontrado.');
        const status = blocked ? 'BLOCKED' : lot.balanceQty > 0.0005 ? 'AVAILABLE' : 'DEPLETED';
        tx.update('stock_lots', lotId, {
          status,
          notes: clean(reason) ? appendNote(lot.notes, `${blocked ? 'Bloqueado' : 'Liberado'}: ${reason!.trim()}`) : lot.notes ?? null,
        });
        audit(tx, actor, 'UPDATE', 'stock_lots', lotId, `${blocked ? 'Lote bloqueado' : 'Lote liberado'}: ${lot.productName}${lot.lotCode ? ` (${lot.lotCode})` : ''}${clean(reason) ? ` — ${reason!.trim()}` : ''}`);
      });
    },

    async registerLoss(input) {
      requirePerm(actor, 'stock.manage');
      assert(isPos(input.qty), 'Informe a quantidade perdida.');
      assert(isISODate(input.date), 'Informe a data da perda.');
      assert(input.origin && input.reason, 'Informe a origem e o motivo da perda.');
      await runTx(ctx, async (tx) => {
        const qty = round3(input.qty);
        let picks: { lot: StockLot; take: number }[] = [];
        if (input.lotId) {
          const lot = await mustGet(tx, 'stock_lots', input.lotId, 'Lote de estoque não encontrado.');
          assert(lot.balanceQty + 0.0005 >= qty, `Saldo insuficiente no lote: disponível ${kg(lot.balanceQty)}.`);
          picks = [{ lot, take: qty }];
        } else {
          assert(input.productId, 'Informe o produto ou o lote.');
          const stage = input.stage || 'FINISHED';
          const lots = (await tx.query('stock_lots', { where: [['productId', '==', input.productId]] })).filter((l) => l.stage === stage);
          const r = allocateFifo(lots, qty);
          const avail = round3(lots.filter((l) => l.status === 'AVAILABLE').reduce((s, l) => s + l.balanceQty, 0));
          assert(r.short <= 0.0005, `Saldo insuficiente: disponível ${kg(avail)}.`);
          picks = r.picks;
        }
        assert(picks.length > 0, 'Nenhum saldo disponível para registrar a perda.');
        const cost = picks.reduce((s, p) => s + p.take * p.lot.unitCost, 0);
        const first = picks[0].lot;
        const sameBatch = picks.every((p) => (p.lot.batchId || null) === (first.batchId || null));
        const lossId = newId();
        tx.insert('stock_losses', {
          id: lossId,
          date: input.date,
          origin: input.origin,
          reason: input.reason,
          qty,
          unitCost: round4(cost / qty),
          totalValue: round2(cost),
          productId: first.productId,
          productName: first.productName,
          batchId: sameBatch ? first.batchId ?? null : null,
          lotId: picks.length === 1 ? first.id : null,
          notes: clean(input.notes),
          registeredBy: actor.name,
        });
        for (const p of picks) {
          moveLot(tx, actor, p.lot, -p.take, { type: 'LOSS', date: input.date, reason: clean(input.notes) || input.reason, lossId });
        }
        audit(tx, actor, 'CREATE', 'stock_losses', lossId, `Perda registrada: ${first.productName} ${kg(qty)} (${input.reason})`, { totalValue: round2(cost) });
      });
    },
  };
}
