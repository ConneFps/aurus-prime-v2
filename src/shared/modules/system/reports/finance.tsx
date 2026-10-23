/**
 * Relatórios financeiros: contas a receber (aging), contas a pagar,
 * fluxo de caixa realizado e comissões.
 */
import { ArrowDownUp, BadgePercent, HandCoins, Wallet } from 'lucide-react';
import { integer, money, percent, round2 } from '../../../domain/format';
import { ENTRY_CATEGORY_LABELS } from '../../../domain/labels';
import type { FinancialEntry } from '../../../domain/types';
import { Progress, StatusBadge } from '../../../ui';
import { sellerCommissions, type SellerCommission } from '../../finance/commissionModel';
import {
  activePayments,
  AGING_LABELS,
  agingBucket,
  balanceOf,
  brlShort,
  daysLate,
  ENTRY_STATE,
  entryState,
  isOverdue,
  partyKey,
  shortMonth,
  type AgingBucket,
} from '../../finance/helpers';
import { inPeriod } from './data';
import { GROUP_DAY_MONTH, groupBy, pct, periodKeys, periodLabel } from './helpers';
import { defineReport } from './types';

const BUCKETS: AgingBucket[] = ['CURRENT', 'D30', 'D60', 'D90', 'D90P'];
const installment = (e: FinancialEntry) => (e.installments > 1 ? `${e.installment}/${e.installments}` : 'Única');

// ---------------------------------------------------------------------------
// Contas a receber — aging
// ---------------------------------------------------------------------------

interface AgingRow {
  id: string;
  name: string;
  link: string | null;
  buckets: Record<AgingBucket, number>;
  total: number;
  maxLate: number;
  count: number;
}

type ReceivableRow = { kind: 'party'; a: AgingRow } | { kind: 'entry'; e: FinancialEntry };

