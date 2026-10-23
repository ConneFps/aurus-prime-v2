import type { Role } from './types';

/**
 * Permissões por papel. As telas escondem o que o usuário não pode fazer e
 * o banco (RLS no PostgreSQL / regras no Firestore) bloqueia de verdade.
 */
export type Permission =
  // Visualização de áreas
  | 'view.dashboard'
  | 'view.cattle'
  | 'view.production'
  | 'view.stock'
  | 'view.commercial'
  | 'view.finance'
  | 'view.equines'
  | 'view.reports'
  | 'view.settings'
  // Gado e produção
  | 'cattle.manage'
  | 'costs.manage'
  | 'production.manage'
  | 'products.manage'
  // Estoque e logística
  | 'stock.manage'
  | 'picking.perform'
  | 'supplies.manage'
  // Comercial
  | 'sales.create'
  | 'sales.edit'
  | 'sales.editPrice'
  | 'sales.approve'
  | 'sales.cancel'
  | 'sales.delete'
  | 'sales.viewCost'
  | 'sales.viewAll'
  | 'customers.manage'
  | 'customers.approveFinancial'
  | 'customers.request'
  | 'pricing.manage'
  | 'pricing.approve'
  | 'partners.manage'
  | 'externalSellers.manage'
  | 'portal.manage'
  // Financeiro
  | 'finance.view'
  | 'finance.manage'
  | 'finance.pay'
  // Equinos
  | 'equines.manage'
  // Sistema
  | 'users.manage'
  | 'settings.manage'
  | 'audit.view'
  | 'data.export'
  | 'data.migrate';

const ALL: Permission[] = [
  'view.dashboard', 'view.cattle', 'view.production', 'view.stock', 'view.commercial', 'view.finance', 'view.equines',
  'view.reports', 'view.settings', 'cattle.manage', 'costs.manage', 'production.manage', 'products.manage', 'stock.manage',
  'picking.perform', 'supplies.manage', 'sales.create', 'sales.edit', 'sales.editPrice', 'sales.approve', 'sales.cancel',
  'sales.delete', 'sales.viewCost', 'sales.viewAll', 'customers.manage', 'customers.approveFinancial', 'customers.request',
  'pricing.manage', 'pricing.approve', 'partners.manage', 'externalSellers.manage', 'portal.manage', 'finance.view',
  'finance.manage', 'finance.pay', 'equines.manage', 'users.manage', 'settings.manage', 'audit.view', 'data.export',
  'data.migrate',
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: ALL,
  MANAGER: ALL.filter((p) => !['users.manage', 'data.migrate'].includes(p)),
  FINANCIAL: [
    'view.dashboard', 'view.commercial', 'view.finance', 'view.stock', 'view.reports', 'view.settings', 'view.cattle',
    'sales.edit', 'sales.editPrice', 'sales.approve', 'sales.cancel', 'sales.viewCost', 'sales.viewAll',
    'customers.manage', 'customers.approveFinancial', 'pricing.approve', 'finance.view', 'finance.manage', 'finance.pay',
    'costs.manage', 'data.export',
  ],
  SELLER: [
    'view.dashboard', 'view.commercial', 'view.stock', 'view.reports', 'view.settings', 'sales.create', 'sales.edit',
    // Vendedor faz PRÉ-CADASTRO; quem libera o cliente (e o crédito) é o financeiro.
    'sales.editPrice', 'sales.viewAll', 'customers.request', 'picking.perform', 'pricing.manage',
  ],
  LOGISTICS: [
    'view.dashboard', 'view.stock', 'view.production', 'view.settings', 'picking.perform', 'stock.manage', 'supplies.manage',
    'sales.edit', 'sales.viewAll', 'production.manage',
  ],
  OPERATOR: [
    'view.dashboard', 'view.cattle', 'view.production', 'view.stock', 'view.equines', 'view.settings', 'cattle.manage',
    'production.manage', 'stock.manage', 'supplies.manage', 'equines.manage', 'sales.create', 'customers.manage',
  ],
  EXTERNAL_SELLER: ['sales.create', 'customers.request'],
};

export function can(role: Role | null | undefined, perm: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(perm) ?? false;
}

/** Papéis que enxergam o sistema interno completo (os demais têm áreas próprias). */
export const INTERNAL_ROLES: Role[] = ['ADMIN', 'MANAGER', 'FINANCIAL', 'SELLER', 'LOGISTICS', 'OPERATOR'];

/** Verifica se o e-mail pertence a um dos domínios corporativos. */
export function isCorporateEmail(email: string | null | undefined, domains: string[]): boolean {
  const d = (email || '').split('@')[1]?.trim().toLowerCase();
  return !!d && domains.map((x) => x.toLowerCase().replace(/^@/, '')).includes(d);
}

export const DEFAULT_CORPORATE_DOMAINS = [
  'mvgbalimentacao.com',
  'grtbalimentacao.com',
  'girassolalimentacao.com',
  'aurusprime.com',
];

export function companyFromEmail(email: string | null | undefined): 'MVGB' | 'GRTB' | 'GIRASSOL' | 'AURUS' {
  const d = (email || '').split('@')[1]?.toLowerCase() || '';
  if (d.startsWith('grtb')) return 'GRTB';
  if (d.startsWith('girassol')) return 'GIRASSOL';
  if (d.startsWith('aurus')) return 'AURUS';
  return 'MVGB';
}
