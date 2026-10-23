import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/shared/app/settings';
import { MemoryData } from '../src/shared/data/memory';
import { batchEconomics } from '../src/shared/domain/costs';
import { createOps, type Actor, type Ops } from '../src/shared/ops';

// ----------------------------------------------------------------------------
// Ambiente
// ----------------------------------------------------------------------------

const ADMIN: Actor = { id: 'u-admin', name: 'Ana Admin', email: 'admin@teste.dev', role: 'ADMIN' };
const LOGISTICS: Actor = { id: 'u-log', name: 'Léo Logística', email: 'log@teste.dev', role: 'LOGISTICS' };
const FINANCE: Actor = { id: 'u-fin', name: 'Fábio Financeiro', email: 'fin@teste.dev', role: 'FINANCIAL' };
const EXTERNAL: Actor = { id: 'u-ext', name: 'Edu Externo', email: 'ext@teste.dev', role: 'EXTERNAL_SELLER' };
const CUSTOMER: Actor = { id: 'acc-1', name: 'Cliente Portal', email: 'cliente@teste.dev', role: 'CUSTOMER' };

let data: MemoryData;
const opsAs = (actor: Actor): Ops => createOps({ data, actor });

async function baseSetup() {
  data = new MemoryData();
  await data.insert('settings', { ...DEFAULT_SETTINGS, id: 'main', freeFreightAbove: null });
  for (const a of [ADMIN, LOGISTICS, FINANCE, EXTERNAL]) {
    await data.insert('profiles', { id: a.id, email: a.email, name: a.name, role: a.role as never, active: true, commissionRate: a === EXTERNAL ? 3 : null });
  }
  const product = await data.insert('products', { name: 'Picanha', category: 'Traseiro', meatType: 'GRILL', unit: 'KG', defaultPrice: 100, active: true });
  const customer = await data.insert('customers', {
    name: 'Churrascaria Teste',
    personType: 'J',
    document: '11222333000181',
    category: 'EXTERNO_CNPJ',
    creditLimit: 10000,
    allowedPaymentMethods: ['PIX', 'BOLETO'],
    financialApproval: 'APPROVED',
    isIntercompany: false,
    status: 'ACTIVE',
    ranking: 'BRONZE',
    stars: 0,
    totalPurchases: 0,
    ordersCount: 0,
    documents: [],
    zipCode: '13010100',
  });
  return { product, customer };
}

const lotsOf = (productId: string) => data.list('stock_lots', { where: [['productId', '==', productId]] });
const entriesOf = (saleId: string) => data.list('financial_entries', { where: [['saleId', '==', saleId]] });

// ----------------------------------------------------------------------------
// Vendas
// ----------------------------------------------------------------------------

