/**
 * Cortes e produtos — cadastro (useCrud) com saldo atual e alerta de mínimo.
 */
import { AlertTriangle, Beef, CircleDollarSign, Download, Edit3, ImageOff, Plus, Power, Tag, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSession } from '../../app/session';
import { useAction, useBackend, useCrud, useTable } from '../../data/react';
import { integer, matchesSearch, money, qty } from '../../domain/format';
import { MEAT_TYPE_LABELS, optionsOf } from '../../domain/labels';
import type { MeatType, Product } from '../../domain/types';
import {
  Badge,
  Button,
  Checkbox,
  Combobox,
  DataTable,
  Drawer,
  exportCsv,
  Field,
  FileDrop,
  FormGrid,
  FormSection,
  Input,
  Menu,
  MoneyInput,
  NumberInput,
  PageHeader,
  SearchInput,
  Segmented,
  Select,
  Stat,
  StatGrid,
  Switch,
  Textarea,
  Toolbar,
  useConfirm,
  type Column,
} from '../../ui';
import { useStockBalances } from '../common/lookups';
import { NUM_COL, SUGGESTED_CATEGORIES } from './shared';

type Draft = Omit<Product, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };

const EMPTY: Draft = {
  name: '',
  code: '',
  category: 'Traseiro',
  meatType: 'GRILL',
  unit: 'KG',
  minStock: null,
  defaultPrice: null,
  shelfLifeDays: 90,
  imageUrl: null,
  description: '',
  active: true,
};

interface Row extends Product {
  stock: number;
  low: boolean;
}

