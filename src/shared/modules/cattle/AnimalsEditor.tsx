/**
 * Editor de animais linha a linha + colar lista do Excel + importar CSV.
 */
import { ClipboardPaste, Download, Eraser, FileUp, Plus, Tag, Trash2, Wand2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { kg, money, number } from '../../domain/format';
import type { AnimalInput } from '../../ops/types';
import {
  Button,
  Callout,
  cn,
  exportCsv,
  IconButton,
  Input,
  Modal,
  MoneyInput,
  NumberInput,
  parseCsv,
  parseNumber,
  Select,
  Textarea,
  toast,
  WeightInput,
} from '../../ui';
import { findColumn, parseAnimalLines, parseSex } from './helpers';

export interface AnimalRow {
  key: string;
  tag: string;
  sex: 'MALE' | 'FEMALE' | null;
  breed: string;
  entryWeightKg: number | null;
  purchasePrice: number | null;
}

let seq = 0;
const newKey = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;
export const blankAnimal = (): AnimalRow => ({ key: newKey(), tag: '', sex: null, breed: '', entryWeightKg: null, purchasePrice: null });
const fromInput = (a: AnimalInput): AnimalRow => ({
  key: newKey(),
  tag: a.tag,
  sex: a.sex ?? null,
  breed: a.breed || '',
  entryWeightKg: a.entryWeightKg,
  purchasePrice: a.purchasePrice,
});

/** Linhas preenchidas (ignora linhas totalmente vazias). */
export const filledRows = (rows: AnimalRow[]) => rows.filter((r) => r.tag.trim() || r.entryWeightKg || r.purchasePrice);

/** Converte e valida — lança erro com mensagem clara. */
export function toAnimalInputs(rows: AnimalRow[]): AnimalInput[] {
  const list = filledRows(rows);
  const seen = new Set<string>();
  return list.map((r, i) => {
    const tag = r.tag.trim();
    if (!tag) throw new Error(`Animal ${i + 1}: informe o brinco.`);
    const k = tag.toUpperCase();
    if (seen.has(k)) throw new Error(`Brinco repetido na lista: ${tag}.`);
    seen.add(k);
    if (!r.entryWeightKg || r.entryWeightKg <= 0) throw new Error(`Animal ${tag}: informe o peso de entrada.`);
    if (r.purchasePrice !== null && r.purchasePrice < 0) throw new Error(`Animal ${tag}: preço inválido.`);
    return { tag, sex: r.sex, breed: r.breed.trim() || null, entryWeightKg: r.entryWeightKg, purchasePrice: r.purchasePrice || 0 };
  });
}

export function animalTotals(rows: AnimalRow[]) {
  const list = filledRows(rows);
  const weight = list.reduce((s, r) => s + (r.entryWeightKg || 0), 0);
  const value = list.reduce((s, r) => s + (r.purchasePrice || 0), 0);
  return { count: list.length, weight, value, avgWeight: list.length ? weight / list.length : 0, pricePerKg: weight ? value / weight : 0 };
}

const PAGE = 60;

export function AnimalsEditor({ rows, onChange, takenTags }: { rows: AnimalRow[]; onChange: (rows: AnimalRow[]) => void; takenTags?: Set<string> }) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pricePerKg, setPricePerKg] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const totals = animalTotals(rows);
  const dupTags = useMemo(() => {
    const count = new Map<string, number>();
    rows.forEach((r) => {
      const k = r.tag.trim().toUpperCase();
      if (k) count.set(k, (count.get(k) || 0) + 1);
    });
    return new Set([...count].filter(([k, n]) => n > 1 || takenTags?.has(k)).map(([k]) => k));
  }, [rows, takenTags]);

  const parsed = useMemo(() => parseAnimalLines(pasteText), [pasteText]);
  const update = (key: string, patch: Partial<AnimalRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) => onChange(rows.filter((r) => r.key !== key));
  const append = (list: AnimalInput[], replace: boolean) => {
    const base = replace ? [] : filledRows(rows);
    onChange([...base, ...list.map(fromInput)]);
  };

  const importCsv = async (file: File) => {
    try {
      const data = await parseCsv(file);
      if (!data.length) throw new Error('Arquivo vazio.');
      const headers = Object.keys(data[0]);
      const cTag = findColumn(headers, ['brinco', 'tag', 'identificacao', 'animal']);
      const cW = findColumn(headers, ['peso inicial', 'peso', 'peso kg', 'kg']);
      const cP = findColumn(headers, ['preco compra', 'preco', 'valor', 'compra']);
      const cS = findColumn(headers, ['sexo']);
      const cB = findColumn(headers, ['raca']);
      if (!cTag || !cW) throw new Error('O arquivo precisa das colunas "Brinco" e "Peso".');
      const list: AnimalInput[] = [];
      let skipped = 0;
      for (const r of data) {
        const w = parseNumber(r[cW] || '');
        if (!r[cTag]?.trim() || !w) {
          skipped++;
          continue;
        }
        list.push({ tag: r[cTag].trim(), entryWeightKg: w, purchasePrice: (cP && parseNumber(r[cP] || '')) || 0, sex: cS ? parseSex(r[cS]) : null, breed: cB ? r[cB] || null : null });
      }
      append(list, false);
      toast.success(`${list.length} animais importados${skipped ? ` (${skipped} linhas ignoradas)` : ''}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível ler o arquivo.');
    }
  };

  const visible = showAll ? rows : rows.slice(0, PAGE);

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-px rounded-card overflow-hidden border border-border bg-border">
        {[
          ['Cabeças', number(totals.count, 0)],
          ['Peso total', kg(totals.weight)],
          ['Peso médio', kg(Math.round(totals.avgWeight * 10) / 10)],
          ['Valor total', money(totals.value)],
          ['R$/kg médio', money(totals.pricePerKg)],
        ].map(([l, v], i) => (
          <div key={l} className={cn('bg-surface px-3 py-2.5 min-w-0', i === 4 && 'col-span-2 sm:col-span-1')}>
            <div className="text-[10px] uppercase tracking-wider text-subtle">{l}</div>
            <div className="text-sm font-semibold text-fg num truncate">{v}</div>
          </div>
        ))}
      </div>

      {/* Ferramentas */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" icon={<Plus className="size-4" />} onClick={() => onChange([...rows, blankAnimal()])}>
          Adicionar animal
        </Button>
        <Button size="sm" icon={<ClipboardPaste className="size-4" />} onClick={() => setPasteOpen(true)}>
          Colar do Excel
        </Button>
        <Button size="sm" icon={<FileUp className="size-4" />} onClick={() => fileRef.current?.click()}>
          Importar CSV
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importCsv(f);
            e.target.value = '';
          }}
        />
        <Button
          size="sm"
          variant="ghost"
          icon={<Download className="size-4" />}
          onClick={() =>
            exportCsv('modelo-animais', [
              { b: 'A001', p: 380.5, v: 4200, s: 'MACHO', r: 'Nelore' },
              { b: 'A002', p: 402, v: 4450, s: 'MACHO', r: 'Nelore' },
            ], [
              { header: 'Brinco', value: (r) => r.b },
              { header: 'Peso', value: (r) => r.p },
              { header: 'Preco', value: (r) => r.v },
              { header: 'Sexo', value: (r) => r.s },
              { header: 'Raca', value: (r) => r.r },
            ])
          }
        >
          Modelo
        </Button>
        {rows.length > 0 && (
          <Button size="sm" variant="ghost" icon={<Eraser className="size-4" />} onClick={() => onChange([])}>
            Limpar
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-control bg-surface-2/60 border border-border px-3 py-2">
        <span className="text-xs text-muted flex items-center gap-1.5 shrink-0">
          <Wand2 className="size-3.5" /> Calcular preço pelo peso:
        </span>
        <div className="flex items-center gap-2 min-w-0">
          <NumberInput value={pricePerKg} onChange={setPricePerKg} decimals={2} prefix="R$" suffix="/kg" className="w-40" placeholder="0,00" />
          <Button
            size="sm"
            variant="subtle"
            disabled={!pricePerKg}
            onClick={() => {
              onChange(rows.map((r) => (r.entryWeightKg ? { ...r, purchasePrice: Math.round(r.entryWeightKg * (pricePerKg || 0) * 100) / 100 } : r)));
              toast.info('Preços recalculados pelo peso de cada animal.');
            }}
          >
            Aplicar a todos
          </Button>
        </div>
      </div>

      {dupTags.size > 0 && (
        <Callout tone="danger" title="Brincos repetidos">
          {[...dupTags].join(', ')} — {takenTags ? 'já existem em animais vivos ou ' : ''}aparecem mais de uma vez.
        </Callout>
      )}

      {/* Linhas */}
      {rows.length === 0 ? (
        <div className="rounded-card border border-dashed border-border-strong py-10 px-6 text-center">
          <Tag className="size-6 mx-auto text-subtle mb-2" />
          <p className="text-sm text-muted">Nenhum animal na lista. Adicione um a um, cole do Excel ou importe um CSV.</p>
        </div>
      ) : (
        <div className="rounded-card border border-border overflow-hidden">
          <div className="hidden sm:grid grid-cols-[32px_minmax(0,1.3fr)_104px_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_36px] gap-2 px-3 h-9 items-center bg-surface-2/60 border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted">
            <span>#</span>
            <span>Brinco</span>
            <span>Sexo</span>
            <span>Raça</span>
            <span>Peso</span>
            <span>Preço</span>
            <span />
          </div>
          <ul className="divide-y divide-border">
            {visible.map((r, i) => {
              const dup = dupTags.has(r.tag.trim().toUpperCase());
              return (
                <li
                  key={r.key}
                  className="grid grid-cols-2 sm:grid-cols-[32px_minmax(0,1.3fr)_104px_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_36px] gap-2 px-3 py-2 items-center"
                >
                  <span className="hidden sm:block text-xs text-subtle num">{i + 1}</span>
                  <div className="col-span-2 sm:col-span-1 flex items-center gap-2">
                    <span className="sm:hidden text-xs text-subtle num w-6">{i + 1}</span>
                    <Input
                      aria-label="Brinco"
                      placeholder="Brinco"
                      value={r.tag}
                      onChange={(e) => update(r.key, { tag: e.target.value })}
                      className={cn('flex-1', dup && 'border-danger text-danger')}
                    />
                    <IconButton label="Remover" variant="danger" size="sm" className="sm:hidden" onClick={() => remove(r.key)}>
                      <Trash2 className="size-4" />
                    </IconButton>
                  </div>
                  <Select
                    value={r.sex || ''}
                    onChange={(v) => update(r.key, { sex: (v || null) as AnimalRow['sex'] })}
                    placeholder="Sexo"
                    options={[
                      { value: 'MALE', label: 'Macho' },
                      { value: 'FEMALE', label: 'Fêmea' },
                    ]}
                  />
                  <Input aria-label="Raça" placeholder="Raça" value={r.breed} onChange={(e) => update(r.key, { breed: e.target.value })} />
                  <WeightInput aria-label="Peso" placeholder="Peso" value={r.entryWeightKg} onChange={(v) => update(r.key, { entryWeightKg: v })} />
                  <MoneyInput aria-label="Preço" placeholder="Preço" value={r.purchasePrice} onChange={(v) => update(r.key, { purchasePrice: v })} />
                  <div className="hidden sm:block">
                    <IconButton label="Remover" variant="danger" size="sm" onClick={() => remove(r.key)}>
                      <Trash2 className="size-4" />
                    </IconButton>
                  </div>
                </li>
              );
            })}
          </ul>
          {rows.length > PAGE && !showAll && (
            <button type="button" onClick={() => setShowAll(true)} className="w-full py-2.5 text-sm text-primary hover:bg-surface-2 border-t border-border cursor-pointer">
              Mostrar todos os {rows.length} animais
            </button>
          )}
        </div>
      )}

      <Modal
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        size="lg"
        title="Colar lista de animais"
        description="Copie as colunas do Excel e cole abaixo: brinco, peso (kg), preço (R$) e, opcionalmente, sexo e raça."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPasteOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!parsed.animals.length}
              onClick={() => {
                append(parsed.animals, true);
                setPasteOpen(false);
                setPasteText('');
              }}
            >
              Substituir lista
            </Button>
            <Button
              variant="primary"
              disabled={!parsed.animals.length}
              onClick={() => {
                append(parsed.animals, false);
                setPasteOpen(false);
                setPasteText('');
              }}
            >
              Adicionar {parsed.animals.length || ''} animais
            </Button>
          </>
        }
      >
        <Textarea
          rows={10}
          autoFocus
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder={'A001;380,5;4200;M;Nelore\nA002;402;4450;M\nA003;365,2;4010'}
          className="font-mono text-xs"
        />
        <div className="mt-3 text-sm">
          {pasteText.trim() ? (
            <span className={parsed.errors.length ? 'text-warning' : 'text-success'}>
              {parsed.animals.length} animais reconhecidos
              {parsed.animals.length > 0 && ` · ${kg(parsed.animals.reduce((s, a) => s + a.entryWeightKg, 0))} · ${money(parsed.animals.reduce((s, a) => s + a.purchasePrice, 0))}`}
              {parsed.errors.length > 0 && ` · ${parsed.errors.length} linhas com problema`}
            </span>
          ) : (
            <span className="text-muted">Separe as colunas por tabulação (padrão do Excel) ou ponto e vírgula.</span>
          )}
        </div>
        {parsed.errors.length > 0 && (
          <ul className="mt-2 text-xs text-danger space-y-0.5 max-h-28 overflow-y-auto">
            {parsed.errors.slice(0, 20).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}
