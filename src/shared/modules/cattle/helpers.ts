/**
 * Utilidades do módulo de gado (puras — sem acesso a dados).
 */
import { addDays, daysBetween, normalize, round2, today } from '../../domain/format';
import { COST_CATEGORIES, COST_GROUP_LABELS } from '../../domain/labels';
import type { Animal, Batch, BatchCost, CostCategory, CostGroup } from '../../domain/types';
import type { AnimalInput, InstallmentPlan } from '../../ops/types';
import { parseNumber, type ComboOption } from '../../ui';

export const ACTIVE_STATUSES = ['PURCHASED', 'IN_PASTURE'] as const;
export const isActiveBatch = (b: Pick<Batch, 'status'>) => b.status === 'PURCHASED' || b.status === 'IN_PASTURE';

export const batchLabel = (b: Pick<Batch, 'code' | 'name'>) => `${b.code} · ${b.name}`;

/** "NF 123" sem duplicar quando o valor já traz o prefixo ("NF NF 123"). */
export const prefixed = (prefix: string, v: string | null | undefined) =>
  !v ? '' : v.trim().toUpperCase().startsWith(prefix.toUpperCase()) ? v.trim() : `${prefix} ${v.trim()}`;

/** Dias em engorda: da compra até o abate (ou hoje). */
export function daysOnFeed(b: Pick<Batch, 'purchaseDate' | 'slaughterDate'>): number | null {
  if (!b.purchaseDate) return null;
  return Math.max(0, daysBetween(b.purchaseDate, b.slaughterDate || today()));
}

/** Ordem de exibição dos grupos de custo. */
export const COST_GROUP_ORDER: CostGroup[] = ['ACQUISITION', 'OPERATIONAL', 'SLAUGHTER', 'FISCAL', 'COMMERCIAL', 'OTHER', 'CREDIT'];

/** Slot fixo de cor por grupo (segue a entidade, não a posição). */
export const COST_GROUP_SLOT: Record<CostGroup, number> = {
  ACQUISITION: 1,
  OPERATIONAL: 2,
  SLAUGHTER: 3,
  FISCAL: 4,
  COMMERCIAL: 5,
  OTHER: 6,
  CREDIT: 7,
};

export const groupOf = (c: CostCategory): CostGroup => (COST_CATEGORIES[c] || COST_CATEGORIES.OTHER).group;
export const categoryLabel = (c: CostCategory) => (COST_CATEGORIES[c] || COST_CATEGORIES.OTHER).label;
export const isCreditCategory = (c: CostCategory) => groupOf(c) === 'CREDIT';

/** Opções de categoria para Combobox (grupo na descrição). */
export const COST_CATEGORY_OPTIONS: ComboOption[] = COST_GROUP_ORDER.flatMap((g) =>
  (Object.keys(COST_CATEGORIES) as CostCategory[])
    .filter((c) => COST_CATEGORIES[c].group === g)
    .map((c) => ({ value: c, label: COST_CATEGORIES[c].label, description: COST_GROUP_LABELS[g], keywords: c })),
);

export const categoriesOfGroup = (g: CostGroup) => (Object.keys(COST_CATEGORIES) as CostCategory[]).filter((c) => COST_CATEGORIES[c].group === g);

/** Soma líquida (créditos negativos). */
export function netCostOf(costs: Pick<BatchCost, 'category' | 'amount'>[]): number {
  return round2(costs.reduce((s, c) => s + (isCreditCategory(c.category) ? -1 : 1) * (Number(c.amount) || 0), 0));
}

/** Valor com sinal (créditos negativos) — para listas e totais. */
export const signedAmount = (c: Pick<BatchCost, 'category' | 'amount'>) => (isCreditCategory(c.category) ? -1 : 1) * (Number(c.amount) || 0);

export const COST_SOURCE_LABELS: Record<BatchCost['source'], string> = {
  MANUAL: 'Manual',
  FEED: 'Ração',
  IMPORT: 'Importação',
  SLAUGHTER: 'Abate',
  PROCESSING: 'Desossa',
  MIGRATION: 'Migração',
};

/** Custos lançados por outras telas não podem ser removidos aqui. */
export const isRemovableCost = (c: Pick<BatchCost, 'source'>) => c.source === 'MANUAL' || c.source === 'IMPORT' || c.source === 'MIGRATION';

