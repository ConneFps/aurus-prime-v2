/**
 * BACKEND FIREBASE — Opção B (Firestore + Auth + Storage, SDK JS v12)
 * ---------------------------------------------------------------------------
 * Implementa a interface `Backend` (shared/src/data/api.ts). Toda a regra de
 * negócio continua em TypeScript (shared/src/ops) — aqui só há leitura/gravação.
 *
 *  - Cada tabela do TableMap é uma coleção de nível superior; o documento é o
 *    objeto do tipo como está (datas em texto ISO). `sale_items` NÃO é coleção:
 *    os itens ficam embutidos em `sales.items` (a "tabela" é derivada).
 *  - Consultas: no servidor vão só filtros que dispensam índice composto
 *    (ver planServer); ordenação, limite e o resto são aplicados no cliente.
 *  - Usuários restritos (vendedor externo, cliente do portal): o backend
 *    acrescenta o filtro do dono (sellerId / portalAccountId…) que as regras
 *    exigem — ver SessionScope em firebase-util.ts.
 *  - Tempo real: um onSnapshot por coleção (avisos agrupados em 250 ms). Com a
 *    escuta sincronizada, as listas são lidas do cache local (sem custo extra).
 *  - Transações: runTransaction nativo + BufferedTx (leituras dentro da
 *    transação; escritas aplicadas no final, tudo ou nada).
 */
import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getDocsFromCache,
  getFirestore,
  increment,
  initializeFirestore,
  memoryLocalCache,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  runTransaction as fsRunTransaction,
  setDoc,
  updateDoc,
  where as fsWhere,
  writeBatch,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type Query,
  type Transaction,
  type UpdateData,
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, getStorage, ref as storageRef, uploadBytes, type FirebaseStorage } from 'firebase/storage';
import type {
  Backend,
  ChangeOp,
  DataApi,
  ListQuery,
  NewRow,
  Patch,
  PublicApi,
  StorageApi,
  Tx,
  Where,
} from '@shared/data/api';
import { BufferedTx } from '@shared/data/buffered-tx';
import { applyQuery, nowIso, stripUndefined, uuid } from '@shared/data/query';
import { today } from '@shared/domain/format';
import type { Row, TableName } from '@shared/domain/schema';
import type { Attachment, PublicCatalogLink, SaleItem } from '@shared/domain/types';
import { FirebaseAuthApi } from './firebase-auth';
import {
  EXTERNAL_READABLE,
  errorCode,
  friendlyError,
  fromSnap,
  isPermissionDenied,
  planServer,
  PORTAL_READABLE,
  SessionScope,
} from './firebase-util';

export interface FirebaseBackendConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId?: string;
  appId: string;
  measurementId?: string;
  /** Banco NOMEADO do Aurus Prime 2.0 (ex.: "aurus-prime-v2"). */
  firestoreDatabaseId: string;
  /** Banco do sistema antigo (fonte da migração) — quando ele está no MESMO projeto. */
  legacyFirestoreDatabaseId?: string;
  /** Sistema antigo em OUTRO projeto Firebase: configuração web dele + banco. */
  legacy?: LegacyFirebaseConfig | null;
}

export interface LegacyFirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId?: string;
  appId: string;
  firestoreDatabaseId: string;
}

export interface FirebaseHandles {
  app: FirebaseApp;
  db: Firestore;
  auth: Auth;
  storage: FirebaseStorage;
  config: FirebaseBackendConfig;
}

type AnyRow = Record<string, unknown>;
type AnyWhere = Where<AnyRow>;

const DEBOUNCE_MS = 250;
const BATCH_SIZE = 450;
const TX_READ_CHUNK = 50;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** Gravações em settings sempre mantêm bootstrapped = true (senão o "primeiro acesso vira ADMIN" reabriria). */
function prepareWrite(table: TableName, row: AnyRow): AnyRow {
  return table === 'settings' ? { ...row, bootstrapped: true } : row;
}

function assertWritable(table: TableName) {
  if (table === 'sale_items') throw new Error('Itens de venda ficam dentro do pedido (sales.items) — altere o pedido.');
}

// ============================================================================
// Dados
// ============================================================================

