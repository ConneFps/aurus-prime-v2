/**
 * Documentos do pedido (NF, boleto, outros) e comprovante de pagamento do cliente.
 */
import { FileCheck2, Receipt, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useOps, useSession } from '../../../app/session';
import { useAction, useCrud } from '../../../data/react';
import { dateTime } from '../../../domain/format';
import type { Attachment, Sale } from '../../../domain/types';
import { AttachmentList, Badge, Button, Card, CardHeader, DateInput, Divider, Field, FileDrop, FormGrid, Input, Segmented, useConfirm } from '../../../ui';

type Kind = 'NF' | 'BOLETO' | 'DOCUMENT';

export function DocumentsCard({ sale }: { sale: Sale }) {
  const ops = useOps();
  const crud = useCrud('sales');
  const confirm = useConfirm();
  const { can, profile } = useSession();
  const owner = sale.sellerId === profile?.id;
  const canEdit = can('sales.edit') || can('finance.manage') || (profile?.role === 'EXTERNAL_SELLER' && owner);
  const [kind, setKind] = useState<Kind>('NF');
  const [f, setF] = useState({ invoiceNumber: sale.invoiceNumber || '', invoiceDate: sale.invoiceDate || '', boletoNumber: sale.boletoNumber || '' });
  useEffect(() => {
    setF({ invoiceNumber: sale.invoiceNumber || '', invoiceDate: sale.invoiceDate || '', boletoNumber: sale.boletoNumber || '' });
  }, [sale.invoiceNumber, sale.invoiceDate, sale.boletoNumber]);
  const dirty = f.invoiceNumber !== (sale.invoiceNumber || '') || f.invoiceDate !== (sale.invoiceDate || '') || f.boletoNumber !== (sale.boletoNumber || '');

  const fields = () => ({
    invoiceNumber: f.invoiceNumber.trim() || null,
    invoiceDate: f.invoiceDate || null,
    boletoNumber: f.boletoNumber.trim() || null,
  });
  // Só números (sem arquivo): atualização simples de campos do pedido.
  const saveNumbers = useAction(() => crud.update(sale.id, fields()), { success: 'Números salvos' });
  const attach = useAction((att: Attachment) => ops.attachSaleFile(sale.id, att, dirty ? fields() : undefined), { success: 'Arquivo anexado' });
  const removeFile = useAction(async (att: Attachment) => {
    if (await confirm({ title: `Remover "${att.name}"?`, danger: true, confirmLabel: 'Remover' })) await ops.removeSaleFile(sale.id, att.id);
  });
  const uploadReceipt = useAction((att: Attachment) => ops.uploadPaymentReceipt(sale.id, att), { success: 'Comprovante anexado' });

  const docs = sale.attachments || [];
  return (
    <Card>
      <CardHeader
        icon={<FileCheck2 className="size-4" />}
        title="Documentos"
        subtitle="Nota fiscal, boleto e demais arquivos do pedido."
        actions={
          <div className="flex gap-1.5">
            {sale.invoiceNumber && <Badge tone="success">NF {sale.invoiceNumber}</Badge>}
            {sale.boletoNumber && <Badge tone="info">Boleto</Badge>}
          </div>
        }
      />
      <div className="space-y-4">
        <FormGrid cols={3}>
          <Field label="Nº da nota fiscal">
            <Input value={f.invoiceNumber} onChange={(e) => setF({ ...f, invoiceNumber: e.target.value })} disabled={!canEdit} className="num" />
          </Field>
          <Field label="Data de emissão">
            <DateInput value={f.invoiceDate} onChange={(v) => setF({ ...f, invoiceDate: v })} disabled={!canEdit} />
          </Field>
          <Field label="Nº do boleto / nosso número">
            <Input value={f.boletoNumber} onChange={(e) => setF({ ...f, boletoNumber: e.target.value })} disabled={!canEdit} className="num" />
          </Field>
        </FormGrid>
        {canEdit && dirty && (
          <div className="flex justify-end">
            <Button size="sm" variant="primary" icon={<Save className="size-4" />} loading={saveNumbers.running} onClick={() => void saveNumbers.run()}>
              Salvar números
            </Button>
          </div>
        )}
        {canEdit && (
          <div className="space-y-2">
            <Segmented
              size="sm"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'NF', label: 'Nota fiscal' },
                { value: 'BOLETO', label: 'Boleto' },
                { value: 'DOCUMENT', label: 'Outro' },
              ]}
            />
            <FileDrop
              folder={`sales/${sale.id}`}
              kind={kind}
              compact
              multiple
              label={`Enviar ${kind === 'NF' ? 'a nota fiscal (PDF/XML)' : kind === 'BOLETO' ? 'o boleto' : 'um arquivo'}`}
              accept={kind === 'NF' ? '.pdf,.xml,image/*' : '.pdf,image/*'}
              onUploaded={(att) => attach.run(att).then(() => undefined)}
            />
          </div>
        )}
        <AttachmentList items={docs} onRemove={canEdit ? (a) => void removeFile.run(a) : undefined} empty="Nenhum documento anexado." />

        <Divider />
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Receipt className="size-4 text-muted" />
            <span className="text-sm font-medium text-fg">Comprovante de pagamento</span>
            {sale.paymentReceipt && (
              <Badge tone="info" size="xs">
                recebido {dateTime(sale.paymentReceipt.uploadedAt)}
              </Badge>
            )}
          </div>
          {sale.paymentReceipt ? (
            <AttachmentList items={[sale.paymentReceipt]} />
          ) : (
            <p className="text-xs text-muted">O cliente pode enviar pelo portal; a equipe também pode anexar aqui.</p>
          )}
          {(canEdit || can('finance.pay')) && sale.status !== 'CANCELLED' && sale.status !== 'REJECTED' && (
            <FileDrop
              folder={`sales/${sale.id}`}
              kind="RECEIPT"
              compact
              label={sale.paymentReceipt ? 'Substituir comprovante' : 'Anexar comprovante'}
              onUploaded={(att) => uploadReceipt.run(att).then(() => undefined)}
            />
          )}
        </div>
      </div>
    </Card>
  );
}
