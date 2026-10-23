/**
 * Plantel de equinos: indicadores, lembretes, grade de cartões e mapa do haras.
 */
import { Baby, BellRing, Download, FileDown, HeartPulse, LayoutGrid, Plus, Snowflake, Trophy, Wallet, Warehouse } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/session';
import { useTable } from '../../data/react';
import { addDays, date, integer, matchesSearch, money, monthLabel, startOfMonth, today } from '../../domain/format';
import { EQUINE_EVENT_LABELS, EQUINE_SEX_LABELS, EQUINE_STATUS, optionsOf } from '../../domain/labels';
import type { Equine, EquineSex, EquineStatus } from '../../domain/types';
import { Badge, Button, Card, CardHeader, EmptyState, exportCsv, PageHeader, SearchInput, Segmented, Select, Skeleton, Stat, StatGrid, Toolbar } from '../../ui';
import { EquineCard } from './EquineCard';
import { EquineFormDrawer, newEquineDraft, type EquineDraft } from './EquineForm';
import { HarasMap } from './HarasMap';
import { ageLabel, alertText, distinct, eventCost, gestation, isInHerd, pendingAlerts } from './model';
import { MoneyValue, useSmUp } from './parts';
import { exportHerdPdf } from './pdf';

type StatusFilter = 'HERD' | 'ALL' | EquineStatus;
type View = 'cards' | 'map';

