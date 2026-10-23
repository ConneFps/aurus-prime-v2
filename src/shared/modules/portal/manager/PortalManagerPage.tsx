/**
 * Portal do cliente — tela interna da equipe (/comercial/portal).
 * Abas: pedidos do portal, contas, catálogo, entrega e frete, links públicos.
 */
import { ClipboardList, ExternalLink, FileCheck2, Link2, Scale, ShoppingBag, Truck, UserPlus, Users } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTable } from '../../../data/react';
import { Button, PageHeader, Stat, StatGrid, Tabs } from '../../../ui';
import { AccountsTab } from './AccountsTab';
import { CatalogTab } from './CatalogTab';
import { DeliveryTab } from './DeliveryTab';
import { inQueue } from './helpers';
import { LinksTab } from './LinksTab';
import { OrdersTab } from './OrdersTab';

type TabKey = 'pedidos' | 'contas' | 'catalogo' | 'entrega' | 'links';

export function PortalManagerPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('aba') as TabKey) || 'pedidos';
  const setTab = (t: TabKey, fila?: string) => setParams(t === 'pedidos' ? (fila ? { fila } : {}) : { aba: t }, { replace: true });

  const { rows: sales, loading: lSales } = useTable('sales', { where: [['channel', '==', 'PORTAL']] });
  const { rows: accounts, loading: lAcc } = useTable('portal_accounts');
  const { rows: catalog, loading: lCat } = useTable('catalog_items');
  const { rows: zones, loading: lZones } = useTable('freight_zones');
  const { rows: links, loading: lLinks } = useTable('public_catalog_links');

  const stats = useMemo(
    () => ({
      newOrders: sales.filter((s) => inQueue(s, 'NEW')).length,
      customer: sales.filter((s) => inQueue(s, 'CUSTOMER')).length,
      receipts: sales.filter((s) => inQueue(s, 'RECEIPT')).length,
      pendingAccounts: accounts.filter((a) => a.status === 'PENDING').length,
      activeAccounts: accounts.filter((a) => a.status === 'APPROVED').length,
    }),
    [sales, accounts],
  );
  const openOrders = sales.filter((s) => inQueue(s, 'NEW') || inQueue(s, 'FREIGHT') || inQueue(s, 'CUSTOMER') || inQueue(s, 'RECEIPT')).length;

  return (
    <>
      <PageHeader
        eyebrow="Comercial"
        title="Portal do cliente"
        subtitle="Pedidos feitos pelos clientes, liberação de contas, catálogo, frete e vitrines públicas."
        actions={
          <a href="#/portal" target="_blank" rel="noopener noreferrer">
            <Button icon={<ExternalLink className="size-4" />}>Abrir o portal</Button>
          </a>
        }
      />

      <StatGrid cols={4} className="mb-6">
        <Stat label="Novos" value={stats.newOrders} icon={<ShoppingBag className="size-4" />} tone={stats.newOrders ? 'warning' : 'primary'} hint="pedidos p/ aprovar" onClick={() => setTab('pedidos', 'NEW')} />
        <Stat label="Pesagem" value={stats.customer} icon={<Scale className="size-4" />} tone={stats.customer ? 'warning' : 'primary'} hint="aguardando cliente" onClick={() => setTab('pedidos', 'CUSTOMER')} />
        <Stat label="Pagamentos" value={stats.receipts} icon={<FileCheck2 className="size-4" />} tone={stats.receipts ? 'info' : 'primary'} hint="comprovantes" onClick={() => setTab('pedidos', 'RECEIPT')} />
        <Stat
          label="Cadastros"
          value={stats.pendingAccounts}
          icon={<UserPlus className="size-4" />}
          tone={stats.pendingAccounts ? 'warning' : 'primary'}
          hint={`em análise · ${stats.activeAccounts} ativas`}
          onClick={() => setTab('contas')}
        />
      </StatGrid>

      <Tabs
        className="mb-5"
        value={tab}
        onChange={(t) => setTab(t)}
        items={[
          { value: 'pedidos', label: 'Pedidos do portal', icon: <ClipboardList />, count: openOrders || undefined },
          { value: 'contas', label: 'Contas', icon: <Users />, count: stats.pendingAccounts || undefined },
          { value: 'catalogo', label: 'Catálogo', icon: <ShoppingBag />, count: catalog.filter((c) => c.available).length },
          { value: 'entrega', label: 'Entrega e frete', icon: <Truck /> },
          { value: 'links', label: 'Links públicos', icon: <Link2 />, count: links.filter((l) => l.active).length || undefined },
        ]}
      />

      {tab === 'pedidos' && <OrdersTab sales={sales} accounts={accounts} loading={lSales} />}
      {tab === 'contas' && <AccountsTab accounts={accounts} loading={lAcc} />}
      {tab === 'catalogo' && <CatalogTab items={catalog} loading={lCat} />}
      {tab === 'entrega' && <DeliveryTab zones={zones} loading={lZones} />}
      {tab === 'links' && <LinksTab links={links} catalog={catalog} loading={lLinks} />}
    </>
  );
}

