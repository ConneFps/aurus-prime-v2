import { ArrowLeft, ArrowRight, ChevronDown, ExternalLink, HelpCircle, Lightbulb, Lock, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../../app/session';
import { ROLE_LABELS } from '../../../domain/labels';
import { ROLE_PERMISSIONS } from '../../../domain/permissions';
import type { Role } from '../../../domain/types';
import { Badge, Button, Card, cn } from '../../../ui';
import type { ResolvedGuide } from './content';

const rolesWith = (g: ResolvedGuide): Role[] =>
  g.permission ? (Object.keys(ROLE_PERMISSIONS) as Role[]).filter((r) => r !== 'EXTERNAL_SELLER' && ROLE_PERMISSIONS[r].includes(g.permission!)) : [];

export function GuideView({ guide, prev, next, onSelect }: { guide: ResolvedGuide; prev?: ResolvedGuide; next?: ResolvedGuide; onSelect: (id: string) => void }) {
  const nav = useNavigate();
  const { can } = useSession();
  const Icon = guide.icon;
  const allowed = !guide.permission || can(guide.permission);
  const roles = rolesWith(guide);

  return (
    <article className="space-y-5 min-w-0">
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <span className="size-12 rounded-card bg-primary-soft text-primary flex items-center justify-center shrink-0">
            <Icon className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">{guide.section}</div>
            <h2 className="font-display text-xl sm:text-2xl font-semibold text-fg leading-tight mt-1">{guide.title}</h2>
            <p className="text-sm text-muted mt-2 leading-relaxed max-w-3xl">{guide.summary}</p>
            {(guide.audience || roles.length > 0) && (
              <div className="flex flex-wrap items-center gap-1.5 mt-3">
                <Users className="size-3.5 text-subtle" />
                {guide.audience && <span className="text-xs text-subtle mr-1">{guide.audience}</span>}
                {roles.length > 0 && roles.length < 6 && roles.map((r) => <Badge key={r} size="xs">{ROLE_LABELS[r]}</Badge>)}
              </div>
            )}
          </div>
          {guide.path && (
            <div className="shrink-0">
              {allowed ? (
                <Button variant="primary" icon={<ExternalLink className="size-4" />} onClick={() => nav(guide.path!)} className="max-sm:w-full">
                  Abrir módulo
                </Button>
              ) : (
                <Badge tone="neutral">
                  <Lock className="size-3" /> Sem acesso no seu perfil
                </Badge>
              )}
            </div>
          )}
        </div>
      </Card>

      {guide.tasks.map((t, ti) => (
        <Card key={t.title} as="section">
          <h3 className="text-[15px] font-semibold text-fg flex items-center gap-2.5">
            <span className="text-[11px] num font-semibold text-primary bg-primary-soft rounded-pill px-2 py-0.5">Passo a passo {guide.tasks.length > 1 ? ti + 1 : ''}</span>
            {t.title}
          </h3>
          <ol className="mt-4 space-y-3">
            {t.steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-sm text-fg leading-relaxed">
                <span className="size-6 rounded-full border border-border-strong text-xs num font-semibold text-muted flex items-center justify-center shrink-0 mt-px">{i + 1}</span>
                <span className="min-w-0">{s}</span>
              </li>
            ))}
          </ol>
        </Card>
      ))}

      {!!guide.tips?.length && (
        <Card as="section">
          <h3 className="text-[15px] font-semibold text-fg flex items-center gap-2">
            <Lightbulb className="size-4 text-accent" /> Dicas
          </h3>
          <ul className="mt-3 space-y-2">
            {guide.tips.map((tip, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-muted leading-relaxed">
                <span className="mt-2 size-1.5 rounded-full bg-accent shrink-0" />
                {tip}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!!guide.faq?.length && (
        <Card as="section">
          <h3 className="text-[15px] font-semibold text-fg flex items-center gap-2">
            <HelpCircle className="size-4 text-info" /> Perguntas frequentes
          </h3>
          <div className="mt-3 divide-y divide-border">
            {guide.faq.map((f) => (
              <details key={f.q} className="group py-3">
                <summary className="flex items-center justify-between gap-3 cursor-pointer list-none text-sm font-medium text-fg [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <ChevronDown className="size-4 text-subtle shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <p className="text-sm text-muted mt-2 leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </Card>
      )}

      <div className={cn('grid gap-3', prev && next ? 'sm:grid-cols-2' : '')}>
        {prev && <NavCard dir="prev" guide={prev} onClick={() => onSelect(prev.id)} />}
        {next && <NavCard dir="next" guide={next} onClick={() => onSelect(next.id)} />}
      </div>
    </article>
  );
}

function NavCard({ dir, guide, onClick }: { dir: 'prev' | 'next'; guide: ResolvedGuide; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-card border border-border bg-surface p-4 hover:border-border-strong transition-colors cursor-pointer flex items-center gap-3 min-w-0 text-left',
        dir === 'next' && 'sm:flex-row-reverse sm:text-right',
      )}
    >
      {dir === 'prev' ? <ArrowLeft className="size-4 text-subtle shrink-0" /> : <ArrowRight className="size-4 text-subtle shrink-0" />}
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wider text-subtle">{dir === 'prev' ? 'Anterior' : 'Próximo'}</div>
        <div className="text-sm font-medium text-fg truncate">{guide.title}</div>
      </div>
    </button>
  );
}
