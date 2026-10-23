/**
 * Relatórios comerciais: vendas por período, cliente, produto/corte,
 * vendedor e curva ABC de clientes. Base: pedidos com itens embutidos.
 */
import { Award, CalendarRange, Layers, UserCheck, Users } from 'lucide-react';
import { integer, money, percent, round2, round3 } from '../../../domain/format';
import { ROLE_LABELS } from '../../../domain/labels';
import { Badge } from '../../../ui';
import { brlShort, shortMonth } from '../../finance/helpers';
import { GROUP_DAY_MONTH, groupBy, pct, periodKeys, periodLabel, safeDiv, salesIn, SCOPE_OPTION } from './helpers';
import { kgFmt } from './format';
import { defineReport } from './types';

// ---------------------------------------------------------------------------
// Vendas por período
// ---------------------------------------------------------------------------

interface PeriodRow {
  key: string;
  orders: number;
  kg: number;
  freight: number;
  discount: number;
  revenue: number;
}

export const salesByPeriod = defineReport<PeriodRow>({
  id: 'vendas-periodo',
  title: 'Vendas por período',
  description: 'Faturamento, pedidos, peso e ticket médio por dia ou por mês.',
  category: 'Vendas',
  icon: CalendarRange,
  permission: 'view.commercial',
  tables: ['sales', 'customers', 'profiles', 'products'],
  filters: ['period', 'customer', 'seller', 'product'],
  period: { default: '3m', field: 'Data do pedido' },
  options: [GROUP_DAY_MONTH, SCOPE_OPTION],
  keywords: 'faturamento mensal diário ticket',
  build(d, f) {
    const group = (f.opts.group || 'month') as 'day' | 'month';
    const sales = salesIn(d, f);
    const map = groupBy(
      sales,
      (s) => (group === 'month' ? s.date.slice(0, 7) : s.date),
      (_, key): PeriodRow => ({ key, orders: 0, kg: 0, freight: 0, discount: 0, revenue: 0 }),
      (a, s) => {
        a.orders += 1;
        a.kg += s.totalWeightKg || 0;
        a.freight += s.freightValue || 0;
        a.discount += s.discountValue || 0;
        a.revenue += s.totalValue || 0;
      },
    );
    const rows = periodKeys([...map.keys()], f, group).map((k) => map.get(k) || { key: k, orders: 0, kg: 0, freight: 0, discount: 0, revenue: 0 });
    const revenue = round2(rows.reduce((s, r) => s + r.revenue, 0));
    const orders = rows.reduce((s, r) => s + r.orders, 0);
    const weight = rows.reduce((s, r) => s + r.kg, 0);
    const best = [...rows].sort((a, b) => b.revenue - a.revenue)[0];
    return {
      rows,
      rowKey: (r) => r.key,
      initialSort: { key: 'key', dir: 'asc' },
      columns: [
        { key: 'key', header: group === 'month' ? 'Mês' : 'Dia', value: (r) => periodLabel(r.key), sortValue: (r) => r.key, mobile: 'title' },
        { key: 'orders', header: 'Pedidos', kind: 'int', value: (r) => r.orders, total: 'sum' },
        { key: 'kg', header: 'Peso', kind: 'kg', value: (r) => r.kg, total: 'sum' },
        { key: 'freight', header: 'Frete', kind: 'money', value: (r) => r.freight, total: 'sum', hideBelow: 'lg' },
        { key: 'discount', header: 'Descontos', kind: 'money', value: (r) => r.discount, total: 'sum', hideBelow: 'lg' },
        { key: 'avg', header: 'Ticket médio', kind: 'money', value: (r) => (r.orders ? r.revenue / r.orders : null), total: () => safeDiv(revenue, orders) },
        { key: 'revenue', header: 'Faturamento', kind: 'money', value: (r) => r.revenue, total: 'sum', mobile: 'badge' },
      ],
      stats: [
        { label: 'Faturamento', value: money(revenue), short: brlShort(revenue), hint: `${integer(orders)} pedidos` },
        { label: 'Ticket médio', value: money(safeDiv(revenue, orders)), short: brlShort(safeDiv(revenue, orders)) },
        { label: 'Peso vendido', value: kgFmt((weight)), hint: weight ? `${money(safeDiv(revenue, weight))}/kg médio` : undefined },
        { label: group === 'month' ? 'Melhor mês' : 'Melhor dia', value: best && best.revenue ? periodLabel(best.key) : '—', hint: best?.revenue ? money(best.revenue) : undefined },
      ],
      chart:
        rows.length > 1
          ? {
              kind: group === 'month' ? 'bars' : 'trend',
              title: 'Faturamento',
              data: rows.map((r) => ({ label: r.key.length === 7 ? shortMonth(r.key) : r.key.slice(5).split('-').reverse().join('/'), revenue: round2(r.revenue) })),
              series: [{ key: 'revenue', name: 'Faturamento' }],
              format: 'money',
            }
          : null,
      note: 'Faturamento = total do pedido (itens + frete − descontos). Pedidos cancelados, recusados e rascunhos não entram.',
    };
  },
});

