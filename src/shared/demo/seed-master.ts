/**
 * Cadastros-base da demonstração (inserção direta — são CRUDs simples).
 */
import { DEFAULT_SETTINGS } from '../app/settings';
import { DEFAULT_CORPORATE_DOMAINS } from '../domain/permissions';
import { round2 } from '../domain/format';
import type { EquineEventType, PriceTableItem } from '../domain/types';
import {
  CUSTOMER_SEEDS,
  DEMO_DOMAIN,
  PARTNER_SEEDS,
  PORTAL_DEMO_EMAIL,
  PRODUCT_SEEDS,
  PROFILE_SEEDS,
  SUPPLY_SEEDS,
  makeCnpj,
  makeCpf,
} from './seed-data';
import type { Seeder } from './seed';

export async function seedMasterData(S: Seeder) {
  const { rng } = S;
  const companyCnpj = makeCnpj(rng);
  S.companyDocument = companyCnpj;
  await S.ins('settings', {
    ...DEFAULT_SETTINGS,
    id: 'main',
    companyName: 'MVGB Agro — Aurus Prime',
    tradeName: 'Aurus Prime',
    document: companyCnpj,
    stateRegistration: '244118906110',
    phone: '1932550100',
    email: `contato@${DEMO_DOMAIN}`,
    whatsapp: '5519990010000',
    zipCode: '13087530',
    street: 'Rodovia Dom Pedro I, km 140',
    number: 's/n',
    district: 'Chácara Primavera',
    city: 'Campinas',
    state: 'SP',
    corporateDomains: DEFAULT_CORPORATE_DOMAINS,
    pixKey: companyCnpj,
    pixKeyType: 'CNPJ',
    pixMerchantName: 'AURUS PRIME DEMO',
    pixMerchantCity: 'CAMPINAS',
    pixDiscountPercent: 0,
    defaultCommissionRate: 2,
    weighingTolerancePercent: 5,
    weighingToleranceMaxValue: 150,
    weighingAutoApproveHours: 6,
    freeFreightAbove: 1500,
    pickupEnabled: true,
    pickupAddress: 'Rod. Dom Pedro I, km 140 — Chácara Primavera, Campinas/SP',
    pickupNote: 'Retirada de segunda a sexta, das 8h às 17h, na expedição.',
    deliveryCutoffHour: 16,
    deliveryBlockedDates: ['2026-10-12', '2026-11-02', '2026-11-20', '2026-12-25'],
    weekendPolicy: 'NEXT_WEDNESDAY',
    rankingSilverFrom: 25000,
    rankingGoldFrom: 50000,
    bootstrapped: true,
  });

  for (const p of PROFILE_SEEDS) {
    S.profiles[p.key] = await S.ins('profiles', {
      email: p.email,
      name: p.name,
      role: p.role,
      active: true,
      company: p.role === 'EXTERNAL_SELLER' ? null : 'MVGB',
      phone: p.phone,
      commissionRate: p.commissionRate ?? null,
      loginCount: rng.int(3, 60),
      lastLoginAt: `2026-09-${String(rng.int(20, 30)).padStart(2, '0')}T${String(rng.int(11, 20)).padStart(2, '0')}:15:00.000Z`,
    });
  }

  for (const p of PARTNER_SEEDS) {
    S.partners[p.key] = await S.ins('partners', {
      kind: p.kind,
      name: p.name,
      document: makeCnpj(rng),
      inspection: 'inspection' in p ? p.inspection : null,
      contactName: p.contactName,
      phone: `19${rng.int(30000000, 39999999)}`,
      email: `${p.key}@parceiros.${DEMO_DOMAIN}`,
      city: p.city,
      state: p.state,
      active: true,
    });
  }

  let code = 1;
  for (const p of PRODUCT_SEEDS) {
    S.products[p.name] = await S.ins('products', {
      name: p.name,
      code: `P${String(code++).padStart(3, '0')}`,
      category: p.category,
      meatType: p.meatType,
      unit: p.unit,
      minStock: p.minStock || null,
      defaultPrice: p.price,
      shelfLifeDays: p.shelfLifeDays,
      description: p.meatType === 'RAW' ? 'Matéria-prima pós-abate (aguardando desossa).' : `${p.name} bovino — embalado a vácuo.`,
      active: true,
    });
  }

  for (const [key, name, description] of [
    ['racao', 'Ração engorda', 'Concentrado proteico para confinamento'],
    ['silagem', 'Silagem de milho', 'Volumoso'],
    ['sal', 'Sal mineral', 'Suplemento mineral (campo e confinamento)'],
  ] as const) {
    S.feedTypes[key] = await S.ins('feed_types', { name, description, active: true });
  }

  for (const s of SUPPLY_SEEDS) {
    S.supplies[s.key] = await S.ins('supply_items', {
      name: s.name,
      sku: s.sku,
      category: s.category,
      unit: s.unit,
      quantity: 0,
      minQuantity: s.min,
      unitCost: s.cost,
      salePrice: 'salePrice' in s ? s.salePrice : null,
      supplier: s.supplier,
      sellable: 'sellable' in s ? s.sellable : false,
      active: true,
    });
  }

  for (const [label, cepPrefixes, price, minOrderValue, etaNote] of [
    ['Campinas', ['130', '131'], 15, 150, 'Entrega na janela seguinte'],
    ['Sumaré / Hortolândia', ['1317', '1318'], 25, 200, 'Entrega na janela seguinte'],
    ['Valinhos / Vinhedo', ['1327', '1328'], 25, 200, 'Entrega na janela seguinte'],
    ['Jundiaí', ['132'], 40, 300, 'Entrega na janela seguinte'],
    ['São Paulo (capital)', ['01', '02', '03', '04', '05'], 60, 600, 'Pedido mínimo de R$ 600 · entrega às sextas'],
  ] as const) {
    await S.ins('freight_zones', { label, cepPrefixes: [...cepPrefixes], price, minOrderValue, etaNote, active: true });
  }

  // Tabelas de preço (rascunho — aprovadas pelas operações no primeiro dia)
  const finished = PRODUCT_SEEDS.filter((p) => p.meatType !== 'RAW');
  const item = (name: string, factor: number): PriceTableItem => {
    const p = S.products[name];
    const raw = (p.defaultPrice || 0) * factor;
    return { productId: p.id, productName: p.name, unit: p.unit, price: factor === 1 ? p.defaultPrice || 0 : Math.max(0.5, Math.round(raw) - 0.1) };
  };
  const portalNames = [
    'Picanha', 'Maminha', 'Alcatra', 'Contra-filé', 'Filé mignon', 'Fraldinha', 'Cupim', 'Costela', 'Ancho', 'Chorizo', 'T-bone',
    'Linguiça de costela', 'Hambúrguer 150g', 'Carne moída', 'Patinho', 'Coxão mole', 'Picanha fatiada', 'Bife de vazio',
  ];
  const tables: [string, string, 'GRILL' | 'GENERAL' | 'PORTAL' | 'INTERCOMPANY', PriceTableItem[]][] = [
    ['GRILL', 'Tabela Churrasco', 'GRILL', finished.filter((p) => p.meatType === 'GRILL').map((p) => item(p.name, 1))],
    ['GENERAL', 'Tabela Geral', 'GENERAL', finished.map((p) => item(p.name, 1))],
    ['PORTAL', 'Portal Clientes', 'PORTAL', portalNames.map((n) => item(n, 1.05))],
    ['INTERCOMPANY', 'Intercompany', 'INTERCOMPANY', finished.map((p) => item(p.name, 0.72))],
    ['ACOUGUES', 'Tabela Açougues — Outubro', 'GENERAL', finished.filter((p) => p.meatType === 'PROCESSED').map((p) => item(p.name, 0.94))],
  ];
  for (const [key, name, kind, items] of tables) {
    S.tables[key] = await S.ins('price_tables', {
      name,
      kind,
      status: 'ACTIVE',
      approvalStatus: 'DRAFT',
      validFrom: key === 'ACOUGUES' ? '2026-10-01' : key === 'PORTAL' ? '2026-08-01' : '2026-04-01',
      validTo: key === 'ACOUGUES' ? '2026-10-31' : null,
      items,
      notes: key === 'ACOUGUES' ? 'Condição especial para açougues parceiros em outubro.' : null,
    });
    S.tablePrices[key] = new Map(items.map((i) => [i.productId, i.price]));
  }

  let ccode = 1;
  for (const c of CUSTOMER_SEEDS) {
    S.cseed[c.key] = c;
    const seller = c.seller ? S.profiles[c.seller] : null;
    const doc = c.personType === 'J' ? makeCnpj(rng) : makeCpf(rng);
    const email = `${c.key}@clientes.${DEMO_DOMAIN}`;
    S.customers[c.key] = await S.ins('customers', {
      code: `C${String(ccode++).padStart(4, '0')}`,
      name: c.name,
      tradeName: c.tradeName ?? null,
      personType: c.personType,
      document: doc,
      stateRegistration: c.personType === 'J' ? String(rng.int(100000000, 999999999)) + '110' : null,
      category: c.category,
      segment: c.segment.charAt(0) + c.segment.slice(1).toLowerCase(),
      zipCode: c.zip,
      street: c.street,
      number: String(rng.int(12, 2400)),
      district: c.district,
      city: c.city,
      state: 'SP',
      phone: `19${rng.int(32000000, 39999999)}`,
      cellphone: `199${rng.int(70000000, 99999999)}`,
      email,
      financialEmail: c.personType === 'J' ? `financeiro.${email}` : null,
      contactName: c.contact,
      paymentTerms: c.terms ?? null,
      creditLimit: c.creditLimit,
      preferredPaymentMethod: c.method,
      allowedPaymentMethods: c.personType === 'J' ? ['PIX', 'BOLETO', 'TRANSFER'] : ['PIX', 'CARD', 'CASH'],
      financialApproval: c.financial,
      financialApprovedBy: c.financial === 'PENDING' ? null : S.profiles.finance.name,
      financialApprovedAt: c.financial === 'PENDING' ? null : S.iso(),
      financialApprovalNotes: c.financial === 'REJECTED' ? 'Histórico de atrasos — somente à vista.' : null,
      sellerId: seller?.id ?? null,
      sellerName: seller?.name ?? null,
      priceTableId: c.table ? S.tables[c.table].id : null,
      isIntercompany: !!c.intercompany,
      intercompanyCode: c.intercompany ?? null,
      status: 'ACTIVE',
      ranking: 'BRONZE',
      stars: 0,
      totalPurchases: 0,
      ordersCount: 0,
      lastPurchaseAt: null,
      documents: [],
      notes: c.intercompany ? 'Empresa do grupo — vendas intercompany saem do estoque intercompany.' : null,
    });
  }
}