interface Sub {
  coll: TableName;
  listeners: Set<() => void>;
  unsub: (() => void) | null;
  /** Escuta de consulta que cobre tudo o que o usuário pode ver (o cache local fica completo). */
  cacheable: boolean;
  synced: boolean;
  scopeKey: string;
  first: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

class FirestoreData implements DataApi {
  private subs = new Map<TableName, Sub>();

  constructor(
    private db: Firestore,
    private auth: Auth,
    private scope: SessionScope,
  ) {
    // Mudou o usuário/perfil: refaz as escutas com os filtros novos e avisa as telas.
    scope.onChange(() => {
      for (const sub of this.subs.values()) {
        this.detach(sub);
        this.attach(sub);
        sub.listeners.forEach((cb) => cb());
      }
    });
  }

  // ---------------------------------------------------------------- leitura

  /** Consulta do servidor com os filtros possíveis + os filtros do escopo. */
  private plan(table: TableName, where: AnyWhere[]): { q: Query; where: AnyWhere[] } | null {
    const all = [...where, ...(this.scope.filters(table) as AnyWhere[])];
    const plan = planServer(all);
    if (plan.empty) return null;
    return { q: query(collection(this.db, table), ...plan.constraints), where: all };
  }

  private canUseCache(table: TableName): boolean {
    const sub = this.subs.get(table);
    return !!sub && sub.cacheable && sub.synced && !!sub.unsub && sub.scopeKey === this.scope.key();
  }

  private async fetch(table: TableName, where: AnyWhere[]): Promise<AnyRow[]> {
    const p = this.plan(table, where);
    if (!p) return [];
    let snap;
    if (this.canUseCache(table)) {
      snap = await getDocsFromCache(p.q).catch(() => getDocs(p.q));
    } else {
      snap = await getDocs(p.q);
    }
    return applyQuery(snap.docs.map((d) => fromSnap<AnyRow>(d)), { where: p.where });
  }

  /** Itens embutidos nas vendas (tabela derivada). */
  private async saleItems(
    where: AnyWhere[],
    readSale: (id: string) => Promise<AnyRow | null>,
    listSales: () => Promise<AnyRow[]>,
  ): Promise<AnyRow[]> {
    const bySale = where.find(([f, op, v]) => f === 'saleId' && op === '==' && typeof v === 'string');
    const sales = bySale ? [await readSale(bySale[2] as string)].filter((s): s is AnyRow => !!s) : await listSales();
    return sales.flatMap((s) =>
      ((s.items as SaleItem[]) || []).map((it) => ({ ...it, saleId: it.saleId || (s.id as string) }) as unknown as AnyRow),
    );
  }

  async list<K extends TableName>(table: K, q?: ListQuery<Row<K>>): Promise<Row<K>[]> {
    const where = (q?.where || []) as AnyWhere[];
    try {
      let rows: AnyRow[];
      if (table === 'sale_items') {
        rows = await this.saleItems(
          where,
          async (id) => this.getRaw('sales', id),
          () => this.fetch('sales', []),
        );
      } else {
        rows = await this.fetch(table, where);
      }
      return applyQuery(rows, q as unknown as ListQuery<AnyRow>) as unknown as Row<K>[];
    } catch (e) {
      throw friendlyError(e);
    }
  }

  private async getRaw(table: TableName, id: string): Promise<AnyRow | null> {
    try {
      const snap = await getDoc(doc(this.db, table, id));
      return snap.exists() ? fromSnap<AnyRow>(snap) : null;
    } catch (e) {
      // Sem login (ex.: tela de entrada lendo as configurações): trata como inexistente.
      if (!this.auth.currentUser && isPermissionDenied(e)) return null;
      throw e;
    }
  }

  async get<K extends TableName>(table: K, id: string): Promise<Row<K> | null> {
    if (!id) return null;
    try {
      if (table === 'sale_items') {
        const items = await this.list('sale_items', { where: [['id', '==', id]] } as never);
        return (items[0] as Row<K>) ?? null;
      }
      return (await this.getRaw(table, id)) as Row<K> | null;
    } catch (e) {
      throw friendlyError(e);
    }
  }

  // ---------------------------------------------------------------- escrita

