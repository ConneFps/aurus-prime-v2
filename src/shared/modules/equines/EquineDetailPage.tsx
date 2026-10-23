/**
 * Ficha do equino: cabeçalho com foto/ações e abas por assunto.
 */
import { ArrowLeft, BadgeDollarSign, Edit3, FileDown, MapPin, Plus, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useOps, useSession } from '../../app/session';
import { useAction, useCrud, useRow, useTable } from '../../data/react';
import { date, money, normalize, today } from '../../domain/format';
import { EQUINE_SEX_LABELS, EQUINE_STATUS } from '../../domain/labels';
import type { EquineEvent, EquineEventType } from '../../domain/types';
import { Badge, Button, Callout, Card, EmptyState, Menu, PageLoader, StatusBadge, Tabs, useConfirm, usePrompt } from '../../ui';
import { DocumentsTab } from './detail/DocumentsTab';
import { EventDrawer, eventDraftOf, newEventDraft, type EventDraft } from './detail/EventDrawer';
import { equineFinance } from './detail/finance';
import { FinanceTab } from './detail/FinanceTab';
import { GenealogyTab } from './detail/GenealogyTab';
import { OverviewTab } from './detail/OverviewTab';
import { ReproductionTab } from './detail/ReproductionTab';
import { SaleDrawer } from './detail/SaleDrawer';
import { CompetitionsTab, FarrierTab, HealthTab, StayTab, TrainingTab, TransportTab } from './detail/TypeTabs';
import { draftOf, EquineFormDrawer, type EquineDraft, type FormSectionKey } from './EquineForm';
import { ageLabel, gestation, pendingAlerts, REPRO_STATUS } from './model';
import { EquinePhoto } from './parts';
import { exportEquinePdf } from './pdf';

type TabKey = 'geral' | 'saude' | 'treino' | 'manejo' | 'transporte' | 'hospedagem' | 'competicoes' | 'reproducao' | 'genealogia' | 'financeiro' | 'documentos';

const TAB_TYPE: Partial<Record<TabKey, EquineEventType>> = {
  saude: 'HEALTH',
  treino: 'TRAINING',
  manejo: 'FARRIER',
  transporte: 'TRANSPORT',
  hospedagem: 'STAY',
  competicoes: 'COMPETITION',
  financeiro: 'EXPENSE',
};

