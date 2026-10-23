/**
 * Abas da ficha do cliente: pedidos, financeiro, cadastro, documentos e portal.
 */
import { Edit3, ExternalLink, Globe, MessageCircle, Phone, Plus, ShoppingCart } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '../../app/session';
import { useCrud } from '../../data/react';
import { date, dateTime, formatCep, formatDocument, formatPhone, kg, money, today } from '../../domain/format';
import {
  COMPANY_LABELS,
  CUSTOMER_CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS,
  SALE_CHANNEL_LABELS,
  SALE_STATUS,
} from '../../domain/labels';
import type { Customer, FinancialEntry, PortalAccount, PriceTable, Sale } from '../../domain/types';
import {
  AttachmentList,
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  DescriptionList,
  EmptyState,
  FileDrop,
  FooterCell,
  Segmented,
  StatusBadge,
  type Column,
} from '../../ui';
import { addressLine, entryBalance, isOverdue, telUrl, whatsappUrl } from './helpers';

// ---------------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------------

export function OrdersTab({ customer, sales }: { customer: Customer; sales: Sale[] }) {
  const nav = useNavigate();
  const { can } = useSession();
  const columns: Column<Sale>[] = [
    {
      key: 'number',
      header: 'Nº',
      mobile: 'title',
      sortValue: (s) => s.number,
      cell: (s) => (
        <div className="leading-tight">
          <div className="num font-medium text-fg">{s.number}</div>
          <div className="text-xs text-subtle">{SALE_CHANNEL_LABELS[s.channel]}</div>
        </div>
      ),
    },
    { key: 'date', header: 'Data', mobile: 'subtitle', sortValue: (s) => s.date, cell: (s) => <span className="num">{date(s.date)}</span> },
    {
      key: 'items',
      header: 'Itens / peso',
      align: 'right',
      hideBelow: 'md',
      cell: (s) => (
        <span className="num text-muted">
          {(s.items || []).filter((i) => i.kind === 'PRODUCT').length} · {kg(s.totalWeightKg)}
        </span>
      ),
    },
    { key: 'seller', header: 'Vendedor', hideBelow: 'lg', mobile: false, cell: (s) => s.sellerName || '—' },
    { key: 'total', header: 'Total', align: 'right', sortValue: (s) => s.totalValue, cell: (s) => <span className="font-semibold">{money(s.totalValue)}</span> },
    { key: 'status', header: 'Status', mobile: 'badge', cell: (s) => <StatusBadge info={SALE_STATUS[s.status]} /> },
    { key: 'pay', header: 'Pagamento', hideBelow: 'md', cell: (s) => <StatusBadge info={PAYMENT_STATUS[s.paymentStatus]} /> },
  ];
  return (
    <div className="space-y-3">
      {can('sales.create') && customer.status === 'ACTIVE' && (
        <div className="flex justify-end">
          <Button variant="primary" size="sm" icon={<Plus className="size-4" />} onClick={() => nav(`/vendas/nova?cliente=${customer.id}`)}>
            Novo pedido
          </Button>
        </div>
      )}
      <DataTable
        columns={columns}
        rows={sales}
        rowKey={(s) => s.id}
        initialSort={{ key: 'date', dir: 'desc' }}
        onRowClick={(s) => nav(`/vendas/${s.id}`)}
        pageSize={15}
        empty={<EmptyState icon={<ShoppingCart className="size-5" />} title="Nenhum pedido ainda" description="Os pedidos deste cliente aparecem aqui." />}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Financeiro
// ---------------------------------------------------------------------------

export function FinanceTab({ entries }: { entries: FinancialEntry[] }) {
  const [view, setView] = useState<'OPEN' | 'OVERDUE' | 'PAID' | 'ALL'>('OPEN');
  const ref = today();
  const receivables = useMemo(() => entries.filter((e) => e.direction === 'IN'), [entries]);
  const counts = useMemo(
    () => ({
      OPEN: receivables.filter((e) => e.status === 'OPEN').length,
      OVERDUE: receivables.filter((e) => isOverdue(e, ref)).length,
      PAID: receivables.filter((e) => e.status === 'PAID').length,
      ALL: receivables.length,
    }),
    [receivables, ref],
  );
  const rows = receivables.filter((e) =>
    view === 'ALL' ? true : view === 'OPEN' ? e.status === 'OPEN' : view === 'OVERDUE' ? isOverdue(e, ref) : e.status === 'PAID',
  );
  const sum = (fn: (e: FinancialEntry) => number) => rows.reduce((s, e) => s + fn(e), 0);

  const columns: Column<FinancialEntry>[] = [
    {
      key: 'due',
      header: 'Vencimento',
      mobile: 'subtitle',
      sortValue: (e) => e.dueDate,
      cell: (e) => <span className={`num ${isOverdue(e, ref) ? 'text-danger font-medium' : ''}`}>{date(e.dueDate)}</span>,
    },
    {
      key: 'desc',
      header: 'Descrição',
      mobile: 'title',
      cell: (e) => (
        <div className="min-w-0 leading-tight">
          <div className="truncate text-fg">{e.saleNumber ? `Pedido ${e.saleNumber}` : e.description}</div>
          <div className="text-xs text-subtle num">
            Parcela {e.installment}/{e.installments}
            {e.method ? ` · ${PAYMENT_METHOD_LABELS[e.method]}` : ''}
          </div>
        </div>
      ),
    },
    { key: 'amount', header: 'Valor', align: 'right', sortValue: (e) => e.amount, cell: (e) => money(e.amount) },
    { key: 'paid', header: 'Pago', align: 'right', hideBelow: 'md', cell: (e) => (e.paidAmount ? money(e.paidAmount) : '—') },
    { key: 'balance', header: 'Saldo', align: 'right', sortValue: (e) => entryBalance(e), cell: (e) => (e.status === 'OPEN' ? <strong>{money(entryBalance(e))}</strong> : '—') },
    {
      key: 'status',
      header: 'Status',
      mobile: 'badge',
      cell: (e) =>
        e.status === 'PAID' ? (
          <Badge tone="success" dot>
            Pago {e.paidAt ? date(e.paidAt) : ''}
          </Badge>
        ) : e.status === 'CANCELLED' ? (
          <Badge dot>Cancelado</Badge>
        ) : isOverdue(e, ref) ? (
          <Badge tone="danger" dot>
            Vencido
          </Badge>
        ) : (
          <Badge tone="warning" dot>
            Em aberto
          </Badge>
        ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          size="sm"
          value={view}
          onChange={setView}
          options={[
            { value: 'OPEN', label: 'Em aberto', count: counts.OPEN },
            { value: 'OVERDUE', label: 'Vencidas', count: counts.OVERDUE },
            { value: 'PAID', label: 'Pagas', count: counts.PAID },
            { value: 'ALL', label: 'Todas', count: counts.ALL },
          ]}
        />
        <Link to="/financeiro/clientes" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
          Extrato completo no financeiro <ExternalLink className="size-3" />
        </Link>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(e) => e.id}
        initialSort={{ key: 'due', dir: view === 'PAID' ? 'desc' : 'asc' }}
        pageSize={15}
        emptyTitle={view === 'OVERDUE' ? 'Nenhuma parcela vencida' : 'Nenhuma parcela'}
        emptyDescription="As contas a receber são geradas quando o pedido é aprovado."
        footer={
          rows.length > 1 ? (
            <tr>
              <FooterCell colSpan={2}>{rows.length} parcelas</FooterCell>
              <FooterCell align="right">{money(sum((e) => e.amount))}</FooterCell>
              <FooterCell align="right" className="hidden md:table-cell">
                {money(sum((e) => e.paidAmount || 0))}
              </FooterCell>
              <FooterCell align="right">{money(sum((e) => (e.status === 'OPEN' ? entryBalance(e) : 0)))}</FooterCell>
              <FooterCell />
            </tr>
          ) : undefined
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cadastro
// ---------------------------------------------------------------------------

export function ProfileTab({ customer: c, priceTable, onEdit }: { customer: Customer; priceTable: PriceTable | null; onEdit?: () => void }) {
  const wa = whatsappUrl(c.cellphone || c.phone);
  const tel = telUrl(c.cellphone || c.phone);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader
          title="Dados cadastrais"
          actions={
            onEdit && (
              <Button size="sm" icon={<Edit3 className="size-4" />} onClick={onEdit}>
                Editar
              </Button>
            )
          }
        />
        <DescriptionList
          items={[
            { label: c.personType === 'J' ? 'Razão social' : 'Nome', value: c.name, span: true },
            { label: 'Nome fantasia', value: c.tradeName || '—' },
            { label: c.personType === 'J' ? 'CNPJ' : 'CPF', value: <span className="num">{formatDocument(c.document)}</span> },
            { label: 'Inscrição estadual', value: c.stateRegistration || 'Isento / não informado', hidden: c.personType !== 'J' },
            { label: 'Inscrição municipal', value: c.municipalRegistration || '—', hidden: c.personType !== 'J' },
            { label: 'Categoria', value: CUSTOMER_CATEGORY_LABELS[c.category] },
            { label: 'Código', value: c.code || '—' },
            { label: 'Cliente desde', value: date(c.createdAt) },
          ]}
        />
      </Card>
      <Card>
        <CardHeader
          title="Contatos e endereço"
          actions={
            <div className="flex gap-1.5">
              {tel && (
                <a href={tel}>
                  <Button size="sm" icon={<Phone className="size-4" />}>
                    Ligar
                  </Button>
                </a>
              )}
              {wa && (
                <a href={wa} target="_blank" rel="noreferrer">
                  <Button size="sm" icon={<MessageCircle className="size-4" />}>
                    WhatsApp
                  </Button>
                </a>
              )}
            </div>
          }
        />
        <DescriptionList
          items={[
            { label: 'Contato', value: c.contactName || '—' },
            { label: 'Celular', value: c.cellphone ? <span className="num">{formatPhone(c.cellphone)}</span> : '—' },
            { label: 'Telefone', value: c.phone ? <span className="num">{formatPhone(c.phone)}</span> : '—' },
            { label: 'E-mail', value: c.email ? <a className="text-primary hover:underline" href={`mailto:${c.email}`}>{c.email}</a> : '—' },
            { label: 'E-mail financeiro', value: c.financialEmail || '—', span: true },
            { label: 'Endereço', value: addressLine(c) || '—', span: true },
            { label: 'CEP', value: c.zipCode ? <span className="num">{formatCep(c.zipCode)}</span> : '—' },
          ]}
        />
      </Card>
      <Card>
        <CardHeader title="Financeiro" />
        <DescriptionList
          items={[
            { label: 'Condição / prazos', value: c.paymentTerms ? `${c.paymentTerms} dias` : 'À vista' },
            { label: 'Limite de crédito', value: c.creditLimit ? money(c.creditLimit) : 'Sem limite definido' },
            { label: 'Forma preferida', value: c.preferredPaymentMethod ? PAYMENT_METHOD_LABELS[c.preferredPaymentMethod] : '—' },
            {
              label: 'Formas liberadas',
              value: (
                <span className="flex flex-wrap gap-1 mt-0.5">
                  {(c.allowedPaymentMethods || []).map((m) => (
                    <Badge key={m}>{PAYMENT_METHOD_LABELS[m]}</Badge>
                  ))}
                </span>
              ),
            },
            {
              label: 'Aprovação financeira',
              value: c.financialApprovedBy ? `${c.financialApprovedBy} · ${dateTime(c.financialApprovedAt)}` : 'Ainda não analisado',
              span: true,
            },
            { label: 'Observação do financeiro', value: c.financialApprovalNotes, span: true, hidden: !c.financialApprovalNotes },
          ]}
        />
      </Card>
      <Card>
        <CardHeader title="Comercial" />
        <DescriptionList
          items={[
            { label: 'Vendedor', value: c.sellerName || 'Venda direta' },
            { label: 'Segmento', value: c.segment || '—' },
            { label: 'Tabela de preço', value: priceTable?.name || 'Tabela padrão' },
            { label: 'Intercompany', value: c.isIntercompany ? COMPANY_LABELS[c.intercompanyCode || 'AURUS'] : 'Não' },
            { label: 'Observações', value: c.notes, span: true, hidden: !c.notes },
          ]}
        />
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Documentos
// ---------------------------------------------------------------------------

export function DocumentsTab({ customer }: { customer: Customer }) {
  const { can } = useSession();
  const crud = useCrud('customers');
  const canEdit = can('customers.manage');
  const docs = customer.documents || [];
  return (
    <Card className="space-y-4">
      <CardHeader title="Documentos do cliente" subtitle="Cartão CNPJ, contrato social, comprovante de endereço, documentos dos sócios." className="mb-0" />
      {canEdit && (
        <FileDrop
          folder={`customers/${customer.id}`}
          kind="DOCUMENT"
          multiple
          onUploaded={(att) => crud.update(customer.id, { documents: [...(customer.documents || []), att] })}
        />
      )}
      <AttachmentList
        items={docs}
        empty="Nenhum documento anexado."
        onRemove={canEdit ? (a) => void crud.update(customer.id, { documents: docs.filter((x) => x.id !== a.id) }) : undefined}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Portal
// ---------------------------------------------------------------------------

const PORTAL_ACCOUNT_STATUS = {
  PENDING: { label: 'Aguardando aprovação', tone: 'warning' as const },
  APPROVED: { label: 'Liberada', tone: 'success' as const },
  REJECTED: { label: 'Recusada', tone: 'danger' as const },
  BLOCKED: { label: 'Bloqueada', tone: 'danger' as const },
};

export function PortalTab({ accounts }: { accounts: PortalAccount[] }) {
  const { can } = useSession();
  if (!accounts.length)
    return (
      <Card>
        <EmptyState
          icon={<Globe className="size-5" />}
          title="Sem conta no portal"
          description="Quando o cliente se cadastrar no portal e a conta for aprovada e vinculada a este cadastro, ela aparece aqui."
          action={
            can('portal.manage') ? (
              <Link to="/comercial/portal">
                <Button>Ir para o portal</Button>
              </Link>
            ) : undefined
          }
        />
      </Card>
    );
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {accounts.map((a) => (
        <Card key={a.id}>
          <CardHeader
            icon={<Globe className="size-4" />}
            title={a.name}
            subtitle={a.email}
            actions={
              <Badge tone={PORTAL_ACCOUNT_STATUS[a.status].tone} dot>
                {PORTAL_ACCOUNT_STATUS[a.status].label}
              </Badge>
            }
          />
          <DescriptionList
            items={[
              { label: 'Empresa', value: a.companyName || '—' },
              { label: 'Telefone', value: a.phone ? formatPhone(a.phone) : '—' },
              { label: 'Aprovada por', value: a.approvedByName ? `${a.approvedByName} · ${date(a.approvedAt)}` : '—' },
              { label: 'Último acesso', value: a.lastLoginAt ? dateTime(a.lastLoginAt) : 'Nunca entrou' },
            ]}
          />
          {can('portal.manage') && (
            <div className="mt-4">
              <Link to="/comercial/portal" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                Gerenciar no portal <ExternalLink className="size-3" />
              </Link>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
