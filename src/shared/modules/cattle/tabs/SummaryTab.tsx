/**
 * Resumo do lote: DRE, indicadores, custos por grupo e preço de referência.
 */
import { Save } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { brlShort } from '../Money';
import { useOps, useSession } from '../../../app/session';
import { useAction } from '../../../data/react';
import type { BatchEconomics } from '../../../domain/costs';
import { date, daysBetween, integer, kg, money, number, percent, today } from '../../../domain/format';
import { COMPANY_LABELS, COST_GROUP_LABELS, MANAGEMENT_LABELS } from '../../../domain/labels';
import type { Animal, Batch, BatchCost, FeedConsumption } from '../../../domain/types';
import { Badge, BarsChart, Button, Card, CardHeader, cn, DescriptionList, Field, MoneyInput, NumberInput, PercentInput } from '../../../ui';
import { REVENUE_SOURCE_LABELS } from '../batchPdf';
import { COST_GROUP_ORDER, daysOnFeed, isActiveBatch, prefixed } from '../helpers';

export function SummaryTab({ batch, econ: e, costs, animals, feed }: { batch: Batch; econ: BatchEconomics; costs: BatchCost[]; animals: Animal[]; feed: FeedConsumption[] }) {
  const days = daysOnFeed(batch);
  const heads = e.headCount || 1;
  const noRevenue = e.revenueSource === 'NONE';
  const chart = useMemo(
    () => COST_GROUP_ORDER.filter((g) => g !== 'CREDIT' && e.byGroup[g] > 0).map((g) => ({ group: COST_GROUP_LABELS[g], value: Math.round(e.byGroup[g] * 100) / 100 })),
    [e],
  );

  // GMD: ganho médio diário dos animais vivos com pesagem registrada.
  const gmd = useMemo(() => {
    const weighed = animals.filter((a) => a.status === 'ALIVE' && a.currentWeightKg && a.currentWeightKg !== a.entryWeightKg);
    if (!weighed.length || !days) return null;
    return (weighed.reduce((s, a) => s + (a.currentWeightKg! - a.entryWeightKg), 0) / weighed.length / days) * 1000;
  }, [animals, days]);
  const feedKg = feed.reduce((s, f) => s + f.quantityKg, 0);
  const purchaseCost = costs.filter((c) => c.category === 'PURCHASE').reduce((s, c) => s + c.amount, 0);

  const revenueLines: { label: string; value: number; hint?: string }[] = [];
  if (e.revenueSource === 'OVERRIDE') revenueLines.push({ label: 'Receita informada', value: e.revenue });
  else {
    if (e.realizedRevenue) revenueLines.push({ label: 'Vendas realizadas', value: e.realizedRevenue, hint: `${kg(Math.round(e.soldKg))} vendidos` });
    if (e.remainingValue) revenueLines.push({ label: 'Estoque restante (estimado)', value: e.remainingValue, hint: `${kg(Math.round(e.remainingKg))} em estoque` });
    if (!e.realizedRevenue && !e.remainingValue && e.projectedRevenue)
      revenueLines.push({ label: 'Projeção', value: e.projectedRevenue, hint: `${kg(e.carcassWeightKg)} × ${money(batch.sellingPricePerKg)}/kg` });
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4 min-w-0">
        <Card>
          <CardHeader
            title="Resultado do lote"
            subtitle="Receita menos todos os custos lançados (créditos já descontados)"
            actions={<Badge tone={e.revenueSource === 'NONE' ? 'neutral' : e.revenueSource === 'PROJECTED' ? 'warning' : 'success'}>{REVENUE_SOURCE_LABELS[e.revenueSource]}</Badge>}
          />
          <dl className="text-sm">
            <Row label="Receita" value={e.revenue} strong />
            {revenueLines.map((r) => (
              <Row key={r.label} label={r.label} hint={r.hint} value={r.value} indent />
            ))}
            <Row label="Custos" value={-e.grossCost} strong className="mt-3" />
            {COST_GROUP_ORDER.filter((g) => g !== 'CREDIT' && e.byGroup[g]).map((g) => (
              <Row key={g} label={COST_GROUP_LABELS[g]} value={-e.byGroup[g]} hint={`${money(e.byGroup[g] / heads)}/cab`} indent />
            ))}
            {e.credits > 0 && <Row label="Créditos (retorno do abate, impostos)" value={e.credits} indent tone="success" />}
            <div className="my-3 border-t border-border-strong" />
            {noRevenue ? (
              <Row label="Custo acumulado" value={e.totalCost} strong big />
            ) : (
              <Row label={e.profit >= 0 ? 'Lucro' : 'Prejuízo'} value={e.profit} strong big tone={e.profit >= 0 ? 'success' : 'danger'} />
            )}
            <div className="grid grid-cols-3 gap-3 mt-4">
              <Mini label="Margem" value={noRevenue ? '—' : percent(e.marginPercent)} />
              <Mini label="ROI" value={noRevenue ? '—' : percent(e.roiPercent)} />
              <Mini label="Resultado/cab" value={noRevenue ? '—' : <><span className="sm:hidden">{brlShort(e.profit / heads)}</span><span className="hidden sm:inline">{money(e.profit / heads)}</span></>} />
            </div>
          </dl>
          {noRevenue && (
            <p className="text-xs text-muted mt-4">
              {isActiveBatch(batch) ? 'O resultado aparece após o abate (carcaça × preço de referência) e as vendas. Veja a projeção abaixo.' : 'Nenhuma receita registrada para este lote.'}
            </p>
          )}
        </Card>

        {!e.carcassWeightKg && isActiveBatch(batch) && <ProjectionCard batch={batch} econ={e} animals={animals} />}

        <Card>
          <CardHeader title="Custos por grupo" subtitle={`${costs.length} lançamentos · ${money(e.grossCost)} brutos`} />
          {chart.length ? <BarsChart data={chart} xKey="group" series={[{ key: 'value', name: 'Custo' }]} layout="vertical" height={Math.max(160, chart.length * 44)} format={money} axisFormat={(v) => `${Math.round(v / 1000)} mil`} /> : <p className="text-sm text-muted py-6 text-center">Nenhum custo lançado ainda.</p>}
        </Card>
      </div>

      <div className="space-y-4 min-w-0">
        <Card>
          <CardHeader title="Indicadores" />
          <DescriptionList
            cols={2}
            items={[
              { label: 'Custo/cabeça', value: <span className="num">{money(e.costPerHead)}</span> },
              { label: 'Custo/@ carcaça', value: <span className="num">{e.costPerArroba ? money(e.costPerArroba) : '—'}</span> },
              { label: 'Equilíbrio (R$/kg)', value: <span className="num">{e.costPerCarcassKg ? money(e.costPerCarcassKg) : '—'}</span> },
              { label: 'Rendimento', value: <span className="num">{e.carcassYieldPercent ? percent(e.carcassYieldPercent) : '—'}</span> },
              { label: 'Peso de compra', value: <span className="num">{kg(Math.round(e.purchaseWeightKg))}</span> },
              { label: 'Peso médio', value: <span className="num">{kg(Math.round((e.purchaseWeightKg / heads) * 10) / 10)}</span> },
              { label: 'Carcaça', value: <span className="num">{e.carcassWeightKg ? kg(Math.round(e.carcassWeightKg)) : '—'}</span> },
              { label: '@ produzidas', value: <span className="num">{e.carcassWeightKg ? number(e.carcassWeightKg / 15, 1) : '—'}</span> },
              { label: 'Compra R$/kg vivo', value: <span className="num">{e.purchaseWeightKg && purchaseCost ? money(purchaseCost / e.purchaseWeightKg) : '—'}</span> },
              { label: 'Dias', value: <span className="num">{days === null ? '—' : integer(days)}</span> },
              { label: 'Ração consumida', value: <span className="num">{feedKg ? kg(Math.round(feedKg)) : '—'}</span> },
              { label: 'GMD (pesagens)', value: <span className="num">{gmd ? `${integer(gmd)} g/dia` : '—'}</span> },
            ]}
          />
        </Card>
        <ReferencePriceCard batch={batch} />
        <Card>
          <CardHeader title="Dados do lote" />
          <DescriptionList
            cols={1}
            items={[
              { label: 'Fornecedor', value: batch.supplierName || '—' },
              { label: 'Compra', value: [date(batch.purchaseDate), prefixed('NF', batch.purchaseInvoice)].filter(Boolean).join(' · ') },
              { label: 'GTA', value: batch.gtaNumber || '—' },
              { label: 'Manejo', value: MANAGEMENT_LABELS[batch.managementType] + (batch.confinementEntryWeightKg ? ` · entrada ${kg(batch.confinementEntryWeightKg)}` : '') },
              { label: 'Previsão de abate', value: date(batch.estimatedSlaughterDate) },
              { label: 'Empresa', value: batch.company ? COMPANY_LABELS[batch.company] : '—', hidden: !batch.company },
              { label: 'Descrição', value: batch.description, hidden: !batch.description },
              { label: 'Observações', value: <span className="whitespace-pre-line">{batch.notes}</span>, hidden: !batch.notes },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  hint,
  indent,
  strong,
  big,
  tone,
  className,
}: {
  label: string;
  value: number;
  hint?: string;
  indent?: boolean;
  strong?: boolean;
  big?: boolean;
  tone?: 'success' | 'danger';
  className?: string;
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 py-1', indent && 'pl-4', className)}>
      <dt className={cn('min-w-0', strong ? 'font-semibold text-fg' : 'text-muted')}>
        {label}
        {hint && <span className="ml-2 text-xs text-subtle num hidden sm:inline">{hint}</span>}
      </dt>
      <dd className={cn('num shrink-0', strong ? 'font-semibold text-fg' : 'text-fg', big && 'text-xl', tone === 'success' && 'text-success', tone === 'danger' && 'text-danger')}>
        {money(value)}
      </dd>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-control bg-surface-2 px-3 py-2 min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-subtle">{label}</div>
      <div className="text-sm font-semibold text-fg num truncate">{value}</div>
    </div>
  );
}

function ReferencePriceCard({ batch }: { batch: Batch }) {
  const ops = useOps();
  const { can } = useSession();
  const [price, setPrice] = useState<number | null>(batch.sellingPricePerKg ?? null);
  const [override, setOverride] = useState<number | null>(batch.revenueOverride ?? null);
  useEffect(() => {
    setPrice(batch.sellingPricePerKg ?? null);
    setOverride(batch.revenueOverride ?? null);
  }, [batch.sellingPricePerKg, batch.revenueOverride]);
  const dirty = (price ?? null) !== (batch.sellingPricePerKg ?? null) || (override ?? null) !== (batch.revenueOverride ?? null);
  const save = useAction(() => ops.updateBatch(batch.id, { sellingPricePerKg: price, revenueOverride: override }), { success: 'Valores de venda salvos' });
  const editable = can('cattle.manage');
  return (
    <Card>
      <CardHeader title="Preço e receita" subtitle="Base da projeção do resultado" />
      <div className="space-y-3">
        <Field label="Preço de referência (R$/kg)">
          <NumberInput value={price} onChange={setPrice} decimals={2} minDecimals={2} prefix="R$" suffix="/kg" disabled={!editable} />
        </Field>
        <Field label="Receita total informada" hint="Substitui a receita calculada (vendas + estoque)">
          <MoneyInput value={override} onChange={setOverride} disabled={!editable} />
        </Field>
        {editable && (
          <Button block variant={dirty ? 'primary' : 'secondary'} disabled={!dirty} loading={save.running} icon={<Save className="size-4" />} onClick={() => void save.run()}>
            Salvar valores de venda
          </Button>
        )}
      </div>
    </Card>
  );
}

/** Projeção antes do abate: peso vivo atual × rendimento × preço de referência. */
function ProjectionCard({ batch, econ: e, animals }: { batch: Batch; econ: BatchEconomics; animals: Animal[] }) {
  const alive = animals.filter((a) => a.status === 'ALIVE');
  const isWeighed = (a: Animal) => !!a.currentWeightKg && a.currentWeightKg !== a.entryWeightKg;
  const weighedCount = alive.filter(isWeighed).length;
  const baseKg = alive.length ? alive.reduce((s, a) => s + (a.currentWeightKg || a.entryWeightKg), 0) : batch.purchaseWeightKg || 0;
  // Ganho até a previsão de abate (ou hoje): pesados ganham a partir de hoje; os demais, desde a compra.
  const end = batch.estimatedSlaughterDate && batch.estimatedSlaughterDate > today() ? batch.estimatedSlaughterDate : today();
  const daysFromPurchase = Math.max(0, daysBetween(batch.purchaseDate || today(), end));
  const daysFromToday = Math.max(0, daysBetween(today(), end));
  const gainHeadDays = alive.length
    ? alive.reduce((s, a) => s + (isWeighed(a) ? daysFromToday : daysFromPurchase), 0)
    : (batch.headCount || 0) * daysFromPurchase;
  const [yieldPct, setYieldPct] = useState<number | null>(batch.managementType === 'CONFINAMENTO' ? 54 : 52);
  const [gmd, setGmd] = useState<number | null>(batch.managementType === 'CONFINAMENTO' ? 1200 : 600);
  const [price, setPrice] = useState<number | null>(batch.sellingPricePerKg ?? null);
  useEffect(() => setPrice(batch.sellingPricePerKg ?? null), [batch.sellingPricePerKg]);
  const liveKg = baseKg + gainHeadDays * ((gmd || 0) / 1000);
  const carcass = liveKg * ((yieldPct || 0) / 100);
  const revenue = carcass * (price || 0);
  const profit = revenue - e.totalCost;
  const breakEven = carcass ? e.totalCost / carcass : 0;
  return (
    <Card>
      <CardHeader
        title="Projeção de resultado"
        subtitle={`${kg(Math.round(baseKg))} hoje (${weighedCount ? `${weighedCount} pesados, demais pelo peso de entrada` : 'peso de entrada'}) + ganho até ${end === today() ? 'hoje' : date(end)}`}
      />
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Field label="GMD (g/dia)">
          <NumberInput value={gmd} onChange={setGmd} decimals={0} />
        </Field>
        <Field label="Rendimento">
          <PercentInput value={yieldPct} onChange={setYieldPct} decimals={1} />
        </Field>
        <Field label="R$/kg carcaça">
          <NumberInput value={price} onChange={setPrice} decimals={2} minDecimals={2} prefix="R$" />
        </Field>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Mini label="Peso vivo no abate" value={`${kg(Math.round(liveKg))}`} />
        <Mini label="Carcaça estimada" value={`${kg(Math.round(carcass))} · ${number(carcass / 15, 0)} @`} />
        <Mini label="Receita estimada" value={price ? money(revenue) : '—'} />
        <Mini label={profit >= 0 ? 'Lucro estimado' : 'Prejuízo estimado'} value={price ? money(profit) : '—'} />
      </div>
      <p className="text-xs text-muted mt-3 num">
        {price && revenue ? `Margem estimada ${percent((profit / revenue) * 100)} · ` : !price ? 'Informe o preço para estimar a receita · ' : ''}
        Equilíbrio com o custo atual: {breakEven ? `${money(breakEven)}/kg ou ${money(breakEven * 15)}/@ de carcaça` : '—'}. Simulação — não é gravada.
      </p>
    </Card>
  );
}
