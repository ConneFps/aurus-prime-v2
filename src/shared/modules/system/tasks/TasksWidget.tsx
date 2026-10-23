import { ArrowRight, ListChecks, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../../app/session';
import { useTable } from '../../../data/react';
import { today } from '../../../domain/format';
import { Badge, Card, CardHeader, cn, IconButton, Input, Skeleton } from '../../../ui';
import { compareTasks, draftOf, dueLabel, isDueToday, isTaskOverdue, TASK_PRIORITY, type TaskDraft } from './model';
import { TaskCheck } from './TaskCard';
import { TaskForm } from './TaskForm';
import { useTaskActions } from './useTaskActions';

/**
 * Painel inicial: minhas tarefas abertas (vencidas primeiro) + criação rápida.
 * Digite o título e tecle Enter — a tarefa fica com você, prioridade média, sem prazo.
 */
export function TasksWidget({ limit = 6, className }: { limit?: number; className?: string }) {
  const { profile } = useSession();
  const me = profile?.id || null;
  const { rows, loading } = useTable('tasks', me ? { where: [['assigneeId', '==', me]] } : undefined, { enabled: !!me });
  const [title, setTitle] = useState('');
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const actions = useTaskActions({ onSaved: () => setDraft(null) });

  const open = useMemo(() => rows.filter((r) => r.status === 'OPEN').sort(compareTasks), [rows]);
  const t = today();
  const overdue = open.filter((r) => isTaskOverdue(r, t)).length;

  const quickAdd = async () => {
    const v = title.trim();
    if (!v || !profile) return;
    await actions.save.run({ title: v, description: '', assigneeId: profile.id, assigneeName: profile.name, dueDate: null, priority: 'MEDIUM' });
    setTitle('');
  };

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader
        icon={<ListChecks className="size-4" />}
        title="Minhas tarefas"
        subtitle={loading ? 'Carregando…' : open.length ? `${open.length} em aberto${overdue ? ` · ${overdue} vencida${overdue > 1 ? 's' : ''}` : ''}` : 'Tudo em dia'}
        actions={
          <Link to="/tarefas" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline underline-offset-4">
            Ver todas <ArrowRight className="size-3.5" />
          </Link>
        }
      />
      <form
        className="flex items-center gap-2 mb-3"
        onSubmit={(e) => {
          e.preventDefault();
          void quickAdd();
        }}
      >
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nova tarefa… (Enter para criar)" aria-label="Título da nova tarefa" />
        <IconButton label="Criar tarefa" variant="secondary" type="submit" disabled={!title.trim() || actions.save.running}>
          <Plus className="size-4" />
        </IconButton>
      </form>
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : !open.length ? (
        <p className="text-sm text-subtle py-6 text-center">Nenhuma tarefa aberta com você.</p>
      ) : (
        <ul className="divide-y divide-border -mx-1">
          {open.slice(0, limit).map((task) => {
            const late = isTaskOverdue(task, t);
            const todayDue = isDueToday(task, t);
            return (
              <li key={task.id} className="flex items-start gap-3 px-1 py-2.5">
                <TaskCheck task={task} onToggle={() => void actions.toggle.run(task)} />
                <button type="button" onClick={() => setDraft(draftOf(task))} className="min-w-0 flex-1 text-left cursor-pointer group">
                  <div className="text-sm text-fg truncate group-hover:text-primary">{task.title}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={cn('text-[11px] num', late ? 'text-danger font-medium' : todayDue ? 'text-warning font-medium' : 'text-subtle')}>{dueLabel(task, t)}</span>
                    {task.priority === 'HIGH' && (
                      <Badge tone={TASK_PRIORITY.HIGH.tone} size="xs">
                        Alta
                      </Badge>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {open.length > limit && (
        <Link to="/tarefas" className="mt-2 text-xs text-muted hover:text-fg text-center">
          + {open.length - limit} outras tarefas
        </Link>
      )}
      <TaskForm draft={draft} onChange={setDraft} onClose={() => setDraft(null)} onSave={(d) => void actions.save.run(d)} saving={actions.save.running} />
    </Card>
  );
}
