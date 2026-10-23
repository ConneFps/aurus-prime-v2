/**
 * Abate & desossa: dados do abate, estoque gerado e ordens de processamento.
 */
import { Beef, Factory, Package } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../../app/session';
import type { BatchEconomics } from '../../../domain/costs';
import { date, integer, kg, money, number, percent } from '../../../domain/format';
import { STAGE_LABELS, type LabelInfo } from '../../../domain/labels';
import type { Batch, ProcessingOrder, StockLot } from '../../../domain/types';
import { Badge, Button, Card, CardHeader, DataTable, DescriptionList, EmptyState, StatusBadge, type Column } from '../../../ui';
import { isActiveBatch } from '../helpers';

const ORDER_STATUS: Record<ProcessingOrder['status'], LabelInfo> = {
  OPEN: { label: 'Em processamento', tone: 'warning' },
  PARTIAL: { label: 'Retorno parcial', tone: 'info' },
  COMPLETED: { label: 'Concluída', tone: 'success' },
  CANCELLED: { label: 'Cancelada', tone: 'neutral' },
};
const LOT_STATUS: Record<StockLot['status'], LabelInfo> = {
  AVAILABLE: { label: 'Disponível', tone: 'success' },
  DEPLETED: { label: 'Esgotado', tone: 'neutral' },
  BLOCKED: { label: 'Bloqueado', tone: 'danger' },
};

