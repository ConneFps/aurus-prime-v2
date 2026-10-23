/**
 * Demonstração — rotinas de fazenda, estoque e despesas (chamam as operações).
 */
import { addDays, round2, round3 } from '../domain/format';
import type { PaymentMethod } from '../domain/types';
import type { Ops } from '../ops';
import { RETURN_MIX, RETURN_YIELD, SUPPLY_SEEDS, clamp, round1 } from './seed-data';
import type { Seeder } from './seed';

export type Section = keyof typeof RETURN_MIX;

// ----------------------------------------------------------------------------
// Gado
// ----------------------------------------------------------------------------

export async function newBatch(
  S: Seeder,
  key: string,
  o: {
    name: string;
    mgmt: 'CAMPO' | 'CONFINAMENTO';
    supplier: string;
    day: string;
    n: number;
    tag: number;
    breed: string;
    terms: string;
    estimatedSlaughterDate?: string;
    sellingPricePerKg?: number;
  },
) {
  const { rng } = S;
  const animals = Array.from({ length: o.n }, (_, i) => {
    const w = round1(rng.float(360, 480));
    return {
      tag: `BR${String(o.tag + i).padStart(6, '0')}`,
      sex: rng.chance(0.9) ? ('MALE' as const) : ('FEMALE' as const),
      breed: o.breed,
      entryWeightKg: w,
      purchasePrice: clamp(2900, 3600, round2(w * rng.float(7.2, 7.9))),
    };
  });
  const weight = round1(animals.reduce((s, a) => s + a.entryWeightKg, 0));
  S.batches[key] = await S.ops('operator').createBatch({
    name: o.name,
    managementType: o.mgmt,
    company: 'MVGB',
    supplierId: S.partners[o.supplier].id,
    purchaseDate: o.day,
    purchaseInvoice: `NF ${rng.int(10000, 99999)}`,
    gtaNumber: `GTA-${rng.int(100, 999)}.${rng.int(1000, 9999)}`,
    estimatedSlaughterDate: o.estimatedSlaughterDate ?? null,
    confinementEntryWeightKg: o.mgmt === 'CONFINAMENTO' ? weight : null,
    sellingPricePerKg: o.sellingPricePerKg ?? 55,
    animals,
    purchaseCost: { createPayable: { terms: o.terms, method: 'TRANSFER' } },
  });
}

export async function cost(
  S: Seeder,
  batchKey: string,
  category: Parameters<Ops['addBatchCost']>[0]['category'],
  date: string,
  amount: number,
  description: string,
  partner?: string | null,
  payable?: { terms: string; method: PaymentMethod } | null,
) {
  return S.ops('manager').addBatchCost({
    batchId: S.batches[batchKey],
    category,
    date,
    amount: round2(amount),
    description,
    partnerId: partner ? S.partners[partner].id : null,
    createPayable: payable ?? null,
  });
}

export async function acquisitionCosts(S: Seeder, batchKey: string, day: string, carrier: string) {
  const { rng } = S;
  const costs = await S.data.list('batch_costs', { where: [['batchId', '==', S.batches[batchKey]]] });
  const purchase = costs.find((c) => c.category === 'PURCHASE')?.amount || 0;
  const head = (await S.data.get('batches', S.batches[batchKey]))!.headCount;
  await cost(S, batchKey, 'PURCHASE_FREIGHT', day, head * rng.float(110, 135), 'Frete da fazenda', carrier, { terms: '15', method: 'PIX' });
  await cost(S, batchKey, 'PURCHASE_COMMISSION', day, purchase * 0.02, 'Comissão do corretor (2%)', null, { terms: '30', method: 'PIX' });
  await cost(S, batchKey, 'FUNRURAL_PURCHASE', day, purchase * 0.015, 'Funrural 1,5%', null, { terms: '20', method: 'BOLETO' });
  await cost(S, batchKey, 'SENAR_PURCHASE', day, purchase * 0.002, 'SENAR 0,2%');
  await cost(S, batchKey, 'GTA_FEE', day, 186.4, 'Emissão de GTA');
  await cost(S, batchKey, 'ENTRY_PROTOCOL', day, 95, 'Protocolo de entrada');
  await cost(S, batchKey, 'VACCINE', addDays(day, 5), head * rng.float(24, 32), 'Aftosa + clostridiose na chegada');
}

