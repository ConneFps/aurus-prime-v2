/**
 * Migração: equinos (cadastro + arrays aninhados → linha do tempo), vendas de
 * equinos e compras de sêmen (com as parcelas no financeiro).
 */
import { buildInstallments } from '../ops/impl/common';
import type { Attachment, Equine, EquineEvent, EquineEventType, EquineSale, EquineStatus, SemenPurchase } from '../domain/types';
import type { Ctx } from './context';
import { stamps } from './map-base';
import { entriesFrom, readInstallments, type InstSrc, type LegacyTx } from './map-finance';
import { arr, attachmentFrom, day, docs, firstStr, isoDateTime, n0, normalize, num, obj, payMethod, round2, str, upper, type Doc } from './legacy-utils';

function equineStatus(personal: Doc, repro: Doc, sold: boolean): EquineStatus {
  const s = normalize(str(personal.status));
  if (s.includes('vend') || sold) return 'SOLD';
  if (s.includes('obito') || s.includes('falec') || s.includes('morto') || s.includes('morte')) return 'DECEASED';
  if (s.includes('prenh') || s.includes('gestante') || upper(repro.status) === 'GESTANTE' || repro.isPregnant === true) return 'PREGNANT';
  if (s.includes('treino')) return 'TRAINING';
  return 'ACTIVE';
}

const HEALTH_KINDS = ['VACINA', 'VERMIFUGO', 'ULTRASSOM', 'MEDICAMENTO', 'EXAME', 'OUTRO'];

