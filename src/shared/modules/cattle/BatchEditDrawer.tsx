/**
 * Editar lote (ops.updateBatch) e adicionar animais (ops.addAnimals).
 */
import { useEffect, useMemo, useState } from 'react';
import { useOps } from '../../app/session';
import { useAction, useTable } from '../../data/react';
import { COMPANY_LABELS, MANAGEMENT_LABELS, optionsOf } from '../../domain/labels';
import type { Batch, CompanyCode, ManagementType } from '../../domain/types';
import {
  Button,
  Callout,
  Combobox,
  DateInput,
  Drawer,
  Field,
  FormGrid,
  FormSection,
  Input,
  MoneyInput,
  NumberInput,
  Segmented,
  Select,
  Textarea,
  WeightInput,
} from '../../ui';
import { usePartnerOptions } from '../common/lookups';
import { AnimalsEditor, blankAnimal, toAnimalInputs, type AnimalRow } from './AnimalsEditor';
import { isActiveBatch } from './helpers';

interface EditDraft {
  code: string;
  name: string;
  supplierId: string | null;
  purchaseDate: string;
  purchaseInvoice: string;
  gtaNumber: string;
  managementType: ManagementType;
  status: 'PURCHASED' | 'IN_PASTURE';
  estimatedSlaughterDate: string;
  confinementEntryWeightKg: number | null;
  sellingPricePerKg: number | null;
  revenueOverride: number | null;
  company: CompanyCode | '';
  headCount: number | null;
  purchaseWeightKg: number | null;
  description: string;
  notes: string;
}

const fromBatch = (b: Batch): EditDraft => ({
  code: b.code,
  name: b.name,
  supplierId: b.supplierId ?? null,
  purchaseDate: b.purchaseDate || '',
  purchaseInvoice: b.purchaseInvoice || '',
  gtaNumber: b.gtaNumber || '',
  managementType: b.managementType,
  status: b.status === 'IN_PASTURE' ? 'IN_PASTURE' : 'PURCHASED',
  estimatedSlaughterDate: b.estimatedSlaughterDate || '',
  confinementEntryWeightKg: b.confinementEntryWeightKg ?? null,
  sellingPricePerKg: b.sellingPricePerKg ?? null,
  revenueOverride: b.revenueOverride ?? null,
  company: b.company || '',
  headCount: b.headCount ?? null,
  purchaseWeightKg: b.purchaseWeightKg ?? null,
  description: b.description || '',
  notes: b.notes || '',
});

