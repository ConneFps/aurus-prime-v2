/**
 * Baixa e estorno de estoque dos pedidos (FIFO por validade, sem cruzar origens).
 */
import type { Tx } from '../../data/api';
import type { ISODate, Sale, StockLot, StockOrigin, SupplyItem } from '../../domain/types';
import type { Actor } from '../types';
import { allocateFifo, round2, round3 } from './common';

export interface DeductResult {
  shortQty: number;
  shortItems: { productName: string; requested: number; allocated: number }[];
}

/**
 * Baixa FIFO dos itens do pedido (altera sale.items: deductedQty/costTotal).
 * Falta de saldo não bloqueia: vai para shortItems.
 */
export async function deductSaleStock(tx: Tx, actor: Actor, sale: Sale, date: ISODate): Promise<DeductResult> {
  const origin: StockOrigin = sale.isIntercompany ? 'INTERCOMPANY' : 'PROPRIO';
  const lotCache = new Map<string, StockLot[]>();
  const supplyCache = new Map<string, SupplyItem | null>();
  let shortQty = 0;
  const shortItems: DeductResult['shortItems'] = [];
  for (const item of sale.items) {
    item.deductedQty = null;
    item.costTotal = null;
    if (!(item.qty > 0)) continue;
    if (item.kind === 'PRODUCT' && item.productId) {
      let lots = lotCache.get(item.productId);
      if (!lots) {
        lots = (await tx.query('stock_lots', { where: [['productId', '==', item.productId]] })).filter(
          (l) => l.stage === 'FINISHED' && (l.origin || 'PROPRIO') === origin,
        );
        lotCache.set(item.productId, lots);
      }
      const { picks, short } = allocateFifo(lots, item.qty, item.lotId);
      let allocated = 0;
      let cost = 0;
      for (const { lot, take } of picks) {
        lot.balanceQty = round3(lot.balanceQty - take);
        if (lot.balanceQty <= 0.0005) {
          lot.balanceQty = 0;
          lot.status = 'DEPLETED';
        }
        tx.update('stock_lots', lot.id, { balanceQty: lot.balanceQty, status: lot.status });
        tx.insert('stock_movements', {
          lotId: lot.id,
          productId: lot.productId,
          productName: lot.productName,
          stage: lot.stage,
          type: 'SALE',
          qty: -take,
          unitCost: lot.unitCost,
          unitPrice: item.unitPrice,
          batchId: lot.batchId ?? null,
          date,
          saleId: sale.id,
          saleItemId: item.id,
          saleNumber: sale.number,
          customerName: sale.customerName,
          userId: actor.id,
          userName: actor.name,
        });
        allocated += take;
        cost += take * lot.unitCost;
        if (!item.lotCode && item.lotId === lot.id) item.lotCode = lot.lotCode ?? null;
      }
      item.deductedQty = round3(allocated);
      item.costTotal = round2(cost);
      if (short > 0.0005) {
        shortQty += short;
        shortItems.push({ productName: item.productName, requested: item.qty, allocated: round3(allocated) });
      }
    } else if (item.kind === 'SUPPLY' && item.supplyItemId) {
      if (!supplyCache.has(item.supplyItemId)) supplyCache.set(item.supplyItemId, await tx.get('supply_items', item.supplyItemId));
      const s = supplyCache.get(item.supplyItemId);
      if (!s) {
        shortQty += item.qty;
        shortItems.push({ productName: item.productName, requested: item.qty, allocated: 0 });
        continue;
      }
      const take = round3(Math.min(Math.max(0, s.quantity), item.qty));
      if (take > 0) {
        s.quantity = round3(s.quantity - take);
        tx.update('supply_items', s.id, { quantity: s.quantity });
        tx.insert('supply_movements', {
          supplyItemId: s.id,
          supplyItemName: s.name,
          type: 'OUT',
          quantity: take,
          balanceAfter: s.quantity,
          unitCost: s.unitCost ?? null,
          totalValue: s.unitCost != null ? round2(take * s.unitCost) : null,
          date,
          reason: `Pedido ${sale.number}`,
          saleId: sale.id,
          saleNumber: sale.number,
          userName: actor.name,
        });
      }
      item.deductedQty = take;
      item.costTotal = s.unitCost != null ? round2(take * s.unitCost) : null;
      if (item.qty - take > 0.0005) {
        shortQty += item.qty - take;
        shortItems.push({ productName: item.productName, requested: item.qty, allocated: take });
      }
    }
  }
  return { shortQty: round3(shortQty), shortItems };
}

