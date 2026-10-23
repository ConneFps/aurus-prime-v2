/**
 * Migração: cadastros (configurações, parceiros, usuários→convites, produtos,
 * materiais, tabelas de preço, clientes, portal, tarefas, auditoria…).
 */
import { withDefaults } from '../app/settings';
import type {
  AppSettings,
  AuditAction,
  CatalogItem,
  Customer,
  CustomerRequest,
  FreightZone,
  Invite,
  Partner,
  PaymentMethod,
  PortalAccount,
  PriceTable,
  Product,
  PublicCatalogLink,
  Role,
  SupplyItem,
  Task,
} from '../domain/types';
import type { Ctx } from './context';
import {
  arr,
  attachmentFrom,
  bool,
  companyCode,
  customerCategory,
  day,
  digits,
  docs,
  firstStr,
  isoDateTime,
  n0,
  normalize,
  num,
  obj,
  payMethod,
  personType,
  round2,
  str,
  upper,
  type Doc,
} from './legacy-utils';

const stamps = (ctx: Ctx, d: Doc, ...fallbacks: unknown[]) => {
  let createdAt = isoDateTime(d.createdAt);
  for (const f of fallbacks) createdAt = createdAt || isoDateTime(f);
  createdAt = createdAt || ctx.now;
  return { createdAt, updatedAt: isoDateTime(d.updatedAt) || createdAt };
};
export { stamps };

// ============================================================================
// Configurações e entrega
// ============================================================================

const SETTINGS_KEYS: (keyof AppSettings)[] = [
  'companyName', 'tradeName', 'document', 'stateRegistration', 'phone', 'email', 'whatsapp', 'zipCode', 'street', 'number',
  'district', 'city', 'state', 'logoUrl', 'idleTimeoutMinutes', 'pixKey', 'pixKeyType', 'pixMerchantName', 'pixMerchantCity',
  'pixDiscountPercent', 'defaultCommissionRate', 'corporateDomains',
];

/** Retorna os campos de AppSettings vindos do sistema antigo (só o que existia). */
export function mapSettings(ctx: Ctx): Partial<AppSettings> {
  const patch: Partial<AppSettings> = {};
  const set = (k: keyof AppSettings, v: unknown) => {
    if (v !== null && v !== undefined && v !== '') (patch as Record<string, unknown>)[k] = v;
  };
  for (const d of ctx.col('system_config')) {
    if (d.id === 'backup_settings') {
      ctx.w.note('cfg.backup', 'Agendamento de backup do sistema antigo não se aplica ao novo (o banco novo tem backup próprio)');
      continue;
    }
    let used = false;
    for (const k of SETTINGS_KEYS) {
      if (d[k] === undefined) continue;
      used = true;
      if (k === 'corporateDomains') set(k, arr(d[k]).map(str).filter(Boolean));
      else if (k === 'idleTimeoutMinutes' || k === 'pixDiscountPercent' || k === 'defaultCommissionRate') set(k, num(d[k]));
      else set(k, str(d[k]));
    }
    if (!used) ctx.w.add('cfg.unknown', 'Documentos de configuração antigos sem equivalente (ignorados)', String(d.id));
  }
  const delivery = ctx.col('portal_settings').find((d) => d.id === 'delivery');
  if (delivery) {
    if (delivery.freeAboveValue !== undefined) patch.freeFreightAbove = num(delivery.freeAboveValue);
    if (typeof delivery.pickupEnabled === 'boolean') patch.pickupEnabled = delivery.pickupEnabled;
    set('pickupAddress', str(delivery.pickupAddress));
    set('pickupNote', str(delivery.pickupNote));
    set('deliveryCutoffHour', num(delivery.cutoffHour));
    if (Array.isArray(delivery.blockedDates)) patch.deliveryBlockedDates = delivery.blockedDates.map(day).filter((x): x is string => !!x);
    const wp = upper(delivery.weekendPolicy);
    if (wp === 'NEXT_WEDNESDAY' || wp === 'NEXT_FRIDAY') patch.weekendPolicy = wp;
    set('weighingTolerancePercent', num(delivery.tolerancePercent));
    set('weighingToleranceMaxValue', num(delivery.toleranceMaxValue));
    set('weighingAutoApproveHours', num(delivery.autoApproveAfterHours));
    docs(delivery.zones).forEach((z, i) => {
      const zone: FreightZone = {
        id: str(z.id) || `zone-${i + 1}`,
        createdAt: ctx.now,
        updatedAt: ctx.now,
        legacyId: str(z.id),
        label: str(z.label) || `Zona ${i + 1}`,
        cepPrefixes: arr(z.cepPrefixes).map(digits).filter(Boolean),
        price: round2(n0(z.price)),
        minOrderValue: round2(n0(z.minOrderValue)),
        etaNote: str(z.etaNote),
        active: z.active === undefined ? true : bool(z.active),
      };
      ctx.put('freight_zones', zone);
    });
  }
  return patch;
}

