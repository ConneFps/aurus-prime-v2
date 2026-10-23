/**
 * Proposta comercial: modelo, totais, texto de WhatsApp, Pix e PDF.
 */
import { addDays, date, formatDocument, formatPhone, money, number, qty, round2, today } from '../../../domain/format';
import { buildPixPayload, qrDataUrl } from '../../../domain/pix';
import type { AppSettings, Customer } from '../../../domain/types';
import type { SaleItemInput } from '../../../ops/types';
import { createPdf } from '../../../ui';
import { companyBlock, companyName, signatures } from '../pdf';

export interface ProposalLine {
  key: string;
  productId?: string | null;
  supplyItemId?: string | null;
  name: string;
  unit: 'KG' | 'UN';
  /** Vazio = só preço (lista de preços). */
  qty: number | null;
  price: number;
  refPrice?: number | null;
  category?: string | null;
}

export interface Proposal {
  target: 'CUSTOMER' | 'PROSPECT';
  customerId: string | null;
  prospectName: string;
  prospectPhone: string;
  prospectEmail: string;
  priceTableId: string | null;
  validUntil: string;
  paymentConditions: string;
  deliveryTerms: string;
  freight: number;
  discountPct: number;
  includePix: boolean;
  notes: string;
  lines: ProposalLine[];
}

export function emptyProposal(): Proposal {
  return {
    target: 'CUSTOMER',
    customerId: null,
    prospectName: '',
    prospectPhone: '',
    prospectEmail: '',
    priceTableId: null,
    validUntil: addDays(today(), 7),
    paymentConditions: 'Pix à vista',
    deliveryTerms: 'Entrega em até 2 dias úteis após a confirmação',
    freight: 0,
    discountPct: 0,
    includePix: true,
    notes: '',
    lines: [],
  };
}

export function proposalTotals(p: Proposal, settings: AppSettings) {
  const subtotal = round2(p.lines.reduce((s, l) => s + (l.qty || 0) * (l.price || 0), 0));
  const discount = round2((subtotal * (p.discountPct || 0)) / 100);
  const total = Math.max(0, round2(subtotal - discount + (p.freight || 0)));
  const pixPct = settings.pixDiscountPercent || 0;
  const pixDiscount = p.includePix && pixPct > 0 ? round2(((subtotal - discount) * pixPct) / 100) : 0;
  const pixTotal = Math.max(0, round2(total - pixDiscount));
  const weight = p.lines.filter((l) => l.unit === 'KG').reduce((s, l) => s + (l.qty || 0), 0);
  return { subtotal, discount, total, pixPct, pixDiscount, pixTotal, weight, priced: p.lines.some((l) => (l.qty || 0) > 0) };
}

export interface Recipient {
  name: string;
  document?: string | null;
  phone?: string | null;
  email?: string | null;
  contact?: string | null;
}

export function recipientOf(p: Proposal, customer: Customer | null): Recipient {
  if (p.target === 'CUSTOMER' && customer)
    return {
      name: customer.tradeName || customer.name,
      document: customer.document,
      phone: customer.cellphone || customer.phone,
      email: customer.email,
      contact: customer.contactName,
    };
  return { name: p.prospectName || 'Cliente', phone: p.prospectPhone, email: p.prospectEmail };
}

export function proposalPix(p: Proposal, settings: AppSettings, amount: number) {
  return buildPixPayload({
    pixKey: settings.pixKey || undefined,
    merchantName: settings.pixMerchantName || settings.tradeName || settings.companyName || undefined,
    merchantCity: settings.pixMerchantCity || settings.city || undefined,
    amount,
    txId: 'PROP' + today().replace(/-/g, '') + String(Math.round(amount * 100) % 100000),
    info: 'Proposta',
  });
}

const unitLabel = (u: 'KG' | 'UN') => (u === 'KG' ? 'kg' : 'un');

