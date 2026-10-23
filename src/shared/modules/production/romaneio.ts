/**
 * Romaneio de envio para desossa (PDF) — com transporte, itens, conferência,
 * retornos já registrados e campos de assinatura (3 vias).
 */
import { date, dateTime, formatPhone, kg, money, percent } from '../../domain/format';
import type { ProcessingOrder } from '../../domain/types';
import { createPdf } from '../../ui';
import { orderCostPerKg, PROCESSING_STATUS } from './shared';

export function printRomaneio(order: ProcessingOrder, opts?: { company?: string | null; lotCodes?: Map<string, string> }) {
  const pdf = createPdf({
    title: `Romaneio de envio — ${order.number}`,
    subtitle: `Remessa de matéria-prima para desossa · ${order.partnerName} · enviado em ${date(order.sentDate)}`,
    company: opts?.company || undefined,
  });

  pdf.keyValues(
    [
      ['Desossa / planta', order.partnerName],
      ['Lote de gado', order.batchCode || 'Vários / avulso'],
      ['Data de envio', date(order.sentDate)],
      ['Previsão de retorno', order.expectedReturnDate ? date(order.expectedReturnDate) : 'A definir'],
      ['Situação', PROCESSING_STATUS[order.status].label],
      ['Emitido por', order.createdByName || '—'],
    ],
    { title: '1. Destino' },
  );

  pdf.keyValues(
    [
      ['Motorista', order.driverName || 'Não informado'],
      ['Placa do veículo', order.vehiclePlate || 'Não informada'],
      ['Telefone', order.driverPhone ? formatPhone(order.driverPhone) : 'Não informado'],
      ['Documento de saída (NF/GTA/lacre)', order.dispatchDocument || 'Não informado'],
    ],
    { title: '2. Transporte' },
  );

  const raw = order.sentItems.reduce((s, i) => s + i.qty * (i.unitCost || 0), 0);
  pdf.table(
    order.sentItems.map((it, idx) => ({ ...it, idx })),
    [
      { header: 'Item', value: (r) => String(r.idx + 1).padStart(2, '0'), align: 'center', width: 12 },
      { header: 'Peça / produto', value: (r) => r.productName },
      { header: 'Lote de estoque', value: (r) => (r.lotId && opts?.lotCodes?.get(r.lotId)) || '—' },
      { header: 'Peso (kg)', value: (r) => kg(r.qty), align: 'right' },
      { header: 'Custo/kg', value: (r) => money(r.unitCost), align: 'right' },
      { header: 'Valor', value: (r) => money(r.qty * r.unitCost), align: 'right' },
    ],
    { title: '3. Matéria-prima enviada', foot: ['', `${order.sentItems.length} item(ns)`, '', kg(order.sentKg), '', money(raw)] },
  );

  pdf.keyValues(
    [
      ['Peso total de saída', kg(order.sentKg)],
      ['Custo da desossa', order.processingCost ? money(order.processingCost) : 'Não informado'],
      ['Frete', order.freightCost ? money(order.freightCost) : 'Incluso / isento'],
      ['Custo por kg enviado', money(orderCostPerKg(order))],
    ],
    { title: '4. Conferência da carga' },
  );

  if (order.returns?.length) {
    pdf.table(
      order.returns,
      [
        { header: 'Data', value: (r) => date(r.date) },
        { header: 'Tipo', value: (r) => (r.type === 'TOTAL' ? 'Total' : 'Parcial') },
        { header: 'NF', value: (r) => r.invoiceNumber || '—' },
        { header: 'Cortes (kg)', value: (r) => kg(r.returnedKg), align: 'right' },
        {
          header: 'Perdas (kg)',
          value: (r) =>
            kg(
              (r.losses.bonesKg || 0) + (r.losses.fatKg || 0) + (r.losses.trimmingKg || 0) + (r.losses.evaporationKg || 0) + (r.losses.otherKg || 0) + (r.unclassifiedKg || 0),
            ),
          align: 'right',
        },
        { header: 'Registrado por', value: (r) => `${r.registeredBy || '—'} · ${dateTime(r.registeredAt)}` },
      ],
      {
        title: '5. Retornos registrados',
        foot: ['', '', 'Total', kg(order.returnedKg), kg(order.lossKg), `Rendimento ${percent(order.yieldPercent || 0, 2)}`],
      },
    );
  }

  if (order.notes) pdf.text(`Observações: ${order.notes}`, { size: 9 });

  pdf.space(2);
  pdf.text(
    'Declaro que os produtos cárneos descritos neste romaneio foram pesados e liberados em condições sanitárias e fiscais adequadas, com a documentação pertinente (NF/GTA/lacre), para transporte e processamento na planta indicada.',
    { size: 8, color: [110, 110, 110] },
  );

  // Assinaturas (3 vias)
  const doc = pdf.doc;
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  let y = pdf.y + 16;
  if (y > H - 30) {
    doc.addPage();
    y = 40;
  }
  const M = 14;
  const gap = 8;
  const w = (W - 2 * M - 2 * gap) / 3;
  const sigs: [string, string][] = [
    ['EXPEDIÇÃO', 'Assinatura e data'],
    ['MOTORISTA', `${order.driverName || 'Nome'} · placa ${order.vehiclePlate || '____'}`],
    ['RECEBIMENTO NA DESOSSA', `${order.partnerName} / conferente`],
  ];
  sigs.forEach(([title, sub], i) => {
    const x = M + i * (w + gap);
    doc.setDrawColor(150);
    doc.line(x, y, x + w, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(60);
    doc.text(title, x + w / 2, y + 4, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120);
    doc.text(doc.splitTextToSize(sub, w)[0], x + w / 2, y + 8, { align: 'center' });
  });
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text('1ª via: transportador · 2ª via: desossa · 3ª via: arquivo da expedição', W / 2, H - 14, { align: 'center' });

  pdf.save(`romaneio-${order.number}`);
}
