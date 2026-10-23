/**
 * Relatórios PDF: plantel e ficha individual do equino.
 */
import { date, money, number } from '../../domain/format';
import { EQUINE_EVENT_LABELS, EQUINE_SEX_LABELS, EQUINE_STATUS } from '../../domain/labels';
import type { Equine, EquineEvent, EquineSale, FinancialEntry, SemenPurchase } from '../../domain/types';
import { createPdf } from '../../ui';
import { EVENT_SPECS } from './eventSpecs';
import { ageLabel, ENTRY_STATUS, entryStatus, eventCost, eventIncome, gestation, isInHerd, REPRO_STATUS, SEMEN_STATUS, SEMEN_STORAGE, semenStatus } from './model';

/** Fonte padrão do PDF (WinAnsi) não tem subscrito. */
const storage = (t: SemenPurchase['storageType']) => SEMEN_STORAGE[t].replace('₂', '2');
const place = (e: Equine) => [e.haras, e.paddock].filter(Boolean).join(' / ') || '—';

export function exportHerdPdf(equines: Equine[], events: EquineEvent[]) {
  const herd = equines.filter(isInHerd);
  const pdf = createPdf({
    title: 'Relatório do plantel de equinos',
    subtitle: `${equines.length} animal(is) listado(s) · ${herd.length} no plantel`,
    orientation: 'landscape',
  });
  const ids = new Set(equines.map((e) => e.id));
  const evs = events.filter((e) => ids.has(e.equineId));
  const count = (pred: (e: Equine) => boolean) => String(equines.filter(pred).length);
  pdf.keyValues(
    [
      ['Éguas', count((e) => e.sex === 'EGUA')],
      ['Garanhões', count((e) => e.sex === 'GARANHAO')],
      ['Castrados', count((e) => e.sex === 'CASTRADO')],
      ['Gestantes', count((e) => !!gestation(e))],
      ['Despesas registradas', money(evs.reduce((s, e) => s + eventCost(e), 0))],
      ['Receitas e prêmios', money(evs.reduce((s, e) => s + eventIncome(e), 0))],
      ['Valor estimado do plantel', money(herd.filter((e) => ids.has(e.id)).reduce((s, e) => s + (e.estimatedValue || 0), 0))],
    ],
    { title: 'Resumo' },
  );
  pdf.table(
    [...equines].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [
      { header: 'Nome', value: (e) => e.name },
      { header: 'Sexo', value: (e) => EQUINE_SEX_LABELS[e.sex] },
      { header: 'Raça / pelagem', value: (e) => [e.breed, e.coat].filter(Boolean).join(' / ') },
      { header: 'Idade', value: (e) => ageLabel(e.birthDate) },
      { header: 'Status', value: (e) => EQUINE_STATUS[e.status].label },
      { header: 'Registro', value: (e) => e.registry || '' },
      { header: 'Pai × Mãe', value: (e) => [e.sireName, e.damName].filter(Boolean).join(' × ') },
      { header: 'Haras / baia', value: place },
      { header: 'Parto previsto', value: (e) => (gestation(e) ? date(gestation(e)!.dueDate) : '') },
      { header: 'Valor estimado', value: (e) => (e.estimatedValue ? money(e.estimatedValue) : ''), align: 'right' },
    ],
    { title: 'Animais' },
  );
  pdf.save('plantel-equinos');
}

