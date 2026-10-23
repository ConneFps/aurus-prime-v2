/**
 * Cartão de um item na pesagem: pedido × peso real, lote (FIFO ou escolhido) e pacotes.
 */
import { Copy, MessageSquareText, Trash2, Undo2 } from 'lucide-react';
import { date, money, percent, qty as fmtQty, round2, round3 } from '../../domain/format';
import type { SaleItemKind, StockLot } from '../../domain/types';
import { Badge, Button, cn, Field, IconButton, NumberInput, Select, WeightInput } from '../../ui';
import { expiryBadge, type PlanResult } from './model';

export interface LineDraft {
  qty: number | null;
  lotId: string | null;
  packages: number | null;
}

export interface CardItem {
  key: string;
  kind: SaleItemKind;
  productName: string;
  unit: 'KG' | 'UN';
  qtyOrdered: number;
  unitPrice: number;
  notes?: string | null;
  added?: boolean;
}

const KIND_LABEL: Record<SaleItemKind, string> = { PRODUCT: 'Corte', SUPPLY: 'Material', FREIGHT: 'Frete', SERVICE: 'Serviço' };

export function PickItemCard({
  index,
  item,
  line,
  onChange,
  lots,
  plan,
  onRemove,
  removed,
  onRestore,
}: {
  index: number;
  item: CardItem;
  line: LineDraft;
  onChange: (l: LineDraft) => void;
  /** Lotes disponíveis do produto (FIFO). */
  lots: StockLot[];
  plan?: PlanResult;
  onRemove?: () => void;
  removed?: boolean;
  onRestore?: () => void;
}) {
  const isProduct = item.kind === 'PRODUCT';
  const weighable = isProduct && item.unit === 'KG';
  const q = line.qty;
  const diff = q === null ? null : round3(q - item.qtyOrdered);
  const diffPct = diff !== null && item.qtyOrdered > 0 ? (diff / item.qtyOrdered) * 100 : 0;
  const total = round2((q ?? 0) * item.unitPrice);
  const estTotal = round2(item.qtyOrdered * item.unitPrice);
  const unitLbl = item.unit === 'KG' ? 'kg' : 'un';

  if (removed)
    return (
      <div className="flex items-center justify-between gap-3 rounded-card border border-dashed border-border px-4 py-3 text-sm">
        <span className="text-muted line-through truncate">{item.productName}</span>
        <Button size="sm" variant="ghost" icon={<Undo2 className="size-4" />} onClick={onRestore}>
          Desfazer
        </Button>
      </div>
    );

  const firstPick = plan?.picks[0]?.lot;
  const exp = firstPick ? expiryBadge(firstPick.expiryDate) : null;

  return (
    <div className={cn('rounded-card border bg-surface shadow-card p-4', q === null && weighable ? 'border-border-strong' : 'border-border')}>
      <div className="flex items-start gap-3">
        <span className="size-7 shrink-0 rounded-full bg-surface-2 text-muted text-xs font-semibold num flex items-center justify-center">{index}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold text-fg leading-snug">{item.productName}</div>
              <div className="text-xs text-muted num mt-0.5">
                {!isProduct && <span className="mr-1">{KIND_LABEL[item.kind]} ·</span>}
                Pedido {fmtQty(item.qtyOrdered, item.unit)} · {money(item.unitPrice)}/{unitLbl}
                {item.added && (
                  <Badge tone="info" size="xs" className="ml-1.5">
                    incluído agora
                  </Badge>
                )}
              </div>
            </div>
            {onRemove && (
              <IconButton label="Remover do pedido" size="sm" variant="danger" onClick={onRemove}>
                <Trash2 className="size-4" />
              </IconButton>
            )}
          </div>
          {item.notes?.trim() && (
            <div className="mt-2 flex gap-2 rounded-control bg-warning-soft px-2.5 py-2 text-sm text-fg">
              <MessageSquareText className="size-4 text-warning shrink-0 mt-0.5" />
              <span className="min-w-0">{item.notes}</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-start">
        <div>
          <div className="flex items-end gap-2">
            <Field label={weighable ? 'Peso real' : 'Quantidade'} className="flex-1">
              <WeightInput
                unit={item.unit}
                value={q}
                onChange={(v) => onChange({ ...line, qty: v })}
                placeholder={weighable ? '0,000' : undefined}
                className="[&_input]:h-14 [&_input]:text-2xl [&_input]:font-semibold [&_input]:pr-12 [&_input]:placeholder:font-normal [&_input]:placeholder:text-subtle/60"
                aria-label={`Peso real de ${item.productName}`}
              />
            </Field>
            {weighable && (
              <Button variant="subtle" className="h-14" icon={<Copy className="size-4" />} onClick={() => onChange({ ...line, qty: item.qtyOrdered })} title="Usar o peso do pedido">
                <span className="hidden min-[380px]:inline">Pedido</span>
              </Button>
            )}
          </div>
          <div className="mt-1.5 text-xs num min-h-4">
            {q === null ? (
              <span className="text-subtle">{weighable ? 'Aguardando pesagem' : 'Informe a quantidade'}</span>
            ) : q === 0 ? (
              <span className="text-danger font-medium">Não será enviado (0)</span>
            ) : !weighable && Math.abs(diff!) < 0.0005 ? (
              <span className="text-muted">{money(total)}</span>
            ) : (
              <span className={cn(Math.abs(diffPct) > 10 ? 'text-warning font-medium' : 'text-muted')}>
                {diff! > 0 ? '+' : ''}
                {fmtQty(diff, item.unit)} ({diff! > 0 ? '+' : ''}
                {percent(diffPct)}) · {money(total)}
                {Math.abs(total - estTotal) >= 0.01 && (
                  <span className={total > estTotal ? 'text-warning' : 'text-success'}>
                    {' '}
                    ({total > estTotal ? '+' : '−'}
                    {money(Math.abs(total - estTotal))})
                  </span>
                )}
              </span>
            )}
          </div>
        </div>

        {isProduct && (
          <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2">
            <Field label="Lote">
              <Select
                value={line.lotId || ''}
                onChange={(v) => onChange({ ...line, lotId: v || null })}
                options={[
                  { value: '', label: lots.length ? 'Automático (vence antes)' : 'Sem saldo em estoque' },
                  ...lots.map((l) => ({
                    value: l.id,
                    label: `${l.lotCode || l.batchCode || 'sem código'} · ${l.expiryDate ? `val. ${date(l.expiryDate)}` : 'sem val.'} · ${fmtQty(l.balanceQty, l.unit)}`,
                  })),
                ]}
              />
            </Field>
            <Field label="Pacotes">
              <NumberInput decimals={0} value={line.packages} onChange={(v) => onChange({ ...line, packages: v })} placeholder="—" />
            </Field>
            {plan && (q ?? 0) > 0 && (
              <div className="col-span-2 text-xs leading-relaxed">
                {plan.picks.length > 0 && (
                  <div className="text-muted">
                    Baixa:{' '}
                    {plan.picks.map((p, i) => (
                      <span key={p.lot.id} className="num">
                        {i > 0 && ' + '}
                        <span className="text-fg">{p.lot.lotCode || p.lot.batchCode || 'lote'}</span> {fmtQty(p.take, p.lot.unit)}
                      </span>
                    ))}
                    {exp && (
                      <Badge tone={exp.tone} size="xs" className="ml-1.5">
                        {exp.label}
                      </Badge>
                    )}
                  </div>
                )}
                {plan.short > 0.0005 && <div className="text-danger font-medium num">Falta {fmtQty(plan.short, item.unit)} no estoque</div>}
              </div>
            )}
          </div>
        )}
        {item.kind === 'SUPPLY' && plan && plan.short > 0.0005 && (q ?? 0) > 0 && (
          <div className="text-xs text-danger font-medium num sm:pt-6">Saldo do material insuficiente: falta {fmtQty(plan.short, item.unit)}</div>
        )}
      </div>
    </div>
  );
}
