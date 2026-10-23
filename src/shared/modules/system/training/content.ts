/**
 * Conteúdo da central de ajuda (Treinamento). Um guia por item do NAV
 * (app/registry.tsx) + guias de abertura e dos canais externos.
 * Título, rota, ícone e permissão vêm do NAV quando o id coincide.
 */
import { BookOpen, Globe, Rocket, Smartphone, Sparkles, Workflow, type LucideIcon } from 'lucide-react';
import { NAV } from '../../../app/registry';
import type { Permission } from '../../../domain/permissions';
import { normalize } from '../../../domain/format';
import { CATTLE_GUIDES } from './guides/cattle';
import { COMMERCIAL_GUIDES } from './guides/commercial';
import { FINANCE_GUIDES } from './guides/finance';
import { PRODUCTION_GUIDES } from './guides/production';
import { START_GUIDES } from './guides/start';
import type { Guide } from './types';

export interface ResolvedGuide extends Guide {
  title: string;
  section: string;
  icon: LucideIcon;
  permission?: Permission;
}

const RAW: Guide[] = [...START_GUIDES, ...CATTLE_GUIDES, ...PRODUCTION_GUIDES, ...COMMERCIAL_GUIDES, ...FINANCE_GUIDES];
const byId = new Map(RAW.map((g) => [g.id, g]));

const EXTRA_ICONS: Record<string, LucideIcon> = {
  'primeiros-passos': Rocket,
  novidades: Sparkles,
  'fluxo-pedido': Workflow,
  'app-vendedor': Smartphone,
  'portal-cliente': Globe,
};

const START_SECTION = 'Comece aqui';
const EXTERNAL_SECTION = 'Canais externos';

/** Guias na ordem do índice: Comece aqui → seções do NAV → Canais externos. */
export const GUIDES: ResolvedGuide[] = [
  ...START_GUIDES.map((g) => ({ ...g, title: g.title || g.id, section: START_SECTION, icon: EXTRA_ICONS[g.id] || BookOpen })),
  ...NAV.flatMap((sec) =>
    sec.items.map((item): ResolvedGuide => {
      const g = byId.get(item.id);
      return {
        id: item.id,
        title: g?.title || item.label,
        section: sec.label,
        path: g?.path || item.path,
        icon: item.icon,
        permission: item.permission,
        summary: g?.summary || item.description || '',
        audience: g?.audience,
        tasks: g?.tasks || [],
        tips: g?.tips,
        faq: g?.faq,
      };
    }),
  ),
  ...COMMERCIAL_GUIDES.filter((g) => g.section === EXTERNAL_SECTION).map((g) => ({
    ...g,
    title: g.title || g.id,
    section: EXTERNAL_SECTION,
    icon: EXTRA_ICONS[g.id] || BookOpen,
  })),
];

export const GUIDE_SECTIONS: string[] = [...new Set(GUIDES.map((g) => g.section))];

/** Texto pesquisável do guia (sem acento, minúsculo). */
const HAYSTACK = new Map(
  GUIDES.map((g) => [
    g.id,
    normalize(
      [g.title, g.section, g.summary, g.audience, ...g.tasks.flatMap((t) => [t.title, ...t.steps]), ...(g.tips || []), ...(g.faq || []).flatMap((f) => [f.q, f.a])].join(' '),
    ),
  ]),
);

/** Busca: todas as palavras precisam aparecer. Ordena título > resumo > corpo. */
export function searchGuides(q: string, list: ResolvedGuide[] = GUIDES): ResolvedGuide[] {
  const words = normalize(q).split(' ').filter(Boolean);
  if (!words.length) return list;
  const scored = list
    .map((g) => {
      const hay = HAYSTACK.get(g.id) || '';
      if (!words.every((w) => hay.includes(w))) return null;
      const t = normalize(g.title);
      const s = normalize(g.summary);
      const score = words.reduce((acc, w) => acc + (t.includes(w) ? 10 : 0) + (s.includes(w) ? 3 : 0) + 1, 0);
      return { g, score };
    })
    .filter((x): x is { g: ResolvedGuide; score: number } => !!x);
  return scored.sort((a, b) => b.score - a.score).map((x) => x.g);
}

/** Trecho do guia onde a busca aparece (para a lista de resultados). */
export function searchSnippet(g: ResolvedGuide, q: string): string {
  const words = normalize(q).split(' ').filter(Boolean);
  const texts = [...g.tasks.flatMap((t) => t.steps), ...(g.tips || []), ...(g.faq || []).flatMap((f) => [f.q, f.a])];
  const hit = texts.find((t) => words.some((w) => normalize(t).includes(w)));
  return hit || g.summary;
}

/** Guias sem conteúdo próprio (só a descrição do NAV) — ajuda a manter o conteúdo completo. */
export const MISSING_GUIDES = GUIDES.filter((g) => !g.tasks.length).map((g) => g.id);
