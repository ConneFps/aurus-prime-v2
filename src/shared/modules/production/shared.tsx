/**
 * Utilitários do módulo de Produção (abate e desossa): rótulos de status,
 * classificação de rendimento, cálculo de pendências e pequenos componentes
 * visuais (passo a passo, métricas ao vivo, barra de composição).
 */
import { Check } from 'lucide-react';
import React from 'react';
import { daysBetween, normalize, percent, today } from '../../domain/format';
import type { LabelInfo, Tone } from '../../domain/labels';
import type { ProcessingOrder, Product, StockLot } from '../../domain/types';
import { cn, Progress, toneText } from '../../ui';

// ---------------------------------------------------------------------------
// Rótulos e regras
// ---------------------------------------------------------------------------

export const PROCESSING_STATUS: Record<ProcessingOrder['status'], LabelInfo> = {
  OPEN: { label: 'Em processamento', tone: 'warning' },
  PARTIAL: { label: 'Retorno parcial', tone: 'info' },
  COMPLETED: { label: 'Concluída', tone: 'success' },
  CANCELLED: { label: 'Cancelada', tone: 'neutral' },
};

/** Rendimento de carcaça (carcaça ÷ peso vivo): ≥ 54% alto, ≥ 50% médio (regra do sistema antigo). */
export function carcassYieldInfo(p: number | null | undefined): LabelInfo | null {
  if (!p || !Number.isFinite(p)) return null;
  if (p >= 54) return { label: 'Alto', tone: 'success' };
  if (p >= 50) return { label: 'Médio', tone: 'warning' };
  return { label: 'Baixo', tone: 'danger' };
}

/** Rendimento da desossa (cortes ÷ enviado): ≥ 72% bom, ≥ 66% atenção. */
export function deboningYieldTone(p: number | null | undefined): Tone {
  if (!p || !Number.isFinite(p)) return 'neutral';
  if (p >= 72) return 'success';
  if (p >= 66) return 'warning';
  return 'danger';
}

export const isOpenOrder = (o: Pick<ProcessingOrder, 'status'>) => o.status === 'OPEN' || o.status === 'PARTIAL';

/** kg ainda não retornados nem declarados como perda. */
export function pendingKg(o: ProcessingOrder): number {
  if (!isOpenOrder(o)) return 0;
  return Math.max(0, Math.round((o.sentKg - o.returnedKg - o.lossKg) * 1000) / 1000);
}

/** Dias de atraso na previsão de retorno (0 = em dia). */
export function overdueDays(o: ProcessingOrder): number {
  if (!isOpenOrder(o) || !o.expectedReturnDate) return 0;
  return Math.max(0, daysBetween(o.expectedReturnDate, today()));
}

/** Custo por kg enviado (matéria-prima + desossa + frete) — mesma regra das operações. */
export function orderCostPerKg(o: Pick<ProcessingOrder, 'sentItems' | 'sentKg' | 'processingCost' | 'freightCost'>): number {
  if (!o.sentKg) return 0;
  const raw = (o.sentItems || []).reduce((s, i) => s + i.qty * (i.unitCost || 0), 0);
  return (raw + (o.processingCost || 0) + (o.freightCost || 0)) / o.sentKg;
}

export const lotAgeDays = (l: Pick<StockLot, 'entryDate'>) => Math.max(0, daysBetween(l.entryDate, today()));

/** Validade padrão de um corte que volta da desossa. */
export const defaultShelfLife = (p: Pick<Product, 'shelfLifeDays'> | null | undefined) => p?.shelfLifeDays || 90;

/** Acha um produto pelo nome (sem acento/maiúsculas). */
export function findProductByName<T extends Pick<Product, 'name'>>(products: T[], ...needles: string[]): T | undefined {
  for (const n of needles) {
    const nn = normalize(n);
    const exact = products.find((p) => normalize(p.name) === nn);
    if (exact) return exact;
    const partial = products.find((p) => normalize(p.name).includes(nn));
    if (partial) return partial;
  }
  return undefined;
}

/** Divisão padrão da carcaça em quartos (%). */
export const DEFAULT_SPLIT = { traseiro: 48, dianteiro: 38, ponta: 14 };

/** Props de coluna numérica (direita, sem quebra de linha). */
export const NUM_COL = { align: 'right' as const, className: 'whitespace-nowrap' };

