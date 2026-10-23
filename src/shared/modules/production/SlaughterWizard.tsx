/**
 * Registro de abate em passos: 1) lote e frigorífico  2) pesagem  3) custos
 * 4) saída para o estoque pós-abate  5) revisão → ops.registerSlaughter.
 */
import { ArrowLeft, ArrowRight, Beef, Check } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOps, useSession } from '../../app/session';
import { useAction, useTable } from '../../data/react';
import { integer, kg, money, percent, today } from '../../domain/format';
import { Badge, Button, Callout, Card, DescriptionList, EmptyState, PageHeader, useConfirm } from '../../ui';
import { usePartnerOptions } from '../common/lookups';
import { carcassYieldInfo, Stepper } from './shared';
import { calcSlaughter, emptyDraft, splitOutputs, toInput, validateStep, type SlaughterDraft } from './slaughter-model';
import { StepBatch, StepCosts, StepOutputs, StepReview, StepWeighing } from './SlaughterSteps';

const STEPS = [
  { label: 'Lote e frigorífico', hint: 'quem, onde e quando' },
  { label: 'Pesagem', hint: 'balança e carcaça' },
  { label: 'Custos do abate', hint: 'frete, taxa e créditos' },
  { label: 'Estoque pós-abate', hint: 'carcaça e quartos' },
  { label: 'Revisão', hint: 'conferir e registrar' },
];

