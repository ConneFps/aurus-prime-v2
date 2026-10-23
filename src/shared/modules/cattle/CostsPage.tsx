/**
 * Custos e fiscal: lançamentos de todos os lotes (filtros, totais, exportação),
 * lançamento rápido, importação CSV e visão fiscal por lote.
 */
import { Download, FileDown, FileUp, ListPlus, Plus, Receipt, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOps, useSession } from '../../app/session';
import { useAction, useTable } from '../../data/react';
import { date, integer, matchesSearch, money } from '../../domain/format';
import { COST_GROUP_LABELS, optionsOf } from '../../domain/labels';
import type { BatchCost, CostCategory, CostGroup } from '../../domain/types';
import {
  Badge,
  Button,
  cn,
  Combobox,
  createPdf,
  DataTable,
  DateInput,
  exportCsv,
  Menu,
  PageHeader,
  SearchInput,
  Segmented,
  Select,
  Toolbar,
  useConfirm,
  type Column,
} from '../../ui';
import { useBatchOptions } from '../common/lookups';
import { CostGroupChips, useGroupTotals } from './CostGroupChips';
import { CostImportDrawer } from './CostImportDrawer';
import { CostDrawer, QuickCostsDrawer } from './CostForms';
import { FiscalView } from './FiscalView';
import { categoryLabel, COST_CATEGORY_OPTIONS, COST_GROUP_ORDER, COST_SOURCE_LABELS, groupOf, isCreditCategory, isRemovableCost, netCostOf, signedAmount } from './helpers';

type Panel = { kind: 'cost' } | { kind: 'quick'; batchId?: string; template?: 'FISCAL' } | { kind: 'import' } | null;

