/**
 * Reprodução: gestação (éguas) e coletas de sêmen (garanhões).
 */
import { Baby, Droplets, FlaskConical, Gauge, HeartHandshake, Snowflake, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { date, integer, normalize, number } from '../../../domain/format';
import type { Equine, EquineEvent, EquineEventType, SemenPurchase } from '../../../domain/types';
import { Badge, Button, Callout, Card, CardHeader, DescriptionList, Stat, StatGrid, StatusBadge } from '../../../ui';
import { gestation, REPRO_STATUS, SEMEN_STATUS, semenStatus } from '../model';
import { useStatIcon } from '../parts';
import { EventList, EventsCard } from './EventList';
import { GestationCard } from './OverviewTab';

export function ReproductionTab({
  equine: e,
  events,
  herd,
  purchases,
  canEdit,
  onNew,
  onEdit,
  onEditRepro,
}: {
  equine: Equine;
  events: EquineEvent[];
  herd: Equine[];
  purchases: SemenPurchase[];
  canEdit: boolean;
  onNew: (t: EquineEventType) => void;
  onEdit: (ev: EquineEvent) => void;
  onEditRepro: () => void;
}) {
  const ic = useStatIcon();
  if (e.sex === 'CASTRADO')
    return <Callout tone="info" title="Animal castrado">Não há controle reprodutivo para castrados. A genealogia continua disponível na aba Genealogia.</Callout>;

  const info = (
    <Card>
      <CardHeader
        title="Dados reprodutivos"
        actions={
          canEdit && (
            <Button size="sm" onClick={onEditRepro}>
              Editar
            </Button>
          )
        }
      />
      <DescriptionList
        cols={e.sex === 'EGUA' ? 3 : 2}
        items={[
          { label: 'Situação', value: e.reproStatus ? <StatusBadge info={REPRO_STATUS[e.reproStatus]} /> : '—' },
          { label: 'Fertilidade / avaliação', value: e.fertilityRating || '—' },
          { label: 'Última cobertura', value: date(e.coverDate), hidden: e.sex !== 'EGUA' },
          { label: 'Garanhão', value: e.coverStallion || '—', hidden: e.sex !== 'EGUA' },
          { label: 'Diagnóstico de prenhez', value: date(e.pregnancyDiagnosisDate), hidden: e.sex !== 'EGUA' },
          { label: 'Previsão de parto', value: date(e.expectedFoalingDate), hidden: e.sex !== 'EGUA' },
          { label: 'Observações', value: e.pregnancyNotes, span: true, hidden: !e.pregnancyNotes },
        ]}
      />
    </Card>
  );

  if (e.sex === 'EGUA') {
    const key = normalize(e.name);
    const exams = events.filter((x) => x.type === 'HEALTH' && (x.data.kind === 'ULTRASSOM' || /prenhe|gesta|ultrass/i.test(x.title)));
    const usages = purchases.flatMap((p) => (p.usage || []).filter((u) => normalize(u.mareName) === key).map((u) => ({ ...u, p })));
    return (
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 min-w-0">{info}</div>
          <div className="min-w-0">
            {gestation(e) ? (
              <GestationCard equine={e} />
            ) : (
              <Card className="h-full">
                <CardHeader icon={<Baby className="size-4" />} title="Sem gestação ativa" subtitle="Registre a cobertura para calcular a previsão de parto (+340 dias)." />
                {canEdit && (
                  <Button variant="primary" size="sm" onClick={onEditRepro}>
                    Registrar cobertura
                  </Button>
                )}
              </Card>
            )}
          </div>
        </div>
        <Card padded={false}>
          <CardHeader className="px-4 pt-4 sm:px-5 sm:pt-5" title="Ultrassons e exames reprodutivos" subtitle="Registros de saúde do tipo ultrassom" />
          <div className="border-t border-border">
            <EventList events={exams} canEdit={canEdit} onEdit={onEdit} empty={<p className="px-5 py-6 text-sm text-subtle">Nenhum exame reprodutivo registrado (registre em Saúde → Ultrassom).</p>} />
          </div>
        </Card>
        <Card>
          <CardHeader icon={<Snowflake className="size-4" />} title="Sêmen utilizado nesta égua" subtitle="Doses baixadas do banco de sêmen" />
          {usages.length ? (
            <ul className="divide-y divide-border -my-2">
              {usages
                .sort((a, b) => (a.date < b.date ? 1 : -1))
                .map((u, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="text-fg">{u.p.stallionName}</div>
                      <div className="text-xs text-muted">
                        {date(u.date)}
                        {u.notes ? ` · ${u.notes}` : ''}
                      </div>
                    </div>
                    <Badge tone="info">
                      {u.doses} dose{u.doses > 1 ? 's' : ''}
                    </Badge>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="text-sm text-subtle">
              Nenhum uso registrado.{' '}
              <Link to="/equinos/semen" className="text-primary hover:underline">
                Abrir banco de sêmen
              </Link>
            </p>
          )}
        </Card>
      </div>
    );
  }

  // Garanhão
  const collections = events.filter((x) => x.type === 'SEMEN_COLLECTION');
  const produced = collections.reduce((s, c) => s + (Number(c.data.dosesProduced) || 0), 0);
  const available = collections.reduce((s, c) => s + (Number(c.data.dosesAvailable) || 0), 0);
  const avg = (k: string) => {
    const v = collections.map((c) => Number(c.data[k])).filter((n) => Number.isFinite(n) && n > 0);
    return v.length ? v.reduce((s, n) => s + n, 0) / v.length : null;
  };
  const mot = avg('motility');
  const vig = avg('vigor');
  const key = normalize(e.name);
  const covered = herd.filter((m) => m.sex === 'EGUA' && normalize(m.coverStallion) === key);
  const bought = purchases.filter((p) => normalize(p.stallionName) === key);
  return (
    <div className="space-y-4">
      <StatGrid cols={4}>
        <Stat label="Coletas" icon={ic(<FlaskConical className="size-4" />)} value={integer(collections.length)} hint={collections.length ? `Última em ${date([...collections].sort((a, b) => (a.date < b.date ? 1 : -1))[0].date)}` : 'Nenhuma ainda'} />
        <Stat label="Doses disponíveis" tone="info" icon={ic(<Droplets className="size-4" />)} value={integer(available)} hint={`${integer(produced)} produzidas`} />
        <Stat label="Motilidade média" tone="success" icon={ic(<Gauge className="size-4" />)} value={mot === null ? '—' : `${number(mot, 0)}%`} hint={mot !== null && mot >= 60 ? 'Boa qualidade' : undefined} />
        <Stat label="Vigor médio" tone="accent" icon={ic(<Zap className="size-4" />)} value={vig === null ? '—' : number(vig, 1)} hint="Escala de 1 a 5" />
      </StatGrid>
      {info}
      <EventsCard
        type="SEMEN_COLLECTION"
        title="Coletas de sêmen"
        subtitle="Volume, motilidade, vigor, doses e armazenamento"
        events={collections}
        canEdit={canEdit}
        onNew={onNew}
        onEdit={onEdit}
        emptyDescription="Registre as coletas para controlar as doses disponíveis no banco de sêmen."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader icon={<HeartHandshake className="size-4" />} title="Éguas cobertas por este garanhão" subtitle="Éguas do plantel com este garanhão na última cobertura" />
          {covered.length ? (
            <ul className="divide-y divide-border -my-2">
              {covered.map((m) => {
                const g = gestation(m);
                return (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <Link to={`/equinos/${m.id}?aba=reproducao`} className="min-w-0 text-fg hover:text-primary">
                      <div className="truncate">{m.name}</div>
                      <div className="text-xs text-muted">Cobertura {date(m.coverDate)}</div>
                    </Link>
                    {g ? <Badge tone="accent">Parto {date(g.dueDate)}</Badge> : <Badge>{m.reproStatus ? REPRO_STATUS[m.reproStatus].label : '—'}</Badge>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-subtle">Nenhuma égua do plantel com cobertura deste garanhão.</p>
          )}
        </Card>
        {bought.length > 0 && (
          <Card>
            <CardHeader icon={<Snowflake className="size-4" />} title="Sêmen comprado deste garanhão" />
            <ul className="divide-y divide-border -my-2">
              {bought.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="text-fg">
                    {p.supplierName} · {date(p.purchaseDate)}
                  </span>
                  <StatusBadge info={SEMEN_STATUS[semenStatus(p)]} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
