/**
 * Etapa 2 — itens do pedido (produtos com saldo + materiais vendáveis).
 */
import { AlertTriangle, PackagePlus, ShoppingBag, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { date, kg, money, qty } from '../../../domain/format';
import type { PriceTable, Product, StockLot, SupplyItem } from '../../../domain/types';
import { Badge, Button, cn, Combobox, EmptyState, IconButton, Input, MoneyInput, Select, WeightInput, type ComboOption } from '../../../ui';
import { lineTotal } from '../helpers';
import { newKey, type Line } from './draft';
import { Section } from './Section';

export function priceFor(table: PriceTable | null, product: Product | undefined): number | null {
  if (!product) return null;
  const it = table?.items.find((i) => i.productId === product.id);
  if (it) return it.price;
  return product.defaultPrice ?? null;
}

export function ItemsSection({
  lines,
  setLines,
  productOptions,
  products,
  byProduct,
  lots,
  supplies,
  table,
  canEditPrice,
  notesRequired,
  focusKey,
  onAdded,
  errors,
}: {
  lines: Line[];
  setLines: (fn: (l: Line[]) => Line[]) => void;
  productOptions: ComboOption[];
  products: Product[];
  byProduct: Map<string, { qty: number; value: number; lots: number }>;
  lots: StockLot[];
  supplies: SupplyItem[];
  table: PriceTable | null;
  canEditPrice: boolean;
  notesRequired: boolean;
  focusKey: string | null;
  onAdded: (key: string) => void;
  errors: Record<string, string>;
}) {
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // Produtos da tabela aparecem primeiro na busca.
  const options = useMemo(() => {
    if (!table) return productOptions;
    const inTable = new Map(table.items.map((i) => [i.productId, i.price]));
    return productOptions
      .map((o) => (inTable.has(o.value) ? { ...o, description: `${o.description || ''} · ${money(inTable.get(o.value))}/${productMap.get(o.value)?.unit === 'UN' ? 'un' : 'kg'}` } : o))
      .sort((a, b) => Number(inTable.has(b.value)) - Number(inTable.has(a.value)));
  }, [productOptions, table, productMap]);

  const addProduct = (id: string | null) => {
    const p = id ? productMap.get(id) : undefined;
    if (!p) return;
    const price = priceFor(table, p);
    const key = newKey();
    setLines((ls) => [
      ...ls,
      { key, kind: 'PRODUCT', productId: p.id, productName: p.name, unit: p.unit, qtyOrdered: 0, unitPrice: price ?? 0, refPrice: price },
    ]);
    onAdded(key);
  };

  const addSupply = (s: SupplyItem) => {
    const existing = lines.find((l) => l.kind === 'SUPPLY' && l.supplyItemId === s.id);
    if (existing) {
      setLines((ls) => ls.map((l) => (l.key === existing.key ? { ...l, qtyOrdered: (l.qtyOrdered || 0) + 1 } : l)));
      return;
    }
    const key = newKey();
    setLines((ls) => [
      ...ls,
      {
        key,
        kind: 'SUPPLY',
        supplyItemId: s.id,
        productName: s.name,
        unit: s.unit === 'KG' ? 'KG' : 'UN',
        qtyOrdered: 1,
        unitPrice: s.salePrice ?? 0,
        refPrice: s.salePrice ?? null,
      },
    ]);
  };

  const update = (key: string, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const remove = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));

  return (
    <Section step={2} title="Itens" subtitle="Busque o corte — o saldo em estoque aparece à direita.">
      <Combobox
        value={null}
        onChange={(v) => addProduct(v)}
        options={options}
        placeholder="+ Adicionar produto…"
        searchPlaceholder="Nome, categoria ou código do corte…"
      />

      {supplies.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {supplies.map((s) => (
            <Button key={s.id} size="xs" variant="subtle" icon={<ShoppingBag className="size-3.5" />} onClick={() => addSupply(s)}>
              {s.name}
              {s.salePrice ? <span className="text-muted num">· {money(s.salePrice)}</span> : null}
            </Button>
          ))}
        </div>
      )}

      {errors.items && <p className="text-xs text-danger">{errors.items}</p>}

      {lines.length === 0 ? (
        <EmptyState
          className="py-8 rounded-card border border-dashed border-border-strong"
          icon={<PackagePlus className="size-5" />}
          title="Nenhum item ainda"
          description="Use a busca acima para incluir os cortes do pedido."
        />
      ) : (
        <ul className="space-y-2">
          {lines.map((l, idx) => (
            <LineRow
              key={l.key}
              index={idx}
              line={l}
              product={l.productId ? productMap.get(l.productId) : undefined}
              stock={l.productId ? byProduct.get(l.productId)?.qty ?? 0 : null}
              lots={l.productId ? lots.filter((x) => x.productId === l.productId && x.status === 'AVAILABLE' && x.balanceQty > 0) : []}
              canEditPrice={canEditPrice}
              notesRequired={notesRequired && l.kind === 'PRODUCT'}
              autoFocus={focusKey === l.key}
              error={errors[l.key]}
              onChange={(p) => update(l.key, p)}
              onRemove={() => remove(l.key)}
            />
          ))}
        </ul>
      )}
    </Section>
  );
}

