/**
 * Drawers da gestão de vendedores externos: convite e ficha do vendedor.
 */
import { MessageCircle, Save } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOps } from '../../app/session';
import { useSettings } from '../../app/settings';
import { useAction } from '../../data/react';
import { date, dateTime, formatPhone, isValidEmail, money, onlyDigits } from '../../domain/format';
import { RANKING, SALE_STATUS } from '../../domain/labels';
import type { Customer, CustomerRequest, Profile, Sale } from '../../domain/types';
import {
  Avatar,
  Badge,
  Button,
  Callout,
  DataTable,
  Drawer,
  Field,
  FormGrid,
  Input,
  MaskedInput,
  PercentInput,
  StatusBadge,
  Switch,
  Tabs,
  type Column,
} from '../../ui';
import { REQUEST_STATUS } from './CustomerRequests';
import { cityLabel, whatsappUrl } from './helpers';

export interface SellerMetrics {
  clients: number;
  orders: number;
  sold: number;
  /** Pedidos / vendido / comissão no período selecionado na tela. */
  monthOrders: number;
  monthSold: number;
  monthCommission: number;
  commission: number;
  pendingRequests: number;
  pendingApproval: number;
  lastOrder: string | null;
}

// ---------------------------------------------------------------------------
// Convite
// ---------------------------------------------------------------------------

export function InviteSellerDrawer({ onClose }: { onClose: () => void }) {
  const ops = useOps();
  const { settings } = useSettings();
  const [v, setV] = useState({ name: '', email: '', phone: '', commissionRate: (settings.defaultCommissionRate ?? 3) as number | null });
  const [touched, setTouched] = useState(false);
  const errors = {
    name: !v.name.trim() ? 'Informe o nome.' : undefined,
    email: !isValidEmail(v.email) ? 'Informe um e-mail válido.' : undefined,
    commissionRate: v.commissionRate == null || v.commissionRate < 0 || v.commissionRate > 100 ? 'Comissão entre 0 e 100%.' : undefined,
  };
  const save = useAction(
    async () => {
      setTouched(true);
      const first = Object.values(errors).find(Boolean);
      if (first) throw new Error(first);
      await ops.inviteUser({
        role: 'EXTERNAL_SELLER',
        name: v.name.trim(),
        email: v.email.trim().toLowerCase(),
        phone: onlyDigits(v.phone) || null,
        commissionRate: v.commissionRate,
      });
    },
    { success: 'Convite registrado — o vendedor já pode entrar com este e-mail', onSuccess: onClose },
  );
  return (
    <Drawer
      open
      onClose={onClose}
      width="sm"
      title="Convidar vendedor externo"
      description="Libera o acesso ao aplicativo do vendedor para este e-mail (pode ser de fora da empresa)."
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
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save.run();
        }}
      >
        <FormGrid cols={1}>
          <Field label="Nome completo" required error={touched && errors.name}>
            <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} autoFocus />
          </Field>
          <Field label="E-mail de acesso" required error={touched && errors.email} hint="É com este e-mail que ele vai entrar.">
            <Input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
          </Field>
          <Field label="Celular / WhatsApp">
            <MaskedInput mask="phone" value={v.phone} onChange={(p) => setV({ ...v, phone: p })} />
          </Field>
          <Field label="Comissão" required error={touched && errors.commissionRate} hint="Percentual sobre o valor dos pedidos (pode mudar depois).">
            <PercentInput value={v.commissionRate} onChange={(n) => setV({ ...v, commissionRate: n })} />
          </Field>
        </FormGrid>
        <Callout tone="info">
          O vendedor externo só vê os clientes da própria carteira e os próprios pedidos. Pedidos dele sempre passam por aprovação interna.
        </Callout>
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Ficha do vendedor
// ---------------------------------------------------------------------------

