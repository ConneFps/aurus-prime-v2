/**
 * Gado: lotes, animais, custos, ração e abate.
 */
import type { Tx } from '../../data/api';
import { addDays, kg, money } from '../../domain/format';
import { COST_CATEGORIES } from '../../domain/labels';
import type { AnimalInput, BatchCostInput, InstallmentPlan, Ops, OpsContext } from '../types';
import type { Batch, BatchCost, CostCategory, ISODate } from '../../domain/types';
import {
  appendNote,
  assert,
  audit,
  clean,
  isISODate,
  isNonNeg,
  isPos,
  mustGet,
  newId,
  nextBatchCode,
  nowIso,
  requirePerm,
  actorCan,
  round2,
  round3,
  round4,
  runTx,
} from './common';
import type { Actor } from '../types';
import { entryCategoryForCost, insertEntryLines } from './finance';
import { insertLot } from './stock';

const MAX_ANIMALS_PER_TX = 400;
const IMPORT_CHUNK = 400;

const costLabel = (c: CostCategory) => (COST_CATEGORIES[c] || COST_CATEGORIES.OTHER).label;
const isCredit = (c: CostCategory) => (COST_CATEGORIES[c] || COST_CATEGORIES.OTHER).group === 'CREDIT';

/** Soma líquida dos custos (créditos subtraídos). */
export function netCost(costs: Pick<BatchCost, 'category' | 'amount'>[]): number {
  return round2(costs.reduce((s, c) => s + (isCredit(c.category) ? -1 : 1) * (Number(c.amount) || 0), 0));
}

function validateAnimals(animals: AnimalInput[]) {
  assert(animals.length <= MAX_ANIMALS_PER_TX, `Cadastre no máximo ${MAX_ANIMALS_PER_TX} animais por vez.`);
  const seen = new Set<string>();
  const dupInput: string[] = [];
  animals.forEach((a, i) => {
    const tag = (a.tag || '').trim();
    assert(tag, `Animal ${i + 1}: informe o brinco.`);
    assert(isPos(a.entryWeightKg), `Animal ${tag}: informe o peso de entrada.`);
    assert(isNonNeg(a.purchasePrice), `Animal ${tag}: preço de compra inválido.`);
    const k = tag.toUpperCase();
    if (seen.has(k)) dupInput.push(tag);
    seen.add(k);
  });
  assert(!dupInput.length, `Brincos repetidos na lista: ${dupInput.join(', ')}.`);
}

/** Garante brincos únicos entre os animais vivos. */
async function assertTagsFree(tx: Tx, tags: string[], ignoreAnimalId?: string) {
  if (!tags.length) return;
  const alive = await tx.query('animals', { where: [['status', '==', 'ALIVE']] });
  const used = new Set(alive.filter((a) => a.id !== ignoreAnimalId).map((a) => a.tag.trim().toUpperCase()));
  const dups = tags.filter((t) => used.has(t.trim().toUpperCase()));
  assert(!dups.length, `Brincos já cadastrados em animais vivos: ${dups.join(', ')}.`);
}

function insertAnimals(tx: Tx, batchId: string, animals: AnimalInput[]) {
  for (const a of animals) {
    tx.insert('animals', {
      batchId,
      tag: a.tag.trim(),
      sex: a.sex ?? null,
      breed: clean(a.breed),
      entryWeightKg: round3(a.entryWeightKg),
      purchasePrice: round2(a.purchasePrice),
      currentWeightKg: round3(a.entryWeightKg),
      exitWeightKg: null,
      carcassWeightKg: null,
      status: 'ALIVE',
      notes: clean(a.notes),
    });
  }
}

