/**
 * Carrinho e fechamento do pedido: entrega × retirada, frete ao vivo,
 * janela de entrega, observações e envio (ops.submitPortalOrder).
 */
import { ArrowLeft, CheckCircle2, MapPin, ShoppingBag, Store, Trash2, Truck } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePortalSession } from '../../../app/session';
import { useSettings } from '../../../app/settings';
import { useAction, useTable } from '../../../data/react';
import { describeWindow, resolveDeliveryWindow } from '../../../domain/delivery';
import { formatCep, money, onlyDigits, round2 } from '../../../domain/format';
import { calculateFreight, canSubmitWithFreight, type FreightResult } from '../../../domain/freight';
import type { Sale } from '../../../domain/types';
import { Button, Callout, Card, cn, EmptyState, Field, IconButton, Progress, Textarea } from '../../../ui';
import { addressLine, freightSettingsOf, scheduleOf, unitShort } from '../lib';
import { resolveCart, useCart } from './cart';
import { useCatalog } from './CatalogView';
import { AddressFields } from './AddressFields';
import { ProductImage, QtyStepper } from './parts';

interface Addr {
  zipCode: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
}

export function CartView() {
  const { account, ops } = usePortalSession();
  const { settings } = useSettings();
  const { items, loading } = useCatalog();
  const { rows: zones } = useTable('freight_zones');
  const cart = useCart();
  const nav = useNavigate();
  const { rows, missing, subtotal } = resolveCart(cart.lines, items);

  const [mode, setMode] = useState<'DELIVERY' | 'PICKUP'>('DELIVERY');
  const [addr, setAddr] = useState<Addr>(() => ({
    zipCode: formatCep(account?.zipCode),
    street: account?.street || '',
    number: account?.number || '',
    complement: account?.complement || '',
    district: account?.district || '',
    city: account?.city || '',
    state: account?.state || '',
  }));
  const [notes, setNotes] = useState('');
  const [editAddr, setEditAddr] = useState(() => !(account?.zipCode && account?.street && account?.number && account?.city));
  const [done, setDone] = useState<Sale | null>(null);

  // Itens que saíram do catálogo são retirados do carrinho.
  useEffect(() => {
    if (!loading && missing.length) missing.forEach((id) => cart.setQty(id, 0));
  }, [loading, missing, cart]);

  const effectiveMode = settings.pickupEnabled ? mode : 'DELIVERY';
  const freight = useMemo(
    () => calculateFreight(effectiveMode, addr.zipCode, subtotal, freightSettingsOf(zones, settings)),
    [effectiveMode, addr.zipCode, subtotal, zones, settings],
  );
  const cepOk = onlyDigits(addr.zipCode).length === 8;
  const win = useMemo(() => resolveDeliveryWindow(new Date(), scheduleOf(settings)), [settings]);
  const total = round2(subtotal + (freight.kind === 'CHARGED' ? freight.value : 0));
  const addrMissing = effectiveMode === 'DELIVERY' && (!cepOk || !addr.street.trim() || !addr.number.trim() || !addr.city.trim());

  const submit = useAction(
    async () => {
      if (!ops) throw new Error('Sessão expirada — entre novamente.');
      if (!rows.length) throw new Error('Seu carrinho está vazio.');
      if (addrMissing) throw new Error('Complete o endereço de entrega (CEP, rua, número e cidade).');
      if (!canSubmitWithFreight(freight)) throw new Error(freight.label);
      return ops.submitPortalOrder({
        items: rows.map((r) => ({ catalogItemId: r.item.id, qty: r.qty })),
        deliveryMode: effectiveMode,
        zipCode: effectiveMode === 'DELIVERY' ? onlyDigits(addr.zipCode) : null,
        address: effectiveMode === 'DELIVERY' ? addressLine(addr) : null,
        notes: notes.trim() || null,
      });
    },
    {
      onSuccess: (sale) => {
        cart.clear();
        setDone(sale);
        window.scrollTo({ top: 0 });
      },
    },
  );

  if (done) return <OrderPlaced sale={done} onTrack={() => nav(`/portal/pedidos/${done.id}`)} />;

  if (!loading && !rows.length) {
    return (
      <EmptyState
        className="py-20"
        icon={<ShoppingBag className="size-5" />}
        title="Seu carrinho está vazio"
        description="Escolha os cortes no catálogo e eles aparecem aqui."
        action={
          <Link to="/portal">
            <Button variant="primary">Ver catálogo</Button>
          </Link>
        }
      />
    );
  }

  const freightLabel =
    freight.kind === 'PICKUP' ? 'Retirada' : freight.kind === 'FREE' ? 'Grátis' : freight.kind === 'ON_REQUEST' || !cepOk ? 'A combinar' : money(freight.value);
  const blocked = !canSubmitWithFreight(freight);

  return (
    <div className="pb-36 sm:pb-0">
      <Link to="/portal" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg mb-3">
        <ArrowLeft className="size-3.5" /> Continuar comprando
      </Link>
      <h1 className="font-display text-2xl sm:text-3xl font-semibold text-fg mb-5">Seu pedido</h1>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          {/* Itens */}
          <Card padded={false}>
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li key={r.item.id} className="flex gap-3 p-3 sm:p-4">
                  <div className="size-16 sm:size-20 rounded-control overflow-hidden bg-surface-2 shrink-0">
                    <ProductImage item={r.item} compact />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-fg leading-snug">{r.item.name}</div>
                        <div className="text-xs text-muted num">
                          {money(r.item.price)}/{unitShort(r.item.unit)}
                        </div>
                      </div>
                      <IconButton label={`Remover ${r.item.name}`} size="sm" variant="danger" onClick={() => cart.setQty(r.item.id, 0)} className="-mr-1 -mt-1">
                        <Trash2 className="size-4" />
                      </IconButton>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <QtyStepper size="sm" item={r.item} value={r.qty} onChange={(v) => cart.setQty(r.item.id, v)} className="w-36" />
                      <div className="text-right">
                        <div className="text-sm font-semibold text-fg num">{money(r.total)}</div>
                        {r.item.unit === 'KG' && <div className="text-[10px] text-subtle">estimado</div>}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          {/* Entrega */}
          <Card>
            <h2 className="text-[15px] font-semibold text-fg mb-3">Como você quer receber?</h2>
            <div className={cn('grid gap-2', settings.pickupEnabled ? 'grid-cols-2' : 'grid-cols-1')}>
              <ModeOption active={effectiveMode === 'DELIVERY'} onClick={() => setMode('DELIVERY')} icon={<Truck />} title="Entrega" text="No seu endereço" />
              {settings.pickupEnabled && (
                <ModeOption active={effectiveMode === 'PICKUP'} onClick={() => setMode('PICKUP')} icon={<Store />} title="Retirada" text="Sem frete" />
              )}
            </div>

            {effectiveMode === 'DELIVERY' && !editAddr ? (
              <div className="mt-4 flex items-start gap-3 rounded-control bg-surface-2 border border-border p-3">
                <MapPin className="size-4 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="text-fg">{addressLine(addr)}</div>
                  <div className="text-xs text-muted num mt-0.5">CEP {addr.zipCode}</div>
                </div>
                <Button size="xs" variant="ghost" onClick={() => setEditAddr(true)}>
                  Alterar
                </Button>
              </div>
            ) : effectiveMode === 'DELIVERY' ? (
              <div className="mt-4">
                <AddressFields value={addr} onChange={(patch) => setAddr((a) => ({ ...a, ...patch }))} />
              </div>
            ) : (
              <div className="mt-4 flex gap-3 rounded-control bg-surface-2 border border-border p-3">
                <MapPin className="size-4 text-primary shrink-0 mt-0.5" />
                <div className="text-sm">
                  <div className="text-fg">{settings.pickupAddress || 'Endereço de retirada informado pela nossa equipe na confirmação.'}</div>
                  {settings.pickupNote && <div className="text-xs text-muted mt-1">{settings.pickupNote}</div>}
                </div>
              </div>
            )}

            <div className="mt-4 space-y-3">
              <FreightNotice result={freight} cepOk={cepOk} subtotal={subtotal} freeAbove={settings.freeFreightAbove ?? null} />
              <Callout tone="info" title={effectiveMode === 'PICKUP' ? 'Retirada' : 'Entrega'}>
                {describeWindow(win)}
              </Callout>
            </div>
          </Card>

          <Card>
            <Field label="Observações para a nossa equipe" hint="Ex.: cortar em bifes de 2 cm, embalar a vácuo, horário de recebimento.">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={500} />
            </Field>
          </Card>
        </div>

        {/* Resumo */}
        <Card className="lg:sticky lg:top-24">
          <h2 className="text-[15px] font-semibold text-fg mb-3">Resumo</h2>
          <dl className="space-y-2 text-sm">
            <Row label={`Produtos (${rows.length})`} value={money(subtotal)} />
            <Row label="Frete" value={freightLabel} />
            <Row label={effectiveMode === 'PICKUP' ? 'Retirada' : 'Entrega prevista'} value={win.deliveryLabel} />
            <div className="border-t border-border pt-2 mt-2 flex items-baseline justify-between">
              <dt className="font-semibold text-fg">Total estimado</dt>
              <dd className="text-xl font-semibold text-fg num">{money(total)}</dd>
            </div>
          </dl>
          <p className="text-xs text-muted mt-3 leading-relaxed">
            O valor final é confirmado na pesagem. Depois de pesado, você recebe o Pix para pagamento aqui no portal.
          </p>
          <Button className="mt-4 max-sm:hidden" variant="primary" size="lg" block loading={submit.running} disabled={blocked} onClick={() => void submit.run()}>
            Enviar pedido
          </Button>
        </Card>
      </div>

      {/* Barra fixa (celular) */}
      <div className="sm:hidden fixed left-0 right-0 bottom-[64px] z-30 border-t border-border bg-surface/95 backdrop-blur px-4 py-3 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-muted">Total estimado</div>
          <div className="text-lg font-semibold text-fg num leading-tight">{money(total)}</div>
        </div>
        <Button variant="primary" size="lg" loading={submit.running} disabled={blocked} onClick={() => void submit.run()}>
          Enviar pedido
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-fg num">{value}</dd>
    </div>
  );
}