// ---------------------------------------------------------------------------
// Vendas por cliente
// ---------------------------------------------------------------------------

interface CustomerRow {
  id: string;
  name: string;
  city: string;
  orders: number;
  kg: number;
  revenue: number;
  last: string;
}

function byCustomer(d: Parameters<typeof salesIn>[0], f: Parameters<typeof salesIn>[1]): CustomerRow[] {
  const cmap = new Map(d.customers.map((c) => [c.id, c]));
  return [
    ...groupBy(
      salesIn(d, f),
      (s) => s.customerId,
      (s): CustomerRow => {
        const c = cmap.get(s.customerId);
        return { id: s.customerId, name: c?.tradeName || c?.name || s.customerName, city: c?.city ? `${c.city}${c.state ? '/' + c.state : ''}` : '', orders: 0, kg: 0, revenue: 0, last: '' };
      },
      (a, s) => {
        a.orders += 1;
        a.kg += s.totalWeightKg || 0;
        a.revenue += s.totalValue || 0;
        if (s.date > a.last) a.last = s.date;
      },
    ).values(),
  ];
}

export const salesByCustomer = defineReport<CustomerRow & { share: number }>({
  id: 'vendas-cliente',
  title: 'Vendas por cliente',
  description: 'Quanto cada cliente comprou: pedidos, peso, faturamento, ticket e última compra.',
  category: 'Vendas',
  icon: Users,
  permission: 'view.commercial',
  tables: ['sales', 'customers', 'profiles', 'products'],
  filters: ['period', 'customer', 'seller', 'product'],
  period: { default: '3m', field: 'Data do pedido' },
  options: [SCOPE_OPTION],
  keywords: 'carteira compras',
  build(d, f) {
    const base = byCustomer(d, f);
    const total = round2(base.reduce((s, r) => s + r.revenue, 0));
    const rows = base.map((r) => ({ ...r, share: pct(r.revenue, total) })).sort((a, b) => b.revenue - a.revenue);
    const orders = rows.reduce((s, r) => s + r.orders, 0);
    return {
      rows,
      rowKey: (r) => r.id,
      link: (r) => `/clientes/${r.id}`,
      initialSort: { key: 'revenue', dir: 'desc' },
      columns: [
        { key: 'name', header: 'Cliente', value: (r) => r.name, mobile: 'title', total: (rs) => `${rs.length} clientes` },
        { key: 'city', header: 'Cidade', value: (r) => r.city, mobile: 'subtitle', hideBelow: 'lg' },
        { key: 'orders', header: 'Pedidos', kind: 'int', value: (r) => r.orders, total: 'sum' },
        { key: 'kg', header: 'Peso', kind: 'kg', value: (r) => r.kg, total: 'sum' },
        { key: 'avg', header: 'Ticket médio', kind: 'money', value: (r) => safeDiv(r.revenue, r.orders), hideBelow: 'md', total: () => safeDiv(total, orders) },
        { key: 'last', header: 'Última compra', kind: 'date', value: (r) => r.last, hideBelow: 'md' },
        { key: 'share', header: '% do total', kind: 'percent', value: (r) => r.share, hideBelow: 'lg' },
        { key: 'revenue', header: 'Faturamento', kind: 'money', value: (r) => r.revenue, total: 'sum', mobile: 'badge' },
      ],
      stats: [
        { label: 'Clientes atendidos', value: integer(rows.length) },
        { label: 'Faturamento', value: money(total), short: brlShort(total), hint: `${integer(orders)} pedidos` },
        { label: 'Ticket médio', value: money(safeDiv(total, orders)), short: brlShort(safeDiv(total, orders)) },
        { label: 'Maior cliente', value: rows[0]?.name || '—', hint: rows[0] ? `${percent(rows[0].share)} do total` : undefined },
      ],
      chart: rows.length
        ? { kind: 'rank', title: 'Maiores clientes', data: rows.slice(0, 10).map((r) => ({ label: r.name, value: round2(r.revenue) })), series: [{ key: 'value', name: 'Faturamento' }], format: 'money' }
        : null,
    };
  },
});