/** Lança custo no lote (+ conta a pagar opcional). Retorna o id do custo. */
function insertCost(
  tx: Tx,
  actor: Actor,
  batch: Batch,
  c: {
    category: CostCategory;
    date: ISODate;
    amount: number;
    description?: string | null;
    documentNumber?: string | null;
    partnerId?: string | null;
    partnerName?: string | null;
    source: BatchCost['source'];
    sourceId?: string | null;
    createPayable?: InstallmentPlan | null;
  },
): string {
  const costId = newId();
  let financialEntryId: string | null = null;
  if (c.createPayable) {
    const credit = isCredit(c.category);
    const rows = insertEntryLines(
      tx,
      {
        direction: credit ? 'IN' : 'OUT',
        category: credit ? 'OTHER' : entryCategoryForCost(c.category),
        description: `${costLabel(c.category)} — ${batch.code}${c.description ? ` · ${c.description}` : ''}`,
        partyType: c.partnerId ? 'PARTNER' : 'OTHER',
        partyId: c.partnerId ?? null,
        partyName: c.partnerName || costLabel(c.category),
        batchId: batch.id,
        batchCostId: costId,
        documentNumber: c.documentNumber ?? null,
        company: batch.company ?? null,
        method: c.createPayable.method ?? null,
      },
      c.amount,
      c.createPayable,
      c.date,
    );
    financialEntryId = rows[0]?.id ?? null;
  }
  tx.insert('batch_costs', {
    id: costId,
    batchId: batch.id,
    category: c.category,
    date: c.date,
    amount: round2(c.amount),
    description: clean(c.description),
    documentNumber: clean(c.documentNumber),
    partnerId: c.partnerId ?? null,
    partnerName: c.partnerName ?? null,
    source: c.source,
    sourceId: c.sourceId ?? null,
    financialEntryId,
    createdById: actor.id,
    createdByName: actor.name,
  });
  return costId;
}

function validateCostInput(c: BatchCostInput, label = '') {
  assert(c.batchId, `${label}Informe o lote.`);
  assert(c.category && COST_CATEGORIES[c.category], `${label}Categoria de custo inválida.`);
  assert(isISODate(c.date), `${label}Informe a data do custo.`);
  assert(isPos(c.amount), `${label}Informe um valor maior que zero.`);
}

type CattleKeys =
  | 'createBatch'
  | 'updateBatch'
  | 'addAnimals'
  | 'setAnimalStatus'
  | 'addBatchCost'
  | 'removeBatchCost'
  | 'importBatchCosts'
  | 'registerFeedPurchase'
  | 'registerFeedConsumption'
  | 'removeFeedConsumption'
  | 'registerSlaughter'
  | 'finishBatch';

