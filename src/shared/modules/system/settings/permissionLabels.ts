/**
 * Descrição em português de cada permissão, agrupada por área — para a
 * tabela "o que cada papel pode" em Configurações → Usuários.
 */
import type { Permission } from '../../../domain/permissions';

export const PERMISSION_GROUPS: { label: string; items: { perm: Permission; label: string }[] }[] = [
  {
    label: 'Acesso às áreas',
    items: [
      { perm: 'view.dashboard', label: 'Painel e tarefas' },
      { perm: 'view.cattle', label: 'Gado (lotes, ração, custos)' },
      { perm: 'view.production', label: 'Abate e desossa' },
      { perm: 'view.stock', label: 'Estoque e materiais' },
      { perm: 'view.commercial', label: 'Comercial (vendas, clientes, preços)' },
      { perm: 'view.finance', label: 'Financeiro' },
      { perm: 'view.equines', label: 'Equinos' },
      { perm: 'view.reports', label: 'Relatórios' },
      { perm: 'view.settings', label: 'Configurações (consulta)' },
    ],
  },
  {
    label: 'Gado e produção',
    items: [
      { perm: 'cattle.manage', label: 'Cadastrar e editar lotes e animais' },
      { perm: 'costs.manage', label: 'Lançar custos e impostos' },
      { perm: 'production.manage', label: 'Registrar abate e desossa' },
      { perm: 'products.manage', label: 'Cadastrar cortes e produtos' },
    ],
  },
  {
    label: 'Estoque e logística',
    items: [
      { perm: 'stock.manage', label: 'Entradas, ajustes e perdas' },
      { perm: 'picking.perform', label: 'Separar, pesar e expedir pedidos' },
      { perm: 'supplies.manage', label: 'Materiais (embalagens, etiquetas)' },
    ],
  },
  {
    label: 'Comercial',
    items: [
      { perm: 'sales.create', label: 'Criar pedidos' },
      { perm: 'sales.edit', label: 'Editar pedidos' },
      { perm: 'sales.editPrice', label: 'Alterar preço no pedido' },
      { perm: 'sales.approve', label: 'Aprovar pedidos' },
      { perm: 'sales.cancel', label: 'Cancelar pedidos' },
      { perm: 'sales.delete', label: 'Excluir pedidos' },
      { perm: 'sales.viewCost', label: 'Ver custo e margem' },
      { perm: 'sales.viewAll', label: 'Ver pedidos de todos os vendedores' },
      { perm: 'customers.manage', label: 'Cadastrar clientes' },
      { perm: 'customers.approveFinancial', label: 'Aprovar crédito de clientes' },
      { perm: 'customers.request', label: 'Solicitar cadastro de cliente' },
      { perm: 'pricing.manage', label: 'Montar tabelas de preço' },
      { perm: 'pricing.approve', label: 'Aprovar tabelas de preço' },
      { perm: 'partners.manage', label: 'Cadastrar parceiros' },
      { perm: 'externalSellers.manage', label: 'Gerir vendedores externos' },
      { perm: 'portal.manage', label: 'Gerir o portal do cliente' },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { perm: 'finance.view', label: 'Ver contas e extratos' },
      { perm: 'finance.manage', label: 'Lançar e editar contas' },
      { perm: 'finance.pay', label: 'Dar baixa e estornar pagamentos' },
    ],
  },
  {
    label: 'Equinos',
    items: [{ perm: 'equines.manage', label: 'Cadastrar e lançar eventos' }],
  },
  {
    label: 'Sistema',
    items: [
      { perm: 'users.manage', label: 'Usuários, papéis e convites' },
      { perm: 'settings.manage', label: 'Alterar configurações' },
      { perm: 'audit.view', label: 'Ver auditoria' },
      { perm: 'data.export', label: 'Exportar dados' },
      { perm: 'data.migrate', label: 'Migrar do sistema antigo' },
    ],
  },
];

/** Resumo de cada papel (cartões acima da tabela). */
export const ROLE_SUMMARY: Record<string, string> = {
  ADMIN: 'Acesso total, inclusive usuários e migração.',
  MANAGER: 'Tudo da operação e do financeiro; não gere usuários.',
  FINANCIAL: 'Contas, crédito, aprovação de pedidos e preços, relatórios.',
  SELLER: 'Pedidos, clientes, tabelas de preço e consulta de estoque.',
  LOGISTICS: 'Separação, pesagem, expedição, estoque e desossa.',
  OPERATOR: 'Gado, abate, estoque, equinos e lançamento de pedidos.',
  EXTERNAL_SELLER: 'Aplicativo próprio: carteira, pedidos e comissões.',
};
