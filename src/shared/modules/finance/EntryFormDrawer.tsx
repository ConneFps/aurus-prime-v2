/**
 * Nova conta a pagar / a receber (manual), com prévia das parcelas.
 */
import { useMemo, useState } from 'react';
import { useOps } from '../../app/session';
import { useAction } from '../../data/react';
import { date, money, today } from '../../domain/format';
import { COMPANY_LABELS, ENTRY_CATEGORY_LABELS, optionsOf, PAYMENT_METHOD_LABELS } from '../../domain/labels';
import type { CompanyCode, EntryCategory, FinancialEntry, PaymentMethod } from '../../domain/types';
import { buildInstallments } from '../../ops/impl/common';
import { Button, Combobox, DateInput, Drawer, Field, FormGrid, FormSection, Input, MoneyInput, NumberInput, Segmented, Select, Textarea } from '../../ui';
import { useBatchOptions, useCustomerOptions, usePartnerOptions } from '../common/lookups';

type Direction = 'IN' | 'OUT';
type PartyType = 'CUSTOMER' | 'PARTNER' | 'OTHER';

interface Draft {
  direction: Direction;
  category: EntryCategory;
  partyType: PartyType;
  partyId: string | null;
  partyName: string;
  description: string;
  amount: number | null;
  issueDate: string;
  mode: 'COUNT' | 'TERMS';
  installments: number | null;
  firstDueDate: string;
  intervalDays: number | null;
  terms: string;
  method: PaymentMethod | '';
  documentNumber: string;
  company: CompanyCode | '';
  batchId: string | null;
  notes: string;
}

const IN_CATS: EntryCategory[] = ['SALE', 'EQUINE_SALE', 'SEMEN', 'SERVICES', 'OTHER'];
const OUT_CATS: EntryCategory[] = ['CATTLE_PURCHASE', 'FEED', 'FREIGHT', 'TAX', 'PAYROLL', 'SERVICES', 'SUPPLIES', 'EQUINE_EXPENSE', 'SEMEN', 'OTHER'];

export const newEntryDraft = (direction: Direction): Draft => ({
  direction,
  category: direction === 'IN' ? 'OTHER' : 'SUPPLIES',
  partyType: direction === 'IN' ? 'CUSTOMER' : 'PARTNER',
  partyId: null,
  partyName: '',
  description: '',
  amount: null,
  issueDate: today(),
  mode: 'COUNT',
  installments: 1,
  firstDueDate: today(),
  intervalDays: 30,
  terms: '',
  method: '',
  documentNumber: '',
  company: '',
  batchId: null,
  notes: '',
});

