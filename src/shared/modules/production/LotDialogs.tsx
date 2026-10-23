/**
 * Diálogos de lote de estoque: registrar perda e ajustar saldo.
 */
import { useEffect, useState } from 'react';
import { useOps } from '../../app/session';
import { useAction } from '../../data/react';
import { kg, money, round3, today } from '../../domain/format';
import { LOSS_ORIGIN_LABELS, LOSS_REASON_LABELS, optionsOf } from '../../domain/labels';
import type { LossOrigin, LossReason, StockLot } from '../../domain/types';
import { Button, Callout, DateInput, Field, FormGrid, Input, Modal, Select, Textarea, WeightInput } from '../../ui';
import { Metric } from './shared';

function LotHeader({ lot }: { lot: StockLot }) {
  return (
    <div className="rounded-control bg-surface-2 px-3 py-2.5 mb-4 flex items-center justify-between gap-3 text-sm">
      <div className="min-w-0">
        <div className="font-medium text-fg truncate">{lot.productName}</div>
        <div className="text-xs text-muted truncate">
          {lot.lotCode || 'sem código'}
          {lot.batchCode ? ` · lote ${lot.batchCode}` : ''}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="num font-semibold text-fg">{kg(lot.balanceQty)}</div>
        <div className="text-[11px] text-subtle">saldo atual</div>
      </div>
    </div>
  );
}

export function LossModal({ lot, onClose, defaultOrigin = 'ESTOQUE' }: { lot: StockLot | null; onClose: () => void; defaultOrigin?: LossOrigin }) {
  const ops = useOps();
  const [qty, setQty] = useState<number | null>(null);
  const [reason, setReason] = useState<LossReason>('AVARIA');
  const [origin, setOrigin] = useState<LossOrigin>(defaultOrigin);
  const [day, setDay] = useState(today());
  const [notes, setNotes] = useState('');
  useEffect(() => {
    if (!lot) return;
    setQty(null);
    setReason('AVARIA');
    setOrigin(defaultOrigin);
    setDay(today());
    setNotes('');
  }, [lot, defaultOrigin]);

  const over = !!lot && (qty || 0) > lot.balanceQty + 0.0005;
  const save = useAction(
    async () => {
      if (!lot) return;
      if (!qty || qty <= 0) throw new Error('Informe a quantidade perdida.');
      if (over) throw new Error(`A perda passa do saldo do lote (${kg(lot.balanceQty)}).`);
      await ops.registerLoss({ lotId: lot.id, stage: lot.stage, qty: round3(qty), origin, reason, date: day, notes: notes.trim() || null });
    },
    { success: 'Perda registrada', onSuccess: onClose },
  );

  return (
    <Modal
      open={!!lot}
      onClose={onClose}
      title="Registrar perda"
      description="Baixa o peso perdido do lote e registra o prejuízo."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" loading={save.running} disabled={over} onClick={() => void save.run()}>
            Registrar perda
          </Button>
        </>
      }
    >
      {lot && (
        <>
          <LotHeader lot={lot} />
          <FormGrid>
            <Field label="Quantidade perdida" required error={over ? `Máximo ${kg(lot.balanceQty)}` : null}>
              <WeightInput value={qty} onChange={setQty} unit={lot.unit} autoFocus />
            </Field>
            <Field label="Data">
              <DateInput value={day} onChange={setDay} />
            </Field>
            <Field label="Motivo" required>
              <Select value={reason} onChange={setReason} options={optionsOf(LOSS_REASON_LABELS)} />
            </Field>
            <Field label="Origem">
              <Select value={origin} onChange={setOrigin} options={optionsOf(LOSS_ORIGIN_LABELS)} />
            </Field>
            <Field label="Observações" span="full">
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="O que aconteceu?" />
            </Field>
          </FormGrid>
          <div className="grid grid-cols-2 gap-2.5 mt-4">
            <Metric label="Saldo após a perda" value={kg(Math.max(0, lot.balanceQty - (qty || 0)))} />
            <Metric label="Valor perdido" value={money((qty || 0) * lot.unitCost)} tone={(qty || 0) > 0 ? 'danger' : undefined} />
          </div>
        </>
      )}
    </Modal>
  );
}

export function AdjustModal({ lot, onClose }: { lot: StockLot | null; onClose: () => void }) {
  const ops = useOps();
  const [balance, setBalance] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (!lot) return;
    setBalance(lot.balanceQty);
    setReason('');
  }, [lot]);

  const delta = lot ? round3((balance ?? 0) - lot.balanceQty) : 0;
  const save = useAction(
    async () => {
      if (!lot) return;
      if (balance == null || balance < 0) throw new Error('Informe o novo saldo (zero ou mais).');
      if (Math.abs(delta) < 0.0005) throw new Error('O saldo informado é igual ao atual.');
      if (!reason.trim()) throw new Error('Informe o motivo do ajuste.');
      await ops.adjustLot(lot.id, round3(balance), reason.trim());
    },
    { success: 'Saldo ajustado', onSuccess: onClose },
  );

  return (
    <Modal
      open={!!lot}
      onClose={onClose}
      title="Ajustar saldo"
      description="Use para corrigir o peso após uma nova pesagem ou conferência."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.running} onClick={() => void save.run()}>
            Salvar ajuste
          </Button>
        </>
      }
    >
      {lot && (
        <>
          <LotHeader lot={lot} />
          <FormGrid>
            <Field label="Novo saldo" required>
              <WeightInput value={balance} onChange={setBalance} unit={lot.unit} autoFocus />
            </Field>
            <Field label="Diferença">
              <Input readOnly value={`${delta > 0 ? '+' : ''}${kg(delta)}`} className="num" />
            </Field>
            <Field label="Motivo" required span="full">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: repesagem na câmara fria" />
            </Field>
          </FormGrid>
          {delta < -0.0005 && (
            <Callout tone="info" className="mt-4">
              Para quebras, avarias ou descartes prefira <strong>Registrar perda</strong> — assim o prejuízo aparece nos relatórios.
            </Callout>
          )}
        </>
      )}
    </Modal>
  );
}