export function mapEquines(ctx: Ctx, tx: Map<string, LegacyTx>) {
  for (const d of ctx.col('equines')) {
    const id = String(d.id);
    const pd = obj(d.personalData);
    const doc = obj(d.documentation);
    const gen = obj(d.genealogy);
    const gp = obj(gen.grandparents);
    const rep = obj(d.reproduction);
    const loc = obj(d.location);
    const sd = obj(d.saleDetails);
    const st = stamps(ctx, d);
    const name = str(pd.name) || str(d.name) || 'Equino sem nome';
    const g = upper(pd.gender);
    const hasSale = !!Object.keys(sd).length && upper(sd.status) !== 'CANCELLED';
    const photos: Attachment[] = arr(doc.photos)
      .map((p, i) => attachmentFrom(typeof p === 'string' ? { url: p, name: `foto-${i + 1}` } : obj(p), `${id}-ph${i + 1}`, st.createdAt, 'PHOTO', ctx.w, name))
      .filter((x): x is Attachment => !!x);
    const offspring = arr(rep.offspringNames).map(str).filter(Boolean);
    const rs = upper(rep.status);
    const e: Equine = {
      id,
      ...st,
      legacyId: id,
      name,
      sex: g.startsWith('GARANH') ? 'GARANHAO' : g.startsWith('EGUA') ? 'EGUA' : 'CASTRADO',
      birthDate: day(pd.birthDate),
      breed: str(pd.breed) || 'Não informada',
      coat: str(pd.coatColor),
      heightCm: num(pd.heightCm),
      weightKg: num(pd.weightKg),
      idealWeightKg: num(pd.idealWeightKg),
      markings: str(pd.markings),
      chipId: str(pd.chipId),
      registry: str(doc.abqmRegister),
      secondaryRegistry: str(doc.cbtRegister),
      status: equineStatus(pd, rep, hasSale),
      photos,
      sireName: str(gen.fatherName),
      sireRegistry: str(gen.fatherRegister),
      damName: str(gen.motherName),
      damRegistry: str(gen.motherRegister),
      paternalGrandsire: str(gp.paternalGrandfather),
      paternalGranddam: str(gp.paternalGrandmother),
      maternalGrandsire: str(gp.maternalGrandfather),
      maternalGranddam: str(gp.maternalGrandmother),
      geneticNotes: str(gen.geneticImportance),
      reproStatus: rs === 'ATIVO' || rs === 'INATIVO' || rs === 'GESTANTE' || rs === 'EM_DESCANSO' ? rs : null,
      coverDate: day(rep.pregnancyCoverDate) || day(rep.lastServiceDate),
      coverStallion: str(rep.pregnancyStallionName),
      pregnancyDiagnosisDate: day(rep.pregnancyDiagnosisDate),
      expectedFoalingDate: day(rep.pregnancyExpectedDate),
      pregnancyNotes: str(rep.pregnancyNotes),
      fertilityRating: str(rep.fertilityRating),
      haras: str(loc.currentHaras),
      paddock: str(loc.paddockBox),
      manager: str(loc.responsibleManager),
      gps: str(loc.gpsCoordinates),
      locationAddress: str(loc.address),
      pedigreeNotes: str(doc.pedigreeDetails),
      healthCertificates: str(doc.healthCertificates),
      geneticTest: str(doc.geneticTest),
      purchaseValue: null,
      estimatedValue: null,
      notes: offspring.length ? `Crias: ${offspring.join(', ')}` : null,
    };
    ctx.put('equines', e);

    const ev = (type: EquineEventType, key: string, rec: Doc, n: number, f: Partial<EquineEvent> & { title: string }) => {
      const date = day(f.date) || day(rec.date) || day(st.createdAt)!;
      const row: EquineEvent = {
        id: `${id}-${key}-${str(rec.id) || n}`,
        createdAt: st.createdAt,
        updatedAt: st.updatedAt,
        legacyId: str(rec.id),
        equineId: id,
        equineName: name,
        type,
        date,
        title: f.title,
        amount: f.amount ?? null,
        data: f.data || {},
        alertDate: f.alertDate ?? null,
        attachments: f.attachments || [],
        notes: f.notes ?? null,
        createdByName: 'Migração',
      };
      ctx.put('equine_events', row);
    };
    docs(d.health).forEach((h, i) => {
      const kind = upper(h.type);
      ev('HEALTH', 'h', h, i + 1, {
        title: str(h.name) || kind || 'Registro de saúde',
        data: { kind: HEALTH_KINDS.includes(kind) ? kind : 'OUTRO', dosage: str(h.dosage), result: str(h.resultStatus), veterinarian: str(h.veterinarian) },
        alertDate: day(h.alertDate),
        attachments: docs(h.attachments)
          .map((a, j) => attachmentFrom(a, `${id}-h${i + 1}-att${j + 1}`, st.createdAt, 'EXAM', ctx.w, name))
          .filter((x): x is Attachment => !!x),
      });
    });
    docs(d.training).forEach((t, i) =>
      ev('TRAINING', 't', t, i + 1, {
        title: `Treino${str(t.modality) ? ` — ${str(t.modality)}` : ''}`,
        data: { modality: str(t.modality), durationMinutes: num(t.durationMinutes), score: num(t.performanceScore), trainer: null, videoUrl: str(t.videoUrl) },
        notes: str(t.notes),
      }),
    );
    docs(d.manege).forEach((m, i) =>
      ev('FARRIER', 'f', m, i + 1, {
        title: str(m.procedures) || 'Casqueamento / manejo',
        amount: num(m.costs),
        data: { farrier: str(m.farrierName), hoofCondition: str(m.hoofCondition), procedures: str(m.procedures), nextDate: day(m.nextFarrierDate) },
        alertDate: day(m.nextFarrierDate),
      }),
    );
    docs(d.transports).forEach((t, i) =>
      ev('TRANSPORT', 'tr', t, i + 1, {
        title: [str(t.origin), str(t.destination)].filter(Boolean).join(' → ') || 'Transporte',
        amount: num(t.costs),
        data: { origin: str(t.origin), destination: str(t.destination), vehicle: str(t.vehicle), event: str(t.eventParticipated), technicalBooklet: str(t.technicalBooklet) },
      }),
    );
    docs(d.accommodations).forEach((a, i) =>
      ev('STAY', 's', a, i + 1, {
        title: str(a.location) || 'Hospedagem',
        date: day(a.checkInDate) || undefined,
        amount: num(a.costs),
        data: { location: str(a.location), address: str(a.address), paddock: str(a.paddockBox), checkIn: day(a.checkInDate), checkOut: day(a.checkOutDate) },
        notes: str(a.notes),
      }),
    );
    docs(d.competitions).forEach((c, i) =>
      ev('COMPETITION', 'c', c, i + 1, {
        title: str(c.eventName) || 'Competição',
        amount: num(c.prizeValue),
        data: { event: str(c.eventName), location: str(c.location), modality: str(c.modality), rider: str(c.riderName), placement: str(c.placement), score: str(c.score), prize: num(c.prizeValue) },
        notes: str(c.notes),
      }),
    );
    docs(d.semenCollections).forEach((s, i) =>
      ev('SEMEN_COLLECTION', 'sc', s, i + 1, {
        title: `Coleta de sêmen${str(s.collectionMethod) ? ` — ${str(s.collectionMethod)}` : ''}`,
        data: {
          method: str(s.collectionMethod),
          volumeMl: num(s.volumeMl),
          concentration: str(s.concentration),
          motility: num(s.motilityPercentage),
          vigor: num(s.vigor),
          dosesProduced: num(s.dosesProduced),
          dosesAvailable: num(s.dosesAvailable),
          canister: str(s.canisterLocation),
          expiryDate: day(s.expirationDate),
          veterinarian: str(s.veterinarian),
          destinationMares: str(s.destinationMares),
        },
        notes: str(s.notes),
      }),
    );
    docs(d.finances).forEach((f, i) =>
      ev(upper(f.type) === 'REVENUE' ? 'REVENUE' : 'EXPENSE', 'fin', f, i + 1, {
        title: str(f.description) || str(f.category) || 'Lançamento',
        amount: round2(n0(f.value)),
        data: { category: str(f.category) },
      }),
    );

    // Venda do animal (+ parcelas a receber)
    if (Object.keys(sd).length) {
      const saleId = `${id}-sale`;
      const date = day(sd.saleDate) || day(st.updatedAt)!;
      const total = round2(n0(sd.totalPrice));
      const cancelled = upper(sd.status) === 'CANCELLED';
      let insts: InstSrc[] = readInstallments(sd.installments);
      if (!insts.length && total > 0)
        insts = buildInstallments(total, { installments: num(sd.installmentsCount) || 1 }, date).map((l) => ({
          id: null,
          number: l.installment,
          dueDate: l.dueDate,
          value: l.amount,
          paid: false,
          paymentDate: null,
          paidBy: null,
          paidAt: null,
        }));
      const s: EquineSale = {
        id: saleId,
        createdAt: st.updatedAt,
        updatedAt: st.updatedAt,
        legacyId: id,
        equineId: id,
        equineName: name,
        buyerName: str(sd.buyerName) || 'Comprador não informado',
        buyerDocument: str(sd.buyerDocument),
        buyerPhone: str(sd.buyerPhone),
        buyerEmail: str(sd.buyerEmail),
        buyerAddress: str(sd.buyerAddress),
        date,
        totalPrice: total,
        installmentsCount: Math.max(1, insts.length),
        status: cancelled ? 'CANCELLED' : 'ACTIVE',
        notes: null,
      };
      ctx.put('equine_sales', s);
      entriesFrom(ctx, {
        prefix: `${saleId}-p`,
        legacyKey: id,
        base: { direction: 'IN', category: 'EQUINE_SALE', description: `Venda do equino ${name} — ${s.buyerName}`, partyType: 'OTHER', partyId: null, partyName: s.buyerName, equineSaleId: saleId },
        insts,
        issueDate: date,
        createdAt: s.createdAt,
        method: null,
        cancelUnpaid: cancelled,
        tx,
      });
    }
  }
}

