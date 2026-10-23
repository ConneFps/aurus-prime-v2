/**
 * PDFs e exportações do módulo de vendas (pedido, romaneio, relatório,
 * proposta e tabela de preço). Usa o createPdf padrão do kit de UI.
 */
import { date, dateTime, formatDocument, formatPhone, kg, money, qty, round2 } from '../../domain/format';
import { BILLING_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS, SALE_CHANNEL_LABELS, SALE_STATUS } from '../../domain/labels';
import { buildPixPayload, pixTxidFor, qrDataUrl } from '../../domain/pix';
import type { AppSettings, Customer, FinancialEntry, PriceTable, Product, Sale, StockMovement } from '../../domain/types';
import { createPdf, exportCsv, type PdfDoc } from '../../ui';
import { companyAddress, isOverdue, openBalance } from './helpers';

export const companyName = (s: AppSettings) => s.tradeName || s.companyName;

export function companyBlock(pdf: PdfDoc, s: AppSettings) {
  const lines = [
    [s.companyName, s.document ? `CNPJ ${formatDocument(s.document)}` : null, s.stateRegistration ? `IE ${s.stateRegistration}` : null]
      .filter(Boolean)
      .join(' · '),
    companyAddress(s),
    [s.phone ? formatPhone(s.phone) : null, s.whatsapp ? `WhatsApp ${formatPhone(s.whatsapp.replace(/^55/, ''))}` : null, s.email]
      .filter(Boolean)
      .join(' · '),
  ].filter(Boolean);
  lines.forEach((l) => pdf.text(l, { size: 8.5, color: [110, 110, 110] }));
  pdf.space(2);
}

function customerAddress(c: Customer | null | undefined) {
  if (!c) return '';
  return [[c.street, c.number].filter(Boolean).join(', '), c.complement, c.district, [c.city, c.state].filter(Boolean).join('/')]
    .filter(Boolean)
    .join(' — ');
}

export function signatures(pdf: PdfDoc, labels: string[]) {
  const { doc } = pdf;
  const W = doc.internal.pageSize.getWidth();
  const M = 14;
  if (pdf.y + 26 > doc.internal.pageSize.getHeight() - 16) {
    doc.addPage();
    pdf.y = 20;
  }
  pdf.y += 16;
  const w = (W - 2 * M - (labels.length - 1) * 8) / labels.length;
  doc.setDrawColor(150);
  doc.setFontSize(8);
  doc.setTextColor(110);
  labels.forEach((l, i) => {
    const x = M + i * (w + 8);
    doc.line(x, pdf.y, x + w, pdf.y);
    doc.text(l, x + w / 2, pdf.y + 4, { align: 'center' });
  });
  pdf.y += 10;
}

export function salePixPayload(settings: AppSettings, sale: Pick<Sale, 'number'>, amount: number) {
  return buildPixPayload({
    pixKey: settings.pixKey || undefined,
    merchantName: settings.pixMerchantName || settings.tradeName || settings.companyName || undefined,
    merchantCity: settings.pixMerchantCity || settings.city || undefined,
    amount: round2(amount),
    txId: pixTxidFor(sale.number),
  });
}

// ---------------------------------------------------------------------------
// Pedido
// ---------------------------------------------------------------------------

