/**
 * Barra de filtros do relatório. Cada filtro de cadastro é um componente
 * próprio para que só a lista necessária seja carregada.
 */
import { ChevronDown, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { INTERNAL_ROLES } from '../../../domain/permissions';
import { Button, Card, cn, Combobox, DateInput, Field, Segmented, Select, type ComboOption } from '../../../ui';
import { useBatchOptions, useCustomerOptions, usePartnerOptions, useProductOptions, useProfileOptions } from '../../common/lookups';
import { PERIOD_PRESETS } from './data';
import type { FilterKey, PeriodPreset, ReportDef } from './types';

export interface FilterState {
  preset: PeriodPreset;
  custom: { from: string; to: string };
  ids: Partial<Record<Exclude<FilterKey, 'period'>, string | null>>;
  labels: Partial<Record<Exclude<FilterKey, 'period'>, string>>;
  opts: Record<string, string>;
}

export function initialFilterState(def: ReportDef): FilterState {
  return {
    preset: def.period?.default || 'all',
    custom: { from: '', to: '' },
    ids: {},
    labels: {},
    opts: Object.fromEntries((def.options || []).map((o) => [o.key, o.default])),
  };
}

type IdKey = Exclude<FilterKey, 'period'>;

export const FILTER_LABELS: Record<IdKey, string> = {
  customer: 'Cliente',
  seller: 'Vendedor',
  batch: 'Lote de gado',
  product: 'Produto',
  partner: 'Parceiro',
  user: 'Usuário',
};

const PLACEHOLDER: Record<IdKey, string> = {
  customer: 'Todos os clientes',
  seller: 'Todos os vendedores',
  batch: 'Todos os lotes',
  product: 'Todos os produtos',
  partner: 'Todos os parceiros',
  user: 'Todos os usuários',
};

function LookupFilter({ k, value, onChange }: { k: IdKey; value: string | null | undefined; onChange: (v: string | null, label?: string) => void }) {
  const Comp = { customer: CustomerSel, seller: SellerSel, batch: BatchSel, product: ProductSel, partner: PartnerSel, user: UserSel }[k];
  return (
    <Field label={FILTER_LABELS[k]}>
      <Comp value={value} onChange={onChange} placeholder={PLACEHOLDER[k]} />
    </Field>
  );
}

type SelProps = { value: string | null | undefined; onChange: (v: string | null, label?: string) => void; placeholder: string };
const Sel = ({ options, ...p }: SelProps & { options: ComboOption[] }) => (
  <Combobox value={p.value} onChange={(v, o) => p.onChange(v, o?.label)} options={options} placeholder={p.placeholder} allowClear />
);
const CustomerSel = (p: SelProps) => <Sel {...p} options={useCustomerOptions().options} />;
const SellerSel = (p: SelProps) => <Sel {...p} options={useProfileOptions(['SELLER', 'EXTERNAL_SELLER', 'MANAGER', 'ADMIN']).options} />;
const BatchSel = (p: SelProps) => <Sel {...p} options={useBatchOptions().options} />;
const ProductSel = (p: SelProps) => <Sel {...p} options={useProductOptions().options} />;
const PartnerSel = (p: SelProps) => <Sel {...p} options={usePartnerOptions().options} />;
const UserSel = (p: SelProps) => <Sel {...p} options={useProfileOptions([...INTERNAL_ROLES, 'EXTERNAL_SELLER']).options} />;

export function ReportFiltersCard({ def, state, onChange }: { def: ReportDef; state: FilterState; onChange: (s: FilterState) => void }) {
  const lookups = def.filters.filter((f): f is IdKey => f !== 'period');
  const hasPeriod = def.filters.includes('period');
  const dirty = JSON.stringify(state) !== JSON.stringify(initialFilterState(def));
  const [open, setOpen] = useState(false);
  if (!hasPeriod && !lookups.length && !def.options?.length) return null;
  const active = lookups.filter((k) => state.ids[k]).length + (def.options || []).filter((o) => (state.opts[o.key] ?? o.default) !== o.default).length;
  const moreCount = lookups.length + (def.options?.length || 0);
  return (
    <Card className="mb-5">
      {hasPeriod && (
        <div className={cn('flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end', moreCount > 0 && 'mb-3 sm:mb-4')}>
          <Field label={def.period?.field ? `Período · ${def.period.field.toLowerCase()}` : 'Período'}>
            <Segmented size="sm" value={state.preset} onChange={(v) => onChange({ ...state, preset: v })} options={PERIOD_PRESETS} />
          </Field>
          {state.preset === 'custom' && (
            <div className="grid grid-cols-2 gap-2 sm:w-80">
              <Field label="De">
                <DateInput value={state.custom.from} onChange={(v) => onChange({ ...state, custom: { ...state.custom, from: v } })} />
              </Field>
              <Field label="Até">
                <DateInput value={state.custom.to} onChange={(v) => onChange({ ...state, custom: { ...state.custom, to: v } })} />
              </Field>
            </div>
          )}
        </div>
      )}
      {moreCount > 0 && (
        <Button
          variant="subtle"
          size="sm"
          block
          className="sm:hidden"
          icon={<SlidersHorizontal className="size-4" />}
          iconRight={<ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Ocultar filtros' : `Mais filtros${active ? ` (${active} ativo${active > 1 ? 's' : ''})` : ''}`}
        </Button>
      )}
      <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end', !open && 'max-sm:hidden', open && 'max-sm:mt-3')}>
        {lookups.map((k) => (
          <LookupFilter
            key={k}
            k={k}
            value={state.ids[k]}
            onChange={(v, label) => onChange({ ...state, ids: { ...state.ids, [k]: v }, labels: { ...state.labels, [k]: label || '' } })}
          />
        ))}
        {(def.options || []).map((o) => (
          <Field key={o.key} label={o.label}>
            <Select value={state.opts[o.key] ?? o.default} onChange={(v) => onChange({ ...state, opts: { ...state.opts, [o.key]: v } })} options={o.choices} />
          </Field>
        ))}
        {dirty && (
          <div>
            <Button variant="ghost" size="md" icon={<RotateCcw className="size-4" />} onClick={() => onChange(initialFilterState(def))}>
              Limpar filtros
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
