/**
 * Ração: estoque (compras por NF), consumos por lote, visão por lote e tipos.
 */
import { ArrowDownCircle, Boxes, Download, Edit3, FileText, PackagePlus, Plus, Power, Tag, Trash2, Wheat } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOps, useSession } from '../../app/session';
import { useAction, useCrud, useTable } from '../../data/react';
import { addDays, date, daysBetween, integer, kg, matchesSearch, money, number, today } from '../../domain/format';
import type { FeedConsumption, FeedPurchase, FeedType } from '../../domain/types';
import {
  Badge,
  BarsChart,
  Button,
  Card,
  CardHeader,
  Combobox,
  DataTable,
  DateInput,
  EmptyState,
  exportCsv,
  Menu,
  PageHeader,
  Progress,
  SearchInput,
  Segmented,
  Stat,
  StatGrid,
  Tabs,
  Toolbar,
  useConfirm,
  toast,
  type Column,
} from '../../ui';
import { FeedConsumptionDrawer, FeedPurchaseDrawer, FeedTypeDrawer, PERIOD_LABELS } from './FeedForms';
import { daysOnFeed, isActiveBatch, prefixed } from './helpers';
import { useSmUp } from './Money';

type TabKey = 'estoque' | 'consumos' | 'lotes' | 'tipos';

