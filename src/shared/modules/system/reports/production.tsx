/**
 * Relatórios de gado e produção: DRE por lote, custos por categoria e
 * rendimento de desossa por OS/parceiro.
 */
import { Coins, PieChart, Scissors } from 'lucide-react';
import { batchEconomics, type BatchEconomics } from '../../../domain/costs';
import { integer, money, percent, round2, round3 } from '../../../domain/format';
import { BATCH_STATUS, COST_GROUP_LABELS } from '../../../domain/labels';
import type { Batch, CostGroup, ProcessingOrder } from '../../../domain/types';
import { Badge, cn, StatusBadge } from '../../../ui';
import { categoriesOfGroup, categoryLabel, COST_GROUP_ORDER, groupOf, signedAmount } from '../../cattle/helpers';
import { brlShort } from '../../finance/helpers';
import { deboningYieldTone, orderCostPerKg, PROCESSING_STATUS } from '../../production/shared';
import { inPeriod } from './data';
import { groupBy, pct, safeDiv } from './helpers';
import { kgFmt } from './format';
import { defineReport } from './types';

const REVENUE_SOURCE: Record<BatchEconomics['revenueSource'], string> = {
  OVERRIDE: 'Informada',
  REALIZED: 'Realizada',
  MIXED: 'Realizada + estoque',
  PROJECTED: 'Projetada',
  NONE: '—',
};

const Signed = ({ v }: { v: number }) => <span className={cn('num', v < 0 ? 'text-danger' : v > 0 ? 'text-success' : '')}>{money(v)}</span>;

// ---------------------------------------------------------------------------
// DRE por lote de gado
// ---------------------------------------------------------------------------

type DreLine = { id: string; label: string; value: number; level: 0 | 1 | 2; strong?: boolean };
type BatchRow = { batch: Batch; e: BatchEconomics };
type DreRow = { kind: 'batch'; b: BatchRow } | { kind: 'line'; l: DreLine };

