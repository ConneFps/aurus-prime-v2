/**
 * Materiais (embalagens, etiquetas, sacolas…).
 */
import { number } from '../../domain/format';
import type { Ops, OpsContext } from '../types';
import { assert, audit, clean, isISODate, isNonNeg, isPos, mustGet, requirePerm, round2, round3, round4, runTx } from './common';

export function supplyOps(ctx: OpsContext): Pick<Ops, 'registerSupplyMovement'> {
  const { actor } = ctx;
  return {
    async registerSupplyMovement(input) {
      requirePerm(actor, 'supplies.manage');
      assert(['IN', 'OUT', 'ADJUST'].includes(input.type), 'Tipo de movimentação inválido.');
      if (input.type === 'ADJUST') assert(isNonNeg(input.quantity), 'Informe o novo saldo (zero ou mais).');
      else assert(isPos(input.quantity), 'Informe uma quantidade maior que zero.');
      assert(isISODate(input.date), 'Informe a data.');
      if (input.unitCost != null) assert(isNonNeg(input.unitCost), 'Custo unitário inválido.');
      await runTx(ctx, async (tx) => {
        const item = await mustGet(tx, 'supply_items', input.supplyItemId, 'Material não encontrado.');
        const qty = round3(input.quantity);
        let balance: number;
        if (input.type === 'IN') balance = round3(item.quantity + qty);
        else if (input.type === 'OUT') {
          balance = round3(item.quantity - qty);
          assert(balance >= -0.0005, `Saldo insuficiente de ${item.name}: disponível ${number(item.quantity, 3)} ${item.unit}.`);
          balance = Math.max(0, balance);
        } else balance = qty;
        const unitCost = input.unitCost ?? item.unitCost ?? null;
        const moved = input.type === 'ADJUST' ? Math.abs(round3(balance - item.quantity)) : qty;
        let saleNumber: string | null = null;
        if (input.saleId) saleNumber = (await mustGet(tx, 'sales', input.saleId, 'Pedido não encontrado.')).number;
        tx.insert('supply_movements', {
          supplyItemId: item.id,
          supplyItemName: item.name,
          type: input.type,
          quantity: qty,
          balanceAfter: balance,
          unitCost,
          totalValue: unitCost != null ? round2(moved * unitCost) : null,
          date: input.date,
          reason: clean(input.reason),
          saleId: input.saleId ?? null,
          saleNumber,
          invoiceNumber: clean(input.invoiceNumber),
          supplier: clean(input.supplier),
          notes: clean(input.notes),
          userName: actor.name,
        });
        const patch: { quantity: number; unitCost?: number | null; supplier?: string | null } = { quantity: balance };
        // Entrada com custo: custo médio ponderado.
        if (input.type === 'IN' && input.unitCost != null) {
          const prevQty = Math.max(0, item.quantity);
          const prevCost = item.unitCost ?? input.unitCost;
          patch.unitCost = prevQty + qty > 0 ? round4((prevQty * prevCost + qty * input.unitCost) / (prevQty + qty)) : input.unitCost;
        }
        if (input.type === 'IN' && clean(input.supplier)) patch.supplier = clean(input.supplier);
        tx.update('supply_items', item.id, patch);
        const verb = input.type === 'IN' ? 'Entrada' : input.type === 'OUT' ? 'Saída' : 'Ajuste';
        audit(tx, actor, 'UPDATE', 'supply_items', item.id, `${verb} de material: ${item.name} ${number(qty, 3)} ${item.unit} (saldo ${number(balance, 3)})`);
      });
    },
  };
}
