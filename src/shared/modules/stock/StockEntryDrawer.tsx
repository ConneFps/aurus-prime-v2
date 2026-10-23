/**
 * Entrada manual / intercompany no estoque de venda (ops.addStockEntry).
 */
import { useMemo, useState } from 'react';
import { useOps } from '../../app/session';
import { useAction, useTable } from '../../data/react';
import { addDays, date, money, qty as fmtQty, today } from '../../domain/format';
import { COMPANY_LABELS, optionsOf } from '../../domain/labels';
import type { CompanyCode, StockOrigin } from '../../domain/types';
import { Button, Callout, Combobox, DateInput, Drawer, Field, FormGrid, FormSection, Input, MoneyInput, Segmented, Select, Textarea, WeightInput } from '../../ui';
import { useBatchOptions, useProductOptions } from '../common/lookups';

interface Draft {
  productId: string | null;
  qty: number | null;
  unitCost: number | null;
  entryDate: string;
  expiryDate: string;
  origin: StockOrigin;
  originCompany: CompanyCode | '';
  originInvoice: string;
  lotCode: string;
  batchId: string | null;
  location: string;
  notes: string;
}

const EMPTY = (): Draft => ({
  productId: null,
  qty: null,
  unitCost: null,
  entryDate: today(),
  expiryDate: '',
  origin: 'PROPRIO',
  originCompany: '',
  originInvoice: '',
  lotCode: '',
  batchId: null,
  location: '',
  notes: '',
});

