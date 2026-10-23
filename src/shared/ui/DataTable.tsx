import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { cn } from './Button';
import { EmptyState, Skeleton } from './layout';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T, index: number) => React.ReactNode;
  /** Valor para ordenação (habilita clique no cabeçalho). */
  sortValue?: (row: T) => string | number | null | undefined;
  align?: 'left' | 'right' | 'center';
  width?: string;
  className?: string;
  /** Esconde a coluna abaixo deste breakpoint (desktop). */
  hideBelow?: 'md' | 'lg' | 'xl';
  /** No celular: 'title' vira o título do cartão; false esconde. */
  mobile?: 'title' | 'subtitle' | 'badge' | false;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  empty?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  pageSize?: number;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  /** Linha de totais (renderizada no rodapé). */
  footer?: React.ReactNode;
  /** Ações por linha (menu, botões) — última coluna. */
  rowActions?: (row: T) => React.ReactNode;
  selectable?: boolean;
  selected?: Set<string>;
  onSelectedChange?: (s: Set<string>) => void;
  rowClassName?: (row: T) => string | undefined;
  dense?: boolean;
  className?: string;
  /** Sem cartão/borda externa (quando já está dentro de um Card). */
  bare?: boolean;
}

const hideCls = { md: 'hidden md:table-cell', lg: 'hidden lg:table-cell', xl: 'hidden xl:table-cell' };

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  loading,
  empty,
  emptyTitle = 'Nenhum registro',
  emptyDescription,
  pageSize = 25,
  initialSort,
  footer,
  rowActions,
  selectable,
  selected,
  onSelectedChange,
  rowClassName,
  dense,
  className,
  bare,
}: DataTableProps<T>) {
  const [sort, setSort] = useState(initialSort);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const mult = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      if (va === vb) return 0;
      if (va === null || va === undefined || va === '') return 1;
      if (vb === null || vb === undefined || vb === '') return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mult;
      return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true }) * mult;
    });
  }, [rows, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  useEffect(() => {
    if (page >= pages) setPage(0);
  }, [pages, page]);
  const visible = sorted.slice(page * pageSize, page * pageSize + pageSize);

  const toggleSort = (c: Column<T>) => {
    if (!c.sortValue) return;
    setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'asc' }));
  };

  const allSel = selectable && visible.length > 0 && visible.every((r) => selected?.has(rowKey(r)));
  const toggleAll = () => {
    const s = new Set(selected);
    if (allSel) visible.forEach((r) => s.delete(rowKey(r)));
    else visible.forEach((r) => s.add(rowKey(r)));
    onSelectedChange?.(s);
  };
  const toggleOne = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    onSelectedChange?.(s);
  };

  const wrap = bare ? '' : 'bg-surface border border-border rounded-card shadow-card overflow-hidden';

  if (loading) {
    return (
      <div className={cn(wrap, 'p-4 space-y-3', className)}>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (!rows.length) {
    return <div className={cn(wrap, className)}>{empty ?? <EmptyState icon={<Inbox className="size-5" />} title={emptyTitle} description={emptyDescription} />}</div>;
  }

  const titleCol = columns.find((c) => c.mobile === 'title') || columns[0];
  const subCol = columns.find((c) => c.mobile === 'subtitle');
  const badgeCol = columns.find((c) => c.mobile === 'badge');
  const restCols = columns.filter((c) => c !== titleCol && c !== subCol && c !== badgeCol && c.mobile !== false);

  return (
    <div className={cn(wrap, className)}>
      {/* Desktop / tablet */}
      <div className="hidden sm:block scroll-x">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2/60">
              {selectable && (
                <th className="w-10 px-3">
                  <input type="checkbox" className="size-4 accent-[var(--primary)] cursor-pointer" checked={!!allSel} onChange={toggleAll} aria-label="Selecionar todos" />
                </th>
              )}
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={{ width: c.width }}
                  onClick={() => toggleSort(c)}
                  className={cn(
                    'px-3 first:pl-4 text-[11px] font-semibold uppercase tracking-wider text-muted whitespace-nowrap select-none',
                    dense ? 'h-9' : 'h-10',
                    c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left',
                    c.sortValue && 'cursor-pointer hover:text-fg',
                    c.hideBelow && hideCls[c.hideBelow],
                  )}
                >
                  <span className={cn('inline-flex items-center gap-1', c.align === 'right' && 'flex-row-reverse')}>
                    {c.header}
                    {sort?.key === c.key && (sort.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                  </span>
                </th>
              ))}
              {rowActions && <th className="w-12" />}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => {
              const id = rowKey(r);
              return (
                <tr
                  key={id}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  className={cn(
                    'border-b border-border last:border-b-0 transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-surface-2/70',
                    selected?.has(id) && 'bg-primary-soft/40',
                    rowClassName?.(r),
                  )}
                >
                  {selectable && (
                    <td className="px-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="size-4 accent-[var(--primary)] cursor-pointer" checked={!!selected?.has(id)} onChange={() => toggleOne(id)} aria-label="Selecionar" />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        'px-3 first:pl-4 align-middle',
                        dense ? 'py-2' : 'py-2.5',
                        c.align === 'right' ? 'text-right num' : c.align === 'center' ? 'text-center' : 'text-left',
                        c.hideBelow && hideCls[c.hideBelow],
                        c.className,
                      )}
                    >
                      {c.cell(r, i)}
                    </td>
                  ))}
                  {rowActions && (
                    <td className="px-2 text-right" onClick={(e) => e.stopPropagation()}>
                      {rowActions(r)}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          {footer && <tfoot className="border-t border-border-strong bg-surface-2/60 font-semibold">{footer}</tfoot>}
        </table>
      </div>

      {/* Celular: cartões */}
      <ul className="sm:hidden divide-y divide-border">
        {visible.map((r, i) => {
          const id = rowKey(r);
          return (
            <li key={id} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cn('px-4 py-3', onRowClick && 'active:bg-surface-2')}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-fg truncate">{titleCol.cell(r, i)}</div>
                  {subCol && <div className="text-xs text-muted truncate mt-0.5">{subCol.cell(r, i)}</div>}
                </div>
                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {selectable && (
                    <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={!!selected?.has(id)} onChange={() => toggleOne(id)} />
                  )}
                  {badgeCol && badgeCol.cell(r, i)}
                  {rowActions?.(r)}
                </div>
              </div>
              {restCols.length > 0 && (
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {restCols.map((c) => (
                    <div key={c.key} className="min-w-0">
                      <dt className="text-[10px] uppercase tracking-wider text-subtle">{c.header}</dt>
                      <dd className={cn('text-[13px] text-fg truncate', c.align === 'right' && 'num')}>{c.cell(r, i)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          );
        })}
      </ul>

      {pages > 1 && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-border text-xs text-muted">
          <span className="num">
            {page * pageSize + 1}–{Math.min(sorted.length, (page + 1) * pageSize)} de {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              className="size-8 inline-flex items-center justify-center rounded-control hover:bg-surface-2 disabled:opacity-30 cursor-pointer"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              aria-label="Página anterior"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="num px-2">
              {page + 1} / {pages}
            </span>
            <button
              className="size-8 inline-flex items-center justify-center rounded-control hover:bg-surface-2 disabled:opacity-30 cursor-pointer"
              disabled={page >= pages - 1}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Próxima página"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Célula de rodapé para totais: <TotalCell colSpan={3}>Total</TotalCell> */
export function FooterCell({ children, align, colSpan, className }: { children?: React.ReactNode; align?: 'left' | 'right'; colSpan?: number; className?: string }) {
  return (
    <td colSpan={colSpan} className={cn('px-3 first:pl-4 py-2.5 text-sm', align === 'right' ? 'text-right num' : 'text-left', className)}>
      {children}
    </td>
  );
}
