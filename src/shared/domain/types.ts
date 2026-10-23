/**
 * MODELO DE DADOS — Aurus Prime 2.0
 * ---------------------------------------------------------------------------
 * Fonte única de verdade para as duas opções (PostgreSQL e Firestore).
 *
 *  - Cada interface "Row" corresponde a UMA tabela (PostgreSQL) / UMA coleção
 *    de nível superior (Firestore). O nome está em TableMap (schema.ts).
 *  - Campos em camelCase no TypeScript; no PostgreSQL viram snake_case
 *    (a conversão é automática no adaptador).
 *  - Datas "dia" são strings 'YYYY-MM-DD'. Momentos são ISO 8601.
 *  - Dinheiro em reais (number com 2 casas); peso em kg (number com 3 casas).
 *  - Campos opcionais aceitam null (PostgreSQL devolve null).
 */

// ============================================================================
// Base
// ============================================================================

export interface BaseRow {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** Id do documento no sistema antigo (Firebase v1). Usado pela migração. */
  legacyId?: string | null;
}

export type ISODate = string; // 'YYYY-MM-DD'
export type ISODateTime = string; // '2026-09-30T13:36:00.000Z'

/** Empresas do grupo (intercompany e origem de usuários). */
export type CompanyCode = 'MVGB' | 'GRTB' | 'GIRASSOL' | 'AURUS';

export interface Attachment {
  id: string;
  name: string;
  /** Caminho no Storage (bucket) — use storage.url(path) para abrir. */
  path: string;
  /** URL direta quando já conhecida (ex.: pública ou legada). */
  url?: string | null;
  mimeType?: string | null;
  size?: number | null;
  kind?: 'NF' | 'BOLETO' | 'RECEIPT' | 'DOCUMENT' | 'PHOTO' | 'EXAM' | 'OTHER' | null;
  uploadedAt: ISODateTime;
  uploadedBy?: string | null;
}

export interface HistoryEvent {
  at: ISODateTime;
  by?: string | null;
  action: string;
  note?: string | null;
  data?: Record<string, unknown> | null;
}

// ============================================================================
// Identidade, usuários e configurações
// ============================================================================

export type Role =
  | 'ADMIN'
  | 'MANAGER'
  | 'FINANCIAL'
  | 'SELLER'
  | 'LOGISTICS'
  | 'OPERATOR'
  | 'EXTERNAL_SELLER';

/** Usuário interno ou vendedor externo. (Clientes do portal ficam em PortalAccount.) */
export interface Profile extends BaseRow {
  /** = id do usuário no Auth (Supabase auth.users.id / Firebase uid). */
  email: string;
  name: string;
  role: Role;
  active: boolean;
  company?: CompanyCode | null;
  phone?: string | null;
  document?: string | null;
  /** Comissão padrão (%) — vendedores e vendedores externos. */
  commissionRate?: number | null;
  lastLoginAt?: ISODateTime | null;
  loginCount?: number | null;
  notes?: string | null;
}

/** Convite: libera um e-mail (inclusive fora do domínio corporativo) com um papel. */
export interface Invite extends BaseRow {
  email: string; // sempre minúsculo
  name: string;
  role: Role;
  commissionRate?: number | null;
  phone?: string | null;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED';
  invitedById?: string | null;
  invitedByName?: string | null;
  acceptedAt?: ISODateTime | null;
  profileId?: string | null;
}

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'LOGIN'
  | 'LOGOUT'
  | 'APPROVE'
  | 'REJECT'
  | 'CANCEL'
  | 'PAYMENT'
  | 'REVERSAL'
  | 'IMPORT'
  | 'EXPORT';

export interface AuditLog extends BaseRow {
  at: ISODateTime;
  userId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  summary: string;
  data?: Record<string, unknown> | null;
}

/** Configurações gerais — linha única com id 'main'. */
export interface AppSettings extends BaseRow {
  companyName: string;
  tradeName?: string | null;
  document?: string | null;
  stateRegistration?: string | null;
  phone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  zipCode?: string | null;
  street?: string | null;
  number?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  logoUrl?: string | null;
  /** Domínios de e-mail com acesso automático (sem convite). */
  corporateDomains: string[];
  /** Minutos sem atividade até sair automaticamente. 0 = desligado. */
  idleTimeoutMinutes: number;
  /** Pix para cobrança (BR Code). */
  pixKey?: string | null;
  pixKeyType?: 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'RANDOM' | null;
  pixMerchantName?: string | null;
  pixMerchantCity?: string | null;
  pixDiscountPercent?: number | null;
  defaultCommissionRate?: number | null;
  /** Conferência de peso (portal). */
  weighingTolerancePercent: number;
  weighingToleranceMaxValue?: number | null;
  weighingAutoApproveHours?: number | null;
  /** Portal: entrega. */
  freeFreightAbove?: number | null;
  pickupEnabled: boolean;
  pickupAddress?: string | null;
  pickupNote?: string | null;
  deliveryCutoffHour: number;
  deliveryBlockedDates: ISODate[];
  weekendPolicy: 'NEXT_WEDNESDAY' | 'NEXT_FRIDAY';
  /** Ranking de clientes (R$ acumulado) — limites de Prata e Ouro. */
  rankingSilverFrom: number;
  rankingGoldFrom: number;
  /** Marca que o primeiro administrador já foi criado. */
  bootstrapped?: boolean | null;
}

