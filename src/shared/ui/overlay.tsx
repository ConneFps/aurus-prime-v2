import { CheckCircle2, Info, MoreHorizontal, X, XCircle } from 'lucide-react';
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toastBridge } from '../data/react';
import { Button, cn, IconButton } from './Button';
import { Field, Textarea } from './form';

function useLockScroll(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}

function useEscape(active: boolean, onClose: () => void) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') ref.current();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [active]);
}

// ---------------------------------------------------------------------------
// Modal (diálogo central)
// ---------------------------------------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  dismissable?: boolean;
}) {
  useLockScroll(open);
  useEscape(open && dismissable, onClose);
  if (!open) return null;
  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px] anim-fade" onClick={dismissable ? onClose : undefined} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative w-full bg-surface border border-border shadow-pop anim-pop flex flex-col',
          'rounded-t-card sm:rounded-card max-h-[92vh]',
          w,
        )}
      >
        {(title || dismissable) && (
          <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
            <div className="min-w-0">
              {title && <h2 className="font-display text-lg font-semibold text-fg leading-tight">{title}</h2>}
              {description && <p className="text-sm text-muted mt-1">{description}</p>}
            </div>
            {dismissable && (
              <IconButton label="Fechar" size="sm" onClick={onClose} className="-mr-1 -mt-1">
                <X className="size-4" />
              </IconButton>
            )}
          </div>
        )}
        <div className="px-5 pb-5 overflow-y-auto">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 px-5 py-3.5 border-t border-border bg-surface-2/50 rounded-b-card">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Drawer (painel lateral — formulários de cadastro)
// ---------------------------------------------------------------------------

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  width?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useLockScroll(open);
  useEscape(open, onClose);
  if (!open) return null;
  const w = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl', xl: 'sm:max-w-5xl' }[width];
  return createPortal(
    <div className="fixed inset-0 z-[65] flex justify-end">
      <div className="absolute inset-0 bg-black/45 anim-fade" onClick={onClose} />
      <aside role="dialog" aria-modal="true" className={cn('relative h-full w-full bg-surface border-l border-border shadow-pop anim-slide flex flex-col', w)}>
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-border">
          <div className="min-w-0">
            {title && <h2 className="font-display text-lg font-semibold text-fg leading-tight">{title}</h2>}
            {description && <p className="text-sm text-muted mt-0.5">{description}</p>}
          </div>
          <IconButton label="Fechar" size="sm" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 px-5 py-3.5 border-t border-border bg-surface-2/50">{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Confirmação e pergunta (promessas)
// ---------------------------------------------------------------------------

interface ConfirmOpts {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}
interface PromptOpts extends ConfirmOpts {
  label?: string;
  placeholder?: string;
  required?: boolean;
  initial?: string;
}

type DialogState =
  | { kind: 'confirm'; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: 'prompt'; opts: PromptOpts; resolve: (v: string | null) => void }
  | null;

const DialogCtx = createContext<{ confirm: (o: ConfirmOpts) => Promise<boolean>; prompt: (o: PromptOpts) => Promise<string | null> } | null>(null);

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DialogState>(null);
  const [text, setText] = useState('');
  const confirm = useCallback((opts: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ kind: 'confirm', opts, resolve })), []);
  const prompt = useCallback(
    (opts: PromptOpts) =>
      new Promise<string | null>((resolve) => {
        setText(opts.initial || '');
        setState({ kind: 'prompt', opts, resolve });
      }),
    [],
  );
  const close = (v: boolean) => {
    if (!state) return;
    if (state.kind === 'confirm') state.resolve(v);
    else state.resolve(v ? text.trim() : null);
    setState(null);
  };
  const o = state?.opts;
  const needsText = state?.kind === 'prompt' && (state.opts.required ?? true) && !text.trim();
  return (
    <DialogCtx.Provider value={{ confirm, prompt }}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        size="sm"
        title={o?.title}
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)}>
              {o?.cancelLabel || 'Cancelar'}
            </Button>
            <Button variant={o?.danger ? 'danger' : 'primary'} disabled={needsText} onClick={() => close(true)}>
              {o?.confirmLabel || 'Confirmar'}
            </Button>
          </>
        }
      >
        {o?.message && <div className="text-sm text-muted">{o.message}</div>}
        {state?.kind === 'prompt' && (
          <Field label={state.opts.label || 'Motivo'} className="mt-3">
            <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={state.opts.placeholder} />
          </Field>
        )}
      </Modal>
    </DialogCtx.Provider>
  );
}

/** const confirm = useConfirm(); if (await confirm({ title: 'Excluir?', danger: true })) … */
export function useConfirm() {
  const c = useContext(DialogCtx);
  if (!c) throw new Error('DialogProvider ausente');
  return c.confirm;
}

