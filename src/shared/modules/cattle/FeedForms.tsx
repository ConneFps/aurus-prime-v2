/**
 * Formulários de ração: compra (NF), consumo (baixa) e tipo de ração.
 */
import { useEffect, useMemo, useState } from 'react';
import { useOps } from '../../app/session';
import { useAction, useCrud, useTable } from '../../data/react';
import { date, kg, money, today } from '../../domain/format';
import type { FeedType } from '../../domain/types';
import {
  Button,
  Callout,
  Checkbox,
  Combobox,
  DateInput,
  Drawer,
  Field,
  FormGrid,
  Input,
  MoneyInput,
  Progress,
  Segmented,
  Select,
  Switch,
  Textarea,
  WeightInput,
  type ComboOption,
} from '../../ui';
import { usePartnerOptions } from '../common/lookups';
import { batchLabel, isActiveBatch, prefixed } from './helpers';
import { emptyPayable, PayableFields, toPlan, type PayableDraft } from './PayableFields';

export const PERIOD_LABELS = { DAILY: 'Diário', WEEKLY: 'Semanal', MONTHLY: 'Mensal' } as const;

// ---------------------------------------------------------------------------
// Compra de ração (entrada de NF)
// ---------------------------------------------------------------------------

export function FeedPurchaseDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ops = useOps();
  const { rows: types } = useTable('feed_types');
  const { rows: batches } = useTable('batches');
  const { options: suppliers } = usePartnerOptions(['FEED_SUPPLIER', 'SUPPLIER']);
  const active = useMemo(() => batches.filter(isActiveBatch).sort((a, b) => b.code.localeCompare(a.code)), [batches]);
  const blank = () => ({
    feedTypeId: '',
    supplierId: null as string | null,
    invoiceNumber: '',
    entryDate: today(),
    quantityKg: null as number | null,
    totalValue: null as number | null,
    batchIds: [] as string[],
    notes: '',
    payable: emptyPayable(today()) as PayableDraft,
  });
  const [d, setD] = useState(blank);
  useEffect(() => {
    if (open) setD(blank());
  }, [open]);
  const set = (p: Partial<ReturnType<typeof blank>>) => setD((x) => ({ ...x, ...p }));
  const unit = d.quantityKg && d.totalValue ? d.totalValue / d.quantityKg : 0;

  const save = useAction(
    async () => {
      if (!d.feedTypeId) throw new Error('Selecione o tipo de ração.');
      if (!d.invoiceNumber.trim()) throw new Error('Informe o número da nota fiscal.');
      if (!d.quantityKg || d.quantityKg <= 0) throw new Error('Informe a quantidade (kg).');
      if (d.totalValue === null || d.totalValue < 0) throw new Error('Informe o valor total.');
      return ops.registerFeedPurchase({
        feedTypeId: d.feedTypeId,
        supplierId: d.supplierId,
        invoiceNumber: d.invoiceNumber,
        entryDate: d.entryDate,
        quantityKg: d.quantityKg,
        totalValue: d.totalValue,
        batchIds: d.batchIds,
        notes: d.notes.trim() || null,
        createPayable: toPlan(d.payable),
      });
    },
    { success: 'Compra de ração registrada', onSuccess: onClose },
  );

  const activeTypes = types.filter((t) => t.active);
  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title="Entrada de ração (NF)"
      description="A ração entra no estoque e é baixada nos lotes conforme o consumo."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.running} onClick={() => void save.run()}>
            Registrar compra
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {!activeTypes.length && <Callout tone="warning">Cadastre um tipo de ração antes (aba “Tipos de ração”).</Callout>}
        <FormGrid>
          <Field label="Tipo de ração" required>
            <Select value={d.feedTypeId} onChange={(v) => set({ feedTypeId: v })} placeholder="Selecione…" options={activeTypes.map((t) => ({ value: t.id, label: t.name }))} />
          </Field>
          <Field label="Fornecedor">
            <Combobox value={d.supplierId} onChange={(v) => set({ supplierId: v })} options={suppliers} allowClear placeholder="Opcional" />
          </Field>
          <Field label="Nota fiscal" required>
            <Input value={d.invoiceNumber} onChange={(e) => set({ invoiceNumber: e.target.value })} />
          </Field>
          <Field label="Data de entrada" required>
            <DateInput value={d.entryDate} onChange={(v) => set({ entryDate: v })} />
          </Field>
          <Field label="Quantidade" required hint={d.quantityKg ? `${Math.round((d.quantityKg / 25) * 10) / 10} sacas de 25 kg` : undefined}>
            <WeightInput value={d.quantityKg} onChange={(v) => set({ quantityKg: v })} />
          </Field>
          <Field label="Valor total" required hint={unit ? `${money(unit)}/kg · ${money(unit * 25)}/saca de 25 kg` : undefined}>
            <MoneyInput value={d.totalValue} onChange={(v) => set({ totalValue: v })} />
          </Field>
        </FormGrid>

        <Field label="Lotes autorizados" hint="Nenhum marcado = qualquer lote pode consumir esta compra.">
          {active.length ? (
            <div className="grid sm:grid-cols-2 gap-2 rounded-card border border-border p-3 max-h-56 overflow-y-auto">
              {active.map((b) => (
                <Checkbox
                  key={b.id}
                  checked={d.batchIds.includes(b.id)}
                  onChange={(v) => set({ batchIds: v ? [...d.batchIds, b.id] : d.batchIds.filter((x) => x !== b.id) })}
                  label={batchLabel(b)}
                  description={b.supplierName || undefined}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">Nenhum lote ativo no momento.</p>
          )}
        </Field>
        <Field label="Observações">
          <Textarea value={d.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} />
        </Field>
        <PayableFields value={d.payable} onChange={(payable) => set({ payable })} amount={d.totalValue || 0} issueDate={d.entryDate} />
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Consumo (baixa no lote)
// ---------------------------------------------------------------------------

export function FeedConsumptionDrawer({
  open,
  onClose,
  batchId,
  purchaseId,
}: {
  open: boolean;
  onClose: () => void;
  batchId?: string;
  purchaseId?: string;
}) {
  const ops = useOps();
  const { rows: purchases } = useTable('feed_purchases', { where: [['status', '==', 'AVAILABLE']] });
  const { rows: batches } = useTable('batches');
  const blank = () => ({
    feedPurchaseId: purchaseId || '',
    batchId: batchId || '',
    date: today(),
    quantityKg: null as number | null,
    period: 'WEEKLY' as 'DAILY' | 'WEEKLY' | 'MONTHLY',
    notes: '',
  });
  const [d, setD] = useState(blank);
  useEffect(() => {
    if (open) setD(blank());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, batchId, purchaseId]);
  const set = (p: Partial<ReturnType<typeof blank>>) => setD((x) => ({ ...x, ...p }));

  const activeBatches = useMemo(() => batches.filter(isActiveBatch).sort((a, b) => b.code.localeCompare(a.code)), [batches]);
  const purchase = purchases.find((p) => p.id === d.feedPurchaseId);
  const purchaseOptions = useMemo<ComboOption[]>(
    () =>
      purchases
        .filter((p) => !d.batchId || !p.batchIds?.length || p.batchIds.includes(d.batchId))
        .sort((a, b) => a.entryDate.localeCompare(b.entryDate))
        .map((p) => ({
          value: p.id,
          label: `${p.feedTypeName} · ${prefixed('NF', p.invoiceNumber)}`,
          description: `${date(p.entryDate)} · ${money(p.unitCost)}/kg${p.supplierName ? ` · ${p.supplierName}` : ''}`,
          right: kg(Math.round(p.remainingKg)),
        })),
    [purchases, d.batchId],
  );
  const batchOptions = useMemo<ComboOption[]>(
    () =>
      activeBatches
        .filter((b) => !purchase?.batchIds?.length || purchase.batchIds.includes(b.id))
        .map((b) => ({ value: b.id, label: batchLabel(b), description: b.supplierName || undefined })),
    [activeBatches, purchase],
  );
  const over = purchase && d.quantityKg ? d.quantityKg > purchase.remainingKg + 0.0005 : false;

  const save = useAction(
    async () => {
      if (!d.feedPurchaseId) throw new Error('Selecione a compra (NF) de onde sai a ração.');
      if (!d.batchId) throw new Error('Selecione o lote.');
      if (!d.quantityKg || d.quantityKg <= 0) throw new Error('Informe a quantidade consumida.');
      if (over) throw new Error(`Saldo insuficiente: restam ${kg(purchase!.remainingKg)} nesta compra.`);
      await ops.registerFeedConsumption({ feedPurchaseId: d.feedPurchaseId, batchId: d.batchId, date: d.date, quantityKg: d.quantityKg, period: d.period, notes: d.notes.trim() || null });
    },
    { success: 'Consumo registrado e custo lançado no lote', onSuccess: onClose },
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Registrar consumo de ração"
      description="Baixa do estoque de ração e lança o custo (R$/kg da NF) no lote."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.running} onClick={() => void save.run()}>
            Registrar consumo
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {!purchases.length && <Callout tone="warning">Não há ração em estoque. Registre uma entrada de NF primeiro.</Callout>}
        <FormGrid cols={1}>
          <Field label="Lote" required>
            {batchId ? (
              <Input value={batchOptions.find((o) => o.value === batchId)?.label || activeBatches.find((b) => b.id === batchId)?.name || ''} disabled />
            ) : (
              <Combobox value={d.batchId || null} onChange={(v) => set({ batchId: v || '' })} options={batchOptions} placeholder="Selecione o lote em engorda…" />
            )}
          </Field>
          <Field label="Compra (NF)" required>
            <Combobox value={d.feedPurchaseId || null} onChange={(v) => set({ feedPurchaseId: v || '' })} options={purchaseOptions} placeholder="De qual nota sai a ração…" emptyText="Nenhuma compra com saldo liberada para este lote" />
          </Field>
        </FormGrid>
        {purchase && (
          <div className="rounded-control bg-surface-2/60 border border-border p-3 space-y-2">
            <div className="flex justify-between text-xs text-muted">
              <span>Saldo · {prefixed('NF', purchase.invoiceNumber)}</span>
              <span className="num">
                {kg(Math.round(purchase.remainingKg))} de {kg(Math.round(purchase.quantityKg))}
              </span>
            </div>
            <Progress value={purchase.remainingKg} max={purchase.quantityKg} tone={purchase.remainingKg / purchase.quantityKg < 0.15 ? 'warning' : 'success'} />
          </div>
        )}
        <FormGrid>
          <Field label="Quantidade" required error={over ? `Máximo ${kg(purchase!.remainingKg)}` : undefined}>
            <WeightInput value={d.quantityKg} onChange={(v) => set({ quantityKg: v })} />
          </Field>
          <Field label="Data" required>
            <DateInput value={d.date} onChange={(v) => set({ date: v })} />
          </Field>
        </FormGrid>
        <Field label="Período do consumo">
          <Segmented
            value={d.period}
            onChange={(period) => set({ period })}
            options={[
              { value: 'WEEKLY', label: 'Semanal' },
              { value: 'MONTHLY', label: 'Mensal' },
              { value: 'DAILY', label: 'Diário' },
            ]}
          />
        </Field>
        {purchase && d.quantityKg ? (
          <p className="text-sm text-muted num">
            Custo lançado no lote: <span className="text-fg font-semibold">{money(d.quantityKg * purchase.unitCost)}</span> ({money(purchase.unitCost)}/kg)
          </p>
        ) : null}
        <Field label="Observações">
          <Textarea value={d.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} />
        </Field>
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Tipo de ração (cadastro simples)
// ---------------------------------------------------------------------------

export function FeedTypeDrawer({ open, onClose, type }: { open: boolean; onClose: () => void; type: FeedType | null }) {
  const crud = useCrud('feed_types');
  const [d, setD] = useState({ name: '', description: '', active: true });
  useEffect(() => {
    if (open) setD({ name: type?.name || '', description: type?.description || '', active: type?.active ?? true });
  }, [open, type]);
  const save = useAction(
    async () => {
      if (!d.name.trim()) throw new Error('Informe o nome da ração.');
      const data = { name: d.name.trim(), description: d.description.trim() || null, active: d.active };
      if (type) await crud.update(type.id, data);
      else await crud.insert(data);
    },
    { success: 'Tipo de ração salvo', onSuccess: onClose },
  );
  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="sm"
      title={type ? 'Editar tipo de ração' : 'Novo tipo de ração'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.running} onClick={() => void save.run()}>
            Salvar
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save.run();
        }}
      >
        <Field label="Nome" required>
          <Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Ex.: Proteinado 40%" autoFocus />
        </Field>
        <Field label="Descrição / fórmula">
          <Textarea value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
        </Field>
        <Switch checked={d.active} onChange={(v) => setD({ ...d, active: v })} label="Ativo" description="Inativos não aparecem na entrada de NF." />
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
}
