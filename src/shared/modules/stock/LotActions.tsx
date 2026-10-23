/**
 * Ações sobre lotes de estoque: ajuste de saldo, bloqueio e perda.
 * Use o hook useLotActions() e renderize `modals` uma vez na página.
 */
import { useState } from 'react';
import { useOps, useSession } from '../../app/session';
import { useAction } from '../../data/react';
import { date, kg, money, qty as fmtQty, today } from '../../domain/format';
import { LOSS_ORIGIN_LABELS, LOSS_REASON_LABELS, optionsOf } from '../../domain/labels';
import type { LossOrigin, LossReason, StockLot } from '../../domain/types';
import { Button, Callout, Combobox, DateInput, DescriptionList, Field, FormGrid, Modal, Select, Textarea, toast, usePrompt, useConfirm, WeightInput } from '../../ui';
import { useProductWithStockOptions } from '../common/lookups';

interface LossDraft {
  lot: StockLot | null;
  productId: string | null;
  qty: number | null;
  origin: LossOrigin;
  reason: LossReason;
  date: string;
  notes: string;
}

export function useLotActions() {
  const ops = useOps();
  const { can } = useSession();
  const canManage = can('stock.manage');
  const prompt = usePrompt();
  const confirm = useConfirm();
  const [adjusting, setAdjusting] = useState<{ lot: StockLot; balance: number | null; reason: string } | null>(null);
  const [loss, setLoss] = useState<LossDraft | null>(null);

  const adjust = useAction(
    async (d: { lot: StockLot; balance: number | null; reason: string }) => {
      if (d.balance === null || d.balance < 0) throw new Error('Informe o novo saldo (zero ou mais).');
      if (!d.reason.trim()) throw new Error('Informe o motivo do ajuste.');
      await ops.adjustLot(d.lot.id, d.balance, d.reason.trim());
    },
    { success: 'Saldo ajustado', onSuccess: () => setAdjusting(null) },
  );

  const block = useAction(async (lot: StockLot) => {
    if (lot.status === 'BLOCKED') {
      if (!(await confirm({ title: 'Liberar lote?', message: `${lot.productName}${lot.lotCode ? ` · ${lot.lotCode}` : ''} volta a ficar disponível para venda.`, confirmLabel: 'Liberar' }))) return;
      await ops.setLotBlocked(lot.id, false, null);
      toast.success('Lote liberado');
      return;
    }
    const reason = await prompt({
      title: 'Bloquear lote',
      message: 'Lotes bloqueados não entram na separação nem no saldo disponível.',
      label: 'Motivo do bloqueio',
      placeholder: 'Ex.: embalagem violada, aguardando análise, recall…',
      confirmLabel: 'Bloquear',
      danger: true,
    });
    if (!reason) return;
    await ops.setLotBlocked(lot.id, true, reason);
    toast.success('Lote bloqueado');
  });

  const saveLoss = useAction(
    async (d: LossDraft) => {
      if (!d.lot && !d.productId) throw new Error('Escolha o produto ou o lote.');
      if (!d.qty || d.qty <= 0) throw new Error('Informe a quantidade perdida.');
      await ops.registerLoss({
        lotId: d.lot?.id ?? null,
        productId: d.lot ? d.lot.productId : d.productId,
        stage: 'FINISHED',
        qty: d.qty,
        origin: d.origin,
        reason: d.reason,
        date: d.date,
        notes: d.notes.trim() || null,
      });
    },
    { success: 'Perda registrada', onSuccess: () => setLoss(null) },
  );

  const openLoss = (lot?: StockLot | null, productId?: string | null) =>
    setLoss({
      lot: lot || null,
      productId: lot?.productId || productId || null,
      qty: null,
      origin: 'ESTOQUE',
      reason: lot && lot.expiryDate && lot.expiryDate < today() ? 'VALIDADE_VENCIDA' : 'AVARIA',
      date: today(),
      notes: '',
    });

  const modals = (
    <>
      <Modal
        open={!!adjusting}
        onClose={() => setAdjusting(null)}
        title="Ajustar saldo do lote"
        description="Use para corrigir o saldo após contagem física. Fica registrado no histórico."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdjusting(null)}>
              Cancelar
            </Button>
            <Button variant="primary" loading={adjust.running} onClick={() => adjusting && void adjust.run(adjusting)}>
              Salvar ajuste
            </Button>
          </>
        }
      >
        {adjusting && (
          <div className="space-y-4">
            <DescriptionList
              items={[
                { label: 'Produto', value: adjusting.lot.productName },
                { label: 'Lote', value: adjusting.lot.lotCode || adjusting.lot.batchCode || '—' },
                { label: 'Saldo atual', value: <span className="num">{fmtQty(adjusting.lot.balanceQty, adjusting.lot.unit)}</span> },
                { label: 'Validade', value: date(adjusting.lot.expiryDate) },
              ]}
            />
            <Field label="Novo saldo (contado)" required>
              <WeightInput unit={adjusting.lot.unit} value={adjusting.balance} onChange={(v) => setAdjusting({ ...adjusting, balance: v })} autoFocus />
            </Field>
            {adjusting.balance !== null && Math.abs(adjusting.balance - adjusting.lot.balanceQty) > 0.0005 && (
              <p className="text-xs text-muted num">
                Diferença: {fmtQty(adjusting.balance - adjusting.lot.balanceQty, adjusting.lot.unit)} ·{' '}
                {money((adjusting.balance - adjusting.lot.balanceQty) * adjusting.lot.unitCost)} a custo
              </p>
            )}
            <Field label="Motivo" required>
              <Textarea value={adjusting.reason} onChange={(e) => setAdjusting({ ...adjusting, reason: e.target.value })} placeholder="Ex.: contagem de inventário 30/09" />
            </Field>
          </div>
        )}
      </Modal>

      <LossModal draft={loss} onChange={setLoss} onSave={(d) => void saveLoss.run(d)} saving={saveLoss.running} />
    </>
  );

  return {
    canManage,
    modals,
    adjust: (lot: StockLot) => setAdjusting({ lot, balance: lot.balanceQty, reason: '' }),
    toggleBlock: (lot: StockLot) => void block.run(lot),
    registerLoss: openLoss,
  };
}

