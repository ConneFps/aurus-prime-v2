/**
 * Abas por tipo de evento: Saúde, Treinamento, Casqueamento, Transporte,
 * Hospedagem e Competições (indicadores próprios + lista).
 */
import { Activity, Award, BellRing, CalendarClock, Clock, Hammer, Medal, Stethoscope, Syringe, Tent, Trophy, Truck, Wallet } from 'lucide-react';
import { useMemo } from 'react';
import { date, integer, money, number, today } from '../../../domain/format';
import type { EquineEvent, EquineEventType } from '../../../domain/types';
import { Card, CardHeader, RankBars, Stat, StatGrid, TrendChart } from '../../../ui';
import { alertText, eventCost, modalityLabel, pendingAlerts, placementLabel, str } from '../model';
import { MoneyValue, useStatIcon } from '../parts';
import { EventsCard } from './EventList';

export interface TypeTabProps {
  events: EquineEvent[];
  canEdit: boolean;
  onNew: (t: EquineEventType) => void;
  onEdit: (e: EquineEvent) => void;
}

const of = (events: EquineEvent[], t: EquineEventType) => events.filter((e) => e.type === t);
const sumCost = (events: EquineEvent[]) => events.reduce((s, e) => s + eventCost(e), 0);
const last = (events: EquineEvent[]) => [...events].sort((a, b) => (a.date < b.date ? 1 : -1))[0];

export function HealthTab(p: TypeTabProps) {
  const ic = useStatIcon();
  const list = of(p.events, 'HEALTH');
  const alerts = pendingAlerts(list);
  const lastVaccine = last(list.filter((e) => e.data.kind === 'VACINA'));
  const lastDeworm = last(list.filter((e) => e.data.kind === 'VERMIFUGO'));
  return (
    <div className="space-y-4">
      <StatGrid cols={4}>
        <Stat label="Registros" icon={ic(<Stethoscope className="size-4" />)} value={integer(list.length)} hint={`Custo total ${money(sumCost(list))}`} />
        <Stat
          label="Alertas"
          tone={alerts.some((a) => a.days < 0) ? 'danger' : alerts.length ? 'warning' : 'success'}
          icon={ic(<BellRing className="size-4" />)}
          value={integer(alerts.length)}
          hint={alerts[0] ? `${alerts[0].event.title}: ${alertText(alerts[0].days)}` : 'Nada pendente'}
        />
        <Stat label="Última vacina" icon={ic(<Syringe className="size-4" />)} tone="info" value={lastVaccine ? date(lastVaccine.date) : '—'} hint={lastVaccine?.title || 'Sem registro'} />
        <Stat label="Último vermífugo" icon={ic(<Syringe className="size-4" />)} tone="accent" value={lastDeworm ? date(lastDeworm.date) : '—'} hint={lastDeworm?.title || 'Sem registro'} />
      </StatGrid>
      <EventsCard
        type="HEALTH"
        title="Saúde e veterinário"
        subtitle="Vacinas, vermífugos, exames, ultrassons e medicamentos"
        events={list}
        canEdit={p.canEdit}
        onNew={p.onNew}
        onEdit={p.onEdit}
        emptyDescription="Registre vacinas e vermífugos com a data da próxima dose para receber lembretes."
      />
    </div>
  );
}

