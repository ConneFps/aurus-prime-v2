import { AlarmClock, CalendarCheck, CheckCircle2, Download, ListChecks, Plus } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSession } from '../../../app/session';
import { useTable } from '../../../data/react';
import { addDays, date, dateTime, matchesSearch, today } from '../../../domain/format';
import type { Task } from '../../../domain/types';
import { Badge, Button, cn, EmptyState, exportCsv, PageHeader, SearchInput, Segmented, Skeleton, Stat, StatGrid, Toolbar } from '../../../ui';
import { compareTasks, draftOf, emptyTask, isDueToday, isTaskOverdue, laneOf, PRIORITY_ORDER, TASK_LANES, TASK_PRIORITY, type TaskDraft, type TaskLane } from './model';
import { TaskCard } from './TaskCard';
import { TaskForm } from './TaskForm';
import { useTaskActions } from './useTaskActions';

type Scope = 'MINE' | 'ALL' | 'OVERDUE';
type GroupBy = 'STATUS' | 'PRIORITY';

interface Lane {
  key: string;
  label: string;
  hint: string;
  tone: 'danger' | 'info' | 'success' | 'warning' | 'neutral';
  tasks: Task[];
  limit?: number;
}

export function TasksPage() {
  const { profile } = useSession();
  const { rows, loading } = useTable('tasks');
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const actions = useTaskActions({ onSaved: () => setDraft(null) });
  const { me } = actions;

  const [scope, setScope] = useState<Scope>('MINE');
  const [groupBy, setGroupBy] = useState<GroupBy>('STATUS');
  const [q, setQ] = useState('');

  // Sem tarefas abertas comigo: começa mostrando as da equipe.
  const [scopeTouched, setScopeTouched] = useState(false);
  useEffect(() => {
    if (!loading && !scopeTouched && rows.length && !rows.some((r) => r.assigneeId === me && r.status === 'OPEN')) setScope('ALL');
  }, [loading, rows, me, scopeTouched]);
  const changeScope = (s: Scope) => {
    setScopeTouched(true);
    setScope(s);
  };

  const t = today();
  const counts = useMemo(() => {
    const mine = rows.filter((r) => r.assigneeId === me);
    return {
      MINE: mine.filter((r) => r.status === 'OPEN').length,
      ALL: rows.filter((r) => r.status === 'OPEN').length,
      OVERDUE: rows.filter((r) => isTaskOverdue(r, t)).length,
      open: rows.filter((r) => r.status === 'OPEN').length,
      dueToday: rows.filter((r) => isDueToday(r, t)).length,
      done30: rows.filter((r) => r.status === 'DONE' && (r.doneAt || '').slice(0, 10) >= addDays(t, -30)).length,
      myOverdue: mine.filter((r) => isTaskOverdue(r, t)).length,
    };
  }, [rows, me, t]);

  const filtered = useMemo(
    () =>
      rows
        .filter((r) => (scope === 'MINE' ? r.assigneeId === me : scope === 'OVERDUE' ? isTaskOverdue(r, t) : true))
        .filter((r) => matchesSearch([r.title, r.description, r.assigneeName, r.createdByName], q))
        .sort(compareTasks),
    [rows, scope, me, q, t],
  );

  const lanes = useMemo<Lane[]>(() => {
    if (scope === 'OVERDUE') return [{ key: 'OVERDUE', ...TASK_LANES.OVERDUE, tone: 'danger', tasks: filtered }];
    if (groupBy === 'PRIORITY') {
      const open = filtered.filter((r) => r.status === 'OPEN');
      return PRIORITY_ORDER.map((p) => ({
        key: p,
        label: `Prioridade ${TASK_PRIORITY[p].label.toLowerCase()}`,
        hint: 'Tarefas em aberto',
        tone: TASK_PRIORITY[p].tone as Lane['tone'],
        tasks: open.filter((r) => r.priority === p),
      }));
    }
    return (['OVERDUE', 'OPEN', 'DONE'] as TaskLane[]).map((l) => ({
      key: l,
      label: TASK_LANES[l].label,
      hint: TASK_LANES[l].hint,
      tone: TASK_LANES[l].tone as Lane['tone'],
      tasks: filtered.filter((r) => laneOf(r, t) === l),
      limit: l === 'DONE' ? 8 : undefined,
    }));
  }, [filtered, groupBy, scope, t]);

  const openTask = (task: Task) => setDraft(draftOf(task));
  const editing = draft?.id ? rows.find((r) => r.id === draft.id) : null;

  return (
    <>
      <PageHeader
        eyebrow="Painel"
        title="Tarefas"
        subtitle="O que a equipe precisa fazer, quem faz e até quando. Vencidas ficam destacadas em vermelho."
        actions={
          <>
            <Button
              icon={<Download className="size-4" />}
              className="max-sm:hidden"
              onClick={() =>
                exportCsv('tarefas', filtered, [
                  { header: 'Título', value: (r) => r.title },
                  { header: 'Descrição', value: (r) => r.description },
                  { header: 'Responsável', value: (r) => r.assigneeName },
                  { header: 'Prioridade', value: (r) => TASK_PRIORITY[r.priority].label },
                  { header: 'Vencimento', value: (r) => (r.dueDate ? date(r.dueDate) : '') },
                  { header: 'Situação', value: (r) => TASK_LANES[laneOf(r)].label },
                  { header: 'Concluída em', value: (r) => (r.doneAt ? dateTime(r.doneAt) : '') },
                  { header: 'Criada por', value: (r) => r.createdByName },
                ])
              }
            >
              Exportar
            </Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setDraft(emptyTask(profile ? { id: profile.id, name: profile.name } : null))}>
              Nova tarefa
            </Button>
          </>
        }
      />

      <StatGrid cols={4} className="mb-5">
        <Stat label="Em aberto" value={counts.open} icon={<ListChecks className="size-4" />} hint={`${counts.MINE} com você`} />
        <Stat
          label="Vencidas"
          value={<span className={counts.OVERDUE ? 'text-danger' : undefined}>{counts.OVERDUE}</span>}
          tone="danger"
          icon={<AlarmClock className="size-4" />}
          hint={counts.myOverdue ? `${counts.myOverdue} são suas` : 'nenhuma sua'}
          onClick={() => changeScope('OVERDUE')}
        />
        <Stat label="Vencem hoje" value={counts.dueToday} tone="warning" icon={<CalendarCheck className="size-4" />} hint="prazo até o fim do dia" />
        <Stat label="Concluídas" value={counts.done30} tone="success" icon={<CheckCircle2 className="size-4" />} hint="nos últimos 30 dias" />
      </StatGrid>

      <Toolbar>
        <Segmented
          size="sm"
          value={scope}
          onChange={changeScope}
          options={[
            { value: 'MINE', label: 'Minhas', count: counts.MINE },
            { value: 'ALL', label: 'Todas', count: counts.ALL },
            { value: 'OVERDUE', label: 'Vencidas', count: counts.OVERDUE },
          ]}
        />
        {scope !== 'OVERDUE' && (
          <Segmented
            size="sm"
            value={groupBy}
            onChange={setGroupBy}
            options={[
              { value: 'STATUS', label: 'Por situação' },
              { value: 'PRIORITY', label: 'Por prioridade' },
            ]}
          />
        )}
        <SearchInput value={q} onChange={setQ} placeholder="Buscar tarefa, responsável…" className="sm:w-72 sm:ml-auto" />
      </Toolbar>

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : !rows.length ? (
        <div className="bg-surface border border-border rounded-card">
          <EmptyState
            icon={<ListChecks className="size-5" />}
            title="Nenhuma tarefa ainda"
            description="Crie a primeira tarefa e defina um responsável e um prazo."
            action={
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setDraft(emptyTask(profile ? { id: profile.id, name: profile.name } : null))}>
                Nova tarefa
              </Button>
            }
          />
        </div>
      ) : !filtered.length ? (
        <div className="bg-surface border border-border rounded-card">
          <EmptyState
            icon={<ListChecks className="size-5" />}
            title={q ? 'Nenhuma tarefa encontrada' : scope === 'MINE' ? 'Nenhuma tarefa com você' : scope === 'OVERDUE' ? 'Nada vencido. Bom trabalho!' : 'Nenhuma tarefa'}
            description={q ? 'Tente outra busca.' : scope === 'MINE' ? 'Veja as tarefas da equipe ou crie uma nova.' : undefined}
            action={
              scope !== 'ALL' && !q ? (
                <Button variant="secondary" onClick={() => changeScope('ALL')}>
                  Ver todas as tarefas
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className={cn('grid gap-4 items-start', lanes.length === 1 ? 'max-w-2xl' : 'lg:grid-cols-3')}>
          {lanes.map((lane) => (
            <LaneColumn key={lane.key} lane={lane}>
              {(task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  me={me}
                  onOpen={() => openTask(task)}
                  onToggle={() => void actions.toggle.run(task)}
                  onDelete={() => void actions.remove.run(task)}
                  canEdit={actions.canEdit(task)}
                  canDelete={actions.canDelete(task)}
                />
              )}
            </LaneColumn>
          ))}
        </div>
      )}

      <TaskForm
        draft={draft}
        onChange={setDraft}
        onClose={() => setDraft(null)}
        onSave={(d) => void actions.save.run(d)}
        saving={actions.save.running}
        readOnly={!!editing && !actions.canEdit(editing)}
      />
    </>
  );
}

