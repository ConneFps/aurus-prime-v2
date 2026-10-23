/**
 * Aba "Pedidos do portal": filas por etapa (novos, frete, cliente, comprovantes, prontos).
 */
import { Check, ExternalLink, Inbox, PackageCheck, Receipt, Truck, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useOps, useSession } from '../../../app/session';
import { useAction } from '../../../data/react';
import { date, matchesSearch, money, today } from '../../../domain/format';
import { PAYMENT_STATUS, SALE_STATUS } from '../../../domain/labels';
import type { PortalAccount, Sale } from '../../../domain/types';
import { Badge, DataTable, Menu, SearchInput, Segmented, StatusBadge, Toolbar, usePrompt, type Column } from '../../../ui';
import { inQueue, type OrderQueue } from './helpers';
import { PortalOrderDrawer } from './PortalOrderDrawer';

const QUEUES: { value: OrderQueue; label: string }[] = [
  { value: 'NEW', label: 'Novos' },
  { value: 'FREIGHT', label: 'Frete a combinar' },
  { value: 'CUSTOMER', label: 'Aguardando cliente' },
  { value: 'RECEIPT', label: 'Comprovantes' },
  { value: 'READY', label: 'Prontos' },
  { value: 'ALL', label: 'Todos' },
];

export function OrdersTab({ sales, accounts, loading }: { sales: Sale[]; accounts: PortalAccount[]; loading: boolean }) {
  const ops = useOps();
  const { can } = useSession();
  const nav = useNavigate();
  const prompt = usePrompt();
  const [params, setParams] = useSearchParams();
  const queue = (params.get('fila') as OrderQueue | null) || null;
  const setQueue = (v: OrderQueue) => setParams({ fila: v }, { replace: true });
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c = {} as Record<OrderQueue, number>;
    QUEUES.forEach((x) => (c[x.value] = sales.filter((s) => inQueue(s, x.value)).length));
    return c;
  }, [sales]);
  const active: OrderQueue = queue ?? (QUEUES.find((x) => x.value !== 'ALL' && counts[x.value] > 0)?.value || 'ALL');
  const accById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const rows = useMemo(
    () =>
      sales
        .filter((s) => inQueue(s, active))
        .filter((s) => matchesSearch([s.number, s.customerName, s.customerDocument, accById.get(s.portalAccountId || '')?.name], q)),
    [sales, active, q, accById],
  );
  const openSale = sales.find((s) => s.id === openId) || null;

  const approve = useAction((s: Sale) => ops.approveSale(s.id, 'Aprovado pelo painel do portal'), { success: 'Pedido aprovado' });
  const reject = useAction(async (s: Sale) => {
    const reason = await prompt({ title: `Recusar o pedido ${s.number}?`, label: 'Motivo (o cliente verá esta mensagem)', confirmLabel: 'Recusar', danger: true });
    if (reason) await ops.rejectSale(s.id, reason);
  });
  const confirmPay = useAction((s: Sale) => ops.confirmSalePayment(s.id, { date: today(), method: 'PIX', notes: 'Comprovante enviado pelo portal' }), {
    success: 'Pagamento confirmado',
  });

  const columns: Column<Sale>[] = [
    {
      key: 'number',
      header: 'Pedido',
      mobile: 'title',
      sortValue: (s) => s.createdAt,
      cell: (s) => (
        <div className="min-w-0">
          <div className="font-medium text-fg num">nº {s.number}</div>
          <div className="text-xs text-muted">{date(s.date)}</div>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Cliente',
      mobile: 'subtitle',
      sortValue: (s) => s.customerName,
      cell: (s) => (
        <div className="min-w-0">
          <div className="text-fg truncate">{s.customerName}</div>
          <div className="text-xs text-muted truncate">{accById.get(s.portalAccountId || '')?.name || '—'}</div>
        </div>
      ),
    },
    {
      key: 'delivery',
      header: 'Entrega',
      hideBelow: 'md',
      sortValue: (s) => s.deliveryDate || '',
      cell: (s) => (
        <div className="text-sm">
          <div className="text-fg">{s.deliveryMode === 'PICKUP' ? 'Retirada' : 'Entrega'} · {date(s.deliveryDate)}</div>
          <div className="text-xs text-muted">{s.freightPending ? 'Frete a combinar' : s.freightValue > 0 ? `Frete ${money(s.freightValue)}` : 'Sem frete'}</div>
        </div>
      ),
    },
    { key: 'total', header: 'Total', align: 'right', sortValue: (s) => s.totalValue, cell: (s) => <span className="num font-medium">{money(s.totalValue)}</span> },
    {
      key: 'status',
      header: 'Situação',
      mobile: 'badge',
      cell: (s) => (
        <span className="inline-flex flex-wrap gap-1.5 justify-end md:justify-start">
          <StatusBadge info={SALE_STATUS[s.status]} />
          {s.paymentStatus !== 'PENDING' && <StatusBadge info={PAYMENT_STATUS[s.paymentStatus]} />}
          {s.weighing?.decision === 'REJECTED' && s.status === 'AWAITING_CUSTOMER' && <Badge tone="danger">Recusou peso</Badge>}
        </span>
      ),
    },
  ];

  return (
    <>
      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar pedido ou cliente…" className="sm:w-72" />
        <Segmented size="sm" value={active} onChange={setQueue} options={QUEUES.map((x) => ({ ...x, count: x.value === 'ALL' ? undefined : counts[x.value] }))} />
      </Toolbar>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(s) => s.id}
        loading={loading}
        initialSort={{ key: 'number', dir: 'desc' }}
        onRowClick={(s) => setOpenId(s.id)}
        emptyTitle={active === 'ALL' ? 'Nenhum pedido do portal ainda' : 'Nada nesta fila'}
        emptyDescription={active === 'ALL' ? 'Os pedidos feitos pelos clientes no portal aparecem aqui.' : 'Tudo em dia por aqui.'}
        empty={!loading && !sales.length ? undefined : rows.length ? undefined : <EmptyQueue />}
        rowActions={(s) => (
          <Menu
            items={[
              { label: 'Aprovar', icon: <Check />, hidden: s.status !== 'PENDING_APPROVAL' || !can('sales.approve') || !!s.freightPending, onClick: () => void approve.run(s) },
              { label: 'Recusar', icon: <X />, hidden: s.status !== 'PENDING_APPROVAL' || !can('sales.approve'), onClick: () => void reject.run(s) },
              { label: 'Informar frete', icon: <Truck />, hidden: !s.freightPending, onClick: () => setOpenId(s.id) },
              { label: 'Confirmar pagamento', icon: <Receipt />, hidden: s.paymentStatus !== 'RECEIPT_SENT' || !can('finance.pay'), onClick: () => void confirmPay.run(s) },
              { label: 'Separação', icon: <PackageCheck />, hidden: !['APPROVED', 'PICKING'].includes(s.status) || !can('picking.perform'), onClick: () => nav(`/estoque/separacao/${s.id}`) },
              { label: 'Abrir venda', icon: <ExternalLink />, onClick: () => nav(`/vendas/${s.id}`) },
            ]}
          />
        )}
      />
      <PortalOrderDrawer sale={openSale} account={openSale ? accById.get(openSale.portalAccountId || '') : null} onClose={() => setOpenId(null)} />
    </>
  );
}

function EmptyQueue() {
  return (
    <div className="py-12 text-center">
      <Inbox className="size-8 mx-auto text-subtle mb-3" />
      <p className="text-sm text-muted">Nada nesta fila — tudo em dia.</p>
    </div>
  );
}