export async function feedPurchase(S: Seeder, type: string, day: string, qty: number, unit: number, invoice: string, plan: { terms?: string; installments?: number; firstDueDate?: string; method: PaymentMethod }) {
  await S.ops('operator').registerFeedPurchase({
    feedTypeId: S.feedTypes[type].id,
    supplierId: S.partners.feed.id,
    invoiceNumber: invoice,
    entryDate: day,
    quantityKg: qty,
    totalValue: round2(qty * unit),
    createPayable: plan,
  });
}

export async function feedWeek(S: Seeder, batchKey: string, day: string, head: number, items: [string, number][]) {
  const batchId = S.batches[batchKey];
  if (!batchId) return;
  for (const [type, perHeadDay] of items) {
    let qty = round1(head * perHeadDay * 7 * S.rng.float(0.95, 1.05));
    const purchases = (await S.data.list('feed_purchases', { where: [['feedTypeId', '==', S.feedTypes[type].id]] }))
      .filter((p) => p.status === 'AVAILABLE' && p.remainingKg > 0.0005 && p.entryDate <= day)
      .sort((a, b) => a.entryDate.localeCompare(b.entryDate));
    for (const p of purchases) {
      if (qty <= 0.0005) break;
      const take = round3(Math.min(qty, p.remainingKg));
      await S.ops('operator').registerFeedConsumption({ feedPurchaseId: p.id, batchId, date: day, quantityKg: take, period: 'WEEKLY' });
      qty = round3(qty - take);
    }
  }
}

export async function slaughter(S: Seeder, batchKey: string, day: string, sh: string, carcassRange: [number, number], gain: [number, number], gta: string) {
  const { rng } = S;
  const batchId = S.batches[batchKey];
  const animals = (await S.data.list('animals', { where: [['batchId', '==', batchId]] })).sort((a, b) => a.tag.localeCompare(b.tag));
  const weights = animals.map((a) => {
    const exit = round1(a.entryWeightKg + rng.float(gain[0], gain[1]));
    return { animalId: a.id, exitWeightKg: exit, carcassWeightKg: round1(exit * rng.float(carcassRange[0], carcassRange[1])) };
  });
  const carcass = round1(weights.reduce((s, w) => s + w.carcassWeightKg, 0));
  const head = animals.length;
  const tras = round1(carcass * 0.48);
  const dian = round1(carcass * 0.39);
  const ponta = round1(carcass - tras - dian);
  const fee = head * 185;
  await S.ops('operator').registerSlaughter({
    batchId,
    date: day,
    slaughterhouseId: S.partners[sh].id,
    gtaNumber: gta,
    transportLossPercent: round2(rng.float(1.2, 2.2)),
    carcassWeightKg: carcass,
    animals: weights,
    costs: [
      { category: 'SLAUGHTER_FREIGHT', amount: round2(head * rng.float(85, 100)) },
      { category: 'SLAUGHTER_FEE', amount: fee, documentNumber: `NFS ${rng.int(1000, 9999)}` },
      { category: 'INSPECTION_FEE', amount: 480 },
      { category: 'SLAUGHTER_RETURN_FREIGHT', amount: round2(rng.float(950, 1250)) },
      { category: 'SLAUGHTER_RETURN', amount: round2(head * rng.float(100, 125)) },
    ],
    rawOutputs: [
      { productId: S.products.Traseiro.id, qty: tras },
      { productId: S.products.Dianteiro.id, qty: dian },
      { productId: S.products['Ponta de agulha'].id, qty: ponta },
    ],
    notes: `${head} animais abatidos; carcaças resfriadas 24 h antes da expedição.`,
  });
  const shp = S.partners[sh];
  await S.ops('finance').createEntries({
    direction: 'OUT',
    category: 'SERVICES',
    description: `Serviço de abate — ${head} cabeças`,
    partyType: 'PARTNER',
    partyId: shp.id,
    partyName: shp.name,
    amount: fee + 480,
    issueDate: day,
    batchId,
    plan: { terms: '10', method: 'BOLETO' },
  });
}