export interface Counter extends BaseRow {
  /** ex.: 'sale-2026', 'processing-2026', 'batch-2026' */
  value: number;
}

export interface Task extends BaseRow {
  title: string;
  description?: string | null;
  assigneeId?: string | null;
  assigneeName?: string | null;
  dueDate?: ISODate | null;
  status: 'OPEN' | 'DONE';
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  relatedEntity?: string | null;
  relatedId?: string | null;
  createdById?: string | null;
  createdByName?: string | null;
  doneAt?: ISODateTime | null;
}

// ============================================================================
// Parceiros (fornecedores de gado, frigoríficos, processadores, transportadoras…)
// ============================================================================

export type PartnerKind =
  | 'CATTLE_SUPPLIER'
  | 'SLAUGHTERHOUSE'
  | 'PROCESSOR'
  | 'CARRIER'
  | 'FEED_SUPPLIER'
  | 'SUPPLIER'
  | 'OTHER';

export interface Partner extends BaseRow {
  kind: PartnerKind;
  name: string;
  tradeName?: string | null;
  document?: string | null;
  stateRegistration?: string | null;
  inspection?: 'SIF' | 'SIE' | 'SIM' | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  notes?: string | null;
  active: boolean;
}

// ============================================================================
// Gado: lotes, animais, custos, ração, simulações
// ============================================================================

export type BatchStatus = 'PURCHASED' | 'IN_PASTURE' | 'SLAUGHTERED' | 'FINISHED';
export type ManagementType = 'CAMPO' | 'CONFINAMENTO';

export interface Batch extends BaseRow {
  code: string; // L-2026-001
  name: string;
  description?: string | null;
  managementType: ManagementType;
  status: BatchStatus;
  company?: CompanyCode | null;
  supplierId?: string | null;
  supplierName?: string | null;
  purchaseDate?: ISODate | null;
  purchaseInvoice?: string | null;
  gtaNumber?: string | null;
  headCount: number;
  /** Peso vivo total na compra (kg). */
  purchaseWeightKg?: number | null;
  confinementEntryWeightKg?: number | null;
  estimatedSlaughterDate?: ISODate | null;
  slaughterDate?: ISODate | null;
  slaughterhouseId?: string | null;
  slaughterhouseName?: string | null;
  /** Peso vivo na balança de saída (kg). */
  exitScaleWeightKg?: number | null;
  /** Peso de carcaça total (kg). */
  carcassWeightKg?: number | null;
  carcassYieldPercent?: number | null;
  transportLossPercent?: number | null;
  /** Preço de referência de venda (R$/kg) para projeções. */
  sellingPricePerKg?: number | null;
  /** Receita informada manualmente (substitui a calculada). */
  revenueOverride?: number | null;
  notes?: string | null;
}

export type AnimalStatus = 'ALIVE' | 'SLAUGHTERED' | 'DEAD' | 'SOLD';

export interface Animal extends BaseRow {
  batchId: string;
  tag: string; // brinco — único entre animais vivos
  sex?: 'MALE' | 'FEMALE' | null;
  breed?: string | null;
  entryWeightKg: number;
  purchasePrice: number;
  currentWeightKg?: number | null;
  exitWeightKg?: number | null;
  carcassWeightKg?: number | null;
  status: AnimalStatus;
  notes?: string | null;
}

