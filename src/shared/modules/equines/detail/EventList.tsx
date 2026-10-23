/**
 * Lista de eventos (linha do tempo) — usada em todas as abas de tipo.
 */
import { BellRing, Edit3, ExternalLink, Paperclip, Plus, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useAction, useCrud } from '../../../data/react';
import { date, money, parseISODate } from '../../../domain/format';
import { EQUINE_EVENT_LABELS } from '../../../domain/labels';
import type { EquineEvent, EquineEventType } from '../../../domain/types';
import { Badge, Button, Card, CardHeader, cn, EmptyState, Menu, useConfirm } from '../../../ui';
import { EVENT_SPECS } from '../eventSpecs';
import { alertText, isIncomeEvent, pendingAlerts, str } from '../model';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function DateBlock({ iso }: { iso: string }) {
  const d = parseISODate(iso);
  if (!d) return <div className="w-11 shrink-0" />;
  return (
    <div className="w-11 shrink-0 rounded-control bg-surface-2 py-1.5 text-center">
      <div className="text-base font-semibold leading-none text-fg num">{String(d.getDate()).padStart(2, '0')}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted num">
        {MONTHS[d.getMonth()]}/{String(d.getFullYear()).slice(2)}
      </div>
    </div>
  );
}

export function EventList({
  events,
  canEdit,
  onEdit,
  showType,
  empty,
  limit = 25,
}: {
  events: EquineEvent[];
  canEdit: boolean;
  onEdit: (e: EquineEvent) => void;
  showType?: boolean;
  empty?: ReactNode;
  limit?: number;
}) {
  const crud = useCrud('equine_events');
  const confirm = useConfirm();
  const [all, setAll] = useState(false);
  const remove = useAction(
    async (e: EquineEvent) => {
      if (await confirm({ title: `Excluir "${e.title}"?`, message: 'O registro e seus anexos saem do histórico do animal.', danger: true, confirmLabel: 'Excluir' }))
        await crud.remove(e.id);
    },
  );
  const pending = new Set(pendingAlerts(events, { horizon: 3650 }).map((a) => a.event.id));
  const sorted = [...events].sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1));
  const visible = all ? sorted : sorted.slice(0, limit);

  if (!events.length) return <>{empty}</>;
  return (
    <>
      <ul className="divide-y divide-border">
        {visible.map((e) => {
          const income = isIncomeEvent(e);
          const summary = EVENT_SPECS[e.type].summary(e);
          const days = e.alertDate && pending.has(e.id) ? pendingAlerts([e], { horizon: 3650 })[0]?.days : null;
          const video = e.type === 'TRAINING' ? str(e.data.videoUrl) : '';
          return (
            <li key={e.id} className={cn('flex gap-3 px-4 py-3 sm:px-5', canEdit && 'cursor-pointer hover:bg-surface-2/50')} onClick={canEdit ? () => onEdit(e) : undefined}>
              <DateBlock iso={e.date} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-medium text-fg">{e.title}</span>
                  {showType && (
                    <Badge tone={EQUINE_EVENT_LABELS[e.type].tone} size="xs">
                      {EQUINE_EVENT_LABELS[e.type].label}
                    </Badge>
                  )}
                </div>
                {summary && <div className="mt-0.5 text-xs text-muted">{summary}</div>}
                {e.notes && <div className="mt-1 text-xs text-subtle line-clamp-2">{e.notes}</div>}
                {(e.alertDate || e.attachments?.length > 0 || video) && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {e.alertDate && (
                      <Badge tone={days === null || days === undefined ? 'neutral' : days < 0 ? 'danger' : days <= 7 ? 'warning' : 'info'} size="xs">
                        <BellRing className="size-3" />
                        {date(e.alertDate)}
                        {days !== null && days !== undefined ? ` · ${alertText(days)}` : ''}
                      </Badge>
                    )}
                    {e.attachments?.length > 0 && (
                      <Badge size="xs">
                        <Paperclip className="size-3" />
                        {e.attachments.length} anexo{e.attachments.length > 1 ? 's' : ''}
                      </Badge>
                    )}
                    {video && (
                      <a href={video} target="_blank" rel="noreferrer" onClick={(ev) => ev.stopPropagation()} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        Vídeo <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-start gap-1">
                {e.amount ? (
                  <span className={cn('pt-0.5 text-sm font-medium num whitespace-nowrap', income ? 'text-success' : 'text-fg')}>
                    {income ? '+' : '−'} {money(e.amount)}
                  </span>
                ) : null}
                {canEdit && (
                  <div onClick={(ev) => ev.stopPropagation()}>
                    <Menu
                      items={[
                        { label: 'Editar', icon: <Edit3 />, onClick: () => onEdit(e) },
                        'divider',
                        { label: 'Excluir', icon: <Trash2 />, danger: true, onClick: () => void remove.run(e) },
                      ]}
                    />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {sorted.length > limit && (
        <div className="border-t border-border px-4 py-2 text-center">
          <Button size="sm" variant="ghost" onClick={() => setAll(!all)}>
            {all ? 'Mostrar menos' : `Ver todos (${sorted.length})`}
          </Button>
        </div>
      )}
    </>
  );
}

/** Cartão padrão de uma aba de tipo: cabeçalho + botão + lista. */
export function EventsCard({
  type,
  title,
  subtitle,
  events,
  canEdit,
  onNew,
  onEdit,
  emptyTitle,
  emptyDescription,
}: {
  type: EquineEventType;
  title?: string;
  subtitle?: string;
  events: EquineEvent[];
  canEdit: boolean;
  onNew: (t: EquineEventType) => void;
  onEdit: (e: EquineEvent) => void;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const spec = EVENT_SPECS[type];
  return (
    <Card padded={false}>
      <CardHeader
        className="px-4 pt-4 sm:px-5 sm:pt-5"
        title={title || EQUINE_EVENT_LABELS[type].label}
        subtitle={subtitle ?? `${events.length} registro(s)`}
        actions={
          canEdit && (
            <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => onNew(type)}>
              <span className="max-sm:hidden">Registrar</span>
              <span className="sm:hidden">Novo</span>
            </Button>
          )
        }
      />
      <div className="border-t border-border">
        <EventList
          events={events}
          canEdit={canEdit}
          onEdit={onEdit}
          empty={<EmptyState title={emptyTitle || `Nenhum registro de ${spec.noun}`} description={emptyDescription} className="py-10" />}
        />
      </div>
    </Card>
  );
}
