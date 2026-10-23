/**
 * Dados e peças comuns do aplicativo do vendedor externo.
 * Toda leitura filtra pelo vendedor logado (exigência das regras do banco).
 */
import { ChevronRight } from 'lucide-react';
import React from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../../app/session';
import { useTable } from '../../../data/react';
import { date, money } from '../../../domain/format';
import { SALE_STATUS } from '../../../domain/labels';
import type { Sale } from '../../../domain/types';
import { cn, StatusBadge } from '../../../ui';

export function useMySales() {
  const { profile } = useSession();
  return useTable('sales', { where: [['sellerId', '==', profile?.id || '-']] }, { enabled: !!profile });
}

export function useMyCustomers() {
  const { profile } = useSession();
  return useTable('customers', { where: [['sellerId', '==', profile?.id || '-']] }, { enabled: !!profile });
}

export function useMyRequests() {
  const { profile } = useSession();
  return useTable('customer_requests', { where: [['requestedById', '==', profile?.id || '-']] }, { enabled: !!profile });
}

/** Pedidos "em andamento" (ainda não entregues nem encerrados). */
export const OPEN_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PICKING', 'AWAITING_CUSTOMER', 'READY', 'DISPATCHED'];

/** Linha de pedido em lista (cartão tocável). */
export function OrderRow({ sale, showCustomer = true }: { sale: Sale; showCustomer?: boolean }) {
  const items = (sale.items || []).filter((i) => i.kind === 'PRODUCT').length;
  return (
    <Link to={`/pedidos/${sale.id}`} className="flex items-center gap-2 px-4 py-3 hover:bg-surface-2/60 active:bg-surface-2 transition-colors">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-medium text-fg truncate">{showCustomer ? sale.customerName : `Pedido ${sale.number}`}</span>
          <span className="num font-semibold text-fg text-sm shrink-0">{money(sale.totalValue)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted num truncate">
            {showCustomer ? `Nº ${sale.number} · ` : ''}
            {date(sale.date)} · {items} {items === 1 ? 'item' : 'itens'}
          </span>
          <span className="shrink-0">
            <StatusBadge info={SALE_STATUS[sale.status]} />
          </span>
        </div>
      </div>
      <ChevronRight className="size-4 text-subtle shrink-0" />
    </Link>
  );
}

/** Lista em cartão com divisórias. */
export function ListCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('bg-surface border border-border rounded-card shadow-card divide-y divide-border overflow-hidden', className)}>{children}</div>;
}

/** Título de seção dentro das telas do app. */
export function SectionTitle({ title, action }: { title: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-2.5 mt-1">
      <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">{title}</h2>
      {action}
    </div>
  );
}
