/**
 * Apoio da tela interna do portal.
 */
import type { Sale } from '../../../domain/types';
import type { SaleInput } from '../../../ops/types';

/** Reconstrói a entrada de uma venda existente (para ops.updateSale), mantendo itens e ids. */
export function saleToInput(sale: Sale, patch: Partial<SaleInput> = {}): SaleInput {
  return {
    channel: sale.channel,
    customerId: sale.customerId,
    sellerId: sale.sellerId ?? null,
    commissionRate: sale.commissionRate,
    priceTableId: sale.priceTableId ?? null,
    date: sale.date,
    deliveryDate: sale.deliveryDate ?? null,
    deliveryMode: sale.deliveryMode,
    deliveryWindow: sale.deliveryWindow ?? null,
    shippingZipCode: sale.shippingZipCode ?? null,
    shippingAddress: sale.shippingAddress ?? null,
    freightZoneId: sale.freightZoneId ?? null,
    freightValue: sale.freightValue || 0,
    freightPending: !!sale.freightPending,
    paymentMethod: sale.paymentMethod,
    billingType: sale.billingType,
    paymentTerms: sale.paymentTerms ?? null,
    installmentsCount: sale.installmentsCount || 1,
    firstDueDate: sale.firstDueDate ?? null,
    discountValue: sale.discountValue || 0,
    isIntercompany: sale.isIntercompany,
    company: sale.company ?? null,
    invoiceNumber: sale.invoiceNumber ?? null,
    boletoNumber: sale.boletoNumber ?? null,
    customerNotes: sale.customerNotes ?? null,
    notes: sale.notes ?? null,
    portalAccountId: sale.portalAccountId ?? null,
    items: (sale.items || [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((i) => ({
        id: i.id,
        kind: i.kind,
        productId: i.productId ?? null,
        supplyItemId: i.supplyItemId ?? null,
        productName: i.productName,
        unit: i.unit,
        qtyOrdered: i.qtyOrdered,
        qty: i.qty,
        unitPrice: i.unitPrice,
        lotId: i.lotId ?? null,
        lotCode: i.lotCode ?? null,
        packages: i.packages ?? null,
        notes: i.notes ?? null,
      })),
    ...patch,
  };
}

export type OrderQueue = 'NEW' | 'FREIGHT' | 'CUSTOMER' | 'RECEIPT' | 'READY' | 'ALL';

const EDITABLE: Sale['status'][] = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PICKING'];

export function isFreightEditable(s: Sale) {
  return EDITABLE.includes(s.status) && !s.stockDeducted;
}

export function inQueue(s: Sale, q: OrderQueue): boolean {
  switch (q) {
    case 'NEW':
      return s.status === 'PENDING_APPROVAL';
    case 'FREIGHT':
      return !!s.freightPending && EDITABLE.includes(s.status);
    case 'CUSTOMER':
      return s.status === 'AWAITING_CUSTOMER';
    case 'RECEIPT':
      return s.paymentStatus === 'RECEIPT_SENT' && s.status !== 'CANCELLED' && s.status !== 'REJECTED';
    case 'READY':
      return s.status === 'READY';
    default:
      return true;
  }
}