/** Estorna tudo que foi baixado para o pedido (idempotente: usa o saldo líquido dos movimentos). */
export async function reverseSaleStock(tx: Tx, actor: Actor, sale: Sale, date: ISODate, reason: string): Promise<number> {
  const moves = await tx.query('stock_movements', { where: [['saleId', '==', sale.id]] });
  const net = new Map<string, { qty: number; lotId: string; saleItemId: string | null; unitPrice: number | null }>();
  for (const m of moves) {
    if (m.type !== 'SALE' && m.type !== 'SALE_REVERSAL') continue;
    const k = `${m.lotId}|${m.saleItemId || ''}`;
    const cur = net.get(k) || { qty: 0, lotId: m.lotId, saleItemId: m.saleItemId ?? null, unitPrice: m.unitPrice ?? null };
    cur.qty = round3(cur.qty + m.qty);
    net.set(k, cur);
  }
  let returned = 0;
  const lots = new Map<string, StockLot | null>();
  for (const n of net.values()) {
    if (n.qty >= -0.0005) continue;
    if (!lots.has(n.lotId)) lots.set(n.lotId, await tx.get('stock_lots', n.lotId));
    const lot = lots.get(n.lotId);
    if (!lot) continue;
    const back = round3(-n.qty);
    lot.balanceQty = round3(lot.balanceQty + back);
    lot.status = lot.status === 'BLOCKED' ? 'BLOCKED' : 'AVAILABLE';
    tx.update('stock_lots', lot.id, { balanceQty: lot.balanceQty, status: lot.status });
    tx.insert('stock_movements', {
      lotId: lot.id,
      productId: lot.productId,
      productName: lot.productName,
      stage: lot.stage,
      type: 'SALE_REVERSAL',
      qty: back,
      unitCost: lot.unitCost,
      unitPrice: n.unitPrice,
      batchId: lot.batchId ?? null,
      date,
      saleId: sale.id,
      saleItemId: n.saleItemId,
      saleNumber: sale.number,
      customerName: sale.customerName,
      reason,
      userId: actor.id,
      userName: actor.name,
    });
    returned += back;
  }
  // Materiais (sacolas etc.)
  const smoves = await tx.query('supply_movements', { where: [['saleId', '==', sale.id]] });
  const snet = new Map<string, number>();
  for (const m of smoves) {
    if (m.type === 'OUT') snet.set(m.supplyItemId, (snet.get(m.supplyItemId) || 0) + m.quantity);
    else if (m.type === 'IN') snet.set(m.supplyItemId, (snet.get(m.supplyItemId) || 0) - m.quantity);
  }
  for (const [supplyId, q] of snet) {
    const qty = round3(q);
    if (qty <= 0.0005) continue;
    const s = await tx.get('supply_items', supplyId);
    if (!s) continue;
    const balanceAfter = round3(s.quantity + qty);
    tx.update('supply_items', s.id, { quantity: balanceAfter });
    tx.insert('supply_movements', {
      supplyItemId: s.id,
      supplyItemName: s.name,
      type: 'IN',
      quantity: qty,
      balanceAfter,
      unitCost: s.unitCost ?? null,
      totalValue: s.unitCost != null ? round2(qty * s.unitCost) : null,
      date,
      reason: `Estorno do pedido ${sale.number}: ${reason}`,
      saleId: sale.id,
      saleNumber: sale.number,
      userName: actor.name,
    });
  }
  for (const it of sale.items) {
    it.deductedQty = null;
    it.costTotal = null;
  }
  sale.stockDeducted = false;
  return round3(returned);
}

