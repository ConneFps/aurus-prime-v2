import { BarChart3, FileSpreadsheet, FileText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../../app/session';
import { useSettings } from '../../../app/settings';
import { today } from '../../../domain/format';
import { BarsChart, Button, Callout, Card, CardHeader, cn, DataTable, FooterCell, PageHeader, RankBars, Skeleton, Stat, StatGrid, TrendChart, type Column } from '../../../ui';
import { periodOf, useReportData } from './data';
import { axisFormat, columnTotal, formatShort, formatValue, isNumeric, reportCsv, reportPdf } from './format';
import { periodText } from './helpers';
import { FILTER_LABELS, initialFilterState, ReportFiltersCard, type FilterState } from './ReportFiltersCard';
import type { ReportChart, ReportDef, ReportFilters, ReportResult } from './types';

const hideCls = { md: 'hidden md:table-cell', lg: 'hidden lg:table-cell', xl: 'hidden xl:table-cell' } as const;

function toFilters(s: FilterState): ReportFilters {
  const p = periodOf(s.preset, s.custom);
  return {
    from: p.from,
    to: p.to,
    customerId: s.ids.customer || null,
    sellerId: s.ids.seller || null,
    batchId: s.ids.batch || null,
    productId: s.ids.product || null,
    partnerId: s.ids.partner || null,
    userId: s.ids.user || null,
    opts: s.opts,
  };
}

/** Linhas na ordem inicial (mesma ordem da tela) para PDF/CSV. */
function sortedRows<T>(res: ReportResult<T>): T[] {
  const s = res.initialSort;
  const col = s && res.columns.find((c) => c.key === s.key);
  if (!s || !col) return res.rows;
  const mult = s.dir === 'asc' ? 1 : -1;
  return [...res.rows].sort((a, b) => {
    const get = col.sortValue || col.value;
    const va = get(a);
    const vb = get(b);
    if (va === vb) return 0;
    if (va === null || va === undefined || va === '') return 1;
    if (vb === null || vb === undefined || vb === '') return -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mult;
    return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true }) * mult;
  });
}

