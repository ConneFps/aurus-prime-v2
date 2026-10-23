/**
 * Registrar retorno da desossa (parcial ou total): grade de cortes, perdas
 * detalhadas e balanço ao vivo → ops.registerProcessingReturn.
 */
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useOps } from '../../app/session';
import { useAction, useTable } from '../../data/react';
import { addDays, kg, money, normalize, percent, round3, today } from '../../domain/format';
import type { ProcessingLossBreakdown, ProcessingOrder, Product } from '../../domain/types';
import {
  Button,
  Callout,
  cn,
  Combobox,
  DateInput,
  Drawer,
  Field,
  FormGrid,
  FormSection,
  IconButton,
  Input,
  Segmented,
  Textarea,
  toast,
  useConfirm,
  WeightInput,
} from '../../ui';
import { lineKey } from './slaughter-model';
import { defaultShelfLife, deboningYieldTone, Metric, orderCostPerKg } from './shared';

interface CutLine {
  key: string;
  productId: string;
  qty: number | null;
  /** null = validade padrão (data + shelfLifeDays). */
  expiryDate: string | null;
}

const LOSS_FIELDS: { key: keyof ProcessingLossBreakdown; label: string; hint: string }[] = [
  { key: 'bonesKg', label: 'Osso', hint: 'ossos da desossa' },
  { key: 'fatKg', label: 'Sebo / gordura', hint: 'descartado' },
  { key: 'trimmingKg', label: 'Apara', hint: 'recortes sem uso' },
  { key: 'evaporationKg', label: 'Evaporação', hint: 'quebra de peso' },
  { key: 'otherKg', label: 'Outras perdas', hint: 'descarte, avaria…' },
];

