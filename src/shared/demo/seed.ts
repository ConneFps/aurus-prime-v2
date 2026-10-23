/**
 * Carga de demonstração — simula abril→setembro/2026 dia a dia chamando as
 * PRÓPRIAS operações de negócio (o que também as exercita). Determinística:
 * mesmo PRNG, mesmos dados, mesmos ids.
 */
import type { DataApi, NewRow } from '../data/api';
import { addDays, parseISODate, round2, round3 } from '../domain/format';
import type { Row, TableName } from '../domain/schema';
import type {
  Attachment,
  BillingType,
  Customer,
  Equine,
  FeedType,
  FinancialEntry,
  Partner,
  PaymentMethod,
  PortalAccount,
  PriceTable,
  Product,
  Profile,
  Sale,
  StockOrigin,
  SupplyItem,
} from '../domain/types';
import { createOps, type Actor, type Ops, type SaleItemInput } from '../ops';
import { resetOpsEnv, setOpsEnv } from '../ops/impl/common';
import {
  CUSTOMER_SEEDS,
  SEGMENT_MIX,
  makeIdGen,
  makeRng,
  type CustomerSeed,
  type ProfileSeed,
  DEMO_TODAY,
  START,
  bizDays,
  isWeekend,
  nextBiz,
  prevBiz,
} from './seed-data';
import type { Section } from './seed-farm';
import { scheduleOperations } from './seed-calendar';
import { seedEquines, seedMasterData, seedTasks } from './seed-master';

type ActorKey = ProfileSeed['key'] | 'acc1' | 'acc2' | 'acc3';
type EquineKey = 'imperador' | 'trovao' | 'estrela' | 'aurora' | 'faisca' | 'duquesa';

interface Plan {
  day: string;
  hour: number;
  customer: string;
  creator: ActorKey;
  kind: 'NORMAL' | 'PORTAL' | 'IC';
  stopAt?: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'PICKING' | 'READY' | 'DISPATCHED' | 'AWAITING_CUSTOMER' | 'RECEIPT_SENT';
  cancel?: 'AFTER_PICK' | 'BEFORE_PICK';
  cancelReason?: string;
  method?: PaymentMethod;
  items?: [string, number][];
  deliveryMode?: 'DELIVERY' | 'PICKUP';
  pickSameDay?: boolean;
  notes?: string;
}

interface Ev {
  hour: number;
  seq: number;
  fn: () => Promise<unknown>;
}

export interface DemoSummary {
  sales: number;
  customers: number;
  products: number;
  batches: number;
  stockLots: number;
  financialEntries: number;
  auditLogs: number;
}

export { DEMO_TODAY } from './seed-data';

export class Seeder {
  readonly rng = makeRng(20260930);
  private readonly idGen = makeIdGen(19);
  private clockMs = 0;
  private currentDay = START;
  private currentHour = 0;
  companyDocument = '';
  profiles = {} as Record<ProfileSeed['key'], Profile>;
  partners: Record<string, Partner> = {};
  products: Record<string, Product> = {};
  customers: Record<string, Customer> = {};
  cseed: Record<string, CustomerSeed> = {};
  supplies: Record<string, SupplyItem> = {};
  feedTypes: Record<string, FeedType> = {};
  tables: Record<string, PriceTable> = {};
  tablePrices: Record<string, Map<string, number>> = {};
  accounts = {} as Record<'acc1' | 'acc2' | 'acc3', PortalAccount>;
  equines = {} as Record<EquineKey, Equine>;
  batches: Record<string, string> = {};
  private agenda = new Map<string, Ev[]>();
  private seq = 0;
  private reserved = new Map<string, number>();
  private saleCustomer = new Map<string, string>();
  private portalSales = new Set<string>();
  private payPlan = new Map<string, string | null>();
  private opsCache = new Map<string, Ops>();
  private invoiceSeq = 12040;
  processing: Record<string, { id: string; sent: { name: Section; qty: number }[] }> = {};

