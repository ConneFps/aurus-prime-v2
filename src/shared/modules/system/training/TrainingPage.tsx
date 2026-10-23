import { BookOpen, SearchX } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSession } from '../../../app/session';
import { Card, Checkbox, cn, EmptyState, PageHeader, SearchInput, Select } from '../../../ui';
import { GUIDE_SECTIONS, GUIDES, searchGuides, searchSnippet, type ResolvedGuide } from './content';
import { GuideView } from './GuideView';

const DEFAULT_GUIDE = 'primeiros-passos';
const ONLY_MINE_KEY = 'aurus.training.onlyMine';

export function TrainingPage() {
  const { can } = useSession();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [onlyMine, setOnlyMine] = useState(() => {
    try {
      return localStorage.getItem(ONLY_MINE_KEY) !== '0';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(ONLY_MINE_KEY, onlyMine ? '1' : '0');
    } catch {
      /* armazenamento indisponível */
    }
  }, [onlyMine]);

  const list = useMemo(() => GUIDES.filter((g) => !onlyMine || !g.permission || can(g.permission)), [onlyMine, can]);
  const requested = params.get('g');
  const current = GUIDES.find((g) => g.id === requested) || GUIDES.find((g) => g.id === DEFAULT_GUIDE)!;
  const idx = list.findIndex((g) => g.id === current.id);
  const results = useMemo(() => (q.trim() ? searchGuides(q, list) : null), [q, list]);

  const select = (id: string) => {
    setParams({ g: id });
    setQ('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <PageHeader
        eyebrow="Sistema"
        title="Treinamento"
        subtitle="Central de ajuda do Aurus Prime 2.0: para que serve cada tela, passo a passo das tarefas comuns, dicas e perguntas frequentes."
      />

      <div className="grid gap-5 lg:grid-cols-[272px_1fr] items-start">
        {/* Índice (desktop) + busca */}
        <aside className="lg:sticky lg:top-4 space-y-3 min-w-0">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar ajuda…" />
          <div className="lg:hidden">
            <Select
              value={current.id}
              onChange={select}
              options={list.map((g) => ({ value: g.id, label: `${g.section} · ${g.title}` }))}
            />
          </div>
          <Card padded={false} className="max-lg:hidden max-h-[calc(100vh-180px)] overflow-y-auto">
            <nav className="py-2" aria-label="Índice do treinamento">
              {GUIDE_SECTIONS.map((sec) => {
                const items = list.filter((g) => g.section === sec);
                if (!items.length) return null;
                return (
                  <div key={sec} className="py-1.5">
                    <div className="px-4 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-subtle">{sec}</div>
                    {items.map((g) => (
                      <IndexItem key={g.id} guide={g} active={g.id === current.id && !results} onClick={() => select(g.id)} />
                    ))}
                  </div>
                );
              })}
            </nav>
          </Card>
          <Checkbox checked={onlyMine} onChange={setOnlyMine} label="Só as telas do meu perfil" className="px-1" />
        </aside>

        <main className="min-w-0">
          {results ? (
            <SearchResults q={q} results={results} onSelect={select} />
          ) : (
            <GuideView guide={current} prev={idx > 0 ? list[idx - 1] : undefined} next={idx >= 0 && idx < list.length - 1 ? list[idx + 1] : undefined} onSelect={select} />
          )}
        </main>
      </div>
    </>
  );
}

function IndexItem({ guide, active, onClick }: { guide: ResolvedGuide; active: boolean; onClick: () => void }) {
  const Icon = guide.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'w-full flex items-center gap-2.5 px-4 py-1.5 text-left text-[13px] cursor-pointer transition-colors border-l-2',
        active ? 'border-primary bg-primary-soft/60 text-fg font-medium' : 'border-transparent text-muted hover:text-fg hover:bg-surface-2',
      )}
    >
      <Icon className={cn('size-4 shrink-0', active ? 'text-primary' : 'text-subtle')} />
      <span className="truncate">{guide.title}</span>
    </button>
  );
}

function SearchResults({ q, results, onSelect }: { q: string; results: ResolvedGuide[]; onSelect: (id: string) => void }) {
  if (!results.length)
    return (
      <Card>
        <EmptyState icon={<SearchX className="size-5" />} title={`Nada encontrado para "${q}"`} description="Tente outra palavra (ex.: pedido, estoque, comissão) ou navegue pelo índice." />
      </Card>
    );
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        {results.length} {results.length === 1 ? 'guia encontrado' : 'guias encontrados'} para <strong className="text-fg">“{q}”</strong>
      </p>
      {results.map((g) => {
        const Icon = g.icon || BookOpen;
        return (
          <button
            key={g.id}
            type="button"
            onClick={() => onSelect(g.id)}
            className="w-full text-left rounded-card border border-border bg-surface p-4 hover:border-border-strong transition-colors cursor-pointer flex gap-3"
          >
            <span className="size-9 rounded-control bg-primary-soft text-primary flex items-center justify-center shrink-0">
              <Icon className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] uppercase tracking-wider text-subtle">{g.section}</span>
              <span className="block text-sm font-semibold text-fg">{g.title}</span>
              <span className="block text-xs text-muted mt-1 line-clamp-2">{searchSnippet(g, q)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