export const receivablesAging = defineReport<ReceivableRow>({
  id: 'contas-receber',
  title: 'Contas a receber (aging)',
  description: 'Saldo em aberto por faixa de atraso — por cliente ou título a título.',
  category: 'Financeiro',
  icon: HandCoins,
  permission: 'finance.view',
  tables: ['financial_entries', 'customers', 'profiles'],
  filters: ['customer', 'seller'],
  options: [
    {
      key: 'view',
      label: 'Detalhe',
      choices: [
        { value: 'party', label: 'Por cliente' },
        { value: 'entry', label: 'Título a título' },
      ],
      default: 'party',
    },
  ],
  keywords: 'inadimplência atraso vencidos cobrança boleto parcela',
  build(d, f, ctx) {
    const open = d.financial_entries.filter(
      (e) =>
        e.direction === 'IN' && e.status === 'OPEN' && balanceOf(e) > 0.004 && (!f.customerId || e.partyId === f.customerId) && (!f.sellerId || e.sellerId === f.sellerId),
    );
    const total = round2(open.reduce((s, e) => s + balanceOf(e), 0));
    const overdue = round2(open.filter((e) => isOverdue(e, ctx.today)).reduce((s, e) => s + balanceOf(e), 0));
    const sumBucket = (b: AgingBucket) => round2(open.filter((e) => agingBucket(e, ctx.today) === b).reduce((s, e) => s + balanceOf(e), 0));
    const totals = Object.fromEntries(BUCKETS.map((b) => [b, sumBucket(b)])) as Record<AgingBucket, number>;
    const stats = [
      { label: 'Total a receber', value: money(total), short: brlShort(total), hint: `${integer(open.length)} parcelas` },
      { label: 'Vencido', value: money(overdue), short: brlShort(overdue), tone: overdue ? ('danger' as const) : undefined, hint: total ? `${percent(pct(overdue, total))} da carteira` : undefined },
      { label: 'A vencer', value: money(totals.CURRENT), short: brlShort(totals.CURRENT) },
      { label: 'Mais de 90 dias', value: money(totals.D90P), short: brlShort(totals.D90P), tone: totals.D90P ? ('danger' as const) : undefined },
    ];
    const chart = {
      kind: 'bars' as const,
      title: 'Saldo por faixa de atraso',
      data: BUCKETS.map((b) => ({ label: AGING_LABELS[b], value: totals[b] })),
      series: [{ key: 'value', name: 'Saldo' }],
      format: 'money' as const,
    };
    if (f.opts.view === 'entry') {
      const E = (r: ReceivableRow) => (r as { e: FinancialEntry }).e;
      return {
        rows: open.map((e) => ({ kind: 'entry', e })),
        rowKey: (r) => E(r).id,
        link: (r) => (E(r).partyType === 'CUSTOMER' && E(r).partyId ? `/clientes/${E(r).partyId}` : null),
        initialSort: { key: 'due', dir: 'asc' },
        orientation: 'landscape',
        stats,
        chart,
        columns: [
          { key: 'due', header: 'Vencimento', kind: 'date', value: (r) => E(r).dueDate },
          { key: 'party', header: 'Cliente', value: (r) => E(r).partyName, mobile: 'title', total: (rs) => `${rs.length} parcelas` },
          { key: 'desc', header: 'Descrição', value: (r) => E(r).description, mobile: 'subtitle', hideBelow: 'lg' },
          { key: 'inst', header: 'Parcela', value: (r) => installment(E(r)), hideBelow: 'md' },
          { key: 'amount', header: 'Valor', kind: 'money', value: (r) => E(r).amount, total: 'sum', hideBelow: 'md' },
          { key: 'paid', header: 'Pago', kind: 'money', value: (r) => E(r).paidAmount || 0, total: 'sum', hideBelow: 'lg' },
          { key: 'balance', header: 'Saldo', kind: 'money', value: (r) => balanceOf(E(r)), total: 'sum' },
          { key: 'late', header: 'Dias de atraso', kind: 'int', value: (r) => daysLate(E(r), ctx.today) || null },
          {
            key: 'bucket',
            header: 'Situação',
            value: (r) => AGING_LABELS[agingBucket(E(r), ctx.today)],
            display: (r) => <StatusBadge info={ENTRY_STATE[entryState(E(r), ctx.today)]} />,
            mobile: 'badge',
          },
        ],
      };
    }
    const rows = [
      ...groupBy(
        open,
        partyKey,
        (e, id): AgingRow => ({
          id,
          name: e.partyName,
          link: e.partyType === 'CUSTOMER' && e.partyId ? `/clientes/${e.partyId}` : null,
          buckets: { CURRENT: 0, D30: 0, D60: 0, D90: 0, D90P: 0 },
          total: 0,
          maxLate: 0,
          count: 0,
        }),
        (a, e) => {
          const b = balanceOf(e);
          a.buckets[agingBucket(e, ctx.today)] += b;
          a.total += b;
          a.count += 1;
          a.maxLate = Math.max(a.maxLate, daysLate(e, ctx.today));
        },
      ).values(),
    ].map((a) => ({ kind: 'party' as const, a }));
    const A = (r: ReceivableRow) => (r as { a: AgingRow }).a;
    return {
      rows,
      rowKey: (r) => A(r).id,
      link: (r) => A(r).link,
      initialSort: { key: 'total', dir: 'desc' },
      orientation: 'landscape',
      stats,
      chart,
      columns: [
        { key: 'name', header: 'Cliente', value: (r) => A(r).name, mobile: 'title', total: (rs) => `${rs.length} clientes` },
        ...BUCKETS.map((b) => ({
          key: b,
          header: AGING_LABELS[b],
          kind: 'money' as const,
          value: (r: ReceivableRow) => round2(A(r).buckets[b]) || null,
          total: 'sum' as const,
          hideBelow: b === 'CURRENT' ? undefined : ('md' as const),
          mobile: b === 'CURRENT' ? undefined : (false as const),
        })),
        {
          key: 'overdue',
          header: 'Vencido',
          kind: 'money',
          value: (r) => round2(A(r).total - A(r).buckets.CURRENT) || null,
          display: (r) => {
            const v = round2(A(r).total - A(r).buckets.CURRENT);
            return v ? <span className="text-danger">{money(v)}</span> : '—';
          },
          total: 'sum',
        },
        { key: 'late', header: 'Maior atraso', kind: 'int', value: (r) => A(r).maxLate || null, display: (r) => (A(r).maxLate ? `${A(r).maxLate} dias` : '—'), hideBelow: 'lg', mobile: 'subtitle' },
        { key: 'total', header: 'Total', kind: 'money', value: (r) => round2(A(r).total), total: 'sum', mobile: 'badge' },
      ],
      note: `Posição em ${ctx.today.split('-').reverse().join('/')}. Saldo = valor da parcela − valor já pago (parcelas canceladas não entram).`,
    };
  },
});

