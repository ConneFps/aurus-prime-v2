/**
 * Extrato por cliente — ranking da carteira por saldo em aberto/vencido e,
 * ao escolher um cliente (?cliente=id), o extrato completo.
 */
import { AlertTriangle, Download, ShieldAlert, Users, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTable } from '../../data/react';
import { date, matchesSearch, money, percent } from '../../domain/format';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  exportCsv,
  PageHeader,
  PageLoader,
  Progress,
  RankBars,
  SearchInput,
  Segmented,
  Stat,
  StatGrid,
  Toolbar,
  type Column,
} from '../../ui';
import { CustomerStatement } from './CustomerStatement';
import { aging, AGING_LABELS, sum, type AgingBucket } from './helpers';
import { StatMoney, useSmUp } from './parts';
import { customerPositions, type CustomerPosition } from './statementModel';

type Scope = 'OPEN' | 'OVERDUE' | 'OVER_LIMIT' | 'ALL';

export function StatementsPage() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('cliente');
  const { rows: entries, loading } = useTable('financial_entries', { where: [['direction', '==', 'IN']] });
  const { rows: customers, loading: lc } = useTable('customers');
  const { rows: sales } = useTable('sales', selectedId ? { where: [['customerId', '==', selectedId]] } : undefined, { enabled: !!selectedId });

  const positions = useMemo(() => customerPositions(entries, customers), [entries, customers]);

  if (selectedId) {
    const customer = customers.find((c) => c.id === selectedId);
    if (lc || loading) return <PageLoader />;
    if (!customer)
      return (
        <EmptyState
          title="Cliente não encontrado"
          action={
            <Button onClick={() => setParams({})} variant="primary">
              Voltar ao ranking
            </Button>
          }
        />
      );
    return <CustomerStatement customer={customer} entries={entries.filter((e) => e.partyId === customer.id)} sales={sales} />;
  }

  return <Ranking positions={positions} loading={loading || lc} onOpen={(id) => setParams({ cliente: id })} />;
}

