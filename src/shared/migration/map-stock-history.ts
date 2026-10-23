/**
 * Histórico de estoque a partir do registro de baixas do sistema antigo
 * (stock_deduction_logs e, na falta do log, sales[].stockDeductionUpdates).
 *
 * Cada lote migra com o saldo atual. Quando há baixas/estornos registrados para
 * a peça, a entrada passa a ser o peso ORIGINAL (saldo + baixas − estornos) e
 * cada baixa vira um movimento SALE (estorno = SALE_REVERSAL) ligado ao pedido.
 * O saldo final continua igual ao do sistema antigo, e os pedidos migrados com
 * baixa registrada passam a devolver o estoque se forem cancelados no sistema novo.
 */
import type { Sale, StockMovement } from '../domain/types';
import type { Ctx } from './context';
import { cutScore, day, docs, firstStr, isoDateTime, n0, round3, str, upper, type Doc } from './legacy-utils';

interface StockEvent {
  id: string;
  lotId: string;
  restore: boolean;
  qty: number;
  date: string;
  orderId: string | null;
  orderNumber: string | null;
  customerName: string | null;
  cut: string | null;
  user: string | null;
  reason: string | null;
}

function eventsFromUpdates(ctx: Ctx, prefix: string, updates: Doc[], restore: boolean, base: Omit<StockEvent, 'id' | 'lotId' | 'qty' | 'restore' | 'cut'>): StockEvent[] {
  const out: StockEvent[] = [];
  updates.forEach((u, j) => {
    const lotId = str(u.inventoryId);
    const qty = round3(restore ? n0(u.restoredWeightKg) : n0(u.deductedWeightKg) || n0(u.previousWeightKg) - n0(u.newWeightKg));
    if (!lotId || !(qty > 0.0005)) return;
    out.push({ ...base, id: `${prefix}-${j}`, lotId, qty, restore, cut: str(u.cutType) });
  });
  return out;
}

/** Pedido migrado correspondente (venda ou pedido do portal convertido). */
function saleFor(ctx: Ctx, orderId: string | null): Sale | undefined {
  if (!orderId) return undefined;
  return ctx.get('sales', orderId) || ctx.get('sales', `po-${orderId}`);
}

