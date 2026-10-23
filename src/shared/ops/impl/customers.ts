/**
 * Clientes: estatísticas/ranking, solicitações de cadastro e aprovação financeira.
 */
import type { NewRow, Tx } from '../../data/api';
import { onlyDigits, round2 } from '../../domain/format';
import { rankCustomer } from '../../domain/ranking';
import { ROLE_LABELS } from '../../domain/labels';
import type { Customer, CustomerRequestApproval } from '../../domain/types';
import type { Ops, OpsContext } from '../types';
import { assert, audit, clean, getSettings, mustGet, nowIso, requirePerm, runTx } from './common';

const NOT_COUNTED = ['DRAFT', 'PENDING_APPROVAL', 'CANCELLED', 'REJECTED'];

/** Recalcula total comprado, nº de pedidos, última compra e ranking (dentro da transação). */
export async function recalcCustomerStatsTx(tx: Tx, customerId: string | null | undefined): Promise<void> {
  if (!customerId) return;
  const customer = await tx.get('customers', customerId);
  if (!customer) return;
  const settings = await getSettings(tx);
  const sales = (await tx.query('sales', { where: [['customerId', '==', customerId]] })).filter((s) => !NOT_COUNTED.includes(s.status));
  const totalPurchases = round2(sales.reduce((s, x) => s + (x.totalValue || 0), 0));
  const lastDate = sales.reduce<string | null>((m, x) => (!m || x.date > m ? x.date : m), null);
  const { ranking, stars } = rankCustomer(totalPurchases, { silverFrom: settings.rankingSilverFrom, goldFrom: settings.rankingGoldFrom });
  const patch: Partial<Customer> = {
    totalPurchases,
    ordersCount: sales.length,
    lastPurchaseAt: lastDate ? `${lastDate}T12:00:00.000Z` : null,
    ranking,
    stars,
  };
  const changed =
    customer.totalPurchases !== patch.totalPurchases ||
    customer.ordersCount !== patch.ordersCount ||
    (customer.lastPurchaseAt ?? null) !== patch.lastPurchaseAt ||
    customer.ranking !== ranking ||
    customer.stars !== stars;
  if (changed) tx.update('customers', customerId, patch);
}

/** Valores padrão de um cliente novo. */
export function customerDefaults(): Omit<NewRow<'customers'>, 'name' | 'personType' | 'document' | 'category'> {
  return {
    status: 'ACTIVE',
    financialApproval: 'PENDING',
    creditLimit: 0,
    allowedPaymentMethods: ['PIX', 'BOLETO'],
    ranking: 'BRONZE',
    stars: 0,
    totalPurchases: 0,
    ordersCount: 0,
    lastPurchaseAt: null,
    documents: [],
    isIntercompany: false,
  };
}

/** Já existe cliente com este CPF/CNPJ? */
export async function findCustomerByDocument(tx: Tx, document: string): Promise<Customer | null> {
  const digits = onlyDigits(document);
  if (!digits) return null;
  const variants = Array.from(new Set([document, digits].filter(Boolean)));
  const rows = await tx.query('customers', { where: [['document', 'in', variants]] });
  return rows[0] ?? null;
}