export function StockEntryDrawer({ open, onClose, initialProductId }: { open: boolean; onClose: () => void; initialProductId?: string | null }) {
  const ops = useOps();
  const [d, setD] = useState<Draft>(() => ({ ...EMPTY(), productId: initialProductId || null }));
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setD({ ...EMPTY(), productId: initialProductId || null });
  }
  const { options, products } = useProductOptions({ onlyActive: true });
  const { options: batchOptions } = useBatchOptions();
  const { rows: lots } = useTable('stock_lots', { where: [['stage', '==', 'FINISHED']] }, { enabled: open });
  const product = products.find((p) => p.id === d.productId) || null;

  const lastLot = useMemo(
    () => (d.productId ? lots.filter((l) => l.productId === d.productId).sort((a, b) => b.entryDate.localeCompare(a.entryDate))[0] : undefined),
    [lots, d.productId],
  );
  const autoExpiry = product?.shelfLifeDays ? addDays(d.entryDate || today(), product.shelfLifeDays) : null;

  const save = useAction(
    async (v: Draft) => {
      if (!v.productId) throw new Error('Escolha o produto.');
      if (!v.qty || v.qty <= 0) throw new Error('Informe a quantidade.');
      if (v.unitCost === null || v.unitCost < 0) throw new Error('Informe o custo unitário (pode ser zero).');
      if (v.origin === 'INTERCOMPANY' && !v.originCompany) throw new Error('Informe a empresa de origem.');
      if (v.expiryDate && v.expiryDate < v.entryDate) throw new Error('A validade não pode ser antes da entrada.');
      return ops.addStockEntry({
        productId: v.productId,
        stage: 'FINISHED',
        qty: v.qty,
        unitCost: v.unitCost,
        entryDate: v.entryDate,
        expiryDate: v.expiryDate || null,
        origin: v.origin,
        originCompany: v.origin === 'INTERCOMPANY' ? (v.originCompany as CompanyCode) : null,
        originInvoice: v.originInvoice.trim() || null,
        lotCode: v.lotCode.trim() || null,
        batchId: v.batchId,
        location: v.location.trim() || null,
        notes: v.notes.trim() || null,
      });
    },
    { success: 'Entrada registrada no estoque', onSuccess: onClose },
  );

  const unit = product?.unit || 'KG';
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Entrada no estoque de venda"
      description="Entrada manual, ajuste de produção ou mercadoria recebida de outra empresa do grupo."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.running} onClick={() => void save.run(d)}>
            Registrar entrada
          </Button>
        </>
      }
    >
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          void save.run(d);
        }}
      >
        <FormSection title="Origem">
          <Segmented
            value={d.origin}
            onChange={(v) => setD({ ...d, origin: v })}
            options={[
              { value: 'PROPRIO', label: 'Próprio' },
              { value: 'INTERCOMPANY', label: 'Intercompany' },
            ]}
          />
          {d.origin === 'INTERCOMPANY' && (
            <FormGrid>
              <Field label="Empresa de origem" required>
                <Select
                  value={d.originCompany}
                  onChange={(v) => setD({ ...d, originCompany: v })}
                  placeholder="Escolha…"
                  options={optionsOf(COMPANY_LABELS)}
                />
              </Field>
              <Field label="NF de transferência">
                <Input value={d.originInvoice} onChange={(e) => setD({ ...d, originInvoice: e.target.value })} inputMode="numeric" placeholder="Nº da nota" />
              </Field>
            </FormGrid>
          )}
          {d.origin === 'INTERCOMPANY' && (
            <p className="text-xs text-muted">Estoque intercompany só atende pedidos intercompany (e vice-versa).</p>
          )}
        </FormSection>

        <FormSection title="Produto e quantidade">
          <FormGrid>
            <Field label="Produto (corte)" required span="full">
              <Combobox value={d.productId} onChange={(v) => setD({ ...d, productId: v })} options={options} placeholder="Escolha o corte…" />
            </Field>
            <Field label="Quantidade" required>
              <WeightInput unit={unit} value={d.qty} onChange={(v) => setD({ ...d, qty: v })} />
            </Field>
            <Field
              label={`Custo por ${unit === 'KG' ? 'kg' : 'unidade'}`}
              required
              hint={lastLot ? `Última entrada: ${money(lastLot.unitCost)} em ${date(lastLot.entryDate)}` : undefined}
            >
              <MoneyInput value={d.unitCost} onChange={(v) => setD({ ...d, unitCost: v })} />
            </Field>
            {!!d.qty && d.unitCost !== null && (
              <p className="col-span-full text-xs text-muted num -mt-2">
                Total a custo: {money(d.qty * d.unitCost)} · {fmtQty(d.qty, unit)}
              </p>
            )}
          </FormGrid>
        </FormSection>

        <FormSection title="Lote e validade">
          <FormGrid>
            <Field label="Data de entrada" required>
              <DateInput value={d.entryDate} onChange={(v) => setD({ ...d, entryDate: v })} />
            </Field>
            <Field label="Validade" hint={!d.expiryDate && autoExpiry ? `Vazio = ${date(autoExpiry)} (vida útil de ${product?.shelfLifeDays} dias)` : undefined}>
              <DateInput value={d.expiryDate} min={d.entryDate} onChange={(v) => setD({ ...d, expiryDate: v })} />
            </Field>
            <Field label="Código do lote" hint="Código da etiqueta/caixa (rastreabilidade).">
              <Input value={d.lotCode} onChange={(e) => setD({ ...d, lotCode: e.target.value })} placeholder="Ex.: 2609-PIC-01" />
            </Field>
            <Field label="Lote de gado de origem">
              <Combobox value={d.batchId} onChange={(v) => setD({ ...d, batchId: v })} options={batchOptions} allowClear placeholder="Opcional" />
            </Field>
            <Field label="Local (câmara/prateleira)">
              <Input value={d.location} onChange={(e) => setD({ ...d, location: e.target.value })} placeholder="Ex.: Câmara 2" />
            </Field>
            <Field label="Observações" span="full">
              <Textarea value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} />
            </Field>
          </FormGrid>
          {!product?.shelfLifeDays && !d.expiryDate && d.productId && (
            <Callout tone="warning">Este produto não tem vida útil cadastrada — informe a validade para os alertas funcionarem.</Callout>
          )}
        </FormSection>
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
}
