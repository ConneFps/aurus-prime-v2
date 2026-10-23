/**
 * Conciliação: pedidos separados sem baixa (ou com baixa parcial) e
 * comparação por produto de "vendido (itens)" × "baixado (movimentos SALE)".
 */
import { AlertTriangle, CheckCircle2, PackageSearch, Scale } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../app/session';
import { useTable } from '../../data/react';
import { addDays, date, kg, qty as fmtQty, round3, today } from '../../domain/format';
import { SALE_STATUS } from '../../domain/labels';
import type { Sale, StockLot, StockMovement } from '../../domain/types';
import { Badge, Callout, Card, CardHeader, DataTable, DateInput, Field, Stat, StatGrid, StatusBadge, Switch, type Column } from '../../ui';
import { saleLink } from './MovementsLedger';
import { EPS, lotsForProduct, saleOrigin } from './model';

interface PendingRow {
  sale: Sale;
  sold: number;
  deducted: number;
  missing: number;
  coverable: boolean;
  products: string[];
}

interface ProductRow {
  productId: string;
  name: string;
  unit: 'KG' | 'UN';
  sold: number;
  deducted: number;
  diff: number;
  sales: number;
}

export function ReconciliationTab({ movements, lots }: { movements: StockMovement[]; lots: StockLot[] }) {
  const { can } = useSession();
  const { rows: sales, loading } = useTable('sales', { where: [['status', 'in', ['READY', 'DISPATCHED', 'DELIVERED']]] });
  const [from, setFrom] = useState(addDays(today(), -90));
  const [to, setTo] = useState('');
  const [onlyDiff, setOnlyDiff] = useState(true);

  const data = useMemo(() => {
    const inPeriod = sales.filter((s) => (!from || s.date >= from) && (!to || s.date <= to));
    const ids = new Set(inPeriod.map((s) => s.id));
    // baixado por venda/item e por produto (líquido de estornos)
    const byItem = new Map<string, number>();
    const byProduct = new Map<string, number>();
    for (const m of movements) {
      if (!m.saleId || !ids.has(m.saleId) || (m.type !== 'SALE' && m.type !== 'SALE_REVERSAL')) continue;
      if (m.saleItemId) byItem.set(m.saleItemId, (byItem.get(m.saleItemId) || 0) - m.qty);
      byProduct.set(m.productId, (byProduct.get(m.productId) || 0) - m.qty);
    }
    const products = new Map<string, ProductRow>();
    const pending: PendingRow[] = [];
    for (const s of inPeriod) {
      let sold = 0;
      let deducted = 0;
      const missingProducts: { productId: string; qty: number; name: string }[] = [];
      const seen = new Set<string>();
      for (const it of s.items || []) {
        if (it.kind !== 'PRODUCT' || !it.productId || !(it.qty > 0)) continue;
        const d = byItem.get(it.id) || 0;
        if (it.unit === 'KG') {
          sold += it.qty;
          deducted += d;
        }
        if (it.qty - d > EPS) missingProducts.push({ productId: it.productId, qty: it.qty - d, name: it.productName });
        const p = products.get(it.productId) || { productId: it.productId, name: it.productName, unit: it.unit, sold: 0, deducted: 0, diff: 0, sales: 0 };
        p.sold += it.qty;
        if (!seen.has(it.productId)) {
          p.sales++;
          seen.add(it.productId);
        }
        products.set(it.productId, p);
      }
      const missing = round3(sold - deducted);
      if (!s.stockDeducted || (s.stockShortKg || 0) > EPS || missingProducts.length > 0) {
        const origin = saleOrigin(s);
        const coverable =
          missingProducts.length > 0 &&
          missingProducts.every((mp) => lotsForProduct(lots, mp.productId, origin).reduce((a, l) => a + l.balanceQty, 0) + EPS >= mp.qty);
        pending.push({ sale: s, sold: round3(sold), deducted: round3(deducted), missing: Math.max(0, missing), coverable, products: missingProducts.map((m) => m.name) });
      }
    }
    for (const [pid, d] of byProduct) {
      const p = products.get(pid);
      if (p) p.deducted = d;
      else {
        const m = movements.find((x) => x.productId === pid);
        products.set(pid, { productId: pid, name: m?.productName || 'Produto', unit: 'KG', sold: 0, deducted: d, diff: 0, sales: 0 });
      }
    }
    const productRows = [...products.values()].map((p) => ({ ...p, sold: round3(p.sold), deducted: round3(p.deducted), diff: round3(p.sold - p.deducted) }));
    return { inPeriod, pending, productRows };
  }, [sales, movements, lots, from, to]);

  const divergent = data.productRows.filter((p) => Math.abs(p.diff) > EPS);
  const shownProducts = onlyDiff ? divergent : data.productRows;
  const pendingKg = data.pending.reduce((s, p) => s + p.missing, 0);
  const okPct = data.inPeriod.length ? ((data.inPeriod.length - data.pending.length) / data.inPeriod.length) * 100 : 100;

  const pendingCols: Column<PendingRow>[] = [
    {
      key: 'sale',
      header: 'Pedido',
      mobile: 'title',
      sortValue: (r) => r.sale.number,
      cell: (r) => {
        const to = saleLink(can, r.sale.id);
        return (
          <div className="min-w-0">
            {to ? (
              <Link to={to} className="font-medium text-primary hover:underline num">
                #{r.sale.number}
              </Link>
            ) : (
              <span className="font-medium num">#{r.sale.number}</span>
            )}
            <div className="text-xs text-muted truncate">{r.sale.customerName}</div>
          </div>
        );
      },
    },
    { key: 'date', header: 'Data', sortValue: (r) => r.sale.date, cell: (r) => <span className="num">{date(r.sale.date)}</span> },
    { key: 'status', header: 'Status', mobile: 'badge', cell: (r) => <StatusBadge info={SALE_STATUS[r.sale.status]} /> },
    { key: 'sold', header: 'Vendido', align: 'right', sortValue: (r) => r.sold, cell: (r) => kg(r.sold) },
    { key: 'ded', header: 'Baixado', align: 'right', sortValue: (r) => r.deducted, cell: (r) => kg(r.deducted) },
    { key: 'miss', header: 'Pendente', align: 'right', sortValue: (r) => r.missing, cell: (r) => <span className="text-danger font-semibold">{kg(r.missing)}</span> },
    {
      key: 'products',
      header: 'Cortes sem baixa',
      mobile: 'subtitle',
      hideBelow: 'lg',
      cell: (r) => <span className="text-xs text-muted line-clamp-2">{r.products.join(', ') || (r.sale.stockDeducted ? '—' : 'Baixa não realizada')}</span>,
    },
    {
      key: 'cover',
      header: 'Estoque hoje',
      cell: (r) =>
        r.coverable ? (
          <Badge tone="success" size="xs">
            Há saldo p/ baixar
          </Badge>
        ) : (
          <Badge tone="warning" size="xs">
            Sem saldo suficiente
          </Badge>
        ),
    },
  ];

  const productCols: Column<ProductRow>[] = [
    { key: 'name', header: 'Produto', mobile: 'title', sortValue: (p) => p.name, cell: (p) => <span className="font-medium text-fg">{p.name}</span> },
    { key: 'sales', header: 'Pedidos', align: 'right', hideBelow: 'md', sortValue: (p) => p.sales, cell: (p) => p.sales },
    { key: 'sold', header: 'Vendido (itens)', align: 'right', sortValue: (p) => p.sold, cell: (p) => fmtQty(p.sold, p.unit) },
    { key: 'ded', header: 'Baixado (mov.)', align: 'right', sortValue: (p) => p.deducted, cell: (p) => fmtQty(p.deducted, p.unit) },
    {
      key: 'diff',
      header: 'Diferença',
      align: 'right',
      mobile: 'badge',
      sortValue: (p) => Math.abs(p.diff),
      cell: (p) =>
        Math.abs(p.diff) <= EPS ? (
          <Badge tone="success" size="xs" dot>
            OK
          </Badge>
        ) : (
          <span className={p.diff > 0 ? 'text-danger font-semibold' : 'text-warning font-semibold'}>
            {p.diff > 0 ? '+' : '−'}
            {fmtQty(Math.abs(p.diff), p.unit)}
          </span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <StatGrid cols={4}>
        <Stat label="Pedidos" value={data.inPeriod.length} hint="separados, expedidos ou entregues" icon={<PackageSearch className="size-4" />} tone="neutral" />
        <Stat
          label="Pendentes"
          value={data.pending.length}
          hint={data.pending.length ? `${kg(pendingKg)} sem baixa` : 'Tudo conciliado'}
          icon={<AlertTriangle className="size-4" />}
          tone={data.pending.length ? 'danger' : 'success'}
        />
        <Stat label="Divergentes" value={divergent.length} hint="produtos" icon={<Scale className="size-4" />} tone={divergent.length ? 'warning' : 'success'} />
        <Stat label="Conciliados" value={`${Math.round(okPct)}%`} hint="dos pedidos do período" icon={<CheckCircle2 className="size-4" />} tone="success" />
      </StatGrid>

      <div className="grid grid-cols-2 sm:flex gap-2 items-end">
        <Field label="Pedidos de">
          <DateInput value={from} onChange={setFrom} />
        </Field>
        <Field label="Até">
          <DateInput value={to} onChange={setTo} />
        </Field>
      </div>

      <Card padded={false}>
        <div className="p-4 sm:p-5 pb-0 sm:pb-0">
          <CardHeader title="Pedidos com baixa pendente ou parcial" subtitle="A separação foi concluída, mas parte do peso não saiu do estoque (faltou saldo no momento da baixa)." />
        </div>
        <DataTable
          bare
          columns={pendingCols}
          rows={data.pending}
          rowKey={(r) => r.sale.id}
          loading={loading}
          dense
          initialSort={{ key: 'date', dir: 'desc' }}
          emptyTitle="Nenhuma pendência"
          emptyDescription="Todos os pedidos do período tiveram a baixa completa."
        />
      </Card>
      {data.pending.some((p) => p.coverable) && (
        <Callout tone="info" title="Há saldo para regularizar algumas pendências">
          Confira se a mercadoria realmente saiu. Para corrigir, registre um ajuste ou perda no lote correspondente (Estoque › lote › Ajustar saldo) informando o
          número do pedido no motivo.
        </Callout>
      )}

      <Card padded={false}>
        <div className="p-4 sm:p-5 pb-0 sm:pb-0">
          <CardHeader title="Vendido × baixado por produto" subtitle="Soma dos itens dos pedidos do período comparada com os movimentos de venda (líquidos de estornos)." className="mb-3" />
          <div className="mb-4 sm:w-56">
            <Switch checked={onlyDiff} onChange={setOnlyDiff} label="Só divergentes" />
          </div>
        </div>
        <DataTable
          bare
          columns={productCols}
          rows={shownProducts}
          rowKey={(p) => p.productId}
          loading={loading}
          dense
          initialSort={{ key: 'diff', dir: 'desc' }}
          emptyTitle={onlyDiff ? 'Nenhuma divergência' : 'Sem vendas no período'}
          emptyDescription={onlyDiff ? 'Tudo o que foi vendido saiu do estoque.' : undefined}
        />
      </Card>
    </div>
  );
}