export async function saleOrderPdf(opts: { sale: Sale; settings: AppSettings; customer?: Customer | null; entries: FinancialEntry[] }) {
  const { sale, settings, customer, entries } = opts;
  const pdf = createPdf({
    title: `Pedido de venda nº ${sale.number}`,
    subtitle: `${date(sale.date)} · ${SALE_STATUS[sale.status]?.label} · ${SALE_CHANNEL_LABELS[sale.channel]}`,
    company: companyName(settings),
  });
  companyBlock(pdf, settings);

  pdf.keyValues(
    [
      ['Cliente', sale.customerName],
      ['CPF / CNPJ', formatDocument(sale.customerDocument || customer?.document) || '—'],
      ['Contato', [customer?.contactName, formatPhone(customer?.cellphone || customer?.phone)].filter(Boolean).join(' · ') || '—'],
      ['E-mail', customer?.email || '—'],
      ['Endereço', sale.shippingAddress || customerAddress(customer) || '—'],
      ['Vendedor', sale.sellerName || '—'],
    ],
    { title: 'Cliente' },
  );

  pdf.keyValues(
    [
      ['Entrega', sale.deliveryMode === 'PICKUP' ? 'Retirada no local' : 'Entrega'],
      ['Data prevista', sale.deliveryDate ? date(sale.deliveryDate) : 'A combinar'],
      ['Pagamento', PAYMENT_METHOD_LABELS[sale.paymentMethod]],
      ['Condição', sale.paymentTerms ? `${sale.paymentTerms} dias` : `${sale.installmentsCount || 1}x`],
      ['Faturamento', BILLING_LABELS[sale.billingType]],
      ['Nota fiscal', sale.invoiceNumber || '—'],
    ],
    { title: 'Entrega e pagamento' },
  );

  const items = (sale.items || []).slice().sort((a, b) => a.position - b.position);
  pdf.table(
    items,
    [
      { header: '#', value: (i) => i.position, width: 8 },
      { header: 'Produto', value: (i) => i.productName + (i.notes ? `\n${i.notes}` : '') },
      { header: 'Quantidade', value: (i) => qty(i.qty, i.unit), align: 'right', width: 26 },
      { header: 'Preço', value: (i) => money(i.unitPrice) + (i.unit === 'KG' ? '/kg' : '/un'), align: 'right', width: 28 },
      { header: 'Total', value: (i) => money(i.total), align: 'right', width: 28 },
    ],
    { title: 'Itens', foot: ['', `${items.length} itens`, kg(sale.totalWeightKg), '', money(sale.itemsSubtotal)] },
  );

  const totals: [string, string][] = [['Subtotal', money(sale.itemsSubtotal)]];
  if (sale.freightValue) totals.push(['Frete', money(sale.freightValue)]);
  if (sale.discountValue) totals.push(['Desconto', '− ' + money(sale.discountValue)]);
  totals.push(['Total do pedido', money(sale.totalValue)]);
  if (sale.weighing && Math.abs(sale.weighing.diffValue) > 0.005)
    totals.push(['Estimado no pedido', money(sale.weighing.estimatedTotal)]);
  pdf.keyValues(totals, { title: 'Totais' });

  const live = entries.filter((e) => e.status !== 'CANCELLED').sort((a, b) => a.installment - b.installment);
  if (live.length) {
    pdf.table(
      live,
      [
        { header: 'Parcela', value: (e) => `${e.installment}/${e.installments}`, width: 22 },
        { header: 'Vencimento', value: (e) => date(e.dueDate) },
        { header: 'Valor', value: (e) => money(e.amount), align: 'right' },
        { header: 'Pago', value: (e) => money(e.paidAmount || 0), align: 'right' },
        { header: 'Situação', value: (e) => (e.status === 'PAID' ? 'Pago' : isOverdue(e) ? 'Vencido' : 'Em aberto') },
      ],
      { title: 'Parcelas' },
    );
  }

  const open = live.length ? openBalance(live) : sale.paymentStatus === 'PAID' ? 0 : sale.totalValue;
  if (sale.paymentMethod === 'PIX' && open > 0.005 && sale.status !== 'CANCELLED' && sale.status !== 'REJECTED') {
    const payload = salePixPayload(settings, sale, open);
    pdf.text(`Pague com Pix — ${money(open)}`, { bold: true, size: 11 });
    pdf.image(await qrDataUrl(payload, 300), 38, 38);
    pdf.text('Pix copia e cola:', { size: 8, color: [110, 110, 110] });
    pdf.text(payload, { size: 7.5 });
  }

  if (sale.customerNotes) {
    pdf.text('Observações', { bold: true, size: 11 });
    pdf.text(sale.customerNotes, { size: 9 });
  }
  signatures(pdf, ['Assinatura do cliente', `${companyName(settings)}`]);
  pdf.save(`pedido-${sale.number}`);
}

// ---------------------------------------------------------------------------
// Romaneio (separação / conferência / entrega)
// ---------------------------------------------------------------------------

