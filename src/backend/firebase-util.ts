/**
 * Utilitários do backend Firebase: escopo da sessão, planejamento de consultas
 * (o que vai para o servidor sem índice composto), leitura de documentos e
 * tradução de erros para português.
 */
import { FirebaseError } from 'firebase/app';
import {
  Timestamp,
  where as fsWhere,
  type DocumentSnapshot,
  type QueryConstraint,
} from 'firebase/firestore';
import { ConflictError, PermissionError, type Where, type WhereOp } from '@shared/data/api';
import type { TableName } from '@shared/domain/schema';
import type { Role } from '@shared/domain/types';

// ============================================================================
// Escopo da sessão
// ============================================================================

/**
 * Quem está usando o app — define os filtros obrigatórios das consultas.
 *  - staff:    equipe interna (lê as coleções inteiras);
 *  - external: vendedor externo (só os próprios clientes/pedidos/comissões);
 *  - portal:   cliente do portal (só os próprios pedidos);
 *  - none:     ainda não resolvido (sem filtros extras).
 */
export type Scope =
  | { kind: 'none' }
  | { kind: 'staff'; uid: string; role: Role }
  | { kind: 'external'; uid: string }
  | { kind: 'portal'; uid: string; customerId: string | null };

/**
 * Filtros que as REGRAS exigem nas consultas de usuários restritos. O Firestore
 * nega uma consulta inteira se ela puder devolver um documento proibido, então
 * o backend acrescenta o filtro do dono automaticamente (as telas e as
 * operações compartilhadas não precisam saber disso).
 */
export const EXTERNAL_SCOPE: Partial<Record<TableName, string>> = {
  sales: 'sellerId',
  customers: 'sellerId',
  financial_entries: 'sellerId',
  customer_requests: 'requestedById',
};
export const PORTAL_SCOPE: Partial<Record<TableName, string>> = {
  sales: 'portalAccountId',
};

/** Coleções que cada perfil restrito pode ESCUTAR inteiras (com o filtro acima, se houver). */
export const EXTERNAL_READABLE: TableName[] = [
  'sales', 'customers', 'financial_entries', 'customer_requests', 'products', 'stock_lots', 'price_tables',
  'catalog_items', 'settings', 'freight_zones', 'supply_items', 'profiles',
];
export const PORTAL_READABLE: TableName[] = ['sales', 'catalog_items', 'freight_zones', 'settings'];

export class SessionScope {
  private value: Scope = { kind: 'none' };
  private listeners = new Set<() => void>();

  get(): Scope {
    return this.value;
  }

  key(): string {
    const s = this.value;
    return s.kind === 'none' ? 'none' : `${s.kind}:${s.uid}`;
  }

  set(next: Scope) {
    const before = this.key() + (this.value.kind === 'portal' ? `:${this.value.customerId}` : '');
    this.value = next;
    const after = this.key() + (next.kind === 'portal' ? `:${next.customerId}` : '');
    if (before !== after) this.listeners.forEach((cb) => cb());
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Filtros obrigatórios para a coleção (vazio = sem restrição). */
  filters(table: TableName): Where<Record<string, unknown>>[] {
    const s = this.value;
    if (s.kind === 'external' && EXTERNAL_SCOPE[table]) return [[EXTERNAL_SCOPE[table]!, '==', s.uid]];
    if (s.kind === 'portal' && PORTAL_SCOPE[table]) return [[PORTAL_SCOPE[table]!, '==', s.uid]];
    return [];
  }
}

// ============================================================================
// Planejamento de consultas (sem índices compostos)
// ============================================================================

type W = [string, WhereOp, unknown];

const RANGE_OPS: WhereOp[] = ['<', '<=', '>', '>='];
const ISO_LIKE = /^\d{4}-\d{2}-\d{2}/;

const isPrimitive = (v: unknown): v is string | number | boolean =>
  typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';

/** Comparação de intervalo só vai ao servidor quando a ordem é igual à do cliente (números e datas ISO). */
const rangeSafe = (v: unknown) => typeof v === 'number' || (typeof v === 'string' && ISO_LIKE.test(v));

export interface ServerPlan {
  constraints: QueryConstraint[];
  /** A consulta não pode ter resultado (ex.: `in []` ou dois `==` diferentes no mesmo campo). */
  empty: boolean;
}

/**
 * Escolhe os filtros que podem ir ao servidor SEM índice composto:
 *  - todos os `==` com valor simples (o Firestore combina índices de campo único);
 *  - no máximo um `in` (até 30 valores, sem null) em campo sem `==`;
 *  - `array-contains` só quando for o único filtro do servidor;
 *  - desigualdades só quando TODOS os filtros são do mesmo campo.
 * O restante (null, `!=`, ordenação e limite) é aplicado no cliente com applyQuery
 * — que também reaplica todos os filtros, então o resultado é sempre exato.
 */
export function planServer(where: W[]): ServerPlan {
  const out: QueryConstraint[] = [];
  const eq = new Map<string, unknown>();
  for (const [field, op, value] of where) {
    if (op === 'in' && Array.isArray(value) && value.length === 0) return { constraints: [], empty: true };
    if (op !== '==' || !isPrimitive(value)) continue;
    if (eq.has(field)) {
      if (eq.get(field) !== value) return { constraints: [], empty: true };
      continue;
    }
    eq.set(field, value);
    out.push(fsWhere(field, '==', value));
  }
  const inClause = where.find(
    ([field, op, value]) =>
      op === 'in' && !eq.has(field) && Array.isArray(value) && value.length <= 30 && value.every((x) => isPrimitive(x)),
  );
  if (inClause) out.push(fsWhere(inClause[0], 'in', inClause[2]));
  if (out.length === 0) {
    const ac = where.find(([, op, value]) => op === 'array-contains' && isPrimitive(value));
    if (ac) return { constraints: [fsWhere(ac[0], 'array-contains', ac[2])], empty: false };
    const fields = new Set(where.map((w) => w[0]));
    if (fields.size === 1 && where.length && where.every(([, op, value]) => RANGE_OPS.includes(op) && rangeSafe(value))) {
      for (const [field, op, value] of where) out.push(fsWhere(field, op as '<', value));
    }
  }
  return { constraints: out, empty: false };
}

// ============================================================================
// Documentos
// ============================================================================

/** Converte Timestamps (gravados pelo console ou por sistemas antigos) para ISO. */
function normalize(v: unknown): unknown {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = normalize(x);
    return out;
  }
  return v;
}

