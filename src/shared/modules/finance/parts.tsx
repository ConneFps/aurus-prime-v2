/**
 * Pequenos componentes visuais reaproveitados pelas telas do financeiro.
 */
import { useEffect, useState } from 'react';
import { date, money } from '../../domain/format';
import type { FinancialEntry } from '../../domain/types';
import { Badge, StatusBadge } from '../../ui';
import { brlShort, daysLate, ENTRY_STATE, entryState } from './helpers';

/** Valor em reais: curto no celular, completo a partir de sm. */
export function StatMoney({ value }: { value: number }) {
  return (
    <>
      <span className="sm:hidden text-xl num">{brlShort(value)}</span>
      <span className="max-sm:hidden num">{money(value)}</span>
    </>
  );
}

/** true a partir de 640 px (breakpoint sm). */
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

export function EntryBadge({ entry }: { entry: FinancialEntry }) {
  const partial = entry.status === 'OPEN' && (entry.paidAmount || 0) > 0.005;
  return (
    <span className="inline-flex items-center gap-1">
      <StatusBadge info={ENTRY_STATE[entryState(entry)]} />
      {partial && (
        <Badge tone="info" size="xs">
          parcial
        </Badge>
      )}
    </span>
  );
}

/** Vencimento com "há X dias" quando vencido. */
export function DueCell({ entry }: { entry: FinancialEntry }) {
  const late = daysLate(entry);
  return (
    <div className="leading-tight">
      <div className="num text-fg">{date(entry.dueDate)}</div>
      {late > 0 && (
        <div className="text-[11px] text-danger font-medium">
          há {late} {late === 1 ? 'dia' : 'dias'}
        </div>
      )}
      {entry.status === 'PAID' && entry.paidAt && <div className="text-[11px] text-subtle">pago {date(entry.paidAt)}</div>}
    </div>
  );
}
