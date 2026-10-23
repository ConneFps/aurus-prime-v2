/**
 * Saída para abate — lotes prontos + histórico. O registro do abate é um
 * fluxo guiado (SlaughterWizard), aberto por ?lote=ID (vazio = escolher).
 */
import { Beef, CalendarClock, Download, ExternalLink, Scale, Scissors, Truck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/session';
import { useTable } from '../../data/react';
import { addDays, date, daysBetween, integer, kg, matchesSearch, percent, today } from '../../domain/format';
import { BATCH_STATUS, MANAGEMENT_LABELS } from '../../domain/labels';
import type { Animal, Batch } from '../../domain/types';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  exportCsv,
  Menu,
  PageHeader,
  SearchInput,
  Stat,
  StatGrid,
  StatusBadge,
  Tabs,
  Toolbar,
  type Column,
} from '../../ui';
import { carcassYieldInfo, NUM_COL } from './shared';
import { SlaughterWizard } from './SlaughterWizard';

export function SlaughterPage() {
  const [params, setParams] = useSearchParams();
  const lote = params.get('lote');
  if (lote !== null) return <SlaughterWizard initialBatchId={lote || null} onExit={() => setParams({})} />;
  return <SlaughterOverview onStart={(id) => setParams({ lote: id || '' })} />;
}

interface ReadyRow {
  batch: Batch;
  alive: Animal[];
  liveKg: number;
  daysInBatch: number;
}

