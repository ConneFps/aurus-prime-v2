/**
 * Cadastro de material (useCrud) e movimentação (ops.registerSupplyMovement).
 */
import { useState } from 'react';
import { useOps } from '../../app/session';
import { useAction, useCrud } from '../../data/react';
import { money, number, today } from '../../domain/format';
import type { SupplyItem } from '../../domain/types';
import { Button, Callout, DateInput, Drawer, Field, FormGrid, FormSection, Input, Modal, MoneyInput, NumberInput, Segmented, Select, Switch, Textarea } from '../../ui';

export const SUPPLY_CATEGORY_LABELS: Record<SupplyItem['category'], string> = {
  EMBALAGEM: 'Embalagem',
  ETIQUETA: 'Etiqueta',
  LIMPEZA: 'Limpeza',
  ESCRITORIO: 'Escritório',
  OUTRO: 'Outro',
};

export const SUPPLY_UNIT_LABELS: Record<SupplyItem['unit'], string> = {
  UN: 'Unidade (UN)',
  CX: 'Caixa (CX)',
  PCT: 'Pacote (PCT)',
  KG: 'Quilo (KG)',
  L: 'Litro (L)',
};

export const supplyQty = (q: number | null | undefined, unit: SupplyItem['unit']) => `${number(q || 0, 3)} ${unit.toLowerCase()}`;

export type SupplyDraft = Omit<SupplyItem, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; initialQty?: number | null };

export const EMPTY_SUPPLY: SupplyDraft = {
  name: '',
  sku: '',
  category: 'EMBALAGEM',
  unit: 'UN',
  quantity: 0,
  minQuantity: null,
  unitCost: null,
  salePrice: null,
  supplier: '',
  sellable: false,
  active: true,
  notes: '',
  initialQty: null,
};

export function SupplyDrawer({ draft, onChange, onClose }: { draft: SupplyDraft | null; onChange: (d: SupplyDraft) => void; onClose: () => void }) {
  const crud = useCrud('supply_items');
  const ops = useOps();
  const save = useAction(
    async (d: SupplyDraft) => {
      if (!d.name.trim()) throw new Error('Informe o nome do material.');
      if (d.sellable && (d.salePrice === null || d.salePrice === undefined)) throw new Error('Material vendável precisa de preço de venda.');
      const { id, initialQty, quantity: _q, ...data } = d;
      const clean = { ...data, name: d.name.trim(), sku: d.sku?.trim() || null, supplier: d.supplier?.trim() || null, notes: d.notes?.trim() || null };
      if (id) await crud.update(id, clean);
      else {
        const row = await crud.insert({ ...clean, quantity: 0 });
        if (initialQty && initialQty > 0)
          await ops.registerSupplyMovement({
            supplyItemId: row.id,
            type: 'IN',
            quantity: initialQty,
            unitCost: d.unitCost ?? null,
            date: today(),
            reason: 'Estoque inicial',
            supplier: clean.supplier,
          });
      }
    },
    { success: 'Material salvo', onSuccess: onClose },
  );
  const d = draft;
  return (
    <Drawer
      open={!!d}
      onClose={onClose}
      title={d?.id ? 'Editar material' : 'Novo material'}
      description="Embalagens, etiquetas, sacolas e insumos da expedição."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.running} onClick={() => d && void save.run(d)}>
            Salvar
          </Button>
        </>
      }
    >
      {d && (
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            void save.run(d);
          }}
        >
          <FormSection title="Identificação">
            <FormGrid>
              <Field label="Nome" required span="full">
                <Input value={d.name} onChange={(e) => onChange({ ...d, name: e.target.value })} placeholder="Ex.: Sacola térmica personalizada" autoFocus />
              </Field>
              <Field label="Código / SKU">
                <Input value={d.sku || ''} onChange={(e) => onChange({ ...d, sku: e.target.value })} placeholder="Ex.: SAC-PERS-01" />
              </Field>
              <Field label="Categoria">
                <Select value={d.category} onChange={(v) => onChange({ ...d, category: v })} options={Object.entries(SUPPLY_CATEGORY_LABELS).map(([value, label]) => ({ value: value as SupplyItem['category'], label }))} />
              </Field>
              <Field label="Unidade">
                <Select value={d.unit} onChange={(v) => onChange({ ...d, unit: v })} options={Object.entries(SUPPLY_UNIT_LABELS).map(([value, label]) => ({ value: value as SupplyItem['unit'], label }))} />
              </Field>
              <Field label="Fornecedor principal">
                <Input value={d.supplier || ''} onChange={(e) => onChange({ ...d, supplier: e.target.value })} />
              </Field>
            </FormGrid>
          </FormSection>
          <FormSection title="Estoque e valores">
            <FormGrid>
              <Field label="Estoque mínimo" hint="Abaixo disso aparece o alerta.">
                <NumberInput decimals={3} value={d.minQuantity} onChange={(v) => onChange({ ...d, minQuantity: v })} suffix={d.unit.toLowerCase()} />
              </Field>
              <Field label="Custo unitário" hint={d.id ? 'Entradas com custo recalculam o custo médio.' : undefined}>
                <MoneyInput value={d.unitCost} onChange={(v) => onChange({ ...d, unitCost: v })} />
              </Field>
              {!d.id && (
                <Field label="Estoque inicial" hint="Opcional — vira uma entrada no histórico.">
                  <NumberInput decimals={3} value={d.initialQty} onChange={(v) => onChange({ ...d, initialQty: v })} suffix={d.unit.toLowerCase()} />
                </Field>
              )}
              {d.id && (
                <Field label="Saldo atual" hint="Para mudar, use Entrada, Saída ou Ajuste.">
                  <Input value={supplyQty(d.quantity, d.unit)} disabled />
                </Field>
              )}
            </FormGrid>
            <Switch
              checked={d.sellable}
              onChange={(v) => onChange({ ...d, sellable: v })}
              label="Vendável no pedido"
              description="Aparece para incluir no pedido/separação (ex.: sacola personalizada) e baixa automaticamente."
            />
            {d.sellable && (
              <Field label="Preço de venda" required>
                <MoneyInput value={d.salePrice} onChange={(v) => onChange({ ...d, salePrice: v })} />
              </Field>
            )}
          </FormSection>
          <Field label="Observações">
            <Textarea value={d.notes || ''} onChange={(e) => onChange({ ...d, notes: e.target.value })} />
          </Field>
          <Switch checked={d.active} onChange={(v) => onChange({ ...d, active: v })} label="Ativo" description="Inativos saem das listas de seleção." />
          <button type="submit" hidden />
        </form>
      )}
    </Drawer>
  );
}

