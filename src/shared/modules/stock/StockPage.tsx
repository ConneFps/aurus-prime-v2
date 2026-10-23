/**
 * Estoque de venda (stock_lots FINISHED): visão por produto e por lote.
 */
import { AlertTriangle, CalendarClock, Download, FileText, Package, PackagePlus, TrendingDown, Wallet } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/session';
import { useTable } from '../../data/react';
import { date, integer, kg, matchesSearch, money, moneyCompact, qty as fmtQty } from '../../domain/format';
import type { StockLot } from '../../domain/types';
import {
  Badge,
  Button,
  Callout,
  DataTable,
  Drawer,
  FooterCell,
  Menu,
  PageHeader,
  SearchInput,
  Segmented,
  Select,
  Stat,
  StatGrid,
  Switch,
  Toolbar,
  type Column,
} from '../../ui';
import { exportInventoryPdf, exportLotsCsv, exportProductsCsv } from './inventoryExport';
import { useLotActions } from './LotActions';
import { ExpiryCell, LotTable } from './LotTable';
import { aggregateByProduct, expiryState, lotHasBalance, type ProductStock } from './model';
import { StockEntryDrawer } from './StockEntryDrawer';
import { FitValue } from './pickingUi';

type View = 'PRODUCT' | 'LOT';
type OriginFilter = 'ALL' | 'PROPRIO' | 'INTERCOMPANY';
type ExpiryFilter = 'ALL' | 'SOON' | 'EXPIRED';

