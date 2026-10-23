/**
 * Demonstração — calendário de eventos de abril a setembro/2026
 * (lotes, abates, desossa, ração, estoque, portal, equinos…).
 */
import { addDays, round2, round3 } from '../domain/format';
import { DEMO_TODAY, START, firstBiz, isWeekend, lastBiz, makeCnpj, mondays } from './seed-data';
import {
  acquisitionCosts,
  cost,
  discardExpired,
  feedPurchase,
  feedWeek,
  intercompanyEntry,
  monthlyExpenses,
  newBatch,
  noblePurchase,
  processingReturn,
  sendToProcessing,
  slaughter,
  stockPurchase,
  suppliesIn,
  suppliesOut,
} from './seed-farm';
import { insertPortalAccount, seedCustomerRequests } from './seed-master';
import type { Seeder } from './seed';

// ----------------------------------------------------------------------------
// Calendário de operações (gado, estoque, financeiro, portal…)
// ----------------------------------------------------------------------------

export function scheduleOperations(S: Seeder) {
  const on = S.on.bind(S);

  on('2026-04-01', 8, async () => {
    for (const k of ['GRILL', 'GENERAL', 'INTERCOMPANY']) {
      await S.ops('seller1').submitPriceTable(S.tables[k].id);
      await S.ops('finance').approvePriceTable(S.tables[k].id);
    }
    await stockPurchase(S, '2026-04-01', 0.75, 'INV-ABERTURA', 'Saldo inicial — inventário de abertura', null);
    await suppliesIn(S, '2026-04-01', 'initial');
  });
  for (const m of ['04', '05', '06', '07', '08', '09']) {
    on(firstBiz(`2026-${m}`), 7.5, () => monthlyExpenses(S, `2026-${m}`));
    on(lastBiz(`2026-${m}`), 17.5, () => suppliesOut(S, lastBiz(`2026-${m}`)));
  }
  for (let d = START; d <= DEMO_TODAY; d = addDays(d, 1)) if (!isWeekend(d)) on(d, 7, () => discardExpired(S, d));

  // --- Lote 1: campo, abate em junho, desossa total, encerrado em setembro
  on('2026-04-02', 9, async () => {
    await newBatch(S, 'b1', { name: 'Nelore Santa Helena — Abril', mgmt: 'CAMPO', supplier: 'sup1', day: '2026-04-02', n: 32, tag: 1, breed: 'Nelore', terms: '30/60' });
    await acquisitionCosts(S, 'b1', '2026-04-02', 'car1');
  });
  for (const d of mondays('2026-04-06', '2026-06-08')) on(d, 9, () => feedWeek(S, 'b1', d, 32, [['sal', 0.1]]));
  for (const m of ['04', '05']) {
    on(lastBiz(`2026-${m}`), 16, async () => {
      await cost(S, 'b1', 'PASTURE', lastBiz(`2026-${m}`), 32 * 85, 'Arrendamento de pasto (mês)', 'sup1', { terms: '10', method: 'TRANSFER' });
      await cost(S, 'b1', 'LABOR', lastBiz(`2026-${m}`), 2400, 'Vaqueiro e manejo (mês)');
    });
  }
  on('2026-05-05', 10, () => cost(S, 'b1', 'VETERINARY', '2026-05-05', 1250, 'Exame e tratamento de casco', null, { terms: '15', method: 'PIX' }));
  on('2026-06-12', 10, () => cost(S, 'b1', 'PASTURE', '2026-06-12', round2((32 * 85 * 12) / 30), 'Arrendamento de pasto (12 dias)', 'sup1'));
  on('2026-06-15', 9, () => slaughter(S, 'b1', '2026-06-15', 'sh1', [0.52, 0.555], [55, 85], 'GTA-SP 041.2345'));
  on('2026-06-16', 9, () => sendToProcessing(S, 'b1', 'os1', '2026-06-16', ['Traseiro', 'Dianteiro', 'Ponta de agulha'], 780));
  on('2026-06-23', 9, () => processingReturn(S, 'os1', '2026-06-23', 'TOTAL', 1));
  on('2026-09-10', 10, async () => {
    await cost(S, 'b1', 'ICMS_SALE', '2026-09-10', 2850, 'ICMS sobre vendas do lote');
    await cost(S, 'b1', 'TAX_CREDIT', '2026-09-10', 1150, 'Crédito de ICMS na entrada');
  });
  on('2026-09-26', 15, () => S.ops('operator').finishBatch(S.batches.b1));

  // --- Lote 2: confinamento, abate em agosto, 1 OS concluída e 1 parcial
  on('2026-04-20', 9, async () => {
    await newBatch(S, 'b2', { name: 'Angus cruzado Boa Vista — Confinamento', mgmt: 'CONFINAMENTO', supplier: 'sup2', day: '2026-04-20', n: 28, tag: 33, breed: 'Angus x Nelore', terms: '30/60/90' });
    await acquisitionCosts(S, 'b2', '2026-04-20', 'car2');
  });
  for (const d of mondays('2026-04-27', '2026-08-03')) on(d, 9.2, () => feedWeek(S, 'b2', d, 28, [['racao', 6], ['silagem', 15], ['sal', 0.12]]));
  for (const m of ['04', '05', '06', '07']) on(lastBiz(`2026-${m}`), 16.2, () => cost(S, 'b2', 'LABOR', lastBiz(`2026-${m}`), 2200, 'Tratador do confinamento (mês)'));
  on('2026-06-02', 10, () => cost(S, 'b2', 'VETERINARY', '2026-06-02', 980, 'Vermifugação e vitaminas', null, { terms: '15', method: 'PIX' }));
  on('2026-08-10', 9, () => slaughter(S, 'b2', '2026-08-10', 'sh2', [0.54, 0.57], [110, 150], 'GTA-SP 058.7712'));
  on('2026-08-11', 9, () => sendToProcessing(S, 'b2', 'os2', '2026-08-11', ['Traseiro'], 650));
  on('2026-08-18', 9, () => processingReturn(S, 'os2', '2026-08-18', 'TOTAL', 1));
  on('2026-08-24', 9, () => sendToProcessing(S, 'b2', 'os3', '2026-08-24', ['Dianteiro', 'Ponta de agulha'], 650));
  on('2026-09-01', 9, () => processingReturn(S, 'os3', '2026-09-01', 'PARTIAL', 0.6));

  // --- Lote 3: confinamento em andamento
  on('2026-06-10', 9, async () => {
    await newBatch(S, 'b3', {
      name: 'Nelore Três Irmãos — Confinamento',
      mgmt: 'CONFINAMENTO',
      supplier: 'sup3',
      day: '2026-06-10',
      n: 35,
      tag: 61,
      breed: 'Nelore',
      terms: '30/60/90',
      estimatedSlaughterDate: '2026-10-20',
      sellingPricePerKg: 58,
    });
    await acquisitionCosts(S, 'b3', '2026-06-10', 'car1');
  });
  for (const d of mondays('2026-06-15', DEMO_TODAY)) on(d, 9.4, () => feedWeek(S, 'b3', d, 35, [['racao', 6], ['silagem', 15], ['sal', 0.12]]));
  for (const m of ['06', '07', '08', '09']) on(lastBiz(`2026-${m}`), 16.4, () => cost(S, 'b3', 'LABOR', lastBiz(`2026-${m}`), 2600, 'Tratador do confinamento (mês)'));
  on('2026-08-05', 10, () => cost(S, 'b3', 'VETERINARY', '2026-08-05', 1340, 'Protocolo sanitário de meio de ciclo', null, { terms: '15', method: 'PIX' }));

  // --- Lote 4: recém-comprado
  on('2026-09-15', 9, async () => {
    await newBatch(S, 'b4', { name: 'Rio Pardo — Setembro', mgmt: 'CAMPO', supplier: 'sup4', day: '2026-09-15', n: 20, tag: 96, breed: 'Nelore', terms: '30/60/90' });
    await acquisitionCosts(S, 'b4', '2026-09-15', 'car2');
  });

  // --- Ração
  on('2026-04-06', 8.5, () => feedPurchase(S, 'sal', '2026-04-06', 1500, 3.4, 'NF 20.114', { installments: 1, firstDueDate: '2026-05-06', method: 'BOLETO' }));
  on('2026-04-15', 8.5, async () => {
    await feedPurchase(S, 'racao', '2026-04-15', 20000, 1.68, 'NF 20.388', { terms: '30/60/90', method: 'BOLETO' });
    await feedPurchase(S, 'silagem', '2026-04-15', 110000, 0.34, 'NF 20.391', { terms: '30/60/90/120', method: 'BOLETO' });
  });
  on('2026-07-01', 8.5, () => feedPurchase(S, 'racao', '2026-07-01', 25000, 1.74, 'NF 21.902', { terms: '30/60/90', method: 'BOLETO' }));

  // --- Estoque de terceiros e intercompany
  on('2026-04-08', 8, () => intercompanyEntry(S, '2026-04-08', 'NF 45.118'));
  on('2026-05-18', 8, () => stockPurchase(S, '2026-05-18', 0.4, 'CMP-0518', 'Compra complementar — Frigorífico Estrela do Oeste', 'sh1'));
  on('2026-06-05', 8, () => intercompanyEntry(S, '2026-06-05', 'NF 45.902'));
  on('2026-07-20', 8, () =>
    S.ops('logistics').addStockEntry({
      productId: S.products['Hambúrguer 150g'].id,
      qty: 1200,
      unitCost: 4.1,
      entryDate: '2026-07-20',
      origin: 'PROPRIO',
      lotCode: 'HB-0720',
      originInvoice: 'OP-0720',
      notes: 'Produção própria de hambúrguer (carne moída do lote L-2026-001).',
    }),
  );
  on('2026-08-20', 8, () => intercompanyEntry(S, '2026-08-20', 'NF 46.771'));
  on('2026-09-21', 8, () => noblePurchase(S, '2026-09-21'));
  on('2026-07-01', 8, () => suppliesIn(S, '2026-07-01', 'restock'));
  on('2026-09-12', 10, () =>
    S.ops('logistics').registerLoss({
      productId: S.products.Costela.id,
      qty: 2.4,
      origin: 'ESTOQUE',
      reason: 'AVARIA',
      date: '2026-09-12',
      notes: 'Embalagem a vácuo violada na câmara 1.',
    }),
  );
  on('2026-09-22', 16, async () => {
    const lots = (await S.data.list('stock_lots', { where: [['productId', '==', S.products['Carne moída'].id]] })).filter((l) => l.status === 'AVAILABLE' && l.balanceQty > 5);
    if (lots[0]) await S.ops('logistics').adjustLot(lots[0].id, round3(lots[0].balanceQty - 0.6), 'Inventário semanal: diferença de pesagem.');
  });
  on('2026-09-24', 16, async () => {
    const lots = (await S.data.list('stock_lots', { where: [['productId', '==', S.products['Músculo'].id]] })).filter(
      (l) => l.status === 'AVAILABLE' && l.batchId === S.batches.b2 && l.balanceQty > 5,
    );
    if (lots[0]) await S.ops('logistics').setLotBlocked(lots[0].id, true, 'Aguardando laudo de temperatura da câmara 2.');
  });

  // --- Portal, tabelas, clientes
  on('2026-07-20', 11, async () => {
    await S.data.update('customers', S.customers.tiao.id, {
      status: 'BLOCKED',
      notes: 'Bloqueado por inadimplência (parcelas vencidas desde junho).',
    });
    await S.ops('manager').log('UPDATE', 'customers', S.customers.tiao.id, 'Cliente Bar do Tião bloqueado por inadimplência');
  });
  on('2026-07-28', 10, () => insertPortalAccount(S, 'acc1'));
  on('2026-07-29', 9, () => S.ops('manager').approvePortalAccount(S.accounts.acc1.id, { customerId: S.customers.bistro.id }));
  on('2026-08-01', 8, async () => {
    await S.ops('manager').submitPriceTable(S.tables.PORTAL.id);
    await S.ops('finance').approvePriceTable(S.tables.PORTAL.id);
    await S.ops('manager').syncCatalogFromPriceTable(S.tables.PORTAL.id);
    const cat = await S.data.list('catalog_items');
    for (const c of cat) {
      if (['Picanha', 'Ancho', 'Chorizo', 'Hambúrguer 150g'].includes(c.name)) await S.data.update('catalog_items', c.id, { featured: true });
    }
    const s = S.supplies.sacola;
    await S.ins('catalog_items', {
      supplyItemId: s.id,
      productId: null,
      name: s.name,
      description: 'Mantém a carne gelada por até 6 horas.',
      category: 'Acessórios',
      unit: 'UN',
      price: s.salePrice || 12.9,
      minQty: 1,
      step: 1,
      imageUrl: null,
      available: true,
      featured: false,
      sortOrder: cat.length + 1,
    });
  });
  on('2026-08-10', 10, () => insertPortalAccount(S, 'acc2'));
  on('2026-08-11', 9, () => S.ops('manager').approvePortalAccount(S.accounts.acc2.id, { customerId: S.customers.mariana.id }));
  on('2026-09-27', 10, () => insertPortalAccount(S, 'acc3'));
  on('2026-09-05', 10, () => S.ops('seller2').submitPriceTable(S.tables.ACOUGUES.id));
  on('2026-09-10', 11, () =>
    S.ops('manager').publishCatalogLink({
      title: 'Catálogo Churrasco — Primavera 2026',
      message: 'Cortes maturados a vácuo, entrega às quartas e sextas na região de Campinas.',
      showPrices: true,
      expiresAt: '2026-12-31',
    }),
  );
  on('2026-09-25', 10, () =>
    S.ops('admin').inviteUser({ email: 'thiago.vendas@demo.aurusprime.com', name: 'Thiago Ramos', role: 'SELLER', commissionRate: 2.5, phone: '19990010010' }),
  );
  on('2026-09-26', 11, () => seedCustomerRequests(S));

  // --- Equinos
  on('2026-05-12', 10, () =>
    S.ops('operator').registerSemenPurchase({
      stallionName: 'Rei do Cerrado',
      stallionBreed: 'Quarto de Milha',
      stallionRegistry: 'ABQM P-377.410',
      ownerHaras: 'Haras Vale Verde',
      supplierName: 'Central de Reprodução Equina Vale Verde',
      supplierDocument: makeCnpj(S.rng),
      invoiceNumber: 'NF 3.311',
      invoiceDate: '2026-05-12',
      lotCode: 'RC-2605',
      purchaseDate: '2026-05-12',
      dosesQuantity: 10,
      dosePrice: 1200,
      totalValue: 12000,
      storageType: 'CONGELADO',
      canister: 'Botijão 1',
      expiryDate: '2029-05-12',
      intendedMares: 'Aurora Campeira',
      veterinarian: 'Dra. Camila Brandão',
      plan: { installments: 3, firstDueDate: '2026-06-12', method: 'PIX' },
    }),
  );
  on('2026-05-25', 10, async () => {
    const p = (await S.data.list('semen_purchases'))[0];
    await S.ops('operator').useSemenDoses(p.id, { date: '2026-05-25', doses: 2, mareName: 'Aurora Campeira', notes: 'Inseminação — 1º ciclo' });
  });
  on('2026-06-15', 10, async () => {
    const p = (await S.data.list('semen_purchases'))[0];
    await S.ops('operator').useSemenDoses(p.id, { date: '2026-06-15', doses: 1, mareName: 'Aurora Campeira', notes: 'Repasse' });
  });
  on('2026-07-05', 10, () =>
    S.ops('operator').registerEquineSale({
      equineId: S.equines.duquesa.id,
      buyerName: 'Haras Vale Encantado',
      buyerDocument: makeCnpj(S.rng),
      buyerPhone: '35998761234',
      buyerEmail: `compras@haras-vale-encantado.${'demo.aurusprime.com'}`,
      buyerAddress: 'Estrada Municipal 12, km 4 — Pouso Alegre/MG',
      date: '2026-07-05',
      totalPrice: 85000,
      plan: { installments: 5, firstDueDate: '2026-07-05', method: 'TRANSFER' },
      notes: 'Venda com exame de aptidão reprodutiva em dia.',
    }),
  );
  on('2026-08-03', 10, () =>
    S.ops('operator').registerSemenPurchase({
      stallionName: 'Marchador Imperial',
      stallionBreed: 'Mangalarga Marchador',
      stallionRegistry: 'ABCCMM MM-70.228',
      ownerHaras: 'Haras Serra da Mantiqueira',
      supplierName: 'Haras Serra da Mantiqueira',
      invoiceNumber: 'NF 8.902',
      invoiceDate: '2026-08-03',
      purchaseDate: '2026-08-03',
      dosesQuantity: 6,
      totalValue: 7200,
      storageType: 'REFRIGERADO',
      expiryDate: '2026-08-10',
      intendedMares: 'Égua receptora 12',
      plan: { installments: 2, firstDueDate: '2026-08-20', method: 'BOLETO' },
    }),
  );
  on('2026-08-06', 10, async () => {
    const p = (await S.data.list('semen_purchases')).find((x) => x.stallionName === 'Marchador Imperial');
    if (p) await S.ops('operator').useSemenDoses(p.id, { date: '2026-08-06', doses: 2, mareName: 'Égua receptora 12' });
  });
}