// ---------------------------------------------------------------------------
// Contas a pagar
// ---------------------------------------------------------------------------

export const payablesReport = defineReport<FinancialEntry>({
  id: 'contas-pagar',
  title: 'Contas a pagar',
  description: 'Parcelas a pagar por vencimento: fornecedores, frete, ração, impostos e demais despesas.',
  category: 'Financeiro',
  icon: Wallet,
  permission: 'finance.view',
  tables: ['financial_entries', 'partners'],
  filters: ['period', 'partner'],
  period: { default: 'all', field: 'Vencimento' },
  options: [
    {
      key: 'status',
      label: 'Situação',
      choices: [
        { value: 'open', label: 'Em aberto' },
        { value: 'overdue', label: 'Vencidas' },
        { value: 'paid', label: 'Pagas' },
        { value: 'all', label: 'Todas (menos canceladas)' },
      ],
      default: 'open',
    },
  ],
  keywords: 'fornecedor despesa boleto pagar vencimento',
  build(d, f, ctx) {
    const st = f.opts.status || 'open';
    const rows = d.financial_entries.filter(
      (e) =>
        e.direction === 'OUT' &&
        e.status !== 'CANCELLED' &&
        inPeriod(e.dueDate, f) &&
        (!f.partnerId || e.partyId === f.partnerId) &&
        (st === 'all' || (st === 'paid' ? e.status === 'PAID' : st === 'overdue' ? isOverdue(e, ctx.today) : e.status === 'OPEN')),
    );
    const open = rows.filter((e) => e.status === 'OPEN');
    const openSum = round2(open.reduce((s, e) => s + balanceOf(e), 0));
    const overdue = round2(open.filter((e) => isOverdue(e, ctx.today)).reduce((s, e) => s + balanceOf(e), 0));
    const paid = round2(rows.reduce((s, e) => s + (e.paidAmount || 0), 0));
    const byCat = [...groupBy(rows, (e) => e.category, (e) => ({ label: ENTRY_CATEGORY_LABELS[e.category], value: 0 }), (a, e) => (a.value += e.amount)).values()]
      .map((x) => ({ ...x, value: round2(x.value) }))
      .sort((a, b) => b.value - a.value);
    return {
      rows,
      rowKey: (r) => r.id,
      initialSort: { key: 'due', dir: 'asc' },
      orientation: 'landscape',
      stats: [
        { label: 'Em aberto', value: money(openSum), short: brlShort(openSum), hint: `${integer(open.length)} parcelas` },
        { label: 'Vencido', value: money(overdue), short: brlShort(overdue), tone: overdue ? 'danger' : undefined },
        { label: 'Já pago', value: money(paid), short: brlShort(paid) },
        { label: 'Maior categoria', value: byCat[0]?.label || '—', hint: byCat[0] ? money(byCat[0].value) : undefined },
      ],
      chart: byCat.length > 1 ? { kind: 'rank', title: 'Por categoria', data: byCat.slice(0, 8), series: [{ key: 'value', name: 'Valor' }], format: 'money' } : null,
      columns: [
        { key: 'due', header: 'Vencimento', kind: 'date', value: (r) => r.dueDate },
        { key: 'party', header: 'Fornecedor', value: (r) => r.partyName, mobile: 'title', total: (rs) => `${rs.length} parcelas` },
        { key: 'desc', header: 'Descrição', value: (r) => r.description, mobile: 'subtitle', hideBelow: 'md' },
        { key: 'cat', header: 'Categoria', value: (r) => ENTRY_CATEGORY_LABELS[r.category], hideBelow: 'lg' },
        { key: 'inst', header: 'Parcela', value: (r) => installment(r), hideBelow: 'xl' },
        { key: 'amount', header: 'Valor', kind: 'money', value: (r) => r.amount, total: 'sum' },
        { key: 'paid', header: 'Pago', kind: 'money', value: (r) => r.paidAmount || 0, total: 'sum', hideBelow: 'md' },
        { key: 'balance', header: 'Saldo', kind: 'money', value: (r) => balanceOf(r), total: 'sum', hideBelow: 'md' },
        { key: 'state', header: 'Situação', value: (r) => ENTRY_STATE[entryState(r, ctx.today)].label, display: (r) => <StatusBadge info={ENTRY_STATE[entryState(r, ctx.today)]} />, mobile: 'badge' },
      ],
    };
  },
});

