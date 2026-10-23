/**
 * Expedição: expedir/entregar, romaneio e nota fiscal do pedido.
 */
import { CheckCheck, FileText, Printer, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useOps, useSession } from '../../app/session';
import { useAction } from '../../data/react';
import { dateTime, today } from '../../domain/format';
import type { Attachment, Sale } from '../../domain/types';
import { AttachmentList, Button, Callout, Card, CardHeader, DateInput, Field, FileDrop, FormGrid, Input, useConfirm } from '../../ui';
import { nfNumberFromFileName, releaseInfo } from './model';
import { useExpedition } from './useExpedition';

export function ExpeditionPanel({ sale, onPrint }: { sale: Sale; onPrint: () => void }) {
  const exp = useExpedition();
  const rel = releaseInfo(sale);
  const canShip = ['READY', 'DISPATCHED'].includes(sale.status);
  return (
    <Card>
      <CardHeader title="Expedição" subtitle={statusLine(sale)} icon={<Truck className="size-4" />} />
      <div className="space-y-3">
        {rel.nfRequired && !rel.hasNf && canShip && (
          <Callout tone="warning" title="NF obrigatória para expedir">
            Cliente CNPJ faturado com nota. Anexe a NF abaixo para liberar a saída.
          </Callout>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {sale.status === 'READY' && sale.deliveryMode === 'DELIVERY' && (
            <Button variant="accent" size="lg" block icon={<Truck className="size-5" />} loading={exp.dispatch.running} onClick={() => void exp.dispatch.run(sale)}>
              Expedir (saiu para entrega)
            </Button>
          )}
          {sale.status === 'READY' && sale.deliveryMode === 'PICKUP' && (
            <Button variant="accent" size="lg" block icon={<CheckCheck className="size-5" />} loading={exp.deliver.running} onClick={() => void exp.deliver.run(sale)}>
              Retirado pelo cliente
            </Button>
          )}
          {sale.status === 'DISPATCHED' && (
            <Button variant="accent" size="lg" block icon={<CheckCheck className="size-5" />} loading={exp.deliver.running} onClick={() => void exp.deliver.run(sale)}>
              Confirmar entrega
            </Button>
          )}
          <Button size="lg" block icon={<Printer className="size-5" />} onClick={onPrint}>
            Imprimir romaneio
          </Button>
        </div>
      </div>
    </Card>
  );
}

function statusLine(sale: Sale) {
  if (sale.deliveredAt) return `Entregue em ${dateTime(sale.deliveredAt)}`;
  if (sale.dispatchedAt) return `Saiu em ${dateTime(sale.dispatchedAt)}`;
  if (sale.pickedAt) return `Separado em ${dateTime(sale.pickedAt)}`;
  return 'Aguardando separação';
}

export function InvoicePanel({ sale }: { sale: Sale }) {
  const ops = useOps();
  const { can } = useSession();
  const confirm = useConfirm();
  const canEdit = can('sales.edit') || can('finance.manage');
  const [number, setNumber] = useState(sale.invoiceNumber || '');
  const [invDate, setInvDate] = useState(sale.invoiceDate || today());
  useEffect(() => {
    setNumber(sale.invoiceNumber || '');
    if (sale.invoiceDate) setInvDate(sale.invoiceDate);
  }, [sale.invoiceNumber, sale.invoiceDate]);
  const nfs = (sale.attachments || []).filter((a) => a.kind === 'NF');
  const rel = releaseInfo(sale);

  const attach = useAction(
    async (att: Attachment) => {
      const n = number.trim() || nfNumberFromFileName(att.name) || null;
      if (n) setNumber(n);
      await ops.attachSaleFile(sale.id, att, { invoiceNumber: n, invoiceDate: invDate || null });
    },
    { success: 'NF anexada ao pedido' },
  );
  const removeFile = useAction(async (att: Attachment) => {
    if (await confirm({ title: 'Remover anexo?', message: att.name, danger: true, confirmLabel: 'Remover' })) await ops.removeSaleFile(sale.id, att.id);
  });

  return (
    <Card>
      <CardHeader
        title="Nota fiscal"
        subtitle={rel.nfRequired ? (rel.hasNf ? 'Liberado para expedir' : 'Obrigatória para expedir (cliente CNPJ)') : 'Opcional para este pedido'}
        icon={<FileText className="size-4" />}
      />
      <div className="space-y-3">
        {sale.invoiceNumber && (
          <p className="text-sm text-fg">
            NF nº <strong className="num">{sale.invoiceNumber}</strong>
            {sale.invoiceDate ? <span className="text-muted"> · emitida {sale.invoiceDate.split('-').reverse().join('/')}</span> : null}
          </p>
        )}
        {canEdit && (
          <>
            <FormGrid>
              <Field label="Número da NF" hint="Se vazio, lemos do nome do arquivo.">
                <Input value={number} onChange={(e) => setNumber(e.target.value)} inputMode="numeric" placeholder="Ex.: 004512" />
              </Field>
              <Field label="Data de emissão">
                <DateInput value={invDate} onChange={setInvDate} />
              </Field>
            </FormGrid>
            <FileDrop
              folder={`sales/${sale.id}`}
              kind="NF"
              accept="application/pdf,image/*,.xml"
              compact
              label={attach.running ? 'Salvando…' : 'Anexar NF (PDF, XML ou foto)'}
              hint="Pelo celular, dá para tirar foto da nota."
              onUploaded={(att) => attach.run(att).then(() => undefined)}
            />
          </>
        )}
        <AttachmentList items={nfs} onRemove={canEdit ? (a) => void removeFile.run(a) : undefined} empty="Nenhuma NF anexada." />
      </div>
    </Card>
  );
}
