/**
 * Regras de tela do portal (puras): quantidades do catálogo, acompanhamento
 * em 5 passos, links de WhatsApp/catálogo e conversões de configurações.
 */
import type { DeliveryScheduleConfig } from '../../domain/delivery';
import { onlyDigits, round3 } from '../../domain/format';
import type { FreightSettings } from '../../domain/freight';
import { PORTAL_STATUS_LABELS, type LabelInfo, type Tone } from '../../domain/labels';
import type { AppSettings, CatalogItem, FreightZone, PortalAccount, Sale } from '../../domain/types';

// ---------------------------------------------------------------------------
// Quantidades (pedido mínimo + incremento)
// ---------------------------------------------------------------------------

type QtyRule = Pick<CatalogItem, 'minQty' | 'step' | 'unit'>;

const stepOf = (c: QtyRule) => (c.step && c.step > 0 ? c.step : c.unit === 'KG' ? 0.5 : 1);

/** Menor quantidade válida (mínimo arredondado para cima no múltiplo do passo). */
export function firstQty(c: QtyRule): number {
  const step = stepOf(c);
  const min = Math.max(c.minQty || 0, step);
  return round3(Math.ceil(min / step - 1e-9) * step);
}

/** Ajusta um valor digitado para o múltiplo de passo mais próximo, respeitando o mínimo. */
export function snapQty(c: QtyRule, v: number): number {
  const step = stepOf(c);
  if (!Number.isFinite(v) || v <= 0) return 0;
  const snapped = round3(Math.round(v / step) * step);
  return Math.max(firstQty(c), snapped);
}

export function incQty(c: QtyRule, cur: number): number {
  return cur > 0 ? round3(cur + stepOf(c)) : firstQty(c);
}

/** Diminui um passo; abaixo do mínimo devolve 0 (remove do carrinho). */
export function decQty(c: QtyRule, cur: number): number {
  const next = round3(cur - stepOf(c));
  return next + 1e-9 < firstQty(c) ? 0 : next;
}

export const unitShort = (u: 'KG' | 'UN') => (u === 'KG' ? 'kg' : 'un');

// ---------------------------------------------------------------------------
// Configurações → regras de domínio
// ---------------------------------------------------------------------------

export function freightSettingsOf(zones: FreightZone[], s: AppSettings): FreightSettings {
  return { zones: zones.filter((z) => z.active), freeAbove: s.freeFreightAbove ?? null, pickupEnabled: s.pickupEnabled };
}

export function scheduleOf(s: Pick<AppSettings, 'deliveryCutoffHour' | 'deliveryBlockedDates' | 'weekendPolicy'>): Partial<DeliveryScheduleConfig> {
  return { cutoffHour: s.deliveryCutoffHour, blockedDates: s.deliveryBlockedDates, weekendPolicy: s.weekendPolicy };
}

export function brandName(s: Pick<AppSettings, 'tradeName' | 'companyName'>): string {
  return s.tradeName || s.companyName || 'Aurus Prime';
}

// ---------------------------------------------------------------------------
// Contas do portal
// ---------------------------------------------------------------------------

export const PORTAL_ACCOUNT_STATUS: Record<PortalAccount['status'], LabelInfo> = {
  PENDING: { label: 'Em análise', tone: 'warning' },
  APPROVED: { label: 'Liberada', tone: 'success' },
  REJECTED: { label: 'Recusada', tone: 'danger' },
  BLOCKED: { label: 'Bloqueada', tone: 'neutral' },
};

export function addressLine(a: {
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
}): string {
  const first = [a.street, a.number].filter(Boolean).join(', ');
  return [first + (a.complement ? ` (${a.complement})` : ''), a.district, [a.city, a.state].filter(Boolean).join('/')]
    .filter((x) => x && x.trim())
    .join(' — ');
}

// ---------------------------------------------------------------------------
// Links (WhatsApp, catálogo público, área de transferência)
// ---------------------------------------------------------------------------

