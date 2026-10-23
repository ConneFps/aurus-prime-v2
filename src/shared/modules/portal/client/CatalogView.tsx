/**
 * Catálogo do portal: busca, categorias, destaques e cartões com quantidade.
 */
import { ArrowRight, Plus, Scale, Sparkles, Truck } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePortalSession } from '../../../app/session';
import { useSettings } from '../../../app/settings';
import { useQuery } from '@tanstack/react-query';
import { useBackend, useTable } from '../../../data/react';
import { portalPrice } from '../../../ops/impl/portal';
import { describeWindow, resolveDeliveryWindow } from '../../../domain/delivery';
import { matchesSearch, money } from '../../../domain/format';
import type { CatalogItem } from '../../../domain/types';
import { Badge, Button, cn, EmptyState, SearchInput, Skeleton } from '../../../ui';
import { firstQty, scheduleOf, unitShort } from '../lib';
import { resolveCart, useCart } from './cart';
import { ProductImage, QtyStepper, qtyRuleText } from './parts';

/** Tabela de preço negociada do cliente logado (se houver e puder ser lida). */
function useCustomerTable() {
  const backend = useBackend();
  const { account } = usePortalSession();
  const customerId = account?.customerId ?? null;
  const q = useQuery({
    queryKey: ['portal-price-table', customerId],
    enabled: !!customerId,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      try {
        const c = await backend.data.get('customers', customerId as string);
        if (!c?.priceTableId) return null;
        const t = await backend.data.get('price_tables', c.priceTableId);
        return t && t.status === 'ACTIVE' && t.approvalStatus === 'APPROVED' ? t : null;
      } catch {
        return null;
      }
    },
  });
  return q.data ?? null;
}

export function useCatalog() {
  const { rows, loading } = useTable('catalog_items', { where: [['available', '==', true]] });
  const table = useCustomerTable();
  const items = useMemo(
    () =>
      rows
        .filter((c) => c.available)
        .map((c) => (table ? { ...c, price: portalPrice(c, table) } : c))
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name, 'pt-BR')),
    [rows, table],
  );
  return { items, loading };
}

