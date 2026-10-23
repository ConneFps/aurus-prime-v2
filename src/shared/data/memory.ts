import type { Row, TableName } from '../domain/schema';
import { TABLE_NAMES } from '../domain/schema';
import type { Attachment, PortalAccount, Profile } from '../domain/types';
import type {
  AuthApi,
  AuthUser,
  Backend,
  ChangeOp,
  DataApi,
  ListQuery,
  NewRow,
  Patch,
  PortalResolution,
  ProfileResolution,
  PublicApi,
  SignUpPortalInput,
  StorageApi,
  Tx,
} from './api';
import { BufferedTx } from './buffered-tx';
import { applyQuery, clone, nowIso, uuid } from './query';

type Store = Map<TableName, Map<string, Record<string, unknown>>>;

/**
 * Backend em memória — usado no MODO DEMONSTRAÇÃO (prévia sem banco) e nos testes.
 * Nada é salvo: recarregar a página volta aos dados de exemplo.
 */
export class MemoryData implements DataApi {
  store: Store = new Map();
  private listeners = new Map<TableName, Set<() => void>>();
  private pending = new Set<TableName>();
  private flushScheduled = false;

  constructor() {
    for (const t of TABLE_NAMES) this.store.set(t, new Map());
  }

  private table(t: TableName) {
    let m = this.store.get(t);
    if (!m) {
      m = new Map();
      this.store.set(t, m);
    }
    return m;
  }

  private notify(t: TableName) {
    this.pending.add(t);
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    queueMicrotask(() => {
      this.flushScheduled = false;
      const tables = [...this.pending];
      this.pending.clear();
      for (const tb of tables) this.listeners.get(tb)?.forEach((cb) => cb());
    });
  }

  private rowsOf(t: TableName): Record<string, unknown>[] {
    if (t === 'sale_items') {
      // Tabela derivada: itens embutidos nas vendas.
      return [...this.table('sales').values()].flatMap((s) => (s.items as Record<string, unknown>[]) || []);
    }
    return [...this.table(t).values()];
  }

  async list<K extends TableName>(table: K, q?: ListQuery<Row<K>>): Promise<Row<K>[]> {
    return clone(applyQuery(this.rowsOf(table), q as unknown as ListQuery<Record<string, unknown>>)) as unknown as Row<K>[];
  }

  async get<K extends TableName>(table: K, id: string): Promise<Row<K> | null> {
    const r = this.table(table).get(id);
    return r ? (clone(r) as unknown as Row<K>) : null;
  }

  async insert<K extends TableName>(table: K, row: NewRow<K>): Promise<Row<K>> {
    const id = row.id || uuid();
    const now = nowIso();
    const full = { ...clone(row), id, createdAt: row.createdAt || now, updatedAt: row.updatedAt || now };
    this.table(table).set(id, full as Record<string, unknown>);
    this.notify(table);
    return clone(full) as unknown as Row<K>;
  }

  async update<K extends TableName>(table: K, id: string, patch: Patch<K>): Promise<void> {
    const cur = this.table(table).get(id);
    if (!cur) throw new Error(`Registro não encontrado: ${table}/${id}`);
    this.table(table).set(id, { ...cur, ...clone(patch), id, updatedAt: nowIso() });
    this.notify(table);
  }

  async remove<K extends TableName>(table: K, id: string): Promise<void> {
    this.table(table).delete(id);
    this.notify(table);
  }

  async upsertMany<K extends TableName>(table: K, rows: Row<K>[]): Promise<void> {
    for (const r of rows) this.table(table).set((r as { id: string }).id, clone(r) as unknown as Record<string, unknown>);
    this.notify(table);
  }

  subscribe(table: TableName, onChange: () => void): () => void {
    let set = this.listeners.get(table);
    if (!set) {
      set = new Set();
      this.listeners.set(table, set);
    }
    set.add(onChange);
    return () => set!.delete(onChange);
  }

  applyChanges(changes: ChangeOp[]) {
    for (const c of changes) {
      const t = this.table(c.table);
      if (c.op === 'insert') t.set(c.id, clone(c.row));
      else if (c.op === 'update') {
        const cur = t.get(c.id);
        if (!cur) throw new Error(`Registro não encontrado: ${c.table}/${c.id}`);
        t.set(c.id, { ...cur, ...clone(c.patch) });
      } else if (c.op === 'delete') t.delete(c.id);
      this.notify(c.table);
    }
  }

  async runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const tx = new BufferedTx({
      readOne: async (t, id) => {
        const r = this.table(t).get(id);
        return r ? clone(r) : null;
      },
      readMany: async (t, q) => clone(applyQuery(this.rowsOf(t), q)),
    });
    const result = await fn(tx);
    this.applyChanges(tx.changes());
    return result;
  }

  /** Exporta tudo (debug/testes). */
  dump(): Record<string, unknown[]> {
    const out: Record<string, unknown[]> = {};
    for (const [t, m] of this.store) out[t] = clone([...m.values()]);
    return out;
  }
}

// ----------------------------------------------------------------------------
// Auth de demonstração
// ----------------------------------------------------------------------------

class MemoryAuth implements AuthApi {
  private user: AuthUser | null = null;
  private listeners = new Set<(u: AuthUser | null) => void>();

  constructor(private data: MemoryData) {}

  current() {
    return this.user;
  }

  onChange(cb: (u: AuthUser | null) => void) {
    this.listeners.add(cb);
    cb(this.user);
    return () => this.listeners.delete(cb);
  }

  private set(u: AuthUser | null) {
    this.user = u;
    this.listeners.forEach((cb) => cb(u));
  }

