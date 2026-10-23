/**
 * Migração: gado (lotes, animais, custos, ração), estoque (lotes de estoque +
 * movimento de entrada), processamento (desossa) e perdas.
 */
import type {
  Animal,
  Batch,
  BatchCost,
  BatchStatus,
  CostCategory,
  FeedPurchase,
  LossOrigin,
  LossReason,
  ProcessingOrder,
  ProcessingReturnEvent,
  StockLot,
  StockMovement,
} from '../domain/types';
import { COST_CATEGORIES } from '../domain/labels';
import type { Ctx } from './context';
import { stamps } from './map-base';
import { arr, bool, companyCode, day, docs, firstStr, isoDateTime, n0, num, obj, round2, round3, str, upper, yearOf, type Doc } from './legacy-utils';

// ============================================================================
// Lotes de gado
// ============================================================================

/** Campo do objeto `costs` antigo → categoria nova. */
export const COST_FIELD_MAP: Record<string, CostCategory> = {
  purchasePrice: 'PURCHASE',
  purchaseCommission: 'PURCHASE_COMMISSION',
  purchaseTransport: 'PURCHASE_FREIGHT',
  freightCost: 'PURCHASE_FREIGHT',
  feed: 'FEED',
  lodging: 'LODGING',
  vaccine: 'VACCINE',
  veterinary: 'VETERINARY',
  pasture: 'PASTURE',
  slaughterTransport: 'SLAUGHTER_FREIGHT',
  slaughterCost: 'SLAUGHTER_FEE',
  slaughterReturn: 'SLAUGHTER_RETURN',
  hqTransport: 'HQ_FREIGHT',
  cuttingCost: 'CUTTING',
  deboningLabor: 'DEBONING',
  deboningCost: 'DEBONING',
  salesCommission: 'SALES_COMMISSION',
  taxCredit: 'TAX_CREDIT',
  funruralPurchase: 'FUNRURAL_PURCHASE',
  funruralSales: 'FUNRURAL_SALE',
  icmsPurchase: 'ICMS_PURCHASE',
  icmsSales: 'ICMS_SALE',
  senarPurchase: 'SENAR_PURCHASE',
  senarSales: 'SENAR_SALE',
  gtaFee: 'GTA_FEE',
  inspectionFee: 'INSPECTION_FEE',
  entryProtocol: 'ENTRY_PROTOCOL',
  slaughterReturnFreight: 'SLAUGHTER_RETURN_FREIGHT',
  deboningReturnFreight: 'DEBONING_RETURN_FREIGHT',
};

const BATCH_STATUS: BatchStatus[] = ['PURCHASED', 'IN_PASTURE', 'SLAUGHTERED', 'FINISHED'];

