/**
 * Ledger de movimentações de estoque (stock_movements) com filtros e totais.
 */
import { ArrowDownLeft, ArrowUpRight, Download, ShoppingCart, TrendingDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../app/session';
import { useTable } from '../../data/react';
import { addDays, date, integer, matchesSearch, money, qty as fmtQty, today } from '../../domain/format';
import { MOVEMENT_LABELS, optionsOf, STAGE_LABELS } from '../../domain/labels';
import type { MovementType, StockMovement, StockStage } from '../../domain/types';
import { Button, Combobox, DataTable, DateInput, exportCsv, Field, SearchInput, Select, Stat, StatGrid, StatusBadge, type Column } from '../../ui';
import { useBatchOptions, useProductOptions } from '../common/lookups';

export interface LedgerFilters {
  productId: string | null;
  batchId: string | null;
  sale: string;
}

export function saleLink(can: (p: 'view.commercial' | 'picking.perform') => boolean, saleId: string) {
  if (can('view.commercial')) return `/vendas/${saleId}`;
  if (can('picking.perform')) return `/estoque/separacao/${saleId}`;
  return null;
}

export function MovementsLedger({ movements, loading, initial }: { movements: StockMovement[]; loading: boolean; initial: LedgerFilters }) {
  const { can } = useSession();
  const [from, setFrom] = useState(initial.sale || initial.batchId ? '' : addDays(today(), -30));
  const [to, setTo] = useState('');
  const [type, setType] = useState<MovementType | ''>('');
  const [stage, setStage] = useState<StockStage | ''>('FINISHED');
  const [productId, setProductId] = useState<string | null>(initial.productId);
  const [batchId, setBatchId] = useState<string | null>(initial.batchId);
  const [q, setQ] = useState(initial.sale);
  const { options: productOptions } = useProductOptions();
  const { options: batchOptions, batches } = useBatchOptions();
  const { rows: lots } = useTable('stock_lots');
  const lotCode = useMemo(() => new Map(lots.map((l) => [l.id, l.lotCode || l.batchCode || ''])), [lots]);
  const lotUnit = useMemo(() => new Map(lots.map((l) => [l.id, l.unit])), [lots]);
  const unitOf = (m: StockMovement) => lotUnit.get(m.lotId) || 'KG';
  const batchCode = useMemo(() => new Map(batches.map((b) => [b.id, b.code])), [batches]);

  const rows = useMemo(
    () =>
      movements
        .filter((m) => (!from || m.date >= from) && (!to || m.date <= to))
        .filter((m) => !type || m.type === type)
        .filter((m) => !stage || m.stage === stage)
        .filter((m) => !productId || m.productId === productId)
        .filter((m) => !batchId || m.batchId === batchId)
        .filter((m) => !q || m.saleId === q || matchesSearch([m.saleNumber, m.customerName, m.reason, m.productName, m.userName, lotCode.get(m.lotId)], q)),
    [movements, from, to, type, stage, productId, batchId, q, lotCode],
  );

  const totals = useMemo(() => {
    let inQty = 0;
    let inVal = 0;
    let outQty = 0;
    let outVal = 0;
    let saleQty = 0;
    let revenue = 0;
    let lossQty = 0;
    let lossVal = 0;
    for (const m of rows) {
      const v = Math.abs(m.qty) * (m.unitCost || 0);
      if (unitOf(m) !== 'KG') {
        if (m.qty > 0) inVal += v;
        else outVal += v;
        if (m.type === 'SALE' || m.type === 'SALE_REVERSAL') revenue -= m.qty * (m.unitPrice || 0);
        if (m.type === 'LOSS') lossVal += v;
        continue;
      }
      if (m.qty > 0) {
        inQty += m.qty;
        inVal += v;
      } else {
        outQty += -m.qty;
        outVal += v;
      }
      if (m.type === 'SALE' || m.type === 'SALE_REVERSAL') {
        saleQty -= m.qty;
        revenue -= m.qty * (m.unitPrice || 0);
      }
      if (m.type === 'LOSS') {
        lossQty -= m.qty;
        lossVal += v;
      }
    }
    return { inQty, inVal, outQty, outVal, saleQty, revenue, lossQty, lossVal };
  }, [rows, lotUnit]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns: Column<StockMovement>[] = [
    { key: 'date', header: 'Data', sortValue: (m) => `${m.date}${m.createdAt}`, cell: (m) => <span className="num">{date(m.date)}</span> },
    { key: 'type', header: 'Tipo', mobile: 'badge', sortValue: (m) => m.type, cell: (m) => <StatusBadge info={MOVEMENT_LABELS[m.type]} /> },
    {
      key: 'product',
      header: 'Produto',
      mobile: 'title',
      sortValue: (m) => m.productName,
      cell: (m) => (
        <div className="min-w-0">
          <div className="font-medium text-fg truncate">{m.productName}</div>
          <div className="text-xs text-muted truncate num">
            {lotCode.get(m.lotId) || 'lote'}
            {m.stage === 'RAW' ? ' · pós-abate' : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'qty',
      header: 'Qtd.',
      align: 'right',
      sortValue: (m) => m.qty,
      cell: (m) => (
        <span className={m.qty > 0 ? 'text-success font-medium whitespace-nowrap' : 'text-fg font-medium whitespace-nowrap'}>
          {m.qty > 0 ? '+' : '−'}
          {fmtQty(Math.abs(m.qty), unitOf(m))}
        </span>
      ),
    },
    { key: 'cost', header: 'Valor a custo', align: 'right', hideBelow: 'md', sortValue: (m) => Math.abs(m.qty) * m.unitCost, cell: (m) => money(Math.abs(m.qty) * m.unitCost) },
    {
      key: 'ref',
      header: 'Referência',
      mobile: 'subtitle',
      cell: (m) => {
        if (m.saleId) {
          const to = saleLink(can, m.saleId);
          const label = `Pedido ${m.saleNumber || ''}${m.customerName ? ` · ${m.customerName}` : ''}`;
          return to ? (
            <Link to={to} className="text-primary hover:underline truncate" onClick={(e) => e.stopPropagation()}>
              {label}
            </Link>
          ) : (
            label
          );
        }
        if (m.batchId && batchCode.get(m.batchId)) return <span className="num">Lote de gado {batchCode.get(m.batchId)}</span>;
        return <span className="text-subtle">—</span>;
      },
    },
    { key: 'reason', header: 'Motivo', hideBelow: 'lg', cell: (m) => <span className="text-muted text-xs line-clamp-2">{m.reason || '—'}</span> },
    { key: 'user', header: 'Usuário', hideBelow: 'xl', sortValue: (m) => m.userName || '', cell: (m) => <span className="text-xs text-muted whitespace-nowrap">{m.userName || '—'}</span> },
  ];

  const clear = () => {
    setFrom(addDays(today(), -30));
    setTo('');
    setType('');
    setStage('FINISHED');
    setProductId(null);
    setBatchId(null);
    setQ('');
  };

  return (
    <div className="space-y-4">
      <StatGrid cols={4}>
        <Stat label="Entradas" value={`${integer(totals.inQty)} kg`} hint={money(totals.inVal)} icon={<ArrowDownLeft className="size-4" />} tone="success" />
        <Stat label="Saídas" value={`${integer(totals.outQty)} kg`} hint={money(totals.outVal)} icon={<ArrowUpRight className="size-4" />} tone="warning" />
        <Stat label="Vendido" value={`${integer(totals.saleQty)} kg`} hint={`Receita ${money(totals.revenue)}`} icon={<ShoppingCart className="size-4" />} />
        <Stat label="Perdas" value={`${integer(totals.lossQty)} kg`} hint={money(totals.lossVal)} icon={<TrendingDown className="size-4" />} tone={totals.lossQty ? 'danger' : 'neutral'} />
      </StatGrid>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 items-end">
        <Field label="De">
          <DateInput value={from} onChange={setFrom} />
        </Field>
        <Field label="Até">
          <DateInput value={to} onChange={setTo} />
        </Field>
        <Field label="Tipo">
          <Select value={type} onChange={setType} options={[{ value: '' as const, label: 'Todos' }, ...optionsOf(MOVEMENT_LABELS)]} />
        </Field>
        <Field label="Estoque">
          <Select value={stage} onChange={setStage} options={[{ value: '' as const, label: 'Todos' }, ...optionsOf(STAGE_LABELS)]} />
        </Field>
        <Field label="Produto" className="col-span-2 lg:col-span-1">
          <Combobox value={productId} onChange={setProductId} options={productOptions} allowClear placeholder="Todos" />
        </Field>
        <Field label="Lote de gado" className="col-span-2 lg:col-span-1">
          <Combobox value={batchId} onChange={setBatchId} options={batchOptions} allowClear placeholder="Todos" />
        </Field>
      </div>
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="Nº do pedido, cliente, motivo, lote…" className="sm:w-80" />
        <div className="flex gap-2 sm:ml-auto">
          <Button variant="ghost" onClick={clear}>
            Limpar filtros
          </Button>
          <Button
            icon={<Download className="size-4" />}
            onClick={() =>
              exportCsv(`movimentacoes-${today()}`, rows, [
                { header: 'Data', value: (m) => date(m.date) },
                { header: 'Tipo', value: (m) => MOVEMENT_LABELS[m.type].label },
                { header: 'Estoque', value: (m) => STAGE_LABELS[m.stage] },
                { header: 'Produto', value: (m) => m.productName },
                { header: 'Lote', value: (m) => lotCode.get(m.lotId) },
                { header: 'Quantidade', value: (m) => m.qty },
                { header: 'Custo unitário', value: (m) => m.unitCost },
                { header: 'Valor a custo', value: (m) => Math.round(m.qty * m.unitCost * 100) / 100 },
                { header: 'Preço de venda', value: (m) => m.unitPrice },
                { header: 'Pedido', value: (m) => m.saleNumber },
                { header: 'Cliente', value: (m) => m.customerName },
                { header: 'Lote de gado', value: (m) => (m.batchId ? batchCode.get(m.batchId) : '') },
                { header: 'Motivo', value: (m) => m.reason },
                { header: 'Usuário', value: (m) => m.userName },
              ])
            }
          >
            Exportar
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(m) => m.id}
        loading={loading}
        dense
        pageSize={50}
        initialSort={{ key: 'date', dir: 'desc' }}
        emptyTitle="Nenhuma movimentação no filtro"
        emptyDescription="Amplie o período ou limpe os filtros."
      />
      <p className="text-xs text-subtle">
        {rows.length} movimentações · totais em kg (itens por unidade entram só nos valores) · saldo do período{' '}
        <span className="num">
          {totals.inQty - totals.outQty >= 0 ? '+' : '−'}
          {fmtQty(Math.abs(totals.inQty - totals.outQty), 'KG')}
        </span>
      </p>
    </div>
  );
}