// ---------------------------------------------------------------------------
// Fluxo de caixa realizado
// ---------------------------------------------------------------------------

interface CashRow {
  key: string;
  label: string;
  in: number;
  out: number;
  balance: number;
}

export const cashFlowRealized = defineReport<CashRow>({
  id: 'fluxo-caixa',
  title: 'Fluxo de caixa realizado',
  description: 'Recebimentos e pagamentos efetivos (baixas) por dia, mês ou categoria, com saldo acumulado.',
  category: 'Financeiro',
  icon: ArrowDownUp,
  permission: 'finance.view',
  tables: ['financial_entries'],
  filters: ['period'],
  period: { default: '3m', field: 'Data do pagamento' },
  options: [{ ...GROUP_DAY_MONTH, choices: [...GROUP_DAY_MONTH.choices, { value: 'category', label: 'Categoria' }] }],
  keywords: 'caixa entradas saídas recebimentos pagamentos baixas',
  build(d, f) {
    const group = f.opts.group || 'month';
    const pays = d.financial_entries.flatMap((e) =>
      activePayments(e)
        .filter((p) => inPeriod(p.date, f))
        .map((p) => ({ e, p })),
    );
    const keyOf = ({ e, p }: (typeof pays)[number]) => (group === 'category' ? e.category : group === 'day' ? p.date : p.date.slice(0, 7));
    const map = groupBy(
      pays,
      keyOf,
      (x, key): CashRow => ({ key, label: group === 'category' ? ENTRY_CATEGORY_LABELS[x.e.category] : periodLabel(key), in: 0, out: 0, balance: 0 }),
      (a, { e, p }) => {
        if (e.direction === 'IN') a.in += p.amount;
        else a.out += p.amount;
      },
    );
    const keys = group === 'category' ? [...map.keys()] : periodKeys([...map.keys()], f, group as 'day' | 'month');
    let acc = 0;
    const rows = keys.map((k) => {
      const r = map.get(k) || { key: k, label: periodLabel(k), in: 0, out: 0, balance: 0 };
      acc += r.in - r.out;
      return { ...r, in: round2(r.in), out: round2(r.out), balance: round2(acc) };
    });
    const tin = round2(rows.reduce((s, r) => s + r.in, 0));
    const tout = round2(rows.reduce((s, r) => s + r.out, 0));
    return {
      rows,
      rowKey: (r) => r.key,
      initialSort: group === 'category' ? { key: 'in', dir: 'desc' } : { key: 'key', dir: 'asc' },
      stats: [
        { label: 'Entradas', value: money(tin), short: brlShort(tin), tone: 'success' },
        { label: 'Saídas', value: money(tout), short: brlShort(tout), tone: 'danger' },
        { label: 'Saldo do período', value: money(tin - tout), short: brlShort(tin - tout), tone: tin - tout >= 0 ? 'success' : 'danger' },
        { label: 'Baixas', value: integer(pays.length), hint: 'pagamentos registrados' },
      ],
      chart:
        rows.length > 1
          ? {
              kind: 'bars',
              title: 'Entradas × saídas',
              data: rows.map((r) => ({ label: group === 'month' ? shortMonth(r.key) : group === 'day' ? r.key.slice(5).split('-').reverse().join('/') : r.label, in: r.in, out: r.out })),
              series: [
                { key: 'in', name: 'Entradas' },
                { key: 'out', name: 'Saídas' },
              ],
              format: 'money',
            }
          : null,
      columns: [
        { key: 'key', header: group === 'category' ? 'Categoria' : group === 'day' ? 'Dia' : 'Mês', value: (r) => r.label, sortValue: (r) => r.key, mobile: 'title', total: () => 'Total' },
        { key: 'in', header: 'Entradas', kind: 'money', value: (r) => r.in, display: (r) => <span className="text-success">{money(r.in)}</span>, total: 'sum' },
        { key: 'out', header: 'Saídas', kind: 'money', value: (r) => r.out, display: (r) => <span className="text-danger">{money(r.out)}</span>, total: 'sum' },
        { key: 'net', header: 'Saldo', kind: 'money', value: (r) => round2(r.in - r.out), total: 'sum', mobile: 'badge' },
        ...(group === 'category' ? [] : [{ key: 'balance', header: 'Acumulado', kind: 'money' as const, value: (r: CashRow) => r.balance, hideBelow: 'md' as const }]),
      ],
      note: 'Considera só pagamentos efetivamente baixados (estornos excluídos), na data do pagamento.',
    };
  },
});

