/**
 * Detalhe da ordem de desossa: dados, itens enviados, composição do peso,
 * linha do tempo de retornos, cortes gerados, romaneio e cancelamento.
 */
import { Ban, FileText, PackageCheck, Scale, Scissors, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useOps, useSession } from '../../app/session';
import { useSettings } from '../../app/settings';
import { useAction, useRow, useTable } from '../../data/react';
import { date, dateTime, formatPhone, kg, money, moneyCompact, percent } from '../../domain/format';
import type { ProcessingReturnEvent } from '../../domain/types';
import {
  Badge,
  Button,
  Callout,
  Card,
  CardHeader,
  DataTable,
  DescriptionList,
  EmptyState,
  PageHeader,
  PageLoader,
  Stat,
  StatGrid,
  StatusBadge,
  Timeline,
  toneText,
  usePrompt,
  type Column,
} from '../../ui';
import { ProcessingReturnDrawer } from './ProcessingReturnDrawer';
import { printRomaneio } from './romaneio';
import { NUM_COL, CompositionBar, deboningYieldTone, isOpenOrder, orderCostPerKg, overdueDays, pendingKg, PROCESSING_STATUS, type StackItem } from './shared';

const lossTotal = (r: ProcessingReturnEvent) =>
  (r.losses.bonesKg || 0) + (r.losses.fatKg || 0) + (r.losses.trimmingKg || 0) + (r.losses.evaporationKg || 0) + (r.losses.otherKg || 0) + (r.unclassifiedKg || 0);

interface CutRow {
  productId: string;
  productName: string;
  qty: number;
  value: number;
  balance: number;
  lots: number;
}

