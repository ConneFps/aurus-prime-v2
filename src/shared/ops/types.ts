/**
 * CONTRATO DAS OPERAÇÕES DE NEGÓCIO
 * ---------------------------------------------------------------------------
 * Tudo que mexe em mais de um registro (estoque, financeiro, numeração,
 * status de pedido…) passa por aqui, dentro de uma transação atômica
 * (data.runTransaction). As telas NUNCA fazem essas contas sozinhas.
 *
 * CRUD simples (cadastro de parceiro, produto, tipo de ração…) pode usar
 * data.insert/update/remove diretamente — de preferência via useCrud().
 *
 * Toda operação:
 *  - valida a entrada e lança Error com mensagem em português se inválida;
 *  - grava um registro de auditoria (audit_logs) na mesma transação;
 *  - retorna o que a tela precisa (id, registro, resumo).
 */
import type { DataApi } from '../data/api';
import type {
  Attachment,
  BatchCost,
  BillingType,
  CompanyCode,
  CostCategory,
  Customer,
  EntryCategory,
  FinancialEntry,
  ISODate,
  LossOrigin,
  LossReason,
  ManagementType,
  PaymentMethod,
  ProcessingLossBreakdown,
  PublicCatalogLink,
  Role,
  Sale,
  SaleChannel,
  SaleItemKind,
  StockOrigin,
  StockStage,
} from '../domain/types';

export interface Actor {
  id: string;
  name: string;
  email: string;
  /** 'CUSTOMER' = cliente logado no portal. */
  role: Role | 'CUSTOMER';
}

export interface OpsContext {
  data: DataApi;
  actor: Actor;
}

// ============================================================================
// Vendas
// ============================================================================

export interface SaleItemInput {
  /** Informe ao editar um item existente. */
  id?: string;
  kind: SaleItemKind;
  productId?: string | null;
  supplyItemId?: string | null;
  productName: string;
  unit: 'KG' | 'UN';
  qtyOrdered: number;
  /** Quantidade final, se já conhecida (venda direta). Padrão = qtyOrdered. */
  qty?: number;
  unitPrice: number;
  lotId?: string | null;
  lotCode?: string | null;
  packages?: number | null;
  notes?: string | null;
}

export interface SaleInput {
  channel: SaleChannel;
  customerId: string;
  sellerId?: string | null;
  /** % de comissão. Padrão: do vendedor (profile.commissionRate) ou das configurações. */
  commissionRate?: number | null;
  priceTableId?: string | null;
  date: ISODate;
  deliveryDate?: ISODate | null;
  deliveryMode: 'DELIVERY' | 'PICKUP';
  deliveryWindow?: 'A' | 'B' | null;
  shippingZipCode?: string | null;
  shippingAddress?: string | null;
  freightZoneId?: string | null;
  freightValue?: number;
  freightPending?: boolean;
  paymentMethod: PaymentMethod;
  billingType: BillingType;
  /** Prazos em dias separados por "/" (ex.: "28/35/42"). Define parcelas e vencimentos. */
  paymentTerms?: string | null;
  /** Alternativa aos prazos: nº de parcelas mensais a partir de firstDueDate. */
  installmentsCount?: number;
  firstDueDate?: ISODate | null;
  discountValue?: number;
  isIntercompany?: boolean;
  company?: CompanyCode | null;
  invoiceNumber?: string | null;
  boletoNumber?: string | null;
  customerNotes?: string | null;
  notes?: string | null;
  items: SaleItemInput[];
  /** Status inicial. Padrão: APPROVED se o usuário pode aprovar, senão PENDING_APPROVAL. */
  status?: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED';
  /** Venda direta (balcão): baixa o estoque agora e o pedido já nasce READY. */
  deductNow?: boolean;
  portalAccountId?: string | null;
}

export interface CustomerReleaseInput {
  creditLimit: number;
  paymentTerms?: string | null;
  paymentMethod?: PaymentMethod | null;
  notes?: string | null;
}

export interface PickingInput {
  /** Quantidade real separada/pesada de cada item. */
  items: { itemId: string; qty: number; lotId?: string | null; packages?: number | null }[];
  /** Itens incluídos na separação (ex.: sacola, frete). */
  addItems?: SaleItemInput[];
  removeItemIds?: string[];
  notes?: string | null;
}