  async signInWithGoogle() {
    const admin = (await this.data.list('profiles', { where: [['role', '==', 'ADMIN']], limit: 1 }))[0];
    if (!admin) throw new Error('Nenhum usuário de demonstração.');
    this.set({ id: admin.id, email: admin.email, name: admin.name });
  }

  /** Na demonstração qualquer senha funciona: basta o e-mail existir. */
  async signInWithPassword(email: string) {
    const e = email.trim().toLowerCase();
    const p = (await this.data.list('profiles', { where: [['email', '==', e]], limit: 1 }))[0];
    if (p) return this.set({ id: p.id, email: p.email, name: p.name });
    const a = (await this.data.list('portal_accounts', { where: [['email', '==', e]], limit: 1 }))[0];
    if (a) return this.set({ id: a.id, email: a.email, name: a.name });
    throw new Error('Usuário não encontrado na demonstração. Use um dos acessos sugeridos.');
  }

  async signUpWithPassword(email: string, _password: string, name: string) {
    const id = uuid();
    this.set({ id, email: email.toLowerCase(), name });
  }

  async sendPasswordReset() {
    /* sem efeito na demonstração */
  }

  async signOut() {
    this.set(null);
  }

  async ensureProfile(): Promise<ProfileResolution> {
    if (!this.user) return { status: 'denied', reason: 'ERROR', message: 'Sem sessão.' };
    const p = await this.data.get('profiles', this.user.id);
    if (!p) return { status: 'denied', reason: 'NOT_INVITED', message: 'Este acesso não é de um usuário interno.' };
    if (!p.active) return { status: 'denied', reason: 'BLOCKED', message: 'Usuário bloqueado.' };
    await this.data.update('profiles', p.id, { lastLoginAt: nowIso(), loginCount: (p.loginCount || 0) + 1 });
    return { status: 'ok', profile: (await this.data.get('profiles', p.id)) as Profile };
  }

  async getPortalAccount(): Promise<PortalResolution> {
    if (!this.user) return { status: 'none' };
    let a = (await this.data.get('portal_accounts', this.user.id)) as PortalAccount | null;
    // Convite pendente para este e-mail: a conta entra aprovada (na demonstração não há confirmação de e-mail).
    if (!a || a.status === 'PENDING') {
      const inv = await this.data.get('portal_invites', this.user.email);
      if (inv && inv.status === 'PENDING') {
        const now = nowIso();
        if (a) await this.data.update('portal_accounts', a.id, { status: 'APPROVED', customerId: inv.customerId, approvedByName: 'Convite do portal', approvedAt: now });
        else
          await this.data.insert('portal_accounts', {
            id: this.user.id,
            email: this.user.email,
            name: inv.name || this.user.name || inv.customerName,
            phone: inv.phone ?? null,
            companyName: inv.customerName,
            document: inv.document ?? null,
            status: 'APPROVED',
            customerId: inv.customerId,
            approvedByName: 'Convite do portal',
            approvedAt: now,
          } as NewRow<'portal_accounts'>);
        await this.data.update('portal_invites', inv.id, { status: 'ACCEPTED', acceptedAt: now, accountId: this.user.id });
        a = (await this.data.get('portal_accounts', this.user.id)) as PortalAccount | null;
      }
    }
    return a ? { status: 'ok', account: a } : { status: 'none' };
  }

  async signUpPortal(input: SignUpPortalInput) {
    const id = uuid();
    const { password: _pw, ...rest } = input;
    await this.data.insert('portal_accounts', {
      ...rest,
      id,
      email: input.email.toLowerCase(),
      status: 'PENDING',
    } as NewRow<'portal_accounts'>);
    this.set({ id, email: input.email.toLowerCase(), name: input.name });
  }
}

// ----------------------------------------------------------------------------
// Storage de demonstração (URLs locais do navegador)
// ----------------------------------------------------------------------------

class MemoryStorage implements StorageApi {
  private blobs = new Map<string, string>();

  async upload(folder: string, file: File | Blob, opts?: { name?: string; kind?: Attachment['kind'] }): Promise<Attachment> {
    const name = opts?.name || (file as File).name || 'arquivo';
    const path = `${folder}/${uuid()}-${name}`;
    const url = typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(file) : '';
    this.blobs.set(path, url);
    return { id: uuid(), name, path, url, mimeType: file.type || null, size: file.size, kind: opts?.kind || 'OTHER', uploadedAt: nowIso() };
  }

  async url(att: Pick<Attachment, 'path' | 'url'>) {
    return att.url || this.blobs.get(att.path) || '';
  }

  async remove(path: string) {
    this.blobs.delete(path);
  }
}

class MemoryPublic implements PublicApi {
  constructor(private data: MemoryData) {}
  async getCatalog(token: string) {
    const link = (await this.data.list('public_catalog_links', { where: [['token', '==', token]], limit: 1 }))[0];
    if (!link || !link.active) return null;
    if (link.expiresAt && link.expiresAt < new Date().toISOString().slice(0, 10)) return null;
    return link;
  }
}

export function createMemoryBackend(): Backend & { data: MemoryData } {
  const data = new MemoryData();
  return {
    info: { kind: 'demo', label: 'Demonstração (dados de exemplo)', demo: true },
    data,
    auth: new MemoryAuth(data),
    storage: new MemoryStorage(),
    public: new MemoryPublic(data),
  };
}

/** Utilitário para testes: insere linhas diretamente. */
export async function seedRows<K extends TableName>(data: DataApi, table: K, rows: NewRow<K>[]) {
  for (const r of rows) await data.insert(table, r);
}

export type { Row };
