/**
 * Perdas de estoque (stock_losses) por origem e motivo.
 */
import { Download, Hash, Scale, TrendingDown, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTable } from '../../data/react';
import { addDays, date, integer, kg, money, moneyCompact, percent, today } from '../../domain/format';
import { LOSS_ORIGIN_LABELS, LOSS_REASON_LABELS, optionsOf } from '../../domain/labels';
import type { LossOrigin, LossReason, StockLoss } from '../../domain/types';
import { Badge, Button, Card, CardHeader, DataTable, DateInput, exportCsv, Field, RankBars, Segmented, Select, Stat, StatGrid, type Column } from '../../ui';
import type { useLotActions } from './LotActions';
import { FitValue } from './pickingUi';

type Measure = 'VALUE' | 'QTY';

export function LossesTab({ actions }: { actions: ReturnType<typeof useLotActions> }) {
  const { rows: losses, loading } = useTable('stock_losses');
  const [from, setFrom] = useState(addDays(today(), -90));
  const [to, setTo] = useState('');
  const [origin, setOrigin] = useState<LossOrigin | ''>('');
  const [reason, setReason] = useState<LossReason | ''>('');
  const [measure, setMeasure] = useState<Measure>('VALUE');

  const rows = useMemo(
    () =>
      losses
        .filter((l) => (!from || l.date >= from) && (!to || l.date <= to))
        .filter((l) => !origin || l.origin === origin)
        .filter((l) => !reason || l.reason === reason),
    [losses, from, to, origin, reason],
  );

  const agg = useMemo(() => {
    const byReason = new Map<LossReason, { qty: number; value: number; n: number }>();
    const byOrigin = new Map<LossOrigin, { qty: number; value: number; n: number }>();
    let qty = 0;
    let value = 0;
    for (const l of rows) {
      const v = l.totalValue ?? l.qty * (l.unitCost || 0);
      qty += l.qty;
      value += v;
      const r = byReason.get(l.reason) || { qty: 0, value: 0, n: 0 };
      r.qty += l.qty;
      r.value += v;
      r.n++;
      byReason.set(l.reason, r);
      const o = byOrigin.get(l.origin) || { qty: 0, value: 0, n: 0 };
      o.qty += l.qty;
      o.value += v;
      o.n++;
      byOrigin.set(l.origin, o);
    }
    const toItems = <K extends string>(m: Map<K, { qty: number; value: number; n: number }>, labels: Record<K, string>) =>
      [...m]
        .map(([k, v]) => ({ key: k, label: labels[k], value: measure === 'VALUE' ? v.value : v.qty, hint: `${kg(v.qty)} · ${money(v.value)} · ${v.n} registro(s)` }))
        .sort((a, b) => b.value - a.value);
    return { qty, value, reasons: toItems(byReason, LOSS_REASON_LABELS), origins: toItems(byOrigin, LOSS_ORIGIN_LABELS) };
  }, [rows, measure]);

  const fmt = (v: number) => (measure === 'VALUE' ? money(v) : kg(v));
  const top = agg.reasons[0];

  const columns: Column<StockLoss>[] = [
    { key: 'date', header: 'Data', sortValue: (l) => l.date, cell: (l) => <span className="num">{date(l.date)}</span> },
    {
      key: 'product',
      header: 'Produto',
      mobile: 'title',
      sortValue: (l) => l.productName || '',
      cell: (l) => (
        <div className="min-w-0">
          <div className="font-medium text-fg truncate">{l.productName || '—'}</div>
          {(l.processingOrderNumber || l.partnerName) && (
            <div className="text-xs text-muted truncate">{[l.processingOrderNumber, l.partnerName].filter(Boolean).join(' · ')}</div>
          )}
        </div>
      ),
    },
    { key: 'origin', header: 'Origem', mobile: 'subtitle', sortValue: (l) => l.origin, cell: (l) => LOSS_ORIGIN_LABELS[l.origin] },
    { key: 'reason', header: 'Motivo', mobile: 'badge', sortValue: (l) => l.reason, cell: (l) => <Badge tone="danger">{LOSS_REASON_LABELS[l.reason]}</Badge> },
    { key: 'qty', header: 'Qtd.', align: 'right', sortValue: (l) => l.qty, cell: (l) => <span className="whitespace-nowrap">{kg(l.qty)}</span> },
    { key: 'value', header: 'Valor', align: 'right', sortValue: (l) => l.totalValue || 0, cell: (l) => money(l.totalValue ?? l.qty * (l.unitCost || 0)) },
    { key: 'notes', header: 'Observações', hideBelow: 'lg', cell: (l) => <span className="text-xs text-muted line-clamp-2">{l.notes || '—'}</span> },
    { key: 'by', header: 'Registrado por', hideBelow: 'xl', cell: (l) => <span className="text-xs text-muted">{l.registeredBy || '—'}</span> },
  ];

  return (
    <div className="space-y-4">
      <StatGrid cols={4}>
        <Stat label="Perdas" value={`${integer(agg.qty)} kg`} hint="no período" icon={<Scale className="size-4" />} tone="danger" />
        <Stat label="Valor" value={<FitValue>{moneyCompact(agg.value)}</FitValue>} hint={`${money(agg.value)} a custo`} icon={<Wallet className="size-4" />} tone="danger" />
        <Stat label="Registros" value={rows.length} icon={<Hash className="size-4" />} tone="neutral" />
        <Stat
          label="Maior motivo"
          value={top ? top.label : '—'}
          hint={top && agg.value ? `${percent((top.value / (measure === 'VALUE' ? agg.value : agg.qty)) * 100)} do total (${measure === 'VALUE' ? 'R$' : 'kg'})` : undefined}
          icon={<TrendingDown className="size-4" />}
          tone="warning"
        />
      </StatGrid>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 items-end">
        <Field label="De">
          <DateInput value={from} onChange={setFrom} />
        </Field>
        <Field label="Até">
          <DateInput value={to} onChange={setTo} />
        </Field>
        <Field label="Origem">
          <Select value={origin} onChange={setOrigin} options={[{ value: '' as const, label: 'Todas' }, ...optionsOf(LOSS_ORIGIN_LABELS)]} />
        </Field>
        <Field label="Motivo">
          <Select value={reason} onChange={setReason} options={[{ value: '' as const, label: 'Todos' }, ...optionsOf(LOSS_REASON_LABELS)]} />
        </Field>
        <div className="col-span-2 lg:col-span-1 flex gap-2 lg:justify-end">
          <Button
            icon={<Download className="size-4" />}
            onClick={() =>
              exportCsv(`perdas-${today()}`, rows, [
                { header: 'Data', value: (l) => date(l.date) },
                { header: 'Produto', value: (l) => l.productName },
                { header: 'Origem', value: (l) => LOSS_ORIGIN_LABELS[l.origin] },
                { header: 'Motivo', value: (l) => LOSS_REASON_LABELS[l.reason] },
                { header: 'Quantidade (kg)', value: (l) => l.qty },
                { header: 'Custo unitário', value: (l) => l.unitCost },
                { header: 'Valor', value: (l) => l.totalValue },
                { header: 'OS', value: (l) => l.processingOrderNumber },
                { header: 'Parceiro', value: (l) => l.partnerName },
                { header: 'Observações', value: (l) => l.notes },
                { header: 'Registrado por', value: (l) => l.registeredBy },
              ])
            }
          >
            Exportar
          </Button>
          {actions.canManage && (
            <Button variant="primary" icon={<TrendingDown className="size-4" />} onClick={() => actions.registerLoss(null, null)}>
              Registrar
            </Button>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Por motivo"
              actions={
                <Segmented
                  size="sm"
                  value={measure}
                  onChange={setMeasure}
                  options={[
                    { value: 'VALUE', label: 'R$' },
                    { value: 'QTY', label: 'kg' },
                  ]}
                />
              }
            />
            <RankBars items={agg.reasons} format={fmt} />
          </Card>
          <Card>
            <CardHeader title="Por origem" subtitle={measure === 'VALUE' ? 'Valor a custo' : 'Quantidade'} />
            <RankBars items={agg.origins} format={fmt} />
          </Card>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(l) => l.id}
        loading={loading}
        dense
        initialSort={{ key: 'date', dir: 'desc' }}
        emptyTitle="Nenhuma perda no período"
        emptyDescription="Perdas de desossa entram automaticamente; as de estoque são registradas aqui ou no lote."
      />
    </div>
  );
}