/** Contas do portal (a aprovação passa pelas operações). */
export async function insertPortalAccount(S: Seeder, key: 'acc1' | 'acc2' | 'acc3') {
  const defs = {
    acc1: { customer: 'bistro', email: PORTAL_DEMO_EMAIL, name: 'Lívia Andrade', company: 'Bistrô Cambuí Gastronomia Ltda', personType: 'J' as const },
    acc2: { customer: 'mariana', email: `mariana.costa@${DEMO_DOMAIN}`, name: 'Mariana Costa Albuquerque', company: null, personType: 'F' as const },
    acc3: { customer: null, email: `emporio.serraazul@${DEMO_DOMAIN}`, name: 'Rodrigo Serra', company: 'Empório Serra Azul Ltda', personType: 'J' as const },
  };
  const d = defs[key];
  const c = d.customer ? S.customers[d.customer] : null;
  S.accounts[key] = await S.ins('portal_accounts', {
    email: d.email,
    name: d.name,
    phone: c?.cellphone ?? '11987650000',
    companyName: d.company,
    personType: d.personType,
    document: c?.document ?? makeCnpj(S.rng),
    zipCode: c?.zipCode ?? '13290000',
    street: c?.street ?? 'Rua Sete de Setembro',
    number: c?.number ?? '410',
    district: c?.district ?? 'Centro',
    city: c?.city ?? 'Louveira',
    state: 'SP',
    status: 'PENDING',
    customerId: null,
  });
}

