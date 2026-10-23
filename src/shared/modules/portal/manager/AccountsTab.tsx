/**
 * Aba "Contas": cadastros do portal (aprovar vinculando a cliente, recusar, bloquear)
 * e convites (acesso liberado antes do cadastro).
 */
import { Ban, Check, ExternalLink, Lock, Mail, MessageCircle, Send, Unlock, UserCheck, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOps } from '../../../app/session';
import { useAction, useTable } from '../../../data/react';
import { dateTime, formatDocument, formatPhone, matchesSearch, onlyDigits, relativeDays } from '../../../domain/format';
import type { Customer, PortalAccount, PortalInvite } from '../../../domain/types';
import { Avatar, Badge, Button, Callout, Card, Combobox, DataTable, Field, Input, MaskedInput, Menu, Modal, SearchInput, Segmented, StatusBadge, Toolbar, useConfirm, usePrompt, type Column } from '../../../ui';
import { useCustomerOptions } from '../../common/lookups';
import { addressLine, PORTAL_ACCOUNT_STATUS, waLink } from '../lib';

type StatusFilter = PortalAccount['status'] | 'ALL';

export function AccountsTab({ accounts, loading }: { accounts: PortalAccount[]; loading: boolean }) {
  const ops = useOps();
  const nav = useNavigate();
  const prompt = usePrompt();
  const { customers } = useCustomerOptions();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [approving, setApproving] = useState<PortalAccount | null>(null);
  const [inviting, setInviting] = useState(false);
  const { rows: invites } = useTable('portal_invites');
  const pendingInvites = invites.filter((i) => i.status === 'PENDING').sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const custById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const pending = accounts.filter((a) => a.status === 'PENDING').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: accounts.length };
    accounts.forEach((a) => (c[a.status] = (c[a.status] || 0) + 1));
    return c;
  }, [accounts]);
  const rows = useMemo(
    () =>
      accounts
        .filter((a) => status === 'ALL' || a.status === status)
        .filter((a) => matchesSearch([a.name, a.email, a.companyName, a.document, a.city, a.phone], q)),
    [accounts, status, q],
  );

  const reject = useAction(async (a: PortalAccount) => {
    const reason = await prompt({ title: `Recusar o cadastro de ${a.name}?`, label: 'Motivo (o cliente verá esta mensagem)', confirmLabel: 'Recusar', danger: true });
    if (reason) await ops.rejectPortalAccount(a.id, reason);
  });
  const block = useAction((a: PortalAccount, blocked: boolean) => ops.setPortalAccountBlocked(a.id, blocked), { success: 'Acesso atualizado' });

  const columns: Column<PortalAccount>[] = [
    {
      key: 'name',
      header: 'Conta',
      mobile: 'title',
      sortValue: (a) => a.name,
      cell: (a) => (
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={a.name} size={32} className="max-md:hidden" />
          <div className="min-w-0">
            <div className="font-medium text-fg truncate">{a.name}</div>
            <div className="text-xs text-muted truncate">{a.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'company',
      header: 'Empresa / documento',
      mobile: 'subtitle',
      sortValue: (a) => a.companyName || '',
      cell: (a) => (
        <div className="min-w-0">
          <div className="text-fg truncate">{a.companyName || (a.personType === 'F' ? 'Pessoa física' : '—')}</div>
          <div className="text-xs text-muted num">{formatDocument(a.document) || '—'}</div>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Cliente vinculado',
      hideBelow: 'lg',
      cell: (a) => {
        const c = a.customerId ? custById.get(a.customerId) : null;
        return c ? <span className="text-fg">{c.name}</span> : <span className="text-subtle">—</span>;
      },
    },
    { key: 'login', header: 'Último acesso', hideBelow: 'md', sortValue: (a) => a.lastLoginAt || '', cell: (a) => <span className="text-muted">{a.lastLoginAt ? dateTime(a.lastLoginAt) : 'Nunca'}</span> },
    { key: 'status', header: 'Status', mobile: 'badge', sortValue: (a) => a.status, cell: (a) => <StatusBadge info={PORTAL_ACCOUNT_STATUS[a.status]} /> },
  ];

  return (
    <>
      {pending.length > 0 && (
        <section className="mb-6">
          <h3 className="text-sm font-semibold text-fg mb-3 flex items-center gap-2">
            Cadastros aguardando análise <Badge tone="warning">{pending.length}</Badge>
          </h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {pending.map((a) => (
              <PendingCard key={a.id} account={a} customers={customers} onApprove={() => setApproving(a)} onReject={() => void reject.run(a)} />
            ))}
          </div>
        </section>
      )}

      <InvitesSection invites={pendingInvites} onInvite={() => setInviting(true)} />

      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar nome, e-mail, documento…" className="sm:w-80" />
        <Segmented
          size="sm"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'ALL', label: 'Todas', count: counts.ALL },
            { value: 'PENDING', label: 'Em análise', count: counts.PENDING || 0 },
            { value: 'APPROVED', label: 'Liberadas', count: counts.APPROVED || 0 },
            { value: 'BLOCKED', label: 'Bloqueadas', count: counts.BLOCKED || 0 },
            { value: 'REJECTED', label: 'Recusadas', count: counts.REJECTED || 0 },
          ]}
        />
      </Toolbar>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(a) => a.id}
        loading={loading}
        initialSort={{ key: 'name', dir: 'asc' }}
        onRowClick={(a) => (a.status === 'PENDING' || a.status === 'REJECTED' ? setApproving(a) : a.customerId && nav(`/clientes/${a.customerId}`))}
        emptyTitle="Nenhuma conta encontrada"
        emptyDescription={q ? 'Tente outra busca.' : 'Quando um cliente se cadastrar no portal, a conta aparece aqui para análise.'}
        rowActions={(a) => (
          <Menu
            items={[
              { label: 'Aprovar acesso', icon: <Check />, hidden: a.status === 'APPROVED' || a.status === 'BLOCKED', onClick: () => setApproving(a) },
              { label: 'Recusar', icon: <X />, hidden: a.status !== 'PENDING', onClick: () => void reject.run(a) },
              { label: 'Bloquear acesso', icon: <Lock />, hidden: a.status !== 'APPROVED', onClick: () => void block.run(a, true) },
              { label: 'Desbloquear', icon: <Unlock />, hidden: a.status !== 'BLOCKED', onClick: () => void block.run(a, false) },
              { label: 'Abrir cliente', icon: <ExternalLink />, hidden: !a.customerId, onClick: () => nav(`/clientes/${a.customerId}`) },
              { label: 'WhatsApp', icon: <MessageCircle />, hidden: !a.phone, onClick: () => window.open(waLink(a.phone, `Olá, ${a.name.split(' ')[0]}! Aqui é da equipe comercial, sobre o seu cadastro no portal.`), '_blank') },
            ]}
          />
        )}
      />
      <ApproveAccountModal account={approving} customers={customers} onClose={() => setApproving(null)} />
      <Modal open={inviting} onClose={() => setInviting(false)} title="Convidar cliente para o portal" description="O acesso fica liberado antes do cadastro: no primeiro login com este e-mail, a conta já entra aprovada e ligada ao cliente.">
        {inviting && <InviteBody customers={customers} onClose={() => setInviting(false)} />}
      </Modal>
    </>
  );
}

