import type {
  AnimalStatus,
  BatchStatus,
  BillingType,
  CompanyCode,
  CostCategory,
  CostGroup,
  CustomerCategory,
  EntryCategory,
  EquineEventType,
  EquineSex,
  EquineStatus,
  LossOrigin,
  LossReason,
  ManagementType,
  MeatType,
  MovementType,
  PartnerKind,
  PaymentMethod,
  Ranking,
  Role,
  SaleChannel,
  SalePaymentStatus,
  SaleStatus,
  StockStage,
} from './types';

/** Tom visual usado por <Badge tone=…> (cores definidas pelo tema de cada opção). */
export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

export interface LabelInfo {
  label: string;
  tone: Tone;
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  FINANCIAL: 'Financeiro',
  SELLER: 'Vendedor',
  LOGISTICS: 'Logística',
  OPERATOR: 'Operador',
  EXTERNAL_SELLER: 'Vendedor externo',
};

export const COMPANY_LABELS: Record<CompanyCode, string> = {
  MVGB: 'MVGB Alimentação',
  GRTB: 'GRTB Alimentação',
  GIRASSOL: 'Girassol Alimentação',
  AURUS: 'Aurus Prime',
};

export const PARTNER_KIND_LABELS: Record<PartnerKind, string> = {
  CATTLE_SUPPLIER: 'Fornecedor de gado',
  SLAUGHTERHOUSE: 'Frigorífico',
  PROCESSOR: 'Desossa / processador',
  CARRIER: 'Transportadora',
  FEED_SUPPLIER: 'Fornecedor de ração',
  SUPPLIER: 'Fornecedor geral',
  OTHER: 'Outro',
};

export const BATCH_STATUS: Record<BatchStatus, LabelInfo> = {
  PURCHASED: { label: 'Comprado', tone: 'info' },
  IN_PASTURE: { label: 'Em engorda', tone: 'primary' },
  SLAUGHTERED: { label: 'Abatido', tone: 'warning' },
  FINISHED: { label: 'Encerrado', tone: 'neutral' },
};

export const MANAGEMENT_LABELS: Record<ManagementType, string> = {
  CAMPO: 'Campo (pasto)',
  CONFINAMENTO: 'Confinamento',
};

export const ANIMAL_STATUS: Record<AnimalStatus, LabelInfo> = {
  ALIVE: { label: 'Vivo', tone: 'success' },
  SLAUGHTERED: { label: 'Abatido', tone: 'neutral' },
  DEAD: { label: 'Morte', tone: 'danger' },
  SOLD: { label: 'Vendido vivo', tone: 'info' },
};

export const COST_GROUP_LABELS: Record<CostGroup, string> = {
  ACQUISITION: 'Aquisição',
  OPERATIONAL: 'Operacional',
  SLAUGHTER: 'Abate e desossa',
  FISCAL: 'Fiscal',
  COMMERCIAL: 'Comercial',
  CREDIT: 'Créditos',
  OTHER: 'Outros',
};

export const COST_CATEGORIES: Record<CostCategory, { label: string; group: CostGroup }> = {
  PURCHASE: { label: 'Compra dos animais', group: 'ACQUISITION' },
  PURCHASE_COMMISSION: { label: 'Comissão de compra', group: 'ACQUISITION' },
  PURCHASE_FREIGHT: { label: 'Frete de compra', group: 'ACQUISITION' },
  FEED: { label: 'Ração / suplemento', group: 'OPERATIONAL' },
  LODGING: { label: 'Hospedagem / diária', group: 'OPERATIONAL' },
  VACCINE: { label: 'Vacinas', group: 'OPERATIONAL' },
  VETERINARY: { label: 'Veterinário', group: 'OPERATIONAL' },
  PASTURE: { label: 'Pasto / arrendamento', group: 'OPERATIONAL' },
  LABOR: { label: 'Mão de obra', group: 'OPERATIONAL' },
  SLAUGHTER_FREIGHT: { label: 'Frete para abate', group: 'SLAUGHTER' },
  SLAUGHTER_FEE: { label: 'Custo de abate', group: 'SLAUGHTER' },
  SLAUGHTER_RETURN_FREIGHT: { label: 'Frete de retorno do abate', group: 'SLAUGHTER' },
  HQ_FREIGHT: { label: 'Frete até a matriz', group: 'SLAUGHTER' },
  CUTTING: { label: 'Corte', group: 'SLAUGHTER' },
  DEBONING: { label: 'Desossa (mão de obra)', group: 'SLAUGHTER' },
  DEBONING_RETURN_FREIGHT: { label: 'Frete de retorno da desossa', group: 'SLAUGHTER' },
  FUNRURAL_PURCHASE: { label: 'Funrural (compra)', group: 'FISCAL' },
  FUNRURAL_SALE: { label: 'Funrural (venda)', group: 'FISCAL' },
  ICMS_PURCHASE: { label: 'ICMS (compra)', group: 'FISCAL' },
  ICMS_SALE: { label: 'ICMS (venda)', group: 'FISCAL' },
  SENAR_PURCHASE: { label: 'SENAR (compra)', group: 'FISCAL' },
  SENAR_SALE: { label: 'SENAR (venda)', group: 'FISCAL' },
  GTA_FEE: { label: 'Taxa de GTA', group: 'FISCAL' },
  INSPECTION_FEE: { label: 'Taxa de inspeção', group: 'FISCAL' },
  ENTRY_PROTOCOL: { label: 'Protocolo de entrada', group: 'FISCAL' },
  SALES_COMMISSION: { label: 'Comissão de venda', group: 'COMMERCIAL' },
  SLAUGHTER_RETURN: { label: 'Retorno do abate (couro/miúdos)', group: 'CREDIT' },
  TAX_CREDIT: { label: 'Crédito de imposto', group: 'CREDIT' },
  OTHER: { label: 'Outros', group: 'OTHER' },
};

