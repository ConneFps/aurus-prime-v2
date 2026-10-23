/**
 * Registro de módulos: navegação (menus) + rotas. As duas opções montam o
 * menu a partir daqui — cada uma com seu próprio visual.
 */
import {
  Beef,
  BookOpen,
  Boxes,
  Calculator,
  ClipboardCheck,
  ClipboardList,
  DollarSign,
  FileBarChart,
  FileText,
  Globe,
  Handshake,
  HeartPulse,
  LayoutDashboard,
  ListChecks,
  Package,
  PackageCheck,
  Receipt,
  Repeat,
  Scale,
  Settings,
  ShoppingCart,
  Snowflake,
  Tag,
  Truck,
  UserCheck,
  Users,
  Wheat,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import React, { lazy } from 'react';
import type { Permission } from '../domain/permissions';

export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  permission?: Permission;
  /** Descrição curta (paleta de comandos / tela de treinamento). */
  description?: string;
}

export interface NavSection {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    id: 'painel',
    label: 'Painel',
    icon: LayoutDashboard,
    items: [
      { id: 'dashboard', label: 'Visão geral', path: '/', icon: LayoutDashboard, permission: 'view.dashboard', description: 'Indicadores do negócio' },
      { id: 'tasks', label: 'Tarefas', path: '/tarefas', icon: ListChecks, permission: 'view.dashboard', description: 'Tarefas da equipe' },
    ],
  },
  {
    id: 'gado',
    label: 'Gado',
    icon: ClipboardList,
    items: [
      { id: 'batches', label: 'Lotes de gado', path: '/gado/lotes', icon: ClipboardList, permission: 'view.cattle', description: 'Compra, animais, custos e resultado por lote' },
      { id: 'feed', label: 'Ração', path: '/gado/racao', icon: Wheat, permission: 'view.cattle', description: 'Compras e consumo de ração por lote' },
      { id: 'costs', label: 'Custos e fiscal', path: '/gado/custos', icon: DollarSign, permission: 'view.cattle', description: 'Lançamentos de custo, impostos e importação' },
      { id: 'calculator', label: 'Calculadora de compra', path: '/gado/calculadora', icon: Calculator, permission: 'view.cattle', description: 'Simulação de recria e engorda' },
    ],
  },
  {
    id: 'producao',
    label: 'Abate e desossa',
    icon: Beef,
    items: [
      { id: 'slaughter', label: 'Saída para abate', path: '/producao/abate', icon: Beef, permission: 'view.production', description: 'Registrar abate e gerar estoque pós-abate' },
      { id: 'raw_stock', label: 'Estoque pós-abate', path: '/producao/estoque-abate', icon: Snowflake, permission: 'view.production', description: 'Carcaças e quartos aguardando desossa' },
      { id: 'processing', label: 'Processamento', path: '/producao/processamento', icon: Repeat, permission: 'view.production', description: 'Ordens de desossa, retornos e rendimento' },
      { id: 'products', label: 'Cortes e produtos', path: '/producao/cortes', icon: Tag, permission: 'view.production', description: 'Cadastro de cortes padrão' },
    ],
  },
  {
    id: 'estoque',
    label: 'Estoque e expedição',
    icon: Warehouse,
    items: [
      { id: 'stock', label: 'Estoque de venda', path: '/estoque', icon: Package, permission: 'view.stock', description: 'Saldo por corte, lote e validade' },
      { id: 'movements', label: 'Movimentações', path: '/estoque/movimentacoes', icon: Scale, permission: 'view.stock', description: 'Entradas, saídas, perdas e conciliação' },
      { id: 'supplies', label: 'Materiais', path: '/estoque/materiais', icon: Boxes, permission: 'view.stock', description: 'Embalagens, etiquetas e insumos' },
      { id: 'picking', label: 'Separação de pedidos', path: '/estoque/separacao', icon: PackageCheck, permission: 'picking.perform', description: 'Pesagem, baixa e expedição' },
    ],
  },
  {
    id: 'comercial',
    label: 'Comercial',
    icon: ShoppingCart,
    items: [
      { id: 'sales', label: 'Vendas', path: '/vendas', icon: ShoppingCart, permission: 'view.commercial', description: 'Pedidos, aprovação, NF e boletos' },
      { id: 'intercompany', label: 'Intercompany', path: '/vendas/intercompany', icon: Repeat, permission: 'view.commercial', description: 'Vendas entre as empresas do grupo' },
      { id: 'proposals', label: 'Propostas e Pix', path: '/vendas/propostas', icon: FileText, permission: 'view.commercial', description: 'Propostas em PDF e cobrança Pix' },
      { id: 'customers', label: 'Clientes', path: '/clientes', icon: Users, permission: 'view.commercial', description: 'Cadastro, ranking e crédito' },
      { id: 'pricing', label: 'Tabelas de preço', path: '/comercial/precos', icon: Tag, permission: 'view.commercial', description: 'Preços por corte com aprovação' },
      { id: 'portal', label: 'Portal do cliente', path: '/comercial/portal', icon: Globe, permission: 'portal.manage', description: 'Contas, catálogo, frete e links públicos' },
      { id: 'external_sellers', label: 'Vendedores externos', path: '/comercial/vendedores', icon: UserCheck, permission: 'externalSellers.manage', description: 'Convites, comissões e solicitações' },
      { id: 'partners', label: 'Parceiros', path: '/parceiros', icon: Handshake, permission: 'view.commercial', description: 'Fornecedores, frigoríficos e transportadoras' },
    ],
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    icon: Receipt,
    items: [
      { id: 'finance', label: 'Contas', path: '/financeiro', icon: Receipt, permission: 'finance.view', description: 'Contas a receber e a pagar, baixas e fluxo de caixa' },
      { id: 'statements', label: 'Extrato por cliente', path: '/financeiro/clientes', icon: FileBarChart, permission: 'finance.view', description: 'Posição financeira de cada cliente' },
      { id: 'commissions', label: 'Comissões', path: '/financeiro/comissoes', icon: DollarSign, permission: 'finance.view', description: 'Comissões por vendedor' },
      { id: 'fiscal', label: 'Fiscal', path: '/financeiro/fiscal', icon: ClipboardCheck, permission: 'finance.view', description: 'Impostos por lote e documentos pendentes' },
    ],
  },
  {
    id: 'equinos',
    label: 'Equinos',
    icon: HeartPulse,
    items: [
      { id: 'equines', label: 'Plantel', path: '/equinos', icon: HeartPulse, permission: 'view.equines', description: 'Cadastro, saúde, treino e reprodução' },
      { id: 'semen', label: 'Banco de sêmen', path: '/equinos/semen', icon: Snowflake, permission: 'view.equines', description: 'Compras, doses e parcelas' },
    ],
  },
  {
    id: 'sistema',
    label: 'Sistema',
    icon: Settings,
    items: [
      { id: 'reports', label: 'Relatórios', path: '/relatorios', icon: FileBarChart, permission: 'view.reports', description: 'Relatórios em PDF e planilha' },
      { id: 'training', label: 'Treinamento', path: '/treinamento', icon: BookOpen, description: 'Guias de uso de cada módulo' },
      { id: 'settings', label: 'Configurações', path: '/configuracoes', icon: Settings, permission: 'view.settings', description: 'Empresa, usuários, Pix, migração' },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV.flatMap((s) => s.items);

// ----------------------------------------------------------------------------
// Rotas internas (lazy: cada módulo só carrega quando aberto)
// ----------------------------------------------------------------------------

const L = <T extends Record<string, React.ComponentType<object>>>(loader: () => Promise<T>, name: keyof T) =>
  lazy(async () => ({ default: (await loader())[name] as React.ComponentType<object> }));

const cattle = () => import('../modules/cattle');
const production = () => import('../modules/production');
const stock = () => import('../modules/stock');
const sales = () => import('../modules/sales');
const customers = () => import('../modules/customers');
const finance = () => import('../modules/finance');
const equines = () => import('../modules/equines');
const portal = () => import('../modules/portal');
const system = () => import('../modules/system');

export interface RouteDef {
  path: string;
  element: React.LazyExoticComponent<React.ComponentType<object>>;
  permission?: Permission;
}

export const ROUTES: RouteDef[] = [
  { path: '/tarefas', element: L(system, 'TasksPage'), permission: 'view.dashboard' },
  // Gado
  { path: '/gado/lotes', element: L(cattle, 'BatchesPage'), permission: 'view.cattle' },
  { path: '/gado/lotes/:id', element: L(cattle, 'BatchDetailPage'), permission: 'view.cattle' },
  { path: '/gado/racao', element: L(cattle, 'FeedPage'), permission: 'view.cattle' },
  { path: '/gado/custos', element: L(cattle, 'CostsPage'), permission: 'view.cattle' },
  { path: '/gado/calculadora', element: L(cattle, 'CalculatorPage'), permission: 'view.cattle' },
  // Produção
  { path: '/producao/abate', element: L(production, 'SlaughterPage'), permission: 'view.production' },
  { path: '/producao/estoque-abate', element: L(production, 'RawStockPage'), permission: 'view.production' },
  { path: '/producao/processamento', element: L(production, 'ProcessingPage'), permission: 'view.production' },
  { path: '/producao/processamento/:id', element: L(production, 'ProcessingDetailPage'), permission: 'view.production' },
  { path: '/producao/cortes', element: L(production, 'ProductsPage'), permission: 'view.production' },
  // Estoque
  { path: '/estoque', element: L(stock, 'StockPage'), permission: 'view.stock' },
  { path: '/estoque/movimentacoes', element: L(stock, 'MovementsPage'), permission: 'view.stock' },
  { path: '/estoque/materiais', element: L(stock, 'SuppliesPage'), permission: 'view.stock' },
  { path: '/estoque/separacao', element: L(stock, 'PickingPage'), permission: 'picking.perform' },
  { path: '/estoque/separacao/:id', element: L(stock, 'PickingDetailPage'), permission: 'picking.perform' },
  // Comercial
  { path: '/vendas', element: L(sales, 'SalesPage'), permission: 'view.commercial' },
  { path: '/vendas/intercompany', element: L(sales, 'IntercompanyPage'), permission: 'view.commercial' },
  { path: '/vendas/nova', element: L(sales, 'SaleFormPage'), permission: 'sales.create' },
  { path: '/vendas/propostas', element: L(sales, 'ProposalsPage'), permission: 'view.commercial' },
  { path: '/vendas/:id', element: L(sales, 'SaleDetailPage'), permission: 'view.commercial' },
  { path: '/vendas/:id/editar', element: L(sales, 'SaleFormPage'), permission: 'sales.edit' },
  { path: '/comercial/precos', element: L(sales, 'PriceTablesPage'), permission: 'view.commercial' },
  { path: '/clientes', element: L(customers, 'CustomersPage'), permission: 'view.commercial' },
  { path: '/clientes/pre-cadastro', element: L(customers, 'CustomerPreRegistrationPage'), permission: 'customers.request' },
  { path: '/clientes/:id', element: L(customers, 'CustomerDetailPage'), permission: 'view.commercial' },
  { path: '/parceiros', element: L(customers, 'PartnersPage'), permission: 'view.commercial' },
  { path: '/comercial/vendedores', element: L(customers, 'ExternalSellersPage'), permission: 'externalSellers.manage' },
  { path: '/comercial/portal', element: L(portal, 'PortalManagerPage'), permission: 'portal.manage' },
  // Financeiro
  { path: '/financeiro', element: L(finance, 'FinancePage'), permission: 'finance.view' },
  { path: '/financeiro/clientes', element: L(finance, 'StatementsPage'), permission: 'finance.view' },
  { path: '/financeiro/comissoes', element: L(finance, 'CommissionsPage'), permission: 'finance.view' },
  { path: '/financeiro/fiscal', element: L(finance, 'FiscalPage'), permission: 'finance.view' },
  // Equinos
  { path: '/equinos', element: L(equines, 'EquinesPage'), permission: 'view.equines' },
  { path: '/equinos/semen', element: L(equines, 'SemenPage'), permission: 'view.equines' },
  { path: '/equinos/:id', element: L(equines, 'EquineDetailPage'), permission: 'view.equines' },
  // Sistema
  { path: '/relatorios', element: L(system, 'ReportsPage'), permission: 'view.reports' },
  { path: '/treinamento', element: L(system, 'TrainingPage') },
  { path: '/configuracoes', element: L(system, 'SettingsPage'), permission: 'view.settings' },
];

/** Apps separados (fora do layout interno). */
export const PortalApp = L(portal, 'PortalApp');
export const PublicCatalogPage = L(portal, 'PublicCatalogPage');
export const ExternalSellerApp = L(customers, 'ExternalSellerApp');