export function CostsPage() {
  const { can } = useSession();
  const ops = useOps();
  const confirm = useConfirm();
  const canEdit = can('costs.manage');
  const { rows: costs, loading } = useTable('batch_costs');
  const { batches, options: batchOptions } = useBatchOptions();
  const [view, setView] = useState<'list' | 'fiscal'>('list');
  const [panel, setPanel] = useState<Panel>(null);

  const [q, setQ] = useState('');
  const [batchId, setBatchId] = useState<string | null>(null);
  const [group, setGroup] = useState<CostGroup | 'ALL'>('ALL');
  const [category, setCategory] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const batchById = useMemo(() => new Map(batches.map((b) => [b.id, b])), [batches]);
  const base = useMemo(
    () =>
      costs
        .filter((c) => !batchId || c.batchId === batchId)
        .filter((c) => !category || c.category === category)
        .filter((c) => (!from || c.date >= from) && (!to || c.date <= to))
        .filter((c) => matchesSearch([c.description, c.documentNumber, c.partnerName, categoryLabel(c.category), batchById.get(c.batchId)?.code], q)),
    [costs, batchId, category, from, to, q, batchById],
  );
  const groupTotals = useGroupTotals(base);
  const filtered = useMemo(() => base.filter((c) => group === 'ALL' || groupOf(c.category) === group), [base, group]);
  const total = netCostOf(filtered);
  const categoryOptions = useMemo(() => COST_CATEGORY_OPTIONS.filter((o) => group === 'ALL' || groupOf(o.value as CostCategory) === group), [group]);
  const hasFilters = !!(q || batchId || category || from || to || group !== 'ALL');

  const removeOp = useAction((c: BatchCost) => ops.removeBatchCost(c.id), { success: 'Custo removido' });
  const remove = async (c: BatchCost) => {
    if (
      await confirm({
        title: `Remover ${categoryLabel(c.category)} de ${money(c.amount)}?`,
        message: c.financialEntryId ? 'A conta a pagar vinculada (em aberto) também será cancelada.' : 'O custo sai do resultado do lote.',
        danger: true,
        confirmLabel: 'Remover',
      })
    )
      await removeOp.run(c);
  };

  const exportCols = [
    { header: 'Data', value: (c: BatchCost) => date(c.date) },
    { header: 'Lote', value: (c: BatchCost) => batchById.get(c.batchId)?.code || '' },
    { header: 'Grupo', value: (c: BatchCost) => COST_GROUP_LABELS[groupOf(c.category)] },
    { header: 'Categoria', value: (c: BatchCost) => categoryLabel(c.category) },
    { header: 'Descrição', value: (c: BatchCost) => c.description },
    { header: 'Documento', value: (c: BatchCost) => c.documentNumber },
    { header: 'Parceiro', value: (c: BatchCost) => c.partnerName },
    { header: 'Origem', value: (c: BatchCost) => COST_SOURCE_LABELS[c.source] },
  ];
  const sortedForExport = () => [...filtered].sort((a, b) => a.date.localeCompare(b.date));
  const exportPdf = () => {
    const filters = [
      batchId && `Lote ${batchById.get(batchId)?.code}`,
      group !== 'ALL' && COST_GROUP_LABELS[group],
      category && categoryLabel(category as CostCategory),
      (from || to) && `Período ${from ? date(from) : '…'} a ${to ? date(to) : '…'}`,
      q && `Busca "${q}"`,
    ].filter(Boolean);
    const pdf = createPdf({ title: 'Custos de lotes de gado', subtitle: filters.length ? filters.join(' · ') : 'Todos os lançamentos', orientation: 'landscape' });
    const gt = groupTotalsPlain(filtered);
    pdf.keyValues(
      [...COST_GROUP_ORDER.filter((g) => gt.has(g)).map((g) => [COST_GROUP_LABELS[g], money(g === 'CREDIT' ? -gt.get(g)! : gt.get(g)!)] as [string, string]), ['Total líquido', money(total)]],
      { title: 'Totais por grupo' },
    );
    pdf.table(sortedForExport(), [...exportCols.map((c) => ({ ...c })), { header: 'Valor', value: (c: BatchCost) => money(signedAmount(c)), align: 'right' as const }], {
      title: `${filtered.length} lançamentos`,
      foot: ['', '', '', '', '', '', '', 'Total', money(total)],
    });
    pdf.save('custos-lotes');
  };

  const columns: Column<BatchCost>[] = [
    { key: 'date', header: 'Data', sortValue: (c) => c.date, cell: (c) => <span className="num">{date(c.date)}</span> },
    {
      key: 'batch',
      header: 'Lote',
      mobile: 'subtitle',
      sortValue: (c) => batchById.get(c.batchId)?.code || '',
      cell: (c) => {
        const b = batchById.get(c.batchId);
        return b ? (
          <Link to={`/gado/lotes/${b.id}?aba=custos`} className="num hover:text-primary" title={b.name} onClick={(e) => e.stopPropagation()}>
            {b.code}
          </Link>
        ) : (
          '—'
        );
      },
    },
    {
      key: 'category',
      header: 'Categoria',
      mobile: 'title',
      sortValue: (c) => categoryLabel(c.category),
      cell: (c) => (
        <div className="min-w-0">
          <div className="text-fg truncate">{categoryLabel(c.category)}</div>
          {c.description && <div className="text-xs text-muted truncate max-w-[300px]">{c.description}</div>}
        </div>
      ),
    },
    { key: 'group', header: 'Grupo', hideBelow: 'lg', sortValue: (c) => groupOf(c.category), cell: (c) => COST_GROUP_LABELS[groupOf(c.category)] },
    { key: 'doc', header: 'Documento', hideBelow: 'xl', mobile: false, cell: (c) => c.documentNumber || '—' },
    {
      key: 'source',
      header: 'Origem',
      hideBelow: 'md',
      mobile: false,
      cell: (c) => (
        <span className="inline-flex gap-1">
          <Badge size="xs">{COST_SOURCE_LABELS[c.source]}</Badge>
          {c.financialEntryId && (
            <Badge size="xs" tone="info">
              A pagar
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Valor',
      align: 'right',
      mobile: 'badge',
      sortValue: (c) => signedAmount(c),
      cell: (c) => <span className={cn('num font-medium', isCreditCategory(c.category) && 'text-success')}>{money(signedAmount(c))}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Gado"
        title="Custos e fiscal"
        subtitle="Todos os custos dos lotes — aquisição, engorda, abate, impostos e créditos — com importação de planilhas."
        actions={
          <>
            <Menu
              trigger={
                <Button icon={<Download className="size-4" />} disabled={view !== 'list'}>
                  Exportar
                </Button>
              }
              items={[
                { label: 'Planilha (CSV)', icon: <Download />, onClick: () => exportCsv('custos-lotes', sortedForExport(), [...exportCols, { header: 'Valor', value: (c) => signedAmount(c) }]) },
                { label: 'Relatório (PDF)', icon: <FileDown />, onClick: exportPdf },
              ]}
            />
            {canEdit && (
              <>
                <Button icon={<FileUp className="size-4" />} onClick={() => setPanel({ kind: 'import' })}>
                  Importar
                </Button>
                <Button icon={<ListPlus className="size-4" />} onClick={() => setPanel({ kind: 'quick' })}>
                  Lançamento rápido
                </Button>
                <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setPanel({ kind: 'cost' })}>
                  Lançar custo
                </Button>
              </>
            )}
          </>
        }
      />

      <Segmented
        className="mb-5"
        value={view}
        onChange={setView}
        options={[
          { value: 'list', label: 'Lançamentos', count: costs.length },
          { value: 'fiscal', label: 'Fiscal por lote' },
        ]}
      />

      {view === 'fiscal' ? (
        <FiscalView costs={costs} batches={batches} canEdit={canEdit} onLaunch={(id) => setPanel({ kind: 'quick', batchId: id, template: 'FISCAL' })} />
      ) : (
        <>
          <Toolbar>
            <SearchInput value={q} onChange={setQ} placeholder="Buscar descrição, documento, parceiro…" className="sm:w-72" />
            <Combobox value={batchId} onChange={setBatchId} options={batchOptions} allowClear placeholder="Todos os lotes" className="sm:w-64" />
            <Select
              value={group}
              onChange={(v) => {
                setGroup(v);
                setCategory(null);
              }}
              className="sm:w-44"
              options={[{ value: 'ALL' as const, label: 'Todos os grupos' }, ...optionsOf(COST_GROUP_LABELS)]}
            />
            <Combobox value={category} onChange={setCategory} options={categoryOptions} allowClear placeholder="Todas as categorias" className="sm:w-56" />
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <DateInput value={from} onChange={setFrom} aria-label="De" className="sm:w-40" />
              <DateInput value={to} onChange={setTo} aria-label="Até" className="sm:w-40" />
            </div>
            {hasFilters && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setQ('');
                  setBatchId(null);
                  setGroup('ALL');
                  setCategory(null);
                  setFrom('');
                  setTo('');
                }}
              >
                Limpar filtros
              </Button>
            )}
          </Toolbar>

          <CostGroupChips totals={groupTotals} value={group} onChange={setGroup} className="mb-4" />

          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(c) => c.id}
            loading={loading}
            initialSort={{ key: 'date', dir: 'desc' }}
            pageSize={30}
            emptyTitle={costs.length ? 'Nenhum custo neste filtro' : 'Nenhum custo lançado'}
            emptyDescription={costs.length ? 'Ajuste ou limpe os filtros.' : 'Lance custos pelos lotes ou importe uma planilha.'}
            empty={
              !costs.length && !loading ? (
                <div className="py-12 text-center">
                  <Receipt className="size-7 mx-auto text-subtle mb-3" />
                  <p className="text-sm text-muted">Nenhum custo lançado ainda.</p>
                </div>
              ) : undefined
            }
            footer={
              <tr>
                <td className="px-3 first:pl-4 py-2.5 text-sm" colSpan={3}>
                  {integer(filtered.length)} lançamentos · {integer(new Set(filtered.map((c) => c.batchId)).size)} lotes
                </td>
                <td className="hidden lg:table-cell" />
                <td className="hidden xl:table-cell" />
                <td className="hidden md:table-cell" />
                <td className="px-3 py-2.5 text-sm text-right num">{money(total)}</td>
                {canEdit && <td />}
              </tr>
            }
            rowActions={
              canEdit
                ? (c) => (
                    <Menu
                      items={
                        isRemovableCost(c)
                          ? [{ label: 'Remover custo', icon: <Trash2 />, danger: true, onClick: () => void remove(c) }]
                          : [{ label: `Lançado em: ${COST_SOURCE_LABELS[c.source]}`, disabled: true, onClick: () => undefined }]
                      }
                    />
                  )
                : undefined
            }
          />
        </>
      )}

      {canEdit && (
        <>
          <CostDrawer open={panel?.kind === 'cost'} onClose={() => setPanel(null)} />
          <QuickCostsDrawer
            open={panel?.kind === 'quick'}
            onClose={() => setPanel(null)}
            batchId={panel?.kind === 'quick' ? panel.batchId : undefined}
            initialTemplate={panel?.kind === 'quick' && panel.template ? panel.template : 'FISCAL'}
          />
          <CostImportDrawer open={panel?.kind === 'import'} onClose={() => setPanel(null)} />
        </>
      )}
    </>
  );
}

/** Totais por grupo (fora de componente — para o PDF). */
function groupTotalsPlain(costs: BatchCost[]) {
  const m = new Map<CostGroup, number>();
  for (const c of costs) m.set(groupOf(c.category), (m.get(groupOf(c.category)) || 0) + c.amount);
  return m;
}
