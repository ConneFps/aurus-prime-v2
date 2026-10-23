/**
 * Formulário de pesagem/separação: pesos reais, lotes, pacotes, itens extras e conclusão.
 */
import { CheckCircle2, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useOps, useSession } from '../../app/session';
import { useAction } from '../../data/react';
import { money, percent, qty as fmtQty, round2 } from '../../domain/format';
import { evaluateWeighing, policyFromSettings } from '../../domain/weighing';
import type { AppSettings, PriceTable, Product, Sale, StockLot, SupplyItem } from '../../domain/types';
import type { SaleItemInput, StockAllocationResult } from '../../ops/types';
import { Button, Callout, cn, Field, Textarea, useConfirm } from '../../ui';
import { AddItemModal } from './AddItemModal';
import { lotsForProduct, planDeduction, previewTotals, saleOrigin, type PlanLine } from './model';
import { PickItemCard, type CardItem, type LineDraft } from './PickItemCard';

interface Added extends SaleItemInput {
  key: string;
}

interface DraftState {
  lines: Record<string, LineDraft>;
  added: Added[];
  removed: string[];
  notes: string;
}

const draftKey = (id: string) => `aurus.picking.${id}`;

function initialDraft(sale: Sale, reweigh: boolean): DraftState {
  const lines: Record<string, LineDraft> = {};
  const weighed = reweigh || !!sale.pickedAt;
  for (const it of sale.items || []) {
    const needsWeight = it.kind === 'PRODUCT' && it.unit === 'KG' && !weighed;
    lines[it.id] = { qty: needsWeight ? null : it.qty, lotId: it.lotId || null, packages: it.packages ?? null };
  }
  return { lines, added: [], removed: [], notes: '' };
}

function loadDraft(sale: Sale, reweigh: boolean): DraftState {
  const base = initialDraft(sale, reweigh);
  try {
    const raw = localStorage.getItem(draftKey(sale.id));
    if (!raw) return base;
    const saved = JSON.parse(raw) as DraftState & { status: string };
    if (saved.status !== sale.status) return base;
    // Só reaproveita linhas de itens que ainda existem.
    const lines = { ...base.lines };
    for (const k of Object.keys(saved.lines || {})) if (lines[k]) lines[k] = saved.lines[k];
    return { lines, added: saved.added || [], removed: (saved.removed || []).filter((r) => lines[r]), notes: saved.notes || '' };
  } catch {
    return base;
  }
}

