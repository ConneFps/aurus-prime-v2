/**
 * Números do painel inicial — calculados uma vez, apresentados de forma
 * diferente em cada opção. Janela móvel de 30 dias (comparada aos 30 anteriores).
 */
import { useMemo } from 'react';
import { useTable } from '../data/react';
import { addDays, monthLabel, today } from '../domain/format';
import type { Sale } from '../domain/types';
import { useSession } from './session';

const NOT_SOLD: Sale['status'][] = ['DRAFT', 'PENDING_APPROVAL', 'CANCELLED', 'REJECTED'];

export interface DashboardData {
  loading: boolean;
  revenue30: number;
  revenuePrev30: number;
  revenueDelta: number | null;
  orders30: number;
  kg30: number;
  avgTicket30: number;
  receivableOpen: number;
  receivableOverdue: number;
  overdueCount: number;
  payable30: number;
  stockKg: number;
  stockValue: number;
  headsAlive: number;
  batchesFattening: number;
  monthly: { month: string; label: string; revenue: number; kg: number }[];
  topProducts: { name: string; kg: number; value: number }[];
  topCustomers: { id: string; name: string; value: number }[];
  queue: { pendingApproval: number; toPick: number; picking: number; awaitingCustomer: number; ready: number; dispatched: number; receipts: number };
  alerts: { id: string; tone: 'danger' | 'warning' | 'info'; title: string; detail: string; path: string }[];
  portalPending: number;
  customerRequests: number;
}

