/**
 * Baixa de parcela (individual, com valor parcial) ou em lote (saldo total de cada uma).
 */
import { useEffect, useState } from 'react';
import { useOps } from '../../app/session';
import { useAction } from '../../data/react';
import { date, money, today } from '../../domain/format';
import { optionsOf, PAYMENT_METHOD_LABELS } from '../../domain/labels';
import type { FinancialEntry, PaymentMethod } from '../../domain/types';
import { Button, Callout, DateInput, Field, FormGrid, Modal, MoneyInput, Select, Textarea } from '../../ui';
import { balanceOf, daysLate, sum } from './helpers';

export function PayModal({ entries, onClose, onDone }: { entries: FinancialEntry[] | null; onClose: () => void; onDone?: () => void }) {
  const ops = useOps();
  const list = (entries || []).filter((e) => e.status === 'OPEN');
  const single = list.length === 1 ? list[0] : null;
  const total = sum(list, balanceOf);
  const dirIn = list.every((e) => e.direction === 'IN');
  const dirOut = list.every((e) => e.direction === 'OUT');
  const verb = dirIn ? 'Recebimento' : dirOut ? 'Pagamento' : 'Baixa';

  const [amount, setAmount] = useState<number | null>(null);
  const [day, setDay] = useState(today());
  const [method, setMethod] = useState<PaymentMethod | ''>('');
  const [notes, setNotes] = useState('');

  const key = list.map((e) => e.id).join();
  useEffect(() => {
    setAmount(single ? balanceOf(single) : null);
    setDay(today());
    setMethod(single?.method || '');
    setNotes('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const pay = useAction(
    async () => {
      if (!list.length) throw new Error('Nenhuma parcela em aberto selecionada.');
      if (!day) throw new Error('Informe a data.');
      if (single) {
        if (!amount || amount <= 0) throw new Error('Informe o valor.');
        await ops.payEntry(single.id, { amount, date: day, method: method || null, notes: notes || null });
        return 1;
      }
      let n = 0;
      for (const e of list) {
        await ops.payEntry(e.id, { date: day, method: method || null, notes: notes || null });
        n++;
      }
      return n;
    },
    {
      success: (n) => (n === 1 ? `${verb} registrado` : `${n} parcelas baixadas`),
      onSuccess: () => {
        onDone?.();
        onClose();
      },
    },
  );

  const partial = single && amount !== null && amount < balanceOf(single) - 0.005;

  return (
    <Modal
      open={!!entries}
      onClose={onClose}
      size="md"
      title={single ? `Registrar ${verb.toLowerCase()}` : `Baixa em lote — ${list.length} parcelas`}
      description={
        single
          ? `${single.partyName} · ${single.description} (${single.installment}/${single.installments})`
          : `Cada parcela é quitada pelo saldo restante. Total: ${money(total)}.`
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={pay.running} disabled={!list.length} onClick={() => void pay.run()}>
            {single ? 'Confirmar baixa' : `Baixar ${list.length} parcelas`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {single && (
          <div className="grid grid-cols-3 gap-3 rounded-control bg-surface-2 p-3 text-sm">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-subtle">Vencimento</div>
              <div className="num text-fg">{date(single.dueDate)}</div>
              {daysLate(single) > 0 && <div className="text-[11px] text-danger">há {daysLate(single)} dias</div>}
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-subtle">Valor</div>
              <div className="num text-fg">{money(single.amount)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-subtle">Saldo</div>
              <div className="num font-semibold text-fg">{money(balanceOf(single))}</div>
            </div>
          </div>
        )}
        {!single && list.length > 0 && (
          <ul className="max-h-48 overflow-auto rounded-control border border-border divide-y divide-border text-sm">
            {list.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-fg">{e.partyName}</div>
                  <div className="text-xs text-muted truncate">
                    {e.description} · {e.installment}/{e.installments} · venc. {date(e.dueDate)}
                  </div>
                </div>
                <span className="num font-medium text-fg shrink-0">{money(balanceOf(e))}</span>
              </li>
            ))}
          </ul>
        )}
        {entries && entries.length > list.length && (
          <Callout tone="warning">{entries.length - list.length} parcela(s) selecionada(s) já paga(s) ou cancelada(s) serão ignoradas.</Callout>
        )}
        <FormGrid>
          {single && (
            <Field label="Valor recebido/pago" required hint={partial ? 'Baixa parcial — o saldo continua em aberto.' : 'Padrão: saldo total da parcela.'}>
              <MoneyInput value={amount} onChange={setAmount} />
            </Field>
          )}
          <Field label="Data" required>
            <DateInput value={day} onChange={setDay} max={today()} />
          </Field>
          <Field label="Forma de pagamento" hint={single ? undefined : 'Em branco mantém a forma de cada parcela.'}>
            <Select value={method} onChange={(v) => setMethod(v)} placeholder="—" options={optionsOf(PAYMENT_METHOD_LABELS)} />
          </Field>
          <Field label="Observação" span="full">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: comprovante Pix, banco, nº do documento…" />
          </Field>
        </FormGrid>
      </div>
    </Modal>
  );
}
