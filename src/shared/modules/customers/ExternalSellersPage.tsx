/**
 * /comercial/vendedores — gestão interna dos vendedores externos:
 * convites, comissão, bloqueio, carteira, vendas e ranking.
 */
import { Copy, Eye, Lock, MailPlus, Percent, Trophy, Unlock, UserCheck, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOps, useSession } from '../../app/session';
import { useAction, useTable } from '../../data/react';
import { addDays, dateTime, endOfMonth, formatPhone, matchesSearch, money, percent, startOfMonth, today } from '../../domain/format';
import type { Invite, Profile } from '../../domain/types';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  Menu,
  PageHeader,
  RankBars,
  SearchInput,
  Segmented,
  Stat,
  StatGrid,
  toast,
  Toolbar,
  useConfirm,
  type Column,
} from '../../ui';
import { isCommissionable } from './helpers';
import { InviteSellerDrawer, SellerDrawer, type SellerMetrics } from './SellerDrawers';

type Period = 'month' | 'prev' | '90d' | 'year';

const PERIOD_LABEL: Record<Period, string> = { month: 'este mês', prev: 'mês passado', '90d': 'últimos 90 dias', year: 'no ano' };

function periodRange(p: Period): [string, string] {
  const t = today();
  if (p === 'month') return [startOfMonth(t), '9999-12-31'];
  if (p === 'prev') {
    const prev = addDays(startOfMonth(t), -1);
    return [startOfMonth(prev), endOfMonth(prev)];
  }
  if (p === '90d') return [addDays(t, -90), '9999-12-31'];
  return [`${t.slice(0, 4)}-01-01`, '9999-12-31'];
}