function InvitesSection({ invites, onInvite }: { invites: PortalInvite[]; onInvite: () => void }) {
  const ops = useOps();
  const confirm = useConfirm();
  const revoke = useAction(
    async (i: PortalInvite) => {
      if (!(await confirm({ title: `Cancelar o convite de ${i.email}?`, confirmLabel: 'Cancelar convite', danger: true }))) return;
      await ops.revokePortalInvite(i.email);
    },
    { success: 'Convite cancelado' },
  );
  return (
    <section className="mb-6">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold text-fg flex items-center gap-2">
          Convites aguardando o primeiro acesso {invites.length > 0 && <Badge tone="info">{invites.length}</Badge>}
        </h3>
        <Button size="sm" icon={<Send className="size-4" />} onClick={onInvite}>
          Convidar cliente
        </Button>
      </div>
      {invites.length > 0 && (
        <Card className="p-0 divide-y divide-border">
          {invites.map((i) => (
            <div key={i.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <Mail className="size-4 text-muted shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-fg truncate">{i.email}</div>
                <div className="text-xs text-muted truncate">
                  {i.customerName} · convidado {relativeDays(i.createdAt)}
                  {i.invitedByName ? ` por ${i.invitedByName}` : ''}
                </div>
              </div>
              {i.phone && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<MessageCircle className="size-4" />}
                  onClick={() => window.open(waLink(i.phone, `Olá, ${(i.name || '').split(' ')[0]}! Seu acesso ao nosso portal de pedidos já está liberado. Entre em ${location.origin}${location.pathname}#/portal e crie sua senha com o e-mail ${i.email}.`), '_blank')}
                >
                  <span className="max-sm:hidden">Avisar</span>
                </Button>
              )}
              <Button size="sm" variant="ghost" icon={<X className="size-4" />} loading={revoke.running} onClick={() => void revoke.run(i)}>
                <span className="max-sm:hidden">Cancelar</span>
              </Button>
            </div>
          ))}
        </Card>
      )}
    </section>
  );
}

