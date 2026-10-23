/**
 * Regras puras do módulo de equinos (idade, gestação, alertas, rótulos locais).
 */
import { addDays, daysBetween, parseISODate, today } from '../../domain/format';
import { EQUINE_HEALTH_KINDS, EQUINE_MODALITIES, type LabelInfo } from '../../domain/labels';
import type { Equine, EquineEvent, EquineEventType, FinancialEntry, SemenPurchase } from '../../domain/types';

export const GESTATION_DAYS = 340;
export const FARRIER_INTERVAL_DAYS = 45;
export const ALERT_HORIZON_DAYS = 30;

// ---------------------------------------------------------------------------
// Rótulos locais (não existem em domain/labels.ts)
// ---------------------------------------------------------------------------

const HEALTH_KIND_NAMES: Record<string, string> = {
  VACINA: 'Vacina',
  VERMIFUGO: 'Vermífugo',
  ULTRASSOM: 'Ultrassom',
  MEDICAMENTO: 'Medicamento',
  EXAME: 'Exame',
  OUTRO: 'Outro',
};
export const HEALTH_KIND_OPTIONS = EQUINE_HEALTH_KINDS.map((k) => ({ value: k, label: HEALTH_KIND_NAMES[k] || k }));
export const healthKindLabel = (k: unknown) => HEALTH_KIND_NAMES[String(k)] || (k ? String(k) : '');

const MODALITY_NAMES: Record<string, string> = {
  ADESTRAMENTO: 'Adestramento',
  SALTO: 'Salto',
  TAMBOR: 'Três tambores',
  RÉDEAS: 'Rédeas',
  LAÇO: 'Laço',
  VAQUEJADA: 'Vaquejada',
  CONCURSO: 'Concurso de morfologia',
  PASSEIO: 'Passeio / condicionamento',
  OUTROS: 'Outros',
};
export const MODALITY_OPTIONS = EQUINE_MODALITIES.map((k) => ({ value: k, label: MODALITY_NAMES[k] || k }));
export const modalityLabel = (k: unknown) => MODALITY_NAMES[String(k)] || (k ? String(k) : '');

export type ReproStatus = NonNullable<Equine['reproStatus']>;
export const REPRO_STATUS: Record<ReproStatus, LabelInfo> = {
  ATIVO: { label: 'Ativo na reprodução', tone: 'success' },
  GESTANTE: { label: 'Gestante', tone: 'accent' },
  EM_DESCANSO: { label: 'Em descanso', tone: 'warning' },
  INATIVO: { label: 'Fora da reprodução', tone: 'neutral' },
};

export const HOOF_CONDITIONS = ['Excelente', 'Boa', 'Regular', 'Ruim / com fissura'].map((v) => ({ value: v, label: v }));
export const COLLECTION_METHODS = ['Vagina artificial', 'Monta natural', 'Eletroejaculação', 'Outro'].map((v) => ({ value: v, label: v }));
export const EXPENSE_CATEGORIES = ['Alimentação', 'Veterinário', 'Medicamento', 'Ferragem', 'Treinamento', 'Transporte', 'Hospedagem', 'Competição', 'Reprodução', 'Outros'].map(
  (v) => ({ value: v, label: v }),
);
export const REVENUE_CATEGORIES = ['Cobertura', 'Venda de sêmen', 'Premiação', 'Hospedagem de terceiros', 'Outros'].map((v) => ({ value: v, label: v }));

export const PLACEMENT_OPTIONS = [
  { value: '1', label: '1º lugar' },
  { value: '2', label: '2º lugar' },
  { value: '3', label: '3º lugar' },
  { value: '4', label: '4º lugar' },
  { value: '5', label: '5º lugar' },
  { value: 'TOP10', label: 'Finalista / Top 10' },
  { value: 'PART', label: 'Participação' },
  { value: 'DQ', label: 'Desclassificado' },
];
export function placementLabel(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  const s = String(v);
  const o = PLACEMENT_OPTIONS.find((p) => p.value === s);
  if (o) return o.label;
  return /^\d+$/.test(s) ? `${s}º lugar` : s;
}

export type SemenStatus = SemenPurchase['status'];
export const SEMEN_STATUS: Record<SemenStatus, LabelInfo> = {
  ACTIVE: { label: 'Com saldo', tone: 'success' },
  DEPLETED: { label: 'Esgotado', tone: 'neutral' },
  EXPIRED: { label: 'Vencido', tone: 'danger' },
  CANCELLED: { label: 'Cancelado', tone: 'neutral' },
};
export const SEMEN_STORAGE: Record<SemenPurchase['storageType'], string> = {
  CONGELADO: 'Congelado (botijão N₂)',
  REFRIGERADO: 'Refrigerado',
  FRESCO: 'Fresco',
};

/** Status efetivo: compra ativa com validade passada é exibida como vencida. */
export function semenStatus(p: Pick<SemenPurchase, 'status' | 'expiryDate' | 'dosesAvailable'>): SemenStatus {
  if (p.status === 'ACTIVE' && p.expiryDate && p.expiryDate < today()) return 'EXPIRED';
  if (p.status === 'ACTIVE' && p.dosesAvailable <= 0) return 'DEPLETED';
  return p.status;
}

