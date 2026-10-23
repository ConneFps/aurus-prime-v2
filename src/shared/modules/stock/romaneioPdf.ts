/**
 * Romaneio de expedição (após a pesagem) ou lista de separação (antes).
 * Traz lotes usados para rastreabilidade e espaço para assinaturas.
 */
import { date, formatDocument, formatPhone, money, number, qty as fmtQty } from '../../domain/format';
import { BILLING_LABELS, PAYMENT_METHOD_LABELS, SALE_CHANNEL_LABELS } from '../../domain/labels';
import type { Customer, Sale, SaleItem, StockLot, StockMovement } from '../../domain/types';
import { createPdf } from '../../ui';
import { lotsForProduct, saleOrigin } from './model';

export interface LotUse {
  lot: StockLot | null;
  lotId: string;
  qty: number;
}

/** Lotes efetivamente baixados por item (líquido de estornos). */
export function lotsUsedByItem(movements: StockMovement[], lots: StockLot[]): Map<string, LotUse[]> {
  const byLot = new Map(lots.map((l) => [l.id, l]));
  const net = new Map<string, Map<string, number>>();
  for (const m of movements) {
    if ((m.type !== 'SALE' && m.type !== 'SALE_REVERSAL') || !m.saleItemId) continue;
    const perItem = net.get(m.saleItemId) || new Map<string, number>();
    perItem.set(m.lotId, (perItem.get(m.lotId) || 0) + m.qty);
    net.set(m.saleItemId, perItem);
  }
  const out = new Map<string, LotUse[]>();
  for (const [itemId, perLot] of net) {
    const uses = [...perLot]
      .filter(([, q]) => q < -0.0005)
      .map(([lotId, q]) => ({ lotId, lot: byLot.get(lotId) || null, qty: Math.round(-q * 1000) / 1000 }));
    if (uses.length) out.set(itemId, uses);
  }
  return out;
}

const lotLabel = (u: LotUse) => {
  const l = u.lot;
  if (!l) return `${number(u.qty, 3)}`;
  const code = l.lotCode || l.batchCode || 'lote s/ código';
  return `${code}${l.batchCode && l.lotCode ? ` (${l.batchCode})` : ''}${l.expiryDate ? ` val. ${date(l.expiryDate)}` : ''}`;
};