function LineRow({
  index,
  line: l,
  product,
  stock,
  lots,
  canEditPrice,
  notesRequired,
  autoFocus,
  error,
  onChange,
  onRemove,
}: {
  index: number;
  line: Line;
  product?: Product;
  stock: number | null;
  lots: StockLot[];
  canEditPrice: boolean;
  notesRequired: boolean;
  autoFocus: boolean;
  error?: string;
  onChange: (p: Partial<Line>) => void;
  onRemove: () => void;
}) {
  const priceLocked = !canEditPrice && (l.refPrice ?? 0) > 0;
  const overStock = stock !== null && l.kind === 'PRODUCT' && (l.qtyOrdered || 0) > stock + 0.0005;
  const priceDiff = l.refPrice != null && Math.abs((l.unitPrice || 0) - l.refPrice) > 0.005;
  const sortedLots = [...lots].sort((a, b) => (a.expiryDate || '9999').localeCompare(b.expiryDate || '9999'));

  return (
    <li className={cn('rounded-card border p-3 bg-surface', error ? 'border-danger/60' : 'border-border')}>
      <div className="grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_120px_136px_124px_auto] gap-2 items-start">
        <div className="col-span-2 sm:col-span-1 min-w-0 pt-0.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs text-subtle num w-4 shrink-0">{index + 1}</span>
            <span className="font-medium text-fg truncate">{l.productName}</span>
            {l.kind === 'SUPPLY' && (
              <Badge size="xs" tone="neutral">
                Material
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted ml-6 mt-0.5 flex flex-wrap gap-x-2">
            {product?.category && <span>{product.category}</span>}
            {stock !== null && l.kind === 'PRODUCT' && (
              <span className={cn('num', stock <= 0 ? 'text-danger' : overStock ? 'text-warning' : 'text-muted')}>
                saldo {qty(stock, l.unit)}
              </span>
            )}
          </div>
        </div>
        <div>
          <WeightInput
            unit={l.unit}
            value={l.qtyOrdered || null}
            onChange={(v) => onChange({ qtyOrdered: v ?? 0 })}
            autoFocus={autoFocus}
            aria-label="Quantidade"
            placeholder={l.unit === 'KG' ? '0,000' : '0'}
          />
        </div>
        <div>
          <MoneyInput value={l.unitPrice} onChange={(v) => onChange({ unitPrice: v ?? 0 })} disabled={priceLocked} aria-label="Preço unitário" />
          {priceDiff && (
            <div className="text-[11px] text-muted mt-0.5 num">
              tabela {money(l.refPrice)}{' '}
              <button type="button" className="text-primary hover:underline cursor-pointer" onClick={() => onChange({ unitPrice: l.refPrice ?? 0 })}>
                usar
              </button>
            </div>
          )}
          {!priceLocked && !canEditPrice && !l.refPrice && <div className="text-[11px] text-warning mt-0.5">sem preço de tabela</div>}
        </div>
        <div className="flex items-center gap-2 sm:justify-end h-10 col-span-1">
          <span className="sm:hidden text-xs text-muted">Total</span>
          <span className="num font-semibold text-fg">{money(lineTotal(l))}</span>
        </div>
        <div className="flex justify-end items-center h-10">
          <IconButton label="Remover item" size="sm" variant="danger" onClick={onRemove}>
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      </div>

      <div className={cn('grid gap-2 mt-2 sm:ml-6', l.kind === 'PRODUCT' && sortedLots.length ? 'sm:grid-cols-[minmax(0,1fr)_240px]' : '')}>
        <Input
          value={l.notes || ''}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder={l.kind === 'PRODUCT' ? `Observação de corte${notesRequired ? ' (obrigatória)' : ''} — ex.: bifes de 2 cm, limpar gordura` : 'Observação'}
          className={cn('h-9 text-[13px]', notesRequired && !l.notes?.trim() && 'border-warning')}
          aria-label="Observação do item"
        />
        {l.kind === 'PRODUCT' && sortedLots.length > 0 && (
          <Select
            value={l.lotId || ''}
            onChange={(v) => {
              const lot = sortedLots.find((x) => x.id === v);
              onChange({ lotId: v || null, lotCode: lot?.lotCode || null });
            }}
            placeholder="Lote: automático (FIFO)"
            options={[
              { value: '', label: 'Lote: automático (FIFO)' },
              ...sortedLots.map((x) => ({
                value: x.id,
                label: `${x.lotCode || x.batchCode || 'Lote'} · ${kg(x.balanceQty)}${x.expiryDate ? ` · val. ${date(x.expiryDate)}` : ''}`,
              })),
            ]}
            className="h-9 text-[13px]"
          />
        )}
      </div>
      {(overStock || error) && (
        <p className={cn('text-xs mt-2 sm:ml-6 flex items-center gap-1.5', error ? 'text-danger' : 'text-warning')}>
          <AlertTriangle className="size-3.5" />
          {error || `Acima do saldo disponível (${qty(stock, l.unit)}) — a separação pode ficar incompleta.`}
        </p>
      )}
    </li>
  );
}