function SlaughterOverview({ onStart }: { onStart: (batchId?: string) => void }) {
  const nav = useNavigate();
  const { can } = useSession();
  // registerSlaughter exige também 'cattle.manage' (ver relatório).
  const canSlaughter = can('production.manage') && can('cattle.manage');
  const { rows: batches, loading } = useTable('batches');
  const { rows: animals, loading: loadingAnimals } = useTable('animals');
  const [tab, setTab] = useState<'ready' | 'history'>('ready');
  const [q, setQ] = useState('');

  const aliveByBatch = useMemo(() => {
    const m = new Map<string, Animal[]>();
    for (const a of animals) {
      if (a.status !== 'ALIVE') continue;
      const arr = m.get(a.batchId) || [];
      arr.push(a);
      m.set(a.batchId, arr);
    }
    return m;
  }, [animals]);

  const ready = useMemo<ReadyRow[]>(
    () =>
      batches
        .filter((b) => b.status === 'PURCHASED' || b.status === 'IN_PASTURE')
        .map((b) => {
          const alive = aliveByBatch.get(b.id) || [];
          const liveKg = alive.reduce((s, a) => s + (a.currentWeightKg || a.entryWeightKg || 0), 0);
          return { batch: b, alive, liveKg, daysInBatch: b.purchaseDate ? daysBetween(b.purchaseDate, today()) : 0 };
        }),
    [batches, aliveByBatch],
  );

  const history = useMemo(
    () => batches.filter((b) => (b.status === 'SLAUGHTERED' || b.status === 'FINISHED') && b.slaughterDate),
    [batches],
  );

  const stats = useMemo(() => {
    const since = addDays(today(), -90);
    const recent = history.filter((b) => (b.slaughterDate || '') >= since);
    const carcass = recent.reduce((s, b) => s + (b.carcassWeightKg || 0), 0);
    const withExit = recent.filter((b) => b.exitScaleWeightKg && b.carcassWeightKg);
    const exit = withExit.reduce((s, b) => s + (b.exitScaleWeightKg || 0), 0);
    const carcassW = withExit.reduce((s, b) => s + (b.carcassWeightKg || 0), 0);
    const nextDue = ready
      .map((r) => r.batch.estimatedSlaughterDate)
      .filter(Boolean)
      .sort()[0];
    return {
      readyCount: ready.length,
      readyHeads: ready.reduce((s, r) => s + r.alive.length, 0),
      recentCount: recent.length,
      carcass,
      yieldAvg: exit ? (carcassW / exit) * 100 : null,
      nextDue,
    };
  }, [history, ready]);

  const readyFiltered = ready.filter((r) => matchesSearch([r.batch.code, r.batch.name, r.batch.supplierName], q));
  const historyFiltered = history.filter((b) => matchesSearch([b.code, b.name, b.slaughterhouseName, b.gtaNumber], q));

  const readyCols: Column<ReadyRow>[] = [
    {
      key: 'code',
      header: 'Lote',
      mobile: 'title',
      sortValue: (r) => r.batch.code,
      cell: (r) => (
        <div className="min-w-0">
          <div className="font-medium text-fg truncate">{r.batch.code}</div>
          <div className="text-xs text-muted truncate">{r.batch.name}</div>
        </div>
      ),
    },
    { key: 'mgmt', header: 'Manejo', mobile: 'subtitle', cell: (r) => MANAGEMENT_LABELS[r.batch.managementType], hideBelow: 'lg' },
    { key: 'heads', header: 'Cabeças vivas', ...NUM_COL, sortValue: (r) => r.alive.length, cell: (r) => integer(r.alive.length || r.batch.headCount) },
    {
      key: 'live',
      header: 'Peso vivo estimado',
      ...NUM_COL,
      sortValue: (r) => r.liveKg,
      cell: (r) => (r.liveKg ? kg(Math.round(r.liveKg)) : '—'),
      hideBelow: 'md',
    },
    { key: 'days', header: 'Dias no lote', ...NUM_COL, sortValue: (r) => r.daysInBatch, cell: (r) => integer(r.daysInBatch), hideBelow: 'md' },
    {
      key: 'due',
      header: 'Previsão de abate',
      sortValue: (r) => r.batch.estimatedSlaughterDate || '9999',
      cell: (r) => {
        const d = r.batch.estimatedSlaughterDate;
        if (!d) return <span className="text-subtle">—</span>;
        const late = d < today();
        return (
          <span className="inline-flex items-center gap-1.5">
            <span className="num">{date(d)}</span>
            {late && <Badge tone="warning">passou</Badge>}
          </span>
        );
      },
    },
    { key: 'status', header: 'Status', mobile: 'badge', cell: (r) => <StatusBadge info={BATCH_STATUS[r.batch.status]} /> },
    {
      key: 'action',
      header: '',
      mobile: false,
      ...NUM_COL,
      cell: (r) =>
        canSlaughter ? (
          <Button size="sm" variant="secondary" icon={<Beef className="size-4" />} onClick={(e) => {
              e.stopPropagation();
              onStart(r.batch.id);
            }}>
            Registrar abate
          </Button>
        ) : null,
    },
  ];

  const historyCols: Column<Batch>[] = [
    {
      key: 'code',
      header: 'Lote',
      mobile: 'title',
      sortValue: (b) => b.code,
      cell: (b) => (
        <div className="min-w-0">
          <div className="font-medium text-fg truncate">{b.code}</div>
          <div className="text-xs text-muted truncate">{b.name}</div>
        </div>
      ),
    },
    { key: 'date', header: 'Data do abate', mobile: 'subtitle', sortValue: (b) => b.slaughterDate, cell: (b) => <span className="num">{date(b.slaughterDate)}</span> },
    { key: 'sh', header: 'Frigorífico', sortValue: (b) => b.slaughterhouseName || '', cell: (b) => b.slaughterhouseName || '—', hideBelow: 'md' },
    { key: 'exit', header: 'Peso de saída', ...NUM_COL, sortValue: (b) => b.exitScaleWeightKg || 0, cell: (b) => (b.exitScaleWeightKg ? kg(b.exitScaleWeightKg) : '—'), hideBelow: 'lg' },
    { key: 'carcass', header: 'Carcaça', ...NUM_COL, sortValue: (b) => b.carcassWeightKg || 0, cell: (b) => (b.carcassWeightKg ? kg(b.carcassWeightKg) : '—') },
    {
      key: 'yield',
      header: 'Rendimento',
      ...NUM_COL,
      sortValue: (b) => b.carcassYieldPercent || 0,
      cell: (b) => {
        const info = carcassYieldInfo(b.carcassYieldPercent);
        return b.carcassYieldPercent ? (
          <span className="inline-flex items-center gap-1.5 justify-end">
            <span className="num">{percent(b.carcassYieldPercent, 2)}</span>
            {info && <Badge tone={info.tone}>{info.label}</Badge>}
          </span>
        ) : (
          '—'
        );
      },
    },
    { key: 'loss', header: 'Quebra transp.', ...NUM_COL, cell: (b) => (b.transportLossPercent != null ? percent(b.transportLossPercent, 2) : '—'), hideBelow: 'xl' },
    { key: 'status', header: 'Status', mobile: 'badge', cell: (b) => <StatusBadge info={BATCH_STATUS[b.status]} /> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Produção"
        title="Saída para abate"
        subtitle="Registre o abate dos lotes prontos: pesagem, custos do frigorífico e entrada no estoque pós-abate."
        actions={
          <>
            <Button
              icon={<Download className="size-4" />}
              onClick={() =>
                exportCsv('abates', history, [
                  { header: 'Lote', value: (b) => b.code },
                  { header: 'Nome', value: (b) => b.name },
                  { header: 'Data do abate', value: (b) => date(b.slaughterDate) },
                  { header: 'Frigorífico', value: (b) => b.slaughterhouseName },
                  { header: 'GTA', value: (b) => b.gtaNumber },
                  { header: 'Cabeças', value: (b) => b.headCount },
                  { header: 'Peso de saída (kg)', value: (b) => b.exitScaleWeightKg },
                  { header: 'Carcaça (kg)', value: (b) => b.carcassWeightKg },
                  { header: 'Rendimento (%)', value: (b) => b.carcassYieldPercent },
                  { header: 'Quebra de transporte (%)', value: (b) => b.transportLossPercent },
                ])
              }
            >
              Exportar
            </Button>
            {canSlaughter && (
              <Button variant="primary" icon={<Beef className="size-4" />} onClick={() => onStart()}>
                Registrar abate
              </Button>
            )}
          </>
        }
      />

      <StatGrid cols={4} className="mb-6">
        <Stat label="Prontos" value={integer(stats.readyCount)} hint={`${integer(stats.readyHeads)} cabeças vivas`} icon={<Truck className="size-4" />} />
        <Stat
          label="Abates 90d"
          value={integer(stats.recentCount)}
          hint={stats.carcass ? `${kg(Math.round(stats.carcass))} carcaça` : 'nenhum no período'}
          icon={<Beef className="size-4" />}
          tone="accent"
        />
        <Stat
          label="Rendimento"
          value={stats.yieldAvg ? percent(stats.yieldAvg, 2) : '—'}
          hint="média dos últimos 90 dias"
          icon={<Scale className="size-4" />}
          tone={carcassYieldInfo(stats.yieldAvg)?.tone || 'neutral'}
        />
        <Stat
          label="Próx. abate"
          value={stats.nextDue ? date(stats.nextDue).slice(0, 5) : '—'}
          hint={stats.nextDue ? (stats.nextDue < today() ? `${date(stats.nextDue)} · passou` : `${date(stats.nextDue).slice(6)} · em ${daysBetween(today(), stats.nextDue)} dias`) : 'sem previsão'}
          icon={<CalendarClock className="size-4" />}
          tone="info"
        />
      </StatGrid>

      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'ready', label: 'Prontos para abate', count: ready.length },
          { value: 'history', label: 'Histórico de abates', count: history.length },
        ]}
      />

      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder={tab === 'ready' ? 'Buscar lote ou fornecedor…' : 'Buscar lote, frigorífico ou GTA…'} className="sm:w-80" />
      </Toolbar>

      {tab === 'ready' ? (
        <DataTable
          columns={readyCols}
          rows={readyFiltered}
          rowKey={(r) => r.batch.id}
          loading={loading || loadingAnimals}
          initialSort={{ key: 'due', dir: 'asc' }}
          onRowClick={canSlaughter ? (r) => onStart(r.batch.id) : (r) => nav(`/gado/lotes/${r.batch.id}`)}
          empty={
            !ready.length ? (
              <EmptyState
                icon={<Truck className="size-5" />}
                title="Nenhum lote aguardando abate"
                description="Lotes comprados ou em engorda aparecem aqui quando estiverem prontos para o frigorífico."
                action={
                  <Button variant="secondary" onClick={() => nav('/gado/lotes')}>
                    Ver lotes de gado
                  </Button>
                }
              />
            ) : undefined
          }
          emptyTitle="Nenhum lote encontrado"
          emptyDescription="Tente outra busca."
          rowActions={(r) => (
            <Menu
              items={[
                { label: 'Registrar abate', icon: <Beef />, onClick: () => onStart(r.batch.id), hidden: !canSlaughter },
                { label: 'Abrir lote de gado', icon: <ExternalLink />, onClick: () => nav(`/gado/lotes/${r.batch.id}`) },
              ]}
            />
          )}
        />
      ) : (
        <DataTable
          columns={historyCols}
          rows={historyFiltered}
          rowKey={(b) => b.id}
          loading={loading}
          initialSort={{ key: 'date', dir: 'desc' }}
          onRowClick={(b) => nav(`/gado/lotes/${b.id}`)}
          emptyTitle={history.length ? 'Nenhum abate encontrado' : 'Nenhum abate registrado ainda'}
          emptyDescription={history.length ? 'Tente outra busca.' : 'Os abates registrados aparecem aqui com peso, frigorífico e rendimento.'}
          rowActions={(b) => (
            <Menu
              items={[
                { label: 'Abrir lote de gado', icon: <ExternalLink />, onClick: () => nav(`/gado/lotes/${b.id}`) },
                { label: 'Ver estoque pós-abate', icon: <Scissors />, onClick: () => nav(`/producao/estoque-abate?lote=${b.id}`) },
              ]}
            />
          )}
        />
      )}
    </>
  );
}