function LossModal({
  draft,
  onChange,
  onSave,
  saving,
}: {
  draft: LossDraft | null;
  onChange: (d: LossDraft | null) => void;
  onSave: (d: LossDraft) => void;
  saving: boolean;
}) {
  const { options, byProduct } = useProductWithStockOptions();
  const d = draft;
  const avail = d?.lot ? d.lot.balanceQty : d?.productId ? byProduct.get(d.productId)?.qty ?? 0 : 0;
  const unit = d?.lot?.unit || 'KG';
  const over = !!d && !!d.qty && d.qty > avail + 0.0005;
  return (
    <Modal
      open={!!d}
      onClose={() => onChange(null)}
      title="Registrar perda"
      description="Baixa o saldo e registra a perda com origem e motivo (entra no relatório de perdas)."
      footer={
        <>
          <Button variant="ghost" onClick={() => onChange(null)}>
            Cancelar
          </Button>
          <Button variant="danger" loading={saving} disabled={over} onClick={() => d && onSave(d)}>
            Registrar perda
          </Button>
        </>
      }
    >
      {d && (
        <div className="space-y-4">
          {d.lot ? (
            <Callout tone="info" title={d.lot.productName}>
              Lote {d.lot.lotCode || d.lot.batchCode || 'sem código'} · saldo <span className="num">{fmtQty(d.lot.balanceQty, d.lot.unit)}</span>
              {d.lot.expiryDate ? ` · validade ${date(d.lot.expiryDate)}` : ''}
            </Callout>
          ) : (
            <Field label="Produto" required hint="Sem lote escolhido, a perda sai dos lotes mais antigos (FIFO).">
              <Combobox value={d.productId} onChange={(v) => onChange({ ...d, productId: v })} options={options} placeholder="Escolha o corte…" />
            </Field>
          )}
          <FormGrid>
            <Field label="Quantidade perdida" required error={over ? `Maior que o saldo disponível (${kg(avail)}).` : null}>
              <WeightInput unit={unit} value={d.qty} onChange={(v) => onChange({ ...d, qty: v })} autoFocus={!!d.lot} />
            </Field>
            <Field label="Data" required>
              <DateInput value={d.date} max={today()} onChange={(v) => onChange({ ...d, date: v })} />
            </Field>
            <Field label="Origem" required>
              <Select value={d.origin} onChange={(v) => onChange({ ...d, origin: v })} options={optionsOf(LOSS_ORIGIN_LABELS)} />
            </Field>
            <Field label="Motivo" required>
              <Select value={d.reason} onChange={(v) => onChange({ ...d, reason: v })} options={optionsOf(LOSS_REASON_LABELS)} />
            </Field>
            <Field label="Observações" span="full">
              <Textarea value={d.notes} onChange={(e) => onChange({ ...d, notes: e.target.value })} placeholder="Detalhe o que aconteceu (opcional)" />
            </Field>
          </FormGrid>
          {!!d.qty && (d.lot || d.productId) && !over && (
            <p className="text-xs text-muted num">
              Valor estimado da perda: {money(d.qty * (d.lot ? d.lot.unitCost : (byProduct.get(d.productId!)?.value || 0) / Math.max(avail, 0.001)))}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
