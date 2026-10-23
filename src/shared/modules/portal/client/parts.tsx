/**
 * Peças visuais do portal do cliente (marca, quantidade, imagem, WhatsApp).
 */
import { Beef, MessageCircle, Minus, Package, Plus } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { initials, number } from '../../../domain/format';
import type { CatalogItem } from '../../../domain/types';
import { cn, parseNumber } from '../../../ui';
import { decQty, incQty, snapQty, unitShort } from '../lib';

export function BrandMark({ name, logoUrl, size = 36 }: { name: string; logoUrl?: string | null; size?: number }) {
  if (logoUrl) return <img src={logoUrl} alt={name} className="rounded-control object-contain shrink-0" style={{ width: size, height: size }} />;
  return (
    <span
      className="rounded-control bg-primary text-primary-fg font-display font-semibold flex items-center justify-center shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

/** Foto do produto ou ilustração neutra com a categoria. */
export function ProductImage({
  item,
  className,
  compact,
}: {
  item: Pick<CatalogItem, 'imageUrl' | 'name' | 'category' | 'unit'>;
  className?: string;
  compact?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  if (item.imageUrl && !broken) {
    return <img src={item.imageUrl} alt={item.name} loading="lazy" onError={() => setBroken(true)} className={cn('object-cover w-full h-full', className)} />;
  }
  const Icon = item.unit === 'UN' && !/carne|hamb|lingui/i.test(item.category + item.name) ? Package : Beef;
  return (
    <div className={cn('w-full h-full flex flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-primary-soft via-surface-2 to-surface-2 text-primary', className)}>
      <Icon className={compact ? 'size-5 opacity-80' : 'size-9 opacity-70'} strokeWidth={1.4} />
      {!compact && <span className="text-[10px] uppercase tracking-[0.16em] text-muted">{item.category}</span>}
    </div>
  );
}

/** − [quantidade] + com digitação livre (ajusta ao passo ao sair do campo). */
export function QtyStepper({
  item,
  value,
  onChange,
  size = 'md',
  className,
}: {
  item: Pick<CatalogItem, 'minQty' | 'step' | 'unit' | 'name'>;
  value: number;
  onChange: (qty: number) => void;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const [text, setText] = useState(number(value, 3));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(number(value, 3));
  }, [value, focused]);
  const h = size === 'sm' ? 'h-8' : 'h-10';
  const btn = cn(
    'shrink-0 flex items-center justify-center text-fg hover:bg-surface-3 transition-colors cursor-pointer',
    size === 'sm' ? 'w-8' : 'w-10',
  );
  return (
    <div className={cn('flex items-stretch rounded-control border border-border-strong bg-surface-2 overflow-hidden', h, className)}>
      <button type="button" className={btn} onClick={() => onChange(decQty(item, value))} aria-label={`Diminuir ${item.name}`}>
        <Minus className="size-4" />
      </button>
      <label className="flex-1 min-w-0 flex items-center justify-center gap-1 px-1 border-x border-border-strong bg-surface">
        <input
          inputMode="decimal"
          value={text}
          aria-label={`Quantidade de ${item.name}`}
          onFocus={(e) => {
            setFocused(true);
            requestAnimationFrame(() => e.target.select());
          }}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            setFocused(false);
            const n = parseNumber(text);
            onChange(n === null ? value : snapQty(item, n));
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className="w-full min-w-0 bg-transparent text-center text-sm font-semibold num text-fg focus:outline-none"
        />
        <span className="text-xs text-muted shrink-0 pr-1">{unitShort(item.unit)}</span>
      </label>
      <button type="button" className={btn} onClick={() => onChange(incQty(item, value))} aria-label={`Aumentar ${item.name}`}>
        <Plus className="size-4" />
      </button>
    </div>
  );
}

export function qtyRuleText(item: Pick<CatalogItem, 'minQty' | 'step' | 'unit'>): string {
  const u = unitShort(item.unit);
  const parts: string[] = [];
  if (item.minQty > 0) parts.push(`mín. ${number(item.minQty, 3)} ${u}`);
  if (item.step > 0 && item.step !== 1) parts.push(`+${number(item.step, 3)} ${u}`);
  return parts.join(' · ');
}

/** Botão flutuante de WhatsApp (canto inferior direito). */
export function WhatsAppFab({ href, raised }: { href: string; raised?: 'nav' | 'bar' }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar com a nossa equipe pelo WhatsApp"
      title="Falar pelo WhatsApp"
      className={cn(
        'fixed right-4 sm:right-6 z-40 size-13 rounded-full bg-success text-bg shadow-pop flex items-center justify-center',
        'hover:scale-105 active:scale-95 transition-transform',
        raised === 'bar' ? 'max-sm:hidden sm:bottom-6' : raised === 'nav' ? 'bottom-[80px] sm:bottom-6' : 'bottom-5 sm:bottom-6',
      )}
    >
      <MessageCircle className="size-6" strokeWidth={2.2} />
    </a>
  );
}

/** Tela centralizada (estados de conta, sucesso, erro). */
export function CenteredScreen({
  brand,
  icon,
  tone = 'primary',
  title,
  children,
  actions,
}: {
  brand?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'primary' | 'warning' | 'danger' | 'success' | 'info';
  title: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const toneCls = {
    primary: 'bg-primary-soft text-primary',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
    success: 'bg-success-soft text-success',
    info: 'bg-info-soft text-info',
  }[tone];
  return (
    <div className="min-h-dvh bg-bg flex flex-col">
      {brand && <div className="px-4 sm:px-6 py-4">{brand}</div>}
      <div className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md text-center anim-pop">
          {icon && <div className={cn('mx-auto size-14 rounded-full flex items-center justify-center mb-5 [&>svg]:size-6', toneCls)}>{icon}</div>}
          <h1 className="font-display text-2xl font-semibold text-fg text-balance">{title}</h1>
          {children && <div className="mt-2 text-sm text-muted leading-relaxed">{children}</div>}
          {actions && <div className="mt-7 flex flex-col sm:flex-row gap-2 justify-center">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