export type EntryView = 'PAID' | 'OPEN' | 'OVERDUE' | 'CANCELLED' | 'PARTIAL';
export const ENTRY_STATUS: Record<EntryView, LabelInfo> = {
  PAID: { label: 'Pago', tone: 'success' },
  OPEN: { label: 'Em aberto', tone: 'warning' },
  PARTIAL: { label: 'Parcial', tone: 'info' },
  OVERDUE: { label: 'Vencida', tone: 'danger' },
  CANCELLED: { label: 'Cancelada', tone: 'neutral' },
};
export function entryStatus(e: FinancialEntry): EntryView {
  if (e.status === 'PAID') return 'PAID';
  if (e.status === 'CANCELLED') return 'CANCELLED';
  if (e.dueDate < today()) return 'OVERDUE';
  return e.paidAmount > 0 ? 'PARTIAL' : 'OPEN';
}
export const entryBalance = (e: FinancialEntry) => (e.status === 'OPEN' ? Math.max(0, e.amount - (e.paidAmount || 0)) : 0);

// ---------------------------------------------------------------------------
// Animal
// ---------------------------------------------------------------------------

export const isInHerd = (e: Pick<Equine, 'status'>) => e.status !== 'SOLD' && e.status !== 'DECEASED';

export function ageMonths(birth?: string | null, ref = today()): number | null {
  const b = parseISODate(birth);
  const r = parseISODate(ref);
  if (!b || !r) return null;
  let m = (r.getFullYear() - b.getFullYear()) * 12 + (r.getMonth() - b.getMonth());
  if (r.getDate() < b.getDate()) m -= 1;
  return Math.max(0, m);
}

/** "8 anos", "2 anos e 3 meses", "5 meses", "recém-nascido". */
export function ageLabel(birth?: string | null, long = false): string {
  const m = ageMonths(birth);
  if (m === null) return '—';
  const y = Math.floor(m / 12);
  const rest = m % 12;
  if (y === 0) return m === 0 ? 'recém-nascido' : `${m} ${m === 1 ? 'mês' : 'meses'}`;
  const ys = `${y} ${y === 1 ? 'ano' : 'anos'}`;
  if ((long || y < 3) && rest) return `${ys} e ${rest} ${rest === 1 ? 'mês' : 'meses'}`;
  return ys;
}

export const isPregnant = (e: Pick<Equine, 'status' | 'reproStatus'>) => e.status === 'PREGNANT' || e.reproStatus === 'GESTANTE';

export interface Gestation {
  coverDate: string | null;
  dueDate: string;
  daysLeft: number;
  daysPregnant: number | null;
  progress: number;
}

export function gestation(e: Equine): Gestation | null {
  if (!isPregnant(e)) return null;
  const due = e.expectedFoalingDate || (e.coverDate ? addDays(e.coverDate, GESTATION_DAYS) : null);
  if (!due) return null;
  const t = today();
  const start = e.coverDate || addDays(due, -GESTATION_DAYS);
  const daysPregnant = daysBetween(start, t);
  return {
    coverDate: e.coverDate || null,
    dueDate: due,
    daysLeft: daysBetween(t, due),
    daysPregnant: e.coverDate ? daysPregnant : null,
    progress: Math.max(0, Math.min(100, (daysPregnant / GESTATION_DAYS) * 100)),
  };
}

export const suggestFoaling = (coverDate?: string | null) => (coverDate ? addDays(coverDate, GESTATION_DAYS) : null);

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------

/** Eventos cujo `amount` é entrada (prêmio/receita); os demais são custo. */
export const isIncomeEvent = (e: Pick<EquineEvent, 'type'>) => e.type === 'COMPETITION' || e.type === 'REVENUE';

export function eventCost(e: EquineEvent) {
  return !isIncomeEvent(e) ? Number(e.amount) || 0 : 0;
}
export function eventIncome(e: EquineEvent) {
  return isIncomeEvent(e) ? Number(e.amount) || 0 : 0;
}

export interface PendingAlert {
  event: EquineEvent;
  days: number;
}

/**
 * Lembretes pendentes: alertDate até `horizon` dias à frente (ou vencidos) e
 * ainda não "resolvidos" por um evento mais novo do mesmo tipo/finalidade.
 */
export function pendingAlerts(events: EquineEvent[], opts?: { types?: EquineEventType[]; horizon?: number; activeIds?: Set<string> }): PendingAlert[] {
  const t = today();
  const limit = addDays(t, opts?.horizon ?? ALERT_HORIZON_DAYS);
  const key = (e: EquineEvent) => `${e.equineId}|${e.type}|${e.type === 'HEALTH' ? String(e.data?.kind || '') : ''}`;
  const latest = new Map<string, string>();
  events.forEach((e) => {
    const k = key(e);
    if (!latest.has(k) || (latest.get(k) as string) < e.date) latest.set(k, e.date);
  });
  return events
    .filter((e) => e.alertDate && e.alertDate <= limit)
    .filter((e) => !opts?.types || opts.types.includes(e.type))
    .filter((e) => !opts?.activeIds || opts.activeIds.has(e.equineId))
    .filter((e) => (latest.get(key(e)) as string) <= e.date)
    .map((e) => ({ event: e, days: daysBetween(t, e.alertDate as string) }))
    .sort((a, b) => a.days - b.days);
}

export function alertText(days: number) {
  if (days < 0) return `vencido há ${-days} ${-days === 1 ? 'dia' : 'dias'}`;
  if (days === 0) return 'vence hoje';
  if (days === 1) return 'amanhã';
  return `em ${days} dias`;
}

export const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
export const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Lista de valores distintos (para filtros e sugestões). */
export function distinct(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.map((v) => (v || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
