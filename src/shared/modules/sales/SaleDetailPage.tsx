/**
 * /vendas/:id — detalhe do pedido com ações contextuais.
 */
import { Link, useParams } from 'react-router-dom';
import { useSession } from '../../app/session';
import { useRow, useTable } from '../../data/react';
import { date, kg, money } from '../../domain/format';
import { COMPANY_LABELS, PAYMENT_STATUS, SALE_CHANNEL_LABELS, SALE_STATUS } from '../../domain/labels';
import { Badge, Button, Callout, EmptyState, PageHeader, PageLoader, StatusBadge } from '../../ui';
import { useStockBalances } from '../common/lookups';
import { useMemo } from 'react';
import { DocumentsCard } from './detail/DocumentsCard';
import { FinanceCard } from './detail/FinanceCard';
import { CustomerCard, DeliveryCard, HistoryCard, SaleProgress, TotalsCard, WeighingCard } from './detail/InfoCards';
import { ItemsCard } from './detail/ItemsCard';
import { SaleActions } from './detail/SaleActions';

export function SaleDetailPage() {
  const { id } = useParams();
  const { can } = useSession();
  const { row: sale, loading } = useRow('sales', id);
  const { row: customer } = useRow('customers', sale?.customerId);
  const { row: zone } = useRow('freight_zones', sale?.freightZoneId);
  const { rows: entries } = useTable('financial_entries', { where: [['saleId', '==', id || '-']] }, { enabled: !!id });
  const { rows: movements } = useTable('stock_movements', { where: [['saleId', '==', id || '-']] }, { enabled: !!id });
  const { lots, byProduct } = useStockBalances('FINISHED');
  const avgCost = useMemo(() => {
    const m = new Map<string, number>();
    byProduct.forEach((v, k) => v.qty > 0 && m.set(k, v.value / v.qty));
    return m;
  }, [byProduct]);

  if (loading) return <PageLoader />;
  if (!sale)
    return (
      <EmptyState
        title="Pedido não encontrado"
        description="Ele pode ter sido excluído ou você não tem acesso."
        action={
          <Link to="/vendas">
            <Button>Voltar para vendas</Button>
          </Link>
        }
      />
    );

  const closed = sale.status === 'CANCELLED' || sale.status === 'REJECTED';
  const showCost = can('sales.viewCost');

  return (
    <>
      <PageHeader
        back={sale.isIntercompany ? '/vendas/intercompany' : '/vendas'}
        eyebrow={sale.isIntercompany ? 'Venda intercompany' : 'Pedido de venda'}
        title={
          <span className="inline-flex flex-wrap items-baseline gap-x-3">
            <span className="num">Pedido {sale.number}</span>
            <span className="text-base sm:text-lg text-muted font-normal num">{money(sale.totalValue)}</span>
          </span>
        }
        subtitle={
          <>
            <Link to={`/clientes/${sale.customerId}`} className="text-fg hover:text-primary font-medium">
              {sale.customerName}
            </Link>
            {' · '}
            {date(sale.date)} · {kg(sale.totalWeightKg)}
          </>
        }
        actions={<SaleActions sale={sale} customer={customer} entries={entries} movements={movements} lots={lots} />}
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge info={SALE_STATUS[sale.status]} />
          <StatusBadge info={PAYMENT_STATUS[sale.paymentStatus]} />
          <Badge tone="neutral">{SALE_CHANNEL_LABELS[sale.channel]}</Badge>
          {sale.company && <Badge tone="info">{COMPANY_LABELS[sale.company]}</Badge>}
          {sale.invoiceNumber && <Badge tone="success">NF {sale.invoiceNumber}</Badge>}
          {sale.stockDeducted && <Badge tone="accent">Estoque baixado</Badge>}
        </div>
      </PageHeader>

      <div className="space-y-3 mb-5">
        {closed ? (
          <Callout tone="danger" title={sale.status === 'REJECTED' ? 'Pedido recusado' : 'Pedido cancelado'}>
            {sale.cancelReason || (sale.history || []).filter((h) => h.action === 'REJECT' || h.action === 'CANCEL').slice(-1)[0]?.note || 'Sem motivo informado.'}
          </Callout>
        ) : (
          <SaleProgress sale={sale} />
        )}
        {sale.status === 'AWAITING_CUSTOMER' && (
          <Callout tone="warning" title="Aguardando o cliente aprovar a pesagem">
            O valor pesado ficou fora da tolerância. O cliente responde pelo portal — ou registre a resposta pelo menu de ações.
          </Callout>
        )}
        {!!sale.stockShortKg && sale.stockShortKg > 0 && (
          <Callout tone="warning" title="Baixa de estoque incompleta">
            Faltaram {kg(sale.stockShortKg)} no estoque na hora da baixa — confira os lotes e faça um ajuste se necessário.
          </Callout>
        )}
        {sale.freightPending && !closed && (
          <Callout tone="info" title="Frete a combinar">
            Informe o valor do frete editando o pedido antes do faturamento.
          </Callout>
        )}
        {sale.notes && (
          <Callout tone="info" title="Observações internas">
            <span className="whitespace-pre-line">{sale.notes}</span>
          </Callout>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 sm:gap-5 items-start">
        <div className="lg:col-span-2 space-y-4 sm:space-y-5 min-w-0">
          <ItemsCard sale={sale} movements={movements} lots={lots} avgCost={avgCost} showCost={showCost} />
          <FinanceCard sale={sale} entries={entries} />
          <DocumentsCard sale={sale} />
        </div>
        <div className="space-y-4 sm:space-y-5 min-w-0">
          <TotalsCard sale={sale} showCost={showCost} />
          <CustomerCard sale={sale} customer={customer} />
          <DeliveryCard sale={sale} zone={zone} />
          <WeighingCard sale={sale} />
          {sale.customerNotes && (
            <Callout tone="info" title="Observações para o cliente">
              <span className="whitespace-pre-line">{sale.customerNotes}</span>
            </Callout>
          )}
          <HistoryCard sale={sale} />
        </div>
      </div>
    </>
  );
}