export function SlaughterWizard({ initialBatchId, onExit }: { initialBatchId: string | null; onExit: () => void }) {
  const nav = useNavigate();
  const ops = useOps();
  const { can } = useSession();
  const confirm = useConfirm();
  const canSlaughter = can('production.manage') && can('cattle.manage');

  const { rows: batches, loading: loadingBatches } = useTable('batches');
  const { rows: products } = useTable('products');
  const { options: shOptions, partners } = usePartnerOptions(['SLAUGHTERHOUSE']);

  const [d, setD] = useState<SlaughterDraft>(() => ({ ...emptyDraft(today()), batchId: initialBatchId || '' }));
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<SlaughterDraft>) => {
    setError(null);
    setD((cur) => ({ ...cur, ...patch }));
  };

  const batch = batches.find((b) => b.id === d.batchId) || null;
  const { rows: batchAnimals } = useTable('animals', { where: [['batchId', '==', d.batchId]] }, { enabled: !!d.batchId });
  const { rows: batchCosts } = useTable('batch_costs', { where: [['batchId', '==', d.batchId]] }, { enabled: !!d.batchId });
  const alive = useMemo(() => batchAnimals.filter((a) => a.status === 'ALIVE'), [batchAnimals]);
  const rawProducts = useMemo(() => products.filter((p) => p.meatType === 'RAW' && p.active).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [products]);
  const calc = useMemo(() => calcSlaughter(d, alive, batchCosts), [d, alive, batchCosts]);
  const slaughterhouse = partners.find((p) => p.id === d.slaughterhouseId) || null;

  const readyBatches = useMemo(() => batches.filter((b) => b.status === 'PURCHASED' || b.status === 'IN_PASTURE'), [batches]);
  const batchOptions = useMemo(
    () =>
      readyBatches
        .sort((a, b) => b.code.localeCompare(a.code))
        .map((b) => ({ value: b.id, label: `${b.code} · ${b.name}`, description: [b.supplierName, `${integer(b.headCount)} cabeças`].filter(Boolean).join(' · ') })),
    [readyBatches],
  );

  // Pré-preenche GTA/frigorífico do cadastro do lote ao escolher.
  useEffect(() => {
    if (!batch) return;
    setD((cur) =>
      cur.batchId !== batch.id
        ? cur
        : {
            ...cur,
            slaughterhouseId: cur.slaughterhouseId || batch.slaughterhouseId || '',
          },
    );
  }, [batch]);

  const onBatchChange = (id: string | null) => set({ batchId: id || '', animalWeights: {}, gtaNumber: '', slaughterhouseId: d.slaughterhouseId });

  const goNext = () => {
    const err = validateStep(step, d, calc);
    if (err) {
      setError(err);
      return;
    }
    // Ao entrar no passo de estoque pela primeira vez, sugere a divisão padrão.
    if (step === 2 && !d.outputs.length) {
      const r = splitOutputs(d, rawProducts);
      if (typeof r !== 'string') setD((cur) => ({ ...cur, outputs: r }));
    }
    setError(null);
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const goBack = () => {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  };

  const save = useAction(() => ops.registerSlaughter(toInput(d, calc)), {
    success: () => `Abate do lote ${batch?.code || ''} registrado — peças no estoque pós-abate`,
    onSuccess: () => nav(`/producao/estoque-abate?lote=${d.batchId}`),
  });

  const submit = async () => {
    for (let i = 0; i < 4; i++) {
      const err = validateStep(i, d, calc);
      if (err) {
        setStep(i);
        setError(err);
        return;
      }
    }
    if (calc.outputKg > 0 && Math.abs(calc.outputDiffKg) > (d.carcassWeightKg || 0) * 0.01) {
      const ok = await confirm({
        title: 'Saídas diferentes da carcaça',
        message: `As entradas no estoque somam ${kg(calc.outputKg)} e a carcaça tem ${kg(d.carcassWeightKg)}. Registrar mesmo assim?`,
        confirmLabel: 'Registrar',
      });
      if (!ok) return;
    }
    await save.run();
  };

  if (!canSlaughter) {
    return (
      <>
        <PageHeader eyebrow="Produção" title="Registrar abate" back="/producao/abate" />
        <Card>
          <EmptyState title="Sem permissão" description="Seu perfil não pode registrar abates. Fale com o gerente." />
        </Card>
      </>
    );
  }

  const initialInvalid = !!initialBatchId && !loadingBatches && batch && batch.status !== 'PURCHASED' && batch.status !== 'IN_PASTURE';
  const yieldInfo = carcassYieldInfo(calc.yieldPercent);

  return (
    <>
      <PageHeader
        eyebrow="Produção · Saída para abate"
        title="Registrar abate"
        subtitle={batch ? `${batch.code} · ${batch.name}` : 'Siga os passos: lote, pesagem, custos e entrada no estoque pós-abate.'}
        back="/producao/abate"
      />

      <Card className="mb-4">
        <Stepper steps={STEPS} current={step} onStep={(i) => i < step && setStep(i)} />
      </Card>

      {initialInvalid && (
        <Callout tone="warning" className="mb-4" title={`O lote ${batch!.code} já foi abatido`}>
          Escolha outro lote pronto para abate.
        </Callout>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
        <Card>
          <h2 className="font-display text-lg font-semibold text-fg mb-4">{STEPS[step].label}</h2>
          {step === 0 && (
            <StepBatch
              d={d}
              set={set}
              calc={calc}
              batch={batch}
              alive={alive}
              batchOptions={batchOptions}
              slaughterhouseOptions={shOptions}
              onBatchChange={onBatchChange}
            />
          )}
          {step === 1 && <StepWeighing d={d} set={set} calc={calc} batch={batch} alive={alive} />}
          {step === 2 && <StepCosts d={d} set={set} calc={calc} batch={batch} alive={alive} slaughterhouseName={slaughterhouse?.name} />}
          {step === 3 && <StepOutputs d={d} set={set} calc={calc} batch={batch} alive={alive} rawProducts={rawProducts} />}
          {step === 4 && <StepReview d={d} set={set} calc={calc} batch={batch} alive={alive} slaughterhouse={slaughterhouse} products={products} />}

          {error && (
            <Callout tone="danger" className="mt-5">
              {error}
            </Callout>
          )}

          <div className="flex items-center justify-between gap-2 mt-6 pt-4 border-t border-border">
            {step === 0 ? (
              <Button variant="ghost" onClick={onExit}>
                Cancelar
              </Button>
            ) : (
              <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={goBack}>
                Voltar
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button variant="primary" iconRight={<ArrowRight className="size-4" />} onClick={goNext}>
                Continuar
              </Button>
            ) : (
              <Button variant="primary" icon={<Check className="size-4" />} loading={save.running} onClick={() => void submit()}>
                Registrar abate
              </Button>
            )}
          </div>
        </Card>

        <Card className="hidden lg:block lg:sticky lg:top-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="size-8 rounded-control bg-primary-soft text-primary flex items-center justify-center">
              <Beef className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-fg truncate">{batch ? batch.code : 'Resumo'}</div>
              <div className="text-xs text-muted truncate">{slaughterhouse?.name || 'frigorífico a definir'}</div>
            </div>
          </div>
          <DescriptionList
            cols={1}
            items={[
              { label: 'Cabeças', value: <span className="num">{integer(calc.heads)}</span> },
              { label: 'Peso de saída', value: <span className="num">{d.exitScaleWeightKg ? kg(d.exitScaleWeightKg) : '—'}</span> },
              { label: 'Carcaça', value: <span className="num">{d.carcassWeightKg ? kg(d.carcassWeightKg) : '—'}</span> },
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
              { label: 'Líquido do abate', value: <span className="num">{money(calc.slaughterNet)}</span> },
              { label: 'Custo total do lote', value: <span className="num">{money(calc.totalCost)}</span> },
              { label: 'Custo por kg de carcaça', value: <span className="num font-semibold">{calc.costPerKg ? money(calc.costPerKg) : '—'}</span> },
              { label: 'Saídas p/ estoque', value: <span className="num">{calc.outputKg ? kg(calc.outputKg) : '—'}</span> },
            ]}
          />
        </Card>
      </div>
    </>
  );
}
