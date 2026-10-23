/**
 * Estado da transformação: saída por tabela (deduplicada por id), índices de
 * consulta (produtos por nome, clientes, parceiros…) e criação de registros
 * provisórios para manter as referências válidas.
 */
import type { Row, TableName } from '../domain/schema';
import type { Customer, MeatType, Partner, PartnerKind, Product } from '../domain/types';
import { READ_ERRORS_KEY, type LegacyDump } from './collections';
import { cutScore, docs, isObj, normalizeCut, slug, str, Warnings, type Doc } from './legacy-utils';

export interface TransformOptions {
  /** Momento da migração (ISO) — usado em carimbos sem data. Padrão: data do backup ou 2000-01-01. */
  now?: string;
  /** Fuso para converter momentos em dia. Padrão: -180 (Brasília). */
  tzOffsetMinutes?: number;
  /**
   * Manter ids de usuários do sistema antigo (vendedor, criador, conta do portal).
   * true no Firebase (mesmo projeto → mesmos uids); false no PostgreSQL (uids mudam).
   */
  keepLegacyUserIds?: boolean;
}

/** Arquivo do sistema antigo guardado em pedaços no banco (sales_attachments) a copiar para o Storage. */
export interface LegacyFileCopy {
  /** Id do documento em sales_attachments ({saleId} ou {saleId}__boleto). */
  key: string;
  saleId: string;
  saleNumber: string;
  kind: 'NF' | 'BOLETO';
  name: string;
  mimeType: string;
  size: number | null;
  chunks: number | null;
}

export class Ctx {
  readonly w = new Warnings();
  readonly now: string;
  readonly keepIds: boolean;
  private out = new Map<TableName, Map<string, unknown>>();
  /** Documentos já lidos por coleção (com id garantido). */
  private cache = new Map<string, Doc[]>();

  // Índices
  readonly products = new ProductIndex(this);
  readonly customers = new Map<string, Customer>();
  readonly partners = new Map<string, Partner>();
  readonly userNames = new Map<string, string>(); // uid → nome
  readonly userEmails = new Map<string, string>(); // uid → e-mail
  readonly extSellerUid = new Map<string, string>(); // e-mail → uid
  /** PDFs em pedaços a copiar depois da gravação (etapa de arquivos). */
  readonly files: LegacyFileCopy[] = [];

  constructor(
    readonly dump: LegacyDump,
    opts: TransformOptions,
  ) {
    const meta = isObj((dump as Record<string, unknown>).metadata) ? ((dump as Record<string, unknown>).metadata as Doc) : null;
    this.now = opts.now || str(meta?.timestamp) || '2000-01-01T00:00:00.000Z';
    this.keepIds = opts.keepLegacyUserIds ?? true;
  }

  /** Documentos de uma coleção antiga (cada um com `id`). */
  col(name: string): Doc[] {
    let c = this.cache.get(name);
    if (!c) {
      const raw = (this.dump as Record<string, unknown>)[name];
      c = docs(raw).map((d, i) => (str(d.id) ? d : { ...d, id: `${name}-${i + 1}` }));
      const missing = docs(raw).filter((d) => !str(d.id)).length;
      if (missing) this.w.add(`noid.${name}`, `Documentos sem id em "${name}" (id gerado pela posição — reimportar o mesmo arquivo não duplica)`);
      this.cache.set(name, c);
    }
    return c;
  }

  has(name: string): boolean {
    return Array.isArray((this.dump as Record<string, unknown>)[name]);
  }

  readErrors(): { collection: string; message: string }[] {
    return docs((this.dump as Record<string, unknown>)[READ_ERRORS_KEY]).map((d) => ({ collection: str(d.collection) || '?', message: str(d.message) || '' }));
  }

  // ---------------------------------------------------------------- saída
  put<K extends TableName>(table: K, row: Row<K>): Row<K> {
    let m = this.out.get(table);
    if (!m) {
      m = new Map();
      this.out.set(table, m);
    }
    m.set((row as { id: string }).id, row);
    return row;
  }

  get<K extends TableName>(table: K, id: string | null | undefined): Row<K> | undefined {
    if (!id) return undefined;
    return this.out.get(table)?.get(id) as Row<K> | undefined;
  }

  rows<K extends TableName>(table: K): Row<K>[] {
    return [...(this.out.get(table)?.values() || [])] as Row<K>[];
  }

  tables(): Partial<Record<TableName, unknown[]>> {
    const r: Partial<Record<TableName, unknown[]>> = {};
    for (const [t, m] of this.out) if (m.size) r[t] = [...m.values()];
    return r;
  }

  // ---------------------------------------------------------------- usuários
  /** Id de usuário antigo (ou null quando os uids não sobrevivem à migração). */
  uid(v: unknown): string | null {
    return this.keepIds ? str(v) : null;
  }

  userName(uid: unknown, fallback?: unknown): string | null {
    const u = str(uid);
    return str(fallback) || (u ? this.userNames.get(u) || this.userEmails.get(u) || null : null);
  }

