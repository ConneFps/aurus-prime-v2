/**
 * Passos do registro de abate: lote/frigorífico, pesagem, custos, saída p/ estoque e revisão.
 */
import { Plus, Split, Trash2, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { date, integer, kg, matchesSearch, money, number, percent, round3 } from '../../domain/format';
import { COST_CATEGORIES, MANAGEMENT_LABELS } from '../../domain/labels';
import type { Animal, Batch, CostCategory, Partner, Product } from '../../domain/types';
import {
  Badge,
  Button,
  Callout,
  cn,
  Combobox,
  DateInput,
  DescriptionList,
  Field,
  FormGrid,
  FormSection,
  IconButton,
  Input,
  MoneyInput,
  PercentInput,
  SearchInput,
  Select,
  Switch,
  Textarea,
  toast,
  toneText,
  WeightInput,
  type ComboOption,
} from '../../ui';
import { carcassYieldInfo, Metric } from './shared';
import {
  isCredit,
  lineKey,
  SLAUGHTER_COST_OPTIONS,
  splitOutputs,
  wholeCarcassOutput,
  type SlaughterCalc,
  type SlaughterDraft,
} from './slaughter-model';

export interface StepProps {
  d: SlaughterDraft;
  set: (patch: Partial<SlaughterDraft>) => void;
  calc: SlaughterCalc;
  batch: Batch | null;
  alive: Animal[];
}

// ---------------------------------------------------------------------------
// 1) Lote e frigorífico
// ---------------------------------------------------------------------------

export function StepBatch({
  d,
  set,
  calc,
  batch,
  batchOptions,
  slaughterhouseOptions,
  onBatchChange,
}: StepProps & { batchOptions: ComboOption[]; slaughterhouseOptions: ComboOption[]; onBatchChange: (id: string | null) => void }) {
  return (
    <div className="space-y-6">
      <FormGrid>
        <Field label="Lote de gado" required span="full" hint="Somente lotes comprados ou em engorda.">
          <Combobox value={d.batchId || null} onChange={(v) => onBatchChange(v)} options={batchOptions} placeholder="Selecione o lote…" emptyText="Nenhum lote pronto para abate" />
        </Field>
        <Field label="Frigorífico" required span="full">
          <Combobox
            value={d.slaughterhouseId || null}
            onChange={(v) => set({ slaughterhouseId: v || '' })}
            options={slaughterhouseOptions}
            placeholder="Selecione o frigorífico…"
            emptyText="Nenhum frigorífico ativo — cadastre em Parceiros"
          />
        </Field>
        <Field label="Data do abate" required>
          <DateInput value={d.date} onChange={(v) => set({ date: v })} />
        </Field>
        <Field label="GTA de saída" hint={batch?.gtaNumber ? `GTA da compra: ${batch.gtaNumber}` : 'Guia de trânsito animal do embarque.'}>
          <Input value={d.gtaNumber} onChange={(e) => set({ gtaNumber: e.target.value })} placeholder="Ex.: GTA-SP 041.2345" />
        </Field>
      </FormGrid>

      {batch && (
        <div className="rounded-card border border-border bg-surface-2/50 p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-fg truncate">
                {batch.code} · {batch.name}
              </div>
              <div className="text-xs text-muted">{MANAGEMENT_LABELS[batch.managementType]}</div>
            </div>
            <Badge tone="info">{integer(calc.heads)} cabeças vivas</Badge>
          </div>
          <DescriptionList
            cols={4}
            items={[
              { label: 'Fornecedor', value: batch.supplierName || '—' },
              { label: 'Compra', value: date(batch.purchaseDate) },
              { label: 'Peso de compra', value: batch.purchaseWeightKg ? kg(batch.purchaseWeightKg) : '—' },
              { label: 'Peso vivo estimado', value: calc.registeredLiveKg ? kg(Math.round(calc.registeredLiveKg)) : '—' },
            ]}
          />
          {calc.heads === 0 && (
            <Callout tone="warning" className="mt-3">
              Este lote não tem animais vivos individualizados. O abate será registrado só com os pesos totais.
            </Callout>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2) Pesagem
// ---------------------------------------------------------------------------

export function StepWeighing({ d, set, calc, alive }: StepProps) {
  const [showAnimals, setShowAnimals] = useState(() => Object.keys(d.animalWeights).length > 0);
  const [q, setQ] = useState('');
  const yieldInfo = carcassYieldInfo(calc.yieldPercent);
  const setAnimal = (id: string, patch: Partial<{ exit: number | null; carcass: number | null }>) => {
    const cur = d.animalWeights[id] || { exit: null, carcass: null };
    set({ animalWeights: { ...d.animalWeights, [id]: { ...cur, ...patch } } });
  };
  const list = useMemo(() => alive.filter((a) => matchesSearch([a.tag, a.breed], q)).sort((a, b) => a.tag.localeCompare(b.tag, 'pt-BR', { numeric: true })), [alive, q]);

  return (
    <div className="space-y-6">
      <FormGrid cols={3}>
        <Field
          label="Peso vivo na balança de saída"
          hint={calc.registeredLiveKg ? `Estimativa pelo cadastro: ${kg(Math.round(calc.registeredLiveKg))}` : 'Peso total embarcado.'}
        >
          <WeightInput value={d.exitScaleWeightKg} onChange={(v) => set({ exitScaleWeightKg: v })} placeholder="0" />
        </Field>
        <Field label="Quebra de transporte" hint={calc.arrivalKg ? `Peso na chegada ≈ ${kg(Math.round(calc.arrivalKg))}` : 'Perda de peso no trajeto (%).'}>
          <PercentInput value={d.transportLossPercent} onChange={(v) => set({ transportLossPercent: v })} placeholder="0" />
        </Field>
        <Field label="Peso de carcaça total" required hint="Informado pelo frigorífico (carcaça quente).">
          <WeightInput value={d.carcassWeightKg} onChange={(v) => set({ carcassWeightKg: v })} placeholder="0" />
        </Field>
      </FormGrid>

      {alive.length > 0 && (calc.animalsWithExit === alive.length || calc.animalsWithCarcass === alive.length) && (
        <div className="flex flex-wrap gap-2">
          {calc.animalsWithExit === alive.length && alive.length > 0 && Math.abs(calc.animalExitSum - (d.exitScaleWeightKg || 0)) > 0.001 && (
            <Button size="sm" variant="subtle" icon={<Wand2 className="size-4" />} onClick={() => set({ exitScaleWeightKg: round3(calc.animalExitSum) })}>
              Usar soma dos pesos vivos ({kg(calc.animalExitSum)})
            </Button>
          )}
          {calc.animalsWithCarcass === alive.length && alive.length > 0 && Math.abs(calc.animalCarcassSum - (d.carcassWeightKg || 0)) > 0.001 && (
            <Button size="sm" variant="subtle" icon={<Wand2 className="size-4" />} onClick={() => set({ carcassWeightKg: round3(calc.animalCarcassSum) })}>
              Usar soma das carcaças ({kg(calc.animalCarcassSum)})
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Metric
          large
          label="Rendimento"
          value={calc.yieldPercent ? percent(calc.yieldPercent, 2) : '—'}
          tone={yieldInfo?.tone}
          hint={yieldInfo ? `${yieldInfo.label} · carcaça ÷ vivo` : 'carcaça ÷ peso vivo'}
        />
        <Metric large label="Sobre chegada" value={calc.yieldOnArrival ? percent(calc.yieldOnArrival, 2) : '—'} hint="desconta a quebra" />
        <Metric large label="Por cabeça" value={calc.carcassPerHead ? kg(Math.round(calc.carcassPerHead * 10) / 10) : '—'} hint={`${integer(calc.heads)} cabeças`} />
        <Metric large label="Arrobas" value={calc.arrobas ? `${number(calc.arrobas, 1)} @` : '—'} hint="de carcaça (15 kg)" />
      </div>

      {calc.yieldPercent != null && (calc.yieldPercent < 45 || calc.yieldPercent > 62) && (
        <Callout tone="warning" title="Rendimento fora do comum">
          Confira os pesos: rendimentos de carcaça costumam ficar entre 48% e 58%.
        </Callout>
      )}

      {alive.length > 0 && (
        <FormSection
          title="Pesos por animal (opcional)"
          description={
            showAnimals
              ? `${calc.animalsWithExit} de ${alive.length} com peso vivo · ${calc.animalsWithCarcass} com carcaça. Animais sem peso também serão marcados como abatidos.`
              : 'Registre a pesagem individual para rastrear o rendimento de cada animal.'
          }
          actions={<Switch checked={showAnimals} onChange={setShowAnimals} />}
        >
          {showAnimals && (
            <div className="space-y-3">
              {alive.length > 8 && <SearchInput value={q} onChange={setQ} placeholder="Buscar brinco ou raça…" className="sm:w-72" />}
              <div className="rounded-card border border-border divide-y divide-border sm:max-h-[520px] sm:overflow-y-auto">
                <div className="hidden sm:grid sticky top-0 z-[1] grid-cols-[minmax(0,1fr)_110px_150px_150px_80px] gap-3 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted bg-surface-2">
                  <span>Animal</span>
                  <span className="text-right">Entrada</span>
                  <span>Peso vivo saída</span>
                  <span>Carcaça</span>
                  <span className="text-right">Rend.</span>
                </div>
                {list.map((a) => {
                  const w = d.animalWeights[a.id] || { exit: null, carcass: null };
                  const y = w.exit && w.carcass ? (w.carcass / w.exit) * 100 : null;
                  return (
                    <div key={a.id} className="grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_110px_150px_150px_80px] gap-x-3 gap-y-2 px-3 py-2 items-center">
                      <div className="min-w-0 col-span-2 sm:col-span-1 flex items-baseline gap-2 sm:block">
                        <span className="font-medium text-fg num shrink-0">
                          <span className="hidden sm:inline font-normal text-muted">Brinco </span>
                          {a.tag}
                        </span>
                        <span className="text-xs text-muted truncate block min-w-0">
                          {[a.breed, a.sex === 'MALE' ? 'Macho' : a.sex === 'FEMALE' ? 'Fêmea' : null].filter(Boolean).join(' · ') || '—'}
                          <span className="sm:hidden"> · entrada {kg(a.entryWeightKg)}</span>
                        </span>
                      </div>
                      <span className="hidden sm:block text-right text-sm num text-muted">{kg(a.entryWeightKg)}</span>
                      <WeightInput
                        value={w.exit}
                        onChange={(v) => setAnimal(a.id, { exit: v })}
                        placeholder="vivo"
                        aria-label={`Peso vivo do brinco ${a.tag}`}
                        className="h-9"
                      />
                      <WeightInput value={w.carcass} onChange={(v) => setAnimal(a.id, { carcass: v })} placeholder="carcaça" aria-label={`Carcaça do brinco ${a.tag}`} className="h-9" />
                      <span className={cn('hidden sm:block text-right text-sm num', y ? toneText[carcassYieldInfo(y)?.tone || 'neutral'] : 'text-subtle')}>{y ? percent(y, 1) : '—'}</span>
                    </div>
                  );
                })}
                {!list.length && <p className="px-3 py-6 text-center text-sm text-muted">Nenhum animal encontrado.</p>}
              </div>
            </div>
          )}
        </FormSection>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3) Custos do abate
// ---------------------------------------------------------------------------

export function StepCosts({ d, set, calc, slaughterhouseName }: StepProps & { slaughterhouseName?: string }) {
  const update = (key: string, patch: Partial<SlaughterDraft['costs'][number]>) => set({ costs: d.costs.map((c) => (c.key === key ? { ...c, ...patch } : c)) });
  const used = new Set(d.costs.map((c) => c.category));
  const add = () => {
    const next = SLAUGHTER_COST_OPTIONS.find((o) => !used.has(o.value))?.value || 'OTHER';
    set({ costs: [...d.costs, { key: lineKey(), category: next as CostCategory, amount: null, documentNumber: '' }] });
  };
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Lance os custos cobrados no abate{slaughterhouseName ? ` por ${slaughterhouseName}` : ''}. O retorno de couro e miúdos entra como <strong className="text-fg">crédito</strong> e reduz o custo do lote.
      </p>
      <div className="space-y-3">
        {d.costs.map((c) => {
          const credit = isCredit(c.category);
          return (
            <div key={c.key} className="grid grid-cols-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_36px] gap-x-3 gap-y-2 items-start rounded-card border border-border p-3 sm:border-0 sm:p-0">
              <div className="col-span-2 sm:col-span-1 flex items-center gap-2 min-w-0 sm:h-10">
                {c.fixed ? (
                  <span className="text-sm font-medium text-fg truncate">{COST_CATEGORIES[c.category].label}</span>
                ) : (
                  <Select value={c.category} onChange={(v) => update(c.key, { category: v })} options={SLAUGHTER_COST_OPTIONS} />
                )}
                {credit && <Badge tone="success">crédito</Badge>}
                {!c.fixed && (
                  <IconButton label="Remover custo" size="sm" variant="danger" className="sm:hidden ml-auto" onClick={() => set({ costs: d.costs.filter((x) => x.key !== c.key) })}>
                    <Trash2 className="size-4" />
                  </IconButton>
                )}
              </div>
              <div>
                <MoneyInput value={c.amount} onChange={(v) => update(c.key, { amount: v })} placeholder="0,00" aria-label={`Valor — ${COST_CATEGORIES[c.category].label}`} />
                {(c.amount || 0) > 0 && calc.heads > 0 && <p className="text-[11px] text-subtle mt-1 num">{money((c.amount || 0) / calc.heads)} por cabeça</p>}
              </div>
              <Input value={c.documentNumber} onChange={(e) => update(c.key, { documentNumber: e.target.value })} placeholder="Documento (opcional)" aria-label="Documento" />
              <div className="hidden sm:flex h-10 items-center">
                {!c.fixed && (
                  <IconButton label="Remover custo" size="sm" variant="danger" onClick={() => set({ costs: d.costs.filter((x) => x.key !== c.key) })}>
                    <Trash2 className="size-4" />
                  </IconButton>
                )}
              </div>
            </div>
          );
        })}
        <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={add}>
          Adicionar outro custo
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Metric label="Custos do abate" value={money(calc.slaughterGross)} />
        <Metric label="Créditos" value={calc.slaughterCredits ? `− ${money(calc.slaughterCredits)}` : money(0)} tone={calc.slaughterCredits ? 'success' : undefined} />
        <Metric label="Custo do lote" value={money(calc.existingNet)} hint="compra, engorda e outros" />
        <Metric
          label="Custo/kg carcaça"
          value={calc.costPerKg ? money(calc.costPerKg) : '—'}
          hint={calc.costPerKg ? `${money(calc.costPerKg * 15)} por @ de carcaça` : 'informe a carcaça'}
          tone="primary"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4) Saída para o estoque pós-abate
// ---------------------------------------------------------------------------

export function StepOutputs({ d, set, calc, rawProducts }: StepProps & { rawProducts: Product[] }) {
  const options = rawProducts.map((p) => ({ value: p.id, label: p.name }));
  const splitTotal = (d.split.traseiro || 0) + (d.split.dianteiro || 0) + (d.split.ponta || 0);
  const apply = (fn: typeof splitOutputs) => {
    const r = fn(d, rawProducts);
    if (typeof r === 'string') toast.error(r);
    else set({ outputs: r });
  };
  const update = (key: string, patch: Partial<SlaughterDraft['outputs'][number]>) => set({ outputs: d.outputs.map((o) => (o.key === key ? { ...o, ...patch } : o)) });
  const carcass = d.carcassWeightKg || 0;
  const diffPct = carcass ? (calc.outputDiffKg / carcass) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="rounded-card border border-border bg-surface-2/50 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <span className="size-8 rounded-control bg-primary-soft text-primary flex items-center justify-center shrink-0">
            <Split className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-fg">Dividir a carcaça em quartos</div>
            <p className="text-xs text-muted">
              {kg(carcass)} de carcaça. Ajuste os percentuais se o frigorífico informar outra divisão.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:max-w-md">
          <Field label="Traseiro">
            <PercentInput value={d.split.traseiro} onChange={(v) => set({ split: { ...d.split, traseiro: v } })} decimals={1} />
          </Field>
          <Field label="Dianteiro">
            <PercentInput value={d.split.dianteiro} onChange={(v) => set({ split: { ...d.split, dianteiro: v } })} decimals={1} />
          </Field>
          <Field label="Ponta agulha">
            <PercentInput value={d.split.ponta} onChange={(v) => set({ split: { ...d.split, ponta: v } })} decimals={1} />
          </Field>
        </div>
        {Math.abs(splitTotal - 100) > 0.01 && <p className="text-xs text-danger">A divisão soma {percent(splitTotal, 1)} — precisa fechar 100%.</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary" icon={<Split className="size-4" />} onClick={() => apply(splitOutputs)}>
            Aplicar divisão
          </Button>
          <Button size="sm" variant="secondary" onClick={() => apply(wholeCarcassOutput)}>
            Carcaça inteira
          </Button>
        </div>
      </div>

      <FormSection title="Entradas no estoque pós-abate" description={`Custo sugerido: ${calc.costPerKg ? money(calc.costPerKg) + '/kg (custo total do lote ÷ carcaça)' : '—'}. Deixe vazio para usar o sugerido.`}>
        <div className="space-y-2">
          <div className="hidden sm:grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_110px_36px] gap-3 text-[11px] font-semibold uppercase tracking-wider text-muted px-0.5">
            <span>Produto</span>
            <span>Peso</span>
            <span>Custo por kg</span>
            <span className="text-right">Valor</span>
            <span />
          </div>
          {d.outputs.map((o) => (
            <div key={o.key} className="grid grid-cols-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_110px_36px] gap-x-3 gap-y-2 items-center rounded-card border border-border p-3 sm:border-0 sm:p-0">
              <div className="col-span-2 sm:col-span-1 flex items-center gap-2">
                <Select value={o.productId} onChange={(v) => update(o.key, { productId: v })} options={options} placeholder="Produto…" />
                <IconButton label="Remover linha" size="sm" variant="danger" className="sm:hidden" onClick={() => set({ outputs: d.outputs.filter((x) => x.key !== o.key) })}>
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
              <WeightInput value={o.qty} onChange={(v) => update(o.key, { qty: v })} placeholder="0" aria-label="Peso" />
              <MoneyInput value={o.unitCost} onChange={(v) => update(o.key, { unitCost: v })} placeholder={calc.costPerKg ? calc.costPerKg.toFixed(2).replace('.', ',') : '0,00'} aria-label="Custo por kg" />
              <span className="col-span-2 sm:col-span-1 text-right text-sm num text-fg">
                <span className="sm:hidden text-xs text-muted mr-2">Valor</span>
                {money((o.qty || 0) * (o.unitCost ?? calc.costPerKg))}
              </span>
              <div className="hidden sm:flex">
                <IconButton label="Remover linha" size="sm" variant="danger" onClick={() => set({ outputs: d.outputs.filter((x) => x.key !== o.key) })}>
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            </div>
          ))}
          {!d.outputs.length && <p className="text-sm text-muted py-3">Nenhuma saída ainda — aplique a divisão acima ou adicione linhas.</p>}
          <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => set({ outputs: [...d.outputs, { key: lineKey(), productId: '', qty: null, unitCost: null }] })}>
            Adicionar linha
          </Button>
        </div>
      </FormSection>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
        <Metric label="Total das saídas" value={kg(calc.outputKg)} hint={`carcaça: ${kg(carcass)}`} />
        <Metric
          label="Diferença"
          value={`${calc.outputDiffKg > 0 ? '+' : ''}${kg(calc.outputDiffKg)}`}
          hint={carcass ? percent(diffPct, 2) : undefined}
          tone={Math.abs(calc.outputDiffKg) < 0.01 ? 'success' : Math.abs(diffPct) <= 1 ? 'warning' : 'danger'}
        />
        <Metric label="Valor em estoque" value={money(calc.outputValue)} className="col-span-2 lg:col-span-1" />
      </div>
      {carcass > 0 && calc.outputKg > 0 && Math.abs(calc.outputDiffKg) >= 0.01 && (
        <Callout tone={Math.abs(diffPct) <= 1 ? 'info' : 'warning'}>
          As saídas {calc.outputDiffKg < 0 ? 'ficaram abaixo' : 'passaram'} da carcaça em {kg(Math.abs(calc.outputDiffKg))}. Confira se todas as peças foram lançadas.
        </Callout>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5) Revisão
// ---------------------------------------------------------------------------

export function StepReview({
  d,
  set,
  calc,
  batch,
  slaughterhouse,
  products,
}: StepProps & { slaughterhouse: Partner | null; products: Product[] }) {
  const pName = (id: string) => products.find((p) => p.id === id)?.name || '—';
  const yieldInfo = carcassYieldInfo(calc.yieldPercent);
  const costs = d.costs.filter((c) => (c.amount || 0) > 0);
  const outputs = d.outputs.filter((o) => o.productId && (o.qty || 0) > 0);
  return (
    <div className="space-y-6">
      <FormSection title="Abate">
        <DescriptionList
          cols={3}
          items={[
            { label: 'Lote', value: batch ? `${batch.code} · ${batch.name}` : '—' },
            { label: 'Frigorífico', value: slaughterhouse?.name || '—' },
            { label: 'Data', value: date(d.date) },
            { label: 'GTA', value: d.gtaNumber || '—' },
            { label: 'Cabeças', value: integer(calc.heads) },
            { label: 'Pesos por animal', value: calc.animalsWithExit || calc.animalsWithCarcass ? `${calc.animalsWithExit} vivos · ${calc.animalsWithCarcass} carcaças` : 'não informados' },
          ]}
        />
      </FormSection>
      <FormSection title="Pesagem">
        <DescriptionList
          cols={4}
          items={[
            { label: 'Peso de saída', value: d.exitScaleWeightKg ? kg(d.exitScaleWeightKg) : '—' },
            { label: 'Quebra de transporte', value: d.transportLossPercent != null ? percent(d.transportLossPercent, 2) : '—' },
            { label: 'Carcaça', value: kg(d.carcassWeightKg || 0) },
            {
              label: 'Rendimento',
              value: calc.yieldPercent ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="num">{percent(calc.yieldPercent, 2)}</span>
                  {yieldInfo && <Badge tone={yieldInfo.tone}>{yieldInfo.label}</Badge>}
                </span>
              ) : (
                '—'
              ),
            },
          ]}
        />
      </FormSection>
      <FormSection title="Custos lançados no lote" description={costs.length ? undefined : 'Nenhum custo de abate informado.'}>
        {costs.length > 0 && (
          <ul className="divide-y divide-border rounded-card border border-border text-sm">
            {costs.map((c) => (
              <li key={c.key} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate">
                  {COST_CATEGORIES[c.category].label}
                  {c.documentNumber && <span className="text-xs text-subtle"> · {c.documentNumber}</span>}
                </span>
                <span className={cn('num shrink-0', isCredit(c.category) ? 'text-success' : 'text-fg')}>
                  {isCredit(c.category) ? '− ' : ''}
                  {money(c.amount)}
                </span>
              </li>
            ))}
            <li className="flex items-center justify-between gap-3 px-3 py-2 bg-surface-2/60 font-semibold">
              <span>Líquido do abate</span>
              <span className="num">{money(calc.slaughterNet)}</span>
            </li>
          </ul>
        )}
      </FormSection>
      <FormSection title="Entradas no estoque pós-abate">
        <ul className="divide-y divide-border rounded-card border border-border text-sm">
          {outputs.map((o) => (
            <li key={o.key} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0 truncate">{pName(o.productId)}</span>
              <span className="text-right shrink-0">
                <span className="num text-fg">{kg(o.qty)}</span>
                <span className="block text-xs text-subtle num">{money(o.unitCost ?? calc.costPerKg)}/kg</span>
              </span>
            </li>
          ))}
          <li className="flex items-center justify-between gap-3 px-3 py-2 bg-surface-2/60 font-semibold">
            <span>Total</span>
            <span className="num">
              {kg(calc.outputKg)} · {money(calc.outputValue)}
            </span>
          </li>
        </ul>
      </FormSection>
      <Field label="Observações">
        <Textarea value={d.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Anotações sobre o abate (opcional)" />
      </Field>
      <Callout tone="info" title="Ao confirmar">
        O lote passa para <strong>Abatido</strong>, os {integer(calc.heads)} animais vivos são marcados como abatidos, os custos entram no lote e as peças vão para o estoque pós-abate.
      </Callout>
    </div>
  );
}
