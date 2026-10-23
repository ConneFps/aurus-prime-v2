import { CalendarClock, Check, Edit3, Link2, RotateCcw, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { date } from '../../../domain/format';
import type { Task } from '../../../domain/types';
import { Avatar, Badge, cn, Menu } from '../../../ui';
import { dueLabel, isDueToday, isTaskOverdue, relatedPath, TASK_PRIORITY } from './model';

/** Botão redondo de concluir/reabrir. */
export function TaskCheck({ task, onToggle, disabled }: { task: Task; onToggle: () => void; disabled?: boolean }) {
  const done = task.status === 'DONE';
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      disabled={disabled}
      aria-label={done ? 'Reabrir tarefa' : 'Concluir tarefa'}
      title={done ? 'Reabrir tarefa' : 'Concluir tarefa'}
      className={cn(
        'mt-0.5 size-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
        done ? 'bg-success border-success text-primary-fg' : 'border-border-strong hover:border-success hover:bg-success-soft',
      )}
    >
      {done && <Check className="size-3 stroke-[3]" />}
    </button>
  );
}

export function TaskCard({
  task,
  me,
  onOpen,
  onToggle,
  onDelete,
  canEdit,
  canDelete,
}: {
  task: Task;
  me: string | null;
  onOpen: () => void;
  onToggle: () => void;
  onDelete: () => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const overdue = isTaskOverdue(task);
  const dueToday = isDueToday(task);
  const done = task.status === 'DONE';
  const rel = relatedPath(task);
  const prio = TASK_PRIORITY[task.priority];
  return (
    <article
      onClick={onOpen}
      className={cn(
        'group relative rounded-card border bg-surface p-3.5 shadow-card cursor-pointer transition-colors hover:border-border-strong',
        overdue ? 'border-danger/40' : 'border-border',
        done && 'opacity-75',
      )}
    >
      {overdue && <span className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full bg-danger" aria-hidden />}
      <div className="flex items-start gap-3">
        <TaskCheck task={task} onToggle={onToggle} disabled={!canEdit} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h4 className={cn('text-sm font-medium text-fg leading-snug', done && 'line-through text-muted')}>{task.title}</h4>
            <div className="-mr-1.5 -mt-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
              <Menu
                items={[
                  { label: canEdit ? 'Editar' : 'Ver detalhes', icon: <Edit3 />, onClick: onOpen },
                  { label: done ? 'Reabrir' : 'Concluir', icon: done ? <RotateCcw /> : <Check />, onClick: onToggle, hidden: !canEdit },
                  'divider',
                  { label: 'Excluir', icon: <Trash2 />, danger: true, onClick: onDelete, hidden: !canDelete },
                ]}
              />
            </div>
          </div>
          {task.description && <p className={cn('text-xs text-muted mt-1 line-clamp-2', done && 'text-subtle')}>{task.description}</p>}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {!done && (
              <Badge tone={prio.tone} size="xs">
                {prio.label}
              </Badge>
            )}
            <span
              className={cn(
                'inline-flex items-center gap-1 text-[11px] num',
                overdue ? 'text-danger font-medium' : dueToday ? 'text-warning font-medium' : 'text-subtle',
              )}
              title={task.dueDate ? `Vencimento: ${date(task.dueDate)}` : undefined}
            >
              <CalendarClock className="size-3.5" />
              {done ? `Concluída ${task.doneAt ? date(task.doneAt.slice(0, 10)) : ''}` : dueLabel(task)}
            </span>
            {rel && (
              <Link
                to={rel.path}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline underline-offset-2"
              >
                <Link2 className="size-3" />
                {rel.label}
              </Link>
            )}
          </div>
          <div className="mt-2.5 flex items-center gap-2 text-xs text-muted min-w-0">
            <Avatar name={task.assigneeName || '?'} size={20} />
            <span className="truncate">
              {task.assigneeName ? (task.assigneeId === me ? `${task.assigneeName} (você)` : task.assigneeName) : 'Sem responsável'}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
