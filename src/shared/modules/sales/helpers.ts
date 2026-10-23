/**
 * Utilitários do módulo de vendas (puros — sem React).
 */
import { addDays, onlyDigits, round2, round3, startOfMonth, today } from '../../domain/format';
import type { FinancialEntry, PaymentMethod, Sale, SaleStatus } from '../../domain/types';
import type { SaleItemInput } from '../../ops/types';

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/** Pedidos que não entram em faturamento/indicadores. */
export const NOT_BILLED: SaleStatus[] = ['DRAFT', 'CANCELLED', 'REJECTED'];
export const isBilled = (s: Pick<Sale, 'status'>) => !NOT_BILLED.includes(s.status);

/** Status em que o pedido ainda pode ser editado (antes da baixa de estoque). */
export const EDITABLE_STATUSES: SaleStatus[] = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PICKING'];
export const isEditable = (s: Pick<Sale, 'status' | 'stockDeducted'>) => !s.stockDeducted && EDITABLE_STATUSES.includes(s.status);

/** Formas de pagamento que não geram contas a receber (e não pagam comissão). */
export const NO_CHARGE_METHODS: PaymentMethod[] = ['BONUS', 'SAMPLE'];

/** Etapas do ciclo de vida (para a barra de progresso). */
export const LIFECYCLE: { status: SaleStatus[]; label: string }[] = [
  { status: ['DRAFT', 'PENDING_APPROVAL'], label: 'Aprovação' },
  { status: ['APPROVED'], label: 'Aprovado' },
  { status: ['PICKING', 'AWAITING_CUSTOMER'], label: 'Separação' },
  { status: ['READY'], label: 'Separado' },
  { status: ['DISPATCHED'], label: 'Expedido' },
  { status: ['DELIVERED'], label: 'Entregue' },
];

export function lifecycleIndex(status: SaleStatus): number {
  return LIFECYCLE.findIndex((s) => s.status.includes(status));
}

/** Rótulos das ações do histórico (sale.history[].action). */
export const HISTORY_LABELS: Record<string, string> = {
  CREATE: 'Pedido criado',
  UPDATE: 'Pedido alterado',
  SUBMIT: 'Enviado para aprovação',
  APPROVE: 'Pedido aprovado',
  REJECT: 'Pedido recusado',
  PICKING_STARTED: 'Separação iniciada',
  PICKING_DONE: 'Separação concluída',
  WEIGHING_ACCEPTED: 'Cliente aceitou a pesagem',
  WEIGHING_REJECTED: 'Cliente recusou a pesagem',
  DISPATCH: 'Pedido expedido',
  DELIVER: 'Pedido entregue',
  CANCEL: 'Pedido cancelado',
  NOTE: 'Observação',
  ATTACHMENT: 'Arquivo anexado',
  ATTACHMENT_REMOVED: 'Arquivo removido',
  RECEIPT_UPLOADED: 'Comprovante enviado',
  PAYMENT_CONFIRMED: 'Pagamento confirmado',
  RECEIVABLES_REGENERATED: 'Parcelas refeitas',
  PIX: 'Pix gerado',
};

export function historyLabel(action: string): string {
  return HISTORY_LABELS[action] || action.charAt(0) + action.slice(1).toLowerCase().replace(/_/g, ' ');
}

// ---------------------------------------------------------------------------
// Período
// ---------------------------------------------------------------------------

export type PeriodKey = 'today' | '7d' | '30d' | 'month' | 'custom' | 'all';

export interface Period {
  from: string | null;
  to: string | null;
}

export function periodRange(key: PeriodKey, custom: Period): Period {
  const t = today();
  switch (key) {
    case 'today':
      return { from: t, to: t };
    case '7d':
      return { from: addDays(t, -6), to: t };
    case '30d':
      return { from: addDays(t, -29), to: t };
    case 'month':
      return { from: startOfMonth(t), to: t };
    case 'custom':
      return { from: custom.from || null, to: custom.to || null };
    default:
      return { from: null, to: null };
  }
}

