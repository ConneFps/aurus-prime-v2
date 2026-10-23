import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/shared/app/settings';
import { createMemoryBackend } from '../src/shared/data/memory';
import type { MemoryData } from '../src/shared/data/memory';
import { round2, round3 } from '../src/shared/domain/format';
import type { TableName } from '../src/shared/domain/schema';
import { importPlan } from '../src/shared/migration/importer';
import { cutsMatch, day, isoDateTime, num } from '../src/shared/migration/legacy-utils';
import { transformLegacy, type MigrationPlan } from '../src/shared/migration/transform';
import { createOps, type Actor } from '../src/shared/ops';
import dump from './fixtures/legacy-dump.json';

const ADMIN: Actor = { id: 'u-admin', name: 'Ana Admin', email: 'admin@mvgbalimentacao.com', role: 'ADMIN' };
const NOW = '2026-09-30T18:00:00.000Z';

const legacy = dump as unknown as Record<string, Record<string, unknown>[]>;
const plan = (opts = {}) => transformLegacy(dump as never, { now: NOW, ...opts });

async function sizes(data: MemoryData) {
  const out: Record<string, number> = {};
  for (const [t, m] of data.store) if (m.size) out[t] = m.size;
  return out;
}

// ----------------------------------------------------------------------------
// Utilitários de leitura tolerante
// ----------------------------------------------------------------------------