export function TrainingTab(p: TypeTabProps) {
  const ic = useStatIcon();
  const list = of(p.events, 'TRAINING');
  const scored = useMemo(
    () =>
      list
        .filter((e) => e.data.score !== null && e.data.score !== undefined && e.data.score !== '')
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .map((e) => ({ date: e.date, score: Number(e.data.score) })),
    [list],
  );
  const avg = scored.length ? scored.reduce((s, x) => s + x.score, 0) / scored.length : null;
  const minutes = list.reduce((s, e) => s + (Number(e.data.durationMinutes) || 0), 0);
  const byModality = useMemo(() => {
    const m = new Map<string, number>();
    list.forEach((e) => m.set(modalityLabel(e.data.modality) || 'Sem modalidade', (m.get(modalityLabel(e.data.modality) || 'Sem modalidade') || 0) + 1));
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value }));
  }, [list]);
  return (
    <div className="space-y-4">
      <StatGrid cols={4}>
        <Stat label="Sessões" icon={ic(<Activity className="size-4" />)} value={integer(list.length)} hint={list.length ? `Última em ${date(last(list).date)}` : 'Nenhuma ainda'} />
        <Stat label="Nota média" tone="accent" icon={ic(<Award className="size-4" />)} value={avg === null ? '—' : number(avg, 1)} hint="de 0 a 10" />
        <Stat label="Tempo total" tone="info" icon={ic(<Clock className="size-4" />)} value={minutes >= 60 ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}` : `${minutes} min`} hint={`${integer(minutes)} minutos no total`} />
        <Stat label="Custo" tone="danger" icon={ic(<Wallet className="size-4" />)} value={<MoneyValue value={sumCost(list)} />} />
      </StatGrid>
      {scored.length > 1 && (
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <Card>
            <CardHeader title="Evolução da nota de desempenho" subtitle="Nota dada pelo treinador em cada sessão" />
            <TrendChart data={scored} xKey="date" series={[{ key: 'score', name: 'Nota' }]} kind="line" height={220} xFormat={(v) => date(v).slice(0, 5)} format={(v) => number(v, 1)} />
          </Card>
          <Card>
            <CardHeader title="Por modalidade" />
            <RankBars items={byModality} format={(v) => (v === 1 ? '1 sessão' : `${v} sessões`)} />
          </Card>
        </div>
      )}
      <EventsCard type="TRAINING" title="Treinamentos" subtitle="Sessões, modalidade, duração e nota" events={list} canEdit={p.canEdit} onNew={p.onNew} onEdit={p.onEdit} />
    </div>
  );
}

export function FarrierTab(p: TypeTabProps) {
  const ic = useStatIcon();
  const list = of(p.events, 'FARRIER');
  const l = last(list);
  const next = l ? str(l.data.nextDate) : '';
  const days = next ? pendingAlerts([{ ...l, alertDate: next }], { horizon: 3650 })[0]?.days : null;
  return (
    <div className="space-y-4">
      <StatGrid cols={3}>
        <Stat label="Último casqueamento" icon={ic(<Hammer className="size-4" />)} value={l ? date(l.date) : '—'} hint={l ? str(l.data.hoofCondition) && `Cascos: ${str(l.data.hoofCondition)}` : 'Sem registro'} />
        <Stat
          label="Próximo"
          tone={days !== null && days !== undefined && days < 0 ? 'danger' : 'warning'}
          icon={ic(<CalendarClock className="size-4" />)}
          value={next ? date(next) : '—'}
          hint={days !== null && days !== undefined ? alertText(days) : 'A cada 45 dias, em média'}
        />
        <Stat label="Custo total" tone="danger" icon={ic(<Wallet className="size-4" />)} value={<MoneyValue value={sumCost(list)} />} hint={`${list.length} registro(s)`} className="col-span-2 sm:col-span-1" />
      </StatGrid>
      <EventsCard type="FARRIER" title="Casqueamento e manejo" subtitle="Ferrageamento, condição dos cascos e fisioterapia" events={list} canEdit={p.canEdit} onNew={p.onNew} onEdit={p.onEdit} />
    </div>
  );
}

export function TransportTab(p: TypeTabProps) {
  const ic = useStatIcon();
  const list = of(p.events, 'TRANSPORT');
  const l = last(list);
  return (
    <div className="space-y-4">
      <StatGrid cols={3}>
        <Stat label="Viagens" icon={ic(<Truck className="size-4" />)} value={integer(list.length)} hint={l ? `Última: ${str(l.data.destination) || l.title}` : 'Nenhuma ainda'} />
        <Stat label="Custo com fretes" tone="danger" icon={ic(<Wallet className="size-4" />)} value={<MoneyValue value={sumCost(list)} />} />
        <Stat label="Última viagem" tone="info" icon={ic(<CalendarClock className="size-4" />)} value={l ? date(l.date) : '—'} className="col-span-2 sm:col-span-1" />
      </StatGrid>
      <EventsCard type="TRANSPORT" title="Transportes e viagens" subtitle="Origem, destino, veículo e motivo" events={list} canEdit={p.canEdit} onNew={p.onNew} onEdit={p.onEdit} />
    </div>
  );
}

export function StayTab(p: TypeTabProps) {
  const ic = useStatIcon();
  const list = of(p.events, 'STAY');
  const t = today();
  const current = list.find((e) => str(e.data.checkIn) <= t && (!e.data.checkOut || str(e.data.checkOut) >= t));
  return (
    <div className="space-y-4">
      <StatGrid cols={3}>
        <Stat
          label="Hospedado agora em"
          icon={ic(<Tent className="size-4" />)}
          value={<span className="text-lg">{current ? str(current.data.location) || current.title : 'Haras de origem'}</span>}
          hint={current ? `Desde ${date(str(current.data.checkIn))}` : 'Nenhuma estadia em aberto'}
        />
        <Stat label="Estadias" tone="info" icon={ic(<CalendarClock className="size-4" />)} value={integer(list.length)} />
        <Stat label="Custo com hospedagem" tone="danger" icon={ic(<Wallet className="size-4" />)} value={<MoneyValue value={sumCost(list)} />} className="col-span-2 sm:col-span-1" />
      </StatGrid>
      <EventsCard type="STAY" title="Hospedagem" subtitle="Estadias fora do haras (exposições, centros de treino, clínicas)" events={list} canEdit={p.canEdit} onNew={p.onNew} onEdit={p.onEdit} />
    </div>
  );
}

export function CompetitionsTab(p: TypeTabProps) {
  const ic = useStatIcon();
  const list = of(p.events, 'COMPETITION');
  const wins = list.filter((e) => str(e.data.placement) === '1').length;
  const podium = list.filter((e) => ['1', '2', '3'].includes(str(e.data.placement))).length;
  const prizes = list.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const best = [...list].filter((e) => /^\d+$/.test(str(e.data.placement))).sort((a, b) => Number(a.data.placement) - Number(b.data.placement))[0];
  return (
    <div className="space-y-4">
      <StatGrid cols={4}>
        <Stat label="Competições" icon={ic(<Trophy className="size-4" />)} value={integer(list.length)} hint={best ? `Melhor: ${placementLabel(best.data.placement)}` : undefined} />
        <Stat label="Vitórias" tone="accent" icon={ic(<Medal className="size-4" />)} value={integer(wins)} hint="1º lugar" />
        <Stat label="Pódios" tone="info" icon={ic(<Award className="size-4" />)} value={integer(podium)} hint="1º ao 3º lugar" />
        <Stat label="Prêmios" tone="success" icon={ic(<Wallet className="size-4" />)} value={<MoneyValue value={prizes} />} hint="Entram como receita" />
      </StatGrid>
      <EventsCard
        type="COMPETITION"
        title="Competições e concursos"
        subtitle="Provas, colocação e premiação"
        events={list}
        canEdit={p.canEdit}
        onNew={p.onNew}
        onEdit={p.onEdit}
        emptyDescription="Registre provas e concursos — a premiação entra no financeiro do animal."
      />
    </div>
  );
}