  async insert<K extends TableName>(table: K, row: NewRow<K>): Promise<Row<K>> {
    assertWritable(table);
    const id = row.id || uuid();
    const now = nowIso();
    const full = prepareWrite(table, { ...row, id, createdAt: row.createdAt || now, updatedAt: row.updatedAt || now });
    try {
      await setDoc(doc(this.db, table, id), stripUndefined(full));
    } catch (e) {
      throw friendlyError(e);
    }
    return full as unknown as Row<K>;
  }

  async update<K extends TableName>(table: K, id: string, patch: Patch<K>): Promise<void> {
    assertWritable(table);
    const p: AnyRow = { ...(patch as AnyRow), updatedAt: nowIso() };
    delete p.id;
    delete p.createdAt;
    try {
      await updateDoc(doc(this.db, table, id), stripUndefined(prepareWrite(table, p)) as UpdateData<DocumentData>);
    } catch (e) {
      if (errorCode(e) === 'not-found') throw new Error(`Registro não encontrado: ${table}/${id}`);
      throw friendlyError(e);
    }
  }

  async remove<K extends TableName>(table: K, id: string): Promise<void> {
    assertWritable(table);
    try {
      await deleteDoc(doc(this.db, table, id));
    } catch (e) {
      throw friendlyError(e);
    }
  }

  async upsertMany<K extends TableName>(table: K, rows: Row<K>[]): Promise<void> {
    assertWritable(table);
    try {
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = writeBatch(this.db);
        for (const r of rows.slice(i, i + BATCH_SIZE)) {
          const row = r as unknown as AnyRow;
          const id = String(row.id || uuid());
          batch.set(doc(this.db, table, id), stripUndefined(prepareWrite(table, { ...row, id })));
        }
        await batch.commit();
      }
    } catch (e) {
      throw friendlyError(e);
    }
  }

  // ---------------------------------------------------------------- tempo real

  /**
   * Avisa quando a coleção muda. Equipe: escuta a coleção inteira. Vendedor
   * externo / cliente do portal: escuta só o que as regras liberam (com o filtro
   * do dono) — coleções proibidas não são escutadas, e qualquer erro de
   * permissão do onSnapshot é só registrado no console (a tela continua de pé,
   * apenas sem atualização automática).
   */
  subscribe(table: TableName, onChange: () => void): () => void {
    const coll: TableName = table === 'sale_items' ? 'sales' : table;
    let sub = this.subs.get(coll);
    if (!sub) {
      sub = { coll, listeners: new Set(), unsub: null, cacheable: false, synced: false, scopeKey: '', first: true, timer: null };
      this.subs.set(coll, sub);
      this.attach(sub);
    }
    const s = sub;
    s.listeners.add(onChange);
    return () => {
      s.listeners.delete(onChange);
      if (s.listeners.size === 0) {
        this.detach(s);
        if (this.subs.get(coll) === s) this.subs.delete(coll);
      }
    };
  }

  private target(coll: TableName): { ref: Query | DocumentReference; cacheable: boolean } | null {
    const s = this.scope.get();
    if (s.kind === 'portal') {
      if (coll === 'portal_accounts') return { ref: doc(this.db, 'portal_accounts', s.uid), cacheable: false };
      if (coll === 'customers') return s.customerId ? { ref: doc(this.db, 'customers', s.customerId), cacheable: false } : null;
      if (!PORTAL_READABLE.includes(coll)) return null;
    }
    if (s.kind === 'external' && !EXTERNAL_READABLE.includes(coll)) return null;
    if (s.kind === 'staff' && (coll === 'invites' || coll === 'audit_logs') && s.role !== 'ADMIN' && s.role !== 'MANAGER') {
      return null;
    }
    const filters = this.scope.filters(coll);
    const base = collection(this.db, coll);
    const q = filters.length ? query(base, ...filters.map(([f, op, v]) => fsWhere(f, op as '==', v))) : base;
    return { ref: q, cacheable: true };
  }