export function proposalMessage(p: Proposal, settings: AppSettings, r: Recipient): string {
  const t = proposalTotals(p, settings);
  const lines = p.lines.map((l) =>
    l.qty ? `• ${l.name}: ${qty(l.qty, l.unit)} × ${money(l.price)}/${unitLabel(l.unit)} = *${money(l.qty * l.price)}*` : `• ${l.name}: ${money(l.price)}/${unitLabel(l.unit)}`,
  );
  const out = [`*${companyName(settings).toUpperCase()} — PROPOSTA COMERCIAL*`, '', `Olá, ${r.contact || r.name}! Segue nossa proposta:`, '', ...lines];
  if (t.priced) {
    out.push('', `Subtotal: ${money(t.subtotal)}`);
    if (t.discount) out.push(`Desconto (${number(p.discountPct)}%): − ${money(t.discount)}`);
    if (p.freight) out.push(`Frete: ${money(p.freight)}`);
    out.push(`*Total: ${money(t.total)}*`);
    if (t.pixDiscount) out.push(`*No Pix: ${money(t.pixTotal)}* (${number(t.pixPct)}% de desconto)`);
  }
  out.push('');
  if (p.paymentConditions) out.push(`Pagamento: ${p.paymentConditions}`);
  if (p.deliveryTerms) out.push(`Entrega: ${p.deliveryTerms}`);
  out.push(`Proposta válida até ${date(p.validUntil)}.`);
  out.push('_Pesos aproximados — o valor final é confirmado na pesagem._');
  if (p.notes) out.push('', p.notes);
  if (p.includePix && t.priced && t.pixTotal > 0) out.push('', '*Pix copia e cola:*', proposalPix(p, settings, t.pixTotal));
  out.push('', `Obrigado! ${companyName(settings)}`);
  return out.join('\n');
}

export async function proposalPdf(p: Proposal, settings: AppSettings, r: Recipient, sellerName?: string | null) {
  const t = proposalTotals(p, settings);
  const pdf = createPdf({
    title: 'Proposta comercial',
    subtitle: `Para ${r.name} · emitida em ${date(today())} · válida até ${date(p.validUntil)}`,
    company: companyName(settings),
  });
  companyBlock(pdf, settings);
  pdf.keyValues(
    [
      ['Cliente', r.name],
      ['CPF / CNPJ', formatDocument(r.document) || '—'],
      ['Contato', [r.contact, formatPhone(r.phone)].filter(Boolean).join(' · ') || '—'],
      ['E-mail', r.email || '—'],
      ['Vendedor', sellerName || '—'],
      ['Validade', date(p.validUntil)],
    ],
    { title: 'Destinatário' },
  );
  pdf.table(
    p.lines,
    [
      { header: 'Produto', value: (l) => l.name },
      { header: 'Categoria', value: (l) => l.category || '', width: 32 },
      { header: 'Quantidade', value: (l) => (l.qty ? qty(l.qty, l.unit) : '—'), align: 'right', width: 26 },
      { header: 'Preço', value: (l) => `${money(l.price)}/${unitLabel(l.unit)}`, align: 'right', width: 30 },
      { header: 'Total', value: (l) => (l.qty ? money(l.qty * l.price) : ''), align: 'right', width: 30 },
    ],
    { title: 'Itens', foot: t.priced ? ['', '', `${number(t.weight, 3)} kg`, '', money(t.subtotal)] : undefined },
  );
  if (t.priced) {
    const kv: [string, string][] = [['Subtotal', money(t.subtotal)]];
    if (t.discount) kv.push([`Desconto (${number(p.discountPct)}%)`, '− ' + money(t.discount)]);
    if (p.freight) kv.push(['Frete', money(p.freight)]);
    kv.push(['Total', money(t.total)]);
    if (t.pixDiscount) kv.push([`Pagando no Pix (−${number(t.pixPct)}%)`, money(t.pixTotal)]);
    pdf.keyValues(kv, { title: 'Totais' });
  }
  pdf.keyValues(
    [
      ['Pagamento', p.paymentConditions || '—'],
      ['Entrega', p.deliveryTerms || '—'],
    ],
    { title: 'Condições' },
  );
  if (p.includePix && t.priced && t.pixTotal > 0) {
    const payload = proposalPix(p, settings, t.pixTotal);
    pdf.text(`Pague com Pix — ${money(t.pixTotal)}`, { bold: true, size: 11 });
    pdf.image(await qrDataUrl(payload, 300), 36, 36);
    pdf.text(payload, { size: 7.5, color: [90, 90, 90] });
  }
  if (p.notes) {
    pdf.text('Observações', { bold: true, size: 11 });
    pdf.text(p.notes, { size: 9 });
  }
  pdf.text('Pesos aproximados: o valor final é confirmado na pesagem/separação. Preços sujeitos à disponibilidade de estoque.', { size: 8, color: [120, 120, 120] });
  signatures(pdf, ['De acordo — cliente', companyName(settings)]);
  pdf.save(`proposta-${r.name.toLowerCase().replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}`);
}

export function proposalToSaleItems(p: Proposal): SaleItemInput[] {
  return p.lines
    .filter((l) => (l.qty || 0) > 0)
    .map((l) => ({
      kind: l.supplyItemId ? 'SUPPLY' : 'PRODUCT',
      productId: l.productId ?? null,
      supplyItemId: l.supplyItemId ?? null,
      productName: l.name,
      unit: l.unit,
      qtyOrdered: l.qty || 0,
      unitPrice: l.price,
    }));
}
