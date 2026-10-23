/**
 * Barra de ações do pedido — muda conforme status e permissões.
 */
import {
  Ban,
  Check,
  CircleDollarSign,
  ClipboardList,
  CopyPlus,
  FileText,
  PackageCheck,
  Pencil,
  QrCode,
  Scale,
  Send,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOps, useSession } from '../../../app/session';
import { useSettings } from '../../../app/settings';
import { useAction } from '../../../data/react';
import { kg, money, today } from '../../../domain/format';
import { optionsOf, PAYMENT_METHOD_LABELS } from '../../../domain/labels';
import type { Customer, FinancialEntry, PaymentMethod, Sale, StockLot, StockMovement } from '../../../domain/types';
import { Button, DateInput, Field, FormGrid, Menu, Modal, Select, Textarea, useConfirm, usePrompt, type MenuItem } from '../../../ui';
import { isEditable, openBalance, saleItemsToInputs } from '../helpers';
import { romaneioPdf, saleOrderPdf } from '../pdf';
import { PixBox } from '../PixBox';

interface Act {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
}

export function SaleActions({
  sale,
  customer,
  entries,
  movements,
  lots,
}: {
  sale: Sale;
  customer: Customer | null;
  entries: FinancialEntry[];
  movements: StockMovement[];
  lots: StockLot[];
}) {
  const nav = useNavigate();
  const ops = useOps();
  const { can, profile } = useSession();
  const { settings } = useSettings();
  const prompt = usePrompt();
  const confirm = useConfirm();
  const [pix, setPix] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);

  const s = sale.status;
  const live = entries.filter((e) => e.status !== 'CANCELLED');
  const open = live.length ? openBalance(live) : sale.paymentStatus === 'PAID' ? 0 : sale.totalValue;
  const received = live.reduce((a, e) => a + (e.paidAmount || 0), 0);
  const closed = s === 'CANCELLED' || s === 'REJECTED';
  const owner = sale.sellerId === profile?.id || sale.createdById === profile?.id;

  const submit = useAction(() => ops.submitSale(sale.id), { success: 'Pedido enviado para aprovação' });
  const approve = useAction(() => ops.approveSale(sale.id), { success: 'Pedido aprovado — parcelas geradas' });
  const reject = useAction((reason: string) => ops.rejectSale(sale.id, reason), { success: 'Pedido recusado' });
  const startPicking = useAction(() => ops.startPicking(sale.id), { success: 'Separação iniciada', onSuccess: () => nav(`/estoque/separacao/${sale.id}`) });
  const dispatch = useAction(() => ops.dispatchSale(sale.id), { success: 'Pedido expedido' });
  const deliver = useAction(() => ops.deliverSale(sale.id), { success: sale.deliveryMode === 'PICKUP' ? 'Retirada registrada' : 'Entrega registrada' });
  const weighing = useAction((accept: boolean) => ops.respondWeighing(sale.id, accept), { success: 'Resposta registrada' });
  const cancel = useAction((reason: string) => ops.cancelSale(sale.id, reason), { success: 'Pedido cancelado' });
  const remove = useAction((reason: string) => ops.deleteSale(sale.id, reason), { success: 'Pedido excluído', onSuccess: () => nav('/vendas') });

  const askReject = async () => {
    const reason = await prompt({ title: `Recusar pedido ${sale.number}?`, label: 'Motivo da recusa', confirmLabel: 'Recusar pedido', danger: true });
    if (reason) await reject.run(reason);
  };
  const askWeighing = async (accept: boolean) => {
    const ok = await confirm({
      title: accept ? 'Aceitar a diferença de peso?' : 'Recusar a pesagem?',
      message: accept
        ? 'Use quando o cliente confirmou por telefone/WhatsApp. O pedido segue para expedição com o valor pesado.'
        : 'Recusar cancela o pedido e devolve o estoque aos lotes.',
      danger: !accept,
      confirmLabel: accept ? 'Aceitar' : 'Recusar e cancelar',
    });
    if (ok) await weighing.run(accept);
  };
  const askCancel = async () => {
    const warn: string[] = [];
    if (sale.stockDeducted) warn.push(`O estoque baixado (${kg(sale.totalWeightKg)}) volta para os lotes.`);
    if (received > 0.005) warn.push(`Há ${money(received)} já recebidos — o valor não é devolvido automaticamente; combine devolução ou crédito com o cliente.`);
    if (open > 0.005) warn.push('As parcelas em aberto serão canceladas.');
    const reason = await prompt({
      title: `Cancelar pedido ${sale.number}?`,
      message: warn.length ? warn.join(' ') : 'O pedido fica registrado como cancelado.',
      label: 'Motivo do cancelamento',
      confirmLabel: 'Cancelar pedido',
      danger: true,
    });
    if (reason) await cancel.run(reason);
  };
  const askRemove = async () => {
    const reason = await prompt({
      title: `Excluir pedido ${sale.number}?`,
      message: `O pedido é cancelado (estornando estoque e parcelas) e vai para o arquivo de excluídos.${received > 0.005 ? ` Atenção: ${money(received)} já recebidos.` : ''}`,
      label: 'Motivo da exclusão',
      confirmLabel: 'Excluir pedido',
      danger: true,
    });
    if (reason) await remove.run(reason);
  };
  const genPix = useAction(() => ops.generateSalePix(sale.id), { onSuccess: (p) => setPix(p) });
  const pdf = useAction(() => saleOrderPdf({ sale, settings, customer, entries }));
  const romaneio = () => romaneioPdf({ sale, settings, customer, movements, lotCodes: new Map(lots.map((l) => [l.id, l.lotCode || l.batchCode || l.id.slice(0, 6)])) });
  const duplicate = () =>
    nav('/vendas/nova', {
      state: {
        seed: {
          customerId: sale.customerId,
          priceTableId: sale.priceTableId,
          items: saleItemsToInputs(sale),
          paymentMethod: sale.paymentMethod,
          billingType: sale.billingType,
          paymentTerms: sale.paymentTerms,
          deliveryMode: sale.deliveryMode,
          customerNotes: sale.customerNotes,
        },
        from: `Cópia do pedido ${sale.number} — confira quantidades, preços e datas.`,
      },
    });

  // ---- Ações principais (botões) --------------------------------------------
  const main: Act[] = [];
  if (s === 'DRAFT' && (can('sales.create') || can('sales.edit') || owner) && !can('sales.approve'))
    main.push({ label: 'Enviar para aprovação', icon: <Send className="size-4" />, onClick: () => void submit.run(), variant: 'primary', loading: submit.running });
  if ((s === 'DRAFT' || s === 'PENDING_APPROVAL') && can('sales.approve')) {
    main.push({ label: 'Aprovar', icon: <Check className="size-4" />, onClick: () => void approve.run(), variant: 'primary', loading: approve.running });
    main.push({ label: 'Recusar', icon: <X className="size-4" />, onClick: () => void askReject(), variant: 'danger', loading: reject.running });
  }
  if (s === 'APPROVED' && can('picking.perform'))
    main.push({ label: 'Iniciar separação', icon: <PackageCheck className="size-4" />, onClick: () => void startPicking.run(), variant: 'primary', loading: startPicking.running });
  if ((s === 'PICKING' || s === 'AWAITING_CUSTOMER') && can('picking.perform'))
    main.push({ label: 'Ir para separação', icon: <Scale className="size-4" />, onClick: () => nav(`/estoque/separacao/${sale.id}`), variant: s === 'PICKING' ? 'primary' : 'secondary' });
  if (s === 'READY' && can('picking.perform')) {
    if (sale.deliveryMode === 'PICKUP')
      main.push({ label: 'Marcar como retirado', icon: <Check className="size-4" />, onClick: () => void deliver.run(), variant: 'primary', loading: deliver.running });
    else main.push({ label: 'Expedir', icon: <Truck className="size-4" />, onClick: () => void dispatch.run(), variant: 'primary', loading: dispatch.running });
  }
  if (s === 'DISPATCHED' && can('picking.perform'))
    main.push({ label: 'Marcar como entregue', icon: <Check className="size-4" />, onClick: () => void deliver.run(), variant: 'primary', loading: deliver.running });
  if (!closed && sale.paymentMethod === 'PIX' && open > 0.005 && (can('sales.create') || can('sales.edit') || can('finance.manage')))
    main.push({ label: 'Gerar Pix', icon: <QrCode className="size-4" />, onClick: () => void genPix.run(), loading: genPix.running });
  if (!closed && can('finance.pay') && live.some((e) => e.status === 'OPEN'))
    main.push({ label: 'Confirmar pagamento', icon: <CircleDollarSign className="size-4" />, onClick: () => setPayOpen(true) });

  const menu: (MenuItem | 'divider')[] = [
    { label: 'PDF do pedido', icon: <FileText />, onClick: () => void pdf.run() },
    { label: 'Romaneio', icon: <ClipboardList />, onClick: romaneio },
    { label: 'Gerar Pix', icon: <QrCode />, hidden: closed || open <= 0.005 || sale.paymentMethod === 'PIX', onClick: () => void genPix.run() },
    'divider',
    { label: 'Editar pedido', icon: <Pencil />, hidden: !isEditable(sale) || !(can('sales.edit') || (owner && ['DRAFT', 'PENDING_APPROVAL'].includes(s))), onClick: () => nav(`/vendas/${sale.id}/editar`) },
    { label: 'Duplicar pedido', icon: <CopyPlus />, hidden: !can('sales.create'), onClick: duplicate },
    { label: 'Aceitar pesagem (pelo cliente)', icon: <Check />, hidden: s !== 'AWAITING_CUSTOMER' || !(can('sales.edit') || can('sales.approve')), onClick: () => void askWeighing(true) },
    { label: 'Recusar pesagem', icon: <X />, hidden: s !== 'AWAITING_CUSTOMER' || !(can('sales.edit') || can('sales.approve')), onClick: () => void askWeighing(false) },
    'divider',
    { label: 'Cancelar pedido', icon: <Ban />, danger: true, hidden: closed || !can('sales.cancel'), onClick: () => void askCancel() },
    { label: 'Excluir pedido', icon: <Trash2 />, danger: true, hidden: !can('sales.delete'), onClick: () => void askRemove() },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {main.map((a) => (
          <Button key={a.label} variant={a.variant || 'secondary'} icon={a.icon} loading={a.loading} onClick={a.onClick}>
            {a.label}
          </Button>
        ))}
        {isEditable(sale) && (can('sales.edit') || (owner && ['DRAFT', 'PENDING_APPROVAL'].includes(s))) && (
          <Button icon={<Pencil className="size-4" />} onClick={() => nav(`/vendas/${sale.id}/editar`)} className="max-sm:hidden">
            Editar
          </Button>
        )}
        <Button icon={<FileText className="size-4" />} loading={pdf.running} onClick={() => void pdf.run()} className="max-sm:hidden">
          PDF
        </Button>
        <Menu items={menu} />
      </div>

      <Modal open={!!pix} onClose={() => setPix(null)} title={`Pix do pedido ${sale.number}`} description={`${sale.customerName} · valor em aberto`} size="lg">
        {pix && (
          <PixBox
            payload={pix}
            amount={open}
            caption={`Chave ${settings.pixKey || '—'} · ${settings.pixMerchantName || settings.tradeName || ''}`}
            whatsappPhone={customer?.cellphone || customer?.phone}
            whatsappText={`Olá, ${customer?.contactName || sale.customerName}! Segue o Pix do pedido *${sale.number}* — *${money(open)}*.`}
            fileName={`pix-${sale.number}`}
          />
        )}
      </Modal>

      <ConfirmPaymentModal open={payOpen} onClose={() => setPayOpen(false)} sale={sale} amount={open} />
    </>
  );
}