export function settingsRow(ctx: Ctx, patch: Partial<AppSettings>): AppSettings {
  const s = withDefaults({ ...patch, id: 'main' });
  delete (s as Partial<AppSettings>).bootstrapped; // nunca muda o "sistema já iniciado"
  return { ...s, createdAt: ctx.now, updatedAt: ctx.now };
}

// ============================================================================
// Parceiros
// ============================================================================

export function mapPartners(ctx: Ctx) {
  const add = (d: Doc, kind: Partner['kind']) => {
    const id = String(d.id);
    const p: Partner = {
      id,
      ...stamps(ctx, d),
      legacyId: id,
      kind,
      name: str(d.name) || 'Sem nome',
      document: digits(d.document) || null,
      inspection: (['SIF', 'SIE', 'SIM'] as const).find((x) => x === upper(d.inspectedBy)) || null,
      phone: str(d.phone),
      email: str(d.email),
      city: str(d.city),
      state: str(d.state),
      active: true,
    };
    if (!str(d.name)) ctx.w.add('partner.noname', 'Parceiros sem nome', id);
    ctx.partners.set(id, p);
    ctx.put('partners', p);
  };
  for (const d of ctx.col('sellers')) add(d, 'CATTLE_SUPPLIER');
  for (const d of ctx.col('slaughterhouses')) add(d, 'SLAUGHTERHOUSE');
}

// ============================================================================
// Usuários → convites (perfis são criados no primeiro login)
// ============================================================================

const ROLES: Role[] = ['ADMIN', 'MANAGER', 'FINANCIAL', 'SELLER', 'LOGISTICS', 'OPERATOR', 'EXTERNAL_SELLER'];

