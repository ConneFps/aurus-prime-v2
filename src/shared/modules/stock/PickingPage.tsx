/**
 * Fila de separação (mobile-first): pedidos por status, agrupados por data de entrega.
 */
import { CheckCheck, ChevronRight, MapPin, MessageSquareText, PackageCheck, Play, Scale, Truck } from 'lucide-react';
import { useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTable } from '../../data/react';
import { date, kg, matchesSearch, money, relativeDays, today, toISODate } from '../../domain/format';
import type { Sale, SaleStatus } from '../../domain/types';
import { Badge, Button, cn, EmptyState, PageHeader, SearchInput, Skeleton } from '../../ui';
import { BUCKET_LABELS, dateBucket, itemsSummary, orderedWeight, releaseInfo, type DateBucket } from './model';
import { ChannelBadge, DeliveryBadge, NfBadge } from './pickingUi';
import { useExpedition } from './useExpedition';

type QueueStatus = Extract<SaleStatus, 'APPROVED' | 'PICKING' | 'AWAITING_CUSTOMER' | 'READY' | 'DISPATCHED'>;

const QUEUE: { status: QueueStatus; label: string; tone: string }[] = [
  { status: 'APPROVED', label: 'A separar', tone: 'text-info' },
  { status: 'PICKING', label: 'Em separação', tone: 'text-primary' },
  { status: 'AWAITING_CUSTOMER', label: 'Aguard. cliente', tone: 'text-warning' },
  { status: 'READY', label: 'Prontos', tone: 'text-accent' },
  { status: 'DISPATCHED', label: 'Em rota', tone: 'text-success' },
];

const BUCKET_ORDER: DateBucket[] = ['LATE', 'TODAY', 'TOMORROW', 'NEXT', 'NONE'];

