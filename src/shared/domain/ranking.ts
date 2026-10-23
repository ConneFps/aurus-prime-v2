import type { Ranking } from './types';

export interface RankingThresholds {
  silverFrom: number;
  goldFrom: number;
}

export const DEFAULT_RANKING: RankingThresholds = { silverFrom: 25000, goldFrom: 50000 };

/**
 * Ranking do cliente pelo total comprado (R$), mantendo a régua da v1:
 * Ouro ≥ 50 mil (5★), Prata ≥ 25 mil (4★), Bronze: ≥10 mil 3★, ≥2 mil 2★, >0 1★.
 */
export function rankCustomer(totalPurchases: number, t: RankingThresholds = DEFAULT_RANKING): { ranking: Ranking; stars: number } {
  const v = Number(totalPurchases) || 0;
  if (v >= t.goldFrom) return { ranking: 'GOLD', stars: 5 };
  if (v >= t.silverFrom) return { ranking: 'SILVER', stars: 4 };
  if (v >= t.silverFrom * 0.4) return { ranking: 'BRONZE', stars: 3 };
  if (v >= t.silverFrom * 0.08) return { ranking: 'BRONZE', stars: 2 };
  if (v > 0) return { ranking: 'BRONZE', stars: 1 };
  return { ranking: 'BRONZE', stars: 0 };
}
