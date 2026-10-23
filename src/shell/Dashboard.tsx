/**
 * Opção B — painel operacional: atalhos, "hoje na operação", indicadores,
 * vendas por mês, cortes mais vendidos, alertas e tarefas.
 */
import { useDashboardData } from '@shared/app/dashboard';
import { greeting } from '@shared/app/shell';
import { useSession } from '@shared/app/session';
import { kg, money, moneyCompact } from '@shared/domain/format';
import { TasksWidget } from '@shared/modules/system';
import { BarsChart, Card, CardHeader, cn, EmptyState, RankBars, Stat } from '@shared/ui';
import {
  AlertTriangle,
  Beef,
  CheckCircle2,
  ClipboardList,
  Info,
  Package,
  PackageCheck,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Link } from 'react-router-dom';

export function Dashboard() {
  const { profile, can } = useSession();
  const d = useDashboardData();
  const fin = can('finance.view');

  const shortcuts = [
    { label: 'Nova venda', icon: ShoppingCart, path: '/vendas/nova', show: can('sales.create') },
    { label: 'Separar pedidos', icon: PackageCheck, path: '/estoque/separacao', show: can('picking.perform') },
    { label: 'Lotes de gado', icon: ClipboardList, path: '/gado/lotes', show: can('view.cattle') },
    { label: 'Registrar abate', icon: Beef, path: '/producao/abate', show: can('view.production') },
    { label: 'Baixar parcelas', icon: Receipt, path: '/financeiro', show: can('finance.pay') },
  ].filter((s) => s.show);

  const today = [
    { label: 'A aprovar', value: d.queue.pendingApproval, path: '/vendas', tone: 'warning' as const, show: can('view.commercial') },
    { label: 'A separar', value: d.queue.toPick, path: '/estoque/separacao', tone: 'info' as const, show: can('picking.perform') },
    { label: 'Em separação', value: d.queue.picking, path: '/estoque/separacao', tone: 'primary' as const, show: can('picking.perform') },
    { label: 'Aguardando cliente', value: d.queue.awaitingCustomer, path: '/comercial/portal', tone: 'warning' as const, show: can('portal.manage') },
    { label: 'Prontos', value: d.queue.ready, path: '/estoque/separacao', tone: 'success' as const, show: can('picking.perform') },
    { label: 'Em rota', value: d.queue.dispatched, path: '/estoque/separacao', tone: 'primary' as const, show: can('picking.perform') },
    { label: 'Comprovantes Pix', value: d.queue.receipts, path: '/comercial/portal', tone: 'info' as const, show: can('portal.manage') },
  ].filter((q) => q.show);

  const toneBox = {
    warning: 'bg-warning-soft text-warning',
    info: 'bg-info-soft text-info',
    primary: 'bg-primary-soft text-primary',
    success: 'bg-success-soft text-success',
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-muted">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</p>
          <h1 className="font-display text-[26px] sm:text-[32px] font-extrabold leading-tight mt-0.5">{greeting(profile?.name)}</h1>
        </div>
        {shortcuts.length > 0 && (
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
            {shortcuts.map((s) => (
              <Link
                key={s.label}
                to={s.path}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-pill bg-surface border border-border text-sm font-medium hover:border-primary hover:text-primary transition-colors"
              >
                <s.icon className="size-4" />
                {s.label}
              </Link>
            ))}
          </div>
        )}
      </header>

      {today.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted mb-2.5">Hoje na operação</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
            {today.map((q) => (
              <Link key={q.label} to={q.path} className="rounded-card bg-surface border border-border p-3.5 hover:border-primary/50 hover:shadow-card transition-all">
                <div className={cn('inline-flex min-w-9 h-9 px-2 items-center justify-center rounded-control text-lg font-bold num', q.value ? toneBox[q.tone] : 'bg-surface-2 text-subtle')}>
                  {q.value}
                </div>
                <div className="text-[13px] font-medium mt-2 leading-tight">{q.label}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Stat
          label="Vendas · 30 dias"
          value={moneyCompact(d.revenue30)}
          icon={<TrendingUp className="size-4" />}
          delta={d.revenueDelta}
          deltaLabel="vs. 30 dias antes"
        />
        {fin ? (
          <Stat
            label="A receber"
            value={moneyCompact(d.receivableOpen)}
            icon={<Wallet className="size-4" />}
            tone={d.overdueCount ? 'danger' : 'success'}
            hint={d.overdueCount ? `${moneyCompact(d.receivableOverdue)} vencido` : 'nada vencido'}
          />
        ) : (
          <Stat label="Pedidos · 30 dias" value={String(d.orders30)} icon={<ShoppingCart className="size-4" />} hint={`ticket ${moneyCompact(d.avgTicket30)}`} />
        )}
        <Stat label="Estoque de venda" value={kg(d.stockKg)} icon={<Package className="size-4" />} tone="info" hint={`${moneyCompact(d.stockValue)} a custo`} />
        <Stat label="Rebanho" value={`${d.headsAlive} cab.`} icon={<ClipboardList className="size-4" />} tone="accent" hint={`${d.batchesFattening} lotes em engorda`} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader title="Vendas por mês" subtitle={`${d.orders30} pedidos nos últimos 30 dias · ${kg(d.kg30)}`} />
          <BarsChart data={d.monthly} xKey="label" series={[{ key: 'revenue', name: 'Vendas' }]} format={money} axisFormat={moneyCompact} height={280} />
        </Card>
        <Card>
          <CardHeader title="Cortes mais vendidos" subtitle="Últimos 30 dias" />
          {d.topProducts.length ? (
            <RankBars items={d.topProducts.map((p) => ({ label: p.name, value: p.value, hint: p.kg ? kg(p.kg) : undefined }))} format={moneyCompact} />
          ) : (
            <EmptyState title="Sem vendas no período" />
          )}
        </Card>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Precisa de atenção" subtitle={d.alerts.length ? `${d.alerts.length} ${d.alerts.length === 1 ? 'alerta' : 'alertas'}` : 'Nada pendente'} />
          {d.alerts.length ? (
            <ul className="divide-y divide-border -my-1">
              {d.alerts.map((a) => {
                const Icon = a.tone === 'info' ? Info : AlertTriangle;
                return (
                  <li key={a.id}>
                    <Link to={a.path} className="flex items-start gap-3 py-3 group">
                      <span
                        className={cn(
                          'size-8 rounded-control flex items-center justify-center shrink-0',
                          a.tone === 'danger' ? 'bg-danger-soft text-danger' : a.tone === 'warning' ? 'bg-warning-soft text-warning' : 'bg-info-soft text-info',
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium group-hover:text-primary">{a.title}</span>
                        <span className="block text-xs text-muted truncate">{a.detail}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="size-4" /> Tudo em dia.
            </div>
          )}
        </Card>
        <TasksWidget />
      </section>
    </div>
  );
}
