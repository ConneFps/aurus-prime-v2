/**
 * Equinos: venda de animais e compra/uso de sêmen.
 */
import { money } from '../../domain/format';
import type { Ops, OpsContext } from '../types';
import { appendNote, assert, audit, clean, isISODate, isNonNeg, isPos, mustGet, newId, requirePerm, round2, runTx } from './common';
import { closeOpenEntries, insertEntryLines } from './finance';

type EquineKeys = 'registerEquineSale' | 'cancelEquineSale' | 'registerSemenPurchase' | 'useSemenDoses';

export function equineOps(ctx: OpsContext): Pick<Ops, EquineKeys> {
  const { actor } = ctx;
  return {
    async registerEquineSale(input) {
      requirePerm(actor, 'equines.manage');
      assert(clean(input.buyerName), 'Informe o comprador.');
      assert(isISODate(input.date), 'Informe a data da venda.');
      assert(isPos(input.totalPrice), 'Informe o valor da venda.');
      return runTx(ctx, async (tx) => {
        const eq = await mustGet(tx, 'equines', input.equineId, 'Animal não encontrado.');
        assert(eq.status !== 'SOLD' && eq.status !== 'DECEASED', `${eq.name} não está disponível para venda.`);
        const id = newId();
        const rows = insertEntryLines(
          tx,
          {
            direction: 'IN',
            category: 'EQUINE_SALE',
            description: `Venda do equino ${eq.name} — ${input.buyerName.trim()}`,
            partyType: 'OTHER',
            partyName: input.buyerName.trim(),
            equineSaleId: id,
            method: input.plan.method ?? null,
            notes: clean(input.notes),
          },
          input.totalPrice,
          input.plan,
          input.date,
        );
        tx.insert('equine_sales', {
          id,
          equineId: eq.id,
          equineName: eq.name,
          buyerName: input.buyerName.trim(),
          buyerDocument: clean(input.buyerDocument),
          buyerPhone: clean(input.buyerPhone),
          buyerEmail: clean(input.buyerEmail),
          buyerAddress: clean(input.buyerAddress),
          date: input.date,
          totalPrice: round2(input.totalPrice),
          installmentsCount: rows.length,
          status: 'ACTIVE',
          notes: clean(input.notes),
        });
        tx.update('equines', eq.id, { status: 'SOLD' });
        audit(tx, actor, 'CREATE', 'equine_sales', id, `Venda do equino ${eq.name} para ${input.buyerName.trim()} — ${money(input.totalPrice)} em ${rows.length}x`);
        return id;
      });
    },

    async cancelEquineSale(equineSaleId, reason) {
      requirePerm(actor, 'equines.manage');
      assert(clean(reason), 'Informe o motivo do cancelamento.');
      await runTx(ctx, async (tx) => {
        const sale = await mustGet(tx, 'equine_sales', equineSaleId, 'Venda não encontrada.');
        assert(sale.status === 'ACTIVE', 'Esta venda já está cancelada.');
        const entries = (await tx.query('financial_entries', { where: [['equineSaleId', '==', equineSaleId]] })).filter((e) => e.status !== 'CANCELLED');
        const received = closeOpenEntries(tx, entries, `Venda do equino cancelada: ${reason.trim()}`);
        tx.update('equine_sales', equineSaleId, { status: 'CANCELLED', notes: appendNote(sale.notes, `Cancelada: ${reason.trim()}`) });
        const eq = await tx.get('equines', sale.equineId);
        if (eq && eq.status === 'SOLD') tx.update('equines', eq.id, { status: 'ACTIVE' });
        audit(
          tx,
          actor,
          'CANCEL',
          'equine_sales',
          equineSaleId,
          `Venda do equino ${sale.equineName} cancelada: ${reason.trim()}${received > 0 ? ` (já recebido ${money(received)})` : ''}`,
        );
      });
    },

    async registerSemenPurchase(input) {
      requirePerm(actor, 'equines.manage');
      assert(clean(input.stallionName), 'Informe o garanhão.');
      assert(clean(input.supplierName), 'Informe o fornecedor.');
      assert(isISODate(input.purchaseDate), 'Informe a data da compra.');
      assert(isPos(input.dosesQuantity) && Number.isInteger(input.dosesQuantity), 'Informe a quantidade de doses (número inteiro).');
      assert(isNonNeg(input.totalValue), 'Informe o valor total.');
      assert(['CONGELADO', 'REFRIGERADO', 'FRESCO'].includes(input.storageType), 'Informe o tipo de armazenamento.');
      return runTx(ctx, async (tx) => {
        const id = newId();
        const rows = insertEntryLines(
          tx,
          {
            direction: 'OUT',
            category: 'SEMEN',
            description: `Sêmen ${input.stallionName.trim()} — ${input.dosesQuantity} doses`,
            partyType: 'OTHER',
            partyName: input.supplierName.trim(),
            semenPurchaseId: id,
            documentNumber: clean(input.invoiceNumber),
            method: input.plan.method ?? null,
          },
          input.totalValue,
          input.plan,
          input.purchaseDate,
        );
        tx.insert('semen_purchases', {
          id,
          stallionName: input.stallionName.trim(),
          stallionBreed: clean(input.stallionBreed),
          stallionRegistry: clean(input.stallionRegistry),
          ownerHaras: clean(input.ownerHaras),
          supplierName: input.supplierName.trim(),
          supplierDocument: clean(input.supplierDocument),
          supplierContact: clean(input.supplierContact),
          invoiceNumber: clean(input.invoiceNumber),
          invoiceDate: input.invoiceDate ?? null,
          lotCode: clean(input.lotCode),
          purchaseDate: input.purchaseDate,
          dosesQuantity: input.dosesQuantity,
          dosesAvailable: input.dosesQuantity,
          dosePrice: input.dosePrice ?? (input.dosesQuantity ? round2(input.totalValue / input.dosesQuantity) : null),
          totalValue: round2(input.totalValue),
          storageType: input.storageType,
          canister: clean(input.canister),
          expiryDate: input.expiryDate ?? null,
          installmentsCount: Math.max(1, rows.length),
          paymentMethod: input.plan.method ?? null,
          intendedMares: clean(input.intendedMares),
          veterinarian: clean(input.veterinarian),
          status: 'ACTIVE',
          usage: [],
          notes: clean(input.notes),
        });
        audit(tx, actor, 'CREATE', 'semen_purchases', id, `Compra de sêmen: ${input.stallionName.trim()} — ${input.dosesQuantity} doses — ${money(input.totalValue)}`);
        return id;
      });
    },

    async useSemenDoses(purchaseId, input) {
      requirePerm(actor, 'equines.manage');
      assert(isISODate(input.date), 'Informe a data do uso.');
      assert(isPos(input.doses) && Number.isInteger(input.doses), 'Informe a quantidade de doses (número inteiro).');
      await runTx(ctx, async (tx) => {
        const p = await mustGet(tx, 'semen_purchases', purchaseId, 'Compra de sêmen não encontrada.');
        assert(p.status === 'ACTIVE', 'Esta compra de sêmen não está ativa.');
        assert(p.dosesAvailable >= input.doses, `Doses insuficientes: disponível ${p.dosesAvailable}.`);
        const left = p.dosesAvailable - input.doses;
        tx.update('semen_purchases', purchaseId, {
          dosesAvailable: left,
          status: left <= 0 ? 'DEPLETED' : 'ACTIVE',
          usage: [...(p.usage || []), { date: input.date, doses: input.doses, mareName: clean(input.mareName), notes: clean(input.notes) }],
        });
        audit(tx, actor, 'UPDATE', 'semen_purchases', purchaseId, `Uso de ${input.doses} dose(s) de ${p.stallionName}${input.mareName ? ` na égua ${input.mareName}` : ''}`);
      });
    },
  };
}
