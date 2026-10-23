/**
 * Cadastro/edição de item do catálogo do portal.
 */
import { ImageOff, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAction, useBackend, useCrud, useTable } from '../../../data/react';
import { money } from '../../../domain/format';
import type { CatalogItem } from '../../../domain/types';
import { Button, Combobox, Drawer, Field, FileDrop, FormGrid, Input, MoneyInput, NumberInput, Segmented, Switch, Textarea, useConfirm, type ComboOption } from '../../../ui';
import { useProductOptions } from '../../common/lookups';
import { ProductImage } from '../client/parts';
import { firstQty, unitShort } from '../lib';

export type CatalogDraft = Omit<CatalogItem, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };

export function CatalogItemDrawer({ draft, categories, onClose }: { draft: CatalogDraft | null; categories: string[]; onClose: () => void }) {
  const [d, setD] = useState<CatalogDraft | null>(draft);
  useEffect(() => setD(draft), [draft]);
  const crud = useCrud('catalog_items');
  const confirm = useConfirm();

  const save = useAction(
    async (x: CatalogDraft) => {
      if (!x.productId && !x.supplyItemId) throw new Error('Escolha o produto ou material de origem.');
      if (!x.name.trim()) throw new Error('Informe o nome exibido.');
      if (!x.category.trim()) throw new Error('Informe a categoria.');
      if (!(x.price > 0)) throw new Error('Informe o preço.');
      if (!(x.step > 0)) throw new Error('O passo precisa ser maior que zero.');
      if (x.minQty < 0) throw new Error('O mínimo não pode ser negativo.');
      const { id, ...data } = x;
      const row = { ...data, name: x.name.trim(), category: x.category.trim(), description: x.description?.trim() || null };
      if (id) await crud.update(id, row);
      else await crud.insert(row);
    },
    { success: 'Item do catálogo salvo', onSuccess: onClose },
  );
  const remove = useAction(async () => {
    if (!d?.id) return;
    if (await confirm({ title: `Remover ${d.name} do catálogo?`, message: 'Pedidos já feitos não são afetados. Para só esconder, desligue "Disponível".', danger: true, confirmLabel: 'Remover' })) {
      await crud.remove(d.id);
      onClose();
    }
  });

  return (
    <Drawer
      open={!!draft}
      onClose={onClose}
      title={d?.id ? 'Editar item do catálogo' : 'Novo item do catálogo'}
      footer={
        <>
          {d?.id && (
            <Button variant="ghost" className="mr-auto text-danger" icon={<Trash2 className="size-4" />} loading={remove.running} onClick={() => void remove.run()}>
              Remover
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.running} onClick={() => d && void save.run(d)}>
            Salvar
          </Button>
        </>
      }
    >
      {d && <Form d={d} setD={setD} categories={categories} onSubmit={() => void save.run(d)} />}
    </Drawer>
  );
}

function Form({ d, setD, categories, onSubmit }: { d: CatalogDraft; setD: (d: CatalogDraft) => void; categories: string[]; onSubmit: () => void }) {
  const { storage } = useBackend();
  const { options: productOptions, products } = useProductOptions({ onlyActive: true });
  const { rows: supplies } = useTable('supply_items');
  const sellable = useMemo(() => supplies.filter((s) => s.sellable && s.active), [supplies]);
  const supplyOptions = useMemo<ComboOption[]>(
    () => sellable.map((s) => ({ value: s.id, label: s.name, description: s.salePrice ? money(s.salePrice) : undefined })),
    [sellable],
  );
  const [source, setSource] = useState<'PRODUCT' | 'SUPPLY'>(d.supplyItemId && !d.productId ? 'SUPPLY' : 'PRODUCT');

  const pickProduct = (id: string | null) => {
    const p = products.find((x) => x.id === id);
    if (!p) return setD({ ...d, productId: null });
    setD({
      ...d,
      productId: p.id,
      supplyItemId: null,
      name: d.name || p.name,
      category: d.category || p.category,
      unit: p.unit,
      price: d.price || p.defaultPrice || 0,
      step: p.unit === 'KG' ? d.step || 0.5 : 1,
      minQty: d.minQty || 1,
      imageUrl: d.imageUrl || p.imageUrl || null,
      description: d.description || p.description || '',
    });
  };
  const pickSupply = (id: string | null) => {
    const s = sellable.find((x) => x.id === id);
    if (!s) return setD({ ...d, supplyItemId: null });
    setD({ ...d, supplyItemId: s.id, productId: null, name: d.name || s.name, category: d.category || 'Acessórios', unit: 'UN', price: d.price || s.salePrice || 0, minQty: 1, step: 1 });
  };

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {!d.id && (
        <Segmented
          value={source}
          onChange={(v) => {
            setSource(v);
            setD({ ...d, productId: null, supplyItemId: null });
          }}
          options={[
            { value: 'PRODUCT', label: 'Produto (carne)' },
            { value: 'SUPPLY', label: 'Material vendável' },
          ]}
        />
      )}
      <FormGrid>
        {source === 'PRODUCT' ? (
          <Field label="Produto do estoque" required span="full" hint="A baixa de estoque e a separação usam este produto.">
            <Combobox value={d.productId} onChange={pickProduct} options={productOptions} placeholder="Escolha o produto…" />
          </Field>
        ) : (
          <Field label="Material" required span="full" hint="Só aparecem materiais marcados como vendáveis.">
            <Combobox value={d.supplyItemId} onChange={pickSupply} options={supplyOptions} placeholder="Escolha o material…" emptyText="Nenhum material vendável" />
          </Field>
        )}
        <Field label="Nome exibido" required span="full">
          <Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </Field>
        <Field label="Categoria" required>
          <Input value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })} list="portal-catalog-categories" />
          <datalist id="portal-catalog-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Unidade">
          <Segmented
            value={d.unit}
            onChange={(u) => setD({ ...d, unit: u, step: u === 'UN' ? Math.max(1, Math.round(d.step)) : d.step })}
            options={[
              { value: 'KG', label: 'Quilo (kg)' },
              { value: 'UN', label: 'Unidade' },
            ]}
          />
        </Field>
        <Field label={`Preço por ${unitShort(d.unit)}`} required>
          <MoneyInput value={d.price} onChange={(v) => setD({ ...d, price: v ?? 0 })} />
        </Field>
        <Field label="Ordem na vitrine" hint="Menor aparece primeiro.">
          <NumberInput decimals={0} value={d.sortOrder} onChange={(v) => setD({ ...d, sortOrder: v ?? 0 })} />
        </Field>
        <Field label="Pedido mínimo" hint={`Primeiro clique adiciona ${firstQty(d).toLocaleString('pt-BR')} ${unitShort(d.unit)}.`}>
          <NumberInput decimals={3} value={d.minQty} onChange={(v) => setD({ ...d, minQty: v ?? 0 })} suffix={unitShort(d.unit)} />
        </Field>
        <Field label="Incremento (passo)" hint={d.unit === 'KG' ? 'Ex.: 0,5 = meio em meio quilo.' : 'Normalmente 1.'}>
          <NumberInput decimals={3} value={d.step} onChange={(v) => setD({ ...d, step: v ?? 0 })} suffix={unitShort(d.unit)} />
        </Field>
        <Field label="Descrição" span="full" hint="Aparece no cartão do produto (ex.: peça inteira, ideal para grelha).">
          <Textarea rows={2} value={d.description || ''} onChange={(e) => setD({ ...d, description: e.target.value })} />
        </Field>
      </FormGrid>

      <div>
        <div className="text-xs font-medium text-muted mb-1.5">Imagem</div>
        <div className="flex gap-3 items-start">
          <div className="size-24 rounded-card overflow-hidden border border-border bg-surface-2 shrink-0">
            <ProductImage item={{ ...d, imageUrl: d.imageUrl }} compact />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <FileDrop
              compact
              folder="catalog"
              kind="PHOTO"
              accept="image/*"
              label="Enviar foto"
              hint="JPG ou PNG, de preferência quadrada"
              onUploaded={async (att) => setD({ ...d, imageUrl: att.url || (await storage.url(att)) })}
            />
            <div className="flex gap-2">
              <Input placeholder="ou cole o endereço da imagem" value={d.imageUrl || ''} onChange={(e) => setD({ ...d, imageUrl: e.target.value || null })} />
              {d.imageUrl && (
                <Button variant="ghost" icon={<ImageOff className="size-4" />} onClick={() => setD({ ...d, imageUrl: null })} aria-label="Remover imagem" />
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-card border border-border p-4">
        <Switch checked={d.available} onChange={(v) => setD({ ...d, available: v })} label="Disponível no portal" description="Desligue para esconder sem apagar (ex.: sem estoque)." />
        <Switch checked={d.featured} onChange={(v) => setD({ ...d, featured: v })} label="Destaque" description="Aparece na seção de destaques no topo do catálogo." />
      </div>
      <button type="submit" hidden />
    </form>
  );
}
