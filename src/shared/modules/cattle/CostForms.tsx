/**
 * Lançamento de custo (um) e lançamento rápido (vários de uma vez, com modelos
 * — ex.: planilha de impostos Funrural/ICMS/SENAR/GTA).
 */
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useOps } from '../../app/session';
import { useAction } from '../../data/react';
import { money, round2, today } from '../../domain/format';
import { COST_GROUP_LABELS } from '../../domain/labels';
import type { CostCategory, CostGroup } from '../../domain/types';
import type { BatchCostInput } from '../../ops/types';
import {
  Button,
  Callout,
  Combobox,
  DateInput,
  Drawer,
  Field,
  FormGrid,
  FormSection,
  IconButton,
  Input,
  MoneyInput,
  PercentInput,
  Segmented,
} from '../../ui';
import { useBatchOptions, usePartnerOptions } from '../common/lookups';
import { categoriesOfGroup, categoryLabel, COST_CATEGORY_OPTIONS, groupOf, isCreditCategory } from './helpers';
import { emptyPayable, PayableFields, toPlan, type PayableDraft } from './PayableFields';

// ---------------------------------------------------------------------------
// Um custo
// ---------------------------------------------------------------------------

interface CostDraft {
  batchId: string | null;
  category: CostCategory | null;
  date: string;
  amount: number | null;
  description: string;
  documentNumber: string;
  partnerId: string | null;
  payable: PayableDraft;
}

export function CostDrawer({
  open,
  onClose,
  batchId,
  defaultCategory,
}: {
  open: boolean;
  onClose: () => void;
  /** Lote fixo (detalhe do lote). */
  batchId?: string;
  defaultCategory?: CostCategory;
}) {
  const ops = useOps();
  const { options: batchOptions } = useBatchOptions();
  const { options: partners } = usePartnerOptions();
  const blank = (): CostDraft => ({
    batchId: batchId || null,
    category: defaultCategory || null,
    date: today(),
    amount: null,
    description: '',
    documentNumber: '',
    partnerId: null,
    payable: emptyPayable(today()),
  });
  const [d, setD] = useState<CostDraft>(blank);
  useEffect(() => {
    if (open) setD(blank());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, batchId, defaultCategory]);
  const set = (p: Partial<CostDraft>) => setD((x) => ({ ...x, ...p }));
  const credit = d.category ? isCreditCategory(d.category) : false;

  const save = useAction(
    async () => {
      if (!d.batchId) throw new Error('Selecione o lote.');
      if (!d.category) throw new Error('Selecione a categoria do custo.');
      if (!d.amount || d.amount <= 0) throw new Error('Informe um valor maior que zero.');
      return ops.addBatchCost({
        batchId: d.batchId,
        category: d.category,
        date: d.date,
        amount: d.amount,
        description: d.description.trim() || null,
        documentNumber: d.documentNumber.trim() || null,
        partnerId: d.partnerId,
        createPayable: toPlan(d.payable),
      });
    },
    { success: 'Custo lançado', onSuccess: onClose },
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Lançar custo"
      description="O custo entra no resultado do lote. Créditos (retorno do abate, crédito de imposto) reduzem o custo."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.running} onClick={() => void save.run()}>
            Lançar custo
          </Button>
        </>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void save.run();
        }}
      >
        <FormGrid>
          {!batchId && (
            <Field label="Lote" required span="full">
              <Combobox value={d.batchId} onChange={(v) => set({ batchId: v })} options={batchOptions} placeholder="Selecione o lote…" />
            </Field>
          )}
          <Field label="Categoria" required span="full">
            <Combobox value={d.category} onChange={(v) => set({ category: v as CostCategory | null })} options={COST_CATEGORY_OPTIONS} placeholder="Selecione a categoria…" />
          </Field>
          <Field label="Data" required>
            <DateInput value={d.date} onChange={(v) => set({ date: v })} />
          </Field>
          <Field label={credit ? 'Valor do crédito' : 'Valor'} required>
            <MoneyInput value={d.amount} onChange={(v) => set({ amount: v })} />
          </Field>
          <Field label="Descrição" span="full">
            <Input value={d.description} onChange={(e) => set({ description: e.target.value })} placeholder="Ex.: Vacina aftosa — 2ª dose" />
          </Field>
          <Field label="Documento (NF, recibo)">
            <Input value={d.documentNumber} onChange={(e) => set({ documentNumber: e.target.value })} />
          </Field>
          <Field label="Parceiro">
            <Combobox value={d.partnerId} onChange={(v) => set({ partnerId: v })} options={partners} allowClear placeholder="Opcional" />
          </Field>
        </FormGrid>
        {credit && <Callout tone="info">Categoria de crédito: o valor será subtraído do custo do lote.</Callout>}
        <PayableFields
          value={d.payable}
          onChange={(payable) => set({ payable })}
          amount={d.amount || 0}
          issueDate={d.date}
          label={credit ? 'Gerar conta a receber' : 'Gerar conta a pagar'}
        />
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Lançamento rápido (vários custos de uma vez)
// ---------------------------------------------------------------------------

