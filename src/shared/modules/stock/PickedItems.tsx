/**
 * Itens já separados (somente leitura): pedido × separado, lotes baixados e totais.
 */
import type { ReactNode } from 'react';
import { money, percent, qty as fmtQty } from '../../domain/format';
import type { Sale } from '../../domain/types';
import { Badge, Card, CardHeader, cn } from '../../ui';
import type { LotUse } from './romaneioPdf';

export function PickedItems({ sale, used }: { sale: Sale; used: Map<string, LotUse[]> }) {
  const items = [...(sale.items || [])].sort((a, b) => (a.position || 0) - (b.position || 0));
  const estimated = sale.estimatedTotal ?? sale.totalValue;
  const diff = sale.totalValue - estimated;
  return (
    <Card padded={false}>
      <div className="p-4 sm:p-5 pb-0 sm:pb-0">
        <CardHeader
          title="Itens separados"
          subtitle={`${sale.pickedByName ? `Por ${sale.pickedByName}` : 'Pesagem registrada'}`}
          actions={
            sale.stockShortKg ? (
              <Badge tone="danger">Baixa parcial: faltou {fmtQty(sale.stockShortKg, 'KG')}</Badge>
            ) : sale.stockDeducted ? (
              <Badge tone="success" dot>
                Estoque baixado
              </Badge>
            ) : undefined
          }
        />
      </div>
      <ul className="divide-y divide-border border-t border-border">
        {items.map((it) => {
          const d = it.qty - it.qtyOrdered;
          const pct = it.qtyOrdered ? (d / it.qtyOrdered) * 100 : 0;
          const lots = used.get(it.id) || [];
          const short = it.kind === 'PRODUCT' && it.qty > 0 && (it.deductedQty ?? 0) + 0.0005 < it.qty;
          return (
            <li key={it.id} className="px-4 sm:px-5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-fg">{it.productName}</div>
                  <div className="text-xs text-muted num">
                    Pedido {fmtQty(it.qtyOrdered, it.unit)} · {money(it.unitPrice)}/{it.unit === 'KG' ? 'kg' : 'un'}
                    {it.packages ? ` · ${it.packages} pct` : ''}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-semibold text-fg num">{fmtQty(it.qty, it.unit)}</div>
                  <div className="text-xs num text-muted">{money(it.total)}</div>
                </div>
              </div>
              <div className="mt-1 flex items-center gap-1.5 flex-wrap text-xs">
                {Math.abs(d) > 0.0005 && (
                  <span className={cn('num', Math.abs(pct) > 10 ? 'text-warning' : 'text-muted')}>
                    {d > 0 ? '+' : ''}
                    {fmtQty(d, it.unit)} ({d > 0 ? '+' : ''}
                    {percent(pct)})
                  </span>
                )}
                {lots.map((u) => (
                  <Badge key={u.lotId} size="xs">
                    {u.lot?.lotCode || u.lot?.batchCode || 'lote'} · {fmtQty(u.qty, it.unit)}
                  </Badge>
                ))}
                {short && (
                  <Badge tone="danger" size="xs">
                    sem baixa de {fmtQty(it.qty - (it.deductedQty || 0), it.unit)}
                  </Badge>
                )}
              </div>
              {it.notes && <div className="text-xs text-warning mt-1">Obs.: {it.notes}</div>}
            </li>
          );
        })}
      </ul>
      <dl className="border-t border-border px-4 sm:px-5 py-3 space-y-1 text-sm">
        {sale.freightValue > 0 && <Row label="Frete" value={money(sale.freightValue)} />}
        {sale.discountValue > 0 && <Row label="Desconto" value={`− ${money(sale.discountValue)}`} />}
        <Row label="Estimado no pedido" value={money(estimated)} muted />
        <Row
          label="Total final"
          value={
            <span>
              {money(sale.totalValue)}
              {Math.abs(diff) >= 0.01 && (
                <span className={cn('ml-2 text-xs', diff > 0 ? 'text-warning' : 'text-success')}>
                  ({diff > 0 ? '+' : '−'}
                  {money(Math.abs(diff))})
                </span>
              )}
            </span>
          }
          strong
        />
        <Row label="Peso total" value={fmtQty(sale.totalWeightKg, 'KG')} muted />
      </dl>
    </Card>
  );
}

function Row({ label, value, muted, strong }: { label: string; value: ReactNode; muted?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={muted ? 'text-muted' : 'text-fg'}>{label}</dt>
      <dd className={cn('num', strong ? 'font-semibold text-fg text-base' : muted ? 'text-muted' : 'text-fg')}>{value}</dd>
    </div>
  );
}