export function ReportViewer({ def }: { def: ReportDef }) {
  const nav = useNavigate();
  const { can } = useSession();
  const { settings } = useSettings();
  const [state, setState] = useState<FilterState>(() => initialFilterState(def));
  const { data, loading } = useReportData(def.tables);
  const filters = useMemo(() => toFilters(state), [state]);

  // useSettings devolve um objeto novo a cada render — estabiliza pelo conteúdo.
  const settingsKey = JSON.stringify(settings);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ctx = useMemo(() => ({ can, settings, today: today() }), [can, settingsKey]);
  const built = useMemo((): { res: ReportResult<unknown> | null; error: string | null } => {
    if (loading) return { res: null, error: null };
    try {
      return { res: def.build(data, filters, ctx), error: null };
    } catch (e) {
      console.error(e);
      return { res: null, error: (e as Error).message };
    }
  }, [def, data, filters, loading, ctx]);
  const res = built.res;

  const filterText = useMemo(() => {
    const parts: string[] = [];
    if (def.filters.includes('period')) parts.push(`Período: ${periodText(filters)}`);
    for (const [k, v] of Object.entries(state.ids)) if (v) parts.push(`${FILTER_LABELS[k as keyof typeof FILTER_LABELS]}: ${state.labels[k as keyof typeof state.labels] || '—'}`);
    for (const o of def.options || []) {
      const v = state.opts[o.key];
      const c = o.choices.find((x) => x.value === v);
      if (c) parts.push(`${o.label}: ${c.label}`);
    }
    return parts.join(' · ');
  }, [def, filters, state]);

  const columns = useMemo<Column<unknown>[]>(
    () =>
      (res?.columns || []).map((c) => ({
        key: c.key,
        header: c.header,
        align: isNumeric(c.kind) ? 'right' : 'left',
        sortValue: (r) => (c.sortValue || c.value)(r),
        hideBelow: c.hideBelow,
        // No celular, colunas secundárias (escondidas abaixo de lg/xl) saem do cartão.
        mobile: c.mobile ?? (c.hideBelow === 'lg' || c.hideBelow === 'xl' ? false : undefined),
        className: isNumeric(c.kind) ? 'whitespace-nowrap' : undefined,
        cell: (r) => (c.display ? c.display(r) : formatValue(c.value(r), c.kind)),
      })),
    [res],
  );

  const totals = useMemo(() => (res ? res.columns.map((c) => columnTotal(c, res.rows)) : []), [res]);
  const hasTotals = totals.some((t) => t !== null);
  const company = settings.tradeName || settings.companyName;

  return (
    <>
      <PageHeader
        back="/relatorios"
        eyebrow={`Relatórios · ${def.category}`}
        title={def.title}
        subtitle={def.description}
        actions={
          <>
            <Button icon={<FileSpreadsheet className="size-4" />} disabled={!res?.rows.length} onClick={() => res && reportCsv(def.title, { ...res, rows: sortedRows(res) })}>
              Planilha
            </Button>
            <Button
              variant="primary"
              icon={<FileText className="size-4" />}
              disabled={!res?.rows.length}
              onClick={() => res && reportPdf({ title: def.title, subtitle: filterText || def.description, company }, { ...res, rows: sortedRows(res) })}
            >
              PDF
            </Button>
          </>
        }
      />

      <ReportFiltersCard def={def} state={state} onChange={setState} />

      {built.error ? (
        <Callout tone="danger" title="Não foi possível montar o relatório">
          {built.error}
        </Callout>
      ) : !res ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-72" />
        </div>
      ) : (
        <>
          {!!res.stats?.length && (
            <StatGrid cols={4} className="mb-5">
              {res.stats.map((s) => (
                <Stat
                  key={s.label}
                  label={s.label}
                  tone={s.tone}
                  hint={s.hint}
                  value={
                    <span className={cn('max-sm:text-lg', s.tone === 'danger' && 'text-danger', s.tone === 'success' && 'text-success', s.tone === 'warning' && 'text-warning')}>
                      {s.short ? (
                        <>
                          <span className="sm:hidden">{s.short}</span>
                          <span className="max-sm:hidden">{s.value}</span>
                        </>
                      ) : (
                        s.value
                      )}
                    </span>
                  }
                />
              ))}
            </StatGrid>
          )}

          {res.chart && res.rows.length > 0 && <ChartCard chart={res.chart} />}

          <DataTable
            key={JSON.stringify(state.opts) + (state.ids.batch || '')}
            columns={columns}
            rows={res.rows}
            rowKey={(r) => res.rowKey(r, res.rows.indexOf(r))}
            initialSort={res.initialSort}
            pageSize={50}
            onRowClick={res.link ? (r) => {
              const to = res.link!(r);
              if (to) nav(to);
            } : undefined}
            emptyTitle={res.emptyText || 'Nada encontrado com esses filtros'}
            emptyDescription="Amplie o período ou limpe os filtros."
            footer={
              hasTotals ? (
                <tr>
                  {res.columns.map((c, i) => (
                    <FooterCell key={c.key} align={isNumeric(c.kind) ? 'right' : 'left'} className={cn(c.hideBelow && hideCls[c.hideBelow], 'whitespace-nowrap')}>
                      {totals[i] ?? (i === 0 ? 'Total' : '')}
                    </FooterCell>
                  ))}
                </tr>
              ) : undefined
            }
          />

          {hasTotals && res.rows.length > 0 && (
            <Card className="sm:hidden mt-3">
              <div className="text-[11px] uppercase tracking-wider text-subtle font-medium mb-2">Totais</div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                {res.columns.map((c, i) =>
                  totals[i] && i > 0 ? (
                    <div key={c.key} className="min-w-0">
                      <dt className="text-[10px] uppercase tracking-wider text-subtle">{c.header}</dt>
                      <dd className="text-sm font-semibold text-fg num truncate">{totals[i]}</dd>
                    </div>
                  ) : null,
                )}
              </dl>
            </Card>
          )}

          {(res.note || filterText) && (
            <p className="text-xs text-subtle mt-3 leading-relaxed">
              {res.note}
              {res.note && filterText ? ' ' : ''}
              {filterText && <span className="block mt-1">{filterText}</span>}
            </p>
          )}
        </>
      )}
    </>
  );
}

function ChartCard({ chart }: { chart: ReportChart }) {
  const fmt = (v: number) => formatValue(v, chart.format);
  return (
    <Card className="mb-5">
      <CardHeader title={chart.title} icon={<BarChart3 className="size-4" />} />
      {chart.kind === 'rank' ? (
        <RankBars items={chart.data.slice(0, 10).map((d) => ({ label: d.label, value: Number(d[chart.series[0].key]) || 0 }))} format={(v) => formatShort(v, chart.format)} />
      ) : chart.kind === 'trend' ? (
        <TrendChart data={chart.data} xKey="label" series={chart.series} format={fmt} axisFormat={axisFormat(chart.format)} height={240} />
      ) : (
        <BarsChart data={chart.data} xKey="label" series={chart.series} format={fmt} axisFormat={axisFormat(chart.format)} height={240} />
      )}
    </Card>
  );
}