export function mapBatches(ctx: Ctx, counters: Map<string, number>) {
  const list = [...ctx.col('batches')].sort(
    (a, b) => (isoDateTime(a.createdAt) || '').localeCompare(isoDateTime(b.createdAt) || '') || String(a.id).localeCompare(String(b.id)),
  );
  // Códigos já existentes (L-AAAA-NNN) são preservados (o primeiro, se repetido).
  const codeOf = new Map<Doc, string>();
  const used = new Set<string>();
  for (const d of list) {
    const c = str(d.code);
    const m = /^L-(\d{4})-(\d+)$/.exec(c || '');
    if (m && !used.has(c!)) {
      used.add(c!);
      codeOf.set(d, c!);
      counters.set(`batch-${m[1]}`, Math.max(counters.get(`batch-${m[1]}`) || 0, Number(m[2])));
    }
  }
  for (const d of list) {
    const id = String(d.id);
    const st = stamps(ctx, d);
    const purchaseDate = day(d.purchaseDate) || day(st.createdAt)!;
    let code = codeOf.get(d);
    if (!code) {
      const y = yearOf(purchaseDate, ctx.now);
      const seq = (counters.get(`batch-${y}`) || 0) + 1;
      counters.set(`batch-${y}`, seq);
      code = `L-${y}-${String(seq).padStart(3, '0')}`;
    }
    const animalsRaw = docs(d.animals);
    const supplier = ctx.ensurePartner('CATTLE_SUPPLIER', d.sellerId, d.sellerName);
    const slaughterhouse = ctx.ensurePartner('SLAUGHTERHOUSE', d.slaughterhouseId, d.slaughterhouse);
    const count = Math.max(0, Math.round(n0(d.count)));
    if (animalsRaw.length && count && animalsRaw.length !== count)
      ctx.w.add('batch.count', 'Lotes em que a quantidade de cabeças difere da lista de animais (usada a lista)', str(d.name) || id);
    const status = upper(d.status) as BatchStatus;
    const b: Batch = {
      id,
      ...st,
      legacyId: id,
      code,
      name: str(d.name) || code,
      description: str(d.description),
      managementType: upper(d.managementType) === 'CONFINAMENTO' ? 'CONFINAMENTO' : 'CAMPO',
      status: BATCH_STATUS.includes(status) ? status : 'PURCHASED',
      company: companyCode(d.company),
      supplierId: supplier?.id ?? null,
      supplierName: supplier?.name ?? str(d.sellerName),
      purchaseDate,
      purchaseInvoice: str(d.purchaseInvoice ?? d.invoiceNumber),
      gtaNumber: str(d.gtaNumber),
      headCount: animalsRaw.length || count,
      purchaseWeightKg: animalsRaw.length ? round3(animalsRaw.reduce((s, a) => s + n0(a.initialWeightKg), 0)) : num(d.purchaseWeightKg),
      confinementEntryWeightKg: num(d.confinementEntryWeightKg) || null,
      estimatedSlaughterDate: day(d.estimatedSlaughterDate),
      slaughterDate: day(d.slaughterDate),
      slaughterhouseId: slaughterhouse?.id ?? null,
      slaughterhouseName: slaughterhouse?.name ?? str(d.slaughterhouse),
      exitScaleWeightKg: num(d.exitScaleWeightKg) || null,
      carcassWeightKg: num(d.slaughterWeightKg) || null,
      carcassYieldPercent: num(d.carcassYieldPercent) || null,
      transportLossPercent: num(d.transportLossPercent) || null,
      sellingPricePerKg: num(d.sellingPricePerKg),
      revenueOverride: num(d.totalSalesValueOverride) || null,
      notes: null,
    };
    if (!str(d.name)) ctx.w.add('batch.noname', 'Lotes sem nome (usado o código)', code);
    ctx.put('batches', b);

    animalsRaw.forEach((a, i) => {
      const slaughtered = upper(a.status) === 'SLAUGHTERED';
      const ast = upper(a.status);
      const g = upper(a.gender ?? a.sex);
      const fw = num(a.finalWeightKg);
      const an: Animal = {
        id: `${id}-a${i + 1}`,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
        legacyId: str(a.id),
        batchId: id,
        tag: str(a.tag) || `S/N-${i + 1}`,
        sex: g === 'MALE' || g === 'MACHO' ? 'MALE' : g === 'FEMALE' || g === 'FEMEA' ? 'FEMALE' : null,
        breed: str(a.breed),
        entryWeightKg: n0(a.initialWeightKg),
        purchasePrice: round2(n0(a.purchasePrice)),
        currentWeightKg: !slaughtered ? fw : null,
        exitWeightKg: null,
        carcassWeightKg: slaughtered ? fw : null,
        status: ast === 'SLAUGHTERED' || ast === 'DEAD' || ast === 'SOLD' ? ast : 'ALIVE',
        notes: null,
      };
      if (!str(a.tag)) ctx.w.add('animal.notag', 'Animais sem brinco (numerados S/N)', b.code);
      ctx.put('animals', an);
    });

    // Custos: um registro por campo não-zero.
    const costs = obj(d.costs);
    const purchaseCats = new Set<CostCategory>(['PURCHASE', 'PURCHASE_COMMISSION', 'PURCHASE_FREIGHT']);
    for (const [field, raw] of Object.entries(costs)) {
      const v = num(raw);
      if (raw !== undefined && raw !== null && raw !== '' && v === null) ctx.w.add('cost.nan', 'Custos de lote com valor inválido (ignorados)', `${b.code}.${field}`);
      if (!v) continue;
      let category = COST_FIELD_MAP[field];
      if (!category) {
        category = 'OTHER';
        ctx.w.add('cost.unknown', 'Campos de custo desconhecidos migrados como "Outros"', field);
      }
      if (v < 0 && COST_CATEGORIES[category].group !== 'CREDIT') ctx.w.add('cost.neg', 'Custos negativos (gravados como positivos — confira)', `${b.code}.${field}`);
      const group = COST_CATEGORIES[category].group;
      const date = group === 'SLAUGHTER' ? b.slaughterDate || purchaseDate : purchaseDate;
      const partner = purchaseCats.has(category) ? supplier : category === 'SLAUGHTER_FEE' ? slaughterhouse : null;
      const c: BatchCost = {
        id: `${id}-c-${field}`,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
        legacyId: null,
        batchId: id,
        category,
        date,
        amount: round2(Math.abs(v)),
        description: 'Valor migrado do sistema antigo',
        documentNumber: null,
        partnerId: partner?.id ?? null,
        partnerName: partner?.name ?? null,
        source: 'MIGRATION',
        sourceId: id,
        financialEntryId: null,
        createdById: null,
        createdByName: 'Migração',
      };
      ctx.put('batch_costs', c);
    }
  }
}

