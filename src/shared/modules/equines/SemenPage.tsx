/**
 * Banco de sêmen: compras (com parcelas), coletas próprias e histórico de uso.
 */
import { AlarmClock, Droplets, Eye, FileDown, Plus, Receipt, Snowflake, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '../../app/session';
import { useTable } from '../../data/react';
import { addDays, date, daysBetween, integer, matchesSearch, money, today } from '../../domain/format';
import type { EquineEvent, FinancialEntry, SemenPurchase } from '../../domain/types';
import { Badge, Button, Callout, DataTable, Menu, PageHeader, Progress, SearchInput, Segmented, Stat, StatGrid, StatusBadge, Toolbar, type Column } from '../../ui';
import { ENTRY_STATUS, entryBalance, entryStatus, SEMEN_STATUS, SEMEN_STORAGE, semenStatus, str, type SemenStatus } from './model';
import { MoneyValue, useSmUp } from './parts';
import { exportSemenPdf } from './pdf';
import { PurchaseDetail } from './semen/PurchaseDetail';
import { PurchaseDrawer } from './semen/PurchaseDrawer';
import { UseDosesModal, type CollectionUsage, type DoseSource } from './semen/UseDosesModal';

type View = 'compras' | 'coletas' | 'parcelas' | 'uso';
const EXPIRING_DAYS = 60;

function ExpiryCell({ iso, balance }: { iso?: string | null; balance: number }) {
  if (!iso) return <span className="text-subtle">Sem validade</span>;
  const d = daysBetween(today(), iso);
  return (
    <span className="inline-flex flex-col">
      <span className="num">{date(iso)}</span>
      {balance > 0 && d < 0 && <span className="text-[11px] text-danger">vencido há {-d} dias</span>}
      {balance > 0 && d >= 0 && d <= EXPIRING_DAYS && <span className="text-[11px] text-warning">vence em {d} dias</span>}
    </span>
  );
}

export function SemenPage() {
  const { can } = useSession();
  const canEdit = can('equines.manage');
  const nav = useNavigate();
  const sm = useSmUp();
  const { rows: purchases, loading } = useTable('semen_purchases');
  const { rows: entries } = useTable('financial_entries', { where: [['category', '==', 'SEMEN']] });
  const { rows: collections } = useTable('equine_events', { where: [['type', '==', 'SEMEN_COLLECTION']] });

  const [view, setView] = useState<View>('compras');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<SemenStatus | 'ALL'>('ALL');
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [using, setUsing] = useState<DoseSource | null>(null);

  const semenEntries = useMemo(() => entries.filter((e) => e.semenPurchaseId), [entries]);

  const kpi = useMemo(() => {
    const t = today();
    const limit = addDays(t, EXPIRING_DAYS);
    const activeP = purchases.filter((p) => semenStatus(p) === 'ACTIVE');
    const ownAvail = collections.filter((c) => !c.data.expiryDate || str(c.data.expiryDate) >= t).reduce((s, c) => s + (Number(c.data.dosesAvailable) || 0), 0);
    const bought = activeP.reduce((s, p) => s + p.dosesAvailable, 0);
    const expP = purchases.filter((p) => p.status === 'ACTIVE' && p.dosesAvailable > 0 && p.expiryDate && p.expiryDate <= limit);
    const expC = collections.filter((c) => Number(c.data.dosesAvailable) > 0 && c.data.expiryDate && str(c.data.expiryDate) <= limit);
    const expiring = expP.reduce((s, p) => s + p.dosesAvailable, 0) + expC.reduce((s, c) => s + (Number(c.data.dosesAvailable) || 0), 0);
    const expired = expP.filter((p) => (p.expiryDate as string) < t).length + expC.filter((c) => str(c.data.expiryDate) < t).length;
    const live = purchases.filter((p) => p.status !== 'CANCELLED');
    const openEntries = semenEntries.filter((e) => e.status === 'OPEN');
    return {
      available: bought + ownAvail,
      bought,
      ownAvail,
      expiring,
      expired,
      invested: live.reduce((s, p) => s + p.totalValue, 0),
      purchases: live.length,
      open: openEntries.reduce((s, e) => s + entryBalance(e), 0),
      openCount: openEntries.length,
      overdue: openEntries.filter((e) => e.dueDate < t).reduce((s, e) => s + entryBalance(e), 0),
    };
  }, [purchases, collections, semenEntries]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: purchases.length };
    purchases.forEach((p) => (c[semenStatus(p)] = (c[semenStatus(p)] || 0) + 1));
    return c;
  }, [purchases]);

  const filteredPurchases = useMemo(
    () =>
      purchases
        .filter((p) => status === 'ALL' || semenStatus(p) === status)
        .filter((p) => matchesSearch([p.stallionName, p.stallionBreed, p.stallionRegistry, p.supplierName, p.invoiceNumber, p.lotCode, p.canister, p.intendedMares], q)),
    [purchases, status, q],
  );
  const filteredCollections = useMemo(() => collections.filter((c) => matchesSearch([c.equineName, c.title, str(c.data.canister), str(c.data.destinationMares)], q)), [collections, q]);
  const filteredEntries = useMemo(() => semenEntries.filter((e) => matchesSearch([e.description, e.partyName, e.documentNumber], q)), [semenEntries, q]);

  const usage = useMemo(() => {
    const rows: { key: string; date: string; stallion: string; origin: string; doses: number; mare: string; notes: string }[] = [];
    purchases.forEach((p) =>
      (p.usage || []).forEach((u, i) =>
        rows.push({ key: `${p.id}-${i}`, date: u.date, stallion: p.stallionName, origin: `Compra · ${p.supplierName}`, doses: u.doses, mare: u.mareName || '', notes: u.notes || '' }),
      ),
    );
    collections.forEach((c) =>
      (Array.isArray(c.data.usage) ? (c.data.usage as CollectionUsage[]) : []).forEach((u, i) =>
        rows.push({ key: `${c.id}-${i}`, date: u.date, stallion: c.equineName, origin: `Coleta própria de ${date(c.date)}`, doses: u.doses, mare: u.mareName || '', notes: u.notes || '' }),
      ),
    );
    return rows.filter((r) => matchesSearch([r.stallion, r.mare, r.notes, r.origin], q));
  }, [purchases, collections, q]);

  const detail = purchases.find((p) => p.id === detailId) || null;

  const purchaseCols: Column<SemenPurchase>[] = [
    {
      key: 'stallion',
      header: 'Garanhão',
      mobile: 'title',
      sortValue: (p) => p.stallionName,
      cell: (p) => (
        <div className="min-w-0">
          <div className="font-medium text-fg truncate">{p.stallionName}</div>
          <div className="text-xs text-muted truncate">{[p.stallionBreed, p.stallionRegistry].filter(Boolean).join(' · ') || '—'}</div>
        </div>
      ),
    },
    { key: 'supplier', header: 'Fornecedor', mobile: 'subtitle', sortValue: (p) => p.supplierName, cell: (p) => <span className="truncate">{p.supplierName}</span>, hideBelow: 'lg' },
    { key: 'date', header: 'Compra', sortValue: (p) => p.purchaseDate, cell: (p) => <span className="num">{date(p.purchaseDate)}</span>, hideBelow: 'md' },
    {
      key: 'doses',
      header: 'Doses',
      sortValue: (p) => p.dosesAvailable,
      cell: (p) => (
        <div className="min-w-[88px]">
          <div className="num text-sm">
            <span className="font-semibold text-fg">{p.dosesAvailable}</span>
            <span className="text-muted"> / {p.dosesQuantity}</span>
          </div>
          <Progress value={p.dosesAvailable} max={p.dosesQuantity} tone={semenStatus(p) === 'EXPIRED' ? 'danger' : 'info'} className="mt-1 max-sm:hidden" />
        </div>
      ),
    },
    {
      key: 'storage',
      header: 'Armazenamento',
      hideBelow: 'xl',
      cell: (p) => (
        <div className="min-w-0">
          <div className="text-sm">{SEMEN_STORAGE[p.storageType]}</div>
          {p.canister && <div className="text-xs text-muted">{p.canister}</div>}
        </div>
      ),
    },
    { key: 'expiry', header: 'Validade', sortValue: (p) => p.expiryDate || '9999', cell: (p) => <ExpiryCell iso={p.expiryDate} balance={p.status === 'ACTIVE' ? p.dosesAvailable : 0} /> },
    { key: 'value', header: 'Valor', align: 'right', sortValue: (p) => p.totalValue, cell: (p) => <span className="num">{money(p.totalValue)}</span>, hideBelow: 'md' },
    { key: 'status', header: 'Situação', mobile: 'badge', sortValue: (p) => semenStatus(p), cell: (p) => <StatusBadge info={SEMEN_STATUS[semenStatus(p)]} /> },
  ];

  const collectionCols: Column<EquineEvent>[] = [
    {
      key: 'stallion',
      header: 'Garanhão',
      mobile: 'title',
      sortValue: (c) => c.equineName,
      cell: (c) => (
        <Link to={`/equinos/${c.equineId}?aba=reproducao`} className="font-medium text-fg hover:text-primary" onClick={(e) => e.stopPropagation()}>
          {c.equineName}
        </Link>
      ),
    },
    { key: 'date', header: 'Coleta', mobile: 'subtitle', sortValue: (c) => c.date, cell: (c) => <span className="num">{date(c.date)}</span> },
    {
      key: 'doses',
      header: 'Doses disp. / prod.',
      sortValue: (c) => Number(c.data.dosesAvailable) || 0,
      cell: (c) => (
        <span className="num">
          <span className="font-semibold text-fg">{str(c.data.dosesAvailable) || '0'}</span>
          <span className="text-muted"> / {str(c.data.dosesProduced) || '—'}</span>
        </span>
      ),
    },
    { key: 'mot', header: 'Motilidade', align: 'right', cell: (c) => <span className="num">{c.data.motility ? `${c.data.motility}%` : '—'}</span> },
    { key: 'vig', header: 'Vigor', align: 'right', hideBelow: 'md', cell: (c) => <span className="num">{str(c.data.vigor) || '—'}</span> },
    { key: 'canister', header: 'Botijão', hideBelow: 'lg', cell: (c) => str(c.data.canister) || '—' },
    { key: 'expiry', header: 'Validade', sortValue: (c) => str(c.data.expiryDate) || '9999', cell: (c) => <ExpiryCell iso={str(c.data.expiryDate) || null} balance={Number(c.data.dosesAvailable) || 0} /> },
  ];

  const entryCols: Column<FinancialEntry>[] = [
    {
      key: 'desc',
      header: 'Compra',
      mobile: 'title',
      sortValue: (e) => e.description,
      cell: (e) => (
        <div className="min-w-0">
          <div className="text-fg truncate">{e.description}</div>
          <div className="text-xs text-muted truncate">{e.partyName}</div>
        </div>
      ),
    },
    { key: 'n', header: 'Parcela', cell: (e) => <span className="num">{`${e.installment}/${e.installments}`}</span> },
    { key: 'due', header: 'Vencimento', mobile: 'subtitle', sortValue: (e) => e.dueDate, cell: (e) => <span className="num">{date(e.dueDate)}</span> },
    { key: 'amount', header: 'Valor', align: 'right', sortValue: (e) => e.amount, cell: (e) => <span className="num">{money(e.amount)}</span> },
    { key: 'paid', header: 'Pago', align: 'right', hideBelow: 'md', cell: (e) => <span className="num">{money(e.paidAmount)}</span> },
    { key: 'status', header: 'Situação', mobile: 'badge', sortValue: (e) => entryStatus(e), cell: (e) => <StatusBadge info={ENTRY_STATUS[entryStatus(e)]} /> },
  ];

  type UsageRow = (typeof usage)[number];
  const usageCols: Column<UsageRow>[] = [
    { key: 'date', header: 'Data', mobile: 'subtitle', sortValue: (r) => r.date, cell: (r) => <span className="num">{date(r.date)}</span> },
    { key: 'stallion', header: 'Garanhão', mobile: 'title', sortValue: (r) => r.stallion, cell: (r) => <span className="font-medium text-fg">{r.stallion}</span> },
    { key: 'mare', header: 'Égua', sortValue: (r) => r.mare, cell: (r) => r.mare || <span className="text-subtle">Não informada</span> },
    { key: 'doses', header: 'Doses', align: 'right', mobile: 'badge', sortValue: (r) => r.doses, cell: (r) => <Badge tone="info">{r.doses}</Badge> },
    { key: 'origin', header: 'Origem', hideBelow: 'md', cell: (r) => <span className="text-muted">{r.origin}</span> },
    { key: 'notes', header: 'Observações', hideBelow: 'lg', cell: (r) => r.notes || '—' },
  ];

  return (
    <>
      <PageHeader
        back="/equinos"
        eyebrow="Equinos"
        title="Banco de sêmen"
        subtitle="Compras de sêmen, coletas próprias, doses disponíveis, validade e parcelas."
        actions={
          <>
            <Button icon={<FileDown className="size-4" />} onClick={() => exportSemenPdf(purchases, collections)} disabled={!purchases.length && !collections.length}>
              PDF
            </Button>
            {canEdit && (
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
                Nova compra
              </Button>
            )}
          </>
        }
      />

      <StatGrid cols={4} className="mb-5">
        <Stat label="Doses disponíveis" icon={sm && <Droplets className="size-4" />} value={integer(kpi.available)} hint={`${kpi.bought} compradas · ${kpi.ownAvail} coletas próprias`} />
        <Stat
          label="Vencendo"
          tone={kpi.expired ? 'danger' : kpi.expiring ? 'warning' : 'success'}
          icon={sm && <AlarmClock className="size-4" />}
          value={integer(kpi.expiring)}
          hint={kpi.expired ? `${kpi.expired} lote(s) já vencido(s)` : `Doses com validade em ${EXPIRING_DAYS} dias`}
        />
        <Stat label="Valor investido" tone="accent" icon={sm && <Wallet className="size-4" />} value={<MoneyValue value={kpi.invested} />} hint={`${kpi.purchases} compra(s)`} />
        <Stat
          label="Parcelas em aberto"
          tone={kpi.overdue ? 'danger' : 'info'}
          icon={sm && <Receipt className="size-4" />}
          value={<MoneyValue value={kpi.open} />}
          hint={kpi.overdue ? `${money(kpi.overdue)} vencido` : `${kpi.openCount} parcela(s)`}
          onClick={() => setView('parcelas')}
        />
      </StatGrid>

      {kpi.expired > 0 && (
        <Callout tone="warning" className="mb-5" title="Há sêmen vencido com doses em estoque">
          Confira os lotes marcados como vencidos e dê baixa das doses descartadas.
        </Callout>
      )}

      <Toolbar>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'compras', label: 'Compras', count: purchases.length },
            { value: 'coletas', label: 'Coletas próprias', count: collections.length },
            { value: 'parcelas', label: 'Parcelas', count: semenEntries.length },
            { value: 'uso', label: 'Uso de doses', count: usage.length },
          ]}
        />
        <SearchInput value={q} onChange={setQ} placeholder="Buscar garanhão, égua…" className="sm:w-72" />
        {view === 'compras' && (
          <Segmented
            size="sm"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'ALL', label: 'Todas', count: counts.ALL || 0 },
              { value: 'ACTIVE', label: 'Com saldo', count: counts.ACTIVE || 0 },
              { value: 'EXPIRED', label: 'Vencidas', count: counts.EXPIRED || 0 },
              { value: 'DEPLETED', label: 'Esgotadas', count: counts.DEPLETED || 0 },
            ]}
          />
        )}
      </Toolbar>

      {view === 'compras' && (
        <DataTable
          columns={purchaseCols}
          rows={filteredPurchases}
          rowKey={(p) => p.id}
          loading={loading}
          initialSort={{ key: 'expiry', dir: 'asc' }}
          onRowClick={(p) => setDetailId(p.id)}
          emptyTitle={purchases.length ? 'Nenhuma compra encontrada' : 'Nenhuma compra de sêmen ainda'}
          emptyDescription={purchases.length ? 'Ajuste a busca ou o filtro.' : 'Registre a primeira compra — as parcelas vão direto para o contas a pagar.'}
          rowActions={(p) => (
            <Menu
              items={[
                {
                  label: semenStatus(p) === 'EXPIRED' ? 'Dar baixa (descarte)' : 'Usar doses',
                  icon: <Droplets />,
                  onClick: () => setUsing({ kind: 'purchase', purchase: p }),
                  hidden: !canEdit || p.status !== 'ACTIVE' || p.dosesAvailable <= 0,
                },
                { label: 'Ver detalhes', icon: <Eye />, onClick: () => setDetailId(p.id) },
              ]}
            />
          )}
        />
      )}

      {view === 'coletas' && (
        <DataTable
          columns={collectionCols}
          rows={filteredCollections}
          rowKey={(c) => c.id}
          initialSort={{ key: 'date', dir: 'desc' }}
          onRowClick={(c) => nav(`/equinos/${c.equineId}?aba=reproducao`)}
          emptyTitle="Nenhuma coleta própria"
          emptyDescription="Registre coletas na ficha do garanhão (aba Reprodução)."
          rowActions={
            canEdit
              ? (c) => (
                  <Menu
                    items={[
                      { label: 'Usar doses', icon: <Droplets />, onClick: () => setUsing({ kind: 'collection', event: c }), disabled: !(Number(c.data.dosesAvailable) > 0) },
                      { label: 'Abrir ficha do garanhão', icon: <Snowflake />, onClick: () => nav(`/equinos/${c.equineId}?aba=reproducao`) },
                    ]}
                  />
                )
              : undefined
          }
        />
      )}

      {view === 'parcelas' && (
        <>
          {can('finance.view') && (
            <p className="mb-3 text-xs text-muted">
              A baixa (pagamento) das parcelas é feita no{' '}
              <Link to="/financeiro" className="text-primary hover:underline">
                Financeiro → Contas
              </Link>
              .
            </p>
          )}
          <DataTable
            columns={entryCols}
            rows={filteredEntries}
            rowKey={(e) => e.id}
            initialSort={{ key: 'due', dir: 'asc' }}
            onRowClick={(e) => e.semenPurchaseId && setDetailId(e.semenPurchaseId)}
            emptyTitle="Nenhuma parcela"
            emptyDescription="As parcelas aparecem aqui quando uma compra de sêmen é registrada."
          />
        </>
      )}

      {view === 'uso' && (
        <DataTable
          columns={usageCols}
          rows={usage}
          rowKey={(r) => r.key}
          initialSort={{ key: 'date', dir: 'desc' }}
          emptyTitle="Nenhum uso registrado"
          emptyDescription="Use “Usar doses” em uma compra ou coleta para registrar inseminações."
        />
      )}

      <PurchaseDrawer open={creating} onClose={() => setCreating(false)} />
      <PurchaseDetail
        purchase={detail}
        entries={semenEntries}
        canEdit={canEdit}
        onClose={() => setDetailId(null)}
        onUse={(p) => {
          setDetailId(null);
          setUsing({ kind: 'purchase', purchase: p });
        }}
      />
      <UseDosesModal source={using} onClose={() => setUsing(null)} />
    </>
  );
}