export function waLink(phone: string | null | undefined, text: string): string {
  let d = onlyDigits(phone);
  if (d && (d.length === 10 || d.length === 11)) d = '55' + d;
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

export function publicCatalogUrl(token: string): string {
  return `${window.location.origin}${window.location.pathname}#/catalogo/${token}`;
}

export async function copyText(text: string): Promise<boolean> {
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

// ---------------------------------------------------------------------------
// Acompanhamento do pedido (5 passos)
// ---------------------------------------------------------------------------

export type StepState = 'done' | 'current' | 'attention' | 'todo';

export interface TrackStep {
  key: string;
  label: string;
  state: StepState;
  /** Explicação do passo atual (para o cliente). */
  hint?: string;
}

const ACTIVE_FLOW: Sale['status'][] = ['PENDING_APPROVAL', 'APPROVED', 'PICKING', 'AWAITING_CUSTOMER', 'READY', 'DISPATCHED', 'DELIVERED'];

export function isClosedSale(s: Pick<Sale, 'status'>) {
  return s.status === 'DELIVERED' || s.status === 'CANCELLED' || s.status === 'REJECTED';
}

export function isPaid(s: Pick<Sale, 'paymentStatus'>) {
  return s.paymentStatus === 'PAID';
}

/** Pagamento disponível: depois da pesagem aprovada, enquanto houver valor em aberto. */
export function canPay(s: Pick<Sale, 'status' | 'paymentStatus' | 'pixPayload' | 'freightPending'>) {
  return (
    ['READY', 'DISPATCHED', 'DELIVERED'].includes(s.status) &&
    (s.paymentStatus === 'PENDING' || s.paymentStatus === 'PARTIAL' || s.paymentStatus === 'RECEIPT_SENT') &&
    !s.freightPending &&
    !!s.pixPayload
  );
}

/**
 * Recebido → Separando/pesando → Aprovação/pagamento → Em rota / pronto p/ retirada → Entregue.
 */
export function trackingSteps(s: Sale): TrackStep[] {
  const pickup = s.deliveryMode === 'PICKUP';
  const idx = ACTIVE_FLOW.indexOf(s.status);
  const paid = isPaid(s);
  const steps: TrackStep[] = [
    { key: 'received', label: 'Recebido', state: 'todo' },
    { key: 'picking', label: 'Separando e pesando', state: 'todo' },
    { key: 'payment', label: 'Aprovação e pagamento', state: 'todo' },
    { key: 'route', label: pickup ? 'Pronto para retirada' : 'Em rota', state: 'todo' },
    { key: 'done', label: pickup ? 'Retirado' : 'Entregue', state: 'todo' },
  ];
  if (idx < 0) return steps; // cancelado/recusado/rascunho: tudo cinza

  const set = (i: number, state: StepState, hint?: string) => {
    for (let k = 0; k < i; k++) steps[k].state = 'done';
    steps[i].state = state;
    steps[i].hint = hint;
  };

  switch (s.status) {
    case 'PENDING_APPROVAL':
      set(0, 'current', s.freightPending ? 'Recebemos seu pedido. Vamos confirmar os itens e informar o frete.' : 'Recebemos seu pedido. Nossa equipe vai confirmar em breve.');
      break;
    case 'APPROVED':
      set(1, 'current', 'Pedido confirmado — na fila de separação.');
      break;
    case 'PICKING':
      set(1, 'current', 'Estamos separando e pesando as peças do seu pedido.');
      break;
    case 'AWAITING_CUSTOMER':
      set(
        2,
        'attention',
        s.weighing?.decision === 'REJECTED'
          ? 'Você recusou a diferença de peso. Nossa equipe vai entrar em contato.'
          : 'As peças pesaram acima do estimado. Precisamos da sua confirmação.',
      );
      break;
    case 'READY':
      if (!paid) set(2, s.freightPending || s.paymentStatus === 'RECEIPT_SENT' ? 'current' : 'attention', s.freightPending ? 'Aguardando o valor do frete.' : s.paymentStatus === 'RECEIPT_SENT' ? 'Comprovante recebido — aguardando confirmação.' : 'Pedido pesado. Faça o pagamento pelo Pix.');
      else set(3, 'current', pickup ? 'Seu pedido está pronto. Pode vir buscar!' : 'Pagamento confirmado — preparando a expedição.');
      break;
    case 'DISPATCHED':
      set(3, 'current', pickup ? 'Seu pedido está pronto para retirada.' : 'Seu pedido saiu para entrega.');
      if (!paid) steps[2].state = 'attention';
      break;
    case 'DELIVERED':
      steps.forEach((st) => (st.state = 'done'));
      if (!paid) steps[2].state = 'attention';
      break;
  }
  return steps;
}

/** Posição para barras de progresso (0..5). */
export function trackingProgress(s: Sale): number {
  const st = trackingSteps(s);
  const done = st.filter((x) => x.state === 'done').length;
  return done + (st.some((x) => x.state === 'current' || x.state === 'attention') ? 0.5 : 0);
}

/** Rótulo curto do status para o cliente (cabe no celular). */
export function portalStatusLabel(s: Sale): string {
  if (s.status === 'READY') return isPaid(s) ? (s.deliveryMode === 'PICKUP' ? 'Pronto para retirada' : 'Preparando entrega') : s.freightPending ? 'Aguardando frete' : s.paymentStatus === 'RECEIPT_SENT' ? 'Comprovante em análise' : 'Aguardando pagamento';
  if (s.status === 'DISPATCHED' && s.deliveryMode === 'PICKUP') return 'Pronto para retirada';
  if (s.status === 'DELIVERED' && s.deliveryMode === 'PICKUP') return 'Retirado';
  if (s.status === 'AWAITING_CUSTOMER' && s.weighing?.decision === 'REJECTED') return 'Diferença recusada';
  return PORTAL_STATUS_LABELS[s.status];
}

export function portalStatusTone(s: Sale): Tone {
  if (s.status === 'CANCELLED' || s.status === 'REJECTED') return 'danger';
  if (s.status === 'DELIVERED') return 'success';
  if (s.status === 'AWAITING_CUSTOMER') return 'warning';
  if (s.status === 'READY' && !isPaid(s)) return s.paymentStatus === 'RECEIPT_SENT' ? 'info' : 'warning';
  return 'primary';
}
