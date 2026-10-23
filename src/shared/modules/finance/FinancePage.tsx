/**
 * Financeiro — contas a receber, contas a pagar e fluxo de caixa.
 */
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CalendarClock, Plus, Scale, TrendingUp, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/session';
import { useTable } from '../../data/react';
import { addDays, date, endOfMonth, startOfMonth, today } from '../../domain/format';
import type { FinancialEntry } from '../../domain/types';
import { Button, Menu, PageHeader, Stat, StatGrid, Tabs } from '../../ui';
import { CashFlowView } from './CashFlowView';
import { DEFAULT_FILTERS, EntriesView, type EntryFilters } from './EntriesView';
import { EntryDrawer } from './EntryDrawer';
import { EntryFormDrawer, newEntryDraft, type EntryDraft } from './EntryFormDrawer';
import { activePayments, balanceOf, isOverdue, sum } from './helpers';
import { PayModal } from './PayModal';
import { StatMoney } from './parts';

type Tab = 'IN' | 'OUT' | 'FLOW';

export function FinancePage() {
  const { can } = useSession();
  const canManage = can('finance.manage');
  const { rows: entries, loading } = useTable('financial_entries');
  const { rows: profiles } = useTable('profiles');
  const [params, setParams] = useSearchParams();
  const tab = (['IN', 'OUT', 'FLOW'].includes(params.get('aba') || '') ? params.get('aba') : 'IN') as Tab;
  const setTab = (t: Tab) => {
    const p = new URLSearchParams(params);
    p.set('aba', t);
    setParams(p, { replace: true });
  };

  const [filters, setFilters] = useState<Record<'IN' | 'OUT', EntryFilters>>({ IN: DEFAULT_FILTERS, OUT: DEFAULT_FILTERS });
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState<FinancialEntry[] | null>(null);
  const [draft, setDraft] = useState<EntryDraft | null>(null);

  const sellers = useMemo(
    () =>
      profiles
        .filter((p) => p.role === 'SELLER' || p.role === 'EXTERNAL_SELLER' || entries.some((e) => e.sellerId === p.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [profiles, entries],
  );

  const byDir = useMemo(() => ({ IN: entries.filter((e) => e.direction === 'IN'), OUT: entries.filter((e) => e.direction === 'OUT') }), [entries]);

  const kpi = useMemo(() => {
    const t = today();
    const in30 = addDays(t, 30);
    const ms = startOfMonth(t);
    const me = endOfMonth(t);
    const openIn = byDir.IN.filter((e) => e.status === 'OPEN');
    const openOut = byDir.OUT.filter((e) => e.status === 'OPEN');
    const overdueIn = openIn.filter((e) => isOverdue(e, t));
    const receivedMonth = sum(
      byDir.IN.flatMap((e) => activePayments(e)).filter((p) => p.date >= ms && p.date <= me),
      (p) => p.amount,
    );
    const payNext = openOut.filter((e) => e.dueDate <= in30);
    const recvNext = openIn.filter((e) => e.dueDate <= in30);
    return {
      openIn: sum(openIn, balanceOf),
      openInCount: openIn.length,
      overdueIn: sum(overdueIn, balanceOf),
      overdueInCount: overdueIn.length,
      overdueOut: sum(
        openOut.filter((e) => isOverdue(e, t)),
        balanceOf,
      ),
      receivedMonth,
      payNext: sum(payNext, balanceOf),
      payNextCount: payNext.length,
      projected: sum(recvNext, balanceOf) - sum(payNext, balanceOf),
      in30,
    };
  }, [byDir]);

  const goto = (t: 'IN' | 'OUT', patch: Partial<EntryFilters>) => {
    setFilters((f) => ({ ...f, [t]: { ...DEFAULT_FILTERS, ...patch } }));
    setTab(t);
  };

  const openEntry = openId ? entries.find((e) => e.id === openId) || null : null;

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        title="Contas"
        subtitle="Contas a receber e a pagar, baixas, estornos e fluxo de caixa."
        actions={
          canManage && (
            <>
              <Menu
                trigger={
                  <Button variant="primary" icon={<Plus className="size-4" />}>
                    Nova conta
                  </Button>
                }
                items={[
                  { label: 'Conta a receber', icon: <ArrowDownLeft />, onClick: () => setDraft(newEntryDraft('IN')) },
                  { label: 'Conta a pagar', icon: <ArrowUpRight />, onClick: () => setDraft(newEntryDraft('OUT')) },
                ]}
              />
            </>
          )
        }
      />

      <StatGrid cols={5} className="mb-6">
        <Stat
          label="A receber"
          value={<StatMoney value={kpi.openIn} />}
          hint={`${kpi.openInCount} parcelas em aberto`}
          icon={<Wallet className="size-4" />}
          onClick={() => goto('IN', {})}
        />
        <Stat
          label="Vencido"
          tone="danger"
          value={<StatMoney value={kpi.overdueIn} />}
          hint={kpi.overdueInCount ? `${kpi.overdueInCount} parcelas atrasadas` : 'Nada em atraso'}
          icon={<AlertTriangle className="size-4" />}
          onClick={() => goto('IN', { period: 'OVERDUE' })}
        />
        <Stat
          label="Recebido"
          tone="success"
          value={<StatMoney value={kpi.receivedMonth} />}
          hint={`no mês, desde ${date(startOfMonth()).slice(0, 5)}`}
          icon={<TrendingUp className="size-4" />}
          onClick={() => goto('IN', { status: 'PAID', period: 'ALL' })}
        />
        <Stat
          label="A pagar"
          tone="warning"
          value={<StatMoney value={kpi.payNext} />}
          hint={`30 dias${kpi.overdueOut > 0 ? ' + vencidos' : ''}`}
          icon={<CalendarClock className="size-4" />}
          onClick={() => goto('OUT', { period: 'CUSTOM', to: kpi.in30 })}
        />
        <Stat
          label="Saldo projetado"
          tone={kpi.projected >= 0 ? 'info' : 'danger'}
          value={<StatMoney value={kpi.projected} />}
          hint={`receber − pagar até ${date(kpi.in30).slice(0, 5)}`}
          icon={<Scale className="size-4" />}
          className="col-span-2 md:col-span-1"
          onClick={() => setTab('FLOW')}
        />
      </StatGrid>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        className="mb-4"
        items={[
          { value: 'IN', label: 'A receber', icon: <ArrowDownLeft />, count: byDir.IN.filter((e) => e.status === 'OPEN').length },
          { value: 'OUT', label: 'A pagar', icon: <ArrowUpRight />, count: byDir.OUT.filter((e) => e.status === 'OPEN').length },
          { value: 'FLOW', label: 'Fluxo de caixa', icon: <TrendingUp /> },
        ]}
      />

      {tab === 'FLOW' ? (
        <CashFlowView entries={entries} />
      ) : (
        <EntriesView
          key={tab}
          direction={tab}
          entries={byDir[tab]}
          loading={loading}
          sellers={sellers}
          filters={filters[tab]}
          onFilters={(f) => setFilters((all) => ({ ...all, [tab]: f }))}
          onOpen={(e) => {
            setEditing(false);
            setOpenId(e.id);
          }}
          onEdit={(e) => {
            setEditing(true);
            setOpenId(e.id);
          }}
          onPay={setPaying}
        />
      )}

      <EntryDrawer entry={openEntry} startEditing={editing} onClose={() => setOpenId(null)} onPay={(e) => setPaying([e])} />
      <PayModal entries={paying} onClose={() => setPaying(null)} />
      <EntryFormDrawer draft={draft} onChange={setDraft} onClose={() => setDraft(null)} onCreated={(d) => setTab(d)} />
    </>
  );
}
