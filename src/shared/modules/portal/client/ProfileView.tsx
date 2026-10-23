/**
 * Perfil do cliente: dados da conta, edição de telefone/endereço e sair.
 */
import { Edit3, LogOut, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { usePortalSession } from '../../../app/session';
import { useSettings } from '../../../app/settings';
import { useAction, useCrud } from '../../../data/react';
import { formatCep, formatDocument, formatPhone, onlyDigits } from '../../../domain/format';
import { Avatar, Button, Card, CardHeader, DescriptionList, Drawer, Field, FormGrid, MaskedInput, StatusBadge } from '../../../ui';
import { addressLine, PORTAL_ACCOUNT_STATUS, waLink } from '../lib';
import { AddressFields } from './AddressFields';

interface Draft {
  phone: string;
  zipCode: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
}

export function ProfileView() {
  const { account, refresh, signOut } = usePortalSession();
  const { settings } = useSettings();
  const crud = useCrud('portal_accounts');
  const [draft, setDraft] = useState<Draft | null>(null);

  const save = useAction(
    async (d: Draft) => {
      if (!account) return;
      if (onlyDigits(d.phone).length < 10) throw new Error('Informe um telefone com DDD.');
      if (onlyDigits(d.zipCode).length !== 8) throw new Error('Informe um CEP válido.');
      if (!d.street.trim() || !d.number.trim() || !d.city.trim()) throw new Error('Complete rua, número e cidade.');
      await crud.update(account.id, {
        phone: onlyDigits(d.phone),
        zipCode: onlyDigits(d.zipCode),
        street: d.street.trim(),
        number: d.number.trim(),
        complement: d.complement.trim() || null,
        district: d.district.trim() || null,
        city: d.city.trim(),
        state: d.state || null,
      });
      await refresh();
    },
    { success: 'Dados atualizados', onSuccess: () => setDraft(null) },
  );
  const out = useAction(() => signOut());

  if (!account) return null;
  const open = () =>
    setDraft({
      phone: formatPhone(account.phone),
      zipCode: formatCep(account.zipCode),
      street: account.street || '',
      number: account.number || '',
      complement: account.complement || '',
      district: account.district || '',
      city: account.city || '',
      state: account.state || '',
    });

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-4 mb-2">
        <Avatar name={account.name} size={56} />
        <div className="min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-fg truncate">{account.name}</h1>
          <p className="text-sm text-muted truncate">{account.email}</p>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Cadastro"
          subtitle="Usado para faturamento dos pedidos."
          actions={<StatusBadge info={PORTAL_ACCOUNT_STATUS[account.status]} />}
        />
        <DescriptionList
          items={[
            { label: account.personType === 'F' ? 'Estabelecimento' : 'Razão social', value: account.companyName || '—' },
            { label: account.personType === 'F' ? 'CPF' : 'CNPJ', value: <span className="num">{formatDocument(account.document) || '—'}</span> },
          ]}
        />
        <p className="text-xs text-subtle mt-4">Para alterar nome, documento ou razão social, fale com a nossa equipe.</p>
      </Card>

      <Card>
        <CardHeader
          title="Contato e entrega"
          subtitle="Endereço padrão sugerido nos pedidos."
          actions={
            <Button size="sm" icon={<Edit3 className="size-4" />} onClick={open}>
              Editar
            </Button>
          }
        />
        <DescriptionList
          items={[
            { label: 'Telefone / WhatsApp', value: <span className="num">{formatPhone(account.phone) || '—'}</span> },
            { label: 'CEP', value: <span className="num">{formatCep(account.zipCode) || '—'}</span> },
            { label: 'Endereço', value: addressLine(account) || '—', span: true },
          ]}
        />
      </Card>

      <div className="flex flex-col sm:flex-row gap-2 pt-2">
        {settings.whatsapp && (
          <a href={waLink(settings.whatsapp, 'Olá! Preciso de ajuda com meu cadastro no portal.')} target="_blank" rel="noopener noreferrer" className="flex">
            <Button block icon={<MessageCircle className="size-4" />}>
              Falar com a equipe
            </Button>
          </a>
        )}
        <Button variant="ghost" icon={<LogOut className="size-4" />} loading={out.running} onClick={() => void out.run()} className="sm:ml-auto text-danger">
          Sair da conta
        </Button>
      </div>

      <Drawer
        open={!!draft}
        onClose={() => setDraft(null)}
        title="Editar contato e entrega"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button variant="primary" loading={save.running} onClick={() => draft && void save.run(draft)}>
              Salvar
            </Button>
          </>
        }
      >
        {draft && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save.run(draft);
            }}
          >
            <FormGrid>
              <Field label="Telefone / WhatsApp" required span="full">
                <MaskedInput mask="phone" value={draft.phone} onChange={(v) => setDraft({ ...draft, phone: v })} />
              </Field>
            </FormGrid>
            <div className="mt-4">
              <AddressFields value={draft} onChange={(patch) => setDraft((d) => d && { ...d, ...patch })} />
            </div>
            <button type="submit" hidden />
          </form>
        )}
      </Drawer>
    </div>
  );
}
