import type {
  Animal,
  AppSettings,
  AuditLog,
  Batch,
  BatchCost,
  CatalogItem,
  CattleSimulation,
  Counter,
  Customer,
  CustomerRequest,
  DeletedSale,
  Equine,
  EquineEvent,
  EquineSale,
  FeedConsumption,
  FeedPurchase,
  FeedType,
  FinancialEntry,
  FreightZone,
  Invite,
  Partner,
  PortalAccount,
  PortalInvite,
  PriceTable,
  ProcessingOrder,
  Product,
  Profile,
  PublicCatalogLink,
  Sale,
  SaleItem,
  SemenPurchase,
  StockLoss,
  StockLot,
  StockMovement,
  SupplyItem,
  SupplyMovement,
  Task,
} from './types';

/**
 * Mapa tabela → tipo. O nome da chave é o nome da tabela (PostgreSQL) e da
 * coleção (Firestore). Toda leitura/escrita passa por aqui.
 */
export interface TableMap {
  profiles: Profile;
  invites: Invite;
  audit_logs: AuditLog;
  settings: AppSettings;
  counters: Counter;
  tasks: Task;
  partners: Partner;
  batches: Batch;
  animals: Animal;
  batch_costs: BatchCost;
  feed_types: FeedType;
  feed_purchases: FeedPurchase;
  feed_consumptions: FeedConsumption;
  cattle_simulations: CattleSimulation;
  products: Product;
  stock_lots: StockLot;
  stock_movements: StockMovement;
  stock_losses: StockLoss;
  processing_orders: ProcessingOrder;
  customers: Customer;
  customer_requests: CustomerRequest;
  price_tables: PriceTable;
  sales: Sale;
  sale_items: SaleItem;
  deleted_sales: DeletedSale;
  financial_entries: FinancialEntry;
  supply_items: SupplyItem;
  supply_movements: SupplyMovement;
  portal_accounts: PortalAccount;
  portal_invites: PortalInvite;
  catalog_items: CatalogItem;
  freight_zones: FreightZone;
  public_catalog_links: PublicCatalogLink;
  equines: Equine;
  equine_events: EquineEvent;
  equine_sales: EquineSale;
  semen_purchases: SemenPurchase;
}

export type TableName = keyof TableMap;
export type Row<K extends TableName> = TableMap[K];

export interface TableMeta {
  label: string;
  /** Colunas guardadas como JSON (jsonb no PostgreSQL). */
  json?: string[];
  /** Colunas que são listas de texto (text[] no PostgreSQL). */
  arrays?: string[];
  /**
   * Filhos embutidos no agregado: no Firestore ficam dentro do documento;
   * no PostgreSQL vêm de outra tabela (FK) via select aninhado.
   */
  children?: { field: string; table: TableName; fk: string; orderBy?: string }[];
  /** Campos padrão para a busca textual das listas. */
  search?: string[];
}

export const TABLES: Record<TableName, TableMeta> = {
  profiles: { label: 'Usuários', search: ['name', 'email'] },
  invites: { label: 'Convites', search: ['name', 'email'] },
  audit_logs: { label: 'Auditoria', json: ['data'], search: ['summary', 'userName', 'entity'] },
  settings: { label: 'Configurações', arrays: ['corporateDomains', 'deliveryBlockedDates'] },
  counters: { label: 'Contadores' },
  tasks: { label: 'Tarefas', search: ['title', 'assigneeName'] },
  partners: { label: 'Parceiros', search: ['name', 'tradeName', 'document', 'city'] },
  batches: { label: 'Lotes', search: ['code', 'name', 'supplierName', 'gtaNumber'] },
  animals: { label: 'Animais', search: ['tag', 'breed'] },
  batch_costs: { label: 'Custos de lote', search: ['description', 'documentNumber', 'partnerName'] },
  feed_types: { label: 'Tipos de ração', search: ['name'] },
  feed_purchases: { label: 'Compras de ração', arrays: ['batchIds'], search: ['invoiceNumber', 'feedTypeName', 'supplierName'] },
  feed_consumptions: { label: 'Consumo de ração', search: ['batchName', 'feedTypeName'] },
  cattle_simulations: { label: 'Simulações', json: ['params', 'result'], search: ['name'] },
  products: { label: 'Produtos', search: ['name', 'code', 'category'] },
  stock_lots: { label: 'Lotes de estoque', search: ['productName', 'lotCode', 'batchCode', 'originInvoice'] },
  stock_movements: { label: 'Movimentações de estoque', search: ['productName', 'saleNumber', 'customerName', 'reason'] },
  stock_losses: { label: 'Perdas', search: ['productName', 'notes', 'processingOrderNumber'] },
  processing_orders: {
    label: 'Ordens de processamento',
    json: ['sentItems', 'returns'],
    search: ['number', 'partnerName', 'batchCode', 'dispatchDocument'],
  },
  customers: {
    label: 'Clientes',
    json: ['documents'],
    arrays: ['allowedPaymentMethods'],
    search: ['name', 'tradeName', 'document', 'city', 'contactName', 'code'],
  },
  customer_requests: { label: 'Solicitações de cadastro', json: ['financialApproval'], search: ['name', 'document', 'requestedByName'] },
  price_tables: { label: 'Tabelas de preço', json: ['items'], search: ['name'] },
  sales: {
    label: 'Vendas',
    json: ['attachments', 'paymentReceipt', 'weighing', 'history'],
    children: [{ field: 'items', table: 'sale_items', fk: 'saleId', orderBy: 'position' }],
    search: ['number', 'customerName', 'sellerName', 'invoiceNumber'],
  },
  sale_items: { label: 'Itens de venda', search: ['productName'] },
  deleted_sales: { label: 'Vendas excluídas', json: ['snapshot'], search: ['number', 'customerName', 'deletedByName'] },
  financial_entries: {
    label: 'Lançamentos financeiros',
    json: ['payments'],
    search: ['description', 'partyName', 'saleNumber', 'documentNumber'],
  },
  supply_items: { label: 'Materiais', search: ['name', 'sku', 'supplier'] },
  supply_movements: { label: 'Movimentações de materiais', search: ['supplyItemName', 'saleNumber', 'invoiceNumber'] },
  portal_accounts: { label: 'Contas do portal', search: ['name', 'email', 'companyName', 'document'] },
  portal_invites: { label: 'Convites do portal', search: ['email', 'name', 'customerName'] },
  catalog_items: { label: 'Catálogo do portal', search: ['name', 'category'] },
  freight_zones: { label: 'Zonas de frete', arrays: ['cepPrefixes'], search: ['label'] },
  public_catalog_links: { label: 'Links públicos', json: ['items'], search: ['title', 'token'] },
  equines: {
    label: 'Equinos',
    json: ['photos'],
    search: ['name', 'breed', 'registry', 'chipId', 'haras'],
  },
  equine_events: { label: 'Eventos de equinos', json: ['data', 'attachments'], search: ['title', 'equineName'] },
  equine_sales: { label: 'Vendas de equinos', search: ['equineName', 'buyerName'] },
  semen_purchases: { label: 'Compras de sêmen', json: ['usage'], search: ['stallionName', 'supplierName', 'lotCode'] },
};

export const TABLE_NAMES = Object.keys(TABLES) as TableName[];

/** Tabelas que são filhas embutidas de outra (não aparecem como coleção no Firestore). */
export const EMBEDDED_CHILD_TABLES: TableName[] = ['sale_items'];

/** Converte camelCase → snake_case (nomes de coluna no PostgreSQL). */
export function toSnake(key: string): string {
  return key.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
}

/** Converte snake_case → camelCase. */
export function toCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}
