import { addDays, today } from '../../../domain/format';
import { INTERNAL_ROLES } from '../../../domain/permissions';
import { Button, Combobox, DateInput, Drawer, Field, FormGrid, Input, Segmented, Textarea } from '../../../ui';
import { useProfileOptions } from '../../common/lookups';
import { PRIORITY_ORDER, TASK_PRIORITY, TITLE_SUGGESTIONS, type TaskDraft } from './model';

/** Cadastro/edição de tarefa em gaveta lateral. */
export function TaskForm({
  draft,
  onChange,
  onClose,
  onSave,
  saving,
  readOnly,
}: {
  draft: TaskDraft | null;
  onChange: (d: TaskDraft) => void;
  onClose: () => void;
  onSave: (d: TaskDraft) => void;
  saving?: boolean;
  readOnly?: boolean;
}) {
  const { options } = useProfileOptions(INTERNAL_ROLES);
  const t = today();
  const quickDates = [
    { label: 'Hoje', value: t },
    { label: 'Amanhã', value: addDays(t, 1) },
    { label: 'Em 7 dias', value: addDays(t, 7) },
    { label: 'Sem prazo', value: null },
  ];
  return (
    <Drawer
      open={!!draft}
      onClose={onClose}
      title={draft?.id ? 'Editar tarefa' : 'Nova tarefa'}
      description={readOnly ? 'Somente quem criou, o responsável ou um gerente pode alterar esta tarefa.' : 'Combine o que precisa ser feito, quem faz e até quando.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {readOnly ? 'Fechar' : 'Cancelar'}
          </Button>
          {!readOnly && (
            <Button variant="primary" loading={saving} onClick={() => draft && onSave(draft)}>
              Salvar tarefa
            </Button>
          )}
        </>
      }
    >
      {draft && (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!readOnly) onSave(draft);
          }}
        >
          <fieldset disabled={readOnly} className="space-y-5">
            <Field label="Título" required>
              <Input value={draft.title} onChange={(e) => onChange({ ...draft, title: e.target.value })} placeholder="Ex.: Agendar abate do lote L-2026-003" autoFocus={!draft.id} />
            </Field>
            {!draft.id && !draft.title && (
              <div className="flex flex-wrap gap-1.5 -mt-2">
                {TITLE_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onChange({ ...draft, title: s })}
                    className="rounded-pill border border-border px-2.5 py-1 text-xs text-muted hover:text-fg hover:border-border-strong cursor-pointer"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <Field label="Descrição" hint="Detalhes, contatos, números de documento…">
              <Textarea rows={4} value={draft.description} onChange={(e) => onChange({ ...draft, description: e.target.value })} />
            </Field>
            <FormGrid>
              <Field label="Responsável" span="full">
                <Combobox
                  value={draft.assigneeId}
                  onChange={(v, o) => onChange({ ...draft, assigneeId: v, assigneeName: o?.label ?? null })}
                  options={options}
                  placeholder="Ninguém (tarefa da equipe)"
                  allowClear
                  disabled={readOnly}
                />
              </Field>
              <Field label="Vencimento">
                <DateInput value={draft.dueDate} onChange={(v) => onChange({ ...draft, dueDate: v || null })} />
              </Field>
              <Field label="Prioridade">
                <Segmented
                  value={draft.priority}
                  onChange={(v) => onChange({ ...draft, priority: v })}
                  options={PRIORITY_ORDER.map((p) => ({ value: p, label: TASK_PRIORITY[p].label }))}
                  className="w-full [&>button]:flex-1 [&>button]:justify-center"
                />
              </Field>
            </FormGrid>
            <div className="flex flex-wrap gap-1.5 -mt-2">
              {quickDates.map((q) => (
                <Button key={q.label} size="xs" variant={draft.dueDate === q.value ? 'subtle' : 'ghost'} onClick={() => onChange({ ...draft, dueDate: q.value })}>
                  {q.label}
                </Button>
              ))}
            </div>
          </fieldset>
          <button type="submit" hidden />
        </form>
      )}
    </Drawer>
  );
}
