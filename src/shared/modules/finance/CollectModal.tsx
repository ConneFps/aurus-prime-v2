/**
 * Mensagem de cobrança pronta para WhatsApp (wa.me) — editável antes de enviar.
 */
import { Copy, MessageCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Customer, FinancialEntry } from '../../domain/types';
import { useSettings } from '../../app/settings';
import { Button, Callout, Field, MaskedInput, Modal, Textarea, toast } from '../../ui';
import { waPhone } from './helpers';
import { collectionMessage } from './statementModel';

export function CollectModal({ open, onClose, customer, overdue }: { open: boolean; onClose: () => void; customer: Customer; overdue: FinancialEntry[] }) {
  const { settings } = useSettings();
  const [text, setText] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (!open) return;
    setText(
      collectionMessage({
        customer,
        overdue,
        companyName: settings.tradeName || settings.companyName,
        pixKey: settings.pixKey,
      }),
    );
    setPhone(customer.cellphone || customer.phone || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customer.id]);

  const wa = waPhone(phone);
  const href = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(text)}` : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Cobrança pelo WhatsApp"
      description={`${overdue.length} ${overdue.length === 1 ? 'parcela vencida' : 'parcelas vencidas'} de ${customer.name}`}
      footer={
        <>
          <Button
            variant="ghost"
            icon={<Copy className="size-4" />}
            onClick={() => {
              void navigator.clipboard?.writeText(text).then(
                () => toast.success('Mensagem copiada'),
                () => toast.error('Não foi possível copiar'),
              );
            }}
          >
            Copiar
          </Button>
          <Button
            variant="primary"
            icon={<MessageCircle className="size-4" />}
            disabled={!href}
            onClick={() => {
              if (href) window.open(href, '_blank', 'noopener');
            }}
          >
            Abrir WhatsApp
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Telefone (WhatsApp)" hint={wa ? `Será enviado para +${wa}` : 'Informe um celular com DDD.'}>
          <MaskedInput mask="phone" value={phone} onChange={setPhone} />
        </Field>
        <Field label="Mensagem">
          <Textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        {!customer.cellphone && !customer.phone && <Callout tone="warning">Cliente sem telefone no cadastro — informe acima para enviar.</Callout>}
      </div>
    </Modal>
  );
}
