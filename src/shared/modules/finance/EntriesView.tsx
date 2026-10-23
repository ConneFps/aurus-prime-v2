/**
 * Lista de contas (a receber ou a pagar) com filtros, seleção e baixa em lote.
 */
import { Ban, Banknote, Download, Eye, FileDown, FileText, Filter, Pencil, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../app/session';
import { date, matchesSearch, money } from '../../domain/format';
import { COMPANY_LABELS, ENTRY_CATEGORY_LABELS, optionsOf } from '../../domain/labels';
import type { CompanyCode, EntryCategory, FinancialEntry, Profile } from '../../domain/types';
import { Button, Combobox, DataTable, DateInput, FooterCell, Menu, SearchInput, Segmented, Select, Toolbar, type ComboOption, type Column } from '../../ui';
import { exportEntriesCsv, exportEntriesPdf } from './exports';
import { balanceOf, entryState, inRange, partyKey, PERIOD_OPTIONS, presetRange, sum, type EntryState, type PeriodPreset } from './helpers';
import { useCancelEntry } from './hooks';
import { DueCell, EntryBadge } from './parts';

export type StatusFilter = 'ACTIVE' | EntryState | 'ALL';

export interface EntryFilters {
  q: string;
  period: PeriodPreset;
  from: string;
  to: string;
  status: StatusFilter;
  category: EntryCategory | '';
  party: string | null;
  sellerId: string;
  company: CompanyCode | '';
}

export const DEFAULT_FILTERS: EntryFilters = {
  q: '',
  period: 'ALL',
  from: '',
  to: '',
  status: 'ACTIVE',
  category: '',
  party: null,
  sellerId: '',
  company: '',
};

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'ACTIVE', label: 'Em aberto (todas)' },
  { value: 'OPEN', label: 'A vencer' },
  { value: 'OVERDUE', label: 'Vencidas' },
  { value: 'PAID', label: 'Pagas' },
  { value: 'CANCELLED', label: 'Canceladas' },
  { value: 'ALL', label: 'Todas' },
];

export function applyFilters(rows: FinancialEntry[], f: EntryFilters): FinancialEntry[] {
  const range = presetRange(f.period, { from: f.from, to: f.to });
  return rows.filter((e) => {
    const st = entryState(e);
    if (f.period === 'OVERDUE' && st !== 'OVERDUE') return false;
    if (!inRange(e.dueDate, range)) return false;
    if (f.status === 'ACTIVE' ? st !== 'OPEN' && st !== 'OVERDUE' : f.status !== 'ALL' && st !== f.status) return false;
    if (f.category && e.category !== f.category) return false;
    if (f.party && partyKey(e) !== f.party) return false;
    if (f.sellerId && e.sellerId !== f.sellerId) return false;
    if (f.company && e.company !== f.company) return false;
    return matchesSearch([e.partyName, e.description, e.saleNumber, e.documentNumber, e.barcode], f.q);
  });
}