export function exportEquinePdf(e: Equine, events: EquineEvent[], sales: EquineSale[], entries: FinancialEntry[], semenUsed: SemenPurchase[] = []) {
  const pdf = createPdf({
    title: `Ficha do equino — ${e.name}`,
    subtitle: [EQUINE_SEX_LABELS[e.sex], e.breed, e.coat, ageLabel(e.birthDate, true), EQUINE_STATUS[e.status].label].filter(Boolean).join(' · '),
  });
  pdf.keyValues(
    [
      ['Nascimento', date(e.birthDate)],
      ['Registro', [e.registry, e.secondaryRegistry].filter(Boolean).join(' / ') || '—'],
      ['Microchip', e.chipId || '—'],
      ['Altura', e.heightCm ? `${number(e.heightCm, 0)} cm` : '—'],
      ['Peso atual / ideal', `${e.weightKg ? number(e.weightKg, 1) + ' kg' : '—'} / ${e.idealWeightKg ? number(e.idealWeightKg, 1) + ' kg' : '—'}`],
      ['Marcações', e.markings || '—'],
      ['Haras / baia', place(e)],
      ['Responsável', e.manager || '—'],
      ['Valor de compra', e.purchaseValue ? money(e.purchaseValue) : '—'],
      ['Valor estimado', e.estimatedValue ? money(e.estimatedValue) : '—'],
    ],
    { title: 'Identificação' },
  );
  pdf.keyValues(
    [
      ['Pai', [e.sireName, e.sireRegistry].filter(Boolean).join(' — ') || '—'],
      ['Mãe', [e.damName, e.damRegistry].filter(Boolean).join(' — ') || '—'],
      ['Avô paterno', e.paternalGrandsire || '—'],
      ['Avó paterna', e.paternalGranddam || '—'],
      ['Avô materno', e.maternalGrandsire || '—'],
      ['Avó materna', e.maternalGranddam || '—'],
    ],
    { title: 'Genealogia' },
  );
  if (e.geneticNotes) pdf.text(`Observações genéticas: ${e.geneticNotes}`, { size: 9 });

  const g = gestation(e);
  if (e.reproStatus || g) {
    pdf.keyValues(
      [
        ['Situação reprodutiva', e.reproStatus ? REPRO_STATUS[e.reproStatus].label : '—'],
        ['Fertilidade', e.fertilityRating || '—'],
        ...((e.sex === 'EGUA'
          ? [
              ['Cobertura', [date(e.coverDate), e.coverStallion].filter((x) => x && x !== '—').join(' — ') || '—'],
              ['Diagnóstico de prenhez', date(e.pregnancyDiagnosisDate)],
              ['Previsão de parto', g ? `${date(g.dueDate)} (${g.daysLeft >= 0 ? `faltam ${g.daysLeft} dias` : 'data passada'})` : date(e.expectedFoalingDate)],
            ]
          : []) as [string, string][]),
      ],
      { title: 'Reprodução' },
    );
  }

  const sorted = [...events].sort((a, b) => (a.date < b.date ? 1 : -1));
  if (sorted.length) {
    pdf.table(
      sorted,
      [
        { header: 'Data', value: (x) => date(x.date), width: 20 },
        { header: 'Tipo', value: (x) => EQUINE_EVENT_LABELS[x.type].label, width: 30 },
        { header: 'Descrição', value: (x) => x.title },
        { header: 'Detalhes', value: (x) => EVENT_SPECS[x.type].summary(x) },
        { header: 'Valor', value: (x) => (x.amount ? `${eventIncome(x) ? '+' : '-'} ${money(x.amount)}` : ''), align: 'right', width: 26 },
      ],
      { title: 'Histórico de eventos' },
    );
  }

  const cost = events.reduce((s, x) => s + eventCost(x), 0);
  const income = events.reduce((s, x) => s + eventIncome(x), 0);
  const sale = sales.find((s) => s.status === 'ACTIVE');
  pdf.keyValues(
    [
      ['Despesas', money(cost)],
      ['Receitas e prêmios', money(income)],
      ['Venda', sale ? `${money(sale.totalPrice)} — ${sale.buyerName} em ${date(sale.date)}` : '—'],
      ['Resultado', money(income + (sale?.totalPrice || 0) - cost)],
    ],
    { title: 'Resumo financeiro' },
  );
  if (sale && entries.length) {
    pdf.table(
      entries.filter((x) => x.equineSaleId === sale.id).sort((a, b) => a.installment - b.installment),
      [
        { header: 'Parcela', value: (x) => `${x.installment}/${x.installments}` },
        { header: 'Vencimento', value: (x) => date(x.dueDate) },
        { header: 'Valor', value: (x) => money(x.amount), align: 'right' },
        { header: 'Recebido', value: (x) => money(x.paidAmount), align: 'right' },
        { header: 'Situação', value: (x) => ENTRY_STATUS[entryStatus(x)].label },
      ],
      { title: `Parcelas da venda — ${sale.buyerName}` },
    );
  }
  if (semenUsed.length) {
    pdf.table(
      semenUsed,
      [
        { header: 'Garanhão', value: (p) => p.stallionName },
        { header: 'Armazenamento', value: (p) => storage(p.storageType) },
        { header: 'Doses usadas', value: (p) => String(p.usage.filter((u) => u.mareName === e.name).reduce((s, u) => s + u.doses, 0)), align: 'right' },
        { header: 'Situação do lote', value: (p) => SEMEN_STATUS[semenStatus(p)].label },
      ],
      { title: 'Sêmen utilizado nesta égua' },
    );
  }
  if (e.notes) pdf.text(`Observações: ${e.notes}`, { size: 9 });
  pdf.save(`ficha-${e.name.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}`);
}

export function exportSemenPdf(purchases: SemenPurchase[], collections: EquineEvent[]) {
  const pdf = createPdf({ title: 'Banco de sêmen', subtitle: `${purchases.length} compra(s) · ${collections.length} coleta(s) próprias`, orientation: 'landscape' });
  pdf.table(
    purchases,
    [
      { header: 'Garanhão', value: (p) => [p.stallionName, p.stallionBreed].filter(Boolean).join(' — ') },
      { header: 'Fornecedor', value: (p) => p.supplierName },
      { header: 'Compra', value: (p) => date(p.purchaseDate) },
      { header: 'Doses (disp./total)', value: (p) => `${p.dosesAvailable}/${p.dosesQuantity}`, align: 'right' },
      { header: 'Armazenamento', value: (p) => [storage(p.storageType), p.canister].filter(Boolean).join(' — ') },
      { header: 'Validade', value: (p) => date(p.expiryDate) },
      { header: 'Valor', value: (p) => money(p.totalValue), align: 'right' },
      { header: 'Situação', value: (p) => SEMEN_STATUS[semenStatus(p)].label },
    ],
    { title: 'Compras', foot: ['Total', '', '', String(purchases.reduce((s, p) => s + p.dosesAvailable, 0)), '', '', money(purchases.reduce((s, p) => s + p.totalValue, 0)), ''] },
  );
  if (collections.length)
    pdf.table(
      collections,
      [
        { header: 'Garanhão', value: (c) => c.equineName },
        { header: 'Coleta', value: (c) => date(c.date) },
        { header: 'Doses (disp./prod.)', value: (c) => `${c.data.dosesAvailable ?? '—'}/${c.data.dosesProduced ?? '—'}`, align: 'right' },
        { header: 'Motilidade', value: (c) => (c.data.motility ? `${c.data.motility}%` : ''), align: 'right' },
        { header: 'Vigor', value: (c) => String(c.data.vigor ?? ''), align: 'right' },
        { header: 'Botijão', value: (c) => String(c.data.canister ?? '') },
        { header: 'Validade', value: (c) => date(String(c.data.expiryDate || '')) },
      ],
      { title: 'Coletas próprias' },
    );
  pdf.save('banco-de-semen');
}
