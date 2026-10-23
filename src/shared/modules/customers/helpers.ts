/**
 * Regras puras e utilitários do módulo de clientes / vendedores externos.
 */
import { onlyDigits, round2, today } from '../../domain/format';
import type { Customer, CustomerRequest, FinancialEntry, PaymentMethod, Sale, SaleStatus } from '../../domain/types';

/** Vendas que NÃO contam como compra (mesma régua de ops.recalcCustomerStats). */
export const NOT_COUNTED: SaleStatus[] = ['DRAFT', 'PENDING_APPROVAL', 'CANCELLED', 'REJECTED'];
export const isCounted = (s: Pick<Sale, 'status'>) => !NOT_COUNTED.includes(s.status);
/** Vendas que geram comissão (estimada): tudo menos rascunho, cancelado e recusado. */
export const isCommissionable = (s: Pick<Sale, 'status'>) => !['DRAFT', 'CANCELLED', 'REJECTED'].includes(s.status);
/** Comissão confirmada: pedido entregue ou pago. */
export const isCommissionConfirmed = (s: Pick<Sale, 'status' | 'paymentStatus'>) =>
  isCommissionable(s) && (s.status === 'DELIVERED' || s.paymentStatus === 'PAID');

export const DEFAULT_ALLOWED_METHODS: PaymentMethod[] = ['PIX', 'BOLETO'];

// ---------------------------------------------------------------------------
// Rascunho do formulário
// ---------------------------------------------------------------------------

export type CustomerDraft = Omit<Customer, 'id' | 'createdAt' | 'updatedAt'> & { id: string; isNew: boolean };

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

export function emptyCustomer(): CustomerDraft {
  return {
    id: newId(),
    isNew: true,
    code: '',
    name: '',
    tradeName: '',
    personType: 'J',
    document: '',
    stateRegistration: '',
    municipalRegistration: '',
    category: 'EXTERNO_CNPJ',
    segment: '',
    zipCode: '',
    street: '',
    number: '',
    complement: '',
    district: '',
    city: '',
    state: '',
    phone: '',
    cellphone: '',
    email: '',
    financialEmail: '',
    contactName: '',
    paymentTerms: '',
    creditLimit: 0,
    preferredPaymentMethod: 'PIX',
    allowedPaymentMethods: [...DEFAULT_ALLOWED_METHODS],
    financialApproval: 'PENDING',
    sellerId: null,
    sellerName: null,
    priceTableId: null,
    isIntercompany: false,
    intercompanyCode: null,
    status: 'ACTIVE',
    ranking: 'BRONZE',
    stars: 0,
    totalPurchases: 0,
    ordersCount: 0,
    lastPurchaseAt: null,
    documents: [],
    notes: '',
  };
}

export function draftFromCustomer(c: Customer): CustomerDraft {
  const { createdAt: _c, updatedAt: _u, ...rest } = c;
  return { ...emptyCustomer(), ...rest, allowedPaymentMethods: c.allowedPaymentMethods || [], documents: c.documents || [], isNew: false };
}

/** Rascunho de cliente a partir de uma solicitação de vendedor externo. */
export function draftFromRequest(r: CustomerRequest): CustomerDraft {
  return {
    ...emptyCustomer(),
    name: r.name,
    tradeName: r.tradeName ?? '',
    personType: r.personType,
    document: r.document,
    category: r.category,
    stateRegistration: r.stateRegistration ?? '',
    contactName: r.contactName ?? '',
    phone: r.phone ?? '',
    cellphone: r.cellphone ?? '',
    email: r.email ?? '',
    zipCode: r.zipCode ?? '',
    street: r.street ?? '',
    number: r.number ?? '',
    complement: r.complement ?? '',
    district: r.district ?? '',
    city: r.city ?? '',
    state: r.state ?? '',
    notes: r.notes ?? '',
    sellerId: r.requestedById,
    sellerName: r.requestedByName,
  };
}

const nul = (s: string | null | undefined) => {
  const t = (s ?? '').trim();
  return t ? t : null;
};

