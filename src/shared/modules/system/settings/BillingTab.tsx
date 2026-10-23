import { Copy, QrCode } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { money } from '../../../domain/format';
import { buildPixPayload, qrDataUrl } from '../../../domain/pix';
import type { AppSettings } from '../../../domain/types';
import { Badge, Button, Callout, Card, CardHeader, Field, FormGrid, FormSection, Input, MoneyInput, PercentInput, Select, toast } from '../../../ui';
import { copyToClipboard } from '../../sales/helpers';
import type { SettingsDraft } from './useSettingsDraft';

const KEY_TYPES: { value: NonNullable<AppSettings['pixKeyType']>; label: string; placeholder: string }[] = [
  { value: 'CNPJ', label: 'CNPJ', placeholder: '00.000.000/0000-00' },
  { value: 'CPF', label: 'CPF', placeholder: '000.000.000-00' },
  { value: 'EMAIL', label: 'E-mail', placeholder: 'financeiro@empresa.com' },
  { value: 'PHONE', label: 'Celular', placeholder: '+5519999999999' },
  { value: 'RANDOM', label: 'Chave aleatória', placeholder: '123e4567-e89b-12d3-a456-426614174000' },
];

/** Nome/cidade no padrão do BR Code: maiúsculas, sem acento. */
const pixText = (v: string, max: number) =>
  v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .slice(0, max);

export function BillingTab({ s }: { s: SettingsDraft }) {
  const { draft: d, set, canEdit } = s;
  const [amount, setAmount] = useState<number | null>(100);
  const [qr, setQr] = useState<string | null>(null);
  const payload = useMemo(() => {
    if (!d.pixKey) return '';
    try {
      return buildPixPayload({
        pixKey: d.pixKey,
        merchantName: d.pixMerchantName || d.tradeName || d.companyName,
        merchantCity: d.pixMerchantCity || d.city || '',
        amount: amount || undefined,
        txId: 'TESTE',
      });
    } catch {
      return '';
    }
  }, [d.pixKey, d.pixMerchantName, d.pixMerchantCity, d.tradeName, d.companyName, d.city, amount]);

  useEffect(() => {
    let alive = true;
    if (!payload) {
      setQr(null);
      return;
    }
    qrDataUrl(payload, 260)
      .then((u) => alive && setQr(u))
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [payload]);

  const keyType = KEY_TYPES.find((k) => k.value === d.pixKeyType);
  const discounted = amount ? amount * (1 - (d.pixDiscountPercent || 0) / 100) : 0;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px] items-start">
      <Card>
        <fieldset disabled={!canEdit} className="space-y-7">
          <FormSection title="Pix para cobrança" description="Usado no QR Code dos pedidos, propostas, portal do cliente e cobranças avulsas.">
            <FormGrid>
              <Field label="Tipo da chave">
                <Select value={d.pixKeyType || ''} onChange={(v) => set({ pixKeyType: v })} placeholder="—" options={KEY_TYPES} />
              </Field>
              <Field label="Chave Pix" required>
                <Input value={d.pixKey || ''} onChange={(e) => set({ pixKey: e.target.value.trim() })} placeholder={keyType?.placeholder} className="num" />
              </Field>
              <Field label="Nome do recebedor" hint={`Até 25 letras, sem acento · ${(d.pixMerchantName || '').length}/25`}>
                <Input value={d.pixMerchantName || ''} onChange={(e) => set({ pixMerchantName: pixText(e.target.value, 25) })} placeholder="AURUS PRIME" />
              </Field>
              <Field label="Cidade do recebedor" hint={`Até 15 letras, sem acento · ${(d.pixMerchantCity || '').length}/15`}>
                <Input value={d.pixMerchantCity || ''} onChange={(e) => set({ pixMerchantCity: pixText(e.target.value, 15) })} placeholder="CAMPINAS" />
              </Field>
              <Field label="Desconto para pagamento via Pix" hint="Sugerido no pedido quando a forma de pagamento é Pix. 0 = sem desconto.">
                <PercentInput value={d.pixDiscountPercent ?? 0} onChange={(v) => set({ pixDiscountPercent: v ?? 0 })} />
              </Field>
            </FormGrid>
          </FormSection>

          <FormSection title="Comissão" description="Taxa sugerida ao cadastrar ou convidar um novo vendedor. Cada vendedor pode ter a sua.">
            <FormGrid>
              <Field label="Comissão padrão">
                <PercentInput value={d.defaultCommissionRate ?? 0} onChange={(v) => set({ defaultCommissionRate: v ?? 0 })} />
              </Field>
            </FormGrid>
          </FormSection>

          <FormSection title="Ranking de clientes" description="Classificação pelo valor comprado (acumulado). Recalculada a cada venda entregue.">
            <FormGrid cols={3}>
              <Field label="Bronze">
                <Input value={`até ${money(Math.max(0, d.rankingSilverFrom - 0.01))}`} disabled />
              </Field>
              <Field label="Prata a partir de">
                <MoneyInput value={d.rankingSilverFrom} onChange={(v) => set({ rankingSilverFrom: v ?? 0 })} />
              </Field>
              <Field label="Ouro a partir de" error={d.rankingGoldFrom <= d.rankingSilverFrom ? 'Precisa ser maior que a faixa Prata.' : null}>
                <MoneyInput value={d.rankingGoldFrom} onChange={(v) => set({ rankingGoldFrom: v ?? 0 })} />
              </Field>
            </FormGrid>
            <div className="flex flex-wrap gap-2">
              <Badge tone="warning">Bronze: até {money(d.rankingSilverFrom)}</Badge>
              <Badge tone="neutral">Prata: {money(d.rankingSilverFrom)} a {money(d.rankingGoldFrom)}</Badge>
              <Badge tone="accent">Ouro: acima de {money(d.rankingGoldFrom)}</Badge>
            </div>
          </FormSection>
        </fieldset>
        <Callout tone="info" className="mt-6">
          Entrega, frete grátis, horário de corte e tolerância da conferência de peso ficam em{' '}
          <Link to="/comercial/portal" className="text-primary underline underline-offset-2">
            Portal do cliente → Entrega e frete
          </Link>
          .
        </Callout>
      </Card>

      <Card className="lg:sticky lg:top-4">
        <CardHeader icon={<QrCode className="size-4" />} title="Prévia do QR Code" subtitle="Confira com o app do banco antes de salvar." />
        <Field label="Valor de teste">
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
        <div className="mt-4 rounded-card border border-border overflow-hidden w-fit mx-auto">
          {qr ? <img src={qr} alt="QR Code Pix de teste" className="size-52" /> : <div className="size-52 flex items-center justify-center text-xs text-center text-muted px-6">Informe a chave Pix para gerar o QR Code.</div>}
        </div>
        {payload && (
          <>
            <div className="mt-4 text-[11px] uppercase tracking-wider text-subtle font-medium">Pix copia e cola</div>
            <p className="mt-1 text-[11px] text-muted break-all num leading-relaxed max-h-20 overflow-auto">{payload}</p>
            <Button
              size="sm"
              variant="subtle"
              block
              className="mt-3"
              icon={<Copy className="size-4" />}
              onClick={async () => ((await copyToClipboard(payload)) ? toast.success('Código copiado') : toast.error('Não foi possível copiar'))}
            >
              Copiar código
            </Button>
            {!!d.pixDiscountPercent && !!amount && (
              <p className="mt-3 text-xs text-muted">
                Com o desconto Pix de {d.pixDiscountPercent}%, um pedido de {money(amount)} sai por <strong className="text-fg num">{money(discounted)}</strong>.
              </p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
