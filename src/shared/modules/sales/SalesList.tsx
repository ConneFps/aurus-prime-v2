/**
 * Lista de vendas (usada por /vendas e /vendas/intercompany).
 */
import { Building2, Check, CopyPlus, Download, Eye, FileDown, FileText, Package, Pencil, Plus, Receipt, ShoppingCart, Store, Truck, Wallet, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useOps, useSession } from '../../app/session';
import { useSettings } from '../../app/settings';
import { useAction, useTable } from '../../data/react';
import { date, integer, kg, matchesSearch, money, moneyCompact, round2, today } from '../../domain/format';
import { COMPANY_LABELS, PAYMENT_STATUS, SALE_CHANNEL_LABELS, SALE_STATUS } from '../../domain/labels';
import type { CompanyCode, Sale, SaleChannel, SalePaymentStatus, SaleStatus } from '../../domain/types';
import {
  Badge,
  Button,
  Card,
  DataTable,
  DateInput,
  Menu,
  PageHeader,
  SearchInput,
  Segmented,
  Select,
  Stat,
  StatGrid,
  StatusBadge,
  Toolbar,
  usePrompt,
  type Column,
} from '../../ui';
import { deltaPct, inPeriod, isBilled, isEditable, periodRange, previousPeriod, productLines, saleItemsToInputs, type PeriodKey } from './helpers';
import { PendingApprovals } from './PendingApprovals';
import { useMinWidth } from './useMedia';
import { exportSalesCsv, saleOrderPdf, salesReportPdf } from './pdf';

type StatusFilter = 'ALL' | 'OPEN' | SaleStatus;

const STATUS_CHIPS: { value: StatusFilter; label: string; match: (s: SaleStatus) => boolean }[] = [
  { value: 'ALL', label: 'Todos', match: () => true },
  { value: 'OPEN', label: 'Em andamento', match: (s) => !['DELIVERED', 'CANCELLED', 'REJECTED'].includes(s) },
  { value: 'DRAFT', label: 'Rascunhos', match: (s) => s === 'DRAFT' },
  { value: 'PENDING_APPROVAL', label: 'Aprovação', match: (s) => s === 'PENDING_APPROVAL' },
  { value: 'APPROVED', label: 'Aprovados', match: (s) => s === 'APPROVED' },
  { value: 'PICKING', label: 'Separação', match: (s) => s === 'PICKING' || s === 'AWAITING_CUSTOMER' },
  { value: 'READY', label: 'Separados', match: (s) => s === 'READY' },
  { value: 'DISPATCHED', label: 'Expedidos', match: (s) => s === 'DISPATCHED' },
  { value: 'DELIVERED', label: 'Entregues', match: (s) => s === 'DELIVERED' },
  { value: 'CANCELLED', label: 'Cancelados', match: (s) => s === 'CANCELLED' || s === 'REJECTED' },
];

const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'month', label: 'Mês' },
  { value: 'custom', label: 'Período' },
  { value: 'all', label: 'Tudo' },
];

