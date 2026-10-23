/**
 * Venda do equino → ops.registerEquineSale (gera contas a receber parceladas).
 */
import { useEffect, useState } from 'react';
import { useOps } from '../../../app/session';
import { useAction } from '../../../data/react';
import { isValidDocument, isValidEmail, money, onlyDigits, today } from '../../../domain/format';
import type { Equine } from '../../../domain/types';
import { Button, Callout, DateInput, Drawer, Field, FormGrid, FormSection, Input, MaskedInput, MoneyInput, Textarea } from '../../../ui';
import { emptyPlan, PlanFields, toPlan, type PlanDraft } from '../parts';

interface SaleDraft {
  buyerName: string;
  buyerDocument: string;
  buyerPhone: string;
  buyerEmail: string;
  buyerAddress: string;
  date: string;
  totalPrice: number | null;
  notes: string;
  plan: PlanDraft;
}

const initial = (e: Equine): SaleDraft => ({
  buyerName: '',
  buyerDocument: '',
  buyerPhone: '',
  buyerEmail: '',
  buyerAddress: '',
  date: today(),
  totalPrice: e.estimatedValue || null,
  notes: '',
  plan: emptyPlan(today(), 'TRANSFER'),
});

export function SaleDrawer({ equine, open, onClose }: { equine: Equine; open: boolean; onClose: () => void }) {
  const ops = useOps();
  const [d, setD] = useState<SaleDraft>(() => initial(equine));
  useEffect(() => {
    if (open) setD(initial(equine));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const set = (patch: Partial<SaleDraft>) => setD((cur) => ({ ...cur, ...patch }));

  const save = useAction(
    async (x: SaleDraft) => {
      if (!x.buyerName.trim()) throw new Error('Informe o comprador.');
      if (!x.totalPrice || x.totalPrice <= 0) throw new Error('Informe o valor da venda.');
      if (x.buyerDocument && !isValidDocument(x.buyerDocument)) throw new Error('CPF/CNPJ do comprador inválido.');
      if (x.buyerEmail && !isValidEmail(x.buyerEmail)) throw new Error('E-mail do comprador inválido.');
      return ops.registerEquineSale({
        equineId: equine.id,
        buyerName: x.buyerName.trim(),
        buyerDocument: onlyDigits(x.buyerDocument) || null,
        buyerPhone: onlyDigits(x.buyerPhone) || null,
        buyerEmail: x.buyerEmail.trim() || null,
        buyerAddress: x.buyerAddress.trim() || null,
        date: x.date,
        totalPrice: x.totalPrice,
        plan: toPlan(x.plan),
        notes: x.notes.trim() || null,
      });
    },
    { success: `${equine.name} vendido — parcelas lançadas no contas a receber`, onSuccess: onClose },
  );

  const gain = d.totalPrice && equine.purchaseValue ? d.totalPrice - equine.purchaseValue : null;

  return (
    <Drawer
      open={open}
      width="lg"
      onClose={onClose}
      title={`Vender ${equine.name}`}
      description="Registra a venda, marca o animal como vendido e gera as parcelas a receber."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.running} onClick={() => void save.run(d)}>
            Confirmar venda {d.totalPrice ? `· ${money(d.totalPrice)}` : ''}
          </Button>
        </>
      }
    >
      <form
        className="space-y-6"
        onSubmit={(ev) => {
          ev.preventDefault();
          void save.run(d);
        }}
      >
        <FormSection title="Comprador">
          <FormGrid cols={2}>
            <Field label="Nome / razão social" required span="full">
              <Input value={d.buyerName} onChange={(e) => set({ buyerName: e.target.value })} autoFocus />
            </Field>
            <Field label="CPF / CNPJ">
              <MaskedInput mask="document" value={d.buyerDocument} onChange={(v) => set({ buyerDocument: v })} />
            </Field>
            <Field label="Telefone">
              <MaskedInput mask="phone" value={d.buyerPhone} onChange={(v) => set({ buyerPhone: v })} />
            </Field>
            <Field label="E-mail" span="full">
              <Input type="email" value={d.buyerEmail} onChange={(e) => set({ buyerEmail: e.target.value })} />
            </Field>
            <Field label="Endereço / haras de destino" span="full">
              <Input value={d.buyerAddress} onChange={(e) => set({ buyerAddress: e.target.value })} />
            </Field>
          </FormGrid>
        </FormSection>

        <FormSection title="Valor e pagamento">
          <FormGrid cols={2}>
            <Field label="Data da venda" required>
              <DateInput
                value={d.date}
                onChange={(v) => set({ date: v, plan: d.plan.firstDueDate === d.date ? { ...d.plan, firstDueDate: v } : d.plan })}
              />
            </Field>
            <Field
              label="Valor total"
              required
              hint={gain !== null ? `${gain >= 0 ? 'Ganho' : 'Perda'} de ${money(Math.abs(gain))} sobre a compra (${money(equine.purchaseValue)})` : undefined}
            >
              <MoneyInput value={d.totalPrice} onChange={(v) => set({ totalPrice: v })} />
            </Field>
          </FormGrid>
          <PlanFields value={d.plan} onChange={(plan) => set({ plan })} total={d.totalPrice || 0} issueDate={d.date} />
          <Field label="Observações">
            <Textarea rows={2} value={d.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Condições, exames entregues, transporte…" />
          </Field>
        </FormSection>
        {equine.status === 'PREGNANT' && <Callout tone="warning">Este animal está prenhe — confira se a gestação entra no contrato.</Callout>}
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
}