export function StockPage() {
  const { can } = useSession();
  const canManage = can('stock.manage');
  const [params, setParams] = useSearchParams();
  const view = (params.get('ver') === 'lotes' ? 'LOT' : 'PRODUCT') as View;
  const setView = (v: View) =>
    setParams(
      (p) => {
        if (v === 'LOT') p.set('ver', 'lotes');
        else p.delete('ver');
        return p;
      },
      { replace: true },
    );

  const { rows: lots, loading } = useTable('stock_lots', { where: [['stage', '==', 'FINISHED']] });
  const { rows: products } = useTable('products');
  const actions = useLotActions();

  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [origin, setOrigin] = useState<OriginFilter>('ALL');
  const [expiry, setExpiry] = useState<ExpiryFilter>('ALL');
  const [onlyBalance, setOnlyBalance] = useState(true);
  const [openProduct, setOpenProduct] = useState<string | null>(null);
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryProduct, setEntryProduct] = useState<string | null>(null);

  const categories = useMemo(() => [...new Set(products.filter((p) => p.meatType !== 'RAW').map((p) => p.category))].sort(), [products]);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // Lotes após filtros de origem/categoria/busca (base das duas visões)
  const baseLots = useMemo(
    () =>
      lots
        .filter((l) => origin === 'ALL' || (l.origin || 'PROPRIO') === origin)
        .filter((l) => !category || productById.get(l.productId)?.category === category),
    [lots, origin, category, productById],
  );

  const allProducts = useMemo(() => aggregateByProduct(lots, products), [lots, products]);
  const productRows = useMemo(() => {
    const rows = aggregateByProduct(baseLots, products, { includeEmpty: !onlyBalance });
    return rows
      .filter((r) => !category || r.category === category)
      .filter((r) => !onlyBalance || r.qty > 0 || r.blockedQty > 0)
      .filter((r) => expiry === 'ALL' || (expiry === 'SOON' ? r.soonQty > 0 : r.expiredQty > 0))
      .filter((r) => matchesSearch([r.name, r.product?.code, r.category], q));
  }, [baseLots, products, onlyBalance, category, expiry, q]);

  const lotRows = useMemo(
    () =>
      baseLots
        .filter((l) => !onlyBalance || lotHasBalance(l))
        .filter((l) => expiry === 'ALL' || (lotHasBalance(l) && expiryState(l.expiryDate) === expiry))
        .filter((l) => matchesSearch([l.productName, l.lotCode, l.batchCode, l.originInvoice, l.location], q)),
    [baseLots, onlyBalance, expiry, q],
  );

  const stats = useMemo(() => {
    let kgTotal = 0;
    let value = 0;
    let icKg = 0;
    let expired = 0;
    let soon = 0;
    let blocked = 0;
    for (const p of allProducts) {
      if (p.unit === 'KG') {
        kgTotal += p.qty;
        icKg += p.intercompanyQty;
      }
      value += p.value;
      expired += p.expiredQty;
      soon += p.soonQty;
      blocked += p.blockedQty;
    }
    const below = aggregateByProduct(lots, products, { includeEmpty: true }).filter((p) => p.belowMin);
    return { kgTotal, value, icKg, expired, soon, blocked, below };
  }, [allProducts, lots, products]);

  const filtersLabel = [
    category && `Categoria ${category}`,
    origin !== 'ALL' && (origin === 'PROPRIO' ? 'Só próprio' : 'Só intercompany'),
    expiry === 'SOON' && 'Vencendo em 7 dias',
    expiry === 'EXPIRED' && 'Vencidos',
    q && `Busca "${q}"`,
  ]
    .filter(Boolean)
    .join(' · ');

  const selected = openProduct ? allProducts.find((p) => p.id === openProduct) || aggregateByProduct([], products, { includeEmpty: true }).find((p) => p.id === openProduct) : null;

  const columns: Column<ProductStock>[] = [
    {
      key: 'name',
      header: 'Produto',
      mobile: 'title',
      sortValue: (p) => p.name,
      cell: (p) => (
        <div className="min-w-0">
          <div className="font-medium text-fg truncate">{p.name}</div>
          <div className="text-xs text-muted truncate">
            {p.category}
            {p.product?.code ? ` · ${p.product.code}` : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'qty',
      header: 'Saldo',
      align: 'right',
      sortValue: (p) => p.qty,
      cell: (p) => (
        <div className="leading-tight">
          <div className={p.qty <= 0 ? 'text-subtle' : 'font-semibold text-fg'}>{fmtQty(p.qty, p.unit)}</div>
          {p.intercompanyQty > 0 && <div className="text-[11px] text-accent">IC {fmtQty(p.intercompanyQty, p.unit)}</div>}
          {p.blockedQty > 0 && <div className="text-[11px] text-danger">+{fmtQty(p.blockedQty, p.unit)} bloq.</div>}
        </div>
      ),
    },
    { key: 'lots', header: 'Lotes', align: 'right', hideBelow: 'md', sortValue: (p) => p.availableLots, cell: (p) => p.availableLots },
    { key: 'avg', header: 'Custo médio', align: 'right', hideBelow: 'lg', sortValue: (p) => p.avgCost, cell: (p) => (p.qty > 0 ? money(p.avgCost) : '—') },
    { key: 'value', header: 'Valor a custo', align: 'right', sortValue: (p) => p.value, cell: (p) => money(p.value) },
    { key: 'expiry', header: 'Validade + próxima', sortValue: (p) => p.nearestExpiry || '9999', cell: (p) => <ExpiryCell expiry={p.nearestExpiry} /> },
    {
      key: 'min',
      header: 'Mínimo',
      align: 'right',
      hideBelow: 'lg',
      sortValue: (p) => p.minStock || 0,
      cell: (p) => (p.minStock ? fmtQty(p.minStock, p.unit) : <span className="text-subtle">—</span>),
    },
    {
      key: 'status',
      header: 'Alertas',
      mobile: 'badge',
      sortValue: (p) => (p.expiredQty > 0 ? 0 : p.belowMin ? 1 : p.soonQty > 0 ? 2 : 3),
      cell: (p) => <ProductAlerts p={p} />,
    },
  ];

  const totalQty = productRows.filter((r) => r.unit === 'KG').reduce((s, r) => s + r.qty, 0);
  const totalValue = productRows.reduce((s, r) => s + r.value, 0);

  return (
    <>
      <PageHeader
        eyebrow="Estoque"
        title="Estoque de venda"
        subtitle="Saldo por corte e por lote, com validade, origem e custo."
        actions={
          <>
            <Menu
              trigger={
                <Button icon={<Download className="size-4" />} aria-label="Exportar">
                  Exportar
                </Button>
              }
              items={[
                { label: 'Planilha por produto (CSV)', icon: <Download />, onClick: () => exportProductsCsv(productRows) },
                { label: 'Planilha por lote (CSV)', icon: <Download />, onClick: () => exportLotsCsv(lotRows) },
                { label: 'PDF de inventário (contagem)', icon: <FileText />, onClick: () => exportInventoryPdf(productRows, filtersLabel) },
              ]}
            />
            {canManage && (
              <>
                <Button icon={<TrendingDown className="size-4" />} onClick={() => actions.registerLoss(null, null)}>
                  Perda
                </Button>
                <Button
                  variant="primary"
                  icon={<PackagePlus className="size-4" />}
                  onClick={() => {
                    setEntryProduct(null);
                    setEntryOpen(true);
                  }}
                >
                  Nova entrada
                </Button>
              </>
            )}
          </>
        }
      />

      <StatGrid cols={4} className="mb-5">
        <Stat
          label="Saldo"
          value={`${integer(stats.kgTotal)} kg`}
          hint={stats.icKg > 0 ? `${kg(stats.icKg)} intercompany` : 'Tudo próprio'}
          icon={<Package className="size-4" />}
        />
        <Stat label="Valor" value={<FitValue>{moneyCompact(stats.value)}</FitValue>} hint={`${money(stats.value)} a custo`} icon={<Wallet className="size-4" />} tone="success" />
        <Stat
          label="Abaixo mín."
          value={stats.below.length}
          hint={stats.below.length ? stats.below.slice(0, 2).map((p) => p.name).join(', ') : 'Nenhum produto'}
          icon={<AlertTriangle className="size-4" />}
          tone={stats.below.length ? 'warning' : 'neutral'}
          onClick={stats.below.length ? () => setOnlyBalance(false) : undefined}
        />
        <Stat
          label="Validade"
          value={`${integer(stats.expired + stats.soon)} kg`}
          hint={stats.expired > 0 ? `${kg(stats.expired)} vencidos · ${kg(stats.soon)} em 7 dias` : `${kg(stats.soon)} vencem em 7 dias`}
          icon={<CalendarClock className="size-4" />}
          tone={stats.expired > 0 ? 'danger' : stats.soon > 0 ? 'warning' : 'neutral'}
          onClick={() => setExpiry(stats.expired > 0 ? 'EXPIRED' : 'SOON')}
        />
      </StatGrid>

      {stats.expired > 0 && expiry !== 'EXPIRED' && (
        <Callout
          tone="danger"
          className="mb-4"
          title={`${kg(stats.expired)} com validade vencida ainda no saldo`}
          action={
            <Button size="sm" variant="secondary" onClick={() => setExpiry('EXPIRED')}>
              Ver lotes
            </Button>
          }
        >
          Bloqueie ou registre a perda para não entrarem na separação.
        </Callout>
      )}

      <Toolbar>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'PRODUCT', label: 'Por produto' },
            { value: 'LOT', label: 'Por lote' },
          ]}
        />
        <SearchInput value={q} onChange={setQ} placeholder={view === 'LOT' ? 'Produto, lote, NF, local…' : 'Buscar produto…'} className="sm:w-64" />
        <div className="grid grid-cols-2 gap-2 sm:contents">
          <Select value={category} onChange={setCategory} options={[{ value: '', label: 'Categoria: todas' }, ...categories.map((c) => ({ value: c, label: c }))]} className="sm:w-48" />
          <Select
            value={origin}
            onChange={setOrigin}
            className="sm:w-44"
            options={[
              { value: 'ALL', label: 'Origem: todas' },
              { value: 'PROPRIO', label: 'Próprio' },
              { value: 'INTERCOMPANY', label: 'Intercompany' },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 sm:contents">
        <Segmented
          size="sm"
          value={expiry}
          onChange={setExpiry}
          options={[
            { value: 'ALL', label: 'Todas' },
            { value: 'SOON', label: 'Vencendo' },
            { value: 'EXPIRED', label: 'Vencidos' },
          ]}
        />
        <div className="sm:ml-auto shrink-0">
          <Switch checked={onlyBalance} onChange={setOnlyBalance} label="Só com saldo" />
        </div>
        </div>
      </Toolbar>

      {view === 'PRODUCT' ? (
        <DataTable
          columns={columns}
          rows={productRows}
          rowKey={(p) => p.id}
          loading={loading}
          initialSort={{ key: 'name', dir: 'asc' }}
          onRowClick={(p) => setOpenProduct(p.id)}
          pageSize={50}
          emptyTitle={lots.length ? 'Nenhum produto com esses filtros' : 'Estoque vazio'}
          emptyDescription={lots.length ? 'Ajuste os filtros ou desligue "Só com saldo".' : 'O estoque de venda é alimentado pelo retorno da desossa ou por entradas manuais.'}
          footer={
            productRows.length > 1 ? (
              <tr>
                <FooterCell>{productRows.length} produtos</FooterCell>
                <FooterCell align="right">{kg(totalQty)}</FooterCell>
                <FooterCell className="hidden md:table-cell" />
                <FooterCell className="hidden lg:table-cell" />
                <FooterCell align="right">{money(totalValue)}</FooterCell>
                <FooterCell colSpan={3} />
              </tr>
            ) : undefined
          }
        />
      ) : (
        <LotTable lots={lotRows} showProduct actions={actions} loading={loading} emptyTitle="Nenhum lote com esses filtros" />
      )}

      <Drawer
        open={!!selected}
        onClose={() => setOpenProduct(null)}
        width="lg"
        title={selected?.name}
        description={selected ? `${selected.category}${selected.product?.code ? ` · código ${selected.product.code}` : ''}` : undefined}
        footer={
          canManage && selected ? (
            <>
              <Button icon={<TrendingDown className="size-4" />} onClick={() => actions.registerLoss(null, selected.id)} disabled={selected.qty <= 0}>
                Registrar perda (FIFO)
              </Button>
              <Button
                variant="primary"
                icon={<PackagePlus className="size-4" />}
                onClick={() => {
                  setEntryProduct(selected.id);
                  setEntryOpen(true);
                }}
              >
                Entrada deste produto
              </Button>
            </>
          ) : undefined
        }
      >
        {selected && <ProductDetail p={selected} actions={actions} />}
      </Drawer>

      <StockEntryDrawer open={entryOpen} onClose={() => setEntryOpen(false)} initialProductId={entryProduct} />
      {actions.modals}
    </>
  );
}

