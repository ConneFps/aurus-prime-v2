/**
 * Editor de tabela de preço em grade (todos os produtos ativos).
 */
import { Copy, Percent, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { money, percent, round2 } from '../../../domain/format';
import type { PriceTable, PriceTableItem, Product } from '../../../domain/types';
import { Badge, Button, Callout, Checkbox, cn, DateInput, Field, FormGrid, Input, MoneyInput, PercentInput, SearchInput, Segmented, Select, Textarea } from '../../../ui';

export const KIND_LABELS: Record<PriceTable['kind'], string> = {
  GRILL: 'Churrasco',
  GENERAL: 'Geral',
  PORTAL: 'Portal do cliente',
  INTERCOMPANY: 'Intercompany',
};

export interface TableDraft {
  id?: string;
  name: string;
  kind: PriceTable['kind'];
  status: PriceTable['status'];
  validFrom: string | null;
  validTo: string | null;
  notes: string;
  /** productId → preço (null = fora da tabela). */
  prices: Record<string, number | null>;
}

export function draftFromTable(t?: PriceTable | null): TableDraft {
  return {
    id: t?.id,
    name: t?.name || '',
    kind: t?.kind || 'GENERAL',
    status: t?.status || 'ACTIVE',
    validFrom: t?.validFrom ?? null,
    validTo: t?.validTo ?? null,
    notes: t?.notes || '',
    prices: Object.fromEntries((t?.items || []).map((i) => [i.productId, i.price])),
  };
}

export function itemsOf(d: TableDraft, products: Product[]): PriceTableItem[] {
  const map = new Map(products.map((p) => [p.id, p]));
  return Object.entries(d.prices)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([id, price]) => {
      const p = map.get(id);
      return { productId: id, productName: p?.name || id, unit: p?.unit || 'KG', price: round2(price as number) };
    })
    .sort((a, b) => a.productName.localeCompare(b.productName, 'pt-BR'));
}