export async function seedCustomerRequests(S: Seeder) {
  const reqs = [
    { by: 'ext1' as const, name: 'Churrascaria Estância Gaúcha Ltda', tradeName: 'Estância Gaúcha', city: 'Campinas', district: 'Parque Taquaral', zip: '13087700', contact: 'Tchê Oliveira', at: 'Cliente indicado pelo Boi Nobre; compra ~300 kg/semana.' },
    { by: 'ext2' as const, name: 'Açougue Bom Corte Itatiba Ltda', tradeName: 'Bom Corte', city: 'Itatiba', district: 'Centro', zip: '13250010', contact: 'Neide Barros', at: 'Quer começar com pedido quinzenal.' },
  ];
  for (const r of reqs) {
    const p = S.profiles[r.by];
    await S.ins('customer_requests', {
      name: r.name,
      tradeName: r.tradeName,
      personType: 'J',
      document: makeCnpj(S.rng),
      category: 'EXTERNO_CNPJ',
      contactName: r.contact,
      phone: `19${S.rng.int(32000000, 39999999)}`,
      email: `${r.tradeName.toLowerCase().replace(/[^a-z]/g, '')}@clientes.${DEMO_DOMAIN}`,
      zipCode: r.zip,
      street: 'Avenida Principal',
      number: String(S.rng.int(10, 999)),
      district: r.district,
      city: r.city,
      state: 'SP',
      notes: r.at,
      status: 'PENDING',
      requestedById: p.id,
      requestedByName: p.name,
      requestedByEmail: p.email,
    });
  }
}

