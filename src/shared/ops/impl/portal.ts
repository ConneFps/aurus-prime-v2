/**
 * Portal do cliente: pedidos, contas de acesso, catálogo e links públicos.
 */
import type { NewRow, Tx } from '../../data/api';
import { isValidEmail, money, onlyDigits, round2 } from '../../domain/format';
import { calculateFreight } from '../../domain/freight';
import { resolveDeliveryWindow } from '../../domain/delivery';
import type { CatalogItem, Customer, PriceTable, PublicCatalogItem, Sale } from '../../domain/types';
import type { Ops, OpsContext, SaleItemInput } from '../types';
import { assert, audit, clean, getSettings, isPos, mustGet, nowIso, opsDate, opsToday, OpsError, requirePerm, round3, runTx } from './common';
import { customerDefaults, findCustomerByDocument } from './customers';
import { createSaleTx } from './sale-core';

const MAX_CATALOG_PER_TX = 200;

// ============================================================================
// Preço oficial do portal
// O pedido do portal é gravado pelo navegador do cliente: o preço que vale é o da
// tabela negociada do cliente (se houver) e, na falta dela, o do catálogo. A
// aprovação pela equipe confere tudo de novo e corrige divergências.
// ============================================================================

/** Tabela negociada do cliente, se estiver ativa e aprovada (sem permissão de leitura = sem tabela). */
export async function customerPriceTable(tx: Tx, customer: Pick<Customer, 'priceTableId'> | null | undefined): Promise<PriceTable | null> {
  if (!customer?.priceTableId) return null;
  try {
    const t = await tx.get('price_tables', customer.priceTableId);
    return t && t.status === 'ACTIVE' && t.approvalStatus === 'APPROVED' ? t : null;
  } catch {
    return null;
  }
}

/** Preço oficial de um item: tabela negociada (mesmo produto e unidade) → catálogo. */
export function portalPrice(cat: Pick<CatalogItem, 'productId' | 'unit' | 'price'>, table: PriceTable | null): number {
  const hit = table && cat.productId ? table.items.find((i) => i.productId === cat.productId && i.unit === cat.unit && i.price > 0) : null;
  return round2(hit ? hit.price : cat.price);
}

/**
 * Confere os preços de um pedido do portal com a tabela do cliente/catálogo.
 * Corrige os itens divergentes (in-place) e devolve a descrição das correções.
 */
export async function reconcilePortalPrices(tx: Tx, sale: Sale, customer: Customer): Promise<string[]> {
  const table = await customerPriceTable(tx, customer);
  const catalog = await tx.query('catalog_items');
  const fixes: string[] = [];
  for (const it of sale.items || []) {
    if (it.kind !== 'PRODUCT' && it.kind !== 'SUPPLY') continue;
    const cat = catalog.find((c) => (it.productId && c.productId === it.productId) || (it.supplyItemId && c.supplyItemId === it.supplyItemId));
    if (!cat) continue;
    const price = portalPrice(cat, table);
    if (Math.abs(price - it.unitPrice) <= 0.005) continue;
    fixes.push(`${it.productName}: ${money(it.unitPrice)} → ${money(price)}`);
    it.unitPrice = price;
    it.total = round2(price * (it.qty || it.qtyOrdered || 0));
  }
  return fixes;
}

function randomToken(len = 10): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const c = (globalThis as { crypto?: Crypto }).crypto;
  const bytes = new Uint8Array(len);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

type PortalKeys =
  | 'submitPortalOrder'
  | 'approvePortalAccount'
  | 'rejectPortalAccount'
  | 'setPortalAccountBlocked'
  | 'createPortalInvite'
  | 'revokePortalInvite'
  | 'syncCatalogFromPriceTable'
  | 'publishCatalogLink';

