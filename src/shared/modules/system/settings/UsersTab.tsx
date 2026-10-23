import { Ban, Check, Copy, Edit3, Mail, MessageCircle, Minus, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useOps, useSession } from '../../../app/session';
import { useAction, useTable } from '../../../data/react';
import { dateTime, matchesSearch, percent, relativeDays } from '../../../domain/format';
import type { LabelInfo } from '../../../domain/labels';
import { COMPANY_LABELS, ROLE_LABELS } from '../../../domain/labels';
import { ROLE_PERMISSIONS } from '../../../domain/permissions';
import type { Invite, Profile, Role } from '../../../domain/types';
import { Avatar, Badge, Button, cn, DataTable, Menu, SearchInput, Segmented, Select, StatusBadge, toast, Toolbar, useConfirm, type Column } from '../../../ui';
import { copyToClipboard, whatsappLink } from '../../sales/helpers';
import { PERMISSION_GROUPS, ROLE_SUMMARY } from './permissionLabels';
import { InviteDrawer, UserDrawer } from './UserDrawers';

const ROLES = Object.keys(ROLE_LABELS) as Role[];
const ROLE_TONE: Record<Role, LabelInfo['tone']> = {
  ADMIN: 'accent',
  MANAGER: 'primary',
  FINANCIAL: 'info',
  SELLER: 'success',
  LOGISTICS: 'warning',
  OPERATOR: 'neutral',
  EXTERNAL_SELLER: 'info',
};
const INVITE_STATUS: Record<Invite['status'], LabelInfo> = {
  PENDING: { label: 'Pendente', tone: 'warning' },
  ACCEPTED: { label: 'Aceito', tone: 'success' },
  REVOKED: { label: 'Revogado', tone: 'neutral' },
};

type View = 'USERS' | 'INVITES' | 'ROLES';

function inviteMessage(inv: Pick<Invite, 'name' | 'email' | 'role'>) {
  const url = `${window.location.origin}${window.location.pathname}`;
  return `Olá, ${inv.name.split(' ')[0]}! Você foi convidado(a) para o Aurus Prime como ${ROLE_LABELS[inv.role]}. Acesse ${url} e entre com o e-mail ${inv.email}: pelo botão do Google ou, se não usar Google, em "Entrar com e-mail e senha" → "Primeiro acesso? Criar senha".`;
}

