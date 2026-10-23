/**
 * Comissões por vendedor — liberada × pendente conforme o recebimento das vendas.
 */
import { BadgeDollarSign, CheckCircle2, Clock, Download, FileDown, FileText, Receipt } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTable } from '../../data/react';
import { addDays, date, endOfMonth, money, percent, startOfMonth, today } from '../../domain/format';
import { SALE_STATUS } from '../../domain/labels';
import {
  Avatar,
  BarsChart,
  Button,
  Card,
  CardHeader,
  DataTable,
  DateInput,
  Drawer,
  exportCsv,
  FooterCell,
  Menu,
  PageHeader,
  Progress,
  Segmented,
  Stat,
  StatGrid,
  StatusBadge,
  Switch,
  Toolbar,
  type Column,
} from '../../ui';
import { axisMoney, sum, type SaleCommission } from './helpers';
import { exportSellerCsv, sellerCommissions, sellerPdf, summaryPdf, type SellerCommission } from './commissionModel';
import { StatMoney, useSmUp } from './parts';

type Period = 'MONTH' | 'LAST' | 'QUARTER' | 'YEAR' | 'CUSTOM';

function periodRange(p: Period, custom: { from: string; to: string }): { from: string; to: string } {
  const t = today();
  if (p === 'MONTH') return { from: startOfMonth(t), to: endOfMonth(t) };
  if (p === 'LAST') {
    const prev = addDays(startOfMonth(t), -1);
    return { from: startOfMonth(prev), to: endOfMonth(prev) };
  }
  if (p === 'QUARTER') return { from: startOfMonth(addDays(startOfMonth(t), -62)), to: endOfMonth(t) };
  if (p === 'YEAR') return { from: `${t.slice(0, 4)}-01-01`, to: `${t.slice(0, 4)}-12-31` };
  return { from: custom.from || '0000-01-01', to: custom.to || '9999-12-31' };
}

