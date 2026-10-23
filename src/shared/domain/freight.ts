/**
 * Frete por zona de CEP (regra da v1 mantida).
 * Uma tabela de zonas por prefixo de CEP resolve a operação regional, é
 * auditável e a equipe comercial mantém sozinha — sem API paga de rotas.
 */
import type { FreightZone } from './types';
import { money, onlyDigits } from './format';

export interface FreightSettings {
  zones: FreightZone[];
  /** Acima deste valor o frete é zerado. null desliga a regra. */
  freeAbove: number | null;
  pickupEnabled: boolean;
}

export type FreightResult =
  | { kind: 'PICKUP'; value: 0; label: string }
  | { kind: 'FREE'; value: 0; label: string; zone: FreightZone }
  | { kind: 'CHARGED'; value: number; label: string; zone: FreightZone }
  | { kind: 'BELOW_MINIMUM'; value: number; label: string; zone: FreightZone; missing: number }
  /** CEP fora das zonas cadastradas: a equipe cota manualmente. */
  | { kind: 'ON_REQUEST'; value: 0; label: string };

export function findZoneByCep(cep: string, zones: FreightZone[]): FreightZone | null {
  const digits = onlyDigits(cep);
  if (digits.length !== 8) return null;
  let best: FreightZone | null = null;
  let bestLen = -1;
  for (const zone of zones) {
    if (zone.active === false) continue;
    for (const prefix of zone.cepPrefixes || []) {
      const p = onlyDigits(prefix);
      if (p && digits.startsWith(p) && p.length > bestLen) {
        best = zone;
        bestLen = p.length;
      }
    }
  }
  return best;
}

export function calculateFreight(
  mode: 'DELIVERY' | 'PICKUP',
  cep: string,
  itemsTotal: number,
  settings: FreightSettings,
): FreightResult {
  if (mode === 'PICKUP') return { kind: 'PICKUP', value: 0, label: 'Retirada no local — sem frete' };
  const zone = findZoneByCep(cep, settings.zones || []);
  if (!zone) {
    return { kind: 'ON_REQUEST', value: 0, label: 'Frete a combinar — nossa equipe envia o valor antes do pagamento' };
  }
  const min = zone.minOrderValue || 0;
  if (min > 0 && itemsTotal < min) {
    return {
      kind: 'BELOW_MINIMUM',
      value: zone.price,
      label: `Pedido mínimo de ${money(min)} para ${zone.label}`,
      zone,
      missing: Number((min - itemsTotal).toFixed(2)),
    };
  }
  if (settings.freeAbove != null && settings.freeAbove > 0 && itemsTotal >= settings.freeAbove) {
    return { kind: 'FREE', value: 0, label: `Frete grátis para ${zone.label}`, zone };
  }
  return { kind: 'CHARGED', value: zone.price, label: `${zone.label}${zone.etaNote ? ` · ${zone.etaNote}` : ''}`, zone };
}

/** O pedido só pode ser enviado se o frete não estiver em estado impeditivo. */
export function canSubmitWithFreight(r: FreightResult): boolean {
  return r.kind !== 'BELOW_MINIMUM';
}
