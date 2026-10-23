/**
 * Detalhe da separação (mobile-first): pesagem, baixa, romaneio, NF e expedição.
 */
import { Phone, Play, Printer, RotateCcw, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useOps, useSession } from '../../app/session';
import { useSettings } from '../../app/settings';
import { useAction, useRow, useTable } from '../../data/react';
import { date, dateTime, formatDocument, formatPhone, money, onlyDigits, percent, qty as fmtQty, relativeDays, round3 } from '../../domain/format';
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS, SALE_CHANNEL_LABELS, SALE_STATUS } from '../../domain/labels';
import { policyFromSettings } from '../../domain/weighing';
import type { Sale, StockLot, SupplyItem } from '../../domain/types';
import type { StockAllocationResult } from '../../ops/types';
import { Button, Callout, Card, DescriptionList, EmptyState, PageHeader, PageLoader, StatusBadge, Timeline, toast, usePrompt } from '../../ui';
import { ExpeditionPanel, InvoicePanel } from './ExpeditionPanel';
import { PickedItems } from './PickedItems';
import { PickingForm } from './PickingForm';
import { ChannelBadge, DeliveryBadge } from './pickingUi';
import { lotsUsedByItem, printRomaneio } from './romaneioPdf';
import { useExpedition } from './useExpedition';

const HISTORY_LABELS: Record<string, string> = {
  CREATE: 'Pedido criado',
  UPDATE: 'Pedido alterado',
  SUBMIT: 'Enviado para aprovação',
  APPROVE: 'Aprovado',
  REJECT: 'Recusado',
  PICKING_STARTED: 'Separação iniciada',
  PICKING_DONE: 'Separação concluída',
  WEIGHING_ACCEPTED: 'Pesagem aceita',
  WEIGHING_REJECTED: 'Cliente recusou a pesagem',
  DISPATCH: 'Expedido',
  DELIVER: 'Entregue',
  ATTACHMENT: 'Arquivo anexado',
  ATTACHMENT_REMOVED: 'Anexo removido',
  CANCEL: 'Cancelado',
  NOTE: 'Observação',
  PAYMENT_CONFIRMED: 'Pagamento confirmado',
  RECEIPT_UPLOADED: 'Comprovante enviado',
  RECEIVABLES_REGENERATED: 'Parcelas recalculadas',
};

export function PickingDetailPage() {
  const { id } = useParams();
  const { row: sale, loading } = useRow('sales', id);
  if (loading) return <PageLoader />;
  if (!sale)
    return (
      <>
        <PageHeader back="/estoque/separacao" eyebrow="Separação" title="Pedido não encontrado" />
        <EmptyState title="Este pedido não existe ou foi excluído." action={<Link to="/estoque/separacao">Voltar para a fila</Link>} />
      </>
    );
  return <PickingDetail sale={sale} />;
}

