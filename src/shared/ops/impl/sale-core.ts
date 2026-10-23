/**
 * Núcleo das vendas: totais, itens, criação e cancelamento dentro da transação
 * (reutilizados por sales.ts e pelo portal).
 */
import type { Tx } from '../../data/api';
import { money } from '../../domain/format';
import { SALE_STATUS } from '../../domain/labels';
import { buildPixPayload, pixTxidFor } from '../../domain/pix';
import type { AppSettings, Customer, HistoryEvent, Product, Sale, SaleItem, SaleStatus, SupplyItem } from '../../domain/types';
import type { Actor, SaleInput, SaleItemInput } from '../types';
import {
  actorCan,
  assert,
  audit,
  clean,
  getSettings,
  isISODate,
  isNonNeg,
  isStaff,
  mustGet,
  newId,
  nextSaleNumber,
  nowIso,
  opsToday,
  requirePerm,
  round2,
  round3,
} from './common';
import { recalcCustomerStatsTx } from './customers';
import { closeOpenEntries, derivePaymentStatus, saleEntries, saleHasReceivables, syncSalePaymentStatus, syncSaleReceivables } from './finance';
import { deductSaleStock, reverseSaleStock, type DeductResult } from './sale-stock';

// ============================================================================
// Helpers puros
// ============================================================================

export interface SaleTotals {
  itemsSubtotal: number;
  freightValue: number;
  totalValue: number;
  totalWeightKg: number;
  commissionValue: number;
}

/** Totais do pedido. baseFreight = frete informado no pedido (sem itens de frete). */
export function computeSaleTotals(items: SaleItem[], baseFreight: number, discount: number, commissionRate: number): SaleTotals {
  let itemsSubtotal = 0;
  let freightItems = 0;
  let weight = 0;
  for (const it of items) {
    if (it.kind === 'FREIGHT') freightItems += it.total || 0;
    else itemsSubtotal += it.total || 0;
    if (it.unit === 'KG' && (it.kind === 'PRODUCT' || it.kind === 'SUPPLY')) weight += it.qty || 0;
  }
  itemsSubtotal = round2(itemsSubtotal);
  const freightValue = round2((baseFreight || 0) + freightItems);
  return {
    itemsSubtotal,
    freightValue,
    totalValue: Math.max(0, round2(itemsSubtotal + freightValue - (discount || 0))),
    totalWeightKg: round3(weight),
    commissionValue: round2((itemsSubtotal * (commissionRate || 0)) / 100),
  };
}

/** Frete informado no pedido, sem os itens de frete. */
export function baseFreightOf(sale: Pick<Sale, 'freightValue' | 'items'>): number {
  const items = (sale.items || []).filter((i) => i.kind === 'FREIGHT').reduce((s, i) => s + (i.total || 0), 0);
  return Math.max(0, round2((sale.freightValue || 0) - items));
}

export function pixForSale(settings: AppSettings, sale: Pick<Sale, 'number'>, amount: number): string {
  return buildPixPayload({
    pixKey: settings.pixKey || undefined,
    merchantName: settings.pixMerchantName || settings.tradeName || settings.companyName || undefined,
    merchantCity: settings.pixMerchantCity || settings.city || undefined,
    amount: round2(amount),
    txId: pixTxidFor(sale.number),
  });
}

export const statusLabel = (s: SaleStatus) => SALE_STATUS[s]?.label || s;

export function historyEvent(actor: Actor, action: string, note?: string | null, data?: Record<string, unknown> | null): HistoryEvent {
  return { at: nowIso(), by: actor.name, action, note: note ?? null, data: data ?? null };
}

/** Campos gravados de uma venda (sem id/createdAt). */
export function saleFields(sale: Sale) {
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = sale;
  return rest;
}

export async function loadSale(tx: Tx, id: string): Promise<Sale> {
  return mustGet(tx, 'sales', id, 'Pedido não encontrado.');
}

// ============================================================================
// Itens
// ============================================================================

export function validateItemInputs(items: SaleItemInput[] | null | undefined, allowEmpty = false) {
  if (!allowEmpty) assert(items && items.length, 'Inclua pelo menos um item no pedido.');
  (items || []).forEach((it, i) => {
    const label = it.productName?.trim() || `Item ${i + 1}`;
    assert(['PRODUCT', 'SUPPLY', 'FREIGHT', 'SERVICE'].includes(it.kind), `${label}: tipo de item inválido.`);
    assert(it.productName?.trim() || it.productId || it.supplyItemId || it.kind === 'FREIGHT', `Item ${i + 1}: informe o produto.`);
    assert(typeof it.qtyOrdered === 'number' && Number.isFinite(it.qtyOrdered) && it.qtyOrdered > 0, `${label}: a quantidade deve ser maior que zero.`);
    if (it.qty !== undefined) assert(isNonNeg(it.qty), `${label}: quantidade separada inválida.`);
    assert(isNonNeg(it.unitPrice), `${label}: o preço não pode ser negativo.`);
  });
}