/** Período imediatamente anterior, com a mesma duração (para comparação). */
export function previousPeriod(p: Period): Period | null {
  if (!p.from || !p.to) return null;
  const days = Math.max(1, Math.round((Date.parse(p.to) - Date.parse(p.from)) / 86400000) + 1);
  return { from: addDays(p.from, -days), to: addDays(p.from, -1) };
}

export const inPeriod = (d: string, p: Period) => (!p.from || d >= p.from) && (!p.to || d <= p.to);

export function deltaPct(cur: number, prev: number): number | null {
  if (!prev) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

// ---------------------------------------------------------------------------
// Totais
// ---------------------------------------------------------------------------

export function productLines(sale: Pick<Sale, 'items'>) {
  return (sale.items || []).filter((i) => i.kind === 'PRODUCT' || i.kind === 'SUPPLY');
}

/** Saldo em aberto das parcelas (valor − pago), ignorando canceladas. */
export function openBalance(entries: FinancialEntry[]): number {
  return round2(entries.filter((e) => e.status === 'OPEN').reduce((s, e) => s + (e.amount - (e.paidAmount || 0)), 0));
}

export const isOverdue = (e: Pick<FinancialEntry, 'status' | 'dueDate'>) => e.status === 'OPEN' && e.dueDate < today();

export interface LineLike {
  kind: SaleItemInput['kind'];
  unit: 'KG' | 'UN';
  qtyOrdered: number;
  unitPrice: number;
}

export function lineTotal(l: Pick<LineLike, 'qtyOrdered' | 'unitPrice'>) {
  return round2((l.qtyOrdered || 0) * (l.unitPrice || 0));
}

export function draftTotals(lines: LineLike[], freight: number, discount: number, commissionRate: number) {
  let subtotal = 0;
  let freightItems = 0;
  let weight = 0;
  let units = 0;
  for (const l of lines) {
    const t = lineTotal(l);
    if (l.kind === 'FREIGHT') freightItems += t;
    else subtotal += t;
    if (l.kind === 'PRODUCT' || l.kind === 'SUPPLY') {
      if (l.unit === 'KG') weight += l.qtyOrdered || 0;
      else units += l.qtyOrdered || 0;
    }
  }
  subtotal = round2(subtotal);
  const freightValue = round2((freight || 0) + freightItems);
  const total = Math.max(0, round2(subtotal + freightValue - (discount || 0)));
  return {
    subtotal,
    freight: freightValue,
    discount: round2(discount || 0),
    total,
    weight: round3(weight),
    units,
    commission: round2((subtotal * (commissionRate || 0)) / 100),
  };
}

// ---------------------------------------------------------------------------
// Diversos
// ---------------------------------------------------------------------------

/** Link do WhatsApp (wa.me) com texto. Sem telefone abre a escolha de contato. */
export function whatsappLink(phone: string | null | undefined, text: string): string {
  let d = onlyDigits(phone);
  if (d && (d.length === 10 || d.length === 11)) d = '55' + d;
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Itens de um pedido existente como entrada (para duplicar / converter). */
export function saleItemsToInputs(sale: Pick<Sale, 'items'>): SaleItemInput[] {
  return (sale.items || [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((i) => ({
      kind: i.kind,
      productId: i.productId ?? null,
      supplyItemId: i.supplyItemId ?? null,
      productName: i.productName,
      unit: i.unit,
      qtyOrdered: i.qtyOrdered || i.qty,
      unitPrice: i.unitPrice,
      lotId: null,
      lotCode: null,
      packages: i.packages ?? null,
      notes: i.notes ?? null,
    }));
}

export function companyAddress(s: { street?: string | null; number?: string | null; district?: string | null; city?: string | null; state?: string | null }) {
  return [
    [s.street, s.number].filter(Boolean).join(', '),
    s.district,
    [s.city, s.state].filter(Boolean).join('/'),
  ]
    .filter(Boolean)
    .join(' — ');
}