export function mapInvites(ctx: Ctx) {
  const by = 'Migração do sistema antigo';
  for (const d of ctx.col('external_sellers')) {
    const email = (str(d.email) || String(d.id)).toLowerCase();
    if (!email.includes('@')) {
      ctx.w.add('ext.noemail', 'Vendedores externos sem e-mail válido (ignorados)', String(d.id));
      continue;
    }
    const uid = str(d.linkedUid);
    if (uid) {
      ctx.extSellerUid.set(email, uid);
      ctx.userNames.set(uid, str(d.name) || email);
      ctx.userEmails.set(uid, email);
    }
    const inv: Invite = {
      id: email,
      ...stamps(ctx, d),
      legacyId: String(d.id),
      email,
      name: str(d.name) || email,
      role: 'EXTERNAL_SELLER',
      commissionRate: num(d.commissionRate),
      phone: str(d.phone),
      status: upper(d.status) === 'BLOCKED' ? 'REVOKED' : 'PENDING',
      invitedById: ctx.uid(d.invitedByUid),
      invitedByName: str(d.invitedByName) || by,
      acceptedAt: null,
      profileId: null,
    };
    ctx.put('invites', inv);
  }
  for (const d of ctx.col('users')) {
    const uid = str(d.uid) || String(d.id);
    const email = (str(d.email) || '').toLowerCase();
    if (str(d.displayName) || email) ctx.userNames.set(uid, str(d.displayName) || email);
    if (email) ctx.userEmails.set(uid, email);
    if (!email.includes('@')) {
      ctx.w.add('user.noemail', 'Usuários antigos sem e-mail (não viraram convite)', uid);
      continue;
    }
    let role = upper(d.role) as Role;
    if (upper(d.role) === 'USER') role = 'OPERATOR';
    if (!ROLES.includes(role)) {
      ctx.w.add('user.role', 'Usuários com papel desconhecido — convidados como Operador', email);
      role = 'OPERATOR';
    }
    const prev = ctx.get('invites', email);
    if (prev && role !== 'EXTERNAL_SELLER') ctx.w.add('user.both', 'E-mails cadastrados como usuário interno E vendedor externo — mantido o papel interno', email);
    const inv: Invite = {
      id: email,
      ...stamps(ctx, d),
      legacyId: uid,
      email,
      name: str(d.displayName) || prev?.name || email,
      role: role === 'EXTERNAL_SELLER' && prev ? 'EXTERNAL_SELLER' : role,
      commissionRate: prev?.commissionRate ?? null,
      phone: prev?.phone ?? null,
      status: prev?.status === 'REVOKED' && role === 'EXTERNAL_SELLER' ? 'REVOKED' : 'PENDING',
      invitedById: null,
      invitedByName: by,
      acceptedAt: null,
      profileId: null,
    };
    ctx.put('invites', inv);
  }
}

// ============================================================================
// Produtos e materiais
// ============================================================================

export function mapProducts(ctx: Ctx) {
  for (const d of ctx.col('products')) {
    const id = String(d.id);
    const mt = upper(d.meatType);
    const p: Product = {
      id,
      ...stamps(ctx, d),
      legacyId: id,
      name: str(d.name) || `Produto ${id}`,
      code: str(d.code),
      category: str(d.category) || 'Outros',
      meatType: mt === 'GRILL' || mt === 'PROCESSED' || mt === 'RAW' ? mt : 'OTHER',
      unit: upper(d.unit) === 'UN' ? 'UN' : 'KG',
      minStock: num(d.minStockLimit),
      defaultPrice: num(d.defaultPrice),
      imageUrl: str(d.imageUrl)?.startsWith('http') ? str(d.imageUrl) : null,
      active: d.active === undefined ? true : bool(d.active),
    };
    if (!str(d.name)) ctx.w.add('prod.noname', 'Produtos sem nome', id);
    ctx.products.add(p, true);
  }
}

const SUPPLY_CATS = ['EMBALAGEM', 'ETIQUETA', 'LIMPEZA', 'ESCRITORIO', 'OUTRO'] as const;
const SUPPLY_UNITS = ['UN', 'CX', 'PCT', 'KG', 'L'] as const;

export function mapSupplyItems(ctx: Ctx) {
  for (const d of ctx.col('supply_items')) {
    const id = String(d.id);
    const it: SupplyItem = {
      id,
      ...stamps(ctx, d),
      legacyId: id,
      name: str(d.name) || `Material ${id}`,
      sku: str(d.sku),
      category: SUPPLY_CATS.find((c) => c === upper(d.category)) || 'OUTRO',
      unit: SUPPLY_UNITS.find((u) => u === upper(d.unit)) || 'UN',
      quantity: n0(d.currentQty ?? d.quantity),
      minQuantity: num(d.minQty),
      unitCost: num(d.unitCost),
      salePrice: num(d.salePrice),
      supplier: str(d.supplier),
      sellable: bool(d.isCustomBagItem) || (num(d.salePrice) ?? 0) > 0,
      active: d.active === undefined ? true : bool(d.active),
      notes: firstStr(d.notes, d.linkedSaleItemName ? `Item de venda: ${d.linkedSaleItemName}` : null),
    };
    ctx.put('supply_items', it);
  }
}

