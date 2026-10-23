/**
 * Campos específicos (`data`) de cada tipo de evento do equino — dirige o
 * formulário genérico (EventDrawer) e o resumo exibido nas listas.
 */
import { addDays, date as fmtDate, number } from '../../domain/format';
import type { EquineEvent, EquineEventType } from '../../domain/types';
import {
  COLLECTION_METHODS,
  EXPENSE_CATEGORIES,
  FARRIER_INTERVAL_DAYS,
  healthKindLabel,
  HEALTH_KIND_OPTIONS,
  HOOF_CONDITIONS,
  modalityLabel,
  MODALITY_OPTIONS,
  placementLabel,
  PLACEMENT_OPTIONS,
  REVENUE_CATEGORIES,
  str,
} from './model';

export interface FieldSpec {
  key: string;
  label: string;
  kind: 'text' | 'textarea' | 'number' | 'int' | 'date' | 'select' | 'url';
  options?: { value: string; label: string }[];
  suffix?: string;
  decimals?: number;
  span?: 'full' | 2;
  placeholder?: string;
  hint?: string;
}

export interface EventSpec {
  type: EquineEventType;
  /** Nome do registro ("vacina, exame…") usado em botões e títulos. */
  noun: string;
  fields: FieldSpec[];
  amountLabel: string;
  alertLabel: string;
  alertHint?: string;
  titlePlaceholder: string;
  /** Título automático quando o usuário não digita um. */
  autoTitle: (d: Record<string, unknown>) => string;
  /** Linha de resumo nas listas. */
  summary: (e: EquineEvent) => string;
  /** Ajustes antes de gravar (padrões calculados). */
  normalize?: (ev: { date: string; data: Record<string, unknown>; amount: number | null; alertDate: string | null; isNew: boolean }) => void;
}

const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · ');
const pre = (label: string, v: unknown, suffix = '') => (v === null || v === undefined || v === '' ? null : `${label} ${v}${suffix}`);

