/**
 * Bloco "Gerar conta a pagar" — reutilizado em compra de lote, custos e ração.
 */
import { addDays, date, money } from '../../domain/format';
import { optionsOf, PAYMENT_METHOD_LABELS } from '../../domain/labels';
import type { PaymentMethod } from '../../domain/types';
import type { InstallmentPlan } from '../../ops/types';
import { DateInput, Field, FormGrid, Input, NumberInput, Segmented, Select, Switch } from '../../ui';
import { previewInstallments } from './helpers';

export interface PayableDraft {
  enabled: boolean;
  mode: 'TERMS' | 'INSTALLMENTS';
  terms: string;
  installments: number;
  firstDueDate: string;
  method: PaymentMethod | '';
}

export const emptyPayable = (issueDate: string, enabled = false): PayableDraft => ({
  enabled,
  mode: 'TERMS',
  terms: '30',
  installments: 1,
  firstDueDate: addDays(issueDate, 30),
  method: 'BOLETO',
});

export function toPlan(p: PayableDraft): InstallmentPlan | null {
  if (!p.enabled) return null;
  if (p.mode === 'TERMS') {
    if (!p.terms.trim()) throw new Error('Informe os prazos da conta a pagar (ex.: 30/60/90).');
    return { terms: p.terms.trim(), method: p.method || null };
  }
  return { installments: Math.max(1, Math.floor(p.installments || 1)), firstDueDate: p.firstDueDate || null, intervalDays: 30, method: p.method || null };
}

export function PayableFields({
  value,
  onChange,
  amount,
  issueDate,
  label = 'Gerar conta a pagar',
  description = 'Cria as parcelas no financeiro, vinculadas a este lançamento.',
}: {
  value: PayableDraft;
  onChange: (v: PayableDraft) => void;
  amount: number;
  issueDate: string;
  label?: string;
  description?: string;
}) {
  const set = (patch: Partial<PayableDraft>) => onChange({ ...value, ...patch });
  let preview: { dueDate: string; amount: number }[] = [];
  try {
    const plan = value.enabled ? toPlan(value) : null;
    if (plan) preview = previewInstallments(amount, plan, issueDate);
  } catch {
    preview = [];
  }
  return (
    <div className="rounded-card border border-border bg-surface-2/40 p-4 space-y-4">
      <Switch checked={value.enabled} onChange={(v) => set({ enabled: v })} label={<span className="font-medium">{label}</span>} description={description} />
      {value.enabled && (
        <>
          <Segmented
            size="sm"
            value={value.mode}
            onChange={(mode) => set({ mode })}
            options={[
              { value: 'TERMS', label: 'Prazos em dias' },
              { value: 'INSTALLMENTS', label: 'Parcelas mensais' },
            ]}
          />
          <FormGrid cols={value.mode === 'TERMS' ? 2 : 3}>
            {value.mode === 'TERMS' ? (
              <Field label="Prazos (dias)" hint="Separe por barra: 30/60/90">
                <Input value={value.terms} onChange={(e) => set({ terms: e.target.value })} placeholder="30/60/90" inputMode="numeric" />
              </Field>
            ) : (
              <>
                <Field label="Parcelas">
                  <NumberInput value={value.installments} decimals={0} onChange={(v) => set({ installments: v || 1 })} />
                </Field>
                <Field label="1º vencimento">
                  <DateInput value={value.firstDueDate} onChange={(v) => set({ firstDueDate: v })} />
                </Field>
              </>
            )}
            <Field label="Forma de pagamento">
              <Select value={value.method} onChange={(v) => set({ method: v })} placeholder="—" options={optionsOf(PAYMENT_METHOD_LABELS)} />
            </Field>
          </FormGrid>
          {preview.length > 0 && (
            <ul className="text-xs text-muted flex flex-wrap gap-x-4 gap-y-1">
              {preview.map((p, i) => (
                <li key={i} className="num">
                  {preview.length > 1 ? `${i + 1}/${preview.length} · ` : ''}
                  {date(p.dueDate)} · <span className="text-fg font-medium">{money(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