/** Item do pedido que corresponde ao corte baixado (mesmo produto do lote; senão o nome mais parecido). */
function itemFor(sale: Sale | undefined, productId: string, cut: string | null) {
  const items = (sale?.items || []).filter((i) => i.kind === 'PRODUCT');
  return (
    items.find((i) => i.productId === productId) ||
    items
      .map((i) => ({ i, s: cutScore(i.productName, cut) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)[0]?.i
  );
}

export function mapStockHistory(ctx: Ctx) {
  const events: StockEvent[] = [];
  const loggedOrders = new Set<string>();
  for (const log of ctx.col('stock_deduction_logs')) {
    const restore = upper(log.type).startsWith('REST');
    const at = isoDateTime(log.timestamp) || isoDateTime(log.createdAt);
    if (!at) continue;
    const orderId = str(log.orderId);
    if (orderId && !restore) loggedOrders.add(orderId);
    events.push(
      ...eventsFromUpdates(ctx, `log-${String(log.id)}`, docs(log.updates), restore, {
        date: day(at)!,
        orderId,
        orderNumber: str(log.orderNumber) && str(log.orderNumber) !== 'PROVISÓRIO' ? str(log.orderNumber) : null,
        customerName: str(log.customerName),
        user: str(log.operatorEmail),
        reason: str(log.reason),
      }),
    );
  }
  // Pedidos com a baixa gravada no próprio pedido (v11) e sem log correspondente.
  for (const s of ctx.col('sales')) {
    const id = String(s.id);
    const updates = docs(s.stockDeductionUpdates);
    if (!updates.length || loggedOrders.has(id)) continue;
    const at = firstStr(isoDateTime(s.stockReconciledAt), isoDateTime(s.dispatchedAt), isoDateTime(s.updatedAt), isoDateTime(s.date));
    if (!at) continue;
    events.push(
      ...eventsFromUpdates(ctx, `sale-${id}`, updates, false, {
        date: day(at)!,
        orderId: id,
        orderNumber: str(s.orderNumber),
        customerName: str(s.customerName),
        user: str(s.stockReconciledBy),
        reason: 'Baixa registrada no pedido (sistema antigo)',
      }),
    );
  }

  const byLot = new Map<string, StockEvent[]>();
  for (const e of events) {
    const l = byLot.get(e.lotId) || [];
    l.push(e);
    byLot.set(e.lotId, l);
  }

  let moves = 0;
  let missingLots = 0;
  let inconsistent = 0;
  const salesWithHistory = new Set<string>();
  for (const [lotId, list] of byLot) {
    const lot = ctx.get('stock_lots', lotId);
    if (!lot) {
      missingLots++;
      continue;
    }
    const entryId = `${lotId}-m1`;
    const entry = ctx.get('stock_movements', entryId);
    const adjust = ctx.get('stock_movements', `${lotId}-m2`);
    const deducted = list.filter((e) => !e.restore).reduce((t, e) => t + e.qty, 0);
    const restored = list.filter((e) => e.restore).reduce((t, e) => t + e.qty, 0);
    // Entrada original = (entrada migrada) + baixas − estornos; o saldo final não muda.
    const original = round3((entry?.qty || 0) + deducted - restored);
    if (original < -0.0005) {
      inconsistent++;
      continue;
    }
    const base: Omit<StockMovement, 'id' | 'type' | 'qty' | 'date' | 'reason'> = {
      lotId,
      productId: lot.productId,
      productName: lot.productName,
      stage: lot.stage,
      unitCost: lot.unitCost,
      unitPrice: null,
      batchId: lot.batchId ?? null,
      saleId: null,
      saleItemId: null,
      saleNumber: null,
      customerName: null,
      processingOrderId: null,
      lossId: null,
      userId: null,
      userName: 'Migração',
      createdAt: lot.createdAt,
      updatedAt: lot.createdAt,
      legacyId: null,
    };
    if (original > 0.0005) {
      ctx.put('stock_movements', {
        ...base,
        ...(entry || {}),
        id: entryId,
        type: entry?.type || (lot.stage === 'RAW' ? 'SLAUGHTER_ENTRY' : 'ENTRY'),
        qty: original,
        date: entry?.date || lot.entryDate,
        reason: 'Entrada do sistema antigo (peso original, reconstruído pelo registro de baixas)',
      });
    }
    ctx.put('stock_lots', { ...lot, initialQty: Math.max(original, lot.balanceQty) });
    for (const e of list) {
      const sale = saleFor(ctx, e.orderId);
      const item = itemFor(sale, lot.productId, e.cut);
      if (sale && !e.restore) salesWithHistory.add(sale.id);
      ctx.put('stock_movements', {
        ...base,
        id: `${lotId}-h-${e.id}`,
        type: e.restore ? 'SALE_REVERSAL' : 'SALE',
        qty: e.restore ? e.qty : -e.qty,
        date: e.date,
        unitPrice: item?.unitPrice ?? null,
        saleId: sale?.id ?? null,
        saleItemId: item?.id ?? null,
        saleNumber: sale?.number ?? e.orderNumber,
        customerName: sale?.customerName ?? e.customerName,
        reason: [e.reason || (e.restore ? 'Estorno (sistema antigo)' : 'Baixa (sistema antigo)'), !sale && e.orderNumber ? `pedido ${e.orderNumber}` : null]
          .filter(Boolean)
          .join(' — '),
        userName: e.user || 'Sistema antigo',
        createdAt: `${e.date}T12:00:00.000Z`,
        updatedAt: `${e.date}T12:00:00.000Z`,
      });
      moves++;
    }
    // Item vendido com peso no antigo: o ajuste que zerava o saldo continua valendo.
    if (adjust) ctx.put('stock_movements', adjust);
  }

  if (moves)
    ctx.w.note(
      'lot.history',
      `Estoque: ${moves} baixa(s)/estorno(s) do sistema antigo viraram histórico dos lotes, ligados aos pedidos. Baixas anteriores ao registro de baixas ficam embutidas no saldo de entrada`,
    );
  else ctx.w.note('lot.history', 'Estoque: cada lote migrou com o saldo atual e um movimento de entrada (o sistema antigo não tem registro de baixas para reconstruir o histórico)');
  if (missingLots) ctx.w.note('lot.hist.missing', `${missingLots} peça(s) do registro de baixas não existem mais no estoque antigo — essas baixas ficaram de fora do histórico`);
  if (inconsistent) ctx.w.note('lot.hist.inconsistent', `${inconsistent} peça(s) com registro de baixas incoerente com o peso atual (peso editado à mão?) — migradas só com o saldo atual`);

  const withoutHistory = ctx.rows('sales').filter((s) => s.stockDeducted && s.status !== 'REJECTED' && s.status !== 'CANCELLED' && !salesWithHistory.has(s.id) && s.legacyId);
  if (withoutHistory.length)
    ctx.w.note(
      'sale.stock',
      `${withoutHistory.length} pedido(s) migrado(s) já baixados do estoque sem registro de qual peça saiu: se forem cancelados no sistema novo, o estoque não volta sozinho — faça um ajuste de estoque se precisar`,
    );
}
