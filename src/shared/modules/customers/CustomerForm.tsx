/**
 * Formulário de cliente (cadastro/edição) — usado na lista, no detalhe e na
 * revisão de solicitações de vendedores externos.
 */
import { ExternalLink } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../app/session';
import { useAction, useCrud, useTable } from '../../data/react';
import { formatCep, formatDocument, formatPhone, isValidDocument, isValidEmail, onlyDigits } from '../../domain/format';
import { COMPANY_LABELS, CUSTOMER_CATEGORY_LABELS, optionsOf, PAYMENT_METHOD_LABELS, RANKING, UF_LIST } from '../../domain/labels';
import type { CompanyCode, Customer, PaymentMethod } from '../../domain/types';
import {
  AttachmentList,
  Badge,
  Button,
  CepInput,
  Checkbox,
  Combobox,
  Drawer,
  Field,
  FileDrop,
  FormGrid,
  FormSection,
  Input,
  MaskedInput,
  MoneyInput,
  Segmented,
  Select,
  Stars,
  Switch,
  Textarea,
} from '../../ui';
import { usePriceTableOptions, useProfileOptions } from '../common/lookups';
import { draftFromCustomer, draftToRow, emptyCustomer, findDuplicate, type CustomerDraft } from './helpers';

const METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];

export type CustomerErrors = Partial<Record<'name' | 'document' | 'email' | 'financialEmail' | 'methods' | 'intercompany', string>>;

export function validateCustomer(d: CustomerDraft, customers: Customer[]): { errors: CustomerErrors; duplicate: Customer | null } {
  const errors: CustomerErrors = {};
  if (!d.name.trim()) errors.name = 'Informe a razão social ou o nome completo.';
  const digits = onlyDigits(d.document);
  const duplicate = findDuplicate(customers, d.document, d.isNew ? null : d.id);
  if (!digits) errors.document = `Informe o ${d.personType === 'F' ? 'CPF' : 'CNPJ'}.`;
  else if (d.personType === 'F' && digits.length !== 11) errors.document = 'CPF deve ter 11 dígitos.';
  else if (d.personType === 'J' && digits.length !== 14) errors.document = 'CNPJ deve ter 14 dígitos.';
  else if (!isValidDocument(digits)) errors.document = `${d.personType === 'F' ? 'CPF' : 'CNPJ'} inválido — confira os dígitos.`;
  else if (duplicate) errors.document = `Já cadastrado para ${duplicate.name}.`;
  if (d.email && !isValidEmail(d.email)) errors.email = 'E-mail inválido.';
  if (d.financialEmail && !isValidEmail(d.financialEmail)) errors.financialEmail = 'E-mail inválido.';
  if (!d.allowedPaymentMethods.length) errors.methods = 'Libere pelo menos uma forma de pagamento.';
  if (d.isIntercompany && !d.intercompanyCode) errors.intercompany = 'Selecione a empresa do grupo.';
  return { errors, duplicate };
}