/** Categorias de custo do lote (substitui o objeto fixo "costs" da v1). */
export type CostCategory =
  // Aquisição
  | 'PURCHASE'
  | 'PURCHASE_COMMISSION'
  | 'PURCHASE_FREIGHT'
  // Operacional (engorda)
  | 'FEED'
  | 'LODGING'
  | 'VACCINE'
  | 'VETERINARY'
  | 'PASTURE'
  | 'LABOR'
  // Abate e desossa
  | 'SLAUGHTER_FREIGHT'
  | 'SLAUGHTER_FEE'
  | 'SLAUGHTER_RETURN_FREIGHT'
  | 'HQ_FREIGHT'
  | 'CUTTING'
  | 'DEBONING'
  | 'DEBONING_RETURN_FREIGHT'
  // Fiscal
  | 'FUNRURAL_PURCHASE'
  | 'FUNRURAL_SALE'
  | 'ICMS_PURCHASE'
  | 'ICMS_SALE'
  | 'SENAR_PURCHASE'
  | 'SENAR_SALE'
  | 'GTA_FEE'
  | 'INSPECTION_FEE'
  | 'ENTRY_PROTOCOL'
  // Comercial
  | 'SALES_COMMISSION'
  // Créditos (reduzem custo)
  | 'SLAUGHTER_RETURN'
  | 'TAX_CREDIT'
  | 'OTHER';

export type CostGroup = 'ACQUISITION' | 'OPERATIONAL' | 'SLAUGHTER' | 'FISCAL' | 'COMMERCIAL' | 'CREDIT' | 'OTHER';

export interface BatchCost extends BaseRow {
  batchId: string;
  category: CostCategory;
  date: ISODate;
  /** Sempre positivo. Categorias de crédito (CREDIT) são subtraídas no resultado. */
  amount: number;
  description?: string | null;
  documentNumber?: string | null;
  partnerId?: string | null;
  partnerName?: string | null;
  source: 'MANUAL' | 'FEED' | 'IMPORT' | 'SLAUGHTER' | 'PROCESSING' | 'MIGRATION';
  sourceId?: string | null;
  /** Conta a pagar gerada a partir deste custo (opcional). */
  financialEntryId?: string | null;
  createdById?: string | null;
  createdByName?: string | null;
}

export interface FeedType extends BaseRow {
  name: string;
  description?: string | null;
  active: boolean;
}

export interface FeedPurchase extends BaseRow {
  feedTypeId: string;
  feedTypeName: string;
  supplierId?: string | null;
  supplierName?: string | null;
  invoiceNumber: string;
  entryDate: ISODate;
  quantityKg: number;
  remainingKg: number;
  totalValue: number;
  /** R$/kg = totalValue / quantityKg */
  unitCost: number;
  /** Lotes que podem consumir esta compra (vazio = qualquer lote). */
  batchIds: string[];
  status: 'AVAILABLE' | 'DEPLETED';
  notes?: string | null;
}

export interface FeedConsumption extends BaseRow {
  feedPurchaseId: string;
  feedTypeName: string;
  batchId: string;
  batchName: string;
  date: ISODate;
  quantityKg: number;
  period: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  cost: number;
  batchCostId?: string | null;
  notes?: string | null;
  createdByName?: string | null;
}

export interface CattleSimulation extends BaseRow {
  name: string;
  /** Parâmetros livres da calculadora (peso de compra, GMD, arroba…). */
  params: Record<string, number | string | null>;
  result?: Record<string, number | string | null> | null;
  createdById?: string | null;
  createdByName?: string | null;
}

// ============================================================================
// Produtos e estoque (carne)
// ============================================================================

export type MeatType = 'GRILL' | 'PROCESSED' | 'RAW' | 'OTHER';

export interface Product extends BaseRow {
  name: string;
  code?: string | null;
  category: string; // Traseiro, Dianteiro, Miúdos, Processados, Carcaça…
  meatType: MeatType;
  unit: 'KG' | 'UN';
  /** Estoque mínimo (kg ou un) para alerta. */
  minStock?: number | null;
  defaultPrice?: number | null;
  shelfLifeDays?: number | null;
  imageUrl?: string | null;
  description?: string | null;
  active: boolean;
}

/** RAW = pós-abate (carcaça/quartos, aguardando desossa). FINISHED = estoque de venda. */
export type StockStage = 'RAW' | 'FINISHED';
export type StockOrigin = 'PROPRIO' | 'INTERCOMPANY';

export interface StockLot extends BaseRow {
  productId: string;
  productName: string;
  stage: StockStage;
  /** Lote de gado de origem (rastreabilidade). */
  batchId?: string | null;
  batchCode?: string | null;
  processingOrderId?: string | null;
  lotCode?: string | null;
  origin: StockOrigin;
  originCompany?: CompanyCode | null;
  originInvoice?: string | null;
  entryDate: ISODate;
  expiryDate?: ISODate | null;
  initialQty: number;
  balanceQty: number;
  unit: 'KG' | 'UN';
  /** Custo por kg/un. */
  unitCost: number;
  status: 'AVAILABLE' | 'DEPLETED' | 'BLOCKED';
  location?: string | null;
  notes?: string | null;
}