  // ---------------------------------------------------------------- provisórios
  /** Garante um cliente com este id (cria um provisório se não existir). */
  ensureCustomer(id: string, name: string | null, from: string, extra?: Partial<Customer>): Customer {
    const cur = this.customers.get(id);
    if (cur) return cur;
    this.w.add('cust.placeholder', 'Pedidos com cliente que não existe mais no cadastro antigo — criado cliente provisório (revise)', name || id);
    const c: Customer = {
      id,
      createdAt: this.now,
      updatedAt: this.now,
      legacyId: id,
      name: name || 'Cliente não encontrado (migração)',
      personType: 'J',
      document: '',
      category: 'EXTERNO_CNPJ',
      creditLimit: 0,
      allowedPaymentMethods: ['PIX', 'BOLETO'],
      financialApproval: 'PENDING',
      isIntercompany: false,
      status: 'ACTIVE',
      ranking: 'BRONZE',
      stars: 0,
      totalPurchases: 0,
      ordersCount: 0,
      documents: [],
      notes: `Cadastro provisório criado na migração (${from}).`,
      ...extra,
    };
    this.customers.set(id, c);
    this.put('customers', c);
    return c;
  }

  /** Parceiro por id ou nome; cria um provisório pelo nome quando necessário. */
  ensurePartner(kind: PartnerKind, id: unknown, name: unknown): Partner | null {
    const pid = str(id);
    if (pid && this.partners.has(pid)) return this.partners.get(pid)!;
    const pname = str(name);
    if (!pname) {
      if (pid) this.w.add('partner.missing', 'Referências a parceiros (fornecedor/frigorífico) que não existem mais — vínculo removido', pid);
      return null;
    }
    const n = normalizeCut(pname);
    for (const p of this.partners.values()) if (normalizeCut(p.name) === n) return p;
    const newId = pid || `p-${slug(pname)}`;
    const p: Partner = {
      id: newId,
      createdAt: this.now,
      updatedAt: this.now,
      legacyId: pid,
      kind,
      name: pname,
      active: true,
      notes: 'Cadastro criado na migração a partir do nome usado no sistema antigo.',
    };
    this.w.add('partner.placeholder', 'Parceiros citados só pelo nome — cadastro criado automaticamente', pname);
    this.partners.set(newId, p);
    this.put('partners', p);
    return p;
  }
}

// ============================================================================
// Produtos por nome de corte
// ============================================================================

export interface ProductHints {
  meatType?: MeatType | null;
  unit?: 'KG' | 'UN';
  category?: string | null;
}

export class ProductIndex {
  private legacy: Product[] = [];
  private exact = new Map<string, Product>();
  private ids = new Set<string>();
  private fuzzy = new Set<string>();
  constructor(private ctx: Ctx) {}

  add(p: Product, legacy: boolean) {
    const n = normalizeCut(p.name);
    if (legacy) {
      if (n && this.exact.has(n)) this.ctx.w.add('prod.dup', 'Produtos com nome repetido no sistema antigo (mantidos os dois; vendas e estoque usam o primeiro)', p.name);
      this.legacy.push(p);
    }
    if (n && !this.exact.has(n)) this.exact.set(n, p);
    this.ids.add(p.id);
    this.ctx.put('products', p);
  }

  /** Produto pelo nome (exato; senão a melhor semelhança com os produtos do sistema antigo). */
  resolve(name: string | null | undefined): Product | null {
    const n = normalizeCut(name);
    if (!n) return null;
    const hit = this.exact.get(n);
    if (hit) return hit;
    let best: Product | null = null;
    let bestScore = 0;
    for (const p of this.legacy) {
      const s = cutScore(name, p.name);
      if (s > bestScore || (s === bestScore && s > 0 && best && p.name.localeCompare(best.name) < 0)) {
        best = p;
        bestScore = s;
      }
    }
    if (best && !this.fuzzy.has(n)) {
      this.fuzzy.add(n);
      this.ctx.w.add('prod.fuzzy', 'Cortes associados a produtos por semelhança de nome (confira)', `${name} → ${best.name}`);
    }
    return best;
  }

  /** Produto existente ou criado agora (id `cut-<nome>`). */
  ensure(name: string, hints: ProductHints = {}): Product {
    const found = this.resolve(name);
    if (found) return found;
    let id = `cut-${slug(name)}`;
    for (let i = 2; this.ids.has(id); i++) id = `cut-${slug(name)}-${i}`;
    const raw = hints.meatType === 'RAW';
    const p: Product = {
      id,
      createdAt: this.ctx.now,
      updatedAt: this.ctx.now,
      legacyId: null,
      name: name.trim(),
      code: null,
      category: hints.category || (raw ? 'Carcaça / pós-abate' : 'Outros'),
      meatType: hints.meatType || 'OTHER',
      unit: hints.unit || 'KG',
      minStock: null,
      defaultPrice: null,
      active: true,
      description: 'Criado na migração: nome usado no estoque/vendas do sistema antigo sem produto cadastrado.',
    };
    this.ctx.w.add('prod.created', 'Produtos criados a partir de nomes de corte sem cadastro no sistema antigo', p.name);
    this.add(p, false);
    return p;
  }
}