function PickingDetail({ sale }: { sale: Sale }) {
  const ops = useOps();
  const { can } = useSession();
  const prompt = usePrompt();
  const { settings } = useSettings();
  const exp = useExpedition();
  const { rows: products } = useTable('products');
  const { rows: lots } = useTable('stock_lots', { where: [['stage', '==', 'FINISHED']] });
  const { rows: supplies } = useTable('supply_items');
  const { rows: movements } = useTable('stock_movements', { where: [['saleId', '==', sale.id]] });
  const { rows: supplyMoves } = useTable('supply_movements', { where: [['saleId', '==', sale.id]] });
  const { row: customer } = useRow('customers', sale.customerId);
  const { row: priceTable } = useRow('price_tables', sale.priceTableId || null);
  const [result, setResult] = useState<StockAllocationResult | null>(null);
  const [reweigh, setReweigh] = useState(false);

  // Na nova pesagem, a operação estorna a baixa anterior: a prévia soma de volta o que este pedido já baixou.
  const effectiveLots = useMemo<StockLot[]>(() => {
    if (!sale.stockDeducted) return lots;
    const back = new Map<string, number>();
    for (const m of movements) if (m.type === 'SALE' || m.type === 'SALE_REVERSAL') back.set(m.lotId, (back.get(m.lotId) || 0) - m.qty);
    return lots.map((l) => {
      const b = back.get(l.id) || 0;
      if (b <= 0.0005) return l;
      return { ...l, balanceQty: round3(l.balanceQty + b), status: l.status === 'BLOCKED' ? 'BLOCKED' : 'AVAILABLE' };
    });
  }, [lots, movements, sale.stockDeducted]);
  const effectiveSupplies = useMemo<SupplyItem[]>(() => {
    if (!sale.stockDeducted) return supplies;
    const back = new Map<string, number>();
    for (const m of supplyMoves) back.set(m.supplyItemId, (back.get(m.supplyItemId) || 0) + (m.type === 'OUT' ? m.quantity : m.type === 'IN' ? -m.quantity : 0));
    return supplies.map((s) => ((back.get(s.id) || 0) > 0 ? { ...s, quantity: round3(s.quantity + back.get(s.id)!) } : s));
  }, [supplies, supplyMoves, sale.stockDeducted]);

  const used = useMemo(() => lotsUsedByItem(movements, lots), [movements, lots]);
  const editable = ['APPROVED', 'PICKING'].includes(sale.status) || (sale.status === 'AWAITING_CUSTOMER' && reweigh);
  const picked = ['AWAITING_CUSTOMER', 'READY', 'DISPATCHED', 'DELIVERED'].includes(sale.status);
  const closed = ['CANCELLED', 'REJECTED'].includes(sale.status);
  const notApproved = ['DRAFT', 'PENDING_APPROVAL'].includes(sale.status);

  const print = () => printRomaneio({ sale, customer, movements, lots, pickupAddress: settings.pickupAddress });

  const accept = useAction(() => ops.respondWeighing(sale.id, true), { success: 'Aceite registrado — pedido pronto' });
  const cancel = useAction(async () => {
    const reason = await prompt({
      title: `Cancelar pedido ${sale.number}?`,
      message: 'O estoque baixado volta para os lotes e as parcelas em aberto são canceladas.',
      label: 'Motivo',
      initial: sale.weighing?.decision === 'REJECTED' ? 'Cliente recusou a diferença de peso' : '',
      confirmLabel: 'Cancelar pedido',
      danger: true,
    });
    if (!reason) return;
    await ops.cancelSale(sale.id, reason);
    toast.success('Pedido cancelado e estoque estornado');
  });

  const phone = customer?.cellphone || customer?.phone;
  const policy = policyFromSettings(settings);

  return (
    <>
      <PageHeader
        back="/estoque/separacao"
        eyebrow="Separação"
        title={
          <span className="inline-flex items-center gap-2 flex-wrap">
            Pedido <span className="num">#{sale.number}</span>
          </span>
        }
        subtitle={sale.customerName}
        actions={
          <>
            <StatusBadge info={SALE_STATUS[sale.status]} />
            <Button size="sm" icon={<Printer className="size-4" />} onClick={print}>
              {picked ? 'Romaneio' : 'Lista de separação'}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="space-y-4 min-w-0">
          {/* Cabeçalho do pedido */}
          <Card>
            <div className="flex items-center gap-1.5 flex-wrap mb-3">
              <ChannelBadge sale={sale} />
              <DeliveryBadge sale={sale} />
              <StatusBadge info={PAYMENT_STATUS[sale.paymentStatus]} />
            </div>
            <DescriptionList
              items={[
                {
                  label: 'Cliente',
                  value: (
                    <span>
                      {sale.customerName}
                      <span className="block text-xs text-muted num">
                        {formatDocument(sale.customerDocument || customer?.document)}
                        {customer?.contactName ? ` · ${customer.contactName}` : ''}
                      </span>
                      {phone && (
                        <a href={`tel:${onlyDigits(phone)}`} className="inline-flex items-center gap-1 text-xs text-primary mt-0.5">
                          <Phone className="size-3" /> {formatPhone(phone)}
                        </a>
                      )}
                    </span>
                  ),
                },
                {
                  label: sale.deliveryMode === 'PICKUP' ? 'Retirada' : 'Entrega',
                  value: (
                    <span>
                      <span className="num">
                        {sale.deliveryDate ? `${date(sale.deliveryDate)} (${relativeDays(sale.deliveryDate)})` : 'Sem data'}
                        {sale.deliveryWindow ? ` · janela ${sale.deliveryWindow}` : ''}
                      </span>
                      <span className="block text-xs text-muted">
                        {sale.deliveryMode === 'PICKUP' ? settings.pickupAddress || 'No balcão' : sale.shippingAddress || 'Endereço não informado'}
                      </span>
                    </span>
                  ),
                },
                { label: 'Pagamento', value: `${PAYMENT_METHOD_LABELS[sale.paymentMethod]}${sale.paymentTerms ? ` · ${sale.paymentTerms} d` : ''}` },
                { label: 'Canal / vendedor', value: `${SALE_CHANNEL_LABELS[sale.channel]}${sale.sellerName ? ` · ${sale.sellerName}` : ''}` },
              ]}
            />
            {sale.customerNotes?.trim() && (
              <Callout tone="warning" title="Observações do cliente" className="mt-4">
                {sale.customerNotes}
              </Callout>
            )}
            {sale.notes?.trim() && (
              <Callout tone="info" title="Observação interna" className="mt-3">
                {sale.notes}
              </Callout>
            )}
          </Card>

          {/* Situação */}
          {notApproved && <Callout tone="warning" title="Pedido ainda não aprovado">Aguarde a aprovação comercial para separar.</Callout>}
          {closed && (
            <Callout tone="danger" title={`Pedido ${SALE_STATUS[sale.status].label.toLowerCase()}`}>
              {sale.cancelReason || 'Sem motivo informado.'}
            </Callout>
          )}
          {sale.status === 'APPROVED' && (
            <Callout
              tone="info"
              title="Separação não iniciada"
              action={
                <Button size="sm" variant="primary" icon={<Play className="size-4" />} loading={exp.start.running} onClick={() => void exp.start.run(sale)}>
                  Iniciar
                </Button>
              }
            >
              Toque em Iniciar para avisar a equipe que você está separando. Você também pode pesar direto.
            </Callout>
          )}
          {result && <ResultCallouts result={result} />}
          {sale.status === 'AWAITING_CUSTOMER' && !reweigh && (
            <AwaitingCustomer
              sale={sale}
              hours={policy.autoApproveAfterHours}
              onReweigh={() => {
                setResult(null);
                setReweigh(true);
              }}
              onAccept={can('sales.edit') || can('sales.approve') ? () => void accept.run() : undefined}
              accepting={accept.running}
              onCancel={can('sales.cancel') ? () => void cancel.run() : undefined}
              cancelling={cancel.running}
            />
          )}

          {editable && (
            <PickingForm
              key={`${sale.status}-${reweigh}`}
              sale={sale}
              products={products}
              lots={effectiveLots}
              supplies={effectiveSupplies}
              priceTable={priceTable}
              settings={settings}
              reweigh={reweigh}
              onCancel={reweigh ? () => setReweigh(false) : undefined}
              onDone={(r) => {
                setResult(r);
                setReweigh(false);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          )}

          {picked && !editable && (
            <>
              <ExpeditionPanel sale={sale} onPrint={print} />
              <div className="lg:hidden">
                <InvoicePanel sale={sale} />
              </div>
              <PickedItems sale={sale} used={used} />
            </>
          )}
        </div>

        <aside className="space-y-4 min-w-0">
          {picked && (
            <div className="hidden lg:block">
              <InvoicePanel sale={sale} />
            </div>
          )}
          {!!sale.history?.length && (
            <Card>
              <h3 className="text-sm font-semibold text-fg mb-3">Histórico</h3>
              <Timeline
                items={[...sale.history]
                  .reverse()
                  .slice(0, 8)
                  .map((h) => ({
                    at: `${dateTime(h.at)}${h.by ? ` · ${h.by}` : ''}`,
                    title: HISTORY_LABELS[h.action] || h.action,
                    description: h.note || undefined,
                    tone: h.action.includes('REJECT') || h.action.includes('CANCEL') ? 'danger' : h.action === 'PICKING_DONE' || h.action === 'DELIVER' ? 'success' : 'primary',
                  }))}
              />
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}

function ResultCallouts({ result }: { result: StockAllocationResult }) {
  return (
    <div className="space-y-3">
      <Callout tone="success" title="Separação concluída">
        Total final <strong className="num">{money(result.totalValue)}</strong>. Estoque baixado{result.shortQty > 0 ? ' parcialmente' : ''}.
      </Callout>
      {result.shortItems.length > 0 && (
        <Callout tone="danger" title={`Faltou estoque (${fmtQty(result.shortQty, 'KG')} sem baixa)`}>
          <ul className="mt-1 space-y-0.5">
            {result.shortItems.map((s) => (
              <li key={s.productName} className="num">
                {s.productName}: separado {fmtQty(s.requested, 'KG')}, baixado {fmtQty(s.allocated, 'KG')}
              </li>
            ))}
          </ul>
          <span className="block mt-1 text-xs">O pedido segue com o peso informado. A pendência aparece em Movimentações › Conciliação.</span>
        </Callout>
      )}
      {result.needsCustomerApproval && (
        <Callout tone="warning" title="Aguardando o aceite do cliente">
          A diferença passou da margem do portal. O cliente vê e aceita pelo portal; depois o pedido fica pronto para expedir.
        </Callout>
      )}
    </div>
  );
}

function AwaitingCustomer({
  sale,
  hours,
  onReweigh,
  onAccept,
  accepting,
  onCancel,
  cancelling,
}: {
  sale: Sale;
  hours: number | null;
  onReweigh: () => void;
  onAccept?: () => void;
  accepting: boolean;
  onCancel?: () => void;
  cancelling: boolean;
}) {
  const w = sale.weighing;
  if (w?.decision === 'REJECTED')
    return (
      <Callout tone="danger" title="Cliente recusou a diferença de peso">
        <p>
          Estimado {money(w.estimatedTotal)} → pesado {money(w.finalTotal)} ({w.diffValue > 0 ? '+' : ''}
          {money(w.diffValue)}). Refaça a pesagem com peças mais próximas do pedido ou cancele o pedido.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Button size="sm" variant="primary" icon={<RotateCcw className="size-4" />} onClick={onReweigh}>
            Refazer pesagem
          </Button>
          {onCancel ? (
            <Button size="sm" variant="danger" icon={<XCircle className="size-4" />} loading={cancelling} onClick={onCancel}>
              Cancelar pedido
            </Button>
          ) : (
            <span className="text-xs text-muted self-center">Para cancelar, fale com o comercial.</span>
          )}
        </div>
      </Callout>
    );
  return (
    <Callout tone="warning" title="Aguardando o cliente aceitar a pesagem">
      <p>
        {w ? (
          <span className="num">
            A pesagem ficou {money(w.diffValue)} acima do estimado ({money(w.estimatedTotal)} → {money(w.finalTotal)}, +{percent(w.diffPercent)}). Passou da
            margem do portal e o cliente precisa aceitar.
          </span>
        ) : (
          'A diferença de peso passou da margem do portal e o cliente precisa aceitar.'
        )}
      </p>
      {hours != null && <p className="text-xs mt-1">Sem resposta, o aceite é automático após {hours} h da pesagem.</p>}
      <div className="flex flex-wrap gap-2 mt-3">
        {onAccept && (
          <Button size="sm" variant="primary" loading={accepting} onClick={onAccept}>
            Cliente aceitou (registrar)
          </Button>
        )}
        <Button size="sm" icon={<RotateCcw className="size-4" />} onClick={onReweigh}>
          Refazer pesagem
        </Button>
      </div>
    </Callout>
  );
}