export const MEAT_TYPE_LABELS: Record<MeatType, string> = {
  GRILL: 'Churrasco',
  PROCESSED: 'Processado / dia a dia',
  RAW: 'Carcaça / matéria-prima',
  OTHER: 'Outro',
};

export const STAGE_LABELS: Record<StockStage, string> = {
  RAW: 'Pós-abate',
  FINISHED: 'Venda',
};

export const MOVEMENT_LABELS: Record<MovementType, LabelInfo> = {
  ENTRY: { label: 'Entrada', tone: 'success' },
  SLAUGHTER_ENTRY: { label: 'Entrada do abate', tone: 'success' },
  PROCESSING_OUT: { label: 'Envio p/ desossa', tone: 'warning' },
  PROCESSING_IN: { label: 'Retorno da desossa', tone: 'success' },
  SALE: { label: 'Venda', tone: 'primary' },
  SALE_REVERSAL: { label: 'Estorno de venda', tone: 'info' },
  LOSS: { label: 'Perda', tone: 'danger' },
  ADJUSTMENT: { label: 'Ajuste', tone: 'neutral' },
};

export const LOSS_ORIGIN_LABELS: Record<LossOrigin, string> = {
  PROCESSAMENTO: 'Processamento',
  ESTOQUE: 'Estoque',
  TRANSPORTE: 'Transporte',
  ABATE: 'Abate',
};

export const LOSS_REASON_LABELS: Record<LossReason, string> = {
  OSSO: 'Osso',
  SEBO_GORDURA: 'Sebo / gordura',
  APARA: 'Apara',
  EVAPORACAO: 'Evaporação / quebra de peso',
  DESCARTE: 'Descarte',
  AVARIA: 'Avaria',
  VALIDADE_VENCIDA: 'Validade vencida',
  DIVERGENCIA_PESAGEM: 'Divergência de pesagem',
  OUTRO: 'Outro',
};

export const CUSTOMER_CATEGORY_LABELS: Record<CustomerCategory, string> = {
  INTERNO_PF: 'Interno PF',
  EXTERNO_PF: 'Externo PF',
  EXTERNO_CNPJ: 'Externo CNPJ',
};

export const RANKING: Record<Ranking, LabelInfo> = {
  BRONZE: { label: 'Bronze', tone: 'warning' },
  SILVER: { label: 'Prata', tone: 'neutral' },
  GOLD: { label: 'Ouro', tone: 'accent' },
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  PIX: 'Pix',
  BOLETO: 'Boleto',
  TRANSFER: 'Transferência',
  CARD: 'Cartão',
  CASH: 'Dinheiro',
  CREDIT: 'A prazo (crediário)',
  BONUS: 'Bonificação',
  SAMPLE: 'Amostra',
};

export const BILLING_LABELS: Record<BillingType, string> = {
  NF_BOLETO: 'Nota fiscal + boleto',
  NF_ONLY: 'Somente nota fiscal',
  BOLETO_ONLY: 'Somente boleto',
  NONE: 'Sem documento',
};

export const SALE_CHANNEL_LABELS: Record<SaleChannel, string> = {
  INTERNAL: 'Venda interna',
  EXTERNAL_SELLER: 'Vendedor externo',
  PORTAL: 'Portal do cliente',
  INTERCOMPANY: 'Intercompany',
};

