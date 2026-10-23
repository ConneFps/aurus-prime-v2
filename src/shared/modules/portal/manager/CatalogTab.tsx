/**
 * Aba "Catálogo": itens vendidos no portal (preço, mínimo, passo, destaque, imagem).
 */
import { Eye, EyeOff, Plus, RefreshCw, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useOps } from '../../../app/session';
import { useAction, useCrud } from '../../../data/react';
import { matchesSearch, money, number } from '../../../domain/format';
import type { CatalogItem } from '../../../domain/types';
import { Badge, Button, cn, DataTable, Field, Menu, Modal, SearchInput, Segmented, Select, Switch, Toolbar, type Column } from '../../../ui';
import { usePriceTableOptions } from '../../common/lookups';
import { ProductImage } from '../client/parts';
import { unitShort } from '../lib';
import { CatalogItemDrawer, type CatalogDraft } from './CatalogItemDrawer';

export function CatalogTab({ items, loading }: { items: CatalogItem[]; loading: boolean }) {
  const crud = useCrud('catalog_items');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [avail, setAvail] = useState<'ALL' | 'ON' | 'OFF'>('ALL');
  const [draft, setDraft] = useState<CatalogDraft | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);

  const categories = useMemo(() => [...new Set(items.map((i) => i.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [items]);
  const rows = useMemo(
    () =>
      items
        .filter((i) => !cat || i.category === cat)
        .filter((i) => avail === 'ALL' || (avail === 'ON' ? i.available : !i.available))
        .filter((i) => matchesSearch([i.name, i.category, i.description], q)),
    [items, cat, avail, q],
  );
  const onCount = items.filter((i) => i.available).length;
  const nextOrder = items.reduce((m, i) => Math.max(m, i.sortOrder || 0), 0) + 1;

  const patch = useAction((i: CatalogItem, p: Partial<CatalogItem>) => crud.update(i.id, p));

  const columns: Column<CatalogItem>[] = [
    {
      key: 'name',
      header: 'Produto',
      mobile: 'title',
      sortValue: (i) => i.name,
      cell: (i) => (
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-10 rounded-control overflow-hidden bg-surface-2 shrink-0 max-md:hidden">
            <ProductImage item={i} compact />
          </div>
          <div className="min-w-0">
            <div className={cn('font-medium truncate', i.available ? 'text-fg' : 'text-subtle line-through')}>{i.name}</div>
            <div className="text-xs text-muted truncate">
              {i.category}
              {!i.productId && i.supplyItemId ? ' · material' : ''}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'price',
      header: 'Preço',
      align: 'right',
      mobile: 'subtitle',
      sortValue: (i) => i.price,
      cell: (i) => (
        <span className="num">
          {money(i.price)}
          <span className="text-muted">/{unitShort(i.unit)}</span>
        </span>
      ),
    },
    {
      key: 'rule',
      header: 'Mín. / passo',
      hideBelow: 'md',
      align: 'right',
      cell: (i) => (
        <span className="num text-muted">
          {number(i.minQty, 3)} / {number(i.step, 3)} {unitShort(i.unit)}
        </span>
      ),
    },
    { key: 'order', header: 'Ordem', hideBelow: 'lg', align: 'right', sortValue: (i) => i.sortOrder, cell: (i) => <span className="num text-muted">{i.sortOrder}</span> },
    {
      key: 'flags',
      header: 'Vitrine',
      mobile: 'badge',
      cell: (i) => (
        <span className="inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            title={i.featured ? 'Tirar dos destaques' : 'Destacar no catálogo'}
            onClick={() => void patch.run(i, { featured: !i.featured })}
            className={cn('p-1 rounded-control cursor-pointer hover:bg-surface-2', i.featured ? 'text-accent' : 'text-subtle')}
          >
            <Star className={cn('size-4', i.featured && 'fill-current')} />
          </button>
          <Switch checked={i.available} onChange={(v) => void patch.run(i, { available: v })} />
        </span>
      ),
    },
  ];

  return (
    <>
      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar no catálogo…" className="sm:w-64" />
        <Select value={cat} onChange={setCat} placeholder="Todas as categorias" options={categories.map((c) => ({ value: c, label: c }))} className="sm:w-52" />
        <Segmented
          size="sm"
          value={avail}
          onChange={setAvail}
          options={[
            { value: 'ALL', label: 'Todos', count: items.length },
            { value: 'ON', label: 'Disponíveis', count: onCount },
            { value: 'OFF', label: 'Ocultos', count: items.length - onCount },
          ]}
        />
        <div className="flex gap-2 sm:ml-auto">
          <Button icon={<RefreshCw className="size-4" />} onClick={() => setSyncOpen(true)} className="max-sm:flex-1">
            Sincronizar preços
          </Button>
          <Button
            variant="primary"
            icon={<Plus className="size-4" />}
            className="max-sm:flex-1"
            onClick={() =>
              setDraft({ productId: null, supplyItemId: null, name: '', description: '', category: '', unit: 'KG', price: 0, minQty: 1, step: 0.5, imageUrl: null, available: true, featured: false, sortOrder: nextOrder })
            }
          >
            Adicionar item
          </Button>
        </div>
      </Toolbar>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(i) => i.id}
        loading={loading}
        initialSort={{ key: 'order', dir: 'asc' }}
        onRowClick={(i) => setDraft({ ...i })}
        emptyTitle={items.length ? 'Nenhum item encontrado' : 'Catálogo vazio'}
        emptyDescription={items.length ? 'Tente outra busca ou filtro.' : 'Sincronize com uma tabela de preço aprovada ou adicione itens um a um.'}
        rowActions={(i) => (
          <Menu
            items={[
              { label: 'Editar', onClick: () => setDraft({ ...i }) },
              { label: i.available ? 'Ocultar do portal' : 'Mostrar no portal', icon: i.available ? <EyeOff /> : <Eye />, onClick: () => void patch.run(i, { available: !i.available }) },
              { label: i.featured ? 'Tirar destaque' : 'Destacar', icon: <Star />, onClick: () => void patch.run(i, { featured: !i.featured }) },
            ]}
          />
        )}
      />

      <CatalogItemDrawer draft={draft} categories={categories} onClose={() => setDraft(null)} />
      <SyncModal open={syncOpen} onClose={() => setSyncOpen(false)} />
    </>
  );
}

function SyncModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ops = useOps();
  const { options, tables } = usePriceTableOptions();
  const portalDefault = tables.find((t) => t.kind === 'PORTAL' && t.status === 'ACTIVE' && t.approvalStatus === 'APPROVED')?.id || '';
  const [tableId, setTableId] = useState('');
  const chosen = tableId || portalDefault;
  const sync = useAction(() => ops.syncCatalogFromPriceTable(chosen), {
    success: (n) => `${n} ${n === 1 ? 'produto atualizado' : 'produtos atualizados'} no catálogo`,
    onSuccess: onClose,
  });
  const t = tables.find((x) => x.id === chosen);
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Sincronizar com tabela de preço"
      description="Atualiza preços e cria os produtos que faltam. Quantidade mínima, passo e destaques são mantidos."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={sync.running} disabled={!chosen} onClick={() => void sync.run()} icon={<RefreshCw className="size-4" />}>
            Sincronizar
          </Button>
        </>
      }
    >
      <Field label="Tabela de preço aprovada" hint={t ? `${t.items.length} produtos${t.validTo ? ` · válida até ${t.validTo.split('-').reverse().join('/')}` : ''}` : undefined}>
        <Select value={chosen} onChange={setTableId} placeholder="Escolha…" options={options.map((o) => ({ value: o.value, label: o.label }))} />
      </Field>
      {!options.length && (
        <p className="text-xs text-muted mt-3">
          Nenhuma tabela ativa e aprovada. <Badge tone="warning">Aprove uma tabela em Comercial › Preços</Badge>
        </p>
      )}
    </Modal>
  );
}
