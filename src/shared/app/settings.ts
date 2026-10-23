import type { AppSettings } from '../domain/types';
import { DEFAULT_CORPORATE_DOMAINS } from '../domain/permissions';
import { useRow } from '../data/react';

export const SETTINGS_ID = 'main';

export const DEFAULT_SETTINGS: AppSettings = {
  id: SETTINGS_ID,
  createdAt: '',
  updatedAt: '',
  companyName: 'MVGB Agro — Aurus Prime',
  tradeName: 'Aurus Prime',
  document: '',
  corporateDomains: DEFAULT_CORPORATE_DOMAINS,
  idleTimeoutMinutes: 15,
  pixKey: '05099651002148',
  pixKeyType: 'CNPJ',
  pixMerchantName: 'AURUS PRIME',
  pixMerchantCity: 'SAO PAULO',
  pixDiscountPercent: 0,
  defaultCommissionRate: 2,
  whatsapp: '5519999554530',
  weighingTolerancePercent: 5,
  weighingToleranceMaxValue: 150,
  weighingAutoApproveHours: 6,
  freeFreightAbove: null,
  pickupEnabled: true,
  pickupAddress: '',
  pickupNote: '',
  deliveryCutoffHour: 16,
  deliveryBlockedDates: [],
  weekendPolicy: 'NEXT_WEDNESDAY',
  rankingSilverFrom: 25000,
  rankingGoldFrom: 50000,
  bootstrapped: false,
};

/** Mescla o registro salvo com os padrões (campos ausentes = padrão). */
export function withDefaults(s: Partial<AppSettings> | null | undefined): AppSettings {
  const out = { ...DEFAULT_SETTINGS } as AppSettings;
  if (s) {
    for (const [k, v] of Object.entries(s)) {
      if (v !== null && v !== undefined) (out as unknown as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

/** Configurações gerais (sempre com valores padrão preenchidos). */
export function useSettings(): { settings: AppSettings; loading: boolean; exists: boolean } {
  const { row, loading } = useRow('settings', SETTINGS_ID);
  return { settings: withDefaults(row), loading, exists: !!row };
}
