/**
 * Peças visuais reaproveitadas no módulo: foto do animal e plano de parcelas.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useBackend } from '../../data/react';
import { date, initials, money } from '../../domain/format';
import { optionsOf, PAYMENT_METHOD_LABELS } from '../../domain/labels';
import type { Attachment, Equine, PaymentMethod } from '../../domain/types';
import { buildInstallments } from '../../ops/impl/common';
import type { InstallmentPlan } from '../../ops/types';
import { cn, DateInput, Field, FormGrid, Input, NumberInput, Segmented, Select } from '../../ui';

/** URL exibível de um anexo (usa url direta ou pede ao storage). */
export function useAttachmentUrl(att?: Pick<Attachment, 'path' | 'url'> | null) {
  const { storage } = useBackend();
  const [url, setUrl] = useState<string | null>(att?.url || null);
  const path = att?.path;
  const direct = att?.url;
  useEffect(() => {
    let alive = true;
    if (!path && !direct) {
      setUrl(null);
      return;
    }
    if (direct) {
      setUrl(direct);
      return;
    }
    storage
      .url({ path: path as string, url: null })
      .then((u) => alive && setUrl(u || null))
      .catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
  }, [path, direct, storage]);
  return url;
}

/** Foto principal do animal (photos[0]) ou monograma. */
export function EquinePhoto({
  equine,
  photo,
  className,
  rounded = 'rounded-card',
  textSize = 'text-2xl',
}: {
  equine: Pick<Equine, 'name' | 'photos'>;
  photo?: Attachment | null;
  className?: string;
  rounded?: string;
  textSize?: string;
}) {
  const att = photo ?? equine.photos?.[0] ?? null;
  const url = useAttachmentUrl(att);
  if (url)
    return <img src={url} alt={equine.name} loading="lazy" className={cn('object-cover bg-surface-2 shrink-0', rounded, className)} />;
  return (
    <div className={cn('bg-primary-soft text-primary font-display font-semibold flex items-center justify-center shrink-0 select-none', rounded, textSize, className)} aria-hidden>
      {initials(equine.name)}
    </div>
  );
}

/** Miniatura de um anexo de imagem (galeria). */
export function PhotoThumb({ att, onOpen, className }: { att: Attachment; onOpen?: () => void; className?: string }) {
  const url = useAttachmentUrl(att);
  return (
    <button
      type="button"
      onClick={onOpen ?? (() => url && window.open(url, '_blank', 'noopener'))}
      className={cn('block overflow-hidden rounded-control border border-border bg-surface-2 cursor-pointer hover:border-primary/60', className)}
      title={att.name}
    >
      {url ? <img src={url} alt={att.name} loading="lazy" className="size-full object-cover" /> : <span className="text-xs text-subtle">{att.name}</span>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Plano de parcelas (venda de equino / compra de sêmen)
// ---------------------------------------------------------------------------

export interface PlanDraft {
  mode: 'INSTALLMENTS' | 'TERMS';
  installments: number;
  firstDueDate: string;
  intervalDays: number;
  terms: string;
  method: PaymentMethod | '';
}

export const emptyPlan = (issueDate: string, method: PaymentMethod = 'PIX'): PlanDraft => ({
  mode: 'INSTALLMENTS',
  installments: 1,
  firstDueDate: issueDate,
  intervalDays: 30,
  terms: '30/60/90',
  method,
});

export function toPlan(p: PlanDraft): InstallmentPlan {
  if (p.mode === 'TERMS') {
    if (!p.terms.trim()) throw new Error('Informe os prazos das parcelas (ex.: 30/60/90).');
    return { terms: p.terms.trim(), method: p.method || null };
  }
  const n = Math.floor(p.installments || 1);
  if (n < 1 || n > 120) throw new Error('Número de parcelas deve ser de 1 a 120.');
  return { installments: n, firstDueDate: p.firstDueDate || null, intervalDays: p.intervalDays || 30, method: p.method || null };
}

export function previewPlan(total: number, p: PlanDraft, issueDate: string) {
  if (!(total > 0) || !issueDate) return [];
  try {
    return buildInstallments(total, toPlan(p), issueDate);
  } catch {
    return [];
  }
}

export function PlanFields({ value, onChange, total, issueDate, title = 'Parcelas' }: { value: PlanDraft; onChange: (v: PlanDraft) => void; total: number; issueDate: string; title?: string }) {
  const set = (patch: Partial<PlanDraft>) => onChange({ ...value, ...patch });
  const preview = previewPlan(total, value, issueDate);
  return (
    <div className="space-y-4">
      <Segmented
        size="sm"
        value={value.mode}
        onChange={(mode) => set({ mode })}
        options={[
          { value: 'INSTALLMENTS', label: 'Parcelas mensais' },
          { value: 'TERMS', label: 'Prazos em dias' },
        ]}
      />
      <FormGrid cols={value.mode === 'TERMS' ? 2 : 4}>
        {value.mode === 'TERMS' ? (
          <Field label="Prazos (dias)" hint="Separe por barra: 30/60/90">
            <Input value={value.terms} onChange={(e) => set({ terms: e.target.value })} placeholder="30/60/90" inputMode="numeric" />
          </Field>
        ) : (
          <>
            <Field label="Nº de parcelas">
              <NumberInput value={value.installments} decimals={0} onChange={(v) => set({ installments: v || 1 })} />
            </Field>
            <Field label="1º vencimento">
              <DateInput value={value.firstDueDate} onChange={(v) => set({ firstDueDate: v })} />
            </Field>
            <Field label="Intervalo">
              <NumberInput value={value.intervalDays} decimals={0} suffix="dias" onChange={(v) => set({ intervalDays: v || 30 })} />
            </Field>
          </>
        )}
        <Field label="Forma de pagamento">
          <Select value={value.method} onChange={(v) => set({ method: v })} placeholder="—" options={optionsOf(PAYMENT_METHOD_LABELS)} />
        </Field>
      </FormGrid>
      <div className="rounded-card border border-border bg-surface-2/50">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border text-xs text-muted">
          <span className="font-medium uppercase tracking-wider">{title} — prévia</span>
          <span className="num text-fg font-semibold">{money(total)}</span>
        </div>
        {preview.length ? (
          <ul className="divide-y divide-border max-h-56 overflow-y-auto">
            {preview.map((p) => (
              <li key={p.installment} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
                <span className="text-muted num">
                  {p.installment}/{p.installments}
                </span>
                <span className="num text-muted">{date(p.dueDate)}</span>
                <span className="num font-medium text-fg">{money(p.amount)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-3 py-3 text-sm text-subtle">Informe o valor para ver as parcelas.</p>
        )}
      </div>
    </div>
  );
}

/** true a partir de 640px (breakpoint sm). */
export function useSmUp(): boolean {
  const q = '(min-width: 640px)';
  const [m, setM] = useState(() => (typeof window === 'undefined' ? true : window.matchMedia(q).matches));
  useEffect(() => {
    const mq = window.matchMedia(q);
    const h = () => setM(mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return m;
}

/** Ícones dos indicadores só a partir de 640px (no celular o rótulo precisa do espaço). */
export function useStatIcon() {
  const sm = useSmUp();
  return (n: ReactNode) => (sm ? n : undefined);
}

/** Valor em dinheiro de indicador: fonte menor no celular para não cortar. */
export function MoneyValue({ value }: { value: number }) {
  return <span className="max-sm:text-lg">{money(value)}</span>;
}
