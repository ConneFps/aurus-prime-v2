/**
 * Cobrança Pix: QR Code + copia-e-cola com botões de copiar, baixar e WhatsApp.
 */
import { Check, Copy, Download, MessageCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { money } from '../../domain/format';
import { qrDataUrl } from '../../domain/pix';
import { Button, cn, Skeleton, toast } from '../../ui';
import { copyToClipboard, whatsappLink } from './helpers';

export function PixBox({
  payload,
  amount,
  caption,
  whatsappText,
  whatsappPhone,
  fileName = 'pix',
  className,
  stacked,
}: {
  payload: string;
  amount?: number | null;
  caption?: string;
  /** Texto da mensagem (o copia-e-cola é acrescentado no fim). */
  whatsappText?: string;
  whatsappPhone?: string | null;
  fileName?: string;
  className?: string;
  /** Sempre em coluna (para cartões estreitos). */
  stacked?: boolean;
}) {
  const [img, setImg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    setImg(null);
    if (!payload) return;
    qrDataUrl(payload, 360)
      .then((u) => alive && setImg(u))
      .catch(() => alive && setImg(null));
    return () => {
      alive = false;
    };
  }, [payload]);

  const copy = async () => {
    if (await copyToClipboard(payload)) {
      setCopied(true);
      toast.success('Código Pix copiado');
      setTimeout(() => setCopied(false), 2000);
    } else toast.error('Não foi possível copiar — selecione o código e copie manualmente.');
  };

  return (
    <div className={cn('flex flex-col gap-4 items-center', !stacked && 'sm:flex-row sm:gap-5 sm:items-start', className)}>
      <div className="shrink-0 rounded-card border border-border bg-surface p-2">
        {img ? <img src={img} alt="QR Code Pix" className="size-44 sm:size-48" /> : <Skeleton className="size-44 sm:size-48" />}
      </div>
      <div className="min-w-0 flex-1 w-full space-y-3">
        {amount != null && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-subtle font-medium">Valor</div>
            <div className="text-2xl font-semibold num text-fg">{money(amount)}</div>
            {caption && <div className="text-xs text-muted mt-0.5">{caption}</div>}
          </div>
        )}
        <div>
          <div className="text-[11px] uppercase tracking-wider text-subtle font-medium mb-1">Pix copia e cola</div>
          <textarea
            readOnly
            value={payload}
            rows={3}
            onFocus={(e) => e.target.select()}
            className="w-full rounded-control border border-border bg-surface-2 px-3 py-2 text-xs font-mono text-fg break-all resize-none"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />} onClick={() => void copy()}>
            {copied ? 'Copiado' : 'Copiar código'}
          </Button>
          {img && (
            <Button
              size="sm"
              icon={<Download className="size-4" />}
              onClick={() => {
                const a = document.createElement('a');
                a.href = img;
                a.download = `${fileName}.png`;
                a.click();
              }}
            >
              Baixar QR
            </Button>
          )}
          {whatsappText !== undefined && (
            <Button
              size="sm"
              icon={<MessageCircle className="size-4" />}
              onClick={() => window.open(whatsappLink(whatsappPhone, `${whatsappText}\n\n*Pix copia e cola:*\n${payload}`), '_blank', 'noopener')}
            >
              WhatsApp
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
