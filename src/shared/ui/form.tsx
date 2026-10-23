import { Search, X } from 'lucide-react';
import React, { useEffect, useId, useState } from 'react';
import { formatCep, formatDocument, formatPhone, lookupCep } from '../domain/format';
import { cn } from './Button';

// ---------------------------------------------------------------------------
// Estrutura de formulário
// ---------------------------------------------------------------------------

const FieldCtx = React.createContext<{ id?: string; invalid?: boolean }>({});

export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
  span,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null | false;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
  /** Quantas colunas ocupar no FormGrid (1-4, ou 'full'). */
  span?: 1 | 2 | 3 | 4 | 'full';
}) {
  const id = useId();
  const spanCls =
    span === 'full' ? 'col-span-full' : span === 2 ? 'sm:col-span-2' : span === 3 ? 'sm:col-span-3' : span === 4 ? 'sm:col-span-4' : '';
  return (
    <FieldCtx.Provider value={{ id, invalid: !!error }}>
      <div className={cn('flex flex-col gap-1.5 min-w-0', spanCls, className)}>
        {label && (
          <label htmlFor={id} className="text-xs font-medium text-muted tracking-wide">
            {label}
            {required && <span className="text-danger ml-0.5">*</span>}
          </label>
        )}
        {children}
        {error ? (
          <p className="text-xs text-danger">{error}</p>
        ) : hint ? (
          <p className="text-xs text-subtle">{hint}</p>
        ) : null}
      </div>
    </FieldCtx.Provider>
  );
}

export function FormGrid({ cols = 2, className, children }: { cols?: 1 | 2 | 3 | 4; className?: string; children: React.ReactNode }) {
  const c = cols === 1 ? '' : cols === 2 ? 'sm:grid-cols-2' : cols === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-4';
  return <div className={cn('grid grid-cols-1 gap-x-4 gap-y-4', c, className)}>{children}</div>;
}

export function FormSection({
  title,
  description,
  children,
  className,
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}) {
  return (
    <section className={cn('space-y-4', className)}>
      <div className="flex items-end justify-between gap-3 border-b border-border pb-2">
        <div>
          <h3 className="text-sm font-semibold text-fg">{title}</h3>
          {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Controles
// ---------------------------------------------------------------------------

export const controlCls =
  'w-full h-10 rounded-control border bg-surface px-3 text-sm text-fg placeholder:text-subtle transition-colors ' +
  'border-border-strong hover:border-muted/60 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 ' +
  'disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-surface-2';

function useFieldProps(props: { id?: string; 'aria-invalid'?: unknown }) {
  const ctx = React.useContext(FieldCtx);
  const inv = props['aria-invalid'] ?? (ctx.invalid || undefined);
  return { id: props.id ?? ctx.id, 'aria-invalid': inv ? true : undefined };
}

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input({ className, prefix, suffix, ...rest }, ref) {
  const fp = useFieldProps(rest);
  if (prefix || suffix) {
    return (
      <div className={cn('relative flex items-center', className)}>
        {prefix && <span className="absolute left-3 text-sm text-subtle pointer-events-none">{prefix}</span>}
        <input ref={ref} {...rest} {...fp} className={cn(controlCls, prefix ? 'pl-9' : '', suffix ? 'pr-10' : '', fp['aria-invalid'] && 'border-danger')} />
        {suffix && <span className="absolute right-3 text-xs text-subtle pointer-events-none">{suffix}</span>}
      </div>
    );
  }
  return <input ref={ref} {...rest} {...fp} className={cn(controlCls, fp['aria-invalid'] && 'border-danger', className)} />;
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 3, ...rest },
  ref,
) {
  const fp = useFieldProps(rest);
  return <textarea ref={ref} rows={rows} {...rest} {...fp} className={cn(controlCls, 'h-auto py-2 leading-relaxed resize-y', className)} />;
});

export interface Option<V extends string = string> {
  value: V;
  label: string;
  disabled?: boolean;
}

export function Select<V extends string = string>({
  value,
  onChange,
  options,
  placeholder,
  className,
  disabled,
  id,
  required,
  name,
}: {
  value: V | '' | null | undefined;
  onChange: (v: V) => void;
  options: Option<V>[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  required?: boolean;
  name?: string;
}) {
  const fp = useFieldProps({ id });
  return (
    <select
      {...fp}
      name={name}
      required={required}
      disabled={disabled}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value as V)}
      className={cn(controlCls, 'pr-8 appearance-none bg-no-repeat cursor-pointer', !value && 'text-subtle', className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundPosition: 'right 10px center',
      }}
    >
      {placeholder !== undefined && (
        <option value="" disabled={required}>
          {placeholder}
        </option>
      )}
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled} className="text-fg bg-surface">
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Converte texto digitado (1.234,56 | 1234.56 | 1234,5) em número. */
export function parseNumber(s: string): number | null {
  const t = (s || '').trim().replace(/[R$\s%]/g, '').replace(/kg$/i, '');
  if (!t) return null;
  let norm = t;
  if (t.includes(',')) norm = t.replace(/\./g, '').replace(',', '.');
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

function fmt(n: number | null | undefined, decimals: number, minDecimals = decimals) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: minDecimals, maximumFractionDigits: decimals }).format(n);
}

export interface NumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'prefix'> {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  decimals?: number;
  minDecimals?: number;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}