function ConfirmPaymentModal({ open, onClose, sale, amount }: { open: boolean; onClose: () => void; sale: Sale; amount: number }) {
  const ops = useOps();
  const [d, setD] = useState<{ date: string; method: PaymentMethod; notes: string }>({ date: today(), method: sale.paymentMethod, notes: '' });
  const save = useAction(() => ops.confirmSalePayment(sale.id, { date: d.date, method: d.method, notes: d.notes || null }), {
    success: 'Pagamento confirmado',
    onSuccess: onClose,
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Confirmar pagamento"
      description={`Quita todas as parcelas em aberto do pedido ${sale.number}: ${money(amount)}.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.running} onClick={() => void save.run()}>
            Confirmar {money(amount)}
          </Button>
        </>
      }
    >
      <FormGrid>
        <Field label="Data do pagamento" required>
          <DateInput value={d.date} onChange={(v) => setD({ ...d, date: v })} />
        </Field>
        <Field label="Forma">
          <Select value={d.method} onChange={(v) => setD({ ...d, method: v })} options={optionsOf(PAYMENT_METHOD_LABELS)} />
        </Field>
        <Field label="Observação" span="full">
          <Textarea rows={2} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} placeholder="Ex.: comprovante conferido no extrato" />
        </Field>
      </FormGrid>
    </Modal>
  );
}
