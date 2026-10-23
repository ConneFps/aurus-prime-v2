/**
 * Vitrine pública (/catalogo/:token): somente leitura, sem login.
 * O visitante marca o que quer e envia a lista pelo WhatsApp.
 */
import { Check, LinkIcon, LogIn, MessageCircle, Plus, Scale, ShoppingBag } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useBackend } from '../../../data/react';
import { date, matchesSearch, money } from '../../../domain/format';
import type { PublicCatalogItem, PublicCatalogLink } from '../../../domain/types';
import { Button, cn, EmptyState, PageLoader, SearchInput } from '../../../ui';
import { CenteredScreen, ProductImage } from '../client/parts';
import { unitShort, waLink } from '../lib';

export function PublicCatalogPage() {
  const { token = '' } = useParams();
  const backend = useBackend();
  const [state, setState] = useState<{ status: 'loading' } | { status: 'invalid' } | { status: 'ok'; link: PublicCatalogLink }>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    backend.public
      .getCatalog(token)
      .then((link) => alive && setState(link ? { status: 'ok', link } : { status: 'invalid' }))
      .catch(() => alive && setState({ status: 'invalid' }));
    return () => {
      alive = false;
    };
  }, [backend, token]);

  if (state.status === 'loading') return <PageLoader label="Abrindo o catálogo…" />;
  if (state.status === 'invalid')
    return (
      <CenteredScreen
        icon={<LinkIcon />}
        title="Este catálogo não está mais disponível"
        actions={
          <a href="#/portal">
            <Button variant="primary" icon={<LogIn className="size-4" />}>
              Entrar no portal do cliente
            </Button>
          </a>
        }
      >
        O link pode ter expirado ou sido desativado. Peça um novo link a quem enviou, ou entre no portal se você já é cliente.
      </CenteredScreen>
    );
  return <Showcase link={state.link} />;
}

