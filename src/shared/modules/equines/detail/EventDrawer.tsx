/**
 * Formulário genérico de evento do equino (campos de `data` conforme o tipo).
 */
import { useEffect, useState } from 'react';
import { useSession } from '../../../app/session';
import { useAction, useCrud } from '../../../data/react';
import { uuid } from '../../../data/query';
import { today } from '../../../domain/format';
import { EQUINE_EVENT_LABELS, optionsOf } from '../../../domain/labels';
import type { Attachment, Equine, EquineEvent, EquineEventType } from '../../../domain/types';
import {
  AttachmentList,
  Button,
  DateInput,
  Drawer,
  Field,
  FileDrop,
  FormGrid,
  FormSection,
  Input,
  MoneyInput,
  NumberInput,
  Select,
  Textarea,
} from '../../../ui';
import { EVENT_SPECS, type FieldSpec } from '../eventSpecs';
import { isIncomeEvent, numOrNull, str } from '../model';

export interface EventDraft {
  id: string;
  isNew: boolean;
  type: EquineEventType;
  date: string;
  title: string;
  amount: number | null;
  alertDate: string | null;
  notes: string | null;
  data: Record<string, unknown>;
  attachments: Attachment[];
  /** Permite trocar o tipo (botão "Registrar evento"). */
  chooseType?: boolean;
}

export const newEventDraft = (type: EquineEventType, chooseType = false, data: Record<string, unknown> = {}): EventDraft => ({
  id: uuid(),
  isNew: true,
  type,
  date: today(),
  title: '',
  amount: null,
  alertDate: null,
  notes: null,
  data,
  attachments: [],
  chooseType,
});

export const eventDraftOf = (e: EquineEvent): EventDraft => ({
  id: e.id,
  isNew: false,
  type: e.type,
  date: e.date,
  title: e.title,
  amount: e.amount ?? null,
  alertDate: e.alertDate ?? null,
  notes: e.notes ?? null,
  data: { ...(e.data || {}) },
  attachments: e.attachments || [],
});

/** Tipos que podem ser escolhidos no "Registrar evento". */
const TYPE_OPTIONS = optionsOf(EQUINE_EVENT_LABELS);

function DataField({ spec, value, onChange }: { spec: FieldSpec; value: unknown; onChange: (v: unknown) => void }) {
  switch (spec.kind) {
    case 'select':
      return <Select value={str(value)} onChange={(v) => onChange(v || null)} placeholder="—" options={spec.options || []} />;
    case 'textarea':
      return <Textarea rows={2} value={str(value)} onChange={(e) => onChange(e.target.value || null)} placeholder={spec.placeholder} />;
    case 'date':
      return <DateInput value={str(value)} onChange={(v) => onChange(v || null)} />;
    case 'number':
    case 'int':
      return (
        <NumberInput value={numOrNull(value)} decimals={spec.kind === 'int' ? 0 : (spec.decimals ?? 2)} suffix={spec.suffix} onChange={(v) => onChange(v)} />
      );
    case 'url':
      return <Input type="url" value={str(value)} onChange={(e) => onChange(e.target.value || null)} placeholder={spec.placeholder} />;
    default:
      return <Input value={str(value)} onChange={(e) => onChange(e.target.value || null)} placeholder={spec.placeholder} />;
  }
}

