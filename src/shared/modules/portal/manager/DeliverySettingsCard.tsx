/**
 * Regras de entrega e de conferência de peso do portal (settings 'main').
 */
import { CalendarX, Save, Settings2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { SETTINGS_ID, useSettings } from '../../../app/settings';
import { useAction, useCrud } from '../../../data/react';
import { resolveDeliveryWindow } from '../../../domain/delivery';
import { date, today } from '../../../domain/format';
import type { AppSettings } from '../../../domain/types';
import { Button, Callout, Card, CardHeader, DateInput, Field, FormGrid, FormSection, Input, MoneyInput, NumberInput, PercentInput, Select, Switch, Textarea } from '../../../ui';
import { scheduleOf } from '../lib';

type Fields = Pick<
  AppSettings,
  | 'freeFreightAbove'
  | 'pickupEnabled'
  | 'pickupAddress'
  | 'pickupNote'
  | 'deliveryCutoffHour'
  | 'deliveryBlockedDates'
  | 'weekendPolicy'
  | 'weighingTolerancePercent'
  | 'weighingToleranceMaxValue'
  | 'weighingAutoApproveHours'
>;

const pick = (s: AppSettings): Fields => ({
  freeFreightAbove: s.freeFreightAbove ?? null,
  pickupEnabled: s.pickupEnabled,
  pickupAddress: s.pickupAddress || '',
  pickupNote: s.pickupNote || '',
  deliveryCutoffHour: s.deliveryCutoffHour,
  deliveryBlockedDates: [...(s.deliveryBlockedDates || [])].sort(),
  weekendPolicy: s.weekendPolicy,
  weighingTolerancePercent: s.weighingTolerancePercent,
  weighingToleranceMaxValue: s.weighingToleranceMaxValue ?? null,
  weighingAutoApproveHours: s.weighingAutoApproveHours ?? null,
});

export function DeliverySettingsCard() {
  const { settings, exists, loading } = useSettings();
  const crud = useCrud('settings');
  const [f, setF] = useState<Fields>(() => pick(settings));
  const [newDate, setNewDate] = useState('');
  const base = useMemo(() => JSON.stringify(pick(settings)), [settings]);
  const dirty = JSON.stringify(f) !== base;
  useEffect(() => {
    if (!loading) setF(pick(settings));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, base]);

  const preview = useMemo(() => resolveDeliveryWindow(new Date(), scheduleOf(f)), [f]);

  const save = useAction(
    async () => {
      if (f.deliveryCutoffHour < 0 || f.deliveryCutoffHour > 24) throw new Error('O horário de corte vai de 0 a 24.');
      if (f.weighingTolerancePercent < 0) throw new Error('A tolerância não pode ser negativa.');
      const patch = {
        ...f,
        pickupAddress: f.pickupAddress?.trim() || null,
        pickupNote: f.pickupNote?.trim() || null,
        freeFreightAbove: f.freeFreightAbove && f.freeFreightAbove > 0 ? f.freeFreightAbove : null,
      };
      if (exists) await crud.update(SETTINGS_ID, patch);
      else {
        const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = settings;
        await crud.insert({ ...rest, ...patch, id: SETTINGS_ID });
      }
    },
    { success: 'Regras de entrega salvas' },
  );

  const addDate = () => {
    if (!newDate || f.deliveryBlockedDates.includes(newDate)) return;
    setF({ ...f, deliveryBlockedDates: [...f.deliveryBlockedDates, newDate].sort() });
    setNewDate('');
  };

  return (
    <Card>
      <CardHeader
        icon={<Settings2 className="size-4.5" />}
        title="Regras de entrega e pesagem"
        subtitle="Valem para todos os pedidos do portal."
        actions={
          <Button size="sm" variant="primary" icon={<Save className="size-4" />} disabled={!dirty} loading={save.running} onClick={() => void save.run()}>
            Salvar
          </Button>
        }
      />
      <div className="space-y-7">
        <FormSection title="Frete e retirada">
          <FormGrid>
            <Field label="Frete grátis acima de" hint="Deixe vazio para desligar.">
              <MoneyInput value={f.freeFreightAbove} onChange={(v) => setF({ ...f, freeFreightAbove: v })} />
            </Field>
            <div className="sm:pt-6">
              <Switch checked={f.pickupEnabled} onChange={(v) => setF({ ...f, pickupEnabled: v })} label="Permitir retirada no local" description="Cliente escolhe retirar sem frete." />
            </div>
            {f.pickupEnabled && (
              <>
                <Field label="Endereço de retirada" span="full">
                  <Input value={f.pickupAddress || ''} onChange={(e) => setF({ ...f, pickupAddress: e.target.value })} placeholder="Rua, número — bairro, cidade" />
                </Field>
                <Field label="Observação da retirada" span="full" hint="Ex.: horário de atendimento, portão de acesso.">
                  <Textarea rows={2} value={f.pickupNote || ''} onChange={(e) => setF({ ...f, pickupNote: e.target.value })} />
                </Field>
              </>
            )}
          </FormGrid>
        </FormSection>

        <FormSection title="Janelas de entrega" description="Seg/ter → entrega na quarta · qua/qui → entrega na sexta.">
          <FormGrid>
            <Field label="Horário de corte" hint="Depois desta hora no último dia da janela, o pedido vai para a próxima.">
              <NumberInput decimals={0} value={f.deliveryCutoffHour} onChange={(v) => setF({ ...f, deliveryCutoffHour: v ?? 16 })} suffix="h" />
            </Field>
            <Field label="Pedidos de sexta a domingo">
              <Select
                value={f.weekendPolicy}
                onChange={(v) => setF({ ...f, weekendPolicy: v })}
                options={[
                  { value: 'NEXT_WEDNESDAY', label: 'Entregar na próxima quarta' },
                  { value: 'NEXT_FRIDAY', label: 'Entregar na próxima sexta' },
                ]}
              />
            </Field>
            <Field label="Datas sem entrega (feriados)" span="full">
              <div className="flex gap-2">
                <DateInput value={newDate} min={today()} onChange={setNewDate} className="sm:max-w-48" />
                <Button icon={<CalendarX className="size-4" />} onClick={addDate} disabled={!newDate}>
                  Bloquear data
                </Button>
              </div>
              {f.deliveryBlockedDates.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {f.deliveryBlockedDates.map((d) => (
                    <span key={d} className={`inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-pill text-xs font-medium num ${d < today() ? 'bg-surface-2 text-subtle' : 'bg-danger-soft text-danger'}`}>
                      {date(d)}
                      <button type="button" className="p-0.5 rounded-full hover:bg-surface-3 cursor-pointer" aria-label={`Liberar ${date(d)}`} onClick={() => setF({ ...f, deliveryBlockedDates: f.deliveryBlockedDates.filter((x) => x !== d) })}>
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </Field>
          </FormGrid>
          <Callout tone="info" title="Prévia">
            Um pedido feito agora {preview.rolledOver ? 'já cai na próxima janela e ' : ''}é entregue na {preview.deliveryLabel}.
          </Callout>
        </FormSection>

        <FormSection title="Conferência de peso" description="Se o valor pesado passar destes limites, o cliente precisa aceitar a diferença.">
          <FormGrid cols={3}>
            <Field label="Tolerância (%)">
              <PercentInput value={f.weighingTolerancePercent} onChange={(v) => setF({ ...f, weighingTolerancePercent: v ?? 0 })} />
            </Field>
            <Field label="Tolerância máxima (R$)" hint="Vazio = sem teto.">
              <MoneyInput value={f.weighingToleranceMaxValue} onChange={(v) => setF({ ...f, weighingToleranceMaxValue: v })} />
            </Field>
            <Field label="Prazo de aceite" hint="Horas até a equipe poder aceitar pelo cliente.">
              <NumberInput decimals={0} value={f.weighingAutoApproveHours} onChange={(v) => setF({ ...f, weighingAutoApproveHours: v })} suffix="h" />
            </Field>
          </FormGrid>
        </FormSection>
      </div>
    </Card>
  );
}
