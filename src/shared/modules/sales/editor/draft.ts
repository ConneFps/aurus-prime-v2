/**
 * Estado do formulário de venda (rascunho local) e conversões.
 */
import { addDays, today } from '../../../domain/format';
import type { BillingType, CompanyCode, PaymentMethod, Sale, SaleChannel, SaleItemKind } from '../../../domain/types';
import type { SaleInput, SaleItemInput } from '../../../ops/types';
import { NO_CHARGE_METHODS } from '../helpers';

export interface Line {
  key: string;
  id?: string;
  kind: SaleItemKind;
  productId?: string | null;
  supplyItemId?: string | null;
  productName: string;
  unit: 'KG' | 'UN';
  qtyOrdered: number;
  unitPrice: number;
  /** Preço de referência (tabela / cadastro) — para mostrar diferenças. */
  refPrice?: number | null;
  lotId?: string | null;
  lotCode?: string | null;
  packages?: number | null;
  notes?: string | null;
}

export type FreightMode = 'ZONE' | 'MANUAL' | 'PENDING';
export type TermsMode = 'TERMS' | 'INSTALLMENTS';

export interface Draft {
  id?: string;
  number?: string;
  status?: Sale['status'];
  channel: SaleChannel;
  customerId: string | null;
  priceTableId: string | null;
  sellerId: string | null;
  commissionRate: number | null;
  /** Comissão digitada à mão (não recalcula ao trocar vendedor). */
  commissionTouched?: boolean;
  date: string;
  deliveryMode: 'DELIVERY' | 'PICKUP';
  deliveryDate: string | null;
  deliveryWindow: 'A' | 'B' | null;
  shippingZipCode: string;
  shippingAddress: string;
  freightMode: FreightMode;
  freightZoneId: string | null;
  freightValue: number;
  paymentMethod: PaymentMethod;
  billingType: BillingType;
  termsMode: TermsMode;
  paymentTerms: string;
  installmentsCount: number;
  firstDueDate: string | null;
  discountValue: number;
  company: CompanyCode | null;
  customerNotes: string;
  notes: string;
  deductNow: boolean;
  lines: Line[];
}

/** Dados para abrir o formulário já preenchido (duplicar, proposta, ?cliente=). */
export interface SaleDraftSeed {
  customerId?: string | null;
  priceTableId?: string | null;
  items?: SaleItemInput[];
  paymentMethod?: PaymentMethod;
  billingType?: BillingType;
  paymentTerms?: string | null;
  deliveryMode?: 'DELIVERY' | 'PICKUP';
  freightValue?: number | null;
  discountValue?: number | null;
  customerNotes?: string | null;
  notes?: string | null;
}

let seq = 0;
export const newKey = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

export function lineFromInput(i: SaleItemInput & { refPrice?: number | null }): Line {
  return {
    key: newKey(),
    id: i.id,
    kind: i.kind,
    productId: i.productId ?? null,
    supplyItemId: i.supplyItemId ?? null,
    productName: i.productName,
    unit: i.unit,
    qtyOrdered: i.qtyOrdered,
    unitPrice: i.unitPrice,
    refPrice: i.refPrice ?? null,
    lotId: i.lotId ?? null,
    lotCode: i.lotCode ?? null,
    packages: i.packages ?? null,
    notes: i.notes ?? null,
  };
}

export function emptyDraft(): Draft {
  return {
    channel: 'INTERNAL',
    customerId: null,
    priceTableId: null,
    sellerId: null,
    commissionRate: null,
    date: today(),
    deliveryMode: 'DELIVERY',
    deliveryDate: null,
    deliveryWindow: null,
    shippingZipCode: '',
    shippingAddress: '',
    freightMode: 'ZONE',
    freightZoneId: null,
    freightValue: 0,
    paymentMethod: 'PIX',
    billingType: 'NF_BOLETO',
    termsMode: 'TERMS',
    paymentTerms: '',
    installmentsCount: 1,
    firstDueDate: addDays(today(), 30),
    discountValue: 0,
    company: null,
    customerNotes: '',
    notes: '',
    deductNow: false,
    lines: [],
  };
}

