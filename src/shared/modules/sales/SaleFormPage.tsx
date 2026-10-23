/**
 * /vendas/nova (aceita ?cliente=ID e state { seed }) e /vendas/:id/editar.
 */
import { Lock } from 'lucide-react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useRow } from '../../data/react';
import { SALE_STATUS } from '../../domain/labels';
import { Button, EmptyState, PageHeader, PageLoader, StatusBadge } from '../../ui';
import { isEditable } from './helpers';
import { SaleEditor, type SaleDraftSeed } from './SaleEditor';

export function SaleFormPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const { row: sale, loading } = useRow('sales', id);

  if (id) {
    if (loading) return <PageLoader />;
    if (!sale)
      return (
        <EmptyState
          title="Pedido não encontrado"
          description="Ele pode ter sido excluído."
          action={
            <Link to="/vendas">
              <Button>Voltar para vendas</Button>
            </Link>
          }
        />
      );
    return (
      <>
        <PageHeader
          back={`/vendas/${sale.id}`}
          eyebrow="Editar pedido"
          title={`Pedido ${sale.number}`}
          subtitle={sale.customerName}
          actions={<StatusBadge info={SALE_STATUS[sale.status]} />}
        />
        {isEditable(sale) ? (
          <SaleEditor key={sale.id} initial={sale} />
        ) : (
          <EmptyState
            icon={<Lock className="size-5" />}
            title="Este pedido não pode mais ser editado"
            description={
              sale.stockDeducted
                ? 'O estoque já foi baixado na separação. Cancele e refaça o pedido, ou ajuste pela separação.'
                : `Pedidos "${SALE_STATUS[sale.status]?.label}" não aceitam alterações.`
            }
            action={
              <Link to={`/vendas/${sale.id}`}>
                <Button>Ver pedido</Button>
              </Link>
            }
          />
        )}
      </>
    );
  }

  const state = (location.state || {}) as { seed?: SaleDraftSeed; from?: string };
  const customerId = params.get('cliente');
  const seed: SaleDraftSeed | null = state.seed ? { ...state.seed, customerId: state.seed.customerId ?? customerId } : customerId ? { customerId } : null;

  return (
    <>
      <PageHeader
        back="/vendas"
        eyebrow="Comercial"
        title="Nova venda"
        subtitle={state.from ? state.from : 'Cliente, itens, entrega e pagamento — o resumo confere os totais antes de salvar.'}
      />
      <SaleEditor key={location.key} initial={seed} />
    </>
  );
}
