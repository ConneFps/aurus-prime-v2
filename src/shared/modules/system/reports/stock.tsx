/**
 * Relatórios de estoque: posição (venda e pós-abate), validades,
 * movimentações (ledger) e perdas.
 */
import { AlertTriangle, ArrowLeftRight, CalendarClock, Package } from 'lucide-react';
import { daysBetween, integer, money, qty, round2, round3 } from '../../../domain/format';
import { LOSS_ORIGIN_LABELS, LOSS_REASON_LABELS, MOVEMENT_LABELS, STAGE_LABELS } from '../../../domain/labels';
import type { MovementType, StockLot, StockLoss, StockMovement } from '../../../domain/types';
import { Badge, StatusBadge } from '../../../ui';
import { brlShort } from '../../finance/helpers';
import { aggregateByProduct, expiryState, LOT_STATUS, lotHasBalance, type ProductStock } from '../../stock/model';
import { inPeriod } from './data';
import { groupBy, pct } from './helpers';
import { kgFmt } from './format';
import { defineReport, type ReportOption } from './types';

const STAGE_OPTION: ReportOption = {
  key: 'stage',
  label: 'Estoque',
  choices: [
    { value: 'FINISHED', label: 'Venda (cortes)' },
    { value: 'RAW', label: 'Pós-abate (carcaças)' },
  ],
  default: 'FINISHED',
};

const lotsFiltered = (lots: StockLot[], f: { batchId: string | null; productId: string | null }, stage?: string) =>
  lots.filter((l) => (!stage || stage === 'ALL' || l.stage === stage) && (!f.batchId || l.batchId === f.batchId) && (!f.productId || l.productId === f.productId));

// ---------------------------------------------------------------------------
// Posição de estoque
// ---------------------------------------------------------------------------

type PositionRow = { type: 'product'; p: ProductStock } | { type: 'lot'; l: StockLot };