export function UsersTab() {
  const { profile: me } = useSession();
  const ops = useOps();
  const confirm = useConfirm();
  const { rows: profiles, loading } = useTable('profiles');
  const { rows: invites, loading: loadingInv } = useTable('invites');
  const [view, setView] = useState<View>('USERS');
  const [q, setQ] = useState('');
  const [role, setRole] = useState<Role | 'ALL'>('ALL');
  const [editing, setEditing] = useState<Profile | null>(null);
  const [inviting, setInviting] = useState(false);

  const users = useMemo(
    () => profiles.filter((p) => (role === 'ALL' || p.role === role) && matchesSearch([p.name, p.email, ROLE_LABELS[p.role]], q)),
    [profiles, role, q],
  );
  const invs = useMemo(() => invites.filter((i) => matchesSearch([i.name, i.email, ROLE_LABELS[i.role]], q)), [invites, q]);
  const pending = invites.filter((i) => i.status === 'PENDING').length;

  const revokeAction = useAction((inv: Invite) => ops.revokeInvite(inv.id), { success: 'Convite revogado' });
  const revoke = async (inv: Invite) => {
    if (await confirm({ title: `Revogar convite de ${inv.email}?`, message: 'A pessoa não conseguirá mais entrar com este convite.', danger: true, confirmLabel: 'Revogar' }))
      await revokeAction.run(inv);
  };
  const copy = async (inv: Invite) => ((await copyToClipboard(inviteMessage(inv))) ? toast.success('Mensagem copiada') : toast.error('Não foi possível copiar'));

  const userCols: Column<Profile>[] = [
    {
      key: 'name',
      header: 'Usuário',
      mobile: 'title',
      sortValue: (p) => p.name,
      cell: (p) => (
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={p.name} size={32} className="max-sm:hidden" />
          <div className="min-w-0">
            <div className="font-medium text-fg truncate">
              {p.name}
              {p.id === me?.id && <span className="text-xs text-subtle font-normal"> (você)</span>}
            </div>
            <div className="text-xs text-muted truncate">{p.email}</div>
          </div>
        </div>
      ),
    },
    { key: 'role', header: 'Papel', sortValue: (p) => ROLE_LABELS[p.role], cell: (p) => <Badge tone={ROLE_TONE[p.role]}>{ROLE_LABELS[p.role]}</Badge>, mobile: 'subtitle' },
    { key: 'company', header: 'Empresa', cell: (p) => (p.company ? COMPANY_LABELS[p.company] : '—'), hideBelow: 'xl', mobile: false },
    { key: 'commission', header: 'Comissão', align: 'right', sortValue: (p) => p.commissionRate ?? -1, cell: (p) => (p.commissionRate != null ? percent(p.commissionRate, 2) : '—'), hideBelow: 'lg' },
    {
      key: 'last',
      header: 'Último acesso',
      sortValue: (p) => p.lastLoginAt || '',
      cell: (p) =>
        p.lastLoginAt ? (
          <span title={dateTime(p.lastLoginAt)} className="num">
            {relativeDays(p.lastLoginAt)}
          </span>
        ) : (
          <span className="text-subtle">nunca</span>
        ),
      hideBelow: 'md',
    },
    { key: 'count', header: 'Acessos', align: 'right', sortValue: (p) => p.loginCount || 0, cell: (p) => p.loginCount || 0, hideBelow: 'lg', mobile: false },
    {
      key: 'active',
      header: 'Status',
      mobile: 'badge',
      sortValue: (p) => (p.active ? 1 : 0),
      cell: (p) => (
        <Badge tone={p.active ? 'success' : 'neutral'} dot>
          {p.active ? 'Ativo' : 'Desativado'}
        </Badge>
      ),
    },
  ];

  const inviteCols: Column<Invite>[] = [
    {
      key: 'email',
      header: 'Convidado',
      mobile: 'title',
      sortValue: (i) => i.email,
      cell: (i) => (
        <div className="min-w-0">
          <div className="font-medium text-fg truncate">{i.name}</div>
          <div className="text-xs text-muted truncate">{i.email}</div>
        </div>
      ),
    },
    { key: 'role', header: 'Papel', cell: (i) => <Badge tone={ROLE_TONE[i.role]}>{ROLE_LABELS[i.role]}</Badge>, mobile: 'subtitle' },
    { key: 'by', header: 'Convidado por', cell: (i) => i.invitedByName || '—', hideBelow: 'lg' },
    { key: 'at', header: 'Data', sortValue: (i) => i.createdAt, cell: (i) => <span className="num">{dateTime(i.createdAt)}</span>, hideBelow: 'md' },
    { key: 'accepted', header: 'Aceito em', cell: (i) => (i.acceptedAt ? <span className="num">{dateTime(i.acceptedAt)}</span> : '—'), hideBelow: 'lg' },
    { key: 'status', header: 'Status', mobile: 'badge', sortValue: (i) => i.status, cell: (i) => <StatusBadge info={INVITE_STATUS[i.status]} /> },
  ];

  return (
    <>
      <Toolbar>
        <Segmented
          size="sm"
          value={view}
          onChange={setView}
          options={[
            { value: 'USERS', label: 'Usuários', count: profiles.length },
            { value: 'INVITES', label: 'Convites', count: pending },
            { value: 'ROLES', label: 'Papéis e permissões' },
          ]}
        />
        {view !== 'ROLES' && <SearchInput value={q} onChange={setQ} placeholder="Buscar nome ou e-mail…" className="sm:w-64" />}
        {view === 'USERS' && (
          <Select
            value={role}
            onChange={setRole}
            className="sm:w-52"
            options={[{ value: 'ALL' as const, label: 'Todos os papéis' }, ...ROLES.filter((r) => profiles.some((p) => p.role === r)).map((r) => ({ value: r, label: ROLE_LABELS[r] }))]}
          />
        )}
        <Button variant="primary" icon={<UserPlus className="size-4" />} className="sm:ml-auto" onClick={() => setInviting(true)}>
          Convidar usuário
        </Button>
      </Toolbar>

      {view === 'USERS' && (
        <DataTable
          columns={userCols}
          rows={users}
          rowKey={(p) => p.id}
          loading={loading}
          initialSort={{ key: 'name', dir: 'asc' }}
          onRowClick={setEditing}
          emptyTitle="Nenhum usuário encontrado"
          rowClassName={(p) => (!p.active ? 'opacity-60' : undefined)}
          rowActions={(p) => <Menu items={[{ label: 'Editar acesso', icon: <Edit3 />, onClick: () => setEditing(p) }]} />}
        />
      )}

      {view === 'INVITES' && (
        <DataTable
          columns={inviteCols}
          rows={invs}
          rowKey={(i) => i.id}
          loading={loadingInv}
          initialSort={{ key: 'at', dir: 'desc' }}
          emptyTitle="Nenhum convite"
          emptyDescription="Convide pessoas de fora dos domínios corporativos ou já com o papel certo."
          rowActions={(i) => (
            <Menu
              items={[
                { label: 'Copiar mensagem de convite', icon: <Copy />, onClick: () => void copy(i), hidden: i.status !== 'PENDING' },
                { label: 'Enviar por WhatsApp', icon: <MessageCircle />, onClick: () => window.open(whatsappLink(null, inviteMessage(i)), '_blank', 'noopener'), hidden: i.status !== 'PENDING' },
                { label: 'Enviar por e-mail', icon: <Mail />, onClick: () => window.open(`mailto:${i.email}?subject=${encodeURIComponent('Convite — Aurus Prime')}&body=${encodeURIComponent(inviteMessage(i))}`), hidden: i.status !== 'PENDING' },
                'divider',
                { label: 'Revogar convite', icon: <Ban />, danger: true, onClick: () => void revoke(i), hidden: i.status !== 'PENDING' },
                { label: 'Convite já utilizado', icon: <Check />, onClick: () => undefined, disabled: true, hidden: i.status !== 'ACCEPTED' },
                { label: 'Convite revogado', icon: <Ban />, onClick: () => undefined, disabled: true, hidden: i.status !== 'REVOKED' },
              ]}
            />
          )}
        />
      )}

      {view === 'ROLES' && <RolesMatrix />}

      <UserDrawer user={editing} onClose={() => setEditing(null)} />
      <InviteDrawer open={inviting} onClose={() => setInviting(false)} />
    </>
  );
}

