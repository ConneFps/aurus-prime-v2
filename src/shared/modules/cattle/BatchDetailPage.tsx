/**
 * Detalhe do lote: cabeçalho com status/ações e abas (resumo, animais, custos,
 * ração, abate & desossa, vendas).
 */
import {
  ArrowRightLeft,
  Beef,
  CircleDollarSign,
  ClipboardList,
  Edit3,
  FileDown,
  FileUp,
  Flag,
  LayoutDashboard,
  ListPlus,
  Plus,
  ShoppingCart,
  Tag,
  Wheat,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useOps, useSession } from '../../app/session';
import { useAction, useRow, useTable } from '../../data/react';
import { batchEconomics } from '../../domain/costs';
import { date, integer, kg, money, percent } from '../../domain/format';
import { BATCH_STATUS, MANAGEMENT_LABELS } from '../../domain/labels';
import { Badge, Button, Card, EmptyState, Menu, PageHeader, PageLoader, Stat, StatGrid, StatusBadge, Tabs, useConfirm } from '../../ui';
import { AddAnimalsDrawer, BatchEditDrawer } from './BatchEditDrawer';
import { exportBatchPdf } from './batchPdf';
import { CostImportDrawer } from './CostImportDrawer';
import { CostDrawer, QuickCostsDrawer } from './CostForms';
import { daysOnFeed, isActiveBatch, prefixed } from './helpers';
import { AnimalsTab } from './tabs/AnimalsTab';
import { CostsTab } from './tabs/CostsTab';
import { FeedTab } from './tabs/FeedTab';
import { SalesTab } from './tabs/SalesTab';
import { SlaughterTab } from './tabs/SlaughterTab';
import { SummaryTab } from './tabs/SummaryTab';
import { StatMoney, useSmUp } from './Money';

type TabKey = 'resumo' | 'animais' | 'custos' | 'racao' | 'abate' | 'vendas';
type Panel = 'edit' | 'animals' | 'cost' | 'quick' | 'import' | null;