  constructor(readonly data: DataApi) {}

  // --------------------------------------------------------------------------
  // Infra
  // --------------------------------------------------------------------------

  id = () => this.idGen();
  iso = () => new Date(this.clockMs).toISOString();

  at(day: string, hour: number) {
    const d = parseISODate(day)!;
    const h = Math.floor(hour);
    d.setHours(h, Math.round((hour - h) * 60), 0, 0);
    this.clockMs = d.getTime();
    this.currentDay = day;
    this.currentHour = hour;
  }

  async ins<K extends TableName>(table: K, row: NewRow<K>): Promise<Row<K>> {
    const now = this.iso();
    return this.data.insert(table, { ...row, id: row.id || this.id(), createdAt: row.createdAt || now, updatedAt: row.updatedAt || now } as NewRow<K>);
  }

  actor(key: ActorKey): Actor {
    if (key === 'acc1' || key === 'acc2' || key === 'acc3') {
      const a = this.accounts[key];
      return { id: a.id, name: a.name, email: a.email, role: 'CUSTOMER' };
    }
    const p = this.profiles[key];
    return { id: p.id, name: p.name, email: p.email, role: p.role };
  }

  ops(key: ActorKey): Ops {
    let o = this.opsCache.get(key);
    if (!o) {
      o = createOps({ data: this.data, actor: this.actor(key) });
      this.opsCache.set(key, o);
    }
    return o;
  }

  /** Agenda uma ação (ignorada se cair depois de "hoje"). */
  on(day: string, hour: number, fn: () => Promise<unknown>) {
    if (day > DEMO_TODAY) return;
    if (day < this.currentDay) day = this.currentDay;
    if (day === this.currentDay && hour <= this.currentHour) hour = this.currentHour + 0.05;
    const list = this.agenda.get(day) || [];
    list.push({ hour: Math.min(hour, 23.9), seq: this.seq++, fn });
    this.agenda.set(day, list);
  }

  private async runDay(day: string) {
    const done = new Set<Ev>();
    for (;;) {
      const list = this.agenda.get(day) || [];
      const next = list.filter((e) => !done.has(e)).sort((a, b) => a.hour - b.hour || a.seq - b.seq)[0];
      if (!next) break;
      done.add(next);
      this.at(day, next.hour);
      await next.fn();
    }
    this.agenda.delete(day);
  }

  // --------------------------------------------------------------------------
  // Execução
  // --------------------------------------------------------------------------

  async run(): Promise<DemoSummary> {
    setOpsEnv({ now: () => new Date(this.clockMs), id: this.id });
    this.at(START, 7);
    await seedMasterData(this);
    await seedEquines(this);
    scheduleOperations(this);
    for (const plan of this.buildPlans()) this.on(plan.day, plan.hour, () => this.startPlan(plan));
    for (let d = START; d <= DEMO_TODAY; d = addDays(d, 1)) {
      this.at(d, 0);
      if (!isWeekend(d)) this.on(d, 18, () => this.payDue(d));
      await this.runDay(d);
    }
    this.at(DEMO_TODAY, 19);
    await seedTasks(this);
    const count = async (t: TableName) => (await this.data.list(t)).length;
    return {
      sales: await count('sales'),
      customers: await count('customers'),
      products: await count('products'),
      batches: await count('batches'),
      stockLots: await count('stock_lots'),
      financialEntries: await count('financial_entries'),
      auditLogs: await count('audit_logs'),
    };
  }

  // --------------------------------------------------------------------------
  // Vendas
  // --------------------------------------------------------------------------

