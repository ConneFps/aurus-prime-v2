/**
 * Extrato de um cliente: posição, aging, limite de crédito, movimentação
 * cronológica com saldo, parcelas, PDF e cobrança pelo WhatsApp.
 */
import { AlertTriangle, ExternalLink, FileDown, MessageCircle, ShieldCheck, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSettings } from '../../app/settings';
import { addDays, date, formatDocument, formatPhone, money, percent, today } from '../../domain/format';
import type { Customer, FinancialEntry, Sale } from '../../domain/types';
import {
  Button,
  Card,
  CardHeader,
  cn,
  DataTable,
  DateInput,
  EmptyState,
  FooterCell,
  PageHeader,
  Progress,
  RankBars,
  Segmented,
  Stat,
  StatGrid,
  Switch,
  type Column,
} from '../../ui';
import { CollectModal } from './CollectModal';
import { aging, AGING_LABELS, balanceOf, daysLate, entryState, sum, type AgingBucket } from './helpers';
import { DueCell, EntryBadge, StatMoney, useSmUp } from './parts';
import { buildLedger, type LedgerLine } from './statementModel';
import { statementPdf } from './statementPdf';

type Period = 'ALL' | 'D90' | 'D365' | 'YEAR' | 'CUSTOM';

export function CustomerStatement({ customer, entries, sales }: { customer: Customer; entries: FinancialEntry[]; sales: Sale[] }) {
  const sm = useSmUp();
  const { settings } = useSettings();
  const [period, setPeriod] = useState<Period>('D365');
  const [custom, setCustom] = useState({ from: addDays(today(), -30), to: today() });
  const [showPaid, setShowPaid] = useState(false);
  const [collect, setCollect] = useState(false);
  const t = today();

  const range = useMemo(() => {
    if (period === 'D90') return { from: addDays(t, -90), to: null };
    if (period === 'D365') return { from: addDays(t, -365), to: null };
    if (period === 'YEAR') return { from: `${t.slice(0, 4)}-01-01`, to: null };
    if (period === 'CUSTOM') return { from: custom.from || null, to: custom.to || null };
    return { from: null, to: null };
  }, [period, custom, t]);

  const ledger = useMemo(() => buildLedger(entries, sales, range.from, range.to), [entries, sales, range]);
  const open = entries.filter((e) => e.status === 'OPEN');
  const overdue = open.filter((e) => entryState(e) === 'OVERDUE');
  const openSum = sum(open, balanceOf);
  const overdueSum = sum(overdue, balanceOf);
  const ag = aging(open);
  const limit = customer.creditLimit || 0;
  const usage = limit > 0 ? openSum / limit : 0;
  const maxLate = Math.max(0, ...overdue.map((e) => daysLate(e)));
  const periodLabel = period === 'ALL' ? 'Todo o histórico' : range.to ? `${date(range.from)} a ${date(range.to)}` : `Desde ${date(range.from)}`;

  const installments = useMemo(
    () => entries.filter((e) => e.status !== 'CANCELLED' && (showPaid || e.status === 'OPEN')).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [entries, showPaid],
  );

  const ledgerCols: Column<LedgerLine>[] = [
    { key: 'date', header: 'Data', cell: (l) => <span className="num text-muted">{date(l.date)}</span>, width: '110px' },
    {
      key: 'desc',
      header: 'Histórico',
      mobile: 'title',
      cell: (l) => (
        <div className="min-w-0">
          <div className={cn('truncate', l.kind === 'OPENING' ? 'font-semibold text-fg' : 'text-fg')}>
            {l.saleId && l.kind === 'SALE' ? (
              <Link to={`/vendas/${l.saleId}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                {l.description}
              </Link>
            ) : (
              l.description
            )}
          </div>
          {l.detail && <div className="text-xs text-muted truncate">{l.detail}</div>}
          {l.kind !== 'OPENING' && (
            <div className={cn('sm:hidden text-xs num font-medium', l.credit ? 'text-success' : 'text-fg')}>
              {l.credit ? `+ ${money(l.credit)} crédito` : `− ${money(l.debit)} débito`}
            </div>
          )}
        </div>
      ),
    },
    { key: 'debit', header: 'Débito', align: 'right', mobile: false, cell: (l) => (l.debit ? money(l.debit) : <span className="text-subtle">—</span>) },
    {
      key: 'credit',
      mobile: false,
      header: 'Crédito',
      align: 'right',
      cell: (l) => (l.credit ? <span className="text-success">{money(l.credit)}</span> : <span className="text-subtle">—</span>),
    },
    {
      key: 'bal',
      header: 'Saldo',
      align: 'right',
      mobile: 'badge',
      cell: (l) => <span className={cn('num font-semibold', l.balance > 0.005 ? 'text-fg' : 'text-success')}>{money(l.balance)}</span>,
    },
  ];

  const instCols: Column<FinancialEntry>[] = [
    { key: 'due', header: 'Vencimento', sortValue: (e) => e.dueDate, cell: (e) => <DueCell entry={e} /> },
    {
      key: 'ref',
      header: 'Referência',
      mobile: 'title',
      cell: (e) =>
        e.saleId ? (
          <Link to={`/vendas/${e.saleId}`} className="text-primary hover:underline" onClick={(ev) => ev.stopPropagation()}>
            Pedido {e.saleNumber}
          </Link>
        ) : (
          <span className="truncate">{e.description}</span>
        ),
    },
    {
      key: 'inst',
      header: 'Parcela',
      align: 'center',
      cell: (e) => (
        <span className="num text-muted">
          {e.installment}/{e.installments}
        </span>
      ),
    },
    { key: 'amount', header: 'Valor', align: 'right', cell: (e) => money(e.amount) },
    { key: 'paid', header: 'Pago', align: 'right', hideBelow: 'md', mobile: false, cell: (e) => (e.paidAmount ? money(e.paidAmount) : '—') },
    { key: 'bal', header: 'Saldo', align: 'right', sortValue: (e) => balanceOf(e), cell: (e) => <strong className="num">{money(balanceOf(e))}</strong> },
    { key: 'st', header: 'Status', mobile: 'badge', cell: (e) => <EntryBadge entry={e} /> },
  ];

  const sumDebit = sum(ledger.lines, (l) => l.debit);
  const sumCredit = sum(ledger.lines, (l) => l.credit);

  return (
    <>
      <PageHeader
        back="/financeiro/clientes"
        eyebrow="Extrato por cliente"
        title={customer.tradeName || customer.name}
        subtitle={[
          customer.tradeName ? customer.name : null,
          formatDocument(customer.document),
          customer.city,
          formatPhone(customer.cellphone || customer.phone),
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            <Link to={`/clientes/${customer.id}`}>
              <Button variant="ghost" icon={<ExternalLink className="size-4" />}>
                Cadastro
              </Button>
            </Link>
            <Button icon={<FileDown className="size-4" />} onClick={() => statementPdf({ customer, entries, lines: ledger.lines, periodLabel, settings })}>
              PDF do extrato
            </Button>
            {overdue.length > 0 && (
              <Button variant="primary" icon={<MessageCircle className="size-4" />} onClick={() => setCollect(true)}>
                Cobrar no WhatsApp
              </Button>
            )}
          </>
        }
      />

      <StatGrid cols={4} className="mb-6">
        <Stat label="Em aberto" value={<StatMoney value={openSum} />} hint={`${open.length} parcelas`} icon={sm && <Wallet className="size-4" />} />
        <Stat
          label="Vencido"
          tone="danger"
          value={<StatMoney value={overdueSum} />}
          hint={overdue.length ? `${overdue.length} parc. · ${maxLate} dias` : 'Nada em atraso'}
          icon={sm && <AlertTriangle className="size-4" />}
        />
        <Stat
          label="Limite disponível"
          tone={limit > 0 && openSum > limit ? 'danger' : 'success'}
          value={limit > 0 ? <StatMoney value={limit - openSum} /> : 'Sem limite'}
          hint={limit > 0 ? `de ${money(limit)}` : 'Defina no cadastro'}
          icon={sm && <ShieldCheck className="size-4" />}
        />
        <Stat
          label="Total comprado"
          tone="info"
          value={<StatMoney value={customer.totalPurchases || 0} />}
          hint={`${customer.ordersCount || 0} pedidos${customer.lastPurchaseAt && sm ? ` · último ${date(customer.lastPurchaseAt.slice(0, 10))}` : ''}`}
        />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <Card>
          <CardHeader title="Posição por atraso" subtitle="Saldo em aberto por faixa de dias vencidos" />
          {openSum > 0 ? (
            <RankBars
              items={(Object.keys(AGING_LABELS) as AgingBucket[]).map((k) => ({ label: AGING_LABELS[k], value: ag[k] }))}
              format={money}
              max={Math.max(...Object.values(ag), 1)}
            />
          ) : (
            <EmptyState className="py-6" title="Nenhum saldo em aberto" description="Cliente em dia." />
          )}
        </Card>
        <Card>
          <CardHeader title="Limite de crédito" subtitle="Comprometido = parcelas em aberto (inclui vencidas)" />
          {limit > 0 ? (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-muted">Comprometido</span>
                <span className="num font-semibold text-fg">
                  {money(openSum)} <span className="text-muted font-normal">/ {money(limit)}</span>
                </span>
              </div>
              <Progress value={openSum} max={limit} tone={usage > 1 ? 'danger' : usage > 0.8 ? 'warning' : 'success'} className="h-2.5" />
              <div className="flex justify-between text-xs text-muted">
                <span>{percent(usage * 100, 0)} utilizado</span>
                <span className={openSum > limit ? 'text-danger font-medium' : ''}>
                  {openSum > limit ? `Excedido em ${money(openSum - limit)}` : `Disponível ${money(limit - openSum)}`}
                </span>
              </div>
              {customer.financialApproval !== 'APPROVED' && (
                <p className="text-xs text-warning">
                  Crédito {customer.financialApproval === 'REJECTED' ? 'reprovado' : 'aguardando aprovação'} pelo financeiro.
                </p>
              )}
            </div>
          ) : (
            <EmptyState
              className="py-6"
              title="Limite não definido"
              description="Defina um limite de crédito no cadastro do cliente para acompanhar o comprometimento."
            />
          )}
        </Card>
      </div>

      <section className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
          <h2 className="text-[15px] font-semibold text-fg mr-auto">Movimentação</h2>
          <Segmented
            size="sm"
            value={period}
            onChange={setPeriod}
            options={[
              { value: 'D90', label: '90 dias' },
              { value: 'D365', label: '12 meses' },
              { value: 'YEAR', label: 'Este ano' },
              { value: 'ALL', label: 'Tudo' },
              { value: 'CUSTOM', label: 'Período' },
            ]}
          />
        </div>
        {period === 'CUSTOM' && (
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <DateInput value={custom.from} onChange={(from) => setCustom((c) => ({ ...c, from }))} className="w-40" />
            <span className="text-xs text-muted">até</span>
            <DateInput value={custom.to} onChange={(to) => setCustom((c) => ({ ...c, to }))} className="w-40" />
          </div>
        )}
        <DataTable
          columns={ledgerCols}
          rows={ledger.lines}
          rowKey={(l) => l.key}
          pageSize={50}
          dense
          emptyTitle="Sem movimentação no período"
          emptyDescription="Escolha um período maior."
          footer={
            ledger.lines.length ? (
              <tr>
                <FooterCell colSpan={2}>Saldo final · {periodLabel}</FooterCell>
                <FooterCell align="right">{money(sumDebit)}</FooterCell>
                <FooterCell align="right">{money(sumCredit)}</FooterCell>
                <FooterCell align="right">{money(ledger.closing)}</FooterCell>
              </tr>
            ) : undefined
          }
        />
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-[15px] font-semibold text-fg mr-auto">Parcelas</h2>
          <Switch checked={showPaid} onChange={setShowPaid} label="Mostrar quitadas" />
        </div>
        <DataTable
          columns={instCols}
          rows={installments}
          rowKey={(e) => e.id}
          initialSort={{ key: 'due', dir: 'asc' }}
          dense
          emptyTitle={showPaid ? 'Nenhuma parcela' : 'Nenhuma parcela em aberto'}
        />
      </section>

      <CollectModal open={collect} onClose={() => setCollect(false)} customer={customer} overdue={overdue} />
    </>
  );
}
