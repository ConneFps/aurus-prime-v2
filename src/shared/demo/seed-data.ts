/**
 * Dados-mestre da demonstração (fictícios). Nenhum e-mail, documento ou
 * empresa real — CPFs/CNPJs são gerados com dígito verificador válido.
 */
import { addDays, parseISODate } from '../domain/format';
import type { CustomerCategory, MeatType, PaymentMethod, Role } from '../domain/types';

// ----------------------------------------------------------------------------
// Calendário
// ----------------------------------------------------------------------------

export const DEMO_TODAY = '2026-09-30';
export const START = '2026-04-01';

export const isWeekend = (d: string) => {
  const w = parseISODate(d)!.getDay();
  return w === 0 || w === 6;
};
export const nextBiz = (d: string) => {
  let x = addDays(d, 1);
  while (isWeekend(x)) x = addDays(x, 1);
  return x;
};
export const prevBiz = (d: string) => {
  let x = addDays(d, -1);
  while (isWeekend(x)) x = addDays(x, -1);
  return x;
};
export const bizDays = (month: string) => {
  const out: string[] = [];
  for (let d = `${month}-01`; d.startsWith(month); d = addDays(d, 1)) if (!isWeekend(d)) out.push(d);
  return out;
};
export const lastBiz = (month: string) => bizDays(month).slice(-1)[0];
export const firstBiz = (month: string) => bizDays(month)[0];
export const mondays = (from: string, to: string) => {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (parseISODate(d)!.getDay() === 1) out.push(d);
  return out;
};

// ----------------------------------------------------------------------------
// PRNG determinístico
// ----------------------------------------------------------------------------

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
export const clamp = (min: number, max: number, v: number) => Math.min(max, Math.max(min, v));

export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  float(min: number, max: number): number;
  pick<T>(arr: readonly T[]): T;
  weighted<T>(items: readonly (readonly [T, number])[]): T;
  chance(p: number): boolean;
  shuffle<T>(arr: T[]): T[];
}

export function makeRng(seed: number): Rng {
  const r = mulberry32(seed);
  return {
    next: r,
    int: (min, max) => min + Math.floor(r() * (max - min + 1)),
    float: (min, max) => min + r() * (max - min),
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    weighted(items) {
      const total = items.reduce((s, [, w]) => s + w, 0);
      let x = r() * total;
      for (const [v, w] of items) {
        x -= w;
        if (x <= 0) return v;
      }
      return items[items.length - 1][0];
    },
    chance: (p) => r() < p,
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
}

/** UUID v4 determinístico. */
export function makeIdGen(seed: number): () => string {
  const r = mulberry32(seed);
  return () =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
      const v = Math.floor(r() * 16);
      return (ch === 'x' ? v : (v & 0x3) | 0x8).toString(16);
    });
}

// ----------------------------------------------------------------------------
// Documentos fictícios válidos
// ----------------------------------------------------------------------------

export function makeCpf(rng: Rng): string {
  const d = Array.from({ length: 9 }, () => rng.int(0, 9));
  if (d.every((x) => x === d[0])) d[8] = (d[8] + 1) % 10;
  for (const len of [9, 10]) {
    let s = 0;
    for (let i = 0; i < len; i++) s += d[i] * (len + 1 - i);
    let r = (s * 10) % 11;
    if (r === 10) r = 0;
    d.push(r);
  }
  return d.join('');
}

export function makeCnpj(rng: Rng): string {
  const d = [...Array.from({ length: 8 }, () => rng.int(0, 9)), 0, 0, 0, 1];
  for (const w of [
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  ]) {
    const s = w.reduce((acc, wi, i) => acc + d[i] * wi, 0);
    const r = s % 11;
    d.push(r < 2 ? 0 : 11 - r);
  }
  return d.join('');
}

// ----------------------------------------------------------------------------
// Usuários de demonstração
// ----------------------------------------------------------------------------

export const DEMO_DOMAIN = 'demo.aurusprime.com';

export interface ProfileSeed {
  key: 'admin' | 'manager' | 'finance' | 'seller1' | 'seller2' | 'logistics' | 'operator' | 'ext1' | 'ext2';
  email: string;
  name: string;
  role: Role;
  commissionRate?: number;
  phone: string;
}