/** Monta os itens do pedido (preenche nomes/unidades a partir do cadastro). */
export async function buildItems(tx: Tx, saleId: string, inputs: SaleItemInput[], existing: SaleItem[], startPos: number): Promise<SaleItem[]> {
  const now = nowIso();
  const products = new Map<string, Product | null>();
  const supplies = new Map<string, SupplyItem | null>();
  const byId = new Map(existing.map((i) => [i.id, i]));
  const out: SaleItem[] = [];
  let pos = startPos;
  for (const it of inputs) {
    let name = it.productName?.trim() || '';
    let unit = it.unit;
    if (it.kind === 'PRODUCT' && it.productId) {
      if (!products.has(it.productId)) products.set(it.productId, await tx.get('products', it.productId));
      const p = products.get(it.productId);
      assert(p, `Produto não encontrado: ${name || it.productId}.`);
      name = name || p.name;
      unit = unit || p.unit;
    }
    if (it.kind === 'SUPPLY' && it.supplyItemId) {
      if (!supplies.has(it.supplyItemId)) supplies.set(it.supplyItemId, await tx.get('supply_items', it.supplyItemId));
      const s = supplies.get(it.supplyItemId);
      assert(s, `Material não encontrado: ${name || it.supplyItemId}.`);
      name = name || s.name;
      unit = unit || (s.unit === 'KG' ? 'KG' : 'UN');
    }
    if (it.kind === 'FREIGHT') name = name || 'Frete';
    const prev = it.id ? byId.get(it.id) : undefined;
    const qtyOrdered = round3(it.qtyOrdered);
    const qty = round3(it.qty ?? qtyOrdered);
    const unitPrice = round2(it.unitPrice);
    out.push({
      id: prev?.id || it.id || newId(),
      saleId,
      position: pos++,
      createdAt: prev?.createdAt || now,
      updatedAt: now,
      kind: it.kind,
      productId: it.productId ?? null,
      supplyItemId: it.supplyItemId ?? null,
      productName: name,
      unit: unit || 'KG',
      qtyOrdered,
      qty,
      unitPrice,
      total: round2(qty * unitPrice),
      lotId: it.lotId ?? null,
      lotCode: it.lotCode ?? null,
      packages: it.packages ?? null,
      costTotal: null,
      deductedQty: null,
      notes: clean(it.notes),
    });
  }
  return out;
}

// ============================================================================
// Criação / cancelamento (reutilizados pelo portal)
// ============================================================================

interface Prepared {
  customer: Customer;
  channel: Sale['channel'];
  isIntercompany: boolean;
  sellerId: string | null;
  sellerName: string | null;
  commissionRate: number;
}

