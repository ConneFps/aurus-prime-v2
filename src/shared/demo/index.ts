import type { Backend } from '../data/api';
import { createMemoryBackend, type MemoryData } from '../data/memory';
import { addDays, daysBetween, today } from '../domain/format';
import { DEMO_TODAY as SEED_TODAY } from './seed-data';
import { seedDemo } from './seed';

export { seedDemo, DEMO_TODAY, type DemoSummary } from './seed';

export { DEMO_USERS } from './users';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/**
 * Desloca todas as datas da demonstração para que o "hoje" dos dados de
 * exemplo seja sempre o dia real (a demo nunca fica velha).
 */
export function shiftDemoDates(data: MemoryData, days: number) {
  if (!days) return;
  const ms = days * 86400000;
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      if (DAY_RE.test(v)) return addDays(v, days);
      if (TS_RE.test(v)) {
        const t = Date.parse(v);
        return Number.isNaN(t) ? v : new Date(t + ms).toISOString();
      }
      return v;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const o: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) o[k] = walk(x);
      return o;
    }
    return v;
  };
  for (const [, rows] of data.store) for (const [id, row] of rows) rows.set(id, walk(row) as Record<string, unknown>);
}

/** Backend de demonstração com ~6 meses de dados de exemplo terminando hoje. */
export async function createDemoBackend(): Promise<Backend> {
  const backend = createMemoryBackend();
  await seedDemo(backend.data);
  shiftDemoDates(backend.data, daysBetween(SEED_TODAY, today()));
  // acesso para testes automatizados (somente na demonstração)
  if (typeof window !== 'undefined') (window as unknown as { __aurusDemo?: Backend }).__aurusDemo = backend;
  return backend;
}
