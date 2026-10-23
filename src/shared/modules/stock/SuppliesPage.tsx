/**
 * Materiais (embalagens, etiquetas, sacolas…): cadastro, saldo, movimentação e consumo em pedidos.
 */
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Boxes, Download, Edit3, Plus, Power, ShoppingBag, SlidersHorizontal, Trash2, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSession } from '../../app/session';
import { useAction, useCrud, useTable } from '../../data/react';
import { addDays, date, matchesSearch, money, moneyCompact, today } from '../../domain/format';
import type { SupplyItem, SupplyMovement } from '../../domain/types';
import {
  Badge,
  Button,
  Callout,
  DataTable,
  DateInput,
  exportCsv,
  Field,
  Menu,
  PageHeader,
  SearchInput,
  Segmented,
  Select,
  Stat,
  StatGrid,
  Tabs,
  Toolbar,
  useConfirm,
  type Column,
} from '../../ui';
import { FitValue } from './pickingUi';
import { EMPTY_SUPPLY, SUPPLY_CATEGORY_LABELS, SupplyDrawer, SupplyMovementModal, supplyQty, type MoveDraft, type SupplyDraft } from './SupplyForms';

type Tab = 'items' | 'history' | 'sold';
const isLow = (s: SupplyItem) => s.active && s.minQuantity != null && s.minQuantity > 0 && s.quantity < s.minQuantity;

