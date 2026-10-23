/**
 * Ações de parcela reaproveitadas pela tabela e pelo painel de detalhe.
 */
import { useOps } from '../../app/session';
import { useAction } from '../../data/react';
import { money } from '../../domain/format';
import type { FinancialEntry } from '../../domain/types';
import { usePrompt } from '../../ui';

export function useCancelEntry(onDone?: () => void) {
  const ops = useOps();
  const prompt = usePrompt();
  return useAction(
    async (e: FinancialEntry) => {
      const reason = await prompt({
        title: 'Cancelar parcela?',
        message: `${e.description} (${e.installment}/${e.installments}) — ${money(e.amount)}. A parcela deixa de contar nos saldos.`,
        label: 'Motivo do cancelamento',
        confirmLabel: 'Cancelar parcela',
        cancelLabel: 'Voltar',
        danger: true,
      });
      if (!reason) return false;
      await ops.cancelEntry(e.id, reason);
      return true;
    },
    { success: (ok) => (ok ? 'Parcela cancelada' : 'Nada foi alterado'), onSuccess: (ok) => ok && onDone?.() },
  );
}

export function useReversePayment() {
  const ops = useOps();
  const prompt = usePrompt();
  return useAction(
    async (e: FinancialEntry, paymentId: string, amount: number) => {
      const reason = await prompt({
        title: `Estornar ${money(amount)}?`,
        message: 'O valor volta a ficar em aberto na parcela. O pagamento continua no histórico, marcado como estornado.',
        label: 'Motivo do estorno',
        confirmLabel: 'Estornar',
        danger: true,
      });
      if (!reason) return false;
      await ops.reversePayment(e.id, paymentId, reason);
      return true;
    },
    { success: (ok) => (ok ? 'Pagamento estornado' : 'Estorno não realizado') },
  );
}
