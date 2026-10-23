/**
 * Cobrança Pix avulsa (valor, descrição, txid) com a chave das configurações.
 */
import { QrCode } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSettings } from '../../../app/settings';
import { formatDocument, money, today } from '../../../domain/format';
import { buildPixPayload } from '../../../domain/pix';
import { Callout, Card, CardHeader, DescriptionList, EmptyState, Field, FormGrid, Input, MaskedInput, MoneyInput } from '../../../ui';
import { PixBox } from '../PixBox';

export function PixCharge() {
  const { settings } = useSettings();
  const [amount, setAmount] = useState<number | null>(null);
  const [info, setInfo] = useState('');
  const [txid, setTxid] = useState('');
  const [payer, setPayer] = useState('');
  const [phone, setPhone] = useState('');

  const cleanTx = txid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 25);
  const payload = useMemo(
    () =>
      amount && amount > 0
        ? buildPixPayload({
            pixKey: settings.pixKey || undefined,
            merchantName: settings.pixMerchantName || settings.tradeName || settings.companyName || undefined,
            merchantCity: settings.pixMerchantCity || settings.city || undefined,
            amount,
            txId: cleanTx || undefined,
            info: info || undefined,
          })
        : '',
    [amount, cleanTx, info, settings.pixKey, settings.pixMerchantName, settings.tradeName, settings.companyName, settings.pixMerchantCity, settings.city],
  );

  const keyLabel = settings.pixKeyType === 'CNPJ' || settings.pixKeyType === 'CPF' ? formatDocument(settings.pixKey) : settings.pixKey;

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-5 items-start">
      <Card className="space-y-4">
        <CardHeader icon={<QrCode className="size-4" />} title="Cobrança Pix avulsa" subtitle="Para sinal, diferença de pesagem, frete ou venda de balcão." className="mb-0" />
        <FormGrid>
          <Field label="Valor" required>
            <MoneyInput value={amount} onChange={setAmount} autoFocus />
          </Field>
          <Field label="Identificador (txid)" hint="Letras e números, até 25. Vazio = sem identificador.">
            <Input value={txid} onChange={(e) => setTxid(e.target.value)} placeholder={`Ex.: PED${today().replace(/-/g, '')}`} className="num" maxLength={30} />
          </Field>
          <Field label="Descrição" span="full" hint="Aparece no app do banco (até 25 caracteres, sem acentos).">
            <Input value={info} onChange={(e) => setInfo(e.target.value)} maxLength={40} placeholder="Ex.: Frete pedido 20260093" />
          </Field>
          <Field label="Pagador (opcional)">
            <Input value={payer} onChange={(e) => setPayer(e.target.value)} placeholder="Nome do cliente" />
          </Field>
          <Field label="WhatsApp do pagador">
            <MaskedInput mask="phone" value={phone} onChange={setPhone} />
          </Field>
        </FormGrid>
        <DescriptionList
          cols={2}
          className="rounded-card bg-surface-2 p-3"
          items={[
            { label: 'Chave Pix', value: <span className="num">{keyLabel || '—'}</span> },
            { label: 'Recebedor', value: `${settings.pixMerchantName || settings.tradeName || '—'} · ${settings.pixMerchantCity || settings.city || ''}` },
          ]}
        />
        {!settings.pixKey && <Callout tone="warning">Nenhuma chave Pix nas configurações — usando a chave padrão do sistema. Ajuste em Configurações.</Callout>}
      </Card>

      <Card>
        {payload ? (
          <PixBox
            payload={payload}
            amount={amount}
            caption={info || undefined}
            whatsappPhone={phone}
            whatsappText={`Olá${payer ? `, ${payer}` : ''}! Segue o Pix de *${money(amount)}*${info ? ` — ${info}` : ''}.`}
            fileName={`pix-${cleanTx || 'avulso'}`}
          />
        ) : (
          <EmptyState icon={<QrCode className="size-5" />} title="Informe o valor" description="O QR Code e o copia-e-cola aparecem aqui na hora." />
        )}
      </Card>
    </div>
  );
}
