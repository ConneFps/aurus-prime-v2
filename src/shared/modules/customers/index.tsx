/**
 * Módulo de CLIENTES e VENDEDORES EXTERNOS — páginas registradas em app/registry.tsx.
 */
export { CustomersPage } from './CustomersPage';
export { CustomerDetailPage } from './CustomerDetailPage';
export { ExternalSellersPage } from './ExternalSellersPage';
export { ExternalSellerApp } from './seller-app/ExternalSellerApp';
export { PartnersPage } from './PartnersPage';
import { RequestFormView } from './seller-app/RequestFormView';

/** Pré-cadastro feito por vendedor interno (o financeiro libera em Clientes → Pré-cadastros). */
export function CustomerPreRegistrationPage() {
  return <RequestFormView internal />;
}
