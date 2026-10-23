/**
 * Importação de clientes por CSV: arquivo → mapeamento de colunas → prévia
 * validada (CPF/CNPJ, duplicados) → gravação em lotes.
 */
import { AlertTriangle, CheckCircle2, Download, UploadCloud } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useCrud, useInvalidate, useTable } from '../../data/react';
import { formatDocument, isValidDocument, normalize, onlyDigits, round2 } from '../../domain/format';
import { CUSTOMER_CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from '../../domain/labels';
import type { Customer, PaymentMethod, Profile } from '../../domain/types';
import { Badge, Button, Callout, DataTable, exportCsv, Field, FormGrid, Modal, parseCsv, Progress, Segmented, Select, toast, type Column } from '../../ui';
import { DEFAULT_ALLOWED_METHODS } from './helpers';

type FieldKey =
  | 'name'
  | 'tradeName'
  | 'document'
  | 'stateRegistration'
  | 'contactName'
  | 'cellphone'
  | 'phone'
  | 'email'
  | 'zipCode'
  | 'street'
  | 'number'
  | 'complement'
  | 'district'
  | 'city'
  | 'state'
  | 'segment'
  | 'paymentTerms'
  | 'paymentMethod'
  | 'creditLimit'
  | 'seller';

/** Ordem = prioridade da detecção automática (específicos primeiro). */
const FIELDS: { key: FieldKey; label: string; required?: boolean; re: RegExp }[] = [
  { key: 'tradeName', label: 'Nome fantasia', re: /fantasia|trade/ },
  { key: 'document', label: 'CPF / CNPJ', required: true, re: /cnpj|cpf|documento|^doc/ },
  { key: 'stateRegistration', label: 'Inscrição estadual', re: /inscri.*estad|^ie$|^i e$/ },
  { key: 'name', label: 'Razão social / nome', required: true, re: /raz[aã]o|^nome|cliente|name/ },
  { key: 'contactName', label: 'Contato / responsável', re: /contato|respons/ },
  { key: 'cellphone', label: 'Celular / WhatsApp', re: /celular|whats|cel$/ },
  { key: 'phone', label: 'Telefone', re: /telefone|^tel|fone|phone/ },
  { key: 'email', label: 'E-mail', re: /e ?mail/ },
  { key: 'zipCode', label: 'CEP', re: /cep|zip/ },
  { key: 'street', label: 'Logradouro', re: /logradouro|endere|^rua|street/ },
  { key: 'number', label: 'Número', re: /^n[uú]mero$|^num|^n[ºo°]?$/ },
  { key: 'complement', label: 'Complemento', re: /compl/ },
  { key: 'district', label: 'Bairro', re: /bairro/ },
  { key: 'city', label: 'Cidade', re: /cidade|munic[ií]pio|city/ },
  { key: 'state', label: 'UF', re: /^uf$|estado|state/ },
  { key: 'segment', label: 'Segmento', re: /segmento|setor|ramo/ },
  { key: 'paymentTerms', label: 'Condição / prazos', re: /condi|prazo/ },
  { key: 'paymentMethod', label: 'Forma de pagamento', re: /forma|meio de pag/ },
  { key: 'creditLimit', label: 'Limite de crédito', re: /limite|cr[eé]dito/ },
  { key: 'seller', label: 'Vendedor', re: /vendedor|representante/ },
];

type Mapping = Partial<Record<FieldKey, string>>;

interface Parsed {
  line: number;
  row: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>;
  errors: string[];
  warnings: string[];
}

function autoMap(headers: string[]): Mapping {
  const used = new Set<string>();
  const m: Mapping = {};
  for (const f of FIELDS) {
    const h = headers.find((x) => !used.has(x) && f.re.test(normalize(x)));
    if (h) {
      m[f.key] = h;
      used.add(h);
    }
  }
  return m;
}

function parseMoney(s: string): number {
  const t = (s || '').replace(/[R$\s]/g, '');
  if (!t) return 0;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? round2(n) : 0;
}

function parseMethod(s: string): PaymentMethod | null {
  const t = normalize(s).toUpperCase();
  if (!t) return null;
  if (t.includes('PIX')) return 'PIX';
  if (t.includes('BOLETO')) return 'BOLETO';
  if (t.includes('TRANSF') || t.includes('TED')) return 'TRANSFER';
  if (t.includes('CART') || t.includes('CARD')) return 'CARD';
  if (t.includes('DINHEIRO') || t.includes('ESPECIE')) return 'CASH';
  if (t.includes('PRAZO') || t.includes('CREDIA')) return 'CREDIT';
  return null;
}

export function CustomerImportModal({ onClose }: { onClose: () => void }) {
  const { rows: customers } = useTable('customers');
  const { rows: profiles } = useTable('profiles');
  const crud = useCrud('customers');
  const invalidate = useInvalidate();
  const input = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<'upload' | 'map' | 'preview' | 'done'>('upload');
  const [fileName, setFileName] = useState('');
  const [raw, setRaw] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [filter, setFilter] = useState<'ALL' | 'OK' | 'ERR'>('ALL');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ ok: number; failed: number } | null>(null);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const rows = await parseCsv(f);
      if (!rows.length) throw new Error('O arquivo está vazio.');
      const hs = Object.keys(rows[0]).filter(Boolean);
      setRaw(rows);
      setHeaders(hs);
      setMapping(autoMap(hs));
      setFileName(f.name);
      setStep('map');
    } catch (e) {
      toast.error('Não foi possível ler o CSV: ' + (e as Error).message);
    }
  };

  const parsed = useMemo<Parsed[]>(() => {
    if (step === 'upload') return [];
    const existing = new Map(customers.map((c) => [onlyDigits(c.document), c.name]));
    const seen = new Map<string, number>();
    const sellerByName = new Map<string, Profile>(profiles.map((p) => [normalize(p.name), p]));
    const get = (r: Record<string, string>, k: FieldKey) => (mapping[k] ? String(r[mapping[k]!] ?? '').trim() : '');
    return raw.map((r, i) => {
      const errors: string[] = [];
      const warnings: string[] = [];
      const name = get(r, 'name');
      const doc = onlyDigits(get(r, 'document'));
      const personType: 'F' | 'J' = doc.length > 11 ? 'J' : 'F';
      if (!name) errors.push('Nome em branco');
      if (!doc) errors.push('Sem CPF/CNPJ');
      else if (!isValidDocument(doc)) errors.push(`${personType === 'J' ? 'CNPJ' : 'CPF'} inválido`);
      else if (existing.has(doc)) errors.push(`Já cadastrado (${existing.get(doc)})`);
      else if (seen.has(doc)) errors.push(`Repetido na linha ${seen.get(doc)}`);
      if (doc && !seen.has(doc)) seen.set(doc, i + 2);
      const methodTxt = get(r, 'paymentMethod');
      const method = parseMethod(methodTxt);
      if (methodTxt && !method) warnings.push(`Forma "${methodTxt}" não reconhecida`);
      const sellerTxt = get(r, 'seller');
      const seller = sellerTxt ? sellerByName.get(normalize(sellerTxt)) : undefined;
      if (sellerTxt && !seller) warnings.push(`Vendedor "${sellerTxt}" não encontrado`);
      const allowed = method && !DEFAULT_ALLOWED_METHODS.includes(method) ? [...DEFAULT_ALLOWED_METHODS, method] : [...DEFAULT_ALLOWED_METHODS];
      const terms = get(r, 'paymentTerms').match(/\d+/g);
      const row: Parsed['row'] = {
        name,
        tradeName: get(r, 'tradeName') || null,
        personType,
        document: doc,
        stateRegistration: get(r, 'stateRegistration') || null,
        category: personType === 'J' ? 'EXTERNO_CNPJ' : 'EXTERNO_PF',
        segment: get(r, 'segment') || null,
        zipCode: onlyDigits(get(r, 'zipCode')) || null,
        street: get(r, 'street') || null,
        number: get(r, 'number') || null,
        complement: get(r, 'complement') || null,
        district: get(r, 'district') || null,
        city: get(r, 'city') || null,
        state: get(r, 'state').toUpperCase().slice(0, 2) || null,
        phone: onlyDigits(get(r, 'phone')) || null,
        cellphone: onlyDigits(get(r, 'cellphone')) || null,
        email: get(r, 'email').toLowerCase() || null,
        contactName: get(r, 'contactName') || null,
        paymentTerms: terms ? terms.join('/') : null,
        creditLimit: parseMoney(get(r, 'creditLimit')),
        preferredPaymentMethod: method ?? 'PIX',
        allowedPaymentMethods: allowed,
        financialApproval: 'PENDING',
        sellerId: seller?.id ?? null,
        sellerName: seller?.name ?? null,
        priceTableId: null,
        isIntercompany: false,
        status: 'ACTIVE',
        ranking: 'BRONZE',
        stars: 0,
        totalPurchases: 0,
        ordersCount: 0,
        lastPurchaseAt: null,
        documents: [],
        notes: null,
      };
      return { line: i + 2, row, errors, warnings };
    });
  }, [raw, mapping, customers, profiles, step]);

  const valid = parsed.filter((p) => !p.errors.length);
  const invalid = parsed.length - valid.length;
  const shown = parsed.filter((p) => (filter === 'ALL' ? true : filter === 'OK' ? !p.errors.length : p.errors.length > 0));

  const runImport = async () => {
    const total = valid.length;
    if (!total) return;
    setProgress({ done: 0, total });
    let ok = 0;
    let failed = 0;
    const BATCH = 25;
    for (let i = 0; i < total; i += BATCH) {
      const chunk = valid.slice(i, i + BATCH);
      const res = await Promise.allSettled(chunk.map((p) => crud.insert(p.row)));
      res.forEach((r) => (r.status === 'fulfilled' ? ok++ : failed++));
      setProgress({ done: Math.min(total, i + BATCH), total });
    }
    invalidate('customers');
    setResult({ ok, failed });
    setStep('done');
    if (ok) toast.success(`${ok} cliente(s) importado(s)`);
    if (failed) toast.error(`${failed} linha(s) não puderam ser gravadas.`);
  };

  const template = () =>
    exportCsv('modelo-importacao-clientes', [{}], [
      { header: 'Razão social', value: () => 'Restaurante Exemplo Ltda' },
      { header: 'Nome fantasia', value: () => 'Exemplo Grill' },
      { header: 'CNPJ/CPF', value: () => '11.222.333/0001-81' },
      { header: 'Inscrição estadual', value: () => '' },
      { header: 'Contato', value: () => 'Maria Silva' },
      { header: 'Celular', value: () => '(19) 99999-0000' },
      { header: 'E-mail', value: () => 'compras@exemplo.com.br' },
      { header: 'CEP', value: () => '13010-000' },
      { header: 'Logradouro', value: () => 'Rua Exemplo' },
      { header: 'Número', value: () => '100' },
      { header: 'Bairro', value: () => 'Centro' },
      { header: 'Cidade', value: () => 'Campinas' },
      { header: 'UF', value: () => 'SP' },
      { header: 'Segmento', value: () => 'Restaurante' },
      { header: 'Prazo', value: () => '28/35' },
      { header: 'Forma de pagamento', value: () => 'Boleto' },
      { header: 'Limite de crédito', value: () => '5000,00' },
      { header: 'Vendedor', value: () => '' },
    ]);

  const columns: Column<Parsed>[] = [
    { key: 'line', header: 'Linha', width: '64px', cell: (p) => <span className="num text-muted">{p.line}</span>, mobile: false },
    {
      key: 'name',
      header: 'Cliente',
      mobile: 'title',
      cell: (p) => (
        <div className="min-w-0">
          <div className="font-medium text-fg truncate">{p.row.name || '—'}</div>
          {p.row.tradeName && <div className="text-xs text-muted truncate">{p.row.tradeName}</div>}
        </div>
      ),
    },
    { key: 'doc', header: 'Documento', mobile: 'subtitle', cell: (p) => <span className="num">{formatDocument(p.row.document) || '—'}</span> },
    { key: 'cat', header: 'Categoria', hideBelow: 'lg', cell: (p) => CUSTOMER_CATEGORY_LABELS[p.row.category] },
    { key: 'city', header: 'Cidade', hideBelow: 'md', cell: (p) => (p.row.city ? `${p.row.city}${p.row.state ? '/' + p.row.state : ''}` : '—') },
    { key: 'pay', header: 'Pagamento', hideBelow: 'lg', cell: (p) => PAYMENT_METHOD_LABELS[p.row.preferredPaymentMethod || 'PIX'] },
    {
      key: 'status',
      header: 'Situação',
      mobile: 'badge',
      cell: (p) =>
        p.errors.length ? (
          <Badge tone="danger" dot>
            {p.errors[0]}
          </Badge>
        ) : p.warnings.length ? (
          <span title={p.warnings.join(' · ')}>
            <Badge tone="warning" dot>
              Ok, com aviso
            </Badge>
          </span>
        ) : (
          <Badge tone="success" dot>
            Pronto
          </Badge>
        ),
    },
  ];

  const missingRequired = FIELDS.filter((f) => f.required && !mapping[f.key]);

  return (
    <Modal
      open
      onClose={progress && step === 'preview' ? () => undefined : onClose}
      size="xl"
      title="Importar clientes (CSV)"
      description={
        step === 'upload'
          ? 'Planilha com uma linha por cliente. Aceita separador ; ou , (exporte do Excel como CSV).'
          : `${fileName} · ${raw.length} linha(s)`
      }
      footer={
        step === 'upload' ? (
          <>
            <Button variant="ghost" icon={<Download className="size-4" />} onClick={template}>
              Baixar modelo
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
          </>
        ) : step === 'map' ? (
          <>
            <Button variant="ghost" onClick={() => setStep('upload')}>
              Voltar
            </Button>
            <Button variant="primary" disabled={missingRequired.length > 0} onClick={() => setStep('preview')}>
              Conferir {raw.length} linha(s)
            </Button>
          </>
        ) : step === 'preview' ? (
          <>
            <Button variant="ghost" disabled={!!progress} onClick={() => setStep('map')}>
              Voltar ao mapeamento
            </Button>
            <Button variant="primary" loading={!!progress} disabled={!valid.length} onClick={() => void runImport()}>
              Importar {valid.length} cliente(s)
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={onClose}>
            Concluir
          </Button>
        )
      }
    >
      {/* Passos */}
      <div className="flex items-center gap-2 text-xs mb-4">
        {(['Arquivo', 'Colunas', 'Prévia', 'Concluído'] as const).map((l, i) => {
          const idx = ['upload', 'map', 'preview', 'done'].indexOf(step);
          return (
            <span key={l} className="inline-flex items-center gap-2">
              {i > 0 && <span className="h-px w-4 sm:w-8 bg-border" />}
              <Badge tone={i === idx ? 'primary' : i < idx ? 'success' : 'neutral'}>
                {i + 1}. {l}
              </Badge>
            </span>
          );
        })}
      </div>

      {step === 'upload' && (
        <div
          onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void onFile(e.dataTransfer.files?.[0]);
          }}
          className="flex flex-col items-center justify-center text-center gap-2 rounded-card border border-dashed border-border-strong hover:border-primary/60 hover:bg-surface-2/60 cursor-pointer px-4 py-12"
        >
          <UploadCloud className="size-8 text-muted" />
          <div className="text-sm text-fg">Arraste o arquivo CSV ou clique para escolher</div>
          <div className="text-xs text-subtle">Colunas mínimas: razão social/nome e CPF/CNPJ. As demais são opcionais.</div>
          <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
        </div>
      )}

      {step === 'map' && (
        <div className="space-y-4">
          <Callout tone="info">
            Detectamos as colunas automaticamente. Confira e ajuste; campos sem coluna ficam em branco. Novos clientes entram ativos, com aprovação financeira
            pendente, ranking Bronze e Pix/Boleto liberados.
          </Callout>
          <FormGrid cols={3}>
            {FIELDS.map((f) => (
              <Field key={f.key} label={f.label} required={f.required} error={f.required && !mapping[f.key] ? 'Obrigatório' : undefined}>
                <Select
                  value={mapping[f.key] || ''}
                  onChange={(v) => setMapping((m) => ({ ...m, [f.key]: v || undefined }))}
                  placeholder="— não importar —"
                  options={headers.map((h) => ({ value: h, label: h }))}
                />
              </Field>
            ))}
          </FormGrid>
          {raw[0] && (
            <p className="text-xs text-subtle">
              Exemplo da 1ª linha: {mapping.name ? raw[0][mapping.name] : '—'} · {mapping.document ? raw[0][mapping.document] : '—'}
              {mapping.city ? ` · ${raw[0][mapping.city]}` : ''}
            </p>
          )}
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'ALL', label: 'Todas', count: parsed.length },
                { value: 'OK', label: 'Prontas', count: valid.length },
                { value: 'ERR', label: 'Com erro', count: invalid },
              ]}
            />
            {invalid > 0 && <span className="text-xs text-muted">Linhas com erro serão ignoradas — corrija o arquivo e importe de novo se precisar.</span>}
          </div>
          {progress && (
            <div className="space-y-1.5">
              <Progress value={progress.done} max={progress.total} />
              <p className="text-xs text-muted num">
                Gravando {progress.done} de {progress.total}…
              </p>
            </div>
          )}
          <DataTable columns={columns} rows={shown} rowKey={(p) => String(p.line)} pageSize={10} dense emptyTitle="Nenhuma linha neste filtro" />
        </div>
      )}

      {step === 'done' && result && (
        <div className="py-8 text-center space-y-3">
          {result.failed ? <AlertTriangle className="size-10 mx-auto text-warning" /> : <CheckCircle2 className="size-10 mx-auto text-success" />}
          <h3 className="text-lg font-semibold text-fg">{result.ok} cliente(s) importado(s)</h3>
          <p className="text-sm text-muted">
            {result.failed ? `${result.failed} não puderam ser gravados. ` : ''}
            {invalid ? `${invalid} linha(s) ignorada(s) por erro. ` : ''}
            Os novos clientes aguardam aprovação financeira.
          </p>
        </div>
      )}
    </Modal>
  );
}