/** const reason = await prompt({ title: 'Cancelar pedido', label: 'Motivo' }); if (reason) … */
export function usePrompt() {
  const c = useContext(DialogCtx);
  if (!c) throw new Error('DialogProvider ausente');
  return c.prompt;
}

// ---------------------------------------------------------------------------
// Menu suspenso (ações de linha)
// ---------------------------------------------------------------------------

export interface MenuItem {
  label: React.ReactNode;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  hidden?: boolean;
}

export function Menu({ items, trigger, align = 'end' }: { items: (MenuItem | 'divider')[]; trigger?: React.ReactNode; align?: 'start' | 'end' }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const visible = items.filter((i) => i === 'divider' || !i.hidden);

  useLayoutEffect(() => {
    if (!open) return;
    const r = btn.current!.getBoundingClientRect();
    const mw = 220;
    const left = align === 'end' ? Math.max(8, r.right - mw) : Math.min(r.left, window.innerWidth - mw - 8);
    const estH = visible.length * 38 + 12;
    const top = r.bottom + estH > window.innerHeight - 8 ? Math.max(8, r.top - estH - 4) : r.bottom + 4;
    setPos({ top, left });
    const close = (e: MouseEvent) => {
      if (btn.current?.contains(e.target as Node) || menu.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onScroll = () => {
      const rr = btn.current?.getBoundingClientRect();
      if (!rr || rr.bottom < 0 || rr.top > window.innerHeight) return setOpen(false);
      setPos((p) => (p ? { ...p, left: align === 'end' ? Math.max(8, rr.right - mw) : Math.min(rr.left, window.innerWidth - mw - 8), top: p.top > rr.top ? rr.bottom + 4 : p.top } : p));
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, align, visible.length]);

  if (!visible.some((i) => i !== 'divider')) return null;
  return (
    <>
      {trigger ? (
        <span onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} ref={btn as unknown as React.Ref<HTMLSpanElement>}>
          {trigger}
        </span>
      ) : (
        <IconButton
          ref={btn}
          label="Mais ações"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
        >
          <MoreHorizontal className="size-4" />
        </IconButton>
      )}
      {open &&
        pos &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            className="fixed z-[90] w-[220px] rounded-card border border-border bg-surface shadow-pop p-1 anim-pop"
            style={pos}
            onClick={(e) => e.stopPropagation()}
          >
            {visible.map((it, i) =>
              it === 'divider' ? (
                <div key={i} className="my-1 h-px bg-border" />
              ) : (
                <button
                  key={i}
                  type="button"
                  role="menuitem"
                  disabled={it.disabled}
                  onClick={() => {
                    setOpen(false);
                    it.onClick();
                  }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2.5 h-9 rounded-control text-sm text-left cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed',
                    it.danger ? 'text-danger hover:bg-danger-soft' : 'text-fg hover:bg-surface-2',
                  )}
                >
                  {it.icon && <span className="size-4 shrink-0 [&>svg]:size-4 opacity-80">{it.icon}</span>}
                  <span className="truncate">{it.label}</span>
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

interface ToastItem {
  id: number;
  kind: 'success' | 'error' | 'info';
  message: string;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((kind: ToastItem['kind'], message: string) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-3), { id, kind, message }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 3800);
  }, []);
  useEffect(() => {
    toastBridge.success = (m) => push('success', m);
    toastBridge.error = (m) => push('error', m);
    toastBridge.info = (m) => push('info', m);
  }, [push]);
  return (
    <>
      {children}
      {createPortal(
        <div className="fixed z-[100] top-3 left-3 right-3 sm:top-auto sm:left-auto sm:right-5 sm:bottom-5 flex flex-col gap-2 sm:w-96 pointer-events-none no-print">
          {items.map((t) => (
            <div
              key={t.id}
              role="status"
              className="pointer-events-auto flex items-start gap-3 rounded-card border border-border bg-surface shadow-pop px-4 py-3 anim-pop"
            >
              {t.kind === 'success' ? (
                <CheckCircle2 className="size-5 text-success shrink-0" />
              ) : t.kind === 'error' ? (
                <XCircle className="size-5 text-danger shrink-0" />
              ) : (
                <Info className="size-5 text-info shrink-0" />
              )}
              <p className="text-sm text-fg flex-1 whitespace-pre-line">{t.message}</p>
              <button className="text-subtle hover:text-fg cursor-pointer" onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))} aria-label="Fechar">
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

/** toast.success('Salvo!') — pode ser usado fora de componentes. */
export const toast = {
  success: (m: string) => toastBridge.success(m),
  error: (m: string) => toastBridge.error(m),
  info: (m: string) => toastBridge.info(m),
};