export const PROFILE_SEEDS: ProfileSeed[] = [
  { key: 'admin', email: `admin@${DEMO_DOMAIN}`, name: 'Carlos Mendes', role: 'ADMIN', phone: '19990010001' },
  { key: 'manager', email: `gerente@${DEMO_DOMAIN}`, name: 'Juliana Prado', role: 'MANAGER', phone: '19990010002' },
  { key: 'finance', email: `financeiro@${DEMO_DOMAIN}`, name: 'Roberto Lima', role: 'FINANCIAL', phone: '19990010003' },
  { key: 'seller1', email: `marcos.vendas@${DEMO_DOMAIN}`, name: 'Marcos Vieira', role: 'SELLER', commissionRate: 2.5, phone: '19990010004' },
  { key: 'seller2', email: `patricia.vendas@${DEMO_DOMAIN}`, name: 'Patrícia Souza', role: 'SELLER', commissionRate: 3, phone: '19990010005' },
  { key: 'logistics', email: `logistica@${DEMO_DOMAIN}`, name: 'Diego Alves', role: 'LOGISTICS', phone: '19990010006' },
  { key: 'operator', email: `operador@${DEMO_DOMAIN}`, name: 'Fernanda Rocha', role: 'OPERATOR', phone: '19990010007' },
  { key: 'ext1', email: `renato.externo@${DEMO_DOMAIN}`, name: 'Renato Campos', role: 'EXTERNAL_SELLER', commissionRate: 3, phone: '19990010008' },
  { key: 'ext2', email: `luciana.externo@${DEMO_DOMAIN}`, name: 'Luciana Torres', role: 'EXTERNAL_SELLER', commissionRate: 3, phone: '19990010009' },
];

export const PORTAL_DEMO_EMAIL = `cliente@${DEMO_DOMAIN}`;

// ----------------------------------------------------------------------------
// Parceiros
// ----------------------------------------------------------------------------

export const PARTNER_SEEDS = [
  { key: 'sup1', kind: 'CATTLE_SUPPLIER', name: 'Fazenda Santa Helena', contactName: 'Sebastião Ribeiro', city: 'Mococa', state: 'SP' },
  { key: 'sup2', kind: 'CATTLE_SUPPLIER', name: 'Agropecuária Boa Vista', contactName: 'Helena Duarte', city: 'Araçatuba', state: 'SP' },
  { key: 'sup3', kind: 'CATTLE_SUPPLIER', name: 'Fazenda Três Irmãos', contactName: 'Otávio Nunes', city: 'Uberaba', state: 'MG' },
  { key: 'sup4', kind: 'CATTLE_SUPPLIER', name: 'Pecuária Rio Pardo', contactName: 'Lúcio Andrade', city: 'Barretos', state: 'SP' },
  { key: 'sh1', kind: 'SLAUGHTERHOUSE', name: 'Frigorífico Estrela do Oeste', inspection: 'SIF', contactName: 'Paulo Guedes', city: 'Bragança Paulista', state: 'SP' },
  { key: 'sh2', kind: 'SLAUGHTERHOUSE', name: 'Frigorífico Vale do Mogi', inspection: 'SIF', contactName: 'Rita Moraes', city: 'Mogi Mirim', state: 'SP' },
  { key: 'proc', kind: 'PROCESSOR', name: 'Desossa Campinas Ltda', inspection: 'SIE', contactName: 'Anderson Faria', city: 'Campinas', state: 'SP' },
  { key: 'car1', kind: 'CARRIER', name: 'Transportes Rota Verde', contactName: 'Jair Pereira', city: 'Campinas', state: 'SP' },
  { key: 'car2', kind: 'CARRIER', name: 'TransBoi Logística', contactName: 'Márcia Leal', city: 'Limeira', state: 'SP' },
  { key: 'feed', kind: 'FEED_SUPPLIER', name: 'Nutrição Animal Campineira', contactName: 'Vinícius Prates', city: 'Paulínia', state: 'SP' },
] as const;

// ----------------------------------------------------------------------------
// Produtos
// ----------------------------------------------------------------------------

export interface ProductSeed {
  name: string;
  category: string;
  meatType: MeatType;
  unit: 'KG' | 'UN';
  price: number | null;
  minStock: number;
  shelfLifeDays: number;
}

const P = (name: string, category: string, meatType: MeatType, price: number | null, minStock: number, unit: 'KG' | 'UN' = 'KG', shelfLifeDays = 90): ProductSeed => ({
  name,
  category,
  meatType,
  unit,
  price,
  minStock,
  shelfLifeDays,
});