export function useDashboardData(): DashboardData {
  const { can } = useSession();
  const fin = can('finance.view');
  const sales = useTable('sales');
  const entries = useTable('financial_entries', undefined, { enabled: fin });
  const lots = useTable('stock_lots');
  const products = useTable('products');
  const animals = useTable('animals', { where: [['status', '==', 'ALIVE']] }, { enabled: can('view.cattle') });
  const batches = useTable('batches', undefined, { enabled: can('view.cattle') });
  const accounts = useTable('portal_accounts', { where: [['status', '==', 'PENDING']] }, { enabled: can('portal.manage') });
  const requests = useTable('customer_requests', { where: [['status', '==', 'PENDING']] }, { enabled: can('customers.manage') });
  const equineEvents = useTable('equine_events', { where: [['type', '==', 'HEALTH']] }, { enabled: can('view.equines') });

  return useMemo<DashboardData>(() => {
    const t = today();
    const d30 = addDays(t, -30);
    const d60 = addDays(t, -60);
    const sold = sales.rows.filter((s) => !NOT_SOLD.includes(s.status));
    const in30 = sold.filter((s) => s.date > d30 && s.date <= t);
    const prev30 = sold.filter((s) => s.date > d60 && s.date <= d30);
    const revenue30 = in30.reduce((a, s) => a + s.totalValue, 0);
    const revenuePrev30 = prev30.reduce((a, s) => a + s.totalValue, 0);
    const kg30 = in30.reduce((a, s) => a + (s.totalWeightKg || 0), 0);

    // série mensal (6 meses até o atual)
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1 - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const monthly = months.map((m) => {
      const ss = sold.filter((s) => s.date.startsWith(m));
      return { month: m, label: monthLabel(m), revenue: ss.reduce((a, s) => a + s.totalValue, 0), kg: ss.reduce((a, s) => a + (s.totalWeightKg || 0), 0) };
    });

    const prod = new Map<string, { name: string; kg: number; value: number }>();
    for (const s of in30)
      for (const it of s.items || []) {
        if (it.kind !== 'PRODUCT') continue;
        const cur = prod.get(it.productName) || { name: it.productName, kg: 0, value: 0 };
        if (it.unit === 'KG') cur.kg += it.qty;
        cur.value += it.total;
        prod.set(it.productName, cur);
      }
    const topProducts = [...prod.values()].sort((a, b) => b.value - a.value).slice(0, 6);
    const cust = new Map<string, { id: string; name: string; value: number }>();
    for (const s of in30) {
      const cur = cust.get(s.customerId) || { id: s.customerId, name: s.customerName, value: 0 };
      cur.value += s.totalValue;
      cust.set(s.customerId, cur);
    }
    const topCustomers = [...cust.values()].sort((a, b) => b.value - a.value).slice(0, 5);

    const open = entries.rows.filter((e) => e.status === 'OPEN');
    const recOpen = open.filter((e) => e.direction === 'IN');
    const overdue = recOpen.filter((e) => e.dueDate < t);
    const bal = (e: (typeof open)[number]) => e.amount - (e.paidAmount || 0);
    const payable30 = open.filter((e) => e.direction === 'OUT' && e.dueDate <= addDays(t, 30)).reduce((a, e) => a + bal(e), 0);

    const avail = lots.rows.filter((l) => l.status === 'AVAILABLE' && l.balanceQty > 0);
    const finished = avail.filter((l) => l.stage === 'FINISHED');
    const stockKg = finished.filter((l) => l.unit === 'KG').reduce((a, l) => a + l.balanceQty, 0);
    const stockValue = finished.reduce((a, l) => a + l.balanceQty * l.unitCost, 0);

    const queue = {
      pendingApproval: sales.rows.filter((s) => s.status === 'PENDING_APPROVAL').length,
      toPick: sales.rows.filter((s) => s.status === 'APPROVED').length,
      picking: sales.rows.filter((s) => s.status === 'PICKING').length,
      awaitingCustomer: sales.rows.filter((s) => s.status === 'AWAITING_CUSTOMER').length,
      ready: sales.rows.filter((s) => s.status === 'READY').length,
      dispatched: sales.rows.filter((s) => s.status === 'DISPATCHED').length,
      receipts: sales.rows.filter((s) => s.paymentStatus === 'RECEIPT_SENT').length,
    };

    const alerts: DashboardData['alerts'] = [];
    // estoque abaixo do mínimo
    const byProduct = new Map<string, number>();
    for (const l of finished) byProduct.set(l.productId, (byProduct.get(l.productId) || 0) + l.balanceQty);
    const low = products.rows.filter((p) => p.active && (p.minStock || 0) > 0 && (byProduct.get(p.id) || 0) < (p.minStock || 0));
    if (low.length)
      alerts.push({
        id: 'low',
        tone: 'warning',
        title: `${low.length} ${low.length === 1 ? 'corte abaixo' : 'cortes abaixo'} do estoque mínimo`,
        detail: low.slice(0, 4).map((p) => p.name).join(', ') + (low.length > 4 ? '…' : ''),
        path: '/estoque',
      });
    const expiring = finished.filter((l) => l.expiryDate && l.expiryDate <= addDays(t, 7));
    if (expiring.length)
      alerts.push({
        id: 'exp',
        tone: expiring.some((l) => (l.expiryDate || '') < t) ? 'danger' : 'warning',
        title: `${expiring.length} ${expiring.length === 1 ? 'lote vence' : 'lotes vencem'} em até 7 dias`,
        detail: [...new Set(expiring.map((l) => l.productName))].slice(0, 4).join(', '),
        path: '/estoque',
      });
    if (fin && overdue.length)
      alerts.push({
        id: 'overdue',
        tone: 'danger',
        title: `${overdue.length} ${overdue.length === 1 ? 'parcela vencida' : 'parcelas vencidas'}`,
        detail: [...new Set(overdue.map((e) => e.partyName))].slice(0, 3).join(', '),
        path: '/financeiro',
      });
    const late = sales.rows.filter((s) => ['APPROVED', 'PICKING', 'READY'].includes(s.status) && s.deliveryDate && s.deliveryDate < t);
    if (late.length) alerts.push({ id: 'late', tone: 'danger', title: `${late.length} ${late.length === 1 ? 'pedido atrasado' : 'pedidos atrasados'} para entrega`, detail: late.slice(0, 3).map((s) => `#${s.number}`).join(', '), path: '/estoque/separacao' });
    const soonSlaughter = batches.rows.filter((b) => ['PURCHASED', 'IN_PASTURE'].includes(b.status) && b.estimatedSlaughterDate && b.estimatedSlaughterDate <= addDays(t, 15));
    if (soonSlaughter.length) alerts.push({ id: 'slaughter', tone: 'info', title: `${soonSlaughter.length} ${soonSlaughter.length === 1 ? 'lote' : 'lotes'} com abate previsto em 15 dias`, detail: soonSlaughter.map((b) => b.code).join(', '), path: '/producao/abate' });
    const vet = equineEvents.rows.filter((e) => e.alertDate && e.alertDate <= addDays(t, 15));
    if (vet.length) alerts.push({ id: 'vet', tone: 'info', title: `${vet.length} ${vet.length === 1 ? 'lembrete' : 'lembretes'} de saúde dos equinos`, detail: [...new Set(vet.map((e) => e.equineName))].slice(0, 3).join(', '), path: '/equinos' });

    return {
      loading: sales.loading || lots.loading,
      revenue30,
      revenuePrev30,
      revenueDelta: revenuePrev30 > 0 ? ((revenue30 - revenuePrev30) / revenuePrev30) * 100 : null,
      orders30: in30.length,
      kg30,
      avgTicket30: in30.length ? revenue30 / in30.length : 0,
      receivableOpen: recOpen.reduce((a, e) => a + bal(e), 0),
      receivableOverdue: overdue.reduce((a, e) => a + bal(e), 0),
      overdueCount: overdue.length,
      payable30,
      stockKg,
      stockValue,
      headsAlive: animals.rows.length || batches.rows.filter((b) => ['PURCHASED', 'IN_PASTURE'].includes(b.status)).reduce((a, b) => a + b.headCount, 0),
      batchesFattening: batches.rows.filter((b) => ['PURCHASED', 'IN_PASTURE'].includes(b.status)).length,
      monthly,
      topProducts,
      topCustomers,
      queue,
      alerts,
      portalPending: accounts.rows.length,
      customerRequests: requests.rows.length,
    };
  }, [sales.rows, sales.loading, entries.rows, lots.rows, lots.loading, products.rows, animals.rows, batches.rows, accounts.rows, requests.rows, equineEvents.rows, fin]);
}