export function SuppliesPage() {
  const { can } = useSession();
  const canManage = can('supplies.manage');
  const { rows, loading } = useTable('supply_items');
  const { rows: moves, loading: loadingMoves } = useTable('supply_movements');
  const crud = useCrud('supply_items');
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>('items');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<SupplyItem['category'] | ''>('');
  const [filter, setFilter] = useState<'ACTIVE' | 'LOW' | 'SELLABLE' | 'ALL'>('ACTIVE');
  const [draft, setDraft] = useState<SupplyDraft | null>(null);
  const [move, setMove] = useState<MoveDraft | null>(null);

  const low = useMemo(() => rows.filter(isLow), [rows]);
  const filtered = useMemo(
    () =>
      rows
        .filter((s) => (filter === 'ALL' ? true : filter === 'LOW' ? isLow(s) : filter === 'SELLABLE' ? s.sellable && s.active : s.active))
        .filter((s) => !category || s.category === category)
        .filter((s) => matchesSearch([s.name, s.sku, s.supplier], q)),
    [rows, filter, category, q],
  );
  const stockValue = rows.filter((s) => s.active).reduce((sum, s) => sum + Math.max(0, s.quantity) * (s.unitCost || 0), 0);
  const monthOut = moves.filter((m) => m.type === 'OUT' && m.date >= addDays(today(), -30)).reduce((s, m) => s + (m.totalValue || 0), 0);

  const openMove = (item: SupplyItem, type: MoveDraft['type']) =>
    setMove({ item, type, quantity: type === 'ADJUST' ? item.quantity : null, unitCost: item.unitCost ?? null, date: today(), reason: '', invoiceNumber: '', supplier: item.supplier || '' });

  const toggle = useAction((s: SupplyItem) => crud.update(s.id, { active: !s.active }), { success: 'Status atualizado' });
  const remove = useAction(async (s: SupplyItem) => {
    if (moves.some((m) => m.supplyItemId === s.id)) throw new Error('Este material tem movimentações — desative em vez de excluir.');
    if (await confirm({ title: `Excluir ${s.name}?`, message: 'Esta ação não pode ser desfeita.', danger: true, confirmLabel: 'Excluir' })) await crud.remove(s.id);
  });

  const columns: Column<SupplyItem>[] = [
    {
      key: 'name',
      header: 'Material',
      mobile: 'title',
      sortValue: (s) => s.name,
      cell: (s) => (
        <div className="min-w-0">
          <div className="font-medium text-fg truncate">{s.name}</div>
          <div className="text-xs text-muted truncate">
            {SUPPLY_CATEGORY_LABELS[s.category]}
            {s.sku ? ` · ${s.sku}` : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'qty',
      header: 'Saldo',
      align: 'right',
      sortValue: (s) => s.quantity,
      cell: (s) => <span className={isLow(s) ? 'text-danger font-semibold whitespace-nowrap' : 'font-medium text-fg whitespace-nowrap'}>{supplyQty(s.quantity, s.unit)}</span>,
    },
    { key: 'min', header: 'Mínimo', align: 'right', hideBelow: 'md', sortValue: (s) => s.minQuantity || 0, cell: (s) => (s.minQuantity ? supplyQty(s.minQuantity, s.unit) : '—') },
    { key: 'cost', header: 'Custo', align: 'right', hideBelow: 'md', sortValue: (s) => s.unitCost || 0, cell: (s) => (s.unitCost != null ? money(s.unitCost) : '—') },
    { key: 'price', header: 'Venda', align: 'right', hideBelow: 'lg', sortValue: (s) => s.salePrice || 0, cell: (s) => (s.sellable && s.salePrice != null ? money(s.salePrice) : '—') },
    { key: 'supplier', header: 'Fornecedor', hideBelow: 'xl', cell: (s) => <span className="text-muted text-xs">{s.supplier || '—'}</span> },
    {
      key: 'status',
      header: 'Situação',
      mobile: 'badge',
      sortValue: (s) => (isLow(s) ? 0 : 1),
      cell: (s) => (
        <span className="inline-flex gap-1 flex-wrap">
          {!s.active ? (
            <Badge size="xs">Inativo</Badge>
          ) : isLow(s) ? (
            <Badge tone="danger" size="xs">
              Abaixo do mínimo
            </Badge>
          ) : (
            <Badge tone="success" size="xs" dot>
              OK
            </Badge>
          )}
          {s.sellable && (
            <Badge tone="accent" size="xs">
              Vendável
            </Badge>
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Estoque"
        title="Materiais"
        subtitle="Embalagens, etiquetas, sacolas e insumos — saldo, mínimo e consumo."
        actions={
          <>
            <Button
              icon={<Download className="size-4" />}
              onClick={() =>
                exportCsv(`materiais-${today()}`, filtered, [
                  { header: 'Material', value: (s) => s.name },
                  { header: 'SKU', value: (s) => s.sku },
                  { header: 'Categoria', value: (s) => SUPPLY_CATEGORY_LABELS[s.category] },
                  { header: 'Unidade', value: (s) => s.unit },
                  { header: 'Saldo', value: (s) => s.quantity },
                  { header: 'Mínimo', value: (s) => s.minQuantity },
                  { header: 'Custo unitário', value: (s) => s.unitCost },
                  { header: 'Preço de venda', value: (s) => s.salePrice },
                  { header: 'Vendável', value: (s) => (s.sellable ? 'Sim' : 'Não') },
                  { header: 'Fornecedor', value: (s) => s.supplier },
                  { header: 'Ativo', value: (s) => (s.active ? 'Sim' : 'Não') },
                ])
              }
            >
              Exportar
            </Button>
            {canManage && (
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setDraft({ ...EMPTY_SUPPLY })}>
                Novo material
              </Button>
            )}
          </>
        }
      />

      <StatGrid cols={4} className="mb-5">
        <Stat label="Ativos" value={rows.filter((s) => s.active).length} hint={`${rows.filter((s) => s.sellable && s.active).length} vendáveis`} icon={<Boxes className="size-4" />} />
        <Stat
          label="Abaixo mín."
          value={low.length}
          hint={low.length ? low.slice(0, 2).map((s) => s.name).join(', ') : 'Tudo abastecido'}
          icon={<AlertTriangle className="size-4" />}
          tone={low.length ? 'danger' : 'success'}
          onClick={() => {
            setTab('items');
            setFilter('LOW');
          }}
        />
        <Stat label="Em estoque" value={<FitValue>{moneyCompact(stockValue)}</FitValue>} hint={`${money(stockValue)} a custo`} icon={<Wallet className="size-4" />} tone="success" />
        <Stat label="Consumo 30d" value={<FitValue>{moneyCompact(monthOut)}</FitValue>} hint={`${money(monthOut)} em saídas`} icon={<ArrowUpRight className="size-4" />} tone="warning" />
      </StatGrid>

      {low.length > 0 && filter !== 'LOW' && tab === 'items' && (
        <Callout
          tone="warning"
          className="mb-4"
          title={`${low.length} material(is) abaixo do mínimo`}
          action={
            <Button size="sm" variant="secondary" onClick={() => setFilter('LOW')}>
              Ver
            </Button>
          }
        >
          {low.map((s) => `${s.name} (${supplyQty(s.quantity, s.unit)})`).join(' · ')}
        </Callout>
      )}

      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'items', label: 'Materiais', icon: <Boxes />, count: rows.length },
          { value: 'history', label: 'Histórico', icon: <SlidersHorizontal /> },
          { value: 'sold', label: 'Vendidos em pedidos', icon: <ShoppingBag /> },
        ]}
      />

      {tab === 'items' && (
        <>
          <Toolbar>
            <SearchInput value={q} onChange={setQ} placeholder="Buscar material, SKU, fornecedor…" className="sm:w-72" />
            <Segmented
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'ACTIVE', label: 'Ativos' },
                { value: 'LOW', label: 'Abaixo do mín.', count: low.length },
                { value: 'SELLABLE', label: 'Vendáveis' },
                { value: 'ALL', label: 'Todos' },
              ]}
            />
            <Select
              value={category}
              onChange={setCategory}
              className="sm:w-44"
              options={[{ value: '' as const, label: 'Categoria: todas' }, ...Object.entries(SUPPLY_CATEGORY_LABELS).map(([value, label]) => ({ value: value as SupplyItem['category'], label }))]}
            />
          </Toolbar>
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(s) => s.id}
            loading={loading}
            initialSort={{ key: 'name', dir: 'asc' }}
            onRowClick={canManage ? (s) => setDraft({ ...EMPTY_SUPPLY, ...s }) : undefined}
            emptyTitle={rows.length ? 'Nenhum material neste filtro' : 'Nenhum material cadastrado'}
            emptyDescription={rows.length ? undefined : 'Cadastre embalagens, etiquetas e sacolas para controlar o saldo.'}
            rowActions={
              canManage
                ? (s) => (
                    <Menu
                      items={[
                        { label: 'Entrada', icon: <ArrowDownLeft />, onClick: () => openMove(s, 'IN') },
                        { label: 'Saída', icon: <ArrowUpRight />, onClick: () => openMove(s, 'OUT') },
                        { label: 'Ajuste de saldo', icon: <SlidersHorizontal />, onClick: () => openMove(s, 'ADJUST') },
                        'divider',
                        { label: 'Editar', icon: <Edit3 />, onClick: () => setDraft({ ...EMPTY_SUPPLY, ...s }) },
                        { label: s.active ? 'Desativar' : 'Ativar', icon: <Power />, onClick: () => void toggle.run(s) },
                        { label: 'Excluir', icon: <Trash2 />, danger: true, onClick: () => void remove.run(s) },
                      ]}
                    />
                  )
                : undefined
            }
          />
        </>
      )}
      {tab === 'history' && <SupplyHistory moves={moves} items={rows} loading={loadingMoves} />}
      {tab === 'sold' && <SoldSupplies items={rows} />}

      <SupplyDrawer draft={draft} onChange={setDraft} onClose={() => setDraft(null)} />
      <SupplyMovementModal draft={move} onChange={setMove} onClose={() => setMove(null)} />
    </>
  );
}

