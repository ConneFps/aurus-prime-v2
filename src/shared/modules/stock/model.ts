/**
 * Regras puras do módulo de estoque/expedição (sem acesso a dados).
 * Espelham as regras das operações (ops/impl/sale-stock.ts) para PRÉVIA na tela.
 */
import { daysBetween, round2, round3, today } from '../../domain/format';
import type { Tone } from '../../domain/labels';
import type { Product, Sale, SaleItem, StockLot, StockOrigin, SupplyItem } from '../../domain/types';

export const EXPIRY_WARN_DAYS = 7;
export const EPS = 0.0005;

// ---------------------------------------------------------------------------
// Validade
// ---------------------------------------------------------------------------

export type ExpiryState = 'EXPIRED' | 'SOON' | 'OK' | 'NONE';

export function expiryState(expiry: string | null | undefined, ref = today()): ExpiryState {
  if (!expiry) return 'NONE';
  const d = daysBetween(ref, expiry);
  if (d < 0) return 'EXPIRED';
  if (d <= EXPIRY_WARN_DAYS) return 'SOON';
  return 'OK';
}

/** Rótulo curto para badge de validade (null quando está tranquilo). */
export function expiryBadge(expiry: string | null | undefined): { label: string; tone: Tone } | null {
  const s = expiryState(expiry);
  if (s === 'NONE' || s === 'OK') return null;
  const d = daysBetween(today(), expiry!);
  if (s === 'EXPIRED') return { label: d === -1 ? 'Venceu ontem' : `Vencido há ${-d} d`, tone: 'danger' };
  return { label: d === 0 ? 'Vence hoje' : d === 1 ? 'Vence amanhã' : `Vence em ${d} d`, tone: 'warning' };
}

export const lotHasBalance = (l: StockLot) => l.balanceQty > EPS && l.status !== 'DEPLETED';

export const LOT_STATUS: Record<StockLot['status'], { label: string; tone: Tone }> = {
  AVAILABLE: { label: 'Disponível', tone: 'success' },
  BLOCKED: { label: 'Bloqueado', tone: 'danger' },
  DEPLETED: { label: 'Esgotado', tone: 'neutral' },
};

// ---------------------------------------------------------------------------
// Saldo por produto
// ---------------------------------------------------------------------------

export interface ProductStock {
  id: string;
  product: Product | null;
  name: string;
  category: string;
  unit: 'KG' | 'UN';
  /** Saldo disponível (lotes AVAILABLE). */
  qty: number;
  blockedQty: number;
  /** Valor a custo do saldo disponível. */
  value: number;
  avgCost: number;
  proprioQty: number;
  intercompanyQty: number;
  /** Lotes com saldo (inclui bloqueados). */
  lots: StockLot[];
  availableLots: number;
  nearestExpiry: string | null;
  expiredQty: number;
  soonQty: number;
  minStock: number | null;
  belowMin: boolean;
}

export function aggregateByProduct(lots: StockLot[], products: Product[], opts?: { includeEmpty?: boolean }): ProductStock[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const map = new Map<string, ProductStock>();
  const ensure = (id: string, fallback?: StockLot): ProductStock => {
    let cur = map.get(id);
    if (!cur) {
      const p = byId.get(id) || null;
      cur = {
        id,
        product: p,
        name: p?.name || fallback?.productName || 'Produto removido',
        category: p?.category || '—',
        unit: p?.unit || fallback?.unit || 'KG',
        qty: 0,
        blockedQty: 0,
        value: 0,
        avgCost: 0,
        proprioQty: 0,
        intercompanyQty: 0,
        lots: [],
        availableLots: 0,
        nearestExpiry: null,
        expiredQty: 0,
        soonQty: 0,
        minStock: p?.minStock ?? null,
        belowMin: false,
      };
      map.set(id, cur);
    }
    return cur;
  };
  for (const l of lots) {
    if (!lotHasBalance(l)) continue;
    const cur = ensure(l.productId, l);
    cur.lots.push(l);
    if (l.status === 'BLOCKED') {
      cur.blockedQty += l.balanceQty;
      continue;
    }
    cur.qty += l.balanceQty;
    cur.value += l.balanceQty * l.unitCost;
    cur.availableLots += 1;
    if ((l.origin || 'PROPRIO') === 'INTERCOMPANY') cur.intercompanyQty += l.balanceQty;
    else cur.proprioQty += l.balanceQty;
    if (l.expiryDate && (!cur.nearestExpiry || l.expiryDate < cur.nearestExpiry)) cur.nearestExpiry = l.expiryDate;
    const st = expiryState(l.expiryDate);
    if (st === 'EXPIRED') cur.expiredQty += l.balanceQty;
    else if (st === 'SOON') cur.soonQty += l.balanceQty;
  }
  if (opts?.includeEmpty) for (const p of products) if (p.active && p.meatType !== 'RAW') ensure(p.id);
  const out = [...map.values()];
  for (const r of out) {
    r.qty = round3(r.qty);
    r.blockedQty = round3(r.blockedQty);
    r.value = round2(r.value);
    r.avgCost = r.qty > EPS ? r.value / r.qty : 0;
    r.belowMin = !!r.minStock && r.minStock > 0 && r.qty < r.minStock;
    r.lots.sort(fifoCompare);
  }
  return out;
}