export const EVENT_SPECS: Record<EquineEventType, EventSpec> = {
  HEALTH: {
    type: 'HEALTH',
    noun: 'atendimento de saúde',
    fields: [
      { key: 'kind', label: 'Tipo', kind: 'select', options: HEALTH_KIND_OPTIONS },
      { key: 'veterinarian', label: 'Veterinário', kind: 'text' },
      { key: 'dosage', label: 'Dosagem / aplicação', kind: 'text', placeholder: 'Ex.: 2 ml intramuscular' },
      { key: 'result', label: 'Resultado / diagnóstico', kind: 'text' },
    ],
    amountLabel: 'Custo',
    alertLabel: 'Próxima dose / retorno',
    alertHint: 'Gera um lembrete no painel do plantel.',
    titlePlaceholder: 'Ex.: Vacina contra influenza',
    autoTitle: (d) => healthKindLabel(d.kind) || 'Registro de saúde',
    summary: (e) => join(healthKindLabel(e.data.kind), str(e.data.dosage), str(e.data.result), str(e.data.veterinarian)),
  },
  TRAINING: {
    type: 'TRAINING',
    noun: 'treino',
    fields: [
      { key: 'modality', label: 'Modalidade', kind: 'select', options: MODALITY_OPTIONS },
      { key: 'trainer', label: 'Treinador', kind: 'text' },
      { key: 'durationMinutes', label: 'Duração', kind: 'int', suffix: 'min' },
      { key: 'score', label: 'Nota de desempenho (1 a 10)', kind: 'number', decimals: 1, hint: 'Usada no gráfico de evolução.' },
      { key: 'videoUrl', label: 'Link do vídeo', kind: 'url', span: 'full', placeholder: 'https://…' },
    ],
    amountLabel: 'Custo',
    alertLabel: 'Próximo treino',
    titlePlaceholder: 'Ex.: Treino de tambor',
    autoTitle: (d) => (d.modality ? `Treino — ${modalityLabel(d.modality)}` : 'Treino'),
    summary: (e) => join(modalityLabel(e.data.modality), pre('', e.data.durationMinutes, ' min')?.trim(), pre('nota', e.data.score), str(e.data.trainer)),
    normalize: (ev) => {
      const s = Number(ev.data.score);
      if (ev.data.score !== null && ev.data.score !== undefined && ev.data.score !== '' && (!Number.isFinite(s) || s < 0 || s > 10))
        throw new Error('A nota de desempenho vai de 1 a 10.');
    },
  },
  FARRIER: {
    type: 'FARRIER',
    noun: 'casqueamento / manejo',
    fields: [
      { key: 'farrier', label: 'Ferrador / responsável', kind: 'text' },
      { key: 'hoofCondition', label: 'Condição dos cascos', kind: 'select', options: HOOF_CONDITIONS },
      { key: 'procedures', label: 'Procedimentos', kind: 'textarea', span: 'full', placeholder: 'Ex.: aparo, ferradura dianteira, fisioterapia' },
      { key: 'nextDate', label: 'Próximo casqueamento', kind: 'date', hint: `Em branco = ${FARRIER_INTERVAL_DAYS} dias após a data.` },
    ],
    amountLabel: 'Custo',
    alertLabel: 'Lembrete',
    alertHint: 'Em branco = data do próximo casqueamento.',
    titlePlaceholder: 'Ex.: Casqueamento e ferrageamento',
    autoTitle: () => 'Casqueamento',
    summary: (e) => join(str(e.data.procedures), pre('cascos:', e.data.hoofCondition), str(e.data.farrier), e.data.nextDate ? `próximo ${fmtDate(str(e.data.nextDate))}` : null),
    normalize: (ev) => {
      if (!ev.data.nextDate && ev.date) ev.data.nextDate = addDays(ev.date, FARRIER_INTERVAL_DAYS);
      if (!ev.alertDate && ev.data.nextDate) ev.alertDate = str(ev.data.nextDate);
    },
  },
  TRANSPORT: {
    type: 'TRANSPORT',
    noun: 'transporte',
    fields: [
      { key: 'origin', label: 'Origem', kind: 'text' },
      { key: 'destination', label: 'Destino', kind: 'text' },
      { key: 'vehicle', label: 'Veículo / transportadora', kind: 'text' },
      { key: 'event', label: 'Motivo / evento', kind: 'text', placeholder: 'Ex.: Exposição regional' },
    ],
    amountLabel: 'Custo do frete',
    alertLabel: 'Retorno previsto',
    titlePlaceholder: 'Ex.: Transporte para exposição',
    autoTitle: (d) => (d.destination ? `Transporte para ${str(d.destination)}` : 'Transporte'),
    summary: (e) => join(e.data.origin || e.data.destination ? `${str(e.data.origin) || '—'} → ${str(e.data.destination) || '—'}` : null, str(e.data.vehicle), str(e.data.event)),
  },
  STAY: {
    type: 'STAY',
    noun: 'hospedagem',
    fields: [
      { key: 'location', label: 'Local / haras', kind: 'text' },
      { key: 'paddock', label: 'Baia / piquete', kind: 'text' },
      { key: 'address', label: 'Endereço', kind: 'text', span: 'full' },
      { key: 'checkIn', label: 'Entrada', kind: 'date' },
      { key: 'checkOut', label: 'Saída', kind: 'date' },
    ],
    amountLabel: 'Custo da hospedagem',
    alertLabel: 'Lembrete',
    titlePlaceholder: 'Ex.: Hospedagem na exposição',
    autoTitle: (d) => (d.location ? `Hospedagem — ${str(d.location)}` : 'Hospedagem'),
    summary: (e) =>
      join(
        str(e.data.location),
        str(e.data.paddock),
        e.data.checkIn ? `${fmtDate(str(e.data.checkIn))}${e.data.checkOut ? ` a ${fmtDate(str(e.data.checkOut))}` : ' (sem saída)'}` : null,
      ),
    normalize: (ev) => {
      if (ev.data.checkIn && ev.data.checkOut && str(ev.data.checkOut) < str(ev.data.checkIn)) throw new Error('A saída não pode ser antes da entrada.');
    },
  },
  COMPETITION: {
    type: 'COMPETITION',
    noun: 'competição',
    fields: [
      { key: 'event', label: 'Evento / prova', kind: 'text', span: 'full' },
      { key: 'location', label: 'Cidade / local', kind: 'text' },
      { key: 'modality', label: 'Modalidade', kind: 'select', options: MODALITY_OPTIONS },
      { key: 'rider', label: 'Cavaleiro / condutor', kind: 'text' },
      { key: 'placement', label: 'Colocação', kind: 'select', options: PLACEMENT_OPTIONS },
      { key: 'score', label: 'Tempo ou pontuação', kind: 'number', decimals: 3 },
    ],
    amountLabel: 'Premiação recebida',
    alertLabel: 'Próxima prova',
    titlePlaceholder: 'Ex.: Copa Paulista de Tambor',
    autoTitle: (d) => join(str(d.event) || 'Competição', placementLabel(d.placement)),
    summary: (e) => join(placementLabel(e.data.placement), modalityLabel(e.data.modality), str(e.data.location), str(e.data.rider), e.data.score ? `marca ${number(Number(e.data.score), 2)}` : null),
    normalize: (ev) => {
      ev.data.prize = ev.amount ?? null;
      if (/^\d+$/.test(str(ev.data.placement))) ev.data.placement = Number(ev.data.placement);
    },
  },
  SEMEN_COLLECTION: {
    type: 'SEMEN_COLLECTION',
    noun: 'coleta de sêmen',
    fields: [
      { key: 'method', label: 'Método', kind: 'select', options: COLLECTION_METHODS },
      { key: 'veterinarian', label: 'Veterinário', kind: 'text' },
      { key: 'volumeMl', label: 'Volume', kind: 'number', decimals: 1, suffix: 'ml' },
      { key: 'concentration', label: 'Concentração', kind: 'number', decimals: 0, suffix: 'mi/ml' },
      { key: 'motility', label: 'Motilidade progressiva', kind: 'number', decimals: 0, suffix: '%' },
      { key: 'vigor', label: 'Vigor (1 a 5)', kind: 'int' },
      { key: 'dosesProduced', label: 'Doses produzidas', kind: 'int' },
      { key: 'dosesAvailable', label: 'Doses disponíveis', kind: 'int', hint: 'Em branco = doses produzidas.' },
      { key: 'canister', label: 'Botijão / caneca', kind: 'text' },
      { key: 'expiryDate', label: 'Validade', kind: 'date' },
      { key: 'destinationMares', label: 'Éguas de destino', kind: 'text', span: 'full' },
    ],
    amountLabel: 'Custo da coleta',
    alertLabel: 'Lembrete',
    titlePlaceholder: 'Ex.: Coleta de sêmen — temporada',
    autoTitle: () => 'Coleta de sêmen',
    summary: (e) =>
      join(
        str(e.data.method),
        e.data.dosesProduced ? `${str(e.data.dosesAvailable) || '0'} de ${str(e.data.dosesProduced)} doses disponíveis` : null,
        pre('motilidade', e.data.motility, '%'),
        pre('vigor', e.data.vigor),
        str(e.data.canister),
        e.data.expiryDate ? `validade ${fmtDate(str(e.data.expiryDate))}` : null,
      ),
    normalize: (ev) => {
      const prod = Number(ev.data.dosesProduced) || 0;
      if (ev.data.dosesAvailable === null || ev.data.dosesAvailable === undefined || ev.data.dosesAvailable === '') ev.data.dosesAvailable = prod;
      if (Number(ev.data.dosesAvailable) > prod && prod > 0) throw new Error('Doses disponíveis não podem passar das produzidas.');
      const v = Number(ev.data.vigor);
      if (ev.data.vigor && (v < 1 || v > 5)) throw new Error('O vigor vai de 1 a 5.');
    },
  },
  EXPENSE: {
    type: 'EXPENSE',
    noun: 'despesa',
    fields: [{ key: 'category', label: 'Categoria', kind: 'select', options: EXPENSE_CATEGORIES }],
    amountLabel: 'Valor',
    alertLabel: 'Lembrete',
    titlePlaceholder: 'Ex.: Feno e ração do mês',
    autoTitle: (d) => str(d.category) || 'Despesa',
    summary: (e) => str(e.data.category),
  },
  REVENUE: {
    type: 'REVENUE',
    noun: 'receita',
    fields: [{ key: 'category', label: 'Categoria', kind: 'select', options: REVENUE_CATEGORIES }],
    amountLabel: 'Valor',
    alertLabel: 'Lembrete',
    titlePlaceholder: 'Ex.: Cobertura para haras parceiro',
    autoTitle: (d) => str(d.category) || 'Receita',
    summary: (e) => str(e.data.category),
  },
};