export function printRomaneio(opts: {
  sale: Sale;
  customer: Customer | null;
  movements: StockMovement[];
  lots: StockLot[];
  pickupAddress?: string | null;
}) {
  const { sale, customer, movements, lots } = opts;
  const picked = !!sale.pickedAt && ['READY', 'DISPATCHED', 'DELIVERED', 'AWAITING_CUSTOMER'].includes(sale.status);
  const used = lotsUsedByItem(movements, lots);
  const origin = saleOrigin(sale);

  const pdf = createPdf({
    title: picked ? `Romaneio de expedição — pedido ${sale.number}` : `Lista de separação — pedido ${sale.number}`,
    subtitle: `${sale.customerName}${sale.deliveryDate ? ` · ${sale.deliveryMode === 'PICKUP' ? 'retirada' : 'entrega'} em ${date(sale.deliveryDate)}` : ''}`,
  });

  const phone = [customer?.cellphone, customer?.phone].filter(Boolean).map((p) => formatPhone(p)).join(' / ');
  pdf.keyValues([
    ['Cliente', customer?.tradeName ? `${sale.customerName} (${customer.tradeName})` : sale.customerName],
    ['CPF/CNPJ', formatDocument(sale.customerDocument || customer?.document) || '—'],
    ['Telefone', phone || '—'],
    ['Contato', customer?.contactName || '—'],
    [
      sale.deliveryMode === 'PICKUP' ? 'Retirada' : 'Entrega',
      sale.deliveryMode === 'PICKUP' ? opts.pickupAddress || 'No balcão' : sale.shippingAddress || '—',
    ],
    ['Data / janela', `${date(sale.deliveryDate || sale.date)}${sale.deliveryWindow ? ` · janela ${sale.deliveryWindow}` : ''}`],
    ['Pedido', `${sale.number} de ${date(sale.date)} · ${SALE_CHANNEL_LABELS[sale.channel]}`],
    ['Vendedor', sale.sellerName || '—'],
    ['Pagamento', `${PAYMENT_METHOD_LABELS[sale.paymentMethod]}${sale.paymentTerms ? ` · ${sale.paymentTerms} dias` : ''}`],
    ['Faturamento', `${BILLING_LABELS[sale.billingType]}${sale.invoiceNumber ? ` · NF ${sale.invoiceNumber}` : ''}`],
  ]);

  const items = [...(sale.items || [])].sort((a, b) => (a.position || 0) - (b.position || 0));
  if (picked) {
    const meatKg = items.filter((i) => i.kind === 'PRODUCT' && i.unit === 'KG').reduce((s, i) => s + (i.qty || 0), 0);
    pdf.table(
      items,
      [
        { header: '#', value: (i: SaleItem) => items.indexOf(i) + 1, width: 8 },
        { header: 'Produto', value: (i) => (i.notes ? `${i.productName}\nObs.: ${i.notes}` : i.productName) },
        {
          header: 'Lote(s) — rastreabilidade',
          value: (i) =>
            i.kind === 'PRODUCT' ? (used.get(i.id) || []).map((u) => `${lotLabel(u)}: ${fmtQty(u.qty, i.unit)}`).join('\n') || 'sem baixa' : '—',
        },
        { header: 'Pct.', value: (i) => i.packages ?? '', align: 'right', width: 12 },
        { header: 'Qtd / peso', value: (i) => fmtQty(i.qty, i.unit), align: 'right' },
        { header: 'Preço', value: (i) => money(i.unitPrice), align: 'right' },
        { header: 'Subtotal', value: (i) => money(i.total), align: 'right' },
      ],
      { title: 'Itens conferidos', foot: ['', 'Total de carnes', '', '', `${number(meatKg, 3)} kg`, '', money(sale.totalValue)] },
    );
    const extra: [string, string][] = [];
    if (sale.freightValue) extra.push(['Frete', money(sale.freightValue)]);
    if (sale.discountValue) extra.push(['Desconto', money(-sale.discountValue)]);
    if (sale.estimatedTotal && Math.abs(sale.estimatedTotal - sale.totalValue) > 0.005)
      extra.push(['Estimado no pedido', money(sale.estimatedTotal)], ['Total após pesagem', money(sale.totalValue)]);
    if (extra.length) pdf.keyValues(extra);
  } else {
    pdf.table(
      items,
      [
        { header: '#', value: (i: SaleItem) => items.indexOf(i) + 1, width: 8 },
        { header: 'Produto', value: (i) => (i.notes ? `${i.productName}\nObs.: ${i.notes}` : i.productName) },
        { header: 'Pedido', value: (i) => fmtQty(i.qtyOrdered, i.unit), align: 'right' },
        {
          header: 'Lote sugerido (FIFO)',
          value: (i) => {
            if (i.kind !== 'PRODUCT' || !i.productId) return '—';
            const l = i.lotId ? lots.find((x) => x.id === i.lotId) : lotsForProduct(lots, i.productId, origin)[0];
            return l ? `${l.lotCode || l.batchCode || 's/ código'}${l.expiryDate ? ` val. ${date(l.expiryDate)}` : ''}` : 'sem saldo';
          },
        },
        { header: 'Peso real', value: () => '', width: 26 },
        { header: 'Pct.', value: () => '', width: 14 },
      ],
      { title: 'Itens a separar' },
    );
  }

  if (sale.customerNotes?.trim()) pdf.text(`Observações do cliente: ${sale.customerNotes.trim()}`, { size: 9 });
  if (sale.notes?.trim()) pdf.text(`Observações internas: ${sale.notes.trim()}`, { size: 9 });

  // Assinaturas
  const doc = pdf.doc;
  const H = doc.internal.pageSize.getHeight();
  if (pdf.y > H - 55) {
    doc.addPage();
    pdf.y = 20;
  }
  pdf.space(4);
  pdf.text(
    picked
      ? 'Declaro que recebi os produtos acima, pesados e conferidos, em perfeito estado de conservação e temperatura.'
      : 'Separação conferida por: ______________________   Data/hora: ____/____/______ ____:____',
    { size: 9 },
  );
  const y = pdf.y + 22;
  doc.setDrawColor(120);
  doc.line(14, y, 92, y);
  doc.line(118, y, 196, y);
  doc.setFontSize(8.5);
  doc.setTextColor(80);
  doc.text(picked ? 'Responsável pela expedição' : 'Separador', 14, y + 5);
  doc.text(picked ? 'Recebedor (nome legível)' : 'Conferente', 118, y + 5);
  if (picked) doc.text('Documento: ______________________   Data: ____/____/______', 118, y + 11);
  pdf.y = y + 16;

  pdf.save(`${picked ? 'romaneio' : 'separacao'}-${sale.number}`);
}
