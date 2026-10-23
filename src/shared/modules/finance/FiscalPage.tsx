/**
 * Fiscal — impostos por lote/mês e pendências documentais (NF/boleto) das vendas.
 */
import { FileWarning, Landmark } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTable } from '../../data/react';
import { PageHeader, Tabs } from '../../ui';
import { docPendencies, FiscalDocs } from './FiscalDocs';
import { FiscalTaxes } from './FiscalTaxes';

type Tab = 'TAXES' | 'DOCS';

export function FiscalPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('aba') === 'DOCS' ? 'DOCS' : 'TAXES';
  const { rows: costs, loading: lc } = useTable('batch_costs');
  const { rows: batches } = useTable('batches');
  const { rows: sales, loading: ls } = useTable('sales');
  const pending = useMemo(() => docPendencies(sales).length, [sales]);

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        title="Fiscal"
        subtitle="Impostos e taxas dos lotes (Funrural, ICMS, SENAR, GTA, inspeção) e documentos pendentes das vendas."
      />
      <Tabs<Tab>
        value={tab}
        onChange={(t) => setParams({ aba: t }, { replace: true })}
        className="mb-5"
        items={[
          { value: 'TAXES', label: 'Impostos por lote', icon: <Landmark /> },
          { value: 'DOCS', label: 'Documentos pendentes', icon: <FileWarning />, count: pending },
        ]}
      />
      {tab === 'TAXES' ? <FiscalTaxes costs={costs} batches={batches} loading={lc} /> : <FiscalDocs sales={sales} loading={ls} />}
    </>
  );
}