function Ranking({ positions, loading, onOpen }: { positions: CustomerPosition[]; loading: boolean; onOpen: (id: string) => void }) {
  const sm = useSmUp();
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<Scope>('OPEN');

  const counts = useMemo(
    () => ({
      OPEN: positions.filter((p) => p.open > 0.005).length,
      OVERDUE: positions.filter((p) => p.overdue > 0.005).length,
      OVER_LIMIT: positions.filter((p) => p.usage !== null && p.usage > 1).length,
      ALL: positions.length,
    }),
    [positions],
  );

  const rows = useMemo(
    () =>
      positions
        .filter((p) =>
          scope === 'OPEN' ? p.open > 0.005 : scope === 'OVERDUE' ? p.overdue > 0.005 : scope === 'OVER_LIMIT' ? p.usage !== null && p.usage > 1 : true,
        )
        .filter((p) => matchesSearch([p.name, p.customer?.tradeName, p.customer?.document, p.customer?.city], q)),
    [positions, scope, q],
  );

  const totalOpen = sum(positions, (p) => p.open);
  const totalOverdue = sum(positions, (p) => p.overdue);
  const ag = useMemo(() => aging(positions.flatMap((p) => p.entries)), [positions]);
  const topLate = [...positions]
    .filter((p) => p.overdue > 0)
    .sort((a, b) => b.overdue - a.overdue)
    .slice(0, 6);

  const columns: Column<CustomerPosition>[] = [
    {
      key: 'name',
      header: 'Cliente',
      mobile: 'title',
      sortValue: (p) => p.name,
      cell: (p) => (
        <div className="min-w-0 max-w-[280px]">
          <div className="font-medium text-fg truncate">{p.customer?.tradeName || p.name}</div>
          <div className="text-xs text-muted truncate">{[p.customer?.tradeName ? p.name : null, p.customer?.city].filter(Boolean).join(' · ') || '—'}</div>
        </div>
      ),
    },
    {
      key: 'open',
      header: 'Em aberto',
      align: 'right',
      sortValue: (p) => p.open,
      cell: (p) => (p.open > 0.005 ? money(p.open) : <span className="text-subtle">—</span>),
    },
    {
      key: 'overdue',
      header: 'Vencido',
      align: 'right',
      sortValue: (p) => p.overdue,
      cell: (p) => (p.overdue > 0.005 ? <span className="font-semibold text-danger">{money(p.overdue)}</span> : <span className="text-subtle">—</span>),
    },
    {
      key: 'late',
      header: 'Maior atraso',
      align: 'right',
      hideBelow: 'md',
      sortValue: (p) => p.maxLate,
      cell: (p) => (p.maxLate ? <span className="text-danger">{p.maxLate} dias</span> : <span className="text-subtle">—</span>),
    },
    {
      key: 'limit',
      header: 'Limite usado',
      hideBelow: 'lg',
      sortValue: (p) => p.usage ?? -1,
      cell: (p) =>
        p.usage === null ? (
          <span className="text-subtle text-xs">sem limite</span>
        ) : (
          <div className="w-32">
            <div className="flex justify-between text-[11px] text-muted mb-1">
              <span className="num">{percent(p.usage * 100, 0)}</span>
              <span className="num">{money(p.creditLimit)}</span>
            </div>
            <Progress value={p.open} max={p.creditLimit} tone={p.usage > 1 ? 'danger' : p.usage > 0.8 ? 'warning' : 'success'} />
          </div>
        ),
    },
    {
      key: 'next',
      header: 'Próx. vencimento',
      hideBelow: 'lg',
      mobile: false,
      sortValue: (p) => p.nextDue || '',
      cell: (p) => <span className="num">{date(p.nextDue)}</span>,
    },
    { key: 'paid', header: 'Pago 90 dias', align: 'right', hideBelow: 'xl', mobile: false, sortValue: (p) => p.paid90, cell: (p) => money(p.paid90) },
    {
      key: 'status',
      header: 'Situação',
      mobile: 'badge',
      sortValue: (p) => (p.overdue > 0 ? 2 : p.open > 0 ? 1 : 0),
      cell: (p) =>
        p.overdue > 0.005 ? (
          <Badge tone="danger" dot>
            Em atraso
          </Badge>
        ) : p.usage !== null && p.usage > 1 ? (
          <Badge tone="warning" dot>
            Acima do limite
          </Badge>
        ) : p.open > 0.005 ? (
          <Badge tone="info" dot>
            Em dia
          </Badge>
        ) : (
          <Badge tone="success" dot>
            Quitado
          </Badge>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        title="Extrato por cliente"
        subtitle="Posição de cada cliente: saldo em aberto, atrasos e limite de crédito. Clique para ver o extrato completo."
        actions={
          <Button
            icon={<Download className="size-4" />}
            onClick={() =>
              exportCsv('posicao-clientes', rows, [
                { header: 'Cliente', value: (p) => p.name },
                { header: 'Fantasia', value: (p) => p.customer?.tradeName },
                { header: 'Documento', value: (p) => p.customer?.document },
                { header: 'Em aberto', value: (p) => p.open },
                { header: 'Vencido', value: (p) => p.overdue },
                { header: 'Parcelas vencidas', value: (p) => p.overdueCount },
                { header: 'Maior atraso (dias)', value: (p) => p.maxLate },
                { header: 'Limite de crédito', value: (p) => p.creditLimit },
                { header: 'Próximo vencimento', value: (p) => (p.nextDue ? date(p.nextDue) : '') },
                { header: 'Pago 90 dias', value: (p) => p.paid90 },
              ])
            }
          >
            Exportar
          </Button>
        }
      />

      <StatGrid cols={4} className="mb-6">
        <Stat
          label="A receber"
          value={<StatMoney value={totalOpen} />}
          hint={`${counts.OPEN} clientes com saldo`}
          icon={sm && <Wallet className="size-4" />}
        />
        <Stat
          label="Vencido"
          tone="danger"
          value={<StatMoney value={totalOverdue} />}
          hint={totalOpen ? `${percent((totalOverdue / totalOpen) * 100)} da carteira` : '—'}
          icon={sm && <AlertTriangle className="size-4" />}
          onClick={() => setScope('OVERDUE')}
        />
        <Stat
          label="Em atraso"
          tone="warning"
          value={counts.OVERDUE}
          hint="clientes com vencidos"
          icon={sm && <Users className="size-4" />}
          onClick={() => setScope('OVERDUE')}
        />
        <Stat
          label="Acima do limite"
          tone="accent"
          value={counts.OVER_LIMIT}
          hint="clientes excedidos"
          icon={sm && <ShieldAlert className="size-4" />}
          onClick={() => setScope('OVER_LIMIT')}
        />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <Card>
          <CardHeader title="Aging da carteira" subtitle="Saldo em aberto por faixa de atraso" />
          <RankBars items={(Object.keys(AGING_LABELS) as AgingBucket[]).map((k) => ({ label: AGING_LABELS[k], value: ag[k] }))} format={money} />
        </Card>
        <Card>
          <CardHeader title="Maiores saldos vencidos" subtitle="Clique para abrir o extrato" />
          {topLate.length ? (
            <RankBars
              items={topLate.map((p) => ({
                label: (
                  <button type="button" className="hover:underline cursor-pointer text-left" onClick={() => p.customerId && onOpen(p.customerId)}>
                    {p.customer?.tradeName || p.name}
                  </button>
                ),
                value: p.overdue,
                hint: `${p.overdueCount} parcela${p.overdueCount > 1 ? 's' : ''} · até ${p.maxLate} dias`,
              }))}
              format={money}
            />
          ) : (
            <EmptyState className="py-6" title="Nenhum cliente em atraso" description="Toda a carteira está em dia." />
          )}
        </Card>
      </div>

      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar cliente, documento, cidade…" className="sm:w-80" />
        <Segmented
          size="sm"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'OPEN', label: 'Com saldo', count: counts.OPEN },
            { value: 'OVERDUE', label: 'Em atraso', count: counts.OVERDUE },
            { value: 'OVER_LIMIT', label: 'Acima do limite', count: counts.OVER_LIMIT },
            { value: 'ALL', label: 'Todos', count: counts.ALL },
          ]}
        />
      </Toolbar>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(p) => p.key}
        loading={loading}
        initialSort={{ key: 'overdue', dir: 'desc' }}
        onRowClick={(p) => p.customerId && onOpen(p.customerId)}
        emptyTitle="Nenhum cliente nesta lista"
        emptyDescription={q ? 'Tente outra busca.' : 'Mude o filtro para ver outros clientes.'}
      />
    </>
  );
}