export function BatchEditDrawer({ open, onClose, batch, hasAnimals }: { open: boolean; onClose: () => void; batch: Batch; hasAnimals: boolean }) {
  const ops = useOps();
  const { options: suppliers } = usePartnerOptions(['CATTLE_SUPPLIER']);
  const [d, setD] = useState<EditDraft>(() => fromBatch(batch));
  useEffect(() => {
    if (open) setD(fromBatch(batch));
  }, [open, batch]);
  const set = (p: Partial<EditDraft>) => setD((x) => ({ ...x, ...p }));
  const active = isActiveBatch(batch);

  const save = useAction(
    async () => {
      if (!d.name.trim()) throw new Error('Informe o nome do lote.');
      if (!d.purchaseDate) throw new Error('Informe a data de compra.');
      await ops.updateBatch(batch.id, {
        code: d.code.trim() || undefined,
        name: d.name,
        supplierId: d.supplierId,
        purchaseDate: d.purchaseDate,
        purchaseInvoice: d.purchaseInvoice.trim() || null,
        gtaNumber: d.gtaNumber.trim() || null,
        managementType: d.managementType,
        estimatedSlaughterDate: d.estimatedSlaughterDate || null,
        confinementEntryWeightKg: d.managementType === 'CONFINAMENTO' ? d.confinementEntryWeightKg : null,
        sellingPricePerKg: d.sellingPricePerKg,
        revenueOverride: d.revenueOverride,
        company: d.company || null,
        description: d.description.trim() || null,
        notes: d.notes.trim() || null,
        ...(active ? { status: d.status } : {}),
        ...(!hasAnimals ? { headCount: d.headCount || undefined, purchaseWeightKg: d.purchaseWeightKg } : {}),
      });
    },
    { success: 'Lote atualizado', onSuccess: onClose },
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title={`Editar lote ${batch.code}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.running} onClick={() => void save.run()}>
            Salvar
          </Button>
        </>
      }
    >
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          void save.run();
        }}
      >
        {active && (
          <FormSection title="Situação" description="Abate e encerramento têm registros próprios.">
            <Segmented
              value={d.status}
              onChange={(status) => set({ status })}
              options={[
                { value: 'PURCHASED', label: 'Comprado' },
                { value: 'IN_PASTURE', label: 'Em engorda' },
              ]}
            />
          </FormSection>
        )}
        <FormSection title="Identificação e compra">
          <FormGrid>
            <Field label="Nome" required span={2}>
              <Input value={d.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="Código">
              <Input value={d.code} onChange={(e) => set({ code: e.target.value })} />
            </Field>
            <Field label="Empresa">
              <Select value={d.company} onChange={(v) => set({ company: v })} placeholder="—" options={optionsOf(COMPANY_LABELS)} />
            </Field>
            <Field label="Fornecedor" span={2}>
              <Combobox value={d.supplierId} onChange={(v) => set({ supplierId: v })} options={suppliers} allowClear />
            </Field>
            <Field label="Data de compra" required>
              <DateInput value={d.purchaseDate} onChange={(v) => set({ purchaseDate: v })} />
            </Field>
            <Field label="Previsão de abate">
              <DateInput value={d.estimatedSlaughterDate} onChange={(v) => set({ estimatedSlaughterDate: v })} />
            </Field>
            <Field label="Nota fiscal">
              <Input value={d.purchaseInvoice} onChange={(e) => set({ purchaseInvoice: e.target.value })} />
            </Field>
            <Field label="GTA">
              <Input value={d.gtaNumber} onChange={(e) => set({ gtaNumber: e.target.value })} />
            </Field>
            <Field label="Manejo">
              <Select value={d.managementType} onChange={(v) => set({ managementType: v })} options={optionsOf(MANAGEMENT_LABELS)} />
            </Field>
            {d.managementType === 'CONFINAMENTO' && (
              <Field label="Peso de entrada no confinamento">
                <WeightInput value={d.confinementEntryWeightKg} onChange={(v) => set({ confinementEntryWeightKg: v })} />
              </Field>
            )}
            {!hasAnimals && (
              <>
                <Field label="Cabeças">
                  <NumberInput value={d.headCount} onChange={(v) => set({ headCount: v })} decimals={0} />
                </Field>
                <Field label="Peso vivo total">
                  <WeightInput value={d.purchaseWeightKg} onChange={(v) => set({ purchaseWeightKg: v })} />
                </Field>
              </>
            )}
          </FormGrid>
        </FormSection>
        <FormSection title="Receita" description="Usados no resultado (DRE) do lote.">
          <FormGrid>
            <Field label="Preço de referência de venda" hint="Projeta a receita e valoriza o estoque restante">
              <NumberInput value={d.sellingPricePerKg} onChange={(v) => set({ sellingPricePerKg: v })} decimals={2} minDecimals={2} prefix="R$" suffix="/kg" />
            </Field>
            <Field label="Receita total informada" hint="Se preenchida, substitui a receita calculada">
              <MoneyInput value={d.revenueOverride} onChange={(v) => set({ revenueOverride: v })} />
            </Field>
          </FormGrid>
        </FormSection>
        <FormGrid>
          <Field label="Descrição" span="full">
            <Input value={d.description} onChange={(e) => set({ description: e.target.value })} />
          </Field>
          <Field label="Observações" span="full">
            <Textarea value={d.notes} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
        </FormGrid>
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
}

export function AddAnimalsDrawer({ open, onClose, batch }: { open: boolean; onClose: () => void; batch: Batch }) {
  const ops = useOps();
  const [rows, setRows] = useState<AnimalRow[]>([blankAnimal()]);
  const { rows: alive } = useTable('animals', { where: [['status', '==', 'ALIVE']] }, { enabled: open });
  const takenTags = useMemo(() => new Set(alive.map((a) => a.tag.trim().toUpperCase())), [alive]);
  useEffect(() => {
    if (open) setRows([blankAnimal()]);
  }, [open]);

  const save = useAction(
    async () => {
      const list = toAnimalInputs(rows);
      if (!list.length) throw new Error('Inclua pelo menos um animal.');
      await ops.addAnimals(batch.id, list);
      return list.length;
    },
    { success: (n) => `${n} animais incluídos`, onSuccess: onClose },
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="xl"
      title={`Adicionar animais · ${batch.code}`}
      description="Os pesos e a quantidade do lote são atualizados. O custo de compra não é lançado automaticamente."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.running} onClick={() => void save.run()}>
            Incluir animais
          </Button>
        </>
      }
    >
      {batch.headCount > 0 && !alive.some((a) => a.batchId === batch.id) && (
        <Callout tone="info" className="mb-4">
          Este lote foi cadastrado só pela quantidade ({batch.headCount} cabeças). Ao incluir os animais individualmente, os indicadores passam a considerar os animais cadastrados.
        </Callout>
      )}
      <AnimalsEditor rows={rows} onChange={setRows} takenTags={takenTags} />
    </Drawer>
  );
}