function InviteBody({ customers, onClose }: { customers: Customer[]; onClose: () => void }) {
  const ops = useOps();
  const { options } = useCustomerOptions({ onlyActive: true });
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const pick = (id: string | null) => {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    if (c) {
      setEmail((e) => e || c.email || c.financialEmail || '');
      setName((n) => n || c.contactName || c.name);
      setPhone((p) => p || formatPhone(c.cellphone || c.phone) || '');
    }
  };
  const send = useAction(
    async () => {
      if (!customerId) throw new Error('Escolha o cliente.');
      await ops.createPortalInvite({ customerId, email, name, phone: onlyDigits(phone) || null });
    },
    { success: 'Convite criado — o cliente já pode entrar no portal com este e-mail', onSuccess: onClose },
  );
  return (
    <div className="space-y-4">
      <Field label="Cliente" required>
        <Combobox value={customerId} onChange={pick} options={options} placeholder="Buscar cliente…" />
      </Field>
      <Field label="E-mail de acesso" required hint="É com este e-mail que o cliente entra no portal.">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="compras@cliente.com.br" />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Nome do contato">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="WhatsApp">
          <MaskedInput mask="phone" value={phone} onChange={setPhone} />
        </Field>
      </div>
      <Callout tone="info">Se o cliente usar e-mail e senha, ele confirma o e-mail pelo link que enviamos. Os preços seguem a tabela de preço do cliente, quando houver.</Callout>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" icon={<Send className="size-4" />} loading={send.running} onClick={() => void send.run()}>
          Liberar acesso
        </Button>
      </div>
    </div>
  );
}

function suggestCustomer(a: PortalAccount, customers: Customer[]): Customer | null {
  const doc = onlyDigits(a.document);
  if (doc) {
    const byDoc = customers.find((c) => onlyDigits(c.document) === doc);
    if (byDoc) return byDoc;
  }
  const email = a.email.toLowerCase();
  return customers.find((c) => (c.email || '').toLowerCase() === email || (c.financialEmail || '').toLowerCase() === email) || null;
}