export function EntryFormDrawer({
  draft,
  onChange,
  onClose,
  onCreated,
}: {
  draft: Draft | null;
  onChange: (d: Draft) => void;
  onClose: () => void;
  onCreated?: (direction: Direction) => void;
}) {
  const ops = useOps();
  const { options: customerOptions, customers } = useCustomerOptions();
  const { options: partnerOptions, partners } = usePartnerOptions();
  const { options: batchOptions } = useBatchOptions();
  const [tried, setTried] = useState(false);

  const plan = useMemo(() => {
    if (!draft) return null;
    return draft.mode === 'TERMS'
      ? { terms: draft.terms, method: draft.method || null }
      : {
          installments: Math.max(1, Math.min(120, Math.floor(draft.installments || 1))),
          firstDueDate: draft.firstDueDate || draft.issueDate,
          intervalDays: draft.intervalDays || 30,
          method: draft.method || null,
        };
  }, [draft]);

  const preview = useMemo(() => {
    if (!draft || !plan || !draft.amount || draft.amount <= 0) return [];
    if (draft.mode === 'TERMS' && !/\d/.test(draft.terms)) return [];
    return buildInstallments(draft.amount, plan, draft.issueDate || today());
  }, [draft, plan]);

  const save = useAction(
    async (d: Draft): Promise<FinancialEntry[]> => {
      setTried(true);
      if (!d.partyName.trim()) throw new Error(d.partyType === 'CUSTOMER' ? 'Escolha o cliente.' : 'Informe o fornecedor/favorecido.');
      if (!d.amount || d.amount <= 0) throw new Error('Informe o valor total.');
      if (d.mode === 'TERMS' && !/\d/.test(d.terms)) throw new Error('Informe os prazos em dias (ex.: 30/60/90).');
      const description = d.description.trim() || `${ENTRY_CATEGORY_LABELS[d.category]} — ${d.partyName.trim()}`;
      return ops.createEntries({
        direction: d.direction,
        category: d.category,
        description,
        partyType: d.partyType,
        partyId: d.partyType === 'OTHER' ? null : d.partyId,
        partyName: d.partyName.trim(),
        amount: d.amount,
        issueDate: d.issueDate || today(),
        plan: plan!,
        documentNumber: d.documentNumber || null,
        notes: d.notes || null,
        batchId: d.batchId || null,
        company: d.company || null,
      });
    },
    {
      success: (rows) => `${rows.length === 1 ? 'Conta lançada' : `${rows.length} parcelas lançadas`}`,
      onSuccess: (rows) => {
        setTried(false);
        if (rows[0]) onCreated?.(rows[0].direction);
        onClose();
      },
    },
  );

  if (!draft) return <Drawer open={false} onClose={onClose} />;
  const d = draft;
  const set = (p: Partial<Draft>) => onChange({ ...d, ...p });
  const cats = d.direction === 'IN' ? IN_CATS : OUT_CATS;
  const total = preview.reduce((s, l) => s + l.amount, 0);

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      title={d.direction === 'IN' ? 'Nova conta a receber' : 'Nova conta a pagar'}
      description="Lançamento manual — as parcelas são geradas conforme o prazo escolhido."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.running} onClick={() => void save.run(d)}>
            Lançar {preview.length > 1 ? `${preview.length} parcelas` : 'conta'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          void save.run(d);
        }}
      >
        <FormSection title="Lançamento">
          <FormGrid>
            <Field label="Tipo" span="full">
              <Segmented
                value={d.direction}
                onChange={(v) => {
                  const n = newEntryDraft(v);
                  set({ direction: v, category: n.category, partyType: n.partyType, partyId: null, partyName: '' });
                }}
                options={[
                  { value: 'IN', label: 'A receber' },
                  { value: 'OUT', label: 'A pagar' },
                ]}
              />
            </Field>
            <Field label="Categoria" required>
              <Select value={d.category} onChange={(v) => set({ category: v })} options={cats.map((c) => ({ value: c, label: ENTRY_CATEGORY_LABELS[c] }))} />
            </Field>
            <Field label={d.direction === 'IN' ? 'Quem paga' : 'Quem recebe'}>
              <Segmented
                size="sm"
                value={d.partyType}
                onChange={(v) => set({ partyType: v, partyId: null, partyName: '' })}
                options={[
                  { value: 'CUSTOMER', label: 'Cliente' },
                  { value: 'PARTNER', label: 'Parceiro' },
                  { value: 'OTHER', label: 'Outro' },
                ]}
              />
            </Field>
            <Field
              label={d.partyType === 'CUSTOMER' ? 'Cliente' : d.partyType === 'PARTNER' ? 'Parceiro / fornecedor' : 'Nome do favorecido'}
              required
              span="full"
              error={tried && !d.partyName.trim() ? 'Obrigatório' : null}
            >
              {d.partyType === 'OTHER' ? (
                <Input value={d.partyName} onChange={(e) => set({ partyName: e.target.value })} placeholder="Ex.: Prefeitura, funcionário, banco…" />
              ) : (
                <Combobox
                  value={d.partyId}
                  onChange={(v) =>
                    set({
                      partyId: v,
                      partyName: (d.partyType === 'CUSTOMER' ? customers.find((c) => c.id === v)?.name : partners.find((p) => p.id === v)?.name) || '',
                    })
                  }
                  options={d.partyType === 'CUSTOMER' ? customerOptions : partnerOptions}
                  placeholder={d.partyType === 'CUSTOMER' ? 'Buscar cliente…' : 'Buscar parceiro…'}
                  allowClear
                />
              )}
            </Field>
            <Field label="Descrição" span="full" hint="Em branco: categoria + nome.">
              <Input value={d.description} onChange={(e) => set({ description: e.target.value })} placeholder="Ex.: Conta de energia de setembro" />
            </Field>
            <Field label="Valor total" required error={tried && !(d.amount && d.amount > 0) ? 'Informe o valor' : null}>
              <MoneyInput value={d.amount} onChange={(v) => set({ amount: v })} />
            </Field>
            <Field label="Emissão">
              <DateInput value={d.issueDate} onChange={(v) => set({ issueDate: v })} />
            </Field>
          </FormGrid>
        </FormSection>

        <FormSection title="Parcelas e vencimentos">
          <FormGrid>
            <Field label="Como dividir" span="full">
              <Segmented
                size="sm"
                value={d.mode}
                onChange={(v) => set({ mode: v })}
                options={[
                  { value: 'COUNT', label: 'Nº de parcelas' },
                  { value: 'TERMS', label: 'Prazos em dias' },
                ]}
              />
            </Field>
            {d.mode === 'COUNT' ? (
              <>
                <Field label="Parcelas">
                  <NumberInput value={d.installments} onChange={(v) => set({ installments: v })} decimals={0} />
                </Field>
                <Field label="1º vencimento">
                  <DateInput value={d.firstDueDate} onChange={(v) => set({ firstDueDate: v })} />
                </Field>
                <Field label="Intervalo (dias)" hint="Padrão 30 dias.">
                  <NumberInput value={d.intervalDays} onChange={(v) => set({ intervalDays: v })} decimals={0} />
                </Field>
              </>
            ) : (
              <Field label="Prazos (dias a partir da emissão)" span="full" hint="Separe por barra. Ex.: 28/35/42">
                <Input className="num" value={d.terms} onChange={(e) => set({ terms: e.target.value })} placeholder="30/60/90" />
              </Field>
            )}
            <Field label="Forma de pagamento">
              <Select value={d.method} onChange={(v) => set({ method: v })} placeholder="—" options={optionsOf(PAYMENT_METHOD_LABELS)} />
            </Field>
          </FormGrid>
          {preview.length > 0 && (
            <div className="mt-4 rounded-card border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-2/60 text-[11px] uppercase tracking-wider text-muted">
                    <th className="text-left px-3 h-8 font-semibold">Parcela</th>
                    <th className="text-left px-3 h-8 font-semibold">Vencimento</th>
                    <th className="text-right px-3 h-8 font-semibold">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 24).map((l) => (
                    <tr key={l.installment} className="border-t border-border">
                      <td className="px-3 py-1.5 num text-muted">
                        {l.installment}/{l.installments}
                      </td>
                      <td className="px-3 py-1.5 num">{date(l.dueDate)}</td>
                      <td className="px-3 py-1.5 num text-right">{money(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border-strong bg-surface-2/60 font-semibold">
                    <td className="px-3 py-1.5" colSpan={2}>
                      Total {preview.length > 24 ? `(${preview.length} parcelas)` : ''}
                    </td>
                    <td className="px-3 py-1.5 num text-right">{money(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </FormSection>

        <FormSection title="Documento e vínculos">
          <FormGrid>
            <Field label="Nº do documento (NF / boleto)">
              <Input value={d.documentNumber} onChange={(e) => set({ documentNumber: e.target.value })} />
            </Field>
            <Field label="Empresa">
              <Select value={d.company} onChange={(v) => set({ company: v })} placeholder="—" options={optionsOf(COMPANY_LABELS)} />
            </Field>
            {d.direction === 'OUT' && (
              <Field label="Lote de gado (opcional)" span="full" hint="Vincula a despesa ao lote para consulta.">
                <Combobox value={d.batchId} onChange={(v) => set({ batchId: v })} options={batchOptions} placeholder="Nenhum" allowClear />
              </Field>
            )}
            <Field label="Observações" span="full">
              <Textarea rows={2} value={d.notes} onChange={(e) => set({ notes: e.target.value })} />
            </Field>
          </FormGrid>
        </FormSection>
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
}

export type EntryDraft = Draft;