export function ProcessingReturnDrawer({ order, open, onClose }: { order: ProcessingOrder; open: boolean; onClose: () => void }) {
  const ops = useOps();
  const confirm = useConfirm();
  const { rows: products } = useTable('products', undefined, { enabled: open });
  const finished = useMemo(() => products.filter((p) => p.active && p.meatType !== 'RAW').sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [products]);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const [day, setDay] = useState(today());
  const [type, setType] = useState<'PARTIAL' | 'TOTAL'>('TOTAL');
  const [invoice, setInvoice] = useState('');
  const [cuts, setCuts] = useState<CutLine[]>([]);
  const [losses, setLosses] = useState<ProcessingLossBreakdown>({});
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setDay(today());
    setType('TOTAL');
    setInvoice('');
    setCuts([]);
    setLosses({});
    setNotes('');
  }, [open, order.id]);

  const expiryFor = (line: CutLine) => line.expiryDate || addDays(day, defaultShelfLife(byId.get(line.productId)));

  // Categorias sugeridas: as que batem com o nome das peças enviadas vêm primeiro.
  const categories = useMemo(() => {
    const sentNames = order.sentItems.map((i) => normalize(i.productName));
    const cats = new Map<string, Product[]>();
    for (const p of finished) cats.set(p.category || 'Outros', [...(cats.get(p.category || 'Outros') || []), p]);
    return [...cats.entries()]
      .map(([name, items]) => ({ name, items, match: sentNames.some((s) => s.includes(normalize(name)) || s.includes('carcaca')) }))
      .sort((a, b) => Number(b.match) - Number(a.match) || a.name.localeCompare(b.name, 'pt-BR'));
  }, [finished, order.sentItems]);

  const used = new Set(cuts.map((c) => c.productId));
  const addProducts = (ps: Product[]) => {
    const fresh = ps.filter((p) => !used.has(p.id)).map((p) => ({ key: lineKey(), productId: p.id, qty: null, expiryDate: null }));
    setCuts((cur) => [...cur, ...fresh]);
  };
  const update = (key: string, patch: Partial<CutLine>) => setCuts((cur) => cur.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  const calc = useMemo(() => {
    const outKg = cuts.reduce((s, c) => s + (c.qty || 0), 0);
    const declared = LOSS_FIELDS.reduce((s, f) => s + (losses[f.key] || 0), 0);
    const accounted = order.returnedKg + order.lossKg + outKg + declared;
    const remaining = order.sentKg - accounted; // positivo = não classificado; negativo = excesso
    const unclassified = type === 'TOTAL' ? Math.max(0, remaining) : 0;
    const perKgSent = orderCostPerKg(order);
    const inKg = outKg + declared + unclassified;
    const unitCost = outKg > 0 ? (perKgSent * inKg) / outKg : 0;
    const cumYield = order.sentKg ? ((order.returnedKg + outKg) / order.sentKg) * 100 : 0;
    const thisYield = inKg > 0 ? (outKg / inKg) * 100 : 0;
    return { outKg, declared, remaining, unclassified, unitCost, cumYield, thisYield, excess: remaining < -0.0005 ? -remaining : 0 };
  }, [cuts, losses, order, type]);

  const withQty = cuts.filter((c) => (c.qty || 0) > 0);
  const empties = cuts.length - withQty.length;

  const save = useAction(
    () =>
      ops.registerProcessingReturn(order.id, {
        date: day,
        type,
        invoiceNumber: invoice.trim() || null,
        items: withQty.map((c) => ({ productId: c.productId, qty: round3(c.qty || 0), expiryDate: expiryFor(c) })),
        losses: Object.fromEntries(LOSS_FIELDS.filter((f) => (losses[f.key] || 0) > 0).map((f) => [f.key, round3(losses[f.key] || 0)])),
        notes: notes.trim() || null,
      }),
    {
      success: () => (type === 'TOTAL' ? `${order.number} concluída — cortes no estoque de venda` : 'Retorno parcial registrado'),
      onSuccess: onClose,
    },
  );

  const submit = async () => {
    if (!day) return toast.error('Informe a data do retorno.');
    if (!withQty.length && calc.declared <= 0 && type !== 'TOTAL') return toast.error('Informe os cortes retornados ou as perdas.');
    if (calc.excess > 0.05) {
      const ok = await confirm({
        title: 'Retorno maior que o enviado',
        message: `Cortes + perdas passam do peso enviado em ${kg(calc.excess)}. Confira a pesagem. Registrar mesmo assim?`,
        confirmLabel: 'Registrar',
        danger: true,
      });
      if (!ok) return;
    }
    if (type === 'TOTAL' && calc.unclassified > 0.05) {
      const ok = await confirm({
        title: 'Fechar a ordem com diferença?',
        message: `${kg(calc.unclassified)} não foram classificados e serão registrados como perda por divergência de pesagem.`,
        confirmLabel: 'Fechar ordem',
      });
      if (!ok) return;
    }
    await save.run();
  };

  const productOptions = finished.filter((p) => !used.has(p.id)).map((p) => ({ value: p.id, label: p.name, description: p.category }));

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="xl"
      title={`Registrar retorno — ${order.number}`}
      description={`${order.partnerName} · enviado ${kg(order.sentKg)}${order.returnedKg ? ` · já retornado ${kg(order.returnedKg)}` : ''}`}
      footer={
        <>
          <span className="mr-auto self-center text-xs text-muted num">
            Rendimento {percent(calc.cumYield, 1)} · {type === 'TOTAL' ? `não classificado ${kg(calc.unclassified)}` : `pendente ${kg(Math.max(0, calc.remaining))}`}
          </span>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.running} onClick={() => void submit()}>
            {type === 'TOTAL' ? 'Registrar e concluir' : 'Registrar retorno parcial'}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px] items-start">
        <div className="space-y-6 min-w-0">
          <FormGrid cols={3}>
            <Field label="Tipo de retorno" span="full">
              <Segmented
                value={type}
                onChange={setType}
                options={[
                  { value: 'PARTIAL', label: 'Parcial (ainda volta mais)' },
                  { value: 'TOTAL', label: 'Total (fecha a ordem)' },
                ]}
              />
            </Field>
            <Field label="Data do retorno" required>
              <DateInput value={day} onChange={setDay} />
            </Field>
            <Field label="NF de retorno">
              <Input value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="Nº da nota" />
            </Field>
          </FormGrid>

          <FormSection
            title="Cortes retornados"
            description={`${withQty.length} corte(s) com peso${empties ? ` · ${empties} linha(s) vazia(s) serão ignoradas` : ''}. Validade padrão = data + validade do produto (ou 90 dias).`}
          >
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => {
                const missing = c.items.filter((p) => !used.has(p.id)).length;
                return (
                  <Button key={c.name} size="xs" variant={c.match ? 'subtle' : 'ghost'} icon={<Plus className="size-3.5" />} disabled={!missing} onClick={() => addProducts(c.items)}>
                    {c.name} <span className="text-subtle num">({missing})</span>
                  </Button>
                );
              })}
            </div>

            {cuts.length > 0 && (
              <div className="rounded-card border border-border divide-y divide-border">
                <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_150px_150px_36px] gap-3 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted bg-surface-2/60 rounded-t-card">
                  <span>Corte</span>
                  <span>Peso</span>
                  <span>Validade</span>
                  <span />
                </div>
                {cuts.map((c) => {
                  const p = byId.get(c.productId);
                  return (
                    <div key={c.key} className="grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_150px_150px_36px] gap-x-3 gap-y-2 px-3 py-2 items-center">
                      <div className="col-span-2 sm:col-span-1 flex items-center justify-between gap-2 min-w-0">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-fg truncate">{p?.name || 'Produto'}</div>
                          <div className="text-[11px] text-subtle num truncate">
                            {p?.category}
                            {(c.qty || 0) > 0 && order.sentKg ? ` · ${percent(((c.qty || 0) / order.sentKg) * 100, 1)} do enviado` : ''}
                          </div>
                        </div>
                        <IconButton label="Remover" size="sm" variant="danger" className="sm:hidden" onClick={() => setCuts((cur) => cur.filter((x) => x.key !== c.key))}>
                          <Trash2 className="size-4" />
                        </IconButton>
                      </div>
                      <WeightInput value={c.qty} onChange={(v) => update(c.key, { qty: v })} unit={p?.unit || 'KG'} className="h-9" aria-label={`Peso — ${p?.name}`} />
                      <DateInput value={expiryFor(c)} onChange={(v) => update(c.key, { expiryDate: v || null })} className={cn('h-9', !c.expiryDate && 'text-muted')} aria-label="Validade" />
                      <div className="hidden sm:flex">
                        <IconButton label="Remover" size="sm" variant="danger" onClick={() => setCuts((cur) => cur.filter((x) => x.key !== c.key))}>
                          <Trash2 className="size-4" />
                        </IconButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <Combobox value={null} onChange={(v) => v && addProducts(finished.filter((p) => p.id === v))} options={productOptions} placeholder="Adicionar um corte…" emptyText="Todos os cortes já estão na lista" />
          </FormSection>

          <FormSection title="Perdas da desossa" description="Informe o que não voltou como corte. O que sobrar sem classificação vira perda por divergência ao fechar a ordem.">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {LOSS_FIELDS.map((f) => (
                <Field key={f.key} label={f.label} hint={(losses[f.key] || 0) > 0 && order.sentKg ? `${percent(((losses[f.key] || 0) / order.sentKg) * 100, 1)} do enviado` : f.hint}>
                  <WeightInput value={losses[f.key] ?? null} onChange={(v) => setLosses((cur) => ({ ...cur, [f.key]: v }))} />
                </Field>
              ))}
            </div>
          </FormSection>

          <Field label="Observações">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: primeira remessa, restante na próxima semana" />
          </Field>
        </div>

        <aside className="space-y-2.5 lg:sticky lg:top-0">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted">Balanço ao vivo</div>
          <Metric label="Enviado" value={kg(order.sentKg)} />
          {(order.returnedKg > 0 || order.lossKg > 0) && <Metric label="Retornos anteriores" value={kg(order.returnedKg)} hint={`perdas anteriores ${kg(order.lossKg)}`} />}
          <Metric label="Cortes neste retorno" value={kg(calc.outKg)} tone={calc.outKg ? 'success' : undefined} />
          <Metric label="Perdas declaradas" value={kg(calc.declared)} />
          <Metric
            label={type === 'TOTAL' ? 'Não classificado' : 'Ainda pendente'}
            value={calc.excess ? `− ${kg(calc.excess)}` : kg(Math.max(0, calc.remaining))}
            tone={calc.excess ? 'danger' : calc.remaining > 0.05 && type === 'TOTAL' ? 'warning' : 'success'}
            hint={calc.excess ? 'passou do enviado' : type === 'TOTAL' ? 'vira perda por divergência' : 'volta num próximo retorno'}
          />
          <Metric large label="Rendimento acumulado" value={percent(calc.cumYield, 2)} tone={deboningYieldTone(calc.cumYield)} hint="cortes ÷ enviado" />
          <Metric label="Custo estimado dos cortes" value={calc.unitCost ? `${money(calc.unitCost)}/kg` : '—'} hint="rateio de matéria-prima + desossa + frete" />
          {calc.excess > 0.05 && (
            <Callout tone="danger" className="text-xs">
              Cortes + perdas passam do enviado em {kg(calc.excess)}.
            </Callout>
          )}
        </aside>
      </div>
    </Drawer>
  );
}