export function BatchDetailPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { can } = useSession();
  const ops = useOps();
  const confirm = useConfirm();
  const sm = useSmUp();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('aba') as TabKey) || 'resumo';
  const setTab = (t: TabKey) => setParams((p) => {
    p.set('aba', t);
    return p;
  }, { replace: true });
  const [panel, setPanel] = useState<Panel>(null);

  const on = { enabled: !!id };
  const { row: batch, loading } = useRow('batches', id);
  const { rows: animals } = useTable('animals', { where: [['batchId', '==', id]] }, on);
  const { rows: costs } = useTable('batch_costs', { where: [['batchId', '==', id]] }, on);
  const { rows: feed } = useTable('feed_consumptions', { where: [['batchId', '==', id]] }, on);
  const { rows: lots } = useTable('stock_lots', { where: [['batchId', '==', id]] }, on);
  const { rows: movements } = useTable('stock_movements', { where: [['batchId', '==', id]] }, on);
  const { rows: orders } = useTable('processing_orders', { where: [['batchId', '==', id]] }, on);

  const econ = useMemo(() => (batch ? batchEconomics(batch, costs, animals, movements, lots) : null), [batch, costs, animals, movements, lots]);
  const sales = useMemo(() => movements.filter((m) => m.type === 'SALE' || m.type === 'SALE_REVERSAL'), [movements]);

  const toggleStatus = useAction(
    (to: 'PURCHASED' | 'IN_PASTURE') => ops.updateBatch(id, { status: to }),
    { success: 'Status do lote atualizado' },
  );
  const finishOp = useAction(() => ops.finishBatch(id), { success: 'Lote encerrado' });
  const finish = async () => {
    if (!batch) return;
    const alive = animals.filter((a) => a.status === 'ALIVE').length;
    const ok = await confirm({
      title: `Encerrar o lote ${batch.code}?`,
      message:
        batch.status === 'SLAUGHTERED'
          ? 'O lote sai da lista de ativos e o resultado fica consolidado. Custos ainda podem ser lançados depois.'
          : alive
            ? `Ainda há ${alive} animais vivos — registre o abate, a venda ou a morte deles antes de encerrar.`
            : 'O lote será encerrado sem registro de abate.',
      confirmLabel: 'Encerrar lote',
      danger: true,
    });
    if (ok) await finishOp.run();
  };

  if (loading) return <PageLoader />;
  if (!batch || !econ)
    return (
      <Card>
        <EmptyState
          icon={<ClipboardList className="size-5" />}
          title="Lote não encontrado"
          description="Ele pode ter sido removido."
          action={
            <Button onClick={() => nav('/gado/lotes')} variant="primary">
              Voltar aos lotes
            </Button>
          }
        />
      </Card>
    );

  const active = isActiveBatch(batch);
  const days = daysOnFeed(batch);
  const canCattle = can('cattle.manage');
  const canCosts = can('costs.manage');

  return (
    <>
      <PageHeader
        back="/gado/lotes"
        eyebrow={<span className="num">Gado · {batch.code}</span>}
        title={batch.name}
        subtitle={[batch.supplierName, batch.purchaseDate && `comprado em ${date(batch.purchaseDate)}`, prefixed('NF', batch.purchaseInvoice), prefixed('GTA', batch.gtaNumber)]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            {active && canCattle && (
              <Button variant="primary" icon={<Beef className="size-4" />} onClick={() => nav(`/producao/abate?lote=${batch.id}`)}>
                Ir para abate
              </Button>
            )}
            {canCosts && (
              <Button icon={<Plus className="size-4" />} onClick={() => setPanel('cost')}>
                Lançar custo
              </Button>
            )}
            {batch.status === 'SLAUGHTERED' && canCattle && (
              <Button icon={<Flag className="size-4" />} loading={finishOp.running} onClick={() => void finish()}>
                Encerrar lote
              </Button>
            )}
            <Menu
              items={[
                { label: 'Editar lote', icon: <Edit3 />, onClick: () => setPanel('edit'), hidden: !canCattle },
                {
                  label: batch.status === 'PURCHASED' ? 'Marcar “Em engorda”' : 'Voltar para “Comprado”',
                  icon: <ArrowRightLeft />,
                  onClick: () => void toggleStatus.run(batch.status === 'PURCHASED' ? 'IN_PASTURE' : 'PURCHASED'),
                  hidden: !canCattle || !active,
                },
                { label: 'Adicionar animais', icon: <Tag />, onClick: () => setPanel('animals'), hidden: !canCattle || !active },
                { label: 'Lançamento rápido', icon: <ListPlus />, onClick: () => setPanel('quick'), hidden: !canCosts },
                { label: 'Importar custos (CSV)', icon: <FileUp />, onClick: () => setPanel('import'), hidden: !canCosts },
                { label: 'Relatório em PDF', icon: <FileDown />, onClick: () => exportBatchPdf(batch, econ, costs, animals, feed) },
                'divider',
                { label: 'Encerrar lote', icon: <Flag />, danger: true, onClick: () => void finish(), hidden: !canCattle || !active },
              ]}
            />
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge info={BATCH_STATUS[batch.status]} />
          <Badge>{MANAGEMENT_LABELS[batch.managementType]}</Badge>
          {days !== null && <Badge tone="info">{integer(days)} dias {batch.slaughterDate ? 'até o abate' : 'em engorda'}</Badge>}
          {active && batch.estimatedSlaughterDate && <Badge tone="accent">Abate previsto {date(batch.estimatedSlaughterDate)}</Badge>}
          {batch.slaughterhouseName && <Badge>{batch.slaughterhouseName}</Badge>}
        </div>
      </PageHeader>

      <StatGrid cols={4} className="mb-5">
        <Stat
          label={active ? 'Cabeças vivas' : 'Cabeças'}
          value={active ? `${integer(econ.aliveCount)}` : integer(econ.headCount)}
          hint={active ? `de ${integer(econ.headCount)} compradas` : `${kg(Math.round(econ.purchaseWeightKg))} na compra`}
          icon={sm && <Beef className="size-4" />}
        />
        <Stat label="Custo total" value={<StatMoney value={econ.totalCost} />} hint={econ.credits ? `créditos ${money(econ.credits)}` : `${costs.length} lançamentos`} icon={sm && <CircleDollarSign className="size-4" />} tone="accent" />
        <Stat
          label="Custo por cabeça"
          value={<StatMoney value={econ.costPerHead} />}
          hint={econ.costPerArroba ? `${money(econ.costPerArroba)} por @ de carcaça` : 'custo/@ após o abate'}
          icon={sm && <Tag className="size-4" />}
          tone="info"
        />
        <Stat
          label={econ.revenueSource === 'NONE' ? 'Resultado' : econ.profit >= 0 ? 'Lucro' : 'Prejuízo'}
          value={econ.revenueSource === 'NONE' ? '—' : <StatMoney value={econ.profit} />}
          hint={econ.revenueSource === 'NONE' ? (active ? 'sem receita ainda — veja a projeção' : 'sem receita registrada') : `margem ${percent(econ.marginPercent)} · ROI ${percent(econ.roiPercent)}`}
          icon={sm && <LayoutDashboard className="size-4" />}
          tone={econ.revenueSource === 'NONE' ? 'neutral' : econ.profit >= 0 ? 'success' : 'danger'}
        />
      </StatGrid>

      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'resumo', label: 'Resumo', icon: <LayoutDashboard /> },
          { value: 'animais', label: 'Animais', icon: <Tag />, count: animals.length },
          { value: 'custos', label: 'Custos', icon: <CircleDollarSign />, count: costs.length },
          { value: 'racao', label: 'Ração', icon: <Wheat />, count: feed.length },
          { value: 'abate', label: 'Abate & desossa', icon: <Beef /> },
          { value: 'vendas', label: 'Vendas', icon: <ShoppingCart />, count: new Set(sales.map((s) => s.saleId).filter(Boolean)).size },
        ]}
      />

      {tab === 'resumo' && <SummaryTab batch={batch} econ={econ} costs={costs} animals={animals} feed={feed} />}
      {tab === 'animais' && <AnimalsTab batch={batch} animals={animals} onAdd={() => setPanel('animals')} />}
      {tab === 'custos' && <CostsTab batch={batch} costs={costs} onAdd={() => setPanel('cost')} onQuick={() => setPanel('quick')} onImport={() => setPanel('import')} />}
      {tab === 'racao' && <FeedTab batch={batch} feed={feed} heads={econ.headCount} />}
      {tab === 'abate' && <SlaughterTab batch={batch} econ={econ} lots={lots} orders={orders} />}
      {tab === 'vendas' && <SalesTab batch={batch} sales={sales} lots={lots} econ={econ} />}

      {canCattle && (
        <>
          <BatchEditDrawer open={panel === 'edit'} onClose={() => setPanel(null)} batch={batch} hasAnimals={animals.length > 0} />
          <AddAnimalsDrawer open={panel === 'animals'} onClose={() => setPanel(null)} batch={batch} />
        </>
      )}
      {canCosts && (
        <>
          <CostDrawer open={panel === 'cost'} onClose={() => setPanel(null)} batchId={batch.id} />
          <QuickCostsDrawer open={panel === 'quick'} onClose={() => setPanel(null)} batchId={batch.id} />
          <CostImportDrawer open={panel === 'import'} onClose={() => setPanel(null)} batchId={batch.id} />
        </>
      )}
    </>
  );
}
