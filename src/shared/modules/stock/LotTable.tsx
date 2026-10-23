/**
 * Tabela de lotes do estoque de venda (usada na visão por lote e no painel do produto).
 */
import { Ban, Scale, ShieldCheck, TrendingDown } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../app/session';
import { useTable } from '../../data/react';
import { date, money, qty as fmtQty } from '../../domain/format';
import { COMPANY_LABELS } from '../../domain/labels';
import type { StockLot } from '../../domain/types';
import { Badge, DataTable, Menu, StatusBadge, type Column } from '../../ui';
import { expiryBadge, LOT_STATUS } from './model';
import type { useLotActions } from './LotActions';

export function OriginBadge({ lot }: { lot: Pick<StockLot, 'origin' | 'originCompany'> }) {
  if ((lot.origin || 'PROPRIO') === 'INTERCOMPANY')
    return (
      <Badge tone="accent" size="xs">
        IC · {lot.originCompany ? COMPANY_LABELS[lot.originCompany]?.split(' ')[0] || lot.originCompany : '—'}
      </Badge>
    );
  return (
    <Badge tone="neutral" size="xs">
      Próprio
    </Badge>
  );
}

export function ExpiryCell({ expiry }: { expiry: string | null | undefined }) {
  const b = expiryBadge(expiry);
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <span className="num">{date(expiry)}</span>
      {b && (
        <Badge tone={b.tone} size="xs">
          {b.label}
        </Badge>
      )}
    </span>
  );
}

export function LotTable({
  lots,
  showProduct,
  actions,
  loading,
  bare,
  compact,
  emptyTitle = 'Nenhum lote',
}: {
  /** Menos colunas (para caber em painéis laterais). */
  compact?: boolean;
  lots: StockLot[];
  showProduct?: boolean;
  actions: ReturnType<typeof useLotActions>;
  loading?: boolean;
  bare?: boolean;
  emptyTitle?: string;
}) {
  const { can } = useSession();
  const { rows: orders } = useTable('processing_orders');
  const osById = useMemo(() => new Map(orders.map((o) => [o.id, o.number])), [orders]);
  const canCattle = can('view.cattle');

  const columns: Column<StockLot>[] = [
    ...(showProduct
      ? [
          {
            key: 'product',
            header: 'Produto',
            mobile: 'title' as const,
            sortValue: (l: StockLot) => l.productName,
            cell: (l: StockLot) => (
              <div className="min-w-0">
                <div className="font-medium text-fg truncate">{l.productName}</div>
                <div className="text-xs text-muted truncate num">{l.lotCode || 'sem código'}</div>
              </div>
            ),
          },
        ]
      : [
          {
            key: 'code',
            header: 'Lote',
            mobile: 'title' as const,
            sortValue: (l: StockLot) => l.lotCode || '',
            cell: (l: StockLot) => <span className="num font-medium text-fg">{l.lotCode || 'sem código'}</span>,
          },
        ]),
    {
      key: 'origin',
      header: 'Origem',
      mobile: 'subtitle',
      sortValue: (l) => `${l.origin}${l.originCompany || ''}`,
      cell: (l) => (
        <span className="inline-flex items-center gap-1.5">
          <OriginBadge lot={l} />
          {l.originInvoice && <span className="text-xs text-muted num">NF {l.originInvoice.replace(/^NF[\s.:º°-]*/i, '')}</span>}
        </span>
      ),
    },
    {
      key: 'batch',
      header: 'Lote de gado / OS',
      hideBelow: 'lg',
      sortValue: (l) => l.batchCode || '',
      cell: (l) => (
        <div className="text-xs leading-tight">
          {l.batchCode ? (
            canCattle && l.batchId ? (
              <Link className="text-primary hover:underline num" to={`/gado/lotes/${l.batchId}`} onClick={(e) => e.stopPropagation()}>
                {l.batchCode}
              </Link>
            ) : (
              <span className="num">{l.batchCode}</span>
            )
          ) : (
            <span className="text-subtle">—</span>
          )}
          {l.processingOrderId && <div className="text-muted num">{osById.get(l.processingOrderId) || 'OS'}</div>}
        </div>
      ),
    },
    { key: 'entry', header: 'Entrada', hideBelow: 'md', sortValue: (l) => l.entryDate, cell: (l) => <span className="num">{date(l.entryDate)}</span> },
    { key: 'expiry', header: 'Validade', sortValue: (l) => l.expiryDate || '9999', cell: (l) => <ExpiryCell expiry={l.expiryDate} /> },
    {
      key: 'balance',
      header: 'Saldo',
      align: 'right',
      sortValue: (l) => l.balanceQty,
      cell: (l) => (
        <div className="leading-tight whitespace-nowrap">
          <div className="font-medium text-fg">{fmtQty(l.balanceQty, l.unit)}</div>
          {l.initialQty !== l.balanceQty && <div className="text-[11px] text-subtle">de {fmtQty(l.initialQty, l.unit)}</div>}
        </div>
      ),
    },
    { key: 'cost', header: 'Custo', align: 'right', hideBelow: 'md', sortValue: (l) => l.unitCost, cell: (l) => money(l.unitCost) },
    { key: 'value', header: 'Valor', align: 'right', hideBelow: 'lg', sortValue: (l) => l.balanceQty * l.unitCost, cell: (l) => money(l.balanceQty * l.unitCost) },
    { key: 'status', header: 'Status', mobile: 'badge', sortValue: (l) => l.status, cell: (l) => <StatusBadge info={LOT_STATUS[l.status]} /> },
  ];

  const shown = compact ? columns.filter((c) => !['entry', 'cost', 'value'].includes(c.key)) : columns;
  return (
    <DataTable
      columns={shown}
      rows={lots}
      rowKey={(l) => l.id}
      loading={loading}
      bare={bare}
      dense
      initialSort={{ key: 'expiry', dir: 'asc' }}
      emptyTitle={emptyTitle}
      rowClassName={(l) => (l.status === 'BLOCKED' ? 'opacity-70' : undefined)}
      rowActions={
        actions.canManage
          ? (l) => (
              <Menu
                items={[
                  { label: 'Ajustar saldo', icon: <Scale />, onClick: () => actions.adjust(l) },
                  { label: 'Registrar perda', icon: <TrendingDown />, onClick: () => actions.registerLoss(l), hidden: l.balanceQty <= 0 },
                  'divider',
                  l.status === 'BLOCKED'
                    ? { label: 'Liberar lote', icon: <ShieldCheck />, onClick: () => actions.toggleBlock(l) }
                    : { label: 'Bloquear lote', icon: <Ban />, danger: true, onClick: () => actions.toggleBlock(l), hidden: l.status === 'DEPLETED' },
                ]}
              />
            )
          : undefined
      }
    />
  );
}
