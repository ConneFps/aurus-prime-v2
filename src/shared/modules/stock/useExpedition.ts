/**
 * Ações de expedição/entrega com a regra de liberação fiscal (NF de cliente CNPJ).
 */
import { useOps, useSession } from '../../app/session';
import { useAction } from '../../data/react';
import type { Sale } from '../../domain/types';
import { toast, useConfirm } from '../../ui';
import { releaseInfo } from './model';

export function useExpedition() {
  const ops = useOps();
  const { can } = useSession();
  const confirm = useConfirm();
  const canOverride = can('sales.approve');

  async function checkRelease(sale: Sale, verb: string) {
    const r = releaseInfo(sale);
    if (r.released) return true;
    if (!canOverride) throw new Error(`${r.reason}. Anexe a NF no pedido antes de ${verb}.`);
    return confirm({
      title: `${verb[0].toUpperCase()}${verb.slice(1)} sem NF?`,
      message: 'Cliente CNPJ faturado com nota: a regra pede NF antes de sair. Continue só se a nota for emitida em seguida.',
      confirmLabel: `${verb[0].toUpperCase()}${verb.slice(1)} mesmo assim`,
      danger: true,
    });
  }

  const start = useAction(
    async (sale: Sale) => {
      await ops.startPicking(sale.id);
      return true;
    },
    { success: 'Separação iniciada' },
  );

  const dispatch = useAction(async (sale: Sale) => {
    if (!(await checkRelease(sale, 'expedir'))) return false;
    await ops.dispatchSale(sale.id);
    toast.success(`Pedido ${sale.number} expedido — em rota`);
    return true;
  });

  const deliver = useAction(async (sale: Sale) => {
    if (sale.status === 'READY' && !(await checkRelease(sale, 'entregar'))) return false;
    await ops.deliverSale(sale.id);
    toast.success(`Pedido ${sale.number} entregue`);
    return true;
  });

  return { start, dispatch, deliver, canPick: can('picking.perform') };
}