export async function seedTasks(S: Seeder) {
  const P = S.profiles;
  const tasks: [string, string, keyof typeof P, string, 'OPEN' | 'DONE', 'LOW' | 'MEDIUM' | 'HIGH', string | null][] = [
    ['Cobrar parcelas vencidas do Bar do Tião', 'Três boletos em aberto desde julho. Cliente bloqueado até regularizar.', 'finance', '2026-09-20', 'OPEN', 'HIGH', 'customers'],
    ['Conferir GTA e nota do lote L-2026-004', 'Conferir GTA, nota de entrada e pesagem de chegada.', 'operator', '2026-09-18', 'DONE', 'MEDIUM', 'batches'],
    ['Agendar abate do lote L-2026-003', 'Confirmar data com o Frigorífico Vale do Mogi (previsão 20/10).', 'manager', '2026-10-05', 'OPEN', 'HIGH', 'batches'],
    ['Inventário mensal da câmara fria', 'Contagem dos lotes de venda e conferência com o sistema.', 'logistics', '2026-09-30', 'OPEN', 'MEDIUM', null],
    ['Revisar Tabela Açougues — Outubro', 'Tabela enviada para aprovação — revisar margens.', 'finance', '2026-09-29', 'OPEN', 'MEDIUM', 'price_tables'],
    ['Renovar certificado de calibração da balança', 'Balança da expedição — certificado vence em outubro.', 'logistics', '2026-09-12', 'OPEN', 'LOW', null],
    ['Enviar NF intercompany de setembro para a GRTB', 'Consolidar notas de transferência do mês.', 'finance', '2026-09-10', 'DONE', 'MEDIUM', null],
    ['Treinamento de expedição — novo fluxo de separação', 'Separação com pesagem no celular e baixa automática.', 'manager', '2026-09-05', 'DONE', 'LOW', null],
  ];
  for (const [title, description, who, dueDate, status, priority, relatedEntity] of tasks) {
    const p = P[who];
    await S.ins('tasks', {
      title,
      description,
      assigneeId: p.id,
      assigneeName: p.name,
      dueDate,
      status,
      priority,
      relatedEntity,
      relatedId: relatedEntity === 'customers' ? S.customers.tiao.id : null,
      createdById: P.admin.id,
      createdByName: P.admin.name,
      doneAt: status === 'DONE' ? `${dueDate}T17:30:00.000Z` : null,
    });
  }
}

// ----------------------------------------------------------------------------
// Equinos
// ----------------------------------------------------------------------------

