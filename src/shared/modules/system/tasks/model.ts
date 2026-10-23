/**
 * Regras puras das tarefas da equipe (sem React).
 */
import { daysBetween, today } from '../../../domain/format';
import type { LabelInfo } from '../../../domain/labels';
import type { Task } from '../../../domain/types';

export type TaskPriority = Task['priority'];

export const TASK_PRIORITY: Record<TaskPriority, LabelInfo> = {
  HIGH: { label: 'Alta', tone: 'danger' },
  MEDIUM: { label: 'Média', tone: 'warning' },
  LOW: { label: 'Baixa', tone: 'neutral' },
};

export const PRIORITY_ORDER: TaskPriority[] = ['HIGH', 'MEDIUM', 'LOW'];
const WEIGHT: Record<TaskPriority, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

export const isTaskOverdue = (t: Pick<Task, 'status' | 'dueDate'>, ref = today()) => t.status === 'OPEN' && !!t.dueDate && t.dueDate < ref;
export const isDueToday = (t: Pick<Task, 'status' | 'dueDate'>, ref = today()) => t.status === 'OPEN' && t.dueDate === ref;

/** Situação visível no quadro. */
export type TaskLane = 'OVERDUE' | 'OPEN' | 'DONE';

export const TASK_LANES: Record<TaskLane, LabelInfo & { hint: string }> = {
  OVERDUE: { label: 'Vencidas', tone: 'danger', hint: 'Passaram do prazo' },
  OPEN: { label: 'A fazer', tone: 'info', hint: 'No prazo ou sem data' },
  DONE: { label: 'Concluídas', tone: 'success', hint: 'Mais recentes primeiro' },
};

export function laneOf(t: Task, ref = today()): TaskLane {
  if (t.status === 'DONE') return 'DONE';
  return isTaskOverdue(t, ref) ? 'OVERDUE' : 'OPEN';
}

/** Abertas: vencidas primeiro, depois prazo mais próximo, prioridade e título. Concluídas: mais recentes. */
export function compareTasks(a: Task, b: Task): number {
  if (a.status !== b.status) return a.status === 'OPEN' ? -1 : 1;
  if (a.status === 'DONE') return (b.doneAt || b.updatedAt || '').localeCompare(a.doneAt || a.updatedAt || '');
  const da = a.dueDate || '9999-12-31';
  const db = b.dueDate || '9999-12-31';
  if (da !== db) return da.localeCompare(db);
  if (a.priority !== b.priority) return WEIGHT[b.priority] - WEIGHT[a.priority];
  return a.title.localeCompare(b.title, 'pt-BR');
}

/** "Venceu há 3 dias", "Vence hoje", "Vence em 2 dias", "Sem prazo". */
export function dueLabel(t: Pick<Task, 'status' | 'dueDate'>, ref = today()): string {
  if (!t.dueDate) return 'Sem prazo';
  const d = daysBetween(ref, t.dueDate);
  if (t.status === 'DONE') return `Prazo ${t.dueDate.split('-').reverse().slice(0, 2).join('/')}`;
  if (d < 0) return d === -1 ? 'Venceu ontem' : `Venceu há ${-d} dias`;
  if (d === 0) return 'Vence hoje';
  if (d === 1) return 'Vence amanhã';
  return `Vence em ${d} dias`;
}

/** Tela de destino de um registro relacionado à tarefa. */
export function relatedPath(t: Pick<Task, 'relatedEntity' | 'relatedId'>): { path: string; label: string } | null {
  const id = t.relatedId;
  switch (t.relatedEntity) {
    case 'customers':
      return { path: id ? `/clientes/${id}` : '/clientes', label: 'Cliente' };
    case 'batches':
      return { path: id ? `/gado/lotes/${id}` : '/gado/lotes', label: 'Lote de gado' };
    case 'sales':
      return { path: id ? `/vendas/${id}` : '/vendas', label: 'Pedido' };
    case 'processing_orders':
      return { path: id ? `/producao/processamento/${id}` : '/producao/processamento', label: 'Ordem de desossa' };
    case 'equines':
      return { path: id ? `/equinos/${id}` : '/equinos', label: 'Equino' };
    case 'price_tables':
      return { path: '/comercial/precos', label: 'Tabelas de preço' };
    case 'financial_entries':
      return { path: '/financeiro', label: 'Financeiro' };
    case 'stock_lots':
      return { path: '/estoque', label: 'Estoque' };
    default:
      return null;
  }
}

export type TaskDraft = {
  id?: string;
  title: string;
  description: string;
  assigneeId: string | null;
  assigneeName: string | null;
  dueDate: string | null;
  priority: TaskPriority;
};

export const emptyTask = (assignee?: { id: string; name: string } | null): TaskDraft => ({
  title: '',
  description: '',
  assigneeId: assignee?.id ?? null,
  assigneeName: assignee?.name ?? null,
  dueDate: null,
  priority: 'MEDIUM',
});

export const draftOf = (t: Task): TaskDraft => ({
  id: t.id,
  title: t.title,
  description: t.description || '',
  assigneeId: t.assigneeId ?? null,
  assigneeName: t.assigneeName ?? null,
  dueDate: t.dueDate ?? null,
  priority: t.priority,
});

/** Sugestões rápidas de título (rotina do antigo painel operacional). */
export const TITLE_SUGGESTIONS = ['Vacinação', 'Pesagem do lote', 'Conferir GTA e nota', 'Agendar abate', 'Inventário da câmara fria', 'Cobrar cliente', 'Conferir retorno da desossa'];
