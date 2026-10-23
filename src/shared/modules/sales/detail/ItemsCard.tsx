/**
 * Itens do pedido: pedido × separado × baixado, lotes usados, custo e margem.
 */
import { Package } from 'lucide-react';
import { useMemo } from 'react';
import { kg, money, number, percent, qty } from '../../../domain/format';
import type { Sale, SaleItem, StockLot, StockMovement } from '../../../domain/types';
import { Badge, Card, CardHeader, cn, DataTable, FooterCell, type Column } from '../../../ui';

export function ItemsCard({
  sale,
  movements,
  lots,
  avgCost,
  showCost,
}: {
  sale: Sale;
  movements: StockMovement[];
  lots: StockLot[];
  /** Custo médio atual por produto (R$/kg ou un) — estimativa antes da baixa. */
  avgCost: Map<string, number>;
  showCost: boolean;
}) {
  const items = useMemo(() => (sale.items || []).slice().sort((a, b) => a.position - b.position), [sale.items]);
  const lotCode = useMemo(() => new Map(lots.map((l) => [l.id, l.lotCode || l.batchCode || l.id.slice(0, 6)])), [lots]);
  const usedLots = useMemo(() => {
    const m = new Map<string, { code: string; qty: number }[]>();
    for (const mv of movements) {
      if (!mv.saleItemId || (mv.type !== 'SALE' && mv.type !== 'SALE_REVERSAL')) continue;
      const arr = m.get(mv.saleItemId) || [];
      const code = lotCode.get(mv.lotId) || mv.lotId.slice(0, 6);
      const cur = arr.find((x) => x.code === code);
      if (cur) cur.qty -= mv.qty;
      else arr.push({ code, qty: -mv.qty });
      m.set(mv.saleItemId, arr.filter((x) => Math.abs(x.qty) > 0.0005));
    }
    return m;
  }, [movements, lotCode]);

  const costOf = (i: SaleItem): { value: number; estimated: boolean } | null => {
    if (i.costTotal != null) return { value: i.costTotal, estimated: false };
    if (i.kind !== 'PRODUCT' || !i.productId) return null;
    const c = avgCost.get(i.productId);
    return c ? { value: c * i.qty, estimated: true } : null;
  };

  const picked = sale.stockDeducted || !!sale.pickedAt;
  const columns: Column<SaleItem>[] = [
    {
      key: 'product',
      header: 'Produto',
      mobile: 'title',
      cell: (i) => (
        <div className="min-w-0">
          <div className="font-medium text-fg flex items-center gap-2 min-w-0">
            <span className="truncate">{i.productName}</span>
            {i.kind !== 'PRODUCT' && (
              <Badge size="xs">{i.kind === 'SUPPLY' ? 'Material' : i.kind === 'FREIGHT' ? 'Frete' : 'Serviço'}</Badge>
            )}
          </div>
          {i.notes && <div className="text-xs text-muted truncate">“{i.notes}”</div>}
          {(i.lotCode || usedLots.get(i.id)?.length) && (
            <div className="text-[11px] text-subtle num truncate">
              Lote {i.lotCode ? `${i.lotCode} (preferencial)` : ''}
              {usedLots
                .get(i.id)
                ?.map((l) => `${l.code} · ${qty(l.qty, i.unit)}`)
                .join(', ')}
            </div>
          )}
        </div>
      ),
    },
    { key: 'ordered', header: 'Pedido', align: 'right', className: 'whitespace-nowrap', cell: (i) => qty(i.qtyOrdered, i.unit) },
    {
      key: 'qty',
      header: 'Separado',
      align: 'right',
      mobile: 'subtitle',
      className: 'whitespace-nowrap',
      cell: (i) => {
        if (!picked) return <span className="text-subtle">—</span>;
        const diff = i.qty - i.qtyOrdered;
        const short = i.deductedQty != null && i.kind === 'PRODUCT' && i.deductedQty + 0.0005 < i.qty;
        return (
          <span className="num inline-flex flex-col items-end sm:items-end">
            <span>
              <span className="sm:hidden text-muted">Separado </span>
              {qty(i.qty, i.unit)}
              {Math.abs(diff) > 0.0005 && (
                <span className={cn('text-[11px] ml-1', diff > 0 ? 'text-info' : 'text-warning')}>
                  {diff > 0 ? '+' : ''}
                  {number(diff, 3)}
                </span>
              )}
            </span>
            {i.deductedQty != null && (
              <span className={cn('text-[10px] hidden sm:inline', short ? 'text-danger' : 'text-subtle')}>
                {short ? `baixado ${qty(i.deductedQty, i.unit)}` : 'baixado ✓'}
              </span>
            )}
          </span>
        );
      },
    },
    { key: 'price', header: 'Preço', align: 'right', className: 'whitespace-nowrap', cell: (i) => money(i.unitPrice) },
    { key: 'total', header: 'Total', align: 'right', className: 'whitespace-nowrap', cell: (i) => <span className="font-semibold text-fg">{money(i.total)}</span> },
  ];
  if (showCost) {
    columns.push(
      {
        key: 'cost',
        header: 'Custo',
        align: 'right',
        hideBelow: 'xl',
        className: 'whitespace-nowrap',
        cell: (i) => {
          const c = costOf(i);
          return c ? <span className={c.estimated ? 'text-muted italic' : ''}>{(c.estimated ? '~' : '') + money(c.value)}</span> : <span className="text-subtle">—</span>;
        },
      },
      {
        key: 'margin',
        header: 'Margem',
        align: 'right',
        cell: (i) => {
          const c = costOf(i);
          if (!c || !i.total) return <span className="text-subtle">—</span>;
          const m = ((i.total - c.value) / i.total) * 100;
          return <span className={cn(m < 0 ? 'text-danger' : m < 15 ? 'text-warning' : 'text-success', c.estimated && 'italic')}>{percent(m)}</span>;
        },
      },
    );
  }

  const productItems = items.filter((i) => i.kind === 'PRODUCT' || i.kind === 'SUPPLY');
  const totCost = items.reduce((s, i) => s + (costOf(i)?.value || 0), 0);
  const anyEstimated = items.some((i) => costOf(i)?.estimated);
  const revenue = items.filter((i) => i.kind !== 'FREIGHT').reduce((s, i) => s + i.total, 0);
  const margin = revenue ? ((revenue - totCost) / revenue) * 100 : 0;

  return (
    <Card padded={false}>
      <div className="px-4 sm:px-5 pt-4 sm:pt-5">
        <CardHeader
          icon={<Package className="size-4" />}
          title="Itens"
          subtitle={`${productItems.length} itens · ${kg(sale.totalWeightKg)}${sale.stockDeducted ? ' · estoque baixado' : picked ? '' : ' · aguardando separação'}`}
          actions={
            showCost && totCost > 0 ? (
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-subtle">Margem {anyEstimated ? 'estimada' : 'bruta'}</div>
                <div className={cn('num font-semibold', margin < 0 ? 'text-danger' : margin < 15 ? 'text-warning' : 'text-success')}>{percent(margin)}</div>
              </div>
            ) : undefined
          }
        />
      </div>
      <DataTable
        bare
        dense
        columns={columns}
        rows={items}
        rowKey={(i) => i.id}
        pageSize={200}
        className="border-t border-border"
        footer={
          <tr>
            <FooterCell>Total</FooterCell>
            <FooterCell align="right" className="whitespace-nowrap">{kg(items.filter((i) => i.unit === 'KG' && i.kind !== 'FREIGHT').reduce((s, i) => s + i.qtyOrdered, 0))}</FooterCell>
            <FooterCell align="right" className="whitespace-nowrap">{picked ? kg(sale.totalWeightKg) : ''}</FooterCell>
            <FooterCell />
            <FooterCell align="right" className="whitespace-nowrap">{money(sale.itemsSubtotal + items.filter((i) => i.kind === 'FREIGHT').reduce((s, i) => s + i.total, 0))}</FooterCell>
            {showCost && (
              <>
                <FooterCell align="right" className="hidden xl:table-cell">
                  {totCost ? (anyEstimated ? '~' : '') + money(totCost) : ''}
                </FooterCell>
                <FooterCell align="right">{totCost ? percent(margin) : ''}</FooterCell>
              </>
            )}
          </tr>
        }
      />
      {anyEstimated && showCost && <p className="px-4 sm:px-5 py-2 text-[11px] text-subtle border-t border-border">~ custo estimado pelo custo médio atual do estoque; o valor real é apurado na baixa.</p>}
    </Card>
  );
}
