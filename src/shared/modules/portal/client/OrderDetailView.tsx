/**
 * Detalhe do pedido (cliente): acompanhamento, aceite de pesagem, Pix,
 * itens estimados × pesados e dados da entrega.
 */
import { ArrowLeft, MessageCircle, Scale, XCircle } from 'lucide-react';
import type React from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePortalSession } from '../../../app/session';
import { useSettings } from '../../../app/settings';
import { useAction } from '../../../data/react';
import { date, dateTime, money, percent, qty } from '../../../domain/format';
import { describeWeighing, evaluateWeighing, policyFromSettings } from '../../../domain/weighing';
import type { Sale } from '../../../domain/types';
import { Badge, Button, Callout, Card, CardHeader, cn, EmptyState, PageLoader, useConfirm } from '../../../ui';
import { portalStatusLabel, portalStatusTone, waLink } from '../lib';
import { useMySales } from './OrdersView';
import { PaymentCard } from './PaymentCard';
import { StepTracker } from './Tracker';

export function OrderDetailView() {
  const { id } = useParams();
  const { sales, loading } = useMySales();
  const { settings } = useSettings();
  const sale = sales.find((s) => s.id === id);

  if (loading) return <PageLoader />;
  if (!sale)
    return (
      <EmptyState
        title="Pedido não encontrado"
        description="Ele pode ter sido removido ou pertence a outra conta."
        action={
          <Link to="/portal/pedidos">
            <Button>Ver meus pedidos</Button>
          </Link>
        }
      />
    );

  const cancelled = sale.status === 'CANCELLED' || sale.status === 'REJECTED';
  const help = waLink(settings.whatsapp, `Olá! Tenho uma dúvida sobre o pedido nº ${sale.number}.`);

  return (
    <div className="max-w-4xl mx-auto">
      <Link to="/portal/pedidos" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg mb-3">
        <ArrowLeft className="size-3.5" /> Meus pedidos
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-fg num">Pedido nº {sale.number}</h1>
          <p className="text-sm text-muted mt-1">Feito em {dateTime(sale.createdAt)}</p>
        </div>
        <Badge tone={portalStatusTone(sale)} dot>
          {portalStatusLabel(sale)}
        </Badge>
      </div>

      <div className="space-y-4">
        {cancelled ? (
          <Callout tone="danger" title={sale.status === 'REJECTED' ? 'Pedido recusado' : 'Pedido cancelado'}>
            {sale.cancelReason || 'Fale com a nossa equipe se tiver dúvidas.'}
          </Callout>
        ) : (
          <Card>
            <StepTracker sale={sale} />
          </Card>
        )}

        {sale.status === 'AWAITING_CUSTOMER' && <WeighingCard sale={sale} />}
        {sale.freightPending && !cancelled && (
          <Callout tone="info" title="Frete a combinar">
            Seu endereço está fora das nossas zonas de entrega padrão. Nossa equipe informa o valor do frete antes do pagamento.
          </Callout>
        )}
        {!cancelled && <PaymentCard sale={sale} />}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
          <ItemsCard sale={sale} />
          <Card>
            <CardHeader title={sale.deliveryMode === 'PICKUP' ? 'Retirada' : 'Entrega'} />
            <dl className="space-y-3 text-sm">
              <Info label="Data prevista" value={sale.deliveryDate ? date(sale.deliveryDate) : 'A confirmar'} />
              <Info label={sale.deliveryMode === 'PICKUP' ? 'Local' : 'Endereço'} value={sale.shippingAddress || settings.pickupAddress || '—'} />
              {sale.customerNotes && <Info label="Suas observações" value={sale.customerNotes} />}
            </dl>
            <a href={help} target="_blank" rel="noopener noreferrer" className="mt-5 flex">
              <Button block icon={<MessageCircle className="size-4" />}>
                Falar sobre este pedido
              </Button>
            </a>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-subtle font-medium">{label}</dt>
      <dd className="text-fg mt-0.5 break-words">{value}</dd>
    </div>
  );
}