export const PRODUCT_SEEDS: ProductSeed[] = [
  P('Picanha', 'Traseiro', 'GRILL', 139.9, 40),
  P('Maminha', 'Traseiro', 'GRILL', 69.9, 25),
  P('Alcatra', 'Traseiro', 'GRILL', 62.9, 40),
  P('Contra-filé', 'Traseiro', 'GRILL', 64.9, 50),
  P('Filé mignon', 'Traseiro', 'GRILL', 99.9, 20),
  P('Fraldinha', 'Traseiro', 'GRILL', 54.9, 25),
  P('Cupim', 'Dianteiro', 'GRILL', 49.9, 20),
  P('Costela', 'Dianteiro', 'GRILL', 36.9, 60),
  P('Acém', 'Dianteiro', 'PROCESSED', 39.9, 50),
  P('Músculo', 'Dianteiro', 'PROCESSED', 36.9, 30),
  P('Patinho', 'Traseiro', 'PROCESSED', 46.9, 40),
  P('Coxão mole', 'Traseiro', 'PROCESSED', 48.9, 50),
  P('Coxão duro', 'Traseiro', 'PROCESSED', 42.9, 40),
  P('Lagarto', 'Traseiro', 'PROCESSED', 45.9, 25),
  P('Paleta', 'Dianteiro', 'PROCESSED', 38.9, 30),
  P('Ancho', 'Especiais', 'GRILL', 94.9, 15),
  P('Chorizo', 'Especiais', 'GRILL', 84.9, 15),
  P('T-bone', 'Especiais', 'GRILL', 79.9, 15),
  P('Ossobuco', 'Traseiro', 'PROCESSED', 32.9, 15),
  P('Carne moída', 'Processados', 'PROCESSED', 34.9, 40, 'KG', 60),
  P('Hambúrguer 150g', 'Processados', 'PROCESSED', 7.9, 300, 'UN', 120),
  P('Linguiça de costela', 'Processados', 'GRILL', 42.9, 30, 'KG', 60),
  P('Cupim casqueirado', 'Especiais', 'GRILL', 58.9, 10),
  P('Bife de vazio', 'Especiais', 'GRILL', 64.9, 15),
  P('Picanha fatiada', 'Especiais', 'GRILL', 149.9, 10),
  P('Miolo da paleta', 'Dianteiro', 'PROCESSED', 44.9, 20),
  // Pós-abate (matéria-prima)
  P('Carcaça bovina', 'Carcaça', 'RAW', null, 0, 'KG', 7),
  P('Traseiro', 'Carcaça', 'RAW', null, 0, 'KG', 7),
  P('Dianteiro', 'Carcaça', 'RAW', null, 0, 'KG', 7),
  P('Ponta de agulha', 'Carcaça', 'RAW', null, 0, 'KG', 7),
];

/** Rendimento da desossa por peça enviada (fração de cortes no retorno). */
export const RETURN_MIX: Record<'Traseiro' | 'Dianteiro' | 'Ponta de agulha', [string, number][]> = {
  Traseiro: [
    ['Picanha', 0.045],
    ['Maminha', 0.04],
    ['Alcatra', 0.09],
    ['Contra-filé', 0.12],
    ['Filé mignon', 0.05],
    ['Fraldinha', 0.04],
    ['Patinho', 0.11],
    ['Coxão mole', 0.14],
    ['Coxão duro', 0.11],
    ['Lagarto', 0.06],
    ['Ossobuco', 0.04],
    ['Bife de vazio', 0.03],
    ['Ancho', 0.04],
    ['Chorizo', 0.035],
    ['T-bone', 0.03],
    ['Picanha fatiada', 0.02],
  ],
  Dianteiro: [
    ['Acém', 0.26],
    ['Paleta', 0.16],
    ['Miolo da paleta', 0.09],
    ['Músculo', 0.15],
    ['Cupim', 0.06],
    ['Cupim casqueirado', 0.03],
    ['Carne moída', 0.17],
    ['Costela', 0.08],
  ],
  'Ponta de agulha': [
    ['Costela', 0.75],
    ['Carne moída', 0.15],
    ['Linguiça de costela', 0.1],
  ],
};

/** Aproveitamento (cortes / peso enviado) por peça. */
export const RETURN_YIELD: Record<'Traseiro' | 'Dianteiro' | 'Ponta de agulha', number> = {
  Traseiro: 0.74,
  Dianteiro: 0.7,
  'Ponta de agulha': 0.78,
};

// ----------------------------------------------------------------------------
// Clientes
// ----------------------------------------------------------------------------

export type Segment = 'CHURRASCARIA' | 'RESTAURANTE' | 'HAMBURGUERIA' | 'ACOUGUE' | 'EMPORIO' | 'BUFFET' | 'PF' | 'INTERCOMPANY';
export type Payer = 'GOOD' | 'AVG' | 'LATE' | 'DEFAULTER';

