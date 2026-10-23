/**
 * Comissões do vendedor externo, mês a mês.
 *  Confirmada = pedido entregue ou pago. Prevista = pedido em andamento (aprovação → expedição).
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../../app/session';
import { date, money, percent, today } from '../../../domain/format';
import { SALE_STATUS } from '../../../domain/labels';
import { BarsChart, Card, CardHeader, cn, EmptyState, PageHeader, Stat, StatGrid, StatusBadge } from '../../../ui';
import { isCommissionable, isCommissionConfirmed, lastMonths, longMonth, shortMonth } from '../helpers';
import { ListCard, useMySales } from './shared';

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export function CommissionsView() {
  const { profile } = useSession();
  const { rows: sales } = useMySales();
  const months = useMemo(() => lastMonths(12), []);
  const [picked, setPicked] = useState<string | null>(null);

  const data = useMemo(() => {
    const by = new Map(months.map((k) => [k, { orders: 0, sold: 0, confirmed: 0, forecast: 0 }]));
    for (const s of sales) {
      if (!isCommissionable(s)) continue;
      const x = by.get(s.date.slice(0, 7));
      if (!x) continue;
      x.orders++;
      x.sold += s.totalValue;
      if (isCommissionConfirmed(s)) x.confirmed += s.commissionValue || 0;
      else x.forecast += s.commissionValue || 0;
    }
    return by;
  }, [sales, months]);

  const current = today().slice(0, 7);
  // Mês padrão: o atual, ou o último com pedidos (começo de mês costuma estar vazio).
  const month = picked ?? (data.get(current)!.orders ? current : [...months].reverse().find((k) => data.get(k)!.orders) ?? current);
  const setMonth = setPicked;
  const firstWithSales = months.find((k) => data.get(k)!.orders);
  const shownMonths = [...months].reverse().filter((k) => k === current || (firstWithSales && k >= firstWithSales));
  const cur = data.get(month) || { orders: 0, sold: 0, confirmed: 0, forecast: 0 };
  const yearConfirmed = [...data.entries()].filter(([k]) => k.startsWith(today().slice(0, 4))).reduce((s, [, v]) => s + v.confirmed, 0);
  const chart = months.slice(-6).map((k) => ({ month: shortMonth(k), confirmed: data.get(k)!.confirmed, forecast: data.get(k)!.forecast }));
  const monthSales = sales.filter((s) => s.date.startsWith(month)).sort((a, b) => (b.date + b.number).localeCompare(a.date + a.number));

  return (
    <>
      <PageHeader title="Minhas comissões" subtitle={`Taxa atual: ${percent(profile?.commissionRate ?? 0, 2)} sobre o valor dos pedidos. Confirmada quando o pedido é entregue ou pago.`} />

      <StatGrid cols={3} className="mb-5">
        <Stat label={`Confirmada · ${shortMonth(month)}`} value={money(cur.confirmed)} hint="pedidos entregues ou pagos" tone="success" />
        <Stat label={`Prevista · ${shortMonth(month)}`} value={money(cur.forecast)} hint="pedidos em andamento" tone="warning" />
        <Stat label={`Confirmada em ${today().slice(0, 4)}`} value={money(yearConfirmed)} hint="acumulado do ano" />
      </StatGrid>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] mb-6">
        <Card>
          <CardHeader title="Últimos 6 meses" subtitle="Comissão confirmada e prevista por mês do pedido" />
          <BarsChart
            data={chart}
            xKey="month"
            stacked
            height={220}
            series={[
              { key: 'confirmed', name: 'Confirmada' },
              { key: 'forecast', name: 'Prevista' },
            ]}
            format={money}
            axisFormat={(v) => (v >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : String(Math.round(v)))}
          />
        </Card>
        <ListCard>
          <div className="px-4 py-3 text-[11px] uppercase tracking-wider text-subtle font-medium grid grid-cols-[1fr_auto_auto] gap-3">
            <span>Mês</span>
            <span className="text-right">Vendido</span>
            <span className="text-right w-24">Comissão</span>
          </div>
          {shownMonths.map((k) => {
            const v = data.get(k)!;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setMonth(k)}
                className={cn(
                  'w-full px-4 py-2.5 grid grid-cols-[1fr_auto_auto] gap-3 items-center text-left text-sm cursor-pointer transition-colors',
                  k === month ? 'bg-primary-soft' : 'hover:bg-surface-2/60',
                )}
              >
                <span className="min-w-0">
                  <span className={cn('block truncate', k === month ? 'text-fg font-medium' : 'text-fg')}>
                    <span className="sm:hidden">{shortMonth(k)}</span>
                    <span className="max-sm:hidden">{cap(longMonth(k))}</span>
                  </span>
                  <span className="block text-xs text-subtle num">{v.orders} pedido(s)</span>
                </span>
                <span className="num text-muted text-right">{money(v.sold)}</span>
                <span className="num text-right w-24">
                  <span className="block font-semibold text-success">{money(v.confirmed)}</span>
                  {v.forecast > 0 && <span className="block text-[11px] text-warning">+ {money(v.forecast)}</span>}
                </span>
              </button>
            );
          })}
        </ListCard>
      </div>

      <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted mb-2.5">Pedidos de {longMonth(month)}</h2>
      {monthSales.length ? (
        <ListCard>
          {monthSales.map((s) => {
            const counts = isCommissionable(s);
            const ok = isCommissionConfirmed(s);
            return (
              <Link key={s.id} to={`/pedidos/${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/60">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-fg truncate">{s.customerName}</div>
                  <div className="text-xs text-muted num truncate">
                    Nº {s.number} · {date(s.date)} · {money(s.totalValue)}
                  </div>
                </div>
                <div className="text-right shrink-0 flex flex-col items-end gap-1">
                  <span className={cn('num text-sm font-semibold', !counts ? 'text-subtle line-through' : ok ? 'text-success' : 'text-warning')}>
                    {money(s.commissionValue)}
                  </span>
                  <StatusBadge info={SALE_STATUS[s.status]} />
                </div>
              </Link>
            );
          })}
        </ListCard>
      ) : (
        <ListCard>
          <EmptyState title="Nenhum pedido neste mês" className="py-8" />
        </ListCard>
      )}
    </>
  );
}
