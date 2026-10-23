/**
 * Acompanhamento do pedido em 5 passos (cliente).
 */
import { AlertCircle, Check } from 'lucide-react';
import type { Sale } from '../../../domain/types';
import { cn } from '../../../ui';
import { trackingSteps, type StepState } from '../lib';

const dot: Record<StepState, string> = {
  done: 'bg-primary text-primary-fg border-primary',
  current: 'bg-surface text-primary border-primary ring-4 ring-primary/15',
  attention: 'bg-warning-soft text-warning border-warning ring-4 ring-warning/15',
  todo: 'bg-surface text-subtle border-border-strong',
};

/** Linha do tempo completa: vertical no celular, horizontal a partir de sm. */
export function StepTracker({ sale }: { sale: Sale }) {
  const steps = trackingSteps(sale);
  const active = steps.find((s) => s.state === 'current' || s.state === 'attention');
  return (
    <div>
      {/* celular */}
      <ol className="sm:hidden relative space-y-0">
        {steps.map((s, i) => (
          <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
            {i < steps.length - 1 && (
              <span className={cn('absolute left-[13px] top-7 bottom-0 w-0.5', s.state === 'done' ? 'bg-primary' : 'bg-border')} aria-hidden />
            )}
            <StepDot state={s.state} n={i + 1} />
            <div className="min-w-0 pt-1">
              <div className={cn('text-sm', s.state === 'todo' ? 'text-subtle' : 'text-fg font-medium')}>{s.label}</div>
              {s.hint && <div className={cn('text-xs mt-0.5', s.state === 'attention' ? 'text-warning' : 'text-muted')}>{s.hint}</div>}
            </div>
          </li>
        ))}
      </ol>
      {/* desktop */}
      <div className="hidden sm:block">
        <ol className="grid grid-cols-5">
          {steps.map((s, i) => (
            <li key={s.key} className="relative flex flex-col items-center text-center px-1">
              {i > 0 && (
                <span
                  className={cn('absolute right-1/2 top-[13px] h-0.5 w-full', s.state === 'todo' ? 'bg-border' : 'bg-primary')}
                  style={{ marginRight: 14 }}
                  aria-hidden
                />
              )}
              <StepDot state={s.state} n={i + 1} />
              <div className={cn('mt-2 text-xs leading-tight', s.state === 'todo' ? 'text-subtle' : 'text-fg font-medium')}>{s.label}</div>
            </li>
          ))}
        </ol>
        {active?.hint && (
          <p className={cn('mt-4 text-sm text-center', active.state === 'attention' ? 'text-warning' : 'text-muted')}>{active.hint}</p>
        )}
      </div>
    </div>
  );
}

function StepDot({ state, n }: { state: StepState; n: number }) {
  return (
    <span className={cn('relative z-[1] size-7 shrink-0 rounded-full border-2 flex items-center justify-center text-xs font-semibold num', dot[state])}>
      {state === 'done' ? <Check className="size-3.5" strokeWidth={3} /> : state === 'attention' ? <AlertCircle className="size-3.5" /> : n}
    </span>
  );
}

/** Barra compacta de 5 segmentos (listas). */
export function MiniTracker({ sale, className }: { sale: Sale; className?: string }) {
  const steps = trackingSteps(sale);
  const cancelled = sale.status === 'CANCELLED' || sale.status === 'REJECTED';
  return (
    <div className={cn('flex gap-1', className)} aria-hidden>
      {steps.map((s) => (
        <span
          key={s.key}
          className={cn(
            'h-1.5 flex-1 rounded-full',
            cancelled
              ? 'bg-danger-soft'
              : s.state === 'done'
                ? 'bg-primary'
                : s.state === 'attention'
                  ? 'bg-warning'
                  : s.state === 'current'
                    ? 'bg-primary/45'
                    : 'bg-surface-3',
          )}
        />
      ))}
    </div>
  );
}
