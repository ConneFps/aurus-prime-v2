/**
 * Detalhe de uma parcela: dados, pagamentos (com estorno), edição e cancelamento.
 */
import { Ban, Banknote, Pencil, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOps, useSession } from '../../app/session';
import { useAction } from '../../data/react';
import { date, dateTime, money, round2 } from '../../domain/format';
import { COMPANY_LABELS, ENTRY_CATEGORY_LABELS, optionsOf, PAYMENT_METHOD_LABELS } from '../../domain/labels';
import type { FinancialEntry, PaymentMethod } from '../../domain/types';
import {
  Badge,
  Button,
  Callout,
  CardHeader,
  DateInput,
  DescriptionList,
  Divider,
  Drawer,
  EmptyState,
  Field,
  FormGrid,
  Input,
  MoneyInput,
  Select,
  Textarea,
} from '../../ui';
import { balanceOf, daysLate } from './helpers';
import { useCancelEntry, useReversePayment } from './hooks';
import { EntryBadge } from './parts';

interface EditDraft {
  dueDate: string;
  amount: number | null;
  documentNumber: string;
  barcode: string;
  method: PaymentMethod | '';
  description: string;
  notes: string;
}

const toDraft = (e: FinancialEntry): EditDraft => ({
  dueDate: e.dueDate,
  amount: e.amount,
  documentNumber: e.documentNumber || '',
  barcode: e.barcode || '',
  method: e.method || '',
  description: e.description,
  notes: e.notes || '',
});

