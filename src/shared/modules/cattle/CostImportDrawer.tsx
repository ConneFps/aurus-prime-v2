/**
 * Importação de custos por CSV — mapeamento de colunas, prévia com validação
 * linha a linha e gravação em lote (ops.importBatchCosts).
 */
import { CheckCircle2, Download, FileSpreadsheet, UploadCloud, XCircle } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useOps } from '../../app/session';
import { useAction, useTable } from '../../data/react';
import { date, money, normalize, today } from '../../domain/format';
import type { CostCategory } from '../../domain/types';
import type { BatchCostInput } from '../../ops/types';
import { Badge, Button, Callout, Checkbox, cn, DataTable, DateInput, Drawer, exportCsv, Field, FormGrid, parseCsv, parseNumber, Select, toast, type Column } from '../../ui';
import { batchLabel, categoryLabel, findColumn, matchCostCategory, parseDateBR } from './helpers';

type MapKey = 'batch' | 'category' | 'date' | 'amount' | 'description' | 'document';
const FIELDS: { key: MapKey; label: string; aliases: string[]; required?: boolean }[] = [
  { key: 'batch', label: 'Lote / código', aliases: ['lote', 'codigo', 'codigo lote', 'batch', 'lote codigo'], required: true },
  { key: 'category', label: 'Categoria', aliases: ['categoria', 'tipo', 'category', 'custo'], required: true },
  { key: 'date', label: 'Data', aliases: ['data', 'date', 'dia'] },
  { key: 'amount', label: 'Valor (R$)', aliases: ['valor', 'value', 'amount', 'total'], required: true },
  { key: 'description', label: 'Descrição', aliases: ['descricao', 'description', 'historico', 'obs'] },
  { key: 'document', label: 'Documento', aliases: ['documento', 'nf', 'nota', 'document', 'doc'] },
];

interface PreviewRow {
  line: number;
  batchId: string | null;
  batchText: string;
  category: CostCategory | null;
  categoryText: string;
  date: string | null;
  amount: number | null;
  description: string;
  document: string;
  errors: string[];
}

const key = (s: string) => normalize(s).replace(/[^a-z0-9]/g, '');

