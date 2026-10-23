/**
 * Visão geral da ficha: dados, gestação, lembretes, finanças e atividade.
 */
import { Baby, BellRing, CircleDollarSign, History, IdCard } from 'lucide-react';
import { date, money, number } from '../../../domain/format';
import { EQUINE_EVENT_LABELS, EQUINE_SEX_LABELS } from '../../../domain/labels';
import type { Equine, EquineEvent } from '../../../domain/types';
import { Badge, Button, Card, CardHeader, cn, DescriptionList, Progress, Timeline } from '../../../ui';
import { EVENT_SPECS } from '../eventSpecs';
import { ageLabel, alertText, gestation, GESTATION_DAYS, pendingAlerts, REPRO_STATUS } from '../model';
import type { EquineFinance } from './finance';

export function GestationCard({ equine, onEdit }: { equine: Equine; onEdit?: () => void }) {
  const g = gestation(equine);
  if (!g) return null;
  const past = g.daysLeft < 0;
  return (
    <Card className="border-accent/30">
      <CardHeader
        icon={<Baby className="size-4" />}
        title="Gestação"
        subtitle={equine.coverStallion ? `Garanhão: ${equine.coverStallion}` : 'Garanhão não informado'}
        actions={
          onEdit && (
            <Button size="xs" variant="ghost" onClick={onEdit}>
              Editar
            </Button>
          )
        }
      />
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className={cn('font-display text-3xl font-semibold leading-none num', past ? 'text-warning' : 'text-accent')}>{Math.abs(g.daysLeft)}</div>
          <div className="mt-1 text-xs text-muted">{past ? 'dias após a data prevista' : g.daysLeft === 0 ? 'parto previsto para hoje' : 'dias para o parto'}</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-medium text-fg num">{date(g.dueDate)}</div>
          <div className="text-xs text-muted">previsão de parto</div>
        </div>
      </div>
      <Progress value={g.progress} tone="accent" className="mt-4 h-2" />
      <div className="mt-1.5 flex justify-between text-[11px] text-subtle num">
        <span>Cobertura {date(g.coverDate)}</span>
        <span>{g.daysPregnant !== null ? `${g.daysPregnant} de ${GESTATION_DAYS} dias` : `${Math.round(g.progress)}%`}</span>
      </div>
      {(equine.pregnancyDiagnosisDate || equine.pregnancyNotes) && (
        <div className="mt-3 space-y-1 border-t border-border pt-3 text-xs text-muted">
          {equine.pregnancyDiagnosisDate && <div>Diagnóstico de prenhez em {date(equine.pregnancyDiagnosisDate)}</div>}
          {equine.pregnancyNotes && <div>{equine.pregnancyNotes}</div>}
        </div>
      )}
    </Card>
  );
}