export function EntryDrawer({
  entry,
  onClose,
  onPay,
  startEditing,
}: {
  entry: FinancialEntry | null;
  onClose: () => void;
  onPay: (e: FinancialEntry) => void;
  startEditing?: boolean;
}) {
  const ops = useOps();
  const { can } = useSession();
  const canManage = can('finance.manage');
  const canPay = can('finance.pay');
  const [edit, setEdit] = useState<EditDraft | null>(null);

  useEffect(() => {
    setEdit(entry && startEditing && entry.status === 'OPEN' ? toDraft(entry) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id, startEditing]);

  const save = useAction(
    async (e: FinancialEntry, d: EditDraft) => {
      const patch: Parameters<typeof ops.updateEntry>[1] = {};
      if (d.dueDate !== e.dueDate) patch.dueDate = d.dueDate;
      if (d.amount !== null && round2(d.amount) !== e.amount) patch.amount = d.amount;
      if (d.documentNumber !== (e.documentNumber || '')) patch.documentNumber = d.documentNumber;
      if (d.barcode !== (e.barcode || '')) patch.barcode = d.barcode;
      if ((d.method || null) !== (e.method || null)) patch.method = d.method || null;
      if (d.description !== e.description) patch.description = d.description;
      if (d.notes !== (e.notes || '')) patch.notes = d.notes;
      if (!Object.keys(patch).length) return false;
      await ops.updateEntry(e.id, patch);
      return true;
    },
    { success: (changed) => (changed ? 'Parcela atualizada' : 'Nada foi alterado'), onSuccess: () => setEdit(null) },
  );

  const reverse = useReversePayment();
  const cancel = useCancelEntry(onClose);

  const e = entry;
  const open = e?.status === 'OPEN';
  const late = e ? daysLate(e) : 0;
  const hasPaid = (e?.paidAmount || 0) > 0.005;

  return (
    <Drawer
      open={!!e}
      onClose={onClose}
      width="md"
      title={e ? (e.direction === 'IN' ? 'Conta a receber' : 'Conta a pagar') : ''}
      description={e ? `${e.partyName} · parcela ${e.installment}/${e.installments}` : undefined}
      footer={
        e &&
        (edit ? (
          <>
            <Button variant="ghost" onClick={() => setEdit(null)}>
              Descartar
            </Button>
            <Button variant="primary" loading={save.running} onClick={() => void save.run(e, edit)}>
              Salvar alterações
            </Button>
          </>
        ) : (
          <>
            {canManage && open && !hasPaid && (
              <Button
                variant="ghost"
                className="mr-auto text-danger"
                icon={<Ban className="size-4" />}
                loading={cancel.running}
                onClick={() => void cancel.run(e)}
              >
                Cancelar
              </Button>
            )}
            {canManage && open && (
              <Button icon={<Pencil className="size-4" />} onClick={() => setEdit(toDraft(e))}>
                Editar
              </Button>
            )}
            {canPay && open && (
              <Button variant="primary" icon={<Banknote className="size-4" />} onClick={() => onPay(e)}>
                {e.direction === 'IN' ? 'Receber' : 'Pagar'}
              </Button>
            )}
          </>
        ))
      }
    >
      {e && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <EntryBadge entry={e} />
            <Badge tone={e.direction === 'IN' ? 'success' : 'warning'}>{e.direction === 'IN' ? 'A receber' : 'A pagar'}</Badge>
            <Badge>{ENTRY_CATEGORY_LABELS[e.category]}</Badge>
            {late > 0 && <span className="text-xs text-danger font-medium">vencida há {late} dias</span>}
          </div>

          <div className="grid grid-cols-3 gap-3 rounded-card border border-border p-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-subtle">Valor</div>
              <div className="num text-fg font-semibold">{money(e.amount)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-subtle">Pago</div>
              <div className="num text-success font-semibold">{money(e.paidAmount)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-subtle">Saldo</div>
              <div className={late > 0 ? 'num text-danger font-semibold' : 'num text-fg font-semibold'}>{money(balanceOf(e))}</div>
            </div>
          </div>

          {edit ? (
            <FormGrid>
              <Field label="Descrição" span="full" required>
                <Input value={edit.description} onChange={(ev) => setEdit({ ...edit, description: ev.target.value })} />
              </Field>
              <Field label="Vencimento" required>
                <DateInput value={edit.dueDate} onChange={(v) => setEdit({ ...edit, dueDate: v })} />
              </Field>
              <Field label="Valor da parcela" required hint={hasPaid ? `Não pode ser menor que o já pago (${money(e.paidAmount)}).` : undefined}>
                <MoneyInput value={edit.amount} onChange={(v) => setEdit({ ...edit, amount: v })} />
              </Field>
              <Field label="Documento (NF / boleto)">
                <Input value={edit.documentNumber} onChange={(ev) => setEdit({ ...edit, documentNumber: ev.target.value })} />
              </Field>
              <Field label="Forma de pagamento">
                <Select value={edit.method} onChange={(v) => setEdit({ ...edit, method: v })} placeholder="—" options={optionsOf(PAYMENT_METHOD_LABELS)} />
              </Field>
              <Field label="Código de barras / linha digitável" span="full">
                <Input className="num" value={edit.barcode} onChange={(ev) => setEdit({ ...edit, barcode: ev.target.value })} />
              </Field>
              <Field label="Observações" span="full">
                <Textarea rows={2} value={edit.notes} onChange={(ev) => setEdit({ ...edit, notes: ev.target.value })} />
              </Field>
            </FormGrid>
          ) : (
            <DescriptionList
              items={[
                { label: 'Descrição', value: e.description, span: true },
                { label: e.partyType === 'CUSTOMER' ? 'Cliente' : e.partyType === 'PARTNER' ? 'Fornecedor / parceiro' : 'Favorecido', value: e.partyName },
                {
                  label: 'Venda',
                  value: e.saleId ? (
                    <Link className="text-primary hover:underline" to={`/vendas/${e.saleId}`}>
                      Pedido {e.saleNumber || ''}
                    </Link>
                  ) : (
                    '—'
                  ),
                },
                { label: 'Emissão', value: date(e.issueDate) },
                { label: 'Vencimento', value: date(e.dueDate) },
                { label: 'Forma', value: e.method ? PAYMENT_METHOD_LABELS[e.method] : '—' },
                { label: 'Documento', value: e.documentNumber || '—' },
                { label: 'Empresa', value: e.company ? COMPANY_LABELS[e.company] : '—', hidden: !e.company },
                { label: 'Pago em', value: date(e.paidAt), hidden: !e.paidAt },
                { label: 'Código de barras', value: <span className="num break-all">{e.barcode}</span>, span: true, hidden: !e.barcode },
                { label: 'Observações', value: <span className="whitespace-pre-line">{e.notes}</span>, span: true, hidden: !e.notes },
              ]}
            />
          )}

          <Divider />

          <section>
            <CardHeader title="Pagamentos" subtitle="Baixas registradas nesta parcela" className="mb-3" />
            {!e.payments?.length ? (
              <EmptyState className="py-6" title="Nenhum pagamento registrado" description={open ? 'Use “Receber/Pagar” para registrar a baixa.' : undefined} />
            ) : (
              <ul className="divide-y divide-border rounded-card border border-border">
                {[...e.payments].reverse().map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0 text-sm">
                      <div className="flex items-center gap-2">
                        <span className={p.reversed ? 'num text-muted line-through' : 'num font-semibold text-fg'}>{money(p.amount)}</span>
                        {p.reversed && <Badge tone="danger">Estornado</Badge>}
                      </div>
                      <div className="text-xs text-muted">
                        {date(p.date)} · {p.method ? PAYMENT_METHOD_LABELS[p.method] : 'forma não informada'}
                        {p.byName ? ` · ${p.byName}` : ''}
                      </div>
                      {p.notes && <div className="text-xs text-subtle mt-0.5">{p.notes}</div>}
                      {p.reversed && (
                        <div className="text-xs text-danger mt-0.5">
                          Estornado {dateTime(p.reversedAt)}
                          {p.reversedBy ? ` por ${p.reversedBy}` : ''}
                          {p.reverseReason ? ` — ${p.reverseReason}` : ''}
                        </div>
                      )}
                    </div>
                    {canPay && !p.reversed && e.status !== 'CANCELLED' && (
                      <Button
                        size="xs"
                        variant="ghost"
                        icon={<RotateCcw className="size-3.5" />}
                        loading={reverse.running}
                        onClick={() => void reverse.run(e, p.id, p.amount)}
                      >
                        Estornar
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
          {canManage && open && hasPaid && <Callout tone="info">Para cancelar esta parcela, estorne antes os pagamentos registrados.</Callout>}
        </div>
      )}
    </Drawer>
  );
}
