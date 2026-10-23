/**
 * Ações de tarefas (gravação simples via useCrud — tarefa é cadastro sem regra de negócio).
 */
import { useSession } from '../../../app/session';
import { useAction, useCrud } from '../../../data/react';
import type { Task } from '../../../domain/types';
import { useConfirm } from '../../../ui';
import type { TaskDraft } from './model';

export function useTaskActions(opts?: { onSaved?: () => void }) {
  const crud = useCrud('tasks');
  const { profile, can } = useSession();
  const confirm = useConfirm();
  const me = profile?.id || null;
  /** Gerentes/administradores editam qualquer tarefa. */
  const isManager = can('settings.manage');

  const canEdit = (t: Task) => isManager || t.createdById === me || t.assigneeId === me;
  const canDelete = (t: Task) => isManager || t.createdById === me;

  const save = useAction(
    async (d: TaskDraft) => {
      const title = d.title.trim();
      if (!title) throw new Error('Informe o título da tarefa.');
      const data = {
        title,
        description: d.description.trim() || null,
        assigneeId: d.assigneeId,
        assigneeName: d.assigneeId ? d.assigneeName : null,
        dueDate: d.dueDate || null,
        priority: d.priority,
      };
      if (d.id) await crud.update(d.id, data);
      else
        await crud.insert({
          ...data,
          status: 'OPEN',
          relatedEntity: null,
          relatedId: null,
          createdById: me,
          createdByName: profile?.name || null,
          doneAt: null,
        });
    },
    { success: 'Tarefa salva', onSuccess: () => opts?.onSaved?.() },
  );

  const toggle = useAction(
    async (t: Task) => {
      if (t.status === 'OPEN') await crud.update(t.id, { status: 'DONE', doneAt: new Date().toISOString() });
      else await crud.update(t.id, { status: 'OPEN', doneAt: null });
      return t.status === 'OPEN' ? 'DONE' : 'OPEN';
    },
    { success: (s) => (s === 'DONE' ? 'Tarefa concluída' : 'Tarefa reaberta') },
  );

  const removeAction = useAction((t: Task) => crud.remove(t.id), { success: 'Tarefa excluída' });
  const remove = {
    running: removeAction.running,
    run: async (t: Task) => {
      const ok = await confirm({ title: 'Excluir tarefa?', message: `"${t.title}" será removida. Esta ação não pode ser desfeita.`, danger: true, confirmLabel: 'Excluir' });
      if (ok) return removeAction.run(t);
    },
  };

  return { save, toggle, remove, canEdit, canDelete, me, isManager };
}
