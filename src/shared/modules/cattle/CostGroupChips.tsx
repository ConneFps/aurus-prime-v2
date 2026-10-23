/** Totais por grupo de custo, clicáveis como filtro. */
import { useMemo } from 'react';
import { money } from '../../domain/format';
import { COST_GROUP_LABELS } from '../../domain/labels';
import type { BatchCost, CostGroup } from '../../domain/types';
import { cn } from '../../ui';
import { COST_GROUP_ORDER, groupOf } from './helpers';

export function useGroupTotals(costs: Pick<BatchCost, 'category' | 'amount'>[]) {
  return useMemo(() => {
    const m = new Map<CostGroup, { n: number; v: number }>();
    for (const c of costs) {
      const g = groupOf(c.category);
      const cur = m.get(g) || { n: 0, v: 0 };
      cur.n++;
      cur.v += Number(c.amount) || 0;
      m.set(g, cur);
    }
    return m;
  }, [costs]);
}

export function CostGroupChips({
  totals,
  value,
  onChange,
  className,
}: {
  totals: Map<CostGroup, { n: number; v: number }>;
  value: CostGroup | 'ALL';
  onChange: (g: CostGroup | 'ALL') => void;
  className?: string;
}) {
  return (
    <div className={cn('grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2', className)}>
      {COST_GROUP_ORDER.filter((g) => totals.has(g)).map((g) => {
        const t = totals.get(g)!;
        return (
          <button
            key={g}
            type="button"
            aria-pressed={value === g}
            onClick={() => onChange(value === g ? 'ALL' : g)}
            className={cn(
              'text-left rounded-control border px-3 py-2 transition-colors cursor-pointer min-w-0',
              value === g ? 'border-primary bg-primary-soft/50' : 'border-border bg-surface hover:border-border-strong',
            )}
          >
            <div className="text-[10px] uppercase tracking-wider text-subtle truncate">{COST_GROUP_LABELS[g]}</div>
            <div className={cn('text-sm font-semibold num truncate', g === 'CREDIT' ? 'text-success' : 'text-fg')}>{money(g === 'CREDIT' ? -t.v : t.v)}</div>
            <div className="text-[11px] text-muted">{t.n} lanç.</div>
          </button>
        );
      })}
    </div>
  );
}