export function PickingForm({
  sale,
  products,
  lots,
  supplies,
  priceTable,
  settings,
  reweigh,
  onDone,
  onCancel,
}: {
  sale: Sale;
  products: Product[];
  lots: StockLot[];
  supplies: SupplyItem[];
  priceTable: PriceTable | null;
  settings: AppSettings;
  reweigh?: boolean;
  onDone: (r: StockAllocationResult) => void;
  onCancel?: () => void;
}) {
  const ops = useOps();
  const { can } = useSession();
  const confirm = useConfirm();
  const canEditItems = can('sales.edit');
  const [draft, setDraft] = useState<DraftState>(() => loadDraft(sale, !!reweigh));
  const [adding, setAdding] = useState(false);
  const origin = saleOrigin(sale);

  useEffect(() => {
    try {
      localStorage.setItem(draftKey(sale.id), JSON.stringify({ ...draft, status: sale.status }));
    } catch {
      /* armazenamento indisponível */
    }
  }, [draft, sale.id, sale.status]);

  const items = useMemo(() => [...(sale.items || [])].sort((a, b) => (a.position || 0) - (b.position || 0)), [sale.items]);
  const removed = new Set(draft.removed);

  const cards: { item: CardItem; productId?: string | null; supplyItemId?: string | null; line: LineDraft; existing: boolean }[] = [
    ...items.map((it) => ({
      item: { key: it.id, kind: it.kind, productName: it.productName, unit: it.unit, qtyOrdered: it.qtyOrdered, unitPrice: it.unitPrice, notes: it.notes },
      productId: it.productId,
      supplyItemId: it.supplyItemId,
      line: draft.lines[it.id] || { qty: it.qty, lotId: null, packages: null },
      existing: true,
    })),
    ...draft.added.map((a) => ({
      item: { key: a.key, kind: a.kind, productName: a.productName, unit: a.unit, qtyOrdered: a.qtyOrdered, unitPrice: a.unitPrice, notes: a.notes, added: true },
      productId: a.productId,
      supplyItemId: a.supplyItemId,
      line: { qty: a.qty ?? a.qtyOrdered, lotId: a.lotId ?? null, packages: a.packages ?? null },
      existing: false,
    })),
  ];
  const active = cards.filter((c) => !removed.has(c.item.key));

  const planLines: PlanLine[] = active.map((c) => ({
    kind: c.item.kind,
    key: c.item.key,
    productId: c.productId,
    supplyItemId: c.supplyItemId,
    qty: c.line.qty ?? 0,
    lotId: c.line.lotId,
  }));
  const plan = useMemo(() => planDeduction(planLines, lots, supplies, origin), [JSON.stringify(planLines), lots, supplies, origin]); // eslint-disable-line react-hooks/exhaustive-deps

  const pending = active.filter((c) => c.item.kind === 'PRODUCT' && c.item.unit === 'KG' && c.line.qty === null);
  const weighableCount = active.filter((c) => c.item.kind === 'PRODUCT' && c.item.unit === 'KG').length;
  const totals = previewTotals(
    sale,
    active.map((c) => ({ kind: c.item.kind, unit: c.item.unit, qty: c.line.qty ?? c.item.qtyOrdered, unitPrice: c.item.unitPrice })),
  );
  const estimated = sale.estimatedTotal ?? sale.totalValue;
  const diff = round2(totals.total - estimated);
  const weighing = sale.channel === 'PORTAL' ? evaluateWeighing(estimated, totals.total, policyFromSettings(settings)) : null;
  const policy = policyFromSettings(settings);
  const shortLines = active.filter((c) => (plan.get(c.item.key)?.short || 0) > 0.0005 && (c.line.qty ?? 0) > 0);
  const zeroLines = active.filter((c) => c.line.qty === 0);

  const setLine = (key: string, l: LineDraft, existing: boolean) => {
    if (existing) setDraft((d) => ({ ...d, lines: { ...d.lines, [key]: l } }));
    else setDraft((d) => ({ ...d, added: d.added.map((a) => (a.key === key ? { ...a, qty: l.qty ?? 0, qtyOrdered: a.qtyOrdered, lotId: l.lotId, packages: l.packages } : a)) }));
  };

  const finalize = useAction(
    async () => {
      if (pending.length) throw new Error(`Falta pesar: ${pending.map((c) => c.item.productName).join(', ')}.`);
      if (!active.length) throw new Error('O pedido ficaria sem itens.');
      const warnings: string[] = [];
      if (zeroLines.length) warnings.push(`Não serão enviados (0): ${zeroLines.map((c) => c.item.productName).join(', ')}.`);
      if (shortLines.length)
        warnings.push(
          `Estoque insuficiente — a baixa ficará parcial: ${shortLines.map((c) => `${c.item.productName} (falta ${fmtQty(plan.get(c.item.key)!.short, c.item.unit)})`).join(', ')}.`,
        );
      if (weighing?.needsCustomerApproval) warnings.push(`O cliente precisará aceitar a diferença de ${money(weighing.diffValue)} no portal.`);
      const ok = await confirm({
        title: 'Concluir separação?',
        message: (
          <div className="space-y-2">
            <p>
              Total final <strong className="text-fg num">{money(totals.total)}</strong> · {fmtQty(totals.weight, 'KG')}. O estoque será baixado agora.
            </p>
            {warnings.map((w) => (
              <p key={w} className="text-warning">
                {w}
              </p>
            ))}
          </div>
        ),
        confirmLabel: 'Concluir e dar baixa',
      });
      if (!ok) return null;
      const r = await ops.finalizePicking(sale.id, {
        items: items
          .filter((it) => !removed.has(it.id))
          .map((it) => {
            const l = draft.lines[it.id];
            return { itemId: it.id, qty: l?.qty ?? it.qty, lotId: it.kind === 'PRODUCT' ? l?.lotId ?? null : undefined, packages: l?.packages ?? null };
          }),
        addItems: draft.added.filter((a) => !removed.has(a.key)).map(({ key: _k, ...a }) => a),
        removeItemIds: items.filter((it) => removed.has(it.id)).map((it) => it.id),
        notes: draft.notes.trim() || null,
      });
      try {
        localStorage.removeItem(draftKey(sale.id));
      } catch {
        /* ignore */
      }
      return r;
    },
    { onSuccess: (r) => r && onDone(r) },
  );

  const remove = async (key: string, name: string, existing: boolean) => {
    if (!existing) return setDraft((d) => ({ ...d, added: d.added.filter((a) => a.key !== key) }));
    if (await confirm({ title: `Remover ${name} do pedido?`, message: 'O item sai do pedido e do valor final. Use quando o cliente desistiu ou não há o corte.', confirmLabel: 'Remover', danger: true }))
      setDraft((d) => ({ ...d, removed: [...d.removed, key] }));
  };

  const stockByProduct = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) {
      const bal = lotsForProduct(lots, p.id, origin).reduce((s, l) => s + l.balanceQty, 0);
      if (bal > 0) m.set(p.id, bal);
    }
    return m;
  }, [products, lots, origin]);

  return (
    <div className="space-y-3">
      {cards.map((c, i) => (
        <PickItemCard
          key={c.item.key}
          index={i + 1}
          item={c.item}
          line={c.line}
          onChange={(l) => setLine(c.item.key, l, c.existing)}
          lots={c.productId ? lotsForProduct(lots, c.productId, origin) : []}
          plan={plan.get(c.item.key)}
          removed={removed.has(c.item.key)}
          onRestore={() => setDraft((d) => ({ ...d, removed: d.removed.filter((r) => r !== c.item.key) }))}
          onRemove={canEditItems || !c.existing ? () => void remove(c.item.key, c.item.productName, c.existing) : undefined}
        />
      ))}

      {canEditItems && (
        <Button variant="secondary" block icon={<Plus className="size-4" />} onClick={() => setAdding(true)} className="border-dashed">
          Incluir item (sacola, frete, outro corte)
        </Button>
      )}

      <Field label="Observação da separação">
        <Textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={2} placeholder="Ex.: faltou fraldinha, cliente avisado" />
      </Field>

      {weighing && (
        <Callout
          tone={weighing.needsCustomerApproval ? 'warning' : 'success'}
          title={weighing.needsCustomerApproval ? 'Vai precisar do aceite do cliente (portal)' : 'Dentro da margem do portal'}
        >
          {weighing.needsCustomerApproval
            ? `A pesagem está ${money(weighing.diffValue)} (${percent(weighing.diffPercent)}) acima do estimado. A margem automática é até ${percent(policy.tolerancePercent)}${policy.toleranceMaxValue != null ? ` e ${money(policy.toleranceMaxValue)}` : ''}. O pedido ficará "Aguardando cliente".`
            : diff > 0
              ? `Diferença de ${money(weighing.diffValue)} (${percent(weighing.diffPercent)}) — aceita automaticamente.`
              : 'Pesou igual ou menos que o pedido — segue direto, sem aceite.'}
          {pending.length > 0 && <span className="block text-xs mt-1 opacity-80">Prévia parcial: ainda faltam itens a pesar.</span>}
        </Callout>
      )}

      {/* Barra de resumo fixa */}
      <div className="sticky bottom-0 z-20 -mx-4 sm:mx-0 mt-4 border-t sm:border border-border bg-surface/95 backdrop-blur sm:rounded-card shadow-pop px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-lg font-semibold text-fg num">{money(totals.total)}</span>
              {Math.abs(diff) >= 0.01 && (
                <span className={cn('text-xs num font-medium', diff > 0 ? 'text-warning' : 'text-success')}>
                  {diff > 0 ? '+' : '−'}
                  {money(Math.abs(diff))} vs pedido
                </span>
              )}
            </div>
            <div className="text-xs text-muted num truncate">
              {fmtQty(totals.weight, 'KG')} ·{' '}
              {pending.length ? <span className="text-warning">{weighableCount - pending.length}/{weighableCount} pesados</span> : 'tudo pesado'}
              {shortLines.length > 0 && <span className="text-danger"> · falta estoque</span>}
            </div>
          </div>
          {onCancel && (
            <Button variant="ghost" onClick={onCancel} className="hidden sm:inline-flex">
              Cancelar
            </Button>
          )}
          <Button variant="primary" size="lg" icon={<CheckCircle2 className="size-5" />} loading={finalize.running} onClick={() => void finalize.run()}>
            Concluir
          </Button>
        </div>
      </div>

      <AddItemModal
        open={adding}
        onClose={() => setAdding(false)}
        supplies={supplies}
        products={products}
        priceTable={priceTable}
        stockByProduct={stockByProduct}
        onAdd={(it) => setDraft((d) => ({ ...d, added: [...d.added, { ...it, key: `new-${Date.now()}` }] }))}
      />
    </div>
  );
}