export type MovementType =
  | 'ENTRY'
  | 'SLAUGHTER_ENTRY'
  | 'PROCESSING_OUT'
  | 'PROCESSING_IN'
  | 'SALE'
  | 'SALE_REVERSAL'
  | 'LOSS'
  | 'ADJUSTMENT';

export interface StockMovement extends BaseRow {
  lotId: string;
  productId: string;
  productName: string;
  stage: StockStage;
  type: MovementType;
  /** Positivo = entrada, negativo = saída. */
  qty: number;
  unitCost: number;
  /** Preço de venda unitário (movimentos SALE) — permite apurar receita por lote de gado. */
  unitPrice?: number | null;
  /** Lote de gado de origem (copiado do StockLot). */
  batchId?: string | null;
  date: ISODate;
  saleId?: string | null;
  saleItemId?: string | null;
  saleNumber?: string | null;
  customerName?: string | null;
  processingOrderId?: string | null;
  lossId?: string | null;
  reason?: string | null;
  userId?: string | null;
  userName?: string | null;
}

export type LossOrigin = 'PROCESSAMENTO' | 'ESTOQUE' | 'TRANSPORTE' | 'ABATE';
export type LossReason =
  | 'OSSO'
  | 'SEBO_GORDURA'
  | 'APARA'
  | 'EVAPORACAO'
  | 'DESCARTE'
  | 'AVARIA'
  | 'VALIDADE_VENCIDA'
  | 'DIVERGENCIA_PESAGEM'
  | 'OUTRO';

export interface StockLoss extends BaseRow {
  date: ISODate;
  origin: LossOrigin;
  reason: LossReason;
  qty: number;
  unitCost?: number | null;
  totalValue?: number | null;
  productId?: string | null;
  productName?: string | null;
  batchId?: string | null;
  lotId?: string | null;
  processingOrderId?: string | null;
  processingOrderNumber?: string | null;
  partnerId?: string | null;
  partnerName?: string | null;
  notes?: string | null;
  registeredBy?: string | null;
}

// ============================================================================
// Abate e processamento (desossa)
// ============================================================================

export interface ProcessingSentItem {
  lotId?: string | null;
  productId: string;
  productName: string;
  qty: number;
  unitCost: number;
}

export interface ProcessingReturnedItem {
  productId: string;
  productName: string;
  qty: number;
  unitCost: number;
  expiryDate?: ISODate | null;
  lotId?: string | null;
}

export interface ProcessingLossBreakdown {
  bonesKg?: number | null;
  fatKg?: number | null;
  trimmingKg?: number | null;
  evaporationKg?: number | null;
  otherKg?: number | null;
}

export interface ProcessingReturnEvent {
  id: string;
  date: ISODate;
  type: 'PARTIAL' | 'TOTAL';
  invoiceNumber?: string | null;
  returnedKg: number;
  items: ProcessingReturnedItem[];
  losses: ProcessingLossBreakdown;
  unclassifiedKg: number;
  notes?: string | null;
  registeredBy?: string | null;
  registeredAt: ISODateTime;
}

export interface ProcessingOrder extends BaseRow {
  number: string; // OS-2026-001
  batchId?: string | null;
  batchCode?: string | null;
  partnerId: string;
  partnerName: string;
  sentDate: ISODate;
  expectedReturnDate?: ISODate | null;
  status: 'OPEN' | 'PARTIAL' | 'COMPLETED' | 'CANCELLED';
  driverName?: string | null;
  vehiclePlate?: string | null;
  driverPhone?: string | null;
  dispatchDocument?: string | null;
  freightCost?: number | null;
  processingCost?: number | null;
  sentKg: number;
  returnedKg: number;
  lossKg: number;
  yieldPercent?: number | null;
  sentItems: ProcessingSentItem[];
  returns: ProcessingReturnEvent[];
  notes?: string | null;
  createdByName?: string | null;
}

// ============================================================================
// Clientes, tabelas de preço, vendedores externos
// ============================================================================

export type CustomerCategory = 'INTERNO_PF' | 'EXTERNO_PF' | 'EXTERNO_CNPJ';
export type Ranking = 'BRONZE' | 'SILVER' | 'GOLD';
export type PaymentMethod =
  | 'PIX'
  | 'BOLETO'
  | 'TRANSFER'
  | 'CARD'
  | 'CASH'
  | 'CREDIT'
  | 'BONUS'
  | 'SAMPLE';

