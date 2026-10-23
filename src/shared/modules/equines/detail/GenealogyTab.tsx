/**
 * Genealogia: árvore de 3 gerações (CSS), filhos no plantel e notas genéticas.
 */
import { Dna, GitFork, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { normalize } from '../../../domain/format';
import { EQUINE_SEX_LABELS, EQUINE_STATUS } from '../../../domain/labels';
import type { Equine } from '../../../domain/types';
import { Button, Card, CardHeader, cn, DescriptionList, StatusBadge } from '../../../ui';
import { ageLabel } from '../model';
import { EquinePhoto } from '../parts';

type Sex = 'M' | 'F';

function Node({ role, name, registry, sex, herd, className }: { role: string; name?: string | null; registry?: string | null; sex: Sex; herd: Equine[]; className?: string }) {
  const match = name ? herd.find((h) => normalize(h.name) === normalize(name)) : undefined;
  const body = (
    <>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-subtle">{role}</div>
      <div className={cn('mt-0.5 text-[13px] sm:text-sm font-medium leading-snug line-clamp-2 break-words', name ? 'text-fg' : 'text-subtle italic font-normal')}>{name || 'Não informado'}</div>
      {registry && <div className="mt-0.5 truncate text-[11px] text-muted num">{registry}</div>}
    </>
  );
  const cls = cn(
    'block min-w-0 rounded-control border border-border bg-surface-2/60 px-2.5 py-2 sm:px-3 border-l-[3px]',
    sex === 'M' ? 'border-l-info' : 'border-l-accent',
    match && 'hover:border-primary/60 hover:bg-surface-2',
    className,
  );
  return match ? (
    <Link to={`/equinos/${match.id}?aba=genealogia`} className={cls} title="Abrir ficha">
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Colchete que liga um nó aos dois nós da geração seguinte. */
function Bracket({ className }: { className?: string }) {
  return (
    <div className={cn('relative', className)} aria-hidden>
      <span className="absolute left-0 top-1/2 w-1/2 border-t border-border-strong" />
      <span className="absolute left-1/2 right-0 top-1/4 bottom-1/4 rounded-l-md border-y border-l border-border-strong" />
    </div>
  );
}

export function PedigreeTree({ equine: e, herd }: { equine: Equine; herd: Equine[] }) {
  const cell = 'flex flex-col justify-center py-1';
  return (
    <div>
      {/* Celular: o próprio animal fica acima da árvore */}
      <div className="sm:hidden mb-2 flex items-center gap-2.5 rounded-control bg-primary-soft px-3 py-2">
        <EquinePhoto equine={e} rounded="rounded-full" className="size-8" textSize="text-xs" />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-fg truncate">{e.name}</div>
          <div className="text-[11px] text-muted">{[EQUINE_SEX_LABELS[e.sex], e.registry].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      <div className="grid grid-rows-4 grid-cols-[minmax(0,1fr)_14px_minmax(0,1fr)] sm:grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)_24px_minmax(0,1fr)]">
        {/* Geração 0 (desktop) */}
        <div className={cn(cell, 'max-sm:hidden col-start-1 row-start-1 row-span-4')}>
          <div className="rounded-card border border-primary/40 bg-primary-soft p-3">
            <div className="flex items-center gap-2.5">
              <EquinePhoto equine={e} rounded="rounded-full" className="size-10" textSize="text-sm" />
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">Animal</div>
                <div className="font-display text-[15px] font-semibold leading-tight text-fg break-words">{e.name}</div>
              </div>
            </div>
            <div className="mt-2 text-[11px] text-muted">{[EQUINE_SEX_LABELS[e.sex], e.breed, ageLabel(e.birthDate)].filter(Boolean).join(' · ')}</div>
            {e.registry && <div className="text-[11px] text-muted num">{e.registry}</div>}
          </div>
        </div>
        <Bracket className="max-sm:hidden col-start-2 row-start-1 row-span-4" />
        {/* Geração 1 */}
        <div className={cn(cell, 'col-start-1 sm:col-start-3 row-start-1 row-span-2')}>
          <Node role="Pai" name={e.sireName} registry={e.sireRegistry} sex="M" herd={herd} />
        </div>
        <div className={cn(cell, 'col-start-1 sm:col-start-3 row-start-3 row-span-2')}>
          <Node role="Mãe" name={e.damName} registry={e.damRegistry} sex="F" herd={herd} />
        </div>
        <Bracket className="col-start-2 sm:col-start-4 row-start-1 row-span-2" />
        <Bracket className="col-start-2 sm:col-start-4 row-start-3 row-span-2" />
        {/* Geração 2 */}
        <div className={cn(cell, 'col-start-3 sm:col-start-5 row-start-1')}>
          <Node role="Avô paterno" name={e.paternalGrandsire} sex="M" herd={herd} />
        </div>
        <div className={cn(cell, 'col-start-3 sm:col-start-5 row-start-2')}>
          <Node role="Avó paterna" name={e.paternalGranddam} sex="F" herd={herd} />
        </div>
        <div className={cn(cell, 'col-start-3 sm:col-start-5 row-start-3')}>
          <Node role="Avô materno" name={e.maternalGrandsire} sex="M" herd={herd} />
        </div>
        <div className={cn(cell, 'col-start-3 sm:col-start-5 row-start-4')}>
          <Node role="Avó materna" name={e.maternalGranddam} sex="F" herd={herd} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-[3px] rounded-full bg-info" /> Linha masculina
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-[3px] rounded-full bg-accent" /> Linha feminina
        </span>
        <span>Toque num nome para abrir a ficha quando o animal está no plantel.</span>
      </div>
    </div>
  );
}

export function GenealogyTab({ equine: e, herd, canEdit, onEdit }: { equine: Equine; herd: Equine[]; canEdit: boolean; onEdit: () => void }) {
  const key = normalize(e.name);
  const offspring = herd.filter((h) => h.id !== e.id && (normalize(h.sireName) === key || normalize(h.damName) === key));
  const siblings = herd.filter(
    (h) => h.id !== e.id && ((e.sireName && normalize(h.sireName) === normalize(e.sireName)) || (e.damName && normalize(h.damName) === normalize(e.damName))),
  );
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          icon={<GitFork className="size-4" />}
          title="Árvore genealógica"
          subtitle="Três gerações: animal, pais e avós"
          actions={
            canEdit && (
              <Button size="sm" onClick={onEdit}>
                Editar
              </Button>
            )
          }
        />
        <PedigreeTree equine={e} herd={herd} />
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader icon={<Dna className="size-4" />} title="Notas genéticas e documentação" />
          <DescriptionList
            cols={1}
            items={[
              { label: 'Observações genéticas', value: e.geneticNotes || '—' },
              { label: 'Teste genético', value: e.geneticTest || '—' },
              { label: 'Pedigree / registro', value: e.pedigreeNotes || '—' },
            ]}
          />
        </Card>
        <Card>
          <CardHeader icon={<Users className="size-4" />} title="Família no plantel" subtitle="Filhos e irmãos cadastrados" />
          {offspring.length + siblings.length ? (
            <ul className="divide-y divide-border -my-2">
              {[...offspring.map((o) => ({ o, rel: e.sex === 'EGUA' ? 'Filho(a) — mãe' : 'Filho(a) — pai' })), ...siblings.map((o) => ({ o, rel: 'Irmão(ã)' }))].map(({ o, rel }) => (
                <li key={o.id + rel} className="flex items-center justify-between gap-3 py-2">
                  <Link to={`/equinos/${o.id}`} className="flex min-w-0 items-center gap-2.5 hover:text-primary">
                    <EquinePhoto equine={o} rounded="rounded-full" className="size-8" textSize="text-xs" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-fg">{o.name}</span>
                      <span className="block text-xs text-muted">
                        {rel} · {EQUINE_SEX_LABELS[o.sex]} · {ageLabel(o.birthDate)}
                      </span>
                    </span>
                  </Link>
                  <StatusBadge info={EQUINE_STATUS[o.status]} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-subtle">Nenhum filho ou irmão cadastrado no plantel.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
