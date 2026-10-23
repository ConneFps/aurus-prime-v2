/**
 * Processos trazidos da versão 11 do sistema antigo:
 * pré-cadastro liberado/bloqueado pelo financeiro, convites do portal e
 * preço oficial dos pedidos do portal.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/shared/app/settings';
import { createMemoryBackend } from '../src/shared/data/memory';
import type { Backend } from '../src/shared/data/api';
import { can } from '../src/shared/domain/permissions';
import { createOps, type Actor } from '../src/shared/ops';

const ADMIN: Actor = { id: 'u-admin', name: 'Ana Admin', email: 'admin@teste.dev', role: 'ADMIN' };
const FINANCE: Actor = { id: 'u-fin', name: 'Fábio Financeiro', email: 'fin@teste.dev', role: 'FINANCIAL' };
const SELLER: Actor = { id: 'u-sel', name: 'Sara Vendedora', email: 'sara@teste.dev', role: 'SELLER' };

let backend: Backend;
const opsAs = (a: Actor) => createOps({ data: backend.data, actor: a });

beforeEach(async () => {
  backend = createMemoryBackend();
  await backend.data.insert('settings', { ...DEFAULT_SETTINGS, id: 'main', freeFreightAbove: null, bootstrapped: true });
  for (const a of [ADMIN, FINANCE, SELLER]) await backend.data.insert('profiles', { id: a.id, email: a.email, name: a.name, role: a.role as never, active: true });
});

async function request(document = '11.444.777/0001-61') {
  return backend.data.insert('customer_requests', {
    name: 'Açougue Novo',
    personType: 'J',
    document,
    category: 'EXTERNO_CNPJ',
    status: 'PENDING',
    suggestedCreditLimit: 8000,
    suggestedPaymentTerms: '28/35',
    requestedById: SELLER.id,
    requestedByName: SELLER.name,
  });
}

describe('pré-cadastro de cliente', () => {
  it('vendedor só pré-cadastra; quem libera é o financeiro', () => {
    expect(can('SELLER', 'customers.manage')).toBe(false);
    expect(can('SELLER', 'customers.request')).toBe(true);
    expect(can('FINANCIAL', 'customers.approveFinancial')).toBe(true);
  });

  it('financeiro libera com limite, condição e forma de pagamento', async () => {
    const req = await request();
    await expect(opsAs(SELLER).approveCustomerRequest(req.id)).rejects.toThrow();
    const cid = await opsAs(FINANCE).approveCustomerRequest(req.id, {}, { creditLimit: 6000, paymentTerms: '28/35', paymentMethod: 'BOLETO', notes: 'Revisar em 90 dias' });
    const c = (await backend.data.get('customers', cid))!;
    expect(c).toMatchObject({ creditLimit: 6000, paymentTerms: '28/35', preferredPaymentMethod: 'BOLETO', financialApproval: 'APPROVED', financialApprovedBy: FINANCE.name, sellerId: SELLER.id, status: 'ACTIVE' });
    const r = (await backend.data.get('customer_requests', req.id))!;
    expect(r).toMatchObject({ status: 'APPROVED', createdCustomerId: cid, reviewedByName: FINANCE.name });
    expect(r.financialApproval).toMatchObject({ creditLimit: 6000, paymentTerms: '28/35', paymentMethod: 'BOLETO', notes: 'Revisar em 90 dias' });
  });

  it('documento já cadastrado: a liberação reativa o cliente existente', async () => {
    const old = await backend.data.insert('customers', {
      name: 'Açougue Antigo',
      personType: 'J',
      document: '11444777000161',
      category: 'EXTERNO_CNPJ',
      creditLimit: 0,
      allowedPaymentMethods: ['PIX'],
      financialApproval: 'PENDING',
      isIntercompany: false,
      status: 'BLOCKED',
      ranking: 'BRONZE',
      stars: 0,
      totalPurchases: 0,
      ordersCount: 0,
      documents: [],
    });
    const req = await request();
    const cid = await opsAs(FINANCE).approveCustomerRequest(req.id, {}, { creditLimit: 3000 });
    expect(cid).toBe(old.id);
    expect(await backend.data.list('customers')).toHaveLength(1);
    expect((await backend.data.get('customers', old.id))!).toMatchObject({ status: 'ACTIVE', creditLimit: 3000, financialApproval: 'APPROVED', name: 'Açougue Antigo' });
  });

  it('financeiro bloqueia com motivo (e bloqueia o cliente do mesmo documento)', async () => {
    const c = await backend.data.insert('customers', {
      name: 'Bar',
      personType: 'J',
      document: '11444777000161',
      category: 'EXTERNO_CNPJ',
      creditLimit: 0,
      allowedPaymentMethods: ['PIX'],
      financialApproval: 'APPROVED',
      isIntercompany: false,
      status: 'ACTIVE',
      ranking: 'BRONZE',
      stars: 0,
      totalPurchases: 0,
      ordersCount: 0,
      documents: [],
    });
    const req = await request();
    await expect(opsAs(FINANCE).blockCustomerRequest(req.id, ' ')).rejects.toThrow(/motivo/);
    await opsAs(FINANCE).blockCustomerRequest(req.id, 'Protestos no CNPJ');
    expect((await backend.data.get('customer_requests', req.id))!).toMatchObject({ status: 'BLOCKED', blockReason: 'Protestos no CNPJ' });
    expect((await backend.data.get('customers', c.id))!.status).toBe('BLOCKED');
    await expect(opsAs(FINANCE).approveCustomerRequest(req.id)).rejects.toThrow(/analisada/);
  });
});

describe('portal: convites e preço oficial', () => {
  async function portalSetup() {
    const product = await backend.data.insert('products', { name: 'Picanha', category: 'Traseiro', meatType: 'GRILL', unit: 'KG', defaultPrice: 100, active: true });
    const table = await backend.data.insert('price_tables', {
      name: 'Negociada',
      kind: 'GENERAL',
      status: 'ACTIVE',
      approvalStatus: 'APPROVED',
      items: [{ productId: product.id, productName: 'Picanha', unit: 'KG', price: 90 }],
    } as never);
    const customer = await backend.data.insert('customers', {
      name: 'Churrascaria Convidada',
      personType: 'J',
      document: '11222333000181',
      category: 'EXTERNO_CNPJ',
      creditLimit: 0,
      allowedPaymentMethods: ['PIX'],
      financialApproval: 'APPROVED',
      isIntercompany: false,
      status: 'ACTIVE',
      ranking: 'BRONZE',
      stars: 0,
      totalPurchases: 0,
      ordersCount: 0,
      documents: [],
      priceTableId: table.id,
      zipCode: '13010100',
    });
    const cat = await backend.data.insert('catalog_items', {
      productId: product.id,
      name: 'Picanha',
      category: 'Traseiro',
      unit: 'KG',
      price: 100,
      minQty: 1,
      step: 0.5,
      available: true,
      featured: true,
      sortOrder: 1,
    });
    await opsAs(ADMIN).addStockEntry({ productId: product.id, qty: 50, unitCost: 55, entryDate: '2026-09-01' });
    return { product, table, customer, cat };
  }

  it('convite: no primeiro acesso a conta entra aprovada e ligada ao cliente', async () => {
    const { customer } = await portalSetup();
    await opsAs(ADMIN).createPortalInvite({ email: ' Compras@Convidada.com ', customerId: customer.id, name: 'João' });
    expect((await backend.data.get('portal_invites', 'compras@convidada.com'))!).toMatchObject({ status: 'PENDING', customerId: customer.id, customerName: customer.name, priceTableId: customer.priceTableId });

    await backend.auth.signUpPortal({ email: 'compras@convidada.com', password: '123456', name: 'João', personType: 'J' } as never);
    const r = await backend.auth.getPortalAccount();
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.account).toMatchObject({ status: 'APPROVED', customerId: customer.id, approvedByName: 'Convite do portal' });
    expect((await backend.data.get('portal_invites', 'compras@convidada.com'))!).toMatchObject({ status: 'ACCEPTED', accountId: r.account.id });

    await expect(opsAs(ADMIN).createPortalInvite({ email: 'compras@convidada.com', customerId: customer.id })).rejects.toThrow(/já tem acesso/);
  });

  it('convite para conta já em análise libera na hora; cancelar convite', async () => {
    const { customer } = await portalSetup();
    await backend.data.insert('portal_accounts', { id: 'acc-w', email: 'espera@x.com', name: 'Wagner', status: 'PENDING' });
    await opsAs(ADMIN).createPortalInvite({ email: 'espera@x.com', customerId: customer.id });
    expect((await backend.data.get('portal_accounts', 'acc-w'))!).toMatchObject({ status: 'APPROVED', customerId: customer.id });
    await opsAs(ADMIN).createPortalInvite({ email: 'outro@x.com', customerId: customer.id });
    await opsAs(ADMIN).revokePortalInvite('outro@x.com');
    expect((await backend.data.get('portal_invites', 'outro@x.com'))!.status).toBe('REVOKED');
    await expect(opsAs(SELLER).createPortalInvite({ email: 'y@x.com', customerId: customer.id })).rejects.toThrow();
  });

  it('pedido do portal usa a tabela negociada e a aprovação corrige preço adulterado', async () => {
    const { customer, cat } = await portalSetup();
    await backend.data.insert('portal_accounts', { id: 'acc-1', email: 'c@x.com', name: 'Cliente', status: 'APPROVED', customerId: customer.id });
    const portal = createOps({ data: backend.data, actor: { id: 'acc-1', name: 'Cliente', email: 'c@x.com', role: 'CUSTOMER' } });
    const sale = await portal.submitPortalOrder({ items: [{ catalogItemId: cat.id, qty: 10 }], deliveryMode: 'PICKUP' });
    expect(sale.items[0].unitPrice).toBe(90); // tabela do cliente, não o catálogo (100)

    // Navegador adulterado: grava o item por R$ 1/kg.
    const item = (await backend.data.list('sale_items', { where: [['saleId', '==', sale.id]] }))[0];
    const cur = (await backend.data.get('sales', sale.id))!;
    await backend.data.update('sales', sale.id, { items: cur.items.map((i) => (i.id === item.id ? { ...i, unitPrice: 1, total: 10 } : i)), itemsSubtotal: 10, totalValue: 10 });

    await opsAs(ADMIN).approveSale(sale.id);
    const ok = (await backend.data.get('sales', sale.id))!;
    expect(ok.items[0]).toMatchObject({ unitPrice: 90, total: 900 });
    expect(ok.totalValue).toBe(900);
    expect(ok.history.at(-1)!.note).toMatch(/Preços conferidos/);
  });
});
