/**
 * Pré-cadastro de cliente (vendedor externo e vendedor interno): vira
 * customer_requests PENDING; o financeiro libera (com limite e condição) ou bloqueia.
 */
import { Send } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../../app/session';
import { useAction, useCrud } from '../../../data/react';
import { isValidDocument, isValidEmail, onlyDigits } from '../../../domain/format';
import { CUSTOMER_CATEGORY_LABELS, optionsOf, UF_LIST } from '../../../domain/labels';
import type { CustomerCategory } from '../../../domain/types';
import { Button, Callout, Card, CepInput, Field, FormGrid, FormSection, Input, MaskedInput, MoneyInput, PageHeader, Segmented, Select, Textarea } from '../../../ui';
import { useMyCustomers, useMyRequests } from './shared';

interface Form {
  personType: 'F' | 'J';
  category: CustomerCategory;
  name: string;
  tradeName: string;
  document: string;
  stateRegistration: string;
  contactName: string;
  cellphone: string;
  phone: string;
  email: string;
  zipCode: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  notes: string;
  suggestedCreditLimit: number | null;
  suggestedPaymentTerms: string;
}

const EMPTY: Form = {
  personType: 'J',
  category: 'EXTERNO_CNPJ',
  name: '',
  tradeName: '',
  document: '',
  stateRegistration: '',
  contactName: '',
  cellphone: '',
  phone: '',
  email: '',
  zipCode: '',
  street: '',
  number: '',
  complement: '',
  district: '',
  city: '',
  state: '',
  notes: '',
  suggestedCreditLimit: null,
  suggestedPaymentTerms: '',
};

/** Condições de pagamento mais usadas (texto livre também vale). */
export const PAYMENT_TERMS_OPTIONS = ['À vista', '7 dias', '14 dias', '21 dias', '28 dias', '28/35/42', '30/60/90'];

