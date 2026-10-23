/**
 * Estado e cálculos do fluxo de registro de abate (sem React).
 */
import { round2, round3 } from '../../domain/format';
import { COST_CATEGORIES } from '../../domain/labels';
import type { Animal, BatchCost, CostCategory, Product } from '../../domain/types';
import type { SlaughterInput } from '../../ops/types';
import { DEFAULT_SPLIT, findProductByName } from './shared';

export interface CostLine {
  key: string;
  category: CostCategory;
  amount: number | null;
  documentNumber: string;
  /** Linhas fixas não podem ser removidas (só zeradas). */
  fixed?: boolean;
}

export interface OutputLine {
  key: string;
  productId: string;
  qty: number | null;
  /** Vazio = custo médio sugerido. */
  unitCost: number | null;
}

export interface AnimalWeight {
  exit: number | null;
  carcass: number | null;
}

export interface SlaughterDraft {
  batchId: string;
  slaughterhouseId: string;
  date: string;
  gtaNumber: string;
  exitScaleWeightKg: number | null;
  transportLossPercent: number | null;
  carcassWeightKg: number | null;
  animalWeights: Record<string, AnimalWeight>;
  costs: CostLine[];
  split: { traseiro: number | null; dianteiro: number | null; ponta: number | null };
  outputs: OutputLine[];
  notes: string;
}

let seq = 0;
export const lineKey = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

export const DEFAULT_COSTS: CostCategory[] = ['SLAUGHTER_FREIGHT', 'SLAUGHTER_FEE', 'SLAUGHTER_RETURN_FREIGHT', 'SLAUGHTER_RETURN'];

/** Categorias oferecidas no passo de custos (abate + créditos + taxas ligadas ao frigorífico). */
export const SLAUGHTER_COST_OPTIONS = (Object.keys(COST_CATEGORIES) as CostCategory[])
  .filter((c) => {
    const g = COST_CATEGORIES[c].group;
    return g === 'SLAUGHTER' || g === 'CREDIT' || c === 'INSPECTION_FEE' || c === 'GTA_FEE';
  })
  .map((c) => ({ value: c, label: COST_CATEGORIES[c].label + (COST_CATEGORIES[c].group === 'CREDIT' ? ' (crédito)' : '') }));

export const isCredit = (c: CostCategory) => COST_CATEGORIES[c].group === 'CREDIT';

export function emptyDraft(today: string): SlaughterDraft {
  return {
    batchId: '',
    slaughterhouseId: '',
    date: today,
    gtaNumber: '',
    exitScaleWeightKg: null,
    transportLossPercent: null,
    carcassWeightKg: null,
    animalWeights: {},
    costs: DEFAULT_COSTS.map((category) => ({ key: lineKey(), category, amount: null, documentNumber: '', fixed: true })),
    split: { ...DEFAULT_SPLIT },
    outputs: [],
    notes: '',
  };
}

/** Custo líquido de uma lista de custos (créditos subtraem). */
export function netOf(items: { category: CostCategory; amount: number | null | undefined }[]): number {
  return items.reduce((s, c) => s + (isCredit(c.category) ? -1 : 1) * (c.amount || 0), 0);
}

export interface SlaughterCalc {
  heads: number;
  animalExitSum: number;
  animalCarcassSum: number;
  animalsWithExit: number;
  animalsWithCarcass: number;
  /** Estimativa do peso vivo pelo cadastro (peso atual ou de entrada). */
  registeredLiveKg: number;
  arrivalKg: number | null;
  yieldPercent: number | null;
  yieldOnArrival: number | null;
  carcassPerHead: number | null;
  arrobas: number;
  slaughterGross: number;
  slaughterCredits: number;
  slaughterNet: number;
  existingNet: number;
  totalCost: number;
  costPerKg: number;
  outputKg: number;
  outputDiffKg: number;
  outputValue: number;
}

export function calcSlaughter(d: SlaughterDraft, alive: Animal[], existingCosts: BatchCost[]): SlaughterCalc {
  const weights = alive.map((a) => d.animalWeights[a.id]).filter(Boolean);
  const animalExitSum = weights.reduce((s, w) => s + (w.exit || 0), 0);
  const animalCarcassSum = weights.reduce((s, w) => s + (w.carcass || 0), 0);
  const exit = d.exitScaleWeightKg || null;
  const carcass = d.carcassWeightKg || 0;
  const loss = d.transportLossPercent || 0;
  const arrivalKg = exit ? exit * (1 - loss / 100) : null;
  const slaughterGross = d.costs.filter((c) => !isCredit(c.category)).reduce((s, c) => s + (c.amount || 0), 0);
  const slaughterCredits = d.costs.filter((c) => isCredit(c.category)).reduce((s, c) => s + (c.amount || 0), 0);
  const existingNet = netOf(existingCosts);
  const totalCost = existingNet + slaughterGross - slaughterCredits;
  const costPerKg = carcass > 0 ? totalCost / carcass : 0;
  const outputKg = d.outputs.reduce((s, o) => s + (o.qty || 0), 0);
  const outputValue = d.outputs.reduce((s, o) => s + (o.qty || 0) * (o.unitCost ?? costPerKg), 0);
  return {
    heads: alive.length,
    animalExitSum,
    animalCarcassSum,
    animalsWithExit: weights.filter((w) => w.exit).length,
    animalsWithCarcass: weights.filter((w) => w.carcass).length,
    registeredLiveKg: alive.reduce((s, a) => s + (a.currentWeightKg || a.entryWeightKg || 0), 0),
    arrivalKg,
    yieldPercent: exit && carcass ? (carcass / exit) * 100 : null,
    yieldOnArrival: arrivalKg && carcass ? (carcass / arrivalKg) * 100 : null,
    carcassPerHead: carcass && alive.length ? carcass / alive.length : null,
    arrobas: carcass / 15,
    slaughterGross,
    slaughterCredits,
    slaughterNet: slaughterGross - slaughterCredits,
    existingNet,
    totalCost,
    costPerKg,
    outputKg,
    outputDiffKg: outputKg - carcass,
    outputValue,
  };
}