// ---------------------------------------------------------------------------
// Comissões
// ---------------------------------------------------------------------------

export const commissionsReport = defineReport<SellerCommission>({
  id: 'comissoes',
  title: 'Comissões',
  description: 'Comissão por vendedor no período, liberada conforme o cliente paga as parcelas.',
  category: 'Financeiro',
  icon: BadgePercent,
  permission: 'finance.view',
  tables: ['sales', 'financial_entries', 'profiles'],
  filters: ['period', 'seller'],
  period: { default: 'lastMonth', field: 'Data do pedido' },
  keywords: 'vendedor representante liberada pendente',
  build(d, f) {
    const rows = sellerCommissions(d.sales, d.financial_entries, d.profiles, f.from || '0000-01-01', f.to || '9999-12-31').filter(
      (r) => r.count > 0 && (!f.sellerId || r.id === f.sellerId),
    );
    const sum = (fn: (r: SellerCommission) => number) => round2(rows.reduce((s, r) => s + fn(r), 0));
    const revenue = sum((r) => r.revenue);
    const commission = sum((r) => r.commission);
    const released = sum((r) => r.released);
    const pending = sum((r) => r.pending);
    return {
      rows,
      rowKey: (r) => r.id,
      initialSort: { key: 'commission', dir: 'desc' },
      orientation: 'landscape',
      stats: [
        { label: 'Faturamento', value: money(revenue), short: brlShort(revenue), hint: `${integer(sum((r) => r.count))} vendas` },
        { label: 'Comissão total', value: money(commission), short: brlShort(commission) },
        { label: 'Liberada', value: money(released), short: brlShort(released), tone: 'success', hint: 'parcelas já pagas' },
        { label: 'Pendente', value: money(pending), short: brlShort(pending), tone: 'warning', hint: 'a receber do cliente' },
      ],
      columns: [
        { key: 'name', header: 'Vendedor', value: (r) => r.name, mobile: 'title', total: () => 'Total' },
        { key: 'role', header: 'Perfil', value: (r) => `${r.role}${r.rate != null ? ` · ${percent(r.rate, 2)}` : ''}`, mobile: 'subtitle', hideBelow: 'md' },
        { key: 'count', header: 'Vendas', kind: 'int', value: (r) => r.count, total: 'sum' },
        { key: 'revenue', header: 'Faturamento', kind: 'money', value: (r) => r.revenue, total: 'sum', hideBelow: 'md' },
        { key: 'base', header: 'Base', kind: 'money', value: (r) => r.base, total: 'sum', hideBelow: 'xl' },
        { key: 'commission', header: 'Comissão', kind: 'money', value: (r) => r.commission, total: 'sum', mobile: 'badge' },
        {
          key: 'received',
          header: 'Recebido',
          kind: 'percent',
          value: (r) => round2(r.receivedRatio * 100),
          display: (r) => (
            <div className="min-w-20">
              <div className="text-[11px] num text-muted">{percent(r.receivedRatio * 100, 0)}</div>
              <Progress value={r.receivedRatio * 100} tone="success" />
            </div>
          ),
          hideBelow: 'lg',
        },
        { key: 'released', header: 'Liberada', kind: 'money', value: (r) => r.released, total: 'sum' },
        { key: 'pending', header: 'Pendente', kind: 'money', value: (r) => r.pending, total: 'sum' },
      ],
      note: 'Base = subtotal dos itens. A comissão é liberada na proporção do que o cliente já pagou de cada venda. Detalhe por pedido em Financeiro → Comissões.',
    };
  },
});
