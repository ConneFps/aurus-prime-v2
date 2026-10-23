/**
 * Visão fiscal: impostos e taxas (grupo FISCAL) por lote.
 */
import { Download, FileDown, Landmark, ListPlus, Receipt, Scale, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTable } from '../../data/react';
import { integer, matchesSearch, money, percent } from '../../domain/format';
import { BATCH_STATUS } from '../../domain/labels';
import type { Batch, BatchCost, CostCategory } from '../../domain/types';
import { Button, createPdf, DataTable, exportCsv, Menu, SearchInput, Segmented, Stat, StatGrid, StatusBadge, Toolbar, type Column } from '../../ui';
import { groupOf, isActiveBatch, netCostOf } from './helpers';
import { StatMoney, useSmUp } from './Money';

const COLS: { key: string; label: string; cats: CostCategory[] }[] = [
  { key: 'funrural', label: 'Funrural', cats: ['FUNRURAL_PURCHASE', 'FUNRURAL_SALE'] },
  { key: 'icms', label: 'ICMS', cats: ['ICMS_PURCHASE', 'ICMS_SALE'] },
  { key: 'senar', label: 'SENAR', cats: ['SENAR_PURCHASE', 'SENAR_SALE'] },
  { key: 'gta', label: 'GTA', cats: ['GTA_FEE'] },
  { key: 'fees', label: 'Taxas', cats: ['INSPECTION_FEE', 'ENTRY_PROTOCOL'] },
];

interface FiscalRow {
  batch: Batch;
  heads: number;
  byCol: Record<string, number>;
  fiscal: number;
  total: number;
  n: number;
}