export async function sendToProcessing(S: Seeder, batchKey: string, osKey: string, day: string, sections: Section[], freight: number) {
  const batchId = S.batches[batchKey];
  const lots = (await S.data.list('stock_lots', { where: [['batchId', '==', batchId]] })).filter(
    (l) => l.stage === 'RAW' && l.status === 'AVAILABLE' && sections.includes(l.productName as Section),
  );
  const sentKg = round3(lots.reduce((s, l) => s + l.balanceQty, 0));
  const processingCost = round2(sentKg * 1.15);
  const id = await S.ops('logistics').createProcessingOrder({
    partnerId: S.partners.proc.id,
    batchId,
    sentDate: day,
    expectedReturnDate: addDays(day, 7),
    items: lots.map((l) => ({ lotId: l.id, qty: l.balanceQty })),
    driverName: 'Jair Pereira',
    vehiclePlate: 'FQX-2B41',
    driverPhone: '19991234567',
    dispatchDocument: `NF ${S.rng.int(50000, 59999)}`,
    freightCost: freight,
    processingCost,
  });
  S.processing[osKey] = { id, sent: lots.map((l) => ({ name: l.productName as Section, qty: l.balanceQty })) };
  const order = (await S.data.get('processing_orders', id))!;
  await S.ops('finance').createEntries({
    direction: 'OUT',
    category: 'SERVICES',
    description: `Desossa ${order.number}`,
    partyType: 'PARTNER',
    partyId: S.partners.proc.id,
    partyName: S.partners.proc.name,
    amount: processingCost,
    issueDate: day,
    batchId,
    plan: { terms: '15', method: 'BOLETO' },
  });
}

export async function processingReturn(S: Seeder, osKey: string, day: string, type: 'TOTAL' | 'PARTIAL', fraction: number) {
  const os = S.processing[osKey];
  if (!os) return;
  const cuts = new Map<string, number>();
  const losses = { bonesKg: 0, fatKg: 0, trimmingKg: 0, evaporationKg: 0 };
  for (const s of os.sent) {
    const sent = s.qty * fraction;
    const cutsKg = sent * RETURN_YIELD[s.name] * S.rng.float(0.985, 1.015);
    for (const [cut, share] of RETURN_MIX[s.name]) cuts.set(cut, (cuts.get(cut) || 0) + cutsKg * share);
    const rem = sent - cutsKg;
    losses.bonesKg += rem * 0.62;
    losses.fatKg += rem * 0.22;
    losses.trimmingKg += rem * 0.09;
    losses.evaporationKg += rem * (type === 'TOTAL' ? 0.03 : 0.07);
  }
  await S.ops('logistics').registerProcessingReturn(os.id, {
    date: day,
    type,
    invoiceNumber: `NF ${S.rng.int(30000, 39999)}`,
    items: [...cuts.entries()].map(([name, qty]) => ({ productId: S.products[name].id, qty: round1(qty) })).filter((i) => i.qty > 0),
    losses: {
      bonesKg: round1(losses.bonesKg),
      fatKg: round1(losses.fatKg),
      trimmingKg: round1(losses.trimmingKg),
      evaporationKg: round1(losses.evaporationKg),
    },
    notes: type === 'PARTIAL' ? 'Primeira remessa — restante previsto para a próxima semana.' : 'Retorno completo da ordem.',
  });
}

// --------------------------------------------------------------------------
// Estoque, materiais, despesas
// --------------------------------------------------------------------------