export function EntriesView({
  direction,
  entries,
  loading,
  sellers,
  filters,
  onFilters,
  onOpen,
  onEdit,
  onPay,
}: {
  direction: 'IN' | 'OUT';
  entries: FinancialEntry[];
  loading: boolean;
  sellers: Profile[];
  filters: EntryFilters;
  onFilters: (f: EntryFilters) => void;
  onOpen: (e: FinancialEntry) => void;
  onEdit: (e: FinancialEntry) => void;
  onPay: (e: FinancialEntry[]) => void;
}) {
  const { can } = useSession();
  const canPay = can('finance.pay');
  const canManage = can('finance.manage');
  const cancel = useCancelEntry();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [more, setMore] = useState(false);
  const f = filters;
  const set = (p: Partial<EntryFilters>) => onFilters({ ...f, ...p });
  const isIn = direction === 'IN';

  const rows = useMemo(() => applyFilters(entries, f), [entries, f]);

  const partyOptions = useMemo<ComboOption[]>(() => {
    const m = new Map<string, { label: string; open: number }>();
    for (const e of entries) {
      const k = partyKey(e);
      const cur = m.get(k) || { label: e.partyName, open: 0 };
      cur.open += balanceOf(e);
      m.set(k, cur);
    }
    return [...m.entries()]
      .sort((a, b) => a[1].label.localeCompare(b[1].label, 'pt-BR'))
      .map(([value, v]) => ({ value, label: v.label, right: v.open > 0 ? money(v.open) : undefined }));
  }, [entries]);

  const sellerName = useMemo(() => new Map(sellers.map((s) => [s.id, s.name])), [sellers]);
  /** Venda: categoria + vendedor (a descrição repete pedido e cliente); demais: a descrição. */
  const describe = (e: FinancialEntry) =>
    e.saleId ? [ENTRY_CATEGORY_LABELS[e.category], e.sellerId ? sellerName.get(e.sellerId) : null].filter(Boolean).join(' · ') : e.description;
  const extraCount = [f.category, f.party, f.sellerId, f.company].filter(Boolean).length;

  const selRows = rows.filter((e) => selected.has(e.id) && e.status === 'OPEN');
  const selTotal = sum(selRows, balanceOf);

  const columns: Column<FinancialEntry>[] = [
    { key: 'due', header: 'Vencimento', sortValue: (e) => e.dueDate, cell: (e) => <DueCell entry={e} />, width: '120px' },
    {
      key: 'party',
      header: isIn ? 'Cliente' : 'Fornecedor',
      mobile: 'title',
      sortValue: (e) => e.partyName,
      cell: (e) => (
        <div className="min-w-0 max-w-[200px]">
          <div className="font-medium text-fg truncate">{e.partyName}</div>
          <div className="text-xs text-muted truncate max-sm:hidden xl:hidden">{describe(e)}</div>
        </div>
      ),
    },
    {
      key: 'desc',
      header: 'Descrição',
      mobile: 'subtitle',
      hideBelow: 'xl',
      cell: (e) => (
        <div className={isIn ? 'min-w-0 max-w-[190px]' : 'min-w-0 max-w-[280px]'}>
          <div className="truncate text-fg">{describe(e)}</div>
          {e.documentNumber && <div className="text-xs text-subtle truncate">Doc. {e.documentNumber}</div>}
        </div>
      ),
    },
    {
      key: 'sale',
      header: 'Venda',
      hideBelow: 'md',
      sortValue: (e) => e.saleNumber || '',
      cell: (e) =>
        e.saleId ? (
          <Link to={`/vendas/${e.saleId}`} onClick={(ev) => ev.stopPropagation()} className="text-primary hover:underline num">
            {e.saleNumber || 'Abrir'}
          </Link>
        ) : (
          <span className="text-subtle">—</span>
        ),
    },
    {
      key: 'inst',
      header: 'Parcela',
      align: 'center',
      cell: (e) => (
        <span className="num text-muted">
          {e.installment}/{e.installments}
        </span>
      ),
    },
    { key: 'amount', header: 'Valor', align: 'right', mobile: false, sortValue: (e) => e.amount, cell: (e) => money(e.amount) },
    {
      key: 'paid',
      header: 'Pago',
      align: 'right',
      hideBelow: 'xl',
      mobile: false,
      sortValue: (e) => e.paidAmount || 0,
      cell: (e) => (e.paidAmount ? <span className="text-success">{money(e.paidAmount)}</span> : <span className="text-subtle">—</span>),
    },
    {
      key: 'balance',
      header: 'Saldo',
      align: 'right',
      sortValue: (e) => balanceOf(e),
      cell: (e) => {
        const b = balanceOf(e);
        return b > 0 ? (
          <span className={entryState(e) === 'OVERDUE' ? 'font-semibold text-danger' : 'font-semibold text-fg'}>{money(b)}</span>
        ) : (
          <span className="text-subtle">—</span>
        );
      },
    },
    { key: 'status', header: 'Status', mobile: 'badge', sortValue: (e) => entryState(e), cell: (e) => <EntryBadge entry={e} /> },
  ];

  const sel = canPay ? 1 : 0;
  const footer = rows.length ? (
    <tr>
      <FooterCell colSpan={sel + 2}>
        Total · {rows.length} {rows.length === 1 ? 'lançamento' : 'lançamentos'}
      </FooterCell>
      <FooterCell className="hidden xl:table-cell" />
      {isIn && <FooterCell className="hidden md:table-cell" />}
      <FooterCell />
      <FooterCell align="right">{money(sum(rows, (e) => e.amount))}</FooterCell>
      <FooterCell align="right" className="hidden xl:table-cell">
        {money(sum(rows, (e) => e.paidAmount || 0))}
      </FooterCell>
      <FooterCell align="right">{money(sum(rows, balanceOf))}</FooterCell>
      <FooterCell />
      <FooterCell />
    </tr>
  ) : undefined;

  const title = isIn ? 'Contas a receber' : 'Contas a pagar';
  const file = isIn ? 'contas-a-receber' : 'contas-a-pagar';

  return (
    <div>
      <Toolbar>
        <SearchInput value={f.q} onChange={(q) => set({ q })} placeholder="Buscar cliente, pedido, documento…" className="sm:w-64" />
        <Segmented size="sm" value={f.period} onChange={(period) => set({ period })} options={PERIOD_OPTIONS} />
        <Select value={f.status} onChange={(status) => set({ status })} options={STATUS_OPTIONS} className="sm:w-48" />
        <div className="flex items-center gap-2 sm:ml-auto">
          <Button size="sm" variant={more || extraCount ? 'subtle' : 'ghost'} icon={<Filter className="size-4" />} onClick={() => setMore((m) => !m)}>
            Filtros{extraCount ? ` (${extraCount})` : ''}
          </Button>
          <Menu
            trigger={
              <Button size="sm" variant="ghost" icon={<Download className="size-4" />}>
                Exportar
              </Button>
            }
            items={[
              { label: 'Planilha (CSV)', icon: <FileText />, onClick: () => exportEntriesCsv(file, rows) },
              {
                label: 'Relatório em PDF',
                icon: <FileDown />,
                onClick: () => exportEntriesPdf(title, describeFilters(f), rows, file),
              },
            ]}
          />
        </div>
      </Toolbar>

      {f.period === 'CUSTOM' && (
        <Toolbar>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted w-16 sm:w-auto">Vence de</span>
            <DateInput value={f.from} onChange={(from) => set({ from })} className="sm:w-40" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted w-16 sm:w-auto">até</span>
            <DateInput value={f.to} onChange={(to) => set({ to })} className="sm:w-40" />
          </div>
        </Toolbar>
      )}

      {(more || extraCount > 0) && (
        <Toolbar className="rounded-card border border-border bg-surface-2/40 p-3">
          <Select
            value={f.category}
            onChange={(category) => set({ category })}
            placeholder="Todas as categorias"
            options={optionsOf(ENTRY_CATEGORY_LABELS)}
            className="sm:w-48"
          />
          <div className="sm:w-64">
            <Combobox
              value={f.party}
              onChange={(party) => set({ party })}
              options={partyOptions}
              placeholder={isIn ? 'Todos os clientes' : 'Todos os fornecedores'}
              allowClear
            />
          </div>
          {isIn && (
            <Select
              value={f.sellerId}
              onChange={(sellerId) => set({ sellerId })}
              placeholder="Todos os vendedores"
              options={sellers.map((s) => ({ value: s.id, label: s.name }))}
              className="sm:w-48"
            />
          )}
          <Select
            value={f.company}
            onChange={(company) => set({ company })}
            placeholder="Todas as empresas"
            options={optionsOf(COMPANY_LABELS)}
            className="sm:w-48"
          />
          {extraCount > 0 && (
            <Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={() => set({ category: '', party: null, sellerId: '', company: '' })}>
              Limpar
            </Button>
          )}
        </Toolbar>
      )}

      {selRows.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-card border border-primary/30 bg-primary-soft px-4 py-2.5">
          <span className="text-sm text-fg">
            <strong className="num">{selRows.length}</strong> {selRows.length === 1 ? 'parcela selecionada' : 'parcelas selecionadas'} · saldo{' '}
            <strong className="num">{money(selTotal)}</strong>
          </span>
          <div className="flex gap-2 ml-auto">
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Limpar
            </Button>
            <Button size="sm" variant="primary" icon={<Banknote className="size-4" />} onClick={() => onPay(selRows)}>
              {isIn ? 'Receber' : 'Pagar'} selecionadas
            </Button>
          </div>
        </div>
      )}

      <div className="sm:hidden mb-2 flex items-baseline justify-between text-xs text-muted px-1">
        <span>
          {rows.length} {rows.length === 1 ? 'lançamento' : 'lançamentos'}
        </span>
        <span>
          Saldo <strong className="num text-fg">{money(sum(rows, balanceOf))}</strong>
        </span>
      </div>

      <DataTable
        columns={isIn ? columns : columns.filter((c) => c.key !== 'sale')}
        rows={rows}
        rowKey={(e) => e.id}
        loading={loading}
        key={f.status === 'PAID' ? 'paid' : 'open'}
        initialSort={{ key: 'due', dir: f.status === 'PAID' ? 'desc' : 'asc' }}
        onRowClick={onOpen}
        selectable={canPay}
        selected={selected}
        onSelectedChange={setSelected}
        footer={footer}
        emptyTitle={entries.length ? 'Nenhuma conta com esses filtros' : isIn ? 'Nenhuma conta a receber' : 'Nenhuma conta a pagar'}
        emptyDescription={
          entries.length
            ? 'Ajuste o período, o status ou limpe os filtros.'
            : isIn
              ? 'As parcelas das vendas aprovadas aparecem aqui automaticamente.'
              : 'Lance despesas manualmente ou pelos custos de lote e compras de ração.'
        }
        rowActions={(e) => (
          <Menu
            items={[
              { label: isIn ? 'Receber' : 'Pagar', icon: <Banknote />, onClick: () => onPay([e]), hidden: !canPay || e.status !== 'OPEN' },
              { label: 'Detalhes e pagamentos', icon: <Eye />, onClick: () => onOpen(e) },
              { label: 'Editar vencimento/valor', icon: <Pencil />, onClick: () => onEdit(e), hidden: !canManage || e.status !== 'OPEN' },
              'divider',
              {
                label: 'Cancelar parcela',
                icon: <Ban />,
                danger: true,
                onClick: () => void cancel.run(e),
                hidden: !canManage || e.status !== 'OPEN' || (e.paidAmount || 0) > 0.005,
              },
            ]}
          />
        )}
      />
    </div>
  );
}

function describeFilters(f: EntryFilters): string {
  const parts: string[] = [];
  const r = presetRange(f.period, { from: f.from, to: f.to });
  if (f.period === 'OVERDUE') parts.push('Somente vencidas');
  else if (r.from || r.to) parts.push(`Vencimento ${r.from ? date(r.from) : '…'} a ${r.to ? date(r.to) : '…'}`);
  parts.push(STATUS_OPTIONS.find((s) => s.value === f.status)?.label || '');
  if (f.category) parts.push(ENTRY_CATEGORY_LABELS[f.category]);
  if (f.company) parts.push(COMPANY_LABELS[f.company]);
  if (f.q) parts.push(`Busca: "${f.q}"`);
  return parts.filter(Boolean).join(' · ');
}