type Template = 'FISCAL' | 'OPERATIONAL' | 'SLAUGHTER' | 'FREE';

const TEMPLATES: Record<Exclude<Template, 'FREE'>, CostCategory[]> = {
  FISCAL: ['FUNRURAL_PURCHASE', 'ICMS_PURCHASE', 'SENAR_PURCHASE', 'GTA_FEE', 'ENTRY_PROTOCOL', 'FUNRURAL_SALE', 'ICMS_SALE', 'SENAR_SALE', 'INSPECTION_FEE'],
  OPERATIONAL: ['PURCHASE_COMMISSION', 'PURCHASE_FREIGHT', ...categoriesOfGroup('OPERATIONAL').filter((c) => c !== 'FEED')],
  SLAUGHTER: [...categoriesOfGroup('SLAUGHTER'), 'SLAUGHTER_RETURN', 'SALES_COMMISSION'],
};

/** Alíquotas sugeridas (editáveis) para a planilha de impostos. */
const DEFAULT_RATES: Partial<Record<CostCategory, number>> = {
  FUNRURAL_PURCHASE: 1.3,
  SENAR_PURCHASE: 0.2,
};

interface Line {
  key: string;
  category: CostCategory | null;
  rate: number | null;
  amount: number | null;
  description: string;
}

let lineSeq = 0;
const mkLine = (category: CostCategory | null, rate: number | null = null): Line => ({ key: `l${lineSeq++}`, category, rate, amount: null, description: '' });