/** Material correspondente a um item de pedido (sacola etc.). */
export function supplyFor(ctx: Ctx, name: string | null, isBag: boolean): string | null {
  const items = ctx.rows('supply_items');
  const n = normalize(name);
  const byName = items.find((s) => normalize(s.name) === n || (s.notes && normalize(s.notes).includes(n) && n.length > 3));
  if (byName) return byName.id;
  if (isBag || n.includes('sacola')) {
    const legacyBag = ctx.col('supply_items').find((d) => bool(d.isCustomBagItem));
    if (legacyBag) return String(legacyBag.id);
  }
  return null;
}

// ============================================================================
// Tabelas de preço
// ============================================================================

export function mapPriceTables(ctx: Ctx) {
  for (const d of ctx.col('price_tables')) {
    const id = String(d.id);
    const type = upper(d.type);
    const ap = upper(d.approvalStatus);
    const t: PriceTable = {
      id,
      ...stamps(ctx, d),
      legacyId: id,
      name: str(d.name) || `Tabela ${id}`,
      kind: type === 'GRILL' ? 'GRILL' : type === 'PORTAL' ? 'PORTAL' : type === 'INTERCOMPANY' ? 'INTERCOMPANY' : 'GENERAL',
      status: upper(d.status) === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
      approvalStatus: ap === 'DRAFT' || ap === 'PENDING' || ap === 'REJECTED' ? ap : 'APPROVED',
      items: docs(d.items)
        .filter((i) => str(i.cutType))
        .map((i) => {
          const p = ctx.products.ensure(str(i.cutType)!, { meatType: upper(i.meatType) === 'GRILL' ? 'GRILL' : 'PROCESSED' });
          return { productId: p.id, productName: p.name, unit: p.unit, price: round2(n0(i.pricePerKg ?? i.price)) };
        }),
      notes: null,
    };
    ctx.put('price_tables', t);
  }
}

// ============================================================================
// Clientes
// ============================================================================

export function addressOf(d: Doc) {
  const a = obj(d.address);
  return {
    zipCode: digits(a.zipCode ?? d.cep ?? d.zipCode) || null,
    street: firstStr(a.street, d.street),
    number: firstStr(a.number, d.number),
    complement: firstStr(a.complement, d.complement),
    district: firstStr(a.neighborhood, a.district, d.neighborhood, d.district),
    city: firstStr(a.city, d.city),
    state: (firstStr(a.state, d.state) || '').toUpperCase().slice(0, 2) || null,
  };
}

const METHODS_DEFAULT: PaymentMethod[] = ['PIX', 'BOLETO'];