export function SalesList({ intercompany = false }: { intercompany?: boolean }) {
  const nav = useNavigate();
  const ops = useOps();
  const prompt = usePrompt();
  const { can, profile } = useSession();
  const { settings } = useSettings();
  const [params] = useSearchParams();
  const { rows: all, loading } = useTable('sales');
  const { rows: entries } = useTable('financial_entries', { where: [['category', '==', 'SALE']] });
  const { rows: customerRows } = useTable('customers');
  const customers = useMemo(() => new Map(customerRows.map((c) => [c.id, c])), [customerRows]);

  const initialStatus = (params.get('status') as StatusFilter) || 'ALL';
  const [period, setPeriod] = useState<PeriodKey>(params.get('status') ? 'all' : '30d');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [status, setStatus] = useState<StatusFilter>(initialStatus);
  const [payment, setPayment] = useState<SalePaymentStatus | ''>('');
  const [channel, setChannel] = useState<SaleChannel | ''>('');
  const [seller, setSeller] = useState('');
  const [q, setQ] = useState(params.get('q') || '');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const desktop = useMinWidth(640);

  // Visíveis ao usuário (vendedor sem "ver todas" só vê as próprias).
  const base = useMemo(
    () =>
      all.filter(
        (s) =>
          !!s.isIntercompany === intercompany &&
          (can('sales.viewAll') || s.sellerId === profile?.id || s.createdById === profile?.id),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, intercompany, profile?.id],
  );

  const range = periodRange(period, custom);
  const matchesOther = (s: Sale) =>
    (!payment || s.paymentStatus === payment) &&
    (!channel || s.channel === channel) &&
    (!seller || s.sellerId === seller) &&
    matchesSearch([s.number, s.customerName, s.customerDocument, s.invoiceNumber, s.boletoNumber, s.sellerName], q);

  const scoped = useMemo(() => base.filter((s) => inPeriod(s.date, range) && matchesOther(s)), // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, range.from, range.to, payment, channel, seller, q]);
  const chip = STATUS_CHIPS.find((c) => c.value === status) || STATUS_CHIPS[0];
  const filtered = useMemo(() => scoped.filter((s) => chip.match(s.status)), [scoped, chip]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of STATUS_CHIPS) m[c.value] = scoped.filter((s) => c.match(s.status)).length;
    return m;
  }, [scoped]);

  const sellers = useMemo(() => {
    const m = new Map<string, string>();
    base.forEach((s) => s.sellerId && m.set(s.sellerId, s.sellerName || 'Sem nome'));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')).map(([value, label]) => ({ value, label }));
  }, [base]);

  const entriesBySale = useMemo(() => {
    const m = new Map<string, typeof entries>();
    for (const e of entries) {
      if (!e.saleId) continue;
      const arr = m.get(e.saleId) || [];
      arr.push(e);
      m.set(e.saleId, arr);
    }
    return m;
  }, [entries]);

  // ---- Indicadores -------------------------------------------------------
  const kpi = useMemo(() => {
    const calc = (rows: Sale[]) => {
      const billed = rows.filter(isBilled);
      const revenue = billed.reduce((s, r) => s + r.totalValue, 0);
      const weight = billed.reduce((s, r) => s + (r.totalWeightKg || 0), 0);
      let receivable = 0;
      let overdue = 0;
      for (const r of rows) {
        for (const e of entriesBySale.get(r.id) || []) {
          if (e.status !== 'OPEN') continue;
          const open = e.amount - (e.paidAmount || 0);
          receivable += open;
          if (e.dueDate < today()) overdue += open;
        }
      }
      return { revenue, count: billed.length, ticket: billed.length ? revenue / billed.length : 0, weight, receivable: round2(receivable), overdue: round2(overdue) };
    };
    const cur = calc(scoped);
    const prevP = previousPeriod(range);
    const prev = prevP ? calc(base.filter((s) => inPeriod(s.date, prevP) && matchesOther(s))) : null;
    return { cur, prev };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, base, entriesBySale]);

  const byCompany = useMemo(() => {
    if (!intercompany) return [];
    const m = new Map<CompanyCode, { total: number; count: number; weight: number }>();
    for (const s of scoped.filter(isBilled)) {
      const code = (customers.get(s.customerId)?.intercompanyCode || s.company) as CompanyCode | null;
      if (!code) continue;
      const cur = m.get(code) || { total: 0, count: 0, weight: 0 };
      cur.total += s.totalValue;
      cur.count += 1;
      cur.weight += s.totalWeightKg || 0;
      m.set(code, cur);
    }
    // Sempre um cartão por empresa do grupo cadastrada como cliente (mesmo sem vendas no período).
    customerRows.forEach((c) => c.isIntercompany && c.intercompanyCode && !m.has(c.intercompanyCode) && m.set(c.intercompanyCode, { total: 0, count: 0, weight: 0 }));
    return (Object.keys(COMPANY_LABELS) as CompanyCode[]).filter((c) => m.has(c)).map((c) => ({ code: c, ...m.get(c)! }));
  }, [scoped, customers, customerRows, intercompany]);

  const pending = useMemo(
    () => (can('sales.approve') ? base.filter((s) => s.status === 'PENDING_APPROVAL').sort((a, b) => a.date.localeCompare(b.date)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base],
  );

  // ---- Ações -------------------------------------------------------------
  const selectedRows = filtered.filter((s) => selected.has(s.id));
  const approvable = selectedRows.filter((s) => s.status === 'PENDING_APPROVAL' || s.status === 'DRAFT');
  const bulkApprove = useAction(
    async () => {
      let ok = 0;
      const errors: string[] = [];
      for (const s of approvable) {
        try {
          await ops.approveSale(s.id);
          ok++;
        } catch (e) {
          errors.push(`${s.number}: ${(e as Error).message}`);
        }
      }
      setSelected(new Set());
      if (errors.length) throw new Error(`${ok} aprovado(s). Não aprovados:\n${errors.slice(0, 5).join('\n')}`);
      return ok;
    },
    { success: (n) => `${n} pedido(s) aprovado(s)` },
  );
  const approveOne = useAction((s: Sale) => ops.approveSale(s.id), { success: 'Pedido aprovado' });
  const cancelOne = useAction((s: Sale, reason: string) => ops.cancelSale(s.id, reason), { success: 'Pedido cancelado' });
  const askCancel = async (s: Sale) => {
    const reason = await prompt({
      title: `Cancelar pedido ${s.number}?`,
      message: s.stockDeducted ? 'O estoque baixado será estornado e as parcelas em aberto, canceladas.' : 'As parcelas em aberto serão canceladas.',
      label: 'Motivo do cancelamento',
      confirmLabel: 'Cancelar pedido',
      danger: true,
    });
    if (reason) await cancelOne.run(s, reason);
  };
  const pdfOne = useAction((s: Sale) => saleOrderPdf({ sale: s, settings, customer: customers.get(s.customerId), entries: entriesBySale.get(s.id) || [] }));

  const title = intercompany ? 'Vendas intercompany' : 'Vendas';
  const periodLabel = range.from ? `${date(range.from)} a ${date(range.to)}` : 'Todo o período';
  const exportPdf = (rows: Sale[]) => salesReportPdf(rows, { title, subtitle: `${periodLabel} · ${rows.length} pedidos`, settings });
  const duplicate = (s: Sale) =>
    nav('/vendas/nova', { state: { seed: { customerId: s.customerId, priceTableId: s.priceTableId, items: saleItemsToInputs(s), paymentMethod: s.paymentMethod, billingType: s.billingType, paymentTerms: s.paymentTerms, deliveryMode: s.deliveryMode, customerNotes: s.customerNotes } } });

  // ---- Colunas -----------------------------------------------------------
  const columns: Column<Sale>[] = [
    {
      key: 'number',
      header: 'Nº',
      mobile: 'subtitle',
      sortValue: (s) => s.number,
      cell: (s) => (
        <span className="num sm:font-medium sm:text-fg">
          <span className="sm:hidden">Nº </span>
          {s.number}
          <span className="sm:hidden"> · {date(s.date)}</span>
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Data',
      mobile: false,
      sortValue: (s) => s.date + s.createdAt,
      cell: (s) => (
        <div className="leading-tight">
          <div className="num">{date(s.date)}</div>
          <div className="text-[11px] text-muted whitespace-nowrap">{SALE_CHANNEL_LABELS[s.channel]}</div>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Cliente',
      mobile: 'title',
      sortValue: (s) => s.customerName,
      cell: (s) => (
        <div className="min-w-0 max-w-[280px]">
          <div className="font-medium text-fg truncate">{s.customerName}</div>
          <div className="text-xs text-muted truncate sm:block hidden">{s.sellerName || '—'}</div>
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Itens / peso',
      align: 'right',
      hideBelow: 'lg',
      sortValue: (s) => s.totalWeightKg,
      cell: (s) => (
        <span className="num text-muted whitespace-nowrap">
          {productLines(s).length} · <span className="text-fg">{kg(s.totalWeightKg)}</span>
        </span>
      ),
    },
    { key: 'total', header: 'Total', align: 'right', sortValue: (s) => s.totalValue, cell: (s) => <span className="font-semibold text-fg">{money(s.totalValue)}</span> },
    { key: 'status', header: 'Status', mobile: 'badge', sortValue: (s) => s.status, cell: (s) => <StatusBadge info={SALE_STATUS[s.status]} /> },
    { key: 'payment', header: 'Pagamento', sortValue: (s) => s.paymentStatus, cell: (s) => <StatusBadge info={PAYMENT_STATUS[s.paymentStatus]} /> },
    {
      key: 'delivery',
      header: 'Entrega',
      hideBelow: 'lg',
      sortValue: (s) => s.deliveryDate || '',
      cell: (s) => (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted num">
          {s.deliveryMode === 'PICKUP' ? <Store className="size-3.5" /> : <Truck className="size-3.5" />}
          {s.deliveryDate ? date(s.deliveryDate) : 'A combinar'}
        </span>
      ),
    },
  ];

  const k = kpi.cur;
  const p = kpi.prev;
  const exportMenu = (rows: Sale[], label = 'Exportar') => (
    <Menu
      trigger={
        <Button icon={<Download className="size-4" />} size="md">
          {label}
        </Button>
      }
      items={[
        { label: 'Planilha (CSV)', icon: <FileDown />, onClick: () => exportSalesCsv(intercompany ? 'vendas-intercompany' : 'vendas', rows) },
        { label: 'Relatório em PDF', icon: <FileText />, onClick: () => exportPdf(rows) },
      ]}
    />
  );

  return (
    <>
      <PageHeader
        eyebrow="Comercial"
        title={title}
        subtitle={
          intercompany
            ? 'Vendas entre as empresas do grupo — transferências com NF e contas a receber próprias.'
            : 'Pedidos, aprovação, separação, notas e recebimentos em um só lugar.'
        }
        actions={
          <>
            {exportMenu(filtered)}
            {can('sales.create') && (
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => nav('/vendas/nova')}>
                Nova venda
              </Button>
            )}
          </>
        }
      />

      <PendingApprovals
        sales={pending}
        customers={customers}
        onShowAll={() => {
          setStatus('PENDING_APPROVAL');
          setPeriod('all');
        }}
      />

      {intercompany ? (
        <StatGrid cols={byCompany.length + 2 >= 5 ? 5 : 4} className="mb-5">
          <Stat label="Total intercompany" icon={<Building2 className="size-4" />} value={<Short full={money(k.revenue)} short={moneyCompact(k.revenue)} />} hint={`${k.count} pedidos · ${kg(k.weight)}`} delta={p ? deltaPct(k.revenue, p.revenue) : undefined} />
          {byCompany.map((c) => (
            <Stat key={c.code} tone="info" label={COMPANY_LABELS[c.code]} value={<Short full={money(c.total)} short={moneyCompact(c.total)} />} hint={`${c.count} pedidos · ${kg(c.weight)}`} />
          ))}
          <Stat tone={k.overdue > 0 ? 'danger' : 'warning'} icon={<Wallet className="size-4" />} label="A receber" value={<Short full={money(k.receivable)} short={moneyCompact(k.receivable)} />} hint={k.overdue > 0 ? `${money(k.overdue)} vencido` : 'parcelas em aberto'} />
        </StatGrid>
      ) : (
        <StatGrid cols={5} className="mb-5">
          <Stat label="Faturamento" icon={<Receipt className="size-4" />} value={<Short full={money(k.revenue)} short={moneyCompact(k.revenue)} />} delta={p ? deltaPct(k.revenue, p.revenue) : undefined} deltaLabel={p ? 'vs. anterior' : undefined} />
          <Stat label="Pedidos" icon={<ShoppingCart className="size-4" />} tone="info" value={k.count} delta={p ? deltaPct(k.count, p.count) : undefined} deltaLabel={p ? 'vs. anterior' : undefined} />
          <Stat label="Ticket médio" tone="accent" value={<Short full={money(k.ticket)} short={moneyCompact(k.ticket)} />} delta={p ? deltaPct(k.ticket, p.ticket) : undefined} />
          <Stat label="Kg vendidos" icon={<Package className="size-4" />} tone="success" value={<Short full={kg(k.weight)} short={`${integer(k.weight)} kg`} />} delta={p ? deltaPct(k.weight, p.weight) : undefined} />
          <Stat
            label="A receber"
            icon={<Wallet className="size-4" />}
            tone={k.overdue > 0 ? 'danger' : 'warning'}
            value={money(k.receivable)}
            hint={k.overdue > 0 ? `${money(k.overdue)} vencido` : 'nenhum vencido'}
            className="col-span-2 md:col-span-1"
          />
        </StatGrid>
      )}

      <Toolbar className="mb-3">
        <Segmented size="sm" value={period} onChange={setPeriod} options={PERIODS} />
        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <DateInput value={custom.from} onChange={(v) => setCustom({ ...custom, from: v })} className="h-8 sm:w-40" aria-label="De" />
            <span className="text-xs text-muted">até</span>
            <DateInput value={custom.to} onChange={(v) => setCustom({ ...custom, to: v })} className="h-8 sm:w-40" aria-label="Até" />
          </div>
        )}
        <span className="text-xs text-muted num sm:ml-auto">{periodLabel}</span>
      </Toolbar>

      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Nº do pedido, cliente, NF…" className="sm:w-72" />
        <div className="grid grid-cols-2 sm:flex gap-2">
          <Select value={payment} onChange={setPayment} placeholder="Pagamento: todos" options={[{ value: '' as const, label: 'Pagamento: todos' }, ...(Object.keys(PAYMENT_STATUS) as SalePaymentStatus[]).map((v) => ({ value: v, label: PAYMENT_STATUS[v].label }))]} className="sm:w-44" />
          {!intercompany && (
            <Select value={channel} onChange={setChannel} options={[{ value: '' as const, label: 'Canal: todos' }, ...(Object.keys(SALE_CHANNEL_LABELS) as SaleChannel[]).filter((c) => c !== 'INTERCOMPANY').map((v) => ({ value: v, label: SALE_CHANNEL_LABELS[v] }))]} className="sm:w-44" />
          )}
          {can('sales.viewAll') && sellers.length > 1 && (
            <Select value={seller} onChange={setSeller} options={[{ value: '', label: 'Vendedor: todos' }, ...sellers]} className="col-span-2 sm:w-48" />
          )}
        </div>
      </Toolbar>

      <div className="mb-4">
        <Segmented size="sm" value={status} onChange={setStatus} options={STATUS_CHIPS.filter((c) => c.value === 'ALL' || c.value === status || counts[c.value]).map((c) => ({ value: c.value, label: c.label, count: counts[c.value] || 0 }))} />
      </div>

      {selected.size > 0 && (
        <Card className="mb-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 !py-3 border-primary/40 bg-primary-soft/30">
          <div className="text-sm text-fg flex-1">
            <span className="font-semibold num">{selectedRows.length}</span> selecionado(s) ·{' '}
            <span className="num">{money(selectedRows.reduce((s, r) => s + r.totalValue, 0))}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {can('sales.approve') && (
              <Button size="sm" variant="primary" icon={<Check className="size-4" />} disabled={!approvable.length} loading={bulkApprove.running} onClick={() => void bulkApprove.run()}>
                Aprovar {approvable.length ? `(${approvable.length})` : ''}
              </Button>
            )}
            <Button size="sm" icon={<FileDown className="size-4" />} onClick={() => exportSalesCsv('vendas-selecionadas', selectedRows)}>
              CSV
            </Button>
            <Button size="sm" icon={<FileText className="size-4" />} onClick={() => exportPdf(selectedRows)}>
              PDF
            </Button>
            <Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={() => setSelected(new Set())}>
              Limpar
            </Button>
          </div>
        </Card>
      )}

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(s) => s.id}
        loading={loading}
        initialSort={{ key: 'date', dir: 'desc' }}
        onRowClick={(s) => nav(`/vendas/${s.id}`)}
        selectable={desktop}
        selected={selected}
        onSelectedChange={setSelected}
        rowClassName={(s) => (s.status === 'PENDING_APPROVAL' ? 'bg-warning-soft/30' : s.status === 'CANCELLED' || s.status === 'REJECTED' ? 'opacity-60' : undefined)}
        emptyTitle={base.length ? 'Nenhum pedido encontrado' : intercompany ? 'Nenhuma venda intercompany ainda' : 'Nenhuma venda ainda'}
        emptyDescription={base.length ? (period !== 'all' ? 'Tente ampliar o período para "Tudo" ou limpar os filtros.' : 'Tente outra busca ou limpe os filtros.') : 'Registre o primeiro pedido em "Nova venda".'}
        footer={
          filtered.length > 1 ? (
            <tr>
              <td colSpan={99} className="px-4 py-2.5 text-xs text-muted">
                <span className="num">
                  {filtered.length} pedidos · {kg(filtered.reduce((s, r) => s + (r.totalWeightKg || 0), 0))} ·{' '}
                  <span className="text-fg font-semibold">{money(filtered.reduce((s, r) => s + r.totalValue, 0))}</span>
                </span>
              </td>
            </tr>
          ) : undefined
        }
        rowActions={(s) => (
          <Menu
            items={[
              { label: 'Abrir pedido', icon: <Eye />, onClick: () => nav(`/vendas/${s.id}`) },
              { label: 'Editar', icon: <Pencil />, hidden: !can('sales.edit') || !isEditable(s), onClick: () => nav(`/vendas/${s.id}/editar`) },
              { label: 'Aprovar', icon: <Check />, hidden: !can('sales.approve') || !['DRAFT', 'PENDING_APPROVAL'].includes(s.status), onClick: () => void approveOne.run(s) },
              { label: 'Duplicar pedido', icon: <CopyPlus />, hidden: !can('sales.create'), onClick: () => duplicate(s) },
              { label: 'PDF do pedido', icon: <FileText />, onClick: () => void pdfOne.run(s) },
              'divider',
              { label: 'Cancelar pedido', icon: <X />, danger: true, hidden: !can('sales.cancel') || ['CANCELLED', 'REJECTED'].includes(s.status), onClick: () => void askCancel(s) },
            ]}
          />
        )}
      />
      {status === 'PENDING_APPROVAL' && !pending.length && can('sales.approve') && (
        <p className="text-xs text-muted mt-3 flex items-center gap-1.5">
          <Badge tone="success">Tudo em dia</Badge> nenhum pedido aguardando aprovação.
        </p>
      )}
    </>
  );
}


/** Valor completo no desktop e abreviado no celular (cartões estreitos). */
function Short({ full, short }: { full: string; short: string }) {
  return (
    <>
      <span className="sm:hidden text-xl">{short}</span>
      <span className="hidden sm:inline">{full}</span>
    </>
  );
}
