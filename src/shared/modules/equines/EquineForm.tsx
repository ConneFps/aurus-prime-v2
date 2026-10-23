/**
 * Cadastro / edição do equino (Drawer largo com seções).
 */
import { ExternalLink, Star, Trash2, Wand2 } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useCrud, useAction, useTable } from '../../data/react';
import { uuid } from '../../data/query';
import { date, money } from '../../domain/format';
import { EQUINE_SEX_LABELS, EQUINE_STATUS, optionsOf } from '../../domain/labels';
import type { Equine } from '../../domain/types';
import {
  Badge,
  Button,
  DateInput,
  Drawer,
  Field,
  FileDrop,
  FormGrid,
  FormSection,
  IconButton,
  Input,
  MoneyInput,
  NumberInput,
  Select,
  Tabs,
  Textarea,
} from '../../ui';
import { ageLabel, distinct, GESTATION_DAYS, REPRO_STATUS, suggestFoaling } from './model';
import { PhotoThumb } from './parts';

export type EquineDraft = Omit<Equine, 'id' | 'createdAt' | 'updatedAt'> & { id: string; isNew?: boolean };
export type FormSectionKey = 'dados' | 'fotos' | 'genealogia' | 'reproducao' | 'localizacao' | 'documentos';

const SECTIONS: { value: FormSectionKey; label: string }[] = [
  { value: 'dados', label: 'Dados' },
  { value: 'fotos', label: 'Fotos' },
  { value: 'genealogia', label: 'Genealogia' },
  { value: 'reproducao', label: 'Reprodução' },
  { value: 'localizacao', label: 'Localização' },
  { value: 'documentos', label: 'Documentos e valores' },
];

export function newEquineDraft(defaults?: Partial<Equine>): EquineDraft {
  return {
    id: uuid(),
    isNew: true,
    name: '',
    sex: 'EGUA',
    breed: '',
    status: 'ACTIVE',
    photos: [],
    reproStatus: 'ATIVO',
    ...defaults,
  };
}

export const draftOf = (e: Equine): EquineDraft => ({ ...e, isNew: false });

/** Campo texto com sugestões (datalist nativo — aceita texto livre). */
function Suggest({ value, onChange, options, placeholder, autoFocus }: { value: string | null | undefined; onChange: (v: string) => void; options: string[]; placeholder?: string; autoFocus?: boolean }) {
  const id = useMemo(() => 'dl-' + Math.random().toString(36).slice(2, 9), []);
  return (
    <>
      <Input value={value || ''} onChange={(e) => onChange(e.target.value)} list={id} placeholder={placeholder} autoFocus={autoFocus} autoComplete="off" />
      <datalist id={id}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  );
}

