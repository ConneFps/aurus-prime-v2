/**
 * /clientes/:id — ficha do cliente: situação, indicadores, compras e abas.
 */
import { BadgeCheck, CheckCircle2, Edit3, Lock, RefreshCw, RotateCcw, ShieldX, ShoppingCart, Trash2, Unlock } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useOps, useSession } from '../../app/session';
import { useAction, useCrud, useRow, useTable } from '../../data/react';
import { addDays, date, dateTime, formatDocument, kg, money, relativeDays, round2, today } from '../../domain/format';
import { COMPANY_LABELS, CUSTOMER_CATEGORY_LABELS, RANKING } from '../../domain/labels';
import {
  Badge,
  BarsChart,
  Button,
  Callout,
  Card,
  CardHeader,
  EmptyState,
  Menu,
  PageHeader,
  PageLoader,
  Progress,
  RankBars,
  Stars,
  Stat,
  StatGrid,
  Tabs,
  useConfirm,
  usePrompt,
} from '../../ui';
import { CustomerFormDrawer } from './CustomerForm';
import { DocumentsTab, FinanceTab, OrdersTab, PortalTab, ProfileTab } from './CustomerDetailTabs';
import { cityLabel, isCounted, lastMonths, receivableSummary, shortMonth } from './helpers';

type Tab = 'orders' | 'finance' | 'profile' | 'documents' | 'portal';