export function EventDrawer({ equine, draft, onClose }: { equine: Equine; draft: EventDraft | null; onClose: () => void }) {
  const crud = useCrud('equine_events');
  const { profile, actor } = useSession();
  const [d, setD] = useState<EventDraft | null>(draft);
  useEffect(() => setD(draft), [draft]);

  const save = useAction(
    async (x: EventDraft) => {
      const spec = EVENT_SPECS[x.type];
      if (!x.date) throw new Error('Informe a data.');
      if (x.amount !== null && x.amount < 0) throw new Error('O valor não pode ser negativo.');
      const data = Object.fromEntries(Object.entries(x.data).filter(([, v]) => v !== undefined));
      const ev = { date: x.date, data, amount: x.amount, alertDate: x.alertDate, isNew: x.isNew };
      spec.normalize?.(ev);
      const row = {
        equineId: equine.id,
        equineName: equine.name,
        type: x.type,
        date: x.date,
        title: x.title.trim() || spec.autoTitle(ev.data),
        amount: ev.amount ?? null,
        data: ev.data,
        alertDate: ev.alertDate || null,
        attachments: x.attachments,
        notes: x.notes?.trim() || null,
      };
      if (x.isNew) await crud.insert({ ...row, id: x.id, createdByName: profile?.name || actor?.name || null });
      else await crud.update(x.id, row);
      return x.isNew;
    },
    { success: (isNew) => (isNew ? 'Registro salvo' : 'Registro atualizado'), onSuccess: onClose },
  );

  if (!d) return <Drawer open={false} onClose={onClose} />;
  const spec = EVENT_SPECS[d.type];
  const set = (patch: Partial<EventDraft>) => setD((cur) => (cur ? { ...cur, ...patch } : cur));
  const setData = (k: string, v: unknown) => setD((cur) => (cur ? { ...cur, data: { ...cur.data, [k]: v } } : cur));
  const income = isIncomeEvent(d);

  return (
    <Drawer
      open
      width="lg"
      onClose={onClose}
      title={d.isNew ? `Registrar ${spec.noun}` : `Editar ${spec.noun}`}
      description={equine.name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.running} onClick={() => void save.run(d)}>
            Salvar
          </Button>
        </>
      }
    >
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          void save.run(d);
        }}
      >
        <FormGrid cols={2}>
          {d.chooseType && (
            <Field label="Tipo de registro" span="full">
              <Select value={d.type} onChange={(v) => set({ type: v, data: {} })} options={TYPE_OPTIONS} />
            </Field>
          )}
          <Field label="Data" required>
            <DateInput value={d.date} onChange={(v) => set({ date: v })} />
          </Field>
          <Field label="Título" hint="Em branco = gerado automaticamente.">
            <Input value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder={spec.titlePlaceholder} />
          </Field>
        </FormGrid>

        <FormSection title={EQUINE_EVENT_LABELS[d.type].label}>
          <FormGrid cols={2}>
            {spec.fields.map((f) => (
              <Field key={f.key} label={f.label} hint={f.hint} span={f.span}>
                <DataField spec={f} value={d.data[f.key]} onChange={(v) => setData(f.key, v)} />
              </Field>
            ))}
          </FormGrid>
        </FormSection>

        <FormSection title="Valor e lembrete">
          <FormGrid cols={2}>
            <Field label={spec.amountLabel} hint={income ? 'Entra como receita do animal.' : 'Entra como despesa do animal.'}>
              <MoneyInput value={d.amount} onChange={(v) => set({ amount: v })} />
            </Field>
            <Field label={spec.alertLabel} hint={spec.alertHint || 'Aparece nos lembretes do plantel.'}>
              <DateInput value={d.alertDate} onChange={(v) => set({ alertDate: v || null })} />
            </Field>
            <Field label="Observações" span="full">
              <Textarea rows={3} value={d.notes || ''} onChange={(e) => set({ notes: e.target.value })} />
            </Field>
          </FormGrid>
        </FormSection>

        <FormSection title="Anexos" description="Exames, laudos, notas, fotos e vídeos curtos.">
          {d.attachments.length > 0 && <AttachmentList items={d.attachments} onRemove={(a) => set({ attachments: d.attachments.filter((x) => x.id !== a.id) })} />}
          <FileDrop
            folder={`equines/${equine.id}/events`}
            kind={d.type === 'HEALTH' ? 'EXAM' : 'DOCUMENT'}
            multiple
            compact
            onUploaded={(att) => setD((cur) => (cur ? { ...cur, attachments: [...cur.attachments, att] } : cur))}
          />
        </FormSection>
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
}
