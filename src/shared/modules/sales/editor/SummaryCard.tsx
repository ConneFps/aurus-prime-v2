/**
 * Resumo fixo do pedido (lado direito no desktop; rodapé no celular).
 */
import React from 'react';
import { kg, money, percent } from '../../../domain/format';
import { PAYMENT_METHOD_LABELS } from '../../../domain/labels';
import type { PaymentMethod } from '../../../domain/types';
import { Card, cn, Divider } from '../../../ui';

export interface SummaryTotals {
  subtotal: number;
  freight: number;
  discount: number;
  total: number;
  weight: number;
  units: number;
  commission: number;
}

export function SummaryCard({
  title,
  customerName,
  itemsCount,
  totals,
  commissionRate,
  paymentMethod,
  conditionLabel,
  freightPending,
  issues,
  actions,
  className,
}: {
  title: React.ReactNode;
  customerName?: string | null;
  itemsCount: number;
  totals: SummaryTotals;
  commissionRate: number;
  paymentMethod: PaymentMethod;
  conditionLabel: string;
  freightPending?: boolean;
  issues: { tone: 'danger' | 'warning'; text: string }[];
  actions: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('space-y-4', className)}>
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Resumo</div>
        <div className="font-display text-lg font-semibold text-fg leading-tight mt-0.5">{title}</div>
        <div className="text-sm text-muted truncate">{customerName || 'Selecione o cliente'}</div>
      </div>
      <dl className="space-y-1.5 text-sm">
        <Row label={`Itens (${itemsCount})`} value={[totals.weight ? kg(totals.weight) : null, totals.units ? `${totals.units} un` : null].filter(Boolean).join(' + ') || '—'} />
        <Row label="Subtotal" value={money(totals.subtotal)} />
        <Row label="Frete" value={freightPending ? 'a combinar' : money(totals.freight)} />
        {totals.discount > 0 && <Row label="Desconto" value={`− ${money(totals.discount)}`} tone="text-success" />}
      </dl>
      <Divider />
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-muted">Total</span>
        <span className="text-2xl font-semibold num text-fg">{money(totals.total)}</span>
      </div>
      <dl className="space-y-1.5 text-xs">
        <Row label="Pagamento" value={`${PAYMENT_METHOD_LABELS[paymentMethod]} · ${conditionLabel}`} />
        <Row label={`Comissão (${percent(commissionRate, 2)})`} value={money(totals.commission)} />
      </dl>
      {issues.length > 0 && (
        <ul className="space-y-1">
          {issues.map((i, k) => (
            <li key={k} className={cn('text-xs rounded-control px-2.5 py-1.5', i.tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning')}>
              {i.text}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2">{actions}</div>
    </Card>
  );
}

function Row({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={cn('num text-right truncate', tone || 'text-fg')}>{value}</dd>
    </div>
  );
}
