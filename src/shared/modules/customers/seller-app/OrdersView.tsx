/**
 * Pedidos do vendedor externo: lista, detalhe (somente leitura), novo e edição.
 */
import { Copy, Edit3, ListOrdered, Lock, MessageCircle, Plus, Send } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useOps } from '../../../app/session';
import { useAction } from '../../../data/react';
import { date, dateTime, formatDocument, money, percent, qty } from '../../../domain/format';
import { BILLING_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS, SALE_STATUS } from '../../../domain/labels';
import type { Sale } from '../../../domain/types';
import { Button, Callout, Card, CardHeader, DescriptionList, EmptyState, PageHeader, PageLoader, SearchInput, Segmented, StatusBadge, Timeline, useConfirm } from '../../../ui';
import { SaleProgress } from '../../sales/detail/InfoCards';
import { HISTORY_LABELS, isEditable } from '../../sales/helpers';
import { SaleEditor, type SaleDraftSeed } from '../../sales/SaleEditor';
import { whatsappUrl } from '../helpers';
import { ListCard, OPEN_STATUSES, OrderRow, useMyCustomers, useMySales } from './shared';

type Filter = 'ALL' | 'OPEN' | 'PENDING' | 'DONE' | 'CANCELLED';

export function OrdersView() {
  const { rows: sales, loading } = useMySales();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [q, setQ] = useState('');

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { ALL: sales.length, OPEN: 0, PENDING: 0, DONE: 0, CANCELLED: 0 };
    for (const s of sales) {
      if (OPEN_STATUSES.includes(s.status)) c.OPEN++;
      if (s.status === 'PENDING_APPROVAL' || s.status === 'DRAFT') c.PENDING++;
      if (s.status === 'DELIVERED') c.DONE++;
      if (s.status === 'CANCELLED' || s.status === 'REJECTED') c.CANCELLED++;
    }
    return c;
  }, [sales]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return sales
      .filter((s) =>
        filter === 'ALL'
          ? true
          : filter === 'OPEN'
            ? OPEN_STATUSES.includes(s.status)
            : filter === 'PENDING'
              ? s.status === 'PENDING_APPROVAL' || s.status === 'DRAFT'
              : filter === 'DONE'
                ? s.status === 'DELIVERED'
                : s.status === 'CANCELLED' || s.status === 'REJECTED',
      )
      .filter((s) => !t || s.number.includes(t) || s.customerName.toLowerCase().includes(t))
      .sort((a, b) => (b.date + b.number).localeCompare(a.date + a.number));
  }, [sales, filter, q]);

  const total = list.reduce((s, x) => s + x.totalValue, 0);

  return (
    <>
      <PageHeader
        title="Meus pedidos"
        subtitle="Acompanhe aprovação, separação e entrega dos seus pedidos."
        actions={
          <Link to="/pedidos/novo">
            <Button variant="primary" icon={<Plus className="size-4" />}>
              Novo pedido
            </Button>
          </Link>
        }
      />
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
        <Segmented
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'ALL', label: 'Todos', count: counts.ALL },
            { value: 'OPEN', label: 'Em andamento', count: counts.OPEN },
            { value: 'PENDING', label: 'A aprovar', count: counts.PENDING },
            { value: 'DONE', label: 'Entregues', count: counts.DONE },
            { value: 'CANCELLED', label: 'Cancelados', count: counts.CANCELLED },
          ]}
        />
        <SearchInput value={q} onChange={setQ} placeholder="Nº ou cliente…" className="sm:w-60 sm:ml-auto" />
      </div>
      {list.length ? (
        <>
          <ListCard>
            {list.map((s) => (
              <OrderRow key={s.id} sale={s} />
            ))}
          </ListCard>
          <p className="text-xs text-muted mt-3 num">
            {list.length} pedido(s) · {money(total)}
          </p>
        </>
      ) : (
        <ListCard>
          <EmptyState
            icon={<ListOrdered className="size-5" />}
            title={loading ? 'Carregando…' : 'Nenhum pedido neste filtro'}
            description="Pedidos novos aparecem aqui assim que enviados."
          />
        </ListCard>
      )}
    </>
  );
}

function seedFrom(s: Sale): SaleDraftSeed {
  return {
    customerId: s.customerId,
    priceTableId: s.priceTableId,
    paymentMethod: s.paymentMethod,
    billingType: s.billingType,
    paymentTerms: s.paymentTerms,
    deliveryMode: s.deliveryMode,
    customerNotes: s.customerNotes,
    items: (s.items || [])
      .filter((i) => i.kind !== 'FREIGHT')
      .map((i) => ({
        kind: i.kind,
        productId: i.productId,
        supplyItemId: i.supplyItemId,
        productName: i.productName,
        unit: i.unit,
        qtyOrdered: i.qtyOrdered,
        unitPrice: i.unitPrice,
        notes: i.notes,
      })),
  };
}

