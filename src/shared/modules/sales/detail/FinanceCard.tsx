/**
 * Financeiro do pedido: parcelas (contas a receber), baixa e refazer parcelas.
 */
import { CircleDollarSign, RefreshCcw, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useOps, useSession } from '../../../app/session';
import { useAction } from '../../../data/react';
import { date, dateTime, daysBetween, money, round2, today } from '../../../domain/format';
import { optionsOf, PAYMENT_METHOD_LABELS } from '../../../domain/labels';
import type { FinancialEntry, PaymentMethod, Sale } from '../../../domain/types';
import { buildInstallments } from '../../../ops/impl/common';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  cn,
  DateInput,
  Field,
  FormGrid,
  Input,
  Modal,
  MoneyInput,
  NumberInput,
  Segmented,
  Select,
  Textarea,
} from '../../../ui';
import { isOverdue, NO_CHARGE_METHODS } from '../helpers';

export function FinanceCard({ sale, entries }: { sale: Sale; entries: FinancialEntry[] }) {
  const { can } = useSession();
  const [payEntry, setPayEntry] = useState<FinancialEntry | null>(null);
  const [regen, setRegen] = useState(false);
  const rows = useMemo(() => entries.slice().sort((a, b) => a.installment - b.installment || a.dueDate.localeCompare(b.dueDate)), [entries]);
  const live = rows.filter((e) => e.status !== 'CANCELLED');
  const total = live.reduce((s, e) => s + e.amount, 0);
  const paid = live.reduce((s, e) => s + (e.paidAmount || 0), 0);
  const open = round2(total - paid);
  const overdue = live.filter(isOverdue).reduce((s, e) => s + e.amount - (e.paidAmount || 0), 0);
  const noCharge = NO_CHARGE_METHODS.includes(sale.paymentMethod);
  const closed = sale.status === 'CANCELLED' || sale.status === 'REJECTED';
  const canRegen = can('finance.manage') && !closed && !noCharge && !['DRAFT', 'PENDING_APPROVAL'].includes(sale.status) && round2(sale.totalValue - paid) > 0.005;

  return (
    <Card>
      <CardHeader
        icon={<Wallet className="size-4" />}
        title="Financeiro"
        subtitle={live.length ? `${live.length} parcela(s) · ${PAYMENT_METHOD_LABELS[sale.paymentMethod]}${sale.paymentTerms ? ` · ${sale.paymentTerms} dias` : ''}` : undefined}
        actions={
          canRegen ? (
            <Button size="sm" variant="ghost" icon={<RefreshCcw className="size-4" />} onClick={() => setRegen(true)}>
              Refazer parcelas
            </Button>
          ) : undefined
        }
      />
      {live.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 mb-4">
          <Mini label="Total" value={money(total)} />
          <Mini label="Recebido" value={money(paid)} tone="text-success" />
          <Mini label={overdue > 0.005 ? `Em aberto (${money(overdue)} vencido)` : 'Em aberto'} value={money(open)} tone={overdue > 0.005 ? 'text-danger' : open > 0.005 ? 'text-warning' : 'text-fg'} />
        </div>
      )}
      {!rows.length ? (
        <p className="text-sm text-muted">
          {noCharge
            ? `${PAYMENT_METHOD_LABELS[sale.paymentMethod]} não gera contas a receber.`
            : ['DRAFT', 'PENDING_APPROVAL'].includes(sale.status)
              ? 'As parcelas são geradas quando o pedido é aprovado.'
              : closed
                ? 'Pedido encerrado sem parcelas.'
                : 'Nenhuma parcela gerada para este pedido.'}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-card border border-border">
          {rows.map((e) => {
            const late = isOverdue(e);
            const remaining = round2(e.amount - (e.paidAmount || 0));
            const payments = (e.payments || []).filter((p) => !p.reversed);
            return (
              <li key={e.id} className={cn('px-3 py-2.5 flex items-start gap-3', e.status === 'CANCELLED' && 'opacity-50')}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="num font-medium text-fg">
                      {e.installment}/{e.installments}
                    </span>
                    <span className="num text-muted">vence {date(e.dueDate)}</span>
                    {e.status === 'PAID' ? (
                      <Badge tone="success" dot>
                        Pago
                      </Badge>
                    ) : e.status === 'CANCELLED' ? (
                      <Badge>Cancelada</Badge>
                    ) : late ? (
                      <Badge tone="danger" dot>
                        Vencida há {daysBetween(e.dueDate, today())}d
                      </Badge>
                    ) : (
                      <Badge tone="warning" dot>
                        Em aberto
                      </Badge>
                    )}
                  </div>
                  {payments.length > 0 && (
                    <div className="text-[11px] text-subtle num mt-0.5">
                      {payments.map((p) => `${money(p.amount)} em ${date(p.date)}${p.method ? ` (${PAYMENT_METHOD_LABELS[p.method]})` : ''}${p.byName ? ` · ${p.byName}` : ''}`).join(' · ')}
                    </div>
                  )}
                  {e.documentNumber && <div className="text-[11px] text-subtle">Doc. {e.documentNumber}</div>}
                </div>
                <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 sm:gap-3 shrink-0">
                  <div className="text-right">
                    <div className="num font-semibold text-fg whitespace-nowrap">{money(e.amount)}</div>
                    {e.status === 'OPEN' && e.paidAmount > 0 && <div className="text-[11px] num text-muted">falta {money(remaining)}</div>}
                  </div>
                  {e.status === 'OPEN' && can('finance.pay') && (
                    <Button size="xs" variant="subtle" icon={<CircleDollarSign className="size-3.5" />} onClick={() => setPayEntry(e)}>
                      Baixar
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {payEntry && <PayEntryModal entry={payEntry} onClose={() => setPayEntry(null)} />}
      {regen && <RegenerateModal sale={sale} balance={round2(sale.totalValue - paid)} onClose={() => setRegen(false)} />}
    </Card>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-control bg-surface-2 px-3 py-2 min-w-0 flex items-baseline justify-between gap-3 sm:block">
      <div className="text-[10px] uppercase tracking-wider text-subtle truncate">{label}</div>
      <div className={cn('num font-semibold truncate', tone || 'text-fg')}>{value}</div>
    </div>
  );
}

function PayEntryModal({ entry, onClose }: { entry: FinancialEntry; onClose: () => void }) {
  const ops = useOps();
  const remaining = round2(entry.amount - (entry.paidAmount || 0));
  const [d, setD] = useState<{ amount: number | null; date: string; method: PaymentMethod | ''; notes: string }>({
    amount: remaining,
    date: today(),
    method: entry.method || '',
    notes: '',
  });
  const save = useAction(
    () => ops.payEntry(entry.id, { amount: d.amount ?? undefined, date: d.date, method: (d.method || null) as PaymentMethod | null, notes: d.notes || null }),
    { success: 'Pagamento registrado', onSuccess: onClose },
  );
  return (
    <Modal
      open
      onClose={onClose}
      title={`Baixar parcela ${entry.installment}/${entry.installments}`}
      description={`Vencimento ${date(entry.dueDate)} · saldo ${money(remaining)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.running} onClick={() => void save.run()}>
            Registrar pagamento
          </Button>
        </>
      }
    >
      <FormGrid>
        <Field label="Valor recebido" required hint={d.amount != null && d.amount < remaining - 0.005 ? 'Pagamento parcial — a parcela continua em aberto.' : undefined}>
          <MoneyInput value={d.amount} onChange={(v) => setD({ ...d, amount: v })} />
        </Field>
        <Field label="Data" required>
          <DateInput value={d.date} onChange={(v) => setD({ ...d, date: v })} />
        </Field>
        <Field label="Forma">
          <Select value={d.method} onChange={(v) => setD({ ...d, method: v })} placeholder="—" options={optionsOf(PAYMENT_METHOD_LABELS)} />
        </Field>
        <Field label="Observação" span="full">
          <Textarea rows={2} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} />
        </Field>
      </FormGrid>
      {entry.payments?.length ? <p className="text-xs text-muted mt-3">Última baixa em {dateTime(entry.payments[entry.payments.length - 1].at)}.</p> : null}
    </Modal>
  );
}

function RegenerateModal({ sale, balance, onClose }: { sale: Sale; balance: number; onClose: () => void }) {
  const ops = useOps();
  const [mode, setMode] = useState<'TERMS' | 'INSTALLMENTS'>(sale.paymentTerms ? 'TERMS' : 'INSTALLMENTS');
  const [terms, setTerms] = useState(sale.paymentTerms || '');
  const [count, setCount] = useState<number>(sale.installmentsCount || 1);
  const [first, setFirst] = useState<string>(sale.firstDueDate || today());
  const [method, setMethod] = useState<PaymentMethod>(sale.paymentMethod);
  const plan = mode === 'TERMS' ? { terms, method } : { installments: count, firstDueDate: first, method };
  const preview = buildInstallments(balance, plan, today());
  const save = useAction(() => ops.regenerateReceivables(sale.id, plan), { success: 'Parcelas refeitas', onSuccess: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      title="Refazer parcelas"
      description={`As parcelas em aberto são canceladas e o saldo de ${money(balance)} é dividido de novo. Pagamentos já feitos são mantidos.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.running} onClick={() => void save.run()}>
            Refazer {preview.length} parcela(s)
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Segmented
          size="sm"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'TERMS', label: 'Prazos em dias' },
            { value: 'INSTALLMENTS', label: 'Parcelas mensais' },
          ]}
        />
        <FormGrid>
          {mode === 'TERMS' ? (
            <Field label="Prazos (dias a partir de hoje)" hint="Ex.: 28/35/42 — vazio = à vista.">
              <Input value={terms} onChange={(e) => setTerms(e.target.value.replace(/[^\d/ ,;]/g, ''))} className="num" placeholder="À vista" />
            </Field>
          ) : (
            <>
              <Field label="Nº de parcelas">
                <NumberInput decimals={0} value={count} onChange={(v) => setCount(Math.max(1, Math.min(24, v || 1)))} />
              </Field>
              <Field label="1º vencimento">
                <DateInput value={first} onChange={setFirst} />
              </Field>
            </>
          )}
          <Field label="Forma de pagamento">
            <Select value={method} onChange={setMethod} options={optionsOf(PAYMENT_METHOD_LABELS).filter((o) => !NO_CHARGE_METHODS.includes(o.value))} />
          </Field>
        </FormGrid>
        <div className="flex flex-wrap gap-2">
          {preview.map((p) => (
            <div key={p.installment} className="rounded-control border border-border px-3 py-1.5">
              <div className="text-[11px] text-muted num">
                {p.installment}/{p.installments} · {date(p.dueDate)}
              </div>
              <div className="num font-semibold text-fg text-sm">{money(p.amount)}</div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
