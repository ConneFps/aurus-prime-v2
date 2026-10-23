/**
 * Tabelas de preço: envio para aprovação, aprovação e recusa.
 */
import type { Ops, OpsContext } from '../types';
import { appendNote, assert, audit, clean, mustGet, nowIso, requirePerm, runTx } from './common';

export function pricingOps(ctx: OpsContext): Pick<Ops, 'submitPriceTable' | 'approvePriceTable' | 'rejectPriceTable'> {
  const { actor } = ctx;
  return {
    async submitPriceTable(id) {
      requirePerm(actor, 'pricing.manage');
      await runTx(ctx, async (tx) => {
        const t = await mustGet(tx, 'price_tables', id, 'Tabela de preço não encontrada.');
        assert(t.approvalStatus === 'DRAFT' || t.approvalStatus === 'REJECTED', 'Esta tabela já foi enviada para aprovação.');
        assert((t.items || []).length > 0, 'Inclua pelo menos um produto na tabela.');
        assert(
          t.items.every((i) => typeof i.price === 'number' && i.price >= 0),
          'Há produtos sem preço válido na tabela.',
        );
        tx.update('price_tables', id, { approvalStatus: 'PENDING' });
        audit(tx, actor, 'UPDATE', 'price_tables', id, `Tabela "${t.name}" enviada para aprovação`);
      });
    },

    async approvePriceTable(id) {
      requirePerm(actor, 'pricing.approve');
      await runTx(ctx, async (tx) => {
        const t = await mustGet(tx, 'price_tables', id, 'Tabela de preço não encontrada.');
        assert(t.approvalStatus === 'PENDING' || t.approvalStatus === 'DRAFT', 'Esta tabela não está aguardando aprovação.');
        assert((t.items || []).length > 0, 'A tabela não tem produtos.');
        tx.update('price_tables', id, {
          approvalStatus: 'APPROVED',
          approvedById: actor.id,
          approvedByName: actor.name,
          approvedAt: nowIso(),
        });
        audit(tx, actor, 'APPROVE', 'price_tables', id, `Tabela "${t.name}" aprovada (${t.items.length} produtos)`);
      });
    },

    async rejectPriceTable(id, reason) {
      requirePerm(actor, 'pricing.approve');
      assert(clean(reason), 'Informe o motivo da recusa.');
      await runTx(ctx, async (tx) => {
        const t = await mustGet(tx, 'price_tables', id, 'Tabela de preço não encontrada.');
        assert(t.approvalStatus === 'PENDING', 'Somente tabelas aguardando aprovação podem ser recusadas.');
        tx.update('price_tables', id, {
          approvalStatus: 'REJECTED',
          approvedById: null,
          approvedByName: null,
          approvedAt: null,
          notes: appendNote(t.notes, `Recusada por ${actor.name}: ${reason.trim()}`),
        });
        audit(tx, actor, 'REJECT', 'price_tables', id, `Tabela "${t.name}" recusada: ${reason.trim()}`);
      });
    },
  };
}
