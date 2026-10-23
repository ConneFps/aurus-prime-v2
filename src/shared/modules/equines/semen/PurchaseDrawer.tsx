/**
 * Nova compra de sêmen → ops.registerSemenPurchase (gera contas a pagar).
 */
import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useOps } from '../../../app/session';
import { useAction, useTable } from '../../../data/react';
import { addDays, isValidDocument, money, onlyDigits, round2, today } from '../../../domain/format';
import type { SemenPurchase } from '../../../domain/types';
import { Button, DateInput, Drawer, Field, FormGrid, FormSection, Input, MaskedInput, MoneyInput, NumberInput, Select, Textarea } from '../../../ui';
import { distinct, SEMEN_STORAGE } from '../model';
import { emptyPlan, PlanFields, toPlan, type PlanDraft } from '../parts';

interface Draft {
  stallionName: string;
  stallionBreed: string;
  stallionRegistry: string;
  ownerHaras: string;
  supplierName: string;
  supplierDocument: string;
  supplierContact: string;
  invoiceNumber: string;
  invoiceDate: string;
  lotCode: string;
  purchaseDate: string;
  dosesQuantity: number | null;
  dosePrice: number | null;
  totalValue: number | null;
  storageType: SemenPurchase['storageType'];
  canister: string;
  expiryDate: string;
  intendedMares: string;
  veterinarian: string;
  notes: string;
  plan: PlanDraft;
}

const initial = (): Draft => ({
  stallionName: '',
  stallionBreed: '',
  stallionRegistry: '',
  ownerHaras: '',
  supplierName: '',
  supplierDocument: '',
  supplierContact: '',
  invoiceNumber: '',
  invoiceDate: today(),
  lotCode: '',
  purchaseDate: today(),
  dosesQuantity: null,
  dosePrice: null,
  totalValue: null,
  storageType: 'CONGELADO',
  canister: '',
  expiryDate: '',
  intendedMares: '',
  veterinarian: '',
  notes: '',
  plan: { ...emptyPlan(today(), 'PIX'), firstDueDate: addDays(today(), 30) },
});

const opt = (xs: string[]) => xs.map((x) => <option key={x} value={x} />);