export function PriceTableEditor({
  draft,
  setDraft,
  products,
  tables,
  avgCost,
  showCost,
  readOnly,
}: {
  draft: TableDraft;
  setDraft: (fn: (d: TableDraft) => TableDraft) => void;
  products: Product[];
  tables: PriceTable[];
  avgCost: Map<string, number>;
  showCost: boolean;
  readOnly?: boolean;
}) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [scope, setScope] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [pct, setPct] = useState<number | null>(null);
  const [copyFrom, setCopyFrom] = useState('');
  const [copyMode, setCopyMode] = useState<'FILL' | 'REPLACE'>('REPLACE');
  const [copyFactor, setCopyFactor] = useState<number | null>(0);

  // Carcaça/matéria-prima (RAW) não é vendida por tabela — só aparece se já estiver nela.
  const active = useMemo(() => products.filter((p) => (p.active && p.meatType !== 'RAW') || draft.prices[p.id] != null).sort((a, b) => a.category.localeCompare(b.category, 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR')), [products, draft.prices]);
  const categories = useMemo(() => [...new Set(active.map((p) => p.category))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [active]);
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const visible = active.filter(
    (p) =>
      (!cat || p.category === cat) &&
      (scope === 'ALL' || (scope === 'IN' ? draft.prices[p.id] != null : draft.prices[p.id] == null)) &&
      (!q || norm(`${p.name} ${p.code || ''} ${p.category}`).includes(norm(q))),
  );
  const included = Object.values(draft.prices).filter((v) => v != null).length;

  const setPrice = (id: string, v: number | null) => setDraft((d) => ({ ...d, prices: { ...d.prices, [id]: v } }));
  const applyPct = () => {
    if (!pct) return;
    const ids = new Set(visible.map((p) => p.id));
    setDraft((d) => ({
      ...d,
      prices: Object.fromEntries(Object.entries(d.prices).map(([id, v]) => [id, v != null && ids.has(id) ? round2(v * (1 + pct / 100)) : v])),
    }));
    setPct(null);
  };
  const applyCopy = () => {
    const src = tables.find((t) => t.id === copyFrom);
    if (!src) return;
    const f = 1 + (copyFactor || 0) / 100;
    setDraft((d) => {
      const prices = copyMode === 'REPLACE' ? {} : { ...d.prices };
      for (const it of src.items) if (copyMode === 'REPLACE' || prices[it.productId] == null) prices[it.productId] = round2(it.price * f);
      return { ...d, prices };
    });
  };
  const fillDefaults = () =>
    setDraft((d) => {
      const prices = { ...d.prices };
      for (const p of visible) if (prices[p.id] == null && p.defaultPrice) prices[p.id] = p.defaultPrice;
      return { ...d, prices };
    });

  return (
    <div className="space-y-5">
      <FormGrid cols={3}>
        <Field label="Nome da tabela" required span={2}>
          <Input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} disabled={readOnly} placeholder="Ex.: Tabela Churrasco — Novembro" autoFocus={!draft.id} />
        </Field>
        <Field label="Tipo">
          <Select value={draft.kind} onChange={(v) => setDraft((d) => ({ ...d, kind: v }))} disabled={readOnly} options={(Object.keys(KIND_LABELS) as PriceTable['kind'][]).map((k) => ({ value: k, label: KIND_LABELS[k] }))} />
        </Field>
        <Field label="Válida de">
          <DateInput value={draft.validFrom} onChange={(v) => setDraft((d) => ({ ...d, validFrom: v || null }))} disabled={readOnly} />
        </Field>
        <Field label="Válida até" hint="Vazio = sem prazo.">
          <DateInput value={draft.validTo} onChange={(v) => setDraft((d) => ({ ...d, validTo: v || null }))} disabled={readOnly} />
        </Field>
        <Field label="Situação">
          <Select
            value={draft.status}
            onChange={(v) => setDraft((d) => ({ ...d, status: v }))}
            disabled={readOnly}
            options={[
              { value: 'ACTIVE', label: 'Ativa' },
              { value: 'INACTIVE', label: 'Inativa' },
            ]}
          />
        </Field>
        <Field label="Observações" span="full">
          <Textarea rows={2} value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} disabled={readOnly} />
        </Field>
      </FormGrid>
      {draft.validFrom && draft.validTo && draft.validTo < draft.validFrom && <Callout tone="danger">A data final é anterior à inicial.</Callout>}

      {!readOnly && (
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-card border border-border p-3 space-y-2">
            <div className="text-xs font-medium text-muted flex items-center gap-1.5">
              <Percent className="size-3.5" /> Reajuste em massa
            </div>
            <div className="flex gap-2">
              <PercentInput value={pct} onChange={setPct} placeholder="Ex.: 5 ou -3" className="flex-1" />
              <Button onClick={applyPct} disabled={!pct}>
                Aplicar
              </Button>
            </div>
            <p className="text-[11px] text-subtle">Aplica aos {visible.filter((p) => draft.prices[p.id] != null).length} produtos com preço exibidos no filtro abaixo.</p>
          </div>
          <div className="rounded-card border border-border p-3 space-y-2">
            <div className="text-xs font-medium text-muted flex items-center gap-1.5">
              <Copy className="size-3.5" /> Copiar de outra tabela
            </div>
            <Select value={copyFrom} onChange={setCopyFrom} placeholder="Escolha a tabela…" options={tables.filter((t) => t.id !== draft.id).map((t) => ({ value: t.id, label: `${t.name} (${t.items.length})` }))} />
            <div className="flex flex-wrap gap-2 items-center">
              <Segmented
                size="sm"
                value={copyMode}
                onChange={setCopyMode}
                options={[
                  { value: 'REPLACE', label: 'Substituir' },
                  { value: 'FILL', label: 'Só faltantes' },
                ]}
              />
              <PercentInput value={copyFactor} onChange={setCopyFactor} className="w-24 h-8" aria-label="Ajuste %" />
              <Button size="sm" onClick={applyCopy} disabled={!copyFrom}>
                Copiar
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar produto…" className="flex-1" />
          <Select value={cat} onChange={setCat} options={[{ value: '', label: 'Todas as categorias' }, ...categories.map((c) => ({ value: c, label: c }))]} className="sm:w-48" />
          <Segmented
            size="sm"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'ALL', label: 'Todos', count: active.length },
              { value: 'IN', label: 'Na tabela', count: included },
              { value: 'OUT', label: 'Fora', count: active.length - included },
            ]}
          />
        </div>
        {!readOnly && scope !== 'IN' && (
          <Button size="xs" variant="ghost" icon={<Wand2 className="size-3.5" />} onClick={fillDefaults}>
            Incluir os exibidos com o preço do cadastro
          </Button>
        )}

        <div className="rounded-card border border-border overflow-hidden">
          <div className={cn('hidden sm:grid gap-3 px-3 h-9 items-center bg-surface-2/60 border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted', showCost ? 'grid-cols-[28px_minmax(0,1fr)_110px_150px_80px]' : 'grid-cols-[28px_minmax(0,1fr)_150px]')}>
            <span />
            <span>Produto</span>
            {showCost && <span className="text-right">Custo médio</span>}
            <span className="text-right">Preço</span>
            {showCost && <span className="text-right">Margem</span>}
          </div>
          <ul className="divide-y divide-border">
            {visible.map((p) => {
              const price = draft.prices[p.id];
              const inTable = price != null;
              const cost = avgCost.get(p.id);
              const margin = inTable && cost && price ? ((price - cost) / price) * 100 : null;
              return (
                <li
                  key={p.id}
                  className={cn(
                    'grid gap-x-3 gap-y-1 px-3 py-2 items-center',
                    showCost ? 'grid-cols-[28px_minmax(0,1fr)_130px] sm:grid-cols-[28px_minmax(0,1fr)_110px_150px_80px]' : 'grid-cols-[28px_minmax(0,1fr)_130px] sm:grid-cols-[28px_minmax(0,1fr)_150px]',
                    !inTable && 'opacity-70',
                  )}
                >
                  <Checkbox checked={inTable} disabled={readOnly} onChange={(v) => setPrice(p.id, v ? p.defaultPrice ?? 0 : null)} />
                  <div className="min-w-0">
                    <div className="text-sm text-fg truncate">
                      {p.name}
                      {!p.active && (
                        <Badge size="xs" className="ml-1.5">
                          inativo
                        </Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-muted truncate">
                      {p.category} · por {p.unit === 'KG' ? 'kg' : 'unidade'}
                      {p.defaultPrice ? ` · cadastro ${money(p.defaultPrice)}` : ''}
                      {showCost && cost ? <span className="sm:hidden"> · custo {money(cost)}</span> : null}
                    </div>
                  </div>
                  {showCost && <span className="hidden sm:block text-right text-sm num text-muted">{cost ? money(cost) : '—'}</span>}
                  <MoneyInput value={price ?? null} onChange={(v) => setPrice(p.id, v)} disabled={readOnly} className="h-9" placeholder="—" />
                  {showCost && (
                    <span className={cn('hidden sm:block text-right text-sm num', margin == null ? 'text-subtle' : margin < 0 ? 'text-danger' : margin < 15 ? 'text-warning' : 'text-success')}>
                      {margin == null ? '—' : percent(margin)}
                    </span>
                  )}
                </li>
              );
            })}
            {!visible.length && <li className="px-3 py-6 text-center text-sm text-muted">Nenhum produto neste filtro.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