function LaneColumn({ lane, children }: { lane: Lane; children: (t: Task) => ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const visible = lane.limit && !expanded ? lane.tasks.slice(0, lane.limit) : lane.tasks;
  const hidden = lane.tasks.length - visible.length;
  return (
    <section className={cn('rounded-card bg-surface-2/50 border border-border p-2.5 sm:p-3 min-w-0', !lane.tasks.length && 'max-lg:hidden')}>
      <header className="flex items-center justify-between gap-2 px-1 pb-2.5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-fg flex items-center gap-2">
            {lane.label}
            <Badge tone={lane.tasks.length ? lane.tone : 'neutral'} size="xs">
              {lane.tasks.length}
            </Badge>
          </h3>
          <p className="text-[11px] text-subtle mt-0.5">{lane.hint}</p>
        </div>
      </header>
      <div className="space-y-2.5">
        {visible.map((t) => children(t))}
        {!lane.tasks.length && (
          <p className="text-xs text-subtle text-center py-6 border border-dashed border-border rounded-card">
            {lane.key === 'OVERDUE' ? 'Nada vencido. Bom trabalho!' : 'Nenhuma tarefa aqui.'}
          </p>
        )}
        {hidden > 0 && (
          <Button variant="ghost" size="sm" block onClick={() => setExpanded(true)}>
            Mostrar mais {hidden}
          </Button>
        )}
      </div>
    </section>
  );
}