function ModeOption({ active, onClick, icon, title, text }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; text: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-3 rounded-control border p-3 text-left transition-colors cursor-pointer',
        active ? 'border-primary bg-primary-soft' : 'border-border-strong bg-surface hover:bg-surface-2',
      )}
    >
      <span className={cn('size-9 rounded-full flex items-center justify-center shrink-0 [&>svg]:size-4.5', active ? 'bg-primary text-primary-fg' : 'bg-surface-2 text-muted')}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-fg">{title}</span>
        <span className="block text-xs text-muted">{text}</span>
      </span>
    </button>
  );
}

function FreightNotice({ result, cepOk, subtotal, freeAbove }: { result: FreightResult; cepOk: boolean; subtotal: number; freeAbove: number | null }) {
  if (result.kind === 'PICKUP') return null;
  if (!cepOk) return <Callout tone="info">Informe o CEP para calcular o frete.</Callout>;
  if (result.kind === 'BELOW_MINIMUM') {
    const min = result.zone.minOrderValue;
    return (
      <Callout
        tone="warning"
        title={`Faltam ${money(result.missing)} para o pedido mínimo`}
        action={
          <Link to="/portal" className="text-xs font-medium text-primary hover:underline whitespace-nowrap">
            Adicionar itens
          </Link>
        }
      >
        <span>
          O pedido mínimo para {result.zone.label} é {money(min)}.
        </span>
        <Progress className="mt-2" value={subtotal} max={min} tone="warning" />
      </Callout>
    );
  }
  if (result.kind === 'ON_REQUEST') return <Callout tone="info" title="Frete a combinar">{result.label}.</Callout>;
  if (result.kind === 'FREE') return <Callout tone="success" title={result.label} />;
  const missingFree = freeAbove && freeAbove > subtotal ? round2(freeAbove - subtotal) : 0;
  return (
    <Callout tone="success" title={`Frete ${money(result.value)} · ${result.zone.label}`}>
      {result.zone.etaNote && <span className="block">{result.zone.etaNote}</span>}
      {missingFree > 0 && (
        <span className="block mt-1">
          Faltam <strong className="num">{money(missingFree)}</strong> para ganhar frete grátis.
        </span>
      )}
    </Callout>
  );
}

