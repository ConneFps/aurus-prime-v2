/**
 * Fluxo de caixa: mensal (realizado × previsto) e projeção das próximas 8 semanas.
 */
import { Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { addDays, date, money, today } from '../../domain/format';
import type { FinancialEntry } from '../../domain/types';
import {
  BarsChart,
  Button,
  Card,
  CardHeader,
  cn,
  DataTable,
  exportCsv,
  FooterCell,
  MoneyInput,
  Segmented,
  Select,
  Switch,
  TrendChart,
  type Column,
} from '../../ui';
import { activePayments, addMonths, axisMoney, balanceOf, monthRange, shortMonth, sum } from './helpers';

type Window = 'AROUND' | 'YEAR' | 'PAST12';

interface MonthRow {
  ym: string;
  label: string;
  inPlanned: number;
  inDone: number;
  outPlanned: number;
  outDone: number;
  netPlanned: number;
  netDone: number;
}

interface WeekRow {
  key: string;
  label: string;
  from: string;
  to: string;
  inflow: number;
  outflow: number;
  net: number;
  cumulative: number;
}

const plain = (v: number, cls?: string) => (Math.abs(v) < 0.005 ? <span className="text-subtle">—</span> : <span className={cls}>{money(v)}</span>);
const signed = (v: number) => <span className={cn('num', v < -0.005 ? 'text-danger' : v > 0.005 ? 'text-success' : 'text-muted')}>{money(v)}</span>;

export function CashFlowView({ entries }: { entries: FinancialEntry[] }) {
  const [win, setWin] = useState<Window>('AROUND');
  const [view, setView] = useState<'DONE' | 'PLANNED'>('DONE');
  const [opening, setOpening] = useState<number | null>(null);
  const [withOverdue, setWithOverdue] = useState(true);
  const t = today();
  const curYm = t.slice(0, 7);

  const months = useMemo<MonthRow[]>(() => {
    const [from, to] =
      win === 'YEAR'
        ? [`${t.slice(0, 4)}-01`, `${t.slice(0, 4)}-12`]
        : win === 'PAST12'
          ? [addMonths(curYm, -11), curYm]
          : [addMonths(curYm, -5), addMonths(curYm, 6)];
    const map = new Map<string, MonthRow>(
      monthRange(from, to).map((ym) => [ym, { ym, label: shortMonth(ym), inPlanned: 0, inDone: 0, outPlanned: 0, outDone: 0, netPlanned: 0, netDone: 0 }]),
    );
    for (const e of entries) {
      if (e.status === 'CANCELLED') continue;
      const isIn = e.direction === 'IN';
      const due = map.get(e.dueDate.slice(0, 7));
      if (due) {
        if (isIn) due.inPlanned += e.amount;
        else due.outPlanned += e.amount;
      }
      for (const p of activePayments(e)) {
        const m = map.get(p.date.slice(0, 7));
        if (!m) continue;
        if (isIn) m.inDone += p.amount;
        else m.outDone += p.amount;
      }
    }
    return [...map.values()].map((m) => ({ ...m, netPlanned: m.inPlanned - m.outPlanned, netDone: m.inDone - m.outDone }));
  }, [entries, win, t, curYm]);

  const weeks = useMemo<{ rows: WeekRow[]; overdueIn: number; overdueOut: number }>(() => {
    const open = entries.filter((e) => e.status === 'OPEN');
    const overdue = open.filter((e) => e.dueDate < t);
    const overdueIn = sum(
      overdue.filter((e) => e.direction === 'IN'),
      balanceOf,
    );
    const overdueOut = sum(
      overdue.filter((e) => e.direction === 'OUT'),
      balanceOf,
    );
    let acc = (opening || 0) + (withOverdue ? overdueIn - overdueOut : 0);
    const rows: WeekRow[] = [];
    for (let i = 0; i < 8; i++) {
      const from = addDays(t, i * 7);
      const to = addDays(from, 6);
      const inWeek = open.filter((e) => e.dueDate >= from && e.dueDate <= to);
      const inflow = sum(
        inWeek.filter((e) => e.direction === 'IN'),
        balanceOf,
      );
      const outflow = sum(
        inWeek.filter((e) => e.direction === 'OUT'),
        balanceOf,
      );
      acc += inflow - outflow;
      rows.push({
        key: from,
        label: `${date(from).slice(0, 5)} – ${date(to).slice(0, 5)}`,
        from,
        to,
        inflow,
        outflow,
        net: inflow - outflow,
        cumulative: acc,
      });
    }
    return { rows, overdueIn, overdueOut };
  }, [entries, t, opening, withOverdue]);

  const monthCols: Column<MonthRow>[] = [
    {
      key: 'm',
      header: 'Mês',
      mobile: 'title',
      cell: (m) => (
        <span className={cn('font-medium', m.ym === curYm ? 'text-primary' : 'text-fg')}>
          {m.label}
          {m.ym === curYm ? ' · atual' : ''}
        </span>
      ),
    },
    { key: 'ip', header: 'Entradas prev.', align: 'right', cell: (m) => plain(m.inPlanned) },
    {
      key: 'id',
      header: 'Entradas real.',
      align: 'right',
      cell: (m) => (m.ym > curYm ? <span className="text-subtle">—</span> : plain(m.inDone, 'text-success')),
    },
    { key: 'op', header: 'Saídas prev.', align: 'right', cell: (m) => plain(m.outPlanned) },
    {
      key: 'od',
      header: 'Saídas real.',
      align: 'right',
      cell: (m) => (m.ym > curYm ? <span className="text-subtle">—</span> : plain(m.outDone, 'text-danger')),
    },
    { key: 'np', header: 'Saldo previsto', align: 'right', hideBelow: 'lg', cell: (m) => signed(m.netPlanned) },
    {
      key: 'nd',
      header: 'Saldo realizado',
      align: 'right',
      mobile: 'badge',
      cell: (m) => (m.ym > curYm ? <span className="text-subtle">—</span> : signed(m.netDone)),
    },
  ];

  const weekCols: Column<WeekRow>[] = [
    { key: 'w', header: 'Semana', mobile: 'title', cell: (w) => <span className="num font-medium text-fg">{w.label}</span> },
    { key: 'in', header: 'A receber', align: 'right', cell: (w) => <span className="text-success">{money(w.inflow)}</span> },
    { key: 'out', header: 'A pagar', align: 'right', cell: (w) => <span className="text-danger">{money(w.outflow)}</span> },
    { key: 'net', header: 'Saldo da semana', align: 'right', cell: (w) => signed(w.net) },
    { key: 'acc', header: 'Saldo acumulado', align: 'right', mobile: 'badge', cell: (w) => <strong>{signed(w.cumulative)}</strong> },
  ];

  const tot = (k: keyof MonthRow) => sum(months, (m) => m[k] as number);
  const monthFooter = (
    <tr>
      <FooterCell>Total</FooterCell>
      <FooterCell align="right">{money(tot('inPlanned'))}</FooterCell>
      <FooterCell align="right">{money(tot('inDone'))}</FooterCell>
      <FooterCell align="right">{money(tot('outPlanned'))}</FooterCell>
      <FooterCell align="right">{money(tot('outDone'))}</FooterCell>
      <FooterCell align="right" className="hidden lg:table-cell">
        {signed(tot('netPlanned'))}
      </FooterCell>
      <FooterCell align="right">{signed(tot('netDone'))}</FooterCell>
    </tr>
  );

  const chartData = months.map((m) => ({
    label: m.label,
    entradas: view === 'DONE' ? m.inDone : m.inPlanned,
    saidas: view === 'DONE' ? m.outDone : m.outPlanned,
    previsto: m.netPlanned,
    realizado: m.ym <= curYm ? m.netDone : null,
  }));

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <h2 className="text-[15px] font-semibold text-fg mr-auto">Fluxo mensal — previsto × realizado</h2>
          <div className="flex items-center gap-2">
            <Select
              value={win}
              onChange={setWin}
              options={[
                { value: 'AROUND', label: 'Últimos 6 e próximos 6 meses' },
                { value: 'PAST12', label: 'Últimos 12 meses' },
                { value: 'YEAR', label: `Ano de ${t.slice(0, 4)}` },
              ]}
              className="flex-1 sm:w-64"
            />
            <Button
              size="sm"
              variant="ghost"
              icon={<Download className="size-4" />}
              onClick={() =>
                exportCsv('fluxo-de-caixa-mensal', months, [
                  { header: 'Mês', value: (m) => m.label },
                  { header: 'Entradas previstas', value: (m) => m.inPlanned },
                  { header: 'Entradas realizadas', value: (m) => m.inDone },
                  { header: 'Saídas previstas', value: (m) => m.outPlanned },
                  { header: 'Saídas realizadas', value: (m) => m.outDone },
                  { header: 'Saldo previsto', value: (m) => m.netPlanned },
                  { header: 'Saldo realizado', value: (m) => m.netDone },
                ])
              }
            >
              CSV
            </Button>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Entradas × saídas"
              subtitle={view === 'DONE' ? 'Pelo dia do pagamento' : 'Pelo vencimento das parcelas'}
              actions={
                <Segmented
                  size="sm"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: 'DONE', label: 'Realizado' },
                    { value: 'PLANNED', label: 'Previsto' },
                  ]}
                />
              }
            />
            <BarsChart
              data={chartData}
              xKey="label"
              series={[
                { key: 'entradas', name: 'Entradas', slot: 1 },
                { key: 'saidas', name: 'Saídas', slot: 2 },
              ]}
              format={money}
              axisFormat={axisMoney}
              height={240}
            />
          </Card>
          <Card>
            <CardHeader title="Saldo do mês" subtitle="Entradas menos saídas" />
            <TrendChart
              kind="line"
              data={chartData}
              xKey="label"
              series={[
                { key: 'previsto', name: 'Previsto', slot: 3 },
                { key: 'realizado', name: 'Realizado', slot: 1 },
              ]}
              format={money}
              axisFormat={axisMoney}
              height={240}
            />
          </Card>
        </div>
        <DataTable
          columns={monthCols}
          rows={months}
          rowKey={(m) => m.ym}
          footer={monthFooter}
          pageSize={24}
          dense
          rowClassName={(m) => (m.ym === curYm ? 'bg-primary-soft/30' : undefined)}
        />
      </section>

      <section className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <div className="mr-auto">
            <h2 className="text-[15px] font-semibold text-fg">Projeção das próximas 8 semanas</h2>
            <p className="text-xs text-muted mt-0.5">Saldos em aberto pelo vencimento. Informe o saldo atual em caixa para projetar o acumulado.</p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="sm:w-48">
              <MoneyInput value={opening} onChange={setOpening} placeholder="Saldo em caixa" aria-label="Saldo atual em caixa" />
            </div>
            <Switch checked={withOverdue} onChange={setWithOverdue} label="Somar vencidos agora" />
          </div>
        </div>
        {(weeks.overdueIn > 0 || weeks.overdueOut > 0) && (
          <p className="text-xs text-muted">
            Em atraso: <span className="text-success num">{money(weeks.overdueIn)}</span> a receber e{' '}
            <span className="text-danger num">{money(weeks.overdueOut)}</span> a pagar {withOverdue ? '— já somados ao saldo inicial.' : '— fora da projeção.'}
          </p>
        )}
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-2">
            <CardHeader title="Saldo acumulado" subtitle="Semana a semana" />
            <TrendChart
              data={weeks.rows}
              xKey="label"
              series={[{ key: 'cumulative', name: 'Saldo acumulado' }]}
              format={money}
              axisFormat={axisMoney}
              height={220}
            />
          </Card>
          <div className="lg:col-span-3">
            <DataTable columns={weekCols} rows={weeks.rows} rowKey={(w) => w.key} dense pageSize={8} />
          </div>
        </div>
      </section>
    </div>
  );
}