// ---------------------------------------------------------------------------
// Vendas por produto / corte
// ---------------------------------------------------------------------------

interface ProductRow {
  id: string;
  name: string;
  category: string;
  unit: 'KG' | 'UN';
  qty: number;
  revenue: number;
  cost: number;
  costedRevenue: number;
  orders: Set<string>;
}

export const salesByProduct = defineReport<ProductRow & { share: number }>({
  id: 'vendas-produto',
  title: 'Vendas por produto / corte',
  description: 'Quilos, faturamento e preço médio de cada corte (ou categoria), com margem quando houver custo.',
  category: 'Vendas',
  icon: Layers,
  permission: 'view.commercial',
  tables: ['sales', 'customers', 'profiles', 'products'],
  filters: ['period', 'customer', 'seller', 'product'],
  period: { default: '3m', field: 'Data do pedido' },
  options: [
    {
      key: 'group',
      label: 'Agrupar por',
      choices: [
        { value: 'product', label: 'Produto / corte' },
        { value: 'category', label: 'Categoria' },
      ],
      default: 'product',
    },
    SCOPE_OPTION,
  ],
  keywords: 'cortes quilos kg preço médio margem',
  build(d, f, ctx) {
    const byCategory = f.opts.group === 'category';
    const showCost = ctx.can('sales.viewCost');
    const pmap = new Map(d.products.map((p) => [p.id, p]));
    const items = salesIn(d, f).flatMap((s) =>
      (s.items || []).filter((i) => i.kind === 'PRODUCT' && (!f.productId || i.productId === f.productId)).map((i) => ({ i, saleId: s.id })),
    );
    const map = groupBy(
      items,
      ({ i }) => {
        const p = i.productId ? pmap.get(i.productId) : undefined;
        return byCategory ? `${p?.category || 'Sem categoria'}|${i.unit}` : i.productId || i.productName;
      },
      ({ i }, key): ProductRow => {
        const p = i.productId ? pmap.get(i.productId) : undefined;
        const category = p?.category || 'Sem categoria';
        return { id: key, name: byCategory ? category : p?.name || i.productName, category, unit: i.unit, qty: 0, revenue: 0, cost: 0, costedRevenue: 0, orders: new Set() };
      },
      (a, { i, saleId }) => {
        a.qty += i.qty || 0;
        a.revenue += i.total || 0;
        if (i.costTotal) {
          a.cost += i.costTotal;
          a.costedRevenue += i.total || 0;
        }
        a.orders.add(saleId);
      },
    );
    const total = round2([...map.values()].reduce((s, r) => s + r.revenue, 0));
    const rows = [...map.values()].map((r) => ({ ...r, share: pct(r.revenue, total) }));
    const kgRows = rows.filter((r) => r.unit === 'KG');
    const kgSold = kgRows.reduce((s, r) => s + r.qty, 0);
    const kgRevenue = kgRows.reduce((s, r) => s + r.revenue, 0);
    const cost = rows.reduce((s, r) => s + r.cost, 0);
    const costedRevenue = rows.reduce((s, r) => s + r.costedRevenue, 0);
    const margin = (r: { cost: number; costedRevenue: number }) => (r.costedRevenue ? pct(r.costedRevenue - r.cost, r.costedRevenue) : null);
    return {
      rows,
      rowKey: (r) => r.id,
      initialSort: { key: 'revenue', dir: 'desc' },
      columns: [
        { key: 'name', header: byCategory ? 'Categoria' : 'Produto', value: (r) => r.name, mobile: 'title', total: (rs) => `${rs.length} ${byCategory ? 'categorias' : 'produtos'}` },
        ...(byCategory ? [] : [{ key: 'category', header: 'Categoria', value: (r: ProductRow) => r.category, mobile: 'subtitle' as const, hideBelow: 'md' as const }]),
        { key: 'unit', header: 'Unid.', value: (r) => (r.unit === 'KG' ? 'kg' : 'un'), hideBelow: 'xl' },
        {
          key: 'qty',
          header: 'Quantidade',
          kind: 'number',
          value: (r) => round3(r.qty),
          display: (r) => (r.unit === 'KG' ? kgFmt(r.qty) : `${integer(r.qty)} un`),
          total: () => kgFmt(kgSold),
        },
        { key: 'avg', header: 'Preço médio', kind: 'money', value: (r) => safeDiv(r.revenue, r.qty), display: (r) => `${money(safeDiv(r.revenue, r.qty))}/${r.unit === 'KG' ? 'kg' : 'un'}`, total: () => `${money(safeDiv(kgRevenue, kgSold))}/kg` },
        { key: 'orders', header: 'Pedidos', kind: 'int', value: (r) => r.orders.size, hideBelow: 'lg' },
        ...(showCost
          ? [
              { key: 'cost', header: 'Custo', kind: 'money' as const, value: (r: ProductRow) => r.cost || null, total: 'sum' as const, hideBelow: 'lg' as const },
              { key: 'margin', header: 'Margem', kind: 'percent' as const, value: (r: ProductRow) => margin(r), total: () => margin({ cost, costedRevenue }), hideBelow: 'md' as const },
            ]
          : []),
        { key: 'share', header: '% do total', kind: 'percent', value: (r) => r.share, hideBelow: 'lg' },
        { key: 'revenue', header: 'Faturamento', kind: 'money', value: (r) => r.revenue, total: 'sum', mobile: 'badge' },
      ],
      stats: [
        { label: 'Quilos vendidos', value: kgFmt((kgSold)) },
        { label: 'Faturamento em cortes', value: money(total), short: brlShort(total) },
        { label: 'Preço médio', value: `${money(safeDiv(kgRevenue, kgSold))}/kg` },
        showCost && costedRevenue
          ? { label: 'Margem bruta', value: percent(margin({ cost, costedRevenue }) ?? 0), hint: 'sobre itens com custo apurado' }
          : { label: byCategory ? 'Categorias' : 'Produtos', value: integer(rows.length) },
      ],
      chart: rows.length
        ? { kind: 'rank', title: 'Maior faturamento', data: [...rows].sort((a, b) => b.revenue - a.revenue).slice(0, 10).map((r) => ({ label: r.name, value: round2(r.revenue) })), series: [{ key: 'value', name: 'Faturamento' }], format: 'money' }
        : null,
      note: 'Quantidade final (pesada na separação). Frete, materiais e serviços não entram. Margem = (faturamento − custo da baixa) ÷ faturamento, só nos itens já baixados do estoque.',
    };
  },
});