export const stockPosition = defineReport<PositionRow>({
  id: 'posicao-estoque',
  title: 'Posição de estoque',
  description: 'Saldo atual por produto ou por lote, com custo médio e valor — estoque de venda ou pós-abate.',
  category: 'Estoque',
  icon: Package,
  permission: 'view.stock',
  tables: ['stock_lots', 'products', 'batches'],
  filters: ['product', 'batch'],
  options: [
    STAGE_OPTION,
    {
      key: 'view',
      label: 'Detalhe',
      choices: [
        { value: 'product', label: 'Por produto' },
        { value: 'lot', label: 'Por lote' },
      ],
      default: 'product',
    },
  ],
  keywords: 'saldo inventário valor câmara fria RAW FINISHED',
  build(d, f) {
    const stage = f.opts.stage || 'FINISHED';
    const lots = lotsFiltered(d.stock_lots, f, stage);
    const products = aggregateByProduct(lots, d.products).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const value = round2(products.reduce((s, p) => s + p.value, 0));
    const kgAvail = products.filter((p) => p.unit === 'KG').reduce((s, p) => s + p.qty, 0);
    const below = products.filter((p) => p.belowMin).length;
    const expired = products.reduce((s, p) => s + p.expiredQty, 0);
    const stats = [
      { label: 'Valor em estoque', value: money(value), short: brlShort(value), hint: 'a custo' },
      { label: 'Quilos disponíveis', value: kgFmt((kgAvail)) },
      { label: 'Produtos com saldo', value: integer(products.filter((p) => p.qty > 0).length), hint: `${integer(lots.filter((l) => lotHasBalance(l)).length)} lotes` },
      stage === 'FINISHED'
        ? { label: 'Abaixo do mínimo', value: integer(below), tone: below ? ('warning' as const) : undefined, hint: expired ? `${kgFmt(expired)} vencidos` : undefined }
        : { label: 'Vencidos', value: kgFmt((expired)), tone: expired ? ('danger' as const) : undefined },
    ];
    if (f.opts.view === 'lot') {
      const rows: PositionRow[] = lots.filter(lotHasBalance).map((l) => ({ type: 'lot', l }));
      const L = (r: PositionRow) => (r as { l: StockLot }).l;
      return {
        rows,
        rowKey: (r) => L(r).id,
        initialSort: { key: 'product', dir: 'asc' },
        stats,
        columns: [
          { key: 'product', header: 'Produto', value: (r) => L(r).productName, mobile: 'title', total: (rs) => `${rs.length} lotes` },
          { key: 'lot', header: 'Lote', value: (r) => L(r).lotCode || '—', mobile: 'subtitle' },
          { key: 'batch', header: 'Lote de gado', value: (r) => L(r).batchCode || '—', hideBelow: 'lg' },
          { key: 'entry', header: 'Entrada', kind: 'date', value: (r) => L(r).entryDate, hideBelow: 'md' },
          { key: 'expiry', header: 'Validade', kind: 'date', value: (r) => L(r).expiryDate || '' },
          { key: 'qty', header: 'Saldo', kind: 'number', value: (r) => round3(L(r).balanceQty), display: (r) => qty(L(r).balanceQty, L(r).unit), total: (rs) => kgFmt(rs.filter((r) => L(r).unit === 'KG').reduce((s, r) => s + L(r).balanceQty, 0)) },
          { key: 'cost', header: 'Custo un.', kind: 'money', value: (r) => L(r).unitCost, hideBelow: 'lg' },
          { key: 'value', header: 'Valor', kind: 'money', value: (r) => round2(L(r).balanceQty * L(r).unitCost), total: 'sum' },
          { key: 'origin', header: 'Origem', value: (r) => (L(r).origin === 'INTERCOMPANY' ? `Intercompany ${L(r).originCompany || ''}`.trim() : 'Próprio'), hideBelow: 'xl' },
          { key: 'status', header: 'Status', value: (r) => LOT_STATUS[L(r).status].label, display: (r) => <StatusBadge info={LOT_STATUS[L(r).status]} />, mobile: 'badge' },
        ],
        note: `Estoque ${STAGE_LABELS[stage as 'RAW' | 'FINISHED'].toLowerCase()} — lotes com saldo, em ordem de produto.`,
      };
    }
    const rows: PositionRow[] = products.map((p) => ({ type: 'product', p }));
    const P = (r: PositionRow) => (r as { p: ProductStock }).p;
    return {
      rows,
      rowKey: (r) => P(r).id,
      initialSort: { key: 'name', dir: 'asc' },
      stats,
      columns: [
        { key: 'name', header: 'Produto', value: (r) => P(r).name, mobile: 'title', total: (rs) => `${rs.length} produtos` },
        { key: 'category', header: 'Categoria', value: (r) => P(r).category, mobile: 'subtitle', hideBelow: 'md' },
        { key: 'lots', header: 'Lotes', kind: 'int', value: (r) => P(r).availableLots, total: 'sum', hideBelow: 'lg' },
        { key: 'qty', header: 'Saldo', kind: 'number', value: (r) => round3(P(r).qty), display: (r) => qty(P(r).qty, P(r).unit), total: () => kgFmt(kgAvail) },
        { key: 'blocked', header: 'Bloqueado', kind: 'number', value: (r) => round3(P(r).blockedQty) || null, display: (r) => (P(r).blockedQty ? qty(P(r).blockedQty, P(r).unit) : '—'), hideBelow: 'xl' },
        { key: 'avg', header: 'Custo médio', kind: 'money', value: (r) => round2(P(r).avgCost), hideBelow: 'md' },
        { key: 'value', header: 'Valor', kind: 'money', value: (r) => P(r).value, total: 'sum' },
        { key: 'min', header: 'Mínimo', kind: 'number', value: (r) => P(r).minStock ?? null, display: (r) => (P(r).minStock ? qty(P(r).minStock, P(r).unit) : '—'), hideBelow: 'lg' },
        {
          key: 'state',
          header: 'Situação',
          value: (r) => (P(r).expiredQty > 0 ? 'Com vencidos' : P(r).belowMin ? 'Abaixo do mínimo' : P(r).soonQty > 0 ? 'Vencendo' : 'OK'),
          display: (r) => {
            const p = P(r);
            if (p.expiredQty > 0) return <Badge tone="danger">Com vencidos</Badge>;
            if (p.belowMin) return <Badge tone="warning">Abaixo do mínimo</Badge>;
            if (p.soonQty > 0) return <Badge tone="warning">Vencendo</Badge>;
            return <Badge tone="success">OK</Badge>;
          },
          mobile: 'badge',
        },
      ],
      note: `Estoque ${STAGE_LABELS[stage as 'RAW' | 'FINISHED'].toLowerCase()}. Saldo e valor consideram só lotes disponíveis (bloqueados aparecem à parte).`,
    };
  },
});