  private buildPlans(): Plan[] {
    const { rng } = this;
    const plans: Plan[] = [];
    const add = (p: Plan) => plans.push(p);
    (
      [
        ['2026-04-22', 'ic-mvgb'],
        ['2026-05-20', 'ic-grtb'],
        ['2026-06-17', 'ic-girassol'],
        ['2026-07-15', 'ic-mvgb'],
        ['2026-08-19', 'ic-grtb'],
        ['2026-09-16', 'ic-girassol'],
      ] as const
    ).forEach(([day, customer]) => add({ day, hour: 9.5, customer, creator: 'manager', kind: 'IC' }));
    (
      [
        ['2026-08-05', 'bistro'],
        ['2026-08-19', 'mariana'],
        ['2026-08-27', 'bistro'],
        ['2026-09-09', 'bistro'],
        ['2026-09-16', 'mariana'],
        ['2026-09-23', 'bistro', 'RECEIPT_SENT'],
        ['2026-09-25', 'mariana', 'READY'],
        ['2026-09-28', 'bistro', 'READY'],
        ['2026-09-29', 'bistro', 'AWAITING_CUSTOMER'],
      ] as const
    ).forEach(([day, customer, stopAt]) => add({ day, hour: 10, customer, creator: customer === 'bistro' ? 'acc1' : 'acc2', kind: 'PORTAL', stopAt }));
    add({ day: '2026-07-14', hour: 9, customer: 'boinobre', creator: 'ext1', kind: 'NORMAL' });
    add({ day: '2026-08-12', hour: 10, customer: 'recanto', creator: 'ext2', kind: 'NORMAL' });
    add({ day: '2026-09-08', hour: 9.5, customer: 'sabor', creator: 'ext1', kind: 'NORMAL' });
    add({ day: '2026-09-29', hour: 15, customer: 'vinhedo', creator: 'ext2', kind: 'NORMAL', stopAt: 'PENDING_APPROVAL' });
    add({ day: '2026-09-30', hour: 10, customer: 'boinobre', creator: 'ext1', kind: 'NORMAL', stopAt: 'PENDING_APPROVAL' });
    add({ day: '2026-05-20', hour: 9, customer: 'nonna', creator: 'seller2', kind: 'NORMAL', cancel: 'AFTER_PICK', cancelReason: 'Cliente desistiu — restaurante fechado para reforma.' });
    add({ day: '2026-08-25', hour: 9, customer: 'burger', creator: 'manager', kind: 'NORMAL', cancel: 'BEFORE_PICK', cancelReason: 'Pedido lançado em duplicidade.' });
    add({ day: '2026-06-10', hour: 11, customer: 'brasa', creator: 'manager', kind: 'NORMAL', method: 'BONUS', items: [['Picanha', 3], ['Linguiça de costela', 2]], notes: 'Bonificação — meta de compras de maio atingida.' });
    add({ day: '2026-08-06', hour: 11, customer: 'gourmetval', creator: 'manager', kind: 'NORMAL', method: 'SAMPLE', items: [['Ancho', 1], ['Chorizo', 1]], notes: 'Amostra para degustação na loja.' });
    // Retrato do dia 30/09: pedidos em todas as etapas
    add({ day: '2026-09-30', hour: 9, customer: 'primavera', creator: 'seller1', kind: 'NORMAL', stopAt: 'PENDING_APPROVAL' });
    add({ day: '2026-09-30', hour: 11, customer: 'nonna', creator: 'seller2', kind: 'NORMAL', stopAt: 'DRAFT' });
    add({ day: '2026-09-29', hour: 11, customer: 'smash', creator: 'manager', kind: 'NORMAL', stopAt: 'APPROVED' });
    add({ day: '2026-09-30', hour: 8.5, customer: 'taquaral', creator: 'manager', kind: 'NORMAL', stopAt: 'APPROVED' });
    add({ day: '2026-09-30', hour: 9.5, customer: 'fogo', creator: 'seller2', kind: 'NORMAL', stopAt: 'APPROVED' });
    add({ day: '2026-09-29', hour: 9, customer: 'brasa', creator: 'manager', kind: 'NORMAL', stopAt: 'PICKING' });
    add({ day: '2026-09-30', hour: 8, customer: 'jundiai', creator: 'manager', kind: 'NORMAL', stopAt: 'PICKING', pickSameDay: true });
    add({ day: '2026-09-28', hour: 9, customer: 'paulista', creator: 'seller1', kind: 'NORMAL', stopAt: 'DISPATCHED' });
    add({ day: '2026-09-29', hour: 10, customer: 'festa', creator: 'manager', kind: 'NORMAL', stopAt: 'DISPATCHED' });
    add({ day: '2026-09-29', hour: 10.5, customer: 'ricardo', creator: 'manager', kind: 'NORMAL', stopAt: 'READY', deliveryMode: 'PICKUP' });

    // Inadimplência: Bar do Tião (bloqueado depois) e Açougue Central Sumaré (atrasos em setembro)
    for (const day of ['2026-04-14', '2026-05-12', '2026-06-09']) add({ day, hour: 10, customer: 'tiao', creator: 'seller2', kind: 'NORMAL' });
    for (const day of ['2026-08-20', '2026-09-02']) add({ day, hour: 9.25, customer: 'sumare', creator: 'seller2', kind: 'NORMAL' });
    const targets: [string, number][] = [
      ['04', 11],
      ['05', 13],
      ['06', 15],
      ['07', 18],
      ['08', 22],
      ['09', 27],
    ];
    for (const [m, total] of targets) {
      const month = `2026-${m}`;
      const have = plans.filter((p) => p.day.startsWith(month)).length;
      const days = bizDays(month).filter((d) => m !== '09' || d <= '2026-09-25');
      for (let i = have; i < total; i++) {
        const day = rng.pick(days);
        const eligible = CUSTOMER_SEEDS.filter((c) => c.segment !== 'INTERCOMPANY' && (!c.since || day >= c.since) && (!c.until || day <= c.until));
        const c = rng.weighted(eligible.map((x) => [x, x.freq] as const));
        const creator: ActorKey = c.seller === 'seller1' || c.seller === 'seller2' ? (rng.chance(0.8) ? c.seller : 'manager') : 'manager';
        add({ day, hour: rng.int(8, 12) + rng.pick([0, 0.25, 0.5, 0.75]), customer: c.key, creator, kind: 'NORMAL' });
      }
    }
    // Todo cliente compra ao menos uma vez no período
    for (const c of CUSTOMER_SEEDS) {
      if (c.segment === 'INTERCOMPANY' || plans.some((p) => p.customer === c.key)) continue;
      const from = c.since && c.since > '2026-04-01' ? c.since : '2026-04-01';
      const to = c.until && c.until < '2026-09-25' ? c.until : '2026-09-25';
      const days = bizDays('2026-04').concat(bizDays('2026-05'), bizDays('2026-06'), bizDays('2026-07'), bizDays('2026-08'), bizDays('2026-09')).filter((d) => d >= from && d <= to);
      add({ day: rng.pick(days), hour: 11, customer: c.key, creator: c.seller === 'seller1' || c.seller === 'seller2' ? c.seller : 'manager', kind: 'NORMAL' });
    }
    return plans;
  }