export interface CustomerSeed {
  key: string;
  name: string;
  tradeName?: string;
  personType: 'F' | 'J';
  category: CustomerCategory;
  segment: Segment;
  city: string;
  district: string;
  zip: string;
  street: string;
  seller?: ProfileSeed['key'];
  table?: 'GRILL' | 'GENERAL' | 'INTERCOMPANY';
  terms?: string;
  method: PaymentMethod;
  payer: Payer;
  /** Peso relativo de frequência de compra. */
  freq: number;
  creditLimit: number;
  financial: 'APPROVED' | 'PENDING' | 'REJECTED';
  intercompany?: 'MVGB' | 'GRTB' | 'GIRASSOL';
  contact: string;
  /** Só compra até esta data (ex.: cliente que ficou inadimplente). */
  until?: string;
  since?: string;
}

const C = (c: CustomerSeed) => c;

export const CUSTOMER_SEEDS: CustomerSeed[] = [
  C({ key: 'brasa', name: 'Churrascaria Brasa Viva Ltda', tradeName: 'Brasa Viva', personType: 'J', category: 'EXTERNO_CNPJ', segment: 'CHURRASCARIA', city: 'Campinas', district: 'Cambuí', zip: '13025320', street: 'Rua Coronel Quirino', seller: 'seller1', table: 'GRILL', terms: '28/35', method: 'BOLETO', payer: 'GOOD', freq: 5, creditLimit: 30000, financial: 'APPROVED', contact: 'Rogério Salles' }),
  C({ key: 'fogo', name: 'Fogo de Pedra Grill Ltda', tradeName: 'Fogo de Pedra', personType: 'J', category: 'EXTERNO_CNPJ', segment: 'CHURRASCARIA', city: 'Valinhos', district: 'Centro', zip: '13270010', street: 'Avenida dos Esportes', seller: 'seller2', table: 'GRILL', terms: '21', method: 'BOLETO', payer: 'GOOD', freq: 4, creditLimit: 25000, financial: 'APPROVED', contact: 'Tânia Ferraz' }),
  C({ key: 'sabor', name: 'Restaurante Sabor do Campo Ltda', tradeName: 'Sabor do Campo', personType: 'J', category: 'EXTERNO_CNPJ', segment: 'RESTAURANTE', city: 'Campinas', district: 'Barão Geraldo', zip: '13084030', street: 'Avenida Albino J. B. de Oliveira', seller: 'ext1', table: 'GENERAL', terms: '28', method: 'BOLETO', payer: 'LATE', freq: 3, creditLimit: 12000, financial: 'APPROVED', contact: 'Edson Carvalho' }),
  C({ key: 'bistro', name: 'Bistrô Cambuí Gastronomia Ltda', tradeName: 'Bistrô Cambuí', personType: 'J', category: 'EXTERNO_CNPJ', segment: 'RESTAURANTE', city: 'Campinas', district: 'Cambuí', zip: '13025150', street: 'Rua Maria Monteiro', seller: 'seller1', table: 'GENERAL', terms: '14', method: 'PIX', payer: 'GOOD', freq: 3, creditLimit: 8000, financial: 'APPROVED', contact: 'Lívia Andrade' }),
  C({ key: 'nonna', name: 'Cantina Nonna Rosa Ltda', tradeName: 'Nonna Rosa', personType: 'J', category: 'EXTERNO_CNPJ', segment: 'RESTAURANTE', city: 'Vinhedo', district: 'Centro', zip: '13280020', street: 'Rua Monteiro de Barros', seller: 'seller2', table: 'GENERAL', terms: '28/35', method: 'BOLETO', payer: 'AVG', freq: 2, creditLimit: 10000, financial: 'APPROVED', contact: 'Giuseppe Lombardi' }),
  C({ key: 'smash', name: 'Smash 19 Hamburgueria Ltda', tradeName: 'Smash 19', personType: 'J', category: 'EXTERNO_CNPJ', segment: 'HAMBURGUERIA', city: 'Campinas', district: 'Taquaral', zip: '13076060', street: 'Avenida Heitor Penteado', seller: 'seller1', table: 'GENERAL', terms: '21', method: 'BOLETO', payer: 'GOOD', freq: 4, creditLimit: 15000, financial: 'APPROVED', contact: 'Bruno Kato' }),
  C({ key: 'burger', name: 'Casa do Burger Hortolândia Ltda', tradeName: 'Casa do Burger', personType: 'J', category: 'EXTERNO_CNPJ', segment: 'HAMBURGUERIA', city: 'Hortolândia', district: 'Jardim Amanda', zip: '13188020', street: 'Rua Luiz Camilo de Camargo', seller: 'seller2', table: 'GENERAL', terms: '14/28', method: 'BOLETO', payer: 'AVG', freq: 2, creditLimit: 8000, financial: 'APPROVED', contact: 'Débora Silva', since: '2026-05-15' }),
  C({ key: 'boinobre', name: 'Açougue Boi Nobre Ltda', tradeName: 'Boi Nobre', personType: 'J', category: 'EXTERNO_CNPJ', segment: 'ACOUGUE', city: 'Campinas', district: 'Castelo', zip: '13070100', street: 'Avenida Brasil', seller: 'ext1', table: 'GENERAL', terms: '30/60/90', method: 'BOLETO', payer: 'GOOD', freq: 4, creditLimit: 40000, financial: 'APPROVED', contact: 'Valter Moreira' }),
  C({ key: 'primavera', name: 'Casa de Carnes Primavera Ltda', tradeName: 'Carnes Primavera', personType: 'J', category: 'EXTERNO_CNPJ', segment: 'ACOUGUE', city: 'Campinas', district: 'Jardim Primavera', zip: '13087400', street: 'Rua Proença', seller: 'seller1', table: 'GENERAL', terms: '28/35/42', method: 'BOLETO', payer: 'GOOD', freq: 4, creditLimit: 35000, financial: 'APPROVED', contact: 'Sandra Leite' }),
  C({ key: 'sumare', name: 'Açougue Central Sumaré Ltda', tradeName: 'Central Sumaré', personType: 'J', category: 'EXTERNO_CNPJ', segment: 'ACOUGUE', city: 'Sumaré', district: 'Centro', zip: '13170020', street: 'Rua Dom Barreto', seller: 'seller2', table: 'GENERAL', terms: '28/35', method: 'BOLETO', payer: 'LATE', freq: 3, creditLimit: 20000, financial: 'APPROVED', contact: 'Josué Almeida' }),
  C({ key: 'vinhedo', name: 'Casa de Carnes Vinhedo Ltda', tradeName: 'Carnes Vinhedo', personType: 'J', category: 'EXTERNO_CNPJ', segment: 'ACOUGUE', city: 'Vinhedo', district: 'Capela', zip: '13284010', street: 'Avenida Independência', seller: 'ext2', table: 'GENERAL', terms: '30/60', method: 'BOLETO', payer: 'AVG', freq: 2, creditLimit: 18000, financial: 'APPROVED', contact: 'Irene Campos' }),
  C({ key: 'jundiai', name: 'Mercado de Carnes Jundiaí Ltda', tradeName: 'Carnes Jundiaí', personType: 'J', category: 'EXTERNO_CNPJ', segment: 'ACOUGUE', city: 'Jundiaí', district: 'Vila Arens', zip: '13202010', street: 'Avenida Jundiaí', seller: 'seller2', table: 'GENERAL', terms: '28/35/42', method: 'BOLETO', payer: 'GOOD', freq: 2, creditLimit: 25000, financial: 'APPROVED', contact: 'Fábio Rezende', since: '2026-06-01' }),
  C({ key: 'taquaral', name: 'Empório Taquaral Ltda', tradeName: 'Empório Taquaral', personType: 'J', category: 'EXTERNO_CNPJ', segment: 'EMPORIO', city: 'Campinas', district: 'Taquaral', zip: '13087010', street: 'Rua Barata Ribeiro', seller: 'seller1', table: 'GRILL', terms: '21', method: 'BOLETO', payer: 'GOOD', freq: 3, creditLimit: 10000, financial: 'APPROVED', contact: 'Marina Queiroz' }),
  C({ key: 'gourmetval', name: 'Empório Gourmet Valinhos Ltda', tradeName: 'Gourmet Valinhos', personType: 'J', category: 'EXTERNO_CNPJ', segment: 'EMPORIO', city: 'Valinhos', district: 'Vila Faustina', zip: '13271200', street: 'Avenida Invernada', seller: 'seller2', table: 'GRILL', terms: '28', method: 'BOLETO', payer: 'AVG', freq: 2, creditLimit: 8000, financial: 'APPROVED', contact: 'Paula Toledo' }),
  C({ key: 'saobento', name: 'Mercearia São Bento Ltda', tradeName: 'Mercearia São Bento', personType: 'J', category: 'EXTERNO_CNPJ', segment: 'EMPORIO', city: 'Paulínia', district: 'Centro', zip: '13140010', street: 'Avenida José Paulino', seller: 'seller1', table: 'GENERAL', terms: '14', method: 'PIX', payer: 'AVG', freq: 1, creditLimit: 5000, financial: 'PENDING', contact: 'Heitor Bueno' }),
  C({ key: 'recanto', name: 'Hotel Fazenda Recanto das Águas Ltda', tradeName: 'Recanto das Águas', personType: 'J', category: 'EXTERNO_CNPJ', segment: 'BUFFET', city: 'Indaiatuba', district: 'Itaici', zip: '13340010', street: 'Estrada do Mirim', seller: 'ext2', table: 'GRILL', terms: '30', method: 'BOLETO', payer: 'GOOD', freq: 2, creditLimit: 20000, financial: 'APPROVED', contact: 'Cristina Paes' }),
  C({ key: 'festa', name: 'Buffet Festa & Cia Eventos Ltda', tradeName: 'Festa & Cia', personType: 'J', category: 'EXTERNO_CNPJ', segment: 'BUFFET', city: 'Americana', district: 'Centro', zip: '13465010', street: 'Rua Fernando Camargo', seller: 'seller2', table: 'GRILL', terms: '28/35', method: 'BOLETO', payer: 'AVG', freq: 2, creditLimit: 15000, financial: 'APPROVED', contact: 'Rafael Bortolini' }),
  C({ key: 'tiao', name: 'Bar e Petiscaria do Tião Ltda', tradeName: 'Bar do Tião', personType: 'J', category: 'EXTERNO_CNPJ', segment: 'RESTAURANTE', city: 'Sumaré', district: 'Nova Veneza', zip: '13177010', street: 'Avenida Rebouças', seller: 'seller2', table: 'GENERAL', terms: '28/35', method: 'BOLETO', payer: 'DEFAULTER', freq: 3, creditLimit: 6000, financial: 'REJECTED', contact: 'Sebastião Matos', until: '2026-06-20' }),
  C({ key: 'paulista', name: 'Grill Paulista Restaurante Ltda', tradeName: 'Grill Paulista', personType: 'J', category: 'EXTERNO_CNPJ', segment: 'CHURRASCARIA', city: 'São Paulo', district: 'Bela Vista', zip: '01310100', street: 'Rua Treze de Maio', seller: 'seller1', table: 'GRILL', terms: '28/35/42', method: 'BOLETO', payer: 'GOOD', freq: 2, creditLimit: 30000, financial: 'APPROVED', contact: 'Otávio Menezes', since: '2026-07-01' }),
  // Pessoas físicas
  C({ key: 'joao', name: 'João Pedro Martins', personType: 'F', category: 'EXTERNO_PF', segment: 'PF', city: 'Campinas', district: 'Nova Campinas', zip: '13092150', street: 'Rua Buarque de Macedo', method: 'PIX', payer: 'GOOD', freq: 2, creditLimit: 1500, financial: 'APPROVED', contact: 'João Pedro Martins' }),
  C({ key: 'mariana', name: 'Mariana Costa Albuquerque', personType: 'F', category: 'EXTERNO_PF', segment: 'PF', city: 'Valinhos', district: 'Jardim Paiquerê', zip: '13271610', street: 'Rua das Hortênsias', method: 'PIX', payer: 'GOOD', freq: 1, creditLimit: 1000, financial: 'APPROVED', contact: 'Mariana Costa' }),
  C({ key: 'ricardo', name: 'Ricardo Tavares Neto', personType: 'F', category: 'EXTERNO_PF', segment: 'PF', city: 'Campinas', district: 'Alphaville', zip: '13098320', street: 'Alameda Itapecerica', seller: 'seller2', method: 'CARD', payer: 'GOOD', freq: 2, creditLimit: 2000, financial: 'APPROVED', contact: 'Ricardo Tavares' }),
  C({ key: 'beatriz', name: 'Beatriz Nogueira Lopes', personType: 'F', category: 'EXTERNO_PF', segment: 'PF', city: 'Jundiaí', district: 'Anhangabaú', zip: '13208050', street: 'Rua Rangel Pestana', method: 'PIX', payer: 'GOOD', freq: 1, creditLimit: 800, financial: 'PENDING', contact: 'Beatriz Nogueira' }),
  C({ key: 'antonio', name: 'Antônio Carlos Ferreira', personType: 'F', category: 'EXTERNO_PF', segment: 'PF', city: 'Sumaré', district: 'Jardim Bela Vista', zip: '13171210', street: 'Rua Ipiranga', method: 'PIX', payer: 'AVG', freq: 1, creditLimit: 800, financial: 'APPROVED', contact: 'Antônio Ferreira' }),
  C({ key: 'luana', name: 'Luana Prates Guimarães', personType: 'F', category: 'EXTERNO_PF', segment: 'PF', city: 'Hortolândia', district: 'Remanso Campineiro', zip: '13184010', street: 'Rua João Batista', method: 'PIX', payer: 'GOOD', freq: 1, creditLimit: 500, financial: 'APPROVED', contact: 'Luana Prates' }),
  C({ key: 'gustavo', name: 'Gustavo Henrique Lemos', personType: 'F', category: 'EXTERNO_PF', segment: 'PF', city: 'Campinas', district: 'Guanabara', zip: '13073010', street: 'Rua Barreto Leme', seller: 'seller1', method: 'PIX', payer: 'GOOD', freq: 1, creditLimit: 1000, financial: 'APPROVED', contact: 'Gustavo Lemos' }),
  C({ key: 'fernanda', name: 'Fernanda Rocha', personType: 'F', category: 'INTERNO_PF', segment: 'PF', city: 'Campinas', district: 'Taquaral', zip: '13076100', street: 'Rua Dr. Oswaldo Cruz', method: 'PIX', payer: 'GOOD', freq: 1, creditLimit: 800, financial: 'APPROVED', contact: 'Fernanda Rocha' }),
  C({ key: 'diego', name: 'Diego Alves', personType: 'F', category: 'INTERNO_PF', segment: 'PF', city: 'Hortolândia', district: 'Jardim Santana', zip: '13185010', street: 'Rua Pastor Hugo Gegembauer', method: 'PIX', payer: 'GOOD', freq: 1, creditLimit: 800, financial: 'APPROVED', contact: 'Diego Alves' }),
  // Intercompany
  C({ key: 'ic-mvgb', name: 'MVGB Alimentação Ltda', tradeName: 'MVGB', personType: 'J', category: 'EXTERNO_CNPJ', segment: 'INTERCOMPANY', city: 'Campinas', district: 'Chácara Primavera', zip: '13087530', street: 'Rodovia Dom Pedro I, km 140', table: 'INTERCOMPANY', terms: '30', method: 'TRANSFER', payer: 'GOOD', freq: 1, creditLimit: 100000, financial: 'APPROVED', intercompany: 'MVGB', contact: 'Controladoria MVGB' }),
  C({ key: 'ic-grtb', name: 'GRTB Alimentação Ltda', tradeName: 'GRTB', personType: 'J', category: 'EXTERNO_CNPJ', segment: 'INTERCOMPANY', city: 'Jundiaí', district: 'Distrito Industrial', zip: '13213080', street: 'Avenida Antonio Pincinato', table: 'INTERCOMPANY', terms: '30', method: 'TRANSFER', payer: 'GOOD', freq: 1, creditLimit: 100000, financial: 'APPROVED', intercompany: 'GRTB', contact: 'Controladoria GRTB' }),
  C({ key: 'ic-girassol', name: 'Girassol Alimentação Ltda', tradeName: 'Girassol', personType: 'J', category: 'EXTERNO_CNPJ', segment: 'INTERCOMPANY', city: 'Americana', district: 'Distrito Industrial', zip: '13474010', street: 'Avenida Nicolau João Abdalla', table: 'INTERCOMPANY', terms: '30', method: 'TRANSFER', payer: 'GOOD', freq: 1, creditLimit: 100000, financial: 'APPROVED', intercompany: 'GIRASSOL', contact: 'Controladoria Girassol' }),
];