export interface Customer extends BaseRow {
  code?: string | null;
  name: string;
  tradeName?: string | null;
  personType: 'F' | 'J';
  document: string;
  stateRegistration?: string | null;
  municipalRegistration?: string | null;
  category: CustomerCategory;
  segment?: string | null;
  zipCode?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  cellphone?: string | null;
  email?: string | null;
  financialEmail?: string | null;
  contactName?: string | null;
  paymentTerms?: string | null;
  creditLimit: number;
  preferredPaymentMethod?: PaymentMethod | null;
  allowedPaymentMethods: PaymentMethod[];
  financialApproval: 'PENDING' | 'APPROVED' | 'REJECTED';
  financialApprovalNotes?: string | null;
  financialApprovedBy?: string | null;
  financialApprovedAt?: ISODateTime | null;
  sellerId?: string | null;
  sellerName?: string | null;
  priceTableId?: string | null;
  isIntercompany: boolean;
  intercompanyCode?: CompanyCode | null;
  status: 'ACTIVE' | 'BLOCKED';
  ranking: Ranking;
  /** 0 a 5 estrelas. */
  stars: number;
  totalPurchases: number;
  ordersCount: number;
  lastPurchaseAt?: ISODateTime | null;
  documents: Attachment[];
  notes?: string | null;
}

/** Pedido de cadastro de cliente feito por vendedor externo. */
export interface CustomerRequest extends BaseRow {
  name: string;
  tradeName?: string | null;
  personType: 'F' | 'J';
  document: string;
  category: CustomerCategory;
  stateRegistration?: string | null;
  contactName?: string | null;
  phone?: string | null;
  cellphone?: string | null;
  email?: string | null;
  zipCode?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  notes?: string | null;
  /** PENDING → APPROVED (financeiro liberou) | BLOCKED (financeiro bloqueou) | REJECTED (recusada). */
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'BLOCKED';
  rejectionReason?: string | null;
  blockReason?: string | null;
  createdCustomerId?: string | null;
  /** Sugestões do vendedor para a análise de crédito. */
  suggestedCreditLimit?: number | null;
  suggestedPaymentTerms?: string | null;
  requestedById: string;
  requestedByName: string;
  requestedByEmail?: string | null;
  reviewedByName?: string | null;
  reviewedByRole?: string | null;
  reviewedAt?: ISODateTime | null;
  /** Condições liberadas pelo financeiro (gravadas no cliente na aprovação). */
  financialApproval?: CustomerRequestApproval | null;
}

export interface CustomerRequestApproval {
  creditLimit: number;
  paymentTerms?: string | null;
  paymentMethod?: PaymentMethod | null;
  approvedAt: ISODateTime;
  approvedByName: string;
  notes?: string | null;
}

export interface PriceTableItem {
  productId: string;
  productName: string;
  unit: 'KG' | 'UN';
  price: number;
}

export interface PriceTable extends BaseRow {
  name: string;
  kind: 'GRILL' | 'GENERAL' | 'PORTAL' | 'INTERCOMPANY';
  status: 'ACTIVE' | 'INACTIVE';
  approvalStatus: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';
  validFrom?: ISODate | null;
  validTo?: ISODate | null;
  items: PriceTableItem[];
  notes?: string | null;
  approvedById?: string | null;
  approvedByName?: string | null;
  approvedAt?: ISODateTime | null;
}

// ============================================================================
// Vendas / pedidos
// ============================================================================

export type SaleChannel = 'INTERNAL' | 'EXTERNAL_SELLER' | 'PORTAL' | 'INTERCOMPANY';

/**
 * Ciclo de vida único do pedido.
 *  DRAFT → PENDING_APPROVAL → APPROVED → PICKING → (AWAITING_CUSTOMER) → READY → DISPATCHED → DELIVERED
 *  A baixa de estoque acontece UMA vez, ao concluir a separação (READY).
 *  Venda direta (balcão) pode ir direto para READY com baixa imediata.
 */
export type SaleStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'PICKING'
  | 'AWAITING_CUSTOMER'
  | 'READY'
  | 'DISPATCHED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REJECTED';

export type SalePaymentStatus = 'PENDING' | 'RECEIPT_SENT' | 'PARTIAL' | 'PAID' | 'CANCELLED';

/** Tipo de faturamento (antigo "saleType"). */
export type BillingType = 'NF_BOLETO' | 'NF_ONLY' | 'BOLETO_ONLY' | 'NONE';

export type SaleItemKind = 'PRODUCT' | 'SUPPLY' | 'FREIGHT' | 'SERVICE';

export interface SaleItem extends BaseRow {
  saleId: string;
  position: number;
  kind: SaleItemKind;
  productId?: string | null;
  supplyItemId?: string | null;
  productName: string;
  unit: 'KG' | 'UN';
  /** Quantidade pedida (estimada). */
  qtyOrdered: number;
  /** Quantidade final (pesada/separada). Enquanto não separado = qtyOrdered. */
  qty: number;
  unitPrice: number;
  total: number;
  /** Lote preferencial (quando o vendedor escolhe a peça). */
  lotId?: string | null;
  lotCode?: string | null;
  packages?: number | null;
  /** Custo apurado na baixa (R$) — para margem. */
  costTotal?: number | null;
  /** Quantidade efetivamente baixada do estoque. */
  deductedQty?: number | null;
  notes?: string | null;
}