  private priceFor(c: CustomerSeed, p: Product): number {
    const table = c.table ?? 'GENERAL';
    const base = this.tablePrices[table]?.get(p.id) ?? this.tablePrices.GENERAL.get(p.id) ?? p.defaultPrice ?? 30;
    return round2(base * (c.segment === 'ACOUGUE' ? 0.95 : 1));
  }

  private freightFor(c: CustomerSeed, subtotal: number): number {
    if (c.segment === 'INTERCOMPANY') return 0;
    if (c.city === 'São Paulo') return 60;
    if (subtotal >= 1500) return 0;
    if (c.city === 'Campinas') return 15;
    if (['Sumaré', 'Hortolândia', 'Paulínia', 'Valinhos', 'Vinhedo'].includes(c.city)) return 25;
    return 40;
  }

  private async availability(): Promise<Map<string, number>> {
    const lots = await this.data.list('stock_lots', { where: [['stage', '==', 'FINISHED']] });
    const m = new Map<string, number>();
    for (const l of lots) {
      if (l.status !== 'AVAILABLE') continue;
      const k = `${l.productId}|${l.origin}`;
      m.set(k, (m.get(k) || 0) + l.balanceQty);
    }
    for (const [k, r] of this.reserved) m.set(k, (m.get(k) || 0) - r);
    return m;
  }