export function mapCustomers(ctx: Ctx) {
  let noApproval = 0;
  for (const d of ctx.col('customers')) {
    const id = String(d.id);
    const contact = obj(d.contact);
    const fin = obj(d.financial);
    const com = obj(d.commercial);
    const document = digits(d.document);
    const pt = personType(d.personType, document);
    const allowed = [...new Set(arr(fin.allowedPaymentMethods).map(payMethod).filter((m): m is PaymentMethod => !!m))];
    const preferred = payMethod(fin.paymentMethod);
    if (preferred && !allowed.includes(preferred)) allowed.push(preferred);
    const fa = upper(d.financialApprovalStatus);
    if (!fa) noApproval++;
    const name = firstStr(d.name, d.tradeName);
    if (!name) ctx.w.add('cust.noname', 'Clientes sem nome', id);
    const c: Customer = {
      id,
      ...stamps(ctx, d),
      legacyId: id,
      code: str(d.code),
      name: name || 'Cliente sem nome',
      tradeName: str(d.tradeName),
      personType: pt,
      document,
      stateRegistration: str(d.stateRegistration),
      municipalRegistration: str(d.municipalRegistration),
      category: customerCategory(d.customerCategory, pt),
      segment: str(com.segment),
      ...addressOf(d),
      phone: firstStr(contact.phone, d.phone),
      cellphone: firstStr(contact.cellphone, d.cellphone),
      email: firstStr(contact.email, d.email),
      financialEmail: str(contact.financialEmail),
      contactName: firstStr(contact.responsibleName, d.contactName),
      paymentTerms: str(fin.paymentCondition),
      creditLimit: round2(n0(fin.creditLimit)),
      preferredPaymentMethod: preferred,
      allowedPaymentMethods: allowed.length ? allowed : METHODS_DEFAULT,
      financialApproval: fa === 'APPROVED' || fa === 'REJECTED' ? fa : 'PENDING',
      financialApprovalNotes: str(d.financialApprovalNotes),
      financialApprovedBy: str(d.financialApprovedBy),
      financialApprovedAt: isoDateTime(d.financialApprovedAt),
      sellerId: null,
      sellerName: str(com.salesperson),
      priceTableId: ctx.get('price_tables', str(d.pricingTableId)) ? str(d.pricingTableId) : null,
      isIntercompany: bool(d.isIntercompanyPartner),
      intercompanyCode: companyCode(d.intercompanyName),
      status: upper(d.status) === 'BLOCKED' ? 'BLOCKED' : 'ACTIVE',
      ranking: 'BRONZE',
      stars: 0,
      totalPurchases: 0,
      ordersCount: 0,
      lastPurchaseAt: null,
      documents: docs(d.documents)
        .map((x, i) => attachmentFrom(x, `${id}-d${i + 1}`, ctx.now, 'DOCUMENT', ctx.w, name || id))
        .filter((x): x is NonNullable<typeof x> => !!x),
      notes: str(d.notes),
    };
    if (!document) ctx.w.add('cust.nodoc', 'Clientes sem CPF/CNPJ', c.name);
    ctx.customers.set(id, c);
    ctx.put('customers', c);
  }
  if (noApproval) ctx.w.note('cust.approval', `${noApproval} cliente(s) sem liberação financeira registrada no sistema antigo ficaram como "Pendente" — libere no cadastro do cliente`);
}

export function mapCustomerRequests(ctx: Ctx) {
  for (const d of ctx.col('customer_requests')) {
    const id = String(d.id);
    const contact = obj(d.contact);
    const document = digits(d.document);
    const pt = personType(d.personType, document);
    const st = upper(d.status);
    const fa = obj(d.financialApproval);
    const sellerNotes = str(d.sellerNotes);
    const r: CustomerRequest = {
      id,
      ...stamps(ctx, d),
      legacyId: id,
      name: str(d.name) || 'Sem nome',
      tradeName: str(d.tradeName),
      personType: pt,
      document,
      category: customerCategory(d.customerCategory, pt),
      stateRegistration: str(d.stateRegistration),
      contactName: firstStr(d.contactName, contact.responsibleName),
      phone: firstStr(d.phone, contact.phone),
      cellphone: firstStr(d.cellphone, contact.cellphone),
      email: firstStr(d.email, contact.email),
      ...addressOf(d),
      notes: [str(d.notes), sellerNotes].filter(Boolean).join('\n') || null,
      status: st === 'APPROVED' || st === 'REJECTED' || st === 'BLOCKED' ? st : 'PENDING',
      rejectionReason: str(d.rejectionReason),
      blockReason: str(d.blockReason),
      createdCustomerId: ctx.customers.has(str(d.createdCustomerId) || '') ? str(d.createdCustomerId) : null,
      suggestedCreditLimit: num(d.suggestedCreditLimit),
      suggestedPaymentTerms: str(d.suggestedPaymentCondition),
      requestedById: ctx.uid(d.requestedByUid) || str(d.requestedByUid) || 'legado',
      requestedByName: str(d.requestedByName) || str(d.requestedByEmail) || 'Vendedor externo',
      requestedByEmail: str(d.requestedByEmail),
      reviewedByName: str(d.reviewedByName),
      reviewedByRole: str(d.reviewedByRole),
      reviewedAt: isoDateTime(d.reviewedAt),
      financialApproval: Object.keys(fa).length
        ? {
            creditLimit: n0(fa.creditLimit),
            paymentTerms: str(fa.paymentCondition),
            paymentMethod: payMethod(fa.paymentMethod),
            approvedAt: isoDateTime(fa.approvedAt) || isoDateTime(d.reviewedAt) || ctx.now,
            approvedByName: str(fa.approvedByName) || str(d.reviewedByName) || 'Financeiro',
            notes: str(fa.financialNotes),
          }
        : null,
    };
    ctx.put('customer_requests', r);
  }
}

