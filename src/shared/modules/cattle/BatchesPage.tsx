/**
 * Lotes de gado — lista com indicadores, filtros e cartões/tabela.
 */
import { Beef, ClipboardList, Coins, Download, LayoutGrid, List, Plus, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../app/session';
import { useTable } from '../../data/react';
import { date, daysBetween, integer, kg, matchesSearch, money, moneyCompact, today } from '../../domain/format';
import { BATCH_STATUS, MANAGEMENT_LABELS } from '../../domain/labels';
import type { Batch, BatchStatus, ManagementType } from '../../domain/types';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  exportCsv,
  PageHeader,
  Progress,
  SearchInput,
  Segmented,
  Select,
  Skeleton,
  Stat,
  StatGrid,
  StatusBadge,
  Toolbar,
  type Column,
} from '../../ui';
import { BatchWizard } from './BatchWizard';
import { daysOnFeed, isActiveBatch, netCostOf } from './helpers';
import { StatMoney, useSmUp } from './Money';

type StatusFilter = 'ACTIVE' | BatchStatus | 'ALL';

interface BatchRow extends Batch {
  alive: number;
  total: number;
  cost: number;
  days: number | null;
}

export function BatchesPage() {
  const { can } = useSession();
  const nav = useNavigate();
  const sm = useSmUp();
  const { rows: batches, loading } = useTable('batches');
  const { rows: animals } = useTable('animals');
  const { rows: costs } = useTable('batch_costs');

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ACTIVE');
  const [mgmt, setMgmt] = useState<ManagementType | ''>('');
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [wizard, setWizard] = useState(false);

  const enriched = useMemo<BatchRow[]>(() => {
    const byBatch = new Map<string, { alive: number; total: number }>();
    for (const a of animals) {
      const c = byBatch.get(a.batchId) || { alive: 0, total: 0 };
      c.total++;
      if (a.status === 'ALIVE') c.alive++;
      byBatch.set(a.batchId, c);
    }
    const costBy = new Map<string, typeof costs>();
    for (const c of costs) costBy.set(c.batchId, [...(costBy.get(c.batchId) || []), c]);
    return batches.map((b) => {
      const a = byBatch.get(b.id);
      return {
        ...b,
        alive: a ? a.alive : isActiveBatch(b) ? b.headCount || 0 : 0,
        total: a?.total || b.headCount || 0,
        cost: netCostOf(costBy.get(b.id) || []),
        days: daysOnFeed(b),
      };
    });
  }, [batches, animals, costs]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: enriched.length, ACTIVE: 0 };
    enriched.forEach((b) => {
      c[b.status] = (c[b.status] || 0) + 1;
      if (isActiveBatch(b)) c.ACTIVE++;
    });
    return c;
  }, [enriched]);

  const filtered = useMemo(
    () =>
      enriched
        .filter((b) => (status === 'ALL' ? true : status === 'ACTIVE' ? isActiveBatch(b) : b.status === status))
        .filter((b) => !mgmt || b.managementType === mgmt)
        .filter((b) => matchesSearch([b.code, b.name, b.supplierName, b.gtaNumber, b.purchaseInvoice], q))
        .sort((a, b) => b.code.localeCompare(a.code)),
    [enriched, status, mgmt, q],
  );

  const stats = useMemo(() => {
    const alive = filtered.reduce((s, b) => s + b.alive, 0);
    const heads = filtered.reduce((s, b) => s + b.total, 0);
    const cost = filtered.reduce((s, b) => s + b.cost, 0);
    const inPasture = filtered.filter((b) => b.status === 'IN_PASTURE').length;
    const purchased = filtered.filter((b) => b.status === 'PURCHASED').length;
    return { alive, heads, cost, inPasture, purchased, perHead: heads ? cost / heads : 0 };
  }, [filtered]);

  const columns: Column<BatchRow>[] = [
    {
      key: 'code',
      header: 'Lote',
      mobile: 'title',
      sortValue: (b) => b.code,
      cell: (b) => (
        <div className="min-w-0">
          <div className="font-medium text-fg truncate">{b.name}</div>
          <div className="text-xs text-muted num">{b.code}</div>
        </div>
      ),
    },
    { key: 'supplier', header: 'Fornecedor', mobile: 'subtitle', sortValue: (b) => b.supplierName || '', cell: (b) => b.supplierName || '—', hideBelow: 'lg' },
    { key: 'mgmt', header: 'Manejo', cell: (b) => MANAGEMENT_LABELS[b.managementType], hideBelow: 'xl' },
    {
      key: 'heads',
      header: 'Cabeças',
      align: 'right',
      sortValue: (b) => b.total,
      cell: (b) => (isActiveBatch(b) && b.alive !== b.total ? `${integer(b.alive)} / ${integer(b.total)}` : integer(b.total)),
    },
    { key: 'purchase', header: 'Compra', sortValue: (b) => b.purchaseDate || '', cell: (b) => <span className="num">{date(b.purchaseDate)}</span>, hideBelow: 'md' },
    { key: 'days', header: 'Dias', align: 'right', sortValue: (b) => b.days ?? -1, cell: (b) => (b.days === null ? '—' : integer(b.days)) },
    { key: 'cost', header: 'Custo acumulado', align: 'right', sortValue: (b) => b.cost, cell: (b) => money(b.cost) },
    { key: 'perHead', header: 'Custo/cab', align: 'right', sortValue: (b) => (b.total ? b.cost / b.total : 0), cell: (b) => money(b.total ? b.cost / b.total : 0), hideBelow: 'lg' },
    { key: 'status', header: 'Status', mobile: 'badge', sortValue: (b) => b.status, cell: (b) => <StatusBadge info={BATCH_STATUS[b.status]} /> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Gado"
        title="Lotes de gado"
        subtitle="Compra, animais, custos e resultado de cada lote — da fazenda ao abate."
        actions={
          <>
            <Button
              icon={<Download className="size-4" />}
              onClick={() =>
                exportCsv('lotes-de-gado', filtered, [
                  { header: 'Código', value: (b) => b.code },
                  { header: 'Nome', value: (b) => b.name },
                  { header: 'Status', value: (b) => BATCH_STATUS[b.status].label },
                  { header: 'Manejo', value: (b) => MANAGEMENT_LABELS[b.managementType] },
                  { header: 'Fornecedor', value: (b) => b.supplierName },
                  { header: 'Data de compra', value: (b) => date(b.purchaseDate) },
                  { header: 'NF', value: (b) => b.purchaseInvoice },
                  { header: 'GTA', value: (b) => b.gtaNumber },
                  { header: 'Cabeças', value: (b) => b.total },
                  { header: 'Vivos', value: (b) => b.alive },
                  { header: 'Peso de compra (kg)', value: (b) => b.purchaseWeightKg },
                  { header: 'Dias em engorda', value: (b) => b.days },
                  { header: 'Custo acumulado', value: (b) => b.cost },
                  { header: 'Custo por cabeça', value: (b) => (b.total ? Math.round((b.cost / b.total) * 100) / 100 : 0) },
                ])
              }
            >
              Exportar
            </Button>
            {can('cattle.manage') && (
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setWizard(true)}>
                Novo lote
              </Button>
            )}
          </>
        }
      />

      <StatGrid cols={4} className="mb-5">
        <Stat label="Cabeças vivas" value={integer(stats.alive)} icon={sm && <Beef className="size-4" />} hint={`de ${integer(stats.heads)} compradas`} />
        <Stat
          label="Lotes em engorda"
          value={integer(stats.inPasture + stats.purchased)}
          icon={sm && <ClipboardList className="size-4" />}
          tone="info"
          hint={`${stats.inPasture} em engorda · ${stats.purchased} comprados`}
        />
        <Stat label="Custo investido" value={<StatMoney value={stats.cost} />} icon={sm && <Wallet className="size-4" />} tone="accent" hint={money(stats.cost)} />
        <Stat label="Custo médio/cabeça" value={<StatMoney value={stats.perHead} />} icon={sm && <Coins className="size-4" />} tone="success" hint="custo líquido ÷ cabeças" />
      </StatGrid>

      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar por código, nome, fornecedor, GTA…" className="sm:w-80" />
        <Segmented
          size="sm"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'ACTIVE', label: 'Ativos', count: counts.ACTIVE },
            { value: 'PURCHASED', label: 'Comprados', count: counts.PURCHASED || 0 },
            { value: 'IN_PASTURE', label: 'Em engorda', count: counts.IN_PASTURE || 0 },
            { value: 'SLAUGHTERED', label: 'Abatidos', count: counts.SLAUGHTERED || 0 },
            { value: 'FINISHED', label: 'Encerrados', count: counts.FINISHED || 0 },
            { value: 'ALL', label: 'Todos', count: counts.ALL },
          ]}
        />
        <div className="flex items-center gap-2 lg:ml-auto">
          <Select
            value={mgmt}
            onChange={setMgmt}
            className="flex-1 sm:w-44 sm:flex-none"
            options={[
              { value: '', label: 'Todos os manejos' },
              { value: 'CAMPO', label: MANAGEMENT_LABELS.CAMPO },
              { value: 'CONFINAMENTO', label: MANAGEMENT_LABELS.CONFINAMENTO },
            ]}
          />
          <div className="hidden sm:block shrink-0">
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: 'cards', label: <LayoutGrid className="size-4" aria-label="Cartões" /> },
                { value: 'table', label: <List className="size-4" aria-label="Tabela" /> },
              ]}
            />
          </div>
        </div>
      </Toolbar>

      {view === 'table' ? (
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(b) => b.id}
          loading={loading}
          initialSort={{ key: 'code', dir: 'desc' }}
          onRowClick={(b) => nav(`/gado/lotes/${b.id}`)}
          emptyTitle="Nenhum lote encontrado"
          emptyDescription={q ? 'Tente outra busca ou outro filtro.' : 'Cadastre o primeiro lote de gado.'}
        />
      ) : loading ? (
        <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-48 rounded-card" />
          ))}
        </div>
      ) : !filtered.length ? (
        <Card>
          <EmptyState
            icon={<Beef className="size-5" />}
            title={batches.length ? 'Nenhum lote neste filtro' : 'Nenhum lote ainda'}
            description={batches.length ? 'Troque o status ou limpe a busca.' : 'Cadastre o primeiro lote: fornecedor, animais e custo de compra num só fluxo.'}
            action={
              !batches.length && can('cattle.manage') ? (
                <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setWizard(true)}>
                  Cadastrar lote
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((b) => (
            <BatchCard key={b.id} b={b} onOpen={() => nav(`/gado/lotes/${b.id}`)} />
          ))}
        </div>
      )}

      {can('cattle.manage') && <BatchWizard open={wizard} onClose={() => setWizard(false)} />}
    </>
  );
}