function PendingCard({ account: a, customers, onApprove, onReject }: { account: PortalAccount; customers: Customer[]; onApprove: () => void; onReject: () => void }) {
  const match = suggestCustomer(a, customers);
  return (
    <Card className="border-warning/40 flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <Avatar name={a.name} size={40} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-fg truncate">{a.companyName || a.name}</div>
          <div className="text-xs text-muted truncate">
            {a.companyName ? `${a.name} · ` : ''}
            {a.email}
          </div>
        </div>
        <span className="text-[11px] text-subtle shrink-0">{relativeDays(a.createdAt)}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-subtle">{a.personType === 'F' ? 'CPF' : 'CNPJ'}</dt>
        <dd className="text-fg num text-right">{formatDocument(a.document) || '—'}</dd>
        <dt className="text-subtle">Telefone</dt>
        <dd className="text-fg num text-right">{formatPhone(a.phone) || '—'}</dd>
        <dt className="text-subtle">Cidade</dt>
        <dd className="text-fg text-right truncate">{[a.city, a.state].filter(Boolean).join('/') || '—'}</dd>
      </dl>
      {match && (
        <div className="rounded-control bg-info-soft text-info px-2.5 py-1.5 text-xs flex items-center gap-1.5">
          <UserCheck className="size-3.5 shrink-0" /> <span className="truncate">Já é cliente: {match.name}</span>
        </div>
      )}
      <div className="mt-auto pt-3 border-t border-border flex gap-2">
        <Button size="sm" variant="primary" className="flex-1" icon={<Check className="size-4" />} onClick={onApprove}>
          Aprovar
        </Button>
        <Button size="sm" variant="ghost" icon={<Ban className="size-4" />} onClick={onReject}>
          Recusar
        </Button>
      </div>
    </Card>
  );
}

function ApproveAccountModal({ account, customers, onClose }: { account: PortalAccount | null; customers: Customer[]; onClose: () => void }) {
  return (
    <Modal open={!!account} onClose={onClose} title="Liberar acesso ao portal" description={account ? `${account.name} · ${account.email}` : undefined}>
      {account && <ApproveBody key={account.id} account={account} customers={customers} onClose={onClose} />}
    </Modal>
  );
}

function ApproveBody({ account, customers, onClose }: { account: PortalAccount; customers: Customer[]; onClose: () => void }) {
  const ops = useOps();
  const { options } = useCustomerOptions({ onlyActive: true });
  const match = useMemo(() => suggestCustomer(account, customers), [account, customers]);
  const [mode, setMode] = useState<'LINK' | 'NEW'>(match ? 'LINK' : 'NEW');
  const [customerId, setCustomerId] = useState<string | null>(match?.id ?? null);
  const docTaken = !!match && onlyDigits(match.document) === onlyDigits(account.document);

  const approve = useAction(
    async () => {
      if (mode === 'LINK') {
        if (!customerId) throw new Error('Escolha o cliente a vincular.');
        await ops.approvePortalAccount(account.id, { customerId });
      } else await ops.approvePortalAccount(account.id, { createCustomer: true });
    },
    { success: 'Acesso liberado — o cliente já pode fazer pedidos', onSuccess: onClose },
  );

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-border bg-surface-2 p-3 text-sm space-y-1">
        <div className="text-fg font-medium">{account.companyName || account.name}</div>
        <div className="text-xs text-muted num">
          {formatDocument(account.document) || 'Sem documento'} · {formatPhone(account.phone) || 'sem telefone'}
        </div>
        <div className="text-xs text-muted">{addressLine(account) || 'Sem endereço'}</div>
      </div>

      <Segmented
        value={mode}
        onChange={setMode}
        className="w-full [&>button]:flex-1 [&>button]:justify-center"
        options={[
          { value: 'LINK', label: 'Vincular a cliente existente' },
          { value: 'NEW', label: 'Criar cliente novo' },
        ]}
      />

      {mode === 'LINK' ? (
        <Field label="Cliente" hint={match ? `Sugestão pelo ${onlyDigits(match.document) === onlyDigits(account.document) ? 'documento' : 'e-mail'}: ${match.name}` : 'Nenhum cliente com o mesmo documento ou e-mail.'}>
          <Combobox value={customerId} onChange={(v) => setCustomerId(v)} options={options} placeholder="Buscar cliente…" />
        </Field>
      ) : docTaken ? (
        <Callout tone="warning" title="Documento já cadastrado">
          {match?.name} já usa este documento. Vincule a conta a ele.
        </Callout>
      ) : (
        <Callout tone="info">Vamos criar o cliente com os dados do cadastro (pagamento por Pix). Depois você pode completar o cadastro na tela de clientes.</Callout>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" icon={<Check className="size-4" />} loading={approve.running} disabled={mode === 'NEW' && docTaken} onClick={() => void approve.run()}>
          Liberar acesso
        </Button>
      </div>
    </div>
  );
}