export function CommissionsPage() {
  const sm = useSmUp();
  const { rows: sales, loading } = useTable('sales');
  const { rows: entries } = useTable('financial_entries', { where: [['direction', '==', 'IN']] });
  const { rows: profiles } = useTable('profiles');
  // Nos primeiros dias do mês o fechamento costuma ser do mês anterior.
  const [period, setPeriod] = useState<Period>(() => (Number(today().slice(8, 10)) <= 10 ? 'LAST' : 'MONTH'));
  const [custom, setCustom] = useState({ from: startOfMonth(), to: today() });
  const [onlyActive, setOnlyActive] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const range = periodRange(period, custom);
  const periodLabel = `Vendas de ${date(range.from)} a ${date(range.to)}`;
  const all = useMemo(() => sellerCommissions(sales, entries, profiles, range.from, range.to), [sales, entries, profiles, range.from, range.to]);
  const rows = useMemo(() => all.filter((s) => !onlyActive || s.count > 0), [all, onlyActive]);
  const open = openId ? all.find((s) => s.id === openId) || null : null;

  const tot = {
    revenue: sum(rows, (s) => s.revenue),
    base: sum(rows, (s) => s.base),
    commission: sum(rows, (s) => s.commission),
    released: sum(rows, (s) => s.released),
    pending: sum(rows, (s) => s.pending),
    count: sum(rows, (s) => s.count),
  };

  const chart = [...rows]
    .filter((s) => s.commission > 0)
    .sort((a, b) => b.commission - a.commission)
    .slice(0, 8)
    .map((s) => ({ name: s.name.split(' ').slice(0, 2).join(' '), liberada: s.released, pendente: s.pending }));

  const columns: Column<SellerCommission>[] = [
    {
      key: 'name',
      header: 'Vendedor',
      mobile: 'title',
      sortValue: (s) => s.name,
      cell: (s) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar name={s.name} size={28} className="max-sm:hidden" />
          <div className="min-w-0">
            <div className="font-medium text-fg truncate">{s.name}</div>
            <div className="text-xs text-muted truncate">
              {s.role}
              {s.rate != null ? ` · ${percent(s.rate)}` : ''}
            </div>
          </div>
        </div>
      ),
    },
    { key: 'count', header: 'Vendas', align: 'right', sortValue: (s) => s.count, cell: (s) => s.count },
    { key: 'revenue', header: 'Faturamento', align: 'right', sortValue: (s) => s.revenue, cell: (s) => money(s.revenue) },
    { key: 'base', header: 'Base', align: 'right', hideBelow: 'xl', mobile: false, sortValue: (s) => s.base, cell: (s) => money(s.base) },
    { key: 'commission', header: 'Comissão', align: 'right', sortValue: (s) => s.commission, cell: (s) => <strong>{money(s.commission)}</strong> },
    {
      key: 'recv',
      header: 'Recebido',
      hideBelow: 'lg',
      sortValue: (s) => s.receivedRatio,
      cell: (s) => (
        <div className="w-24">
          <div className="text-[11px] text-muted num mb-1">{percent(s.receivedRatio * 100, 0)}</div>
          <Progress value={s.receivedRatio * 100} tone="success" />
        </div>
      ),
    },
    {
      key: 'released',
      header: 'Liberada',
      align: 'right',
      sortValue: (s) => s.released,
      cell: (s) => <span className="text-success">{money(s.released)}</span>,
    },
    {
      key: 'pending',
      header: 'Pendente',
      align: 'right',
      mobile: 'badge',
      sortValue: (s) => s.pending,
      cell: (s) => (s.pending > 0.005 ? <span className="text-warning num">{money(s.pending)}</span> : <span className="text-subtle">—</span>),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        title="Comissões"
        subtitle="Comissão por vendedor, liberada conforme o cliente paga as parcelas."
        actions={
          <Menu
            trigger={<Button icon={<Download className="size-4" />}>Exportar</Button>}
            items={[
              {
                label: 'Planilha (CSV)',
                icon: <FileText />,
                onClick: () =>
                  exportCsv('comissoes-por-vendedor', rows, [
                    { header: 'Vendedor', value: (s) => s.name },
                    { header: 'Tipo', value: (s) => s.role },
                    { header: 'Vendas', value: (s) => s.count },
                    { header: 'Faturamento', value: (s) => s.revenue },
                    { header: 'Base', value: (s) => s.base },
                    { header: 'Comissão', value: (s) => s.commission },
                    { header: '% recebido', value: (s) => Math.round(s.receivedRatio * 1000) / 10 },
                    { header: 'Liberada', value: (s) => s.released },
                    { header: 'Pendente', value: (s) => s.pending },
                  ]),
              },
              { label: 'Resumo em PDF', icon: <FileDown />, onClick: () => summaryPdf(rows, periodLabel) },
            ]}
          />
        }
      />

      <Toolbar>
        <Segmented
          size="sm"
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'MONTH', label: 'Este mês' },
            { value: 'LAST', label: 'Mês passado' },
            { value: 'QUARTER', label: '3 meses' },
            { value: 'YEAR', label: 'Ano' },
            { value: 'CUSTOM', label: 'Período' },
          ]}
        />
        {period === 'CUSTOM' && (
          <div className="flex items-center gap-2">
            <DateInput value={custom.from} onChange={(from) => setCustom((c) => ({ ...c, from }))} className="w-40" />
            <span className="text-xs text-muted">até</span>
            <DateInput value={custom.to} onChange={(to) => setCustom((c) => ({ ...c, to }))} className="w-40" />
          </div>
        )}
        <div className="sm:ml-auto">
          <Switch checked={onlyActive} onChange={setOnlyActive} label="Só quem vendeu" />
        </div>
      </Toolbar>

      <StatGrid cols={4} className="mb-6">
        <Stat
          label="Faturamento"
          value={<StatMoney value={tot.revenue} />}
          hint={`${tot.count} vendas no período`}
          icon={sm && <Receipt className="size-4" />}
        />
        <Stat
          label="Comissão total"
          tone="accent"
          value={<StatMoney value={tot.commission} />}
          hint={tot.base ? `${percent((tot.commission / tot.base) * 100)} da base` : '—'}
          icon={sm && <BadgeDollarSign className="size-4" />}
        />
        <Stat
          label="Liberada"
          tone="success"
          value={<StatMoney value={tot.released} />}
          hint="parcelas já pagas"
          icon={sm && <CheckCircle2 className="size-4" />}
        />
        <Stat label="Pendente" tone="warning" value={<StatMoney value={tot.pending} />} hint="a receber do cliente" icon={sm && <Clock className="size-4" />} />
      </StatGrid>

      {chart.length > 0 && (
        <Card className="mb-6">
          <CardHeader title="Comissão por vendedor" subtitle={periodLabel} />
          <BarsChart
            data={chart}
            xKey="name"
            layout="vertical"
            stacked
            series={[
              { key: 'liberada', name: 'Liberada', slot: 1 },
              { key: 'pendente', name: 'Pendente', slot: 2 },
            ]}
            format={money}
            axisFormat={axisMoney}
            height={Math.max(140, chart.length * 44)}
          />
        </Card>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(s) => s.id}
        loading={loading}
        initialSort={{ key: 'commission', dir: 'desc' }}
        onRowClick={(s) => setOpenId(s.id)}
        emptyTitle="Nenhuma venda com vendedor no período"
        emptyDescription="Escolha outro período ou desligue “Só quem vendeu”."
        footer={
          rows.length ? (
            <tr>
              <FooterCell>Total</FooterCell>
              <FooterCell align="right">{tot.count}</FooterCell>
              <FooterCell align="right">{money(tot.revenue)}</FooterCell>
              <FooterCell align="right" className="hidden xl:table-cell">
                {money(tot.base)}
              </FooterCell>
              <FooterCell align="right">{money(tot.commission)}</FooterCell>
              <FooterCell className="hidden lg:table-cell" />
              <FooterCell align="right">{money(tot.released)}</FooterCell>
              <FooterCell align="right">{money(tot.pending)}</FooterCell>
            </tr>
          ) : undefined
        }
      />

      <SellerDrawer seller={open} periodLabel={periodLabel} onClose={() => setOpenId(null)} />
    </>
  );
}