export const batchDre = defineReport<DreRow>({
  id: 'dre-lote',
  title: 'DRE por lote de gado',
  description: 'Resultado de cada lote: custos por grupo, receita realizada (vendas com baixa) + estoque restante, lucro e margem.',
  category: 'Gado e produção',
  icon: Coins,
  permission: 'view.cattle',
  tables: ['batches', 'batch_costs', 'animals', 'stock_movements', 'stock_lots'],
  filters: ['period', 'batch'],
  period: { default: 'all', field: 'Data de compra' },
  options: [
    {
      key: 'status',
      label: 'Lotes',
      choices: [
        { value: 'all', label: 'Todos' },
        { value: 'active', label: 'Ativos (comprados / em engorda)' },
        { value: 'slaughtered', label: 'Abatidos e encerrados' },
      ],
      default: 'all',
    },
  ],
  keywords: 'resultado lucro margem roi arroba custo por cabeça demonstrativo',
  build(d, f) {
    const econ = (b: Batch) => batchEconomics(b, d.batch_costs, d.animals, d.stock_movements, d.stock_lots);
    if (f.batchId) {
      const batch = d.batches.find((b) => b.id === f.batchId);
      if (!batch) return { rows: [], columns: [], rowKey: () => '' };
      const e = econ(batch);
      const arrobas = e.carcassWeightKg / 15;
      const costs = d.batch_costs.filter((c) => c.batchId === batch.id);
      const lines: DreLine[] = [
        { id: 'rev', label: `Receita (${REVENUE_SOURCE[e.revenueSource].toLowerCase()})`, value: e.revenue, level: 0, strong: true },
      ];
      if (e.revenueSource === 'MIXED' || e.revenueSource === 'REALIZED') {
        lines.push({ id: 'rev-real', label: `Vendas realizadas (${kgFmt((e.soldKg))})`, value: e.realizedRevenue, level: 1 });
        if (e.remainingValue) lines.push({ id: 'rev-stock', label: `Estoque restante (${kgFmt((e.remainingKg))})`, value: e.remainingValue, level: 1 });
      }
      for (const g of COST_GROUP_ORDER) {
        const cats = categoriesOfGroup(g)
          .map((c) => ({ c, v: round2(costs.filter((x) => x.category === c).reduce((s, x) => s + (Number(x.amount) || 0), 0)) }))
          .filter((x) => x.v);
        if (!cats.length) continue;
        const credit = g === 'CREDIT';
        lines.push({ id: `g-${g}`, label: `${credit ? '(+)' : '(−)'} ${COST_GROUP_LABELS[g]}`, value: credit ? -e.byGroup.CREDIT : -e.byGroup[g], level: 0 });
        for (const x of cats) lines.push({ id: `c-${x.c}`, label: categoryLabel(x.c), value: credit ? x.v : -x.v, level: 1 });
      }
      lines.push({ id: 'cost', label: '= Custo total (líquido de créditos)', value: -e.totalCost, level: 0, strong: true });
      lines.push({ id: 'profit', label: '= Resultado do lote', value: e.profit, level: 0, strong: true });
      const L = (r: DreRow) => (r as { l: DreLine }).l;
      return {
        rows: lines.map((l) => ({ kind: 'line', l })),
        rowKey: (r) => L(r).id,
        stats: [
          { label: 'Receita', value: money(e.revenue), short: brlShort(e.revenue), hint: REVENUE_SOURCE[e.revenueSource] },
          { label: 'Custo total', value: money(e.totalCost), short: brlShort(e.totalCost), hint: `${money(e.costPerHead)}/cab · ${money(e.costPerArroba)}/@` },
          { label: 'Resultado', value: money(e.profit), short: brlShort(e.profit), tone: e.profit >= 0 ? 'success' : 'danger', hint: `margem ${percent(e.marginPercent)}` },
          { label: 'ROI', value: percent(e.roiPercent), hint: `${integer(e.headCount)} cab · ${kgFmt((e.carcassWeightKg))} carcaça` },
        ],
        columns: [
          {
            key: 'label',
            header: 'Conta',
            value: (r) => (L(r).level ? '   ' : '') + L(r).label,
            display: (r) => <span className={cn(L(r).level ? 'pl-4 text-muted' : 'text-fg', L(r).strong && 'font-semibold')}>{L(r).label}</span>,
            mobile: 'title',
          },
          { key: 'value', header: 'Valor', kind: 'money', value: (r) => L(r).value, display: (r) => <span className={cn(L(r).strong && 'font-semibold')}><Signed v={L(r).value} /></span>, mobile: 'badge' },
          { key: 'head', header: 'R$ / cabeça', kind: 'money', value: (r) => (e.headCount ? round2(L(r).value / e.headCount) : null), hideBelow: 'md' },
          { key: 'arroba', header: 'R$ / @ carcaça', kind: 'money', value: (r) => (arrobas ? round2(L(r).value / arrobas) : null), hideBelow: 'md' },
          { key: 'pct', header: '% da receita', kind: 'percent', value: (r) => (e.revenue ? pct(Math.abs(L(r).value), e.revenue) : null), hideBelow: 'lg' },
        ],
        note: `${batch.code} · ${batch.name}. Receita realizada = vendas com baixa em lotes de estoque deste lote de gado; estoque restante avaliado pelo preço de referência (ou preço médio realizado). Arroba = 15 kg de carcaça.`,
      };
    }
    const status = f.opts.status || 'all';
    const batches = d.batches.filter(
      (b) =>
        inPeriod(b.purchaseDate, f) &&
        (status === 'all' || (status === 'active' ? b.status === 'PURCHASED' || b.status === 'IN_PASTURE' : b.status === 'SLAUGHTERED' || b.status === 'FINISHED')),
    );
    const rows: DreRow[] = batches.map((batch) => ({ kind: 'batch', b: { batch, e: econ(batch) } }));
    const B = (r: DreRow) => (r as { b: BatchRow }).b;
    const tot = (fn: (e: BatchEconomics) => number) => round2(rows.reduce((s, r) => s + fn(B(r).e), 0));
    const cost = tot((e) => e.totalCost);
    const withRevenue = rows.filter((r) => B(r).e.revenueSource !== 'NONE');
    const revenue = round2(withRevenue.reduce((s, r) => s + B(r).e.revenue, 0));
    const profit = round2(withRevenue.reduce((s, r) => s + B(r).e.profit, 0));
    const heads = tot((e) => e.headCount);
    return {
      rows,
      rowKey: (r) => B(r).batch.id,
      link: (r) => `/gado/lotes/${B(r).batch.id}`,
      initialSort: { key: 'code', dir: 'desc' },
      orientation: 'landscape',
      stats: [
        { label: 'Lotes', value: integer(rows.length), hint: `${integer(heads)} cabeças` },
        { label: 'Custo total', value: money(cost), short: brlShort(cost) },
        { label: 'Receita', value: money(revenue), short: brlShort(revenue), hint: 'realizada + estoque/projeção' },
        {
          label: 'Resultado',
          value: money(profit),
          short: brlShort(profit),
          tone: profit >= 0 ? 'success' : 'danger',
          hint: `${withRevenue.length} lote${withRevenue.length === 1 ? '' : 's'} com receita${revenue ? ` · margem ${percent(pct(profit, revenue))}` : ''}`,
        },
      ],
      columns: [
        { key: 'code', header: 'Lote', value: (r) => `${B(r).batch.code} · ${B(r).batch.name}`, mobile: 'title', total: () => 'Total' },
        { key: 'status', header: 'Status', value: (r) => BATCH_STATUS[B(r).batch.status].label, display: (r) => <StatusBadge info={BATCH_STATUS[B(r).batch.status]} />, mobile: 'badge' },
        { key: 'heads', header: 'Cabeças', kind: 'int', value: (r) => B(r).e.headCount, total: 'sum', hideBelow: 'md' },
        { key: 'carcass', header: 'Carcaça', kind: 'kg', value: (r) => B(r).e.carcassWeightKg || null, total: 'sum', hideBelow: 'lg' },
        { key: 'cost', header: 'Custo total', kind: 'money', value: (r) => B(r).e.totalCost, total: 'sum' },
        { key: 'arroba', header: 'Custo / @', kind: 'money', value: (r) => B(r).e.costPerArroba || null, hideBelow: 'lg' },
        { key: 'revenue', header: 'Receita', kind: 'money', value: (r) => B(r).e.revenue, total: 'sum' },
        { key: 'source', header: 'Fonte', value: (r) => REVENUE_SOURCE[B(r).e.revenueSource], hideBelow: 'xl', mobile: 'subtitle' },
        {
          key: 'profit',
          header: 'Resultado',
          kind: 'money',
          value: (r) => (B(r).e.revenueSource === 'NONE' ? null : B(r).e.profit),
          display: (r) => (B(r).e.revenueSource === 'NONE' ? <span className="text-subtle text-xs">sem receita</span> : <Signed v={B(r).e.profit} />),
          total: 'sum',
        },
        { key: 'margin', header: 'Margem', kind: 'percent', value: (r) => (B(r).e.revenueSource === 'NONE' ? null : B(r).e.marginPercent), total: () => (revenue ? pct(profit, revenue) : null), hideBelow: 'md' },
      ],
      note: 'Escolha um lote no filtro para ver o demonstrativo completo (conta a conta). Lotes sem receita (nem venda, nem preço de referência) ficam fora do resultado total. Fonte da receita: realizada (vendas com baixa), + estoque restante, projetada (carcaça × preço de referência) ou informada manualmente.',
    };
  },
});