export function customerOps(
  ctx: OpsContext,
): Pick<Ops, 'recalcCustomerStats' | 'approveCustomerRequest' | 'rejectCustomerRequest' | 'blockCustomerRequest' | 'setCustomerFinancialApproval'> {
  const { actor } = ctx;
  return {
    async recalcCustomerStats(customerId) {
      requirePerm(actor, 'customers.manage');
      await runTx(ctx, async (tx) => {
        await mustGet(tx, 'customers', customerId, 'Cliente não encontrado.');
        await recalcCustomerStatsTx(tx, customerId);
      });
    },

    async approveCustomerRequest(requestId, overrides, financial) {
      requirePerm(actor, 'customers.approveFinancial');
      if (financial) {
        assert(Number.isFinite(financial.creditLimit) && financial.creditLimit >= 0, 'Informe o limite de crédito liberado (0 = sem crédito a prazo).');
      }
      return runTx(ctx, async (tx) => {
        const req = await mustGet(tx, 'customer_requests', requestId, 'Solicitação não encontrada.');
        assert(req.status === 'PENDING', 'Esta solicitação já foi analisada.');
        const document = onlyDigits(overrides?.document ?? req.document);
        assert(document, 'A solicitação não tem CPF/CNPJ.');
        const now = nowIso();
        const release: CustomerRequestApproval | null = financial
          ? {
              creditLimit: round2(financial.creditLimit),
              paymentTerms: clean(financial.paymentTerms),
              paymentMethod: financial.paymentMethod ?? null,
              approvedAt: now,
              approvedByName: actor.name,
              notes: clean(financial.notes),
            }
          : null;
        const financialPatch: Partial<Customer> = release
          ? {
              creditLimit: release.creditLimit,
              paymentTerms: release.paymentTerms ?? null,
              preferredPaymentMethod: release.paymentMethod ?? null,
              financialApproval: 'APPROVED',
              financialApprovalNotes: release.notes ?? null,
              financialApprovedBy: actor.name,
              financialApprovedAt: now,
            }
          : {};
        const reviewed = {
          reviewedByName: actor.name,
          reviewedByRole: ROLE_LABELS[actor.role as keyof typeof ROLE_LABELS] || actor.role,
          reviewedAt: now,
          financialApproval: release,
        };
        // Já existe cliente com este documento: reativa e aplica as condições liberadas.
        const dup = await findCustomerByDocument(tx, document);
        if (dup) {
          tx.update('customers', dup.id, { status: 'ACTIVE', ...financialPatch });
          tx.update('customer_requests', requestId, { status: 'APPROVED', createdCustomerId: dup.id, ...reviewed });
          audit(tx, actor, 'APPROVE', 'customer_requests', requestId, `Pré-cadastro liberado para cliente já existente: ${dup.name}${release ? ` — limite ${release.creditLimit}` : ''}`, {
            customerId: dup.id,
          });
          return dup.id;
        }
        const { id: _id, createdAt: _c, updatedAt: _u, ...ov } = (overrides || {}) as Partial<Customer>;
        const row: NewRow<'customers'> = {
          ...customerDefaults(),
          name: req.name,
          tradeName: req.tradeName ?? null,
          personType: req.personType,
          document,
          category: req.category,
          stateRegistration: req.stateRegistration ?? null,
          contactName: req.contactName ?? null,
          phone: req.phone ?? null,
          cellphone: req.cellphone ?? null,
          email: req.email ?? null,
          zipCode: req.zipCode ?? null,
          street: req.street ?? null,
          number: req.number ?? null,
          complement: req.complement ?? null,
          district: req.district ?? null,
          city: req.city ?? null,
          state: req.state ?? null,
          notes: req.notes ?? null,
          sellerId: req.requestedById,
          sellerName: req.requestedByName,
          ...ov,
          ...financialPatch,
        };
        row.document = onlyDigits(row.document) || document;
        assert(clean(row.name), 'Informe o nome do cliente.');
        const customerId = tx.insert('customers', row);
        tx.update('customer_requests', requestId, { status: 'APPROVED', createdCustomerId: customerId, ...reviewed });
        audit(tx, actor, 'APPROVE', 'customer_requests', requestId, `Cadastro liberado: ${row.name} (solicitado por ${req.requestedByName})${release ? ` — limite ${release.creditLimit}` : ''}`, {
          customerId,
        });
        return customerId;
      });
    },

    async blockCustomerRequest(requestId, reason) {
      requirePerm(actor, 'customers.approveFinancial');
      assert(clean(reason), 'Informe o motivo do bloqueio.');
      await runTx(ctx, async (tx) => {
        const req = await mustGet(tx, 'customer_requests', requestId, 'Solicitação não encontrada.');
        assert(req.status === 'PENDING', 'Esta solicitação já foi analisada.');
        const dup = req.document ? await findCustomerByDocument(tx, req.document) : null;
        if (dup && dup.status !== 'BLOCKED') tx.update('customers', dup.id, { status: 'BLOCKED' });
        tx.update('customer_requests', requestId, {
          status: 'BLOCKED',
          blockReason: reason.trim(),
          rejectionReason: reason.trim(),
          reviewedByName: actor.name,
          reviewedByRole: ROLE_LABELS[actor.role as keyof typeof ROLE_LABELS] || actor.role,
          reviewedAt: nowIso(),
        });
        audit(tx, actor, 'REJECT', 'customer_requests', requestId, `Pré-cadastro bloqueado pelo financeiro: ${req.name} — ${reason.trim()}`, {
          customerId: dup?.id ?? null,
        });
      });
    },

    async rejectCustomerRequest(requestId, reason) {
      requirePerm(actor, 'customers.approveFinancial');
      assert(clean(reason), 'Informe o motivo da recusa.');
      await runTx(ctx, async (tx) => {
        const req = await mustGet(tx, 'customer_requests', requestId, 'Solicitação não encontrada.');
        assert(req.status === 'PENDING', 'Esta solicitação já foi analisada.');
        tx.update('customer_requests', requestId, {
          status: 'REJECTED',
          rejectionReason: reason.trim(),
          reviewedByName: actor.name,
          reviewedAt: nowIso(),
        });
        audit(tx, actor, 'REJECT', 'customer_requests', requestId, `Cadastro recusado: ${req.name} — ${reason.trim()}`);
      });
    },

    async setCustomerFinancialApproval(customerId, status, notes) {
      requirePerm(actor, 'customers.approveFinancial');
      assert(['APPROVED', 'REJECTED', 'PENDING'].includes(status), 'Situação financeira inválida.');
      await runTx(ctx, async (tx) => {
        const c = await mustGet(tx, 'customers', customerId, 'Cliente não encontrado.');
        tx.update('customers', customerId, {
          financialApproval: status,
          financialApprovalNotes: clean(notes),
          financialApprovedBy: status === 'PENDING' ? null : actor.name,
          financialApprovedAt: status === 'PENDING' ? null : nowIso(),
        });
        const label = status === 'APPROVED' ? 'aprovado' : status === 'REJECTED' ? 'reprovado' : 'voltou para análise';
        audit(tx, actor, status === 'APPROVED' ? 'APPROVE' : status === 'REJECTED' ? 'REJECT' : 'UPDATE', 'customers', customerId, `Crédito ${label}: ${c.name}`, {
          notes: clean(notes),
        });
      });
    },
  };
}