export async function stockPurchase(S: Seeder, day: string, factor: number, prefix: string, note: string, partner: string | null) {
  const base: Record<string, number> = {
    Picanha: 110, Maminha: 55, Alcatra: 100, 'Contra-filé': 130, 'Filé mignon': 45, Fraldinha: 60, Cupim: 45, Costela: 150, Acém: 140,
    Músculo: 70, Patinho: 110, 'Coxão mole': 130, 'Coxão duro': 100, Lagarto: 55, Paleta: 75, Ancho: 35, Chorizo: 35, 'T-bone': 35,
    Ossobuco: 30, 'Carne moída': 110, 'Hambúrguer 150g': 1200, 'Linguiça de costela': 80, 'Cupim casqueirado': 25, 'Bife de vazio': 30,
    'Picanha fatiada': 20, 'Miolo da paleta': 45,
  };
  let total = 0;
  let i = 1;
  for (const [name, q] of Object.entries(base)) {
    const p = S.products[name];
    const qty = p.unit === 'UN' ? Math.round((q * factor) / 10) * 10 : round1(q * factor * S.rng.float(0.9, 1.1));
    const unitCost = round2((p.defaultPrice || 0) * S.rng.float(0.55, 0.6));
    total += qty * unitCost;
    await S.ops('logistics').addStockEntry({
      productId: p.id,
      qty,
      unitCost,
      entryDate: day,
      origin: 'PROPRIO',
      originInvoice: prefix,
      lotCode: `${prefix}-${String(i++).padStart(2, '0')}`,
      notes: note,
    });
  }
  if (partner) {
    const pt = S.partners[partner];
    await S.ops('finance').createEntries({
      direction: 'OUT',
      category: 'OTHER',
      description: note,
      partyType: 'PARTNER',
      partyId: pt.id,
      partyName: pt.name,
      amount: round2(total),
      issueDate: day,
      documentNumber: prefix,
      plan: { terms: '28/35', method: 'BOLETO' },
    });
  }
}

/** Reposição de cortes nobres (o lote 2 rende pouca picanha para a demanda). */
export async function noblePurchase(S: Seeder, day: string) {
  const items: [string, number][] = [['Picanha', 140], ['Maminha', 60], ['Fraldinha', 70], ['Alcatra', 60], ['Hambúrguer 150g', 800]];
  let total = 0;
  for (const [name, q] of items) {
    const p = S.products[name];
    const unitCost = round2((p.defaultPrice || 0) * 0.6);
    total += q * unitCost;
    await S.ops('logistics').addStockEntry({ productId: p.id, qty: q, unitCost, entryDate: day, origin: 'PROPRIO', originInvoice: 'NF 77.310', lotCode: `CMP-0921-${p.code}`, notes: 'Reposição de cortes nobres — Frigorífico Vale do Mogi' });
  }
  const sh = S.partners.sh2;
  await S.ops('finance').createEntries({
    direction: 'OUT',
    category: 'OTHER',
    description: 'Reposição de cortes nobres — NF 77.310',
    partyType: 'PARTNER',
    partyId: sh.id,
    partyName: sh.name,
    amount: round2(total),
    issueDate: day,
    documentNumber: 'NF 77.310',
    plan: { terms: '28', method: 'BOLETO' },
  });
}

export async function intercompanyEntry(S: Seeder, day: string, invoice: string) {
  const items: [string, number][] = [
    ['Picanha', 35], ['Contra-filé', 60], ['Alcatra', 55], ['Fraldinha', 30], ['Hambúrguer 150g', 400], ['Linguiça de costela', 45], ['Cupim', 20], ['Costela', 60],
  ];
  let total = 0;
  for (const [name, q] of items) {
    const p = S.products[name];
    const qty = p.unit === 'UN' ? q : round1(q * S.rng.float(0.9, 1.1));
    const unitCost = round2((p.defaultPrice || 0) * 0.62);
    total += qty * unitCost;
    await S.ops('logistics').addStockEntry({
      productId: p.id,
      qty,
      unitCost,
      entryDate: day,
      origin: 'INTERCOMPANY',
      originCompany: 'GRTB',
      originInvoice: invoice,
      lotCode: `GRTB-${invoice.replace(/\D/g, '')}`,
    });
  }
  await S.ops('finance').createEntries({
    direction: 'OUT',
    category: 'OTHER',
    description: `Transferência intercompany GRTB — ${invoice}`,
    partyType: 'CUSTOMER',
    partyId: S.customers['ic-grtb'].id,
    partyName: S.customers['ic-grtb'].name,
    amount: round2(total),
    issueDate: day,
    documentNumber: invoice,
    company: 'MVGB',
    plan: { terms: '30', method: 'TRANSFER' },
  });
}

