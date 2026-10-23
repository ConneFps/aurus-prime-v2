import React from 'react';
import { cn } from './Button';

export interface TabItem<V extends string = string> {
  value: V;
  label: React.ReactNode;
  icon?: React.ReactNode;
  count?: number;
  hidden?: boolean;
}

/** Abas sublinhadas (navegação dentro de uma página de detalhe). */
export function Tabs<V extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: V;
  onChange: (v: V) => void;
  items: TabItem<V>[];
  className?: string;
}) {
  return (
    <div className={cn('border-b border-border scroll-x', className)}>
      <div role="tablist" className="flex gap-1 min-w-max">
        {items
          .filter((t) => !t.hidden)
          .map((t) => {
            const active = t.value === value;
            return (
              <button
                key={t.value}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => onChange(t.value)}
                className={cn(
                  'relative inline-flex items-center gap-2 h-10 px-3 text-sm font-medium whitespace-nowrap cursor-pointer transition-colors',
                  active ? 'text-fg' : 'text-muted hover:text-fg',
                )}
              >
                {t.icon && <span className="[&>svg]:size-4 opacity-80">{t.icon}</span>}
                {t.label}
                {t.count !== undefined && (
                  <span className={cn('num text-[10px] px-1.5 rounded-full', active ? 'bg-primary-soft text-primary' : 'bg-surface-2 text-muted')}>{t.count}</span>
                )}
                {active && <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-primary" />}
              </button>
            );
          })}
      </div>
    </div>
  );
}