const MOVE_LABEL: Record<SupplyMovement['type'], { label: string; tone: 'success' | 'warning' | 'neutral' }> = {
  IN: { label: 'Entrada', tone: 'success' },
  OUT: { label: 'Saída', tone: 'warning' },
  ADJUST: { label: 'Ajuste', tone: 'neutral' },
};

function SupplyHistory({ moves, items, loading }: { moves: SupplyMovement[]; items: SupplyItem[]; loading: boolean }) {
  const [itemId, setItemId] = useState('');
  const [type, setType] = useState<SupplyMovement['type'] | ''>('');
  const [from, setFrom] = useState(addDays(today(), -90));
  const unitOf = useMemo(() => new Map(items.map((i) => [i.id, i.unit])), [items]);
  const rows = useMemo(
    () => moves.filter((m) => (!itemId || m.supplyItemId === itemId) && (!type || m.type === type) && (!from || m.date >= from)),
    [moves, itemId, type, from],
  );
  const totals = rows.reduce(
    (t, m) => {
      if (m.type === 'IN') t.inVal += m.totalValue || 0;
      else if (m.type === 'OUT') t.outVal += m.totalValue || 0;
      else t.adj++;
      return t;
    },
    { inVal: 0, outVal: 0, adj: 0 },
  );
  const columns: Column<SupplyMovement>[] = [
    { key: 'date', header: 'Data', sortValue: (m) => `${m.date}${m.createdAt}`, cell: (m) => <span className="num">{date(m.date)}</span> },
    { key: 'item', header: 'Material', mobile: 'title', sortValue: (m) => m.supplyItemName, cell: (m) => <span className="font-medium text-fg">{m.supplyItemName}</span> },
    {
      key: 'type',
      header: 'Tipo',
      mobile: 'badge',
      cell: (m) => (
        <Badge tone={MOVE_LABEL[m.type].tone} dot>
          {MOVE_LABEL[m.type].label}
        </Badge>
      ),
    },
    {
      key: 'qty',
      header: 'Qtd.',
      align: 'right',
      sortValue: (m) => m.quantity,
      cell: (m) => (
        <span className="whitespace-nowrap">
          {m.type === 'IN' ? '+' : m.type === 'OUT' ? '−' : '='}
          {supplyQty(m.quantity, unitOf.get(m.supplyItemId) || 'UN')}
        </span>
      ),
    },
    { key: 'after', header: 'Saldo após', align: 'right', hideBelow: 'md', cell: (m) => supplyQty(m.balanceAfter, unitOf.get(m.supplyItemId) || 'UN') },
    { key: 'value', header: 'Valor', align: 'right', hideBelow: 'md', sortValue: (m) => m.totalValue || 0, cell: (m) => (m.totalValue != null ? money(m.totalValue) : '—') },
    {
      key: 'ref',
      header: 'Referência',
      mobile: 'subtitle',
      cell: (m) => (
        <span className="text-xs text-muted">{[m.saleNumber ? `Pedido ${m.saleNumber}` : null, m.invoiceNumber ? `NF ${m.invoiceNumber}` : null, m.supplier, m.reason].filter(Boolean).join(' · ') || '—'}</span>
      ),
    },
    { key: 'user', header: 'Usuário', hideBelow: 'xl', cell: (m) => <span className="text-xs text-muted">{m.userName || '—'}</span> },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 items-end">
        <Field label="Material" className="col-span-2 lg:col-span-1">
          <Select value={itemId} onChange={setItemId} options={[{ value: '', label: 'Todos' }, ...items.map((i) => ({ value: i.id, label: i.name }))]} />
        </Field>
        <Field label="Tipo">
          <Select value={type} onChange={setType} options={[{ value: '' as const, label: 'Todos' }, { value: 'IN', label: 'Entradas' }, { value: 'OUT', label: 'Saídas' }, { value: 'ADJUST', label: 'Ajustes' }]} />
        </Field>
        <Field label="Desde">
          <DateInput value={from} onChange={setFrom} />
        </Field>
        <p className="col-span-2 lg:col-span-1 text-xs text-muted num lg:text-right lg:pb-3">
          Entradas {money(totals.inVal)} · saídas {money(totals.outVal)} · {totals.adj} ajuste(s)
        </p>
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(m) => m.id} loading={loading} dense pageSize={50} initialSort={{ key: 'date', dir: 'desc' }} emptyTitle="Nenhuma movimentação no período" />
    </div>
  );
}