export function FiscalView({ costs, batches, canEdit, onLaunch }: { costs: BatchCost[]; batches: Batch[]; canEdit: boolean; onLaunch: (batchId: string) => void }) {
  const nav = useNavigate();
  const sm = useSmUp();
  const { rows: animals } = useTable('animals');
  const [scope, setScope] = useState<'ACTIVE' | 'ALL'>('ALL');
  const [q, setQ] = useState('');

  const rows = useMemo<FiscalRow[]>(() => {
    const heads = new Map<string, number>();
    animals.forEach((a) => heads.set(a.batchId, (heads.get(a.batchId) || 0) + 1));
    const byBatch = new Map<string, BatchCost[]>();
    costs.forEach((c) => byBatch.set(c.batchId, [...(byBatch.get(c.batchId) || []), c]));
    return batches
      .filter((b) => scope === 'ALL' || isActiveBatch(b))
      .filter((b) => matchesSearch([b.code, b.name, b.supplierName], q))
      .map((b) => {
        const list = byBatch.get(b.id) || [];
        const fiscalList = list.filter((c) => groupOf(c.category) === 'FISCAL');
        const byCol = Object.fromEntries(COLS.map((col) => [col.key, fiscalList.filter((c) => col.cats.includes(c.category)).reduce((s, c) => s + c.amount, 0)]));
        return {
          batch: b,
          heads: heads.get(b.id) || b.headCount || 0,
          byCol,
          fiscal: fiscalList.reduce((s, c) => s + c.amount, 0),
          total: netCostOf(list),
          n: fiscalList.length,
        };
      });
  }, [costs, batches, animals, scope, q]);

  const stats = useMemo(() => {
    const fiscal = rows.reduce((s, r) => s + r.fiscal, 0);
    const heads = rows.reduce((s, r) => s + r.heads, 0);
    return { fiscal, heads, perHead: heads ? fiscal / heads : 0, withTaxes: rows.filter((r) => r.fiscal > 0).length };
  }, [rows]);

  const exportRows = () => [...rows].sort((a, b) => a.batch.code.localeCompare(b.batch.code));
  const exportCols = [
    { header: 'Lote', value: (r: FiscalRow) => r.batch.code },
    { header: 'Nome', value: (r: FiscalRow) => r.batch.name },
    { header: 'Cabeças', value: (r: FiscalRow) => r.heads },
    ...COLS.map((c) => ({ header: c.label, value: (r: FiscalRow) => Math.round(r.byCol[c.key] * 100) / 100 })),
    { header: 'Total fiscal', value: (r: FiscalRow) => Math.round(r.fiscal * 100) / 100 },
    { header: 'Por cabeça', value: (r: FiscalRow) => (r.heads ? Math.round((r.fiscal / r.heads) * 100) / 100 : 0) },
  ];

  const columns: Column<FiscalRow>[] = [
    {
      key: 'batch',
      header: 'Lote',
      mobile: 'title',
      sortValue: (r) => r.batch.code,
      cell: (r) => (
        <div className="min-w-0">
          <div className="text-fg truncate max-w-[200px]">{r.batch.name}</div>
          <div className="text-xs text-muted num">{r.batch.code}</div>
        </div>
      ),
    },
    { key: 'status', header: 'Status', mobile: 'badge', hideBelow: 'lg', cell: (r) => <StatusBadge info={BATCH_STATUS[r.batch.status]} /> },
    { key: 'heads', header: 'Cab.', align: 'right', hideBelow: 'md', sortValue: (r) => r.heads, cell: (r) => integer(r.heads) },
    ...COLS.map<Column<FiscalRow>>((c) => ({
      key: c.key,
      header: c.label,
      align: 'right',
      hideBelow: c.key === 'fees' || c.key === 'gta' ? 'xl' : 'lg',
      sortValue: (r) => r.byCol[c.key],
      cell: (r) => (r.byCol[c.key] ? money(r.byCol[c.key]) : <span className="text-subtle">—</span>),
    })),
    { key: 'fiscal', header: 'Total fiscal', align: 'right', mobile: 'subtitle', sortValue: (r) => r.fiscal, cell: (r) => <span className="font-medium">{money(r.fiscal)}</span> },
    { key: 'perHead', header: 'Por cabeça', align: 'right', sortValue: (r) => (r.heads ? r.fiscal / r.heads : 0), cell: (r) => (r.heads ? money(r.fiscal / r.heads) : '—') },
    { key: 'share', header: '% custo', align: 'right', hideBelow: 'md', sortValue: (r) => (r.total ? r.fiscal / r.total : 0), cell: (r) => (r.total ? percent((r.fiscal / r.total) * 100) : '—') },
  ];

  return (
    <>
      <StatGrid cols={4} className="mb-5">
        <Stat label="Impostos e taxas" value={<StatMoney value={stats.fiscal} />} icon={sm && <Landmark className="size-4" />} hint="Funrural, ICMS, SENAR, GTA e taxas" />
        <Stat label="Fiscal por cabeça" value={<StatMoney value={stats.perHead} />} icon={sm && <Scale className="size-4" />} tone="accent" hint="média dos lotes listados" />
        <Stat label="Cabeças" value={integer(stats.heads)} icon={sm && <Users className="size-4" />} tone="info" />
        <Stat label="Lotes com impostos" value={`${stats.withTaxes} de ${rows.length}`} icon={sm && <Receipt className="size-4" />} tone="success" />
      </StatGrid>

      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar lote…" className="sm:w-64" />
        <Segmented
          size="sm"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'ALL', label: 'Todos os lotes' },
            { value: 'ACTIVE', label: 'Ativos' },
          ]}
        />
        <div className="flex gap-2 lg:ml-auto">
          <Button size="sm" variant="ghost" icon={<Download className="size-4" />} onClick={() => exportCsv('fiscal-por-lote', exportRows(), exportCols)}>
            CSV
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<FileDown className="size-4" />}
            onClick={() => {
              const pdf = createPdf({ title: 'Impostos e taxas por lote', subtitle: scope === 'ACTIVE' ? 'Lotes ativos' : 'Todos os lotes', orientation: 'landscape' });
              pdf.keyValues([
                ['Total fiscal', money(stats.fiscal)],
                ['Por cabeça (média)', money(stats.perHead)],
                ['Cabeças', integer(stats.heads)],
                ['Lotes', integer(rows.length)],
              ]);
              pdf.table(
                exportRows(),
                exportCols.map((c, i) => ({ header: c.header, value: (r: FiscalRow) => (i >= 3 ? money(c.value(r) as number) : c.value(r)), align: i >= 2 ? ('right' as const) : undefined })),
              );
              pdf.save('fiscal-por-lote');
            }}
          >
            PDF
          </Button>
        </div>
      </Toolbar>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.batch.id}
        initialSort={{ key: 'batch', dir: 'desc' }}
        onRowClick={(r) => nav(`/gado/lotes/${r.batch.id}?aba=custos`)}
        emptyTitle="Nenhum lote encontrado"
        rowActions={
          canEdit
            ? (r) => (
                <Menu items={[{ label: 'Lançar impostos', icon: <ListPlus />, onClick: () => onLaunch(r.batch.id) }]} />
              )
            : undefined
        }
      />
    </>
  );
}