function WeighingCard({ sale }: { sale: Sale }) {
  const { ops } = usePortalSession();
  const { settings } = useSettings();
  const confirm = useConfirm();
  const w = sale.weighing || evaluateWeighing(sale.estimatedTotal ?? sale.totalValue, sale.totalValue, policyFromSettings(settings));
  const rejected = w.decision === 'REJECTED';
  const respond = useAction(
    async (accept: boolean) => {
      if (!ops) throw new Error('Sessão expirada — entre novamente.');
      await ops.respondWeighing(sale.id, accept);
    },
    { success: 'Resposta registrada. Obrigado!' },
  );
  const ask = async (accept: boolean) => {
    const ok = await confirm(
      accept
        ? { title: 'Aceitar o novo valor?', message: `O pedido passa a ser de ${money(sale.totalValue)} e o Pix é liberado em seguida.`, confirmLabel: 'Aceitar' }
        : {
            title: 'Recusar a diferença de peso?',
            message: 'Vamos registrar sua recusa e nossa equipe entra em contato para ajustar ou cancelar o pedido.',
            confirmLabel: 'Recusar',
            danger: true,
          },
    );
    if (ok) await respond.run(accept);
  };

  return (
    <Card className={cn(!rejected && 'border-warning/50')}>
      <CardHeader
        icon={rejected ? <XCircle className="size-4.5" /> : <Scale className="size-4.5" />}
        title={rejected ? 'Você recusou a diferença de peso' : 'Confirme o valor após a pesagem'}
        subtitle={rejected ? 'Nossa equipe vai entrar em contato com você.' : describeWeighing(w)}
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:text-center">
        <Figure label="Estimado" value={money(w.estimatedTotal)} />
        <Figure label="Após pesagem" value={money(w.finalTotal)} strong />
        <Figure
          label="Diferença"
          value={`${w.diffValue > 0 ? '+' : ''}${money(w.diffValue)}`}
          hint={`${w.diffPercent > 0 ? '+' : ''}${percent(w.diffPercent)}`}
          tone={w.diffValue > 0 ? 'text-warning' : 'text-success'}
        />
      </div>
      <div className="mt-4 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
        {!rejected && (
          <Button variant="ghost" loading={respond.running} onClick={() => void ask(false)}>
            Recusar
          </Button>
        )}
        <Button variant="primary" loading={respond.running} onClick={() => void ask(true)}>
          {rejected ? 'Mudei de ideia — aceitar novo valor' : 'Aceitar novo valor'}
        </Button>
      </div>
    </Card>
  );
}

function Figure({ label, value, hint, strong, tone }: { label: string; value: string; hint?: string; strong?: boolean; tone?: string }) {
  return (
    <div className="rounded-control bg-surface-2 px-3 py-2 sm:px-2 sm:py-2.5 min-w-0 flex items-baseline justify-between gap-3 sm:block">
      <div className="text-[10px] uppercase tracking-wider text-subtle font-medium">{label}</div>
      <div className="text-right sm:text-center">
        <span className={cn('num sm:block sm:mt-0.5', strong ? 'text-base font-semibold text-fg' : 'text-sm text-fg', tone)}>{value}</span>
        {hint && <span className={cn('text-[11px] num ml-1.5 sm:ml-0 sm:block', tone)}>{hint}</span>}
      </div>
    </div>
  );
}

function ItemsCard({ sale }: { sale: Sale }) {
  const weighed = sale.stockDeducted;
  const items = (sale.items || []).slice().sort((a, b) => a.position - b.position);
  const products = items.filter((i) => i.kind !== 'FREIGHT');
  const estimated = sale.estimatedTotal ?? null;
  return (
    <Card padded={false}>
      <div className="px-4 sm:px-5 pt-4 sm:pt-5">
        <CardHeader title="Itens" subtitle={weighed ? 'Quantidades pesadas na separação.' : 'Quantidades estimadas — confirmadas na pesagem.'} />
      </div>
      <ul className="divide-y divide-border border-t border-border">
        {products.map((i) => {
          const changed = weighed && Math.abs(i.qty - i.qtyOrdered) > 1e-6;
          return (
            <li key={i.id} className="px-4 sm:px-5 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm text-fg font-medium">{i.productName}</div>
                <div className="text-xs text-muted num mt-0.5">
                  Pedido {qty(i.qtyOrdered, i.unit)}
                  {weighed && (
                    <>
                      {' · '}
                      <span className={cn(changed && 'text-fg font-medium')}>Pesado {qty(i.qty, i.unit)}</span>
                    </>
                  )}
                  {' · '}
                  {money(i.unitPrice)}/{i.unit === 'KG' ? 'kg' : 'un'}
                </div>
              </div>
              <div className="text-sm font-semibold text-fg num shrink-0">{money(i.total)}</div>
            </li>
          );
        })}
      </ul>
      <dl className="border-t border-border px-4 sm:px-5 py-4 space-y-1.5 text-sm">
        <Line label="Produtos" value={money(sale.itemsSubtotal)} />
        <Line label="Frete" value={sale.freightPending ? 'A combinar' : sale.freightValue > 0 ? money(sale.freightValue) : sale.deliveryMode === 'PICKUP' ? 'Retirada' : 'Grátis'} />
        {sale.discountValue > 0 && <Line label="Desconto" value={`− ${money(sale.discountValue)}`} />}
        {weighed && estimated != null && Math.abs(estimated - sale.totalValue) > 0.005 && <Line label="Total estimado no pedido" value={money(estimated)} muted />}
        <div className="flex items-baseline justify-between pt-2 border-t border-border mt-2">
          <dt className="font-semibold text-fg">{weighed ? 'Total' : 'Total estimado'}</dt>
          <dd className="text-lg font-semibold text-fg num">{money(sale.totalValue)}</dd>
        </div>
      </dl>
    </Card>
  );
}

function Line({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3', muted && 'text-subtle')}>
      <dt className={muted ? '' : 'text-muted'}>{label}</dt>
      <dd className={cn('num', muted ? 'line-through' : 'text-fg')}>{value}</dd>
    </div>
  );
}