interface SoldRow {
  customerId: string;
  customerName: string;
  orders: number;
  qty: number;
  value: number;
  last: string;
}

function SoldSupplies({ items }: { items: SupplyItem[] }) {
  const { rows: sales, loading } = useTable('sales');
  const sellable = items.filter((i) => i.sellable);
  const [itemId, setItemId] = useState('');
  const [from, setFrom] = useState(addDays(today(), -180));
  const data = useMemo(() => {
    const m = new Map<string, SoldRow>();
    let qty = 0;
    let value = 0;
    for (const s of sales) {
      if (['CANCELLED', 'REJECTED', 'DRAFT'].includes(s.status) || (from && s.date < from)) continue;
      const its = (s.items || []).filter((i) => i.kind === 'SUPPLY' && (!itemId || i.supplyItemId === itemId));
      if (!its.length) continue;
      const q = its.reduce((a, i) => a + i.qty, 0);
      const v = its.reduce((a, i) => a + i.total, 0);
      qty += q;
      value += v;
      const cur = m.get(s.customerId) || { customerId: s.customerId, customerName: s.customerName, orders: 0, qty: 0, value: 0, last: '' };
      cur.orders++;
      cur.qty += q;
      cur.value += v;
      if (s.date > cur.last) cur.last = s.date;
      m.set(s.customerId, cur);
    }
    return { rows: [...m.values()], qty, value };
  }, [sales, itemId, from]);
  const columns: Column<SoldRow>[] = [
    { key: 'name', header: 'Cliente', mobile: 'title', sortValue: (r) => r.customerName, cell: (r) => <span className="font-medium text-fg">{r.customerName}</span> },
    { key: 'orders', header: 'Pedidos', align: 'right', sortValue: (r) => r.orders, cell: (r) => r.orders },
    { key: 'qty', header: 'Quantidade', align: 'right', sortValue: (r) => r.qty, cell: (r) => r.qty.toLocaleString('pt-BR') },
    { key: 'avg', header: 'Média/pedido', align: 'right', hideBelow: 'md', sortValue: (r) => r.qty / r.orders, cell: (r) => (r.qty / r.orders).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) },
    { key: 'value', header: 'Valor cobrado', align: 'right', sortValue: (r) => r.value, cell: (r) => money(r.value) },
    { key: 'last', header: 'Última', mobile: 'subtitle', sortValue: (r) => r.last, cell: (r) => <span className="num">{date(r.last)}</span> },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 items-end">
        <Field label="Material vendável" className="col-span-2 lg:col-span-1">
          <Select value={itemId} onChange={setItemId} options={[{ value: '', label: 'Todos' }, ...sellable.map((i) => ({ value: i.id, label: i.name }))]} />
        </Field>
        <Field label="Desde">
          <DateInput value={from} onChange={setFrom} />
        </Field>
        <p className="text-xs text-muted num lg:col-span-2 lg:text-right lg:pb-3">
          {data.qty.toLocaleString('pt-BR')} unidade(s) vendidas · {money(data.value)} cobrados · {data.rows.length} cliente(s)
        </p>
      </div>
      <DataTable
        columns={columns}
        rows={data.rows}
        rowKey={(r) => r.customerId}
        loading={loading}
        dense
        initialSort={{ key: 'qty', dir: 'desc' }}
        emptyTitle="Nenhuma venda de material no período"
        emptyDescription="Materiais marcados como vendáveis (ex.: sacola personalizada) aparecem aqui quando incluídos nos pedidos."
      />
    </div>
  );
}
