/**
 * Cartões laterais do detalhe: progresso, resumo, entrega, cliente, pesagem e histórico.
 */
import { Check, History, MapPin, MessageCircle, Scale, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { date, dateTime, formatCep, formatDocument, formatPhone, kg, money, percent } from '../../../domain/format';
import { describeWeighing } from '../../../domain/weighing';
import { BILLING_LABELS, PAYMENT_METHOD_LABELS, RANKING } from '../../../domain/labels';
import type { Customer, FreightZone, Sale } from '../../../domain/types';
import { Badge, Button, Card, CardHeader, cn, DescriptionList, Divider, Stars, Timeline } from '../../../ui';
import { historyLabel, LIFECYCLE, lifecycleIndex, whatsappLink } from '../helpers';

export function SaleProgress({ sale }: { sale: Sale }) {
  const idx = lifecycleIndex(sale.status);
  return (
    <ol className="flex items-center gap-1 sm:gap-2 overflow-x-auto scroll-x pb-1">
      {LIFECYCLE.map((step, i) => {
        const done = i < idx;
        const cur = i === idx;
        return (
          <li key={step.label} className="flex items-center gap-1 sm:gap-2 shrink-0">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-pill px-2.5 h-7 text-xs font-medium whitespace-nowrap',
                done ? 'bg-success-soft text-success' : cur ? 'bg-primary text-primary-fg' : 'bg-surface-2 text-subtle',
              )}
            >
              {done ? <Check className="size-3.5" /> : <span className="num">{i + 1}</span>}
              {step.label}
            </span>
            {i < LIFECYCLE.length - 1 && <span className={cn('h-px w-3 sm:w-6', done ? 'bg-success' : 'bg-border')} />}
          </li>
        );
      })}
    </ol>
  );
}

export function TotalsCard({ sale, showCost }: { sale: Sale; showCost: boolean }) {
  const freightItems = (sale.items || []).filter((i) => i.kind === 'FREIGHT').length > 0;
  return (
    <Card>
      <div className="space-y-1.5 text-sm">
        <Row label="Subtotal" value={money(sale.itemsSubtotal)} />
        <Row label={`Frete${freightItems ? ' (inclui itens)' : ''}`} value={sale.freightPending ? 'a combinar' : money(sale.freightValue)} />
        {sale.discountValue > 0 && <Row label="Desconto" value={`− ${money(sale.discountValue)}`} tone="text-success" />}
      </div>
      <Divider className="my-3" />
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted">Total</span>
        <span className="text-2xl font-semibold num text-fg">{money(sale.totalValue)}</span>
      </div>
      {!!sale.pickedAt && sale.estimatedTotal != null && Math.abs(sale.estimatedTotal - sale.totalValue) > 0.005 && (
        <div className="text-xs text-muted text-right num">estimado no pedido: {money(sale.estimatedTotal)}</div>
      )}
      <Divider className="my-3" />
      <div className="space-y-1.5 text-xs">
        <Row label="Peso" value={kg(sale.totalWeightKg)} />
        <Row label="Pagamento" value={PAYMENT_METHOD_LABELS[sale.paymentMethod]} />
        <Row label="Condição" value={sale.paymentTerms ? `${sale.paymentTerms} dias` : `${sale.installmentsCount || 1}x${sale.firstDueDate ? ` · 1º ${date(sale.firstDueDate)}` : ''}`} />
        <Row label="Faturamento" value={BILLING_LABELS[sale.billingType]} />
        <Row label="Vendedor" value={sale.sellerName || '—'} />
        {(showCost || sale.commissionValue > 0) && <Row label={`Comissão (${percent(sale.commissionRate, 2)})`} value={money(sale.commissionValue)} />}
        {sale.approvedByName && <Row label="Aprovado por" value={`${sale.approvedByName}${sale.approvedAt ? ` · ${dateTime(sale.approvedAt)}` : ''}`} />}
      </div>
    </Card>
  );
}

export function DeliveryCard({ sale, zone }: { sale: Sale; zone?: FreightZone | null }) {
  const pickup = sale.deliveryMode === 'PICKUP';
  return (
    <Card>
      <CardHeader icon={<MapPin className="size-4" />} title={pickup ? 'Retirada' : 'Entrega'} subtitle={sale.deliveryDate ? `Prevista para ${date(sale.deliveryDate)}${sale.deliveryWindow ? ` · janela ${sale.deliveryWindow}` : ''}` : 'Data a combinar'} className="mb-3" />
      <DescriptionList
        cols={1}
        items={[
          { label: 'Endereço', value: sale.shippingAddress || '—', hidden: pickup },
          { label: 'CEP', value: sale.shippingZipCode ? formatCep(sale.shippingZipCode) : '—', hidden: pickup },
          { label: 'Zona de frete', value: zone ? `${zone.label}${zone.etaNote ? ` · ${zone.etaNote}` : ''}` : sale.freightPending ? 'Frete a combinar' : '—', hidden: pickup },
          { label: 'Separado', value: sale.pickedAt ? `${dateTime(sale.pickedAt)}${sale.pickedByName ? ` · ${sale.pickedByName}` : ''}` : '—' },
          { label: 'Expedido', value: sale.dispatchedAt ? dateTime(sale.dispatchedAt) : '—', hidden: pickup },
          { label: pickup ? 'Retirado' : 'Entregue', value: sale.deliveredAt ? dateTime(sale.deliveredAt) : '—' },
        ]}
      />
    </Card>
  );
}