export function cattleOps(ctx: OpsContext): Pick<Ops, CattleKeys> {
  const { actor } = ctx;
  return {
    async createBatch(input) {
      requirePerm(actor, 'cattle.manage');
      assert(clean(input.name), 'Informe o nome do lote.');
      assert(isISODate(input.purchaseDate), 'Informe a data de compra.');
      assert(input.managementType === 'CAMPO' || input.managementType === 'CONFINAMENTO', 'Informe o tipo de manejo.');
      const animals = input.animals || [];
      validateAnimals(animals);
      const headCount = animals.length || Math.floor(input.headCount || 0);
      assert(headCount > 0, 'Informe os animais ou a quantidade de cabeças.');
      return runTx(ctx, async (tx) => {
        await assertTagsFree(
          tx,
          animals.map((a) => a.tag.trim()),
        );
        let code = clean(input.code);
        if (code) {
          const dup = await tx.query('batches', { where: [['code', '==', code]] });
          assert(!dup.length, `Já existe um lote com o código ${code}.`);
        } else code = await nextBatchCode(tx, input.purchaseDate);
        let supplierName: string | null = null;
        if (input.supplierId) supplierName = (await mustGet(tx, 'partners', input.supplierId, 'Fornecedor não encontrado.')).name;
        const weight = animals.length ? round3(animals.reduce((s, a) => s + a.entryWeightKg, 0)) : input.purchaseWeightKg ?? null;
        const id = newId();
        const batch: Batch = {
          id,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          code,
          name: input.name.trim(),
          description: clean(input.description),
          managementType: input.managementType,
          status: 'PURCHASED',
          company: input.company ?? null,
          supplierId: input.supplierId ?? null,
          supplierName,
          purchaseDate: input.purchaseDate,
          purchaseInvoice: clean(input.purchaseInvoice),
          gtaNumber: clean(input.gtaNumber),
          headCount,
          purchaseWeightKg: weight,
          confinementEntryWeightKg: input.confinementEntryWeightKg ?? null,
          estimatedSlaughterDate: input.estimatedSlaughterDate ?? null,
          sellingPricePerKg: input.sellingPricePerKg ?? null,
          notes: clean(input.notes),
        };
        tx.insert('batches', batch);
        insertAnimals(tx, id, animals);
        if (input.purchaseCost !== null) {
          const amount = round2(input.purchaseCost?.amount ?? animals.reduce((s, a) => s + (a.purchasePrice || 0), 0));
          if (amount > 0) {
            insertCost(tx, actor, batch, {
              category: 'PURCHASE',
              date: input.purchaseDate,
              amount,
              description: `Compra de ${headCount} cabeças`,
              documentNumber: input.purchaseCost?.documentNumber ?? input.purchaseInvoice ?? null,
              partnerId: input.supplierId ?? null,
              partnerName: supplierName,
              source: 'MANUAL',
              createPayable: input.purchaseCost?.createPayable ?? null,
            });
          }
        }
        audit(tx, actor, 'CREATE', 'batches', id, `Lote ${code} cadastrado — ${headCount} cabeças${supplierName ? ` de ${supplierName}` : ''}`);
        return id;
      });
    },

    async updateBatch(id, patch) {
      requirePerm(actor, 'cattle.manage');
      await runTx(ctx, async (tx) => {
        const batch = await mustGet(tx, 'batches', id, 'Lote não encontrado.');
        const upd: Partial<Batch> = {};
        if (patch.code !== undefined && clean(patch.code) && clean(patch.code) !== batch.code) {
          const code = clean(patch.code)!;
          const dup = await tx.query('batches', { where: [['code', '==', code]] });
          assert(!dup.some((b) => b.id !== id), `Já existe um lote com o código ${code}.`);
          upd.code = code;
        }
        if (patch.name !== undefined) {
          assert(clean(patch.name), 'Informe o nome do lote.');
          upd.name = patch.name.trim();
        }
        if (patch.supplierId !== undefined) {
          upd.supplierId = patch.supplierId ?? null;
          upd.supplierName = patch.supplierId ? (await mustGet(tx, 'partners', patch.supplierId, 'Fornecedor não encontrado.')).name : null;
        }
        if (patch.purchaseDate !== undefined) {
          assert(isISODate(patch.purchaseDate), 'Data de compra inválida.');
          upd.purchaseDate = patch.purchaseDate;
        }
        if (patch.headCount !== undefined) {
          assert(isPos(patch.headCount), 'Quantidade de cabeças inválida.');
          upd.headCount = Math.floor(patch.headCount);
        }
        const simple = [
          'description',
          'managementType',
          'company',
          'purchaseInvoice',
          'gtaNumber',
          'estimatedSlaughterDate',
          'confinementEntryWeightKg',
          'sellingPricePerKg',
          'notes',
          'purchaseWeightKg',
        ] as const;
        for (const k of simple) if (patch[k] !== undefined) (upd as Record<string, unknown>)[k] = patch[k] ?? null;
        if (patch.revenueOverride !== undefined) upd.revenueOverride = patch.revenueOverride ?? null;
        if (patch.status !== undefined && patch.status !== batch.status) {
          assert(
            ['PURCHASED', 'IN_PASTURE'].includes(batch.status) && ['PURCHASED', 'IN_PASTURE'].includes(patch.status),
            'O status só pode alternar entre "Comprado" e "Em engorda". Use o registro de abate ou o encerramento.',
          );
          upd.status = patch.status;
        }
        tx.update('batches', id, upd);
        audit(tx, actor, 'UPDATE', 'batches', id, `Lote ${upd.code || batch.code} alterado`, { fields: Object.keys(upd) });
      });
    },

    async addAnimals(batchId, animals) {
      requirePerm(actor, 'cattle.manage');
      assert(animals && animals.length, 'Informe os animais.');
      validateAnimals(animals);
      await runTx(ctx, async (tx) => {
        const batch = await mustGet(tx, 'batches', batchId, 'Lote não encontrado.');
        assert(batch.status === 'PURCHASED' || batch.status === 'IN_PASTURE', 'Só é possível incluir animais em lotes comprados ou em engorda.');
        await assertTagsFree(
          tx,
          animals.map((a) => a.tag.trim()),
        );
        insertAnimals(tx, batchId, animals);
        const add = round3(animals.reduce((s, a) => s + a.entryWeightKg, 0));
        tx.update('batches', batchId, {
          headCount: (batch.headCount || 0) + animals.length,
          purchaseWeightKg: round3((batch.purchaseWeightKg || 0) + add),
        });
        audit(tx, actor, 'CREATE', 'animals', batchId, `${animals.length} animais incluídos no lote ${batch.code}`);
      });
    },

    async setAnimalStatus(animalId, status, notes) {
      requirePerm(actor, 'cattle.manage');
      assert(['DEAD', 'SOLD', 'ALIVE'].includes(status), 'Situação inválida.');
      await runTx(ctx, async (tx) => {
        const a = await mustGet(tx, 'animals', animalId, 'Animal não encontrado.');
        assert(a.status !== 'SLAUGHTERED', 'Animal já abatido não pode mudar de situação.');
        assert(a.status !== status, 'O animal já está nesta situação.');
        if (status === 'ALIVE') await assertTagsFree(tx, [a.tag], a.id);
        const label = status === 'DEAD' ? 'Morte' : status === 'SOLD' ? 'Venda do animal vivo' : 'Retorno para vivo';
        tx.update('animals', animalId, { status, notes: clean(notes) ? appendNote(a.notes, `${label}: ${notes!.trim()}`) : a.notes ?? null });
        audit(tx, actor, 'UPDATE', 'animals', animalId, `Brinco ${a.tag}: ${label}`, { batchId: a.batchId });
      });
    },

    async addBatchCost(input) {
      requirePerm(actor, 'costs.manage');
      validateCostInput(input);
      return runTx(ctx, async (tx) => {
        const batch = await mustGet(tx, 'batches', input.batchId, 'Lote não encontrado.');
        let partnerName: string | null = null;
        if (input.partnerId) partnerName = (await mustGet(tx, 'partners', input.partnerId, 'Parceiro não encontrado.')).name;
        const id = insertCost(tx, actor, batch, {
          category: input.category,
          date: input.date,
          amount: input.amount,
          description: input.description,
          documentNumber: input.documentNumber,
          partnerId: input.partnerId ?? null,
          partnerName,
          source: 'MANUAL',
          createPayable: input.createPayable ?? null,
        });
        audit(tx, actor, 'CREATE', 'batch_costs', id, `Custo lançado no lote ${batch.code}: ${costLabel(input.category)} ${money(input.amount)}`);
        return id;
      });
    },

    async removeBatchCost(costId) {
      requirePerm(actor, 'costs.manage');
      await runTx(ctx, async (tx) => {
        const cost = await mustGet(tx, 'batch_costs', costId, 'Custo não encontrado.');
        const origin: Record<string, string> = {
          FEED: 'Este custo veio de um consumo de ração — remova o consumo na tela de Ração.',
          SLAUGHTER: 'Este custo foi lançado no abate — corrija pelo registro de abate.',
          PROCESSING: 'Este custo veio de uma ordem de desossa — cancele/corrija a ordem.',
        };
        assert(!origin[cost.source], origin[cost.source]);
        if (cost.financialEntryId) {
          const first = await tx.get('financial_entries', cost.financialEntryId);
          if (first) {
            const byLink = await tx.query('financial_entries', { where: [['batchCostId', '==', costId]] });
            const group = byLink.length
              ? byLink
              : (await tx.query('financial_entries', { where: [['batchId', '==', cost.batchId]] })).filter(
                  (e) => e.description === first.description && e.issueDate === first.issueDate && e.installments === first.installments,
                );
            assert(
              group.every((e) => (e.paidAmount || 0) <= 0.005),
              'A conta a pagar deste custo já tem pagamento — estorne o pagamento antes de remover.',
            );
            for (const e of group) {
              if (e.status === 'OPEN') tx.update('financial_entries', e.id, { status: 'CANCELLED', notes: appendNote(e.notes, 'Custo do lote removido.') });
            }
          }
        }
        tx.delete('batch_costs', costId);
        audit(tx, actor, 'DELETE', 'batch_costs', costId, `Custo removido: ${costLabel(cost.category)} ${money(cost.amount)}`, { batchId: cost.batchId });
      });
    },

    async importBatchCosts(rows) {
      requirePerm(actor, 'costs.manage');
      assert(rows && rows.length, 'Nenhuma linha para importar.');
      rows.forEach((r, i) => validateCostInput(r, `Linha ${i + 1}: `));
      // Lotes de escrita: cada custo = 1 gravação (+ parcelas quando gera conta a pagar).
      const chunks: BatchCostInput[][] = [];
      let cur: BatchCostInput[] = [];
      let writes = 0;
      for (const r of rows) {
        const w = 1 + (r.createPayable ? Math.max(1, (r.createPayable.terms || '').split('/').length, r.createPayable.installments || 1) : 0);
        if (cur.length && writes + w > IMPORT_CHUNK) {
          chunks.push(cur);
          cur = [];
          writes = 0;
        }
        cur.push(r);
        writes += w;
      }
      if (cur.length) chunks.push(cur);
      let count = 0;
      for (const chunk of chunks) {
        count += await runTx(ctx, async (tx) => {
          const batches = new Map<string, Batch>();
          const partners = new Map<string, string | null>();
          for (const r of chunk) {
            if (!batches.has(r.batchId)) batches.set(r.batchId, await mustGet(tx, 'batches', r.batchId, `Lote não encontrado: ${r.batchId}.`));
            if (r.partnerId && !partners.has(r.partnerId)) partners.set(r.partnerId, (await tx.get('partners', r.partnerId))?.name ?? null);
          }
          for (const r of chunk) {
            insertCost(tx, actor, batches.get(r.batchId)!, {
              category: r.category,
              date: r.date,
              amount: r.amount,
              description: r.description,
              documentNumber: r.documentNumber,
              partnerId: r.partnerId ?? null,
              partnerName: r.partnerId ? partners.get(r.partnerId) ?? null : null,
              source: 'IMPORT',
              createPayable: r.createPayable ?? null,
            });
          }
          audit(tx, actor, 'IMPORT', 'batch_costs', null, `${chunk.length} custos importados`, {
            total: round2(chunk.reduce((s, r) => s + r.amount, 0)),
          });
          return chunk.length;
        });
      }
      return count;
    },

    async registerFeedPurchase(input) {
      requirePerm(actor, 'cattle.manage');
      assert(clean(input.invoiceNumber), 'Informe o número da nota fiscal.');
      assert(isISODate(input.entryDate), 'Informe a data de entrada.');
      assert(isPos(input.quantityKg), 'Informe a quantidade (kg).');
      assert(isNonNeg(input.totalValue), 'Informe o valor total.');
      return runTx(ctx, async (tx) => {
        const type = await mustGet(tx, 'feed_types', input.feedTypeId, 'Tipo de ração não encontrado.');
        let supplierName: string | null = null;
        if (input.supplierId) supplierName = (await mustGet(tx, 'partners', input.supplierId, 'Fornecedor não encontrado.')).name;
        for (const b of input.batchIds || []) await mustGet(tx, 'batches', b, 'Lote vinculado não encontrado.');
        const id = newId();
        const qty = round3(input.quantityKg);
        tx.insert('feed_purchases', {
          id,
          feedTypeId: type.id,
          feedTypeName: type.name,
          supplierId: input.supplierId ?? null,
          supplierName,
          invoiceNumber: input.invoiceNumber.trim(),
          entryDate: input.entryDate,
          quantityKg: qty,
          remainingKg: qty,
          totalValue: round2(input.totalValue),
          unitCost: round4(input.totalValue / qty),
          batchIds: input.batchIds || [],
          status: 'AVAILABLE',
          notes: clean(input.notes),
        });
        if (input.createPayable && input.totalValue > 0) {
          insertEntryLines(
            tx,
            {
              direction: 'OUT',
              category: 'FEED',
              description: `${type.name} — NF ${input.invoiceNumber.trim()}`,
              partyType: input.supplierId ? 'PARTNER' : 'OTHER',
              partyId: input.supplierId ?? null,
              partyName: supplierName || 'Fornecedor de ração',
              documentNumber: input.invoiceNumber.trim(),
              method: input.createPayable.method ?? null,
            },
            input.totalValue,
            input.createPayable,
            input.entryDate,
          );
        }
        audit(tx, actor, 'CREATE', 'feed_purchases', id, `Compra de ração: ${type.name} ${kg(qty)} — ${money(input.totalValue)}`);
        return id;
      });
    },

    async registerFeedConsumption(input) {
      requirePerm(actor, 'cattle.manage');
      assert(isPos(input.quantityKg), 'Informe a quantidade consumida (kg).');
      assert(isISODate(input.date), 'Informe a data.');
      assert(['DAILY', 'WEEKLY', 'MONTHLY'].includes(input.period), 'Informe o período.');
      await runTx(ctx, async (tx) => {
        const p = await mustGet(tx, 'feed_purchases', input.feedPurchaseId, 'Compra de ração não encontrada.');
        const batch = await mustGet(tx, 'batches', input.batchId, 'Lote não encontrado.');
        assert(batch.status === 'PURCHASED' || batch.status === 'IN_PASTURE', `O lote ${batch.code} não está em engorda.`);
        assert(!p.batchIds?.length || p.batchIds.includes(batch.id), `Esta compra de ração não está liberada para o lote ${batch.code}.`);
        const qty = round3(input.quantityKg);
        assert(p.status === 'AVAILABLE' && p.remainingKg + 0.0005 >= qty, `Saldo insuficiente nesta compra: restam ${kg(p.remainingKg)}.`);
        const remaining = Math.max(0, round3(p.remainingKg - qty));
        const cost = round2(qty * p.unitCost);
        const consumptionId = newId();
        const costId = insertCost(tx, actor, batch, {
          category: 'FEED',
          date: input.date,
          amount: cost,
          description: `${p.feedTypeName} — ${kg(qty)} (NF ${p.invoiceNumber})`,
          partnerId: p.supplierId ?? null,
          partnerName: p.supplierName ?? null,
          source: 'FEED',
          sourceId: consumptionId,
        });
        tx.insert('feed_consumptions', {
          id: consumptionId,
          feedPurchaseId: p.id,
          feedTypeName: p.feedTypeName,
          batchId: batch.id,
          batchName: `${batch.code} — ${batch.name}`,
          date: input.date,
          quantityKg: qty,
          period: input.period,
          cost,
          batchCostId: costId,
          notes: clean(input.notes),
          createdByName: actor.name,
        });
        tx.update('feed_purchases', p.id, { remainingKg: remaining, status: remaining <= 0.0005 ? 'DEPLETED' : 'AVAILABLE' });
        // Animais recebendo trato = lote em engorda.
        if (batch.status === 'PURCHASED') tx.update('batches', batch.id, { status: 'IN_PASTURE' });
        audit(tx, actor, 'CREATE', 'feed_consumptions', consumptionId, `Consumo de ração: ${p.feedTypeName} ${kg(qty)} no lote ${batch.code} — ${money(cost)}`);
      });
    },

    async removeFeedConsumption(id) {
      requirePerm(actor, 'cattle.manage');
      await runTx(ctx, async (tx) => {
        const c = await mustGet(tx, 'feed_consumptions', id, 'Consumo não encontrado.');
        const p = await tx.get('feed_purchases', c.feedPurchaseId);
        if (p) tx.update('feed_purchases', p.id, { remainingKg: round3(p.remainingKg + c.quantityKg), status: 'AVAILABLE' });
        if (c.batchCostId) {
          if (await tx.get('batch_costs', c.batchCostId)) tx.delete('batch_costs', c.batchCostId);
        } else {
          for (const bc of await tx.query('batch_costs', { where: [['sourceId', '==', id]] })) tx.delete('batch_costs', bc.id);
        }
        tx.delete('feed_consumptions', id);
        audit(tx, actor, 'DELETE', 'feed_consumptions', id, `Consumo de ração removido: ${c.feedTypeName} ${kg(c.quantityKg)} (${c.batchName})`);
      });
    },

    async registerSlaughter(input) {
      if (!actorCan(actor, 'cattle.manage')) requirePerm(actor, 'production.manage');
      assert(isISODate(input.date), 'Informe a data do abate.');
      assert(isPos(input.carcassWeightKg), 'Informe o peso total de carcaça.');
      if (input.exitScaleWeightKg != null) assert(isPos(input.exitScaleWeightKg), 'Peso de saída inválido.');
      (input.costs || []).forEach((c) => assert(isPos(c.amount) && COST_CATEGORIES[c.category], 'Custo de abate inválido.'));
      (input.rawOutputs || []).forEach((o) => assert(o.productId && isPos(o.qty), 'Informe produto e quantidade de cada saída do abate.'));
      await runTx(ctx, async (tx) => {
        const batch = await mustGet(tx, 'batches', input.batchId, 'Lote não encontrado.');
        assert(batch.status === 'PURCHASED' || batch.status === 'IN_PASTURE', `O lote ${batch.code} já foi abatido.`);
        const sh = await mustGet(tx, 'partners', input.slaughterhouseId, 'Frigorífico não encontrado.');
        const animals = (await tx.query('animals', { where: [['batchId', '==', batch.id]] })).filter((a) => a.status === 'ALIVE');
        const weights = new Map((input.animals || []).map((a) => [a.animalId, a]));
        let exitSum = 0;
        for (const a of animals) {
          const w = weights.get(a.id);
          if (w?.exitWeightKg) exitSum += w.exitWeightKg;
          tx.update('animals', a.id, {
            status: 'SLAUGHTERED',
            exitWeightKg: w?.exitWeightKg ?? null,
            carcassWeightKg: w?.carcassWeightKg ?? null,
            currentWeightKg: w?.exitWeightKg ?? a.currentWeightKg ?? null,
          });
        }
        const exit = input.exitScaleWeightKg ?? (exitSum > 0 ? round3(exitSum) : null);
        const carcass = round3(input.carcassWeightKg);
        // Custos do abate
        for (const c of input.costs || []) {
          insertCost(tx, actor, batch, {
            category: c.category,
            date: input.date,
            amount: c.amount,
            description: `Abate ${sh.name}`,
            documentNumber: c.documentNumber ?? null,
            partnerId: c.category === 'SLAUGHTER_FEE' || c.category === 'INSPECTION_FEE' ? sh.id : null,
            partnerName: c.category === 'SLAUGHTER_FEE' || c.category === 'INSPECTION_FEE' ? sh.name : null,
            source: 'SLAUGHTER',
            sourceId: batch.id,
          });
        }
        const existing = await tx.query('batch_costs', { where: [['batchId', '==', batch.id]] });
        const total = netCost(existing);
        const defaultUnitCost = round4(total / carcass);
        let rawKg = 0;
        for (const [i, o] of (input.rawOutputs || []).entries()) {
          const product = await mustGet(tx, 'products', o.productId, 'Produto da saída do abate não encontrado.');
          rawKg += o.qty;
          insertLot(
            tx,
            actor,
            {
              productId: product.id,
              productName: product.name,
              stage: 'RAW',
              batchId: batch.id,
              batchCode: batch.code,
              processingOrderId: null,
              lotCode: clean(o.lotCode) || `${batch.code}-${String(i + 1).padStart(2, '0')}`,
              origin: 'PROPRIO',
              originCompany: batch.company ?? null,
              originInvoice: null,
              entryDate: input.date,
              expiryDate: product.shelfLifeDays ? addDays(input.date, product.shelfLifeDays) : null,
              initialQty: round3(o.qty),
              unit: product.unit,
              unitCost: o.unitCost != null ? round4(o.unitCost) : defaultUnitCost,
              location: null,
              notes: null,
            },
            'SLAUGHTER_ENTRY',
            `Abate do lote ${batch.code}`,
          );
        }
        tx.update('batches', batch.id, {
          status: 'SLAUGHTERED',
          slaughterDate: input.date,
          slaughterhouseId: sh.id,
          slaughterhouseName: sh.name,
          exitScaleWeightKg: exit,
          carcassWeightKg: carcass,
          carcassYieldPercent: exit ? round2((carcass / exit) * 100) : null,
          transportLossPercent: input.transportLossPercent ?? null,
          gtaNumber: clean(input.gtaNumber) ?? batch.gtaNumber ?? null,
          notes: clean(input.notes) ? appendNote(batch.notes, input.notes!.trim()) : batch.notes ?? null,
        });
        audit(tx, actor, 'UPDATE', 'batches', batch.id, `Abate do lote ${batch.code} em ${sh.name}: ${animals.length} animais, carcaça ${kg(carcass)}`, {
          rawKg: round3(rawKg),
          costPerKg: defaultUnitCost,
        });
      });
    },

    async finishBatch(batchId) {
      requirePerm(actor, 'cattle.manage');
      await runTx(ctx, async (tx) => {
        const batch = await mustGet(tx, 'batches', batchId, 'Lote não encontrado.');
        assert(batch.status !== 'FINISHED', 'Este lote já está encerrado.');
        if (batch.status !== 'SLAUGHTERED') {
          const alive = (await tx.query('animals', { where: [['batchId', '==', batchId]] })).filter((a) => a.status === 'ALIVE');
          assert(!alive.length, `Ainda há ${alive.length} animais vivos neste lote — registre o abate, venda ou morte antes de encerrar.`);
        }
        tx.update('batches', batchId, { status: 'FINISHED' });
        audit(tx, actor, 'UPDATE', 'batches', batchId, `Lote ${batch.code} encerrado`);
      });
    },
  };
}