export interface StockAllocationResult {
  /** kg (ou un) que não encontraram saldo. */
  shortQty: number;
  shortItems: { productName: string; requested: number; allocated: number }[];
  needsCustomerApproval: boolean;
  totalValue: number;
}

export interface InstallmentPlan {
  /** Prazos em dias (ex.: "28/35/42"). Tem prioridade sobre installments. */
  terms?: string | null;
  installments?: number;
  firstDueDate?: ISODate | null;
  /** Intervalo em dias entre parcelas quando usando installments. Padrão 30. */
  intervalDays?: number;
  method?: PaymentMethod | null;
}

// ============================================================================
// Financeiro
// ============================================================================

export interface EntriesInput {
  direction: 'IN' | 'OUT';
  category: EntryCategory;
  description: string;
  partyType: 'CUSTOMER' | 'PARTNER' | 'OTHER';
  partyId?: string | null;
  partyName: string;
  /** Valor TOTAL (dividido nas parcelas; a última absorve centavos). */
  amount: number;
  issueDate?: ISODate;
  plan: InstallmentPlan;
  documentNumber?: string | null;
  notes?: string | null;
  saleId?: string | null;
  batchId?: string | null;
  company?: CompanyCode | null;
}

export interface PaymentInput {
  /** Padrão: saldo restante da parcela. */
  amount?: number;
  date: ISODate;
  method?: PaymentMethod | null;
  notes?: string | null;
}

// ============================================================================
// Estoque
// ============================================================================

export interface StockEntryInput {
  productId: string;
  stage?: StockStage; // padrão FINISHED
  qty: number;
  unitCost: number;
  entryDate: ISODate;
  expiryDate?: ISODate | null;
  batchId?: string | null;
  lotCode?: string | null;
  origin?: StockOrigin; // padrão PROPRIO
  originCompany?: CompanyCode | null;
  originInvoice?: string | null;
  location?: string | null;
  notes?: string | null;
}

export interface LossInput {
  /** Lote específico. Sem lotId, baixa FIFO do produto (productId obrigatório). */
  lotId?: string | null;
  productId?: string | null;
  stage?: StockStage;
  qty: number;
  origin: LossOrigin;
  reason: LossReason;
  date: ISODate;
  notes?: string | null;
}

// ============================================================================
// Gado
// ============================================================================

export interface AnimalInput {
  tag: string;
  sex?: 'MALE' | 'FEMALE' | null;
  breed?: string | null;
  entryWeightKg: number;
  purchasePrice: number;
  notes?: string | null;
}

export interface BatchInput {
  code?: string; // gerado se vazio (L-AAAA-NNN)
  name: string;
  description?: string | null;
  managementType: ManagementType;
  company?: CompanyCode | null;
  supplierId?: string | null;
  purchaseDate: ISODate;
  purchaseInvoice?: string | null;
  gtaNumber?: string | null;
  estimatedSlaughterDate?: ISODate | null;
  confinementEntryWeightKg?: number | null;
  sellingPricePerKg?: number | null;
  notes?: string | null;
  /** Se não houver animais individuais, informe cabeças e peso total. */
  headCount?: number;
  purchaseWeightKg?: number | null;
  animals: AnimalInput[];
  /** Lança o custo de compra (padrão: soma dos animais). */
  purchaseCost?: { amount?: number; documentNumber?: string | null; createPayable?: InstallmentPlan | null } | null;
}

export interface BatchCostInput {
  batchId: string;
  category: CostCategory;
  date: ISODate;
  amount: number;
  description?: string | null;
  documentNumber?: string | null;
  partnerId?: string | null;
  /** Gera conta a pagar junto. */
  createPayable?: InstallmentPlan | null;
}

export interface FeedPurchaseInput {
  feedTypeId: string;
  supplierId?: string | null;
  invoiceNumber: string;
  entryDate: ISODate;
  quantityKg: number;
  totalValue: number;
  batchIds?: string[];
  notes?: string | null;
  createPayable?: InstallmentPlan | null;
}

