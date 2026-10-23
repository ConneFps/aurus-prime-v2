/**
 * Consumo de ração do lote.
 */
import { Plus, Trash2, Wheat } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOps, useSession } from '../../../app/session';
import { useAction } from '../../../data/react';
import { date, kg, money, number } from '../../../domain/format';
import type { Batch, FeedConsumption } from '../../../domain/types';
import { Badge, Button, Card, DataTable, EmptyState, Menu, Stat, StatGrid, Toolbar, useConfirm, type Column } from '../../../ui';
import { FeedConsumptionDrawer, PERIOD_LABELS } from '../FeedForms';
import { daysOnFeed, isActiveBatch } from '../helpers';
import { StatMoney, useSmUp } from '../Money';

export function FeedTab({ batch, feed, heads }: { batch: Batch; feed: FeedConsumption[]; heads: number }) {
  const ops = useOps();
  const { can } = useSession();
  const confirm = useConfirm();
  const sm = useSmUp();
  const canEdit = can('cattle.manage');
  const [open, setOpen] = useState(false);
  const days = daysOnFeed(batch) || 0;

  const t = useMemo(() => {
    const kgSum = feed.reduce((s, f) => s + f.quantityKg, 0);
    const cost = feed.reduce((s, f) => s + f.cost, 0);
    const types = new Map<string, { kg: number; cost: number }>();
    feed.forEach((f) => {
      const c = types.get(f.feedTypeName) || { kg: 0, cost: 0 };
      c.kg += f.quantityKg;
      c.cost += f.cost;
      types.set(f.feedTypeName, c);
    });
    return { kg: kgSum, cost, types };
  }, [feed]);

  const removeOp = useAction((f: FeedConsumption) => ops.removeFeedConsumption(f.id), { success: 'Consumo removido e saldo devolvido' });
  const remove = async (f: FeedConsumption) => {
    if (await confirm({ title: `Remover consumo de ${kg(f.quantityKg)}?`, message: 'O saldo volta para a compra de ração e o custo sai do lote.', danger: true, confirmLabel: 'Remover' }))
      await removeOp.run(f);
  };

  const columns: Column<FeedConsumption>[] = [
    { key: 'date', header: 'Data', sortValue: (f) => f.date, cell: (f) => <span className="num">{date(f.date)}</span> },
    { key: 'type', header: 'Ração', mobile: 'title', sortValue: (f) => f.feedTypeName, cell: (f) => f.feedTypeName },
    { key: 'period', header: 'Período', mobile: 'subtitle', cell: (f) => <Badge size="xs">{PERIOD_LABELS[f.period]}</Badge> },
    { key: 'qty', header: 'Quantidade', align: 'right', sortValue: (f) => f.quantityKg, cell: (f) => kg(f.quantityKg) },
    { key: 'cost', header: 'Custo', align: 'right', mobile: 'badge', sortValue: (f) => f.cost, cell: (f) => money(f.cost) },
    { key: 'by', header: 'Lançado por', hideBelow: 'lg', cell: (f) => f.createdByName || '—' },
  ];

  if (!feed.length)
    return (
      <Card>
        <EmptyState
          icon={<Wheat className="size-5" />}
          title="Nenhum consumo de ração"
          description="Registre a baixa semanal ou mensal da ração consumida por este lote — o custo entra automaticamente."
          action={
            canEdit && isActiveBatch(batch) ? (
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>
                Registrar consumo
              </Button>
            ) : undefined
          }
        />
        <FeedConsumptionDrawer open={open} onClose={() => setOpen(false)} batchId={batch.id} />
      </Card>
    );

  return (
    <>
      <StatGrid cols={4} className="mb-4">
        <Stat label="Ração consumida" value={kg(Math.round(t.kg))} icon={sm && <Wheat className="size-4" />} hint={`${feed.length} baixas`} />
        <Stat label="Custo de ração" value={<StatMoney value={t.cost} />} tone="accent" hint={t.kg ? `${money(t.cost / t.kg)}/kg médio` : undefined} />
        <Stat label="Por cabeça" value={kg(Math.round((t.kg / (heads || 1)) * 10) / 10)} tone="info" hint={money(t.cost / (heads || 1))} />
        <Stat label="kg/cab/dia" value={days && heads ? number(t.kg / heads / days, 2) : '—'} tone="success" hint={`${days} dias no lote`} />
      </StatGrid>

      <Toolbar>
        <div className="flex flex-wrap gap-2 text-xs text-muted">
          {[...t.types].map(([name, v]) => (
            <Badge key={name}>
              {name}: {kg(Math.round(v.kg))} · {money(v.cost)}
            </Badge>
          ))}
        </div>
        <div className="flex gap-2 lg:ml-auto">
          <Link to="/gado/racao" className="text-sm text-primary hover:underline self-center">
            Estoque de ração
          </Link>
          {canEdit && isActiveBatch(batch) && (
            <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>
              Registrar consumo
            </Button>
          )}
        </div>
      </Toolbar>

      <DataTable
        columns={columns}
        rows={feed}
        rowKey={(f) => f.id}
        initialSort={{ key: 'date', dir: 'desc' }}
        footer={
          <tr>
            <td className="px-3 first:pl-4 py-2.5 text-sm" colSpan={3}>
              Total
            </td>
            <td className="px-3 py-2.5 text-sm text-right num">{kg(Math.round(t.kg * 1000) / 1000)}</td>
            <td className="px-3 py-2.5 text-sm text-right num">{money(t.cost)}</td>
            <td className="hidden lg:table-cell" />
            {canEdit && <td />}
          </tr>
        }
        rowActions={canEdit ? (f) => <Menu items={[{ label: 'Remover consumo', icon: <Trash2 />, danger: true, onClick: () => void remove(f) }]} /> : undefined}
      />
      <FeedConsumptionDrawer open={open} onClose={() => setOpen(false)} batchId={batch.id} />
    </>
  );
}