describe('venda completa', () => {
  let productId: string;
  let customerId: string;
  let lotA: string;
  let lotB: string;

  beforeEach(async () => {
    const s = await baseSetup();
    productId = s.product.id;
    customerId = s.customer.id;
    const admin = opsAs(ADMIN);
    lotA = await admin.addStockEntry({ productId, qty: 10, unitCost: 50, entryDate: '2026-08-01', expiryDate: '2026-10-10' });
    lotB = await admin.addStockEntry({ productId, qty: 20, unitCost: 60, entryDate: '2026-08-05', expiryDate: '2026-10-20' });
  });

  it('cria, aprova com prazos 28/35/42, separa com baixa FIFO de 2 lotes e quita', async () => {
    const admin = opsAs(ADMIN);
    const sale = await admin.createSale({
      channel: 'INTERNAL',
      customerId,
      date: '2026-09-01',
      deliveryMode: 'DELIVERY',
      paymentMethod: 'BOLETO',
      billingType: 'NF_BOLETO',
      paymentTerms: '28/35/42',
      status: 'PENDING_APPROVAL',
      items: [{ kind: 'PRODUCT', productId, productName: '', unit: 'KG', qtyOrdered: 15, unitPrice: 100 }],
    });
    expect(sale.number).toMatch(/^2026\d{4}$/);
    expect(sale.status).toBe('PENDING_APPROVAL');
    expect(sale.items[0].productName).toBe('Picanha');
    expect(sale.totalValue).toBe(1500);
    expect(await entriesOf(sale.id)).toHaveLength(0);

    await admin.approveSale(sale.id);
    let entries = (await entriesOf(sale.id)).sort((a, b) => a.installment - b.installment);
    expect(entries.map((e) => e.dueDate)).toEqual(['2026-09-29', '2026-10-06', '2026-10-13']);
    expect(entries.map((e) => e.amount)).toEqual([500, 500, 500]);
    expect(entries.every((e) => e.direction === 'IN' && e.category === 'SALE' && e.partyName === 'Churrascaria Teste')).toBe(true);

    const res = await opsAs(LOGISTICS).finalizePicking(sale.id, { items: [{ itemId: sale.items[0].id, qty: 15.4 }] });
    expect(res.shortQty).toBe(0);
    expect(res.totalValue).toBe(1540);
    const lots = await lotsOf(productId);
    expect(lots.find((l) => l.id === lotA)).toMatchObject({ balanceQty: 0, status: 'DEPLETED' });
    expect(lots.find((l) => l.id === lotB)).toMatchObject({ balanceQty: 14.6, status: 'AVAILABLE' });
    const moves = await data.list('stock_movements', { where: [['saleId', '==', sale.id]] });
    expect(moves).toHaveLength(2);
    expect(moves.map((m) => m.qty).sort()).toEqual([-10, -5.4]);
    expect(moves.every((m) => m.type === 'SALE' && m.unitPrice === 100 && m.customerName === 'Churrascaria Teste')).toBe(true);

    let saved = (await data.get('sales', sale.id))!;
    expect(saved.status).toBe('READY');
    expect(saved.stockDeducted).toBe(true);
    expect(saved.items[0].deductedQty).toBe(15.4);
    expect(saved.items[0].costTotal).toBe(10 * 50 + 5.4 * 60);
    entries = (await entriesOf(sale.id)).sort((a, b) => a.installment - b.installment);
    expect(entries.map((e) => e.amount)).toEqual([513.33, 513.33, 513.34]);

    const fin = opsAs(FINANCE);
    await fin.payEntry(entries[0].id, { date: '2026-09-29' });
    expect((await data.get('sales', sale.id))!.paymentStatus).toBe('PARTIAL');
    for (const e of entries.slice(1)) await fin.payEntry(e.id, { date: '2026-10-06', method: 'BOLETO' });
    saved = (await data.get('sales', sale.id))!;
    expect(saved.paymentStatus).toBe('PAID');
    const c = (await data.get('customers', customerId))!;
    expect(c.totalPurchases).toBe(1540);
    expect(c.ordersCount).toBe(1);
  });

  it('cancelamento estorna o estoque e cancela as parcelas', async () => {
    const admin = opsAs(ADMIN);
    const sale = await admin.createSale({
      channel: 'INTERNAL',
      customerId,
      date: '2026-09-01',
      deliveryMode: 'PICKUP',
      paymentMethod: 'PIX',
      billingType: 'NONE',
      items: [{ kind: 'PRODUCT', productId, productName: 'Picanha', unit: 'KG', qtyOrdered: 12, unitPrice: 100 }],
    });
    expect(sale.status).toBe('APPROVED');
    await opsAs(LOGISTICS).finalizePicking(sale.id, { items: [] });
    expect((await lotsOf(productId)).reduce((s, l) => s + l.balanceQty, 0)).toBeCloseTo(18, 3);
    await admin.cancelSale(sale.id, 'Cliente desistiu');
    const lots = await lotsOf(productId);
    expect(lots.find((l) => l.id === lotA)).toMatchObject({ balanceQty: 10, status: 'AVAILABLE' });
    expect(lots.find((l) => l.id === lotB)).toMatchObject({ balanceQty: 20 });
    const rev = (await data.list('stock_movements', { where: [['saleId', '==', sale.id]] })).filter((m) => m.type === 'SALE_REVERSAL');
    expect(rev.reduce((s, m) => s + m.qty, 0)).toBeCloseTo(12, 3);
    const saved = (await data.get('sales', sale.id))!;
    expect(saved.status).toBe('CANCELLED');
    expect(saved.paymentStatus).toBe('CANCELLED');
    expect((await entriesOf(sale.id)).every((e) => e.status === 'CANCELLED')).toBe(true);
    expect((await data.get('customers', customerId))!.totalPurchases).toBe(0);
    // idempotente: excluir depois do cancelamento não estorna de novo
    await admin.deleteSale(sale.id, 'Limpeza');
    expect((await lotsOf(productId)).reduce((s, l) => s + l.balanceQty, 0)).toBeCloseTo(30, 3);
    expect(await data.get('sales', sale.id)).toBeNull();
    expect(await data.list('deleted_sales')).toHaveLength(1);
  });

  it('falta de estoque não quebra: retorna o que faltou', async () => {
    const admin = opsAs(ADMIN);
    const sale = await admin.createSale({
      channel: 'INTERNAL',
      customerId,
      date: '2026-09-01',
      deliveryMode: 'PICKUP',
      paymentMethod: 'PIX',
      billingType: 'NONE',
      items: [{ kind: 'PRODUCT', productId, productName: 'Picanha', unit: 'KG', qtyOrdered: 50, unitPrice: 100 }],
    });
    const res = await opsAs(LOGISTICS).finalizePicking(sale.id, { items: [] });
    expect(res.shortQty).toBe(20);
    expect(res.shortItems).toEqual([{ productName: 'Picanha', requested: 50, allocated: 30 }]);
    const saved = (await data.get('sales', sale.id))!;
    expect(saved.status).toBe('READY');
    expect(saved.stockShortKg).toBe(20);
    expect((await lotsOf(productId)).every((l) => l.status === 'DEPLETED')).toBe(true);
  });

  it('bonificação não gera contas e nasce paga', async () => {
    const sale = await opsAs(ADMIN).createSale({
      channel: 'INTERNAL',
      customerId,
      date: '2026-09-01',
      deliveryMode: 'PICKUP',
      paymentMethod: 'BONUS',
      billingType: 'NONE',
      deductNow: true,
      items: [{ kind: 'PRODUCT', productId, productName: 'Picanha', unit: 'KG', qtyOrdered: 2, unitPrice: 100 }],
    });
    expect(sale.status).toBe('READY');
    expect(sale.paymentStatus).toBe('PAID');
    expect(await entriesOf(sale.id)).toHaveLength(0);
  });
});

// ----------------------------------------------------------------------------
// Permissões
// ----------------------------------------------------------------------------

describe('permissões', () => {
  it('vendedor externo cria pedido pendente e não aprova', async () => {
    const { product, customer } = await baseSetup();
    const sale = await opsAs(EXTERNAL).createSale({
      channel: 'INTERNAL',
      customerId: customer.id,
      date: '2026-09-10',
      deliveryMode: 'DELIVERY',
      paymentMethod: 'BOLETO',
      billingType: 'NF_BOLETO',
      status: 'APPROVED',
      deductNow: true,
      items: [{ kind: 'PRODUCT', productId: product.id, productName: 'Picanha', unit: 'KG', qtyOrdered: 5, unitPrice: 100 }],
    });
    expect(sale.status).toBe('PENDING_APPROVAL');
    expect(sale.channel).toBe('EXTERNAL_SELLER');
    expect(sale.sellerId).toBe(EXTERNAL.id);
    expect(sale.commissionRate).toBe(3);
    expect(sale.commissionValue).toBe(15);
    expect(sale.stockDeducted).toBe(false);
    await expect(opsAs(EXTERNAL).approveSale(sale.id)).rejects.toThrow(/permissão/);
    await expect(opsAs(CUSTOMER).createSale({} as never)).rejects.toThrow(/portal/);
    await expect(opsAs(LOGISTICS).payEntry('x', { date: '2026-09-10' })).rejects.toThrow(/permissão/);
  });

  it('cliente bloqueado não compra', async () => {
    const { product, customer } = await baseSetup();
    await data.update('customers', customer.id, { status: 'BLOCKED' });
    await expect(
      opsAs(ADMIN).createSale({
        channel: 'INTERNAL',
        customerId: customer.id,
        date: '2026-09-10',
        deliveryMode: 'DELIVERY',
        paymentMethod: 'PIX',
        billingType: 'NONE',
        items: [{ kind: 'PRODUCT', productId: product.id, productName: 'Picanha', unit: 'KG', qtyOrdered: 5, unitPrice: 100 }],
      }),
    ).rejects.toThrow(/bloqueado/);
  });
});

