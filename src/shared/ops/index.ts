/**
 * Ponto de entrada das operações. createOps(ctx) devolve o objeto Ops ligado
 * ao backend e ao usuário atual. (Implementação em ./impl/*.ts)
 */
import { cattleOps } from './impl/cattle';
import { customerOps } from './impl/customers';
import { equineOps } from './impl/equines';
import { financeOps } from './impl/finance';
import { portalOps } from './impl/portal';
import { pricingOps } from './impl/pricing';
import { processingOps } from './impl/processing';
import { salesOps } from './impl/sales';
import { stockOps } from './impl/stock';
import { supplyOps } from './impl/supplies';
import { userOps } from './impl/users';
import type { Ops, OpsContext } from './types';

export * from './types';
export { OpsError } from './impl/common';

export function createOps(ctx: OpsContext): Ops {
  const ops: Ops = {
    ...salesOps(ctx),
    ...financeOps(ctx),
    ...stockOps(ctx),
    ...cattleOps(ctx),
    ...processingOps(ctx),
    ...supplyOps(ctx),
    ...customerOps(ctx),
    ...pricingOps(ctx),
    ...portalOps(ctx),
    ...equineOps(ctx),
    ...userOps(ctx),
  };
  return ops;
}