  private reserve(sale: Sale, sign: 1 | -1) {
    const origin: StockOrigin = sale.isIntercompany ? 'INTERCOMPANY' : 'PROPRIO';
    for (const it of sale.items) {
      if (it.kind !== 'PRODUCT' || !it.productId) continue;
      const k = `${it.productId}|${origin}`;
      this.reserved.set(k, round3(Math.max(0, (this.reserved.get(k) || 0) + sign * it.qtyOrdered * 1.1)));
    }
  }

  private async pickItems(c: CustomerSeed, origin: StockOrigin): Promise<SaleItemInput[]> {
    const { rng } = this;
    const mix = SEGMENT_MIX[c.segment];
    const avail = await this.availability();
    const n = rng.int(mix.count[0], mix.count[1]);
    const availOf = (name: string) => avail.get(`${this.products[name].id}|${origin}`) || 0;
    // O vendedor empurra o que tem em estoque: peso maior para cortes com mais saldo.
    const pool = mix.items
      .map(([name, w]) => {
        const a = availOf(name) / (this.products[name].unit === 'UN' ? 8 : 1);
        return [name, w * (0.25 + Math.min(4, a / 120))] as [string, number];
      })
      .filter(([name]) => availOf(name) > 0);
    const out: SaleItemInput[] = [];
    while (out.length < n && pool.length) {
      const name = rng.weighted(pool);
      pool.splice(
        pool.findIndex(([x]) => x === name),
        1,
      );
      const p = this.products[name];
      const a = availOf(name);
      const un = p.unit === 'UN';
      let qty = un ? Math.round(rng.int(mix.un[0] || 10, mix.un[1] || 20) / 10) * 10 : Math.round(rng.float(mix.kg[0], mix.kg[1]) * 2) / 2;
      if (!un && a > 350 && c.segment !== 'PF') qty = Math.round(qty * 1.5 * 2) / 2;
      const cap = a / 1.15 - (un ? 10 : 1);
      if (qty > cap) qty = un ? Math.floor((cap * 0.8) / 10) * 10 : Math.floor(cap * 0.8 * 2) / 2;
      if (qty < (un ? 10 : 1)) continue;
      out.push({ kind: 'PRODUCT', productId: p.id, productName: p.name, unit: p.unit, qtyOrdered: qty, unitPrice: this.priceFor(c, p) });
    }
    return out;
  }

