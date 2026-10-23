import type { Row, TableName } from '../domain/schema';
import type { Attachment, PortalAccount, Profile, PublicCatalogLink } from '../domain/types';

// ============================================================================
// Consultas
// ============================================================================

export type WhereOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'array-contains';
export type Where<T> = [keyof T & string, WhereOp, unknown];

export interface ListQuery<T> {
  where?: Where<T>[];
  orderBy?: [keyof T & string, 'asc' | 'desc'];
  limit?: number;
}

/** Linha nova: id/createdAt/updatedAt são opcionais (gerados automaticamente). */
export type NewRow<K extends TableName> = Omit<Row<K>, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type Patch<K extends TableName> = Partial<Omit<Row<K>, 'id' | 'createdAt'>>;

// ============================================================================
// Transações (usadas pelas operações de negócio em /ops)
// ============================================================================

/**
 * Transação otimista: leituras primeiro, escritas ficam em buffer e são
 * gravadas de uma vez só no final (tudo ou nada). Se outro usuário alterou
 * algo que foi lido, a transação é repetida automaticamente.
 *
 * - Firestore: runTransaction nativo.
 * - PostgreSQL: função apply_changes() com checagem de versão.
 * - Demonstração: memória.
 */
export interface Tx {
  get<K extends TableName>(table: K, id: string): Promise<Row<K> | null>;
  query<K extends TableName>(table: K, q?: ListQuery<Row<K>>): Promise<Row<K>[]>;
  /** Retorna o id (gerado se não informado). */
  insert<K extends TableName>(table: K, row: NewRow<K>): string;
  update<K extends TableName>(table: K, id: string, patch: Patch<K>): void;
  delete<K extends TableName>(table: K, id: string): void;
}

export type ChangeOp =
  | { op: 'insert'; table: TableName; id: string; row: Record<string, unknown> }
  | { op: 'update'; table: TableName; id: string; patch: Record<string, unknown>; version?: number | null }
  | { op: 'delete'; table: TableName; id: string; version?: number | null };

export class ConflictError extends Error {
  constructor(message = 'Os dados foram alterados por outro usuário. Tente novamente.') {
    super(message);
    this.name = 'ConflictError';
  }
}

export class PermissionError extends Error {
  constructor(message = 'Você não tem permissão para esta ação.') {
    super(message);
    this.name = 'PermissionError';
  }
}

// ============================================================================
// API de dados
// ============================================================================

export interface DataApi {
  list<K extends TableName>(table: K, q?: ListQuery<Row<K>>): Promise<Row<K>[]>;
  get<K extends TableName>(table: K, id: string): Promise<Row<K> | null>;
  insert<K extends TableName>(table: K, row: NewRow<K>): Promise<Row<K>>;
  update<K extends TableName>(table: K, id: string, patch: Patch<K>): Promise<void>;
  remove<K extends TableName>(table: K, id: string): Promise<void>;
  /** Gravação em massa (importação/migração). Sobrescreve pelo id. */
  upsertMany<K extends TableName>(table: K, rows: Row<K>[]): Promise<void>;
  /** Avisa quando algo na tabela mudou (tempo real). Retorna função para cancelar. */
  subscribe(table: TableName, onChange: () => void): () => void;
  runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}

// ============================================================================
// Autenticação
// ============================================================================

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  photoUrl?: string | null;
}

export type ProfileResolution =
  | { status: 'ok'; profile: Profile }
  | { status: 'denied'; reason: 'NOT_INVITED' | 'BLOCKED' | 'UNVERIFIED' | 'ERROR'; message: string };

export type PortalResolution =
  /** `notice`: aviso para a tela de cadastro em análise (ex.: confirmar o e-mail para usar o convite). */
  | { status: 'ok'; account: PortalAccount; notice?: string | null }
  | { status: 'none' }
  | { status: 'error'; message: string };

export interface SignUpPortalInput {
  email: string;
  password: string;
  name: string;
  phone?: string;
  companyName?: string;
  personType?: 'F' | 'J';
  document?: string;
  zipCode?: string;
  street?: string;
  number?: string;
  complement?: string;
  district?: string;
  city?: string;
  state?: string;
}

export interface AuthApi {
  current(): AuthUser | null;
  /** Dispara imediatamente com o estado atual e depois a cada mudança. */
  onChange(cb: (user: AuthUser | null) => void): () => void;
  signInWithGoogle(): Promise<void>;
  signInWithPassword(email: string, password: string): Promise<void>;
  signUpWithPassword(email: string, password: string, name: string): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  signOut(): Promise<void>;
  /**
   * Garante o perfil interno do usuário logado aplicando as regras:
   * convite → papel do convite; domínio corporativo → OPERATOR;
   * primeiro usuário do sistema → ADMIN; senão, acesso negado.
   * Também atualiza lastLoginAt/loginCount.
   */
  ensureProfile(): Promise<ProfileResolution>;
  /** Portal do cliente: conta do usuário logado (se existir). */
  getPortalAccount(): Promise<PortalResolution>;
  /** Portal do cliente: cria usuário + conta PENDING. */
  signUpPortal(input: SignUpPortalInput): Promise<void>;
}

// ============================================================================
// Arquivos
// ============================================================================

export interface StorageApi {
  upload(folder: string, file: File | Blob, opts?: { name?: string; kind?: Attachment['kind'] }): Promise<Attachment>;
  /** URL para abrir/baixar (pode ser temporária). */
  url(att: Pick<Attachment, 'path' | 'url'>): Promise<string>;
  remove(path: string): Promise<void>;
}

// ============================================================================
// Acesso público (sem login)
// ============================================================================

export interface PublicApi {
  /** Catálogo público por token (link compartilhável). Null se inválido/expirado. */
  getCatalog(token: string): Promise<PublicCatalogLink | null>;
}

// ============================================================================
// Backend
// ============================================================================

export interface BackendInfo {
  kind: 'supabase' | 'firebase' | 'demo';
  label: string; // "PostgreSQL (Supabase)" | "Firebase (Firestore)" | "Demonstração"
  /** true quando rodando com dados de exemplo em memória. */
  demo: boolean;
}

export interface Backend {
  info: BackendInfo;
  data: DataApi;
  auth: AuthApi;
  storage: StorageApi;
  public: PublicApi;
}
