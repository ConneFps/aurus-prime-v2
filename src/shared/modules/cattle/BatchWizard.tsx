/**
 * Novo lote — fluxo guiado em 3 passos: dados → animais → custo de compra.
 */
import { Check, ChevronLeft, ChevronRight, Fence, Trees } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOps } from '../../app/session';
import { useAction, useTable } from '../../data/react';
import { date, kg, money, number, round2, today } from '../../domain/format';
import { COMPANY_LABELS, MANAGEMENT_LABELS, optionsOf } from '../../domain/labels';
import type { CompanyCode, ManagementType } from '../../domain/types';
import type { BatchInput } from '../../ops/types';
import {
  Button,
  Callout,
  cn,
  Combobox,
  DateInput,
  DescriptionList,
  Drawer,
  Field,
  FormGrid,
  FormSection,
  Input,
  MoneyInput,
  NumberInput,
  Segmented,
  Select,
  Switch,
  Textarea,
  WeightInput,
} from '../../ui';
import { usePartnerOptions } from '../common/lookups';
import { AnimalsEditor, animalTotals, toAnimalInputs, type AnimalRow } from './AnimalsEditor';
import { emptyPayable, PayableFields, toPlan, type PayableDraft } from './PayableFields';

interface Draft {
  name: string;
  code: string;
  supplierId: string | null;
  purchaseDate: string;
  purchaseInvoice: string;
  gtaNumber: string;
  managementType: ManagementType;
  estimatedSlaughterDate: string;
  confinementEntryWeightKg: number | null;
  sellingPricePerKg: number | null;
  company: CompanyCode | '';
  notes: string;
  mode: 'ANIMALS' | 'AGGREGATE';
  animals: AnimalRow[];
  headCount: number | null;
  purchaseWeightKg: number | null;
  aggregateValue: number | null;
  launchCost: boolean;
  costAmount: number | null;
  costDocument: string;
  payable: PayableDraft;
}

const initial = (): Draft => ({
  name: '',
  code: '',
  supplierId: null,
  purchaseDate: today(),
  purchaseInvoice: '',
  gtaNumber: '',
  managementType: 'CAMPO',
  estimatedSlaughterDate: '',
  confinementEntryWeightKg: null,
  sellingPricePerKg: null,
  company: '',
  notes: '',
  mode: 'ANIMALS',
  animals: [],
  headCount: null,
  purchaseWeightKg: null,
  aggregateValue: null,
  launchCost: true,
  costAmount: null,
  costDocument: '',
  payable: emptyPayable(today()),
});

const STEPS = ['Dados do lote', 'Animais', 'Custo de compra'];

