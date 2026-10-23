/**
 * Painel rápido de um pedido do portal (equipe): ações conforme a etapa.
 */
import { Check, ExternalLink, MessageCircle, PackageCheck, Truck, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useOps, useSession } from '../../../app/session';
import { useSettings } from '../../../app/settings';
import { useAction } from '../../../data/react';
import { dateTime, date, money, percent, qty, today } from '../../../domain/format';
import { PAYMENT_STATUS, SALE_STATUS } from '../../../domain/labels';
import { isApprovalExpired, policyFromSettings } from '../../../domain/weighing';
import type { PortalAccount, Sale } from '../../../domain/types';
import { AttachmentList, Button, Callout, DescriptionList, Divider, Drawer, Field, MoneyInput, StatusBadge, usePrompt } from '../../../ui';
import { waLink } from '../lib';
import { isFreightEditable, saleToInput } from './helpers';

export function PortalOrderDrawer({ sale, account, onClose }: { sale: Sale | null; account?: PortalAccount | null; onClose: () => void }) {
  return (
    <Drawer
      open={!!sale}
      onClose={onClose}
      width="lg"
      title={sale ? `Pedido nº ${sale.number}` : ''}
      description={sale ? `${sale.customerName} · feito em ${dateTime(sale.createdAt)}` : undefined}
      footer={
        sale && (
          <>
            {['APPROVED', 'PICKING'].includes(sale.status) && (
              <Link to={`/estoque/separacao/${sale.id}`}>
                <Button icon={<PackageCheck className="size-4" />}>Separação</Button>
              </Link>
            )}
            <Link to={`/vendas/${sale.id}`}>
              <Button variant="primary" icon={<ExternalLink className="size-4" />}>
                Abrir venda
              </Button>
            </Link>
          </>
        )
      }
    >
      {sale && <Body sale={sale} account={account} onClose={onClose} />}
    </Drawer>
  );
}

