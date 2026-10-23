/**
 * Estoque pós-abate (stage RAW): carcaça e quartos aguardando desossa.
 * Ações: enviar para desossa (OS com lotes pré-selecionados), perda e ajuste.
 */
import { AlertTriangle, Download, ExternalLink, Minus, PackageOpen, Scale, Scissors, Snowflake, Wallet, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/session';
import { useTable } from '../../data/react';
import { date, daysBetween, integer, kg, matchesSearch, money, moneyCompact, percent, today } from '../../domain/format';
import type { StockLot } from '../../domain/types';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  exportCsv,
  FooterCell,
  Menu,
  PageHeader,
  Progress,
  SearchInput,
  Segmented,
  Stat,
  StatGrid,
  Toolbar,
  type Column,
} from '../../ui';
import { AdjustModal, LossModal } from './LotDialogs';
import { ProcessingOrderDrawer } from './ProcessingOrderDrawer';
import { lotAgeDays, NUM_COL } from './shared';

function expiryBadge(l: StockLot) {
  if (!l.expiryDate) return null;
  const left = daysBetween(today(), l.expiryDate);
  if (left < 0) return <Badge tone="danger">vencido</Badge>;
  if (left <= 2) return <Badge tone="warning">vence em {left === 0 ? 'hoje' : `${left}d`}</Badge>;
  return null;
}