export function BatchWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ops = useOps();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(initial);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const { options: suppliers } = usePartnerOptions(['CATTLE_SUPPLIER']);
  const { rows: alive } = useTable('animals', { where: [['status', '==', 'ALIVE']] }, { enabled: open });
  const takenTags = useMemo(() => new Set(alive.map((a) => a.tag.trim().toUpperCase())), [alive]);

  const totals = animalTotals(d.animals);
  const heads = d.mode === 'ANIMALS' ? totals.count : d.headCount || 0;
  const weight = d.mode === 'ANIMALS' ? totals.weight : d.purchaseWeightKg || 0;
  const defaultCost = d.mode === 'ANIMALS' ? round2(totals.value) : d.aggregateValue || 0;
  const costAmount = d.costAmount ?? defaultCost;

  const close = () => {
    onClose();
    setTimeout(() => {
      setStep(0);
      setD(initial());
    }, 200);
  };

  const validate = (s: number) => {
    if (s >= 0) {
      if (!d.name.trim()) throw new Error('Informe o nome do lote.');
      if (!d.purchaseDate) throw new Error('Informe a data de compra.');
      if (d.estimatedSlaughterDate && d.estimatedSlaughterDate < d.purchaseDate) throw new Error('A previsão de abate não pode ser antes da compra.');
    }
    if (s >= 1) {
      if (d.mode === 'ANIMALS') {
        const list = toAnimalInputs(d.animals);
        if (!list.length) throw new Error('Inclua os animais ou use "Só quantidade e peso".');
        const taken = list.filter((a) => takenTags.has(a.tag.toUpperCase())).map((a) => a.tag);
        if (taken.length) throw new Error(`Brincos já cadastrados em animais vivos: ${taken.slice(0, 8).join(', ')}.`);
      } else if (!d.headCount || d.headCount <= 0) throw new Error('Informe a quantidade de cabeças.');
    }
  };

  const next = useAction(async () => {
    validate(step);
    setStep((s) => s + 1);
  });

  const save = useAction(
    async () => {
      validate(2);
      const input: BatchInput = {
        name: d.name.trim(),
        code: d.code.trim() || undefined,
        managementType: d.managementType,
        company: d.company || null,
        supplierId: d.supplierId,
        purchaseDate: d.purchaseDate,
        purchaseInvoice: d.purchaseInvoice.trim() || null,
        gtaNumber: d.gtaNumber.trim() || null,
        estimatedSlaughterDate: d.estimatedSlaughterDate || null,
        confinementEntryWeightKg: d.managementType === 'CONFINAMENTO' ? d.confinementEntryWeightKg : null,
        sellingPricePerKg: d.sellingPricePerKg,
        notes: d.notes.trim() || null,
        animals: d.mode === 'ANIMALS' ? toAnimalInputs(d.animals) : [],
        headCount: d.mode === 'AGGREGATE' ? Math.floor(d.headCount || 0) : undefined,
        purchaseWeightKg: d.mode === 'AGGREGATE' ? d.purchaseWeightKg : undefined,
        purchaseCost: d.launchCost
          ? { amount: costAmount, documentNumber: d.costDocument.trim() || d.purchaseInvoice.trim() || null, createPayable: toPlan(d.payable) }
          : null,
      };
      if (d.launchCost && !(costAmount > 0)) throw new Error('Informe o valor da compra ou desligue o lançamento do custo.');
      return ops.createBatch(input);
    },
    {
      success: 'Lote cadastrado',
      onSuccess: (id) => {
        close();
        nav(`/gado/lotes/${id}`);
      },
    },
  );

  const supplierName = suppliers.find((s) => s.value === d.supplierId)?.label;

  return (
    <Drawer
      open={open}
      onClose={close}
      width="xl"
      title="Novo lote de gado"
      description={`Passo ${step + 1} de 3 · ${STEPS[step]}`}
      footer={
        <>
          {step > 0 ? (
            <Button variant="ghost" icon={<ChevronLeft className="size-4" />} onClick={() => setStep((s) => s - 1)} className="mr-auto">
              Voltar
            </Button>
          ) : (
            <Button variant="ghost" onClick={close} className="mr-auto">
              Cancelar
            </Button>
          )}
          {step < 2 ? (
            <Button variant="primary" iconRight={<ChevronRight className="size-4" />} onClick={() => void next.run()}>
              Continuar
            </Button>
          ) : (
            <Button variant="primary" icon={<Check className="size-4" />} loading={save.running} onClick={() => void save.run()}>
              Cadastrar lote
            </Button>
          )}
        </>
      }
    >
      {/* Passos */}
      <ol className="flex items-center gap-2 mb-6">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              className={cn('flex items-center gap-2 min-w-0', i < step && 'cursor-pointer')}
            >
              <span
                className={cn(
                  'size-7 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold num',
                  i < step ? 'bg-primary text-primary-fg' : i === step ? 'bg-primary-soft text-primary ring-2 ring-primary/40' : 'bg-surface-2 text-muted',
                )}
              >
                {i < step ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={cn('text-sm truncate hidden sm:inline', i === step ? 'text-fg font-medium' : 'text-muted')}>{label}</span>
            </button>
            {i < STEPS.length - 1 && <span className={cn('h-px flex-1', i < step ? 'bg-primary' : 'bg-border')} />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="space-y-6">
          <FormSection title="Identificação">
            <FormGrid>
              <Field label="Nome do lote" required span={2}>
                <Input value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Nelore Fazenda Boa Vista — set/26" autoFocus />
              </Field>
              <Field label="Código" hint="Deixe em branco para gerar (L-AAAA-NNN)">
                <Input value={d.code} onChange={(e) => set({ code: e.target.value })} placeholder="Automático" />
              </Field>
              <Field label="Empresa">
                <Select value={d.company} onChange={(v) => set({ company: v })} placeholder="—" options={optionsOf(COMPANY_LABELS)} />
              </Field>
            </FormGrid>
          </FormSection>

          <FormSection title="Compra">
            <FormGrid>
              <Field label="Fornecedor" span={2}>
                <Combobox value={d.supplierId} onChange={(v) => set({ supplierId: v })} options={suppliers} allowClear placeholder="Selecione o fornecedor de gado…" />
              </Field>
              <Field label="Data de compra" required>
                <DateInput value={d.purchaseDate} onChange={(v) => set({ purchaseDate: v })} />
              </Field>
              <Field label="Previsão de abate">
                <DateInput value={d.estimatedSlaughterDate} onChange={(v) => set({ estimatedSlaughterDate: v })} />
              </Field>
              <Field label="Nota fiscal">
                <Input value={d.purchaseInvoice} onChange={(e) => set({ purchaseInvoice: e.target.value })} placeholder="Nº da NF" />
              </Field>
              <Field label="GTA">
                <Input value={d.gtaNumber} onChange={(e) => set({ gtaNumber: e.target.value })} placeholder="Nº da GTA" />
              </Field>
            </FormGrid>
          </FormSection>

          <FormSection title="Manejo">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(['CAMPO', 'CONFINAMENTO'] as ManagementType[]).map((m) => {
                const active = d.managementType === m;
                const Icon = m === 'CAMPO' ? Trees : Fence;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => set({ managementType: m })}
                    className={cn(
                      'flex items-center gap-3 rounded-card border p-3.5 text-left transition-colors cursor-pointer',
                      active ? 'border-primary bg-primary-soft/50 ring-1 ring-primary/30' : 'border-border hover:border-border-strong',
                    )}
                  >
                    <span className={cn('size-10 rounded-control flex items-center justify-center shrink-0', active ? 'bg-primary text-primary-fg' : 'bg-surface-2 text-muted')}>
                      <Icon className="size-5" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-fg">{MANAGEMENT_LABELS[m]}</span>
                      <span className="block text-xs text-muted">{m === 'CAMPO' ? 'Recria e engorda a pasto' : 'Engorda / terminação no cocho'}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <FormGrid>
              {d.managementType === 'CONFINAMENTO' && (
                <Field label="Peso de entrada no confinamento">
                  <WeightInput value={d.confinementEntryWeightKg} onChange={(v) => set({ confinementEntryWeightKg: v })} />
                </Field>
              )}
              <Field label="Preço de referência de venda" hint="Usado para projetar a receita do lote">
                <NumberInput value={d.sellingPricePerKg} onChange={(v) => set({ sellingPricePerKg: v })} decimals={2} minDecimals={2} prefix="R$" suffix="/kg" />
              </Field>
              <Field label="Observações" span="full">
                <Textarea value={d.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} />
              </Field>
            </FormGrid>
          </FormSection>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-5">
          <Segmented
            value={d.mode}
            onChange={(mode) => set({ mode })}
            options={[
              { value: 'ANIMALS', label: 'Animais individuais', count: totals.count },
              { value: 'AGGREGATE', label: 'Só quantidade e peso' },
            ]}
          />
          {d.mode === 'ANIMALS' ? (
            <AnimalsEditor rows={d.animals} onChange={(animals) => set({ animals })} takenTags={takenTags} />
          ) : (
            <>
              <Callout tone="info">
                Use quando os animais ainda não foram brincados. Você pode incluir os animais individualmente depois, no detalhe do lote.
              </Callout>
              <FormGrid cols={3}>
                <Field label="Cabeças" required>
                  <NumberInput value={d.headCount} onChange={(v) => set({ headCount: v })} decimals={0} suffix="cab" />
                </Field>
                <Field label="Peso vivo total">
                  <WeightInput value={d.purchaseWeightKg} onChange={(v) => set({ purchaseWeightKg: v })} />
                </Field>
                <Field label="Valor total da compra">
                  <MoneyInput value={d.aggregateValue} onChange={(v) => set({ aggregateValue: v })} />
                </Field>
              </FormGrid>
              {!!d.headCount && !!d.purchaseWeightKg && (
                <p className="text-sm text-muted num">
                  Peso médio {kg(Math.round((d.purchaseWeightKg / d.headCount) * 10) / 10)}
                  {d.aggregateValue ? ` · ${money(d.aggregateValue / d.headCount)} por cabeça · ${money(d.aggregateValue / d.purchaseWeightKg)}/kg` : ''}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <FormSection title="Resumo do lote">
            <DescriptionList
              cols={3}
              items={[
                { label: 'Lote', value: d.name },
                { label: 'Fornecedor', value: supplierName || '—' },
                { label: 'Compra', value: date(d.purchaseDate) },
                { label: 'Manejo', value: MANAGEMENT_LABELS[d.managementType] },
                { label: 'Cabeças', value: <span className="num">{number(heads, 0)}</span> },
                { label: 'Peso vivo', value: <span className="num">{weight ? `${kg(weight)} (${kg(Math.round((weight / (heads || 1)) * 10) / 10)}/cab)` : '—'}</span> },
                { label: 'NF / GTA', value: [d.purchaseInvoice, d.gtaNumber].filter(Boolean).join(' · ') || '—' },
                { label: 'Previsão de abate', value: date(d.estimatedSlaughterDate) },
                { label: 'Preço de referência', value: d.sellingPricePerKg ? `${money(d.sellingPricePerKg)}/kg` : '—' },
              ]}
            />
          </FormSection>

          <FormSection title="Custo de compra">
            <Switch
              checked={d.launchCost}
              onChange={(v) => set({ launchCost: v })}
              label="Lançar o custo de compra no lote"
              description="Entra no resultado do lote como “Compra dos animais”."
            />
            {d.launchCost && (
              <>
                <FormGrid>
                  <Field label="Valor da compra" hint={defaultCost ? `Soma dos animais: ${money(defaultCost)}` : undefined}>
                    <MoneyInput value={costAmount} onChange={(v) => set({ costAmount: v })} />
                  </Field>
                  <Field label="Documento">
                    <Input value={d.costDocument} onChange={(e) => set({ costDocument: e.target.value })} placeholder={d.purchaseInvoice || 'Nº da NF'} />
                  </Field>
                </FormGrid>
                {costAmount > 0 && heads > 0 && (
                  <p className="text-sm text-muted num">
                    {money(costAmount / heads)} por cabeça
                    {weight ? ` · ${money(costAmount / weight)}/kg vivo` : ''}
                  </p>
                )}
                <PayableFields value={d.payable} onChange={(payable) => set({ payable })} amount={costAmount} issueDate={d.purchaseDate} />
              </>
            )}
          </FormSection>
        </div>
      )}
    </Drawer>
  );
}
