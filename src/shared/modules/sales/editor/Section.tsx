import React from 'react';
import { Card, cn } from '../../../ui';

/** Cartão numerado de uma etapa do formulário de venda. */
export function Section({
  step,
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  step: number;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('space-y-4', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="size-7 rounded-full bg-primary-soft text-primary text-xs font-semibold flex items-center justify-center shrink-0 num">{step}</span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-fg leading-7">{title}</h2>
            {subtitle && <p className="text-xs text-muted -mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children}
    </Card>
  );
}