export interface FeedConsumptionInput {
  feedPurchaseId: string;
  batchId: string;
  date: ISODate;
  quantityKg: number;
  period: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  notes?: string | null;
}

export interface SlaughterInput {
  batchId: string;
  date: ISODate;
  slaughterhouseId: string;
  gtaNumber?: string | null;
  exitScaleWeightKg?: number | null;
  transportLossPercent?: number | null;
  /** Peso de carcaça total (kg). */
  carcassWeightKg: number;
  /** Pesos por animal (opcional). Animais não listados também são marcados como abatidos. */
  animals?: { animalId: string; exitWeightKg?: number | null; carcassWeightKg?: number | null }[];
  /** Custos do abate lançados no lote. */
  costs?: { category: CostCategory; amount: number; documentNumber?: string | null }[];
  /**
   * Entradas no estoque pós-abate (RAW). Ex.: [{ productId: 'Carcaça', qty: 5230 }]
   * ou quartos (dianteiro/traseiro). unitCost padrão = custo total do lote / kg de carcaça.
   */
  rawOutputs: { productId: string; qty: number; unitCost?: number | null; lotCode?: string | null }[];
  notes?: string | null;
}

// ============================================================================
// Processamento (desossa)
// ============================================================================

export interface ProcessingOrderInput {
  partnerId: string;
  batchId?: string | null;
  sentDate: ISODate;
  expectedReturnDate?: ISODate | null;
  /** Lotes RAW (ou FINISHED) enviados. */
  items: { lotId: string; qty: number }[];
  driverName?: string | null;
  vehiclePlate?: string | null;
  driverPhone?: string | null;
  dispatchDocument?: string | null;
  freightCost?: number | null;
  processingCost?: number | null;
  notes?: string | null;
}

export interface ProcessingReturnInput {
  date: ISODate;
  type: 'PARTIAL' | 'TOTAL';
  invoiceNumber?: string | null;
  /** Cortes que voltaram (viram estoque de venda FINISHED). unitCost padrão = rateio do custo enviado. */
  items: { productId: string; qty: number; expiryDate?: ISODate | null; unitCost?: number | null; lotCode?: string | null }[];
  losses: ProcessingLossBreakdown;
  notes?: string | null;
}

// ============================================================================
// Materiais
// ============================================================================

export interface SupplyMovementInput {
  supplyItemId: string;
  type: 'IN' | 'OUT' | 'ADJUST';
  /** IN/OUT: quantidade; ADJUST: novo saldo. */
  quantity: number;
  unitCost?: number | null;
  date: ISODate;
  reason?: string | null;
  invoiceNumber?: string | null;
  supplier?: string | null;
  saleId?: string | null;
  notes?: string | null;
}

// ============================================================================
// Portal
// ============================================================================

export interface PortalOrderInput {
  items: { catalogItemId: string; qty: number }[];
  deliveryMode: 'DELIVERY' | 'PICKUP';
  zipCode?: string | null;
  address?: string | null;
  notes?: string | null;
}

export interface PortalInviteInput {
  email: string;
  customerId: string;
  name?: string | null;
  phone?: string | null;
}

export interface PublicLinkInput {
  title: string;
  message?: string | null;
  showPrices: boolean;
  expiresAt?: ISODate | null;
  /** Itens do catálogo a publicar. Vazio = todos os disponíveis. */
  catalogItemIds?: string[];
  whatsapp?: string | null;
}

// ============================================================================
// Equinos
// ============================================================================

export interface EquineSaleInput {
  equineId: string;
  buyerName: string;
  buyerDocument?: string | null;
  buyerPhone?: string | null;
  buyerEmail?: string | null;
  buyerAddress?: string | null;
  date: ISODate;
  totalPrice: number;
  plan: InstallmentPlan;
  notes?: string | null;
}

export interface SemenPurchaseInput {
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
  dosePrice?: number | null;
  totalValue: number;
  storageType: 'CONGELADO' | 'REFRIGERADO' | 'FRESCO';
  canister?: string | null;
  expiryDate?: ISODate | null;
  intendedMares?: string | null;
  veterinarian?: string | null;
  notes?: string | null;
  plan: InstallmentPlan;
}