export function mapSemen(ctx: Ctx, tx: Map<string, LegacyTx>) {
  for (const d of ctx.col('semen_purchases')) {
    const id = String(d.id);
    const st = stamps(ctx, d, d.purchaseDate);
    const purchaseDate = day(d.purchaseDate) || day(st.createdAt)!;
    const stt = upper(d.status);
    const storage = upper(d.storageType);
    const insts = readInstallments(d.installments);
    const p: SemenPurchase = {
      id,
      ...st,
      legacyId: id,
      stallionName: str(d.stallionName) || 'Garanhão não informado',
      stallionBreed: str(d.stallionBreed),
      stallionRegistry: str(d.stallionRegistry),
      ownerHaras: str(d.ownerHarasName),
      supplierName: str(d.supplierName) || 'Fornecedor não informado',
      supplierDocument: str(d.supplierDocument),
      supplierContact: str(d.supplierContact),
      invoiceNumber: str(d.invoiceNumber),
      invoiceDate: day(d.invoiceDate),
      lotCode: str(d.lotCode),
      purchaseDate,
      dosesQuantity: Math.round(n0(d.dosesQuantity)),
      dosesAvailable: Math.round(n0(d.dosesAvailable ?? d.dosesQuantity)),
      dosePrice: num(d.dosePrice),
      totalValue: round2(n0(d.totalValue)),
      storageType: storage === 'REFRIGERADO' || storage === 'FRESCO' ? storage : 'CONGELADO',
      canister: str(d.canisterLocation),
      expiryDate: day(d.expirationDate),
      installmentsCount: Math.max(1, insts.length || Math.round(n0(d.installmentsCount))),
      paymentMethod: payMethod(d.paymentMethod),
      intendedMares: str(d.intendedMares),
      veterinarian: str(d.veterinarian),
      status: stt === 'DEPLETED' || stt === 'EXPIRED' || stt === 'CANCELLED' ? stt : 'ACTIVE',
      usage: [],
      notes: firstStr(d.notes, str(d.registeredBy) ? `Registrado por ${str(d.registeredBy)}` : null),
    };
    ctx.put('semen_purchases', p);
    if (!insts.length) {
      if (p.totalValue > 0) ctx.w.add('semen.noinst', 'Compras de sêmen sem parcelas no sistema antigo (nenhuma conta a pagar criada)', p.stallionName);
      continue;
    }
    entriesFrom(ctx, {
      prefix: `${id}-p`,
      legacyKey: id,
      base: { direction: 'OUT', category: 'SEMEN', description: `Sêmen ${p.stallionName} — ${p.dosesQuantity} doses`, partyType: 'OTHER', partyId: null, partyName: p.supplierName, semenPurchaseId: id },
      insts,
      issueDate: purchaseDate,
      createdAt: p.createdAt,
      method: p.paymentMethod ?? null,
      cancelUnpaid: p.status === 'CANCELLED',
      tx,
      documentNumber: p.invoiceNumber,
    });
  }
}