  private async startPlan(plan: Plan) {
    if (plan.kind === 'PORTAL') return this.startPortal(plan);
    const { rng } = this;
    const c = this.cseed[plan.customer];
    const cust = this.customers[plan.customer];
    const origin: StockOrigin = plan.kind === 'IC' ? 'INTERCOMPANY' : 'PROPRIO';
    const items: SaleItemInput[] = plan.items
      ? plan.items.map(([name, qty]) => {
          const p = this.products[name];
          return { kind: 'PRODUCT', productId: p.id, productName: p.name, unit: p.unit, qtyOrdered: qty, unitPrice: this.priceFor(c, p) };
        })
      : await this.pickItems(c, origin);
    if (!items.length) return;
    const method = plan.method ?? c.method;
    const isJ = c.personType === 'J';
    if ((c.segment === 'PF' || c.segment === 'EMPORIO') && !plan.items && rng.chance(0.3)) {
      const s = this.supplies.sacola;
      items.push({ kind: 'SUPPLY', supplyItemId: s.id, productName: s.name, unit: 'UN', qtyOrdered: rng.int(1, 3), unitPrice: s.salePrice || 12.9 });
    }
    const deliveryMode = plan.deliveryMode ?? (isJ ? 'DELIVERY' : rng.chance(0.45) ? 'PICKUP' : 'DELIVERY');
    const subtotal = items.reduce((s, i) => s + i.qtyOrdered * i.unitPrice, 0);
    const gift = method === 'BONUS' || method === 'SAMPLE';
    const billingType: BillingType = gift || !isJ ? 'NONE' : method === 'BOLETO' ? 'NF_BOLETO' : 'NF_ONLY';
    const sale = await this.ops(plan.creator).createSale({
      channel: plan.kind === 'IC' ? 'INTERCOMPANY' : 'INTERNAL',
      customerId: cust.id,
      date: plan.day,
      deliveryDate: nextBiz(plan.day),
      deliveryMode,
      shippingZipCode: c.zip,
      shippingAddress: deliveryMode === 'DELIVERY' ? `${cust.street}, ${cust.number} — ${c.district}, ${c.city}/SP` : null,
      freightValue: deliveryMode === 'PICKUP' || gift ? 0 : this.freightFor(c, subtotal),
      paymentMethod: method,
      billingType,
      paymentTerms: !gift && isJ ? c.terms ?? null : null,
      priceTableId: cust.priceTableId ?? null,
      company: 'MVGB',
      status: plan.stopAt === 'DRAFT' ? 'DRAFT' : undefined,
      notes: plan.notes ?? null,
      customerNotes: rng.chance(0.15) ? 'Entregar pela entrada de serviço, antes das 10h.' : null,
      items,
    });
    this.saleCustomer.set(sale.id, plan.customer);
    this.reserve(sale, 1);
    this.lifecycle(sale, plan);
  }

  private lifecycle(sale: Sale, plan: Plan) {
    const { rng } = this;
    if (sale.status === 'DRAFT' || plan.stopAt === 'PENDING_APPROVAL' || plan.stopAt === 'DRAFT') return;
    let approvedDay = plan.day;
    let approvedHour = plan.hour;
    if (sale.status === 'PENDING_APPROVAL') {
      const same = plan.hour < 13;
      approvedDay = same ? plan.day : nextBiz(plan.day);
      approvedHour = same ? 14 : 9.5;
      this.on(approvedDay, approvedHour, () => this.ops('manager').approveSale(sale.id));
    }
    if (plan.stopAt === 'APPROVED') return;
    if (plan.cancel === 'BEFORE_PICK') {
      this.on(nextBiz(approvedDay), 9, async () => {
        await this.ops('manager').cancelSale(sale.id, plan.cancelReason || 'Cancelado a pedido do cliente.');
        this.reserve(sale, -1);
      });
      return;
    }
    const pickDay = plan.pickSameDay || (sale.deliveryMode === 'PICKUP' && rng.chance(0.3)) ? approvedDay : nextBiz(approvedDay);
    const pickHour = pickDay === approvedDay ? Math.max(approvedHour + 1, 15) : 8 + rng.int(0, 2);
    this.on(pickDay, pickHour, () => this.ops('logistics').startPicking(sale.id));
    if (plan.stopAt === 'PICKING') return;
    this.on(pickDay, pickHour + 1, async () => {
      await this.finalize(sale.id, 0.97, 1.03);
      this.reserve(sale, -1);
      if (sale.billingType !== 'NONE' && rng.chance(0.7)) await this.attachInvoice(sale.id, pickDay, sale.billingType === 'NF_BOLETO');
    });
    if (plan.cancel === 'AFTER_PICK') {
      this.on(nextBiz(pickDay), 9, () => this.ops('manager').cancelSale(sale.id, plan.cancelReason || 'Cancelado a pedido do cliente.'));
      return;
    }
    if (plan.stopAt === 'READY') return;
    if (sale.deliveryMode === 'PICKUP') {
      this.on(pickDay, pickHour + 3, () => this.ops('logistics').deliverSale(sale.id));
      return;
    }
    this.on(pickDay, pickHour + 2.5, () => this.ops('logistics').dispatchSale(sale.id));
    if (plan.stopAt === 'DISPATCHED') return;
    const sameDay = pickHour < 13 && rng.chance(0.6);
    const deliverDay = sameDay ? pickDay : nextBiz(pickDay);
    this.on(deliverDay, sameDay ? pickHour + 5 : 11, () => this.ops('logistics').deliverSale(sale.id));
  }

