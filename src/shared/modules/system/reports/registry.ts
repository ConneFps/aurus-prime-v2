/**
 * Registro de relatórios (ordem = ordem no catálogo). Para criar um novo,
 * escreva o `defineReport` no arquivo da área e acrescente aqui.
 */
import { batchDre, costsByCategory, deboningYield } from './production';
import { cashFlowRealized, commissionsReport, payablesReport, receivablesAging } from './finance';
import { auditReport, equineHerd } from './other';
import { abcCustomers, salesByCustomer, salesByPeriod, salesByProduct, salesBySeller } from './sales';
import { expiryReport, lossesReport, movementsReport, stockPosition } from './stock';
import type { ReportDef } from './types';

export const REPORTS: ReportDef[] = [
  salesByPeriod,
  salesByCustomer,
  salesByProduct,
  salesBySeller,
  abcCustomers,
  stockPosition,
  expiryReport,
  movementsReport,
  lossesReport,
  batchDre,
  costsByCategory,
  deboningYield,
  receivablesAging,
  payablesReport,
  cashFlowRealized,
  commissionsReport,
  equineHerd,
  auditReport,
];

export const reportById = (id: string | null | undefined) => REPORTS.find((r) => r.id === id) || null;
