/**
 * Incluir item durante a separação: material vendável (sacola), frete ou outro corte.
 */
import { useMemo, useState } from 'react';
import { useSession } from '../../app/session';
import { money, qty as fmtQty } from '../../domain/format';
import type { PriceTable, Product, SupplyItem } from '../../domain/types';
import type { SaleItemInput } from '../../ops/types';
import { Button, Callout, Combobox, Field, FormGrid, Input, Modal, MoneyInput, Segmented, Select, WeightInput } from '../../ui';

type Kind = 'SUPPLY' | 'FREIGHT' | 'PRODUCT';

export function AddItemModal({
  open,
  onClose,
  onAdd,
  supplies,
  products,
  priceTable,
  stockByProduct,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (item: SaleItemInput) => void;
  supplies: SupplyItem[];
  products: Product[];
  priceTable: PriceTable | null;
  stockByProduct: Map<string, number>;
}) {
  const { can } = useSession();
  const canPrice = can('sales.editPrice');
  const sellable = useMemo(() => supplies.filter((s) => s.sellable && s.active).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [supplies]);
  const [kind, setKind] = useState<Kind>('SUPPLY');
  const [supplyId, setSupplyId] = useState('');
  const [productId, setProductId] = useState<string | null>(null);
  const [qty, setQty] = useState<number | null>(1);
  const [price, setPrice] = useState<number | null>(null);
  const [label, setLabel] = useState('Frete');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reset = (k: Kind) => {
    setKind(k);
    setSupplyId('');
    setProductId(null);
    setQty(k === 'PRODUCT' ? null : 1);
    setPrice(null);
    setError(null);
    setNotes('');
  };

  const product = products.find((p) => p.id === productId) || null;
  const tablePrice = (pid: string | null) => {
    if (!pid) return null;
    const it = priceTable?.items.find((i) => i.productId === pid);
    return it?.price ?? products.find((p) => p.id === pid)?.defaultPrice ?? null;
  };
  const productOptions = useMemo(
    () =>
      products
        .filter((p) => p.active && p.meatType !== 'RAW')
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        .map((p) => {
          const bal = stockByProduct.get(p.id) || 0;
          return { value: p.id, label: p.name, description: p.category, right: bal > 0 ? fmtQty(bal, p.unit) : 'sem saldo' };
        }),
    [products, stockByProduct],
  );

  const submit = () => {
    setError(null);
    if (kind === 'SUPPLY') {
      const s = sellable.find((x) => x.id === supplyId);
      if (!s) return setError('Escolha o material.');
      if (!qty || qty <= 0) return setError('Informe a quantidade.');
      const p = price ?? s.salePrice ?? 0;
      onAdd({ kind: 'SUPPLY', supplyItemId: s.id, productName: s.name, unit: s.unit === 'KG' ? 'KG' : 'UN', qtyOrdered: qty, qty, unitPrice: p });
    } else if (kind === 'FREIGHT') {
      if (!price || price <= 0) return setError('Informe o valor do frete.');
      onAdd({ kind: 'FREIGHT', productName: label.trim() || 'Frete', unit: 'UN', qtyOrdered: 1, qty: 1, unitPrice: price });
    } else {
      if (!product) return setError('Escolha o corte.');
      if (!qty || qty <= 0) return setError('Informe o peso/quantidade separado.');
      const p = price ?? tablePrice(product.id);
      if (p === null || p === undefined) return setError('Este corte não tem preço na tabela do pedido. Peça ao comercial para incluir.');
      onAdd({ kind: 'PRODUCT', productId: product.id, productName: product.name, unit: product.unit, qtyOrdered: qty, qty, unitPrice: p, notes: notes.trim() || null });
    }
    reset(kind);
    onClose();
  };

  const s = sellable.find((x) => x.id === supplyId);
  const effectivePrice = kind === 'SUPPLY' ? price ?? s?.salePrice ?? 0 : kind === 'PRODUCT' ? price ?? tablePrice(productId) ?? 0 : price ?? 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Incluir item no pedido"
      description="Sacola personalizada, frete ou um corte que o cliente pediu na hora."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit}>
            Incluir
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Segmented
          value={kind}
          onChange={reset}
          options={[
            { value: 'SUPPLY', label: 'Material' },
            { value: 'FREIGHT', label: 'Frete' },
            { value: 'PRODUCT', label: 'Outro corte' },
          ]}
        />
        {kind === 'SUPPLY' && (
          <FormGrid>
            <Field label="Material vendável" required span="full" hint={!sellable.length ? 'Nenhum material marcado como vendável em Materiais.' : undefined}>
              <Select
                value={supplyId}
                onChange={(v) => {
                  setSupplyId(v);
                  setPrice(null);
                }}
                placeholder="Escolha…"
                options={sellable.map((x) => ({
                  value: x.id,
                  label: `${x.name} · ${x.salePrice != null ? money(x.salePrice) : 'sem preço'} · saldo ${x.quantity}`,
                }))}
              />
            </Field>
            <Field label="Quantidade" required>
              <WeightInput unit="UN" value={qty} onChange={setQty} />
            </Field>
            <Field label="Preço unitário" hint={canPrice ? undefined : 'Preço do cadastro do material.'}>
              <MoneyInput value={effectivePrice} onChange={setPrice} disabled={!canPrice} />
            </Field>
          </FormGrid>
        )}
        {kind === 'FREIGHT' && (
          <FormGrid>
            <Field label="Descrição">
              <Input value={label} onChange={(e) => setLabel(e.target.value)} />
            </Field>
            <Field label="Valor" required>
              <MoneyInput value={price} onChange={setPrice} autoFocus />
            </Field>
          </FormGrid>
        )}
        {kind === 'PRODUCT' && (
          <FormGrid>
            <Field label="Corte" required span="full">
              <Combobox
                value={productId}
                onChange={(v) => {
                  setProductId(v);
                  setPrice(null);
                }}
                options={productOptions}
                placeholder="Escolha o corte…"
              />
            </Field>
            <Field label={product?.unit === 'UN' ? 'Quantidade' : 'Peso separado'} required>
              <WeightInput unit={product?.unit || 'KG'} value={qty} onChange={setQty} />
            </Field>
            <Field label={`Preço por ${product?.unit === 'UN' ? 'un' : 'kg'}`} hint={priceTable ? `Tabela: ${priceTable.name}` : 'Preço padrão do produto'}>
              <MoneyInput value={effectivePrice} onChange={setPrice} disabled={!canPrice} />
            </Field>
            <Field label="Observação" span="full">
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: cliente pediu na retirada" />
            </Field>
          </FormGrid>
        )}
        {!!qty && effectivePrice > 0 && kind !== 'FREIGHT' && <p className="text-sm text-muted num">Subtotal: {money(qty * effectivePrice)}</p>}
        {error && <Callout tone="danger">{error}</Callout>}
      </div>
    </Modal>
  );
}
