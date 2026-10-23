/**
 * Contrato dos relatórios: cada relatório declara as tabelas que lê, os
 * filtros que aceita e uma função pura `build` que devolve linhas + colunas.
 * O visualizador (ReportViewer) cuida de prévia, totais, PDF e CSV.
 */
import type { LucideIcon } from 'lucide-react';
import type React from 'react';
import type { Permission } from '../../../domain/permissions';
import type { Row } from '../../../domain/schema';
import type { Tone } from '../../../domain/labels';
import type { AppSettings } from '../../../domain/types';

/** Tabelas que os relatórios podem ler. */
export const REPORT_TABLES = [
  'sales',
  'customers',
  'products',
  'profiles',
  'partners',
  'stock_lots',
  'stock_movements',
  'stock_losses',
  'batches',
  'batch_costs',
  'animals',
  'processing_orders',
  'financial_entries',
  'equines',
  'equine_events',
  'audit_logs',
] as const;
export type ReportTable = (typeof REPORT_TABLES)[number];
export type ReportData = { [K in ReportTable]: Row<K>[] };

export type ReportCategory = 'Vendas' | 'Estoque' | 'Gado e produção' | 'Financeiro' | 'Equinos' | 'Sistema';
export const REPORT_CATEGORIES: ReportCategory[] = ['Vendas', 'Estoque', 'Gado e produção', 'Financeiro', 'Equinos', 'Sistema'];

export type FilterKey = 'period' | 'customer' | 'seller' | 'batch' | 'product' | 'partner' | 'user';

export type PeriodPreset = 'month' | 'lastMonth' | '3m' | 'year' | 'all' | 'custom';

export interface ReportOption {
  key: string;
  label: string;
  choices: { value: string; label: string }[];
  default: string;
}

export interface ReportFilters {
  from: string | null;
  to: string | null;
  customerId: string | null;
  sellerId: string | null;
  batchId: string | null;
  productId: string | null;
  partnerId: string | null;
  userId: string | null;
  opts: Record<string, string>;
}

/** Tipo de valor da coluna — define formatação, alinhamento e totalização. */
export type ColKind = 'text' | 'money' | 'kg' | 'int' | 'number' | 'percent' | 'date' | 'dateTime';

export interface ReportColumn<T> {
  key: string;
  header: string;
  kind?: ColKind;
  /** Valor bruto (CSV usa este; PDF e tela formatam pelo `kind`). */
  value: (r: T) => string | number | null | undefined;
  /** Valor de ordenação (padrão: `value`). */
  sortValue?: (r: T) => string | number | null | undefined;
  /** Conteúdo visual na tela (badge, link…). Padrão: valor formatado. */
  display?: (r: T) => React.ReactNode;
  /** Totalização no rodapé. 'sum' soma `value`; função devolve o texto/valor pronto. */
  total?: 'sum' | ((rows: T[]) => string | number | null);
  mobile?: 'title' | 'subtitle' | 'badge' | false;
  hideBelow?: 'md' | 'lg' | 'xl';
  /** Esconde do PDF (colunas muito largas). */
  noPdf?: boolean;
}

export interface ReportStat {
  label: string;
  value: string;
  /** Versão curta para o celular (ex.: R$ 1,2 mi). */
  short?: string;
  hint?: string;
  tone?: Tone;
}

export interface ReportChart {
  kind: 'trend' | 'bars' | 'rank';
  title: string;
  /** Linhas do gráfico: `label` no eixo X + uma chave por série. */
  data: { label: string; [k: string]: string | number }[];
  series: { key: string; name: string }[];
  format: ColKind;
}

export interface ReportResult<T> {
  rows: T[];
  columns: ReportColumn<T>[];
  rowKey: (r: T, i: number) => string;
  stats?: ReportStat[];
  chart?: ReportChart | null;
  /** Rota ao clicar na linha. */
  link?: (r: T) => string | null;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  /** Nota de rodapé (critério usado). */
  note?: string;
  orientation?: 'portrait' | 'landscape';
  emptyText?: string;
}

export interface ReportContext {
  can: (p: Permission) => boolean;
  settings: AppSettings;
  today: string;
}

export interface ReportDef<T = unknown> {
  id: string;
  title: string;
  description: string;
  category: ReportCategory;
  icon: LucideIcon;
  permission?: Permission;
  tables: ReportTable[];
  filters: FilterKey[];
  /** Período padrão e rótulo do campo de data usado. */
  period?: { default: PeriodPreset; field: string };
  options?: ReportOption[];
  /** Palavras extras para a busca do catálogo. */
  keywords?: string;
  build: (d: ReportData, f: ReportFilters, ctx: ReportContext) => ReportResult<T>;
}

/** Registra um relatório preservando o tipo das linhas dentro de `build`. */
export function defineReport<T>(def: ReportDef<T>): ReportDef<unknown> {
  return def as unknown as ReportDef<unknown>;
}