// ---------------------------------------------------------------------------
// Validades
// ---------------------------------------------------------------------------

export const expiryReport = defineReport<StockLot & { days: number | null }>({
  id: 'validades',
  title: 'Validades',
  description: 'Lotes com saldo por data de validade: vencidos, vencendo em 7 ou 30 dias.',
  category: 'Estoque',
  icon: CalendarClock,
  permission: 'view.stock',
  tables: ['stock_lots', 'products', 'batches'],
  filters: ['product', 'batch'],
  options: [
    {
      key: 'window',
      label: 'Mostrar',
      choices: [
        { value: '30', label: 'Vencidos e até 30 dias' },
        { value: '7', label: 'Vencidos e até 7 dias' },
        { value: 'expired', label: 'Só vencidos' },
        { value: 'all', label: 'Todos com validade' },
      ],
      default: '30',
    },
    { ...STAGE_OPTION, choices: [{ value: 'ALL', label: 'Todos' }, ...STAGE_OPTION.choices], default: 'ALL' },
  ],
  keywords: 'vencimento vencidos shelf life',
  build(d, f, ctx) {
    const w = f.opts.window || '30';
    const rows = lotsFiltered(d.stock_lots, f, f.opts.stage || 'ALL')
      .filter((l) => lotHasBalance(l) && l.expiryDate)
      .map((l) => ({ ...l, days: daysBetween(ctx.today, l.expiryDate!) }))
      .filter((l) => (w === 'all' ? true : w === 'expired' ? (l.days ?? 0) < 0 : (l.days ?? 0) <= Number(w)));
    const sumOf = (pred: (x: (typeof rows)[number]) => boolean) => {
      const rs = rows.filter(pred);
      return { kg: rs.reduce((s, r) => s + (r.unit === 'KG' ? r.balanceQty : 0), 0), value: round2(rs.reduce((s, r) => s + r.balanceQty * r.unitCost, 0)), n: rs.length };
    };
    const exp = sumOf((r) => (r.days ?? 0) < 0);
    const s7 = sumOf((r) => (r.days ?? 0) >= 0 && (r.days ?? 0) <= 7);
    const s30 = sumOf((r) => (r.days ?? 0) > 7 && (r.days ?? 0) <= 30);
    return {
      rows,
      rowKey: (r) => r.id,
      initialSort: { key: 'expiry', dir: 'asc' },
      stats: [
        { label: 'Vencidos', value: kgFmt((exp.kg)), hint: `${money(exp.value)} · ${exp.n} lotes`, tone: exp.n ? 'danger' : undefined },
        { label: 'Vencem em 7 dias', value: kgFmt((s7.kg)), hint: `${money(s7.value)} · ${s7.n} lotes`, tone: s7.n ? 'warning' : undefined },
        { label: 'De 8 a 30 dias', value: kgFmt((s30.kg)), hint: `${money(s30.value)} · ${s30.n} lotes` },
        { label: 'Lotes listados', value: integer(rows.length) },
      ],
      columns: [
        { key: 'product', header: 'Produto', value: (r) => r.productName, mobile: 'title', total: (rs) => `${rs.length} lotes` },
        { key: 'lot', header: 'Lote', value: (r) => r.lotCode || '—', mobile: 'subtitle' },
        { key: 'stage', header: 'Estoque', value: (r) => STAGE_LABELS[r.stage], hideBelow: 'lg' },
        { key: 'batch', header: 'Lote de gado', value: (r) => r.batchCode || '—', hideBelow: 'lg' },
        { key: 'expiry', header: 'Validade', kind: 'date', value: (r) => r.expiryDate || '' },
        { key: 'days', header: 'Dias', kind: 'int', value: (r) => r.days, hideBelow: 'md' },
        { key: 'qty', header: 'Saldo', kind: 'number', value: (r) => round3(r.balanceQty), display: (r) => qty(r.balanceQty, r.unit), total: (rs) => kgFmt(rs.filter((r) => r.unit === 'KG').reduce((s, r) => s + r.balanceQty, 0)) },
        { key: 'value', header: 'Valor', kind: 'money', value: (r) => round2(r.balanceQty * r.unitCost), total: 'sum' },
        {
          key: 'state',
          header: 'Situação',
          value: (r) => ((r.days ?? 0) < 0 ? 'Vencido' : (r.days ?? 0) <= 7 ? 'Vencendo' : 'No prazo'),
          display: (r) => {
            const st = expiryState(r.expiryDate, ctx.today);
            const dd = r.days ?? 0;
            return st === 'EXPIRED' ? <Badge tone="danger">Vencido há {-dd} d</Badge> : st === 'SOON' ? <Badge tone="warning">{dd === 0 ? 'Vence hoje' : `Vence em ${dd} d`}</Badge> : <Badge tone="success">Em {dd} dias</Badge>;
          },
          mobile: 'badge',
        },
      ],
      note: 'Dias = dias até a validade (negativo = vencido). Lotes vencidos devem ser baixados como perda em Movimentações.',
    };
  },
});

