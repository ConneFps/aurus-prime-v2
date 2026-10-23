/** Estrutura de um guia da central de ajuda. */
export interface GuideTask {
  /** Ex.: "Lançar um pedido do início ao fim". */
  title: string;
  steps: string[];
}

export interface GuideFaq {
  q: string;
  a: string;
}

export interface Guide {
  /** = id do item do NAV (app/registry.tsx) ou id próprio (guias extras). */
  id: string;
  /** Título (padrão: rótulo do NAV). */
  title?: string;
  /** Seção do índice (padrão: seção do NAV). */
  section?: string;
  /** Rota do módulo (padrão: path do NAV). */
  path?: string;
  /** Para que serve — 1 a 3 frases. */
  summary: string;
  /** Quem costuma usar (texto livre). */
  audience?: string;
  tasks: GuideTask[];
  tips?: string[];
  faq?: GuideFaq[];
}