  private attach(sub: Sub) {
    sub.scopeKey = this.scope.key();
    sub.first = true;
    sub.synced = false;
    sub.cacheable = false;
    // Só escuta depois de saber quem é o usuário (perfil/conta resolvidos);
    // a escuta é refeita automaticamente quando o escopo muda.
    if (!this.auth.currentUser || this.scope.get().kind === 'none') return;
    const t = this.target(sub.coll);
    if (!t) return;
    sub.cacheable = t.cacheable;
    const fire = () => {
      if (sub.timer) clearTimeout(sub.timer);
      sub.timer = setTimeout(() => {
        sub.timer = null;
        sub.listeners.forEach((cb) => cb());
      }, DEBOUNCE_MS);
    };
    const onError = (err: unknown) => {
      sub.synced = false;
      sub.unsub = null;
      console.warn(`[firebase] tempo real indisponível para "${sub.coll}" (${errorCode(err) || err}). A tela segue sem atualização automática.`);
    };
    if (t.ref.type === 'document') {
      sub.unsub = onSnapshot(
        t.ref as DocumentReference,
        () => {
          if (sub.first) {
            sub.first = false;
            return;
          }
          fire();
        },
        onError,
      );
    } else {
      sub.unsub = onSnapshot(
        t.ref as Query,
        { includeMetadataChanges: true },
        (snap) => {
          sub.synced = !snap.metadata.fromCache;
          if (sub.first) {
            sub.first = false;
            return;
          }
          if (snap.docChanges().length === 0) return; // só mudou metadado (ex.: gravação confirmada)
          fire();
        },
        onError,
      );
    }
  }

  private detach(sub: Sub) {
    if (sub.timer) clearTimeout(sub.timer);
    sub.timer = null;
    sub.unsub?.();
    sub.unsub = null;
    sub.synced = false;
  }

  // ---------------------------------------------------------------- transações

  async runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await fsRunTransaction(this.db, async (t) => {
        const readOne = async (table: TableName, id: string): Promise<AnyRow | null> => {
          if (table === 'sale_items' || !id) return null;
          const s = await t.get(doc(this.db, table, id));
          return s.exists() ? fromSnap<AnyRow>(s) : null;
        };
        const readMany = async (table: TableName, q?: ListQuery<AnyRow>): Promise<AnyRow[]> => {
          const where = (q?.where || []) as AnyWhere[];
          if (table === 'sale_items') {
            const rows = await this.saleItems(where, (id) => readOne('sales', id), () => this.txReadMany(t, 'sales', []));
            return applyQuery(rows, { where });
          }
          return this.txReadMany(t, table, where);
        };
        const btx = new BufferedTx({ readOne, readMany });
        const result = await fn(btx);
        for (const c of btx.changes()) this.applyChange(t, c);
        return result;
      });
    } catch (e) {
      throw friendlyError(e);
    }
  }

  /** Consulta (fora da transação) e relê cada documento DENTRO dela, para a checagem de concorrência. */
  private async txReadMany(t: Transaction, table: TableName, where: AnyWhere[]): Promise<AnyRow[]> {
    const p = this.plan(table, where);
    if (!p) return [];
    const snap = await getDocs(p.q);
    const out: AnyRow[] = [];
    for (let i = 0; i < snap.docs.length; i += TX_READ_CHUNK) {
      const chunk = await Promise.all(snap.docs.slice(i, i + TX_READ_CHUNK).map((d) => t.get(d.ref)));
      for (const s of chunk) if (s.exists()) out.push(fromSnap<AnyRow>(s));
    }
    return applyQuery(out, { where: p.where });
  }

  private applyChange(t: Transaction, c: ChangeOp) {
    assertWritable(c.table);
    const ref = doc(this.db, c.table, c.id);
    if (c.op === 'insert') {
      t.set(ref, stripUndefined(prepareWrite(c.table, { ...c.row, id: c.id })));
    } else if (c.op === 'update') {
      const p: AnyRow = { ...c.patch };
      delete p.id;
      t.update(ref, stripUndefined(prepareWrite(c.table, p)) as UpdateData<DocumentData>);
    } else {
      t.delete(ref);
    }
  }
}

// ============================================================================
// Arquivos
// ============================================================================

const EXT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  xml: 'application/xml',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
};

/** Nome seguro para o Storage: sem acentos, espaços ou símbolos. */
function safeName(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|-+$/g, '');
  if (!base) return 'arquivo';
  if (base.length <= 80) return base;
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 && base.length - dot <= 8 ? base.slice(dot) : '';
  return base.slice(0, 80 - ext.length) + ext;
}