export interface WeighingOutcome {
  estimatedTotal: number;
  finalTotal: number;
  diffValue: number;
  diffPercent: number;
  needsCustomerApproval: boolean;
  decidedAt?: ISODateTime | null;
  decision?: 'AUTO' | 'ACCEPTED' | 'REJECTED' | null;
}

export interface Sale extends BaseRow {
  number: string; // 20260001
  sequence: number;
  channel: SaleChannel;
  status: SaleStatus;
  paymentStatus: SalePaymentStatus;
  customerId: string;
  customerName: string;
  customerDocument?: string | null;
  customerCategory?: CustomerCategory | null;
  sellerId?: string | null;
  sellerName?: string | null;
  commissionRate: number;
  commissionValue: number;
  portalAccountId?: string | null;
  priceTableId?: string | null;
  date: ISODate;
  deliveryDate?: ISODate | null;
  deliveryMode: 'DELIVERY' | 'PICKUP';
  deliveryWindow?: 'A' | 'B' | null;
  shippingZipCode?: string | null;
  shippingAddress?: string | null;
  freightZoneId?: string | null;
  freightValue: number;
  freightPending?: boolean | null;
  paymentMethod: PaymentMethod;
  billingType: BillingType;
  /** Ex.: "28/35/42" dias. */
  paymentTerms?: string | null;
  installmentsCount: number;
  /** Vencimento da 1ª parcela (quando não se usa prazos em dias). */
  firstDueDate?: ISODate | null;
  itemsSubtotal: number;
  discountValue: number;
  totalValue: number;
  totalWeightKg: number;
  /** Total estimado no momento do pedido (antes da pesagem). */
  estimatedTotal?: number | null;
  pixPayload?: string | null;
  pixTxid?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: ISODate | null;
  boletoNumber?: string | null;
  attachments: Attachment[];
  paymentReceipt?: Attachment | null;
  stockDeducted: boolean;
  /** Quantidade (kg) que não encontrou estoque na baixa. */
  stockShortKg?: number | null;
  weighing?: WeighingOutcome | null;
  isIntercompany: boolean;
  company?: CompanyCode | null;
  approvedById?: string | null;
  approvedByName?: string | null;
  approvedAt?: ISODateTime | null;
  pickedByName?: string | null;
  pickedAt?: ISODateTime | null;
  dispatchedAt?: ISODateTime | null;
  deliveredAt?: ISODateTime | null;
  cancelledAt?: ISODateTime | null;
  cancelReason?: string | null;
  customerNotes?: string | null;
  notes?: string | null;
  history: HistoryEvent[];
  createdById?: string | null;
  createdByName?: string | null;
  /** Itens (em PostgreSQL vêm da tabela sale_items; no Firestore ficam no documento). */
  items: SaleItem[];
}

/** Arquivo morto de pedidos excluídos. */
export interface DeletedSale extends BaseRow {
  saleId: string;
  number?: string | null;
  customerName?: string | null;
  totalValue: number;
  reason?: string | null;
  deletedById?: string | null;
  deletedByName?: string | null;
  deletedAt: ISODateTime;
  snapshot: Record<string, unknown>;
}

// ============================================================================
// Financeiro (contas a receber e a pagar)
// ============================================================================

export type EntryCategory =
  | 'SALE'
  | 'EQUINE_SALE'
  | 'SEMEN'
  | 'CATTLE_PURCHASE'
  | 'FEED'
  | 'FREIGHT'
  | 'TAX'
  | 'PAYROLL'
  | 'SERVICES'
  | 'SUPPLIES'
  | 'EQUINE_EXPENSE'
  | 'OTHER';

export interface EntryPayment {
  id: string;
  amount: number;
  date: ISODate;
  method?: PaymentMethod | null;
  byName?: string | null;
  at: ISODateTime;
  reversed?: boolean | null;
  reversedAt?: ISODateTime | null;
  reversedBy?: string | null;
  reverseReason?: string | null;
  notes?: string | null;
}