// ----------------------------------------------------------------------------
// Portal
// ----------------------------------------------------------------------------

describe('portal do cliente', () => {
  it('pedido com frete por CEP, pesagem acima da tolerância e aceite do cliente', async () => {
    const { product, customer } = await baseSetup();
    const admin = opsAs(ADMIN);
    await admin.addStockEntry({ productId: product.id, qty: 50, unitCost: 55, entryDate: '2026-09-01' });
    await data.insert('freight_zones', { label: 'Campinas', cepPrefixes: ['130', '131'], price: 15, minOrderValue: 100, active: true });
    await data.insert('freight_zones', { label: 'São Paulo', cepPrefixes: ['01'], price: 60, minOrderValue: 600, active: true });
    const cat = await data.insert('catalog_items', {
      productId: product.id,
      name: 'Picanha',
      category: 'Traseiro',
      unit: 'KG',
      price: 100,
      minQty: 1,
      step: 0.5,
      available: true,
      featured: true,
      sortOrder: 1,
    });
    await data.insert('portal_accounts', { id: CUSTOMER.id, email: CUSTOMER.email, name: CUSTOMER.name, status: 'APPROVED', customerId: customer.id });

    const portal = opsAs(CUSTOMER);
    await expect(
      portal.submitPortalOrder({ items: [{ catalogItemId: cat.id, qty: 0.75 }], deliveryMode: 'DELIVERY', zipCode: '13010-100' }),
    ).rejects.toThrow(/mínimo|múltipla/);
    await expect(
      portal.submitPortalOrder({ items: [{ catalogItemId: cat.id, qty: 2 }], deliveryMode: 'DELIVERY', zipCode: '01310-100' }),
    ).rejects.toThrow(/Pedido mínimo/);

    const sale = await portal.submitPortalOrder({ items: [{ catalogItemId: cat.id, qty: 10 }], deliveryMode: 'DELIVERY', zipCode: '13010-100' });
    expect(sale.channel).toBe('PORTAL');
    expect(sale.status).toBe('PENDING_APPROVAL');
    expect(sale.freightValue).toBe(15);
    expect(sale.totalValue).toBe(1015);
    expect(sale.estimatedTotal).toBe(1015);
    expect(sale.pixPayload).toContain('br.gov.bcb.pix');
    expect(sale.deliveryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(['A', 'B']).toContain(sale.deliveryWindow);
    expect(sale.portalAccountId).toBe(CUSTOMER.id);

    await admin.approveSale(sale.id);
    const res = await opsAs(LOGISTICS).finalizePicking(sale.id, { items: [{ itemId: sale.items[0].id, qty: 11 }] });
    expect(res.needsCustomerApproval).toBe(true);
    let saved = (await data.get('sales', sale.id))!;
    expect(saved.status).toBe('AWAITING_CUSTOMER');
    expect(saved.totalValue).toBe(1115);
    expect(saved.weighing).toMatchObject({ estimatedTotal: 1015, finalTotal: 1115, diffValue: 100, needsCustomerApproval: true });
    expect(saved.pixPayload).toContain('1115.00');
    expect((await entriesOf(sale.id)).reduce((s, e) => s + e.amount, 0)).toBe(1115);

    // outro cliente não mexe
    await expect(createOps({ data, actor: { ...CUSTOMER, id: 'acc-2' } }).respondWeighing(sale.id, true)).rejects.toThrow();
    await portal.respondWeighing(sale.id, true);
    saved = (await data.get('sales', sale.id))!;
    expect(saved.status).toBe('READY');
    expect(saved.weighing?.decision).toBe('ACCEPTED');

    await portal.uploadPaymentReceipt(sale.id, { id: 'r1', name: 'comprovante.pdf', path: 'x/comprovante.pdf', uploadedAt: '2026-09-10T10:00:00Z' });
    expect((await data.get('sales', sale.id))!.paymentStatus).toBe('RECEIPT_SENT');
    await opsAs(FINANCE).confirmSalePayment(sale.id, { date: '2026-09-10', method: 'PIX' });
    expect((await data.get('sales', sale.id))!.paymentStatus).toBe('PAID');
  });

  it('pesagem dentro da tolerância vai direto para separado', async () => {
    const { product, customer } = await baseSetup();
    await opsAs(ADMIN).addStockEntry({ productId: product.id, qty: 50, unitCost: 55, entryDate: '2026-09-01' });
    const cat = await data.insert('catalog_items', { productId: product.id, name: 'Picanha', category: 'Traseiro', unit: 'KG', price: 100, minQty: 1, step: 0.5, available: true, featured: false, sortOrder: 1 });
    await data.insert('portal_accounts', { id: CUSTOMER.id, email: CUSTOMER.email, name: CUSTOMER.name, status: 'APPROVED', customerId: customer.id });
    const sale = await opsAs(CUSTOMER).submitPortalOrder({ items: [{ catalogItemId: cat.id, qty: 5 }], deliveryMode: 'PICKUP' });
    expect(sale.freightValue).toBe(0);
    await opsAs(ADMIN).approveSale(sale.id);
    const r = await opsAs(LOGISTICS).finalizePicking(sale.id, { items: [{ itemId: sale.items[0].id, qty: 5.1 }] });
    expect(r.needsCustomerApproval).toBe(false);
    const saved = (await data.get('sales', sale.id))!;
    expect(saved.status).toBe('READY');
    expect(saved.weighing?.decision).toBe('AUTO');
  });
});

// ----------------------------------------------------------------------------
// Gado, abate, desossa, ração
// ----------------------------------------------------------------------------

async function cattleSetup() {
  await baseSetup();
  const supplier = await data.insert('partners', { kind: 'CATTLE_SUPPLIER', name: 'Fazenda Teste', active: true });
  const sh = await data.insert('partners', { kind: 'SLAUGHTERHOUSE', name: 'Frigorífico Teste', inspection: 'SIF', active: true });
  const proc = await data.insert('partners', { kind: 'PROCESSOR', name: 'Desossa Teste', active: true });
  const mk = (name: string, category: string, meatType: 'RAW' | 'GRILL' | 'PROCESSED') =>
    data.insert('products', { name, category, meatType, unit: 'KG', active: true, shelfLifeDays: meatType === 'RAW' ? 7 : 90 });
  const traseiro = await mk('Traseiro', 'Carcaça', 'RAW');
  const dianteiro = await mk('Dianteiro', 'Carcaça', 'RAW');
  const alcatra = await mk('Alcatra', 'Traseiro', 'GRILL');
  const acem = await mk('Acém', 'Dianteiro', 'PROCESSED');
  const picanha = (await data.list('products', { where: [['name', '==', 'Picanha']] }))[0];
  const batchId = await opsAs(ADMIN).createBatch({
    name: 'Lote teste',
    managementType: 'CONFINAMENTO',
    supplierId: supplier.id,
    purchaseDate: '2026-05-01',
    animals: [
      { tag: 'BR1', entryWeightKg: 400, purchasePrice: 3000 },
      { tag: 'BR2', entryWeightKg: 420, purchasePrice: 3000 },
      { tag: 'BR3', entryWeightKg: 440, purchasePrice: 3000 },
    ],
    purchaseCost: { createPayable: { terms: '30/60', method: 'TRANSFER' } },
  });
  return { supplier, sh, proc, traseiro, dianteiro, alcatra, acem, picanha, batchId };
}

describe('gado, abate e desossa', () => {
  it('createBatch gera código, custo de compra e conta a pagar; brinco duplicado falha', async () => {
    const { batchId, supplier } = await cattleSetup();
    const batch = (await data.get('batches', batchId))!;
    expect(batch.code).toBe('L-2026-001');
    expect(batch.headCount).toBe(3);
    expect(batch.purchaseWeightKg).toBe(1260);
    expect(batch.supplierName).toBe('Fazenda Teste');
    const costs = await data.list('batch_costs', { where: [['batchId', '==', batchId]] });
    expect(costs).toHaveLength(1);
    expect(costs[0]).toMatchObject({ category: 'PURCHASE', amount: 9000, source: 'MANUAL' });
    const pay = await data.list('financial_entries', { where: [['batchId', '==', batchId]] });
    expect(pay.map((p) => [p.direction, p.category, p.amount, p.partyName])).toEqual([
      ['OUT', 'CATTLE_PURCHASE', 4500, 'Fazenda Teste'],
      ['OUT', 'CATTLE_PURCHASE', 4500, 'Fazenda Teste'],
    ]);
    expect(costs[0].financialEntryId).toBe(pay.find((p) => p.installment === 1)!.id);
    await expect(
      opsAs(ADMIN).createBatch({
        name: 'Outro',
        managementType: 'CAMPO',
        supplierId: supplier.id,
        purchaseDate: '2026-06-01',
        animals: [
          { tag: 'BR9', entryWeightKg: 400, purchasePrice: 3000 },
          { tag: 'br2', entryWeightKg: 400, purchasePrice: 3000 },
        ],
      }),
    ).rejects.toThrow(/Brincos já cadastrados em animais vivos: br2/);
    expect(await data.list('batches')).toHaveLength(1);
  });

  it('ração: consumo gera custo no lote e controla o saldo', async () => {
    const { batchId, supplier } = await cattleSetup();
    const ft = await data.insert('feed_types', { name: 'Ração engorda', active: true });
    const admin = opsAs(ADMIN);
    const pid = await admin.registerFeedPurchase({ feedTypeId: ft.id, supplierId: supplier.id, invoiceNumber: '123', entryDate: '2026-05-02', quantityKg: 1000, totalValue: 1500, batchIds: [batchId], createPayable: { installments: 2 } });
    let p = (await data.get('feed_purchases', pid))!;
    expect(p.unitCost).toBe(1.5);
    expect(await data.list('financial_entries', { where: [['category', '==', 'FEED']] })).toHaveLength(2);
    await admin.registerFeedConsumption({ feedPurchaseId: pid, batchId, date: '2026-05-08', quantityKg: 200, period: 'WEEKLY' });
    p = (await data.get('feed_purchases', pid))!;
    expect(p.remainingKg).toBe(800);
    const cons = (await data.list('feed_consumptions'))[0];
    expect(cons.cost).toBe(300);
    const cost = (await data.get('batch_costs', cons.batchCostId!))!;
    expect(cost).toMatchObject({ category: 'FEED', amount: 300, source: 'FEED', sourceId: cons.id });
    expect((await data.get('batches', batchId))!.status).toBe('IN_PASTURE');
    await expect(admin.registerFeedConsumption({ feedPurchaseId: pid, batchId, date: '2026-05-09', quantityKg: 900, period: 'WEEKLY' })).rejects.toThrow(/Saldo insuficiente/);
    await expect(admin.removeBatchCost(cost.id)).rejects.toThrow(/Ração/);
    const other = await admin.createBatch({ name: 'B', managementType: 'CAMPO', purchaseDate: '2026-05-01', animals: [{ tag: 'X1', entryWeightKg: 300, purchasePrice: 2000 }] });
    await expect(admin.registerFeedConsumption({ feedPurchaseId: pid, batchId: other, date: '2026-05-09', quantityKg: 10, period: 'DAILY' })).rejects.toThrow(/não está liberada/);
    await admin.removeFeedConsumption(cons.id);
    expect((await data.get('feed_purchases', pid))!.remainingKg).toBe(1000);
    expect(await data.get('batch_costs', cost.id)).toBeNull();
  });

  it('abate + OS + retorno total: rendimento, perdas e custo por kg', async () => {
    const s = await cattleSetup();
    const admin = opsAs(ADMIN);
    await admin.addBatchCost({ batchId: s.batchId, category: 'PURCHASE_FREIGHT', date: '2026-05-01', amount: 600 });
    const animals = await data.list('animals', { where: [['batchId', '==', s.batchId]] });
    await admin.registerSlaughter({
      batchId: s.batchId,
      date: '2026-08-01',
      slaughterhouseId: s.sh.id,
      carcassWeightKg: 660,
      animals: animals.map((a) => ({ animalId: a.id, exitWeightKg: 400, carcassWeightKg: 220 })),
      costs: [{ category: 'SLAUGHTER_FEE', amount: 540 }],
      rawOutputs: [
        { productId: s.traseiro.id, qty: 330 },
        { productId: s.dianteiro.id, qty: 330 },
      ],
    });
    const batch = (await data.get('batches', s.batchId))!;
    expect(batch.status).toBe('SLAUGHTERED');
    expect(batch.exitScaleWeightKg).toBe(1200);
    expect(batch.carcassYieldPercent).toBe(55);
    expect((await data.list('animals')).every((a) => a.status === 'SLAUGHTERED')).toBe(true);
    const raw = (await data.list('stock_lots')).filter((l) => l.stage === 'RAW');
    expect(raw).toHaveLength(2);
    expect(raw[0].unitCost).toBeCloseTo((9000 + 600 + 540) / 660, 3);

    const osId = await admin.createProcessingOrder({
      partnerId: s.proc.id,
      sentDate: '2026-08-02',
      items: raw.map((l) => ({ lotId: l.id, qty: l.balanceQty })),
      processingCost: 660,
      freightCost: 200,
    });
    let os = (await data.get('processing_orders', osId))!;
    expect(os.number).toBe('OS-2026-001');
    expect(os.batchId).toBe(s.batchId);
    expect(os.sentKg).toBe(660);
    expect((await data.list('stock_lots')).filter((l) => l.stage === 'RAW').every((l) => l.status === 'DEPLETED')).toBe(true);

    await admin.registerProcessingReturn(osId, {
      date: '2026-08-08',
      type: 'TOTAL',
      items: [
        { productId: s.picanha.id, qty: 100 },
        { productId: s.alcatra.id, qty: 200 },
        { productId: s.acem.id, qty: 180 },
      ],
      losses: { bonesKg: 120, fatKg: 40 },
    });
    os = (await data.get('processing_orders', osId))!;
    expect(os.status).toBe('COMPLETED');
    expect(os.returnedKg).toBe(480);
    expect(os.lossKg).toBe(180);
    expect(os.yieldPercent).toBe(72.73);
    expect(os.returns[0].unclassifiedKg).toBe(20);
    const losses = await data.list('stock_losses');
    expect(losses.map((l) => [l.reason, l.qty]).sort()).toEqual([
      ['DIVERGENCIA_PESAGEM', 20],
      ['OSSO', 120],
      ['SEBO_GORDURA', 40],
    ]);
    const cuts = (await data.list('stock_lots')).filter((l) => l.stage === 'FINISHED');
    const perKgSent = (9000 + 600 + 540 + 660 + 200) / 660;
    for (const c of cuts) {
      expect(c.unitCost).toBeCloseTo((perKgSent * 660) / 480, 2);
      expect(c.batchCode).toBe('L-2026-001');
      expect(c.expiryDate).toBe(c.productId === s.picanha.id ? null : '2026-11-06');
    }
    const totalCost = batchEconomics(batch, await data.list('batch_costs'), [], []).totalCost;
    expect(totalCost).toBe(11000);
    expect(cuts.reduce((s2, c) => s2 + c.initialQty * c.unitCost, 0)).toBeCloseTo(11000, 0);
  });

  it('cancelar OS devolve o saldo aos lotes', async () => {
    const s = await cattleSetup();
    const admin = opsAs(ADMIN);
    await admin.registerSlaughter({ batchId: s.batchId, date: '2026-08-01', slaughterhouseId: s.sh.id, carcassWeightKg: 600, rawOutputs: [{ productId: s.traseiro.id, qty: 600 }] });
    const lot = (await data.list('stock_lots'))[0];
    const osId = await admin.createProcessingOrder({ partnerId: s.proc.id, sentDate: '2026-08-02', items: [{ lotId: lot.id, qty: 250 }], processingCost: 100 });
    expect((await data.get('stock_lots', lot.id))!.balanceQty).toBe(350);
    expect((await data.list('batch_costs')).some((c) => c.source === 'PROCESSING')).toBe(true);
    await admin.cancelProcessingOrder(osId, 'Envio errado');
    expect((await data.get('stock_lots', lot.id))!.balanceQty).toBe(600);
    expect((await data.list('batch_costs')).some((c) => c.source === 'PROCESSING')).toBe(false);
    expect((await data.get('processing_orders', osId))!.status).toBe('CANCELLED');
  });
});

// ----------------------------------------------------------------------------
// Outras operações
// ----------------------------------------------------------------------------

describe('financeiro, estoque e cadastros', () => {
  it('parcelas: estorno de pagamento, refazer parcelas e editar pedido', async () => {
    const { product, customer } = await baseSetup();
    const admin = opsAs(ADMIN);
    await admin.addStockEntry({ productId: product.id, qty: 100, unitCost: 50, entryDate: '2026-09-01' });
    const sale = await admin.createSale({
      channel: 'INTERNAL',
      customerId: customer.id,
      date: '2026-09-01',
      deliveryMode: 'DELIVERY',
      paymentMethod: 'BOLETO',
      billingType: 'NF_BOLETO',
      paymentTerms: '30/60',
      freightValue: 20,
      sellerId: FINANCE.id,
      items: [{ kind: 'PRODUCT', productId: product.id, productName: 'Picanha', unit: 'KG', qtyOrdered: 10, unitPrice: 100 }],
    });
    expect(sale.totalValue).toBe(1020);
    expect(sale.sellerName).toBe(FINANCE.name);
    expect(sale.commissionValue).toBe(20); // 2% padrão das configurações (vendedor sem comissão no perfil), sobre os itens sem frete
    // edição antes da separação recalcula as parcelas
    const edited = await admin.updateSale(sale.id, {
      channel: 'INTERNAL',
      customerId: customer.id,
      date: '2026-09-01',
      deliveryMode: 'DELIVERY',
      paymentMethod: 'BOLETO',
      billingType: 'NF_BOLETO',
      paymentTerms: '30/60/90',
      freightValue: 0,
      items: [{ id: sale.items[0].id, kind: 'PRODUCT', productId: product.id, productName: 'Picanha', unit: 'KG', qtyOrdered: 12, unitPrice: 100 }],
    });
    expect(edited.items[0].id).toBe(sale.items[0].id);
    expect(edited.sellerId).toBe(FINANCE.id);
    expect(edited.commissionValue).toBe(24);
    let entries = (await entriesOf(sale.id)).sort((a, b) => a.installment - b.installment);
    expect(entries.map((e) => e.amount)).toEqual([400, 400, 400]);

    const fin = opsAs(FINANCE);
    await fin.payEntry(entries[0].id, { date: '2026-10-01', amount: 150 });
    let e0 = (await data.get('financial_entries', entries[0].id))!;
    expect(e0).toMatchObject({ paidAmount: 150, status: 'OPEN' });
    await expect(fin.payEntry(entries[0].id, { date: '2026-10-01', amount: 999 })).rejects.toThrow(/maior que o saldo/);
    await fin.reversePayment(entries[0].id, e0.payments[0].id, 'Pix devolvido');
    e0 = (await data.get('financial_entries', entries[0].id))!;
    expect(e0.paidAmount).toBe(0);
    expect(e0.payments[0].reversed).toBe(true);
    await fin.payEntry(entries[0].id, { date: '2026-10-01' });
    expect((await data.get('sales', sale.id))!.paymentStatus).toBe('PARTIAL');

    await fin.regenerateReceivables(sale.id, { installments: 2, firstDueDate: '2026-11-15', method: 'PIX' });
    entries = (await entriesOf(sale.id)).filter((e) => e.status === 'OPEN').sort((a, b) => a.installment - b.installment);
    expect(entries.map((e) => [e.amount, e.dueDate])).toEqual([
      [400, '2026-11-15'],
      [400, '2026-12-15'],
    ]);
    const s2 = (await data.get('sales', sale.id))!;
    expect(s2.paymentMethod).toBe('PIX');
    expect((await entriesOf(sale.id)).filter((e) => e.status === 'CANCELLED')).toHaveLength(2);
  });

  it('perda FIFO, ajuste, bloqueio e materiais', async () => {
    const { product } = await baseSetup();
    const admin = opsAs(ADMIN);
    const a = await admin.addStockEntry({ productId: product.id, qty: 5, unitCost: 40, entryDate: '2026-08-01', expiryDate: '2026-09-01' });
    const b = await admin.addStockEntry({ productId: product.id, qty: 10, unitCost: 60, entryDate: '2026-08-10', expiryDate: '2026-10-01' });
    await admin.registerLoss({ productId: product.id, qty: 7, origin: 'ESTOQUE', reason: 'AVARIA', date: '2026-09-02' });
    const loss = (await data.list('stock_losses'))[0];
    expect(loss.totalValue).toBe(5 * 40 + 2 * 60);
    expect((await data.get('stock_lots', a))!.status).toBe('DEPLETED');
    await expect(admin.registerLoss({ productId: product.id, qty: 50, origin: 'ESTOQUE', reason: 'AVARIA', date: '2026-09-02' })).rejects.toThrow(/Saldo insuficiente/);
    await admin.adjustLot(b, 7.5, 'Inventário');
    expect((await data.get('stock_lots', b))!.balanceQty).toBe(7.5);
    await admin.setLotBlocked(b, true, 'Laudo pendente');
    expect((await data.get('stock_lots', b))!.status).toBe('BLOCKED');
    await admin.setLotBlocked(b, false);
    expect((await data.get('stock_lots', b))!.status).toBe('AVAILABLE');
    const moves = await data.list('stock_movements', { where: [['lotId', '==', b]] });
    expect(moves.reduce((s, m) => s + m.qty, 0)).toBeCloseTo(7.5, 3);

    const bag = await data.insert('supply_items', { name: 'Sacola', category: 'EMBALAGEM', unit: 'UN', quantity: 0, unitCost: 5, sellable: true, active: true });
    await admin.registerSupplyMovement({ supplyItemId: bag.id, type: 'IN', quantity: 100, unitCost: 7, date: '2026-09-01' });
    expect((await data.get('supply_items', bag.id))!).toMatchObject({ quantity: 100, unitCost: 7 });
    await admin.registerSupplyMovement({ supplyItemId: bag.id, type: 'OUT', quantity: 30, date: '2026-09-02' });
    await expect(admin.registerSupplyMovement({ supplyItemId: bag.id, type: 'OUT', quantity: 80, date: '2026-09-02' })).rejects.toThrow(/Saldo insuficiente/);
    await admin.registerSupplyMovement({ supplyItemId: bag.id, type: 'ADJUST', quantity: 65, date: '2026-09-03' });
    const mv = await data.list('supply_movements');
    expect(mv.map((m) => m.balanceAfter).sort((x, y) => x - y)).toEqual([65, 70, 100]);
  });

  it('solicitação de cliente, portal, catálogo e link público', async () => {
    const { product } = await baseSetup();
    const admin = opsAs(ADMIN);
    const req = await data.insert('customer_requests', {
      name: 'Açougue Novo',
      personType: 'J',
      document: '11.444.777/0001-61',
      category: 'EXTERNO_CNPJ',
      status: 'PENDING',
      requestedById: EXTERNAL.id,
      requestedByName: EXTERNAL.name,
    });
    const cid = await admin.approveCustomerRequest(req.id, { creditLimit: 5000 });
    const c = (await data.get('customers', cid))!;
    expect(c).toMatchObject({ document: '11444777000161', sellerId: EXTERNAL.id, creditLimit: 5000, status: 'ACTIVE', financialApproval: 'PENDING', allowedPaymentMethods: ['PIX', 'BOLETO'] });
    expect((await data.get('customer_requests', req.id))!.status).toBe('APPROVED');
    await admin.setCustomerFinancialApproval(cid, 'APPROVED', 'Ok');
    expect((await data.get('customers', cid))!.financialApproval).toBe('APPROVED');

    const acc = await data.insert('portal_accounts', { id: 'acc-9', email: 'novo@teste.dev', name: 'Rafa', companyName: 'Empório Novo', personType: 'J', document: '45.723.174/0001-10', status: 'PENDING' });
    await admin.approvePortalAccount(acc.id, { createCustomer: true });
    const acc2 = (await data.get('portal_accounts', acc.id))!;
    expect(acc2.status).toBe('APPROVED');
    expect((await data.get('customers', acc2.customerId!))!.category).toBe('EXTERNO_CNPJ');
    await admin.setPortalAccountBlocked(acc.id, true);
    expect((await data.get('portal_accounts', acc.id))!.status).toBe('BLOCKED');

    const t = await data.insert('price_tables', { name: 'Portal', kind: 'PORTAL', status: 'ACTIVE', approvalStatus: 'DRAFT', items: [{ productId: product.id, productName: 'Picanha', unit: 'KG', price: 120 }] });
    await expect(admin.syncCatalogFromPriceTable(t.id)).rejects.toThrow(/Aprove/);
    await opsAs(EXTERNAL).submitPriceTable(t.id).catch((e) => expect(e.message).toMatch(/permissão/));
    await admin.submitPriceTable(t.id);
    await admin.approvePriceTable(t.id);
    expect(await admin.syncCatalogFromPriceTable(t.id)).toBe(1);
    expect(await admin.syncCatalogFromPriceTable(t.id)).toBe(1);
    const cat = await data.list('catalog_items');
    expect(cat).toHaveLength(1);
    expect(cat[0]).toMatchObject({ price: 120, minQty: 1, step: 0.5, available: true, category: 'Traseiro' });
    const link = await admin.publishCatalogLink({ title: 'Ofertas', showPrices: false });
    expect(link.id).toBe(link.token);
    expect(link.token).toMatch(/^[a-z0-9]{10}$/);
    expect(link.items[0].price).toBeNull();
    expect(link.whatsapp).toBe(DEFAULT_SETTINGS.whatsapp);
  });

  it('usuários: convite por e-mail e proteção do último administrador', async () => {
    await baseSetup();
    const admin = opsAs(ADMIN);
    await admin.inviteUser({ email: 'Novo.Vendedor@Teste.dev', name: 'Novo', role: 'SELLER', commissionRate: 2 });
    const inv = (await data.get('invites', 'novo.vendedor@teste.dev'))!;
    expect(inv).toMatchObject({ status: 'PENDING', role: 'SELLER' });
    await admin.inviteUser({ email: LOGISTICS.email, name: 'Léo', role: 'OPERATOR' });
    expect((await data.get('profiles', LOGISTICS.id))!.role).toBe('OPERATOR');
    await admin.revokeInvite(inv.id);
    expect((await data.get('invites', inv.id))!.status).toBe('REVOKED');
    await expect(admin.updateUser(ADMIN.id, { role: 'MANAGER' })).rejects.toThrow(/último administrador/);
    await expect(opsAs(FINANCE).inviteUser({ email: 'x@y.dev', name: 'X', role: 'ADMIN' })).rejects.toThrow(/permissão/);
    await admin.log('EXPORT', 'sales', null, 'Exportou vendas');
    expect((await data.list('audit_logs')).some((l) => l.summary === 'Exportou vendas')).toBe(true);
  });

  it('equinos: venda parcelada, cancelamento e doses de sêmen', async () => {
    await baseSetup();
    const admin = opsAs(ADMIN);
    const eq = await data.insert('equines', { name: 'Relâmpago', sex: 'GARANHAO', breed: 'Quarto de Milha', status: 'ACTIVE', photos: [] });
    const sid = await admin.registerEquineSale({ equineId: eq.id, buyerName: 'Haras X', date: '2026-07-01', totalPrice: 10000, plan: { installments: 4, method: 'PIX' } });
    const e = await data.list('financial_entries', { where: [['equineSaleId', '==', sid]] });
    expect(e.map((x) => x.amount)).toEqual([2500, 2500, 2500, 2500]);
    expect(e.every((x) => x.category === 'EQUINE_SALE' && x.direction === 'IN')).toBe(true);
    expect((await data.get('equines', eq.id))!.status).toBe('SOLD');
    await opsAs(FINANCE).payEntry(e[0].id, { date: '2026-07-01' });
    await admin.cancelEquineSale(sid, 'Desistência');
    const after = await data.list('financial_entries', { where: [['equineSaleId', '==', sid]] });
    expect(after.filter((x) => x.status === 'CANCELLED')).toHaveLength(3);
    expect((await data.get('equines', eq.id))!.status).toBe('ACTIVE');

    const pid = await admin.registerSemenPurchase({ stallionName: 'Astro', supplierName: 'Central Y', purchaseDate: '2026-07-01', dosesQuantity: 3, totalValue: 3000, storageType: 'CONGELADO', plan: { terms: '30/60' } });
    expect(await data.list('financial_entries', { where: [['semenPurchaseId', '==', pid]] })).toHaveLength(2);
    await admin.useSemenDoses(pid, { date: '2026-07-10', doses: 2, mareName: 'Égua A' });
    await expect(admin.useSemenDoses(pid, { date: '2026-07-11', doses: 2 })).rejects.toThrow(/Doses insuficientes: disponível 1/);
    await admin.useSemenDoses(pid, { date: '2026-07-12', doses: 1 });
    expect((await data.get('semen_purchases', pid))!).toMatchObject({ dosesAvailable: 0, status: 'DEPLETED' });
  });

  it('importação de custos em lote e remoção com conta a pagar', async () => {
    const { batchId } = await cattleSetup();
    const admin = opsAs(ADMIN);
    const rows = Array.from({ length: 450 }, (_, i) => ({ batchId, category: 'LABOR' as const, date: '2026-05-10', amount: 10 + i }));
    expect(await admin.importBatchCosts(rows)).toBe(450);
    expect((await data.list('batch_costs')).filter((c) => c.source === 'IMPORT')).toHaveLength(450);
    const costId = await admin.addBatchCost({ batchId, category: 'VETERINARY', date: '2026-05-11', amount: 900, createPayable: { terms: '30/60' } });
    const payables = (await data.list('financial_entries')).filter((x) => x.category === 'SERVICES');
    expect(payables).toHaveLength(2);
    await admin.removeBatchCost(costId);
    expect(await data.get('batch_costs', costId)).toBeNull();
    expect((await data.list('financial_entries')).filter((x) => x.category === 'SERVICES').every((x) => x.status === 'CANCELLED')).toBe(true);
  });
});

// ----------------------------------------------------------------------------
// Demonstração
// ----------------------------------------------------------------------------

describe('carga de demonstração', () => {
  it('roda rápido, é coerente e determinística', async () => {
    const { seedDemo, DEMO_USERS } = await import('../src/shared/demo');
    const mem = new MemoryData();
    const t0 = Date.now();
    const summary = await seedDemo(mem);
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(5000);
    expect(summary.sales).toBeGreaterThanOrEqual(90);
    expect(summary.customers).toBeGreaterThanOrEqual(30);
    expect(summary.products).toBe(30);
    expect(summary.batches).toBe(4);

    const d = mem.dump() as Record<string, any[]>;
    const count = (arr: any[], f: (x: any) => unknown) => arr.reduce((m: Record<string, number>, x) => ((m[String(f(x))] = (m[String(f(x))] || 0) + 1), m), {});
    const st = count(d.sales, (s) => s.status);
    for (const s of ['DELIVERED', 'PENDING_APPROVAL', 'APPROVED', 'PICKING', 'READY', 'DISPATCHED', 'AWAITING_CUSTOMER', 'DRAFT']) expect(st[s]).toBeGreaterThan(0);
    expect(st.CANCELLED).toBe(2);
    const ch = count(d.sales, (s) => s.channel);
    expect(ch.PORTAL).toBeGreaterThanOrEqual(8);
    expect(ch.EXTERNAL_SELLER).toBe(5);
    expect(ch.INTERCOMPANY).toBe(6);
    expect(d.sales.some((s) => s.paymentStatus === 'RECEIPT_SENT')).toBe(true);
    expect(d.sales.some((s) => s.paymentMethod === 'BONUS') && d.sales.some((s) => s.paymentMethod === 'SAMPLE')).toBe(true);
    expect(d.sales.every((s) => !s.stockShortKg)).toBe(true);
    const months = count(d.sales, (s) => s.date.slice(0, 7));
    expect(months['2026-09']).toBeGreaterThan(months['2026-04']);

    expect(d.batches.map((b) => [b.code, b.status]).sort()).toEqual([
      ['L-2026-001', 'FINISHED'],
      ['L-2026-002', 'SLAUGHTERED'],
      ['L-2026-003', 'IN_PASTURE'],
      ['L-2026-004', 'PURCHASED'],
    ]);
    expect(d.processing_orders.map((o) => o.status).sort()).toEqual(['COMPLETED', 'COMPLETED', 'PARTIAL']);
    expect(d.customers.find((c) => c.name.startsWith('Bar e Petiscaria')).status).toBe('BLOCKED');
    expect(d.customers.filter((c) => c.isIntercompany)).toHaveLength(3);
    expect(d.financial_entries.some((e) => e.direction === 'IN' && e.status === 'OPEN' && e.dueDate < '2026-09-30')).toBe(true);
    expect(d.price_tables.filter((t) => t.approvalStatus === 'APPROVED')).toHaveLength(4);
    expect(d.price_tables.filter((t) => t.approvalStatus === 'PENDING')).toHaveLength(1);
    expect(count(d.portal_accounts, (a) => a.status)).toEqual({ APPROVED: 2, PENDING: 1 });
    expect(d.customer_requests.filter((r) => r.status === 'PENDING')).toHaveLength(2);
    expect(d.invites.filter((i) => i.status === 'PENDING')).toHaveLength(1);
    expect(d.public_catalog_links).toHaveLength(1);
    expect(d.catalog_items.length).toBeGreaterThanOrEqual(18);
    expect(d.supply_items.some((s) => s.quantity < (s.minQuantity || 0))).toBe(true);
    expect(d.equines).toHaveLength(6);
    expect(d.equines.some((e) => e.status === 'PREGNANT') && d.equines.some((e) => e.status === 'SOLD')).toBe(true);
    expect(d.semen_purchases).toHaveLength(2);
    expect(d.tasks).toHaveLength(8);
    expect(d.stock_lots.some((l) => l.origin === 'INTERCOMPANY' && l.originCompany === 'GRTB')).toBe(true);

    // Razão de estoque confere com os saldos dos lotes
    const byLot = new Map<string, number>();
    for (const m of d.stock_movements) byLot.set(m.lotId, (byLot.get(m.lotId) || 0) + m.qty);
    for (const l of d.stock_lots) expect(Math.abs((byLot.get(l.id) || 0) - l.balanceQty)).toBeLessThan(0.01);
    // Contas a receber batem com o total de cada pedido aprovado
    for (const s of d.sales) {
      if (['BONUS', 'SAMPLE'].includes(s.paymentMethod) || ['DRAFT', 'PENDING_APPROVAL', 'CANCELLED', 'REJECTED'].includes(s.status)) continue;
      const sum = d.financial_entries.filter((e) => e.saleId === s.id && e.status !== 'CANCELLED').reduce((a, e) => a + e.amount, 0);
      expect(Math.abs(sum - s.totalValue)).toBeLessThan(0.01);
    }

    // DRE do lote vendido
    const b1 = d.batches.find((b) => b.code === 'L-2026-001');
    const econ = batchEconomics(b1, d.batch_costs, d.animals, d.stock_movements);
    const cutsKg = d.stock_lots.filter((l) => l.batchId === b1.id && l.stage === 'FINISHED').reduce((a, l) => a + l.initialQty, 0);
    expect(econ.revenueSource).toBe('REALIZED');
    expect(econ.soldKg).toBeGreaterThan(cutsKg * 0.8);
    expect(econ.profit).toBeGreaterThan(0);
    expect(econ.marginPercent).toBeGreaterThan(10);
    expect(econ.marginPercent).toBeLessThan(70);
    expect(econ.costPerCarcassKg).toBeGreaterThan(12);
    expect(econ.costPerCarcassKg).toBeLessThan(25);

    // Acessos de demonstração existem
    expect(DEMO_USERS).toHaveLength(10);
    for (const u of DEMO_USERS) {
      const found = d.profiles.some((p) => p.email === u.email) || d.portal_accounts.some((a) => a.email === u.email && a.status === 'APPROVED');
      expect(found, u.email).toBe(true);
      expect(u.email.endsWith('@demo.aurusprime.com')).toBe(true);
    }

    // Determinística
    const again = new MemoryData();
    await seedDemo(again);
    const sig = (x: Record<string, any[]>) => x.sales.map((s) => `${s.id}:${s.number}:${s.totalValue}:${s.status}`).sort().join('|');
    expect(sig(again.dump() as Record<string, any[]>)).toBe(sig(d));
  }, 30000);
});