// ---------------------------------------------------------------------------
// Vendas por vendedor
// ---------------------------------------------------------------------------

interface SellerRow {
  id: string;
  name: string;
  role: string;
  orders: number;
  customers: Set<string>;
  kg: number;
  revenue: number;
  commission: number;
}

export const salesBySeller = defineReport<SellerRow>({
  id: 'vendas-vendedor',
  title: 'Vendas por vendedor',
  description: 'Desempenho de cada vendedor (interno e externo): pedidos, clientes, faturamento e comissão.',
  category: 'Vendas',
  icon: UserCheck,
  permission: 'view.commercial',
  tables: ['sales', 'customers', 'profiles', 'products'],
  filters: ['period', 'seller', 'customer'],
  period: { default: '3m', field: 'Data do pedido' },
  options: [SCOPE_OPTION],
  keywords: 'representante externo comissão ranking',
  build(d, f) {
    const pmap = new Map(d.profiles.map((p) => [p.id, p]));
    const rows = [
      ...groupBy(
        salesIn(d, f),
        (s) => s.sellerId || 'house',
        (s, key): SellerRow => {
          const p = s.sellerId ? pmap.get(s.sellerId) : undefined;
          return {
            id: key,
            name: key === 'house' ? 'Venda direta (sem vendedor)' : p?.name || s.sellerName || 'Vendedor',
            role: key === 'house' ? '—' : p ? ROLE_LABELS[p.role] : s.channel === 'EXTERNAL_SELLER' ? 'Vendedor externo' : 'Vendedor',
            orders: 0,
            customers: new Set(),
            kg: 0,
            revenue: 0,
            commission: 0,
          };
        },
        (a, s) => {
          a.orders += 1;
          a.customers.add(s.customerId);
          a.kg += s.totalWeightKg || 0;
          a.revenue += s.totalValue || 0;
          a.commission += s.commissionValue || 0;
        },
      ).values(),
    ];
    const total = round2(rows.reduce((s, r) => s + r.revenue, 0));
    const orders = rows.reduce((s, r) => s + r.orders, 0);
    const commission = round2(rows.reduce((s, r) => s + r.commission, 0));
    const top = [...rows].filter((r) => r.id !== 'house').sort((a, b) => b.revenue - a.revenue)[0];
    return {
      rows,
      rowKey: (r) => r.id,
      initialSort: { key: 'revenue', dir: 'desc' },
      columns: [
        { key: 'name', header: 'Vendedor', value: (r) => r.name, mobile: 'title', total: () => 'Total' },
        { key: 'role', header: 'Perfil', value: (r) => r.role, mobile: 'subtitle', hideBelow: 'md' },
        { key: 'orders', header: 'Pedidos', kind: 'int', value: (r) => r.orders, total: 'sum' },
        { key: 'customers', header: 'Clientes', kind: 'int', value: (r) => r.customers.size, hideBelow: 'md' },
        { key: 'kg', header: 'Peso', kind: 'kg', value: (r) => r.kg, total: 'sum', hideBelow: 'lg' },
        { key: 'avg', header: 'Ticket médio', kind: 'money', value: (r) => safeDiv(r.revenue, r.orders), total: () => safeDiv(total, orders), hideBelow: 'lg' },
        { key: 'commission', header: 'Comissão', kind: 'money', value: (r) => r.commission, total: 'sum' },
        { key: 'share', header: '% do total', kind: 'percent', value: (r) => pct(r.revenue, total), hideBelow: 'lg' },
        { key: 'revenue', header: 'Faturamento', kind: 'money', value: (r) => r.revenue, total: 'sum', mobile: 'badge' },
      ],
      stats: [
        { label: 'Faturamento', value: money(total), short: brlShort(total), hint: `${integer(orders)} pedidos` },
        { label: 'Comissões', value: money(commission), short: brlShort(commission), hint: total ? `${percent(pct(commission, total))} do faturado` : undefined },
        { label: 'Vendedores ativos', value: integer(rows.filter((r) => r.id !== 'house').length) },
        { label: 'Destaque', value: top?.name || '—', hint: top ? money(top.revenue) : undefined },
      ],
      chart: rows.length
        ? { kind: 'rank', title: 'Faturamento por vendedor', data: [...rows].sort((a, b) => b.revenue - a.revenue).map((r) => ({ label: r.name, value: round2(r.revenue) })), series: [{ key: 'value', name: 'Faturamento' }], format: 'money' }
        : null,
      note: 'Comissão = valor calculado em cada pedido. A liberação conforme o pagamento está no relatório de Comissões.',
    };
  },
});