// ============================================================================
// Portal: contas, catálogo, links públicos
// ============================================================================

export function mapPortalAccounts(ctx: Ctx) {
  const users = ctx.col('portal_users');
  let invited = 0;
  let waiting = 0;
  for (const d of users) {
    const id = str(d.uid) || String(d.id);
    const document = digits(d.document);
    const st = upper(d.status);
    const custId = str(d.customerId);
    const a: PortalAccount = {
      id,
      ...stamps(ctx, d),
      legacyId: String(d.id),
      email: (str(d.email) || '').toLowerCase(),
      name: str(d.name) || str(d.email) || 'Cliente do portal',
      phone: str(d.phone),
      companyName: str(d.companyName),
      personType: document ? (document.length > 11 ? 'J' : 'F') : null,
      document: document || null,
      ...addressOf(d),
      status: st === 'APPROVED' || st === 'REJECTED' || st === 'BLOCKED' ? st : 'PENDING',
      customerId: custId && ctx.customers.has(custId) ? custId : null,
      approvedByName: null,
      approvedAt: null,
      lastLoginAt: isoDateTime(d.lastLoginAt),
    };
    if (custId && !ctx.customers.has(custId)) ctx.w.add('portal.cust', 'Contas do portal ligadas a cliente inexistente (vínculo removido)', a.email);
    ctx.legacyPortalAccounts.set(id, a);
    if (!ctx.otherProject) {
      ctx.put('portal_accounts', a);
      continue;
    }
    // Outro projeto: o login do cliente não vem junto. Quem já entrou no sistema novo recebe os
    // dados/vínculo; os demais clientes liberados viram CONVITE (no 1º acesso já entram aprovados).
    const newId = ctx.newPortalByEmail.get(a.email);
    if (newId) ctx.put('portal_accounts', { ...a, id: newId });
    else if (a.status === 'APPROVED' && a.customerId && a.email) {
      const c = ctx.customers.get(a.customerId)!;
      ctx.put('portal_invites', {
        id: a.email,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        legacyId: String(d.id),
        email: a.email,
        customerId: c.id,
        customerName: c.name,
        name: a.name,
        phone: digits(a.phone) || null,
        document: a.document ?? c.document ?? null,
        priceTableId: c.priceTableId ?? null,
        status: 'PENDING',
        invitedByName: 'Migração do sistema antigo',
        acceptedAt: null,
        accountId: null,
      });
      invited++;
    } else waiting++;
  }
  if (invited)
    ctx.w.note(
      'portal.invites',
      `${invited} cliente(s) do portal viraram convite: no portal novo, o cliente toca em "Criar conta" com o mesmo e-mail e já entra liberado`,
    );
  if (waiting) ctx.w.note('portal.waiting', `${waiting} cadastro(s) do portal que ainda não estavam liberados ficaram de fora: o cliente se cadastra de novo no portal novo`);
  if (users.length && !ctx.keepIds)
    ctx.w.note(
      'portal.pg',
      `${users.length} conta(s) do portal foram copiadas, mas no PostgreSQL as senhas não migram: cada cliente precisa se cadastrar de novo no portal com o mesmo e-mail (a equipe aprova e vincula ao cliente)`,
    );
}

