/**
 * Rótulos da auditoria (ações e áreas) — usados no relatório e nas configurações.
 */
import type { LabelInfo } from '../../domain/labels';
import { TABLES, type TableName } from '../../domain/schema';
import type { AuditAction } from '../../domain/types';

export const AUDIT_ACTIONS: Record<AuditAction, LabelInfo> = {
  CREATE: { label: 'Criação', tone: 'success' },
  UPDATE: { label: 'Alteração', tone: 'info' },
  DELETE: { label: 'Exclusão', tone: 'danger' },
  LOGIN: { label: 'Entrada', tone: 'neutral' },
  LOGOUT: { label: 'Saída', tone: 'neutral' },
  APPROVE: { label: 'Aprovação', tone: 'success' },
  REJECT: { label: 'Recusa', tone: 'warning' },
  CANCEL: { label: 'Cancelamento', tone: 'danger' },
  PAYMENT: { label: 'Pagamento', tone: 'primary' },
  REVERSAL: { label: 'Estorno', tone: 'warning' },
  IMPORT: { label: 'Importação', tone: 'accent' },
  EXPORT: { label: 'Exportação', tone: 'accent' },
};

export const auditActionInfo = (a: string): LabelInfo => AUDIT_ACTIONS[a as AuditAction] || { label: a, tone: 'neutral' };

/** Nome amigável da área (tabela) registrada no log. */
export function entityLabel(entity: string | null | undefined): string {
  if (!entity) return '—';
  return TABLES[entity as TableName]?.label || entity;
}