// ---------------------------------------------------------------------------
// Custos por categoria
// ---------------------------------------------------------------------------

interface CostRow {
  id: string;
  group: CostGroup;
  label: string;
  count: number;
  value: number;
}

export const costsByCategory = defineReport<CostRow>({
  id: 'custos-categoria',
  title: 'Custos por categoria',
  description: 'Custos dos lotes agrupados por categoria, grupo ou lote — aquisição, engorda, abate, impostos e créditos.',
  category: 'Gado e produção',
  icon: PieChart,
  permission: 'view.cattle',
  tables: ['batch_costs', 'batches', 'partners'],
  filters: ['period', 'batch', 'partner'],
  period: { default: 'year', field: 'Data do custo' },
  options: [
    {
      key: 'group',
      label: 'Agrupar por',
      choices: [
        { value: 'category', label: 'Categoria' },
        { value: 'group', label: 'Grupo' },
        { value: 'batch', label: 'Lote de gado' },
      ],
      default: 'category',
    },
  ],
  keywords: 'despesas ração frete funrural icms senar gta abate desossa',
  build(d, f) {
    const view = f.opts.group || 'category';
    const bmap = new Map(d.batches.map((b) => [b.id, b]));
    const costs = d.batch_costs.filter((c) => inPeriod(c.date, f) && (!f.batchId || c.batchId === f.batchId) && (!f.partnerId || c.partnerId === f.partnerId));
    const rows = [
      ...groupBy(
        costs,
        (c) => (view === 'group' ? groupOf(c.category) : view === 'batch' ? c.batchId : c.category),
        (c, id): CostRow => {
          const b = bmap.get(c.batchId);
          return {
            id,
            group: groupOf(c.category),
            label: view === 'group' ? COST_GROUP_LABELS[groupOf(c.category)] : view === 'batch' ? (b ? `${b.code} · ${b.name}` : 'Lote removido') : categoryLabel(c.category),
            count: 0,
            value: 0,
          };
        },
        (a, c) => {
          a.count += 1;
          a.value += signedAmount(c);
        },
      ).values(),
    ];
    const gross = round2(costs.filter((c) => groupOf(c.category) !== 'CREDIT').reduce((s, c) => s + (Number(c.amount) || 0), 0));
    const credits = round2(costs.filter((c) => groupOf(c.category) === 'CREDIT').reduce((s, c) => s + (Number(c.amount) || 0), 0));
    const net = round2(gross - credits);
    const byGroup = COST_GROUP_ORDER.filter((g) => g !== 'CREDIT')
      .map((g) => ({ label: COST_GROUP_LABELS[g], value: round2(costs.filter((c) => groupOf(c.category) === g).reduce((s, c) => s + (Number(c.amount) || 0), 0)) }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);
    return {
      rows,
      rowKey: (r) => r.id,
      initialSort: { key: 'value', dir: 'desc' },
      stats: [
        { label: 'Custo bruto', value: money(gross), short: brlShort(gross) },
        { label: 'Créditos', value: money(credits), short: brlShort(credits), hint: 'retorno do abate, impostos' },
        { label: 'Custo líquido', value: money(net), short: brlShort(net) },
        { label: 'Lançamentos', value: integer(costs.length) },
      ],
      chart: byGroup.length ? { kind: 'rank', title: 'Custo por grupo', data: byGroup, series: [{ key: 'value', name: 'Custo' }], format: 'money' } : null,
      columns: [
        { key: 'label', header: view === 'group' ? 'Grupo' : view === 'batch' ? 'Lote' : 'Categoria', value: (r) => r.label, mobile: 'title', total: () => 'Total líquido' },
        ...(view === 'category' ? [{ key: 'group', header: 'Grupo', value: (r: CostRow) => COST_GROUP_LABELS[r.group], mobile: 'subtitle' as const }] : []),
        { key: 'count', header: 'Lançamentos', kind: 'int', value: (r) => r.count, total: 'sum' },
        { key: 'share', header: '% do bruto', kind: 'percent', value: (r) => (r.value > 0 ? pct(r.value, gross) : null), hideBelow: 'md' },
        { key: 'value', header: 'Valor', kind: 'money', value: (r) => round2(r.value), display: (r) => (r.value < 0 ? <Signed v={r.value} /> : money(r.value)), total: 'sum', mobile: 'badge' },
      ],
      note: 'Créditos (retorno do abate, crédito de imposto) aparecem negativos e reduzem o custo.',
    };
  },
});

// ---------------------------------------------------------------------------
// Rendimento de desossa
// ---------------------------------------------------------------------------

interface YieldRow {
  id: string;
  label: string;
  sub: string;
  order?: ProcessingOrder;
  orders: number;
  sent: number;
  returned: number;
  loss: number;
  bones: number;
  fat: number;
  trim: number;
  evap: number;
  costPerKg: number | null;
}

const yieldOf = (r: { sent: number; returned: number }) => (r.sent && r.returned ? round2((r.returned / r.sent) * 100) : null);

export const deboningYield = defineReport<YieldRow>({
  id: 'rendimento-desossa',
  title: 'Rendimento de desossa',
  description: 'Enviado × retornado em cortes por ordem de desossa ou por parceiro, com perdas (osso, sebo, apara, evaporação).',
  category: 'Gado e produção',
  icon: Scissors,
  permission: 'view.production',
  tables: ['processing_orders', 'batches', 'partners'],
  filters: ['period', 'partner', 'batch'],
  period: { default: '3m', field: 'Data de envio' },
  options: [
    {
      key: 'group',
      label: 'Agrupar por',
      choices: [
        { value: 'order', label: 'Ordem (OS)' },
        { value: 'partner', label: 'Parceiro' },
      ],
      default: 'order',
    },
  ],
  keywords: 'processamento OS desossa parceiro aproveitamento',
  build(d, f) {
    const orders = d.processing_orders.filter(
      (o) => o.status !== 'CANCELLED' && inPeriod(o.sentDate, f) && (!f.partnerId || o.partnerId === f.partnerId) && (!f.batchId || o.batchId === f.batchId),
    );
    const lossesOf = (o: ProcessingOrder) =>
      (o.returns || []).reduce(
        (a, r) => ({
          bones: a.bones + (r.losses?.bonesKg || 0),
          fat: a.fat + (r.losses?.fatKg || 0),
          trim: a.trim + (r.losses?.trimmingKg || 0),
          evap: a.evap + (r.losses?.evaporationKg || 0),
        }),
        { bones: 0, fat: 0, trim: 0, evap: 0 },
      );
    const byPartner = f.opts.group === 'partner';
    const rows: YieldRow[] = byPartner
      ? [
          ...groupBy(
            orders,
            (o) => o.partnerId,
            (o): YieldRow => ({ id: o.partnerId, label: o.partnerName, sub: '', orders: 0, sent: 0, returned: 0, loss: 0, bones: 0, fat: 0, trim: 0, evap: 0, costPerKg: null }),
            (a, o) => {
              const l = lossesOf(o);
              a.orders += 1;
              a.sent += o.sentKg || 0;
              a.returned += o.returnedKg || 0;
              a.loss += o.lossKg || 0;
              a.bones += l.bones;
              a.fat += l.fat;
              a.trim += l.trim;
              a.evap += l.evap;
              a.sub = `${a.orders} ${a.orders > 1 ? 'ordens' : 'ordem'}`;
            },
          ).values(),
        ]
      : orders.map((o) => ({
          id: o.id,
          label: o.number,
          sub: o.partnerName,
          order: o,
          orders: 1,
          sent: o.sentKg || 0,
          returned: o.returnedKg || 0,
          loss: o.lossKg || 0,
          ...lossesOf(o),
          costPerKg: round2(orderCostPerKg(o)),
        }));
    const sent = rows.reduce((s, r) => s + r.sent, 0);
    const returned = rows.reduce((s, r) => s + r.returned, 0);
    const loss = rows.reduce((s, r) => s + r.loss, 0);
    const done = orders.filter((o) => o.status === 'COMPLETED');
    const doneYield = yieldOf({ sent: done.reduce((s, o) => s + o.sentKg, 0), returned: done.reduce((s, o) => s + o.returnedKg, 0) });
    return {
      rows,
      rowKey: (r) => r.id,
      link: byPartner ? undefined : (r) => `/producao/processamento/${r.id}`,
      initialSort: byPartner ? { key: 'sent', dir: 'desc' } : { key: 'date', dir: 'desc' },
      orientation: 'landscape',
      stats: [
        { label: 'Enviado', value: kgFmt((sent)), hint: `${integer(orders.length)} ordens` },
        { label: 'Retornado em cortes', value: kgFmt((returned)) },
        { label: 'Rendimento', value: percent(yieldOf({ sent, returned }) ?? 0), hint: doneYield !== null ? `${percent(doneYield)} nas concluídas` : undefined, tone: deboningYieldTone(yieldOf({ sent, returned })) },
        { label: 'Perdas declaradas', value: kgFmt((loss)), hint: sent ? `${percent(pct(loss, sent))} do enviado` : undefined },
      ],
      columns: [
        { key: 'label', header: byPartner ? 'Parceiro' : 'OS', value: (r) => r.label, mobile: 'title', total: () => 'Total' },
        ...(byPartner
          ? [{ key: 'orders', header: 'Ordens', kind: 'int' as const, value: (r: YieldRow) => r.orders, total: 'sum' as const }]
          : [
              { key: 'partner', header: 'Parceiro', value: (r: YieldRow) => r.sub, mobile: 'subtitle' as const, hideBelow: 'md' as const },
              { key: 'batch', header: 'Lote', value: (r: YieldRow) => r.order?.batchCode || '—', hideBelow: 'xl' as const },
              { key: 'date', header: 'Envio', kind: 'date' as const, value: (r: YieldRow) => r.order?.sentDate || '', hideBelow: 'lg' as const },
              {
                key: 'status',
                header: 'Status',
                value: (r: YieldRow) => (r.order ? PROCESSING_STATUS[r.order.status].label : ''),
                display: (r: YieldRow) => (r.order ? <StatusBadge info={PROCESSING_STATUS[r.order.status]} /> : null),
                hideBelow: 'lg' as const,
              },
            ]),
        { key: 'sent', header: 'Enviado', kind: 'kg', value: (r) => r.sent, total: 'sum' },
        { key: 'returned', header: 'Retornado', kind: 'kg', value: (r) => r.returned, total: 'sum' },
        { key: 'bones', header: 'Osso', kind: 'kg', value: (r) => r.bones || null, total: 'sum', hideBelow: 'xl' },
        { key: 'fat', header: 'Sebo', kind: 'kg', value: (r) => r.fat || null, total: 'sum', hideBelow: 'xl' },
        { key: 'trim', header: 'Apara', kind: 'kg', value: (r) => r.trim || null, total: 'sum', hideBelow: 'xl' },
        { key: 'loss', header: 'Perdas', kind: 'kg', value: (r) => r.loss, total: 'sum', hideBelow: 'md' },
        {
          key: 'yield',
          header: 'Rendimento',
          kind: 'percent',
          value: (r) => yieldOf(r),
          display: (r) => {
            const y = yieldOf(r);
            return y === null ? '—' : <Badge tone={deboningYieldTone(y)}>{percent(y)}</Badge>;
          },
          total: () => yieldOf({ sent, returned }),
          mobile: 'badge',
        },
        ...(byPartner ? [] : [{ key: 'cpk', header: 'Custo/kg', kind: 'money' as const, value: (r: YieldRow) => r.costPerKg, hideBelow: 'lg' as const }]),
      ],
      note: 'Rendimento = retornado em cortes ÷ enviado. Ordens abertas têm rendimento parcial. Referência: 72% ou mais é bom; abaixo de 66% merece atenção.',
    };
  },
});