// ---------------------------------------------------------------------------
// Animais
// ---------------------------------------------------------------------------

export function aliveCount(b: Batch, animals: Animal[]): number {
  const mine = animals.filter((a) => a.batchId === b.id);
  if (mine.length) return mine.filter((a) => a.status === 'ALIVE').length;
  return isActiveBatch(b) ? b.headCount || 0 : 0;
}

export function parseSex(s: string | null | undefined): 'MALE' | 'FEMALE' | null {
  const t = normalize(s || '');
  if (!t) return null;
  if (['m', 'macho', 'male', 'boi', 'garrote', 'novilho'].includes(t)) return 'MALE';
  if (['f', 'femea', 'female', 'vaca', 'novilha', 'bezerra'].includes(t)) return 'FEMALE';
  return null;
}

export const SEX_LABELS = { MALE: 'Macho', FEMALE: 'Fêmea' } as const;

export interface ParsedAnimals {
  animals: AnimalInput[];
  errors: string[];
}

/**
 * Lê uma lista colada do Excel: uma linha por animal, colunas separadas por
 * tabulação ou ponto e vírgula — brinco; peso; preço; [sexo]; [raça].
 * Ignora cabeçalho (linha sem peso numérico).
 */
export function parseAnimalLines(text: string): ParsedAnimals {
  const animals: AnimalInput[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  lines.forEach((line, i) => {
    const cols = line.split(/\t|;/).map((c) => c.trim());
    const [tag, w, p, sex, breed] = cols;
    const weight = parseNumber(w || '');
    if (i === 0 && weight === null && !/^\d/.test(w || '')) return; // cabeçalho
    if (!tag) return void errors.push(`Linha ${i + 1}: sem brinco.`);
    if (!weight || weight <= 0) return void errors.push(`Linha ${i + 1} (${tag}): peso inválido.`);
    const price = parseNumber(p || '');
    if (p && price === null) return void errors.push(`Linha ${i + 1} (${tag}): preço inválido.`);
    animals.push({ tag, entryWeightKg: weight, purchasePrice: price ?? 0, sex: parseSex(sex), breed: breed || null });
  });
  return { animals, errors };
}

/** Localiza a coluna de um CSV pelo nome do cabeçalho (aceita variações). */
export function findColumn(headers: string[], aliases: string[]): string {
  const norm = headers.map((h) => ({ h, n: normalize(h).replace(/[^a-z0-9]/g, '') }));
  for (const a of aliases) {
    const na = normalize(a).replace(/[^a-z0-9]/g, '');
    const hit = norm.find((x) => x.n === na) || norm.find((x) => x.n.startsWith(na));
    if (hit) return hit.h;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Datas e categorias vindas de planilhas
// ---------------------------------------------------------------------------

/** Aceita 31/12/2026, 31/12/26, 2026-12-31 → 'YYYY-MM-DD' (ou null). */
export function parseDateBR(s: string | null | undefined): string | null {
  const t = (s || '').trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    const mm = Number(m[2]);
    const dd = Number(m[1]);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    return `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }
  return null;
}

/** Sinônimos usados nas planilhas do sistema antigo. */
const CATEGORY_SYNONYMS: Record<string, CostCategory> = {
  'preco de compra': 'PURCHASE',
  compra: 'PURCHASE',
  'valor animal': 'PURCHASE',
  'compra de gado': 'PURCHASE',
  'protocolo entrada': 'ENTRY_PROTOCOL',
  'protocolo de entrada': 'ENTRY_PROTOCOL',
  'comissao de compra': 'PURCHASE_COMMISSION',
  'comissao compra': 'PURCHASE_COMMISSION',
  'comissao de venda': 'SALES_COMMISSION',
  'comissao venda': 'SALES_COMMISSION',
  'transporte compra': 'PURCHASE_FREIGHT',
  'frete compra': 'PURCHASE_FREIGHT',
  'frete de compra': 'PURCHASE_FREIGHT',
  'transporte sede': 'HQ_FREIGHT',
  'frete sede': 'HQ_FREIGHT',
  'transporte abate': 'SLAUGHTER_FREIGHT',
  'frete abate': 'SLAUGHTER_FREIGHT',
  'frete de retorno abate': 'SLAUGHTER_RETURN_FREIGHT',
  'frete retorno abate': 'SLAUGHTER_RETURN_FREIGHT',
  'frete de retorno desossa': 'DEBONING_RETURN_FREIGHT',
  'frete retorno desossa': 'DEBONING_RETURN_FREIGHT',
  alimentacao: 'FEED',
  racao: 'FEED',
  suplemento: 'FEED',
  vacina: 'VACCINE',
  vacinas: 'VACCINE',
  veterinaria: 'VETERINARY',
  veterinario: 'VETERINARY',
  pasto: 'PASTURE',
  arrendamento: 'PASTURE',
  hospedagem: 'LODGING',
  diaria: 'LODGING',
  'mao de obra': 'LABOR',
  'custo abate': 'SLAUGHTER_FEE',
  abate: 'SLAUGHTER_FEE',
  cortes: 'CUTTING',
  corte: 'CUTTING',
  'mao de obra desossa': 'DEBONING',
  desossa: 'DEBONING',
  'credito de imposto': 'TAX_CREDIT',
  'credito imposto': 'TAX_CREDIT',
  'retorno abate': 'SLAUGHTER_RETURN',
  'retorno do abate': 'SLAUGHTER_RETURN',
  'funrural compra': 'FUNRURAL_PURCHASE',
  'funrural venda': 'FUNRURAL_SALE',
  funrural: 'FUNRURAL_PURCHASE',
  'icms compra': 'ICMS_PURCHASE',
  'icms venda': 'ICMS_SALE',
  icms: 'ICMS_PURCHASE',
  'senar compra': 'SENAR_PURCHASE',
  'senar venda': 'SENAR_SALE',
  senar: 'SENAR_PURCHASE',
  'taxa gta': 'GTA_FEE',
  gta: 'GTA_FEE',
  inspecao: 'INSPECTION_FEE',
  'taxa inspecao': 'INSPECTION_FEE',
  outros: 'OTHER',
  outro: 'OTHER',
};

/** Reconhece a categoria a partir do texto da planilha (código, rótulo ou sinônimo). */
export function matchCostCategory(text: string | null | undefined): CostCategory | null {
  const raw = (text || '').trim();
  if (!raw) return null;
  const up = raw.toUpperCase().replace(/\s+/g, '_');
  if ((COST_CATEGORIES as Record<string, unknown>)[up]) return up as CostCategory;
  const n = normalize(raw).replace(/[()]/g, '').replace(/\s+/g, ' ').trim();
  for (const c of Object.keys(COST_CATEGORIES) as CostCategory[]) {
    if (normalize(COST_CATEGORIES[c].label).replace(/[()]/g, '') === n) return c;
  }
  if (CATEGORY_SYNONYMS[n]) return CATEGORY_SYNONYMS[n];
  const hit = Object.keys(CATEGORY_SYNONYMS)
    .sort((a, b) => b.length - a.length)
    .find((k) => n.includes(k));
  return hit ? CATEGORY_SYNONYMS[hit] : null;
}

// ---------------------------------------------------------------------------
// Parcelas (prévia — a divisão real é feita pelas operações)
// ---------------------------------------------------------------------------

export function previewInstallments(total: number, plan: InstallmentPlan, issueDate: string): { dueDate: string; amount: number }[] {
  const t = round2(total);
  if (!(t > 0)) return [];
  const terms = (plan.terms || '')
    .split(/[/,;\s]+/)
    .map((x) => parseInt(x, 10))
    .filter((n) => Number.isFinite(n) && n >= 0);
  let dues: string[];
  if (terms.length) dues = terms.map((d) => addDays(issueDate, d));
  else {
    const n = Math.max(1, Math.floor(plan.installments || 1));
    const first = plan.firstDueDate || issueDate;
    dues = Array.from({ length: n }, (_, i) => addDays(first, i * (plan.intervalDays || 30)));
  }
  const base = Math.floor((t / dues.length) * 100) / 100;
  return dues.map((dueDate, i) => ({ dueDate, amount: i === dues.length - 1 ? round2(t - base * (dues.length - 1)) : base }));
}