function Showcase({ link }: { link: PublicCatalogLink }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('ALL');
  const [picked, setPicked] = useState<Set<number>>(new Set());

  const items = useMemo(() => link.items.map((it, idx) => ({ ...it, idx })), [link.items]);
  const categories = useMemo(() => [...new Set(items.map((i) => i.category || 'Outros'))], [items]);
  const filtered = items.filter((i) => (cat === 'ALL' || (i.category || 'Outros') === cat) && matchesSearch([i.name, i.category, i.description], q));
  const groups = useMemo(() => {
    const m = new Map<string, typeof filtered>();
    filtered.forEach((i) => m.set(i.category || 'Outros', [...(m.get(i.category || 'Outros') || []), i]));
    return [...m.entries()];
  }, [filtered]);

  const toggle = (idx: number) => {
    const n = new Set(picked);
    if (n.has(idx)) n.delete(idx);
    else n.add(idx);
    setPicked(n);
  };
  const chosen = items.filter((i) => picked.has(i.idx));
  const message = chosen.length
    ? `Olá! Vi o catálogo "${link.title}" e tenho interesse em:\n${chosen.map((i) => `• ${i.name}`).join('\n')}\n\nPode me passar as quantidades disponíveis e o prazo de entrega?`
    : `Olá! Vi o catálogo "${link.title}" e gostaria de fazer um pedido.`;
  const wa = link.whatsapp ? waLink(link.whatsapp, message) : null;

  return (
    <div className="min-h-dvh bg-bg">
      <header className="relative overflow-hidden border-b border-border bg-surface">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-soft via-transparent to-transparent pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-5 pb-7 sm:pt-6 sm:pb-10">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="size-8 rounded-control bg-primary text-primary-fg flex items-center justify-center shrink-0">
                <ShoppingBag className="size-4" />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Catálogo</span>
            </div>
            <a href="#/portal" className="shrink-0">
              <Button size="sm" variant="ghost" icon={<LogIn className="size-4" />}>
                Já sou cliente
              </Button>
            </a>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold text-fg mt-6 max-w-3xl text-balance">{link.title}</h1>
          {link.message && <p className="text-sm sm:text-base text-muted mt-2 max-w-2xl whitespace-pre-line">{link.message}</p>}
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtle">
            <span>{items.length} produtos</span>
            {link.expiresAt && <span>Válido até {date(link.expiresAt)}</span>}
            <span className="inline-flex items-center gap-1">
              <Scale className="size-3.5" /> Peso estimado — o valor final é confirmado na pesagem
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-5 pb-32">
        <div className="space-y-2 mb-6">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar produtos…" className="sm:max-w-md" />
          {categories.length > 1 && (
            <div className="scroll-x -mx-4 px-4 sm:mx-0 sm:px-0">
              <div className="flex gap-1.5 min-w-max pb-0.5">
                {['ALL', ...categories].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCat(c)}
                    className={cn(
                      'h-8 px-3 rounded-pill text-[13px] font-medium whitespace-nowrap border transition-colors cursor-pointer',
                      cat === c ? 'bg-primary text-primary-fg border-primary' : 'bg-surface text-muted border-border hover:text-fg',
                    )}
                  >
                    {c === 'ALL' ? 'Todos' : c}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {!filtered.length ? (
          <EmptyState title="Nada encontrado" description="Tente outro nome ou categoria." />
        ) : (
          <div className="space-y-9">
            {groups.map(([title, list]) => (
              <section key={title}>
                <h2 className="font-display text-lg sm:text-xl font-semibold text-fg mb-3">{title}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                  {list.map((i) => (
                    <PublicCard key={i.idx} item={i} showPrices={link.showPrices} picked={picked.has(i.idx)} onToggle={() => toggle(i.idx)} canPick={!!wa} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {wa && (
        <div className="fixed left-0 right-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
            <div className="min-w-0 flex-1 text-xs sm:text-sm text-muted">
              {chosen.length ? (
                <>
                  <strong className="text-fg">{chosen.length}</strong> {chosen.length === 1 ? 'produto marcado' : 'produtos marcados'}
                </>
              ) : (
                'Marque os produtos e peça pelo WhatsApp.'
              )}
            </div>
            <a href={wa} target="_blank" rel="noopener noreferrer">
              <Button variant="primary" size="lg" icon={<MessageCircle className="size-4" />}>
                Pedir pelo WhatsApp
              </Button>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function PublicCard({
  item,
  showPrices,
  picked,
  onToggle,
  canPick,
}: {
  item: PublicCatalogItem;
  showPrices: boolean;
  picked: boolean;
  onToggle: () => void;
  canPick: boolean;
}): React.ReactElement {
  return (
    <article className={cn('flex flex-col bg-surface border rounded-card overflow-hidden shadow-card transition-colors', picked ? 'border-primary' : 'border-border')}>
      <div className="relative aspect-[4/3] bg-surface-2">
        <ProductImage item={item} />
      </div>
      <div className="flex flex-col flex-1 p-3 sm:p-3.5 gap-1">
        <h3 className="text-sm font-semibold text-fg leading-snug line-clamp-2">{item.name}</h3>
        {item.description && <p className="text-xs text-muted line-clamp-2 max-sm:hidden">{item.description}</p>}
        <div className="mt-auto pt-2">
          {showPrices && item.price != null ? (
            <div className="flex items-baseline gap-1">
              <span className="text-[17px] font-semibold text-fg num">{money(item.price)}</span>
              <span className="text-xs text-muted">/{unitShort(item.unit)}</span>
            </div>
          ) : (
            <div className="text-xs text-muted">Vendido por {item.unit === 'KG' ? 'quilo' : 'unidade'}</div>
          )}
        </div>
        {canPick && (
          <div className="pt-2">
            <Button block size="sm" variant={picked ? 'primary' : 'secondary'} icon={picked ? <Check className="size-4" /> : <Plus className="size-4" />} onClick={onToggle} aria-pressed={picked}>
              {picked ? 'Marcado' : 'Quero este'}
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}