export interface MoveDraft {
  item: SupplyItem;
  type: 'IN' | 'OUT' | 'ADJUST';
  quantity: number | null;
  unitCost: number | null;
  date: string;
  reason: string;
  invoiceNumber: string;
  supplier: string;
}

export function SupplyMovementModal({ draft, onChange, onClose }: { draft: MoveDraft | null; onChange: (d: MoveDraft) => void; onClose: () => void }) {
  const ops = useOps();
  const save = useAction(
    async (d: MoveDraft) => {
      if (d.quantity === null || (d.type !== 'ADJUST' && d.quantity <= 0)) throw new Error(d.type === 'ADJUST' ? 'Informe o novo saldo.' : 'Informe a quantidade.');
      if (d.type === 'ADJUST' && !d.reason.trim()) throw new Error('Informe o motivo do ajuste.');
      await ops.registerSupplyMovement({
        supplyItemId: d.item.id,
        type: d.type,
        quantity: d.quantity,
        unitCost: d.type === 'IN' ? d.unitCost : null,
        date: d.date,
        reason: d.reason.trim() || null,
        invoiceNumber: d.type === 'IN' ? d.invoiceNumber.trim() || null : null,
        supplier: d.type === 'IN' ? d.supplier.trim() || null : null,
      });
    },
    { success: 'Movimentação registrada', onSuccess: onClose },
  );
  const d = draft;
  const after = d && d.quantity !== null ? (d.type === 'IN' ? d.item.quantity + d.quantity : d.type === 'OUT' ? d.item.quantity - d.quantity : d.quantity) : null;
  return (
    <Modal
      open={!!d}
      onClose={onClose}
      title={d ? d.item.name : ''}
      description={d ? `Saldo atual: ${supplyQty(d.item.quantity, d.item.unit)}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.running} disabled={after !== null && after < 0} onClick={() => d && void save.run(d)}>
            Registrar
          </Button>
        </>
      }
    >
      {d && (
        <div className="space-y-4">
          <Segmented
            value={d.type}
            onChange={(v) => onChange({ ...d, type: v, quantity: v === 'ADJUST' ? d.item.quantity : null })}
            options={[
              { value: 'IN', label: 'Entrada' },
              { value: 'OUT', label: 'Saída' },
              { value: 'ADJUST', label: 'Ajuste' },
            ]}
          />
          <FormGrid>
            <Field label={d.type === 'ADJUST' ? 'Novo saldo (contado)' : 'Quantidade'} required>
              <NumberInput decimals={3} value={d.quantity} onChange={(v) => onChange({ ...d, quantity: v })} suffix={d.item.unit.toLowerCase()} autoFocus />
            </Field>
            <Field label="Data" required>
              <DateInput value={d.date} onChange={(v) => onChange({ ...d, date: v })} />
            </Field>
            {d.type === 'IN' && (
              <>
                <Field label="Custo unitário" hint={d.item.unitCost != null ? `Atual: ${money(d.item.unitCost)}` : undefined}>
                  <MoneyInput value={d.unitCost} onChange={(v) => onChange({ ...d, unitCost: v })} />
                </Field>
                <Field label="Nota fiscal">
                  <Input value={d.invoiceNumber} onChange={(e) => onChange({ ...d, invoiceNumber: e.target.value })} placeholder="Nº da NF" />
                </Field>
                <Field label="Fornecedor" span="full">
                  <Input value={d.supplier} onChange={(e) => onChange({ ...d, supplier: e.target.value })} />
                </Field>
              </>
            )}
            <Field label={d.type === 'ADJUST' ? 'Motivo' : 'Motivo / observação'} required={d.type === 'ADJUST'} span="full">
              <Input
                value={d.reason}
                onChange={(e) => onChange({ ...d, reason: e.target.value })}
                placeholder={d.type === 'OUT' ? 'Ex.: uso na expedição, avaria, amostra' : d.type === 'ADJUST' ? 'Ex.: contagem física' : 'Ex.: compra mensal'}
              />
            </Field>
          </FormGrid>
          {after !== null && (
            <Callout tone={after < 0 ? 'danger' : 'info'}>
              Saldo depois: <strong className="num">{supplyQty(after, d.item.unit)}</strong>
              {after < 0 ? ' — maior que o disponível.' : d.item.minQuantity && after < d.item.minQuantity ? ' — abaixo do mínimo.' : ''}
            </Callout>
          )}
        </div>
      )}
    </Modal>
  );
}