// ---------------------------------------------------------------------------
// Curva ABC de clientes
// ---------------------------------------------------------------------------

interface AbcRow extends CustomerRow {
  pos: number;
  share: number;
  cum: number;
  cls: 'A' | 'B' | 'C';
}

const ABC_TONE = { A: 'success', B: 'warning', C: 'neutral' } as const;

export const abcCustomers = defineReport<AbcRow>({
  id: 'curva-abc',
  title: 'Curva ABC de clientes',
  description: 'Classifica os clientes pelo faturamento acumulado: A (80%), B (próximos 15%) e C (últimos 5%).',
  category: 'Vendas',
  icon: Award,
  permission: 'view.commercial',
  tables: ['sales', 'customers', 'profiles', 'products'],
  filters: ['period', 'seller'],
  period: { default: 'year', field: 'Data do pedido' },
  options: [SCOPE_OPTION],
  keywords: 'pareto classificação importância',
  build(d, f) {
    const base = byCustomer(d, f).sort((a, b) => b.revenue - a.revenue);
    const total = base.reduce((s, r) => s + r.revenue, 0);
    let acc = 0;
    const rows: AbcRow[] = base.map((r, i) => {
      const before = pct(acc, total);
      acc += r.revenue;
      const cum = pct(acc, total);
      const cls: AbcRow['cls'] = before < 80 ? 'A' : before < 95 ? 'B' : 'C';
      return { ...r, pos: i + 1, share: pct(r.revenue, total), cum, cls };
    });
    const sumCls = (c: AbcRow['cls']) => {
      const rs = rows.filter((r) => r.cls === c);
      const v = rs.reduce((s, r) => s + r.revenue, 0);
      return { n: rs.length, v, p: pct(v, total) };
    };
    const [a, b, c] = (['A', 'B', 'C'] as const).map(sumCls);
    return {
      rows,
      rowKey: (r) => r.id,
      link: (r) => `/clientes/${r.id}`,
      initialSort: { key: 'pos', dir: 'asc' },
      columns: [
        { key: 'pos', header: '#', kind: 'int', value: (r) => r.pos, hideBelow: 'md' },
        { key: 'name', header: 'Cliente', value: (r) => r.name, mobile: 'title', total: (rs) => `${rs.length} clientes` },
        { key: 'cls', header: 'Classe', value: (r) => r.cls, display: (r) => <Badge tone={ABC_TONE[r.cls]}>Classe {r.cls}</Badge>, mobile: 'badge' },
        { key: 'orders', header: 'Pedidos', kind: 'int', value: (r) => r.orders, total: 'sum', hideBelow: 'md' },
        { key: 'revenue', header: 'Faturamento', kind: 'money', value: (r) => r.revenue, total: 'sum' },
        { key: 'share', header: '% do total', kind: 'percent', value: (r) => r.share },
        { key: 'cum', header: '% acumulado', kind: 'percent', value: (r) => r.cum, hideBelow: 'md' },
      ],
      stats: [
        { label: 'Classe A', value: `${a.n} clientes`, hint: `${percent(a.p)} do faturamento`, tone: 'success' },
        { label: 'Classe B', value: `${b.n} clientes`, hint: `${percent(b.p)} do faturamento`, tone: 'warning' },
        { label: 'Classe C', value: `${c.n} clientes`, hint: `${percent(c.p)} do faturamento`, tone: 'neutral' },
        { label: 'Faturamento', value: money(total), short: brlShort(total) },
      ],
      note: 'Classe A: clientes que somam os primeiros 80% do faturamento; B: até 95%; C: o restante.',
    };
  },
});