export function ExternalSellersPage() {
  const nav = useNavigate();
  const ops = useOps();
  const confirm = useConfirm();
  const { can } = useSession();
  const canManage = can('externalSellers.manage');

  const { rows: sellers, loading } = useTable('profiles', { where: [['role', '==', 'EXTERNAL_SELLER']] });
  const { rows: invitesAll } = useTable('invites', { where: [['role', '==', 'EXTERNAL_SELLER']] });
  const { rows: sales } = useTable('sales');
  const { rows: customers } = useTable('customers');
  const { rows: requests } = useTable('customer_requests');

  const [view, setView] = useState<'sellers' | 'invites'>('sellers');
  const [status, setStatus] = useState<'ALL' | 'ACTIVE' | 'BLOCKED'>('ALL');
  const [q, setQ] = useState('');
  const [period, setPeriod] = useState<Period>('90d');
  const [inviting, setInviting] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const invites = useMemo(() => invitesAll.filter((i) => i.status === 'PENDING'), [invitesAll]);

  const metrics = useMemo(() => {
    const [from, to] = periodRange(period);
    const m = new Map<string, SellerMetrics>();
    for (const s of sellers)
      m.set(s.id, { clients: 0, orders: 0, sold: 0, monthOrders: 0, monthSold: 0, monthCommission: 0, commission: 0, pendingRequests: 0, pendingApproval: 0, lastOrder: null });
    for (const c of customers) if (c.sellerId && m.has(c.sellerId)) m.get(c.sellerId)!.clients++;
    for (const r of requests) if (r.status === 'PENDING' && m.has(r.requestedById)) m.get(r.requestedById)!.pendingRequests++;
    for (const s of sales) {
      const x = s.sellerId ? m.get(s.sellerId) : undefined;
      if (!x) continue;
      if (s.status === 'PENDING_APPROVAL') x.pendingApproval++;
      if (!isCommissionable(s)) continue;
      x.orders++;
      x.sold += s.totalValue;
      x.commission += s.commissionValue || 0;
      if (!x.lastOrder || s.date > x.lastOrder) x.lastOrder = s.date;
      if (s.date >= from && s.date <= to) {
        x.monthOrders++;
        x.monthSold += s.totalValue;
        x.monthCommission += s.commissionValue || 0;
      }
    }
    return m;
  }, [sellers, customers, requests, sales, period]);

  const totals = useMemo(() => {
    let monthSold = 0;
    let monthCommission = 0;
    let pendingApproval = 0;
    metrics.forEach((x) => {
      monthSold += x.monthSold;
      monthCommission += x.monthCommission;
      pendingApproval += x.pendingApproval;
    });
    const pendingRequests = requests.filter((r) => r.status === 'PENDING').length;
    return { active: sellers.filter((s) => s.active).length, monthSold, monthCommission, pendingApproval, pendingRequests };
  }, [metrics, sellers, requests]);

  const ranking = useMemo(
    () => sellers.map((p) => ({ p, a: metrics.get(p.id)! })).sort((x, y) => y.a.monthSold - x.a.monthSold),
    [sellers, metrics],
  );

  const filtered = useMemo(
    () =>
      sellers
        .filter((s) => status === 'ALL' || (status === 'ACTIVE' ? s.active : !s.active))
        .filter((s) => matchesSearch([s.name, s.email, s.phone], q)),
    [sellers, status, q],
  );

  const setActive = useAction(
    async (p: Profile) => {
      if (p.active && !(await confirm({ title: `Bloquear ${p.name}?`, message: 'O vendedor perde o acesso ao aplicativo imediatamente. Pedidos e carteira são mantidos.', danger: true, confirmLabel: 'Bloquear' })))
        return;
      await ops.updateUser(p.id, { active: !p.active });
      toast.success(p.active ? 'Vendedor bloqueado' : 'Vendedor reativado');
    },
  );

  const revoke = useAction(async (i: Invite) => {
    if (!(await confirm({ title: `Revogar convite de ${i.name}?`, message: `${i.email} não conseguirá mais entrar com este convite.`, danger: true, confirmLabel: 'Revogar' }))) return;
    await ops.revokeInvite(i.id);
    toast.success('Convite revogado');
  });

  const copyInvite = (i: Invite) => {
    const url = `${window.location.origin}${window.location.pathname}`;
    const text = `Olá, ${i.name.split(' ')[0]}! Seu acesso de vendedor externo está liberado. Entre em ${url} com o e-mail ${i.email}.`;
    void navigator.clipboard?.writeText(text).then(
      () => toast.success('Mensagem de convite copiada'),
      () => toast.error('Não foi possível copiar.'),
    );
  };

  const columns: Column<Profile>[] = [
    {
      key: 'name',
      header: 'Vendedor',
      mobile: 'title',
      sortValue: (p) => p.name,
      cell: (p) => (
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={p.name} size={32} className="max-sm:hidden" />
          <div className="min-w-0">
            <div className="font-medium text-fg truncate flex items-center gap-2">
              <span className="truncate">{p.name}</span>
              {(metrics.get(p.id)?.pendingRequests ?? 0) > 0 && (
                <Badge tone="warning" size="xs" className="max-sm:hidden">
                  {metrics.get(p.id)?.pendingRequests} a revisar
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted truncate">{p.email}</div>
          </div>
        </div>
      ),
    },
    { key: 'rate', header: 'Comissão', align: 'right', mobile: 'subtitle', sortValue: (p) => p.commissionRate ?? 0, cell: (p) => (p.commissionRate != null ? <span className="whitespace-nowrap">{percent(p.commissionRate, 2)}<span className="sm:hidden"> de comissão</span></span> : '—') },
    { key: 'clients', header: 'Carteira', align: 'right', sortValue: (p) => metrics.get(p.id)?.clients ?? 0, cell: (p) => <span className="whitespace-nowrap">{metrics.get(p.id)?.clients ?? 0} clientes</span> },
    {
      key: 'month',
      header: 'Vendas',
      align: 'right',
      sortValue: (p) => metrics.get(p.id)?.monthSold ?? 0,
      cell: (p) => {
        const x = metrics.get(p.id);
        return (
          <div className="leading-tight">
            <div className="font-medium">{money(x?.monthSold)}</div>
            <div className="text-xs text-subtle">{x?.monthOrders ?? 0} pedido(s)</div>
          </div>
        );
      },
    },
    {
      key: 'commission',
      header: 'Comissão estimada',
      align: 'right',
      sortValue: (p) => metrics.get(p.id)?.monthCommission ?? 0,
      cell: (p) => {
        const x = metrics.get(p.id);
        return (
          <div className="leading-tight">
            <div className="font-medium text-success">{money(x?.monthCommission)}</div>
            <div className="text-xs text-subtle">total {money(x?.commission)}</div>
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      mobile: 'badge',
      cell: (p) => (
        <div className="leading-tight">
          {p.active ? (
            <Badge tone="success" dot>
              Ativo
            </Badge>
          ) : (
            <Badge tone="danger" dot>
              Bloqueado
            </Badge>
          )}

        </div>
      ),
    },
  ];

  const inviteColumns: Column<Invite>[] = [
    {
      key: 'name',
      header: 'Convidado',
      mobile: 'title',
      cell: (i) => (
        <div className="min-w-0">
          <div className="font-medium text-fg truncate">{i.name}</div>
          <div className="text-xs text-muted truncate">{i.email}</div>
        </div>
      ),
    },
    { key: 'phone', header: 'Telefone', hideBelow: 'md', cell: (i) => (i.phone ? <span className="num">{formatPhone(i.phone)}</span> : '—') },
    { key: 'rate', header: 'Comissão', align: 'right', mobile: 'subtitle', cell: (i) => (i.commissionRate != null ? `${percent(i.commissionRate, 2)} de comissão` : '—') },
    { key: 'by', header: 'Convidado por', hideBelow: 'lg', cell: (i) => `${i.invitedByName || '—'} · ${dateTime(i.createdAt)}` },
    { key: 'status', header: 'Status', mobile: 'badge', cell: () => <Badge tone="warning" dot>Aguardando 1º acesso</Badge> },
  ];

  const open = openId ? sellers.find((s) => s.id === openId) || null : null;

  return (
    <>
      <PageHeader
        eyebrow="Comercial"
        title="Vendedores externos"
        subtitle="Representantes com acesso ao aplicativo do vendedor: convites, comissões, carteira e desempenho."
        actions={
          canManage && (
            <Button variant="primary" icon={<MailPlus className="size-4" />} onClick={() => setInviting(true)}>
              Convidar vendedor
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs text-muted">Período dos números:</span>
        <Segmented
          size="sm"
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'month', label: 'Este mês' },
            { value: 'prev', label: 'Mês passado' },
            { value: '90d', label: '90 dias' },
            { value: 'year', label: 'Ano' },
          ]}
        />
      </div>

      <StatGrid cols={4} className="mb-5">
        <Stat label="Ativos" value={totals.active} hint={invites.length ? `${invites.length} convite(s) pendente(s)` : `${sellers.length} vendedor(es) no total`} />
        <Stat
          label="Vendido"
          value={<span className="max-sm:text-lg">{money(totals.monthSold)}</span>}
          hint={totals.pendingApproval ? `${totals.pendingApproval} pedido(s) a aprovar` : PERIOD_LABEL[period]}
          tone="info"
          onClick={() => nav('/vendas')}
        />
        <Stat label="Comissão estimada" value={<span className="max-sm:text-lg">{money(totals.monthCommission)}</span>} hint={`${PERIOD_LABEL[period]}, exceto canceladas`} tone="success" />
        <Stat label="Cadastros a revisar" value={totals.pendingRequests} hint="pedidos de novos clientes" tone="warning" onClick={() => nav('/clientes?aba=solicitacoes')} />
      </StatGrid>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px] items-start">
        <div className="min-w-0">
          <Toolbar>
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: 'sellers', label: 'Vendedores', count: sellers.length },
                { value: 'invites', label: 'Convites', count: invites.length },
              ]}
            />
            {view === 'sellers' && (
              <>
                <SearchInput value={q} onChange={setQ} placeholder="Nome, e-mail ou telefone…" className="sm:w-64" />
                <Segmented
                  size="sm"
                  value={status}
                  onChange={setStatus}
                  options={[
                    { value: 'ALL', label: 'Todos' },
                    { value: 'ACTIVE', label: 'Ativos' },
                    { value: 'BLOCKED', label: 'Bloqueados' },
                  ]}
                />
              </>
            )}
          </Toolbar>

          {view === 'sellers' ? (
            <DataTable
              columns={columns}
              rows={filtered}
              rowKey={(p) => p.id}
              loading={loading}
              initialSort={{ key: 'month', dir: 'desc' }}
              onRowClick={(p) => setOpenId(p.id)}
              rowClassName={(p) => (!p.active ? 'opacity-70' : undefined)}
              empty={
                <EmptyState
                  icon={<UserCheck className="size-5" />}
                  title={sellers.length ? 'Nenhum vendedor encontrado' : 'Nenhum vendedor externo ainda'}
                  description={sellers.length ? 'Ajuste a busca ou o filtro.' : 'Convide o primeiro representante — ele entra com o e-mail convidado e já cai no aplicativo do vendedor.'}
                  action={
                    !sellers.length && canManage ? (
                      <Button variant="primary" icon={<MailPlus className="size-4" />} onClick={() => setInviting(true)}>
                        Convidar vendedor
                      </Button>
                    ) : undefined
                  }
                />
              }
              rowActions={(p) => (
                <Menu
                  items={[
                    { label: 'Ver carteira e pedidos', icon: <Eye />, onClick: () => setOpenId(p.id) },
                    { label: 'Alterar comissão', icon: <Percent />, onClick: () => setOpenId(p.id), hidden: !canManage },
                    'divider',
                    { label: p.active ? 'Bloquear acesso' : 'Reativar acesso', icon: p.active ? <Lock /> : <Unlock />, onClick: () => void setActive.run(p), hidden: !canManage, danger: p.active },
                  ]}
                />
              )}
            />
          ) : (
            <DataTable
              columns={inviteColumns}
              rows={invites}
              rowKey={(i) => i.id}
              empty={
                <EmptyState
                  icon={<MailPlus className="size-5" />}
                  title="Nenhum convite pendente"
                  description="Convites aceitos viram vendedores na outra aba."
                />
              }
              rowActions={(i) => (
                <Menu
                  items={[
                    { label: 'Copiar mensagem de convite', icon: <Copy />, onClick: () => copyInvite(i) },
                    { label: 'Revogar convite', icon: <XCircle />, onClick: () => void revoke.run(i), danger: true, hidden: !canManage },
                  ]}
                />
              )}
            />
          )}
        </div>

        <Card>
          <CardHeader
            icon={<Trophy className="size-4" />}
            title="Ranking de vendedores"
            subtitle={`Valor vendido ${PERIOD_LABEL[period]} (exceto rascunhos e cancelados)`}
          />
          {ranking.some((r) => r.a.monthSold > 0) ? (
            <RankBars
              format={money}
              items={ranking.map(({ p, a }, i) => ({
                label: (
                  <button type="button" className="cursor-pointer hover:text-primary text-left" onClick={() => setOpenId(p.id)}>
                    <span className="num text-subtle mr-1.5">{i + 1}º</span>
                    {p.name}
                  </button>
                ),
                value: a.monthSold,
                hint: `${a.monthOrders} pedido(s) · comissão ${money(a.monthCommission)}`,
              }))}
            />
          ) : (
            <EmptyState title="Sem vendas no período" className="py-8" />
          )}
        </Card>
      </div>

      {inviting && <InviteSellerDrawer onClose={() => setInviting(false)} />}
      {open && (
        <SellerDrawer
          seller={open}
          metrics={metrics.get(open.id)!}
          periodLabel={PERIOD_LABEL[period]}
          sales={sales.filter((s) => s.sellerId === open.id)}
          customers={customers.filter((c) => c.sellerId === open.id)}
          requests={requests.filter((r) => r.requestedById === open.id)}
          canManage={canManage}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}