export async function prepareSale(tx: Tx, actor: Actor, settings: AppSettings, input: SaleInput): Promise<Prepared> {
  assert(input && input.customerId, 'Selecione o cliente.');
  assert(isISODate(input.date), 'Informe a data do pedido.');
  assert(input.deliveryMode === 'DELIVERY' || input.deliveryMode === 'PICKUP', 'Informe se é entrega ou retirada.');
  assert(input.paymentMethod, 'Informe a forma de pagamento.');
  if (input.deliveryDate) assert(isISODate(input.deliveryDate), 'Data de entrega inválida.');
  if (input.firstDueDate) assert(isISODate(input.firstDueDate), 'Data do primeiro vencimento inválida.');
  assert(input.freightValue === undefined || isNonNeg(input.freightValue), 'O frete não pode ser negativo.');
  assert(input.discountValue === undefined || isNonNeg(input.discountValue), 'O desconto não pode ser negativo.');
  if (input.commissionRate != null) assert(isNonNeg(input.commissionRate) && input.commissionRate <= 100, 'Comissão inválida.');
  validateItemInputs(input.items);

  const customer = await mustGet(tx, 'customers', input.customerId, 'Cliente não encontrado.');
  assert(customer.status !== 'BLOCKED', `O cliente ${customer.name} está bloqueado — regularize o cadastro antes de vender.`);

  let channel = input.channel || 'INTERNAL';
  if (actor.role === 'EXTERNAL_SELLER') channel = 'EXTERNAL_SELLER';
  if (actor.role === 'CUSTOMER') channel = 'PORTAL';
  const isIntercompany = !!customer.isIntercompany || !!input.isIntercompany || channel === 'INTERCOMPANY';
  if (isIntercompany && channel === 'INTERNAL') channel = 'INTERCOMPANY';

  let sellerId = input.sellerId ?? null;
  if (actor.role === 'EXTERNAL_SELLER') sellerId = actor.id;
  else if (!sellerId && actor.role === 'SELLER') sellerId = actor.id;
  else if (!sellerId) sellerId = customer.sellerId ?? null;
  let sellerName: string | null = null;
  let profileRate: number | null = null;
  if (sellerId) {
    if (actor.role === 'CUSTOMER') {
      // O cliente do portal não lê perfis internos: usa o nome gravado no cliente.
      sellerName = sellerId === customer.sellerId ? customer.sellerName ?? null : null;
    } else {
      const p = await tx.get('profiles', sellerId);
      sellerName = p?.name ?? (sellerId === customer.sellerId ? customer.sellerName ?? null : null);
      profileRate = p?.commissionRate ?? null;
    }
  }
  const commissionRate = input.commissionRate ?? (sellerId ? profileRate ?? settings.defaultCommissionRate ?? 0 : 0);
  return { customer, channel, isIntercompany, sellerId, sellerName, commissionRate };
}