class FirebaseStorageApi implements StorageApi {
  constructor(
    private storage: FirebaseStorage,
    private auth: Auth,
  ) {}

  async upload(folder: string, file: File | Blob, opts?: { name?: string; kind?: Attachment['kind'] }): Promise<Attachment> {
    const name = opts?.name || (file as File).name || 'arquivo';
    if (file.size > MAX_UPLOAD_BYTES) throw new Error(`O arquivo "${name}" passa de 15 MB.`);
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const contentType = file.type || EXT_TYPES[ext] || 'application/octet-stream';
    const path = `${folder.replace(/^\/+|\/+$/g, '')}/${uuid()}-${safeName(name)}`;
    const r = storageRef(this.storage, path);
    try {
      await uploadBytes(r, file, { contentType });
      const url = await getDownloadURL(r);
      const u = this.auth.currentUser;
      return {
        id: uuid(),
        name,
        path,
        url,
        mimeType: contentType,
        size: file.size,
        kind: opts?.kind || 'OTHER',
        uploadedAt: nowIso(),
        uploadedBy: u ? u.displayName || u.email || u.uid : null,
      };
    } catch (e) {
      throw friendlyError(e);
    }
  }

  async url(att: Pick<Attachment, 'path' | 'url'>): Promise<string> {
    if (att.url) return att.url;
    try {
      return await getDownloadURL(storageRef(this.storage, att.path));
    } catch (e) {
      throw friendlyError(e);
    }
  }

  async remove(path: string): Promise<void> {
    try {
      await deleteObject(storageRef(this.storage, path));
    } catch (e) {
      if (errorCode(e) === 'storage/object-not-found') return;
      throw friendlyError(e);
    }
  }
}

// ============================================================================
// Acesso público (catálogo compartilhável)
// ============================================================================

class FirebasePublicApi implements PublicApi {
  constructor(private db: Firestore) {}

  async getCatalog(token: string): Promise<PublicCatalogLink | null> {
    if (!token) return null;
    const ref = doc(this.db, 'public_catalog_links', token);
    let link: PublicCatalogLink;
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      link = fromSnap<PublicCatalogLink>(snap);
    } catch (e) {
      // As regras negam a leitura de links inativos/inexistentes.
      if (isPermissionDenied(e)) return null;
      throw friendlyError(e);
    }
    if (!link.active) return null;
    if (link.expiresAt && link.expiresAt < today()) return null;
    updateDoc(ref, { views: increment(1) }).catch(() => undefined); // contador best-effort
    return link;
  }
}

// ============================================================================
// Fábrica
// ============================================================================

function initDb(app: FirebaseApp, databaseId: string): Firestore {
  try {
    return initializeFirestore(
      app,
      { ignoreUndefinedProperties: true, localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) },
      databaseId,
    );
  } catch (e) {
    console.warn('[firebase] cache local persistente indisponível — usando cache em memória.', e);
    try {
      return initializeFirestore(app, { ignoreUndefinedProperties: true, localCache: memoryLocalCache() }, databaseId);
    } catch {
      return getFirestore(app, databaseId); // já inicializado (recarga a quente)
    }
  }
}

export function createFirebaseBackend(config: FirebaseBackendConfig): Backend & { firebase: FirebaseHandles } {
  const options: FirebaseOptions = {
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    storageBucket: config.storageBucket,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
    ...(config.measurementId ? { measurementId: config.measurementId } : {}),
  };
  const app = getApps().length ? getApp() : initializeApp(options);
  const db = initDb(app, config.firestoreDatabaseId);
  const auth = getAuth(app);
  auth.languageCode = 'pt-BR';
  const storage = getStorage(app);
  const scope = new SessionScope();
  return {
    info: { kind: 'firebase', label: 'Firebase (Firestore)', demo: false },
    data: new FirestoreData(db, auth, scope),
    auth: new FirebaseAuthApi(auth, db, scope),
    storage: new FirebaseStorageApi(storage, auth),
    public: new FirebasePublicApi(db),
    firebase: { app, db, auth, storage, config },
  };
}