export function ProductsPage() {
  const { can } = useSession();
  const canEdit = can('products.manage');
  const { storage } = useBackend();
  const { rows: products, loading } = useTable('products');
  const { byProduct: finished } = useStockBalances('FINISHED');
  const { byProduct: raw } = useStockBalances('RAW');
  const crud = useCrud('products');
  const confirm = useConfirm();

  const [q, setQ] = useState('');
  const [type, setType] = useState<MeatType | 'ALL'>('ALL');
  const [category, setCategory] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const rows = useMemo<Row[]>(
    () =>
      products.map((p) => {
        const stock = (finished.get(p.id)?.qty || 0) + (raw.get(p.id)?.qty || 0);
        return { ...p, stock, low: !!p.active && !!p.minStock && stock < p.minStock };
      }),
    [products, finished, raw],
  );

  const categories = useMemo(() => {
    const set = new Set<string>(SUGGESTED_CATEGORIES);
    products.forEach((p) => p.category && set.add(p.category));
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [products]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: 0 };
    rows.filter((r) => showInactive || r.active).forEach((r) => {
      c.ALL++;
      c[r.meatType] = (c[r.meatType] || 0) + 1;
    });
    return c;
  }, [rows, showInactive]);

  const filtered = useMemo(
    () =>
      rows
        .filter((r) => showInactive || r.active)
        .filter((r) => type === 'ALL' || r.meatType === type)
        .filter((r) => !category || r.category === category)
        .filter((r) => !onlyLow || r.low)
        .filter((r) => matchesSearch([r.name, r.code, r.category, r.description], q)),
    [rows, showInactive, type, category, onlyLow, q],
  );

  const stats = useMemo(() => {
    const act = rows.filter((r) => r.active);
    return {
      active: act.length,
      low: act.filter((r) => r.low).length,
      empty: act.filter((r) => r.stock <= 0.0005 && r.meatType !== 'RAW').length,
      categories: new Set(act.map((r) => r.category)).size,
    };
  }, [rows]);

  const save = useAction(
    async (d: Draft) => {
      const name = d.name.trim();
      if (!name) throw new Error('Informe o nome do produto.');
      if (!d.category.trim()) throw new Error('Informe a categoria.');
      const dup = products.find((p) => p.id !== d.id && p.name.trim().toLowerCase() === name.toLowerCase());
      if (dup) throw new Error(`Já existe um produto chamado "${dup.name}".`);
      const code = (d.code || '').trim();
      if (code && products.some((p) => p.id !== d.id && (p.code || '').trim().toLowerCase() === code.toLowerCase())) throw new Error(`O código ${code} já está em uso.`);
      if ((d.minStock ?? 0) < 0 || (d.defaultPrice ?? 0) < 0 || (d.shelfLifeDays ?? 0) < 0) throw new Error('Valores não podem ser negativos.');
      const { id, ...data } = { ...d, name, code: code || null, category: d.category.trim(), description: (d.description || '').trim() || null };
      if (id) await crud.update(id, data);
      else await crud.insert(data);
    },
    { success: 'Produto salvo', onSuccess: () => setDraft(null) },
  );

  const toggle = useAction((p: Product) => crud.update(p.id, { active: !p.active }), { success: 'Status atualizado' });
  const remove = useAction(async (p: Row) => {
    if (p.stock > 0.0005) throw new Error(`${p.name} ainda tem ${qty(p.stock, p.unit)} em estoque — desative em vez de excluir.`);
    if (await confirm({ title: `Excluir ${p.name}?`, message: 'Esta ação não pode ser desfeita. Vendas e lotes antigos mantêm o nome gravado.', danger: true, confirmLabel: 'Excluir' }))
      await crud.remove(p.id);
  });

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Produto',
      mobile: 'title',
      sortValue: (p) => p.name,
      cell: (p) => (
        <div className="flex items-center gap-3 min-w-0">
          <Thumb url={p.imageUrl} name={p.name} />
          <div className="min-w-0">
            <div className="font-medium text-fg truncate">{p.name}</div>
            <div className="text-xs text-muted truncate">{[p.code, p.category].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
      ),
    },
    { key: 'type', header: 'Tipo', mobile: 'subtitle', sortValue: (p) => p.meatType, cell: (p) => MEAT_TYPE_LABELS[p.meatType] },
    { key: 'category', header: 'Categoria', mobile: false, sortValue: (p) => p.category, cell: (p) => p.category, hideBelow: 'xl' },
    {
      key: 'stock',
      header: 'Saldo',
      ...NUM_COL,
      sortValue: (p) => p.stock,
      cell: (p) => (
        <span className="inline-flex items-center gap-1.5 justify-end">
          {p.low && <AlertTriangle className="size-3.5 text-danger" aria-label="Abaixo do mínimo" />}
          <span className={p.low ? 'text-danger font-semibold' : p.stock > 0 ? 'text-fg' : 'text-subtle'}>{qty(Math.round(p.stock * 10) / 10, p.unit)}</span>
        </span>
      ),
    },
    { key: 'min', header: 'Mínimo', mobile: false, ...NUM_COL, sortValue: (p) => p.minStock || 0, cell: (p) => (p.minStock ? qty(p.minStock, p.unit) : '—'), hideBelow: 'md' },
    { key: 'price', header: 'Preço padrão', ...NUM_COL, sortValue: (p) => p.defaultPrice || 0, cell: (p) => (p.defaultPrice ? `${money(p.defaultPrice)}/${p.unit === 'KG' ? 'kg' : 'un'}` : '—') },
    { key: 'shelf', header: 'Validade', mobile: false, ...NUM_COL, sortValue: (p) => p.shelfLifeDays || 0, cell: (p) => (p.shelfLifeDays ? `${p.shelfLifeDays} dias` : '—'), hideBelow: 'lg' },
    {
      key: 'status',
      header: 'Status',
      mobile: 'badge',
      cell: (p) =>
        !p.active ? (
          <Badge dot>Inativo</Badge>
        ) : p.low ? (
          <Badge tone="danger" dot>
            Abaixo do mínimo
          </Badge>
        ) : (
          <Badge tone="success" dot>
            Ativo
          </Badge>
        ),
    },
  ];

  const edit = (p: Product) => setDraft({ ...EMPTY, ...p });

  return (
    <>
      <PageHeader
        eyebrow="Produção"
        title="Cortes e produtos"
        subtitle="Cadastro dos cortes vendidos e da matéria-prima pós-abate, com estoque mínimo, preço e validade."
        actions={
          <>
            <Button
              icon={<Download className="size-4" />}
              onClick={() =>
                exportCsv('produtos', filtered, [
                  { header: 'Nome', value: (p) => p.name },
                  { header: 'Código', value: (p) => p.code },
                  { header: 'Categoria', value: (p) => p.category },
                  { header: 'Tipo', value: (p) => MEAT_TYPE_LABELS[p.meatType] },
                  { header: 'Unidade', value: (p) => p.unit },
                  { header: 'Saldo', value: (p) => Math.round(p.stock * 1000) / 1000 },
                  { header: 'Estoque mínimo', value: (p) => p.minStock },
                  { header: 'Preço padrão', value: (p) => p.defaultPrice },
                  { header: 'Validade (dias)', value: (p) => p.shelfLifeDays },
                  { header: 'Ativo', value: (p) => (p.active ? 'Sim' : 'Não') },
                ])
              }
            >
              Exportar
            </Button>
            {canEdit && (
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setDraft({ ...EMPTY, category: category || EMPTY.category })}>
                Novo produto
              </Button>
            )}
          </>
        }
      />

      <StatGrid cols={4} className="mb-6">
        <Stat label="Ativos" value={integer(stats.active)} hint={`${integer(stats.categories)} categorias`} icon={<Tag className="size-4" />} />
        <Stat
          label="Abaixo mín."
          value={integer(stats.low)}
          hint={stats.low ? 'toque para ver' : 'estoque em dia'}
          icon={<AlertTriangle className="size-4" />}
          tone={stats.low ? 'danger' : 'success'}
          onClick={stats.low ? () => setOnlyLow(true) : undefined}
        />
        <Stat label="Zerados" value={integer(stats.empty)} hint="cortes sem saldo" icon={<Beef className="size-4" />} tone={stats.empty ? 'warning' : 'neutral'} />
        <Stat label="Com preço" value={integer(rows.filter((r) => r.active && r.defaultPrice).length)} hint={`de ${integer(stats.active)} ativos`} icon={<CircleDollarSign className="size-4" />} tone="info" />
      </StatGrid>

      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar nome, código ou categoria…" className="sm:w-72" />
        <Segmented
          size="sm"
          value={type}
          onChange={setType}
          options={[
            { value: 'ALL', label: 'Todos', count: counts.ALL || 0 },
            { value: 'GRILL', label: 'Churrasco', count: counts.GRILL || 0 },
            { value: 'PROCESSED', label: 'Dia a dia', count: counts.PROCESSED || 0 },
            { value: 'RAW', label: 'Carcaça', count: counts.RAW || 0 },
            { value: 'OTHER', label: 'Outros', count: counts.OTHER || 0 },
          ]}
        />
        <Select value={category} onChange={setCategory} options={[{ value: '', label: 'Todas as categorias' }, ...categories.map((c) => ({ value: c, label: c }))]} className="sm:w-52" />
        <div className="flex items-center gap-4 sm:ml-auto">
          <Checkbox checked={onlyLow} onChange={setOnlyLow} label="Abaixo do mínimo" />
          <Checkbox checked={showInactive} onChange={setShowInactive} label="Mostrar inativos" />
        </div>
      </Toolbar>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(p) => p.id}
        loading={loading}
        initialSort={{ key: 'name', dir: 'asc' }}
        onRowClick={canEdit ? edit : undefined}
        rowClassName={(p) => (!p.active ? 'opacity-60' : undefined)}
        pageSize={50}
        emptyTitle={products.length ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'}
        emptyDescription={products.length ? 'Ajuste os filtros ou a busca.' : 'Cadastre os cortes vendidos e a matéria-prima (carcaça, traseiro, dianteiro).'}
        rowActions={
          canEdit
            ? (p) => (
                <Menu
                  items={[
                    { label: 'Editar', icon: <Edit3 />, onClick: () => edit(p) },
                    { label: p.active ? 'Desativar' : 'Ativar', icon: <Power />, onClick: () => void toggle.run(p) },
                    'divider',
                    { label: 'Excluir', icon: <Trash2 />, danger: true, onClick: () => void remove.run(p) },
                  ]}
                />
              )
            : undefined
        }
      />

      <Drawer
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Editar produto' : 'Novo produto'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button variant="primary" loading={save.running} onClick={() => draft && void save.run(draft)}>
              Salvar
            </Button>
          </>
        }
      >
        {draft && (
          <form
            className="space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              void save.run(draft);
            }}
          >
            <FormGrid>
              <Field label="Nome" required span="full">
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus placeholder="Ex.: Picanha" />
              </Field>
              <Field label="Código" hint="Opcional — usado em etiquetas e buscas.">
                <Input value={draft.code || ''} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
              </Field>
              <Field label="Categoria" required hint="Escolha da lista ou digite uma nova.">
                <Combobox
                  value={draft.category || null}
                  onChange={(v) => setDraft({ ...draft, category: v || '' })}
                  options={(categories.includes(draft.category) || !draft.category ? categories : [draft.category, ...categories]).map((c) => ({ value: c, label: c }))}
                  onCreate={(text) => setDraft({ ...draft, category: text.trim() })}
                  createLabel="Usar nova categoria"
                  placeholder="Selecione…"
                />
              </Field>
              <Field label="Tipo" required>
                <Select value={draft.meatType} onChange={(v) => setDraft({ ...draft, meatType: v, shelfLifeDays: v === 'RAW' && draft.shelfLifeDays === 90 ? 7 : draft.shelfLifeDays })} options={optionsOf(MEAT_TYPE_LABELS)} />
              </Field>
              <Field label="Unidade">
                <Segmented
                  value={draft.unit}
                  onChange={(v) => setDraft({ ...draft, unit: v })}
                  options={[
                    { value: 'KG', label: 'Quilo (kg)' },
                    { value: 'UN', label: 'Unidade' },
                  ]}
                />
              </Field>
            </FormGrid>

            <FormSection title="Estoque e venda">
              <FormGrid cols={3}>
                <Field label="Estoque mínimo" hint="Alerta quando o saldo ficar abaixo.">
                  <NumberInput value={draft.minStock} onChange={(v) => setDraft({ ...draft, minStock: v })} decimals={draft.unit === 'KG' ? 3 : 0} suffix={draft.unit === 'KG' ? 'kg' : 'un'} />
                </Field>
                <Field label="Preço padrão" hint={`Por ${draft.unit === 'KG' ? 'kg' : 'unidade'}.`}>
                  <MoneyInput value={draft.defaultPrice} onChange={(v) => setDraft({ ...draft, defaultPrice: v })} />
                </Field>
                <Field label="Validade" hint="Dias após a entrada.">
                  <NumberInput value={draft.shelfLifeDays} onChange={(v) => setDraft({ ...draft, shelfLifeDays: v == null ? null : Math.round(v) })} decimals={0} suffix="dias" />
                </Field>
              </FormGrid>
            </FormSection>

            <FormSection title="Imagem e descrição" description="A imagem aparece no catálogo e no portal do cliente.">
              <div className="flex items-start gap-4">
                <Thumb url={draft.imageUrl} name={draft.name} size="lg" />
                <div className="flex-1 min-w-0 space-y-2">
                  <FileDrop
                    compact
                    folder="products"
                    kind="PHOTO"
                    accept="image/*"
                    label={draft.imageUrl ? 'Trocar imagem' : 'Enviar imagem'}
                    hint="JPG ou PNG, até 15 MB"
                    onUploaded={async (att) => {
                      const url = att.url || (await storage.url(att));
                      setDraft((cur) => (cur ? { ...cur, imageUrl: url || null } : cur));
                    }}
                  />
                  {draft.imageUrl && (
                    <Button size="xs" variant="ghost" onClick={() => setDraft({ ...draft, imageUrl: null })}>
                      Remover imagem
                    </Button>
                  )}
                </div>
              </div>
              <Field label="Descrição">
                <Textarea rows={2} value={draft.description || ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Ex.: embalado a vácuo, peça inteira" />
              </Field>
            </FormSection>

            <Switch checked={draft.active} onChange={(v) => setDraft({ ...draft, active: v })} label="Produto ativo" description="Inativos não aparecem em vendas, retornos de desossa nem no catálogo." />
            <button type="submit" hidden />
          </form>
        )}
      </Drawer>
    </>
  );
}

function Thumb({ url, name, size = 'sm' }: { url?: string | null; name: string; size?: 'sm' | 'lg' }) {
  const cls = size === 'lg' ? 'size-20' : 'size-9';
  return url ? (
    <img src={url} alt={name} className={`${cls} rounded-control object-cover border border-border shrink-0 bg-surface-2`} />
  ) : (
    <span className={`${cls} rounded-control bg-surface-2 text-subtle flex items-center justify-center shrink-0`}>
      <ImageOff className={size === 'lg' ? 'size-6' : 'size-4'} />
    </span>
  );
}