// ---------------------------------------------------------------------------
// Movimentações
// ---------------------------------------------------------------------------

const MOVE_GROUPS: Record<string, MovementType[] | null> = {
  ALL: null,
  IN: ['ENTRY', 'SLAUGHTER_ENTRY', 'PROCESSING_IN', 'SALE_REVERSAL'],
  OUT: ['SALE', 'PROCESSING_OUT', 'LOSS'],
  SALE: ['SALE', 'SALE_REVERSAL'],
  PROCESSING: ['PROCESSING_OUT', 'PROCESSING_IN'],
  LOSS: ['LOSS'],
  ADJUSTMENT: ['ADJUSTMENT'],
};

export const movementsReport = defineReport<StockMovement & { unit: 'KG' | 'UN' }>({
  id: 'movimentacoes',
  title: 'Movimentações de estoque',
  description: 'Todas as entradas e saídas (ledger): abate, desossa, vendas, estornos, perdas e ajustes.',
  category: 'Estoque',
  icon: ArrowLeftRight,
  permission: 'view.stock',
  tables: ['stock_movements', 'products', 'batches'],
  filters: ['period', 'product', 'batch'],
  period: { default: '3m', field: 'Data do movimento' },
  options: [
    {
      key: 'type',
      label: 'Tipo',
      choices: [
        { value: 'ALL', label: 'Todos' },
        { value: 'IN', label: 'Entradas' },
        { value: 'OUT', label: 'Saídas' },
        { value: 'SALE', label: 'Vendas e estornos' },
        { value: 'PROCESSING', label: 'Desossa' },
        { value: 'LOSS', label: 'Perdas' },
        { value: 'ADJUSTMENT', label: 'Ajustes' },
      ],
      default: 'ALL',
    },
    { ...STAGE_OPTION, choices: [{ value: 'ALL', label: 'Todos' }, ...STAGE_OPTION.choices], default: 'ALL' },
  ],
  keywords: 'ledger entrada saída kardex',
  build(d, f) {
    const units = new Map(d.products.map((p) => [p.id, p.unit]));
    const types = MOVE_GROUPS[f.opts.type || 'ALL'];
    const stage = f.opts.stage || 'ALL';
    const rows = d.stock_movements
      .filter(
        (m) =>
          inPeriod(m.date, f) &&
          (!types || types.includes(m.type)) &&
          (stage === 'ALL' || m.stage === stage) &&
          (!f.productId || m.productId === f.productId) &&
          (!f.batchId || m.batchId === f.batchId),
      )
      .map((m) => ({ ...m, unit: units.get(m.productId) || ('KG' as const) }));
    const kgIn = rows.filter((m) => m.qty > 0 && m.unit === 'KG').reduce((s, m) => s + m.qty, 0);
    const kgOut = rows.filter((m) => m.qty < 0 && m.unit === 'KG').reduce((s, m) => s - m.qty, 0);
    const valIn = round2(rows.filter((m) => m.qty > 0).reduce((s, m) => s + m.qty * m.unitCost, 0));
    const valOut = round2(rows.filter((m) => m.qty < 0).reduce((s, m) => s - m.qty * m.unitCost, 0));
    return {
      rows,
      rowKey: (r) => r.id,
      initialSort: { key: 'date', dir: 'desc' },
      orientation: 'landscape',
      stats: [
        { label: 'Entradas', value: kgFmt((kgIn)), hint: money(valIn), tone: 'success' },
        { label: 'Saídas', value: kgFmt((kgOut)), hint: money(valOut) },
        { label: 'Saldo do período', value: kgFmt((kgIn - kgOut)) },
        { label: 'Movimentos', value: integer(rows.length) },
      ],
      columns: [
        { key: 'date', header: 'Data', kind: 'date', value: (r) => r.date },
        { key: 'type', header: 'Tipo', value: (r) => MOVEMENT_LABELS[r.type].label, display: (r) => <StatusBadge info={MOVEMENT_LABELS[r.type]} />, mobile: 'badge' },
        { key: 'product', header: 'Produto', value: (r) => r.productName, mobile: 'title' },
        { key: 'stage', header: 'Estoque', value: (r) => STAGE_LABELS[r.stage], hideBelow: 'xl' },
        {
          key: 'qty',
          header: 'Quantidade',
          kind: 'number',
          value: (r) => round3(r.qty),
          display: (r) => <span className={r.qty < 0 ? 'text-danger' : 'text-success'}>{(r.qty > 0 ? '+' : '') + qty(r.qty, r.unit)}</span>,
          total: (rs) => kgFmt(rs.filter((r) => r.unit === 'KG').reduce((s, r) => s + r.qty, 0)),
        },
        { key: 'cost', header: 'Custo un.', kind: 'money', value: (r) => r.unitCost, hideBelow: 'lg' },
        { key: 'value', header: 'Valor', kind: 'money', value: (r) => round2(r.qty * r.unitCost), total: 'sum', hideBelow: 'md' },
        {
          key: 'ref',
          header: 'Referência',
          value: (r) => [r.saleNumber ? `Pedido ${r.saleNumber}` : null, r.customerName, r.reason].filter(Boolean).join(' · ') || '—',
          mobile: 'subtitle',
        },
        { key: 'user', header: 'Usuário', value: (r) => r.userName || '—', hideBelow: 'xl' },
      ],
      note: 'Quantidade positiva = entrada; negativa = saída. Valor a custo do lote.',
    };
  },
});