/** Convites do portal (portal_invites/{e-mail}): só os de clientes que existem. */
export function mapPortalInvites(ctx: Ctx) {
  const accounts = ctx.rows('portal_accounts');
  for (const d of ctx.col('portal_invites')) {
    const email = (str(d.email) || String(d.id)).trim().toLowerCase();
    const custId = str(d.customerId);
    const customer = custId ? ctx.customers.get(custId) : undefined;
    if (!email || !customer) {
      ctx.w.add('portal.invite', 'Convites do portal sem cliente válido (ignorados)', email || String(d.id));
      continue;
    }
    const account = accounts.find((a) => a.email === email);
    const at = isoDateTime(d.createdAt) || ctx.now;
    const accepted = !!account;
    ctx.put('portal_invites', {
      id: email,
      createdAt: at,
      updatedAt: at,
      legacyId: String(d.id),
      email,
      customerId: customer.id,
      customerName: customer.name,
      name: str(d.name) || str(d.companyName) || customer.name,
      phone: digits(d.phone) || null,
      document: digits(d.document) || customer.document || null,
      priceTableId: str(d.priceTableId) && str(d.priceTableId) !== 'PUBLIC' && ctx.get('price_tables', str(d.priceTableId)) ? str(d.priceTableId) : null,
      status: accepted ? 'ACCEPTED' : 'PENDING',
      invitedByName: str(d.createdBy),
      acceptedAt: accepted ? account!.createdAt : null,
      accountId: accepted ? account!.id : null,
    });
    // O portal antigo guardava a tabela no convite: leva para o cliente se ele não tiver tabela.
    const tid = str(d.priceTableId);
    if (tid && tid !== 'PUBLIC' && ctx.get('price_tables', tid) && !customer.priceTableId) {
      customer.priceTableId = tid;
      ctx.put('customers', customer);
    }
  }
}

export function mapCatalog(ctx: Ctx) {
  const all = ctx.col('portal_catalog');
  const byName = new Map<string, Doc>();
  // Um item por nome: o publicado e mais recente vence (o antigo tinha um catálogo por tabela de preço).
  const rank = (d: Doc) => `${bool(d.published) ? 1 : 0}|${isoDateTime(d.updatedAt) || ''}`;
  for (const d of all) {
    const n = normalize(str(d.name));
    if (!n) continue;
    const cur = byName.get(n);
    if (!cur || rank(d) > rank(cur)) byName.set(n, d);
  }
  if (byName.size < all.length) ctx.w.note('catalog.dup', `${all.length - byName.size} item(ns) do catálogo do portal repetido(s) entre tabelas de preço — mantido um por nome (o publicado mais recente)`);
  [...byName.values()].forEach((d, i) => {
    const id = String(d.id);
    const p = ctx.products.resolve(str(d.name));
    const unit = upper(d.unit) === 'UN' || upper(d.unit) === 'UNIDADE' ? 'UN' : 'KG';
    const c: CatalogItem = {
      id,
      ...stamps(ctx, d),
      legacyId: id,
      productId: p?.id ?? null,
      supplyItemId: null,
      name: str(d.name)!,
      description: str(d.notes),
      category: str(d.category) || p?.category || 'Cortes Bovinos',
      unit,
      price: round2(n0(d.unitPrice)),
      minQty: 1,
      step: unit === 'KG' ? 0.5 : 1,
      imageUrl: p?.imageUrl ?? null,
      available: bool(d.published),
      featured: false,
      sortOrder: i + 1,
    };
    ctx.put('catalog_items', c);
  });
}