describe('leitura tolerante', () => {
  it('números e datas em formatos do sistema antigo', () => {
    expect(num('1.234,56')).toBe(1234.56);
    expect(num('20,250')).toBe(20.25);
    expect(num('abc')).toBeNull();
    expect(day('2026-04-02T01:30:00.000Z')).toBe('2026-04-01'); // fuso de Brasília
    expect(day('27/05/2026')).toBe('2026-05-27');
    expect(day({ seconds: 1777000000, nanoseconds: 0 })).toBe('2026-04-24');
    expect(isoDateTime('30/04/2026, 15:20:00')).toBe('2026-04-30T18:20:00.000Z');
    expect(cutsMatch('Picanha Angus', 'picanha')).toBe(true);
    expect(cutsMatch('Bife de Chorizo', 'chorizo')).toBe(true);
    expect(cutsMatch('Acém', 'Alcatra')).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// Transformação
// ----------------------------------------------------------------------------

describe('transformLegacy', () => {
  const p = plan();
  const t = p.tables;

  it('é determinística', () => {
    expect(JSON.stringify(plan())).toBe(JSON.stringify(p));
  });

  it('contagens por tabela', () => {
    expect(p.counts).toMatchObject({
      partners: 3, // fornecedor + frigorífico + processador citado só pelo nome
      invites: 5,
      products: 7, // 4 do antigo + Fraldinha, Maminha, Traseiro
      batches: 3,
      animals: 3,
      batch_costs: 15,
      stock_lots: 8,
      stock_movements: 8,
      customers: 5, // 3 + 2 provisórios
      sales: 10, // 8 vendas + 2 pedidos do portal
      financial_entries: 14,
      portal_accounts: 2,
      catalog_items: 2,
      freight_zones: 2,
      processing_orders: 2,
      stock_losses: 2,
      equines: 2,
      equine_events: 10,
      equine_sales: 1,
      semen_purchases: 1,
      supply_movements: 2,
      feed_consumptions: 1,
      deleted_sales: 1,
      tasks: 2,
      audit_logs: 2,
      counters: 5,
      settings: 1,
    });
    expect(p.unmapped).toEqual(['colecao_misteriosa']);
    expect(p.ignored.join(' ')).toContain('registered_tags');
    expect(p.warnings.length).toBeGreaterThan(5);
  });

  it('lotes: código, animais e custos', () => {
    const b1 = t.batches!.find((b) => b.id === 'b-1')!;
    expect(b1.code).toBe('L-2026-001');
    expect(b1.headCount).toBe(3);
    expect(b1.purchaseWeightKg).toBe(1205.5);
    expect(b1.carcassWeightKg).toBe(780);
    expect(b1.supplierId).toBe('sel-1');
    expect(t.batches!.find((b) => b.id === 'b-2')).toMatchObject({ code: 'L-2026-002', headCount: 25, managementType: 'CONFINAMENTO' });
    expect(t.batches!.find((b) => b.id === 'b-3')!.code).toBe('L-2025-001');
    expect(t.animals!.map((a) => a.id)).toEqual(['b-1-a1', 'b-1-a2', 'b-1-a3']);
    expect(t.animals![2].tag).toBe('S/N-3');
    const costs = t.batch_costs!.filter((c) => c.batchId === 'b-1');
    expect(costs).toHaveLength(14);
    expect(round2(costs.reduce((s, c) => s + c.amount, 0))).toBe(13178);
    expect(costs.find((c) => c.id === 'b-1-c-freightCost')!.category).toBe('PURCHASE_FREIGHT');
    expect(costs.find((c) => c.id === 'b-1-c-slaughterReturn')!.category).toBe('SLAUGHTER_RETURN');
    expect(t.batch_costs!.find((c) => c.id === 'b-2-c-purchasePrice')!.amount).toBe(150000);
    expect(costs.every((c) => c.source === 'MIGRATION')).toBe(true);
  });

  it('estoque por corte = saldo do sistema antigo', () => {
    const legacyByCut = new Map<string, number>();
    for (const i of legacy.inventory) {
      if (i.status !== 'IN_STOCK' || i.isSlaughterEntry) continue;
      const k = /picanha/i.test(String(i.cutType)) ? 'Picanha' : String(i.cutType);
      legacyByCut.set(k, round3((legacyByCut.get(k) || 0) + (num(i.weightKg) || 0)));
    }
    const newByCut = new Map<string, number>();
    for (const l of t.stock_lots!) {
      if (l.status !== 'AVAILABLE' || l.stage !== 'FINISHED') continue;
      newByCut.set(l.productName, round3((newByCut.get(l.productName) || 0) + l.balanceQty));
    }
    expect(Object.fromEntries(newByCut)).toEqual(Object.fromEntries(legacyByCut));
    expect(Object.fromEntries(newByCut)).toEqual({ Picanha: 25, Acém: 20.25, Fraldinha: 8 });
    const raw = t.stock_lots!.find((l) => l.id === 'inv-6')!;
    expect(raw).toMatchObject({ stage: 'RAW', batchId: 'b-1', productName: 'Traseiro', balanceQty: 380 });
    expect(t.stock_lots!.find((l) => l.id === 'inv-2')).toMatchObject({ origin: 'INTERCOMPANY', originCompany: 'GRTB', lotCode: 'L101' });
    // Razão: soma dos movimentos de cada lote = saldo do lote.
    for (const l of t.stock_lots!) {
      const sum = round3(t.stock_movements!.filter((m) => m.lotId === l.id).reduce((s, m) => s + m.qty, 0));
      expect(sum).toBe(l.balanceQty);
    }
  });

  it('vendas: números sem colisão, status e itens', () => {
    const s = (id: string) => t.sales!.find((x) => x.id === id)!;
    const numbers = t.sales!.map((x) => x.number);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(s('sale-1')).toMatchObject({ number: '20260001', status: 'DELIVERED', paymentStatus: 'PARTIAL', freightValue: 25, itemsSubtotal: 1250, totalValue: 1275, billingType: 'NF_BOLETO', paymentMethod: 'BOLETO', stockDeducted: true });
    expect(s('sale-1').items.map((i) => [i.id, i.kind])).toEqual([
      ['sale-1-i1', 'PRODUCT'],
      ['sale-1-i2', 'SUPPLY'],
      ['sale-1-i3', 'FREIGHT'],
    ]);
    expect(s('sale-1').items[0]).toMatchObject({ lotId: 'inv-1', productId: 'prod-picanha', qty: 10, unitPrice: 120 });
    expect(s('sale-1').items[1].supplyItemId).toBe('sup-sacola');
    expect(s('sale-2')).toMatchObject({ number: '20260006', status: 'PENDING_APPROVAL', discountValue: 7.5, totalValue: 142.5 });
    expect(s('sale-3')).toMatchObject({ number: '20260007', status: 'APPROVED', paymentStatus: 'PAID' }); // número repetido renumerado
    expect(s('sale-4')).toMatchObject({ channel: 'EXTERNAL_SELLER', sellerId: 'uid-renato', paymentStatus: 'PAID', status: 'DELIVERED' });
    expect(s('sale-5')).toMatchObject({ status: 'REJECTED', paymentMethod: 'BONUS', customerId: 'cust-apagado' });
    expect(s('sale-7')).toMatchObject({ channel: 'INTERCOMPANY', paymentMethod: 'SAMPLE', paymentStatus: 'PAID' });
    expect(s('sale-7').notes).toContain('TK-77');
    expect(s('pord-1')).toMatchObject({ channel: 'PORTAL', number: '20260009', status: 'DELIVERED', paymentStatus: 'PAID', portalAccountId: 'puid-1', totalValue: 297.79 });
    expect(s('pord-2')).toMatchObject({ number: '20260010', status: 'READY', customerId: 'pc-puid-2', deliveryMode: 'PICKUP' });
    expect(t.counters!.find((c) => c.id === 'sale-2026')!.value).toBe(10);
    expect(t.counters!.find((c) => c.id === 'sale-2025')!.value).toBe(12);
    expect(t.counters!.find((c) => c.id === 'processing-2026')!.value).toBe(2);
    expect(t.counters!.find((c) => c.id === 'batch-2026')!.value).toBe(2);
  });

  it('financeiro: contas em aberto = parcelas não pagas; baixas com data/usuário', () => {
    const e = t.financial_entries!;
    const openIn = round2(e.filter((x) => x.direction === 'IN' && x.status === 'OPEN').reduce((s, x) => s + x.amount, 0));
    // sale-1 parcela 2 + sale-8 (2 parcelas) + pedido do portal aguardando pagamento + 2 parcelas da venda do equino
    expect(openIn).toBe(637.5 + 420 + 70 + 60000);
    expect(round2(e.filter((x) => x.direction === 'OUT' && x.status === 'OPEN').reduce((s, x) => s + x.amount, 0))).toBe(2500);
    const p1 = e.find((x) => x.id === 'sale-1-p1')!;
    expect(p1).toMatchObject({ status: 'PAID', paidAt: '2026-04-30', documentNumber: 'BOL-1-1' });
    expect(p1.payments[0]).toMatchObject({ byName: 'financeiro@mvgbalimentacao.com', at: '2026-04-30T18:20:00.000Z' });
    expect(e.find((x) => x.id === 'sale-3-p1')!.paidAt).toBe('2026-05-15'); // de financial_transactions
    expect(e.find((x) => x.id === 'sale-4-p2')!.paidAt).toBe('2026-07-02'); // de financial_transactions (parcela sem data)
    expect(e.find((x) => x.id === 'eq-1-sale-p1')!.paidAt).toBe('2026-07-15');
    expect(e.some((x) => x.saleId === 'sale-2' || x.saleId === 'sale-5' || x.saleId === 'sale-7')).toBe(false);
  });

  it('clientes, convites, portal e configurações', () => {
    const c1 = t.customers!.find((c) => c.id === 'cust-1')!;
    expect(c1).toMatchObject({ document: '11222333000181', zipCode: '13010100', state: 'SP', financialApproval: 'APPROVED', priceTableId: 'pt-1', ordersCount: 5, ranking: 'BRONZE', stars: 2 });
    expect(c1.totalPurchases).toBe(2957.79);
    expect(c1.allowedPaymentMethods).toEqual(['BOLETO', 'PIX', 'CASH']);
    expect(c1.documents).toHaveLength(1); // o base64 não migra
    expect(t.customers!.find((c) => c.id === 'cust-2')!.financialApproval).toBe('PENDING');
    expect(t.customers!.find((c) => c.id === 'cust-3')).toMatchObject({ isIntercompany: true, intercompanyCode: 'GRTB' });
    const inv = Object.fromEntries(t.invites!.map((i) => [i.id, i]));
    expect(inv['admin@mvgbalimentacao.com'].role).toBe('ADMIN');
    expect(inv['operador@mvgbalimentacao.com'].role).toBe('OPERATOR');
    expect(inv['renato@gmail.com']).toMatchObject({ role: 'EXTERNAL_SELLER', commissionRate: 3, status: 'PENDING' });
    expect(inv['bloqueado@gmail.com']).toMatchObject({ status: 'REVOKED', commissionRate: 2.5 });
    expect(t.portal_accounts!.find((a) => a.id === 'puid-1')).toMatchObject({ email: 'cliente@restaurante.com', customerId: 'cust-1', personType: 'J' });
    expect(t.customer_requests![0]).toMatchObject({ personType: 'J', category: 'EXTERNO_CNPJ', zipCode: '13000000', district: 'Centro' });
    expect(p.settingsPatch).toMatchObject({ freeFreightAbove: 800, deliveryCutoffHour: 15, weekendPolicy: 'NEXT_FRIDAY', deliveryBlockedDates: ['2026-12-25', '2027-01-01'] });
    expect(t.settings![0]).not.toHaveProperty('bootstrapped');
    expect(t.public_catalog_links![0]).toMatchObject({ token: 'tok-abc123', expiresAt: '2026-06-30', items: [{ name: 'Picanha', price: 129.9 }] });
  });

  it('equinos e sêmen', () => {
    expect(t.equines!.find((e) => e.id === 'eq-1')).toMatchObject({ status: 'SOLD', sex: 'GARANHAO', registry: 'ABQM-1' });
    expect(t.equines!.find((e) => e.id === 'eq-2')).toMatchObject({ status: 'PREGNANT', sex: 'EGUA', expectedFoalingDate: '2026-12-25' });
    const types = t.equine_events!.map((e) => e.type).sort();
    expect(types).toEqual(['COMPETITION', 'EXPENSE', 'FARRIER', 'HEALTH', 'HEALTH', 'REVENUE', 'SEMEN_COLLECTION', 'STAY', 'TRAINING', 'TRANSPORT']);
    expect(t.equine_events!.find((e) => e.id === 'eq-1-h-hh2')!.data.kind).toBe('VERMIFUGO');
    expect(t.semen_purchases![0]).toMatchObject({ dosesAvailable: 6, totalValue: 5000, paymentMethod: 'BOLETO' });
  });

  it('PostgreSQL: ids de usuários antigos não são mantidos', () => {
    const pg = plan({ keepLegacyUserIds: false });
    expect(pg.tables.sales!.find((s) => s.id === 'sale-4')!.sellerId).toBeNull();
    expect(pg.tables.sales!.find((s) => s.id === 'pord-1')!.portalAccountId).toBeNull();
    expect(pg.warnings.join('\n')).toContain('se cadastrar de novo');
  });
});

// ----------------------------------------------------------------------------
// Importação num banco em memória + operações novas sobre os dados migrados
// ----------------------------------------------------------------------------

describe('importPlan (MemoryData)', () => {
  let data: MemoryData;
  let p: MigrationPlan;

  beforeAll(async () => {
    data = createMemoryBackend().data;
    await data.insert('settings', { ...DEFAULT_SETTINGS, id: 'main', companyName: 'Minha Empresa', bootstrapped: true });
    await data.insert('profiles', { id: 'u-admin', email: 'admin@mvgbalimentacao.com', name: 'Ana Admin', role: 'ADMIN', active: true });
    await data.insert('counters', { id: 'sale-2026', value: 50 });
    p = plan();
  });

  it('grava tudo, preserva configurações e contadores maiores', async () => {
    const progress: string[] = [];
    const r = await importPlan(data, p, (x) => progress.push(`${x.table}:${x.phase}`));
    expect(r.ok).toBe(true);
    expect(r.failed).toBe(0);
    expect(r.written).toBe(Object.values(p.counts).reduce((s, n) => s + (n || 0), 0));
    expect(progress[0]).toBe('settings:start');
    expect(progress).toContain('financial_entries:done');
    const s = await data.get('settings', 'main');
    expect(s).toMatchObject({ bootstrapped: true, companyName: 'Minha Empresa', freeFreightAbove: 800, pickupAddress: 'Rua do Frigorífico, 100' });
    expect((await data.get('counters', 'sale-2026'))!.value).toBe(50); // nunca diminui
    expect((await data.get('counters', 'sale-2025'))!.value).toBe(12);
    expect(await data.get('invites', 'admin@mvgbalimentacao.com')).toMatchObject({ status: 'ACCEPTED', profileId: 'u-admin' });
    expect((await data.list('profiles')).length).toBe(1); // a migração não cria perfis
    const count = async (t: TableName) => (await data.list(t)).length;
    expect(await count('sales')).toBe(10);
    expect(await count('sale_items')).toBe(13);
    expect(await count('financial_entries')).toBe(14);
  });

  it('reimportar não duplica', async () => {
    const before = await sizes(data);
    const r = await importPlan(data, plan());
    expect(r.ok).toBe(true);
    expect(await sizes(data)).toEqual(before);
  });

  it('operações novas funcionam sobre os dados migrados', async () => {
    const ops = createOps({ data, actor: ADMIN });

    // Recebimento numa parcela migrada
    await ops.payEntry('sale-8-p1', { date: '2026-10-01', method: 'BOLETO' });
    expect(await data.get('financial_entries', 'sale-8-p1')).toMatchObject({ status: 'PAID', paidAmount: 210, paidAt: '2026-10-01' });
    expect((await data.get('sales', 'sale-8'))!.paymentStatus).toBe('PARTIAL');

    // Cancelamento de um pedido migrado (já entregue, parcialmente pago)
    await ops.cancelSale('sale-1', 'teste');
    const sale = (await data.get('sales', 'sale-1'))!;
    expect(sale.status).toBe('CANCELLED');
    expect(sale.paymentStatus).toBe('PAID'); // a parcela já recebida permanece
    expect((await data.get('financial_entries', 'sale-1-p2'))!.status).toBe('CANCELLED');
    expect((await data.get('financial_entries', 'sale-1-p1'))!.status).toBe('PAID');
    const c1 = (await data.get('customers', 'cust-1'))!;
    expect(c1.ordersCount).toBe(4);
    expect(c1.totalPurchases).toBe(round2(2957.79 - 1275));
  });
});