export function CatalogView() {
  const { account } = usePortalSession();
  const { settings } = useSettings();
  const { items, loading } = useCatalog();
  const cart = useCart();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('ALL');

  const categories = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach((i) => m.set(i.category || 'Outros', (m.get(i.category || 'Outros') || 0) + 1));
    return [...m.entries()];
  }, [items]);

  const filtered = useMemo(
    () => items.filter((i) => (cat === 'ALL' || (i.category || 'Outros') === cat) && matchesSearch([i.name, i.category, i.description], q)),
    [items, cat, q],
  );
  const featured = useMemo(() => items.filter((i) => i.featured), [items]);
  const browsing = !q && cat === 'ALL';
  const groups = useMemo(() => {
    if (!browsing) return [['', filtered] as [string, CatalogItem[]]];
    const m = new Map<string, CatalogItem[]>();
    filtered.forEach((i) => {
      const k = i.category || 'Outros';
      m.set(k, [...(m.get(k) || []), i]);
    });
    return [...m.entries()];
  }, [filtered, browsing]);

  const win = useMemo(() => resolveDeliveryWindow(new Date(), scheduleOf(settings)), [settings]);
  const { rows: cartRows, subtotal } = resolveCart(cart.lines, items);
  const firstName = (account?.name || '').split(' ')[0];

  return (
    <div className={cn(cartRows.length > 0 && 'pb-20 sm:pb-0')}>
      {/* Boas-vindas */}
      <section className="relative overflow-hidden rounded-card border border-border bg-surface px-4 py-5 sm:px-6 sm:py-6 mb-5">
        <div className="absolute inset-0 bg-gradient-to-r from-primary-soft via-transparent to-transparent pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Catálogo</div>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-fg mt-1">{firstName ? `Olá, ${firstName}!` : 'Bem-vindo!'}</h1>
            <p className="text-sm text-muted mt-1">Escolha os cortes e a quantidade. Nós pesamos tudo antes de cobrar.</p>
          </div>
          <div className="inline-flex items-start gap-2 rounded-control bg-surface-2 border border-border px-3 py-2 text-xs text-fg max-w-sm">
            <Truck className="size-4 text-primary shrink-0 mt-px" />
            <span>{describeWindow(win)}</span>
          </div>
        </div>
      </section>

      {/* Busca + categorias */}
      <div className="sticky top-14 sm:top-16 z-20 -mx-4 px-4 py-2 bg-bg/95 backdrop-blur border-b border-border sm:border-0 sm:static sm:mx-0 sm:px-0 sm:py-0 sm:bg-transparent sm:backdrop-blur-none mb-4 space-y-2">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar cortes, categorias…" className="sm:max-w-md" />
        {categories.length > 1 && (
          <div className="scroll-x -mx-4 px-4 sm:mx-0 sm:px-0">
            <div className="flex gap-1.5 min-w-max pb-0.5">
              <Chip active={cat === 'ALL'} onClick={() => setCat('ALL')}>
                Todos
              </Chip>
              {categories.map(([c, n]) => (
                <Chip key={c} active={cat === c} onClick={() => setCat(c)} count={n}>
                  {c}
                </Chip>
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="flex items-center gap-2 text-xs text-muted mb-5">
        <Scale className="size-3.5 text-primary shrink-0" />
        Peso estimado: o valor final é confirmado na pesagem.
      </p>

      {loading ? (
        <Grid>
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-72 rounded-card" />
          ))}
        </Grid>
      ) : !items.length ? (
        <EmptyState title="Catálogo em atualização" description="Nossa equipe está preparando os produtos. Volte em instantes ou fale com a gente pelo WhatsApp." />
      ) : !filtered.length ? (
        <EmptyState title="Nada encontrado" description="Tente outro nome ou escolha outra categoria." action={<Button onClick={() => { setQ(''); setCat('ALL'); }}>Limpar filtros</Button>} />
      ) : (
        <div className="space-y-9">
          {browsing && featured.length > 0 && (
            <section>
              <SectionTitle icon={<Sparkles className="size-4" />}>Destaques</SectionTitle>
              <Grid>
                {featured.map((i) => (
                  <ProductCard key={i.id} item={i} />
                ))}
              </Grid>
            </section>
          )}
          {groups.map(([title, list]) => (
            <section key={title || 'all'}>
              {title && <SectionTitle count={list.length}>{title}</SectionTitle>}
              <Grid>
                {list.map((i) => (
                  <ProductCard key={i.id} item={i} />
                ))}
              </Grid>
            </section>
          ))}
        </div>
      )}

      {/* Barra do carrinho (celular) */}
      {cartRows.length > 0 && (
        <div className="sm:hidden fixed left-0 right-0 bottom-[64px] z-30 px-3 pb-2">
          <Link
            to="/portal/carrinho"
            className="flex items-center justify-between gap-3 rounded-card bg-primary text-primary-fg px-4 h-12 shadow-pop font-medium"
          >
            <span className="text-sm">
              Ver carrinho · {cartRows.length} {cartRows.length === 1 ? 'item' : 'itens'}
            </span>
            <span className="inline-flex items-center gap-1.5 text-sm num">
              {money(subtotal)} <ArrowRight className="size-4" />
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">{children}</div>;
}

function SectionTitle({ children, icon, count }: { children: React.ReactNode; icon?: React.ReactNode; count?: number }) {
  return (
    <h2 className="flex items-center gap-2 font-display text-lg sm:text-xl font-semibold text-fg mb-3">
      {icon && <span className="text-primary">{icon}</span>}
      {children}
      {count !== undefined && <span className="text-xs font-sans font-normal text-subtle num">{count}</span>}
    </h2>
  );
}

function Chip({ active, onClick, children, count }: { active: boolean; onClick: () => void; children: React.ReactNode; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-8 px-3 rounded-pill text-[13px] font-medium whitespace-nowrap border transition-colors cursor-pointer inline-flex items-center gap-1.5',
        active ? 'bg-primary text-primary-fg border-primary' : 'bg-surface text-muted border-border hover:text-fg hover:border-border-strong',
      )}
    >
      {children}
      {count !== undefined && <span className={cn('num text-[10px]', active ? 'opacity-80' : 'text-subtle')}>{count}</span>}
    </button>
  );
}

export function ProductCard({ item }: { item: CatalogItem }) {
  const cart = useCart();
  const qty = cart.lines[item.id] || 0;
  const rule = qtyRuleText(item);
  return (
    <article className={cn('flex flex-col bg-surface border rounded-card overflow-hidden shadow-card transition-colors', qty > 0 ? 'border-primary/60' : 'border-border')}>
      <div className="relative aspect-[4/3] bg-surface-2">
        <ProductImage item={item} />
        {item.featured && (
          <Badge tone="accent" className="absolute top-2 left-2 shadow-card">
            Destaque
          </Badge>
        )}
        {qty > 0 && (
          <span className="absolute top-2 right-2 rounded-pill bg-primary text-primary-fg text-[11px] font-semibold px-2 py-0.5 num shadow-card">
            {qty.toLocaleString('pt-BR')} {unitShort(item.unit)}
          </span>
        )}
      </div>
      <div className="flex flex-col flex-1 p-3 sm:p-3.5 gap-1">
        <h3 className="text-sm font-semibold text-fg leading-snug line-clamp-2">{item.name}</h3>
        {item.description && <p className="text-xs text-muted line-clamp-2 max-sm:hidden">{item.description}</p>}
        <div className="mt-auto pt-2">
          <div className="flex items-baseline gap-1">
            <span className="text-[17px] font-semibold text-fg num">{money(item.price)}</span>
            <span className="text-xs text-muted">/{unitShort(item.unit)}</span>
          </div>
          {rule && <div className="text-[11px] text-subtle mt-0.5 truncate" title={`Pedido ${rule}`}>{rule}</div>}
        </div>
        <div className="pt-2">
          {qty > 0 ? (
            <QtyStepper size="sm" item={item} value={qty} onChange={(v) => cart.setQty(item.id, v)} />
          ) : (
            <Button block size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => cart.setQty(item.id, firstQty(item))}>
              Adicionar
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