export interface FinancialEntry extends BaseRow {
  direction: 'IN' | 'OUT';
  category: EntryCategory;
  description: string;
  partyType: 'CUSTOMER' | 'PARTNER' | 'OTHER';
  partyId?: string | null;
  partyName: string;
  saleId?: string | null;
  saleNumber?: string | null;
  equineSaleId?: string | null;
  semenPurchaseId?: string | null;
  batchId?: string | null;
  /** Custo de lote que originou esta conta a pagar. */
  batchCostId?: string | null;
  installment: number;
  installments: number;
  issueDate: ISODate;
  dueDate: ISODate;
  amount: number;
  paidAmount: number;
  /** OPEN (em aberto — vencido é calculado pela data), PAID, CANCELLED. */
  status: 'OPEN' | 'PAID' | 'CANCELLED';
  method?: PaymentMethod | null;
  documentNumber?: string | null;
  barcode?: string | null;
  paidAt?: ISODate | null;
  payments: EntryPayment[];
  company?: CompanyCode | null;
  sellerId?: string | null;
  notes?: string | null;
}

// ============================================================================
// Materiais (embalagens, etiquetas…)
// ============================================================================

export interface SupplyItem extends BaseRow {
  name: string;
  sku?: string | null;
  category: 'EMBALAGEM' | 'ETIQUETA' | 'LIMPEZA' | 'ESCRITORIO' | 'OUTRO';
  unit: 'UN' | 'CX' | 'PCT' | 'KG' | 'L';
  quantity: number;
  minQuantity?: number | null;
  unitCost?: number | null;
  salePrice?: number | null;
  supplier?: string | null;
  /** Item vendável no pedido (ex.: sacola personalizada). */
  sellable: boolean;
  active: boolean;
  notes?: string | null;
}

export interface SupplyMovement extends BaseRow {
  supplyItemId: string;
  supplyItemName: string;
  type: 'IN' | 'OUT' | 'ADJUST';
  /** IN/OUT: quantidade positiva; ADJUST: novo saldo. */
  quantity: number;
  balanceAfter: number;
  unitCost?: number | null;
  totalValue?: number | null;
  date: ISODate;
  reason?: string | null;
  saleId?: string | null;
  saleNumber?: string | null;
  invoiceNumber?: string | null;
  supplier?: string | null;
  notes?: string | null;
  userName?: string | null;
}

// ============================================================================
// Portal do cliente
// ============================================================================

export interface PortalAccount extends BaseRow {
  /** = id do usuário no Auth. */
  email: string;
  name: string;
  phone?: string | null;
  companyName?: string | null;
  personType?: 'F' | 'J' | null;
  document?: string | null;
  zipCode?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'BLOCKED';
  customerId?: string | null;
  rejectionReason?: string | null;
  approvedByName?: string | null;
  approvedAt?: ISODateTime | null;
  lastLoginAt?: ISODateTime | null;
}

/**
 * Convite do portal (id = e-mail em minúsculas): a equipe libera o acesso antes
 * do cadastro. No primeiro login com este e-mail a conta já nasce APROVADA e
 * ligada ao cliente.
 */
export interface PortalInvite extends BaseRow {
  email: string;
  customerId: string;
  customerName: string;
  name: string;
  phone?: string | null;
  document?: string | null;
  priceTableId?: string | null;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED';
  invitedByName?: string | null;
  acceptedAt?: ISODateTime | null;
  accountId?: string | null;
}

export interface CatalogItem extends BaseRow {
  productId?: string | null;
  supplyItemId?: string | null;
  name: string;
  description?: string | null;
  category: string;
  unit: 'KG' | 'UN';
  price: number;
  /** Pedido mínimo e incremento (ex.: 0,5 kg). */
  minQty: number;
  step: number;
  imageUrl?: string | null;
  available: boolean;
  featured: boolean;
  sortOrder: number;
}

export interface FreightZone extends BaseRow {
  label: string;
  /** Prefixos de CEP, só dígitos. O mais específico vence. */
  cepPrefixes: string[];
  price: number;
  minOrderValue: number;
  etaNote?: string | null;
  active: boolean;
}

export interface PublicCatalogItem {
  name: string;
  category: string;
  unit: 'KG' | 'UN';
  price?: number | null;
  imageUrl?: string | null;
  description?: string | null;
}

/** Link público de catálogo (somente leitura, sem login). */
export interface PublicCatalogLink extends BaseRow {
  token: string;
  title: string;
  message?: string | null;
  showPrices: boolean;
  expiresAt?: ISODate | null;
  active: boolean;
  views: number;
  /** Cópia congelada dos itens no momento da publicação. */
  items: PublicCatalogItem[];
  whatsapp?: string | null;
  createdByName?: string | null;
}

// ============================================================================
// Equinos
// ============================================================================

export type EquineSex = 'GARANHAO' | 'EGUA' | 'CASTRADO';
export type EquineStatus = 'ACTIVE' | 'TRAINING' | 'PREGNANT' | 'SOLD' | 'DECEASED';