export function EquineDetailPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { can } = useSession();
  const canEdit = can('equines.manage');
  const ops = useOps();
  const crud = useCrud('equines');
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('aba') as TabKey) || 'geral';
  const setTab = (t: string) =>
    setParams(
      (p) => {
        p.set('aba', t);
        return p;
      },
      { replace: true },
    );

  const { row: equine, loading } = useRow('equines', id);
  const { rows: events } = useTable('equine_events', { where: [['equineId', '==', id]] }, { enabled: !!id });
  const { rows: sales } = useTable('equine_sales', { where: [['equineId', '==', id]] }, { enabled: !!id });
  const { rows: saleEntries } = useTable('financial_entries', { where: [['category', '==', 'EQUINE_SALE']] });
  const { rows: herd } = useTable('equines');
  const { rows: purchases } = useTable('semen_purchases');

  const [form, setForm] = useState<{ draft: EquineDraft; section?: FormSectionKey } | null>(null);
  const [eventDraft, setEventDraft] = useState<EventDraft | null>(null);
  const [selling, setSelling] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  // No celular a barra de abas rola: mantém a aba ativa visível.
  useEffect(() => {
    const el = tabsRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    const bar = el?.closest<HTMLElement>('.scroll-x');
    if (el && bar) bar.scrollTo({ left: Math.max(0, el.offsetLeft - bar.clientWidth / 2 + el.clientWidth / 2), behavior: 'smooth' });
  }, [tab, equine?.id]);

  const finance = useMemo(() => equineFinance(events, sales, saleEntries, today()), [events, sales, saleEntries]);
  const activeSale = sales.find((s) => s.status === 'ACTIVE') || null;

  const cancelOp = useAction((saleId: string, reason: string) => ops.cancelEquineSale(saleId, reason), { success: 'Venda cancelada — animal de volta ao plantel' });
  const cancelSale = async () => {
    if (!activeSale) return;
    const reason = await prompt({
      title: 'Cancelar venda',
      message: `A venda para ${activeSale.buyerName} será cancelada, as parcelas em aberto canceladas e o animal volta para o plantel.`,
      label: 'Motivo do cancelamento',
      confirmLabel: 'Cancelar venda',
      danger: true,
    });
    if (reason) await cancelOp.run(activeSale.id, reason);
  };
  const remove = useAction(async () => {
    if (!equine) return;
    if (await confirm({ title: `Excluir ${equine.name}?`, message: 'O cadastro será apagado. Só é possível para animais sem histórico.', danger: true, confirmLabel: 'Excluir' })) {
      await crud.remove(equine.id);
      nav('/equinos');
    }
  });

  if (loading) return <PageLoader />;
  if (!equine)
    return (
      <EmptyState
        title="Animal não encontrado"
        description="Ele pode ter sido excluído."
        action={<Button onClick={() => nav('/equinos')}>Voltar ao plantel</Button>}
      />
    );

  const e = equine;
  const g = gestation(e);
  const alerts = pendingAlerts(events);
  const count = (t: EquineEventType) => events.filter((x) => x.type === t).length || undefined;
  const sellable = e.status !== 'SOLD' && e.status !== 'DECEASED' && !activeSale;
  const deletable = !events.length && !sales.length;
  const newEvent = (t: EquineEventType, choose = false) =>
    setEventDraft(newEventDraft(t, choose, t === 'HEALTH' && tab === 'reproducao' ? { kind: 'ULTRASSOM' } : {}));
  const editEvent = (ev: EquineEvent) => setEventDraft(eventDraftOf(ev));
  const openForm = (section?: FormSectionKey) => setForm({ draft: draftOf(e), section });
  const semenUsed = purchases.filter((p) => p.usage?.some((u) => normalize(u.mareName) === normalize(e.name)));
  const defaultType: EquineEventType = TAB_TYPE[tab] || (tab === 'reproducao' ? (e.sex === 'GARANHAO' ? 'SEMEN_COLLECTION' : 'HEALTH') : 'HEALTH');
  const pdf = () => exportEquinePdf(e, events, sales, saleEntries, semenUsed);

  const typeProps = { events, canEdit, onNew: (t: EquineEventType) => newEvent(t), onEdit: editEvent };

  return (
    <>
      <Link to="/equinos" className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg">
        <ArrowLeft className="size-3.5" /> Plantel
      </Link>

      <Card className="mb-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <div className="flex min-w-0 flex-1 gap-4">
            <EquinePhoto equine={e} className="size-20 sm:size-28" textSize="text-3xl" />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                Equinos · {EQUINE_SEX_LABELS[e.sex]}
              </div>
              <h1 className="mt-0.5 font-display text-2xl font-semibold leading-tight text-fg sm:text-[28px] break-words">{e.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <StatusBadge info={EQUINE_STATUS[e.status]} />
                {e.reproStatus && e.reproStatus !== 'GESTANTE' && e.sex !== 'CASTRADO' && <Badge tone={REPRO_STATUS[e.reproStatus].tone}>{REPRO_STATUS[e.reproStatus].label}</Badge>}
                {g && <Badge tone="accent">Parto em {g.daysLeft >= 0 ? `${g.daysLeft} dias` : date(g.dueDate)}</Badge>}
                {alerts.length > 0 && (
                  <Badge tone={alerts.some((a) => a.days < 0) ? 'danger' : 'warning'}>
                    {alerts.length} lembrete{alerts.length > 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                <span>
                  {e.breed}
                  {e.coat ? ` · ${e.coat}` : ''}
                </span>
                <span className="num">{e.birthDate ? `${ageLabel(e.birthDate, true)} (${date(e.birthDate)})` : 'Idade não informada'}</span>
                {e.registry && <span className="num">{e.registry}</span>}
                {(e.haras || e.paddock) && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3.5" />
                    {[e.haras, e.paddock].filter(Boolean).join(' · ')}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:justify-end md:shrink-0">
            {canEdit && (
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => newEvent(defaultType, true)}>
                Registrar evento
              </Button>
            )}
            {canEdit && (
              <Button icon={<Edit3 className="size-4" />} onClick={() => openForm()}>
                Editar
              </Button>
            )}
            <Menu
              items={[
                { label: 'Vender animal', icon: <BadgeDollarSign />, onClick: () => setSelling(true), hidden: !canEdit || !sellable },
                { label: 'Cancelar venda', icon: <Undo2 />, onClick: () => void cancelSale(), hidden: !canEdit || !activeSale, danger: true },
                { label: 'PDF da ficha', icon: <FileDown />, onClick: pdf },
                'divider',
                { label: 'Excluir cadastro', icon: <Trash2 />, onClick: () => void remove.run(), hidden: !canEdit || !deletable, danger: true },
              ]}
            />
          </div>
        </div>
      </Card>

      {activeSale && (
        <Callout
          tone="info"
          className="mb-5"
          title={`Vendido para ${activeSale.buyerName} em ${date(activeSale.date)}`}
          action={
            canEdit && (
              <Button size="sm" variant="ghost" loading={cancelOp.running} onClick={() => void cancelSale()}>
                Cancelar venda
              </Button>
            )
          }
        >
          {money(activeSale.totalPrice)} em {activeSale.installmentsCount}x
          {finance.open > 0 ? ` · a receber ${money(finance.open)}` : ' · quitada'}
          {finance.overdue > 0 ? ` · vencido ${money(finance.overdue)}` : ''}
        </Callout>
      )}
      {e.status === 'DECEASED' && (
        <Callout tone="warning" className="mb-5" title="Animal em óbito">
          O histórico continua disponível para consulta.
        </Callout>
      )}

      <div ref={tabsRef}>
      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'geral', label: 'Visão geral' },
          { value: 'saude', label: 'Saúde', count: count('HEALTH') },
          { value: 'treino', label: 'Treinamento', count: count('TRAINING') },
          { value: 'manejo', label: 'Casqueamento', count: count('FARRIER') },
          { value: 'transporte', label: 'Transporte', count: count('TRANSPORT') },
          { value: 'hospedagem', label: 'Hospedagem', count: count('STAY') },
          { value: 'competicoes', label: 'Competições', count: count('COMPETITION') },
          { value: 'reproducao', label: 'Reprodução', count: e.sex === 'GARANHAO' ? count('SEMEN_COLLECTION') : undefined, hidden: e.sex === 'CASTRADO' },
          { value: 'genealogia', label: 'Genealogia' },
          { value: 'financeiro', label: 'Financeiro' },
          { value: 'documentos', label: 'Documentos', count: (e.photos?.length || 0) + events.reduce((s, x) => s + (x.attachments?.length || 0), 0) || undefined },
        ]}
      />
      </div>

      {tab === 'geral' && <OverviewTab equine={e} events={events} finance={finance} onEditRepro={canEdit ? () => openForm('reproducao') : undefined} onOpenTab={setTab} />}
      {tab === 'saude' && <HealthTab {...typeProps} />}
      {tab === 'treino' && <TrainingTab {...typeProps} />}
      {tab === 'manejo' && <FarrierTab {...typeProps} />}
      {tab === 'transporte' && <TransportTab {...typeProps} />}
      {tab === 'hospedagem' && <StayTab {...typeProps} />}
      {tab === 'competicoes' && <CompetitionsTab {...typeProps} />}
      {tab === 'reproducao' && (
        <ReproductionTab equine={e} events={events} herd={herd} purchases={purchases} canEdit={canEdit} onNew={(t) => newEvent(t)} onEdit={editEvent} onEditRepro={() => openForm('reproducao')} />
      )}
      {tab === 'genealogia' && <GenealogyTab equine={e} herd={herd} canEdit={canEdit} onEdit={() => openForm('genealogia')} />}
      {tab === 'financeiro' && <FinanceTab events={events} sales={sales} finance={finance} canEdit={canEdit} onNew={(t) => newEvent(t)} onEdit={editEvent} />}
      {tab === 'documentos' && <DocumentsTab equine={e} events={events} canEdit={canEdit} />}

      <EquineFormDrawer draft={form?.draft || null} section={form?.section} onClose={() => setForm(null)} />
      <EventDrawer equine={e} draft={eventDraft} onClose={() => setEventDraft(null)} />
      <SaleDrawer equine={e} open={selling} onClose={() => setSelling(false)} />
    </>
  );
}