  private async finalize(saleId: string, lo: number, hi: number) {
    const s = (await this.data.get('sales', saleId))!;
    const items = s.items.map((it) => ({
      itemId: it.id,
      qty: it.kind === 'PRODUCT' && it.unit === 'KG' ? round3(it.qtyOrdered * this.rng.float(lo, hi)) : it.qtyOrdered,
    }));
    return this.ops('logistics').finalizePicking(saleId, { items });
  }

  private async attachInvoice(saleId: string, day: string, boleto: boolean) {
    const n = this.invoiceSeq++;
    const att: Attachment = {
      id: this.id(),
      name: `NF-e ${n}.pdf`,
      path: `demo/notas/${n}.pdf`,
      mimeType: 'application/pdf',
      size: 48000 + this.rng.int(0, 30000),
      kind: 'NF',
      uploadedAt: this.iso(),
      uploadedBy: this.profiles.finance.name,
    };
    await this.ops('finance').attachSaleFile(saleId, att, {
      invoiceNumber: String(n),
      invoiceDate: day,
      boletoNumber: boleto ? `34191.${this.rng.int(10000, 99999)} ${this.rng.int(10000, 99999)}.${this.rng.int(100000, 999999)}` : undefined,
    });
  }

  private async startPortal(plan: Plan) {
    const { rng } = this;
    const accKey = plan.creator as 'acc1' | 'acc2';
    const c = this.cseed[plan.customer];
    const big = plan.customer === 'bistro';
    const catalog = rng.shuffle((await this.data.list('catalog_items')).filter((ci) => ci.available && ci.productId).sort((a, b) => a.sortOrder - b.sortOrder));
    const avail = await this.availability();
    const n = big ? rng.int(3, 5) : rng.int(2, 3);
    const lines: { catalogItemId: string; qty: number; price: number; unit: 'KG' | 'UN' }[] = [];
    for (const ci of catalog) {
      if (lines.length >= n) break;
      const a = avail.get(`${ci.productId}|PROPRIO`) || 0;
      const qty = ci.unit === 'UN' ? (big ? 40 : 10) : big ? rng.int(6, 16) / 2 : rng.int(2, 6) / 2;
      if (a < qty * 1.3 + 2) continue;
      lines.push({ catalogItemId: ci.id, qty, price: ci.price, unit: ci.unit });
    }
    if (!lines.length) return;
    const min = big ? 150 : 200;
    while (lines.reduce((s, l) => s + l.qty * l.price, 0) < min * 1.15) lines[0].qty += lines[0].unit === 'UN' ? 10 : 0.5;
    const sale = await this.ops(accKey).submitPortalOrder({
      items: lines.map((l) => ({ catalogItemId: l.catalogItemId, qty: l.qty })),
      deliveryMode: 'DELIVERY',
      zipCode: c.zip,
      notes: rng.chance(0.4) ? 'Por favor, porcionar em pacotes de até 1 kg.' : null,
    });
    this.portalSales.add(sale.id);
    this.saleCustomer.set(sale.id, plan.customer);
    this.reserve(sale, 1);
    this.on(plan.day, 14, () => this.ops('manager').approveSale(sale.id));
    const delivery = sale.deliveryDate || nextBiz(plan.day);
    let pickDay = prevBiz(delivery);
    if (pickDay < plan.day) pickDay = plan.day;
    const pickHour = pickDay === plan.day ? 16 : 9;
    const up = plan.stopAt === 'AWAITING_CUSTOMER';
    this.on(pickDay, pickHour, () => this.ops('logistics').startPicking(sale.id));
    this.on(pickDay, pickHour + 0.5, async () => {
      await this.finalize(sale.id, up ? 1.12 : 0.985, up ? 1.14 : 1.025);
      this.reserve(sale, -1);
    });
    if (up || plan.stopAt === 'READY') return;
    this.on(pickDay, pickHour + 3, () =>
      this.ops(accKey).uploadPaymentReceipt(sale.id, {
        id: this.id(),
        name: `comprovante-pix-${sale.number}.pdf`,
        path: `demo/comprovantes/${sale.number}.pdf`,
        mimeType: 'application/pdf',
        size: 84211,
        kind: 'RECEIPT',
        uploadedAt: this.iso(),
        uploadedBy: this.accounts[accKey].name,
      }),
    );
    if (plan.stopAt === 'RECEIPT_SENT') return;
    this.on(delivery, 7.5, () => this.ops('finance').confirmSalePayment(sale.id, { date: delivery, method: 'PIX', notes: 'Pix conferido no extrato.' }));
    this.on(delivery, 8, () => this.ops('logistics').dispatchSale(sale.id));
    this.on(delivery, 12, () => this.ops('logistics').deliverSale(sale.id));
  }