export function SellerDrawer({
  seller,
  metrics,
  sales,
  customers,
  requests,
  canManage,
  onClose,
  periodLabel,
}: {
  seller: Profile;
  metrics: SellerMetrics;
  periodLabel: string;
  sales: Sale[];
  customers: Customer[];
  requests: CustomerRequest[];
  canManage: boolean;
  onClose: () => void;
}) {
  const nav = useNavigate();
  const ops = useOps();
  const [tab, setTab] = useState<'clients' | 'orders' | 'requests'>('clients');
  const [rate, setRate] = useState<number | null>(seller.commissionRate ?? null);
  const rateChanged = (rate ?? null) !== (seller.commissionRate ?? null);

  const saveRate = useAction(
    async () => {
      if (rate == null || rate < 0 || rate > 100) throw new Error('Comissão entre 0 e 100%.');
      await ops.updateUser(seller.id, { commissionRate: rate });
    },
    { success: 'Comissão atualizada — vale para os próximos pedidos' },
  );
  const toggle = useAction((active: boolean) => ops.updateUser(seller.id, { active }), {
    success: (_r) => (seller.active ? 'Acesso bloqueado' : 'Acesso reativado'),
  });

  const wa = whatsappUrl(seller.phone);

  const clientCols: Column<Customer>[] = [
    {
      key: 'name',
      header: 'Cliente',
      mobile: 'title',
      sortValue: (c) => c.name,
      cell: (c) => (
        <div className="min-w-0">
          <div className="truncate text-fg">{c.tradeName || c.name}</div>
          <div className="text-xs text-muted truncate">{cityLabel(c)}</div>
        </div>
      ),
    },
    { key: 'rank', header: 'Ranking', mobile: 'badge', cell: (c) => <Badge tone={RANKING[c.ranking].tone} dot>{RANKING[c.ranking].label}</Badge> },
    { key: 'total', header: 'Comprado', align: 'right', sortValue: (c) => c.totalPurchases, cell: (c) => money(c.totalPurchases) },
    { key: 'last', header: 'Última compra', mobile: 'subtitle', sortValue: (c) => c.lastPurchaseAt || '', cell: (c) => (c.lastPurchaseAt ? date(c.lastPurchaseAt) : '—') },
  ];
  const orderCols: Column<Sale>[] = [
    { key: 'n', header: 'Nº', mobile: 'title', sortValue: (s) => s.number, cell: (s) => <span className="num">{s.number}</span> },
    { key: 'd', header: 'Data', sortValue: (s) => s.date, cell: (s) => <span className="num">{date(s.date)}</span> },
    { key: 'c', header: 'Cliente', mobile: 'subtitle', cell: (s) => <span className="truncate">{s.customerName}</span> },
    { key: 't', header: 'Total', align: 'right', sortValue: (s) => s.totalValue, cell: (s) => money(s.totalValue) },
    { key: 'cm', header: 'Comissão', align: 'right', cell: (s) => (['CANCELLED', 'REJECTED', 'DRAFT'].includes(s.status) ? '—' : money(s.commissionValue)) },
    { key: 's', header: 'Status', mobile: 'badge', cell: (s) => <StatusBadge info={SALE_STATUS[s.status]} /> },
  ];
  const reqCols: Column<CustomerRequest>[] = [
    { key: 'n', header: 'Cliente', mobile: 'title', cell: (r) => r.tradeName || r.name },
    { key: 'd', header: 'Enviada', mobile: 'subtitle', sortValue: (r) => r.createdAt, cell: (r) => <span className="num">{date(r.createdAt)}</span> },
    { key: 's', header: 'Status', mobile: 'badge', cell: (r) => <Badge tone={REQUEST_STATUS[r.status].tone} dot>{REQUEST_STATUS[r.status].label}</Badge> },
  ];

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      title={
        <span className="flex items-center gap-3">
          <Avatar name={seller.name} size={36} />
          <span className="min-w-0">
            <span className="block truncate">{seller.name}</span>
            <span className="block text-xs font-normal font-sans text-muted truncate">{seller.email}</span>
          </span>
        </span>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {seller.active ? (
            <Badge tone="success" dot>
              Ativo
            </Badge>
          ) : (
            <Badge tone="danger" dot>
              Bloqueado
            </Badge>
          )}
          <span className="text-muted">{seller.lastLoginAt ? `Último acesso ${dateTime(seller.lastLoginAt)}` : 'Nunca entrou'}</span>
          {seller.phone && <span className="text-muted num">· {formatPhone(seller.phone)}</span>}
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer" className="ml-auto">
              <Button size="sm" icon={<MessageCircle className="size-4" />}>
                WhatsApp
              </Button>
            </a>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Mini label="Carteira" value={`${metrics.clients}`} hint="clientes" />
          <Mini label={`Vendas · ${periodLabel}`} value={money(metrics.monthSold)} hint={`${metrics.monthOrders} pedido(s)`} />
          <Mini label={`Comissão · ${periodLabel}`} value={money(metrics.monthCommission)} hint="estimada" tone="text-success" />
          <Mini label="Comissão total" value={money(metrics.commission)} hint={`${metrics.orders} pedido(s)`} />
        </div>

        {canManage && (
          <div className="rounded-card border border-border p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <Field label="Comissão (%)" className="sm:w-48" hint="Padrão dos novos pedidos.">
                <PercentInput value={rate} onChange={setRate} />
              </Field>
              <Button icon={<Save className="size-4" />} disabled={!rateChanged} loading={saveRate.running} onClick={() => void saveRate.run()} className="sm:mb-5">
                Salvar comissão
              </Button>
            </div>
            <Switch
              checked={seller.active}
              disabled={toggle.running}
              onChange={(v) => void toggle.run(v)}
              label="Acesso liberado"
              description="Bloqueado = não entra mais no aplicativo. Carteira e pedidos são mantidos."
            />
          </div>
        )}

        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'clients', label: 'Carteira', count: customers.length },
            { value: 'orders', label: 'Pedidos', count: sales.length },
            { value: 'requests', label: 'Solicitações', count: requests.length },
          ]}
        />
        {tab === 'clients' && (
          <DataTable
            columns={clientCols}
            rows={customers}
            rowKey={(c) => c.id}
            onRowClick={(c) => nav(`/clientes/${c.id}`)}
            initialSort={{ key: 'total', dir: 'desc' }}
            pageSize={10}
            dense
            emptyTitle="Nenhum cliente na carteira"
            emptyDescription="Defina o vendedor no cadastro do cliente ou aprove uma solicitação dele."
          />
        )}
        {tab === 'orders' && (
          <DataTable
            columns={orderCols}
            rows={sales}
            rowKey={(s) => s.id}
            onRowClick={(s) => nav(`/vendas/${s.id}`)}
            initialSort={{ key: 'd', dir: 'desc' }}
            pageSize={10}
            dense
            emptyTitle="Nenhum pedido ainda"
          />
        )}
        {tab === 'requests' && (
          <DataTable
            columns={reqCols}
            rows={requests}
            rowKey={(r) => r.id}
            onRowClick={() => nav('/clientes?aba=solicitacoes')}
            initialSort={{ key: 'd', dir: 'desc' }}
            pageSize={10}
            dense
            emptyTitle="Nenhuma solicitação de cadastro"
          />
        )}
      </div>
    </Drawer>
  );
}

function Mini({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-card border border-border bg-surface-2/50 px-3 py-2.5 min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-subtle truncate">{label}</div>
      <div className={`num font-semibold text-[15px] truncate mt-0.5 ${tone || 'text-fg'}`}>{value}</div>
      {hint && <div className="text-[11px] text-muted truncate">{hint}</div>}
    </div>
  );
}
