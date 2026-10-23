/**
 * Migração: vendas (sales + portal_orders), contas a receber, estatísticas de
 * clientes, vendas excluídas, movimentos de materiais e contadores.
 */
import { rankCustomer } from '../domain/ranking';
import type {
  AppSettings,
  Attachment,
  BillingType,
  HistoryEvent,
  PaymentMethod,
  Sale,
  SaleItem,
  SalePaymentStatus,
  SaleStatus,
  SupplyMovement,
  WeighingOutcome,
} from '../domain/types';
import type { Ctx } from './context';
import { addressOf, stamps, supplyFor } from './map-base';
import { entriesFrom, readInstallments, type InstSrc, type LegacyTx } from './map-finance';
import {
  attachmentFrom,
  bool,
  day,
  digits,
  docs,
  firstStr,
  isoDateTime,
  itemKindFromName,
  n0,
  num,
  obj,
  payMethod,
  round2,
  round3,
  str,
  upper,
  type Doc,
} from './legacy-utils';

const NO_RECEIVABLE_METHODS: PaymentMethod[] = ['BONUS', 'SAMPLE'];
const NO_RECEIVABLE_STATUS: SaleStatus[] = ['DRAFT', 'PENDING_APPROVAL', 'CANCELLED', 'REJECTED'];
const NOT_COUNTED: SaleStatus[] = ['DRAFT', 'PENDING_APPROVAL', 'CANCELLED', 'REJECTED'];

function billingOf(saleType: unknown, method: unknown): BillingType {
  const u = upper(saleType) || upper(method);
  if (u === 'COM_NF_BOLETO') return 'NF_BOLETO';
  if (u === 'APENAS_BOLETO') return 'BOLETO_ONLY';
  if (u === 'APENAS_NF' || u === 'COM_NF') return 'NF_ONLY';
  return 'NONE';
}

/** Situação de pagamento a partir das parcelas (mesma regra das operações). */
function paymentStatusOf(status: SaleStatus, method: PaymentMethod, entries: { status: string; paidAmount: number }[], receiptSent = false): SalePaymentStatus {
  const cancelled = status === 'CANCELLED' || status === 'REJECTED';
  if (NO_RECEIVABLE_METHODS.includes(method)) return cancelled ? 'CANCELLED' : 'PAID';
  const active = entries.filter((e) => e.status !== 'CANCELLED');
  const paid = round2(active.reduce((s, e) => s + (e.paidAmount || 0), 0));
  if (cancelled) return paid <= 0.005 ? 'CANCELLED' : active.every((e) => e.status === 'PAID') ? 'PAID' : 'PARTIAL';
  if (!active.length) return receiptSent ? 'RECEIPT_SENT' : 'PENDING';
  if (active.every((e) => e.status === 'PAID')) return 'PAID';
  if (paid > 0.005) return 'PARTIAL';
  return receiptSent ? 'RECEIPT_SENT' : 'PENDING';
}

// ============================================================================
// Numeração (AAAA0001) sem colisão
// ============================================================================

interface NumberState {
  used: Set<string>;
  max: Map<string, number>;
}

function claimNumber(st: NumberState, d: Doc, date: string, ctx: Ctx): { number: string; sequence: number } | null {
  const raw = str(d.orderNumber);
  const m = raw ? /^(\d{4})(\d{4,})$/.exec(raw) : null;
  const legacySeq = num(d.orderSequence);
  if (!m && (raw || !legacySeq)) return null;
  const year = m ? m[1] : date.slice(0, 4);
  const seq = m ? Number(m[2]) : Math.floor(legacySeq!);
  const number = `${year}${String(seq).padStart(4, '0')}`;
  if (st.used.has(number)) {
    ctx.w.add('sale.dupnum', 'Pedidos com número repetido no sistema antigo — o mais antigo manteve o número, os demais foram renumerados', number);
    return null;
  }
  st.used.add(number);
  st.max.set(year, Math.max(st.max.get(year) || 0, seq));
  return { number, sequence: seq };
}

function nextNumber(st: NumberState, date: string): { number: string; sequence: number } {
  const year = date.slice(0, 4);
  let seq = (st.max.get(year) || 0) + 1;
  while (st.used.has(`${year}${String(seq).padStart(4, '0')}`)) seq++;
  st.max.set(year, seq);
  const number = `${year}${String(seq).padStart(4, '0')}`;
  st.used.add(number);
  return { number, sequence: seq };
}

// ============================================================================
// Vendas
// ============================================================================