/** Normaliza o rascunho para gravação (documento só dígitos, vazios → null). */
export function draftToRow(d: CustomerDraft): Omit<Customer, 'id' | 'createdAt' | 'updatedAt'> {
  const { id: _id, isNew: _n, ...r } = d;
  const allowed = r.allowedPaymentMethods.length ? r.allowedPaymentMethods : [...DEFAULT_ALLOWED_METHODS];
  const preferred = r.preferredPaymentMethod && allowed.includes(r.preferredPaymentMethod) ? r.preferredPaymentMethod : allowed[0];
  return {
    ...r,
    name: r.name.trim(),
    code: nul(r.code),
    tradeName: nul(r.tradeName),
    document: onlyDigits(r.document),
    stateRegistration: nul(r.stateRegistration),
    municipalRegistration: nul(r.municipalRegistration),
    segment: nul(r.segment),
    zipCode: onlyDigits(r.zipCode) || null,
    street: nul(r.street),
    number: nul(r.number),
    complement: nul(r.complement),
    district: nul(r.district),
    city: nul(r.city),
    state: nul(r.state),
    phone: onlyDigits(r.phone) || null,
    cellphone: onlyDigits(r.cellphone) || null,
    email: nul(r.email)?.toLowerCase() ?? null,
    financialEmail: nul(r.financialEmail)?.toLowerCase() ?? null,
    contactName: nul(r.contactName),
    paymentTerms: nul(r.paymentTerms),
    creditLimit: round2(r.creditLimit || 0),
    allowedPaymentMethods: allowed,
    preferredPaymentMethod: preferred,
    intercompanyCode: r.isIntercompany ? r.intercompanyCode || null : null,
    notes: nul(r.notes),
  };
}

/** Procura outro cliente com o mesmo CPF/CNPJ. */
export function findDuplicate(customers: Customer[], document: string, selfId?: string | null): Customer | null {
  const d = onlyDigits(document);
  if (!d) return null;
  return customers.find((c) => c.id !== selfId && onlyDigits(c.document) === d) || null;
}

// ---------------------------------------------------------------------------
// Exibição
// ---------------------------------------------------------------------------

export const cityLabel = (c: { city?: string | null; state?: string | null }) =>
  c.city ? `${c.city}${c.state ? '/' + c.state : ''}` : '—';

export function addressLine(c: Partial<Pick<Customer, 'street' | 'number' | 'complement' | 'district' | 'city' | 'state'>>) {
  return [[c.street, c.number].filter(Boolean).join(', '), c.complement, c.district, [c.city, c.state].filter(Boolean).join('/')]
    .filter(Boolean)
    .join(' — ');
}

export const displayName = (c: { name: string; tradeName?: string | null }) => c.tradeName || c.name;

/** Link de WhatsApp (Brasil). */
export function whatsappUrl(phone: string | null | undefined, text?: string): string | null {
  let d = onlyDigits(phone);
  if (d.length < 10) return null;
  if (!d.startsWith('55') || d.length <= 11) d = '55' + d;
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export const telUrl = (phone: string | null | undefined) => (onlyDigits(phone).length >= 8 ? `tel:+55${onlyDigits(phone)}` : null);

// ---------------------------------------------------------------------------
// Financeiro do cliente
// ---------------------------------------------------------------------------

export const entryBalance = (e: Pick<FinancialEntry, 'amount' | 'paidAmount'>) => round2((e.amount || 0) - (e.paidAmount || 0));
export const isOverdue = (e: Pick<FinancialEntry, 'status' | 'dueDate'>, ref = today()) => e.status === 'OPEN' && e.dueDate < ref;

export function receivableSummary(entries: FinancialEntry[]) {
  const ref = today();
  let open = 0;
  let overdue = 0;
  let paid = 0;
  for (const e of entries) {
    if (e.direction !== 'IN' || e.status === 'CANCELLED') continue;
    paid += e.paidAmount || 0;
    if (e.status === 'OPEN') {
      const b = entryBalance(e);
      open += b;
      if (e.dueDate < ref) overdue += b;
    }
  }
  return { open: round2(open), overdue: round2(overdue), paid: round2(paid) };
}

/** Chave 'YYYY-MM' dos últimos n meses (do mais antigo ao atual). */
export function lastMonths(n: number, ref = today()): string[] {
  const [y, m] = ref.split('-').map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

/** "set/26" curto para eixos. */
export function shortMonth(key: string): string {
  const [y, m] = key.split('-').map(Number);
  const names = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${names[m - 1]}/${String(y).slice(2)}`;
}

/** Mês por extenso: "setembro de 2026". */
export function longMonth(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}