export function mapPublicLinks(ctx: Ctx) {
  for (const d of ctx.col('public_catalogs')) {
    const id = String(d.id);
    const l: PublicCatalogLink = {
      id,
      ...stamps(ctx, d),
      legacyId: id,
      token: id,
      title: str(d.label) || 'Catálogo',
      message: str(d.headline),
      showPrices: true,
      expiresAt: day(d.expiresAt),
      active: d.active === undefined ? true : bool(d.active),
      views: n0(d.views),
      items: docs(d.items).map((i) => ({
        name: str(i.name) || 'Item',
        category: str(i.category) || 'Cortes',
        unit: upper(i.unit) === 'UN' ? 'UN' : 'KG',
        price: num(i.unitPrice),
        imageUrl: null,
        description: str(i.note),
      })),
      whatsapp: digits(d.contactPhone) || null,
      createdByName: str(d.createdBy),
    };
    ctx.put('public_catalog_links', l);
  }
}

// ============================================================================
// Tarefas, simulações e auditoria
// ============================================================================

export function mapTasks(ctx: Ctx) {
  for (const d of ctx.col('operational_tasks')) {
    const id = String(d.id);
    const pr = upper(d.priority);
    const t: Task = {
      id,
      ...stamps(ctx, d),
      legacyId: id,
      title: str(d.title) || 'Tarefa',
      description: str(d.description),
      assigneeId: ctx.uid(d.assignedTo),
      assigneeName: str(d.assignedToName),
      dueDate: day(d.dueDate),
      status: upper(d.status) === 'COMPLETED' || upper(d.status) === 'DONE' ? 'DONE' : 'OPEN',
      priority: pr === 'LOW' || pr === 'HIGH' ? pr : 'MEDIUM',
      createdById: ctx.uid(d.createdBy),
      createdByName: str(d.createdByName),
      doneAt: isoDateTime(d.completedAt),
    };
    ctx.put('tasks', t);
  }
}

const SIM_META = new Set(['id', 'name', 'timestamp', 'ownerId', 'createdAt', 'updatedAt', 'createdBy', 'createdByName', 'result']);

export function mapSimulations(ctx: Ctx) {
  for (const d of ctx.col('cattle_simulations')) {
    const id = String(d.id);
    const params: Record<string, number | string | null> = {};
    for (const [k, v] of Object.entries(d)) {
      if (SIM_META.has(k)) continue;
      if (typeof v === 'number' || typeof v === 'string' || v === null) params[k] = v;
    }
    ctx.put('cattle_simulations', {
      id,
      ...stamps(ctx, d, d.timestamp),
      legacyId: id,
      name: str(d.name) || 'Simulação',
      params,
      result: null,
      createdById: ctx.uid(d.ownerId),
      createdByName: ctx.userName(d.ownerId, d.createdByName),
    });
  }
}

const AUDIT: AuditAction[] = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'APPROVE', 'REJECT', 'CANCEL', 'PAYMENT', 'REVERSAL', 'IMPORT', 'EXPORT'];

export function mapAudit(ctx: Ctx) {
  for (const d of ctx.col('audit_logs')) {
    const id = String(d.id);
    const at = isoDateTime(d.timestamp) || isoDateTime(d.createdAt) || ctx.now;
    const a = upper(d.action) as AuditAction;
    ctx.put('audit_logs', {
      id,
      createdAt: at,
      updatedAt: at,
      legacyId: id,
      at,
      userId: ctx.uid(d.userId),
      userName: ctx.userName(d.userId),
      userEmail: str(d.userEmail),
      action: AUDIT.includes(a) ? a : 'UPDATE',
      entity: str(d.collection) || 'sistema',
      entityId: str(d.documentId),
      summary: [str(d.details), str(d.orderNumber) ? `Pedido ${str(d.orderNumber)}` : null].filter(Boolean).join(' — '),
      data: {
        legacy: true,
        ...(a && !AUDIT.includes(a) ? { legacyAction: a } : {}),
        ...(str(d.batchId) ? { batchId: str(d.batchId) } : {}),
        ...(Object.keys(obj(d.metadata)).length ? { metadata: obj(d.metadata) } : {}),
        ...(docs(d.updates).length ? { updates: docs(d.updates).slice(0, 50) } : {}),
      },
    });
  }
}