export function portalOps(ctx: OpsContext): Pick<Ops, PortalKeys> {
  const { actor } = ctx;
  return {
    async submitPortalOrder(input) {
      assert(actor.role === 'CUSTOMER', 'Somente clientes do portal podem enviar pedidos por aqui.');
      assert(input.items && input.items.length, 'Seu carrinho está vazio.');
      assert(input.deliveryMode === 'DELIVERY' || input.deliveryMode === 'PICKUP', 'Escolha entrega ou retirada.');
      return runTx(ctx, async (tx) => {
        const account = await mustGet(tx, 'portal_accounts', actor.id, 'Conta do portal não encontrada.');
        assert(account.status === 'APPROVED' && account.customerId, 'Seu cadastro ainda não foi liberado pela nossa equipe.');
        const customer = await mustGet(tx, 'customers', account.customerId, 'Cadastro de cliente não encontrado — fale com a nossa equipe.');
        assert(customer.status === 'ACTIVE', 'Seu cadastro está bloqueado — fale com a nossa equipe.');
        const settings = await getSettings(tx);
        const table = await customerPriceTable(tx, customer);

        const items: SaleItemInput[] = [];
        let itemsTotal = 0;
        for (const line of input.items) {
          const cat = await mustGet(tx, 'catalog_items', line.catalogItemId, 'Um dos produtos do carrinho não está mais no catálogo.');
          assert(cat.available, `${cat.name} está indisponível no momento.`);
          assert(isPos(line.qty), `Informe a quantidade de ${cat.name}.`);
          const unitLabel = cat.unit === 'KG' ? 'kg' : 'un';
          assert(line.qty + 1e-9 >= (cat.minQty || 0), `${cat.name}: pedido mínimo de ${cat.minQty} ${unitLabel}.`);
          if (cat.step > 0) {
            const k = line.qty / cat.step;
            assert(Math.abs(k - Math.round(k)) < 1e-6, `${cat.name}: a quantidade deve ser múltipla de ${cat.step} ${unitLabel}.`);
          }
          assert(cat.productId || cat.supplyItemId, `${cat.name} não está ligado a um produto do estoque.`);
          const qty = round3(line.qty);
          const price = portalPrice(cat, table);
          itemsTotal += round2(qty * price);
          items.push({
            kind: cat.productId ? 'PRODUCT' : 'SUPPLY',
            productId: cat.productId ?? null,
            supplyItemId: cat.productId ? null : cat.supplyItemId ?? null,
            productName: cat.name,
            unit: cat.unit,
            qtyOrdered: qty,
            unitPrice: price,
          });
        }
        itemsTotal = round2(itemsTotal);

        const zip = onlyDigits(input.zipCode || account.zipCode || customer.zipCode || '');
        if (input.deliveryMode === 'PICKUP') assert(settings.pickupEnabled, 'A retirada no local não está disponível.');
        else assert(zip.length === 8, 'Informe um CEP válido para a entrega.');
        const zones = (await tx.query('freight_zones', { where: [['active', '==', true]] })) || [];
        const freight = calculateFreight(input.deliveryMode, zip, itemsTotal, {
          zones,
          freeAbove: settings.freeFreightAbove ?? null,
          pickupEnabled: settings.pickupEnabled,
        });
        if (freight.kind === 'BELOW_MINIMUM') {
          throw new OpsError(`${freight.label}. Faltam ${money(freight.missing)} para fechar o pedido.`);
        }
        const window = resolveDeliveryWindow(opsDate(), {
          cutoffHour: settings.deliveryCutoffHour,
          blockedDates: settings.deliveryBlockedDates,
          weekendPolicy: settings.weekendPolicy,
        });
        const address =
          clean(input.address) ||
          [account.street || customer.street, account.number || customer.number, account.district || customer.district, account.city || customer.city]
            .filter(Boolean)
            .join(', ') ||
          null;
        const sale = await createSaleTx(tx, actor, {
          channel: 'PORTAL',
          customerId: customer.id,
          sellerId: customer.sellerId ?? null,
          priceTableId: customer.priceTableId ?? null,
          date: opsToday(),
          deliveryDate: window.deliveryDate,
          deliveryWindow: window.windowId,
          deliveryMode: input.deliveryMode,
          shippingZipCode: input.deliveryMode === 'DELIVERY' ? zip : null,
          shippingAddress: input.deliveryMode === 'DELIVERY' ? address : settings.pickupAddress || null,
          freightZoneId: 'zone' in freight ? freight.zone.id : null,
          freightValue: freight.value,
          freightPending: freight.kind === 'ON_REQUEST',
          paymentMethod: 'PIX',
          billingType: 'NONE',
          status: 'PENDING_APPROVAL',
          portalAccountId: account.id,
          customerNotes: clean(input.notes),
          items,
        });
        return sale;
      });
    },

    async approvePortalAccount(accountId, opts) {
      requirePerm(actor, 'portal.manage');
      await runTx(ctx, async (tx) => {
        const acc = await mustGet(tx, 'portal_accounts', accountId, 'Conta do portal não encontrada.');
        assert(acc.status !== 'APPROVED' || !acc.customerId || opts.customerId, 'Esta conta já está aprovada.');
        let customerId = opts.customerId ?? null;
        let created = false;
        if (customerId) {
          const c = await mustGet(tx, 'customers', customerId, 'Cliente não encontrado.');
          assert(c.status === 'ACTIVE', `O cliente ${c.name} está bloqueado.`);
        } else {
          assert(opts.createCustomer, 'Escolha o cliente a vincular ou marque para criar um cliente novo.');
          const doc = onlyDigits(acc.document);
          if (doc) {
            const dup = await findCustomerByDocument(tx, doc);
            assert(!dup, `Já existe o cliente ${dup?.name} com este documento — vincule a conta a ele.`);
          }
          const personType = acc.personType || (doc.length === 14 ? 'J' : 'F');
          const row: NewRow<'customers'> = {
            ...customerDefaults(),
            name: acc.companyName || acc.name,
            tradeName: acc.companyName ? acc.name : null,
            personType,
            document: doc,
            category: personType === 'J' ? 'EXTERNO_CNPJ' : 'EXTERNO_PF',
            zipCode: acc.zipCode ?? null,
            street: acc.street ?? null,
            number: acc.number ?? null,
            complement: acc.complement ?? null,
            district: acc.district ?? null,
            city: acc.city ?? null,
            state: acc.state ?? null,
            phone: acc.phone ?? null,
            cellphone: acc.phone ?? null,
            email: acc.email,
            contactName: acc.name,
            preferredPaymentMethod: 'PIX',
            allowedPaymentMethods: ['PIX'],
            notes: 'Cadastro criado a partir do portal do cliente.',
          };
          customerId = tx.insert('customers', row);
          created = true;
        }
        tx.update('portal_accounts', accountId, {
          status: 'APPROVED',
          customerId,
          rejectionReason: null,
          approvedByName: actor.name,
          approvedAt: nowIso(),
        });
        audit(tx, actor, 'APPROVE', 'portal_accounts', accountId, `Acesso ao portal liberado: ${acc.name} (${acc.email})${created ? ' — cliente criado' : ''}`, {
          customerId,
        });
      });
    },

    async rejectPortalAccount(accountId, reason) {
      requirePerm(actor, 'portal.manage');
      assert(clean(reason), 'Informe o motivo da recusa.');
      await runTx(ctx, async (tx) => {
        const acc = await mustGet(tx, 'portal_accounts', accountId, 'Conta do portal não encontrada.');
        tx.update('portal_accounts', accountId, { status: 'REJECTED', rejectionReason: reason.trim() });
        audit(tx, actor, 'REJECT', 'portal_accounts', accountId, `Acesso ao portal recusado: ${acc.name} — ${reason.trim()}`);
      });
    },

    async setPortalAccountBlocked(accountId, blocked) {
      requirePerm(actor, 'portal.manage');
      await runTx(ctx, async (tx) => {
        const acc = await mustGet(tx, 'portal_accounts', accountId, 'Conta do portal não encontrada.');
        const status = blocked ? 'BLOCKED' : acc.customerId ? 'APPROVED' : 'PENDING';
        tx.update('portal_accounts', accountId, { status });
        audit(tx, actor, 'UPDATE', 'portal_accounts', accountId, `Acesso ao portal ${blocked ? 'bloqueado' : 'desbloqueado'}: ${acc.name}`);
      });
    },

    async createPortalInvite(input) {
      requirePerm(actor, 'portal.manage');
      const email = (input.email || '').trim().toLowerCase();
      assert(isValidEmail(email), 'Informe um e-mail válido.');
      assert(input.customerId, 'Escolha o cliente.');
      await runTx(ctx, async (tx) => {
        const c = await mustGet(tx, 'customers', input.customerId, 'Cliente não encontrado.');
        assert(c.status === 'ACTIVE', `O cliente ${c.name} está bloqueado.`);
        const accounts = await tx.query('portal_accounts', { where: [['email', '==', email]] });
        const live = accounts.find((a) => a.status === 'APPROVED');
        assert(!live, `Este e-mail já tem acesso ao portal (${live?.name}).`);
        const cur = await tx.get('portal_invites', email);
        const fields = {
          email,
          customerId: c.id,
          customerName: c.name,
          name: clean(input.name) || c.contactName || c.name,
          phone: clean(input.phone) || c.cellphone || c.phone || null,
          document: c.document || null,
          priceTableId: c.priceTableId ?? null,
          status: 'PENDING' as const,
          invitedByName: actor.name,
          acceptedAt: null,
          accountId: null,
        };
        if (cur) tx.update('portal_invites', email, fields);
        else tx.insert('portal_invites', { id: email, ...fields });
        // Conta já criada e aguardando análise: libera agora.
        const waiting = accounts.find((a) => a.status === 'PENDING');
        if (waiting) {
          tx.update('portal_accounts', waiting.id, { status: 'APPROVED', customerId: c.id, rejectionReason: null, approvedByName: actor.name, approvedAt: nowIso() });
          tx.update('portal_invites', email, { status: 'ACCEPTED', acceptedAt: nowIso(), accountId: waiting.id });
        }
        audit(tx, actor, 'CREATE', 'portal_invites', email, `Convite do portal para ${email} — cliente ${c.name}${waiting ? ' (conta existente liberada)' : ''}`);
      });
    },

    async revokePortalInvite(email) {
      requirePerm(actor, 'portal.manage');
      const id = (email || '').trim().toLowerCase();
      await runTx(ctx, async (tx) => {
        const inv = await mustGet(tx, 'portal_invites', id, 'Convite não encontrado.');
        assert(inv.status === 'PENDING', 'Este convite já foi usado ou cancelado.');
        tx.update('portal_invites', id, { status: 'REVOKED' });
        audit(tx, actor, 'CANCEL', 'portal_invites', id, `Convite do portal cancelado: ${id}`);
      });
    },

    async syncCatalogFromPriceTable(priceTableId) {
      requirePerm(actor, 'portal.manage');
      const table = await runTx(ctx, (tx) => mustGet(tx, 'price_tables', priceTableId, 'Tabela de preço não encontrada.'));
      assert(table.approvalStatus === 'APPROVED', 'Aprove a tabela de preço antes de publicá-la no portal.');
      const items = table.items || [];
      assert(items.length, 'A tabela não tem produtos.');
      let count = 0;
      for (let start = 0; start < items.length; start += MAX_CATALOG_PER_TX) {
        const chunk = items.slice(start, start + MAX_CATALOG_PER_TX);
        count += await runTx(ctx, async (tx) => {
          const existing = await tx.query('catalog_items');
          const byProduct = new Map(existing.filter((c) => c.productId).map((c) => [c.productId as string, c]));
          let maxOrder = existing.reduce((m, c) => Math.max(m, c.sortOrder || 0), 0);
          let n = 0;
          for (const it of chunk) {
            const product = await tx.get('products', it.productId);
            if (!product) continue;
            const unit = it.unit || product.unit;
            const cur = byProduct.get(it.productId);
            if (cur) {
              tx.update('catalog_items', cur.id, {
                name: product.name,
                unit,
                price: it.price,
                category: product.category,
                imageUrl: product.imageUrl ?? cur.imageUrl ?? null,
                description: cur.description ?? product.description ?? null,
                available: true,
              });
            } else {
              const row: NewRow<'catalog_items'> = {
                productId: product.id,
                supplyItemId: null,
                name: product.name,
                description: product.description ?? null,
                category: product.category,
                unit,
                price: it.price,
                minQty: 1,
                step: unit === 'KG' ? 0.5 : 1,
                imageUrl: product.imageUrl ?? null,
                available: true,
                featured: false,
                sortOrder: ++maxOrder,
              };
              tx.insert('catalog_items', row);
            }
            n++;
          }
          audit(tx, actor, 'UPDATE', 'catalog_items', priceTableId, `Catálogo do portal atualizado pela tabela "${table.name}": ${n} produtos`);
          return n;
        });
      }
      return count;
    },

    async publishCatalogLink(input) {
      requirePerm(actor, 'portal.manage');
      assert(clean(input.title), 'Informe o título do catálogo.');
      return runTx(ctx, async (tx) => {
        const settings = await getSettings(tx);
        let items: CatalogItem[];
        if (input.catalogItemIds?.length) {
          items = [];
          for (const id of input.catalogItemIds) items.push(await mustGet(tx, 'catalog_items', id, 'Item do catálogo não encontrado.'));
        } else {
          items = (await tx.query('catalog_items', { where: [['available', '==', true]] })).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        }
        assert(items.length, 'Nenhum produto disponível para publicar.');
        let token = randomToken();
        for (let i = 0; i < 5 && (await tx.get('public_catalog_links', token)); i++) token = randomToken();
        const snapshot: PublicCatalogItem[] = items.map((c) => ({
          name: c.name,
          category: c.category,
          unit: c.unit,
          price: input.showPrices ? c.price : null,
          imageUrl: c.imageUrl ?? null,
          description: c.description ?? null,
        }));
        const now = nowIso();
        const row = {
          id: token,
          createdAt: now,
          updatedAt: now,
          token,
          title: input.title.trim(),
          message: clean(input.message),
          showPrices: !!input.showPrices,
          expiresAt: input.expiresAt ?? null,
          active: true,
          views: 0,
          items: snapshot,
          whatsapp: clean(input.whatsapp) ?? settings.whatsapp ?? null,
          createdByName: actor.name,
        };
        tx.insert('public_catalog_links', row);
        audit(tx, actor, 'CREATE', 'public_catalog_links', token, `Link público publicado: "${row.title}" (${snapshot.length} produtos)`);
        return row;
      });
    },
  };
}
