import { COST_CATEGORIES } from './labels';
import type { Animal, Batch, BatchCost, CostGroup, StockLot, StockMovement } from './types';
import { round2 } from './format';

export interface BatchEconomics {
  headCount: number;
  aliveCount: number;
  purchaseWeightKg: number;
  carcassWeightKg: number;
  /** Custos por grupo (créditos já negativos no grupo CREDIT). */
  byGroup: Record<CostGroup, number>;
  grossCost: number;
  credits: number;
  totalCost: number;
  costPerHead: number;
  costPerCarcassKg: number;
  costPerArroba: number;
  /** Receita realizada (vendas com baixa em lotes deste lote de gado). */
  realizedRevenue: number;
  soldKg: number;
  /** Estoque ainda disponível deste lote (kg, pós-abate + venda). */
  remainingKg: number;
  /** Valor estimado do estoque restante (preço de referência ou preço médio realizado). */
  remainingValue: number;
  /** Receita projetada: carcaça × preço de referência (quando nada foi vendido ainda). */
  projectedRevenue: number;
  /** Receita considerada no resultado (override > realizada + estoque > projetada). */
  revenue: number;
  revenueSource: 'OVERRIDE' | 'REALIZED' | 'MIXED' | 'PROJECTED' | 'NONE';
  profit: number;
  marginPercent: number;
  roiPercent: number;
  carcassYieldPercent: number | null;
}

const emptyGroups = (): Record<CostGroup, number> => ({
  ACQUISITION: 0,
  OPERATIONAL: 0,
  SLAUGHTER: 0,
  FISCAL: 0,
  COMMERCIAL: 0,
  CREDIT: 0,
  OTHER: 0,
});

/** Resultado econômico (DRE) de um lote de gado. */
export function batchEconomics(
  batch: Batch,
  costs: BatchCost[],
  animals: Animal[] = [],
  movements: StockMovement[] = [],
  lots: StockLot[] = [],
): BatchEconomics {
  const byGroup = emptyGroups();
  let gross = 0;
  let credits = 0;
  for (const c of costs) {
    if (c.batchId !== batch.id) continue;
    const meta = COST_CATEGORIES[c.category] || COST_CATEGORIES.OTHER;
    const amt = Number(c.amount) || 0;
    if (meta.group === 'CREDIT') {
      credits += amt;
      byGroup.CREDIT -= amt;
    } else {
      gross += amt;
      byGroup[meta.group] += amt;
    }
  }
  const mine = animals.filter((a) => a.batchId === batch.id);
  const headCount = mine.length || batch.headCount || 0;
  const aliveCount = mine.length ? mine.filter((a) => a.status === 'ALIVE').length : batch.status === 'SLAUGHTERED' || batch.status === 'FINISHED' ? 0 : headCount;
  const purchaseWeightKg = mine.length ? mine.reduce((s, a) => s + (a.entryWeightKg || 0), 0) : batch.purchaseWeightKg || 0;
  const carcassWeightKg = batch.carcassWeightKg || mine.reduce((s, a) => s + (a.carcassWeightKg || 0), 0) || 0;
  const totalCost = gross - credits;

  let realizedRevenue = 0;
  let soldKg = 0;
  for (const m of movements) {
    if (m.batchId !== batch.id) continue;
    if (m.type === 'SALE' || m.type === 'SALE_REVERSAL') {
      realizedRevenue += -m.qty * (m.unitPrice || 0);
      soldKg += -m.qty;
    }
  }
  const projectedRevenue = carcassWeightKg * (batch.sellingPricePerKg || 0);
  const remainingKg = lots
    .filter((l) => l.batchId === batch.id && l.status !== 'DEPLETED' && l.unit === 'KG')
    .reduce((s, l) => s + (l.balanceQty || 0), 0);
  const avgRealized = soldKg > 0 ? realizedRevenue / soldKg : 0;
  const refPrice = batch.sellingPricePerKg || avgRealized;
  const remainingValue = remainingKg * refPrice;
  let revenue = 0;
  let revenueSource: BatchEconomics['revenueSource'] = 'NONE';
  if (batch.revenueOverride) {
    revenue = batch.revenueOverride;
    revenueSource = 'OVERRIDE';
  } else if (realizedRevenue > 0) {
    revenue = realizedRevenue + remainingValue;
    revenueSource = remainingValue > 0.5 ? 'MIXED' : 'REALIZED';
  } else if (remainingValue > 0) {
    revenue = remainingValue;
    revenueSource = 'PROJECTED';
  } else if (projectedRevenue > 0) {
    revenue = projectedRevenue;
    revenueSource = 'PROJECTED';
  }
  const profit = revenue - totalCost;
  return {
    headCount,
    aliveCount,
    purchaseWeightKg,
    carcassWeightKg,
    byGroup,
    grossCost: round2(gross),
    credits: round2(credits),
    totalCost: round2(totalCost),
    costPerHead: headCount ? round2(totalCost / headCount) : 0,
    costPerCarcassKg: carcassWeightKg ? round2(totalCost / carcassWeightKg) : 0,
    costPerArroba: carcassWeightKg ? round2(totalCost / (carcassWeightKg / 15)) : 0,
    realizedRevenue: round2(realizedRevenue),
    soldKg,
    remainingKg,
    remainingValue: round2(remainingValue),
    projectedRevenue: round2(projectedRevenue),
    revenue: round2(revenue),
    revenueSource,
    profit: round2(profit),
    marginPercent: revenue ? round2((profit / revenue) * 100) : 0,
    roiPercent: totalCost ? round2((profit / totalCost) * 100) : 0,
    carcassYieldPercent:
      batch.carcassYieldPercent ??
      (carcassWeightKg && (batch.exitScaleWeightKg || purchaseWeightKg)
        ? round2((carcassWeightKg / (batch.exitScaleWeightKg || purchaseWeightKg)) * 100)
        : null),
  };
}

/** Grupo de uma categoria de custo. */
export const costGroupOf = (c: BatchCost['category']): CostGroup => (COST_CATEGORIES[c] || COST_CATEGORIES.OTHER).group;