export const SUGGESTED_CATEGORIES = ['Traseiro', 'Dianteiro', 'Especiais', 'Processados', 'Miúdos', 'Carcaça', 'Outros'];

// ---------------------------------------------------------------------------
// Componentes
// ---------------------------------------------------------------------------

/** Passo a passo horizontal (no celular vira "Passo X de Y" + barra). */
export function Stepper({
  steps,
  current,
  onStep,
  className,
}: {
  steps: { label: string; hint?: string }[];
  current: number;
  /** Permite voltar a um passo já concluído. */
  onStep?: (i: number) => void;
  className?: string;
}) {
  return (
    <nav aria-label="Etapas" className={className}>
      <div className="sm:hidden">
        <div className="flex items-baseline justify-between text-xs mb-1.5">
          <span className="font-semibold text-fg">{steps[current]?.label}</span>
          <span className="text-muted num">
            Passo {current + 1} de {steps.length}
          </span>
        </div>
        <Progress value={current + 1} max={steps.length} />
      </div>
      <ol className="hidden sm:flex items-center gap-2">
        {steps.map((s, i) => {
          const done = i < current;
          const active = i === current;
          const clickable = done && !!onStep;
          return (
            <li key={s.label} className="flex items-center gap-2 min-w-0 flex-1 last:flex-none">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onStep?.(i)}
                className={cn('flex items-center gap-2.5 min-w-0 text-left', clickable ? 'cursor-pointer group' : 'cursor-default')}
                aria-current={active ? 'step' : undefined}
              >
                <span
                  className={cn(
                    'size-7 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold num border transition-colors',
                    done && 'bg-primary border-primary text-primary-fg',
                    active && 'bg-primary-soft border-primary text-primary',
                    !done && !active && 'bg-surface-2 border-border text-muted',
                  )}
                >
                  {done ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className={cn('block text-[13px] font-medium truncate', active ? 'text-fg' : 'text-muted', clickable && 'group-hover:text-fg')}>{s.label}</span>
                  {s.hint && <span className="hidden lg:block text-[11px] text-subtle truncate">{s.hint}</span>}
                </span>
              </button>
              {i < steps.length - 1 && <span className={cn('h-px flex-1 min-w-4', done ? 'bg-primary' : 'bg-border')} aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Número em destaque para painéis de cálculo ao vivo. */
export function Metric({
  label,
  value,
  hint,
  tone,
  className,
  large,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: Tone;
  className?: string;
  large?: boolean;
}) {
  return (
    <div className={cn('rounded-control bg-surface-2 px-3 py-2.5 min-w-0', className)}>
      <div className="text-[10.5px] uppercase tracking-wider text-subtle font-medium truncate">{label}</div>
      <div className={cn('font-semibold num leading-tight mt-0.5 truncate', large ? 'text-xl' : 'text-base', tone ? toneText[tone] : 'text-fg')}>{value}</div>
      {hint && <div className="text-[11px] text-muted mt-0.5 truncate">{hint}</div>}
    </div>
  );
}

export interface StackItem {
  key: string;
  label: string;
  value: number;
  /** Índice da paleta de gráficos (--chart-N). 0 = neutro (pendente). */
  slot: number;
}

/** Barra de composição (100% = total) com legenda — ex.: destino do peso enviado à desossa. */
export function CompositionBar({ items, total, format }: { items: StackItem[]; total: number; format: (v: number) => string }) {
  const visible = items.filter((i) => i.value > 0.0005);
  const bg = (slot: number) => (slot ? `var(--chart-${slot})` : 'var(--surface-3)');
  return (
    <div className="space-y-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2" role="img" aria-label="Composição do peso enviado">
        {visible.map((i) => (
          <span
            key={i.key}
            title={`${i.label}: ${format(i.value)}`}
            className="h-full border-r-2 border-surface last:border-r-0"
            style={{ width: `${Math.max(0.8, (i.value / (total || 1)) * 100)}%`, background: bg(i.slot) }}
          />
        ))}
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
        {items.filter((i) => i.value > 0.0005 || i.key === 'cuts').map((i) => (
          <li key={i.key} className="flex items-center gap-2 min-w-0">
            <span className="size-2.5 rounded-[3px] shrink-0" style={{ background: bg(i.slot) }} />
            <span className="text-muted truncate flex-1">{i.label}</span>
            <span className="num text-fg font-medium">{format(i.value)}</span>
            <span className="num text-subtle text-xs w-12 text-right">{percent(total ? (i.value / total) * 100 : 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
