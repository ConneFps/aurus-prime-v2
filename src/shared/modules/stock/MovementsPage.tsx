/**
 * Movimentações de estoque: ledger, perdas e conciliação de baixas.
 */
import { ArrowLeftRight, ShieldCheck, TrendingDown } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useTable } from '../../data/react';
import { PageHeader, Tabs } from '../../ui';
import { useLotActions } from './LotActions';
import { LossesTab } from './LossesTab';
import { MovementsLedger } from './MovementsLedger';
import { ReconciliationTab } from './ReconciliationTab';

type Tab = 'ledger' | 'perdas' | 'conciliacao';

export function MovementsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (['perdas', 'conciliacao'].includes(params.get('aba') || '') ? params.get('aba') : 'ledger') as Tab;
  const setTab = (t: Tab) =>
    setParams(
      (p) => {
        if (t === 'ledger') p.delete('aba');
        else p.set('aba', t);
        return p;
      },
      { replace: true },
    );
  const { rows: movements, loading } = useTable('stock_movements');
  const { rows: lots } = useTable('stock_lots', { where: [['stage', '==', 'FINISHED']] });
  const actions = useLotActions();

  return (
    <>
      <PageHeader eyebrow="Estoque" title="Movimentações" subtitle="Tudo que entrou e saiu do estoque, as perdas e a conferência das baixas de venda." />
      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'ledger', label: 'Movimentações', icon: <ArrowLeftRight /> },
          { value: 'perdas', label: 'Perdas', icon: <TrendingDown /> },
          { value: 'conciliacao', label: 'Conciliação', icon: <ShieldCheck /> },
        ]}
      />
      {tab === 'ledger' && (
        <MovementsLedger
          movements={movements}
          loading={loading}
          initial={{ productId: params.get('produto'), batchId: params.get('lote'), sale: params.get('venda') || '' }}
        />
      )}
      {tab === 'perdas' && <LossesTab actions={actions} />}
      {tab === 'conciliacao' && <ReconciliationTab movements={movements} lots={lots} />}
      {actions.modals}
    </>
  );
}