export function CustomerDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const ops = useOps();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const { can } = useSession();
  const canEdit = can('customers.manage');
  const canApprove = can('customers.approveFinancial');
  const crud = useCrud('customers');

  const { row: customer, loading } = useRow('customers', id);
  const { rows: sales } = useTable('sales', { where: [['customerId', '==', id || '-']] }, { enabled: !!id });
  const { rows: entries } = useTable('financial_entries', { where: [['partyId', '==', id || '-']] }, { enabled: !!id });
  const { rows: accounts } = useTable('portal_accounts', { where: [['customerId', '==', id || '-']] }, { enabled: !!id });
  const { row: priceTable } = useRow('price_tables', customer?.priceTableId);

  const [tab, setTab] = useState<Tab>('orders');
  const [editing, setEditing] = useState(false);

  const m = useMemo(() => {
    const counted = sales.filter(isCounted);
    const total = round2(counted.reduce((s, x) => s + (x.totalValue || 0), 0));
    const last = counted.reduce<string | null>((acc, x) => (!acc || x.date > acc ? x.date : acc), null);
    const months = lastMonths(12);
    const byMonth = new Map(months.map((k) => [k, 0]));
    const cuts = new Map<string, { value: number; qty: number; unit: string }>();
    for (const s of counted) {
      const k = s.date.slice(0, 7);
      if (byMonth.has(k)) byMonth.set(k, round2(byMonth.get(k)! + s.totalValue));
      for (const it of s.items || []) {
        if (it.kind !== 'PRODUCT') continue;
        const cur = cuts.get(it.productName) || { value: 0, qty: 0, unit: it.unit };
        cur.value += it.total || 0;
        cur.qty += it.qty || 0;
        cuts.set(it.productName, cur);
      }
    }
    const fin = receivableSummary(entries);
    const inProgress = sales.filter((s) => s.status === 'PENDING_APPROVAL').reduce((a, s) => a + s.totalValue, 0);
    return {
      total,
      orders: counted.length,
      ticket: counted.length ? total / counted.length : 0,
      last,
      chart: months.map((k) => ({ month: shortMonth(k), total: byMonth.get(k) || 0 })),
      cuts: [...cuts.entries()].sort((a, b) => b[1].value - a[1].value).slice(0, 6),
      pendingOrders: inProgress,
      recent90: counted.filter((x) => x.date >= addDays(today(), -90)).length,
      ...fin,
    };
  }, [sales, entries]);

  const financial = useAction(
    async (status: 'APPROVED' | 'REJECTED' | 'PENDING') => {
      if (!customer) return false;
      let notes: string | null = null;
      if (status === 'REJECTED') {
        notes = await prompt({ title: 'Reprovar crédito', message: 'O cliente só poderá comprar à vista até nova análise.', label: 'Motivo', confirmLabel: 'Reprovar', danger: true });
        if (!notes) return false;
      } else if (status === 'APPROVED') {
        notes = await prompt({
          title: `Aprovar crédito de ${customer.tradeName || customer.name}?`,
          message: customer.creditLimit ? `Limite cadastrado: ${money(customer.creditLimit)}.` : 'Nenhum limite de crédito cadastrado.',
          label: 'Observação (opcional)',
          placeholder: 'Ex.: aprovado após consulta Serasa…',
          required: false,
          confirmLabel: 'Aprovar crédito',
        });
        if (notes === null) return false;
      } else if (!(await confirm({ title: 'Voltar a análise para pendente?', confirmLabel: 'Voltar para pendente' }))) return false;
      await ops.setCustomerFinancialApproval(customer.id, status, notes || null);
      return true;
    },
    { onSuccess: () => undefined },
  );

  const toggleBlock = useAction(
    async () => {
      if (!customer) return;
      const block = customer.status === 'ACTIVE';
      if (block && !(await confirm({ title: `Bloquear ${customer.name}?`, message: 'Clientes bloqueados não recebem novos pedidos.', danger: true, confirmLabel: 'Bloquear' }))) return;
      await crud.update(customer.id, { status: block ? 'BLOCKED' : 'ACTIVE' });
    },
    { success: 'Situação do cliente atualizada' },
  );

  const recalc = useAction(() => ops.recalcCustomerStats(id!), { success: 'Estatísticas e ranking recalculados' });

  const remove = useAction(async () => {
    if (!customer) return;
    if (!(await confirm({ title: `Excluir ${customer.name}?`, message: 'O cadastro será apagado. Esta ação não pode ser desfeita.', danger: true, confirmLabel: 'Excluir' }))) return;
    await crud.remove(customer.id);
    nav('/clientes');
  });

  if (loading) return <PageLoader />;
  if (!customer)
    return (
      <EmptyState
        title="Cliente não encontrado"
        description="Ele pode ter sido excluído."
        action={
          <Link to="/clientes">
            <Button>Voltar para clientes</Button>
          </Link>
        }
      />
    );

  const c = customer;
  const available = c.creditLimit ? round2(c.creditLimit - m.open) : null;
  const usage = c.creditLimit ? Math.min(100, (m.open / c.creditLimit) * 100) : 0;
  const approvalBadge =
    c.financialApproval === 'APPROVED' ? (
      <Badge tone="success" dot>
        Crédito aprovado
      </Badge>
    ) : c.financialApproval === 'REJECTED' ? (
      <Badge tone="danger" dot>
        Crédito reprovado
      </Badge>
    ) : (
      <Badge tone="warning" dot>
        Crédito pendente
      </Badge>
    );

  return (
    <>
      <PageHeader
        back="/clientes"
        eyebrow={`Cliente${c.code ? ` · ${c.code}` : ''}`}
        title={c.name}
        subtitle={[c.tradeName, formatDocument(c.document), cityLabel(c) !== '—' ? cityLabel(c) : null].filter(Boolean).join(' · ')}
        actions={
          <>
            {can('sales.create') && c.status === 'ACTIVE' && (
              <Button variant="primary" icon={<ShoppingCart className="size-4" />} onClick={() => nav(`/vendas/nova?cliente=${c.id}`)}>
                Novo pedido
              </Button>
            )}
            {canEdit && (
              <Button icon={<Edit3 className="size-4" />} onClick={() => setEditing(true)}>
                Editar
              </Button>
            )}
            <Menu
              items={[
                { label: 'Aprovar crédito', icon: <BadgeCheck />, onClick: () => void financial.run('APPROVED'), hidden: !canApprove || c.financialApproval === 'APPROVED' },
                { label: 'Reprovar crédito', icon: <ShieldX />, onClick: () => void financial.run('REJECTED'), hidden: !canApprove || c.financialApproval === 'REJECTED', danger: true },
                { label: 'Voltar crédito para pendente', icon: <RotateCcw />, onClick: () => void financial.run('PENDING'), hidden: !canApprove || c.financialApproval === 'PENDING' },
                'divider',
                { label: c.status === 'ACTIVE' ? 'Bloquear cliente' : 'Desbloquear cliente', icon: c.status === 'ACTIVE' ? <Lock /> : <Unlock />, onClick: () => void toggleBlock.run(), hidden: !canEdit },
                { label: 'Recalcular ranking', icon: <RefreshCw />, onClick: () => void recalc.run(), hidden: !canEdit },
                { label: 'Excluir cadastro', icon: <Trash2 />, onClick: () => void remove.run(), hidden: !canEdit || sales.length > 0 || entries.length > 0, danger: true },
              ]}
            />
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={RANKING[c.ranking].tone} dot>
            {RANKING[c.ranking].label}
          </Badge>
          <Stars value={c.stars} />
          {c.status === 'BLOCKED' ? (
            <Badge tone="danger" dot>
              Bloqueado
            </Badge>
          ) : (
            <Badge tone="success" dot>
              Ativo
            </Badge>
          )}
          {approvalBadge}
          <Badge>{CUSTOMER_CATEGORY_LABELS[c.category]}</Badge>
          {c.isIntercompany && <Badge tone="info">Intercompany · {COMPANY_LABELS[c.intercompanyCode || 'AURUS']}</Badge>}
          {c.sellerName && <span className="text-xs text-muted">Vendedor: {c.sellerName}</span>}
        </div>
      </PageHeader>

      {c.status === 'BLOCKED' && (
        <Callout tone="danger" title="Cliente bloqueado" className="mb-4" action={canEdit ? <Button size="sm" onClick={() => void toggleBlock.run()}>Desbloquear</Button> : undefined}>
          Novos pedidos ficam impedidos até o desbloqueio.
        </Callout>
      )}
      {c.financialApproval === 'PENDING' && (
        <Callout
          tone="warning"
          title="Crédito aguardando análise do financeiro"
          className="mb-4"
          action={
            canApprove ? (
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => void financial.run('REJECTED')}>
                  Reprovar
                </Button>
                <Button size="sm" variant="primary" icon={<CheckCircle2 className="size-4" />} loading={financial.running} onClick={() => void financial.run('APPROVED')}>
                  Aprovar
                </Button>
              </div>
            ) : undefined
          }
        >
          {c.creditLimit ? `Limite solicitado: ${money(c.creditLimit)}.` : 'Sem limite de crédito cadastrado.'} Pedidos a prazo exigem aprovação.
        </Callout>
      )}
      {c.financialApproval === 'REJECTED' && (
        <Callout tone="danger" title={`Crédito reprovado${c.financialApprovedBy ? ` por ${c.financialApprovedBy} em ${dateTime(c.financialApprovedAt)}` : ''}`} className="mb-4">
          {c.financialApprovalNotes || 'Somente vendas à vista.'}
        </Callout>
      )}

      <StatGrid cols={4} className="mb-4">
        <Stat label="Total comprado" value={<span className="max-sm:text-lg">{money(m.total)}</span>} hint={`${m.orders} pedido(s) faturado(s)`} />
        <Stat label="Pedidos" value={m.orders} hint={m.pendingOrders ? `+ ${money(m.pendingOrders)} a aprovar` : `${m.recent90} nos últimos 90 dias`} tone="info" />
        <Stat label="Ticket médio" value={<span className="max-sm:text-lg">{money(m.ticket)}</span>} hint="por pedido" tone="accent" />
        <Stat label="Última compra" value={<span className="max-sm:text-lg">{m.last ? date(m.last) : '—'}</span>} hint={m.last ? relativeDays(m.last) : 'nenhuma compra ainda'} tone="success" />
      </StatGrid>

      <Card className="mb-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:divide-x divide-border">
          <div className="min-w-0">
            <div className="text-xs font-medium text-muted uppercase tracking-wider">Em aberto</div>
            <div className="text-2xl font-semibold num text-fg mt-1">{money(m.open)}</div>
            <div className="text-xs text-muted mt-1">a receber deste cliente</div>
          </div>
          <div className="min-w-0 sm:pl-4">
            <div className="text-xs font-medium text-muted uppercase tracking-wider">Vencido</div>
            <div className={`text-2xl font-semibold num mt-1 ${m.overdue > 0 ? 'text-danger' : 'text-fg'}`}>{money(m.overdue)}</div>
            <div className="text-xs text-muted mt-1">{m.overdue > 0 ? 'cobrar antes de novo pedido a prazo' : 'nenhuma parcela atrasada'}</div>
          </div>
          <div className="min-w-0 sm:pl-4">
            <div className="text-xs font-medium text-muted uppercase tracking-wider">Limite disponível</div>
            <div className={`text-2xl font-semibold num mt-1 ${available !== null && available < 0 ? 'text-danger' : 'text-fg'}`}>
              {available === null ? 'Sem limite' : money(available)}
            </div>
            {c.creditLimit ? (
              <div className="mt-2 space-y-1">
                <Progress value={usage} tone={usage >= 100 ? 'danger' : usage >= 80 ? 'warning' : 'success'} />
                <div className="text-xs text-muted num">
                  {Math.round(usage)}% de {money(c.creditLimit)} em uso
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted mt-1">defina um limite no cadastro</div>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] mb-6">
        <Card>
          <CardHeader title="Compras por mês" subtitle="Pedidos aprovados em diante, últimos 12 meses" />
          {m.total > 0 ? (
            <BarsChart data={m.chart} xKey="month" series={[{ key: 'total', name: 'Comprado' }]} format={money} axisFormat={(v) => (v >= 1000 ? `${Math.round(v / 1000)} mil` : String(v))} height={260} />
          ) : (
            <EmptyState title="Sem compras no período" className="py-10" />
          )}
        </Card>
        <Card>
          <CardHeader title="Cortes mais comprados" subtitle="Por valor, todo o histórico" />
          {m.cuts.length ? (
            <RankBars items={m.cuts.map(([name, v]) => ({ label: name, value: v.value, hint: v.unit === 'KG' ? kg(v.qty) : `${v.qty} un` }))} format={money} />
          ) : (
            <EmptyState title="Nenhum item comprado ainda" className="py-10" />
          )}
        </Card>
      </div>

      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'orders', label: 'Pedidos', count: sales.length },
          { value: 'finance', label: 'Financeiro', count: entries.filter((e) => e.direction === 'IN' && e.status === 'OPEN').length },
          { value: 'profile', label: 'Cadastro' },
          { value: 'documents', label: 'Documentos', count: (c.documents || []).length },
          { value: 'portal', label: 'Portal', count: accounts.length },
        ]}
      />
      {tab === 'orders' && <OrdersTab customer={c} sales={sales} />}
      {tab === 'finance' && <FinanceTab entries={entries} />}
      {tab === 'profile' && <ProfileTab customer={c} priceTable={priceTable} onEdit={canEdit ? () => setEditing(true) : undefined} />}
      {tab === 'documents' && <DocumentsTab customer={c} />}
      {tab === 'portal' && <PortalTab accounts={accounts} />}

      {editing && <CustomerFormDrawer customer={c} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />}
    </>
  );
}