export function OrderView() {
  const { id } = useParams();
  const nav = useNavigate();
  const ops = useOps();
  const confirm = useConfirm();
  const { rows: sales, loading } = useMySales();
  const { rows: customers } = useMyCustomers();
  const sale = sales.find((s) => s.id === id);

  const submit = useAction(
    async () => {
      if (!sale) return;
      if (!(await confirm({ title: `Enviar pedido ${sale.number} para aprovação?`, confirmLabel: 'Enviar' }))) return;
      await ops.submitSale(sale.id);
    },
    { success: 'Pedido enviado para aprovação' },
  );

  if (loading) return <PageLoader />;
  if (!sale)
    return (
      <EmptyState
        title="Pedido não encontrado"
        description="Ele pode ter sido excluído ou não é seu."
        action={
          <Link to="/pedidos">
            <Button>Voltar para meus pedidos</Button>
          </Link>
        }
      />
    );

  const customer = customers.find((c) => c.id === sale.customerId);
  const editable = isEditable(sale) && (sale.status === 'DRAFT' || sale.status === 'PENDING_APPROVAL');
  const closed = sale.status === 'CANCELLED' || sale.status === 'REJECTED';
  const products = (sale.items || []).filter((i) => i.kind !== 'FREIGHT');
  const summary = [
    `Pedido ${sale.number} — ${sale.customerName}`,
    ...products.map((i) => `• ${i.productName}: ${qty(i.qtyOrdered, i.unit)} × ${money(i.unitPrice)}`),
    `Total estimado: ${money(sale.totalValue)}`,
    sale.deliveryDate ? `Entrega prevista: ${date(sale.deliveryDate)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const wa = whatsappUrl(customer?.cellphone || customer?.phone, summary);

  return (
    <>
      <PageHeader
        back="/pedidos"
        eyebrow={`Pedido · ${date(sale.date)}`}
        title={
          <span className="inline-flex flex-wrap items-baseline gap-x-3">
            <span className="num">Nº {sale.number}</span>
            <span className="text-base sm:text-lg text-muted font-normal num">{money(sale.totalValue)}</span>
          </span>
        }
        subtitle={sale.customerName}
        actions={
          <>
            {sale.status === 'DRAFT' && (
              <Button variant="primary" icon={<Send className="size-4" />} loading={submit.running} onClick={() => void submit.run()}>
                Enviar para aprovação
              </Button>
            )}
            {editable && (
              <Button icon={<Edit3 className="size-4" />} onClick={() => nav(`/pedidos/${sale.id}/editar`)}>
                Editar
              </Button>
            )}
            <Button icon={<Copy className="size-4" />} onClick={() => nav('/pedidos/novo', { state: { seed: seedFrom(sale) } })}>
              Repetir
            </Button>
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer">
                <Button icon={<MessageCircle className="size-4" />}>Enviar ao cliente</Button>
              </a>
            )}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge info={SALE_STATUS[sale.status]} />
          <StatusBadge info={PAYMENT_STATUS[sale.paymentStatus]} />
        </div>
      </PageHeader>

      {!closed && (
        <div className="mb-4">
          <SaleProgress sale={sale} />
        </div>
      )}
      {sale.status === 'PENDING_APPROVAL' && (
        <Callout tone="warning" title="Aguardando aprovação da equipe interna" className="mb-4">
          Você ainda pode editar o pedido. Depois de aprovado, alterações só pela equipe interna.
        </Callout>
      )}
      {sale.status === 'DRAFT' && (
        <Callout tone="info" title="Rascunho" className="mb-4">
          Este pedido ainda não foi enviado — a equipe interna não o vê até você enviar para aprovação.
        </Callout>
      )}
      {closed && (
        <Callout tone="danger" title={sale.status === 'REJECTED' ? 'Pedido recusado' : 'Pedido cancelado'} className="mb-4">
          {sale.cancelReason || 'Sem motivo informado.'}
        </Callout>
      )}
      {!editable && !closed && sale.status !== 'DRAFT' && (
        <p className="text-xs text-muted mb-4 inline-flex items-center gap-1.5">
          <Lock className="size-3.5" /> Pedido aprovado — para alterar, fale com a equipe interna.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-4 min-w-0">
          <Card padded={false}>
            <div className="px-4 sm:px-5 pt-4 sm:pt-5">
              <CardHeader title="Itens" subtitle={`${products.length} item(ns) · peso final confirmado na separação`} />
            </div>
            <ul className="divide-y divide-border border-t border-border">
              {products.map((i) => (
                <li key={i.id} className="px-4 sm:px-5 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-fg">{i.productName}</div>
                    <div className="text-xs text-muted num">
                      {qty(i.qty || i.qtyOrdered, i.unit)} × {money(i.unitPrice)}
                      {i.qty && i.qty !== i.qtyOrdered ? ` (pedido ${qty(i.qtyOrdered, i.unit)})` : ''}
                    </div>
                    {i.notes && <div className="text-xs text-subtle mt-0.5">Obs.: {i.notes}</div>}
                  </div>
                  <div className="num text-sm font-semibold text-fg shrink-0">{money(i.total)}</div>
                </li>
              ))}
            </ul>
            <div className="border-t border-border px-4 sm:px-5 py-3 space-y-1.5 text-sm">
              <Row label="Subtotal" value={money(sale.itemsSubtotal)} />
              <Row label="Frete" value={sale.deliveryMode === 'PICKUP' ? 'Retirada' : sale.freightPending ? 'a combinar' : money(sale.freightValue)} />
              {sale.discountValue > 0 && <Row label="Desconto" value={`− ${money(sale.discountValue)}`} />}
              <div className="flex items-baseline justify-between pt-1.5 border-t border-border">
                <span className="font-medium text-fg">Total</span>
                <span className="num text-lg font-semibold text-fg">{money(sale.totalValue)}</span>
              </div>
              <Row label={`Sua comissão (${percent(sale.commissionRate, 2)})`} value={closed ? '—' : money(sale.commissionValue)} tone="text-success" />
            </div>
          </Card>
        </div>

        <div className="space-y-4 min-w-0">
          <Card>
            <CardHeader title="Entrega e pagamento" />
            <DescriptionList
              cols={1}
              items={[
                { label: 'Cliente', value: `${sale.customerName}${sale.customerDocument ? ` · ${formatDocument(sale.customerDocument)}` : ''}` },
                { label: 'Entrega', value: sale.deliveryMode === 'PICKUP' ? 'Retirada no local' : sale.shippingAddress || 'Entrega no endereço do cliente' },
                { label: 'Data prevista', value: sale.deliveryDate ? date(sale.deliveryDate) : 'a definir' },
                { label: 'Pagamento', value: `${PAYMENT_METHOD_LABELS[sale.paymentMethod]} · ${sale.paymentTerms ? `${sale.paymentTerms} dias` : sale.installmentsCount > 1 ? `${sale.installmentsCount}x` : 'à vista'}` },
                { label: 'Faturamento', value: BILLING_LABELS[sale.billingType] },
                { label: 'Nota fiscal', value: sale.invoiceNumber, hidden: !sale.invoiceNumber },
                { label: 'Observações ao cliente', value: sale.customerNotes, hidden: !sale.customerNotes },
                { label: 'Observações internas', value: sale.notes, hidden: !sale.notes },
              ]}
            />
          </Card>
          {sale.history?.length > 0 && (
            <Card>
              <CardHeader title="Histórico" />
              <Timeline
                items={[...sale.history].reverse().map((h) => ({
                  at: dateTime(h.at),
                  title: HISTORY_LABELS[h.action] || h.action,
                  description: [h.by, h.note].filter(Boolean).join(' — ') || undefined,
                  tone: h.action === 'REJECT' || h.action === 'CANCEL' ? 'danger' : h.action === 'APPROVE' || h.action === 'DELIVER' ? 'success' : 'primary',
                }))}
              />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className={`num ${tone || 'text-fg'}`}>{value}</span>
    </div>
  );
}

export function NewOrderView() {
  const nav = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const state = (location.state || {}) as { seed?: SaleDraftSeed };
  const customerId = params.get('cliente');
  const seed: SaleDraftSeed | null = state.seed ?? (customerId ? { customerId } : null);
  return (
    <>
      <PageHeader
        back="/pedidos"
        title={state.seed ? 'Repetir pedido' : 'Novo pedido'}
        subtitle="Escolha o cliente da carteira, os cortes e a entrega. Informe a observação de corte de cada item para a separação."
      />
      <SaleEditor key={location.key} initial={seed} onSaved={(s) => nav(`/pedidos/${s.id}`, { replace: true })} />
    </>
  );
}

export function EditOrderView() {
  const { id } = useParams();
  const nav = useNavigate();
  const { rows: sales, loading } = useMySales();
  const sale = sales.find((s) => s.id === id);
  if (loading) return <PageLoader />;
  if (!sale) return <EmptyState title="Pedido não encontrado" action={<Link to="/pedidos"><Button>Voltar</Button></Link>} />;
  const editable = isEditable(sale) && (sale.status === 'DRAFT' || sale.status === 'PENDING_APPROVAL');
  return (
    <>
      <PageHeader back={`/pedidos/${sale.id}`} title={`Editar pedido ${sale.number}`} subtitle={sale.customerName} actions={<StatusBadge info={SALE_STATUS[sale.status]} />} />
      {editable ? (
        <SaleEditor key={sale.id} initial={sale} onSaved={(s) => nav(`/pedidos/${s.id}`, { replace: true })} />
      ) : (
        <EmptyState
          icon={<Lock className="size-5" />}
          title="Este pedido não pode mais ser editado"
          description="Depois de aprovado, só a equipe interna altera o pedido."
          action={
            <Link to={`/pedidos/${sale.id}`}>
              <Button>Ver pedido</Button>
            </Link>
          }
        />
      )}
    </>
  );
}