// ---------------------------------------------------------------------------
// FIFO (mesma ordem de ops/impl/common.ts → allocateFifo)
// ---------------------------------------------------------------------------

export function fifoCompare(a: StockLot, b: StockLot) {
  const ea = a.expiryDate || '9999-12-31';
  const eb = b.expiryDate || '9999-12-31';
  if (ea !== eb) return ea.localeCompare(eb);
  return (a.entryDate || '').localeCompare(b.entryDate || '') || (a.createdAt || '').localeCompare(b.createdAt || '');
}

export const saleOrigin = (sale: Pick<Sale, 'isIntercompany'>): StockOrigin => (sale.isIntercompany ? 'INTERCOMPANY' : 'PROPRIO');

/** Lotes que podem atender a venda (mesma origem, disponíveis, em ordem FIFO). */
export function lotsForProduct(lots: StockLot[], productId: string, origin: StockOrigin): StockLot[] {
  return lots
    .filter((l) => l.productId === productId && l.stage === 'FINISHED' && (l.origin || 'PROPRIO') === origin && l.status === 'AVAILABLE' && l.balanceQty > EPS)
    .sort(fifoCompare);
}

export interface PlanLine {
  kind: SaleItem['kind'];
  key: string;
  productId?: string | null;
  supplyItemId?: string | null;
  qty: number;
  lotId?: string | null;
}

export interface PlanResult {
  picks: { lot: StockLot; take: number }[];
  supplyTake: number;
  short: number;
}

/**
 * Prévia da baixa que finalizePicking fará: percorre os itens na ordem e
 * consome os saldos (o mesmo lote atende vários itens em sequência).
 */
