/**
 * Vendas do lote: movimentos de estoque SALE com batchId (cortes, kg, receita, clientes).
 */
import { ShoppingCart } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../../app/session';
import type { BatchEconomics } from '../../../domain/costs';
import { date, integer, kg, money, percent } from '../../../domain/format';
import type { Batch, StockLot, StockMovement } from '../../../domain/types';
import { Card, CardHeader, DataTable, EmptyState, RankBars, Stat, StatGrid, type Column } from '../../../ui';
import { StatMoney, useSmUp } from '../Money';

interface ProductRow {
  productId: string;
  productName: string;
  kg: number;
  revenue: number;
  cost: number;
}
interface SaleRow {
  key: string;
  saleId: string | null;
  saleNumber: string;
  customerName: string;
  date: string;
  kg: number;
  revenue: number;
  items: number;
}

export function SalesTab({ sales, lots, econ: e }: { batch: Batch; sales: StockMovement[]; lots: StockLot[]; econ: BatchEconomics }) {
  const { can } = useSession();
  const showCost = can('sales.viewCost');
  const sm = useSmUp();

  const { products, bySale, customers, totals } = useMemo(() => {
    const p = new Map<string, ProductRow>();
    const s = new Map<string, SaleRow>();
    const cust = new Set<string>();
    let kgSum = 0;
    let revenue = 0;
    let cost = 0;
    for (const m of sales) {
      const q = -m.qty; // saída = positivo
      const rev = q * (m.unitPrice || 0);
      const c = q * (m.unitCost || 0);
      kgSum += q;
      revenue += rev;
      cost += c;
      const pr = p.get(m.productId) || { productId: m.productId, productName: m.productName, kg: 0, revenue: 0, cost: 0 };
      pr.kg += q;
      pr.revenue += rev;
      pr.cost += c;
      p.set(m.productId, pr);
      const key = m.saleId || m.saleNumber || m.id;
      const sr = s.get(key) || { key, saleId: m.saleId || null, saleNumber: m.saleNumber || '—', customerName: m.customerName || '—', date: m.date, kg: 0, revenue: 0, items: 0 };
      sr.kg += q;
      sr.revenue += rev;
      sr.items += 1;
      if (m.date < sr.date) sr.date = m.date;
      s.set(key, sr);
      if (m.customerName) cust.add(m.customerName);
    }
    return {
      products: [...p.values()].filter((x) => Math.abs(x.kg) > 0.0005).sort((a, b) => b.revenue - a.revenue),
      bySale: [...s.values()].filter((x) => Math.abs(x.kg) > 0.0005),
      customers: cust.size,
      totals: { kg: kgSum, revenue, cost },
    };
  }, [sales]);

  const remaining = lots.filter((l) => l.status !== 'DEPLETED' && l.unit === 'KG').reduce((s, l) => s + l.balanceQty, 0);

  if (!sales.length)
    return (
      <Card>
        <EmptyState
          icon={<ShoppingCart className="size-5" />}
          title="Nenhuma venda deste lote ainda"
          description={
            remaining > 0
              ? `Há ${kg(Math.round(remaining))} em estoque deste lote. As vendas aparecem aqui quando a separação baixa os cortes.`
              : 'As vendas aparecem aqui quando cortes vindos deste lote forem separados e baixados do estoque.'
          }
        />
      </Card>
    );

  const productCols: Column<ProductRow>[] = [
    { key: 'name', header: 'Corte', mobile: 'title', sortValue: (r) => r.productName, cell: (r) => r.productName },
    { key: 'kg', header: 'Vendido', align: 'right', sortValue: (r) => r.kg, cell: (r) => kg(Math.round(r.kg * 1000) / 1000) },
    { key: 'rev', header: 'Receita', align: 'right', mobile: 'badge', sortValue: (r) => r.revenue, cell: (r) => money(r.revenue) },
    { key: 'avg', header: 'R$/kg', align: 'right', sortValue: (r) => (r.kg ? r.revenue / r.kg : 0), cell: (r) => money(r.kg ? r.revenue / r.kg : 0) },
    ...(showCost
      ? [
          {
            key: 'margin',
            header: 'Margem bruta',
            align: 'right' as const,
            hideBelow: 'md' as const,
            mobile: false as const,
            sortValue: (r: ProductRow) => r.revenue - r.cost,
            cell: (r: ProductRow) => (
              <span className={r.revenue - r.cost >= 0 ? 'text-success' : 'text-danger'}>
                {money(r.revenue - r.cost)} {r.revenue ? `(${percent(((r.revenue - r.cost) / r.revenue) * 100)})` : ''}
              </span>
            ),
          },
        ]
      : []),
  ];

  const saleCols: Column<SaleRow>[] = [
    {
      key: 'number',
      header: 'Pedido',
      mobile: 'title',
      sortValue: (r) => r.saleNumber,
      cell: (r) =>
        r.saleId ? (
          <Link to={`/vendas/${r.saleId}`} className="text-primary hover:underline num font-medium" onClick={(ev) => ev.stopPropagation()}>
            {r.saleNumber}
          </Link>
        ) : (
          <span className="num">{r.saleNumber}</span>
        ),
    },
    { key: 'customer', header: 'Cliente', mobile: 'subtitle', sortValue: (r) => r.customerName, cell: (r) => <span className="truncate block max-w-[260px]">{r.customerName}</span> },
    { key: 'date', header: 'Data', sortValue: (r) => r.date, cell: (r) => <span className="num">{date(r.date)}</span> },
    { key: 'kg', header: 'Quantidade', align: 'right', sortValue: (r) => r.kg, cell: (r) => kg(Math.round(r.kg * 1000) / 1000) },
    { key: 'rev', header: 'Receita do lote', align: 'right', mobile: 'badge', sortValue: (r) => r.revenue, cell: (r) => money(r.revenue) },
  ];

  return (
    <div className="space-y-4">
      <StatGrid cols={4}>
        <Stat label="Vendido" value={kg(Math.round(totals.kg))} icon={sm && <ShoppingCart className="size-4" />} hint={`${integer(bySale.length)} pedidos`} />
        <Stat label="Receita realizada" value={<StatMoney value={totals.revenue} />} tone="success" hint={totals.kg ? `${money(totals.revenue / totals.kg)}/kg médio` : undefined} />
        <Stat label="Clientes" value={integer(customers)} tone="info" />
        <Stat label="Estoque restante" value={kg(Math.round(remaining))} tone="accent" hint={remaining <= 0.0005 ? 'todo o estoque foi vendido' : e.remainingValue ? `≈ ${money(e.remainingValue)}` : 'sem preço de referência'} />
      </StatGrid>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card padded={false} className="min-w-0">
          <div className="p-4 sm:p-5 pb-0 sm:pb-0">
            <CardHeader title="Cortes vendidos" subtitle={showCost ? `Margem bruta sobre o custo do estoque: ${money(totals.revenue - totals.cost)}` : undefined} />
          </div>
          <DataTable bare dense columns={productCols} rows={products} rowKey={(r) => r.productId} initialSort={{ key: 'rev', dir: 'desc' }} />
        </Card>
        <Card className="min-w-0">
          <CardHeader title="Receita por corte" />
          <RankBars items={products.slice(0, 8).map((p) => ({ label: p.productName, value: Math.round(p.revenue * 100) / 100, hint: `${kg(Math.round(p.kg))}` }))} format={money} />
        </Card>
      </div>

      <Card padded={false}>
        <div className="p-4 sm:p-5 pb-0 sm:pb-0">
          <CardHeader title="Pedidos com cortes deste lote" subtitle="Receita apenas dos itens baixados de lotes de estoque deste lote de gado" />
        </div>
        <DataTable bare dense columns={saleCols} rows={bySale} rowKey={(r) => r.key} initialSort={{ key: 'date', dir: 'desc' }} />
      </Card>
    </div>
  );
}