export function EquineFormDrawer({
  draft,
  onClose,
  section,
  onSaved,
}: {
  draft: EquineDraft | null;
  onClose: () => void;
  section?: FormSectionKey;
  onSaved?: (id: string, isNew: boolean) => void;
}) {
  const crud = useCrud('equines');
  const { rows: all } = useTable('equines');
  const { rows: semen } = useTable('semen_purchases');
  const [d, setD] = useState<EquineDraft | null>(draft);
  const [active, setActive] = useState<FormSectionKey>(section || 'dados');
  const refs = useRef<Partial<Record<FormSectionKey, HTMLElement | null>>>({});

  useEffect(() => {
    setD(draft);
    setActive(section || 'dados');
    if (draft && section && section !== 'dados') {
      const t = setTimeout(() => refs.current[section]?.scrollIntoView({ block: 'start' }), 60);
      return () => clearTimeout(t);
    }
  }, [draft, section]);

  const sugg = useMemo(
    () => ({
      breeds: distinct(['Quarto de Milha', 'Mangalarga Marchador', 'Crioulo', 'Puro Sangue Árabe', 'Puro Sangue Inglês', 'Campolina', 'Paint Horse', 'Appaloosa', 'Lusitano', ...all.map((e) => e.breed)]),
      coats: distinct(['Alazão', 'Baio', 'Castanho', 'Tordilho', 'Preto', 'Gateado', 'Lobuno', 'Pampa', 'Rosilho', 'Palomino', ...all.map((e) => e.coat)]),
      haras: distinct(all.map((e) => e.haras)),
      paddocks: distinct(all.map((e) => e.paddock)),
      managers: distinct(all.map((e) => e.manager)),
      sires: distinct([...all.filter((e) => e.sex === 'GARANHAO').map((e) => e.name), ...all.map((e) => e.sireName)]),
      dams: distinct([...all.filter((e) => e.sex === 'EGUA').map((e) => e.name), ...all.map((e) => e.damName)]),
      stallions: distinct([...all.filter((e) => e.sex === 'GARANHAO').map((e) => e.name), ...semen.map((s) => s.stallionName)]),
      names: distinct(all.flatMap((e) => [e.name, e.sireName, e.damName, e.paternalGrandsire, e.paternalGranddam, e.maternalGrandsire, e.maternalGranddam])),
    }),
    [all, semen],
  );

  const save = useAction(
    async (x: EquineDraft) => {
      if (!x.name.trim()) throw new Error('Informe o nome do animal.');
      if (!x.breed.trim()) throw new Error('Informe a raça.');
      const dup = all.find((e) => e.id !== x.id && e.name.trim().toLowerCase() === x.name.trim().toLowerCase());
      if (dup) throw new Error(`Já existe um animal chamado "${dup.name}".`);
      if (x.coverDate && x.expectedFoalingDate && x.expectedFoalingDate < x.coverDate) throw new Error('A previsão de parto não pode ser antes da cobertura.');
      const { isNew, id, ...rest } = x;
      const data = { ...rest, name: x.name.trim(), breed: x.breed.trim() };
      if (isNew) await crud.insert({ ...data, id });
      else await crud.update(id, data);
      return { id, isNew: !!isNew };
    },
    {
      success: (r) => (r.isNew ? 'Animal cadastrado' : 'Cadastro atualizado'),
      onSuccess: (r) => {
        onSaved?.(r.id, r.isNew);
        onClose();
      },
    },
  );

  if (!d) return <Drawer open={false} onClose={onClose} />;
  const set = (patch: Partial<EquineDraft>) => setD((cur) => (cur ? { ...cur, ...patch } : cur));
  const txt = (k: keyof EquineDraft) => ({
    value: (d[k] as string | null | undefined) || '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set({ [k]: e.target.value || null } as Partial<EquineDraft>),
  });

  const setRepro = (v: EquineDraft['reproStatus']) => {
    const patch: Partial<EquineDraft> = { reproStatus: v };
    if (v === 'GESTANTE' && (d.status === 'ACTIVE' || d.status === 'TRAINING')) patch.status = 'PREGNANT';
    if (v !== 'GESTANTE' && d.status === 'PREGNANT') patch.status = 'ACTIVE';
    set(patch);
  };
  const setStatus = (v: Equine['status']) => {
    const patch: Partial<EquineDraft> = { status: v };
    if (v === 'PREGNANT') patch.reproStatus = 'GESTANTE';
    else if (d.reproStatus === 'GESTANTE' && d.status === 'PREGNANT') patch.reproStatus = 'ATIVO';
    set(patch);
  };
  const setCover = (v: string) => {
    const prevSuggested = suggestFoaling(d.coverDate);
    const patch: Partial<EquineDraft> = { coverDate: v || null };
    if (v && (!d.expectedFoalingDate || d.expectedFoalingDate === prevSuggested)) patch.expectedFoalingDate = suggestFoaling(v);
    set(patch);
  };
  const jump = (k: FormSectionKey) => {
    setActive(k);
    refs.current[k]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const sec = (k: FormSectionKey) => (el: HTMLElement | null) => {
    refs.current[k] = el;
  };
  const weightDiff = d.weightKg && d.idealWeightKg ? d.weightKg - d.idealWeightKg : null;
  const suggested = suggestFoaling(d.coverDate);
  const isMare = d.sex === 'EGUA';
  const gps = (d.gps || '').trim();

  return (
    <Drawer
      open
      width="xl"
      onClose={onClose}
      title={d.isNew ? 'Novo animal' : `Editar ${d.name || 'animal'}`}
      description={d.isNew ? 'Só nome, sexo e raça são obrigatórios — complete o resto quando quiser.' : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.running} onClick={() => void save.run(d)}>
            {d.isNew ? 'Cadastrar animal' : 'Salvar alterações'}
          </Button>
        </>
      }
    >
      <div className="sticky -top-5 z-10 -mx-5 -mt-5 mb-5 bg-surface px-3">
        <Tabs value={active} onChange={jump} items={SECTIONS} />
      </div>
      <form
        className="space-y-8"
        onSubmit={(e) => {
          e.preventDefault();
          void save.run(d);
        }}
      >
        <section ref={sec('dados')} className="scroll-mt-14">
          <FormSection title="Dados do animal">
            <FormGrid cols={4}>
              <Field label="Nome" required span={2}>
                <Input {...txt('name')} value={d.name} onChange={(e) => set({ name: e.target.value })} autoFocus={d.isNew} />
              </Field>
              <Field label="Sexo" required>
                <Select value={d.sex} onChange={(v) => set({ sex: v })} options={optionsOf(EQUINE_SEX_LABELS)} />
              </Field>
              <Field label="Status">
                <Select
                  value={d.status}
                  onChange={setStatus}
                  options={optionsOf(EQUINE_STATUS).map((o) => ({ ...o, disabled: o.value === 'SOLD' && d.status !== 'SOLD' }))}
                />
              </Field>
              <Field label="Nascimento" hint={d.birthDate ? ageLabel(d.birthDate, true) : undefined}>
                <DateInput value={d.birthDate} onChange={(v) => set({ birthDate: v || null })} />
              </Field>
              <Field label="Raça" required>
                <Suggest value={d.breed} onChange={(v) => set({ breed: v })} options={sugg.breeds} />
              </Field>
              <Field label="Pelagem">
                <Suggest value={d.coat} onChange={(v) => set({ coat: v || null })} options={sugg.coats} />
              </Field>
              <Field label="Altura">
                <NumberInput value={d.heightCm} decimals={0} suffix="cm" onChange={(v) => set({ heightCm: v })} />
              </Field>
              <Field label="Peso atual">
                <NumberInput value={d.weightKg} decimals={1} suffix="kg" onChange={(v) => set({ weightKg: v })} />
              </Field>
              <Field
                label="Peso ideal"
                hint={weightDiff !== null ? (Math.abs(weightDiff) < 1 ? 'No peso ideal' : `${weightDiff > 0 ? '+' : ''}${weightDiff.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg do ideal`) : undefined}
              >
                <NumberInput value={d.idealWeightKg} decimals={1} suffix="kg" onChange={(v) => set({ idealWeightKg: v })} />
              </Field>
              <Field label="Microchip">
                <Input {...txt('chipId')} className="num" />
              </Field>
              <Field label="Registro (associação)" hint="ABQM, ABCCMM, ABCCC…">
                <Input {...txt('registry')} />
              </Field>
              <Field label="Registro secundário" hint="CBH, CBT…">
                <Input {...txt('secondaryRegistry')} />
              </Field>
              <Field label="Marcações / sinais" span="full">
                <Textarea rows={2} {...txt('markings')} placeholder="Ex.: estrela na testa, calçado posterior esquerdo" />
              </Field>
            </FormGrid>
          </FormSection>
        </section>

        <section ref={sec('fotos')} className="scroll-mt-14">
          <FormSection title="Fotos" description="A primeira foto é a principal (aparece nos cartões e na ficha).">
            {d.photos.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                {d.photos.map((p, i) => (
                  <div key={p.id} className="relative group">
                    <PhotoThumb att={p} className="aspect-square w-full" />
                    {i === 0 && (
                      <Badge tone="primary" className="absolute left-1.5 top-1.5" size="xs">
                        Principal
                      </Badge>
                    )}
                    <div className="absolute right-1 top-1 flex gap-1">
                      {i > 0 && (
                        <IconButton label="Tornar principal" size="sm" variant="secondary" onClick={() => set({ photos: [p, ...d.photos.filter((x) => x.id !== p.id)] })}>
                          <Star className="size-4" />
                        </IconButton>
                      )}
                      <IconButton label="Remover foto" size="sm" variant="secondary" onClick={() => set({ photos: d.photos.filter((x) => x.id !== p.id) })}>
                        <Trash2 className="size-4 text-danger" />
                      </IconButton>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <FileDrop
              folder={`equines/${d.id}`}
              kind="PHOTO"
              accept="image/*"
              multiple
              compact={d.photos.length > 0}
              label="Arraste fotos ou clique para enviar"
              hint="JPG ou PNG, até 15 MB cada"
              onUploaded={(att) => setD((cur) => (cur ? { ...cur, photos: [...cur.photos, att] } : cur))}
            />
          </FormSection>
        </section>

        <section ref={sec('genealogia')} className="scroll-mt-14">
          <FormSection title="Genealogia" description="Pais e avós — usados na árvore genealógica da ficha.">
            <FormGrid cols={4}>
              <Field label="Pai (garanhão)" span={2}>
                <Suggest value={d.sireName} onChange={(v) => set({ sireName: v || null })} options={sugg.sires} />
              </Field>
              <Field label="Registro do pai" span={2}>
                <Input {...txt('sireRegistry')} />
              </Field>
              <Field label="Mãe (égua)" span={2}>
                <Suggest value={d.damName} onChange={(v) => set({ damName: v || null })} options={sugg.dams} />
              </Field>
              <Field label="Registro da mãe" span={2}>
                <Input {...txt('damRegistry')} />
              </Field>
              <Field label="Avô paterno">
                <Suggest value={d.paternalGrandsire} onChange={(v) => set({ paternalGrandsire: v || null })} options={sugg.names} />
              </Field>
              <Field label="Avó paterna">
                <Suggest value={d.paternalGranddam} onChange={(v) => set({ paternalGranddam: v || null })} options={sugg.names} />
              </Field>
              <Field label="Avô materno">
                <Suggest value={d.maternalGrandsire} onChange={(v) => set({ maternalGrandsire: v || null })} options={sugg.names} />
              </Field>
              <Field label="Avó materna">
                <Suggest value={d.maternalGranddam} onChange={(v) => set({ maternalGranddam: v || null })} options={sugg.names} />
              </Field>
              <Field label="Observações genéticas" span="full">
                <Textarea rows={2} {...txt('geneticNotes')} placeholder="Linhagem, campeões na família, potencial genético…" />
              </Field>
            </FormGrid>
          </FormSection>
        </section>

        <section ref={sec('reproducao')} className="scroll-mt-14">
          <FormSection title="Reprodução">
            <FormGrid cols={4}>
              <Field label="Situação reprodutiva">
                <Select value={d.reproStatus || ''} onChange={(v) => setRepro((v || null) as EquineDraft['reproStatus'])} placeholder="—" options={optionsOf(REPRO_STATUS)} />
              </Field>
              <Field label="Fertilidade / avaliação">
                <Input {...txt('fertilityRating')} placeholder="Ex.: Alta" />
              </Field>
              {isMare && (
                <>
                  <Field label="Cobertura / inseminação">
                    <DateInput value={d.coverDate} onChange={setCover} />
                  </Field>
                  <Field label="Garanhão">
                    <Suggest value={d.coverStallion} onChange={(v) => set({ coverStallion: v || null })} options={sugg.stallions} />
                  </Field>
                  <Field label="Diagnóstico de prenhez">
                    <DateInput value={d.pregnancyDiagnosisDate} onChange={(v) => set({ pregnancyDiagnosisDate: v || null })} />
                  </Field>
                  <Field label="Previsão de parto" hint={suggested ? `Sugestão: ${date(suggested)} (+${GESTATION_DAYS} dias)` : `Cobertura + ${GESTATION_DAYS} dias`}>
                    <div className="flex gap-1.5">
                      <DateInput value={d.expectedFoalingDate} onChange={(v) => set({ expectedFoalingDate: v || null })} className="flex-1" />
                      {suggested && suggested !== d.expectedFoalingDate && (
                        <IconButton label="Usar sugestão (+340 dias)" variant="secondary" onClick={() => set({ expectedFoalingDate: suggested })}>
                          <Wand2 className="size-4" />
                        </IconButton>
                      )}
                    </div>
                  </Field>
                  <Field label="Observações da gestação" span="full">
                    <Textarea rows={2} {...txt('pregnancyNotes')} />
                  </Field>
                </>
              )}
            </FormGrid>
          </FormSection>
        </section>

        <section ref={sec('localizacao')} className="scroll-mt-14">
          <FormSection title="Localização">
            <FormGrid cols={3}>
              <Field label="Haras / propriedade">
                <Suggest value={d.haras} onChange={(v) => set({ haras: v || null })} options={sugg.haras} />
              </Field>
              <Field label="Baia / piquete">
                <Suggest value={d.paddock} onChange={(v) => set({ paddock: v || null })} options={sugg.paddocks} />
              </Field>
              <Field label="Responsável">
                <Suggest value={d.manager} onChange={(v) => set({ manager: v || null })} options={sugg.managers} />
              </Field>
              <Field
                label="Coordenadas GPS"
                hint={
                  gps ? (
                    <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`https://www.google.com/maps?q=${encodeURIComponent(gps)}`} target="_blank" rel="noreferrer">
                      Abrir no mapa <ExternalLink className="size-3" />
                    </a>
                  ) : (
                    'Latitude, longitude'
                  )
                }
              >
                <Input {...txt('gps')} placeholder="-22.9056, -47.0608" className="num" />
              </Field>
              <Field label="Endereço" span={2}>
                <Input {...txt('locationAddress')} />
              </Field>
            </FormGrid>
          </FormSection>
        </section>

        <section ref={sec('documentos')} className="scroll-mt-14">
          <FormSection title="Documentação e valores">
            <FormGrid cols={2}>
              <Field label="Pedigree / documentos de registro">
                <Textarea rows={2} {...txt('pedigreeNotes')} placeholder="Situação do pedigree, certidões…" />
              </Field>
              <Field label="Atestados sanitários">
                <Textarea rows={2} {...txt('healthCertificates')} placeholder="Ex.: AIE e mormo negativos até 12/2026" />
              </Field>
              <Field label="Teste genético">
                <Input {...txt('geneticTest')} placeholder="Ex.: DNA/parentesco confirmado" />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Valor de compra">
                  <MoneyInput value={d.purchaseValue} onChange={(v) => set({ purchaseValue: v })} />
                </Field>
                <Field label="Valor estimado" hint={d.purchaseValue && d.estimatedValue ? `Valorização ${money(d.estimatedValue - d.purchaseValue)}` : undefined}>
                  <MoneyInput value={d.estimatedValue} onChange={(v) => set({ estimatedValue: v })} />
                </Field>
              </div>
              <Field label="Observações gerais" span="full">
                <Textarea rows={3} {...txt('notes')} />
              </Field>
            </FormGrid>
          </FormSection>
        </section>
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
}
