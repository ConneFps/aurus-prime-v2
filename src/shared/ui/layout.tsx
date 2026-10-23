import { AlertTriangle, ArrowDownRight, ArrowLeft, ArrowUpRight, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react';
import React from 'react';
import { Link } from 'react-router-dom';
import type { LabelInfo, Tone } from '../domain/labels';
import { initials } from '../domain/format';
import { cn } from './Button';

// ---------------------------------------------------------------------------
// Cabeçalho de página
// ---------------------------------------------------------------------------

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
  eyebrow,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** Link de voltar (rota) */
  back?: string;
  eyebrow?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-5 sm:mb-6">
      {back && (
        <Link to={back} className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg mb-3">
          <ArrowLeft className="size-3.5" /> Voltar
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary mb-1.5">{eyebrow}</div>}
          <h1 className="font-display text-2xl sm:text-[28px] leading-tight font-semibold text-fg text-balance">{title}</h1>
          {subtitle && <p className="text-sm text-muted mt-1 max-w-3xl">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Cartões
// ---------------------------------------------------------------------------

export function Card({
  className,
  children,
  padded = true,
  as: As = 'div',
  onClick,
}: {
  className?: string;
  children: React.ReactNode;
  padded?: boolean;
  as?: 'div' | 'section' | 'article';
  onClick?: () => void;
}) {
  return (
    <As
      onClick={onClick}
      className={cn(
        'bg-surface border border-border rounded-card shadow-card',
        padded && 'p-4 sm:p-5',
        onClick && 'cursor-pointer hover:border-border-strong transition-colors',
        className,
      )}
    >
      {children}
    </As>
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
  icon,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 mb-4', className)}>
      <div className="flex items-start gap-3 min-w-0">
        {icon && <div className="size-9 rounded-control bg-primary-soft text-primary flex items-center justify-center shrink-0">{icon}</div>}
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-fg leading-tight">{title}</h3>
          {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Indicadores
// ---------------------------------------------------------------------------

export function Stat({
  label,
  value,
  hint,
  icon,
  tone = 'primary',
  delta,
  deltaLabel,
  onClick,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: Tone;
  /** variação percentual (positivo = alta) */
  delta?: number | null;
  deltaLabel?: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <Card className={cn('flex flex-col gap-2 min-w-0', className)} onClick={onClick}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted uppercase tracking-wider truncate">{label}</span>
        {icon && <span className={cn('max-sm:hidden size-8 rounded-control flex items-center justify-center shrink-0', toneSoft[tone])}>{icon}</span>}
      </div>
      <div className="text-lg sm:text-[21px] 2xl:text-[25px] font-semibold tracking-tight text-fg leading-none truncate" title={typeof value === 'string' ? value : undefined}>{value}</div>
      {(hint || delta !== undefined) && (
        <div className="flex items-center gap-2 text-xs text-muted min-w-0">
          {delta !== undefined && delta !== null && Number.isFinite(delta) && (
            <span className={cn('inline-flex items-center gap-0.5 font-medium num', delta >= 0 ? 'text-success' : 'text-danger')}>
              {delta >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
              {Math.abs(delta).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
            </span>
          )}
          {deltaLabel && <span className="truncate">{deltaLabel}</span>}
          {hint && <span className="truncate">{hint}</span>}
        </div>
      )}
    </Card>
  );
}

export const toneSoft: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted',
  primary: 'bg-primary-soft text-primary',
  accent: 'bg-accent-soft text-accent',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
};

export const toneText: Record<Tone, string> = {
  neutral: 'text-muted',
  primary: 'text-primary',
  accent: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
  dot,
  size = 'sm',
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
  size?: 'xs' | 'sm';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill font-medium whitespace-nowrap',
        size === 'xs' ? 'px-1.5 py-0 text-[10px] leading-4' : 'px-2 py-0.5 text-[11px] leading-5',
        toneSoft[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** Badge a partir de um mapa de status (ex.: SALE_STATUS[sale.status]). */
export function StatusBadge({ info, fallback = '—' }: { info: LabelInfo | undefined; fallback?: string }) {
  if (!info) return <Badge>{fallback}</Badge>;
  return (
    <Badge tone={info.tone} dot>
      {info.label}
    </Badge>
  );
}

export function Stars({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <span className="inline-flex gap-0.5 text-accent" aria-label={`${value} de ${max} estrelas`}>
      {Array.from({ length: max }, (_, i) => (
        <svg key={i} viewBox="0 0 20 20" className={cn('size-3.5', i < value ? 'fill-current' : 'fill-current opacity-20')}>
          <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9z" />
        </svg>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-12 px-6', className)}>
      {icon && <div className="size-12 rounded-full bg-surface-2 text-muted flex items-center justify-center mb-4">{icon}</div>}
      <h3 className="text-[15px] font-semibold text-fg">{title}</h3>
      {description && <p className="text-sm text-muted mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 text-muted text-sm', className)}>
      <Loader2 className="size-5 animate-spin" />
      {label}
    </div>
  );
}

export function PageLoader({ label = 'Carregando…' }: { label?: string }) {
  return <Spinner className="py-24" label={label} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-control', className)} />;
}

export function Callout({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'warning' ? AlertTriangle : tone === 'danger' ? XCircle : Info;
  return (
    <div className={cn('flex gap-3 rounded-card border p-3.5 text-sm', toneSoft[tone], 'border-current/15', className)}>
      <Icon className="size-4.5 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1 text-fg">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={cn('text-fg/80', !!title && 'mt-0.5')}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dados
// ---------------------------------------------------------------------------

export function DescriptionList({
  items,
  cols = 2,
  className,
}: {
  items: { label: React.ReactNode; value: React.ReactNode; span?: boolean; hidden?: boolean }[];
  cols?: 1 | 2 | 3 | 4;
  className?: string;
}) {
  const c = cols === 1 ? '' : cols === 2 ? 'sm:grid-cols-2' : cols === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-4';
  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-3.5', c, className)}>
      {items
        .filter((i) => !i.hidden)
        .map((it, idx) => (
          <div key={idx} className={cn('min-w-0', it.span && 'col-span-full')}>
            <dt className="text-[11px] uppercase tracking-wider text-subtle font-medium">{it.label}</dt>
            <dd className="text-sm text-fg mt-0.5 break-words">{it.value ?? '—'}</dd>
          </div>
        ))}
    </dl>
  );
}

export function Avatar({ name, src, size = 32, className }: { name?: string | null; src?: string | null; size?: number; className?: string }) {
  return src ? (
    <img src={src} alt={name || ''} width={size} height={size} className={cn('rounded-full object-cover shrink-0', className)} style={{ width: size, height: size }} />
  ) : (
    <span
      className={cn('rounded-full bg-primary-soft text-primary font-semibold flex items-center justify-center shrink-0', className)}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials(name)}
    </span>
  );
}

export function Progress({ value, max = 100, tone = 'primary', className }: { value: number; max?: number; tone?: Tone; className?: string }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  const bar: Record<Tone, string> = {
    neutral: 'bg-muted',
    primary: 'bg-primary',
    accent: 'bg-accent',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    info: 'bg-info',
  };
  return (
    <div className={cn('h-1.5 w-full rounded-full bg-surface-3 overflow-hidden', className)}>
      <div className={cn('h-full rounded-full transition-all', bar[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

const dotBg: Record<Tone, string> = {
  neutral: 'bg-muted',
  primary: 'bg-primary',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
};

export function Timeline({
  items,
  className,
}: {
  items: { at: string; title: React.ReactNode; description?: React.ReactNode; tone?: Tone }[];
  className?: string;
}) {
  return (
    <ol className={cn('relative space-y-4 pl-5', className)}>
      <span className="absolute left-[5px] top-1.5 bottom-1.5 w-px bg-border" aria-hidden />
      {items.map((it, i) => (
        <li key={i} className="relative">
          <span className={cn('absolute -left-5 top-1 size-[11px] rounded-full border-2 border-surface', dotBg[it.tone || 'primary'])} />
          <div className="text-sm text-fg">{it.title}</div>
          <div className="text-xs text-subtle num">{it.at}</div>
          {it.description && <div className="text-xs text-muted mt-0.5">{it.description}</div>}
        </li>
      ))}
    </ol>
  );
}

export function Divider({ className, label }: { className?: string; label?: React.ReactNode }) {
  if (label)
    return (
      <div className={cn('flex items-center gap-3 text-xs text-subtle', className)}>
        <span className="h-px flex-1 bg-border" />
        {label}
        <span className="h-px flex-1 bg-border" />
      </div>
    );
  return <hr className={cn('border-border', className)} />;
}

/** Barra de filtros acima de listas. */
export function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 mb-4', className)}>{children}</div>;
}

/** Grade responsiva para indicadores. */
export function StatGrid({ children, cols = 4, className }: { children: React.ReactNode; cols?: 2 | 3 | 4 | 5 | 6; className?: string }) {
  const c = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-3',
    4: 'grid-cols-2 lg:grid-cols-4',
    5: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-5',
    6: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6',
  }[cols];
  return <div className={cn('grid gap-3 sm:gap-4', c, className)}>{children}</div>;
}

/** Número com fonte tabular; tons para positivo/negativo. */
export function Num({ children, tone, className }: { children: React.ReactNode; tone?: 'auto' | Tone; value?: number; className?: string }) {
  return <span className={cn('num', tone && tone !== 'auto' && toneText[tone], className)}>{children}</span>;
}