export function PickingPage() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const { rows, loading } = useTable('sales', {
    where: [['status', 'in', ['APPROVED', 'PICKING', 'AWAITING_CUSTOMER', 'READY', 'DISPATCHED', 'DELIVERED']]],
  });
  const counts = useMemo(() => {
    const c = {} as Record<QueueStatus, number>;
    QUEUE.forEach((s) => (c[s.status] = 0));
    let deliveredToday = 0;
    for (const s of rows) {
      if (s.status === 'DELIVERED') {
        if (s.deliveredAt && toISODate(new Date(s.deliveredAt)) === today()) deliveredToday++;
      } else c[s.status as QueueStatus]++;
    }
    return { ...c, deliveredToday };
  }, [rows]);

  const param = params.get('status') as QueueStatus | null;
  const status: QueueStatus = param && QUEUE.some((s) => s.status === param) ? param : counts.APPROVED || !counts.PICKING ? 'APPROVED' : 'PICKING';
  const setStatus = (s: QueueStatus) => setParams({ status: s }, { replace: true });

  const groups = useMemo(() => {
    const list = rows
      .filter((s) => s.status === status)
      .filter((s) => matchesSearch([s.customerName, s.number, s.shippingAddress, ...(s.items || []).map((i) => i.productName)], q))
      .sort(
        (a, b) =>
          (a.deliveryDate || '9999').localeCompare(b.deliveryDate || '9999') ||
          (a.deliveryWindow || 'Z').localeCompare(b.deliveryWindow || 'Z') ||
          a.createdAt.localeCompare(b.createdAt),
      );
    const m = new Map<DateBucket, Sale[]>();
    for (const s of list) {
      const b = dateBucket(s.deliveryDate);
      m.set(b, [...(m.get(b) || []), s]);
    }
    return BUCKET_ORDER.filter((b) => m.has(b)).map((b) => ({ bucket: b, sales: m.get(b)! }));
  }, [rows, status, q]);

  const open = (s: Sale) => nav(`/estoque/separacao/${s.id}`);

  return (
    <>
      <PageHeader eyebrow="Logística" title="Separação de pedidos" subtitle="Separe, pese, dê baixa e expeça. Toque no pedido para abrir." />

      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-3" role="tablist">
        {QUEUE.map((s) => {
          const active = s.status === status;
          return (
            <button
              key={s.status}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setStatus(s.status)}
              className={cn(
                'rounded-card border px-3 py-2.5 text-left transition-colors cursor-pointer min-w-0',
                active ? 'border-primary bg-primary-soft' : 'border-border bg-surface hover:border-border-strong',
              )}
            >
              <div className={cn('text-2xl font-semibold num leading-none', counts[s.status] ? s.tone : 'text-subtle')}>{counts[s.status]}</div>
              <div className={cn('text-[11px] mt-1 truncate', active ? 'text-fg font-medium' : 'text-muted')}>{s.label}</div>
            </button>
          );
        })}
        <div className="sm:hidden rounded-card border border-dashed border-border px-3 py-2.5 min-w-0">
          <div className="text-2xl font-semibold num leading-none text-success">{counts.deliveredToday}</div>
          <div className="text-[11px] mt-1 text-muted truncate">Entregues hoje</div>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
        <SearchInput value={q} onChange={setQ} placeholder="Cliente, nº do pedido ou corte…" className="sm:w-80" />
        <span className="hidden sm:inline text-xs text-muted sm:ml-auto">
          <CheckCheck className="inline size-3.5 text-success mr-1" />
          {counts.deliveredToday} entregue(s) hoje
        </span>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : !groups.length ? (
        <EmptyState
          icon={<PackageCheck className="size-5" />}
          title={q ? 'Nenhum pedido encontrado' : `Nada em "${QUEUE.find((s) => s.status === status)?.label}"`}
          description={q ? 'Tente outra busca.' : status === 'APPROVED' ? 'Os pedidos aprovados aparecem aqui para separar.' : 'Veja as outras etapas acima.'}
          className="bg-surface border border-border rounded-card"
        />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.bucket}>
              <h2 className={cn('text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-2', g.bucket === 'LATE' ? 'text-danger' : 'text-muted')}>
                {BUCKET_LABELS[g.bucket]}
                <span className="num rounded-full bg-surface-2 px-1.5 text-[10px] text-muted">{g.sales.length}</span>
              </h2>
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {g.sales.map((s) => (
                  <li key={s.id} className="min-w-0">
                    <OrderCard sale={s} late={g.bucket === 'LATE'} onOpen={() => open(s)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function OrderCard({ sale, late, onOpen }: { sale: Sale; late: boolean; onOpen: () => void }) {
  const exp = useExpedition();
  const notes = !!sale.customerNotes?.trim() || (sale.items || []).some((i) => i.notes?.trim());
  const itemsCount = (sale.items || []).filter((i) => i.kind === 'PRODUCT').length;
  const weight = sale.status === 'APPROVED' || sale.status === 'PICKING' ? orderedWeight(sale) : sale.totalWeightKg;
  const rel = releaseInfo(sale);
  const place =
    sale.deliveryMode === 'PICKUP' ? 'Retirada no balcão' : sale.shippingAddress || 'Endereço não informado';

  let action: ReactNode = null;
  const stop = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  if (sale.status === 'APPROVED')
    action = (
      <Button
        variant="primary"
        block
        icon={<Play className="size-4" />}
        loading={exp.start.running}
        onClick={stop(async () => {
          const r = await exp.start.run(sale);
          if (r) onOpen();
        })}
      >
        Iniciar separação
      </Button>
    );
  else if (sale.status === 'PICKING')
    action = (
      <Button variant="primary" block icon={<Scale className="size-4" />} onClick={stop(onOpen)}>
        Pesar e concluir
      </Button>
    );
  else if (sale.status === 'AWAITING_CUSTOMER')
    action = (
      <Button variant="secondary" block onClick={stop(onOpen)}>
        {sale.weighing?.decision === 'REJECTED' ? 'Cliente recusou — resolver' : 'Ver pesagem'}
      </Button>
    );
  else if (sale.status === 'READY')
    action =
      sale.deliveryMode === 'PICKUP' ? (
        <Button variant="accent" block icon={<CheckCheck className="size-4" />} loading={exp.deliver.running} onClick={stop(() => void exp.deliver.run(sale))}>
          Retirado pelo cliente
        </Button>
      ) : (
        <Button variant="accent" block icon={<Truck className="size-4" />} loading={exp.dispatch.running} onClick={stop(() => void exp.dispatch.run(sale))}>
          Expedir
        </Button>
      );
  else if (sale.status === 'DISPATCHED')
    action = (
      <Button variant="secondary" block icon={<CheckCheck className="size-4" />} loading={exp.deliver.running} onClick={stop(() => void exp.deliver.run(sale))}>
        Confirmar entrega
      </Button>
    );

  return (
    <article
      onClick={onOpen}
      className={cn(
        'h-full flex flex-col gap-2.5 rounded-card border bg-surface shadow-card p-4 cursor-pointer transition-colors hover:border-border-strong active:bg-surface-2',
        sale.channel === 'PORTAL' ? 'border-accent/50' : 'border-border',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-muted num">#{sale.number}</span>
            <ChannelBadge sale={sale} />
            <DeliveryBadge sale={sale} />
          </div>
          <h3 className="text-[15px] font-semibold text-fg leading-snug mt-1 truncate">{sale.customerName}</h3>
        </div>
        <ChevronRight className="size-4 text-subtle shrink-0 mt-1" />
      </div>

      <div className="text-sm text-fg/90 line-clamp-2">{itemsSummary(sale) || 'Sem cortes'}</div>
      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-xs text-muted">
        <span className="num">
          {itemsCount} {itemsCount === 1 ? 'corte' : 'cortes'} · {sale.status === 'APPROVED' || sale.status === 'PICKING' ? '~' : ''}
          {kg(weight)}
        </span>
        {sale.status !== 'APPROVED' && sale.status !== 'PICKING' && <span className="num">{money(sale.totalValue)}</span>}
        <span className={cn('num', late && 'text-danger font-medium')}>
          {sale.deliveryDate ? `${date(sale.deliveryDate)} (${relativeDays(sale.deliveryDate)})` : 'Sem data'}
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted min-w-0">
        <MapPin className="size-3.5 shrink-0" />
        <span className="truncate">{place}</span>
      </div>

      {(notes || sale.status === 'PICKING' || (sale.status === 'READY' && rel.nfRequired) || sale.status === 'AWAITING_CUSTOMER') && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {notes && (
            <Badge tone="warning" size="xs">
              <MessageSquareText className="size-3" /> Tem observações
            </Badge>
          )}
          {sale.status === 'PICKING' && sale.pickedByName && <Badge size="xs">Com {sale.pickedByName.split(' ')[0]}</Badge>}
          {sale.status === 'AWAITING_CUSTOMER' && sale.weighing && (
            <Badge tone={sale.weighing.decision === 'REJECTED' ? 'danger' : 'warning'} size="xs">
              {sale.weighing.decision === 'REJECTED' ? 'Recusado pelo cliente' : `+${money(sale.weighing.diffValue)} a aprovar`}
            </Badge>
          )}
          {(sale.status === 'READY' || sale.status === 'DISPATCHED') && <NfBadge sale={sale} />}
        </div>
      )}

      <div className="mt-auto pt-1">{action}</div>
    </article>
  );
}