/** Campos do cliente em seções. `mode='request'` esconde documentos e situação. */
export function CustomerFields({
  draft,
  set,
  errors,
  duplicate,
  mode = 'full',
}: {
  draft: CustomerDraft;
  set: (p: Partial<CustomerDraft>) => void;
  errors: CustomerErrors;
  duplicate?: Customer | null;
  mode?: 'full' | 'request';
}) {
  const { can } = useSession();
  const { options: sellerOptions, profiles } = useProfileOptions(['SELLER', 'MANAGER', 'ADMIN', 'EXTERNAL_SELLER']);
  const { options: tableOptions } = usePriceTableOptions();
  const { rows: all } = useTable('customers');
  const segments = useMemo(() => Array.from(new Set(all.map((c) => c.segment).filter(Boolean) as string[])).sort(), [all]);
  const crud = useCrud('customers');

  const toggleMethod = (m: PaymentMethod, on: boolean) => {
    const next = on ? [...draft.allowedPaymentMethods, m] : draft.allowedPaymentMethods.filter((x) => x !== m);
    const ordered = METHODS.filter((x) => next.includes(x));
    set({
      allowedPaymentMethods: ordered,
      preferredPaymentMethod: draft.preferredPaymentMethod && ordered.includes(draft.preferredPaymentMethod) ? draft.preferredPaymentMethod : ordered[0] ?? null,
    });
  };

  const isPJ = draft.personType === 'J';

  return (
    <div className="space-y-8">
      <FormSection title="Dados cadastrais" description="Identificação fiscal do cliente.">
        <FormGrid>
          <Field label="Tipo de pessoa" required>
            <Segmented
              value={draft.personType}
              onChange={(v) =>
                set({
                  personType: v,
                  category: v === 'J' ? 'EXTERNO_CNPJ' : draft.category === 'EXTERNO_CNPJ' ? 'EXTERNO_PF' : draft.category,
                })
              }
              options={[
                { value: 'J', label: 'Pessoa jurídica' },
                { value: 'F', label: 'Pessoa física' },
              ]}
            />
          </Field>
          <Field label="Categoria" required>
            <Select value={draft.category} onChange={(v) => set({ category: v })} options={optionsOf(CUSTOMER_CATEGORY_LABELS)} />
          </Field>
          <Field label={isPJ ? 'Razão social' : 'Nome completo'} required error={errors.name} span="full">
            <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} autoFocus={draft.isNew} />
          </Field>
          <Field label="Nome fantasia">
            <Input value={draft.tradeName || ''} onChange={(e) => set({ tradeName: e.target.value })} />
          </Field>
          <Field
            label={isPJ ? 'CNPJ' : 'CPF'}
            required
            error={errors.document}
            hint={duplicate ? undefined : 'Validamos os dígitos verificadores.'}
          >
            <MaskedInput mask="document" value={formatDocument(draft.document)} onChange={(v) => set({ document: v })} placeholder={isPJ ? '00.000.000/0000-00' : '000.000.000-00'} />
          </Field>
          {duplicate && (
            <div className="col-span-full -mt-2 flex flex-wrap items-center gap-2 rounded-control bg-danger-soft px-3 py-2 text-sm text-fg">
              <span>
                Este documento já pertence a <strong>{duplicate.name}</strong>.
              </span>
              <Link to={`/clientes/${duplicate.id}`} target="_blank" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                Abrir cadastro <ExternalLink className="size-3" />
              </Link>
            </div>
          )}
          {isPJ && (
            <>
              <Field label="Inscrição estadual" hint="Deixe em branco se isento.">
                <Input value={draft.stateRegistration || ''} onChange={(e) => set({ stateRegistration: e.target.value })} />
              </Field>
              <Field label="Inscrição municipal">
                <Input value={draft.municipalRegistration || ''} onChange={(e) => set({ municipalRegistration: e.target.value })} />
              </Field>
            </>
          )}
          {mode === 'full' && (
            <Field label="Código interno" hint="Opcional (ex.: código do ERP fiscal).">
              <Input value={draft.code || ''} onChange={(e) => set({ code: e.target.value })} />
            </Field>
          )}
        </FormGrid>
      </FormSection>

      <FormSection title="Endereço" description="Usado na entrega e no cálculo do frete. O CEP preenche o restante.">
        <FormGrid cols={3}>
          <Field label="CEP">
            <CepInput
              value={formatCep(draft.zipCode)}
              onChange={(v) => set({ zipCode: v })}
              onAddress={(a) => set({ street: a.street || draft.street, district: a.district || draft.district, city: a.city, state: a.state })}
            />
          </Field>
          <Field label="Logradouro" span={2}>
            <Input value={draft.street || ''} onChange={(e) => set({ street: e.target.value })} />
          </Field>
          <Field label="Número">
            <Input value={draft.number || ''} onChange={(e) => set({ number: e.target.value })} />
          </Field>
          <Field label="Complemento">
            <Input value={draft.complement || ''} onChange={(e) => set({ complement: e.target.value })} />
          </Field>
          <Field label="Bairro">
            <Input value={draft.district || ''} onChange={(e) => set({ district: e.target.value })} />
          </Field>
          <Field label="Cidade" span={2}>
            <Input value={draft.city || ''} onChange={(e) => set({ city: e.target.value })} />
          </Field>
          <Field label="UF">
            <Select value={draft.state || ''} onChange={(v) => set({ state: v })} placeholder="—" options={UF_LIST.map((u) => ({ value: u, label: u }))} />
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection title="Contatos">
        <FormGrid>
          <Field label="Responsável / contato">
            <Input value={draft.contactName || ''} onChange={(e) => set({ contactName: e.target.value })} />
          </Field>
          <Field label="Celular / WhatsApp">
            <MaskedInput mask="phone" value={formatPhone(draft.cellphone)} onChange={(v) => set({ cellphone: v })} />
          </Field>
          <Field label="Telefone fixo">
            <MaskedInput mask="phone" value={formatPhone(draft.phone)} onChange={(v) => set({ phone: v })} placeholder="(00) 0000-0000" />
          </Field>
          <Field label="E-mail" error={errors.email}>
            <Input type="email" value={draft.email || ''} onChange={(e) => set({ email: e.target.value })} />
          </Field>
          <Field label="E-mail do financeiro" error={errors.financialEmail} hint="Recebe boletos e notas." span="full">
            <Input type="email" value={draft.financialEmail || ''} onChange={(e) => set({ financialEmail: e.target.value })} />
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection title="Financeiro" description="Condições que a venda usa como padrão para este cliente.">
        <FormGrid>
          <Field label="Condição / prazos" hint='Dias separados por "/" (ex.: 28/35/42). Vazio = à vista.'>
            <Input value={draft.paymentTerms || ''} onChange={(e) => set({ paymentTerms: e.target.value })} placeholder="À vista" />
          </Field>
          <Field label="Limite de crédito" hint="0 = sem limite definido.">
            <MoneyInput value={draft.creditLimit} onChange={(v) => set({ creditLimit: v ?? 0 })} />
          </Field>
          <Field label="Forma de pagamento preferida">
            <Select
              value={draft.preferredPaymentMethod || ''}
              onChange={(v) => set({ preferredPaymentMethod: v as PaymentMethod })}
              options={draft.allowedPaymentMethods.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))}
              placeholder="—"
            />
          </Field>
          {mode === 'full' && !draft.isNew && (
            <Field label="Aprovação financeira">
              <div className="h-10 flex items-center gap-2 text-sm text-muted">
                <Badge tone={draft.financialApproval === 'APPROVED' ? 'success' : draft.financialApproval === 'REJECTED' ? 'danger' : 'warning'} dot>
                  {draft.financialApproval === 'APPROVED' ? 'Aprovado' : draft.financialApproval === 'REJECTED' ? 'Reprovado' : 'Pendente'}
                </Badge>
                <span className="text-xs">altere na ficha do cliente</span>
              </div>
            </Field>
          )}
          <Field label="Formas de pagamento liberadas" error={errors.methods} span="full">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2.5 rounded-control border border-border p-3">
              {METHODS.map((m) => (
                <Checkbox key={m} checked={draft.allowedPaymentMethods.includes(m)} onChange={(v) => toggleMethod(m, v)} label={PAYMENT_METHOD_LABELS[m]} />
              ))}
            </div>
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection title="Comercial">
        <FormGrid>
          <Field label="Segmento" hint="Ex.: Restaurante, Açougue, Churrascaria.">
            <Input list="customer-segments" value={draft.segment || ''} onChange={(e) => set({ segment: e.target.value })} />
            <datalist id="customer-segments">
              {segments.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          <Field label="Vendedor responsável">
            <Combobox
              value={draft.sellerId}
              onChange={(v) => set({ sellerId: v, sellerName: profiles.find((p) => p.id === v)?.name ?? null })}
              options={sellerOptions}
              placeholder="Venda direta (sem vendedor)"
              allowClear
            />
          </Field>
          <Field label="Tabela de preço" hint="Vazio = tabela escolhida no pedido.">
            <Combobox value={draft.priceTableId} onChange={(v) => set({ priceTableId: v })} options={tableOptions} placeholder="Tabela padrão" allowClear />
          </Field>
          {mode === 'full' && !draft.isNew && (
            <Field label="Ranking (automático)">
              <div className="h-10 flex items-center gap-2">
                <Badge tone={RANKING[draft.ranking].tone} dot>
                  {RANKING[draft.ranking].label}
                </Badge>
                <Stars value={draft.stars} />
              </div>
            </Field>
          )}
          <div className="col-span-full rounded-card border border-border p-3 space-y-3">
            <Switch
              checked={draft.isIntercompany}
              onChange={(v) => set({ isIntercompany: v, intercompanyCode: v ? draft.intercompanyCode : null })}
              label="Empresa do grupo (intercompany)"
              description="Vendas para este cliente saem como intercompany."
            />
            {draft.isIntercompany && (
              <Field label="Empresa" required error={errors.intercompany}>
                <Select value={draft.intercompanyCode || ''} onChange={(v) => set({ intercompanyCode: v as CompanyCode })} placeholder="Selecione…" options={optionsOf(COMPANY_LABELS)} />
              </Field>
            )}
          </div>
        </FormGrid>
      </FormSection>

      {mode === 'full' && (
        <FormSection title="Documentos" description="Cartão CNPJ, contrato social, comprovante de endereço, documentos dos sócios.">
          <FileDrop
            folder={`customers/${draft.id}`}
            kind="DOCUMENT"
            multiple
            compact
            disabled={!can('customers.manage')}
            onUploaded={async (att) => {
              const docs = [...draft.documents, att];
              set({ documents: docs });
              if (!draft.isNew) await crud.update(draft.id, { documents: docs });
            }}
          />
          <AttachmentList
            items={draft.documents}
            empty="Nenhum documento anexado."
            onRemove={(a) => {
              const docs = draft.documents.filter((x) => x.id !== a.id);
              set({ documents: docs });
              if (!draft.isNew) void crud.update(draft.id, { documents: docs });
            }}
          />
        </FormSection>
      )}

      <FormSection title="Observações">
        <Textarea value={draft.notes || ''} onChange={(e) => set({ notes: e.target.value })} placeholder="Preferências de corte, horário de recebimento, observações do financeiro…" />
        {mode === 'full' && (
          <Switch
            checked={draft.status === 'ACTIVE'}
            onChange={(v) => set({ status: v ? 'ACTIVE' : 'BLOCKED' })}
            label="Cliente ativo"
            description="Clientes bloqueados não podem receber novos pedidos."
          />
        )}
      </FormSection>
    </div>
  );
}

