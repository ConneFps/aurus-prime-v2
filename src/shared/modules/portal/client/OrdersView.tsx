/**
 * Meus pedidos: lista com acompanhamento resumido e ações pendentes.
 */
import { ChevronRight, ClipboardList, QrCode, Scale } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePortalSession } from '../../../app/session';
import { useTable } from '../../../data/react';
import { date, money } from '../../../domain/format';
import type { Sale } from '../../../domain/types';
import { Badge, Button, EmptyState, Segmented, Skeleton } from '../../../ui';
import { canPay, isClosedSale, portalStatusLabel, portalStatusTone } from '../lib';
import { MiniTracker } from './Tracker';

/** Pedidos do cliente logado (as regras do banco exigem o filtro por conta). */
export function useMySales() {
  const { account } = usePortalSession();
  const { rows, loading } = useTable('sales', { where: [['portalAccountId', '==', account?.id || '-']] }, { enabled: !!account });
  const sales = useMemo(() => rows.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')), [rows]);
  return { sales, loading };
}

export type PendingAction = 'WEIGHING' | 'PAY' | null;

export function pendingAction(s: Sale): PendingAction {
  if (s.status === 'AWAITING_CUSTOMER' && s.weighing?.decision !== 'REJECTED') return 'WEIGHING';
  if (canPay(s) && (s.paymentStatus === 'PENDING' || s.paymentStatus === 'PARTIAL')) return 'PAY';
  return null;
}

export function OrdersView() {
  const { sales, loading } = useMySales();
  const [tab, setTab] = useState<'OPEN' | 'DONE' | 'ALL'>('OPEN');
  const open = sales.filter((s) => !isClosedSale(s) || pendingAction(s));
  const closed = sales.filter((s) => isClosedSale(s) && !pendingAction(s));
  const list = tab === 'OPEN' ? open : tab === 'DONE' ? closed : sales;
  const needs = sales.filter((s) => pendingAction(s)).length;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-fg">Meus pedidos</h1>
          <p className="text-sm text-muted mt-1">
            {needs > 0 ? `${needs} ${needs === 1 ? 'pedido precisa' : 'pedidos precisam'} da sua atenção.` : 'Acompanhe cada etapa, do recebimento à entrega.'}
          </p>
        </div>
        <Segmented
          size="sm"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'OPEN', label: 'Em andamento', count: open.length },
            { value: 'DONE', label: 'Concluídos', count: closed.length },
            { value: 'ALL', label: 'Todos' },
          ]}
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 rounded-card" />
          ))}
        </div>
      ) : !list.length ? (
        <EmptyState
          className="py-16"
          icon={<ClipboardList className="size-5" />}
          title={sales.length ? 'Nenhum pedido nesta lista' : 'Você ainda não fez pedidos'}
          description={sales.length ? 'Veja as outras abas.' : 'Escolha os cortes no catálogo e envie seu primeiro pedido.'}
          action={
            !sales.length && (
              <Link to="/portal">
                <Button variant="primary">Ver catálogo</Button>
              </Link>
            )
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {list.map((s) => (
            <li key={s.id}>
              <OrderCard sale={s} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OrderCard({ sale: s }: { sale: Sale }) {
  const products = (s.items || []).filter((i) => i.kind !== 'FREIGHT');
  const names = products.slice(0, 2).map((i) => i.productName).join(', ');
  const more = products.length > 2 ? ` e mais ${products.length - 2}` : '';
  const action = pendingAction(s);
  const cancelled = s.status === 'CANCELLED' || s.status === 'REJECTED';
  return (
    <Link
      to={`/portal/pedidos/${s.id}`}
      className="block rounded-card border border-border bg-surface shadow-card p-4 hover:border-border-strong transition-colors group"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-[15px] font-semibold text-fg num whitespace-nowrap">
          <span className="max-sm:hidden">Pedido </span>nº {s.number}
        </div>
        <Badge tone={portalStatusTone(s)} dot>
          {portalStatusLabel(s)}
        </Badge>
      </div>
      <div className="text-xs text-muted mt-0.5 num">
        Feito em {date(s.date).slice(0, 5)}
        {s.deliveryDate && !cancelled && ` · ${s.deliveryMode === 'PICKUP' ? 'retirada' : 'entrega'} em ${date(s.deliveryDate).slice(0, 5)}`}
      </div>
      {!cancelled && <MiniTracker sale={s} className="mt-3.5" />}
      <div className="mt-3.5 flex items-end justify-between gap-3">
        <div className="min-w-0 text-xs text-muted truncate">
          {names}
          {more}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-sm font-semibold text-fg num">{money(s.totalValue)}</span>
          <ChevronRight className="size-4 text-subtle group-hover:text-fg transition-colors" />
        </div>
      </div>
      {action && (
        <div className="mt-3 flex items-center gap-2 rounded-control bg-warning-soft text-warning px-3 py-2 text-xs font-medium">
          {action === 'WEIGHING' ? <Scale className="size-4" /> : <QrCode className="size-4" />}
          {action === 'WEIGHING' ? 'Confirme o novo valor após a pesagem' : `Pague ${money(s.totalValue)} com Pix`}
        </div>
      )}
    </Link>
  );
}