export function romaneioPdf(opts: {
  sale: Sale;
  settings: AppSettings;
  customer?: Customer | null;
  movements: StockMovement[];
  lotCodes?: Map<string, string>;
}) {
  const { sale, settings, customer, movements, lotCodes } = opts;
  const pdf = createPdf({
    title: `Romaneio — Pedido ${sale.number}`,
    subtitle: `${sale.customerName} · ${sale.deliveryMode === 'PICKUP' ? 'Retirada' : 'Entrega'} ${sale.deliveryDate ? 'em ' + date(sale.deliveryDate) : 'a combinar'}`,
    company: companyName(settings),
  });
  pdf.keyValues(
    [
      ['Cliente', sale.customerName],
      ['Telefone', formatPhone(customer?.cellphone || customer?.phone) || '—'],
      ['Endereço de entrega', sale.deliveryMode === 'PICKUP' ? settings.pickupAddress || 'Retirada no local' : sale.shippingAddress || customerAddress(customer) || '—'],
      ['CEP', sale.shippingZipCode || customer?.zipCode || '—'],
      ['Data do pedido', date(sale.date)],
      ['Nota fiscal', sale.invoiceNumber || '—'],
    ],
    { title: 'Destino' },
  );
  const lotsBy = new Map<string, string[]>();
  for (const m of movements) {
    if (m.type !== 'SALE' || !m.saleItemId) continue;
    const arr = lotsBy.get(m.saleItemId) || [];
    arr.push(`${lotCodes?.get(m.lotId) || m.lotId.slice(0, 6)} (${kg(Math.abs(m.qty))})`);
    lotsBy.set(m.saleItemId, arr);
  }
  const items = (sale.items || []).filter((i) => i.kind !== 'FREIGHT').sort((a, b) => a.position - b.position);
  pdf.table(
    items,
    [
      { header: '#', value: (i) => i.position, width: 8 },
      { header: 'Produto', value: (i) => i.productName },
      { header: 'Pedido', value: (i) => qty(i.qtyOrdered, i.unit), align: 'right', width: 22 },
      { header: 'Separado', value: (i) => (sale.stockDeducted || sale.pickedAt ? qty(i.qty, i.unit) : '________'), align: 'right', width: 22 },
      { header: 'Emb.', value: (i) => i.packages ?? '', align: 'center', width: 12 },
      { header: 'Lote', value: (i) => i.lotCode || (lotsBy.get(i.id) || []).join(', ') || '' },
      { header: 'Observação de corte', value: (i) => i.notes || '' },
      { header: 'OK', value: () => '[   ]', align: 'center', width: 11 },
    ],
    {
      title: 'Itens',
      foot: [
        '',
        `${items.length} itens`,
        kg(items.filter((i) => i.unit === 'KG').reduce((s, i) => s + i.qtyOrdered, 0)),
        sale.stockDeducted || sale.pickedAt ? kg(sale.totalWeightKg) : '',
        '',
        '',
        '',
        '',
      ],
    },
  );
  if (sale.customerNotes || sale.notes) {
    pdf.text('Observações', { bold: true, size: 11 });
    if (sale.customerNotes) pdf.text(sale.customerNotes, { size: 9 });
    if (sale.notes) pdf.text(sale.notes, { size: 9 });
  }
  signatures(pdf, ['Separado por', 'Conferido por', 'Recebido por (nome / data)']);
  pdf.save(`romaneio-${sale.number}`);
}

// ---------------------------------------------------------------------------
// Relatório de vendas / CSV
// ---------------------------------------------------------------------------

export function salesReportPdf(rows: Sale[], opts: { title: string; subtitle?: string; settings: AppSettings }) {
  const pdf = createPdf({ title: opts.title, subtitle: opts.subtitle, company: companyName(opts.settings), orientation: 'landscape' });
  const total = rows.reduce((s, r) => s + r.totalValue, 0);
  const weight = rows.reduce((s, r) => s + (r.totalWeightKg || 0), 0);
  pdf.table(
    rows,
    [
      { header: 'Nº', value: (s) => s.number, width: 22 },
      { header: 'Data', value: (s) => date(s.date), width: 22 },
      { header: 'Cliente', value: (s) => s.customerName },
      { header: 'Vendedor', value: (s) => s.sellerName || '' },
      { header: 'Canal', value: (s) => SALE_CHANNEL_LABELS[s.channel], width: 30 },
      { header: 'NF', value: (s) => s.invoiceNumber || '', width: 20 },
      { header: 'Peso', value: (s) => kg(s.totalWeightKg), align: 'right', width: 24 },
      { header: 'Total', value: (s) => money(s.totalValue), align: 'right', width: 28 },
      { header: 'Status', value: (s) => SALE_STATUS[s.status]?.label, width: 32 },
      { header: 'Pagamento', value: (s) => PAYMENT_STATUS[s.paymentStatus]?.label, width: 28 },
    ],
    { foot: ['', '', `${rows.length} pedidos`, '', '', '', kg(weight), money(total), '', ''] },
  );
  pdf.save(opts.title.toLowerCase().replace(/[^a-z0-9]+/gi, '-'));
}