function OrderPlaced({ sale, onTrack }: { sale: Sale; onTrack: () => void }) {
  return (
    <div className="max-w-lg mx-auto text-center py-10 sm:py-16 anim-pop">
      <div className="mx-auto size-16 rounded-full bg-success-soft text-success flex items-center justify-center mb-5">
        <CheckCircle2 className="size-8" />
      </div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Pedido nº {sale.number}</div>
      <h1 className="font-display text-2xl sm:text-3xl font-semibold text-fg mt-1">Pedido enviado!</h1>
      <p className="text-sm text-muted mt-2">
        Total estimado de <strong className="text-fg num">{money(sale.totalValue)}</strong>
        {sale.deliveryDate && (
          <>
            {' '}
            · {sale.deliveryMode === 'PICKUP' ? 'retirada' : 'entrega'} prevista para <strong className="text-fg">{new Date(sale.deliveryDate + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}</strong>
          </>
        )}
        .
      </p>
      <ol className="mt-8 text-left space-y-3">
        {[
          ['Confirmação', 'Nossa equipe confere o pedido' + (sale.freightPending ? ' e informa o valor do frete.' : '.')],
          ['Pesagem', 'Separamos e pesamos cada peça. Se o valor passar do combinado, pedimos sua confirmação.'],
          ['Pagamento', 'O Pix com o valor final aparece no pedido. É só pagar e enviar o comprovante.'],
        ].map(([t, d], i) => (
          <li key={t} className="flex gap-3 rounded-card border border-border bg-surface p-3">
            <span className="size-7 rounded-full bg-primary-soft text-primary text-xs font-semibold flex items-center justify-center shrink-0 num">{i + 1}</span>
            <div>
              <div className="text-sm font-semibold text-fg">{t}</div>
              <div className="text-xs text-muted mt-0.5">{d}</div>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-8 flex flex-col sm:flex-row gap-2 justify-center">
        <Button variant="primary" size="lg" onClick={onTrack}>
          Acompanhar pedido
        </Button>
        <Link to="/portal">
          <Button size="lg" block>
            Voltar ao catálogo
          </Button>
        </Link>
      </div>
    </div>
  );
}