export function RequestFormView({ internal = false }: { internal?: boolean }) {
  const nav = useNavigate();
  const backTo = internal ? '/clientes?aba=solicitacoes' : '/clientes';
  const { profile } = useSession();
  const crud = useCrud('customer_requests');
  const { rows: customers } = useMyCustomers();
  const { rows: requests } = useMyRequests();
  const [f, setF] = useState<Form>(EMPTY);
  const [touched, setTouched] = useState(false);
  const set = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }));
  const isPJ = f.personType === 'J';

  const digits = onlyDigits(f.document);
  const errors: Partial<Record<keyof Form, string>> = {};
  if (!f.name.trim()) errors.name = isPJ ? 'Informe a razão social.' : 'Informe o nome completo.';
  if (!digits) errors.document = `Informe o ${isPJ ? 'CNPJ' : 'CPF'}.`;
  else if (digits.length !== (isPJ ? 14 : 11) || !isValidDocument(digits)) errors.document = `${isPJ ? 'CNPJ' : 'CPF'} inválido — confira os dígitos.`;
  else if (customers.some((c) => onlyDigits(c.document) === digits)) errors.document = 'Este cliente já está na sua carteira.';
  else if (requests.some((r) => r.status === 'PENDING' && onlyDigits(r.document) === digits)) errors.document = 'Você já enviou uma solicitação para este documento.';
  if (!f.cellphone && !f.phone) errors.cellphone = 'Informe pelo menos um telefone.';
  if (f.email && !isValidEmail(f.email)) errors.email = 'E-mail inválido.';
  if (!f.city.trim()) errors.city = 'Informe a cidade.';

  const send = useAction(
    async () => {
      setTouched(true);
      const first = Object.values(errors)[0];
      if (first) throw new Error(first);
      if (!profile) throw new Error('Sessão expirada — entre novamente.');
      const n = (s: string) => s.trim() || null;
      await crud.insert({
        name: f.name.trim(),
        tradeName: n(f.tradeName),
        personType: f.personType,
        document: digits,
        category: f.category,
        stateRegistration: isPJ ? n(f.stateRegistration) : null,
        contactName: n(f.contactName),
        phone: onlyDigits(f.phone) || null,
        cellphone: onlyDigits(f.cellphone) || null,
        email: n(f.email)?.toLowerCase() ?? null,
        zipCode: onlyDigits(f.zipCode) || null,
        street: n(f.street),
        number: n(f.number),
        complement: n(f.complement),
        district: n(f.district),
        city: n(f.city),
        state: n(f.state),
        notes: n(f.notes),
        suggestedCreditLimit: f.suggestedCreditLimit && f.suggestedCreditLimit > 0 ? f.suggestedCreditLimit : null,
        suggestedPaymentTerms: n(f.suggestedPaymentTerms),
        status: 'PENDING',
        requestedById: profile.id,
        requestedByName: profile.name,
        requestedByEmail: profile.email,
      });
    },
    { success: 'Pré-cadastro enviado ao financeiro', onSuccess: () => nav('/clientes?aba=solicitacoes') },
  );

  const err = (k: keyof Form) => (touched ? errors[k] : k === 'document' && digits.length >= 11 ? errors.document : undefined);

  return (
    <>
      <PageHeader
        back={backTo}
        title={internal ? 'Pré-cadastro de cliente' : 'Solicitar novo cliente'}
        subtitle="O financeiro confere os dados e libera o crédito. Liberado, o cliente entra na sua carteira."
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send.run();
        }}
      >
        <Card className="space-y-8">
          <FormSection title="Identificação">
            <FormGrid>
              <Field label="Tipo" required>
                <Segmented
                  value={f.personType}
                  onChange={(v) => set({ personType: v, category: v === 'J' ? 'EXTERNO_CNPJ' : 'EXTERNO_PF' })}
                  options={[
                    { value: 'J', label: 'Empresa (CNPJ)' },
                    { value: 'F', label: 'Pessoa física' },
                  ]}
                />
              </Field>
              <Field label="Categoria">
                <Select value={f.category} onChange={(v) => set({ category: v })} options={optionsOf(CUSTOMER_CATEGORY_LABELS)} />
              </Field>
              <Field label={isPJ ? 'Razão social' : 'Nome completo'} required error={err('name')} span="full">
                <Input value={f.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
              </Field>
              <Field label="Nome fantasia">
                <Input value={f.tradeName} onChange={(e) => set({ tradeName: e.target.value })} />
              </Field>
              <Field label={isPJ ? 'CNPJ' : 'CPF'} required error={err('document')}>
                <MaskedInput mask="document" value={f.document} onChange={(v) => set({ document: v })} placeholder={isPJ ? '00.000.000/0000-00' : '000.000.000-00'} />
              </Field>
              {isPJ && (
                <Field label="Inscrição estadual" hint="Em branco se isento.">
                  <Input value={f.stateRegistration} onChange={(e) => set({ stateRegistration: e.target.value })} />
                </Field>
              )}
            </FormGrid>
          </FormSection>

          <FormSection title="Contato">
            <FormGrid>
              <Field label="Responsável pelas compras">
                <Input value={f.contactName} onChange={(e) => set({ contactName: e.target.value })} />
              </Field>
              <Field label="Celular / WhatsApp" required error={err('cellphone')}>
                <MaskedInput mask="phone" value={f.cellphone} onChange={(v) => set({ cellphone: v })} />
              </Field>
              <Field label="Telefone fixo">
                <MaskedInput mask="phone" value={f.phone} onChange={(v) => set({ phone: v })} placeholder="(00) 0000-0000" />
              </Field>
              <Field label="E-mail" error={err('email')}>
                <Input type="email" inputMode="email" value={f.email} onChange={(e) => set({ email: e.target.value })} />
              </Field>
            </FormGrid>
          </FormSection>

          <FormSection title="Endereço de entrega" description="Digite o CEP para preencher o restante.">
            <FormGrid cols={3}>
              <Field label="CEP">
                <CepInput
                  value={f.zipCode}
                  onChange={(v) => set({ zipCode: v })}
                  onAddress={(a) => set({ street: a.street || f.street, district: a.district || f.district, city: a.city, state: a.state })}
                />
              </Field>
              <Field label="Logradouro" span={2}>
                <Input value={f.street} onChange={(e) => set({ street: e.target.value })} />
              </Field>
              <Field label="Número">
                <Input value={f.number} onChange={(e) => set({ number: e.target.value })} inputMode="numeric" />
              </Field>
              <Field label="Complemento">
                <Input value={f.complement} onChange={(e) => set({ complement: e.target.value })} />
              </Field>
              <Field label="Bairro">
                <Input value={f.district} onChange={(e) => set({ district: e.target.value })} />
              </Field>
              <Field label="Cidade" required error={err('city')} span={2}>
                <Input value={f.city} onChange={(e) => set({ city: e.target.value })} />
              </Field>
              <Field label="UF">
                <Select value={f.state} onChange={(v) => set({ state: v })} placeholder="—" options={UF_LIST.map((u) => ({ value: u, label: u }))} />
              </Field>
            </FormGrid>
          </FormSection>

          <FormSection title="Crédito sugerido" description="Sua sugestão para o financeiro. Quem decide o limite e o prazo é o financeiro.">
            <FormGrid>
              <Field label="Limite de crédito sugerido">
                <MoneyInput value={f.suggestedCreditLimit} onChange={(v) => set({ suggestedCreditLimit: v })} placeholder="0,00" />
              </Field>
              <Field label="Condição de pagamento sugerida">
                <Select
                  value={f.suggestedPaymentTerms}
                  onChange={(v) => set({ suggestedPaymentTerms: v })}
                  placeholder="—"
                  options={PAYMENT_TERMS_OPTIONS.map((t) => ({ value: t, label: t }))}
                />
              </Field>
            </FormGrid>
          </FormSection>

          <FormSection title="Informações para a análise">
            <Textarea
              rows={3}
              value={f.notes}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder="Como conheceu, volume estimado por semana, dias e horário de recebimento, forma de pagamento desejada…"
            />
          </FormSection>

          <Callout tone="info">Enquanto o pré-cadastro estiver em análise, não é possível fazer pedidos para este cliente.</Callout>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="ghost" onClick={() => nav(backTo)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" size="lg" icon={<Send className="size-4" />} loading={send.running}>
              Enviar ao financeiro
            </Button>
          </div>
        </Card>
      </form>
    </>
  );
}
