/**
 * Gavetas de usuário: editar (papel/ativo/comissão via ops.updateUser) e convidar (ops.inviteUser).
 */
import { useEffect, useState } from 'react';
import { useOps, useSession } from '../../../app/session';
import { useSettings } from '../../../app/settings';
import { useAction } from '../../../data/react';
import { dateTime, integer } from '../../../domain/format';
import { COMPANY_LABELS, optionsOf, ROLE_LABELS } from '../../../domain/labels';
import type { CompanyCode, Profile, Role } from '../../../domain/types';
import { Avatar, Button, Callout, DescriptionList, Drawer, Field, FormGrid, Input, MaskedInput, PercentInput, Select, Switch } from '../../../ui';
import { ROLE_SUMMARY } from './permissionLabels';

const ROLE_OPTIONS = optionsOf(ROLE_LABELS);
const COMMISSIONED: Role[] = ['SELLER', 'EXTERNAL_SELLER'];

interface UserForm {
  name: string;
  role: Role;
  active: boolean;
  commissionRate: number | null;
  company: CompanyCode | null;
}

export function UserDrawer({ user, onClose }: { user: Profile | null; onClose: () => void }) {
  const ops = useOps();
  const { profile: me } = useSession();
  const [f, setF] = useState<UserForm | null>(null);
  useEffect(() => {
    setF(user ? { name: user.name, role: user.role, active: user.active, commissionRate: user.commissionRate ?? null, company: user.company ?? null } : null);
  }, [user]);
  const self = !!user && user.id === me?.id;

  const save = useAction(
    async () => {
      if (!user || !f) return;
      const patch: Parameters<typeof ops.updateUser>[1] = {};
      if (f.name.trim() !== user.name) patch.name = f.name.trim();
      if (f.role !== user.role) patch.role = f.role;
      if (f.active !== user.active) patch.active = f.active;
      if ((f.commissionRate ?? null) !== (user.commissionRate ?? null)) patch.commissionRate = f.commissionRate;
      if ((f.company ?? null) !== (user.company ?? null)) patch.company = f.company;
      if (!Object.keys(patch).length) return;
      await ops.updateUser(user.id, patch);
    },
    { success: 'Usuário atualizado', onSuccess: onClose },
  );

  return (
    <Drawer
      open={!!user}
      onClose={onClose}
      title="Editar usuário"
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
      {user && f && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Avatar name={user.name} size={44} />
            <div className="min-w-0">
              <div className="font-semibold text-fg truncate">{user.name}</div>
              <div className="text-sm text-muted truncate">{user.email}</div>
            </div>
          </div>
          <DescriptionList
            items={[
              { label: 'Último acesso', value: user.lastLoginAt ? dateTime(user.lastLoginAt) : 'Nunca entrou' },
              { label: 'Nº de acessos', value: integer(user.loginCount || 0) },
              { label: 'Cadastrado em', value: dateTime(user.createdAt) },
              { label: 'Telefone', value: user.phone || '—' },
            ]}
          />
          {self && <Callout tone="info">Você não pode alterar o próprio papel nem se desativar. Peça a outro administrador.</Callout>}
          <FormGrid>
            <Field label="Nome" span="full">
              <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </Field>
            <Field label="Papel" hint={ROLE_SUMMARY[f.role]} span="full">
              <Select value={f.role} onChange={(v) => setF({ ...f, role: v })} options={ROLE_OPTIONS} disabled={self} />
            </Field>
            <Field label="Empresa">
              <Select value={f.company || ''} onChange={(v) => setF({ ...f, company: (v || null) as CompanyCode | null })} placeholder="—" options={optionsOf(COMPANY_LABELS)} />
            </Field>
            {(COMMISSIONED.includes(f.role) || f.commissionRate != null) && (
              <Field label="Comissão" hint="Sobre o valor dos pedidos do vendedor.">
                <PercentInput value={f.commissionRate} onChange={(v) => setF({ ...f, commissionRate: v })} />
              </Field>
            )}
          </FormGrid>
          <Switch
            checked={f.active}
            onChange={(v) => setF({ ...f, active: v })}
            disabled={self}
            label="Acesso ativo"
            description="Desativado não entra no sistema, mas o histórico (pedidos, lançamentos) é mantido."
          />
        </div>
      )}
    </Drawer>
  );
}

interface InviteForm {
  email: string;
  name: string;
  role: Role;
  phone: string;
  commissionRate: number | null;
}

export function InviteDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ops = useOps();
  const { settings } = useSettings();
  const blank = (): InviteForm => ({ email: '', name: '', role: 'SELLER', phone: '', commissionRate: settings.defaultCommissionRate ?? null });
  const [f, setF] = useState<InviteForm>(blank);
  useEffect(() => {
    if (open) setF(blank());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = useAction(
    () =>
      ops.inviteUser({
        email: f.email.trim().toLowerCase(),
        name: f.name.trim(),
        role: f.role,
        phone: f.phone || null,
        commissionRate: COMMISSIONED.includes(f.role) ? f.commissionRate : null,
      }),
    { success: 'Convite registrado — envie o link para a pessoa', onSuccess: onClose },
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Convidar usuário"
      description="A pessoa entra com este e-mail (pelo Google ou criando uma senha em “Primeiro acesso”) e já recebe o papel escolhido."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.running} onClick={() => void save.run()}>
            Enviar convite
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
          <Field label="E-mail" required span="full">
            <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoFocus placeholder="nome@empresa.com" />
          </Field>
          <Field label="Nome" required span="full">
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Papel" required hint={ROLE_SUMMARY[f.role]} span="full">
            <Select value={f.role} onChange={(v) => setF({ ...f, role: v })} options={ROLE_OPTIONS} />
          </Field>
          <Field label="Telefone / WhatsApp">
            <MaskedInput mask="phone" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} />
          </Field>
          {COMMISSIONED.includes(f.role) && (
            <Field label="Comissão">
              <PercentInput value={f.commissionRate} onChange={(v) => setF({ ...f, commissionRate: v })} />
            </Field>
          )}
        </FormGrid>
        {f.role === 'EXTERNAL_SELLER' && (
          <Callout tone="info">Vendedores externos usam um aplicativo próprio no celular: carteira de clientes, pedidos e comissões.</Callout>
        )}
        {f.role === 'ADMIN' && <Callout tone="warning">Administradores podem tudo, inclusive gerir usuários e apagar dados. Convide com cuidado.</Callout>}
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
}