export function CustomerCard({ sale, customer }: { sale: Sale; customer: Customer | null }) {
  const phone = customer?.cellphone || customer?.phone;
  return (
    <Card>
      <CardHeader
        icon={<UserRound className="size-4" />}
        title={
          <Link to={`/clientes/${sale.customerId}`} className="hover:text-primary">
            {sale.customerName}
          </Link>
        }
        subtitle={formatDocument(sale.customerDocument || customer?.document) || undefined}
        className="mb-3"
      />
      {customer ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={RANKING[customer.ranking].tone} dot>
              {RANKING[customer.ranking].label}
            </Badge>
            <Stars value={customer.stars} />
            {customer.financialApproval !== 'APPROVED' && <Badge tone="warning">Crédito {customer.financialApproval === 'REJECTED' ? 'recusado' : 'pendente'}</Badge>}
            {customer.status === 'BLOCKED' && <Badge tone="danger">Bloqueado</Badge>}
          </div>
          <DescriptionList
            cols={1}
            items={[
              { label: 'Contato', value: [customer.contactName, formatPhone(phone)].filter(Boolean).join(' · ') || '—' },
              { label: 'E-mail', value: customer.financialEmail || customer.email || '—' },
              { label: 'Cidade', value: [customer.city, customer.state].filter(Boolean).join('/') || '—' },
            ]}
          />
          {phone && (
            <Button size="sm" variant="subtle" icon={<MessageCircle className="size-4" />} onClick={() => window.open(whatsappLink(phone, `Olá, ${customer.contactName || customer.name}! Sobre o pedido ${sale.number}: `), '_blank', 'noopener')}>
              WhatsApp
            </Button>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">Cadastro do cliente indisponível.</p>
      )}
    </Card>
  );
}

export function WeighingCard({ sale }: { sale: Sale }) {
  const w = sale.weighing;
  if (!w) return null;
  const decision = w.decision === 'AUTO' ? 'Aprovada automaticamente' : w.decision === 'ACCEPTED' ? 'Aceita pelo cliente' : w.decision === 'REJECTED' ? 'Recusada pelo cliente' : 'Aguardando o cliente';
  return (
    <Card>
      <CardHeader icon={<Scale className="size-4" />} title="Pesagem" subtitle={describeWeighing(w)} className="mb-3" />
      <div className="space-y-1.5 text-sm">
        <Row label="Estimado" value={money(w.estimatedTotal)} />
        <Row label="Pesado" value={money(w.finalTotal)} />
        <Row label="Diferença" value={`${w.diffValue >= 0 ? '+' : ''}${money(w.diffValue)} (${percent(w.diffPercent)})`} tone={w.diffValue > 0 ? 'text-warning' : 'text-success'} />
        <Row label="Decisão" value={`${decision}${w.decidedAt ? ` · ${dateTime(w.decidedAt)}` : ''}`} />
      </div>
    </Card>
  );
}

export function HistoryCard({ sale }: { sale: Sale }) {
  const items = (sale.history || [])
    .slice()
    .reverse()
    .map((h) => ({
      at: `${dateTime(h.at)}${h.by ? ` · ${h.by}` : ''}`,
      title: historyLabel(h.action),
      description: h.note || undefined,
      tone: (h.action === 'CANCEL' || h.action === 'REJECT' ? 'danger' : h.action === 'APPROVE' || h.action === 'PAYMENT_CONFIRMED' || h.action === 'DELIVER' ? 'success' : h.action === 'NOTE' ? 'warning' : 'primary') as
        | 'danger'
        | 'success'
        | 'warning'
        | 'primary',
    }));
  return (
    <Card>
      <CardHeader icon={<History className="size-4" />} title="Linha do tempo" subtitle={`Criado por ${sale.createdByName || '—'} em ${dateTime(sale.createdAt)}`} className="mb-3" />
      {items.length ? <Timeline items={items} /> : <p className="text-sm text-muted">Sem eventos.</p>}
    </Card>
  );
}

function Row({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className={cn('num text-right min-w-0 truncate', tone || 'text-fg')}>{value}</span>
    </div>
  );
}
