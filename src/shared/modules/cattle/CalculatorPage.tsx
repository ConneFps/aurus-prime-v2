/**
 * Calculadora de compra — simulador de recria + engorda com resultado ao vivo,
 * sensibilidade, cenários salvos (cattle_simulations) e comparação.
 */
import { Columns2, FileDown, FolderOpen, RotateCcw, Save } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSession } from '../../app/session';
import { useAction, useCrud, useTable } from '../../data/react';
import { integer, kg, money, number, percent } from '../../domain/format';
import type { CattleSimulation } from '../../domain/types';
import {
  Badge,
  Button,
  Callout,
  Card,
  CardHeader,
  cn,
  DescriptionList,
  Field,
  FormGrid,
  Input,
  Menu,
  MoneyInput,
  NumberInput,
  PageHeader,
  PercentInput,
  RankBars,
  WeightInput,
} from '../../ui';
import { computeSim, DEFAULT_PARAMS, fromParams, resultSummary, type SimParams, type SimResult } from './calc';
import { CompareModal, exportSimPdf, ScenariosDrawer } from './ScenarioTools';

export function CalculatorPage() {
  const { actor } = useSession();
  const crud = useCrud('cattle_simulations');
  const { rows: sims } = useTable('cattle_simulations');
  const [p, setP] = useState<SimParams>({ ...DEFAULT_PARAMS });
  const [name, setName] = useState('Nova simulação');
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const set = (patch: Partial<SimParams>) => setP((x) => ({ ...x, ...patch }));
  const r = useMemo(() => computeSim(p), [p]);

  const loaded = sims.find((s) => s.id === loadedId) || null;
  const dirty = !loaded || loaded.name !== name || JSON.stringify(fromParams(loaded.params)) !== JSON.stringify(p);

  const save = useAction(
    async (asNew: boolean) => {
      if (!name.trim()) throw new Error('Dê um nome ao cenário.');
      const data = { name: name.trim(), params: { ...p } as Record<string, number>, result: resultSummary(r) };
      if (loadedId && !asNew) {
        await crud.update(loadedId, data);
        return loadedId;
      }
      const row = await crud.insert({ ...data, createdById: actor?.id ?? null, createdByName: actor?.name ?? null });
      return row.id;
    },
    { success: 'Cenário salvo', onSuccess: (id) => setLoadedId(id) },
  );

  const open = (s: CattleSimulation) => {
    setP(fromParams(s.params));
    setName(s.name);
    setLoadedId(s.id);
    setListOpen(false);
  };
  const reset = () => {
    setP({ ...DEFAULT_PARAMS });
    setName('Nova simulação');
    setLoadedId(null);
  };

  const warnings = [
    p.gmdEngorda <= 0 && 'Informe o GMD da engorda para calcular a duração e o suplemento da engorda.',
    p.gmdRecria <= 0 && 'Informe o GMD da recria.',
    p.precoVendaArroba <= 0 && 'Informe o preço da arroba para calcular a receita.',
    p.pesoFinalRecria < p.pesoCompra && 'O peso final da recria está abaixo do peso de compra.',
    p.pesoFinalEngorda < p.pesoFinalRecria && 'O peso final da engorda está abaixo do peso final da recria.',
  ].filter(Boolean) as string[];

  return (
    <>
      <PageHeader
        eyebrow="Gado"
        title="Calculadora de compra"
        subtitle="Simule recria e engorda antes de comprar: dias de ciclo, custos, arrobas produzidas, lucro e preço de equilíbrio."
        actions={
          <>
            <Button icon={<FolderOpen className="size-4" />} onClick={() => setListOpen(true)}>
              Cenários {sims.length ? <Badge size="xs">{sims.length}</Badge> : null}
            </Button>
            <Button icon={<Columns2 className="size-4" />} onClick={() => setCompareOpen(true)}>
              Comparar
            </Button>
            <Button icon={<FileDown className="size-4" />} onClick={() => exportSimPdf(name, p, r)}>
              PDF
            </Button>
          </>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <Field label="Nome do cenário" className="flex-1" hint={loaded ? (dirty ? 'Alterações não salvas' : 'Cenário salvo') : undefined}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Nelore 7@ — safra 2027" />
          </Field>
          <div className={cn('flex flex-wrap items-center gap-2', loaded && 'sm:pb-[22px]')}>
            <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={reset}>
              Novo
            </Button>
            <Button variant="primary" icon={<Save className="size-4" />} loading={save.running} disabled={!!loaded && !dirty} onClick={() => void save.run(false)}>
              {loaded ? 'Salvar' : 'Salvar cenário'}
            </Button>
            {loaded && <Menu items={[{ label: 'Salvar como novo cenário', icon: <Save />, onClick: () => void save.run(true) }]} />}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
        <div className="space-y-4 min-w-0">
          <Card>
            <CardHeader title="1. Compra" subtitle={`${money(r.precoKgVivo)}/kg vivo · ${number(r.arrobasCompra, 1)} @ de carcaça na entrada`} />
            <FormGrid cols={3}>
              <Field label="Cabeças">
                <NumberInput value={p.cabecas} onChange={(v) => set({ cabecas: v ?? 1 })} decimals={0} suffix="cab" />
              </Field>
              <Field label="Peso de compra">
                <WeightInput value={p.pesoCompra} onChange={(v) => set({ pesoCompra: v ?? 0 })} />
              </Field>
              <Field label="Valor pago por cabeça">
                <MoneyInput value={p.valorPago} onChange={(v) => set({ valorPago: v ?? 0 })} />
              </Field>
            </FormGrid>
          </Card>

          <Card>
            <CardHeader title="2. Recria" subtitle={phaseHint(r.ganhoPesoRecria, r.duracaoRecriaDias, r.custoTotalSuplementoRecria)} />
            <FormGrid cols={3}>
              <Field label="Peso final da recria">
                <WeightInput value={p.pesoFinalRecria} onChange={(v) => set({ pesoFinalRecria: v ?? 0 })} />
              </Field>
              <Field label="GMD (g/dia)">
                <NumberInput value={p.gmdRecria} onChange={(v) => set({ gmdRecria: v ?? 0 })} decimals={0} suffix="g" />
              </Field>
              <Field label="Suplemento (% do peso vivo)" hint={`${number(r.consumoDiarioSuplementoRecria, 2)} kg/cab/dia`}>
                <PercentInput value={p.consumoSuplementoRecriaPercent} onChange={(v) => set({ consumoSuplementoRecriaPercent: v ?? 0 })} decimals={3} />
              </Field>
              <Field label="Peso da saca">
                <WeightInput value={p.pesoSacaSuplementoRecria} onChange={(v) => set({ pesoSacaSuplementoRecria: v ?? 0 })} />
              </Field>
              <Field label="Preço da saca" hint={`${money(r.custoSuplementoKgRecria)}/kg`}>
                <MoneyInput value={p.custoSacaSuplementoRecria} onChange={(v) => set({ custoSacaSuplementoRecria: v ?? 0 })} />
              </Field>
            </FormGrid>
          </Card>

          <Card>
            <CardHeader title="3. Engorda" subtitle={phaseHint(r.ganhoPesoEngorda, r.duracaoEngordaDias, r.custoTotalSuplementoEngorda)} />
            <FormGrid cols={3}>
              <Field label="Peso final (abate)">
                <WeightInput value={p.pesoFinalEngorda} onChange={(v) => set({ pesoFinalEngorda: v ?? 0 })} />
              </Field>
              <Field label="GMD (g/dia)" error={p.gmdEngorda <= 0 ? 'Informe o GMD' : undefined}>
                <NumberInput value={p.gmdEngorda} onChange={(v) => set({ gmdEngorda: v ?? 0 })} decimals={0} suffix="g" />
              </Field>
              <Field label="Suplemento (% do peso vivo)" hint={`${number(r.consumoDiarioSuplementoEngorda, 2)} kg/cab/dia`}>
                <PercentInput value={p.consumoSuplementoEngordaPercent} onChange={(v) => set({ consumoSuplementoEngordaPercent: v ?? 0 })} decimals={3} />
              </Field>
              <Field label="Peso da saca">
                <WeightInput value={p.pesoSacaSuplementoEngorda} onChange={(v) => set({ pesoSacaSuplementoEngorda: v ?? 0 })} />
              </Field>
              <Field label="Preço da saca" hint={`${money(r.custoSuplementoKgEngorda)}/kg`}>
                <MoneyInput value={p.custoSacaSuplementoEngorda} onChange={(v) => set({ custoSacaSuplementoEngorda: v ?? 0 })} />
              </Field>
            </FormGrid>
          </Card>

          <Card>
            <CardHeader title="4. Custos mensais por cabeça" subtitle={`${money(r.custoOperacionalMensalTotal)}/cab/mês · ${money(r.custoOperacionalTotalCiclo)} no ciclo`} />
            <FormGrid cols={3}>
              <Field label="Sal mineral">
                <MoneyInput value={p.salMineralMensal} onChange={(v) => set({ salMineralMensal: v ?? 0 })} />
              </Field>
              <Field label="Terra / arrendamento">
                <MoneyInput value={p.terraPropriaMensal} onChange={(v) => set({ terraPropriaMensal: v ?? 0 })} />
              </Field>
              <Field label="Outras despesas">
                <MoneyInput value={p.outrasDespesasMensais} onChange={(v) => set({ outrasDespesasMensais: v ?? 0 })} />
              </Field>
              <Field label="Mão de obra — mínimo">
                <MoneyInput value={p.maoObraMinMensal} onChange={(v) => set({ maoObraMinMensal: v ?? 0 })} />
              </Field>
              <Field label="Mão de obra — máximo" hint={`média ${money(r.maoObraMediaMensal)}`}>
                <MoneyInput value={p.maoObraMaxMensal} onChange={(v) => set({ maoObraMaxMensal: v ?? 0 })} />
              </Field>
            </FormGrid>
          </Card>

          <Card>
            <CardHeader title="5. Comercialização" subtitle={`${kg(Math.round(r.pesoCarcaca * 10) / 10)} de carcaça · ${number(r.arrobasProduzidas, 2)} @`} />
            <FormGrid cols={3}>
              <Field label="Rendimento de carcaça">
                <PercentInput value={p.rendimentoCarcacaPercent} onChange={(v) => set({ rendimentoCarcacaPercent: v ?? 0 })} decimals={1} />
              </Field>
              <Field label="Preço da arroba" error={p.precoVendaArroba <= 0 ? 'Informe o preço' : undefined}>
                <MoneyInput value={p.precoVendaArroba} onChange={(v) => set({ precoVendaArroba: v ?? 0 })} />
              </Field>
              <Field label="Comercialização por cabeça" hint="Frete, impostos, comissão">
                <MoneyInput value={p.custoComercializacao} onChange={(v) => set({ custoComercializacao: v ?? 0 })} />
              </Field>
            </FormGrid>
          </Card>

          <Sensitivity p={p} />

          {/* Celular: resultado sempre visível enquanto edita */}
          <div className="lg:hidden sticky bottom-3 z-10">
            <div className="flex items-center justify-between gap-3 rounded-card border border-border-strong bg-surface shadow-pop px-4 py-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-subtle">{r.lucroCiclo >= 0 ? 'Lucro' : 'Prejuízo'} por cabeça</div>
                <div className={cn('text-lg font-semibold num leading-tight', r.lucroCiclo >= 0 ? 'text-success' : 'text-danger')}>{money(r.lucroCiclo)}</div>
              </div>
              <div className="text-right text-xs text-muted num shrink-0">
                <div>{percent(r.margemCustoTotal, 2)} s/ custo</div>
                <div>equilíbrio {money(r.equilibrioArroba)}/@</div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 min-w-0 lg:sticky lg:top-4">
          <ResultCard p={p} r={r} warnings={warnings} />
        </div>
      </div>

      <ScenariosDrawer open={listOpen} onClose={() => setListOpen(false)} sims={sims} onOpen={open} currentId={loadedId} />
      <CompareModal open={compareOpen} onClose={() => setCompareOpen(false)} sims={sims} current={{ name: `${name} (atual)`, params: p }} />
    </>
  );
}

function phaseHint(gain: number, days: number, supplement: number) {
  return `Ganho ${kg(Math.round(gain * 10) / 10)} · ${integer(days)} dias (${number(days / 30, 1)} meses) · suplemento ${money(supplement)}/cab`;
}

function ResultCard({ p, r, warnings }: { p: SimParams; r: SimResult; warnings: string[] }) {
  const positive = r.lucroCiclo >= 0;
  const n = Math.max(1, p.cabecas || 1);
  return (
    <Card>
      <CardHeader title="Resultado por cabeça" subtitle={`${integer(r.duracaoTotalDias)} dias de ciclo · ${number(r.duracaoTotalCicloMeses, 1)} meses`} />
      <div className={cn('rounded-card p-4 mb-4', positive ? 'bg-success-soft' : 'bg-danger-soft')}>
        <div className="text-xs uppercase tracking-wider text-muted">{positive ? 'Lucro' : 'Prejuízo'} por cabeça</div>
        <div className={cn('text-3xl font-semibold num', positive ? 'text-success' : 'text-danger')}>{money(r.lucroCiclo)}</div>
        <div className="text-xs text-fg/80 mt-1 num">
          {percent(r.margemCustoTotal, 2)} sobre o custo · {percent(r.rentabilidadeMensal, 2)} ao mês
        </div>
      </div>
      <DescriptionList
        cols={2}
        items={[
          { label: 'Receita', value: <span className="num">{money(r.receitaVenda)}</span> },
          { label: 'Custo total', value: <span className="num">{money(r.custoTotalCiclo)}</span> },
          { label: '@ produzidas', value: <span className="num">{number(r.arrobasProduzidas, 2)}</span> },
          { label: 'Equilíbrio', value: <span className="num">{r.equilibrioArroba ? `${money(r.equilibrioArroba)}/@` : '—'}</span> },
          { label: 'Custo da @ engordada', value: <span className="num">{r.custoArrobaProduzida ? money(r.custoArrobaProduzida) : '—'}</span> },
          { label: 'Margem s/ receita', value: <span className="num">{percent(r.margemReceita)}</span> },
        ]}
      />
      <div className="mt-5">
        <div className="text-[11px] uppercase tracking-wider text-subtle font-medium mb-2">Composição do custo</div>
        <RankBars
          format={money}
          items={[
            { label: 'Compra do animal', value: p.valorPago, slot: 1 },
            { label: 'Suplemento recria', value: r.custoTotalSuplementoRecria, slot: 2 },
            { label: 'Suplemento engorda', value: r.custoTotalSuplementoEngorda, slot: 3 },
            { label: 'Custos mensais', value: r.custoOperacionalTotalCiclo, slot: 4 },
            { label: 'Comercialização', value: p.custoComercializacao, slot: 5 },
          ]}
        />
      </div>
      {n > 1 && (
        <div className="mt-5 pt-4 border-t border-border text-sm">
          <div className="text-[11px] uppercase tracking-wider text-subtle font-medium mb-2">Lote de {integer(n)} cabeças</div>
          {[
            ['Investimento', money(r.investimentoLote), ''],
            ['Receita', money(r.receitaLote), ''],
            [positive ? 'Lucro' : 'Prejuízo', money(r.lucroLote), positive ? 'text-success font-semibold' : 'text-danger font-semibold'],
          ].map(([l, v, c]) => (
            <div key={l} className="flex items-baseline justify-between gap-3 py-1">
              <span className="text-muted">{l}</span>
              <span className={cn('num text-fg', c)}>{v}</span>
            </div>
          ))}
        </div>
      )}
      {warnings.length > 0 && (
        <Callout tone="warning" className="mt-4">
          <ul className="space-y-0.5">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Callout>
      )}
    </Card>
  );
}

const PRICE_STEPS = [-0.1, -0.05, 0, 0.05, 0.1];
const GMD_STEPS = [-200, 0, 200];

function Sensitivity({ p }: { p: SimParams }) {
  const grid = useMemo(
    () =>
      PRICE_STEPS.map((ps) => ({
        price: p.precoVendaArroba * (1 + ps),
        ps,
        cells: GMD_STEPS.map((gs) => computeSim({ ...p, precoVendaArroba: p.precoVendaArroba * (1 + ps), gmdEngorda: Math.max(50, p.gmdEngorda + gs) }).lucroCiclo),
      })),
    [p],
  );
  return (
    <Card>
      <CardHeader title="Sensibilidade" subtitle="Lucro por cabeça variando o preço da arroba e o GMD da engorda" />
      <div className="scroll-x -mx-1">
        <table className="w-full text-sm min-w-[420px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-muted">
              <th className="text-left font-semibold py-2 px-1">Preço da @</th>
              {GMD_STEPS.map((g) => (
                <th key={g} className="text-right font-semibold py-2 px-1 num">
                  GMD {integer(Math.max(50, p.gmdEngorda + g))} g
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row) => (
              <tr key={row.ps} className={cn('border-t border-border', row.ps === 0 && 'bg-surface-2/60')}>
                <td className="py-2 px-1 num">
                  {money(row.price)} <span className="text-xs text-subtle">{row.ps ? `${row.ps > 0 ? '+' : ''}${row.ps * 100}%` : 'base'}</span>
                </td>
                {row.cells.map((v, i) => (
                  <td key={i} className={cn('py-2 px-1 text-right num', v >= 0 ? 'text-success' : 'text-danger', row.ps === 0 && GMD_STEPS[i] === 0 && 'font-semibold')}>
                    {money(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