/** Produtos preferidos por segmento (nome, peso) e faixa de quantidade (kg ou un). */
export const SEGMENT_MIX: Record<Segment, { items: [string, number][]; count: [number, number]; kg: [number, number]; un: [number, number] }> = {
  CHURRASCARIA: {
    items: [['Picanha', 3], ['Maminha', 2], ['Alcatra', 2], ['Contra-filé', 3], ['Fraldinha', 2], ['Cupim', 2], ['Costela', 4], ['Ancho', 1], ['Chorizo', 1], ['T-bone', 1], ['Linguiça de costela', 2], ['Bife de vazio', 1], ['Cupim casqueirado', 1], ['Filé mignon', 1]],
    count: [4, 7],
    kg: [15, 50],
    un: [0, 0],
  },
  RESTAURANTE: {
    items: [['Alcatra', 2], ['Contra-filé', 2], ['Filé mignon', 2], ['Patinho', 3], ['Coxão mole', 3], ['Músculo', 2], ['Acém', 2], ['Carne moída', 3], ['Lagarto', 1], ['Maminha', 1], ['Ossobuco', 1], ['Miolo da paleta', 2], ['Paleta', 1], ['Costela', 1], ['Coxão duro', 1]],
    count: [4, 7],
    kg: [12, 40],
    un: [0, 0],
  },
  HAMBURGUERIA: {
    items: [['Carne moída', 3], ['Hambúrguer 150g', 3], ['Acém', 3], ['Fraldinha', 1], ['Costela', 2], ['Cupim', 1], ['Paleta', 1]],
    count: [3, 5],
    kg: [20, 60],
    un: [150, 400],
  },
  ACOUGUE: {
    items: [['Acém', 4], ['Patinho', 3], ['Coxão mole', 3], ['Coxão duro', 3], ['Paleta', 3], ['Músculo', 3], ['Carne moída', 3], ['Costela', 3], ['Alcatra', 2], ['Contra-filé', 2], ['Picanha', 1], ['Lagarto', 2], ['Miolo da paleta', 2], ['Ossobuco', 1], ['Fraldinha', 1], ['Maminha', 1], ['Cupim', 1]],
    count: [5, 9],
    kg: [25, 80],
    un: [0, 0],
  },
  EMPORIO: {
    items: [['Picanha', 2], ['Ancho', 2], ['Chorizo', 2], ['T-bone', 2], ['Filé mignon', 2], ['Picanha fatiada', 2], ['Hambúrguer 150g', 2], ['Linguiça de costela', 2], ['Cupim casqueirado', 1], ['Bife de vazio', 1], ['Ossobuco', 1]],
    count: [3, 6],
    kg: [5, 18],
    un: [40, 120],
  },
  BUFFET: {
    items: [['Picanha', 2], ['Alcatra', 2], ['Contra-filé', 2], ['Fraldinha', 2], ['Costela', 3], ['Linguiça de costela', 2], ['Coxão mole', 1], ['Maminha', 1], ['Cupim', 1], ['Acém', 1], ['Miolo da paleta', 1]],
    count: [4, 6],
    kg: [15, 50],
    un: [0, 0],
  },
  PF: {
    items: [['Picanha', 3], ['Alcatra', 2], ['Contra-filé', 2], ['Fraldinha', 2], ['Costela', 2], ['Linguiça de costela', 2], ['Hambúrguer 150g', 1], ['Maminha', 1], ['Carne moída', 1], ['Patinho', 1], ['Ancho', 1], ['Cupim', 1]],
    count: [2, 4],
    kg: [1, 4],
    un: [10, 20],
  },
  INTERCOMPANY: {
    items: [['Picanha', 2], ['Contra-filé', 3], ['Alcatra', 3], ['Fraldinha', 2], ['Hambúrguer 150g', 2], ['Linguiça de costela', 2], ['Cupim', 1], ['Costela', 2]],
    count: [3, 5],
    kg: [15, 45],
    un: [200, 400],
  },
};

