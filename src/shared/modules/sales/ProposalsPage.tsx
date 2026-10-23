/**
 * /vendas/propostas — proposta rápida (PDF/WhatsApp/pedido) e cobrança Pix avulsa.
 */
import { FileText, QrCode } from 'lucide-react';
import { useState } from 'react';
import { PageHeader, Tabs } from '../../ui';
import { PixCharge } from './proposals/PixCharge';
import { ProposalBuilder } from './proposals/ProposalBuilder';

type Tab = 'proposal' | 'pix';

export function ProposalsPage() {
  const [tab, setTab] = useState<Tab>('proposal');
  return (
    <>
      <PageHeader
        eyebrow="Comercial"
        title="Propostas e Pix"
        subtitle="Monte uma proposta em segundos, envie em PDF ou WhatsApp e converta em pedido. Gere cobranças Pix avulsas."
      />
      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'proposal', label: 'Proposta', icon: <FileText /> },
          { value: 'pix', label: 'Cobrança Pix', icon: <QrCode /> },
        ]}
      />
      {/* Mantém a proposta montada ao alternar de aba. */}
      <div hidden={tab !== 'proposal'}>
        <ProposalBuilder />
      </div>
      {tab === 'pix' && <PixCharge />}
    </>
  );
}