export function PurchaseDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ops = useOps();
  const { rows: purchases } = useTable('semen_purchases');
  const { rows: herd } = useTable('equines');
  const [d, setD] = useState<Draft>(initial);
  const [totalTouched, setTotalTouched] = useState(false);
  useEffect(() => {
    if (open) {
      setD(initial());
      setTotalTouched(false);
    }
  }, [open]);
  const set = (patch: Partial<Draft>) =>
    setD((cur) => {
      const next = { ...cur, ...patch };
      if (!totalTouched && ('dosesQuantity' in patch || 'dosePrice' in patch) && next.dosesQuantity && next.dosePrice)
        next.totalValue = round2(next.dosesQuantity * next.dosePrice);
      return next;
    });

  const sugg = useMemo(
    () => ({
      stallions: distinct(purchases.map((p) => p.stallionName)),
      suppliers: distinct(purchases.map((p) => p.supplierName)),
      vets: distinct(purchases.map((p) => p.veterinarian)),
      canisters: distinct(purchases.map((p) => p.canister)),
      breeds: distinct([...purchases.map((p) => p.stallionBreed), ...herd.map((h) => h.breed)]),
      mares: distinct(herd.filter((h) => h.sex === 'EGUA' && h.status !== 'SOLD' && h.status !== 'DECEASED').map((h) => h.name)),
    }),
    [purchases, herd],
  );

  // Preenche dados do garanhão a partir de uma compra anterior.
  const pickStallion = (name: string) => {
    const prev = purchases.find((p) => p.stallionName.toLowerCase() === name.trim().toLowerCase());
    set(
      prev && !d.stallionBreed
        ? { stallionName: name, stallionBreed: prev.stallionBreed || '', stallionRegistry: prev.stallionRegistry || '', ownerHaras: prev.ownerHaras || '' }
        : { stallionName: name },
    );
  };

  const save = useAction(
    async (x: Draft) => {
      if (!x.stallionName.trim()) throw new Error('Informe o garanhão.');
      if (!x.supplierName.trim()) throw new Error('Informe o fornecedor.');
      if (!x.dosesQuantity || x.dosesQuantity <= 0) throw new Error('Informe a quantidade de doses.');
      if (x.totalValue === null || x.totalValue < 0) throw new Error('Informe o valor total.');
      if (x.supplierDocument && !isValidDocument(x.supplierDocument)) throw new Error('CPF/CNPJ do fornecedor inválido.');
      if (x.expiryDate && x.expiryDate < x.purchaseDate) throw new Error('A validade não pode ser antes da compra.');
      return ops.registerSemenPurchase({
        stallionName: x.stallionName.trim(),
        stallionBreed: x.stallionBreed || null,
        stallionRegistry: x.stallionRegistry || null,
        ownerHaras: x.ownerHaras || null,
        supplierName: x.supplierName.trim(),
        supplierDocument: onlyDigits(x.supplierDocument) || null,
        supplierContact: x.supplierContact || null,
        invoiceNumber: x.invoiceNumber || null,
        invoiceDate: x.invoiceDate || null,
        lotCode: x.lotCode || null,
        purchaseDate: x.purchaseDate,
        dosesQuantity: Math.round(x.dosesQuantity),
        dosePrice: x.dosePrice,
        totalValue: x.totalValue,
        storageType: x.storageType,
        canister: x.canister || null,
        expiryDate: x.expiryDate || null,
        intendedMares: x.intendedMares || null,
        veterinarian: x.veterinarian || null,
        notes: x.notes || null,
        plan: toPlan(x.plan),
      });
    },
    { success: 'Compra de sêmen registrada — parcelas lançadas no contas a pagar', onSuccess: onClose },
  );

  const txt = (k: keyof Draft, list?: string) => ({
    value: (d[k] as string) || '',
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set({ [k]: e.target.value } as Partial<Draft>),
    list,
    autoComplete: list ? 'off' : undefined,
  });

  return (
    <Drawer
      open={open}
      width="xl"
      onClose={onClose}
      title="Nova compra de sêmen"
      description="Entra no estoque de doses e gera as parcelas no contas a pagar."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.running} onClick={() => void save.run(d)}>
            Registrar compra {d.totalValue ? `· ${money(d.totalValue)}` : ''}
          </Button>
        </>
      }
    >
      <datalist id="semen-stallions">{opt(sugg.stallions)}</datalist>
      <datalist id="semen-suppliers">{opt(sugg.suppliers)}</datalist>
      <datalist id="semen-vets">{opt(sugg.vets)}</datalist>
      <datalist id="semen-canisters">{opt(sugg.canisters)}</datalist>
      <datalist id="semen-breeds">{opt(sugg.breeds)}</datalist>
      <datalist id="semen-mares">{opt(sugg.mares)}</datalist>
      <form
        className="space-y-7"
        onSubmit={(e) => {
          e.preventDefault();
          void save.run(d);
        }}
      >
        <FormSection title="Garanhão">
          <FormGrid cols={4}>
            <Field label="Nome do garanhão" required span={2}>
              <Input value={d.stallionName} onChange={(e) => pickStallion(e.target.value)} list="semen-stallions" autoComplete="off" autoFocus />
            </Field>
            <Field label="Raça">
              <Input {...txt('stallionBreed', 'semen-breeds')} />
            </Field>
            <Field label="Registro">
              <Input {...txt('stallionRegistry')} />
            </Field>
            <Field label="Haras de origem / dono" span={2}>
              <Input {...txt('ownerHaras')} />
            </Field>
          </FormGrid>
        </FormSection>

        <FormSection title="Fornecedor e nota fiscal">
          <FormGrid cols={4}>
            <Field label="Fornecedor" required span={2}>
              <Input {...txt('supplierName', 'semen-suppliers')} />
            </Field>
            <Field label="CPF / CNPJ">
              <MaskedInput mask="document" value={d.supplierDocument} onChange={(v) => set({ supplierDocument: v })} />
            </Field>
            <Field label="Contato">
              <Input {...txt('supplierContact')} placeholder="Telefone ou e-mail" />
            </Field>
            <Field label="Nota fiscal / recibo">
              <Input {...txt('invoiceNumber')} />
            </Field>
            <Field label="Data da NF">
              <DateInput value={d.invoiceDate} onChange={(v) => set({ invoiceDate: v })} />
            </Field>
            <Field label="Código do lote">
              <Input {...txt('lotCode')} />
            </Field>
          </FormGrid>
        </FormSection>

        <FormSection title="Doses e armazenamento">
          <FormGrid cols={4}>
            <Field label="Data da compra" required>
              <DateInput value={d.purchaseDate} onChange={(v) => set({ purchaseDate: v })} />
            </Field>
            <Field label="Doses / palhetas" required>
              <NumberInput value={d.dosesQuantity} decimals={0} onChange={(v) => set({ dosesQuantity: v })} />
            </Field>
            <Field label="Preço por dose">
              <MoneyInput value={d.dosePrice} onChange={(v) => set({ dosePrice: v })} />
            </Field>
            <Field label="Valor total" required hint={!totalTouched && d.dosePrice && d.dosesQuantity ? 'Doses × preço' : undefined}>
              <MoneyInput
                value={d.totalValue}
                onChange={(v) => {
                  setTotalTouched(true);
                  set({ totalValue: v });
                }}
              />
            </Field>
            <Field label="Armazenamento" required>
              <Select value={d.storageType} onChange={(v) => set({ storageType: v })} options={(Object.keys(SEMEN_STORAGE) as SemenPurchase['storageType'][]).map((k) => ({ value: k, label: SEMEN_STORAGE[k] }))} />
            </Field>
            <Field label="Botijão / caneca">
              <Input {...txt('canister', 'semen-canisters')} placeholder="Ex.: Botijão 1 · caneca 3" />
            </Field>
            <Field label="Validade" hint={d.storageType === 'CONGELADO' ? 'Congelado dura anos' : 'Refrigerado/fresco: poucos dias'}>
              <DateInput value={d.expiryDate} onChange={(v) => set({ expiryDate: v })} />
            </Field>
            <Field label="Veterinário">
              <Input {...txt('veterinarian', 'semen-vets')} />
            </Field>
            <Field label="Éguas previstas" span="full" hint="Separe por vírgula">
              <Input {...txt('intendedMares', 'semen-mares')} />
            </Field>
          </FormGrid>
        </FormSection>

        <FormSection title="Pagamento" description="As parcelas entram no contas a pagar (categoria Sêmen).">
          <PlanFields value={d.plan} onChange={(plan) => set({ plan })} total={d.totalValue || 0} issueDate={d.purchaseDate} />
        </FormSection>

        <Field label="Observações">
          <Textarea rows={2} {...txt('notes')} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
}
