/**
 * Tabela de preços para o vendedor externo (somente preço de venda — sem custo/margem).
 */
import { Tag } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTable } from '../../../data/react';
import { date, matchesSearch, money } from '../../../domain/format';
import { MEAT_TYPE_LABELS } from '../../../domain/labels';
import { Badge, EmptyState, PageHeader, SearchInput, Select } from '../../../ui';
import { usePriceTableOptions } from '../../common/lookups';
import { ListCard, useMyCustomers } from './shared';

export function PricesView() {
  const { tables, options } = usePriceTableOptions();
  const { rows: products } = useTable('products');
  const { rows: customers } = useMyCustomers();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string>('');

  // Padrão: a tabela mais usada pelos clientes da carteira.
  const defaultId = useMemo(() => {
    const count = new Map<string, number>();
    customers.forEach((c) => c.priceTableId && count.set(c.priceTableId, (count.get(c.priceTableId) || 0) + 1));
    const valid = options.map((o) => o.value);
    const top = [...count.entries()].filter(([id]) => valid.includes(id)).sort((a, b) => b[1] - a[1])[0]?.[0];
    return top || valid[0] || '';
  }, [customers, options]);
  const tableId = picked || defaultId;
  const table = tables.find((t) => t.id === tableId) || null;
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const usedBy = customers.filter((c) => c.priceTableId === tableId).length;

  const groups = useMemo(() => {
    if (!table) return [];
    const m = new Map<string, { name: string; unit: string; price: number; meat?: string }[]>();
    for (const it of table.items) {
      const p = productMap.get(it.productId);
      if (!matchesSearch([it.productName, p?.category, p?.code], q)) continue;
      const cat = p?.category || 'Outros';
      if (!m.has(cat)) m.set(cat, []);
      m.get(cat)!.push({ name: it.productName, unit: it.unit, price: it.price, meat: p ? MEAT_TYPE_LABELS[p.meatType] : undefined });
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR')).map(([cat, items]) => ({ cat, items: items.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')) }));
  }, [table, productMap, q]);

  return (
    <>
      <PageHeader back="/" title="Tabela de preços" subtitle="Preços de venda vigentes. O pedido usa automaticamente a tabela do cliente." />
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <Select className="sm:w-72" value={tableId} onChange={setPicked} options={options.map((o) => ({ value: o.value, label: o.label }))} placeholder="Selecione a tabela" />
        <SearchInput value={q} onChange={setQ} placeholder="Buscar corte…" className="sm:w-64" />
      </div>
      {table && (
        <p className="text-xs text-muted mb-4">
          {table.items.length} itens
          {table.validFrom ? ` · vigente desde ${date(table.validFrom)}` : ''}
          {table.validTo ? ` até ${date(table.validTo)}` : ''}
          {usedBy ? ` · usada por ${usedBy} cliente(s) da sua carteira` : ''}
        </p>
      )}
      {groups.length ? (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.cat}>
              <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted mb-2">{g.cat}</h2>
              <ListCard>
                {g.items.map((i) => (
                  <div key={i.name} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <div className="text-sm text-fg truncate">{i.name}</div>
                      {i.meat && <div className="text-[11px] text-subtle">{i.meat}</div>}
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="num font-semibold text-fg">{money(i.price)}</span>
                      <span className="text-xs text-muted">/{i.unit === 'KG' ? 'kg' : 'un'}</span>
                    </div>
                  </div>
                ))}
              </ListCard>
            </section>
          ))}
        </div>
      ) : (
        <ListCard>
          <EmptyState icon={<Tag className="size-5" />} title={table ? 'Nenhum corte encontrado' : 'Nenhuma tabela aprovada'} description={table ? 'Tente outra busca.' : 'Fale com a equipe interna.'} />
        </ListCard>
      )}
      {table?.notes && (
        <div className="mt-4">
          <Badge tone="info">Obs.</Badge> <span className="text-sm text-muted">{table.notes}</span>
        </div>
      )}
    </>
  );
}
