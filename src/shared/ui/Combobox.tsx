import { Check, ChevronsUpDown, Plus, X } from 'lucide-react';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { matchesSearch } from '../domain/format';
import { cn } from './Button';
import { controlCls } from './form';

export interface ComboOption {
  value: string;
  label: string;
  description?: string;
  /** Texto extra usado só na busca (documento, código…). */
  keywords?: string;
  right?: React.ReactNode;
  disabled?: boolean;
}

/**
 * Seleção com busca (listas grandes: clientes, produtos, lotes).
 * Teclado: ↑ ↓ Enter Esc.
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = 'Selecione…',
  searchPlaceholder = 'Digite para buscar…',
  allowClear,
  disabled,
  className,
  onCreate,
  createLabel = 'Cadastrar novo',
  emptyText = 'Nada encontrado',
  maxResults = 80,
}: {
  value: string | null | undefined;
  onChange: (value: string | null, option: ComboOption | null) => void;
  options: ComboOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  allowClear?: boolean;
  disabled?: boolean;
  className?: string;
  onCreate?: (text: string) => void;
  createLabel?: string;
  emptyText?: string;
  maxResults?: number;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [rect, setRect] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null);

  const selected = options.find((o) => o.value === value) || null;
  const filtered = useMemo(
    () => options.filter((o) => matchesSearch([o.label, o.description, o.keywords], q)).slice(0, maxResults),
    [options, q, maxResults],
  );

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const spaceBelow = window.innerHeight - r.bottom;
      const up = spaceBelow < 300 && r.top > spaceBelow;
      setRect({ left: r.left, top: up ? r.top : r.bottom, width: Math.max(r.width, 260), up });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setHi(0);
    setTimeout(() => inputRef.current?.focus(), 0);
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => setHi(0), [q]);

  const pick = (o: ComboOption) => {
    if (o.disabled) return;
    onChange(o.value, o);
    setOpen(false);
    setQ('');
    btnRef.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHi((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHi((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[hi]) pick(filtered[hi]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      btnRef.current?.focus();
    }
  };

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${hi}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [hi]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(controlCls, 'flex items-center justify-between gap-2 text-left cursor-pointer', className)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={cn('truncate', !selected && 'text-subtle')}>{selected ? selected.label : placeholder}</span>
        <span className="flex items-center gap-1 shrink-0">
          {allowClear && selected && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Limpar"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null, null);
              }}
              className="p-0.5 text-subtle hover:text-fg"
            >
              <X className="size-3.5" />
            </span>
          )}
          <ChevronsUpDown className="size-4 text-subtle" />
        </span>
      </button>
      {open &&
        rect &&
        createPortal(
          <div
            ref={listRef}
            className="fixed z-[80] rounded-card border border-border bg-surface shadow-pop anim-pop overflow-hidden"
            style={{
              left: Math.min(rect.left, window.innerWidth - rect.width - 8),
              width: rect.width,
              ...(rect.up ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.top + 4 }),
            }}
            onKeyDown={onKey}
          >
            <div className="p-2 border-b border-border">
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full h-8 px-2 text-sm bg-surface-2 rounded-control outline-none border border-transparent focus:border-primary"
              />
            </div>
            <div role="listbox" className="max-h-72 overflow-y-auto p-1">
              {filtered.length === 0 && <div className="px-3 py-6 text-center text-sm text-muted">{emptyText}</div>}
              {filtered.map((o, i) => (
                <div
                  key={o.value}
                  data-idx={i}
                  role="option"
                  aria-selected={o.value === value}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => pick(o)}
                  className={cn(
                    'flex items-center gap-2 px-2.5 py-2 rounded-control cursor-pointer text-sm',
                    i === hi && 'bg-surface-2',
                    o.disabled && 'opacity-40 cursor-not-allowed',
                  )}
                >
                  <Check className={cn('size-4 shrink-0 text-primary', o.value === value ? 'opacity-100' : 'opacity-0')} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{o.label}</div>
                    {o.description && <div className="truncate text-xs text-muted">{o.description}</div>}
                  </div>
                  {o.right && <div className="shrink-0 text-xs text-muted num">{o.right}</div>}
                </div>
              ))}
            </div>
            {onCreate && (
              <button
                type="button"
                onClick={() => {
                  onCreate(q);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-primary border-t border-border hover:bg-surface-2 cursor-pointer"
              >
                <Plus className="size-4" /> {createLabel}
                {q && <span className="text-muted truncate">“{q}”</span>}
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
