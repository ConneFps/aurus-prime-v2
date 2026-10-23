/**
 * Módulo de VENDAS — páginas registradas em app/registry.tsx.
 */
import { SalesList } from './SalesList';

export { SaleFormPage } from './SaleFormPage';
export { SaleDetailPage } from './SaleDetailPage';
export { ProposalsPage } from './ProposalsPage';
export { PriceTablesPage } from './PriceTablesPage';
/** Formulário de venda reutilizável (props: initial?, onSaved?). */
export { SaleEditor, type SaleDraftSeed } from './SaleEditor';

export function SalesPage() {
  return <SalesList />;
}

export function IntercompanyPage() {
  return <SalesList intercompany />;
}
