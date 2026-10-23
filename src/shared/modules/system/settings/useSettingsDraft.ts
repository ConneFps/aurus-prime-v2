/**
 * Rascunho único das Configurações (linha 'main'), compartilhado pelas abas
 * Empresa, Cobrança e Segurança. Grava com useCrud; se a linha ainda não
 * existir, cria com id 'main' e os padrões de withDefaults.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSession, useOps } from '../../../app/session';
import { SETTINGS_ID, useSettings, withDefaults } from '../../../app/settings';
import { useAction, useCrud } from '../../../data/react';
import type { AppSettings } from '../../../domain/types';

export type SettingsData = Omit<AppSettings, 'id' | 'createdAt' | 'updatedAt'>;

const strip = (s: AppSettings): SettingsData => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, createdAt, updatedAt, ...rest } = s;
  return rest;
};

export interface SettingsDraft {
  draft: SettingsData;
  set: (patch: Partial<SettingsData>) => void;
  dirty: boolean;
  canEdit: boolean;
  loading: boolean;
  exists: boolean;
  saved: AppSettings;
  save: { run: () => Promise<unknown>; running: boolean };
  reset: () => void;
}

/** Validações antes de gravar (mensagens em PT-BR). */
function validate(d: SettingsData) {
  if (!d.companyName?.trim()) throw new Error('Informe a razão social da empresa.');
  if (d.rankingGoldFrom <= d.rankingSilverFrom) throw new Error('A faixa Ouro precisa começar acima da faixa Prata.');
  if (d.rankingSilverFrom < 0) throw new Error('A faixa Prata não pode ser negativa.');
  if ((d.pixDiscountPercent ?? 0) < 0 || (d.pixDiscountPercent ?? 0) > 100) throw new Error('Desconto Pix deve ficar entre 0% e 100%.');
  if ((d.defaultCommissionRate ?? 0) < 0 || (d.defaultCommissionRate ?? 0) > 100) throw new Error('Comissão padrão deve ficar entre 0% e 100%.');
  if (d.idleTimeoutMinutes < 0) throw new Error('Tempo de inatividade inválido.');
  if (d.pixMerchantName && d.pixMerchantName.length > 25) throw new Error('Nome do recebedor Pix: no máximo 25 caracteres.');
  if (d.pixMerchantCity && d.pixMerchantCity.length > 15) throw new Error('Cidade do Pix: no máximo 15 caracteres.');
}

export function useSettingsDraft(): SettingsDraft {
  const { settings, loading, exists } = useSettings();
  const { can } = useSession();
  const ops = useOps();
  const crud = useCrud('settings');
  const canEdit = can('settings.manage');
  const savedKey = JSON.stringify(strip(settings));
  const saved = useMemo(() => strip(settings), [savedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraft] = useState<SettingsData>(saved);
  const [touched, setTouched] = useState(false);

  // Enquanto o usuário não mexeu, acompanha o que está salvo (tempo real).
  useEffect(() => {
    if (!touched) setDraft(saved);
  }, [saved, touched]);

  const dirty = touched && JSON.stringify(draft) !== savedKey;

  const action = useAction(
    async () => {
      if (!canEdit) throw new Error('Você não tem permissão para alterar as configurações.');
      validate(draft);
      const changed = Object.keys(draft).filter(
        (k) => JSON.stringify(draft[k as keyof SettingsData]) !== JSON.stringify(saved[k as keyof SettingsData]),
      );
      if (exists) await crud.update(SETTINGS_ID, draft);
      else await crud.insert({ ...strip(withDefaults(draft as Partial<AppSettings>)), id: SETTINGS_ID });
      try {
        await ops.log('UPDATE', 'settings', SETTINGS_ID, `Configurações alteradas: ${changed.join(', ') || 'sem mudanças'}`, { changed });
      } catch {
        /* auditoria é melhor esforço */
      }
      setTouched(false);
    },
    { success: 'Configurações salvas' },
  );

  return {
    draft,
    set: (patch) => {
      setTouched(true);
      setDraft((d) => ({ ...d, ...patch }));
    },
    dirty,
    canEdit,
    loading,
    exists,
    saved: settings,
    save: action,
    reset: () => {
      setTouched(false);
      setDraft(saved);
    },
  };
}