export function planDeduction(lines: PlanLine[], lots: StockLot[], supplies: SupplyItem[], origin: StockOrigin): Map<string, PlanResult> {
  const balance = new Map<string, number>();
  const supplyBal = new Map(supplies.map((s) => [s.id, Math.max(0, s.quantity)]));
  const out = new Map<string, PlanResult>();
  for (const line of lines) {
    const res: PlanResult = { picks: [], supplyTake: 0, short: 0 };
    out.set(line.key, res);
    if (!(line.qty > 0)) continue;
    if (line.kind === 'PRODUCT' && line.productId) {
      const avail = lotsForProduct(lots, line.productId, origin).sort((a, b) => {
        if (line.lotId) {
          if (a.id === line.lotId) return -1;
          if (b.id === line.lotId) return 1;
        }
        return 0;
      });
      let remaining = round3(line.qty);
      for (const lot of avail) {
        if (remaining <= EPS) break;
        const bal = balance.has(lot.id) ? balance.get(lot.id)! : lot.balanceQty;
        const take = round3(Math.min(bal, remaining));
        if (take <= 0) continue;
        balance.set(lot.id, round3(bal - take));
        res.picks.push({ lot, take });
        remaining = round3(remaining - take);
      }
      res.short = Math.max(0, remaining);
    } else if (line.kind === 'SUPPLY' && line.supplyItemId) {
      const bal = supplyBal.get(line.supplyItemId) ?? 0;
      const take = round3(Math.min(bal, line.qty));
      supplyBal.set(line.supplyItemId, round3(bal - take));
      res.supplyTake = take;
      res.short = round3(Math.max(0, line.qty - take));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Totais do pedido (mesma conta de computeSaleTotals)
// ---------------------------------------------------------------------------

export function baseFreightOf(sale: Pick<Sale, 'freightValue' | 'items'>): number {
  const items = (sale.items || []).filter((i) => i.kind === 'FREIGHT').reduce((s, i) => s + (i.total || 0), 0);
  return Math.max(0, round2((sale.freightValue || 0) - items));
}

export function previewTotals(sale: Sale, lines: { kind: SaleItem['kind']; unit: 'KG' | 'UN'; qty: number; unitPrice: number }[]) {
  let items = 0;
  let freightItems = 0;
  let weight = 0;
  for (const l of lines) {
    const t = round2((l.qty || 0) * (l.unitPrice || 0));
    if (l.kind === 'FREIGHT') freightItems += t;
    else items += t;
    if (l.unit === 'KG' && (l.kind === 'PRODUCT' || l.kind === 'SUPPLY')) weight += l.qty || 0;
  }
  const freight = round2(baseFreightOf(sale) + freightItems);
  return {
    itemsSubtotal: round2(items),
    freight,
    total: Math.max(0, round2(items + freight - (sale.discountValue || 0))),
    weight: round3(weight),
  };
}

// ---------------------------------------------------------------------------
// Expedição: liberação fiscal (regra da v1)
// ---------------------------------------------------------------------------

/**
 * A NF nunca trava a pesagem. Só a EXPEDIÇÃO de cliente CNPJ (faturado com NF)
 * exige NF informada/anexada. Bonificação e amostra saem liberadas.
 */
export function releaseInfo(sale: Sale): { nfRequired: boolean; hasNf: boolean; released: boolean; reason: string } {
  const hasNf = !!sale.invoiceNumber?.trim() || (sale.attachments || []).some((a) => a.kind === 'NF');
  const free = sale.paymentMethod === 'BONUS' || sale.paymentMethod === 'SAMPLE';
  const billsNf = sale.billingType === 'NF_BOLETO' || sale.billingType === 'NF_ONLY';
  const nfRequired = !free && billsNf && sale.customerCategory === 'EXTERNO_CNPJ';
  if (free) return { nfRequired: false, hasNf, released: true, reason: 'Bonificação/amostra — liberado sem NF' };
  if (!nfRequired) return { nfRequired: false, hasNf, released: true, reason: hasNf ? 'NF informada' : 'Não exige NF para expedir' };
  return { nfRequired: true, hasNf, released: hasNf, reason: hasNf ? 'NF informada — liberado' : 'Cliente CNPJ: informe a NF para expedir' };
}

// ---------------------------------------------------------------------------
// Fila de separação
// ---------------------------------------------------------------------------

export type DateBucket = 'LATE' | 'TODAY' | 'TOMORROW' | 'NEXT' | 'NONE';

export const BUCKET_LABELS: Record<DateBucket, string> = {
  LATE: 'Atrasados',
  TODAY: 'Hoje',
  TOMORROW: 'Amanhã',
  NEXT: 'Próximos dias',
  NONE: 'Sem data de entrega',
};

export function dateBucket(d: string | null | undefined): DateBucket {
  if (!d) return 'NONE';
  const diff = daysBetween(today(), d);
  if (diff < 0) return 'LATE';
  if (diff === 0) return 'TODAY';
  if (diff === 1) return 'TOMORROW';
  return 'NEXT';
}

export const deliveryDateOf = (s: Sale) => s.deliveryDate || null;

/** "3 itens · 12,5 kg" + nomes curtos. */
export function itemsSummary(sale: Sale, max = 3): string {
  const prods = (sale.items || []).filter((i) => i.kind === 'PRODUCT');
  const names = prods.slice(0, max).map((i) => i.productName);
  const more = prods.length > max ? ` +${prods.length - max}` : '';
  return names.join(', ') + more;
}

export const orderedWeight = (sale: Sale) =>
  round3((sale.items || []).filter((i) => i.unit === 'KG' && (i.kind === 'PRODUCT' || i.kind === 'SUPPLY')).reduce((s, i) => s + (i.qtyOrdered || 0), 0));

/** Extrai o número da NF do nome do arquivo (ex.: "NF_004512.pdf" → "004512"). */
export function nfNumberFromFileName(name: string): string | null {
  const m = name.match(/\d{4,}/);
  return m ? m[0] : null;
}
