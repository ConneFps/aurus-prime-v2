/**
 * Conferência de peso (regra da v1 mantida).
 *
 * Carne é vendida por quilo e a peça nunca fecha no número exato. O pedido
 * nasce ESTIMADO e só vira cobrança depois que a equipe pesa. Se o valor
 * final passar da tolerância, o cliente precisa aceitar (AWAITING_CUSTOMER).
 * Pesar MENOS nunca pede aprovação.
 */
import { money, round2, round3 } from './format';
import type { AppSettings, WeighingOutcome } from './types';

export interface WeighingPolicy {
  /** Variação para cima aceita sem aprovação (% do estimado). */
  tolerancePercent: number;
  /** Teto em R$ para o aceite automático. null desliga. */
  toleranceMaxValue: number | null;
  /** Horas até o aceite automático quando o cliente não responde. null desliga. */
  autoApproveAfterHours: number | null;
}

export const DEFAULT_WEIGHING_POLICY: WeighingPolicy = {
  tolerancePercent: 5,
  toleranceMaxValue: 150,
  autoApproveAfterHours: 6,
};

export function policyFromSettings(s?: Partial<AppSettings> | null): WeighingPolicy {
  return {
    tolerancePercent: s?.weighingTolerancePercent ?? DEFAULT_WEIGHING_POLICY.tolerancePercent,
    toleranceMaxValue: s?.weighingToleranceMaxValue ?? DEFAULT_WEIGHING_POLICY.toleranceMaxValue,
    autoApproveAfterHours: s?.weighingAutoApproveHours ?? DEFAULT_WEIGHING_POLICY.autoApproveAfterHours,
  };
}

export function evaluateWeighing(estimatedTotal: number, finalTotal: number, policy: WeighingPolicy = DEFAULT_WEIGHING_POLICY): WeighingOutcome {
  const diffValue = round2(finalTotal - estimatedTotal);
  const diffPercent = estimatedTotal > 0 ? round3((diffValue / estimatedTotal) * 100) : 0;
  let needs = false;
  if (diffValue > 0) {
    if (diffPercent > policy.tolerancePercent) needs = true;
    else if (policy.toleranceMaxValue != null && diffValue > policy.toleranceMaxValue) needs = true;
  }
  return {
    estimatedTotal: round2(estimatedTotal),
    finalTotal: round2(finalTotal),
    diffValue,
    diffPercent,
    needsCustomerApproval: needs,
    decision: needs ? null : 'AUTO',
    decidedAt: null,
  };
}

/** Frase pronta para o cliente, sem jargão. */
export function describeWeighing(o: WeighingOutcome): string {
  const abs = (v: number) => money(Math.abs(v));
  if (o.diffValue === 0) return 'O peso separado fechou exatamente com o pedido.';
  if (o.diffValue < 0) return `As peças pesaram menos que o pedido. Você paga ${abs(o.diffValue)} a menos.`;
  if (!o.needsCustomerApproval) return `As peças pesaram um pouco mais: ${abs(o.diffValue)} acima do estimado, dentro da margem combinada.`;
  return `As peças pesaram ${abs(o.diffValue)} acima do estimado. Confirme para liberar o pagamento.`;
}

/** Passou do prazo de aceite? */
export function isApprovalExpired(weighedAt: string, policy: WeighingPolicy = DEFAULT_WEIGHING_POLICY): boolean {
  if (policy.autoApproveAfterHours == null) return false;
  return Date.now() > new Date(weighedAt).getTime() + policy.autoApproveAfterHours * 3600_000;
}