function legacyHistory(ctx: Ctx, d: Doc, fallbackAt: string): HistoryEvent[] {
  const out: HistoryEvent[] = [];
  for (const h of docs(d.history)) {
    const act = upper(h.action);
    const value = num(h.value);
    const inst = num(h.installmentNumber);
    out.push({
      at: isoDateTime(h.timestamp) || fallbackAt,
      by: str(h.userEmail),
      action: act === 'PAYMENT' ? 'PAYMENT' : act === 'REFUND' ? 'REVERSAL' : act === 'CREATE' ? 'INSTALLMENTS' : act || 'NOTE',
      note: `${act === 'PAYMENT' ? 'Baixa' : act === 'REFUND' ? 'Estorno' : 'Parcelas'}${inst ? ` da parcela ${inst}` : ''}${value !== null ? ` — R$ ${value.toFixed(2).replace('.', ',')}` : ''} (sistema antigo)`,
      data: { legacy: true, installmentId: str(h.installmentId) },
    });
  }
  for (const h of docs(d.statusHistory)) {
    out.push({ at: isoDateTime(h.at ?? h.updatedAt) || fallbackAt, by: str(h.by), action: `STATUS_${upper(h.status)}`, note: str(h.note), data: { legacy: true } });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

function migrationEvent(ctx: Ctx, note: string): HistoryEvent {
  return { at: ctx.now, by: 'Migração', action: 'IMPORT', note, data: null };
}

const LEGACY_SALE_STATUS: Record<string, SaleStatus> = { REJECTED: 'REJECTED', DRAFT: 'DRAFT', PENDING: 'PENDING_APPROVAL' };

export function mapSales(ctx: Ctx, counters: Map<string, number>, settings: AppSettings, tx: Map<string, LegacyTx>) {
  const st: NumberState = { used: new Set(), max: new Map() };
  for (const c of ctx.col('order_counters')) {
    const y = str(c.year) || (/(\d{4})/.exec(String(c.id)) || [])[1];
    const v = num(c.lastSequence);
    if (y && v) st.max.set(y, Math.max(st.max.get(y) || 0, v));
  }
  const counterFloor = new Map(st.max);
  st.max = new Map();
  const sortKey = (d: Doc, date: string) => `${date}|${isoDateTime(d.createdAt) || ''}|${d.id}`;
  const legacy = ctx
    .col('sales')
    .map((d) => ({ d, date: day(d.date) || day(d.createdAt) || day(ctx.now)! }))
    .sort((a, b) => sortKey(a.d, a.date).localeCompare(sortKey(b.d, b.date)));
  const portal = ctx
    .col('portal_orders')
    .map((d) => ({ d, date: day(d.createdAt) || day(d.deliveryDate) || day(ctx.now)! }))
    .sort((a, b) => sortKey(a.d, a.date).localeCompare(sortKey(b.d, b.date)));
  // 1) números válidos do sistema antigo; 2) os demais seguem a sequência do ano (após o contador antigo).
  const numbers = new Map<Doc, { number: string; sequence: number }>();
  for (const s of legacy) {
    const n = claimNumber(st, s.d, s.date, ctx);
    if (n) numbers.set(s.d, n);
  }
  for (const [y, v] of counterFloor) st.max.set(y, Math.max(st.max.get(y) || 0, v));
  for (const s of [...legacy, ...portal]) if (!numbers.has(s.d)) numbers.set(s.d, nextNumber(st, s.date));

  for (const s of legacy) mapLegacySale(ctx, s.d, s.date, numbers.get(s.d)!, tx);
  const saleIds = new Set(legacy.map((s) => String(s.d.id)));
  for (const s of portal) mapPortalOrder(ctx, s.d, s.date, numbers.get(s.d)!, saleIds);

  // Contador sale-AAAA = max(lastSequence antigo, maior sequência migrada).
  for (const [y, v] of st.max) counters.set(`sale-${y}`, Math.max(counters.get(`sale-${y}`) || 0, v));

  // Estatísticas dos clientes (ranking recalculado com as vendas migradas).
  const bySale = new Map<string, Sale[]>();
  for (const s of ctx.rows('sales')) {
    if (NOT_COUNTED.includes(s.status)) continue;
    const l = bySale.get(s.customerId) || [];
    l.push(s);
    bySale.set(s.customerId, l);
  }
  for (const c of ctx.customers.values()) {
    const list = bySale.get(c.id) || [];
    const total = round2(list.reduce((t, s) => t + (s.totalValue || 0), 0));
    const last = list.reduce<string | null>((m, s) => (!m || s.date > m ? s.date : m), null);
    const r = rankCustomer(total, { silverFrom: settings.rankingSilverFrom, goldFrom: settings.rankingGoldFrom });
    Object.assign(c, { totalPurchases: total, ordersCount: list.length, lastPurchaseAt: last ? `${last}T12:00:00.000Z` : null, ranking: r.ranking, stars: r.stars });
    ctx.put('customers', c);
  }
}

function saleItems(ctx: Ctx, saleId: string, d: Doc, createdAt: string, stockDeducted: boolean): SaleItem[] {
  return docs(d.items).map((it, i) => {
    const name = firstStr(it.cutType, it.name) || 'Item';
    const kind = itemKindFromName(name, it);
    const un = upper(it.unitType) === 'UN' || kind !== 'PRODUCT';
    const qty = round3(un ? n0(it.quantity) || (kind === 'PRODUCT' ? n0(it.weightKg) : 1) : n0(it.weightKg ?? it.quantity));
    const unitPrice = round2(un ? n0(it.unitPrice ?? it.pricePerKg) : n0(it.pricePerKg ?? it.unitPrice));
    const total = round2(num(it.total) ?? qty * unitPrice);
    const product = kind === 'PRODUCT' ? ctx.products.ensure(name, { unit: un ? 'UN' : 'KG' }) : null;
    // v11: um corte pode sair de vários lotes (subLots) — guarda todos no código do lote.
    const subs = docs(it.subLots).filter((s) => n0(s.weightKg) > 0 || str(s.batchId) || str(s.manualLot));
    const lotId = str(it.inventoryItemId) || (subs.length === 1 ? str(subs[0].inventoryItemId) : null);
    const lot = lotId ? ctx.get('stock_lots', lotId) : undefined;
    const multiLot =
      subs.length > 1
        ? subs
            .map((s) => `${firstStr(s.manualLot, s.batchId) || 'lote'} (${round3(n0(s.weightKg)).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg)`)
            .join(' + ')
        : null;
    return {
      id: `${saleId}-i${i + 1}`,
      createdAt,
      updatedAt: createdAt,
      legacyId: null,
      saleId,
      position: i,
      kind,
      productId: product?.id ?? null,
      supplyItemId: kind === 'SUPPLY' ? supplyFor(ctx, name, bool(it.isCustomBag)) : null,
      productName: product?.name ?? name,
      unit: un ? 'UN' : 'KG',
      qtyOrdered: qty,
      qty,
      unitPrice,
      total,
      lotId: multiLot ? null : lot?.id ?? null,
      lotCode: multiLot ?? lot?.lotCode ?? firstStr(it.manualLot, subs[0]?.manualLot, subs[0]?.batchId),
      packages: num(it.packetCount),
      costTotal: null,
      deductedQty: stockDeducted && kind === 'PRODUCT' ? qty : null,
      notes: str(it.notes),
    };
  });
}

function totalsOf(items: SaleItem[]) {
  let sub = 0;
  let freight = 0;
  let weight = 0;
  for (const it of items) {
    if (it.kind === 'FREIGHT') freight += it.total;
    else sub += it.total;
    if (it.unit === 'KG' && it.kind === 'PRODUCT') weight += it.qty;
  }
  return { itemsSubtotal: round2(sub), freightValue: round2(freight), totalWeightKg: round3(weight) };
}

function mapLegacySale(ctx: Ctx, d: Doc, date: string, num_: { number: string; sequence: number }, tx: Map<string, LegacyTx>) {
  const id = String(d.id);
  const createdAt = isoDateTime(d.createdAt) || isoDateTime(d.date) || ctx.now;
  const stockDeducted = bool(d.stockDeducted);
  const items = saleItems(ctx, id, d, createdAt, stockDeducted);
  const t = totalsOf(items);
  // Frete sem linha de frete: valor informado no pedido (só se entrou no total).
  let freightValue = t.freightValue;
  const oldTotal = num(d.totalValue);
  const charged = d.freightCharged !== false && d.chargeFreight !== false;
  if (!freightValue && n0(d.freightValue) > 0 && charged && oldTotal !== null && oldTotal >= t.itemsSubtotal + n0(d.freightValue) - 0.05)
    freightValue = round2(n0(d.freightValue));
  const grossTotal = round2(oldTotal ?? t.itemsSubtotal + freightValue);
  if (oldTotal === null) ctx.w.add('sale.nototal', 'Pedidos sem valor total (calculado pelos itens)', num_.number);
  else if (Math.abs(t.itemsSubtotal + freightValue - oldTotal) > 0.05 && items.length)
    ctx.w.add('sale.total', 'Pedidos cujo total gravado difere da soma dos itens (mantido o total gravado)', num_.number);

  const rawMethod = d.paymentMethod ?? d.saleType;
  let method = payMethod(rawMethod) || payMethod(d.saleType);
  if (!method) {
    method = 'PIX';
    ctx.w.add('sale.method', 'Pedidos sem forma de pagamento reconhecida (considerado Pix)', `${num_.number}${str(rawMethod) ? `=${str(rawMethod)}` : ''}`);
  }
  const pct = n0(d.pixDiscountPercent);
  const pixLike = ['PIX', 'SEDE_PIX_10', 'SEDE_CARD_5'].includes(upper(d.paymentMethod));
  const discountValue = pct > 0 && pixLike ? round2((grossTotal * pct) / 100) : 0;
  const totalValue = round2(grossTotal - discountValue);

  const ap = upper(d.approvalStatus);
  const delivered = ap === 'APPROVED' && (!!str(d.dispatchedAt) || stockDeducted);
  const status: SaleStatus = LEGACY_SALE_STATUS[ap] || (delivered ? 'DELIVERED' : 'APPROVED');
  if (!ap) ctx.w.add('sale.noap', 'Pedidos sem situação de aprovação (considerados Aprovados)', num_.number);

  const custId = str(d.customerId) || `sem-cliente-${id}`;
  const customer = ctx.customers.get(custId) || ctx.ensureCustomer(custId, str(d.customerName), `pedido ${num_.number}`);
  const external = !!str(d.externalSellerId);
  const extEmail = (str(d.externalSellerId) || '').toLowerCase();
  const sellerUid = external ? ctx.extSellerUid.get(extEmail) || null : str(d.sellerId) || str(d.createdById);

  // Parcelas: installments (fonte da verdade dos pagamentos); boletoInstallments completam nº/código do boleto.
  let insts = readInstallments(d.installments);
  const boletos = readInstallments(d.boletoInstallments);
  if (!insts.length && boletos.length) insts = boletos;
  else for (const it of insts) {
    const b = boletos.find((x) => x.number === it.number);
    if (b) Object.assign(it, { boletoNumber: it.boletoNumber || b.boletoNumber, barcode: it.barcode || b.barcode });
  }
  const legacyPaid = upper(d.paymentStatus) === 'PAID';
  if (!insts.length) {
    insts = [{ id: null, number: 1, dueDate: day(d.boletoDueDate) || date, value: totalValue, paid: legacyPaid, paymentDate: day(d.paymentDate), paidBy: null, paidAt: null }];
  } else if (legacyPaid && !insts.some((i) => i.paid)) {
    ctx.w.add('sale.paidinst', 'Pedidos marcados como pagos com parcelas em aberto (parcelas consideradas pagas)', num_.number);
    insts = insts.map((i) => ({ ...i, paid: true, paymentDate: i.paymentDate || day(d.paymentDate) }));
  }
  const instSum = round2(insts.reduce((s, i) => s + i.value, 0));
  if (Math.abs(instSum - totalValue) > 0.05) ctx.w.add('sale.instsum', 'Pedidos cujas parcelas não somam o total (mantidas as parcelas)', num_.number);

  insts = insts.filter((i) => i.value > 0.005);
  const anyPaid = insts.some((i) => i.paid);
  const receivable = !NO_RECEIVABLE_METHODS.includes(method) && !NO_RECEIVABLE_STATUS.includes(status);
  const cancelled = status === 'REJECTED';
  let entries: { status: string; paidAmount: number }[] = [];
  const attachments: Attachment[] = [];
  const inv = attachmentFrom({ url: d.invoiceFileUrl, storagePath: d.invoiceStoragePath, name: d.invoiceFileName, type: d.invoiceFileType, size: d.invoiceFileSize, uploadedAt: d.invoiceAttachedAt }, `${id}-nf`, createdAt, 'NF', ctx.w, num_.number);
  const bol = attachmentFrom({ url: d.boletoFileUrl, storagePath: d.boletoStoragePath, name: d.boletoFileName, type: d.boletoFileType, size: d.boletoFileSize, uploadedAt: d.boletoAttachedAt }, `${id}-boleto`, createdAt, 'BOLETO', ctx.w, num_.number);
  if (inv) attachments.push(inv);
  if (bol) attachments.push(bol);
  // PDFs guardados em pedaços no banco antigo (sales_attachments/{id} e {id}__boleto): copiados na etapa de arquivos.
  for (const [kind, key, has, metaName] of [
    ['NF', id, bool(d.hasInvoiceFile) && !inv, d.invoiceFileName],
    ['BOLETO', `${id}__boleto`, bool(d.hasBoletoFile) && !bol, d.boletoFileName],
  ] as const) {
    const meta = ctx.col('sales_attachments').find((a) => String(a.id) === key);
    if (!meta && !has) continue;
    ctx.files.push({
      key,
      saleId: id,
      saleNumber: num_.number,
      kind,
      name: firstStr(meta?.fileName, metaName) || `${kind === 'NF' ? 'nota-fiscal' : 'boleto'}-${num_.number}.pdf`,
      mimeType: str(meta?.fileType) || 'application/pdf',
      size: num(meta?.fileSize),
      chunks: num(meta?.chunkCount),
    });
  }

  const sale: Sale = {
    id,
    createdAt,
    updatedAt: isoDateTime(d.updatedAt) || createdAt,
    legacyId: id,
    number: num_.number,
    sequence: num_.sequence,
    channel: external ? 'EXTERNAL_SELLER' : bool(d.isIntercompany) ? 'INTERCOMPANY' : 'INTERNAL',
    status,
    paymentStatus: 'PENDING',
    customerId: customer.id,
    customerName: customer.name,
    customerDocument: customer.document || null,
    customerCategory: customer.category,
    sellerId: ctx.uid(sellerUid),
    sellerName: external ? str(d.externalSellerName) : firstStr(d.sellerName, d.createdByName),
    commissionRate: n0(d.externalSellerCommissionRate ?? d.commissionRate),
    commissionValue: round2(n0(d.commissionValue)),
    portalAccountId: null,
    priceTableId: ctx.get('price_tables', str(d.selectedPriceTableId)) ? str(d.selectedPriceTableId) : null,
    date,
    deliveryDate: day(d.deliveryDate),
    deliveryMode:
      upper(d.deliveryMode) === 'PICKUP' || (!str(d.deliveryMode) && upper(d.shippingLocality).includes('RETIRADA')) ? 'PICKUP' : 'DELIVERY',
    deliveryWindow: null,
    shippingZipCode: digits(d.shippingCep) || null,
    shippingAddress: str(d.shippingAddress),
    freightZoneId: ctx.get('freight_zones', str(d.freightZoneId)) ? str(d.freightZoneId) : null,
    freightValue,
    freightPending: false,
    paymentMethod: method,
    billingType: billingOf(d.saleType, d.paymentMethod),
    paymentTerms: null,
    installmentsCount: Math.max(1, insts.length),
    firstDueDate: insts[0]?.dueDate || null,
    itemsSubtotal: t.itemsSubtotal,
    discountValue,
    totalValue,
    totalWeightKg: t.totalWeightKg,
    estimatedTotal: null,
    pixPayload: str(d.pixPayload),
    pixTxid: null,
    invoiceNumber: str(d.invoiceNumber),
    invoiceDate: day(d.invoiceDate),
    boletoNumber: str(d.boletoNumber),
    attachments,
    paymentReceipt: null,
    stockDeducted,
    stockShortKg: null,
    weighing: null,
    isIntercompany: bool(d.isIntercompany),
    company: null,
    approvedById: null,
    approvedByName: null,
    approvedAt: null,
    pickedByName: null,
    pickedAt: null,
    dispatchedAt: isoDateTime(d.dispatchedAt),
    deliveredAt: status === 'DELIVERED' ? isoDateTime(d.dispatchedAt) || isoDateTime(d.stockReconciledAt) : null,
    cancelledAt: null,
    cancelReason: null,
    customerNotes: null,
    notes:
      [str(d.notes), str(d.nfNotes) ? `Obs. NF: ${str(d.nfNotes)}` : null, str(d.nfTeknisa) ? `NF Teknisa: ${str(d.nfTeknisa)}` : null]
        .filter(Boolean)
        .join('\n') || null,
    history: [...legacyHistory(ctx, d, createdAt), migrationEvent(ctx, `Pedido importado do sistema antigo (id ${id}).`)],
    createdById: ctx.uid(d.createdById),
    createdByName: str(d.createdByName),
    items,
  };
  if (insts.length && !NO_RECEIVABLE_METHODS.includes(method) && (receivable || anyPaid)) {
    if (!receivable) ctx.w.add('sale.paidpending', 'Pedidos não aprovados/recusados com parcelas já pagas (contas migradas mesmo assim)', num_.number);
    entries = entriesFrom(ctx, {
      prefix: `${id}-p`,
      legacyKey: id,
      base: {
        direction: 'IN',
        category: 'SALE',
        description: `Pedido ${sale.number} — ${sale.customerName}`,
        partyType: 'CUSTOMER',
        partyId: sale.customerId,
        partyName: sale.customerName,
        saleId: id,
        saleNumber: sale.number,
        sellerId: sale.sellerId,
      },
      insts,
      issueDate: date,
      createdAt,
      method,
      cancelUnpaid: cancelled || !receivable,
      tx,
      documentNumber: sale.boletoNumber || sale.invoiceNumber,
      barcode: str(d.boletoBarcode),
    });
  }
  sale.paymentStatus = paymentStatusOf(status, method, entries);
  ctx.put('sales', sale);
}

// ============================================================================
// Pedidos do portal
// ============================================================================

const PORTAL_STATUS: Record<string, SaleStatus> = {
  SUBMITTED: 'PENDING_APPROVAL',
  QUOTING_FREIGHT: 'PENDING_APPROVAL',
  WEIGHING: 'PICKING',
  AWAITING_APPROVAL: 'AWAITING_CUSTOMER',
  AWAITING_PAYMENT: 'READY',
  RECEIPT_SENT: 'READY',
  PAID: 'READY',
  SEPARATION: 'READY',
  OUT_FOR_DELIVERY: 'DISPATCHED',
  READY_FOR_PICKUP: 'READY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED',
};
const PORTAL_PAID = ['PAID', 'SEPARATION', 'OUT_FOR_DELIVERY', 'READY_FOR_PICKUP', 'DELIVERED'];

function mapPortalOrder(ctx: Ctx, d: Doc, date: string, num_: { number: string; sequence: number }, saleIds: Set<string>) {
  let id = String(d.id);
  if (saleIds.has(id)) id = `po-${id}`;
  const createdAt = isoDateTime(d.createdAt) || ctx.now;
  const uid = str(d.portalUid);
  const account = uid ? ctx.legacyPortalAccounts.get(uid) : undefined;
  const legacyStatus = upper(d.status);
  const status = PORTAL_STATUS[legacyStatus] || 'PENDING_APPROVAL';
  if (!PORTAL_STATUS[legacyStatus]) ctx.w.add('portal.status', 'Pedidos do portal com situação desconhecida (considerados "Pedido recebido")', num_.number);
  let custId = str(d.customerId) || account?.customerId || null;
  if (custId && !ctx.customers.has(custId)) custId = null;
  const customer = custId
    ? ctx.customers.get(custId)!
    : ctx.ensureCustomer(`pc-${uid || id}`, account?.companyName || account?.name || 'Cliente do portal', `portal ${num_.number}`, {
        document: account?.document || '',
        personType: account?.personType || 'F',
        category: account?.personType === 'J' ? 'EXTERNO_CNPJ' : 'EXTERNO_PF',
        email: account?.email ?? null,
        phone: account?.phone ?? null,
        zipCode: account?.zipCode ?? null,
        street: account?.street ?? null,
        number: account?.number ?? null,
        district: account?.district ?? null,
        city: account?.city ?? null,
        state: account?.state ?? null,
      });
  const catalog = (cid: unknown) => ctx.get('catalog_items', str(cid));
  const items: SaleItem[] = docs(d.items).map((it, i) => {
    const cat = catalog(it.catalogItemId);
    const name = str(it.name) || cat?.name || 'Item';
    const product = cat?.productId ? ctx.get('products', cat.productId) : ctx.products.resolve(name);
    const ordered = round3(n0(it.quantityOrdered));
    const qty = round3(num(it.quantityWeighed) ?? ordered);
    const unitPrice = round2(n0(it.unitPrice));
    return {
      id: `${id}-i${i + 1}`,
      createdAt,
      updatedAt: createdAt,
      legacyId: str(it.catalogItemId),
      saleId: id,
      position: i,
      kind: 'PRODUCT',
      productId: product?.id ?? null,
      supplyItemId: null,
      productName: product?.name ?? name,
      unit: cat?.unit || product?.unit || 'KG',
      qtyOrdered: ordered,
      qty,
      unitPrice,
      total: round2(num(it.totalFinal) ?? num(it.totalEstimated) ?? qty * unitPrice),
      lotId: null,
      lotCode: null,
      packages: null,
      costTotal: null,
      deductedQty: null,
      notes: null,
    };
  });
  const t = totalsOf(items);
  const freightValue = round2(n0(d.freightValue));
  const totalValue = round2(num(d.totalValueFinal) ?? num(d.totalValue) ?? num(d.totalValueEstimated) ?? t.itemsSubtotal + freightValue);
  const addr = addressOf({ address: d.deliveryAddress });
  const wo = obj(d.weighingOutcome);
  const weighing: WeighingOutcome | null = Object.keys(wo).length
    ? {
        estimatedTotal: round2(n0(d.totalValueEstimated)),
        finalTotal: round2(n0(wo.totalValueFinal ?? d.totalValueFinal)),
        diffValue: round2(n0(wo.difference)),
        diffPercent: n0(wo.differencePercent),
        needsCustomerApproval: bool(wo.needsApproval),
        decidedAt: isoDateTime(d.approvedAt),
        decision: d.approvedAt ? 'ACCEPTED' : bool(wo.needsApproval) ? null : 'AUTO',
      }
    : null;
  const paidHist = docs(d.statusHistory).find((h) => upper(h.status) === 'PAID');
  const paid = PORTAL_PAID.includes(legacyStatus);
  const receipt = obj(d.receipt);
  const sale: Sale = {
    id,
    createdAt,
    updatedAt: isoDateTime(d.updatedAt) || createdAt,
    legacyId: String(d.id),
    number: num_.number,
    sequence: num_.sequence,
    channel: 'PORTAL',
    status,
    paymentStatus: 'PENDING',
    customerId: customer.id,
    customerName: customer.name,
    customerDocument: customer.document || null,
    customerCategory: customer.category,
    sellerId: null,
    sellerName: null,
    commissionRate: 0,
    commissionValue: 0,
    portalAccountId: account ? ctx.portalUid(uid) : null,
    priceTableId: null,
    date,
    deliveryDate: day(d.deliveryDate),
    deliveryMode: upper(d.deliveryMode) === 'PICKUP' ? 'PICKUP' : 'DELIVERY',
    deliveryWindow: upper(d.windowId) === 'A' || upper(d.windowId) === 'B' ? (upper(d.windowId) as 'A' | 'B') : null,
    shippingZipCode: addr.zipCode,
    shippingAddress: [addr.street, addr.number, addr.complement, addr.district, addr.city, addr.state].filter(Boolean).join(', ') || null,
    freightZoneId: null,
    freightValue,
    freightPending: bool(d.freightPending),
    paymentMethod: 'PIX',
    billingType: 'NONE',
    paymentTerms: null,
    installmentsCount: 1,
    firstDueDate: null,
    itemsSubtotal: t.itemsSubtotal,
    discountValue: 0,
    totalValue,
    totalWeightKg: t.totalWeightKg,
    estimatedTotal: num(d.totalValueEstimated),
    pixPayload: null,
    pixTxid: str(d.pixTxid),
    invoiceNumber: null,
    invoiceDate: null,
    boletoNumber: null,
    attachments: [],
    paymentReceipt: str(receipt.storagePath)
      ? {
          id: `${id}-receipt`,
          name: str(receipt.fileName) || 'comprovante',
          path: str(receipt.storagePath)!,
          url: null,
          mimeType: str(receipt.contentType),
          size: num(receipt.size),
          kind: 'RECEIPT',
          uploadedAt: isoDateTime(receipt.uploadedAt) || createdAt,
          uploadedBy: null,
        }
      : null,
    stockDeducted: false,
    stockShortKg: null,
    weighing,
    isIntercompany: false,
    company: null,
    approvedById: null,
    approvedByName: null,
    approvedAt: isoDateTime(d.approvedAt),
    pickedByName: str(d.weighedBy),
    pickedAt: isoDateTime(d.weighedAt),
    dispatchedAt: null,
    deliveredAt: status === 'DELIVERED' ? isoDateTime(d.updatedAt) : null,
    cancelledAt: status === 'CANCELLED' ? isoDateTime(d.updatedAt) : null,
    cancelReason: null,
    customerNotes: str(d.notes),
    notes: null,
    history: [...legacyHistory(ctx, d, createdAt), migrationEvent(ctx, `Pedido do portal importado do sistema antigo (id ${String(d.id)}).`)],
    createdById: null,
    createdByName: account?.name ?? null,
    items,
  };
  if (str(receipt.storagePath)) ctx.w.add('portal.receipt', 'Comprovantes de Pix do portal apontam para o armazenamento do sistema antigo (abra pelo sistema antigo se o link não funcionar)', num_.number);
  if (!account && uid) ctx.w.add('portal.noacc', 'Pedidos do portal de contas que não existem mais', num_.number);
  let entries: { status: string; paidAmount: number }[] = [];
  const receivable = !NO_RECEIVABLE_STATUS.includes(status);
  if (receivable) {
    const inst: InstSrc = { id: null, number: 1, dueDate: date, value: totalValue, paid, paymentDate: day(paidHist?.at ?? paidHist?.updatedAt), paidBy: str(paidHist?.by), paidAt: isoDateTime(paidHist?.at ?? paidHist?.updatedAt) };
    entries = entriesFrom(ctx, {
      prefix: `${id}-p`,
      legacyKey: String(d.id),
      base: { direction: 'IN', category: 'SALE', description: `Pedido ${sale.number} — ${sale.customerName}`, partyType: 'CUSTOMER', partyId: customer.id, partyName: customer.name, saleId: id, saleNumber: sale.number },
      insts: [inst],
      issueDate: date,
      createdAt,
      method: 'PIX',
      cancelUnpaid: false,
      tx: new Map(),
    });
  }
  sale.paymentStatus = paymentStatusOf(status, 'PIX', entries, legacyStatus === 'RECEIPT_SENT');
  ctx.put('sales', sale);
}

// ============================================================================
// Vendas excluídas e movimentos de materiais
// ============================================================================

export function mapDeletedSales(ctx: Ctx) {
  for (const d of ctx.col('deleted_sales')) {
    const id = String(d.id);
    const at = isoDateTime(d.deletedAt) || ctx.now;
    const snap = JSON.parse(JSON.stringify(d)) as Record<string, unknown>;
    ctx.put('deleted_sales', {
      id,
      createdAt: at,
      updatedAt: at,
      legacyId: id,
      saleId: str(d.originalSaleId) || id,
      number: str(d.orderNumber),
      customerName: firstStr(d.customerName, ctx.customers.get(str(d.customerId) || '')?.name),
      totalValue: round2(n0(d.totalValue)),
      reason: str(d.deletionReason),
      deletedById: ctx.uid(d.deletedById),
      deletedByName: firstStr(d.deletedByName, d.deletedByEmail),
      deletedAt: at,
      snapshot: snap,
    });
  }
}

export function mapSupplyMovements(ctx: Ctx) {
  const byItem = new Map<string, Doc[]>();
  for (const d of ctx.col('supply_movements')) {
    const k = str(d.supplyItemId) || '';
    if (!ctx.get('supply_items', k)) {
      ctx.w.add('supply.orphan', 'Movimentos de materiais de itens que não existem mais (ignorados)', str(d.supplyItemName));
      continue;
    }
    byItem.set(k, [...(byItem.get(k) || []), d]);
  }
  for (const [itemId, list] of byItem) {
    const item = ctx.get('supply_items', itemId)!;
    list.sort((a, b) => `${day(a.date)}|${isoDateTime(a.createdAt)}|${a.id}`.localeCompare(`${day(b.date)}|${isoDateTime(b.createdAt)}|${b.id}`));
    // Saldo após cada movimento: reconstruído para terminar no saldo atual do item.
    const delta = (d: Doc) => (upper(d.type) === 'OUT' ? -Math.abs(n0(d.quantity)) : upper(d.type) === 'ADJUST' ? n0(d.quantity) : Math.abs(n0(d.quantity)));
    let bal = round3(item.quantity - list.reduce((s, d) => s + delta(d), 0));
    for (const d of list) {
      const id = String(d.id);
      bal = round3(bal + delta(d));
      const type = upper(d.type) === 'OUT' ? 'OUT' : upper(d.type) === 'ADJUST' ? 'ADJUST' : 'IN';
      const m: SupplyMovement = {
        id,
        ...stamps(ctx, d, d.date),
        legacyId: id,
        supplyItemId: itemId,
        supplyItemName: str(d.supplyItemName) || item.name,
        type,
        // ADJUST antigo era uma diferença; no novo é o saldo final.
        quantity: type === 'ADJUST' ? bal : Math.abs(n0(d.quantity)),
        balanceAfter: bal,
        unitCost: num(d.unitCost),
        totalValue: num(d.totalValue),
        date: day(d.date) || day(d.createdAt) || day(ctx.now)!,
        reason: str(d.reason),
        saleId: ctx.get('sales', str(d.saleId)) ? str(d.saleId) : null,
        saleNumber: str(d.orderNumber) || ctx.get('sales', str(d.saleId))?.number || null,
        invoiceNumber: str(d.invoiceNumber),
        supplier: str(d.supplier),
        notes: firstStr(d.notes, str(d.customerName) ? `Cliente: ${str(d.customerName)}` : null),
        userName: str(d.registeredBy),
      };
      ctx.put('supply_movements', m);
    }
  }
}