export function draftFromSale(s: Sale): Draft {
  const freightItems = (s.items || []).filter((i) => i.kind === 'FREIGHT').reduce((a, i) => a + i.total, 0);
  return {
    ...emptyDraft(),
    id: s.id,
    number: s.number,
    status: s.status,
    channel: s.channel,
    customerId: s.customerId,
    priceTableId: s.priceTableId ?? null,
    sellerId: s.sellerId ?? null,
    commissionRate: s.commissionRate,
    commissionTouched: true,
    date: s.date,
    deliveryMode: s.deliveryMode,
    deliveryDate: s.deliveryDate ?? null,
    deliveryWindow: s.deliveryWindow ?? null,
    shippingZipCode: s.shippingZipCode || '',
    shippingAddress: s.shippingAddress || '',
    freightMode: s.freightPending ? 'PENDING' : s.freightZoneId ? 'ZONE' : 'MANUAL',
    freightZoneId: s.freightZoneId ?? null,
    freightValue: Math.max(0, (s.freightValue || 0) - freightItems),
    paymentMethod: s.paymentMethod,
    billingType: s.billingType,
    termsMode: s.paymentTerms ? 'TERMS' : 'INSTALLMENTS',
    paymentTerms: s.paymentTerms || '',
    installmentsCount: s.installmentsCount || 1,
    firstDueDate: s.firstDueDate ?? addDays(s.date, 30),
    discountValue: s.discountValue || 0,
    company: s.company ?? null,
    customerNotes: s.customerNotes || '',
    notes: s.notes || '',
    lines: (s.items || [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((i) =>
        lineFromInput({
          id: i.id,
          kind: i.kind,
          productId: i.productId,
          supplyItemId: i.supplyItemId,
          productName: i.productName,
          unit: i.unit,
          qtyOrdered: i.qtyOrdered,
          unitPrice: i.unitPrice,
          lotId: i.lotId,
          lotCode: i.lotCode,
          packages: i.packages,
          notes: i.notes,
        }),
      ),
  };
}

export function draftFromSeed(seed: SaleDraftSeed): Draft {
  const d = emptyDraft();
  return {
    ...d,
    customerId: seed.customerId ?? null,
    priceTableId: seed.priceTableId ?? null,
    paymentMethod: seed.paymentMethod ?? d.paymentMethod,
    billingType: seed.billingType ?? d.billingType,
    paymentTerms: seed.paymentTerms ?? '',
    deliveryMode: seed.deliveryMode ?? d.deliveryMode,
    freightMode: seed.freightValue ? 'MANUAL' : d.freightMode,
    freightValue: seed.freightValue ?? 0,
    discountValue: seed.discountValue ?? 0,
    customerNotes: seed.customerNotes ?? '',
    notes: seed.notes ?? '',
    lines: (seed.items || []).map((i) => lineFromInput({ ...i, id: undefined })),
  };
}

export function draftToInput(d: Draft, status: SaleInput['status']): SaleInput {
  const noCharge = NO_CHARGE_METHODS.includes(d.paymentMethod);
  return {
    channel: d.channel,
    customerId: d.customerId || '',
    sellerId: d.sellerId,
    commissionRate: noCharge ? 0 : d.commissionRate,
    priceTableId: d.priceTableId,
    date: d.date,
    deliveryDate: d.deliveryDate || null,
    deliveryMode: d.deliveryMode,
    deliveryWindow: d.deliveryWindow,
    shippingZipCode: d.deliveryMode === 'DELIVERY' ? d.shippingZipCode || null : null,
    shippingAddress: d.deliveryMode === 'DELIVERY' ? d.shippingAddress || null : null,
    freightZoneId: d.deliveryMode === 'DELIVERY' && d.freightMode === 'ZONE' ? d.freightZoneId : null,
    freightValue: d.deliveryMode === 'PICKUP' || d.freightMode === 'PENDING' ? 0 : d.freightValue || 0,
    freightPending: d.deliveryMode === 'DELIVERY' && d.freightMode === 'PENDING',
    paymentMethod: d.paymentMethod,
    billingType: d.billingType,
    paymentTerms: noCharge ? null : d.termsMode === 'TERMS' ? d.paymentTerms.trim() || null : null,
    installmentsCount: noCharge ? 1 : d.termsMode === 'INSTALLMENTS' ? Math.max(1, d.installmentsCount || 1) : 1,
    firstDueDate: noCharge ? null : d.termsMode === 'INSTALLMENTS' ? d.firstDueDate : null,
    discountValue: d.discountValue || 0,
    company: d.company,
    customerNotes: d.customerNotes.trim() || null,
    notes: d.notes.trim() || null,
    status,
    deductNow: !d.id && d.deductNow,
    items: d.lines
      .filter((l) => (l.qtyOrdered || 0) > 0)
      .map((l) => ({
        id: l.id,
        kind: l.kind,
        productId: l.productId ?? null,
        supplyItemId: l.supplyItemId ?? null,
        productName: l.productName,
        unit: l.unit,
        qtyOrdered: l.qtyOrdered,
        unitPrice: l.unitPrice || 0,
        lotId: l.lotId ?? null,
        lotCode: l.lotCode ?? null,
        packages: l.packages ?? null,
        notes: l.notes?.trim() || null,
      })),
  };
}