function Body({ sale, account, onClose }: { sale: Sale; account?: PortalAccount | null; onClose: () => void }) {
  const ops = useOps();
  const { can } = useSession();
  const { settings } = useSettings();
  const prompt = usePrompt();
  const [freight, setFreight] = useState<number | null>(sale.freightPending ? null : sale.freightValue);
  const phone = account?.phone || null;
  const contact = (text: string) => waLink(phone, text);

  const approve = useAction(() => ops.approveSale(sale.id, 'Aprovado pelo painel do portal'), { success: 'Pedido aprovado', onSuccess: onClose });
  const reject = useAction(
    async () => {
      const reason = await prompt({ title: `Recusar o pedido ${sale.number}?`, label: 'Motivo (o cliente verá esta mensagem)', confirmLabel: 'Recusar', danger: true });
      if (!reason) return false;
      await ops.rejectSale(sale.id, reason);
      return true;
    },
    { onSuccess: (ok) => ok && onClose() },
  );
  const saveFreight = useAction(
    async () => {
      if (freight === null || freight < 0) throw new Error('Informe o valor do frete (0 para grátis).');
      await ops.updateSale(sale.id, saleToInput(sale, { freightValue: freight, freightPending: false }));
    },
    { success: 'Frete informado — o cliente já vê o novo total' },
  );
  const respond = useAction((accept: boolean) => ops.respondWeighing(sale.id, accept), {
    success: 'Resposta registrada',
    onSuccess: onClose,
  });
  const cancelByRefusal = useAction(async () => {
    const reason = await prompt({ title: 'Cancelar o pedido?', message: 'O estoque separado volta ao saldo e as parcelas são canceladas.', label: 'Motivo', initial: 'Cliente recusou a diferença de peso', danger: true, confirmLabel: 'Cancelar pedido' });
    if (!reason) return;
    await ops.cancelSale(sale.id, reason);
    onClose();
  });
  const confirmPay = useAction(() => ops.confirmSalePayment(sale.id, { date: today(), method: 'PIX', notes: 'Comprovante enviado pelo portal' }), {
    success: 'Pagamento confirmado',
    onSuccess: onClose,
  });

  const w = sale.weighing;
  const expired = sale.status === 'AWAITING_CUSTOMER' && sale.pickedAt && isApprovalExpired(sale.pickedAt, policyFromSettings(settings));
  const canEdit = can('sales.edit');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <StatusBadge info={SALE_STATUS[sale.status]} />
        <StatusBadge info={PAYMENT_STATUS[sale.paymentStatus]} />
        {sale.freightPending && <StatusBadge info={{ label: 'Frete a combinar', tone: 'warning' }} />}
      </div>

      {/* Ações por etapa */}
      {sale.freightPending && isFreightEditable(sale) && canEdit && (
        <Callout tone="warning" title="Frete a combinar">
          <span className="block">CEP fora das zonas cadastradas{sale.shippingZipCode ? ` (${sale.shippingZipCode})` : ''}. Informe o valor para o cliente.</span>
          <div className="mt-3 flex gap-2 items-end">
            <Field label="Valor do frete" className="flex-1 max-w-48">
              <MoneyInput value={freight} onChange={setFreight} />
            </Field>
            <Button variant="primary" loading={saveFreight.running} onClick={() => void saveFreight.run()} icon={<Truck className="size-4" />}>
              Salvar frete
            </Button>
          </div>
        </Callout>
      )}

      {sale.status === 'PENDING_APPROVAL' && can('sales.approve') && (
        <Callout tone="info" title="Pedido novo do portal">
          <span className="block">Confira itens, endereço e frete. Ao aprovar, o pedido entra na fila de separação.</span>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" size="sm" icon={<Check className="size-4" />} loading={approve.running} disabled={!!sale.freightPending} onClick={() => void approve.run()}>
              Aprovar pedido
            </Button>
            <Button variant="ghost" size="sm" icon={<X className="size-4" />} loading={reject.running} onClick={() => void reject.run()}>
              Recusar
            </Button>
          </div>
          {sale.freightPending && <span className="block text-xs mt-2">Informe o frete antes de aprovar.</span>}
        </Callout>
      )}

      {sale.status === 'AWAITING_CUSTOMER' && w && (
        <Callout tone={w.decision === 'REJECTED' ? 'danger' : 'warning'} title={w.decision === 'REJECTED' ? 'Cliente recusou a diferença de peso' : 'Aguardando o aceite do cliente'}>
          <span className="block">
            Estimado {money(w.estimatedTotal)} → pesado {money(w.finalTotal)} ({w.diffValue > 0 ? '+' : ''}
            {money(w.diffValue)}, {percent(w.diffPercent)}). Tolerância: {percent(settings.weighingTolerancePercent)}{settings.weighingToleranceMaxValue != null ? ` ou ${money(settings.weighingToleranceMaxValue)}` : ''}.
          </span>
          {expired && w.decision !== 'REJECTED' && <span className="block mt-1 font-medium">O prazo de aceite automático já passou.</span>}
          <div className="mt-3 flex flex-wrap gap-2">
            {phone && (
              <a href={contact(`Olá, ${account?.name?.split(' ')[0] || ''}! Sobre o pedido nº ${sale.number}: após a pesagem o total ficou ${money(sale.totalValue)}.`)} target="_blank" rel="noopener noreferrer">
                <Button size="sm" icon={<MessageCircle className="size-4" />}>
                  WhatsApp do cliente
                </Button>
              </a>
            )}
            {(can('sales.edit') || can('sales.approve')) && (
              <Button size="sm" variant="primary" loading={respond.running} onClick={() => void respond.run(true)}>
                Aceitar pelo cliente
              </Button>
            )}
            {can('sales.cancel') && (
              <Button size="sm" variant="ghost" loading={cancelByRefusal.running} onClick={() => void cancelByRefusal.run()}>
                Cancelar pedido
              </Button>
            )}
          </div>
        </Callout>
      )}

      {sale.paymentStatus === 'RECEIPT_SENT' && (
        <Callout tone="info" title="Comprovante enviado pelo cliente">
          {sale.paymentReceipt ? <AttachmentList items={[sale.paymentReceipt]} className="mt-2 bg-surface" /> : 'Sem arquivo.'}
          {can('finance.pay') && (
            <Button className="mt-3" size="sm" variant="primary" icon={<Check className="size-4" />} loading={confirmPay.running} onClick={() => void confirmPay.run()}>
              Confirmar pagamento de {money(sale.totalValue)}
            </Button>
          )}
        </Callout>
      )}

      <DescriptionList
        items={[
          { label: 'Conta do portal', value: account ? `${account.name} · ${account.email}` : '—', span: true },
          { label: sale.deliveryMode === 'PICKUP' ? 'Retirada' : 'Entrega', value: sale.deliveryDate ? `${date(sale.deliveryDate)}${sale.deliveryWindow ? ` · janela ${sale.deliveryWindow}` : ''}` : 'A definir' },
          { label: 'Frete', value: sale.freightPending ? 'A combinar' : sale.freightValue > 0 ? money(sale.freightValue) : sale.deliveryMode === 'PICKUP' ? 'Retirada' : 'Grátis' },
          { label: 'Endereço', value: sale.shippingAddress || '—', span: true },
          { label: 'Observações do cliente', value: sale.customerNotes, span: true, hidden: !sale.customerNotes },
        ]}
      />

      <Divider />
      <div>
        <div className="text-[11px] uppercase tracking-wider text-subtle font-medium mb-2">Itens</div>
        <ul className="divide-y divide-border rounded-card border border-border">
          {(sale.items || []).map((i) => (
            <li key={i.id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="text-fg">{i.productName}</div>
                <div className="text-xs text-muted num">
                  Pedido {qty(i.qtyOrdered, i.unit)}
                  {sale.stockDeducted && ` · pesado ${qty(i.qty, i.unit)}`} · {money(i.unitPrice)}
                </div>
              </div>
              <span className="num text-fg shrink-0">{money(i.total)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between mt-3 text-sm">
          <span className="text-muted">Total{sale.stockDeducted ? '' : ' estimado'}</span>
          <span className="font-semibold text-fg num">{money(sale.totalValue)}</span>
        </div>
      </div>
    </div>
  );
}