function ProductAlerts({ p }: { p: ProductStock }) {
  const out: ReactNode[] = [];
  if (p.expiredQty > 0)
    out.push(
      <Badge key="e" tone="danger" size="xs">
        Vencido
      </Badge>,
    );
  if (p.soonQty > 0)
    out.push(
      <Badge key="s" tone="warning" size="xs">
        Vencendo
      </Badge>,
    );
  if (p.belowMin)
    out.push(
      <Badge key="m" tone="warning" size="xs">
        Abaixo do mín.
      </Badge>,
    );
  if (p.qty <= 0)
    out.push(
      <Badge key="z" size="xs">
        Sem saldo
      </Badge>,
    );
  if (!out.length)
    out.push(
      <Badge key="ok" tone="success" size="xs" dot>
        OK
      </Badge>,
    );
  return <span className="inline-flex flex-wrap gap-1 justify-end sm:justify-start">{out}</span>;
}

function ProductDetail({ p, actions }: { p: ProductStock; actions: ReturnType<typeof useLotActions> }) {
  const lots: StockLot[] = p.lots;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <MiniStat label="Disponível" value={fmtQty(p.qty, p.unit)} hint={p.blockedQty ? `+ ${fmtQty(p.blockedQty, p.unit)} bloqueado` : `${p.availableLots} lote(s)`} />
        <MiniStat label="Valor a custo" value={money(p.value)} hint={p.qty > 0 ? `médio ${money(p.avgCost)}/${p.unit === 'KG' ? 'kg' : 'un'}` : undefined} />
        <MiniStat label="Próprio / Intercompany" value={`${fmtQty(p.proprioQty, p.unit)}`} hint={`IC ${fmtQty(p.intercompanyQty, p.unit)}`} />
        <MiniStat
          label="Validade mais próxima"
          value={date(p.nearestExpiry)}
          hint={p.expiredQty ? `${fmtQty(p.expiredQty, p.unit)} vencido` : p.soonQty ? `${fmtQty(p.soonQty, p.unit)} em 7 dias` : undefined}
          tone={p.expiredQty ? 'danger' : p.soonQty ? 'warning' : undefined}
        />
      </div>
      {p.belowMin && (
        <Callout tone="warning" title="Abaixo do estoque mínimo">
          Mínimo {fmtQty(p.minStock, p.unit)} — faltam {fmtQty((p.minStock || 0) - p.qty, p.unit)} para o nível de alerta.
        </Callout>
      )}
      <div>
        <h3 className="text-sm font-semibold text-fg mb-2">Lotes com saldo</h3>
        <LotTable lots={lots} actions={actions} compact emptyTitle="Nenhum lote com saldo" />
        <p className="text-xs text-subtle mt-2">A separação usa primeiro o lote que vence antes (FIFO). Lotes bloqueados ficam fora.</p>
      </div>
    </div>
  );
}

function MiniStat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'danger' | 'warning' }) {
  return (
    <div className="rounded-control border border-border bg-surface-2/50 px-3 py-2.5 min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-subtle truncate">{label}</div>
      <div className={`text-base font-semibold num truncate ${tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-fg'}`}>{value}</div>
      {hint && <div className="text-xs text-muted truncate">{hint}</div>}
    </div>
  );
}