export const SALE_STATUS: Record<SaleStatus, LabelInfo> = {
  DRAFT: { label: 'Rascunho', tone: 'neutral' },
  PENDING_APPROVAL: { label: 'Aguardando aprovação', tone: 'warning' },
  APPROVED: { label: 'Aprovado', tone: 'info' },
  PICKING: { label: 'Em separação', tone: 'primary' },
  AWAITING_CUSTOMER: { label: 'Aguardando cliente', tone: 'warning' },
  READY: { label: 'Separado', tone: 'accent' },
  DISPATCHED: { label: 'Expedido', tone: 'primary' },
  DELIVERED: { label: 'Entregue', tone: 'success' },
  CANCELLED: { label: 'Cancelado', tone: 'danger' },
  REJECTED: { label: 'Recusado', tone: 'danger' },
};

/** Como o cliente do portal enxerga o status. */
export const PORTAL_STATUS_LABELS: Record<SaleStatus, string> = {
  DRAFT: 'Rascunho',
  PENDING_APPROVAL: 'Pedido recebido',
  APPROVED: 'Pedido confirmado',
  PICKING: 'Separando e pesando',
  AWAITING_CUSTOMER: 'Aguardando sua aprovação',
  READY: 'Pronto — aguardando pagamento/expedição',
  DISPATCHED: 'Em rota de entrega',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelado',
  REJECTED: 'Recusado',
};

export const PAYMENT_STATUS: Record<SalePaymentStatus, LabelInfo> = {
  PENDING: { label: 'A receber', tone: 'warning' },
  RECEIPT_SENT: { label: 'Comprovante enviado', tone: 'info' },
  PARTIAL: { label: 'Parcial', tone: 'info' },
  PAID: { label: 'Pago', tone: 'success' },
  CANCELLED: { label: 'Cancelado', tone: 'neutral' },
};

export const ENTRY_CATEGORY_LABELS: Record<EntryCategory, string> = {
  SALE: 'Venda de carne',
  EQUINE_SALE: 'Venda de equino',
  SEMEN: 'Sêmen',
  CATTLE_PURCHASE: 'Compra de gado',
  FEED: 'Ração',
  FREIGHT: 'Frete',
  TAX: 'Impostos e taxas',
  PAYROLL: 'Folha / mão de obra',
  SERVICES: 'Serviços',
  SUPPLIES: 'Materiais',
  EQUINE_EXPENSE: 'Despesa com equinos',
  OTHER: 'Outros',
};

export const EQUINE_SEX_LABELS: Record<EquineSex, string> = {
  GARANHAO: 'Garanhão',
  EGUA: 'Égua',
  CASTRADO: 'Castrado',
};

export const EQUINE_STATUS: Record<EquineStatus, LabelInfo> = {
  ACTIVE: { label: 'Ativo', tone: 'success' },
  TRAINING: { label: 'Em treino', tone: 'primary' },
  PREGNANT: { label: 'Prenhe', tone: 'accent' },
  SOLD: { label: 'Vendido', tone: 'neutral' },
  DECEASED: { label: 'Óbito', tone: 'danger' },
};

export const EQUINE_EVENT_LABELS: Record<EquineEventType, LabelInfo> = {
  HEALTH: { label: 'Saúde', tone: 'danger' },
  TRAINING: { label: 'Treinamento', tone: 'primary' },
  FARRIER: { label: 'Casqueamento / manejo', tone: 'warning' },
  TRANSPORT: { label: 'Transporte', tone: 'info' },
  STAY: { label: 'Hospedagem', tone: 'neutral' },
  COMPETITION: { label: 'Competição', tone: 'accent' },
  SEMEN_COLLECTION: { label: 'Coleta de sêmen', tone: 'info' },
  EXPENSE: { label: 'Despesa', tone: 'danger' },
  REVENUE: { label: 'Receita', tone: 'success' },
};

export const EQUINE_MODALITIES = ['ADESTRAMENTO', 'SALTO', 'TAMBOR', 'RÉDEAS', 'LAÇO', 'VAQUEJADA', 'CONCURSO', 'PASSEIO', 'OUTROS'];
export const EQUINE_HEALTH_KINDS = ['VACINA', 'VERMIFUGO', 'ULTRASSOM', 'MEDICAMENTO', 'EXAME', 'OUTRO'];

/** Lista de UFs. */
export const UF_LIST = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

/** Transforma um Record de labels em opções de <Select>. */
export function optionsOf<T extends string>(rec: Record<T, string | LabelInfo>): { value: T; label: string }[] {
  return (Object.keys(rec) as T[]).map((k) => {
    const v = rec[k];
    return { value: k, label: typeof v === 'string' ? v : v.label };
  });
}