export function OverviewTab({
  equine: e,
  events,
  finance,
  onEditRepro,
  onOpenTab,
}: {
  equine: Equine;
  events: EquineEvent[];
  finance: EquineFinance;
  onEditRepro?: () => void;
  onOpenTab: (tab: string) => void;
}) {
  const alerts = pendingAlerts(events, { horizon: 60 });
  const recent = [...events].sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1)).slice(0, 6);
  const diff = e.weightKg && e.idealWeightKg ? e.weightKg - e.idealWeightKg : null;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2 min-w-0">
        <Card>
          <CardHeader icon={<IdCard className="size-4" />} title="Identificação" />
          <DescriptionList
            cols={3}
            items={[
              { label: 'Sexo', value: EQUINE_SEX_LABELS[e.sex] },
              { label: 'Nascimento', value: e.birthDate ? `${date(e.birthDate)} (${ageLabel(e.birthDate, true)})` : '—' },
              { label: 'Raça / pelagem', value: [e.breed, e.coat].filter(Boolean).join(' · ') },
              { label: 'Altura', value: e.heightCm ? `${number(e.heightCm, 0)} cm` : '—' },
              {
                label: 'Peso',
                value: e.weightKg ? (
                  <span>
                    <span className="num">{number(e.weightKg, 1)} kg</span>
                    {diff !== null && (
                      <span className={cn('ml-1.5 text-xs num', Math.abs(diff) < 1 ? 'text-success' : 'text-warning')}>
                        {Math.abs(diff) < 1 ? 'no ideal' : `${diff > 0 ? '+' : ''}${number(diff, 1)} kg do ideal`}
                      </span>
                    )}
                  </span>
                ) : (
                  '—'
                ),
              },
              { label: 'Microchip', value: e.chipId ? <span className="num">{e.chipId}</span> : '—' },
              { label: 'Registro', value: [e.registry, e.secondaryRegistry].filter(Boolean).join(' · ') || '—' },
              { label: 'Pai × mãe', value: [e.sireName || '?', e.damName || '?'].join(' × ') },
              { label: 'Reprodução', value: e.reproStatus ? REPRO_STATUS[e.reproStatus].label : '—' },
              { label: 'Local', value: [e.haras, e.paddock].filter(Boolean).join(' · ') || '—' },
              { label: 'Responsável', value: e.manager || '—' },
              { label: 'Valor estimado', value: e.estimatedValue ? money(e.estimatedValue) : '—' },
              { label: 'Marcações', value: e.markings, span: true, hidden: !e.markings },
              { label: 'Observações', value: e.notes, span: true, hidden: !e.notes },
            ]}
          />
        </Card>

        <Card>
          <CardHeader icon={<History className="size-4" />} title="Atividade recente" subtitle={`${events.length} registro(s) no histórico`} />
          {recent.length ? (
            <Timeline
              items={recent.map((ev) => ({
                at: `${date(ev.date)} · ${EQUINE_EVENT_LABELS[ev.type].label}${ev.amount ? ` · ${money(ev.amount)}` : ''}`,
                title: ev.title,
                description: EVENT_SPECS[ev.type].summary(ev) || undefined,
                tone: EQUINE_EVENT_LABELS[ev.type].tone,
              }))}
            />
          ) : (
            <p className="text-sm text-subtle">Nada registrado ainda. Use "Registrar evento" para começar o histórico.</p>
          )}
        </Card>
      </div>

      <div className="space-y-4 min-w-0 max-lg:order-first">
        <GestationCard equine={e} onEdit={onEditRepro} />

        <Card>
          <CardHeader icon={<BellRing className="size-4" />} title="Próximos lembretes" subtitle="Vencidos e próximos 60 dias" />
          {alerts.length ? (
            <ul className="space-y-2.5">
              {alerts.slice(0, 6).map(({ event: ev, days }) => (
                <li key={ev.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm text-fg">{ev.title}</div>
                    <div className="text-xs text-muted">
                      {EQUINE_EVENT_LABELS[ev.type].label} · {date(ev.alertDate)}
                    </div>
                  </div>
                  <Badge tone={days < 0 ? 'danger' : days <= 7 ? 'warning' : 'info'} size="xs">
                    {alertText(days)}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-subtle">Nenhum lembrete pendente.</p>
          )}
        </Card>

        <Card>
          <CardHeader
            icon={<CircleDollarSign className="size-4" />}
            title="Resumo financeiro"
            actions={
              <Button size="xs" variant="ghost" onClick={() => onOpenTab('financeiro')}>
                Detalhes
              </Button>
            }
          />
          <dl className="space-y-2 text-sm">
            <Row label="Despesas" value={`− ${money(finance.cost)}`} />
            <Row label="Receitas e prêmios" value={`+ ${money(finance.income)}`} tone="success" />
            {finance.sale && <Row label="Venda" value={`+ ${money(finance.sale.totalPrice)}`} tone="success" />}
            <div className="border-t border-border pt-2">
              <Row label="Resultado" value={money(finance.result)} tone={finance.result >= 0 ? 'success' : 'danger'} strong />
            </div>
            {finance.sale && finance.open > 0 && <Row label="A receber da venda" value={money(finance.open)} tone={finance.overdue ? 'danger' : undefined} />}
          </dl>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, tone, strong }: { label: string; value: string; tone?: 'success' | 'danger'; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={cn('num', strong ? 'font-semibold' : 'font-medium', tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-fg')}>{value}</dd>
    </div>
  );
}