// ---------------------------------------------------------------------------
// Perdas
// ---------------------------------------------------------------------------

interface LossGroupRow {
  id: string;
  label: string;
  count: number;
  qty: number;
  value: number;
}

type LossRow = { kind: 'item'; l: StockLoss } | { kind: 'group'; g: LossGroupRow };

export const lossesReport = defineReport<LossRow>({
  id: 'perdas',
  title: 'Perdas',
  description: 'Perdas de abate, desossa, estoque e transporte por motivo, origem e produto.',
  category: 'Estoque',
  icon: AlertTriangle,
  permission: 'view.stock',
  tables: ['stock_losses', 'products', 'batches', 'partners'],
  filters: ['period', 'product', 'batch', 'partner'],
  period: { default: '3m', field: 'Data da perda' },
  options: [
    {
      key: 'group',
      label: 'Agrupar por',
      choices: [
        { value: 'none', label: 'Sem agrupar (lista)' },
        { value: 'reason', label: 'Motivo' },
        { value: 'origin', label: 'Origem' },
        { value: 'product', label: 'Produto' },
      ],
      default: 'none',
    },
  ],
  keywords: 'quebra osso sebo apara evaporação descarte avaria',
  build(d, f) {
    const losses = d.stock_losses.filter(
      (l) =>
        inPeriod(l.date, f) &&
        (!f.productId || l.productId === f.productId) &&
        (!f.batchId || l.batchId === f.batchId) &&
        (!f.partnerId || l.partnerId === f.partnerId),
    );
    const valueOf = (l: StockLoss) => l.totalValue ?? round2((l.qty || 0) * (l.unitCost || 0));
    const totalKg = losses.reduce((s, l) => s + (l.qty || 0), 0);
    const totalValue = round2(losses.reduce((s, l) => s + valueOf(l), 0));
    const byReason = [...groupBy(losses, (l) => l.reason, (l) => ({ label: LOSS_REASON_LABELS[l.reason], qty: 0 }), (a, l) => (a.qty += l.qty || 0)).values()].sort((a, b) => b.qty - a.qty);
    const stats = [
      { label: 'Quantidade perdida', value: kgFmt((totalKg)) },
      { label: 'Valor a custo', value: money(totalValue), short: brlShort(totalValue) },
      { label: 'Ocorrências', value: integer(losses.length) },
      { label: 'Principal motivo', value: byReason[0]?.label || '—', hint: byReason[0] ? kgFmt((byReason[0].qty)) : undefined },
    ];
    const chart = byReason.length
      ? { kind: 'rank' as const, title: 'Quilos por motivo', data: byReason.map((r) => ({ label: r.label, value: round3(r.qty) })), series: [{ key: 'value', name: 'Quantidade' }], format: 'kg' as const }
      : null;
    const group = f.opts.group || 'none';
    if (group !== 'none') {
      const keyOf = (l: StockLoss) => (group === 'reason' ? l.reason : group === 'origin' ? l.origin : l.productId || l.productName || 'sem-produto');
      const labelOf = (l: StockLoss) => (group === 'reason' ? LOSS_REASON_LABELS[l.reason] : group === 'origin' ? LOSS_ORIGIN_LABELS[l.origin] : l.productName || 'Sem produto (perda de processo)');
      const rows: LossRow[] = [
        ...groupBy(
          losses,
          keyOf,
          (l, id): LossGroupRow => ({ id, label: labelOf(l), count: 0, qty: 0, value: 0 }),
          (a, l) => {
            a.count += 1;
            a.qty += l.qty || 0;
            a.value += valueOf(l);
          },
        ).values(),
      ].map((g) => ({ kind: 'group', g }));
      const G = (r: LossRow) => (r as { g: LossGroupRow }).g;
      return {
        rows,
        rowKey: (r) => G(r).id,
        initialSort: { key: 'qty', dir: 'desc' },
        stats,
        chart,
        columns: [
          { key: 'label', header: group === 'reason' ? 'Motivo' : group === 'origin' ? 'Origem' : 'Produto', value: (r) => G(r).label, mobile: 'title', total: () => 'Total' },
          { key: 'count', header: 'Ocorrências', kind: 'int', value: (r) => G(r).count, total: 'sum' },
          { key: 'qty', header: 'Quantidade', kind: 'kg', value: (r) => G(r).qty, total: 'sum', mobile: 'badge' },
          { key: 'share', header: '% do total', kind: 'percent', value: (r) => pct(G(r).qty, totalKg) },
          { key: 'value', header: 'Valor', kind: 'money', value: (r) => round2(G(r).value), total: 'sum' },
        ],
      };
    }
    const L = (r: LossRow) => (r as { l: StockLoss }).l;
    return {
      rows: losses.map((l) => ({ kind: 'item', l })),
      rowKey: (r) => L(r).id,
      initialSort: { key: 'date', dir: 'desc' },
      stats,
      chart,
      orientation: 'landscape',
      columns: [
        { key: 'date', header: 'Data', kind: 'date', value: (r) => L(r).date },
        { key: 'reason', header: 'Motivo', value: (r) => LOSS_REASON_LABELS[L(r).reason], mobile: 'title' },
        { key: 'origin', header: 'Origem', value: (r) => LOSS_ORIGIN_LABELS[L(r).origin], mobile: 'badge' },
        { key: 'product', header: 'Produto', value: (r) => L(r).productName || '—', mobile: 'subtitle' },
        { key: 'qty', header: 'Quantidade', kind: 'kg', value: (r) => L(r).qty, total: 'sum' },
        { key: 'value', header: 'Valor', kind: 'money', value: (r) => valueOf(L(r)), total: 'sum' },
        { key: 'os', header: 'OS', value: (r) => L(r).processingOrderNumber || '—', hideBelow: 'lg' },
        { key: 'partner', header: 'Parceiro', value: (r) => L(r).partnerName || '—', hideBelow: 'lg' },
        { key: 'notes', header: 'Observação', value: (r) => L(r).notes || '', hideBelow: 'xl', noPdf: true },
      ],
    };
  },
});