export function QuickCostsDrawer({
  open,
  onClose,
  batchId,
  initialTemplate = 'FISCAL',
}: {
  open: boolean;
  onClose: () => void;
  batchId?: string;
  initialTemplate?: Template;
}) {
  const ops = useOps();
  const { options: batchOptions } = useBatchOptions();
  const { options: partners } = usePartnerOptions();
  const [batch, setBatch] = useState<string | null>(batchId || null);
  const [date, setDate] = useState(today());
  const [doc, setDoc] = useState('');
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [template, setTemplate] = useState<Template>(initialTemplate);
  const [base, setBase] = useState<number | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [payable, setPayable] = useState<PayableDraft>(emptyPayable(today()));

  const loadTemplate = (t: Template) => {
    setTemplate(t);
    setLines(t === 'FREE' ? [mkLine(null), mkLine(null)] : TEMPLATES[t].map((c) => mkLine(c, t === 'FISCAL' ? DEFAULT_RATES[c] ?? null : null)));
  };
  useEffect(() => {
    if (!open) return;
    setBatch(batchId || null);
    setDate(today());
    setDoc('');
    setPartnerId(null);
    setBase(null);
    setPayable(emptyPayable(today()));
    loadTemplate(initialTemplate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, batchId, initialTemplate]);

  const updateLine = (key: string, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const applyBase = (b: number | null) => {
    setBase(b);
    if (b) setLines((ls) => ls.map((l) => (l.rate ? { ...l, amount: round2((b * l.rate) / 100) } : l)));
  };

  const filled = lines.filter((l) => l.category && (l.amount || 0) > 0);
  const total = useMemo(() => filled.reduce((s, l) => s + (isCreditCategory(l.category!) ? -1 : 1) * (l.amount || 0), 0), [filled]);
  const byGroup = useMemo(() => {
    const m = new Map<CostGroup, number>();
    for (const l of filled) m.set(groupOf(l.category!), (m.get(groupOf(l.category!)) || 0) + (l.amount || 0));
    return m;
  }, [filled]);

  const save = useAction(
    async () => {
      if (!batch) throw new Error('Selecione o lote.');
      if (!filled.length) throw new Error('Preencha o valor de pelo menos um custo.');
      const plan = toPlan(payable);
      const rows: BatchCostInput[] = filled.map((l) => ({
        batchId: batch,
        category: l.category!,
        date,
        amount: l.amount!,
        description: l.description.trim() || (l.rate ? `${categoryLabel(l.category!)} ${String(l.rate).replace('.', ',')}% sobre ${money(base)}` : null),
        documentNumber: doc.trim() || null,
        partnerId,
        createPayable: plan,
      }));
      return ops.importBatchCosts(rows);
    },
    { success: (n) => `${n} custos lançados`, onSuccess: onClose },
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title="Lançamento rápido de custos"
      description="Vários custos do mesmo lote de uma vez — preencha só o que tiver valor."
      footer={
        <>
          <span className="mr-auto text-sm text-muted self-center num">
            {filled.length} lançamentos · <span className="text-fg font-semibold">{money(total)}</span>
          </span>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.running} onClick={() => void save.run()}>
            Lançar {filled.length || ''} custos
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <FormGrid>
          {!batchId && (
            <Field label="Lote" required span="full">
              <Combobox value={batch} onChange={setBatch} options={batchOptions} placeholder="Selecione o lote…" />
            </Field>
          )}
          <Field label="Data" required>
            <DateInput value={date} onChange={setDate} />
          </Field>
          <Field label="Documento (NF, guia)">
            <Input value={doc} onChange={(e) => setDoc(e.target.value)} />
          </Field>
          <Field label="Parceiro" span="full" hint="Opcional — aplicado a todos os lançamentos">
            <Combobox value={partnerId} onChange={setPartnerId} options={partners} allowClear placeholder="Opcional" />
          </Field>
        </FormGrid>

        <FormSection
          title="Custos"
          actions={
            <Segmented
              size="sm"
              value={template}
              onChange={loadTemplate}
              options={[
                { value: 'FISCAL', label: 'Impostos' },
                { value: 'OPERATIONAL', label: 'Operacional' },
                { value: 'SLAUGHTER', label: 'Abate' },
                { value: 'FREE', label: 'Livre' },
              ]}
            />
          }
        >
          {template === 'FISCAL' && (
            <div className="flex flex-col sm:flex-row sm:items-end gap-3 rounded-control bg-surface-2/60 border border-border p-3">
              <Field label="Base de cálculo (valor da nota)" className="sm:w-64">
                <MoneyInput value={base} onChange={applyBase} />
              </Field>
              <p className="text-xs text-muted sm:pb-2.5">Informe a base e as alíquotas para calcular os valores; ou digite o valor direto.</p>
            </div>
          )}
          <ul className="divide-y divide-border rounded-card border border-border">
            {lines.map((l) => (
              <li
                key={l.key}
                className={
                  template === 'FISCAL'
                    ? 'grid grid-cols-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_110px_150px] gap-2 p-3 items-center'
                    : 'grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_150px_36px] gap-2 p-3 items-center'
                }
              >
                {template === 'FREE' ? (
                  <div className="col-span-2 sm:col-span-1">
                    <Combobox value={l.category} onChange={(v) => updateLine(l.key, { category: v as CostCategory | null })} options={COST_CATEGORY_OPTIONS} placeholder="Categoria…" />
                  </div>
                ) : (
                  <div className="col-span-2 sm:col-span-1 min-w-0">
                    <div className="text-sm font-medium text-fg truncate">{categoryLabel(l.category!)}</div>
                    {isCreditCategory(l.category!) && <div className="text-xs text-success">Crédito — reduz o custo</div>}
                  </div>
                )}
                <Input
                  className={template === 'FISCAL' ? 'col-span-2 sm:col-span-1' : ''}
                  placeholder="Descrição (opcional)"
                  value={l.description}
                  onChange={(e) => updateLine(l.key, { description: e.target.value })}
                />
                {template === 'FISCAL' && (
                  <PercentInput
                    aria-label="Alíquota"
                    placeholder="%"
                    value={l.rate}
                    onChange={(v) => updateLine(l.key, { rate: v, amount: v && base ? round2((base * v) / 100) : l.amount })}
                  />
                )}
                <MoneyInput
                  aria-label="Valor"
                  className={template === 'FREE' ? 'col-span-1' : template === 'FISCAL' ? '' : 'col-span-2 sm:col-span-1'}
                  value={l.amount}
                  onChange={(v) => updateLine(l.key, { amount: v })}
                />
                {template === 'FREE' ? (
                  <IconButton label="Remover" variant="danger" size="sm" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                    <Trash2 className="size-4" />
                  </IconButton>
                ) : template !== 'FISCAL' ? (
                  <span className="hidden sm:block" />
                ) : null}
              </li>
            ))}
          </ul>
          {template === 'FREE' && (
            <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setLines((ls) => [...ls, mkLine(null)])}>
              Adicionar linha
            </Button>
          )}
          {byGroup.size > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              {[...byGroup].map(([g, v]) => (
                <span key={g} className="num">
                  {COST_GROUP_LABELS[g]}: <span className="text-fg font-medium">{money(v)}</span>
                </span>
              ))}
            </div>
          )}
        </FormSection>

        <PayableFields
          value={payable}
          onChange={setPayable}
          amount={filled.filter((l) => !isCreditCategory(l.category!)).reduce((s, l) => s + (l.amount || 0), 0)}
          issueDate={date}
          label="Gerar contas a pagar"
          description="Cria uma conta (com as parcelas escolhidas) para cada custo lançado."
        />
      </div>
    </Drawer>
  );
}
