/**
 * Etapa 4 — pagamento, prazos/parcelas (com prévia) e desconto.
 */
import { useMemo } from 'react';
import { date, money, round2 } from '../../../domain/format';
import { BILLING_LABELS, optionsOf, PAYMENT_METHOD_LABELS } from '../../../domain/labels';
import type { Customer, PaymentMethod } from '../../../domain/types';
import { buildInstallments } from '../../../ops/impl/common';
import { Button, Callout, cn, DateInput, Field, FormGrid, Input, MoneyInput, NumberInput, PercentInput, Segmented, Select } from '../../../ui';
import { NO_CHARGE_METHODS } from '../helpers';
import type { Draft, TermsMode } from './draft';
import { Section } from './Section';

const QUICK_TERMS = [
  { value: '', label: 'À vista' },
  { value: '7', label: '7' },
  { value: '14', label: '14' },
  { value: '21', label: '21' },
  { value: '28', label: '28' },
  { value: '30', label: '30' },
  { value: '28/35/42', label: '28/35/42' },
  { value: '30/60/90', label: '30/60/90' },
];

export function PaymentSection({
  draft,
  patch,
  customer,
  subtotal,
  total,
  error,
}: {
  draft: Draft;
  patch: (p: Partial<Draft>) => void;
  customer: Customer | null;
  subtotal: number;
  total: number;
  error?: string;
}) {
  const allowed = customer?.allowedPaymentMethods?.length ? customer.allowedPaymentMethods : (Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]);
  const methodOptions = optionsOf(PAYMENT_METHOD_LABELS).map((o) => ({ ...o, disabled: !allowed.includes(o.value) }));
  const noCharge = NO_CHARGE_METHODS.includes(draft.paymentMethod);

  const plan = useMemo(
    () =>
      buildInstallments(
        total,
        draft.termsMode === 'TERMS'
          ? { terms: draft.paymentTerms }
          : { installments: draft.installmentsCount, firstDueDate: draft.firstDueDate },
        draft.date,
      ),
    [total, draft.termsMode, draft.paymentTerms, draft.installmentsCount, draft.firstDueDate, draft.date],
  );

  const discountPct = subtotal > 0 ? round2(((draft.discountValue || 0) / subtotal) * 100) : 0;

  return (
    <Section step={4} title="Pagamento" subtitle={customer?.paymentTerms ? `Condição habitual do cliente: ${customer.paymentTerms}` : 'Forma, prazos e desconto.'}>
      <FormGrid>
        <Field label="Forma de pagamento" required error={error} hint={customer?.allowedPaymentMethods?.length ? 'Somente as formas liberadas para este cliente.' : undefined}>
          <Select value={draft.paymentMethod} onChange={(v) => patch({ paymentMethod: v })} options={methodOptions} />
        </Field>
        <Field label="Faturamento">
          <Select value={draft.billingType} onChange={(v) => patch({ billingType: v })} options={optionsOf(BILLING_LABELS)} />
        </Field>
      </FormGrid>

      {noCharge ? (
        <Callout tone="info">{PAYMENT_METHOD_LABELS[draft.paymentMethod]} não gera contas a receber nem comissão.</Callout>
      ) : (
        <>
          <Segmented<TermsMode>
            size="sm"
            value={draft.termsMode}
            onChange={(v) => patch({ termsMode: v })}
            options={[
              { value: 'TERMS', label: 'Prazos em dias' },
              { value: 'INSTALLMENTS', label: 'Parcelas mensais' },
            ]}
          />
          {draft.termsMode === 'TERMS' ? (
            <div className="space-y-2">
              <Field label="Prazos (dias após a data do pedido)" hint='Separe por "/" — ex.: 28/35/42. Vazio = à vista.'>
                <Input value={draft.paymentTerms} onChange={(e) => patch({ paymentTerms: e.target.value.replace(/[^\d/ ,;]/g, '') })} placeholder="À vista" inputMode="numeric" className="num" />
              </Field>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_TERMS.map((t) => (
                  <Button
                    key={t.label}
                    size="xs"
                    variant={draft.paymentTerms.trim() === t.value ? 'primary' : 'subtle'}
                    onClick={() => patch({ paymentTerms: t.value })}
                  >
                    {t.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <FormGrid>
              <Field label="Nº de parcelas">
                <NumberInput decimals={0} value={draft.installmentsCount} onChange={(v) => patch({ installmentsCount: Math.max(1, Math.min(24, v || 1)) })} />
              </Field>
              <Field label="1º vencimento">
                <DateInput value={draft.firstDueDate} onChange={(v) => patch({ firstDueDate: v || null })} />
              </Field>
            </FormGrid>
          )}

          <div>
            <div className="text-[11px] uppercase tracking-wider text-subtle font-medium mb-1.5">Prévia das parcelas</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {plan.map((p) => (
                <div key={p.installment} className={cn('rounded-control border border-border px-3 py-2', p.dueDate < draft.date && 'border-danger/50')}>
                  <div className="text-[11px] text-muted num">
                    {p.installment}/{p.installments} · {date(p.dueDate)}
                  </div>
                  <div className="num font-semibold text-fg">{money(p.amount)}</div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-subtle mt-1.5">As contas a receber são geradas na aprovação do pedido e recalculadas após a pesagem.</p>
          </div>
        </>
      )}

      <FormGrid>
        <Field label="Desconto (R$)">
          <MoneyInput value={draft.discountValue} onChange={(v) => patch({ discountValue: Math.max(0, v ?? 0) })} />
        </Field>
        <Field label="Desconto (%)" hint="Sobre o subtotal dos itens.">
          <PercentInput value={discountPct} onChange={(v) => patch({ discountValue: round2((subtotal * Math.max(0, v ?? 0)) / 100) })} />
        </Field>
      </FormGrid>
    </Section>
  );
}