/** Documento → linha do tipo (o id vem sempre do documento). */
export function fromSnap<T>(snap: DocumentSnapshot): T {
  return { ...(normalize(snap.data() || {}) as Record<string, unknown>), id: snap.id } as T;
}

// ============================================================================
// Erros em português
// ============================================================================

const FIRESTORE_MESSAGES: Record<string, string> = {
  unavailable: 'Sem conexão com o banco de dados. Verifique a internet e tente novamente.',
  'deadline-exceeded': 'O banco de dados demorou para responder. Tente novamente.',
  unauthenticated: 'Sua sessão expirou. Entre novamente.',
  'not-found': 'Registro não encontrado — ele pode ter sido excluído por outro usuário.',
  'resource-exhausted': 'Limite de uso do banco de dados atingido no momento. Tente novamente em alguns minutos.',
  'invalid-argument': 'Dados inválidos para gravar no banco de dados.',
  'already-exists': 'Este registro já existe.',
  cancelled: 'Operação cancelada.',
  internal: 'Erro interno do banco de dados. Tente novamente.',
};

const AUTH_MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/invalid-login-credentials': 'E-mail ou senha incorretos.',
  'auth/invalid-email': 'E-mail inválido.',
  'auth/missing-password': 'Informe a senha.',
  'auth/email-already-in-use': 'Este e-mail já tem cadastro. Use "Entrar" ou "Esqueci a senha".',
  'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
  'auth/user-disabled': 'Este acesso foi desativado. Fale com o administrador.',
  'auth/too-many-requests': 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.',
  'auth/network-request-failed': 'Falha de conexão. Verifique a internet e tente novamente.',
  'auth/unauthorized-domain':
    'Este endereço não está autorizado no Firebase. No console: Authentication → Configurações → Domínios autorizados.',
  'auth/operation-not-allowed': 'Este tipo de login não está ativado no Firebase (Authentication → Método de login).',
  'auth/popup-blocked': 'O navegador bloqueou a janela de login. Libere pop-ups para este site.',
  'auth/account-exists-with-different-credential': 'Este e-mail já entra por outro método (Google ou senha).',
  'auth/requires-recent-login': 'Por segurança, saia e entre novamente antes de continuar.',
};

const STORAGE_MESSAGES: Record<string, string> = {
  'storage/unauthorized':
    'Envio não permitido: o arquivo precisa ser imagem ou PDF de até 15 MB, e você precisa ter acesso a esta pasta.',
  'storage/unauthenticated': 'Sua sessão expirou. Entre novamente.',
  'storage/quota-exceeded': 'O espaço de arquivos do projeto acabou. Fale com o administrador.',
  'storage/retry-limit-exceeded': 'Falha de conexão ao enviar o arquivo. Tente novamente.',
  'storage/canceled': 'Envio cancelado.',
  'storage/object-not-found': 'Arquivo não encontrado.',
};

export function errorCode(e: unknown): string {
  return e instanceof FirebaseError ? e.code : (e as { code?: string } | null)?.code || '';
}

/** Converte erros do Firebase em mensagens para o usuário (erros de validação passam intactos). */
export function friendlyError(e: unknown): Error {
  if (!(e instanceof FirebaseError)) return e instanceof Error ? e : new Error(String(e));
  const code = e.code;
  if (code === 'permission-denied') {
    return new PermissionError(
      'Você não tem permissão para esta ação no banco de dados. Se deveria ter, peça ao administrador para conferir o seu acesso.',
    );
  }
  if (code === 'aborted') return new ConflictError();
  if (code === 'failed-precondition') {
    return /index/i.test(e.message)
      ? new Error('Esta consulta precisa de um índice no Firestore (avise o suporte técnico).')
      : new ConflictError('Os dados mudaram ou o app está sem conexão. Tente novamente.');
  }
  const msg = FIRESTORE_MESSAGES[code] || AUTH_MESSAGES[code] || STORAGE_MESSAGES[code];
  if (msg) {
    const err = new Error(msg);
    (err as Error & { code?: string }).code = code;
    return err;
  }
  return new Error(`Erro do Firebase (${code}). Tente novamente.`);
}

export const isPermissionDenied = (e: unknown) => {
  const c = errorCode(e);
  return c === 'permission-denied' || e instanceof PermissionError;
};