export function SlaughterTab({ batch, econ: e, lots, orders }: { batch: Batch; econ: BatchEconomics; lots: StockLot[]; orders: ProcessingOrder[] }) {
  const nav = useNavigate();
  const { can } = useSession();
  const lotTotals = useMemo(
    () => ({
      initial: lots.filter((l) => l.unit === 'KG').reduce((s, l) => s + l.initialQty, 0),
      balance: lots.filter((l) => l.unit === 'KG' && l.status !== 'DEPLETED').reduce((s, l) => s + l.balanceQty, 0),
      value: lots.filter((l) => l.status !== 'DEPLETED').reduce((s, l) => s + l.balanceQty * l.unitCost, 0),
    }),
    [lots],
  );

  if (!batch.slaughterDate && isActiveBatch(batch))
    return (
      <Card>
        <EmptyState
          icon={<Beef className="size-5" />}
          title="Lote ainda não abatido"
          description="Ao registrar o abate, os animais vivos são baixados, os custos de abate entram no lote e a carcaça vira estoque pós-abate."
          action={
            can('cattle.manage') ? (
              <Button variant="primary" icon={<Beef className="size-4" />} onClick={() => nav(`/producao/abate?lote=${batch.id}`)}>
                Registrar abate
              </Button>
            ) : undefined
          }
        />
      </Card>
    );

  const lotCols: Column<StockLot>[] = [
    {
      key: 'product',
      header: 'Produto',
      mobile: 'title',
      sortValue: (l) => l.productName,
      cell: (l) => (
        <div className="min-w-0">
          <div className="text-fg truncate">{l.productName}</div>
          <div className="text-xs text-muted num">{l.lotCode || '—'}</div>
        </div>
      ),
    },
    { key: 'stage', header: 'Etapa', mobile: 'subtitle', sortValue: (l) => l.stage, cell: (l) => <Badge size="xs" tone={l.stage === 'RAW' ? 'warning' : 'primary'}>{STAGE_LABELS[l.stage]}</Badge> },
    { key: 'entry', header: 'Entrada', hideBelow: 'md', sortValue: (l) => l.entryDate, cell: (l) => <span className="num">{date(l.entryDate)}</span> },
    { key: 'initial', header: 'Inicial', align: 'right', sortValue: (l) => l.initialQty, cell: (l) => (l.unit === 'KG' ? kg(l.initialQty) : `${l.initialQty} un`) },
    { key: 'balance', header: 'Saldo', align: 'right', sortValue: (l) => l.balanceQty, cell: (l) => (l.unit === 'KG' ? kg(l.balanceQty) : `${l.balanceQty} un`) },
    { key: 'cost', header: 'Custo/kg', align: 'right', hideBelow: 'lg', sortValue: (l) => l.unitCost, cell: (l) => money(l.unitCost) },
    { key: 'status', header: 'Situação', mobile: 'badge', cell: (l) => <StatusBadge info={LOT_STATUS[l.status]} /> },
  ];
  const orderCols: Column<ProcessingOrder>[] = [
    { key: 'number', header: 'Ordem', mobile: 'title', sortValue: (o) => o.number, cell: (o) => <span className="font-medium num">{o.number}</span> },
    { key: 'partner', header: 'Desossa', mobile: 'subtitle', cell: (o) => o.partnerName },
    { key: 'sent', header: 'Envio', hideBelow: 'md', sortValue: (o) => o.sentDate, cell: (o) => <span className="num">{date(o.sentDate)}</span> },
    { key: 'sentKg', header: 'Enviado', align: 'right', sortValue: (o) => o.sentKg, cell: (o) => kg(o.sentKg) },
    { key: 'ret', header: 'Retornado', align: 'right', sortValue: (o) => o.returnedKg, cell: (o) => kg(o.returnedKg) },
    { key: 'loss', header: 'Perdas', align: 'right', hideBelow: 'lg', sortValue: (o) => o.lossKg, cell: (o) => kg(o.lossKg) },
    {
      key: 'yield',
      header: 'Rendimento',
      align: 'right',
      sortValue: (o) => o.yieldPercent ?? (o.sentKg ? o.returnedKg / o.sentKg : 0),
      cell: (o) => (o.yieldPercent ? percent(o.yieldPercent) : o.sentKg && o.returnedKg ? percent((o.returnedKg / o.sentKg) * 100) : '—'),
    },
    { key: 'status', header: 'Situação', mobile: 'badge', cell: (o) => <StatusBadge info={ORDER_STATUS[o.status]} /> },
  ];

  const sent = orders.filter((o) => o.status !== 'CANCELLED').reduce((s, o) => s + o.sentKg, 0);
  const returned = orders.filter((o) => o.status !== 'CANCELLED').reduce((s, o) => s + o.returnedKg, 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Abate" icon={<Beef className="size-4" />} subtitle={batch.slaughterhouseName || undefined} />
        <DescriptionList
          cols={4}
          items={[
            { label: 'Data do abate', value: date(batch.slaughterDate) },
            { label: 'Frigorífico', value: batch.slaughterhouseName || '—' },
            { label: 'Peso de saída (balança)', value: <span className="num">{batch.exitScaleWeightKg ? kg(batch.exitScaleWeightKg) : '—'}</span> },
            { label: 'Carcaça total', value: <span className="num">{e.carcassWeightKg ? kg(e.carcassWeightKg) : '—'}</span> },
            { label: 'Rendimento de carcaça', value: <span className="num">{e.carcassYieldPercent ? percent(e.carcassYieldPercent) : '—'}</span> },
            { label: 'Perda no transporte', value: <span className="num">{batch.transportLossPercent ? percent(batch.transportLossPercent) : '—'}</span> },
            { label: '@ produzidas', value: <span className="num">{e.carcassWeightKg ? number(e.carcassWeightKg / 15, 1) : '—'}</span> },
            { label: 'Carcaça média/cab', value: <span className="num">{e.carcassWeightKg && e.headCount ? kg(Math.round((e.carcassWeightKg / e.headCount) * 10) / 10) : '—'}</span> },
          ]}
        />
      </Card>

      <Card padded={false}>
        <div className="p-4 sm:p-5 pb-0 sm:pb-0">
          <CardHeader
            title="Ordens de desossa"
            icon={<Factory className="size-4" />}
            subtitle={orders.length ? `${kg(Math.round(sent))} enviados · ${kg(Math.round(returned))} retornados${sent ? ` · rendimento ${percent((returned / sent) * 100)}` : ''}` : undefined}
          />
        </div>
        <DataTable
          bare
          columns={orderCols}
          rows={orders}
          rowKey={(o) => o.id}
          onRowClick={(o) => nav(`/producao/processamento/${o.id}`)}
          initialSort={{ key: 'sent', dir: 'asc' }}
          emptyTitle="Nenhuma ordem de desossa"
          emptyDescription="Envie a carcaça para desossa na tela de Processamento."
          dense
        />
      </Card>
      <Card padded={false}>
        <div className="p-4 sm:p-5 pb-0 sm:pb-0">
          <CardHeader
            title="Estoque gerado"
            icon={<Package className="size-4" />}
            subtitle={lots.length ? `${integer(lots.length)} lotes · ${kg(Math.round(lotTotals.initial))} de entrada · saldo ${kg(Math.round(lotTotals.balance))} (${money(lotTotals.value)})` : undefined}
          />
        </div>
        <DataTable bare columns={lotCols} rows={lots} rowKey={(l) => l.id} initialSort={{ key: 'entry', dir: 'asc' }} emptyTitle="Nenhum lote de estoque vinculado" dense />
      </Card>

    </div>
  );
}
