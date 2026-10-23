/**
 * Etapa 3 — entrega/retirada e frete (valor manual ou zona por CEP).
 */
import { CalendarClock, Store, Truck } from 'lucide-react';
import { useMemo } from 'react';
import { date, money } from '../../../domain/format';
import { resolveDeliveryWindow } from '../../../domain/delivery';
import type { FreightResult } from '../../../domain/freight';
import type { AppSettings } from '../../../domain/types';
import { Button, Callout, CepInput, DateInput, Field, FormGrid, Input, MoneyInput, Segmented } from '../../../ui';
import type { Draft, FreightMode } from './draft';
import { Section } from './Section';

export function DeliverySection({
  draft,
  patch,
  settings,
  freight,
}: {
  draft: Draft;
  patch: (p: Partial<Draft>) => void;
  settings: AppSettings;
  freight: FreightResult;
}) {
  const suggestion = useMemo(() => {
    try {
      return resolveDeliveryWindow(new Date(), {
        cutoffHour: settings.deliveryCutoffHour,
        blockedDates: settings.deliveryBlockedDates || [],
        weekendPolicy: settings.weekendPolicy,
      });
    } catch {
      return null;
    }
  }, [settings.deliveryCutoffHour, settings.deliveryBlockedDates, settings.weekendPolicy]);

  const pickup = draft.deliveryMode === 'PICKUP';

  return (
    <Section step={3} title="Entrega e frete" subtitle={pickup ? 'O cliente retira no local.' : 'Endereço, data e frete do pedido.'}>
      <Segmented
        value={draft.deliveryMode}
        onChange={(v) => patch({ deliveryMode: v })}
        options={[
          {
            value: 'DELIVERY',
            label: (
              <>
                <Truck className="size-4" /> Entrega
              </>
            ),
          },
          {
            value: 'PICKUP',
            label: (
              <>
                <Store className="size-4" /> Retirada
              </>
            ),
          },
        ]}
      />

      <FormGrid>
        <Field label={pickup ? 'Data de retirada' : 'Data de entrega'}>
          <DateInput value={draft.deliveryDate} onChange={(v) => patch({ deliveryDate: v || null, deliveryWindow: null })} />
        </Field>
        {suggestion && (
          <div className="flex items-end">
            <Button
              variant="ghost"
              size="sm"
              icon={<CalendarClock className="size-4" />}
              className="h-10"
              onClick={() => patch({ deliveryDate: suggestion.deliveryDate, deliveryWindow: suggestion.windowId })}
            >
              Próxima janela: {date(suggestion.deliveryDate)}
            </Button>
          </div>
        )}
      </FormGrid>

      {pickup ? (
        settings.pickupAddress ? (
          <p className="text-sm text-muted">
            Local de retirada: <span className="text-fg">{settings.pickupAddress}</span>
            {settings.pickupNote ? ` — ${settings.pickupNote}` : ''}
          </p>
        ) : null
      ) : (
        <>
          <FormGrid>
            <Field label="CEP de entrega">
              <CepInput
                value={draft.shippingZipCode}
                onChange={(v) => patch({ shippingZipCode: v })}
                onAddress={(a) => {
                  if (!draft.shippingAddress) patch({ shippingAddress: [a.street, a.district, `${a.city}/${a.state}`].filter(Boolean).join(', ') });
                }}
              />
            </Field>
            <Field label="Frete">
              <Segmented<FreightMode>
                value={draft.freightMode}
                onChange={(v) => patch({ freightMode: v })}
                options={[
                  { value: 'ZONE', label: 'Por CEP' },
                  { value: 'MANUAL', label: 'Valor' },
                  { value: 'PENDING', label: 'A combinar' },
                ]}
                className="self-start"
              />
            </Field>
            <Field label="Endereço de entrega" span="full">
              <Input value={draft.shippingAddress} onChange={(e) => patch({ shippingAddress: e.target.value })} placeholder="Rua, número, bairro, cidade/UF" />
            </Field>
            {draft.freightMode === 'MANUAL' && (
              <Field label="Valor do frete">
                <MoneyInput value={draft.freightValue} onChange={(v) => patch({ freightValue: v ?? 0 })} />
              </Field>
            )}
          </FormGrid>
          {draft.freightMode === 'ZONE' &&
            (draft.shippingZipCode.replace(/\D/g, '').length === 8 ? (
              <FreightInfo r={freight} />
            ) : (
              <p className="text-xs text-muted">Informe o CEP para calcular o frete pela zona de entrega.</p>
            ))}
          {draft.freightMode === 'PENDING' && (
            <Callout tone="info">O frete fica pendente — informe o valor antes do faturamento (o pedido é sinalizado como “frete a combinar”).</Callout>
          )}
        </>
      )}
    </Section>
  );
}

function FreightInfo({ r }: { r: FreightResult }) {
  if (r.kind === 'ON_REQUEST')
    return (
      <Callout tone="warning" title="CEP fora das zonas de frete">
        Informe o valor manualmente ou marque como “a combinar”.
      </Callout>
    );
  if (r.kind === 'BELOW_MINIMUM')
    return (
      <Callout tone="warning" title={r.label}>
        Faltam {money(r.missing)} para o pedido mínimo da zona. Frete cobrado:{' '}
        {money(r.value)}.
      </Callout>
    );
  if (r.kind === 'FREE') return <Callout tone="success">{r.label}</Callout>;
  if (r.kind === 'CHARGED')
    return (
      <Callout tone="info">
        {r.label} — frete de <span className="num font-semibold">{money(r.value)}</span>
      </Callout>
    );
  return null;
}
