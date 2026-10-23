/**
 * Peças visuais compartilhadas entre a fila e o detalhe da separação.
 */
import { Globe, Store, Truck } from 'lucide-react';
import type React from 'react';
import type { Sale } from '../../domain/types';
import { Badge } from '../../ui';
import { releaseInfo } from './model';

export function ChannelBadge({ sale }: { sale: Pick<Sale, 'channel' | 'isIntercompany'> }) {
  if (sale.channel === 'PORTAL')
    return (
      <Badge tone="accent" size="xs">
        <Globe className="size-3" /> Portal
      </Badge>
    );
  if (sale.isIntercompany || sale.channel === 'INTERCOMPANY')
    return (
      <Badge tone="info" size="xs">
        Intercompany
      </Badge>
    );
  if (sale.channel === 'EXTERNAL_SELLER')
    return (
      <Badge tone="neutral" size="xs">
        Vend. externo
      </Badge>
    );
  return null;
}

export function DeliveryBadge({ sale }: { sale: Pick<Sale, 'deliveryMode' | 'deliveryWindow'> }) {
  if (sale.deliveryMode === 'PICKUP')
    return (
      <Badge tone="warning" size="xs">
        <Store className="size-3" /> Retirada
      </Badge>
    );
  return (
    <Badge tone="primary" size="xs">
      <Truck className="size-3" /> Entrega{sale.deliveryWindow ? ` · janela ${sale.deliveryWindow}` : ''}
    </Badge>
  );
}

export function NfBadge({ sale }: { sale: Sale }) {
  const r = releaseInfo(sale);
  if (!r.nfRequired) return null;
  return r.hasNf ? (
    <Badge tone="success" size="xs">
      NF {sale.invoiceNumber || 'anexada'}
    </Badge>
  ) : (
    <Badge tone="danger" size="xs">
      NF pendente
    </Badge>
  );
}

/** Valor de indicador que encolhe no celular (evita "R$ 99,9 …" cortado). */
export function FitValue({ children }: { children: React.ReactNode }) {
  return <span className="text-xl sm:text-[26px]">{children}</span>;
}