export interface Equine extends BaseRow {
  name: string;
  sex: EquineSex;
  birthDate?: ISODate | null;
  breed: string;
  coat?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  idealWeightKg?: number | null;
  markings?: string | null;
  chipId?: string | null;
  registry?: string | null; // ABQM / ABCCC…
  secondaryRegistry?: string | null; // CBT etc.
  status: EquineStatus;
  photos: Attachment[];
  // Genealogia
  sireName?: string | null;
  sireRegistry?: string | null;
  damName?: string | null;
  damRegistry?: string | null;
  paternalGrandsire?: string | null;
  paternalGranddam?: string | null;
  maternalGrandsire?: string | null;
  maternalGranddam?: string | null;
  geneticNotes?: string | null;
  // Reprodução
  reproStatus?: 'ATIVO' | 'INATIVO' | 'GESTANTE' | 'EM_DESCANSO' | null;
  coverDate?: ISODate | null;
  coverStallion?: string | null;
  pregnancyDiagnosisDate?: ISODate | null;
  expectedFoalingDate?: ISODate | null;
  pregnancyNotes?: string | null;
  fertilityRating?: string | null;
  // Localização
  haras?: string | null;
  paddock?: string | null;
  manager?: string | null;
  gps?: string | null;
  locationAddress?: string | null;
  // Documentação
  pedigreeNotes?: string | null;
  healthCertificates?: string | null;
  geneticTest?: string | null;
  purchaseValue?: number | null;
  estimatedValue?: number | null;
  notes?: string | null;
}

export type EquineEventType =
  | 'HEALTH'
  | 'TRAINING'
  | 'FARRIER'
  | 'TRANSPORT'
  | 'STAY'
  | 'COMPETITION'
  | 'SEMEN_COLLECTION'
  | 'EXPENSE'
  | 'REVENUE';

/**
 * Linha do tempo do animal. Campos específicos de cada tipo ficam em `data`
 * (ver EQUINE_EVENT_FIELDS em labels.ts):
 *  HEALTH:      { kind: 'VACINA'|'VERMIFUGO'|'ULTRASSOM'|'MEDICAMENTO'|'EXAME'|'OUTRO', dosage, result, veterinarian }
 *  TRAINING:    { modality, durationMinutes, score (1-10), trainer, videoUrl }
 *  FARRIER:     { farrier, hoofCondition, procedures, nextDate }
 *  TRANSPORT:   { origin, destination, vehicle, event }
 *  STAY:        { location, address, paddock, checkIn, checkOut }
 *  COMPETITION: { event, location, modality, rider, placement, score, prize }
 *  SEMEN_COLLECTION: { method, volumeMl, concentration, motility, vigor, dosesProduced, dosesAvailable, canister, expiryDate, veterinarian, destinationMares }
 *  EXPENSE / REVENUE: { category }
 */
export interface EquineEvent extends BaseRow {
  equineId: string;
  equineName: string;
  type: EquineEventType;
  date: ISODate;
  title: string;
  /** Custo (despesa) ou valor (receita/prêmio). */
  amount?: number | null;
  data: Record<string, unknown>;
  alertDate?: ISODate | null;
  attachments: Attachment[];
  notes?: string | null;
  createdByName?: string | null;
}

export interface EquineSale extends BaseRow {
  equineId: string;
  equineName: string;
  buyerName: string;
  buyerDocument?: string | null;
  buyerPhone?: string | null;
  buyerEmail?: string | null;
  buyerAddress?: string | null;
  date: ISODate;
  totalPrice: number;
  installmentsCount: number;
  status: 'ACTIVE' | 'CANCELLED';
  notes?: string | null;
}

export interface SemenPurchase extends BaseRow {
  stallionName: string;
  stallionBreed?: string | null;
  stallionRegistry?: string | null;
  ownerHaras?: string | null;
  supplierName: string;
  supplierDocument?: string | null;
  supplierContact?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: ISODate | null;
  lotCode?: string | null;
  purchaseDate: ISODate;
  dosesQuantity: number;
  dosesAvailable: number;
  dosePrice?: number | null;
  totalValue: number;
  storageType: 'CONGELADO' | 'REFRIGERADO' | 'FRESCO';
  canister?: string | null;
  expiryDate?: ISODate | null;
  installmentsCount: number;
  paymentMethod?: PaymentMethod | null;
  intendedMares?: string | null;
  veterinarian?: string | null;
  status: 'ACTIVE' | 'DEPLETED' | 'EXPIRED' | 'CANCELLED';
  usage: { date: ISODate; doses: number; mareName?: string | null; notes?: string | null }[];
  notes?: string | null;
}
