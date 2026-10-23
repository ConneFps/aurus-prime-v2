/**
 * Início do vendedor externo: números do mês, atalhos e últimos pedidos.
 */
import { ArrowRight, ListOrdered, Plus, Tag, UserPlus, Users } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../../app/session';
import { addDays, money, percent, startOfMonth, today } from '../../../domain/format';
import { Badge, Callout, EmptyState, Stat, StatGrid } from '../../../ui';
import { REQUEST_STATUS } from '../CustomerRequests';
import { isCommissionable, longMonth } from '../helpers';
import { ListCard, OrderRow, SectionTitle, useMyCustomers, useMyRequests, useMySales } from './shared';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

export function HomeView() {
  const { profile } = useSession();
  const { rows: sales, loading } = useMySales();
  const { rows: customers } = useMyCustomers();
  const { rows: requests } = useMyRequests();

  const m = useMemo(() => {
    const t = today();
    const from = startOfMonth(t);
    // Comparação justa: mesmo intervalo de dias do mês anterior (1º até o mesmo dia).
    const prevEnd = addDays(from, -1);
    const prevFrom = startOfMonth(prevEnd);
    const prevTo = `${prevEnd.slice(0, 8)}${String(Math.min(Number(t.slice(8, 10)), Number(prevEnd.slice(8, 10)))).padStart(2, '0')}`;
    let orders = 0;
    let sold = 0;
    let commission = 0;
    let prevSold = 0;
    let pending = 0;
    let pendingValue = 0;
    for (const s of sales) {
      if (s.status === 'PENDING_APPROVAL') {
        pending++;
        pendingValue += s.totalValue;
      }
      if (!isCommissionable(s)) continue;
      if (s.date >= from) {
        orders++;
        sold += s.totalValue;
        commission += s.commissionValue || 0;
      } else if (s.date >= prevFrom && s.date <= prevTo) prevSold += s.totalValue;
    }
    const recent = [...sales].sort((a, b) => (b.date + b.number).localeCompare(a.date + a.number)).slice(0, 5);
    const drafts = sales.filter((s) => s.status === 'DRAFT').length;
    return { orders, sold, commission, prevSold, pending, pendingValue, recent, drafts };
  }, [sales]);

  const openRequests = requests.filter((r) => r.status === 'PENDING');
  const recentRejected = requests.filter((r) => (r.status === 'REJECTED' || r.status === 'BLOCKED') && (r.reviewedAt || '') >= `${startOfMonth()}`);
  const firstName = (profile?.name || '').split(' ')[0];
  const delta = m.prevSold > 0 ? ((m.sold - m.prevSold) / m.prevSold) * 100 : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-[28px] font-semibold text-fg leading-tight">
          {greeting()}, {firstName}
        </h1>
        <p className="text-sm text-muted mt-1">
          Resumo de {longMonth(today().slice(0, 7))} · sua comissão é de {percent(profile?.commissionRate ?? 0, 2)}
        </p>
      </div>

      <StatGrid cols={4}>
        <Stat label="Pedidos no mês" value={m.orders} hint={`${customers.length} clientes na carteira`} />
        <Stat
          label="Vendido no mês"
          value={<span className="max-sm:text-lg">{money(m.sold)}</span>}
          delta={delta}
          deltaLabel={delta !== null ? 'vs. mesmo período' : undefined}
          hint={delta === null ? 'mês passado: R$ 0,00' : undefined}
          tone="info"
        />
        <Stat label="Comissão do mês" value={<span className="max-sm:text-lg">{money(m.commission)}</span>} hint="estimada" tone="success" />
        <Stat label="A aprovar" value={m.pending} hint={m.pending ? money(m.pendingValue) : 'nenhum pedido parado'} tone="warning" />
      </StatGrid>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Shortcut to="/pedidos/novo" icon={<Plus className="size-5" />} label="Novo pedido" hint="da sua carteira" primary />
        <Shortcut to="/clientes/solicitar" icon={<UserPlus className="size-5" />} label="Solicitar cliente" hint="cadastro novo" />
        <Shortcut to="/clientes" icon={<Users className="size-5" />} label="Meus clientes" hint={`${customers.length} na carteira`} />
        <Shortcut to="/precos" icon={<Tag className="size-5" />} label="Tabela de preços" hint="cortes e valores" />
      </div>

      {m.drafts > 0 && (
        <Callout tone="info" title={`${m.drafts} rascunho(s) não enviados`} action={<Link to="/pedidos" className="text-sm text-primary hover:underline">Ver</Link>}>
          Rascunhos não chegam à equipe interna — abra e envie para aprovação.
        </Callout>
      )}
      {recentRejected.map((r) => (
        <Callout key={r.id} tone="danger" title={`Cadastro recusado: ${r.tradeName || r.name}`}>
          {r.rejectionReason}
        </Callout>
      ))}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="min-w-0">
          <SectionTitle
            title="Últimos pedidos"
            action={
              <Link to="/pedidos" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                Ver todos <ArrowRight className="size-3" />
              </Link>
            }
          />
          {m.recent.length ? (
            <ListCard>
              {m.recent.map((s) => (
                <OrderRow key={s.id} sale={s} />
              ))}
            </ListCard>
          ) : (
            <ListCard>
              <EmptyState
                icon={<ListOrdered className="size-5" />}
                title={loading ? 'Carregando…' : 'Nenhum pedido ainda'}
                description="Faça o primeiro pedido para um cliente da sua carteira."
              />
            </ListCard>
          )}
        </section>
        <section className="min-w-0">
          <SectionTitle
            title="Minhas solicitações"
            action={
              <Link to="/clientes?aba=solicitacoes" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                Ver todas <ArrowRight className="size-3" />
              </Link>
            }
          />
          <ListCard>
            {requests.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted text-center">Nenhuma solicitação de cadastro enviada.</div>
            ) : (
              [...requests]
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .slice(0, 4)
                .map((r) => (
                  <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm text-fg truncate">{r.tradeName || r.name}</div>
                      <div className="text-xs text-muted truncate">{r.city || '—'}</div>
                    </div>
                    <Badge tone={REQUEST_STATUS[r.status].tone} dot>
                      {REQUEST_STATUS[r.status].label}
                    </Badge>
                  </div>
                ))
            )}
          </ListCard>
          {openRequests.length > 0 && <p className="text-xs text-muted mt-2">{openRequests.length} aguardando análise da equipe interna.</p>}
        </section>
      </div>
    </div>
  );
}

function Shortcut({ to, icon, label, hint, primary }: { to: string; icon: ReactNode; label: string; hint: string; primary?: boolean }) {
  return (
    <Link
      to={to}
      className={
        primary
          ? 'rounded-card p-4 bg-primary text-primary-fg shadow-card hover:bg-primary-hover transition-colors flex flex-col gap-3'
          : 'rounded-card p-4 bg-surface border border-border shadow-card hover:border-border-strong transition-colors flex flex-col gap-3'
      }
    >
      <span className={primary ? 'size-9 rounded-control bg-primary-fg/10 flex items-center justify-center' : 'size-9 rounded-control bg-primary-soft text-primary flex items-center justify-center'}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-tight">{label}</span>
        <span className={primary ? 'block text-xs opacity-75 mt-0.5 truncate' : 'block text-xs text-muted mt-0.5 truncate'}>{hint}</span>
      </span>
    </Link>
  );
}