function BatchCard({ b, onOpen }: { b: BatchRow; onOpen: () => void }) {
  const planned = b.purchaseDate && b.estimatedSlaughterDate ? daysBetween(b.purchaseDate, b.estimatedSlaughterDate) : null;
  const left = b.estimatedSlaughterDate ? daysBetween(today(), b.estimatedSlaughterDate) : null;
  const active = isActiveBatch(b);
  return (
    <Card onClick={onOpen} className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-muted num">{b.code}</div>
          <h3 className="text-[15px] font-semibold text-fg leading-snug truncate">{b.name}</h3>
          <div className="text-xs text-muted truncate mt-0.5">{b.supplierName || 'Fornecedor não informado'}</div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <StatusBadge info={BATCH_STATUS[b.status]} />
          <Badge size="xs">{b.managementType === 'CONFINAMENTO' ? 'Confinamento' : 'Campo'}</Badge>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-3">
        <div className="min-w-0">
          <dt className="text-[10px] uppercase tracking-wider text-subtle">Cabeças</dt>
          <dd className="text-lg font-semibold text-fg num leading-tight">
            {integer(active ? b.alive : b.total)}
            {active && b.alive !== b.total && <span className="text-xs text-muted font-normal"> / {integer(b.total)}</span>}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[10px] uppercase tracking-wider text-subtle">Dias</dt>
          <dd className="text-lg font-semibold text-fg num leading-tight">{b.days === null ? '—' : integer(b.days)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[10px] uppercase tracking-wider text-subtle">Peso compra</dt>
          <dd className="text-sm font-medium text-fg num leading-7 truncate">{b.purchaseWeightKg ? kg(Math.round(b.purchaseWeightKg)) : '—'}</dd>
        </div>
      </dl>

      {active && planned && planned > 0 ? (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted">
            <span>Previsão de abate {date(b.estimatedSlaughterDate)}</span>
            <span className={left !== null && left < 0 ? 'text-warning font-medium' : ''}>
              {left === null ? '' : left < 0 ? `${-left} dias atrasado` : left === 0 ? 'hoje' : `faltam ${left} dias`}
            </span>
          </div>
          <Progress value={b.days || 0} max={planned} tone={left !== null && left < 0 ? 'warning' : 'primary'} />
        </div>
      ) : b.slaughterDate ? (
        <div className="text-xs text-muted">Abatido em {date(b.slaughterDate)}{b.slaughterhouseName ? ` · ${b.slaughterhouseName}` : ''}</div>
      ) : (
        <div className="text-xs text-subtle">Compra em {date(b.purchaseDate)}</div>
      )}

      <div className="flex items-end justify-between gap-3 pt-3 border-t border-border mt-auto">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-subtle">Custo acumulado</div>
          <div className="text-base font-semibold text-fg num truncate">{money(b.cost)}</div>
        </div>
        <div className="text-right min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-subtle">Por cabeça</div>
          <div className="text-sm font-medium text-fg num truncate">{money(b.total ? b.cost / b.total : 0)}</div>
        </div>
      </div>
    </Card>
  );
}