/** Divide a carcaça em traseiro/dianteiro/ponta pelos % informados. */
export function splitOutputs(d: SlaughterDraft, rawProducts: Product[]): OutputLine[] | string {
  const carcass = d.carcassWeightKg || 0;
  if (carcass <= 0) return 'Informe o peso de carcaça no passo de pesagem.';
  const parts: [Product | undefined, number, string][] = [
    [findProductByName(rawProducts, 'traseiro'), d.split.traseiro || 0, 'Traseiro'],
    [findProductByName(rawProducts, 'dianteiro'), d.split.dianteiro || 0, 'Dianteiro'],
    [findProductByName(rawProducts, 'ponta de agulha', 'ponta'), d.split.ponta || 0, 'Ponta de agulha'],
  ];
  const missing = parts.filter(([p, pct]) => pct > 0 && !p).map(([, , n]) => n);
  if (missing.length) return `Cadastre o produto "${missing.join('", "')}" (tipo Carcaça / matéria-prima) em Cortes e produtos.`;
  const totalPct = parts.reduce((s, [, pct]) => s + pct, 0);
  if (Math.abs(totalPct - 100) > 0.01) return `A divisão soma ${round2(totalPct)}% — ajuste para 100%.`;
  const used = parts.filter(([, pct]) => pct > 0);
  let acc = 0;
  return used.map(([p, pct], i) => {
    const qty = i === used.length - 1 ? round3(carcass - acc) : round3((carcass * pct) / 100);
    acc += qty;
    return { key: lineKey(), productId: p!.id, qty, unitCost: null };
  });
}

export function wholeCarcassOutput(d: SlaughterDraft, rawProducts: Product[]): OutputLine[] | string {
  const carcass = d.carcassWeightKg || 0;
  if (carcass <= 0) return 'Informe o peso de carcaça no passo de pesagem.';
  const p = findProductByName(rawProducts, 'carcaça bovina', 'carcaça', 'carcaca');
  if (!p) return 'Cadastre o produto "Carcaça" (tipo Carcaça / matéria-prima) em Cortes e produtos.';
  return [{ key: lineKey(), productId: p.id, qty: round3(carcass), unitCost: null }];
}

/** Valida um passo. Retorna a primeira mensagem de erro ou null. */
export function validateStep(step: number, d: SlaughterDraft, c: SlaughterCalc): string | null {
  if (step === 0) {
    if (!d.batchId) return 'Selecione o lote que vai para o abate.';
    if (!d.slaughterhouseId) return 'Selecione o frigorífico.';
    if (!d.date) return 'Informe a data do abate.';
    return null;
  }
  if (step === 1) {
    if (!d.carcassWeightKg || d.carcassWeightKg <= 0) return 'Informe o peso total de carcaça.';
    if (d.exitScaleWeightKg && d.carcassWeightKg > d.exitScaleWeightKg) return 'O peso de carcaça não pode ser maior que o peso vivo de saída.';
    if (d.transportLossPercent != null && (d.transportLossPercent < 0 || d.transportLossPercent >= 100)) return 'A quebra de transporte deve ficar entre 0% e 100%.';
    return null;
  }
  if (step === 2) {
    if (d.costs.some((x) => x.amount != null && x.amount < 0)) return 'Os valores de custo não podem ser negativos.';
    return null;
  }
  if (step === 3) {
    const valid = d.outputs.filter((o) => o.productId && (o.qty || 0) > 0);
    if (!valid.length) return 'Informe ao menos uma saída para o estoque pós-abate (produto e kg).';
    if (d.outputs.some((o) => (o.qty || 0) > 0 && !o.productId)) return 'Escolha o produto de cada linha com peso.';
    if (d.outputs.some((o) => o.unitCost != null && o.unitCost < 0)) return 'Custo por kg não pode ser negativo.';
    if (c.outputKg > (d.carcassWeightKg || 0) * 1.02) return `As saídas somam ${round3(c.outputKg)} kg — mais que a carcaça registrada.`;
    return null;
  }
  return null;
}

export function toInput(d: SlaughterDraft, c: SlaughterCalc): SlaughterInput {
  const suggested = c.costPerKg > 0 ? Math.round(c.costPerKg * 10000) / 10000 : null;
  return {
    batchId: d.batchId,
    date: d.date,
    slaughterhouseId: d.slaughterhouseId,
    gtaNumber: d.gtaNumber.trim() || null,
    exitScaleWeightKg: d.exitScaleWeightKg || null,
    transportLossPercent: d.transportLossPercent ?? null,
    carcassWeightKg: d.carcassWeightKg || 0,
    animals: Object.entries(d.animalWeights)
      .filter(([, w]) => w.exit || w.carcass)
      .map(([animalId, w]) => ({ animalId, exitWeightKg: w.exit || null, carcassWeightKg: w.carcass || null })),
    costs: d.costs
      .filter((x) => (x.amount || 0) > 0)
      .map((x) => ({ category: x.category, amount: round2(x.amount || 0), documentNumber: x.documentNumber.trim() || null })),
    rawOutputs: d.outputs
      .filter((o) => o.productId && (o.qty || 0) > 0)
      .map((o) => ({ productId: o.productId, qty: round3(o.qty || 0), unitCost: o.unitCost ?? suggested })),
    notes: d.notes.trim() || null,
  };
}
