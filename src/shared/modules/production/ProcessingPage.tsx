/**
 * Processamento — ordens de desossa: lista, indicadores e nova OS.
 */
import { Download, FileText, Gauge, Plus, Repeat, Scale, Scissors, TrendingDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../app/session';
import { useSettings } from '../../app/settings';
import { useTable } from '../../data/react';
import { addDays, date, integer, kg, matchesSearch, percent, today } from '../../domain/format';
import type { ProcessingOrder } from '../../domain/types';
import {
  Badge,
  Button,
  cn,
  DataTable,
  EmptyState,
  exportCsv,
  Menu,
  PageHeader,
  SearchInput,
  Segmented,
  Stat,
  StatGrid,
  StatusBadge,
  toneText,
  Toolbar,
  type Column,
} from '../../ui';
import { ProcessingOrderDrawer } from './ProcessingOrderDrawer';
import { printRomaneio } from './romaneio';
import { NUM_COL, deboningYieldTone, isOpenOrder, overdueDays, pendingKg, PROCESSING_STATUS } from './shared';

type Filter = 'OPEN' | 'COMPLETED' | 'CANCELLED' | 'ALL';

export function ProcessingPage() {
  const nav = useNavigate();
  const { can } = useSession();
  const { settings } = useSettings();
  const canOperate = can('production.manage');
  const { rows: orders, loading } = useTable('processing_orders');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('OPEN');
  const [creating, setCreating] = useState(false);

  const counts = useMemo(
    () => ({
      OPEN: orders.filter(isOpenOrder).length,
      COMPLETED: orders.filter((o) => o.status === 'COMPLETED').length,
      CANCELLED: orders.filter((o) => o.status === 'CANCELLED').length,
      ALL: orders.length,
    }),
    [orders],
  );

  const stats = useMemo(() => {
    const open = orders.filter(isOpenOrder);
    const since = addDays(today(), -90);
    const recent = orders.filter((o) => o.status === 'COMPLETED' && lastReturnDate(o) >= since);
    const sent = recent.reduce((s, o) => s + o.sentKg, 0);
    const returned = recent.reduce((s, o) => s + o.returnedKg, 0);
    const losses = recent.reduce((s, o) => s + o.lossKg, 0);
    return {
      open: open.length,
      late: open.filter((o) => overdueDays(o) > 0).length,
      inProcess: open.reduce((s, o) => s + pendingKg(o), 0),
      yield90: sent ? (returned / sent) * 100 : null,
      loss90: sent ? (losses / sent) * 100 : null,
      recentCount: recent.length,
    };
  }, [orders]);

  const filtered = useMemo(
    () =>
      orders
        .filter((o) => (filter === 'ALL' ? true : filter === 'OPEN' ? isOpenOrder(o) : o.status === filter))
        .filter((o) => matchesSearch([o.number, o.partnerName, o.batchCode, o.driverName, o.vehiclePlate, o.dispatchDocument], q)),
    [orders, filter, q],
  );

  const columns: Column<ProcessingOrder>[] = [
    {
      key: 'number',
      header: 'Ordem',
      mobile: 'title',
      sortValue: (o) => o.number,
      cell: (o) => (
        <div className="min-w-0">
          <div className="font-medium text-fg num truncate">{o.number}</div>
          <div className="text-xs text-muted truncate">{o.partnerName}</div>
        </div>
      ),
    },
    { key: 'batch', header: 'Lote', mobile: 'subtitle', sortValue: (o) => o.batchCode || '', cell: (o) => (o.batchCode ? <span className="num">{o.batchCode}</span> : 'vários') },
    { key: 'sent', header: 'Envio', sortValue: (o) => o.sentDate, cell: (o) => <span className="num">{date(o.sentDate)}</span>, hideBelow: 'lg' },
    { key: 'sentKg', header: 'Enviado', ...NUM_COL, sortValue: (o) => o.sentKg, cell: (o) => kg(o.sentKg) },
    { key: 'returned', header: 'Retornado', ...NUM_COL, sortValue: (o) => o.returnedKg, cell: (o) => (o.returnedKg ? kg(o.returnedKg) : '—') },
    { key: 'loss', header: 'Perdas', ...NUM_COL, sortValue: (o) => o.lossKg, cell: (o) => (o.lossKg ? kg(o.lossKg) : '—'), hideBelow: 'md' },
    {
      key: 'yield',
      header: 'Rendimento',
      ...NUM_COL,
      sortValue: (o) => o.yieldPercent || 0,
      cell: (o) =>
        !o.yieldPercent ? (
          <span className="text-subtle">—</span>
        ) : isOpenOrder(o) ? (
          <span className="text-muted" title="Rendimento parcial — a ordem ainda não retornou toda">
            {percent(o.yieldPercent, 1)} <span className="text-[10px] uppercase tracking-wide">parcial</span>
          </span>
        ) : (
          <span className={cn('font-medium', toneText[deboningYieldTone(o.yieldPercent)])}>{percent(o.yieldPercent, 1)}</span>
        ),
    },
    {
      key: 'expected',
      header: 'Previsão de retorno',
      sortValue: (o) => o.expectedReturnDate || '9999',
      hideBelow: 'md',
      cell: (o) => {
        const late = overdueDays(o);
        if (!o.expectedReturnDate) return <span className="text-subtle">—</span>;
        return (
          <span className="inline-flex items-center gap-1.5">
            <span className="num">{date(o.expectedReturnDate)}</span>
            {late > 0 && (
              <Badge tone="danger">
                +{late}d<span className="hidden sm:inline"> de atraso</span>
              </Badge>
            )}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      mobile: 'badge',
      sortValue: (o) => o.status,
      cell: (o) => (
        <span className="inline-flex items-center gap-1.5">
          <StatusBadge info={PROCESSING_STATUS[o.status]} />
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Produção"
        title="Processamento"
        subtitle="Ordens de desossa: envio de carcaça e quartos, retorno em cortes, perdas e rendimento."
        actions={
          <>
            <Button
              icon={<Download className="size-4" />}
              onClick={() =>
                exportCsv('ordens-desossa', filtered, [
                  { header: 'Ordem', value: (o) => o.number },
                  { header: 'Parceiro', value: (o) => o.partnerName },
                  { header: 'Lote', value: (o) => o.batchCode },
                  { header: 'Envio', value: (o) => date(o.sentDate) },
                  { header: 'Previsão de retorno', value: (o) => date(o.expectedReturnDate) },
                  { header: 'Enviado (kg)', value: (o) => o.sentKg },
                  { header: 'Retornado (kg)', value: (o) => o.returnedKg },
                  { header: 'Perdas (kg)', value: (o) => o.lossKg },
                  { header: 'Rendimento (%)', value: (o) => o.yieldPercent },
                  { header: 'Status', value: (o) => PROCESSING_STATUS[o.status].label },
                  { header: 'Custo desossa', value: (o) => o.processingCost },
                  { header: 'Frete', value: (o) => o.freightCost },
                ])
              }
            >
              Exportar
            </Button>
            {canOperate && (
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
                Nova ordem
              </Button>
            )}
          </>
        }
      />

      <StatGrid cols={4} className="mb-6">
        <Stat label="Em aberto" value={integer(stats.open)} hint={stats.late ? `${stats.late} atrasada(s)` : 'nenhuma atrasada'} icon={<Repeat className="size-4" />} tone={stats.late ? 'warning' : 'primary'} onClick={() => setFilter('OPEN')} />
        <Stat label="Na desossa" value={kg(Math.round(stats.inProcess))} hint="aguardando retorno" icon={<Scale className="size-4" />} tone="accent" />
        <Stat
          label="Rendimento"
          value={stats.yield90 ? percent(stats.yield90, 1) : '—'}
          hint={stats.recentCount ? `90 dias · ${stats.recentCount} ${stats.recentCount === 1 ? 'ordem' : 'ordens'}` : 'nada concluído em 90 dias'}
          icon={<Gauge className="size-4" />}
          tone={deboningYieldTone(stats.yield90)}
        />
        <Stat label="Perdas" value={stats.loss90 != null ? percent(stats.loss90, 1) : '—'} hint="90 dias · osso, sebo…" icon={<TrendingDown className="size-4" />} tone="neutral" />
      </StatGrid>

      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar ordem, parceiro, lote, placa…" className="sm:w-80" />
        <Segmented
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'OPEN', label: 'Abertas', count: counts.OPEN },
            { value: 'COMPLETED', label: 'Concluídas', count: counts.COMPLETED },
            { value: 'CANCELLED', label: 'Canceladas', count: counts.CANCELLED },
            { value: 'ALL', label: 'Todas', count: counts.ALL },
          ]}
        />
      </Toolbar>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(o) => o.id}
        loading={loading}
        initialSort={{ key: 'number', dir: 'desc' }}
        onRowClick={(o) => nav(`/producao/processamento/${o.id}`)}
        rowClassName={(o) => (overdueDays(o) > 0 ? 'bg-danger-soft/30' : undefined)}
        empty={
          !orders.length ? (
            <EmptyState
              icon={<Scissors className="size-5" />}
              title="Nenhuma ordem de desossa ainda"
              description="Envie carcaça ou quartos do estoque pós-abate para a desossa e acompanhe o retorno em cortes."
              action={
                canOperate ? (
                  <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
                    Criar a primeira ordem
                  </Button>
                ) : undefined
              }
            />
          ) : undefined
        }
        emptyTitle={filter === 'OPEN' ? 'Nenhuma ordem em aberto' : 'Nenhuma ordem encontrada'}
        emptyDescription={q ? 'Tente outra busca.' : filter === 'OPEN' ? 'Todas as desossas já retornaram.' : undefined}
        rowActions={(o) => (
          <Menu
            items={[
              { label: 'Abrir ordem', icon: <Scissors />, onClick: () => nav(`/producao/processamento/${o.id}`) },
              { label: 'Romaneio (PDF)', icon: <FileText />, onClick: () => printRomaneio(o, { company: settings.tradeName || settings.companyName }) },
            ]}
          />
        )}
      />

      <ProcessingOrderDrawer open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function lastReturnDate(o: ProcessingOrder): string {
  return (o.returns || []).reduce((m, r) => (r.date > m ? r.date : m), o.sentDate);
}

