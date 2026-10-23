/**
 * Cartão do animal (grade do plantel) e versão compacta (mapa do haras).
 */
import { Baby, BellRing, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { date } from '../../domain/format';
import { EQUINE_SEX_LABELS, EQUINE_STATUS } from '../../domain/labels';
import type { Equine } from '../../domain/types';
import { Badge, cn, StatusBadge } from '../../ui';
import { ageLabel, gestation } from './model';
import { EquinePhoto } from './parts';

export function EquineCard({ equine: e, alerts = 0 }: { equine: Equine; alerts?: number }) {
  const g = gestation(e);
  const place = [e.haras, e.paddock].filter(Boolean).join(' · ');
  const alertChip = alerts > 0 && (
    <span className="inline-flex items-center gap-1 rounded-pill bg-warning-soft text-warning px-2 py-0.5 text-[11px] font-medium" title={`${alerts} lembrete(s)`}>
      <BellRing className="size-3" />
      {alerts}
    </span>
  );
  return (
    <Link
      to={`/equinos/${e.id}`}
      className="group flex flex-row min-[480px]:flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card hover:border-border-strong transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <div className="relative w-28 shrink-0 min-[480px]:w-full">
        <EquinePhoto equine={e} rounded="rounded-none" className="h-full w-full min-h-28 min-[480px]:h-auto min-[480px]:min-h-0 min-[480px]:aspect-[16/10]" textSize="text-3xl min-[480px]:text-4xl" />
        <div className="absolute left-2 top-2 max-[479px]:hidden rounded-pill bg-surface/85 backdrop-blur-sm">
          <StatusBadge info={EQUINE_STATUS[e.status]} />
        </div>
        {alertChip && <div className="absolute right-2 top-2 max-[479px]:hidden rounded-pill bg-surface/85 backdrop-blur-sm">{alertChip}</div>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3 min-[480px]:p-3.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-[15px] font-semibold leading-tight text-fg group-hover:text-primary truncate">{e.name}</h3>
          <span className="text-xs text-muted whitespace-nowrap num">{ageLabel(e.birthDate)}</span>
        </div>
        <div className="text-xs text-muted truncate">
          {EQUINE_SEX_LABELS[e.sex]} · {e.breed}
          {e.coat ? ` · ${e.coat}` : ''}
        </div>
        <div className="flex items-center gap-1.5 min-[480px]:hidden">
          <StatusBadge info={EQUINE_STATUS[e.status]} />
          {alertChip}
        </div>
        {g && (
          <div className="flex items-center gap-1.5 text-xs text-accent min-w-0">
            <Baby className="size-3.5 shrink-0" />
            <span className="truncate">
              Parto {date(g.dueDate)} <span className="text-muted">({g.daysLeft >= 0 ? `faltam ${g.daysLeft} dias` : `${-g.daysLeft} dias atrás`})</span>
            </span>
          </div>
        )}
        <div className="mt-auto pt-1 flex items-center gap-1.5 text-xs text-subtle min-w-0">
          <MapPin className="size-3.5 shrink-0" />
          <span className="truncate">{place || 'Local não informado'}</span>
        </div>
      </div>
    </Link>
  );
}

/** Ficha compacta para o mapa do haras. */
export function EquineChip({ equine: e, className }: { equine: Equine; className?: string }) {
  return (
    <Link
      to={`/equinos/${e.id}`}
      className={cn('flex items-center gap-2.5 rounded-control border border-border bg-surface px-2 py-1.5 hover:border-primary/60 transition-colors min-w-0', className)}
    >
      <EquinePhoto equine={e} rounded="rounded-full" className="size-8" textSize="text-xs" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-fg truncate">{e.name}</div>
        <div className="text-[11px] text-muted truncate">
          {EQUINE_SEX_LABELS[e.sex]} · {ageLabel(e.birthDate)}
        </div>
      </div>
      {e.status !== 'ACTIVE' && (
        <Badge tone={EQUINE_STATUS[e.status].tone} size="xs">
          {EQUINE_STATUS[e.status].label}
        </Badge>
      )}
    </Link>
  );
}