// ============================================================================
// Interface completa
// ============================================================================

export interface Ops {
  // --- Vendas / pedidos -----------------------------------------------------
  createSale(input: SaleInput): Promise<Sale>;
  /** Só enquanto não houve baixa de estoque (DRAFT, PENDING_APPROVAL, APPROVED, PICKING). */
  updateSale(id: string, input: SaleInput): Promise<Sale>;
  submitSale(id: string): Promise<void>; // DRAFT → PENDING_APPROVAL
  approveSale(id: string, note?: string | null): Promise<void>; // → APPROVED (gera contas a receber)
  rejectSale(id: string, reason: string): Promise<void>; // → REJECTED
  startPicking(id: string): Promise<void>; // APPROVED → PICKING
  /** Conclui a separação: grava pesos reais, baixa estoque (FIFO), recalcula totais e parcelas. */
  finalizePicking(id: string, input: PickingInput): Promise<StockAllocationResult>;
  /** Cliente do portal aceita/recusa a diferença de peso. Recusa = cancela e estorna estoque. */
  respondWeighing(id: string, accept: boolean): Promise<void>;
  dispatchSale(id: string): Promise<void>; // READY → DISPATCHED
  deliverSale(id: string): Promise<void>; // DISPATCHED/READY → DELIVERED
  /** Cancela: estorna estoque (se baixado) e cancela parcelas em aberto. */
  cancelSale(id: string, reason: string): Promise<void>;
  /** Exclui: cancela + arquiva em deleted_sales + remove. */
  deleteSale(id: string, reason: string): Promise<void>;
  /** Recria as parcelas (contas a receber) em aberto da venda. */
  regenerateReceivables(saleId: string, plan: InstallmentPlan): Promise<void>;
  attachSaleFile(
    saleId: string,
    att: Attachment,
    fields?: { invoiceNumber?: string | null; invoiceDate?: ISODate | null; boletoNumber?: string | null },
  ): Promise<void>;
  removeSaleFile(saleId: string, attachmentId: string): Promise<void>;
  /** Gera/guarda o Pix copia-e-cola do pedido (valor atual). Retorna o payload. */
  generateSalePix(saleId: string): Promise<string>;
  /** Portal: cliente envia comprovante. */
  uploadPaymentReceipt(saleId: string, att: Attachment): Promise<void>;
  /** Quita todas as parcelas em aberto da venda. */
  confirmSalePayment(saleId: string, input: PaymentInput): Promise<void>;

  // --- Financeiro -----------------------------------------------------------
  createEntries(input: EntriesInput): Promise<FinancialEntry[]>;
  payEntry(entryId: string, input: PaymentInput): Promise<void>;
  reversePayment(entryId: string, paymentId: string, reason: string): Promise<void>;
  cancelEntry(entryId: string, reason: string): Promise<void>;
  updateEntry(
    entryId: string,
    patch: Partial<Pick<FinancialEntry, 'dueDate' | 'amount' | 'documentNumber' | 'barcode' | 'notes' | 'method' | 'description'>>,
  ): Promise<void>;

  // --- Estoque --------------------------------------------------------------
  addStockEntry(input: StockEntryInput): Promise<string>;
  adjustLot(lotId: string, newBalance: number, reason: string): Promise<void>;
  setLotBlocked(lotId: string, blocked: boolean, reason?: string | null): Promise<void>;
  registerLoss(input: LossInput): Promise<void>;

  // --- Gado -----------------------------------------------------------------
  createBatch(input: BatchInput): Promise<string>;
  /** Também permite mudar o status manualmente entre PURCHASED ⇄ IN_PASTURE (abate/encerramento têm operações próprias). */
  updateBatch(
    id: string,
    patch: Partial<Omit<BatchInput, 'animals' | 'purchaseCost'>> & { status?: 'PURCHASED' | 'IN_PASTURE'; revenueOverride?: number | null },
  ): Promise<void>;
  addAnimals(batchId: string, animals: AnimalInput[]): Promise<void>;
  /** Registra morte/venda de animal vivo. */
  setAnimalStatus(animalId: string, status: 'DEAD' | 'SOLD' | 'ALIVE', notes?: string | null): Promise<void>;
  addBatchCost(input: BatchCostInput): Promise<string>;
  removeBatchCost(costId: string): Promise<void>;
  /** Importa custos em massa (CSV). */
  importBatchCosts(rows: BatchCostInput[]): Promise<number>;
  registerFeedPurchase(input: FeedPurchaseInput): Promise<string>;
  registerFeedConsumption(input: FeedConsumptionInput): Promise<void>;
  removeFeedConsumption(id: string): Promise<void>;
  registerSlaughter(input: SlaughterInput): Promise<void>;
  finishBatch(batchId: string): Promise<void>;