function RolesMatrix() {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ROLES.map((r) => (
          <div key={r} className="rounded-card border border-border bg-surface p-3.5">
            <Badge tone={ROLE_TONE[r]}>{ROLE_LABELS[r]}</Badge>
            <p className="text-xs text-muted mt-2 leading-relaxed">{ROLE_SUMMARY[r]}</p>
          </div>
        ))}
      </div>
      <div className="bg-surface border border-border rounded-card shadow-card overflow-hidden">
        <div className="scroll-x">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="border-b border-border bg-surface-2/60">
                <th className="text-left px-4 h-10 text-[11px] font-semibold uppercase tracking-wider text-muted sticky left-0 bg-surface">Permissão</th>
                {ROLES.map((r) => (
                  <th key={r} className="px-2 h-10 text-[11px] font-semibold uppercase tracking-wider text-muted text-center whitespace-nowrap">
                    {ROLE_LABELS[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_GROUPS.map((g) => (
                <GroupRows key={g.label} group={g} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function GroupRows({ group }: { group: (typeof PERMISSION_GROUPS)[number] }) {
  return (
    <>
      <tr className="bg-surface-2/40">
        <td colSpan={ROLES.length + 1} className="px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary sticky left-0">
          {group.label}
        </td>
      </tr>
      {group.items.map((it) => (
        <tr key={it.perm} className="border-b border-border last:border-b-0">
          <td className="px-4 py-2 text-fg sticky left-0 bg-surface">{it.label}</td>
          {ROLES.map((r) => {
            const ok = ROLE_PERMISSIONS[r].includes(it.perm);
            return (
              <td key={r} className="px-2 py-2 text-center">
                {ok ? (
                  <Check className={cn('size-4 inline text-success')} aria-label="Pode" />
                ) : (
                  <Minus className="size-4 inline text-subtle opacity-50" aria-label="Não pode" />
                )}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