export function exportSalesCsv(filename: string, rows: Sale[]) {
  exportCsv(filename, rows, [
    { header: 'Número', value: (s) => s.number },
    { header: 'Data', value: (s) => date(s.date) },
    { header: 'Cliente', value: (s) => s.customerName },
    { header: 'Documento', value: (s) => s.customerDocument },
    { header: 'Canal', value: (s) => SALE_CHANNEL_LABELS[s.channel] },
    { header: 'Vendedor', value: (s) => s.sellerName },
    { header: 'Status', value: (s) => SALE_STATUS[s.status]?.label },
    { header: 'Pagamento', value: (s) => PAYMENT_STATUS[s.paymentStatus]?.label },
    { header: 'Forma de pagamento', value: (s) => PAYMENT_METHOD_LABELS[s.paymentMethod] },
    { header: 'Prazos', value: (s) => s.paymentTerms },
    { header: 'Itens', value: (s) => (s.items || []).map((i) => `${i.productName} (${qty(i.qty, i.unit)})`).join(' | ') },
    { header: 'Peso (kg)', value: (s) => s.totalWeightKg },
    { header: 'Subtotal', value: (s) => s.itemsSubtotal },
    { header: 'Frete', value: (s) => s.freightValue },
    { header: 'Desconto', value: (s) => s.discountValue },
    { header: 'Total', value: (s) => s.totalValue },
    { header: 'Comissão', value: (s) => s.commissionValue },
    { header: 'NF', value: (s) => s.invoiceNumber },
    { header: 'Boleto', value: (s) => s.boletoNumber },
    { header: 'Entrega', value: (s) => (s.deliveryMode === 'PICKUP' ? 'Retirada' : 'Entrega') },
    { header: 'Data de entrega', value: (s) => (s.deliveryDate ? date(s.deliveryDate) : '') },
    { header: 'Criado em', value: (s) => dateTime(s.createdAt) },
  ]);
}

// ---------------------------------------------------------------------------
// Tabela de preço
// ---------------------------------------------------------------------------

export function priceTablePdf(table: PriceTable, products: Product[], settings: AppSettings) {
  const cat = new Map(products.map((p) => [p.id, p.category]));
  const rows = table.items
    .slice()
    .sort((a, b) => (cat.get(a.productId) || '').localeCompare(cat.get(b.productId) || '', 'pt-BR') || a.productName.localeCompare(b.productName, 'pt-BR'));
  const validity = [table.validFrom ? `de ${date(table.validFrom)}` : null, table.validTo ? `até ${date(table.validTo)}` : null].filter(Boolean).join(' ');
  const pdf = createPdf({
    title: table.name,
    subtitle: `Tabela de preços${validity ? ` · válida ${validity}` : ''} · ${rows.length} produtos`,
    company: companyName(settings),
  });
  companyBlock(pdf, settings);
  pdf.table(rows, [
    { header: 'Categoria', value: (i) => cat.get(i.productId) || '', width: 36 },
    { header: 'Produto', value: (i) => i.productName },
    { header: 'Unidade', value: (i) => (i.unit === 'KG' ? 'kg' : 'un'), align: 'center', width: 20 },
    { header: 'Preço', value: (i) => money(i.price), align: 'right', width: 32 },
  ]);
  pdf.text('Preços sujeitos a disponibilidade de estoque. Peso final confirmado na separação.', { size: 8, color: [120, 120, 120] });
  pdf.save(`tabela-${table.name}`);
}

export function priceTableCsv(table: PriceTable, products: Product[]) {
  const cat = new Map(products.map((p) => [p.id, p.category]));
  exportCsv(`tabela-${table.name}`, table.items, [
    { header: 'Categoria', value: (i) => cat.get(i.productId) || '' },
    { header: 'Produto', value: (i) => i.productName },
    { header: 'Unidade', value: (i) => (i.unit === 'KG' ? 'kg' : 'un') },
    { header: 'Preço', value: (i) => i.price },
  ]);
}