  // --------------------------------------------------------------------------
  // Pagamentos do dia
  // --------------------------------------------------------------------------

  private decidePayment(e: FinancialEntry): string | null {
    const { rng } = this;
    if (e.direction === 'OUT') {
      if (e.dueDate >= '2026-09-08' && e.dueDate <= '2026-09-29' && rng.chance(0.2)) return null;
      return addDays(e.dueDate, rng.int(0, 1));
    }
    const key = e.saleId ? this.saleCustomer.get(e.saleId) : null;
    const payer = key ? this.cseed[key]?.payer ?? 'GOOD' : 'GOOD';
    const d = e.dueDate;
    switch (payer) {
      case 'GOOD':
        return addDays(d, rng.int(0, 2));
      case 'AVG':
        if (d >= '2026-08-15' && rng.chance(0.15)) return null;
        return addDays(d, rng.int(0, 6));
      case 'LATE':
        if (d >= '2026-09-01') return null;
        return addDays(d, rng.int(5, 18));
      case 'DEFAULTER':
        if (d >= '2026-06-10') return null;
        return addDays(d, rng.int(8, 20));
    }
  }

  private async payDue(day: string) {
    const open = (await this.data.list('financial_entries', { where: [['status', '==', 'OPEN']] }))
      .filter((e) => e.dueDate <= day && !(e.saleId && this.portalSales.has(e.saleId)))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
    const picked = new Map<string, boolean>();
    for (const e of open) {
      if (e.saleId) {
        // Cliente paga depois da pesagem (o valor final só existe após a separação).
        if (!picked.has(e.saleId)) picked.set(e.saleId, !!(await this.data.get('sales', e.saleId))?.stockDeducted);
        if (!picked.get(e.saleId)) continue;
      }
      let when = this.payPlan.get(e.id);
      if (when === undefined) {
        when = this.decidePayment(e);
        this.payPlan.set(e.id, when);
      }
      if (!when || when > day) continue;
      await this.ops('finance').payEntry(e.id, { date: when, method: e.method ?? null });
    }
  }
}

/** Popula um DataApi (memória) com a demonstração completa. */
export async function seedDemo(data: DataApi): Promise<DemoSummary> {
  const s = new Seeder(data);
  try {
    return await s.run();
  } finally {
    resetOpsEnv();
  }
}