export function ProcessingDetailPage() {
  const { id } = useParams();
  const ops = useOps();
  const prompt = usePrompt();
  const { can } = useSession();
  const { settings } = useSettings();
  const canOperate = can('production.manage');
  const { row: order, loading } = useRow('processing_orders', id);
  const { rows: rawLots } = useTable('stock_lots', { where: [['stage', '==', 'RAW']] }, { enabled: !!order });
  const { rows: outLots } = useTable('stock_lots', { where: [['processingOrderId', '==', id || '']] }, { enabled: !!id });
  const [returning, setReturning] = useState(false);

  const lotCodes = useMemo(() => new Map([...rawLots, ...outLots].map((l) => [l.id, l.lotCode || ''])), [rawLots, outLots]);

  const cancel = useAction((orderId: string, reason: string) => ops.cancelProcessingOrder(orderId, reason), {
    success: 'Ordem cancelada — saldo devolvido ao estoque',
  });
  const askCancel = async () => {
    if (!order) return;
    const reason = await prompt({
      title: `Cancelar ${order.number}?`,
      message: 'O peso enviado volta para o estoque de origem e os custos lançados no lote são removidos.',
      label: 'Motivo do cancelamento',
      confirmLabel: 'Cancelar ordem',
      cancelLabel: 'Voltar',
      danger: true,
    });
    if (reason) await cancel.run(order.id, reason);
  };

  const cuts = useMemo<CutRow[]>(() => {
    if (!order) return [];
    const m = new Map<string, CutRow>();
    for (const r of order.returns || []) {
      for (const it of r.items) {
        const cur = m.get(it.productId) || { productId: it.productId, productName: it.productName, qty: 0, value: 0, balance: 0, lots: 0 };
        cur.qty += it.qty;
        cur.value += it.qty * it.unitCost;
        cur.lots += 1;
        m.set(it.productId, cur);
      }
    }
    for (const l of outLots) {
      const cur = m.get(l.productId);
      if (cur && l.status === 'AVAILABLE') cur.balance += l.balanceQty;
    }
    return [...m.values()].sort((a, b) => b.qty - a.qty);
  }, [order, outLots]);

  if (loading) return <PageLoader />;
  if (!order)
    return (
      <>
        <PageHeader eyebrow="Produção · Desossa" title="Ordem não encontrada" back="/producao/processamento" />
        <Card>
          <EmptyState icon={<Scissors className="size-5" />} title="Esta ordem não existe ou foi removida" />
        </Card>
      </>
    );

  const open = isOpenOrder(order);
  const late = overdueDays(order);
  const pending = pendingKg(order);
  const canCancel = canOperate && order.status === 'OPEN' && !(order.returns || []).length;
  const perKg = orderCostPerKg(order);
  const rawValue = order.sentItems.reduce((s, i) => s + i.qty * i.unitCost, 0);

  const sumLoss = (k: keyof ProcessingReturnEvent['losses']) => (order.returns || []).reduce((s, r) => s + (r.losses[k] || 0), 0);
  const unclassified = (order.returns || []).reduce((s, r) => s + (r.unclassifiedKg || 0), 0);
  const composition: StackItem[] = [
    { key: 'cuts', label: 'Cortes retornados', value: order.returnedKg, slot: 1 },
    { key: 'bones', label: 'Osso', value: sumLoss('bonesKg'), slot: 2 },
    { key: 'fat', label: 'Sebo / gordura', value: sumLoss('fatKg'), slot: 3 },
    { key: 'trim', label: 'Apara', value: sumLoss('trimmingKg'), slot: 4 },
    { key: 'evap', label: 'Evaporação', value: sumLoss('evaporationKg'), slot: 5 },
    { key: 'other', label: 'Outras perdas', value: sumLoss('otherKg'), slot: 6 },
    { key: 'unc', label: 'Não classificado', value: unclassified, slot: 7 },
    ...(pending > 0 ? [{ key: 'pending', label: 'Pendente de retorno', value: pending, slot: 0 }] : []),
  ];

  const yieldTone = deboningYieldTone(order.yieldPercent);
  const processed = order.returnedKg + order.lossKg;

  const sentCols: Column<(typeof order.sentItems)[number]>[] = [
    {
      key: 'product',
      header: 'Peça enviada',
      mobile: 'title',
      cell: (i) => (
        <div className="min-w-0">
          <div className="font-medium text-fg truncate">{i.productName}</div>
          <div className="text-xs text-muted num truncate">{(i.lotId && lotCodes.get(i.lotId)) || '—'}</div>
        </div>
      ),
    },
    { key: 'qty', header: 'Peso', ...NUM_COL, cell: (i) => kg(i.qty) },
    { key: 'cost', header: 'Custo/kg', ...NUM_COL, cell: (i) => money(i.unitCost) },
    { key: 'total', header: 'Valor', ...NUM_COL, cell: (i) => money(i.qty * i.unitCost) },
  ];

  const cutCols: Column<CutRow>[] = [
    { key: 'name', header: 'Corte', mobile: 'title', sortValue: (c) => c.productName, cell: (c) => <span className="font-medium text-fg">{c.productName}</span> },
    { key: 'qty', header: 'Retornado', ...NUM_COL, sortValue: (c) => c.qty, cell: (c) => kg(c.qty) },
    { key: 'share', header: '% do enviado', ...NUM_COL, sortValue: (c) => c.qty, cell: (c) => percent(order.sentKg ? (c.qty / order.sentKg) * 100 : 0, 1), hideBelow: 'md' },
    { key: 'cost', header: 'Custo/kg', ...NUM_COL, cell: (c) => money(c.qty ? c.value / c.qty : 0), hideBelow: 'md' },
    { key: 'balance', header: 'Saldo hoje', ...NUM_COL, sortValue: (c) => c.balance, cell: (c) => (c.balance > 0.05 ? kg(Math.round(c.balance * 10) / 10) : <span className="text-subtle">vendido</span>) },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Produção · Desossa"
        back="/producao/processamento"
        title={order.number}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <StatusBadge info={PROCESSING_STATUS[order.status]} />
            {late > 0 && <Badge tone="danger">{late} dia(s) de atraso</Badge>}
            <span>
              {order.partnerName} · enviado em {date(order.sentDate)}
              {order.batchCode ? ` · lote ${order.batchCode}` : ''}
            </span>
          </span>
        }
        actions={
          <>
            <Button icon={<FileText className="size-4" />} onClick={() => printRomaneio(order, { company: settings.tradeName || settings.companyName, lotCodes })}>
              Romaneio
            </Button>
            {canCancel && (
              <Button variant="ghost" icon={<Ban className="size-4" />} loading={cancel.running} onClick={() => void askCancel()}>
                Cancelar ordem
              </Button>
            )}
            {canOperate && open && (
              <Button variant="primary" icon={<Undo2 className="size-4" />} onClick={() => setReturning(true)}>
                Registrar retorno
              </Button>
            )}
          </>
        }
      />

      {late > 0 && (
        <Callout tone="danger" className="mb-4" title="Retorno atrasado">
          A previsão era {date(order.expectedReturnDate)}. Ainda faltam {kg(pending)} — cobre a desossa {order.partnerName}.
        </Callout>
      )}
      {order.status === 'CANCELLED' && order.notes && (
        <Callout tone="warning" className="mb-4" title="Ordem cancelada">
          {order.notes}
        </Callout>
      )}

      <StatGrid cols={5} className="mb-6">
        <Stat label="Enviado" value={kg(order.sentKg)} hint={`${order.sentItems.length} peça(s) · ${moneyCompact(rawValue)}`} icon={<Scale className="size-4" />} />
        <Stat label="Cortes" value={kg(order.returnedKg)} hint={`${(order.returns || []).length} retorno(s)`} icon={<PackageCheck className="size-4" />} tone="success" />
        <Stat label="Perdas" value={kg(order.lossKg)} hint={order.sentKg ? `${percent((order.lossKg / order.sentKg) * 100, 1)} do enviado` : undefined} tone="neutral" />
        <Stat
          label="Rendimento"
          value={order.yieldPercent ? percent(order.yieldPercent, 2) : '—'}
          hint={open && processed > 0 ? `parcial · ${percent((order.returnedKg / processed) * 100, 1)} s/ processado` : 'cortes ÷ enviado'}
          tone={open ? 'neutral' : yieldTone}
        />
        <Stat label={open ? 'Pendente' : 'Custo por kg enviado'} value={open ? kg(pending) : money(perKg)} hint={open ? 'aguardando retorno' : 'matéria-prima + desossa + frete'} tone={open && pending > 0 ? 'warning' : 'info'} className="col-span-2 md:col-span-1" />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
        <div className="space-y-4 min-w-0">
          {order.status !== 'CANCELLED' && (
            <Card>
              <CardHeader title="Destino do peso enviado" subtitle="Cortes, perdas por tipo e o que ainda falta retornar" />
              <CompositionBar items={composition} total={order.sentKg} format={(v) => kg(Math.round(v * 10) / 10)} />
            </Card>
          )}

          <Card padded={false}>
            <div className="p-4 sm:p-5 pb-0 sm:pb-0">
              <CardHeader title="Itens enviados" subtitle={`${kg(order.sentKg)} · ${money(rawValue)} em matéria-prima`} />
            </div>
            <DataTable bare columns={sentCols} rows={order.sentItems} rowKey={(i) => `${i.lotId}-${i.productId}`} dense />
          </Card>

          {cuts.length > 0 ? (
            <Card padded={false}>
              <div className="p-4 sm:p-5 pb-0 sm:pb-0">
                <CardHeader title="Cortes gerados" subtitle="Somatório dos retornos — entraram no estoque de venda" />
              </div>
              <DataTable bare dense columns={cutCols} rows={cuts} rowKey={(c) => c.productId} initialSort={{ key: 'qty', dir: 'desc' }} />
            </Card>
          ) : (
            order.status !== 'CANCELLED' && (
              <Card>
                <CardHeader title="Cortes gerados" subtitle={open && canOperate ? 'Nenhum corte retornou ainda — use "Registrar retorno" quando a desossa devolver.' : 'Nenhum corte retornou.'} className="mb-0" />
              </Card>
            )
          )}
        </div>

        <div className="space-y-4 min-w-0">
          <Card>
            <CardHeader title="Dados da ordem" />
            <DescriptionList
              cols={2}
              items={[
                { label: 'Desossa', value: order.partnerName, span: true },
                { label: 'Lote de gado', value: order.batchId ? <Link className="text-primary hover:underline" to={`/gado/lotes/${order.batchId}`}>{order.batchCode}</Link> : 'vários / avulso' },
                { label: 'Envio', value: date(order.sentDate) },
                { label: 'Previsão de retorno', value: <span className={late ? toneText.danger : ''}>{date(order.expectedReturnDate)}</span> },
                { label: 'Documento de saída', value: order.dispatchDocument || '—' },
                { label: 'Motorista', value: order.driverName || '—' },
                { label: 'Placa', value: order.vehiclePlate || '—' },
                { label: 'Telefone', value: order.driverPhone ? <a className="text-primary hover:underline" href={`tel:${order.driverPhone}`}>{formatPhone(order.driverPhone)}</a> : '—' },
                { label: 'Custo da desossa', value: money(order.processingCost) },
                { label: 'Frete', value: money(order.freightCost) },
                { label: 'Custo por kg enviado', value: money(perKg) },
                { label: 'Criada por', value: order.createdByName || '—' },
                { label: 'Observações', value: order.notes || '—', span: true, hidden: order.status === 'CANCELLED' },
              ]}
            />
          </Card>

          <Card>
            <CardHeader title="Retornos" subtitle={(order.returns || []).length ? `${(order.returns || []).length} registro(s)` : undefined} />
            {(order.returns || []).length ? (
              <Timeline
                items={[...(order.returns || [])]
                  .sort((a, b) => b.registeredAt.localeCompare(a.registeredAt))
                  .map((r) => ({
                    at: `${date(r.date)} · ${r.registeredBy || '—'} · ${dateTime(r.registeredAt)}`,
                    tone: r.type === 'TOTAL' ? 'success' : 'info',
                    title: (
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <strong className="font-semibold">{r.type === 'TOTAL' ? 'Retorno total' : 'Retorno parcial'}</strong>
                        <span className="num">· {kg(r.returnedKg)} em cortes</span>
                        {r.invoiceNumber && <Badge>{r.invoiceNumber}</Badge>}
                      </span>
                    ),
                    description: (
                      <span className="block space-y-0.5">
                        <span className="block num">
                          {r.items.length} corte(s) · perdas {kg(lossTotal(r))}
                          {r.unclassifiedKg ? ` (${kg(r.unclassifiedKg)} não classificado)` : ''}
                        </span>
                        {r.notes && <span className="block italic">{r.notes}</span>}
                      </span>
                    ),
                  }))}
              />
            ) : (
              <p className="text-sm text-muted">{order.status === 'CANCELLED' ? 'Ordem cancelada sem retornos.' : 'Nenhum retorno registrado ainda.'}</p>
            )}
            <div className="mt-4 pt-3 border-t border-border">
              <Timeline items={[{ at: `${date(order.sentDate)} · ${order.createdByName || '—'}`, title: `Enviada para ${order.partnerName}`, description: `${kg(order.sentKg)} em ${order.sentItems.length} peça(s)`, tone: 'warning' }]} />
            </div>
          </Card>
        </div>
      </div>

      {open && <ProcessingReturnDrawer order={order} open={returning} onClose={() => setReturning(false)} />}
    </>
  );
}