export function EquinesPage() {
  const { can } = useSession();
  const canEdit = can('equines.manage');
  const nav = useNavigate();
  const sm = useSmUp();
  const { rows: equines, loading } = useTable('equines');
  const { rows: events } = useTable('equine_events');
  const [params, setParams] = useSearchParams();
  const view = (params.get('ver') as View) || 'cards';
  const setView = (v: View) =>
    setParams(
      (p) => {
        p.set('ver', v);
        return p;
      },
      { replace: true },
    );

  const [q, setQ] = useState('');
  const [sex, setSex] = useState<EquineSex | 'ALL'>('ALL');
  const [status, setStatus] = useState<StatusFilter>('HERD');
  const [breed, setBreed] = useState('');
  const [haras, setHaras] = useState('');
  const [draft, setDraft] = useState<EquineDraft | null>(null);
  const [showAllAlerts, setShowAllAlerts] = useState(false);

  const herd = useMemo(() => equines.filter(isInHerd), [equines]);
  const activeIds = useMemo(() => new Set(herd.map((e) => e.id)), [herd]);
  const alerts = useMemo(() => pendingAlerts(events, { activeIds }), [events, activeIds]);
  const alertsByEquine = useMemo(() => {
    const m = new Map<string, number>();
    alerts.forEach((a) => m.set(a.event.equineId, (m.get(a.event.equineId) || 0) + 1));
    return m;
  }, [alerts]);

  const kpi = useMemo(() => {
    const t = today();
    const month = t.slice(0, 7);
    const year = t.slice(0, 4);
    const pregnant = herd
      .map((e) => ({ e, g: gestation(e) }))
      .filter((x) => x.g)
      .sort((a, b) => (a.g!.dueDate < b.g!.dueDate ? -1 : 1));
    const nextBirth = pregnant.find((x) => x.g!.daysLeft >= 0) || pregnant[0];
    const health = alerts.filter((a) => a.event.type === 'HEALTH');
    const monthCost = events.filter((e) => e.date.startsWith(month)).reduce((s, e) => s + eventCost(e), 0);
    const prevMonth = addDays(startOfMonth(t), -1).slice(0, 7);
    const prevCost = events.filter((e) => e.date.startsWith(prevMonth)).reduce((s, e) => s + eventCost(e), 0);
    const comps = events.filter((e) => e.type === 'COMPETITION' && e.date.startsWith(year));
    return {
      bySex: (s: EquineSex) => herd.filter((e) => e.sex === s).length,
      pregnant: pregnant.length,
      nextBirth,
      health: health.length,
      healthOverdue: health.filter((a) => a.days < 0).length,
      monthCost,
      monthLabel: monthLabel(month),
      prevCost,
      prevLabel: monthLabel(prevMonth),
      prizes: comps.reduce((s, e) => s + (Number(e.amount) || 0), 0),
      comps: comps.length,
      wins: comps.filter((e) => String(e.data?.placement) === '1').length,
    };
  }, [herd, alerts, events]);

  const breeds = useMemo(() => distinct(equines.map((e) => e.breed)), [equines]);
  const harasList = useMemo(() => distinct(equines.map((e) => e.haras)), [equines]);

  const byStatus = useMemo(() => equines.filter((e) => (status === 'HERD' ? isInHerd(e) : status === 'ALL' ? true : e.status === status)), [equines, status]);
  const filtered = useMemo(
    () =>
      byStatus
        .filter((e) => sex === 'ALL' || e.sex === sex)
        .filter((e) => !breed || e.breed === breed)
        .filter((e) => !haras || (e.haras || '') === haras)
        .filter((e) => matchesSearch([e.name, e.breed, e.coat, e.registry, e.chipId, e.haras, e.paddock, e.sireName, e.damName], q))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [byStatus, sex, breed, haras, q],
  );
  const sexCount = (s: EquineSex | 'ALL') => byStatus.filter((e) => s === 'ALL' || e.sex === s).length;
  const filtersOn = !!(q || sex !== 'ALL' || status !== 'HERD' || breed || haras);

  const alertLimit = sm ? 6 : 3;
  const visibleAlerts = showAllAlerts ? alerts : alerts.slice(0, alertLimit);
  const nameOf = (id: string) => equines.find((e) => e.id === id)?.name || '—';

  return (
    <>
      <PageHeader
        eyebrow="Equinos"
        title="Plantel"
        subtitle="Cadastro, saúde, treino, reprodução e localização dos animais do haras."
        actions={
          <>
            <Button icon={<Snowflake className="size-4" />} onClick={() => nav('/equinos/semen')}>
              Banco de sêmen
            </Button>
            <Button icon={<FileDown className="size-4" />} onClick={() => exportHerdPdf(filtered, events)} disabled={!filtered.length}>
              PDF
            </Button>
            <Button
              className="max-sm:hidden"
              icon={<Download className="size-4" />}
              disabled={!filtered.length}
              onClick={() =>
                exportCsv('plantel-equinos', filtered, [
                  { header: 'Nome', value: (e) => e.name },
                  { header: 'Sexo', value: (e) => EQUINE_SEX_LABELS[e.sex] },
                  { header: 'Raça', value: (e) => e.breed },
                  { header: 'Pelagem', value: (e) => e.coat },
                  { header: 'Nascimento', value: (e) => date(e.birthDate) },
                  { header: 'Idade', value: (e) => ageLabel(e.birthDate) },
                  { header: 'Status', value: (e) => EQUINE_STATUS[e.status].label },
                  { header: 'Registro', value: (e) => e.registry },
                  { header: 'Chip', value: (e) => e.chipId },
                  { header: 'Haras', value: (e) => e.haras },
                  { header: 'Baia', value: (e) => e.paddock },
                  { header: 'Pai', value: (e) => e.sireName },
                  { header: 'Mãe', value: (e) => e.damName },
                  { header: 'Valor estimado', value: (e) => e.estimatedValue ?? null },
                ])
              }
            >
              Exportar
            </Button>
            {canEdit && (
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setDraft(newEquineDraft({ haras: harasList[0] || null }))}>
                Novo animal
              </Button>
            )}
          </>
        }
      />

      <StatGrid cols={5} className="mb-5">
        <Stat
          label="Animais ativos"
          icon={sm && <HeartPulse className="size-4" />}
          value={loading ? <Skeleton className="h-7 w-12" /> : integer(herd.length)}
          hint={`${kpi.bySex('EGUA')} éguas · ${kpi.bySex('GARANHAO')} garanhões · ${kpi.bySex('CASTRADO')} castrados`}
        />
        <Stat
          label="Éguas prenhes"
          tone="accent"
          icon={sm && <Baby className="size-4" />}
          value={integer(kpi.pregnant)}
          hint={kpi.nextBirth ? `${kpi.nextBirth.e.name}: ${date(kpi.nextBirth.g!.dueDate)}` : 'Nenhuma gestação ativa'}
          onClick={kpi.nextBirth ? () => nav(`/equinos/${kpi.nextBirth!.e.id}?aba=reproducao`) : undefined}
        />
        <Stat
          label="Alertas de saúde"
          tone={kpi.healthOverdue ? 'danger' : kpi.health ? 'warning' : 'success'}
          icon={sm && <BellRing className="size-4" />}
          value={integer(kpi.health)}
          hint={kpi.healthOverdue ? `${kpi.healthOverdue} vencido(s)` : kpi.health ? 'Próximos 30 dias' : 'Tudo em dia'}
        />
        <Stat label="Custo do mês" tone="danger" icon={sm && <Wallet className="size-4" />} value={<MoneyValue value={kpi.monthCost} />} hint={`Anterior (${kpi.prevLabel}): ${money(kpi.prevCost)}`} />
        <Stat
          label="Prêmios no ano"
          tone="success"
          icon={sm && <Trophy className="size-4" />}
          value={<MoneyValue value={kpi.prizes} />}
          hint={kpi.comps ? `${kpi.comps} competições · ${kpi.wins} vitória(s)` : 'Nenhuma competição'}
          className="col-span-2 md:col-span-1"
        />
      </StatGrid>

      {alerts.length > 0 && (
        <Card className="mb-5">
          <CardHeader
            icon={<BellRing className="size-4" />}
            title="Lembretes"
            subtitle="Vencidos e próximos 30 dias"
            actions={
              alerts.length > alertLimit ? (
                <Button size="sm" variant="ghost" onClick={() => setShowAllAlerts(!showAllAlerts)}>
                  {showAllAlerts ? 'Mostrar menos' : `Ver todos (${alerts.length})`}
                </Button>
              ) : undefined
            }
          />
          <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
            {visibleAlerts.map(({ event: ev, days }) => (
              <li key={ev.id} className="min-w-0">
                <Link to={`/equinos/${ev.equineId}`} className="flex items-center gap-3 rounded-control px-2 py-1.5 -mx-2 hover:bg-surface-2 min-w-0">
                  <span className={`size-2 rounded-full shrink-0 ${days < 0 ? 'bg-danger' : days <= 7 ? 'bg-warning' : 'bg-info'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-fg truncate">
                      <span className="font-medium">{nameOf(ev.equineId)}</span> · {ev.title}
                    </span>
                    <span className="block text-xs text-muted">
                      {EQUINE_EVENT_LABELS[ev.type].label} · {date(ev.alertDate)}
                    </span>
                  </span>
                  <Badge tone={days < 0 ? 'danger' : days <= 7 ? 'warning' : 'info'} size="xs">
                    {alertText(days)}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar nome, registro, chip…" className="sm:w-72" />
        <Segmented
          size="sm"
          value={sex}
          onChange={setSex}
          options={[
            { value: 'ALL', label: 'Todos', count: sexCount('ALL') },
            { value: 'EGUA', label: 'Éguas', count: sexCount('EGUA') },
            { value: 'GARANHAO', label: 'Garanhões', count: sexCount('GARANHAO') },
            { value: 'CASTRADO', label: 'Castrados', count: sexCount('CASTRADO') },
          ]}
        />
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select<StatusFilter>
            value={status}
            onChange={setStatus}
            className="sm:w-40"
            options={[{ value: 'HERD', label: 'No plantel' }, { value: 'ALL', label: 'Todos os status' }, ...optionsOf(EQUINE_STATUS)]}
          />
          <Select value={breed} onChange={setBreed} className="sm:w-44" placeholder="Todas as raças" options={[{ value: '', label: 'Todas as raças' }, ...breeds.map((b) => ({ value: b, label: b }))]} />
          {harasList.length > 1 && (
            <Select value={haras} onChange={setHaras} className="sm:w-44" placeholder="Todos os haras" options={[{ value: '', label: 'Todos os haras' }, ...harasList.map((b) => ({ value: b, label: b }))]} />
          )}
        </div>
        <Segmented
          size="sm"
          className="sm:ml-auto"
          value={view}
          onChange={setView}
          options={[
            { value: 'cards', label: <><LayoutGrid className="size-3.5" /> Cartões</> },
            { value: 'map', label: <><Warehouse className="size-3.5" /> Mapa do haras</> },
          ]}
        />
      </Toolbar>

      {loading ? (
        <div className="grid gap-4 grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-64 rounded-card" />
          ))}
        </div>
      ) : !equines.length ? (
        <Card>
          <EmptyState
            icon={<HeartPulse className="size-5" />}
            title="Nenhum animal cadastrado ainda"
            description="Cadastre o primeiro animal do plantel para acompanhar saúde, treinos e reprodução."
            action={
              canEdit && (
                <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setDraft(newEquineDraft())}>
                  Cadastrar animal
                </Button>
              )
            }
          />
        </Card>
      ) : view === 'map' ? (
        <HarasMap equines={filtered} />
      ) : filtered.length ? (
        <div className="grid gap-4 grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((e: Equine) => (
            <EquineCard key={e.id} equine={e} alerts={alertsByEquine.get(e.id) || 0} />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            title="Nenhum animal encontrado"
            description="Nenhum animal corresponde aos filtros escolhidos."
            action={
              filtersOn && (
                <Button
                  onClick={() => {
                    setQ('');
                    setSex('ALL');
                    setStatus('HERD');
                    setBreed('');
                    setHaras('');
                  }}
                >
                  Limpar filtros
                </Button>
              )
            }
          />
        </Card>
      )}

      <EquineFormDrawer draft={draft} onClose={() => setDraft(null)} onSaved={(id, isNew) => isNew && nav(`/equinos/${id}`)} />
    </>
  );
}