// ============================================================================
// Ração
// ============================================================================

export function mapFeed(ctx: Ctx) {
  for (const d of ctx.col('feed_types')) {
    const id = String(d.id);
    ctx.put('feed_types', { id, ...stamps(ctx, d), legacyId: id, name: str(d.name) || 'Ração', description: str(d.description), active: true });
  }
  for (const d of ctx.col('feed_stock')) {
    const id = String(d.id);
    const typeId = str(d.feedTypeId) || 'sem-tipo';
    let ft = ctx.get('feed_types', typeId);
    if (!ft) {
      ft = ctx.put('feed_types', { id: typeId, createdAt: ctx.now, updatedAt: ctx.now, legacyId: null, name: 'Ração (tipo não encontrado)', description: null, active: true });
      ctx.w.add('feed.type', 'Compras de ração sem tipo cadastrado — criado tipo provisório', str(d.invoiceNumber));
    }
    const qty = n0(d.weightKg);
    const total = round2(n0(d.invoiceValue));
    const p: FeedPurchase = {
      id,
      ...stamps(ctx, d, d.entryDate),
      legacyId: id,
      feedTypeId: ft.id,
      feedTypeName: ft.name,
      supplierId: null,
      supplierName: str(d.supplierName),
      invoiceNumber: str(d.invoiceNumber) || 'S/N',
      entryDate: day(d.entryDate) || day(d.createdAt) || day(ctx.now)!,
      quantityKg: qty,
      remainingKg: n0(d.currentWeightKg ?? qty),
      totalValue: total,
      unitCost: qty > 0 ? Math.round((total / qty) * 10000) / 10000 : 0,
      batchIds: arr(d.batchIds).map(str).filter((x): x is string => !!x && !!ctx.get('batches', x)),
      status: upper(d.status) === 'DEPLETED' ? 'DEPLETED' : 'AVAILABLE',
      notes: null,
    };
    ctx.put('feed_purchases', p);
  }
  for (const d of ctx.col('feed_consumption')) {
    const id = String(d.id);
    const p = ctx.get('feed_purchases', str(d.feedStockId));
    const b = ctx.get('batches', str(d.batchId));
    if (!p || !b) {
      ctx.w.add('feed.orphan', 'Consumos de ração sem compra ou lote existente (ignorados)', id);
      continue;
    }
    const qty = n0(d.amountKg);
    const per = upper(d.periodType);
    ctx.put('feed_consumptions', {
      id,
      ...stamps(ctx, d, d.date),
      legacyId: id,
      feedPurchaseId: p.id,
      feedTypeName: p.feedTypeName,
      batchId: b.id,
      batchName: b.name,
      date: day(d.date) || p.entryDate,
      quantityKg: qty,
      period: per === 'WEEKLY' || per === 'MONTHLY' ? per : 'DAILY',
      cost: round2(qty * p.unitCost),
      batchCostId: null,
      notes: 'O custo de ração do sistema antigo já está no custo "Ração" do lote.',
      createdByName: null,
    });
  }
}