export const SUPPLY_SEEDS = [
  { key: 'sacola', name: 'Sacola térmica personalizada', sku: 'SAC-TERM-01', category: 'EMBALAGEM', unit: 'UN', min: 50, cost: 6.4, salePrice: 12.9, sellable: true, initial: 250, monthlyOut: 0, supplier: 'Embala Mais Campinas' },
  { key: 'band1', name: 'Bandeja isopor 1 kg', sku: 'BND-1KG', category: 'EMBALAGEM', unit: 'UN', min: 500, cost: 0.18, initial: 3000, monthlyOut: 420, supplier: 'Embala Mais Campinas' },
  { key: 'band2', name: 'Bandeja isopor 2 kg', sku: 'BND-2KG', category: 'EMBALAGEM', unit: 'UN', min: 300, cost: 0.26, initial: 2000, monthlyOut: 260, supplier: 'Embala Mais Campinas' },
  { key: 'etiq', name: 'Etiqueta térmica 100x150 (rolo)', sku: 'ETQ-100150', category: 'ETIQUETA', unit: 'UN', min: 10, cost: 38.5, initial: 30, monthlyOut: 6, supplier: 'Etiquetas Paulista' },
  { key: 'vac1', name: 'Saco a vácuo 20x30', sku: 'VAC-2030', category: 'EMBALAGEM', unit: 'PCT', min: 20, cost: 64.9, initial: 80, monthlyOut: 10, supplier: 'VacuoPack' },
  { key: 'vac2', name: 'Saco a vácuo 25x40', sku: 'VAC-2540', category: 'EMBALAGEM', unit: 'PCT', min: 15, cost: 79.9, initial: 60, monthlyOut: 7, supplier: 'VacuoPack' },
  { key: 'caixa', name: 'Caixa de papelão 20 kg', sku: 'CX-20KG', category: 'EMBALAGEM', unit: 'UN', min: 100, cost: 3.9, initial: 600, monthlyOut: 70, supplier: 'Papelão Real' },
  { key: 'pvc', name: 'Filme PVC 38 cm (rolo)', sku: 'PVC-38', category: 'EMBALAGEM', unit: 'UN', min: 6, cost: 42, initial: 24, monthlyOut: 3, supplier: 'Embala Mais Campinas' },
  { key: 'cloro', name: 'Detergente clorado', sku: 'LMP-CLORO', category: 'LIMPEZA', unit: 'L', min: 20, cost: 9.8, initial: 100, monthlyOut: 12, supplier: 'Higiclean' },
] as const;