export function CostImportDrawer({ open, onClose, batchId }: { open: boolean; onClose: () => void; batchId?: string }) {
  const ops = useOps();
  const { rows: batches } = useTable('batches', undefined, { enabled: open });
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [raw, setRaw] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [map, setMap] = useState<Record<MapKey, string>>({ batch: '', category: '', date: '', amount: '', description: '', document: '' });
  const [defaultDate, setDefaultDate] = useState(today());
  const [onlyValid, setOnlyValid] = useState(true);
  const [over, setOver] = useState(false);

  const reset = () => {
    setRaw([]);
    setHeaders([]);
    setFileName('');
  };
  const close = () => {
    onClose();
    setTimeout(reset, 200);
  };

  const load = async (file: File) => {
    try {
      const data = await parseCsv(file);
      if (!data.length) throw new Error('O arquivo está vazio.');
      const hs = Object.keys(data[0]);
      setHeaders(hs);
      setMap(Object.fromEntries(FIELDS.map((f) => [f.key, findColumn(hs, f.aliases)])) as Record<MapKey, string>);
      setRaw(data);
      setFileName(file.name);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível ler o arquivo.');
    }
  };

  const batchIndex = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of batches) {
      m.set(key(b.code), b.id);
      m.set(key(b.name), b.id);
      m.set(key(batchLabel(b)), b.id);
    }
    return m;
  }, [batches]);

  const preview = useMemo<PreviewRow[]>(
    () =>
      raw.map((r, i) => {
        const errors: string[] = [];
        const batchText = batchId ? '' : (map.batch && r[map.batch]) || '';
        const resolvedBatch = batchId || batchIndex.get(key(batchText)) || null;
        if (!resolvedBatch) errors.push(batchText ? `Lote "${batchText}" não encontrado` : 'Sem lote');
        const categoryText = (map.category && r[map.category]) || '';
        const category = matchCostCategory(categoryText);
        if (!category) errors.push(categoryText ? `Categoria "${categoryText}" não reconhecida` : 'Sem categoria');
        const dateText = (map.date && r[map.date]) || '';
        const d = dateText ? parseDateBR(dateText) : defaultDate || null;
        if (!d) errors.push(dateText ? `Data "${dateText}" inválida` : 'Sem data');
        const amountText = (map.amount && r[map.amount]) || '';
        const amount = parseNumber(amountText);
        if (amount === null) errors.push('Valor inválido');
        else if (amount <= 0) errors.push('Valor deve ser maior que zero (créditos: use a categoria de crédito)');
        return {
          line: i + 2,
          batchId: resolvedBatch,
          batchText,
          category,
          categoryText,
          date: d,
          amount,
          description: (map.description && r[map.description]) || '',
          document: (map.document && r[map.document]) || '',
          errors,
        };
      }),
    [raw, map, batchIndex, batchId, defaultDate],
  );

  const valid = preview.filter((p) => !p.errors.length);
  const invalid = preview.length - valid.length;
  const total = valid.reduce((s, p) => s + (p.amount || 0), 0);
  const batchById = useMemo(() => new Map(batches.map((b) => [b.id, b])), [batches]);

  const run = useAction(
    async () => {
      if (!valid.length) throw new Error('Nenhuma linha válida para importar.');
      if (invalid && !onlyValid) throw new Error(`Há ${invalid} linhas com erro. Corrija o arquivo ou marque "Importar só as linhas válidas".`);
      const rows: BatchCostInput[] = valid.map((p) => ({
        batchId: p.batchId!,
        category: p.category!,
        date: p.date!,
        amount: p.amount!,
        description: p.description.trim() || null,
        documentNumber: p.document.trim() || null,
      }));
      return ops.importBatchCosts(rows);
    },
    { success: (n) => `${n} custos importados`, onSuccess: close },
  );

  const columns: Column<PreviewRow>[] = [
    { key: 'line', header: 'Linha', cell: (p) => <span className="num text-muted">{p.line}</span>, mobile: false },
    ...(!batchId
      ? [{ key: 'batch', header: 'Lote', mobile: 'subtitle' as const, cell: (p: PreviewRow) => (p.batchId ? batchById.get(p.batchId)?.code : <span className="text-danger">{p.batchText || '—'}</span>) }]
      : []),
    {
      key: 'category',
      header: 'Categoria',
      mobile: 'title',
      cell: (p) => (p.category ? categoryLabel(p.category) : <span className="text-danger">{p.categoryText || '—'}</span>),
    },
    { key: 'date', header: 'Data', cell: (p) => <span className="num">{p.date ? date(p.date) : '—'}</span> },
    { key: 'amount', header: 'Valor', align: 'right', cell: (p) => (p.amount === null ? '—' : money(p.amount)) },
    { key: 'desc', header: 'Descrição', hideBelow: 'lg', cell: (p) => <span className="truncate block max-w-[220px]">{p.description || '—'}</span> },
    {
      key: 'status',
      header: 'Situação',
      mobile: 'badge',
      cell: (p) =>
        p.errors.length ? (
          <span className="inline-flex items-center gap-1 text-xs text-danger" title={p.errors.join(' · ')}>
            <XCircle className="size-3.5 shrink-0" />
            <span className="truncate max-w-[220px]">{p.errors[0]}</span>
          </span>
        ) : (
          <Badge tone="success" dot>
            OK
          </Badge>
        ),
    },
  ];

  const template = () =>
    exportCsv('modelo-custos', [
      { l: batches[0]?.code || 'L-2026-001', c: 'Funrural (compra)', d: date(today()), v: 1250.4, s: 'Funrural sobre NF 1234', n: '1234' },
      { l: batches[0]?.code || 'L-2026-001', c: 'Vacinas', d: date(today()), v: 890, s: 'Aftosa', n: '' },
    ], [
      { header: 'Lote', value: (r) => r.l },
      { header: 'Categoria', value: (r) => r.c },
      { header: 'Data', value: (r) => r.d },
      { header: 'Valor', value: (r) => r.v },
      { header: 'Descricao', value: (r) => r.s },
      { header: 'Documento', value: (r) => r.n },
    ]);

  return (
    <Drawer
      open={open}
      onClose={close}
      width="xl"
      title="Importar custos (CSV)"
      description={raw.length ? fileName : 'Planilha com lote, categoria, data, valor, descrição e documento.'}
      footer={
        raw.length ? (
          <>
            <Button variant="ghost" onClick={reset} className="mr-auto">
              Trocar arquivo
            </Button>
            <Button variant="primary" loading={run.running} disabled={!valid.length} onClick={() => void run.run()}>
              Importar {valid.length} custos
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
        )
      }
    >
      {!raw.length ? (
        <div className="space-y-5">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void load(f);
            }}
            className={cn(
              'flex flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed py-12 px-6 text-center cursor-pointer transition-colors',
              over ? 'border-primary bg-primary-soft/40' : 'border-border-strong hover:border-primary/60',
            )}
          >
            <UploadCloud className="size-8 text-subtle" />
            <span className="text-sm font-medium text-fg">Arraste o arquivo CSV ou clique para escolher</span>
            <span className="text-xs text-muted">Separado por ponto e vírgula (Excel) ou vírgula</span>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void load(f);
                e.target.value = '';
              }}
            />
          </label>
          <Callout tone="info" title="Como montar a planilha" action={<Button size="sm" icon={<Download className="size-4" />} onClick={template}>Modelo</Button>}>
            Colunas: {batchId ? '' : 'Lote (código), '}Categoria, Data, Valor, Descrição e Documento. A categoria aceita o nome (ex.: “Funrural compra”, “Vacina”,
            “Frete abate”) ou o código.
          </Callout>
        </div>
      ) : (
        <div className="space-y-5">
          <FormGrid cols={3}>
            {FIELDS.filter((f) => !(batchId && f.key === 'batch')).map((f) => (
              <Field key={f.key} label={f.label} required={f.required}>
                <Select
                  value={map[f.key]}
                  onChange={(v) => setMap({ ...map, [f.key]: v })}
                  placeholder="— não usar —"
                  options={headers.map((h) => ({ value: h, label: h }))}
                />
              </Field>
            ))}
            <Field label="Data padrão" hint="Para linhas sem data">
              <DateInput value={defaultDate} onChange={setDefaultDate} />
            </Field>
          </FormGrid>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <span className="inline-flex items-center gap-1.5 text-success">
              <CheckCircle2 className="size-4" /> {valid.length} válidas
            </span>
            {invalid > 0 && (
              <span className="inline-flex items-center gap-1.5 text-danger">
                <XCircle className="size-4" /> {invalid} com erro
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 text-muted">
              <FileSpreadsheet className="size-4" /> Total: <span className="text-fg font-semibold num">{money(total)}</span>
            </span>
            {invalid > 0 && <Checkbox checked={onlyValid} onChange={setOnlyValid} label="Importar só as linhas válidas" className="sm:ml-auto" />}
          </div>

          <DataTable columns={columns} rows={preview} rowKey={(p) => String(p.line)} dense pageSize={50} rowClassName={(p) => (p.errors.length ? 'bg-danger-soft/40' : undefined)} />
        </div>
      )}
    </Drawer>
  );
}
