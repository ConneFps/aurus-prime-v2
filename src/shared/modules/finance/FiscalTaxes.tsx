/**
 * Impostos e taxas por lote (custos do grupo FISCAL) e por mês.
 */
import { Download, FileDown, FileText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { date, integer, matchesSearch, money } from '../../domain/format';
import { BATCH_STATUS, COST_CATEGORIES } from '../../domain/labels';
import type { Batch, BatchCost, CostCategory } from '../../domain/types';
import {
  Badge,
  BarsChart,
  Button,
  Card,
  CardHeader,
  createPdf,
  DataTable,
  exportCsv,
  FooterCell,
  Menu,
  SearchInput,
  Segmented,
  Select,
  Stat,
  StatGrid,
  Toolbar,
  type Column,
} from '../../ui';
import { axisMoney, monthRange, shortMonth, sum } from './helpers';
import { StatMoney } from './parts';

export const TAX_COLS: { key: string; label: string; cats: CostCategory[]; slot: number }[] = [
  { key: 'funrural', label: 'Funrural', cats: ['FUNRURAL_PURCHASE', 'FUNRURAL_SALE'], slot: 1 },
  { key: 'icms', label: 'ICMS', cats: ['ICMS_PURCHASE', 'ICMS_SALE'], slot: 2 },
  { key: 'senar', label: 'SENAR', cats: ['SENAR_PURCHASE', 'SENAR_SALE'], slot: 3 },
  { key: 'gta', label: 'GTA', cats: ['GTA_FEE'], slot: 4 },
  { key: 'fees', label: 'Inspeção e taxas', cats: ['INSPECTION_FEE', 'ENTRY_PROTOCOL'], slot: 5 },
];

const colOf = (c: CostCategory) => TAX_COLS.find((t) => t.cats.includes(c))?.key || 'fees';

interface TaxRow {
  id: string;
  batch: Batch | null;
  label: string;
  heads: number;
  by: Record<string, number>;
  total: number;
  credits: number;
  count: number;
}

const emptyBy = () => Object.fromEntries(TAX_COLS.map((t) => [t.key, 0])) as Record<string, number>;

export function FiscalTaxes({ costs, batches, loading }: { costs: BatchCost[]; batches: Batch[]; loading: boolean }) {
  const [year, setYear] = useState<string>('ALL');
  const [view, setView] = useState<'BATCH' | 'MONTH'>('BATCH');
  const [q, setQ] = useState('');

  const fiscal = useMemo(() => costs.filter((c) => COST_CATEGORIES[c.category]?.group === 'FISCAL' || c.category === 'TAX_CREDIT'), [costs]);
  const years = useMemo(() => [...new Set(fiscal.map((c) => c.date.slice(0, 4)))].sort().reverse(), [fiscal]);
  const inYear = useMemo(() => fiscal.filter((c) => year === 'ALL' || c.date.startsWith(year)), [fiscal, year]);

  const byBatch = useMemo<TaxRow[]>(() => {
    const bmap = new Map(batches.map((b) => [b.id, b]));
    const m = new Map<string, TaxRow>();
    for (const c of inYear) {
      const b = bmap.get(c.batchId) || null;
      let r = m.get(c.batchId);
      if (!r) {
        r = {
          id: c.batchId,
          batch: b,
          label: b ? `${b.code} · ${b.name}` : 'Lote removido',
          heads: b?.headCount || 0,
          by: emptyBy(),
          total: 0,
          credits: 0,
          count: 0,
        };
        m.set(c.batchId, r);
      }
      if (c.category === 'TAX_CREDIT') r.credits += c.amount;
      else {
        r.by[colOf(c.category)] += c.amount;
        r.total += c.amount;
      }
      r.count++;
    }
    return [...m.values()];
  }, [inYear, batches]);

  const byMonth = useMemo<TaxRow[]>(() => {
    const m = new Map<string, TaxRow>();
    for (const c of inYear) {
      const ym = c.date.slice(0, 7);
      let r = m.get(ym);
      if (!r) {
        r = { id: ym, batch: null, label: shortMonth(ym), heads: 0, by: emptyBy(), total: 0, credits: 0, count: 0 };
        m.set(ym, r);
      }
      if (c.category === 'TAX_CREDIT') r.credits += c.amount;
      else {
        r.by[colOf(c.category)] += c.amount;
        r.total += c.amount;
      }
      r.count++;
    }
    const keys = [...m.keys()].sort();
    if (!keys.length) return [];
    // Preenche meses sem lançamento para o gráfico ficar contínuo.
    return monthRange(keys[0], keys[keys.length - 1]).map(
      (ym) => m.get(ym) || { id: ym, batch: null, label: shortMonth(ym), heads: 0, by: emptyBy(), total: 0, credits: 0, count: 0 },
    );
  }, [inYear]);

  const rows = view === 'BATCH' ? byBatch.filter((r) => matchesSearch([r.label, r.batch?.supplierName], q)) : byMonth;
  const total = sum(rows, (r) => r.total);
  const heads = sum(byBatch, (r) => r.heads);
  const colTotal = (k: string) => sum(rows, (r) => r.by[k]);

  const columns: Column<TaxRow>[] = [
    view === 'BATCH'
      ? {
          key: 'label',
          header: 'Lote',
          mobile: 'title',
          sortValue: (r) => r.label,
          cell: (r) =>
            r.batch ? (
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Link to={`/gado/lotes/${r.batch.id}`} className="font-medium text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                    {r.batch.code}
                  </Link>
                  <Badge size="xs" tone={BATCH_STATUS[r.batch.status].tone}>
                    {BATCH_STATUS[r.batch.status].label}
                  </Badge>
                </div>
                <div className="text-xs text-muted truncate max-w-[200px]">{r.batch.name}</div>
              </div>
            ) : (
              r.label
            ),
        }
      : { key: 'label', header: 'Mês', mobile: 'title', sortValue: (r) => r.id, cell: (r) => <span className="font-medium">{r.label}</span> },
    ...(view === 'BATCH'
      ? [
          {
            key: 'heads',
            header: 'Cab.',
            align: 'right' as const,
            hideBelow: 'lg' as const,
            mobile: false as const,
            sortValue: (r: TaxRow) => r.heads,
            cell: (r: TaxRow) => integer(r.heads),
          },
        ]
      : []),
    ...TAX_COLS.map<Column<TaxRow>>((t) => ({
      key: t.key,
      header: t.label === 'Inspeção e taxas' ? 'Taxas' : t.label,
      align: 'right',
      hideBelow: t.key === 'gta' || t.key === 'fees' ? 'lg' : t.key === 'senar' ? 'md' : undefined,
      mobile: t.key === 'funrural' || t.key === 'icms' ? undefined : false,
      sortValue: (r) => r.by[t.key],
      cell: (r) => (r.by[t.key] ? money(r.by[t.key]) : <span className="text-subtle">—</span>),
    })),
    { key: 'total', header: 'Total', align: 'right', sortValue: (r) => r.total, cell: (r) => <strong>{money(r.total)}</strong> },
    {
      key: 'credits',
      header: 'Créditos',
      align: 'right',
      hideBelow: 'xl',
      mobile: false,
      sortValue: (r) => r.credits,
      cell: (r) => (r.credits ? <span className="text-success">−{money(r.credits)}</span> : <span className="text-subtle">—</span>),
    },
    ...(view === 'BATCH'
      ? [
          {
            key: 'head',
            header: 'Por cabeça',
            align: 'right' as const,
            sortValue: (r: TaxRow) => (r.heads ? r.total / r.heads : 0),
            cell: (r: TaxRow) => (r.heads ? money(r.total / r.heads) : '—'),
          },
        ]
      : []),
  ];

  const footer = rows.length ? (
    <tr>
      <FooterCell>Total</FooterCell>
      {view === 'BATCH' && (
        <FooterCell align="right" className="hidden lg:table-cell">
          {integer(heads)}
        </FooterCell>
      )}
      {TAX_COLS.map((t) => (
        <FooterCell
          key={t.key}
          align="right"
          className={t.key === 'gta' || t.key === 'fees' ? 'hidden lg:table-cell' : t.key === 'senar' ? 'hidden md:table-cell' : undefined}
        >
          {money(colTotal(t.key))}
        </FooterCell>
      ))}
      <FooterCell align="right">{money(total)}</FooterCell>
      <FooterCell align="right" className="hidden xl:table-cell">
        {money(sum(rows, (r) => r.credits))}
      </FooterCell>
      {view === 'BATCH' && <FooterCell align="right">{heads ? money(total / heads) : '—'}</FooterCell>}
    </tr>
  ) : undefined;

  const exportRows = () =>
    exportCsv(view === 'BATCH' ? 'impostos-por-lote' : 'impostos-por-mes', rows, [
      { header: view === 'BATCH' ? 'Lote' : 'Mês', value: (r) => r.label },
      ...(view === 'BATCH' ? [{ header: 'Cabeças', value: (r: TaxRow) => r.heads }] : []),
      ...TAX_COLS.map((t) => ({ header: t.label, value: (r: TaxRow) => r.by[t.key] })),
      { header: 'Total', value: (r) => r.total },
      { header: 'Créditos', value: (r) => r.credits },
    ]);

  const pdf = () => {
    const doc = createPdf({
      title: 'Impostos e taxas',
      subtitle: `${view === 'BATCH' ? 'Por lote' : 'Por mês'} · ${year === 'ALL' ? 'todo o período' : year}`,
      orientation: 'landscape',
    });
    doc.table(
      rows,
      [
        { header: view === 'BATCH' ? 'Lote' : 'Mês', value: (r) => r.label },
        ...TAX_COLS.map((t) => ({ header: t.label, value: (r: TaxRow) => money(r.by[t.key]), align: 'right' as const, width: 28 })),
        { header: 'Total', value: (r) => money(r.total), align: 'right', width: 30 },
        { header: 'Créditos', value: (r) => money(r.credits), align: 'right', width: 26 },
      ],
      { foot: ['Total', ...TAX_COLS.map((t) => money(colTotal(t.key))), money(total), money(sum(rows, (r) => r.credits))] },
    );
    doc.save(view === 'BATCH' ? 'impostos-por-lote' : 'impostos-por-mes');
  };

  const chartData = byMonth.map((r) => ({ label: r.label, ...r.by }));

  return (
    <div>
      <Toolbar>
        <Segmented
          size="sm"
          value={view}
          onChange={setView}
          options={[
            { value: 'BATCH', label: 'Por lote' },
            { value: 'MONTH', label: 'Por mês' },
          ]}
        />
        <Select
          value={year}
          onChange={setYear}
          options={[{ value: 'ALL', label: 'Todo o período' }, ...years.map((y) => ({ value: y, label: y }))]}
          className="sm:w-44"
        />
        {view === 'BATCH' && <SearchInput value={q} onChange={setQ} placeholder="Buscar lote ou fornecedor…" className="sm:w-64" />}
        <div className="sm:ml-auto">
          <Menu
            trigger={
              <Button size="sm" variant="ghost" icon={<Download className="size-4" />}>
                Exportar
              </Button>
            }
            items={[
              { label: 'Planilha (CSV)', icon: <FileText />, onClick: exportRows },
              { label: 'Relatório em PDF', icon: <FileDown />, onClick: pdf },
            ]}
          />
        </div>
      </Toolbar>

      <StatGrid cols={4} className="mb-6">
        <Stat label="Impostos e taxas" tone="danger" value={<StatMoney value={sum(byMonth, (r) => r.total)} />} hint={`${inYear.length} lançamentos`} />
        <Stat label="Funrural" value={<StatMoney value={sum(byMonth, (r) => r.by.funrural)} />} hint="compra + venda" />
        <Stat label="ICMS" tone="warning" value={<StatMoney value={sum(byMonth, (r) => r.by.icms)} />} hint="compra + venda" />
        <Stat
          label="Média por cabeça"
          tone="info"
          value={heads ? <StatMoney value={sum(byBatch, (r) => r.total) / heads} /> : '—'}
          hint={`${integer(heads)} cabeças · ${byBatch.length} lotes`}
        />
      </StatGrid>

      {chartData.length > 0 && (
        <Card className="mb-6">
          <CardHeader title="Impostos por mês" subtitle="Pela data do lançamento no lote" />
          <BarsChart
            data={chartData}
            xKey="label"
            stacked
            series={TAX_COLS.map((t) => ({ key: t.key, name: t.label, slot: t.slot }))}
            format={money}
            axisFormat={axisMoney}
            height={240}
          />
        </Card>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={loading}
        initialSort={view === 'BATCH' ? { key: 'total', dir: 'desc' } : { key: 'label', dir: 'asc' }}
        footer={footer}
        emptyTitle="Nenhum imposto lançado"
        emptyDescription="Funrural, ICMS, SENAR, GTA e taxas entram pelos custos de cada lote (Gado › Custos)."
      />
      {fiscal.length > 0 && (
        <p className="mt-2 text-xs text-subtle">
          Último lançamento fiscal em{' '}
          {date(
            fiscal
              .map((c) => c.date)
              .sort()
              .pop(),
          )}
        </p>
      )}
    </div>
  );
}