/** Drawer de cadastro/edição. Montado só quando aberto. */
export function CustomerFormDrawer({
  customer,
  onClose,
  onSaved,
}: {
  customer: Customer | null;
  onClose: () => void;
  onSaved?: (id: string, isNew: boolean) => void;
}) {
  const crud = useCrud('customers');
  const { rows: customers } = useTable('customers');
  const [draft, setDraft] = useState<CustomerDraft>(() => (customer ? draftFromCustomer(customer) : emptyCustomer()));
  const [showErrors, setShowErrors] = useState(false);
  const set = (p: Partial<CustomerDraft>) => setDraft((d) => ({ ...d, ...p }));
  const { errors, duplicate } = validateCustomer(draft, customers);

  const save = useAction(
    async () => {
      setShowErrors(true);
      const first = Object.values(errors)[0];
      if (first) throw new Error(first);
      const row = draftToRow(draft);
      if (draft.isNew) await crud.insert({ ...row, id: draft.id });
      else await crud.update(draft.id, row);
      return draft.id;
    },
    { success: draft.isNew ? 'Cliente cadastrado' : 'Cadastro atualizado', onSuccess: (id) => onSaved?.(id, draft.isNew) },
  );

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      title={draft.isNew ? 'Novo cliente' : 'Editar cliente'}
      description={draft.isNew ? 'Cadastro completo — campos com * são obrigatórios.' : customer?.name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.running} onClick={() => void save.run()}>
            {draft.isNew ? 'Cadastrar cliente' : 'Salvar alterações'}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save.run();
        }}
      >
        <CustomerFields draft={draft} set={set} errors={showErrors ? errors : { document: duplicate ? errors.document : undefined }} duplicate={duplicate} />
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
}