/** Cria o pedido dentro da transação (sem checar permissão — quem chama checa). */
export async function createSaleTx(tx: Tx, actor: Actor, input: SaleInput): Promise<Sale> {
  const settings = await getSettings(tx);
  const prep = await prepareSale(tx, actor, settings, input);
  const id = newId();
  const items = await buildItems(tx, id, input.items, [], 1);
  const baseFreight = round2(input.freightValue || 0);
  const discount = round2(input.discountValue || 0);
  const totals = computeSaleTotals(items, baseFreight, discount, prep.commissionRate);
  assert(discount <= totals.itemsSubtotal + totals.freightValue + 0.005, 'O desconto é maior que o valor do pedido.');

  const canApprove = actorCan(actor, 'sales.approve');
  let status: SaleStatus;
  if (actor.role === 'CUSTOMER') status = 'PENDING_APPROVAL';
  else if (actor.role === 'EXTERNAL_SELLER') status = input.status === 'DRAFT' ? 'DRAFT' : 'PENDING_APPROVAL';
  else if (input.status === 'DRAFT') status = 'DRAFT';
  else if (input.status === 'PENDING_APPROVAL') status = 'PENDING_APPROVAL';
  else status = canApprove ? 'APPROVED' : 'PENDING_APPROVAL';

  const deductNow = !!input.deductNow && actor.role !== 'EXTERNAL_SELLER' && actor.role !== 'CUSTOMER';
  if (deductNow) {
    assert(status === 'APPROVED', 'Venda direta com baixa imediata precisa ser aprovada — seu perfil não pode aprovar pedidos.');
    requirePerm(actor, 'picking.perform');
  }

  const { number, sequence } = await nextSaleNumber(tx, input.date);
  const now = nowIso();
  const approved = status === 'APPROVED';
  const sale: Sale = {
    id,
    createdAt: now,
    updatedAt: now,
    number,
    sequence,
    channel: prep.channel,
    status,
    paymentStatus: 'PENDING',
    customerId: prep.customer.id,
    customerName: prep.customer.name,
    customerDocument: prep.customer.document || null,
    customerCategory: prep.customer.category ?? null,
    sellerId: prep.sellerId,
    sellerName: prep.sellerName,
    commissionRate: prep.commissionRate,
    commissionValue: totals.commissionValue,
    portalAccountId: input.portalAccountId ?? (actor.role === 'CUSTOMER' ? actor.id : null),
    priceTableId: input.priceTableId ?? prep.customer.priceTableId ?? null,
    date: input.date,
    deliveryDate: input.deliveryDate ?? null,
    deliveryMode: input.deliveryMode,
    deliveryWindow: input.deliveryWindow ?? null,
    shippingZipCode: clean(input.shippingZipCode) ?? prep.customer.zipCode ?? null,
    shippingAddress: clean(input.shippingAddress),
    freightZoneId: input.freightZoneId ?? null,
    freightValue: totals.freightValue,
    freightPending: input.freightPending ?? false,
    paymentMethod: input.paymentMethod,
    billingType: input.billingType || 'NONE',
    paymentTerms: clean(input.paymentTerms),
    installmentsCount: Math.max(1, Math.floor(input.installmentsCount || 1)),
    itemsSubtotal: totals.itemsSubtotal,
    discountValue: discount,
    totalValue: totals.totalValue,
    totalWeightKg: totals.totalWeightKg,
    estimatedTotal: totals.totalValue,
    pixPayload: null,
    pixTxid: null,
    invoiceNumber: clean(input.invoiceNumber),
    invoiceDate: null,
    boletoNumber: clean(input.boletoNumber),
    attachments: [],
    paymentReceipt: null,
    stockDeducted: false,
    stockShortKg: null,
    weighing: null,
    isIntercompany: prep.isIntercompany,
    company: input.company ?? null,
    approvedById: approved ? actor.id : null,
    approvedByName: approved ? actor.name : null,
    approvedAt: approved ? now : null,
    pickedByName: null,
    pickedAt: null,
    dispatchedAt: null,
    deliveredAt: null,
    cancelledAt: null,
    cancelReason: null,
    customerNotes: clean(input.customerNotes),
    notes: clean(input.notes),
    firstDueDate: input.firstDueDate ?? null,
    history: [historyEvent(actor, 'CREATE', null, { status, firstDueDate: input.firstDueDate ?? null })],
    createdById: actor.id,
    createdByName: actor.name,
    items,
  };
  if (sale.paymentTerms) {
    const n = sale.paymentTerms.split(/[\/,;\s]+/).filter((x) => /^\d+$/.test(x)).length;
    if (n) sale.installmentsCount = n;
  }

  let short: DeductResult = { shortQty: 0, shortItems: [] };
  if (deductNow) {
    short = await deductSaleStock(tx, actor, sale, sale.date);
    sale.stockDeducted = true;
    sale.stockShortKg = short.shortQty || null;
    sale.status = 'READY';
    sale.pickedAt = now;
    sale.pickedByName = actor.name;
    sale.history.push(historyEvent(actor, 'PICKING_DONE', 'Venda direta com baixa imediata', { shortQty: short.shortQty }));
  }
  if (sale.channel === 'PORTAL') {
    sale.pixPayload = pixForSale(settings, sale, sale.totalValue);
    sale.pixTxid = pixTxidFor(sale.number);
  }
  sale.paymentStatus = derivePaymentStatus(sale, []);
  tx.insert('sales', sale);
  if (saleHasReceivables(sale)) {
    await syncSaleReceivables(tx, sale);
    await syncSalePaymentStatus(tx, id);
  }
  if (sale.status !== 'DRAFT' && sale.status !== 'PENDING_APPROVAL' && isStaff(actor)) await recalcCustomerStatsTx(tx, sale.customerId);
  audit(tx, actor, 'CREATE', 'sales', id, `Pedido ${number} — ${sale.customerName} — ${money(sale.totalValue)} (${statusLabel(sale.status)})`, {
    channel: sale.channel,
    shortQty: short.shortQty || undefined,
  });
  return (await tx.get('sales', id)) as Sale;
}

/** Cancela dentro da transação: estorna estoque, encerra parcelas. */
export async function cancelSaleTx(tx: Tx, actor: Actor, sale: Sale, reason: string): Promise<void> {
  assert(sale.status !== 'CANCELLED', 'Este pedido já está cancelado.');
  const today = opsToday();
  let returned = 0;
  if (sale.stockDeducted) returned = await reverseSaleStock(tx, actor, sale, today, `Cancelamento: ${reason}`);
  const entries = (await saleEntries(tx, sale.id)).filter((e) => e.status !== 'CANCELLED');
  const received = closeOpenEntries(tx, entries, `Pedido ${sale.number} cancelado`);
  const now = nowIso();
  sale.status = 'CANCELLED';
  sale.cancelledAt = now;
  sale.cancelReason = reason;
  sale.stockDeducted = false;
  sale.history = [
    ...(sale.history || []),
    historyEvent(actor, 'CANCEL', reason, { returnedQty: returned, received }),
    ...(received > 0.005
      ? [historyEvent(actor, 'NOTE', `Há ${money(received)} já recebidos neste pedido — verifique a devolução ou crédito ao cliente.`)]
      : []),
  ];
  sale.paymentStatus = derivePaymentStatus(sale, await saleEntries(tx, sale.id));
  tx.update('sales', sale.id, saleFields(sale));
}