/** Campo numérico pt-BR (vírgula decimal). Mostra formatado quando fora de foco. */
export function NumberInput({ value, onChange, decimals = 2, minDecimals = 0, prefix, suffix, className, onBlur, onFocus, ...rest }: NumberInputProps) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(fmt(value, decimals, minDecimals));
  useEffect(() => {
    if (!focused) setText(fmt(value, decimals, minDecimals));
  }, [value, focused, decimals, minDecimals]);
  return (
    <Input
      {...rest}
      inputMode="decimal"
      prefix={prefix}
      suffix={suffix}
      className={cn('num', className)}
      value={text}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
        requestAnimationFrame(() => e.target.select());
      }}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseNumber(e.target.value));
      }}
      onBlur={(e) => {
        setFocused(false);
        const n = parseNumber(text);
        const r = n === null ? null : Math.round(n * 10 ** decimals) / 10 ** decimals;
        onChange(r);
        setText(fmt(r, decimals, minDecimals));
        onBlur?.(e);
      }}
    />
  );
}

export function MoneyInput(props: Omit<NumberInputProps, 'decimals' | 'prefix'>) {
  return <NumberInput {...props} decimals={2} minDecimals={2} prefix="R$" />;
}

export function WeightInput(props: Omit<NumberInputProps, 'decimals' | 'suffix'> & { unit?: 'KG' | 'UN' }) {
  const { unit = 'KG', ...rest } = props;
  return <NumberInput {...rest} decimals={unit === 'KG' ? 3 : 0} suffix={unit === 'KG' ? 'kg' : 'un'} />;
}

export function PercentInput(props: Omit<NumberInputProps, 'suffix'>) {
  return <NumberInput decimals={2} {...props} suffix="%" />;
}

export function DateInput({
  value,
  onChange,
  className,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: string | null | undefined; onChange: (v: string) => void }) {
  return <Input type="date" {...rest} className={cn('num', className)} value={value || ''} onChange={(e) => onChange(e.target.value)} />;
}

export type MaskKind = 'document' | 'phone' | 'cep';

export function MaskedInput({
  mask,
  value,
  onChange,
  ...rest
}: Omit<InputProps, 'value' | 'onChange'> & { mask: MaskKind; value: string | null | undefined; onChange: (v: string) => void }) {
  const f = mask === 'document' ? formatDocument : mask === 'phone' ? formatPhone : formatCep;
  return (
    <Input
      {...rest}
      inputMode="numeric"
      className={cn('num', rest.className)}
      value={value || ''}
      onChange={(e) => onChange(f(e.target.value))}
      placeholder={rest.placeholder ?? (mask === 'document' ? 'CPF ou CNPJ' : mask === 'phone' ? '(00) 00000-0000' : '00000-000')}
    />
  );
}

/** CEP com preenchimento automático do endereço (ViaCEP). */
export function CepInput({
  value,
  onChange,
  onAddress,
  ...rest
}: Omit<InputProps, 'value' | 'onChange'> & {
  value: string | null | undefined;
  onChange: (v: string) => void;
  onAddress: (a: { street: string; district: string; city: string; state: string }) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <MaskedInput
      {...rest}
      mask="cep"
      value={value}
      suffix={busy ? '…' : undefined}
      onChange={async (v) => {
        onChange(v);
        if (v.replace(/\D/g, '').length === 8) {
          setBusy(true);
          const a = await lookupCep(v);
          setBusy(false);
          if (a) onAddress(a);
        }
      }}
    />
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Buscar…',
  className,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className={cn('relative flex items-center min-w-0', className)}>
      <Search className="absolute left-3 size-4 text-subtle pointer-events-none" />
      <input
        type="search"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(controlCls, 'pl-9 pr-8 [&::-webkit-search-cancel-button]:hidden')}
      />
      {value && (
        <button type="button" onClick={() => onChange('')} className="absolute right-2 p-1 text-subtle hover:text-fg cursor-pointer" aria-label="Limpar busca">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={cn('inline-flex items-start gap-2.5 cursor-pointer select-none', disabled && 'opacity-50 cursor-not-allowed', className)}>
      <input
        type="checkbox"
        className="mt-0.5 size-4 rounded border-border-strong accent-[var(--primary)] cursor-pointer"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {(label || description) && (
        <span className="text-sm leading-tight">
          {label}
          {description && <span className="block text-xs text-muted mt-0.5">{description}</span>}
        </span>
      )}
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={cn('flex items-start justify-between gap-4 cursor-pointer select-none', disabled && 'opacity-50 cursor-not-allowed')}>
      {(label || description) && (
        <span className="text-sm">
          {label}
          {description && <span className="block text-xs text-muted mt-0.5">{description}</span>}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer',
          checked ? 'bg-primary' : 'bg-surface-3 border border-border-strong',
        )}
      >
        <span className={cn('inline-block size-4.5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5.5' : 'translate-x-1')} />
      </button>
    </label>
  );
}

/** Botões segmentados (escolha única entre poucas opções). */
export function Segmented<V extends string>({
  value,
  onChange,
  options,
  size = 'md',
  className,
}: {
  value: V;
  onChange: (v: V) => void;
  options: { value: V; label: React.ReactNode; count?: number }[];
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div className={cn('inline-flex rounded-control bg-surface-2 p-0.5 border border-border max-w-full scroll-x', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-[calc(var(--r-control)-2px)] font-medium transition-colors whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5',
            size === 'sm' ? 'px-2.5 h-7 text-xs' : 'px-3.5 h-8 text-[13px]',
            value === o.value ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
          {o.count !== undefined && (
            <span className={cn('num text-[10px] px-1.5 rounded-full', value === o.value ? 'bg-primary-soft text-primary' : 'bg-surface-3 text-muted')}>
              {o.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