export function FeedPage() {
  const { can } = useSession();
  const canEdit = can('cattle.manage');
  const { rows: purchases, loading } = useTable('feed_purchases');
  const sm = useSmUp();
  const { rows: consumptions } = useTable('feed_consumptions');
  const { rows: types } = useTable('feed_types');
  const { rows: batches } = useTable('batches');
  const [tab, setTab] = useState<TabKey>('estoque');
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [consume, setConsume] = useState<{ purchaseId?: string; batchId?: string } | null>(null);
  const [typeEdit, setTypeEdit] = useState<FeedType | null | 'new'>(null);

  const stats = useMemo(() => {
    const avail = purchases.filter((p) => p.status === 'AVAILABLE');
    const stockKg = avail.reduce((s, p) => s + p.remainingKg, 0);
    const stockValue = avail.reduce((s, p) => s + p.remainingKg * p.unitCost, 0);
    const from = addDays(today(), -30);
    const last30 = consumptions.filter((c) => c.date >= from);
    return {
      stockKg,
      stockValue,
      lastKg: last30.reduce((s, c) => s + c.quantityKg, 0),
      lastCost: last30.reduce((s, c) => s + c.cost, 0),
      feeding: new Set(last30.map((c) => c.batchId)).size,
      activeTypes: types.filter((t) => t.active).length,
    };
  }, [purchases, consumptions, types]);

  return (
    <>
      <PageHeader
        eyebrow="Gado"
        title="Ração"
        subtitle="Entrada de ração por nota fiscal, baixa por lote e custo lançado automaticamente no resultado."
        actions={
          canEdit ? (
            <>
              <Button icon={<ArrowDownCircle className="size-4" />} onClick={() => setConsume({})}>
                Registrar consumo
              </Button>
              <Button variant="primary" icon={<PackagePlus className="size-4" />} onClick={() => setPurchaseOpen(true)}>
                Entrada de NF
              </Button>
            </>
          ) : undefined
        }
      />

      <StatGrid cols={4} className="mb-5">
        <Stat label="Ração em estoque" value={kg(Math.round(stats.stockKg))} icon={sm && <Wheat className="size-4" />} hint={`≈ ${money(stats.stockValue)}`} />
        <Stat label="Consumo 30 dias" value={kg(Math.round(stats.lastKg))} icon={sm && <ArrowDownCircle className="size-4" />} tone="accent" hint={money(stats.lastCost)} />
        <Stat label="Lotes no trato" value={integer(stats.feeding)} icon={sm && <Boxes className="size-4" />} tone="info" hint="com consumo nos últimos 30 dias" />
        <Stat label="Tipos de ração" value={integer(stats.activeTypes)} icon={sm && <Tag className="size-4" />} tone="success" hint={`${types.length - stats.activeTypes} inativos`} />
      </StatGrid>

      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'estoque', label: 'Estoque', count: purchases.filter((p) => p.status === 'AVAILABLE').length },
          { value: 'consumos', label: 'Consumos', count: consumptions.length },
          { value: 'lotes', label: 'Por lote' },
          { value: 'tipos', label: 'Tipos de ração', count: types.length },
        ]}
      />

      {tab === 'estoque' && <StockTab purchases={purchases} batches={batches} loading={loading} canEdit={canEdit} onConsume={(purchaseId) => setConsume({ purchaseId })} onNew={() => setPurchaseOpen(true)} />}
      {tab === 'consumos' && <ConsumptionsTab consumptions={consumptions} canEdit={canEdit} />}
      {tab === 'lotes' && <ByBatchTab consumptions={consumptions} batches={batches} canEdit={canEdit} onConsume={(batchId) => setConsume({ batchId })} />}
      {tab === 'tipos' && <TypesTab types={types} purchases={purchases} canEdit={canEdit} onEdit={(t) => setTypeEdit(t)} />}

      {canEdit && (
        <>
          <FeedPurchaseDrawer open={purchaseOpen} onClose={() => setPurchaseOpen(false)} />
          <FeedConsumptionDrawer open={!!consume} onClose={() => setConsume(null)} purchaseId={consume?.purchaseId} batchId={consume?.batchId} />
          <FeedTypeDrawer open={typeEdit !== null} onClose={() => setTypeEdit(null)} type={typeEdit === 'new' ? null : typeEdit} />
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

function StockTab({
  purchases,
  batches,
  loading,
  canEdit,
  onConsume,
  onNew,
}: {
  purchases: FeedPurchase[];
  batches: { id: string; code: string }[];
  loading: boolean;
  canEdit: boolean;
  onConsume: (purchaseId: string) => void;
  onNew: () => void;
}) {
  const [filter, setFilter] = useState<'AVAILABLE' | 'DEPLETED' | 'ALL'>('AVAILABLE');
  const [q, setQ] = useState('');
  const code = useMemo(() => new Map(batches.map((b) => [b.id, b.code])), [batches]);
  const list = useMemo(
    () =>
      purchases
        .filter((p) => filter === 'ALL' || p.status === filter)
        .filter((p) => matchesSearch([p.invoiceNumber, p.feedTypeName, p.supplierName], q))
        .sort((a, b) => b.entryDate.localeCompare(a.entryDate)),
    [purchases, filter, q],
  );
  return (
    <>
      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar NF, ração, fornecedor…" className="sm:w-72" />
        <Segmented
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'AVAILABLE', label: 'Com saldo', count: purchases.filter((p) => p.status === 'AVAILABLE').length },
            { value: 'DEPLETED', label: 'Esgotadas', count: purchases.filter((p) => p.status === 'DEPLETED').length },
            { value: 'ALL', label: 'Todas', count: purchases.length },
          ]}
        />
      </Toolbar>
      {loading ? null : !list.length ? (
        <Card>
          <EmptyState
            icon={<Wheat className="size-5" />}
            title={purchases.length ? 'Nenhuma compra neste filtro' : 'Nenhuma ração em estoque'}
            description="Registre a entrada da nota fiscal de ração para começar a baixar nos lotes."
            action={
              canEdit && !purchases.length ? (
                <Button variant="primary" icon={<PackagePlus className="size-4" />} onClick={onNew}>
                  Entrada de NF
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => {
            const used = p.quantityKg - p.remainingKg;
            const pct = p.quantityKg ? (p.remainingKg / p.quantityKg) * 100 : 0;
            return (
              <Card key={p.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-muted inline-flex items-center gap-1.5 num">
                      <FileText className="size-3.5" /> {prefixed('NF', p.invoiceNumber)} · {date(p.entryDate)}
                    </div>
                    <h3 className="text-[15px] font-semibold text-fg truncate">{p.feedTypeName}</h3>
                    <div className="text-xs text-muted truncate">{p.supplierName || 'Fornecedor não informado'}</div>
                  </div>
                  <Badge tone={p.status === 'AVAILABLE' ? (pct < 15 ? 'warning' : 'success') : 'neutral'} dot>
                    {p.status === 'AVAILABLE' ? (pct < 15 ? 'Acabando' : 'Com saldo') : 'Esgotada'}
                  </Badge>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-lg font-semibold text-fg num">{kg(Math.round(p.remainingKg))}</span>
                    <span className="text-xs text-muted num">de {kg(Math.round(p.quantityKg))} · {number(pct, 0)}%</span>
                  </div>
                  <Progress value={p.remainingKg} max={p.quantityKg} tone={p.status === 'DEPLETED' ? 'neutral' : pct < 15 ? 'warning' : 'success'} />
                  <div className="text-xs text-muted num">Consumido {kg(Math.round(used))}</div>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-subtle uppercase tracking-wider text-[10px]">Valor da NF</dt>
                    <dd className="text-fg num">{money(p.totalValue)}</dd>
                  </div>
                  <div>
                    <dt className="text-subtle uppercase tracking-wider text-[10px]">Custo</dt>
                    <dd className="text-fg num">{money(p.unitCost)}/kg</dd>
                  </div>
                </dl>
                <div className="flex items-center justify-between gap-2 pt-3 border-t border-border mt-auto">
                  <span className="text-xs text-muted truncate">
                    {p.batchIds?.length ? `Lotes: ${p.batchIds.map((id) => code.get(id) || '?').join(', ')}` : 'Qualquer lote'}
                  </span>
                  {canEdit && p.status === 'AVAILABLE' && (
                    <Button size="xs" variant="subtle" icon={<ArrowDownCircle className="size-3.5" />} onClick={() => onConsume(p.id)}>
                      Dar baixa
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

function ConsumptionsTab({ consumptions, canEdit }: { consumptions: FeedConsumption[]; canEdit: boolean }) {
  const ops = useOps();
  const confirm = useConfirm();
  const [period, setPeriod] = useState<'ALL' | 'WEEKLY' | 'MONTHLY' | 'DAILY'>('ALL');
  const [batchId, setBatchId] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const batchOptions = useMemo(() => {
    const m = new Map<string, string>();
    consumptions.forEach((c) => m.set(c.batchId, c.batchName));
    return [...m].map(([value, label]) => ({ value, label })).sort((a, b) => b.label.localeCompare(a.label));
  }, [consumptions]);
  const list = useMemo(
    () =>
      consumptions
        .filter((c) => period === 'ALL' || c.period === period)
        .filter((c) => !batchId || c.batchId === batchId)
        .filter((c) => (!from || c.date >= from) && (!to || c.date <= to)),
    [consumptions, period, batchId, from, to],
  );
  const totKg = list.reduce((s, c) => s + c.quantityKg, 0);
  const totCost = list.reduce((s, c) => s + c.cost, 0);

  const removeOp = useAction((c: FeedConsumption) => ops.removeFeedConsumption(c.id), { success: 'Consumo removido e saldo devolvido' });
  const remove = async (c: FeedConsumption) => {
    if (await confirm({ title: `Remover consumo de ${kg(c.quantityKg)}?`, message: `${c.feedTypeName} · ${c.batchName}. O saldo volta para a compra e o custo sai do lote.`, danger: true, confirmLabel: 'Remover' }))
      await removeOp.run(c);
  };

  const columns: Column<FeedConsumption>[] = [
    { key: 'date', header: 'Data', sortValue: (c) => c.date, cell: (c) => <span className="num">{date(c.date)}</span> },
    { key: 'batch', header: 'Lote', mobile: 'title', sortValue: (c) => c.batchName, cell: (c) => <Link to={`/gado/lotes/${c.batchId}?aba=racao`} className="hover:text-primary truncate block max-w-[260px]" onClick={(e) => e.stopPropagation()}>{c.batchName}</Link> },
    { key: 'type', header: 'Ração', mobile: 'subtitle', sortValue: (c) => c.feedTypeName, cell: (c) => c.feedTypeName },
    { key: 'period', header: 'Período', hideBelow: 'md', cell: (c) => <Badge size="xs">{PERIOD_LABELS[c.period]}</Badge> },
    { key: 'qty', header: 'Quantidade', align: 'right', sortValue: (c) => c.quantityKg, cell: (c) => kg(c.quantityKg) },
    { key: 'cost', header: 'Custo', align: 'right', mobile: 'badge', sortValue: (c) => c.cost, cell: (c) => money(c.cost) },
    { key: 'by', header: 'Por', hideBelow: 'xl', cell: (c) => c.createdByName || '—' },
  ];

  return (
    <>
      <Toolbar>
        <Combobox value={batchId} onChange={setBatchId} options={batchOptions} allowClear placeholder="Todos os lotes" className="sm:w-72" />
        <Segmented
          size="sm"
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'ALL', label: 'Todos' },
            { value: 'WEEKLY', label: 'Semanal' },
            { value: 'MONTHLY', label: 'Mensal' },
            { value: 'DAILY', label: 'Diário' },
          ]}
        />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <DateInput value={from} onChange={setFrom} aria-label="De" className="sm:w-40" />
          <DateInput value={to} onChange={setTo} aria-label="Até" className="sm:w-40" />
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="lg:ml-auto"
          icon={<Download className="size-4" />}
          onClick={() =>
            exportCsv('consumo-racao', list, [
              { header: 'Data', value: (c) => date(c.date) },
              { header: 'Lote', value: (c) => c.batchName },
              { header: 'Ração', value: (c) => c.feedTypeName },
              { header: 'Período', value: (c) => PERIOD_LABELS[c.period] },
              { header: 'Quantidade (kg)', value: (c) => c.quantityKg },
              { header: 'Custo', value: (c) => c.cost },
              { header: 'Lançado por', value: (c) => c.createdByName },
            ])
          }
        >
          CSV
        </Button>
      </Toolbar>
      <DataTable
        columns={columns}
        rows={list}
        rowKey={(c) => c.id}
        initialSort={{ key: 'date', dir: 'desc' }}
        emptyTitle="Nenhum consumo encontrado"
        emptyDescription="Ajuste os filtros ou registre um consumo."
        footer={
          <tr>
            <td className="px-3 first:pl-4 py-2.5 text-sm" colSpan={3}>
              {integer(list.length)} baixas
            </td>
            <td className="hidden md:table-cell" />
            <td className="px-3 py-2.5 text-sm text-right num">{kg(Math.round(totKg))}</td>
            <td className="px-3 py-2.5 text-sm text-right num">{money(totCost)}</td>
            <td className="hidden xl:table-cell" />
            {canEdit && <td />}
          </tr>
        }
        rowActions={canEdit ? (c) => <Menu items={[{ label: 'Remover consumo', icon: <Trash2 />, danger: true, onClick: () => void remove(c) }]} /> : undefined}
      />
    </>
  );
}

// ---------------------------------------------------------------------------

interface BatchFeedRow {
  id: string;
  code: string;
  name: string;
  active: boolean;
  heads: number;
  days: number;
  kg: number;
  cost: number;
  last: string;
}

function ByBatchTab({
  consumptions,
  batches,
  canEdit,
  onConsume,
}: {
  consumptions: FeedConsumption[];
  batches: import('../../domain/types').Batch[];
  canEdit: boolean;
  onConsume: (batchId: string) => void;
}) {
  const rows = useMemo<BatchFeedRow[]>(() => {
    const m = new Map<string, { kg: number; cost: number; last: string; first: string }>();
    for (const c of consumptions) {
      const cur = m.get(c.batchId) || { kg: 0, cost: 0, last: c.date, first: c.date };
      cur.kg += c.quantityKg;
      cur.cost += c.cost;
      if (c.date > cur.last) cur.last = c.date;
      if (c.date < cur.first) cur.first = c.date;
      m.set(c.batchId, cur);
    }
    return batches
      .filter((b) => m.has(b.id) || isActiveBatch(b))
      .map((b) => {
        const v = m.get(b.id) || { kg: 0, cost: 0, last: '', first: '' };
        return {
          id: b.id,
          code: b.code,
          name: b.name,
          active: isActiveBatch(b),
          heads: b.headCount || 0,
          days: v.first ? Math.max(1, daysBetween(v.first, b.slaughterDate || today()) + 1) : daysOnFeed(b) || 0,
          kg: v.kg,
          cost: v.cost,
          last: v.last,
        };
      });
  }, [consumptions, batches]);
  const chart = rows.filter((r) => r.cost > 0).sort((a, b) => b.cost - a.cost).slice(0, 10).map((r) => ({ lote: r.code, custo: Math.round(r.cost * 100) / 100 }));

  const columns: Column<BatchFeedRow>[] = [
    {
      key: 'code',
      header: 'Lote',
      mobile: 'title',
      sortValue: (r) => r.code,
      cell: (r) => (
        <div className="min-w-0">
          <div className="text-fg truncate">{r.name}</div>
          <div className="text-xs text-muted num">{r.code}</div>
        </div>
      ),
    },
    { key: 'kg', header: 'Consumido', align: 'right', sortValue: (r) => r.kg, cell: (r) => kg(Math.round(r.kg)) },
    { key: 'cost', header: 'Custo', align: 'right', mobile: 'badge', sortValue: (r) => r.cost, cell: (r) => money(r.cost) },
    { key: 'avg', header: 'R$/kg', align: 'right', hideBelow: 'md', sortValue: (r) => (r.kg ? r.cost / r.kg : 0), cell: (r) => (r.kg ? money(r.cost / r.kg) : '—') },
    {
      key: 'perHead',
      header: 'kg/cab/dia',
      align: 'right',
      hideBelow: 'md',
      sortValue: (r) => (r.heads && r.days ? r.kg / r.heads / r.days : 0),
      cell: (r) => (r.heads && r.days && r.kg ? number(r.kg / r.heads / r.days, 2) : '—'),
    },
    { key: 'last', header: 'Última baixa', hideBelow: 'lg', sortValue: (r) => r.last, cell: (r) => <span className="num">{r.last ? date(r.last) : '—'}</span> },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        initialSort={{ key: 'cost', dir: 'desc' }}
        emptyTitle="Nenhum lote com ração"
        rowActions={
          canEdit
            ? (r) =>
                r.active ? (
                  <Button size="xs" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => onConsume(r.id)}>
                    Baixa
                  </Button>
                ) : null
            : undefined
        }
      />
      <Card className="min-w-0">
        <CardHeader title="Custo de ração por lote" subtitle="10 maiores" />
        {chart.length ? <BarsChart data={chart} xKey="lote" series={[{ key: 'custo', name: 'Custo' }]} layout="vertical" height={Math.max(160, chart.length * 40)} format={money} axisFormat={(v) => `${Math.round(v / 1000)} mil`} /> : <p className="text-sm text-muted py-6 text-center">Sem consumo registrado.</p>}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function TypesTab({ types, purchases, canEdit, onEdit }: { types: FeedType[]; purchases: FeedPurchase[]; canEdit: boolean; onEdit: (t: FeedType | 'new') => void }) {
  const crud = useCrud('feed_types');
  const confirm = useConfirm();
  const usage = useMemo(() => {
    const m = new Map<string, { n: number; kg: number; stock: number }>();
    purchases.forEach((p) => {
      const c = m.get(p.feedTypeId) || { n: 0, kg: 0, stock: 0 };
      c.n++;
      c.kg += p.quantityKg;
      if (p.status === 'AVAILABLE') c.stock += p.remainingKg;
      m.set(p.feedTypeId, c);
    });
    return m;
  }, [purchases]);
  const toggle = useAction((t: FeedType) => crud.update(t.id, { active: !t.active }), { success: 'Tipo de ração atualizado' });
  const removeOp = useAction((t: FeedType) => crud.remove(t.id), { success: 'Tipo de ração excluído' });
  const remove = async (t: FeedType) => {
    if (usage.has(t.id)) return toast.info('Este tipo já tem compras registradas — desative-o para esconder das listas.');
    if (await confirm({ title: `Excluir ${t.name}?`, danger: true, confirmLabel: 'Excluir' })) await removeOp.run(t);
  };
  const columns: Column<FeedType>[] = [
    {
      key: 'name',
      header: 'Ração',
      mobile: 'title',
      sortValue: (t) => t.name,
      cell: (t) => (
        <div className="min-w-0">
          <div className="text-fg font-medium truncate">{t.name}</div>
          {t.description && <div className="text-xs text-muted truncate max-w-[360px]">{t.description}</div>}
        </div>
      ),
    },
    { key: 'n', header: 'Compras', align: 'right', sortValue: (t) => usage.get(t.id)?.n || 0, cell: (t) => integer(usage.get(t.id)?.n || 0) },
    { key: 'stock', header: 'Em estoque', align: 'right', sortValue: (t) => usage.get(t.id)?.stock || 0, cell: (t) => kg(Math.round(usage.get(t.id)?.stock || 0)) },
    { key: 'status', header: 'Situação', mobile: 'badge', cell: (t) => <Badge tone={t.active ? 'success' : 'neutral'} dot>{t.active ? 'Ativo' : 'Inativo'}</Badge> },
  ];
  return (
    <>
      {canEdit && (
        <Toolbar>
          <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => onEdit('new')}>
            Novo tipo
          </Button>
        </Toolbar>
      )}
      <DataTable
        columns={columns}
        rows={types}
        rowKey={(t) => t.id}
        initialSort={{ key: 'name', dir: 'asc' }}
        onRowClick={canEdit ? (t) => onEdit(t) : undefined}
        emptyTitle="Nenhum tipo de ração"
        emptyDescription="Cadastre as rações e suplementos usados (proteinado, sal mineral, silagem…)."
        rowActions={
          canEdit
            ? (t) => (
                <Menu
                  items={[
                    { label: 'Editar', icon: <Edit3 />, onClick: () => onEdit(t) },
                    { label: t.active ? 'Desativar' : 'Ativar', icon: <Power />, onClick: () => void toggle.run(t) },
                    'divider',
                    { label: 'Excluir', icon: <Trash2 />, danger: true, onClick: () => void remove(t) },
                  ]}
                />
              )
            : undefined
        }
      />
    </>
  );
}
