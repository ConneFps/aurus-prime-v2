/**
 * Campos de endereço com CEP automático — compactos no celular (2 colunas).
 */
import { UF_LIST } from '../../../domain/labels';
import { CepInput, Field, Input, Select } from '../../../ui';

export interface AddressValue {
  zipCode: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
}

type Errors = Partial<Record<keyof AddressValue, string | undefined>>;

export function AddressFields({ value: a, onChange, errors = {} }: { value: AddressValue; onChange: (patch: Partial<AddressValue>) => void; errors?: Errors }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 sm:gap-x-4 gap-y-4">
      <Field label="CEP" required error={errors.zipCode} className="col-span-2 sm:col-span-1">
        <CepInput
          value={a.zipCode}
          onChange={(v) => onChange({ zipCode: v })}
          onAddress={(x) => onChange({ street: x.street || a.street, district: x.district || a.district, city: x.city || a.city, state: x.state || a.state })}
        />
      </Field>
      <Field label="Rua" required error={errors.street} className="col-span-2 sm:col-span-3">
        <Input autoComplete="address-line1" value={a.street} onChange={(e) => onChange({ street: e.target.value })} />
      </Field>
      <Field label="Número" required error={errors.number}>
        <Input value={a.number} onChange={(e) => onChange({ number: e.target.value })} />
      </Field>
      <Field label="Complemento">
        <Input value={a.complement} onChange={(e) => onChange({ complement: e.target.value })} />
      </Field>
      <Field label="Bairro" error={errors.district} className="col-span-2">
        <Input value={a.district} onChange={(e) => onChange({ district: e.target.value })} />
      </Field>
      <Field label="Cidade" required error={errors.city} className="sm:col-span-3">
        <Input autoComplete="address-level2" value={a.city} onChange={(e) => onChange({ city: e.target.value })} />
      </Field>
      <Field label="UF" required error={errors.state}>
        <Select value={a.state} onChange={(v) => onChange({ state: v })} placeholder="—" options={UF_LIST.map((u) => ({ value: u, label: u }))} />
      </Field>
    </div>
  );
}
