/**
 * Pagamento do pedido no portal: Pix (QR + copia-e-cola) e envio de comprovante.
 */
import { Check, CheckCircle2, Copy, FileCheck2, QrCode } from 'lucide-react';
import { useEffect, useState } from 'react';
import { usePortalSession } from '../../../app/session';
import { useAction } from '../../../data/react';
import { dateTime, money } from '../../../domain/format';
import { qrDataUrl } from '../../../domain/pix';
import type { Sale } from '../../../domain/types';
import { AttachmentList, Button, Callout, Card, CardHeader, FileDrop, Skeleton, toast } from '../../../ui';
import { canPay, copyText } from '../lib';

export function PaymentCard({ sale }: { sale: Sale }) {
  const { account, ops } = usePortalSession();
  const upload = useAction(
    async (att: Parameters<NonNullable<typeof ops>['uploadPaymentReceipt']>[1]) => {
      if (!ops) throw new Error('Sessão expirada — entre novamente.');
      await ops.uploadPaymentReceipt(sale.id, att);
    },
    { success: 'Comprovante enviado! Vamos conferir e confirmar o pagamento.' },
  );

  if (sale.paymentStatus === 'PAID') {
    return (
      <Callout tone="success" title="Pagamento confirmado">
        Obrigado! Recebemos o pagamento de {money(sale.totalValue)}.
      </Callout>
    );
  }
  if (!canPay(sale)) return null;

  const drop = (
    <FileDrop
      folder={`portal/${account?.id || 'anon'}`}
      kind="RECEIPT"
      accept="image/*,application/pdf"
      compact
      label={sale.paymentReceipt ? 'Enviar outro comprovante' : 'Enviar comprovante do Pix'}
      hint="Foto ou PDF do comprovante"
      disabled={upload.running}
      onUploaded={(att) => void upload.run(att)}
    />
  );

  if (sale.paymentStatus === 'RECEIPT_SENT') {
    return (
      <Card>
        <CardHeader icon={<FileCheck2 className="size-4.5" />} title="Comprovante recebido" subtitle="Nosso financeiro vai conferir e confirmar o pagamento." />
        {sale.paymentReceipt && <AttachmentList items={[sale.paymentReceipt]} className="mb-3" />}
        {drop}
      </Card>
    );
  }

  return (
    <Card className="border-primary/40">
      <CardHeader
        icon={<QrCode className="size-4.5" />}
        title="Pague com Pix"
        subtitle={sale.paymentStatus === 'PARTIAL' ? 'Há um valor em aberto neste pedido.' : 'Pedido pesado e pronto para pagamento.'}
      />
      <PixPanel payload={sale.pixPayload || ''} amount={sale.totalValue} />
      <div className="mt-4 space-y-2">
        <div className="text-xs text-muted">Já pagou? Envie o comprovante para agilizar a liberação:</div>
        {drop}
      </div>
    </Card>
  );
}

export function PixPanel({ payload, amount }: { payload: string; amount: number }) {
  const [img, setImg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let alive = true;
    setImg(null);
    if (payload)
      qrDataUrl(payload, 360)
        .then((u) => alive && setImg(u))
        .catch(() => alive && setImg(null));
    return () => {
      alive = false;
    };
  }, [payload]);

  const copy = async () => {
    if (await copyText(payload)) {
      setCopied(true);
      toast.success('Código Pix copiado — cole no app do seu banco.');
      setTimeout(() => setCopied(false), 2500);
    } else toast.error('Não foi possível copiar. Selecione o código e copie manualmente.');
  };

  return (
    <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 items-center sm:items-start">
      <div className="shrink-0 rounded-card bg-surface-2 border border-border p-2.5">
        {img ? <img src={img} alt="QR Code do Pix" className="size-48 rounded-control" /> : <Skeleton className="size-48" />}
      </div>
      <div className="min-w-0 flex-1 w-full space-y-3">
        <div className="text-center sm:text-left">
          <div className="text-[11px] uppercase tracking-wider text-subtle font-medium">Valor</div>
          <div className="text-3xl font-semibold text-fg num">{money(amount)}</div>
        </div>
        <ol className="text-xs text-muted space-y-1 list-decimal pl-4">
          <li>Abra o app do seu banco e escolha Pix.</li>
          <li>Leia o QR Code ou use o Pix copia e cola.</li>
        </ol>
        <div className="rounded-control border border-border bg-surface-2 px-3 py-2 text-[11px] font-mono text-muted break-all line-clamp-3 select-all">{payload}</div>
        <Button variant="primary" block icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />} onClick={() => void copy()}>
          {copied ? 'Copiado!' : 'Copiar código Pix'}
        </Button>
      </div>
    </div>
  );
}

export function ReceiptSentNote({ sale }: { sale: Sale }) {
  if (!sale.paymentReceipt) return null;
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted">
      <CheckCircle2 className="size-3.5 text-success" /> Comprovante enviado em {dateTime(sale.paymentReceipt.uploadedAt)}
    </p>
  );
}