export function RawStockPage() {
  const nav = useNavigate();
  const { can } = useSession();
  const canOperate = can('production.manage');
  // registerLoss/adjustLot exigem 'stock.manage'.
  const canStock = canOperate && can('stock.manage');
  const [params, setParams] = useSearchParams();
  const batchFilter = params.get('lote');

  const { rows: lots, loading } = useTable('stock_lots', { where: [['stage', '==', 'RAW']] });
  const [q, setQ] = useState('');
  const [view, setView] = useState<'AVAILABLE' | 'ALL'>('AVAILABLE');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sendLots, setSendLots] = useState<string[] | null>(null);
  const [lossLot, setLossLot] = useState<StockLot | null>(null);
  const [adjustLot, setAdjustLot] = useState<StockLot | null>(null);

  const active = useMemo(() => lots.filter((l) => l.status === 'AVAILABLE' && l.balanceQty > 0.0005), [lots]);
  const batchCode = batchFilter ? lots.find((l) => l.batchId === batchFilter)?.batchCode : null;

  const filtered = useMemo(
    () =>
      (view === 'AVAILABLE' ? lots.filter((l) => l.balanceQty > 0.0005 && l.status !== 'DEPLETED') : lots)
        .filter((l) => !batchFilter || l.batchId === batchFilter)
        .filter((l) => matchesSearch([l.productName, l.lotCode, l.batchCode, l.notes], q)),
    [lots, view, batchFilter, q],
  );

  const stats = useMemo(() => {
    const totalKg = active.reduce((s, l) => s + l.balanceQty, 0);
    const value = active.reduce((s, l) => s + l.balanceQty * l.unitCost, 0);
    const oldest = active.reduce((m, l) => Math.max(m, lotAgeDays(l)), 0);
    const expired = active.filter((l) => l.expiryDate && l.expiryDate < today()).length;
    const byProduct = new Map<string, { name: string; qty: number; value: number; lots: number }>();
    for (const l of active) {
      const cur = byProduct.get(l.productId) || { name: l.productName, qty: 0, value: 0, lots: 0 };
      cur.qty += l.balanceQty;
      cur.value += l.balanceQty * l.unitCost;
      cur.lots += 1;
      byProduct.set(l.productId, cur);
    }
    return { totalKg, value, oldest, expired, byProduct: [...byProduct.values()].sort((a, b) => b.qty - a.qty), batches: new Set(active.map((l) => l.batchId)).size };
  }, [active]);

  const selectedLots = filtered.filter((l) => selected.has(l.id) && l.status === 'AVAILABLE' && l.balanceQty > 0.0005);
  // Sem seleção mas filtrado por um lote de gado: envia todas as peças disponíveis daquele abate.
  const sendCandidates = selectedLots.length ? selectedLots : batchFilter ? filtered.filter((l) => l.status === 'AVAILABLE' && l.balanceQty > 0.0005) : [];
  const footTotals = useMemo(() => ({ qty: filtered.reduce((s, l) => s + l.balanceQty, 0), value: filtered.reduce((s, l) => s + l.balanceQty * l.unitCost, 0) }), [filtered]);

  const columns: Column<StockLot>[] = [
    {
      key: 'product',
      header: 'Produto',
      mobile: 'title',
      sortValue: (l) => l.productName,
      cell: (l) => (
        <div className="min-w-0">
          <div className="font-medium text-fg truncate">{l.productName}</div>
          <div className="text-xs text-muted truncate num">{l.lotCode || '—'}</div>
        </div>
      ),
    },
    {
      key: 'batch',
      header: 'Lote de gado',
      mobile: 'subtitle',
      sortValue: (l) => l.batchCode || '',
      cell: (l) => (l.batchCode ? <span className="num">{l.batchCode}</span> : <span className="text-subtle">—</span>),
    },
    { key: 'entry', header: 'Abate', mobile: false, sortValue: (l) => l.entryDate, cell: (l) => <span className="num">{date(l.entryDate)}</span>, hideBelow: 'lg' },
    {
      key: 'age',
      header: 'Dias',
      ...NUM_COL,
      sortValue: (l) => lotAgeDays(l),
      cell: (l) => {
        const age = lotAgeDays(l);
        return (
          <span className="inline-flex items-center gap-1.5 justify-end">
            <span className={age > 5 ? 'text-warning font-medium' : ''}>{integer(age)}</span>
            {expiryBadge(l)}
          </span>
        );
      },
    },
    { key: 'initial', header: 'Entrada', mobile: false, ...NUM_COL, sortValue: (l) => l.initialQty, cell: (l) => kg(l.initialQty), hideBelow: 'xl' },
    { key: 'balance', header: 'Saldo', ...NUM_COL, sortValue: (l) => l.balanceQty, cell: (l) => <span className="font-semibold">{kg(l.balanceQty)}</span> },
    { key: 'cost', header: 'Custo/kg', mobile: false, ...NUM_COL, sortValue: (l) => l.unitCost, cell: (l) => money(l.unitCost), hideBelow: 'md' },
    { key: 'value', header: 'Valor', ...NUM_COL, sortValue: (l) => l.balanceQty * l.unitCost, cell: (l) => money(l.balanceQty * l.unitCost), hideBelow: 'lg' },
    {
      key: 'status',
      header: 'Situação',
      mobile: 'badge',
      cell: (l) =>
        l.status === 'BLOCKED' ? (
          <Badge tone="danger" dot>
            Bloqueado
          </Badge>
        ) : l.balanceQty <= 0.0005 || l.status === 'DEPLETED' ? (
          <Badge dot>Esgotado</Badge>
        ) : (
          <Badge tone="success" dot>
            Disponível
          </Badge>
        ),
    },
  ];

  const canSend = (l: StockLot) => l.status === 'AVAILABLE' && l.balanceQty > 0.0005;

  return (
    <>
      <PageHeader
        eyebrow="Produção"
        title="Estoque pós-abate"
        subtitle="Carcaças e quartos que saíram do frigorífico e aguardam desossa."
        actions={
          <>
            <Button
              icon={<Download className="size-4" />}
              onClick={() =>
                exportCsv('estoque-pos-abate', filtered, [
                  { header: 'Produto', value: (l) => l.productName },
                  { header: 'Código do lote', value: (l) => l.lotCode },
                  { header: 'Lote de gado', value: (l) => l.batchCode },
                  { header: 'Data do abate', value: (l) => date(l.entryDate) },
                  { header: 'Dias', value: (l) => lotAgeDays(l) },
                  { header: 'Entrada (kg)', value: (l) => l.initialQty },
                  { header: 'Saldo (kg)', value: (l) => l.balanceQty },
                  { header: 'Custo/kg', value: (l) => l.unitCost },
                  { header: 'Valor', value: (l) => Math.round(l.balanceQty * l.unitCost * 100) / 100 },
                ])
              }
            >
              Exportar
            </Button>
            {canOperate && (
              <Button variant="primary" icon={<Scissors className="size-4" />} disabled={!active.length} onClick={() => setSendLots(sendCandidates.map((l) => l.id))}>
                {sendCandidates.length ? `Enviar ${sendCandidates.length} para desossa` : 'Enviar para desossa'}
              </Button>
            )}
          </>
        }
      />

      <StatGrid cols={4} className="mb-6">
        <Stat label="Em estoque" value={kg(Math.round(stats.totalKg))} hint={`${integer(active.length)} lotes · ${integer(stats.batches)} de gado`} icon={<Snowflake className="size-4" />} />
        <Stat label="Valor" value={moneyCompact(stats.value)} hint={stats.totalKg ? `a custo · ${money(stats.value / stats.totalKg)}/kg` : 'a custo'} icon={<Wallet className="size-4" />} tone="accent" />
        <Stat
          label="Mais antigo"
          value={active.length ? `${integer(stats.oldest)} dias` : '—'}
          hint="desde o abate"
          icon={<Scale className="size-4" />}
          tone={stats.oldest > 5 ? 'warning' : 'info'}
        />
        <Stat
          label="Vencidos"
          value={integer(stats.expired)}
          hint={stats.expired ? 'envie ou dê baixa' : 'nenhum vencido'}
          icon={<AlertTriangle className="size-4" />}
          tone={stats.expired ? 'danger' : 'success'}
        />
      </StatGrid>

      {stats.byProduct.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
          {stats.byProduct.map((p) => (
            <div key={p.name} className="rounded-card border border-border bg-surface px-3.5 py-3 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-fg truncate">{p.name}</span>
                <span className="text-[11px] text-subtle num shrink-0">{percent(stats.totalKg ? (p.qty / stats.totalKg) * 100 : 0, 0)}</span>
              </div>
              <div className="text-lg font-semibold num text-fg mt-0.5">{kg(Math.round(p.qty * 10) / 10)}</div>
              <Progress value={p.qty} max={stats.totalKg} className="my-1.5" />
              <div className="text-[11px] text-muted num truncate">
                {integer(p.lots)} lote(s) · {money(p.value)}
              </div>
            </div>
          ))}
        </div>
      )}

      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar produto, código ou lote…" className="sm:w-72" />
        <Segmented
          size="sm"
          value={view}
          onChange={setView}
          options={[
            { value: 'AVAILABLE', label: 'Com saldo', count: lots.filter((l) => l.balanceQty > 0.0005 && l.status !== 'DEPLETED').length },
            { value: 'ALL', label: 'Todos', count: lots.length },
          ]}
        />
        {batchFilter && (
          <Button size="sm" variant="subtle" iconRight={<X className="size-3.5" />} onClick={() => setParams({})}>
            Lote {batchCode || 'selecionado'}
          </Button>
        )}
      </Toolbar>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(l) => l.id}
        loading={loading}
        initialSort={{ key: 'age', dir: 'desc' }}
        selectable={canOperate}
        selected={selected}
        onSelectedChange={setSelected}
        rowClassName={(l) => (l.balanceQty <= 0.0005 ? 'opacity-60' : undefined)}
        empty={
          !active.length && view === 'AVAILABLE' && !q && !batchFilter ? (
            <EmptyState
              icon={<PackageOpen className="size-5" />}
              title={lots.length ? 'Tudo já foi para a desossa' : 'Nada no estoque pós-abate'}
              description={
                lots.length
                  ? 'Não há carcaça nem quartos aguardando. Veja "Todos" para o histórico ou registre um novo abate.'
                  : 'Quando um abate é registrado, a carcaça e os quartos aparecem aqui para seguir para a desossa.'
              }
              action={
                <Button variant="secondary" onClick={() => nav('/producao/abate')}>
                  Ir para saída para abate
                </Button>
              }
            />
          ) : undefined
        }
        emptyTitle="Nenhum lote encontrado"
        emptyDescription={view === 'AVAILABLE' ? 'Nenhum lote com saldo neste filtro. Veja "Todos" para o histórico.' : 'Tente outra busca.'}
        footer={
          filtered.length > 1 ? (
            <tr>
              <FooterCell colSpan={canOperate ? 2 : 1}>Total</FooterCell>
              <FooterCell />
              <FooterCell className="hidden lg:table-cell" />
              <FooterCell />
              <FooterCell className="hidden xl:table-cell" />
              <FooterCell align="right">{kg(footTotals.qty)}</FooterCell>
              <FooterCell className="hidden md:table-cell" />
              <FooterCell align="right" className="hidden lg:table-cell">
                {money(footTotals.value)}
              </FooterCell>
              <FooterCell colSpan={2} />
            </tr>
          ) : undefined
        }
        rowActions={(l) => (
          <Menu
            items={[
              { label: 'Enviar para desossa', icon: <Scissors />, onClick: () => setSendLots([l.id]), hidden: !canOperate || !canSend(l) },
              { label: 'Registrar perda', icon: <Minus />, onClick: () => setLossLot(l), hidden: !canStock || !canSend(l) },
              { label: 'Ajustar saldo', icon: <Scale />, onClick: () => setAdjustLot(l), hidden: !canStock || l.status === 'BLOCKED' },
              'divider',
              { label: 'Abrir lote de gado', icon: <ExternalLink />, onClick: () => nav(`/gado/lotes/${l.batchId}`), hidden: !l.batchId },
            ]}
          />
        )}
      />

      <ProcessingOrderDrawer open={!!sendLots} onClose={() => setSendLots(null)} initialLotIds={sendLots || undefined} />
      <LossModal lot={lossLot} onClose={() => setLossLot(null)} />
      <AdjustModal lot={adjustLot} onClose={() => setAdjustLot(null)} />
    </>
  );
}