function SellerDrawer({ seller: s, periodLabel, onClose }: { seller: SellerCommission | null; periodLabel: string; onClose: () => void }) {
  const cols: Column<SaleCommission>[] = [
    {
      key: 'sale',
      header: 'Pedido',
      mobile: 'title',
      sortValue: (x) => x.sale.date,
      cell: (x) => (
        <div className="min-w-0">
          <Link to={`/vendas/${x.sale.id}`} className="text-primary hover:underline num">
            {x.sale.number}
          </Link>
          <div className="text-xs text-muted truncate max-w-[240px]">
            {date(x.sale.date)} · {x.sale.customerName}
          </div>
        </div>
      ),
    },
    { key: 'st', header: 'Status', mobile: 'badge', cell: (x) => <StatusBadge info={SALE_STATUS[x.sale.status]} /> },
    { key: 'rev', header: 'Faturamento', align: 'right', sortValue: (x) => x.revenue, cell: (x) => money(x.revenue) },
    { key: 'com', header: 'Comissão', align: 'right', sortValue: (x) => x.commission, cell: (x) => `${money(x.commission)}` },
    { key: 'recv', header: 'Recebido', align: 'right', sortValue: (x) => x.receivedRatio, cell: (x) => percent(x.receivedRatio * 100, 0) },
    { key: 'rel', header: 'Liberada', align: 'right', sortValue: (x) => x.released, cell: (x) => <span className="text-success">{money(x.released)}</span> },
  ];
  return (
    <Drawer
      open={!!s}
      onClose={onClose}
      width="xl"
      title={s ? `Comissões — ${s.name}` : ''}
      description={periodLabel}
      footer={
        s && (
          <>
            <Button icon={<FileText className="size-4" />} onClick={() => exportSellerCsv(s, periodLabel)}>
              CSV
            </Button>
            <Button variant="primary" icon={<FileDown className="size-4" />} onClick={() => sellerPdf(s, periodLabel)}>
              PDF para o vendedor
            </Button>
          </>
        )
      }
    >
      {s && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ['Faturamento', money(s.revenue), 'text-fg'],
              ['Comissão', money(s.commission), 'text-fg'],
              ['Liberada', money(s.released), 'text-success'],
              ['Pendente', money(s.pending), 'text-warning'],
            ].map(([l, v, c]) => (
              <div key={l} className="rounded-control bg-surface-2 p-3">
                <div className="text-[11px] uppercase tracking-wider text-subtle">{l}</div>
                <div className={`num font-semibold ${c}`}>{v}</div>
              </div>
            ))}
          </div>
          <div>
            <div className="flex justify-between text-xs text-muted mb-1">
              <span>Recebido dos clientes</span>
              <span className="num">
                {money(s.received)} · {percent(s.receivedRatio * 100, 0)}
              </span>
            </div>
            <Progress value={s.receivedRatio * 100} tone="success" />
          </div>
          <DataTable
            columns={cols}
            rows={s.sales}
            rowKey={(x) => x.sale.id}
            initialSort={{ key: 'sale', dir: 'desc' }}
            dense
            emptyTitle="Nenhuma venda no período"
          />
        </div>
      )}
    </Drawer>
  );
}