export async function suppliesIn(S: Seeder, day: string, mode: 'initial' | 'restock') {
  const restock: Record<string, number> = { sacola: 200, band1: 1500, band2: 1000, etiq: 12, vac1: 40, vac2: 30, caixa: 300, pvc: 12, cloro: 50 };
  for (const s of SUPPLY_SEEDS) {
    const qty = mode === 'initial' ? s.initial : restock[s.key];
    if (!qty) continue;
    await S.ops('logistics').registerSupplyMovement({
      supplyItemId: S.supplies[s.key].id,
      type: 'IN',
      quantity: qty,
      unitCost: round2(s.cost * (mode === 'initial' ? 1 : S.rng.float(1.0, 1.06))),
      date: day,
      invoiceNumber: `NF ${S.rng.int(1000, 9999)}`,
      supplier: s.supplier,
      reason: mode === 'initial' ? 'Saldo inicial' : 'Reposição trimestral',
    });
  }
}

export async function suppliesOut(S: Seeder, day: string) {
  for (const s of SUPPLY_SEEDS) {
    if (!s.monthlyOut) continue;
    const cur = (await S.data.get('supply_items', S.supplies[s.key].id))!;
    const qty = Math.min(cur.quantity, Math.round(s.monthlyOut * S.rng.float(0.85, 1.15)));
    if (qty <= 0) continue;
    await S.ops('logistics').registerSupplyMovement({ supplyItemId: cur.id, type: 'OUT', quantity: qty, date: day, reason: 'Consumo do mês na expedição' });
  }
}

export async function monthlyExpenses(S: Seeder, month: string) {
  const fin = S.ops('finance');
  const list: [string, 'PAYROLL' | 'OTHER', string, number, string][] = [
    ['Folha de pagamento — expedição e câmara fria', 'PAYROLL', 'Folha de pagamento', 14800, '05'],
    ['Aluguel do galpão e câmara fria', 'OTHER', 'Imobiliária Campinas Park', 9000, '10'],
    ['Energia elétrica — câmaras frias', 'OTHER', 'Concessionária de energia', round2(3650 * S.rng.float(0.92, 1.1)), '12'],
    ['Combustível — frota de entrega', 'OTHER', 'Posto Rota 65', round2(2400 * S.rng.float(0.9, 1.15)), '15'],
  ];
  for (const [description, category, partyName, amount, dueDay] of list) {
    await fin.createEntries({
      direction: 'OUT',
      category,
      description: `${description} (${month.slice(5)}/${month.slice(0, 4)})`,
      partyType: 'OTHER',
      partyName,
      amount,
      issueDate: `${month}-01`,
      plan: { installments: 1, firstDueDate: `${month}-${dueDay}`, method: category === 'PAYROLL' ? 'TRANSFER' : 'BOLETO' },
    });
  }
}

export async function discardExpired(S: Seeder, day: string) {
  const lots = (await S.data.list('stock_lots', { where: [['stage', '==', 'FINISHED']] })).filter(
    (l) => l.status === 'AVAILABLE' && l.balanceQty > 0.0005 && l.expiryDate && l.expiryDate <= day,
  );
  for (const l of lots) {
    await S.ops('logistics').registerLoss({
      lotId: l.id,
      qty: l.balanceQty,
      origin: 'ESTOQUE',
      reason: 'VALIDADE_VENCIDA',
      date: day,
      notes: `Descarte do lote ${l.lotCode || ''} (validade ${l.expiryDate}).`.replace('  ', ' '),
    });
  }
}