// ============================================================================
// Estoque: inventory → stock_lots (+ 1 movimento de entrada)
// ============================================================================

export function mapInventory(ctx: Ctx) {
  let n = 0;
  for (const d of ctx.col('inventory')) {
    const id = String(d.id);
    const cut = str(d.cutType) || 'Corte sem nome';
    const raw = bool(d.isSlaughterEntry);
    const p = ctx.products.ensure(cut, { meatType: raw ? 'RAW' : upper(d.meatType) === 'GRILL' ? 'GRILL' : 'PROCESSED' });
    const st = stamps(ctx, d, d.entryDate);
    const sold = upper(d.status) === 'SOLD';
    const w = num(d.weightKg);
    if (w === null) ctx.w.add('lot.noweight', 'Itens de estoque sem peso (saldo zero)', cut);
    const weight = Math.max(0, round3(w ?? 0));
    // `batchId` do estoque antigo pode ser o lote de gado (pós-abate) ou um código digitado (ex.: "L123").
    const legacyBatch = str(d.batchId);
    const batch = ctx.get('batches', str(d.animalBatchId)) || ctx.get('batches', legacyBatch);
    const lotCode = legacyBatch && !ctx.get('batches', legacyBatch) ? legacyBatch : batch?.code ?? null;
    const intercompany = upper(d.stockOrigin) === 'INTERCOMPANY';
    const balance = sold ? 0 : weight;
    const lot: StockLot = {
      id,
      ...st,
      legacyId: id,
      productId: p.id,
      productName: p.name,
      stage: raw ? 'RAW' : 'FINISHED',
      batchId: batch?.id ?? null,
      batchCode: batch?.code ?? null,
      processingOrderId: null,
      lotCode,
      origin: intercompany ? 'INTERCOMPANY' : 'PROPRIO',
      originCompany: intercompany ? companyCode(d.originCompany) : null,
      originInvoice: firstStr(d.originInvoice, d.invoiceNumber),
      entryDate: day(d.entryDate) || day(st.createdAt)!,
      expiryDate: day(d.expiryDate),
      initialQty: weight,
      balanceQty: balance,
      unit: 'KG',
      unitCost: Math.round(n0(d.unitPrice) * 10000) / 10000,
      status: balance > 0.0005 ? 'AVAILABLE' : 'DEPLETED',
      location: null,
      notes: firstStr(
        str(d.slaughterhouseName) ? `Frigorífico: ${str(d.slaughterhouseName)}` : null,
        str(d.exitDate) ? `Saída no sistema antigo: ${day(d.exitDate)}` : null,
      ),
    };
    ctx.put('stock_lots', lot);
    const base = {
      lotId: id,
      productId: p.id,
      productName: p.name,
      stage: lot.stage,
      unitCost: lot.unitCost,
      unitPrice: null,
      batchId: lot.batchId,
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
    if (weight > 0) {
      const m: StockMovement = {
        ...base,
        id: `${id}-m1`,
        type: raw ? 'SLAUGHTER_ENTRY' : 'ENTRY',
        qty: weight,
        date: lot.entryDate,
        reason: 'Saldo migrado do sistema antigo',
      };
      ctx.put('stock_movements', m);
      n++;
    }
    if (weight > 0 && sold) {
      // Item marcado como vendido mas com peso: zera o saldo no razão.
      ctx.put('stock_movements', {
        ...base,
        id: `${id}-m2`,
        type: 'ADJUSTMENT',
        qty: -weight,
        date: day(d.exitDate) || lot.entryDate,
        reason: 'Baixado no sistema antigo (vendido)',
      });
    }
  }
}

// ============================================================================
// Processamento (desossa)
// ============================================================================

const PROC_STATUS: Record<string, ProcessingOrder['status']> = {
  PROCESSING: 'OPEN',
  OPEN: 'OPEN',
  PARTIALLY_RETURNED: 'PARTIAL',
  PARTIAL: 'PARTIAL',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

export function mapProcessing(ctx: Ctx, counters: Map<string, number>) {
  const list = [...ctx.col('processing_orders')].sort(
    (a, b) => (day(a.sentDate) || '').localeCompare(day(b.sentDate) || '') || String(a.id).localeCompare(String(b.id)),
  );
  const used = new Set<string>();
  const pending: Doc[] = [];
  for (const d of list) {
    const m = /^OS-(\d{4})-(\d+)$/.exec(str(d.orderNumber) || '');
    if (m && !used.has(str(d.orderNumber)!)) {
      used.add(str(d.orderNumber)!);
      counters.set(`processing-${m[1]}`, Math.max(counters.get(`processing-${m[1]}`) || 0, Number(m[2])));
    } else pending.push(d);
  }
  const numberOf = new Map<Doc, string>();
  for (const d of list) if (!pending.includes(d)) numberOf.set(d, str(d.orderNumber)!);
  for (const d of pending) {
    const y = yearOf(day(d.sentDate), ctx.now);
    const seq = (counters.get(`processing-${y}`) || 0) + 1;
    counters.set(`processing-${y}`, seq);
    numberOf.set(d, `OS-${y}-${String(seq).padStart(3, '0')}`);
    if (str(d.orderNumber)) ctx.w.add('proc.dupnum', 'Ordens de processamento com número repetido/inválido — renumeradas', str(d.orderNumber));
  }
  for (const d of list) {
    const id = String(d.id);
    const partner = ctx.ensurePartner('PROCESSOR', d.slaughterhouseId, d.slaughterhouseName) || ctx.ensurePartner('PROCESSOR', null, 'Processador não informado')!;
    const batch = ctx.get('batches', str(d.batchId));
    const item = (c: Doc) => {
      const p = ctx.products.ensure(str(c.cutType) || 'Corte sem nome', { meatType: upper(c.meatType) === 'GRILL' ? 'GRILL' : undefined });
      return { productId: p.id, productName: p.name };
    };
    const lossOf = (l: Doc) => ({
      bonesKg: num(l.bonesKg),
      fatKg: num(l.fatKg),
      trimmingKg: num(l.trimmingLossKg ?? l.trimmingKg),
      evaporationKg: num(l.evaporationLossKg ?? l.evaporationKg),
      otherKg: num(l.otherLossKg ?? l.otherKg),
    });
    let returns: ProcessingReturnEvent[] = docs(d.returnEvents).map((e, i) => ({
      id: str(e.id) || `${id}-r${i + 1}`,
      date: day(e.returnDate) || day(d.actualReturnDate) || day(d.sentDate) || day(ctx.now)!,
      type: upper(e.returnType) === 'TOTAL' ? 'TOTAL' : 'PARTIAL',
      invoiceNumber: str(e.returnInvoiceNumber),
      returnedKg: n0(e.returnedWeightKg),
      items: docs(e.cuts).map((c) => ({ ...item(c), qty: n0(c.weightKg), unitCost: n0(c.unitPrice), expiryDate: day(c.expiryDate), lotId: null })),
      losses: lossOf(obj(e.lossDetails)),
      unclassifiedKg: n0(e.unclassifiedDiffKg),
      notes: str(e.notes),
      registeredBy: str(e.registeredBy),
      registeredAt: isoDateTime(e.registeredAt) || ctx.now,
    }));
    const finished = docs(d.finishedCuts);
    if (!returns.length && (finished.length || n0(d.returnedWeightKg) > 0)) {
      returns = [
        {
          id: `${id}-r1`,
          date: day(d.actualReturnDate) || day(d.returnedAt) || day(d.sentDate) || day(ctx.now)!,
          type: upper(d.status) === 'COMPLETED' ? 'TOTAL' : 'PARTIAL',
          invoiceNumber: str(d.returnInvoiceNumber),
          returnedKg: n0(d.returnedWeightKg) || round3(finished.reduce((s, c) => s + n0(c.weightKg), 0)),
          items: finished.map((c) => ({ ...item(c), qty: n0(c.weightKg), unitCost: n0(c.unitPrice), expiryDate: day(c.expiryDate), lotId: null })),
          losses: lossOf(obj(d.lossDetails)),
          unclassifiedKg: n0(d.unclassifiedDiffKg),
          notes: str(d.returnNotes),
          registeredBy: str(d.returnedBy),
          registeredAt: isoDateTime(d.returnedAt) || ctx.now,
        },
      ];
    }
    const sentKg = n0(d.sentWeightKg);
    const returnedKg = n0(d.returnedWeightKg) || round3(returns.reduce((s, r) => s + r.returnedKg, 0));
    const o: ProcessingOrder = {
      id,
      ...stamps(ctx, d, d.sentDate),
      legacyId: id,
      number: numberOf.get(d)!,
      batchId: batch?.id ?? null,
      batchCode: batch?.code ?? null,
      partnerId: partner.id,
      partnerName: partner.name,
      sentDate: day(d.sentDate) || day(d.createdAt) || day(ctx.now)!,
      expectedReturnDate: day(d.expectedReturnDate),
      status: PROC_STATUS[upper(d.status)] || 'OPEN',
      driverName: str(d.driverName),
      vehiclePlate: str(d.driverLicensePlate),
      driverPhone: str(d.driverPhone),
      dispatchDocument: str(d.dispatchDocumentNumber),
      freightCost: num(d.transportFreightCost),
      processingCost: num(d.processingCost),
      sentKg,
      returnedKg,
      lossKg: num(d.totalLossKg) ?? (returnedKg ? round3(Math.max(0, sentKg - returnedKg)) : 0),
      yieldPercent: num(d.yieldPercent),
      sentItems: docs(d.sentCuts).map((c) => ({
        lotId: ctx.get('stock_lots', str(c.inventoryItemId)) ? str(c.inventoryItemId) : null,
        ...item(c),
        qty: n0(c.weightKg),
        unitCost: n0(c.costPerKg),
      })),
      returns,
      notes: str(d.description),
      createdByName: null,
    };
    ctx.put('processing_orders', o);
  }
}

// ============================================================================
// Perdas
// ============================================================================

const LOSS_ORIGINS: LossOrigin[] = ['PROCESSAMENTO', 'ESTOQUE', 'TRANSPORTE', 'ABATE'];
const LOSS_REASONS: LossReason[] = ['OSSO', 'SEBO_GORDURA', 'APARA', 'EVAPORACAO', 'DESCARTE', 'AVARIA', 'VALIDADE_VENCIDA', 'DIVERGENCIA_PESAGEM', 'OUTRO'];

export function mapLosses(ctx: Ctx) {
  for (const d of ctx.col('stock_losses')) {
    const id = String(d.id);
    const p = str(d.cutType) ? ctx.products.ensure(str(d.cutType)!) : null;
    const partner = ctx.partners.get(str(d.slaughterhouseId) || '') || null;
    const po = ctx.get('processing_orders', str(d.processingOrderId));
    const o = upper(d.origin) as LossOrigin;
    const r = upper(d.reason) as LossReason;
    ctx.put('stock_losses', {
      id,
      ...stamps(ctx, d, d.date),
      legacyId: id,
      date: day(d.date) || day(d.createdAt) || day(ctx.now)!,
      origin: LOSS_ORIGINS.includes(o) ? o : 'ESTOQUE',
      reason: LOSS_REASONS.includes(r) ? r : 'OUTRO',
      qty: n0(d.weightKg),
      unitCost: num(d.unitCost),
      totalValue: num(d.totalValue),
      productId: p?.id ?? null,
      productName: p?.name ?? str(d.cutType),
      batchId: ctx.get('batches', str(d.batchId)) ? str(d.batchId) : null,
      lotId: ctx.get('stock_lots', str(d.inventoryItemId)) ? str(d.inventoryItemId) : null,
      processingOrderId: po?.id ?? null,
      processingOrderNumber: po?.number ?? str(d.processingOrderNumber),
      partnerId: partner?.id ?? null,
      partnerName: partner?.name ?? str(d.slaughterhouseName),
      notes: str(d.notes),
      registeredBy: str(d.registeredBy),
    });
  }
}