  // --- Processamento --------------------------------------------------------
  createProcessingOrder(input: ProcessingOrderInput): Promise<string>;
  registerProcessingReturn(orderId: string, input: ProcessingReturnInput): Promise<void>;
  cancelProcessingOrder(orderId: string, reason: string): Promise<void>;

  // --- Materiais ------------------------------------------------------------
  registerSupplyMovement(input: SupplyMovementInput): Promise<void>;

  // --- Clientes -------------------------------------------------------------
  recalcCustomerStats(customerId: string): Promise<void>;
  /**
   * Financeiro libera o pré-cadastro: cria o cliente (ou reativa o que já existe com o mesmo
   * CPF/CNPJ) com o limite, a condição e a forma de pagamento liberados. Retorna o id do cliente.
   */
  approveCustomerRequest(requestId: string, overrides?: Partial<Customer>, financial?: CustomerReleaseInput): Promise<string>;
  rejectCustomerRequest(requestId: string, reason: string): Promise<void>;
  /** Financeiro bloqueia o pré-cadastro (e o cliente com o mesmo CPF/CNPJ, se existir). */
  blockCustomerRequest(requestId: string, reason: string): Promise<void>;
  setCustomerFinancialApproval(customerId: string, status: 'APPROVED' | 'REJECTED' | 'PENDING', notes?: string | null): Promise<void>;

  // --- Tabelas de preço -----------------------------------------------------
  submitPriceTable(id: string): Promise<void>;
  approvePriceTable(id: string): Promise<void>;
  rejectPriceTable(id: string, reason: string): Promise<void>;

  // --- Portal ---------------------------------------------------------------
  submitPortalOrder(input: PortalOrderInput): Promise<Sale>;
  approvePortalAccount(accountId: string, opts: { customerId?: string | null; createCustomer?: boolean }): Promise<void>;
  rejectPortalAccount(accountId: string, reason: string): Promise<void>;
  setPortalAccountBlocked(accountId: string, blocked: boolean): Promise<void>;
  /** Libera o portal para um e-mail antes do cadastro: no 1º login a conta já entra aprovada e ligada ao cliente. */
  createPortalInvite(input: PortalInviteInput): Promise<void>;
  revokePortalInvite(email: string): Promise<void>;
  /** Cria/atualiza itens do catálogo a partir de uma tabela de preço. Retorna quantos. */
  syncCatalogFromPriceTable(priceTableId: string): Promise<number>;
  publishCatalogLink(input: PublicLinkInput): Promise<PublicCatalogLink>;

  // --- Equinos --------------------------------------------------------------
  registerEquineSale(input: EquineSaleInput): Promise<string>;
  cancelEquineSale(equineSaleId: string, reason: string): Promise<void>;
  registerSemenPurchase(input: SemenPurchaseInput): Promise<string>;
  useSemenDoses(purchaseId: string, input: { date: ISODate; doses: number; mareName?: string | null; notes?: string | null }): Promise<void>;

  // --- Usuários -------------------------------------------------------------
  inviteUser(input: { email: string; name: string; role: Role; commissionRate?: number | null; phone?: string | null }): Promise<void>;
  revokeInvite(inviteId: string): Promise<void>;
  updateUser(profileId: string, patch: { role?: Role; active?: boolean; commissionRate?: number | null; name?: string; company?: CompanyCode | null }): Promise<void>;

  // --- Auditoria ------------------------------------------------------------
  log(action: import('../domain/types').AuditAction, entity: string, entityId: string | null, summary: string, data?: Record<string, unknown>): Promise<void>;
}

export type { BatchCost };