export async function seedEquines(S: Seeder) {
  const E = [
    { key: 'imperador', name: 'Imperador do Vale', sex: 'GARANHAO', birthDate: '2016-10-12', breed: 'Quarto de Milha', coat: 'Alazão', registry: 'ABQM P-412.337', status: 'ACTIVE', reproStatus: 'ATIVO', heightCm: 152, weightKg: 520, idealWeightKg: 510, estimatedValue: 180000, sireName: 'Dash Imperial', damName: 'Rainha do Vale', paddock: 'Baia 3' },
    { key: 'trovao', name: 'Trovão Negro', sex: 'GARANHAO', birthDate: '2018-08-03', breed: 'Mangalarga Marchador', coat: 'Preto', registry: 'ABCCMM MM-88.415', status: 'ACTIVE', reproStatus: 'ATIVO', heightCm: 154, weightKg: 470, idealWeightKg: 460, estimatedValue: 120000, sireName: 'Fidalgo da Serra', damName: 'Noite Estrelada', paddock: 'Baia 5' },
    { key: 'estrela', name: 'Estrela Dalva', sex: 'EGUA', birthDate: '2017-09-20', breed: 'Quarto de Milha', coat: 'Tordilha', registry: 'ABQM P-398.120', status: 'PREGNANT', reproStatus: 'GESTANTE', heightCm: 148, weightKg: 495, idealWeightKg: 480, estimatedValue: 95000, sireName: 'Lucky Star', damName: 'Aurora Boreal', paddock: 'Piquete maternidade', coverDate: '2026-03-10', coverStallion: 'Imperador do Vale', pregnancyDiagnosisDate: '2026-04-02', expectedFoalingDate: '2027-02-13' },
    { key: 'aurora', name: 'Aurora Campeira', sex: 'EGUA', birthDate: '2019-11-05', breed: 'Crioulo', coat: 'Gateada', registry: 'ABCCC CR-201.554', status: 'ACTIVE', reproStatus: 'ATIVO', heightCm: 145, weightKg: 430, idealWeightKg: 430, estimatedValue: 60000, sireName: 'Campeiro do Sul', damName: 'Prenda Faceira', paddock: 'Piquete 2' },
    { key: 'faisca', name: 'Faísca', sex: 'CASTRADO', birthDate: '2015-02-14', breed: 'Quarto de Milha', coat: 'Baio', registry: 'ABQM P-355.901', status: 'TRAINING', reproStatus: 'INATIVO', heightCm: 150, weightKg: 480, idealWeightKg: 470, estimatedValue: 70000, sireName: 'Golden Fire', damName: 'Brisa Mansa', paddock: 'Baia 1' },
    { key: 'duquesa', name: 'Duquesa Real', sex: 'EGUA', birthDate: '2020-01-22', breed: 'Mangalarga Marchador', coat: 'Castanha', registry: 'ABCCMM MM-91.772', status: 'ACTIVE', reproStatus: 'ATIVO', heightCm: 150, weightKg: 440, idealWeightKg: 440, estimatedValue: 85000, sireName: 'Trovão Negro', damName: 'Baronesa do Sul', paddock: 'Piquete 4' },
  ] as const;
  for (const { key, ...fields } of E) {
    S.equines[key] = await S.ins('equines', {
      ...fields,
      photos: [],
      haras: 'Haras Aurus Prime',
      manager: 'Adriano Couto',
      chipId: `982000${S.rng.int(100000000, 999999999)}`,
      purchaseValue: round2(fields.estimatedValue * 0.7),
      notes: null,
    });
  }
  const ev = async (
    key: keyof typeof S.equines,
    type: EquineEventType,
    date: string,
    title: string,
    data: Record<string, unknown>,
    amount: number | null = null,
    alertDate: string | null = null,
  ) => {
    const eq = S.equines[key];
    await S.ins('equine_events', { equineId: eq.id, equineName: eq.name, type, date, title, amount, data, alertDate, attachments: [], createdByName: S.profiles.operator.name });
  };
  const vet = 'Dra. Camila Brandão';
  for (const k of ['imperador', 'trovao', 'estrela', 'aurora', 'faisca', 'duquesa'] as const) {
    await ev(k, 'HEALTH', '2026-04-15', 'Vacina contra influenza e tétano', { kind: 'VACINA', dosage: '1 dose', veterinarian: vet }, 180, k === 'duquesa' ? null : '2026-10-15');
    await ev(k, 'HEALTH', '2026-06-20', 'Vermifugação trimestral', { kind: 'VERMIFUGO', dosage: '1 bisnaga', veterinarian: vet }, 65, k === 'duquesa' ? null : '2026-09-20');
    await ev(k, 'FARRIER', '2026-08-12', 'Casqueamento e ferrageamento', { farrier: 'Zé Ferrador', hoofCondition: 'Boa', procedures: 'Aparo e ferradura dianteira', nextDate: '2026-10-08' }, 220, k === 'duquesa' ? null : '2026-10-08');
  }
  await ev('estrela', 'HEALTH', '2026-04-02', 'Ultrassom — diagnóstico de gestação', { kind: 'ULTRASSOM', result: 'Prenhe — 23 dias', veterinarian: vet }, 350);
  await ev('estrela', 'HEALTH', '2026-08-28', 'Ultrassom de acompanhamento (6 meses)', { kind: 'ULTRASSOM', result: 'Feto com bom desenvolvimento', veterinarian: vet }, 350, '2026-10-20');
  await ev('faisca', 'TRAINING', '2026-07-08', 'Treino de tambor', { modality: 'TAMBOR', durationMinutes: 50, score: 8, trainer: 'Juca Ribeiro' });
  await ev('faisca', 'TRAINING', '2026-08-19', 'Treino de tambor — tempo 17,4 s', { modality: 'TAMBOR', durationMinutes: 45, score: 9, trainer: 'Juca Ribeiro' });
  await ev('faisca', 'COMPETITION', '2026-09-06', 'Copa Paulista de Tambor — 2º lugar', { event: 'Copa Paulista de Tambor', location: 'Jaguariúna/SP', modality: 'TAMBOR', rider: 'Juca Ribeiro', placement: 2, score: 17.21, prize: 4500 }, 4500);
  await ev('trovao', 'COMPETITION', '2026-05-24', 'Exposição Regional do Mangalarga — Campeão', { event: 'Exposição Regional Mangalarga', location: 'Bragança Paulista/SP', modality: 'CONCURSO', rider: 'Pedro Lara', placement: 1, prize: 3000 }, 3000);
  await ev('trovao', 'TRAINING', '2026-06-10', 'Marcha — condicionamento', { modality: 'PASSEIO', durationMinutes: 60, score: 8, trainer: 'Pedro Lara' });
  await ev('trovao', 'TRANSPORT', '2026-05-22', 'Transporte para exposição', { origin: 'Haras Aurus Prime', destination: 'Parque de Exposições de Bragança', vehicle: 'Caminhão boiadeiro — Rota Verde', event: 'Exposição Regional' }, 900);
  await ev('trovao', 'STAY', '2026-05-22', 'Hospedagem na exposição', { location: 'Parque de Exposições', address: 'Bragança Paulista/SP', paddock: 'Baia 44', checkIn: '2026-05-22', checkOut: '2026-05-25' }, 600);
  await ev('imperador', 'SEMEN_COLLECTION', '2026-05-05', 'Coleta de sêmen — temporada', { method: 'Vagina artificial', volumeMl: 60, concentration: 250, motility: 75, vigor: 4, dosesProduced: 12, dosesAvailable: 12, canister: 'Botijão 2', expiryDate: '2028-05-05', veterinarian: vet, destinationMares: 'Aurora Campeira' }, null);
  await ev('imperador', 'SEMEN_COLLECTION', '2026-08-18', 'Coleta de sêmen — reposição', { method: 'Vagina artificial', volumeMl: 55, concentration: 240, motility: 72, vigor: 4, dosesProduced: 10, dosesAvailable: 10, canister: 'Botijão 2', expiryDate: '2028-08-18', veterinarian: vet }, null);
  await ev('imperador', 'REVENUE', '2026-07-12', 'Venda de cobertura para haras parceiro', { category: 'Cobertura' }, 6500);
  await ev('aurora', 'TRAINING', '2026-07-22', 'Doma de rédeas', { modality: 'RÉDEAS', durationMinutes: 40, score: 7, trainer: 'Juca Ribeiro' });
  for (const [m, v] of [['04', 3200], ['05', 3350], ['06', 3100], ['07', 3400], ['08', 3300], ['09', 3450]] as const) {
    await ev('imperador', 'EXPENSE', `2026-${m}-28`, 'Feno, ração e suplementos do plantel (mês)', { category: 'Alimentação' }, v);
  }
}
