/**
 * Formulário de venda reutilizável (nova venda, edição, duplicação, proposta).
 *   <SaleEditor initial={sale | seed} onSaved={(s) => …} />
 */
import { CheckCircle2, Save, Send, Zap } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOps, useSession } from '../../app/session';
import { useSettings } from '../../app/settings';
import { useAction, useTable } from '../../data/react';
import { money, round2 } from '../../domain/format';
import { calculateFreight } from '../../domain/freight';
import { SALE_STATUS } from '../../domain/labels';
import type { Customer, PriceTable, Product, Sale } from '../../domain/types';
import { Button, Combobox, DateInput, Field, FormGrid, Input, PercentInput, Switch, Textarea } from '../../ui';
import { useCustomerOptions, usePriceTableOptions, useProductWithStockOptions, useProfileOptions, useStockBalances } from '../common/lookups';
import { CustomerSection, type CreditInfo } from './editor/CustomerSection';
import { DeliverySection } from './editor/DeliverySection';
import { draftFromSale, draftFromSeed, draftToInput, emptyDraft, type Draft, type Line, type SaleDraftSeed } from './editor/draft';
import { ItemsSection, priceFor } from './editor/ItemsSection';
import { PaymentSection } from './editor/PaymentSection';
import { Section } from './editor/Section';
import { SummaryCard } from './editor/SummaryCard';
import { draftTotals, NO_CHARGE_METHODS } from './helpers';

export type { SaleDraftSeed } from './editor/draft';

const isSale = (x: unknown): x is Sale => !!x && typeof x === 'object' && 'number' in x && 'status' in x && 'id' in x;

function addressOf(c: Customer) {
  return [[c.street, c.number].filter(Boolean).join(', '), c.complement, c.district, [c.city, c.state].filter(Boolean).join('/')].filter(Boolean).join(' — ');
}

function reprice(lines: Line[], table: PriceTable | null, products: Map<string, Product>): Line[] {
  return lines.map((l) => {
    if (l.kind !== 'PRODUCT' || !l.productId) return l;
    const price = priceFor(table, products.get(l.productId));
    return price == null ? { ...l, refPrice: null } : { ...l, unitPrice: price, refPrice: price };
  });
}

export function SaleEditor({ initial, onSaved }: { initial?: Sale | SaleDraftSeed | null; onSaved?: (s: Sale) => void }) {
  const nav = useNavigate();
  const ops = useOps();
  const { can, profile } = useSession();
  const { settings } = useSettings();
  const isExternal = profile?.role === 'EXTERNAL_SELLER';
  const isSellerRole = profile?.role === 'SELLER' || isExternal;
  const canApprove = can('sales.approve');
  const canEditPrice = can('sales.editPrice');
  const canDirect = canApprove && can('picking.perform');

  const [draft, setDraft] = useState<Draft>(() => {
    if (isSale(initial)) return draftFromSale(initial);
    const d = initial ? draftFromSeed(initial) : emptyDraft();
    if (!d.sellerId && isSellerRole && profile) d.sellerId = profile.id;
    return d;
  });
  const patch = useCallback((p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p })), []);
  const setLines = useCallback((fn: (l: Line[]) => Line[]) => setDraft((d) => ({ ...d, lines: fn(d.lines) })), []);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  // ---- Dados ---------------------------------------------------------------
  const { options: customerOptions, customers } = useCustomerOptions({ sellerId: isExternal ? profile?.id : undefined });
  const { options: productOptions, products, byProduct } = useProductWithStockOptions();
  const { lots } = useStockBalances('FINISHED');
  const { tables } = usePriceTableOptions();
  const { options: sellerOptions, profiles } = useProfileOptions(['SELLER', 'MANAGER', 'ADMIN', 'EXTERNAL_SELLER']);
  const { rows: supplyRows } = useTable('supply_items');
  const { rows: zones } = useTable('freight_zones');
  const { rows: partyEntries } = useTable('financial_entries', { where: [['partyId', '==', draft.customerId || '-']] }, { enabled: !!draft.customerId });

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const supplies = useMemo(() => supplyRows.filter((s) => s.sellable && s.active), [supplyRows]);
  const customer = useMemo(() => customers.find((c) => c.id === draft.customerId) || null, [customers, draft.customerId]);
  const table = useMemo(() => tables.find((t) => t.id === draft.priceTableId) || null, [tables, draft.priceTableId]);

  // ---- Cliente: aplica padrões (tabela, pagamento, endereço, vendedor) -------
  const applyCustomer = useCallback(
    (c: Customer | null, d: Draft, onlyEmpty: boolean, payment = !onlyEmpty): Draft => {
      if (!c) return d;
      const next: Draft = { ...d, customerId: c.id };
      const custTable = c.priceTableId && tables.some((t) => t.id === c.priceTableId) ? c.priceTableId : null;
      if (!onlyEmpty || !next.priceTableId) next.priceTableId = custTable ?? next.priceTableId;
      const allowed = c.allowedPaymentMethods?.length ? c.allowedPaymentMethods : null;
      if (payment) {
        if (c.preferredPaymentMethod && (!allowed || allowed.includes(c.preferredPaymentMethod))) next.paymentMethod = c.preferredPaymentMethod;
        else if (allowed && !allowed.includes(next.paymentMethod)) next.paymentMethod = allowed[0];
        const terms = (c.paymentTerms || '').match(/\d+/g);
        next.termsMode = 'TERMS';
        next.paymentTerms = terms ? terms.join('/') : '';
      }
      if (!onlyEmpty || !next.shippingZipCode) next.shippingZipCode = c.zipCode || '';
      if (!onlyEmpty || !next.shippingAddress) next.shippingAddress = addressOf(c);
      if (!isSellerRole && (!onlyEmpty || !next.sellerId) && c.sellerId) next.sellerId = c.sellerId;
      next.channel = c.isIntercompany ? 'INTERCOMPANY' : next.channel === 'INTERCOMPANY' ? 'INTERNAL' : next.channel;
      next.company = c.isIntercompany ? next.company || (profile?.company && profile.company !== c.intercompanyCode ? profile.company : 'AURUS') : null;
      const t = tables.find((x) => x.id === next.priceTableId) || null;
      if (!onlyEmpty) next.lines = reprice(next.lines, t, productMap);
      return next;
    },
    [tables, productMap, isSellerRole, profile?.company],
  );

  const onCustomer = (id: string | null) => {
    const c = customers.find((x) => x.id === id) || null;
    setDraft((d) => (c ? applyCustomer(c, d, false) : { ...d, customerId: null }));
  };

  const onPriceTable = (id: string | null) => {
    const t = tables.find((x) => x.id === id) || null;
    setDraft((d) => ({ ...d, priceTableId: id, lines: reprice(d.lines, t, productMap) }));
  };

  // Formulário aberto com cliente (?cliente= / duplicar / proposta): aplica padrões uma vez.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || draft.id || !draft.customerId || !customers.length || !tables.length || !products.length) return;
    seeded.current = true;
    const c = customers.find((x) => x.id === draft.customerId) || null;
    const hasPayment = !!(initial && !isSale(initial) && initial.paymentMethod);
    setDraft((d) => {
      const n = applyCustomer(c, d, true, !hasPayment);
      const t = tables.find((x) => x.id === n.priceTableId) || null;
      // Itens vindos de outro pedido/proposta: mantém o preço, marca o de tabela como referência.
      n.lines = n.lines.map((l) => (l.kind === 'PRODUCT' && l.productId && l.refPrice == null ? { ...l, refPrice: priceFor(t, productMap.get(l.productId)) } : l));
      return n;
    });
  }, [customers, tables, products, draft.id, draft.customerId, applyCustomer, initial, productMap]);

  // ---- Comissão ------------------------------------------------------------
  const sellerProfile = profiles.find((p) => p.id === draft.sellerId);
  const noCharge = NO_CHARGE_METHODS.includes(draft.paymentMethod);
  const effRate = noCharge ? 0 : draft.commissionTouched && draft.commissionRate != null ? draft.commissionRate : draft.sellerId ? sellerProfile?.commissionRate ?? settings.defaultCommissionRate ?? 0 : 0;

  // ---- Totais e frete ------------------------------------------------------
  const pickupOrPending = draft.deliveryMode === 'PICKUP' || draft.freightMode === 'PENDING';
  const itemsOnly = draftTotals(draft.lines, 0, 0, 0);
  const freight = useMemo(
    () =>
      calculateFreight(draft.deliveryMode, draft.shippingZipCode, itemsOnly.subtotal, {
        zones,
        freeAbove: settings.freeFreightAbove ?? null,
        pickupEnabled: settings.pickupEnabled,
      }),
    [draft.deliveryMode, draft.shippingZipCode, itemsOnly.subtotal, zones, settings.freeFreightAbove, settings.pickupEnabled],
  );
  useEffect(() => {
    if (draft.freightMode !== 'ZONE' || draft.deliveryMode !== 'DELIVERY') return;
    const zoneId = 'zone' in freight ? freight.zone.id : null;
    if (draft.freightValue !== freight.value || draft.freightZoneId !== zoneId) patch({ freightValue: freight.value, freightZoneId: zoneId });
  }, [freight, draft.freightMode, draft.deliveryMode, draft.freightValue, draft.freightZoneId, patch]);

  const totals = draftTotals(draft.lines, pickupOrPending ? 0 : draft.freightValue, draft.discountValue, effRate);

  // ---- Crédito -------------------------------------------------------------
  const credit = useMemo<CreditInfo>(() => {
    const open = round2(
      partyEntries
        .filter((e) => e.direction === 'IN' && e.status === 'OPEN' && (!draft.id || e.saleId !== draft.id))
        .reduce((s, e) => s + (e.amount - (e.paidAmount || 0)), 0),
    );
    const limit = customer?.creditLimit || 0;
    const exposure = round2(open + (noCharge ? 0 : totals.total));
    return { open, limit, exposure, exceeded: limit > 0 && exposure > limit + 0.005 };
  }, [partyEntries, draft.id, customer?.creditLimit, noCharge, totals.total]);

  // ---- Validação -----------------------------------------------------------
  const errors: Record<string, string> = {};
  const withQty = draft.lines.filter((l) => (l.qtyOrdered || 0) > 0);
  if (!draft.customerId) errors.customer = 'Selecione o cliente.';
  else if (customer?.status === 'BLOCKED') errors.customer = 'Cliente bloqueado — não é possível vender.';
  if (!withQty.length) errors.items = 'Inclua pelo menos um item com quantidade.';
  for (const l of draft.lines) {
    if (!(l.qtyOrdered > 0)) errors[l.key] = 'Informe a quantidade (ou remova o item).';
    else if (isExternal && l.kind === 'PRODUCT' && !l.notes?.trim()) errors[l.key] = 'Observação de corte obrigatória para a logística.';
  }
  const allowed = customer?.allowedPaymentMethods?.length ? customer.allowedPaymentMethods : null;
  if (allowed && !allowed.includes(draft.paymentMethod)) errors.payment = 'Forma de pagamento não liberada para este cliente.';
  if (draft.discountValue > totals.subtotal + totals.freight + 0.005) errors.discount = 'O desconto é maior que o valor do pedido.';
  const blocking = Object.keys(errors).length > 0;

  const overStock = draft.lines.filter((l) => l.kind === 'PRODUCT' && l.productId && l.qtyOrdered > (byProduct.get(l.productId)?.qty ?? 0) + 0.0005);
  const issues: { tone: 'danger' | 'warning'; text: string }[] = [];
  if (showErrors) {
    const seen = new Set<string>();
    Object.values(errors).forEach((t) => !seen.has(t) && (seen.add(t), issues.push({ tone: 'danger', text: t })));
  }
  if (customer && customer.financialApproval !== 'APPROVED') issues.push({ tone: 'warning', text: 'Crédito do cliente não aprovado pelo financeiro.' });
  if (credit.exceeded) issues.push({ tone: 'warning', text: `Limite de crédito excedido em ${money(credit.exposure - credit.limit)}.` });
  if (overStock.length) issues.push({ tone: 'warning', text: `${overStock.length} item(ns) acima do saldo em estoque.` });
  if (draft.deliveryMode === 'DELIVERY' && draft.freightMode === 'ZONE' && freight.kind === 'BELOW_MINIMUM') issues.push({ tone: 'warning', text: freight.label });

  // ---- Salvar --------------------------------------------------------------
  type Mode = 'DRAFT' | 'SUBMIT' | 'APPROVE' | 'KEEP';
  const save = useAction(
    async (mode: Mode): Promise<Sale> => {
      setShowErrors(true);
      if (blocking) throw new Error(Object.values(errors)[0]);
      const status = mode === 'DRAFT' ? 'DRAFT' : mode === 'SUBMIT' ? 'PENDING_APPROVAL' : mode === 'APPROVE' ? 'APPROVED' : undefined;
      const input = { ...draftToInput(draft, status), commissionRate: effRate };
      if (!draft.id) return ops.createSale(input);
      let s = await ops.updateSale(draft.id, input);
      if (mode === 'SUBMIT' && s.status === 'DRAFT') {
        await ops.submitSale(s.id);
        s = { ...s, status: 'PENDING_APPROVAL' };
      }
      if (mode === 'APPROVE' && (s.status === 'DRAFT' || s.status === 'PENDING_APPROVAL')) {
        await ops.approveSale(s.id);
        s = { ...s, status: 'APPROVED' };
      }
      return s;
    },
    {
      success: (s) => `Pedido ${s.number} salvo — ${SALE_STATUS[s.status]?.label.toLowerCase()}`,
      onSuccess: (s) => (onSaved ? onSaved(s) : nav(`/vendas/${s.id}`)),
    },
  );

  const conditionLabel = noCharge
    ? 'sem cobrança'
    : draft.termsMode === 'TERMS'
      ? draft.paymentTerms.trim()
        ? `${draft.paymentTerms} dias`
        : 'à vista'
      : `${draft.installmentsCount}x mensal`;

  const editing = !!draft.id;
  const primary = (() => {
    if (!editing && draft.deductNow) return { mode: 'APPROVE' as Mode, label: 'Concluir venda direta', icon: <Zap className="size-4" /> };
    if (editing) return { mode: 'KEEP' as Mode, label: 'Salvar alterações', icon: <Save className="size-4" /> };
    if (canApprove) return { mode: 'APPROVE' as Mode, label: 'Salvar e aprovar', icon: <CheckCircle2 className="size-4" /> };
    return { mode: 'SUBMIT' as Mode, label: 'Enviar para aprovação', icon: <Send className="size-4" /> };
  })();
  const secondary: { mode: Mode; label: string }[] = [];
  if (!editing && !draft.deductNow) {
    if (canApprove) secondary.push({ mode: 'SUBMIT', label: 'Enviar para aprovação' });
    secondary.push({ mode: 'DRAFT', label: 'Salvar rascunho' });
  }
  if (editing && canApprove && (draft.status === 'DRAFT' || draft.status === 'PENDING_APPROVAL')) secondary.push({ mode: 'APPROVE', label: 'Salvar e aprovar' });
  if (editing && draft.status === 'DRAFT') secondary.push({ mode: 'SUBMIT', label: 'Salvar e enviar para aprovação' });

  const actionButtons = (
    <>
      <Button variant="primary" size="lg" block icon={primary.icon} loading={save.running} onClick={() => void save.run(primary.mode)}>
        {primary.label}
      </Button>
      {secondary.map((b) => (
        <Button key={b.mode} variant="secondary" block disabled={save.running} onClick={() => void save.run(b.mode)}>
          {b.label}
        </Button>
      ))}
    </>
  );

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
      <div className="space-y-4 min-w-0">
        <CustomerSection
          draft={draft}
          patch={patch}
          onCustomer={onCustomer}
          onPriceTable={onPriceTable}
          options={customerOptions}
          customers={customers}
          customer={customer}
          tables={tables}
          credit={credit}
        />
        <ItemsSection
          lines={draft.lines}
          setLines={setLines}
          productOptions={productOptions}
          products={products}
          byProduct={byProduct}
          lots={lots}
          supplies={supplies}
          table={table}
          canEditPrice={canEditPrice}
          notesRequired={isExternal}
          focusKey={focusKey}
          onAdded={setFocusKey}
          errors={showErrors ? errors : {}}
        />
        <DeliverySection draft={draft} patch={patch} settings={settings} freight={freight} />
        <PaymentSection draft={draft} patch={patch} customer={customer} subtotal={totals.subtotal} total={totals.total} error={showErrors ? errors.payment : undefined} />
        <Section step={5} title="Vendedor e observações">
          <FormGrid cols={3}>
            <Field label="Data do pedido" required>
              <DateInput value={draft.date} onChange={(v) => patch({ date: v })} />
            </Field>
            <Field label="Vendedor">
              {isExternal ? (
                <Input value={profile?.name || ''} disabled />
              ) : (
                <Combobox value={draft.sellerId} onChange={(v) => patch({ sellerId: v })} options={sellerOptions} placeholder="Sem vendedor" allowClear />
              )}
            </Field>
            <Field label="Comissão" hint={`${money(totals.commission)} sobre ${money(totals.subtotal)}`}>
              <PercentInput value={effRate} onChange={(v) => patch({ commissionRate: v ?? 0, commissionTouched: true })} disabled={!canApprove || noCharge} />
            </Field>
            <Field label="Observações para o cliente" span="full" hint="Saem no PDF do pedido.">
              <Textarea rows={2} value={draft.customerNotes} onChange={(e) => patch({ customerNotes: e.target.value })} />
            </Field>
            <Field label="Observações internas" span="full" hint="Visíveis só para a equipe (separação, financeiro).">
              <Textarea rows={2} value={draft.notes} onChange={(e) => patch({ notes: e.target.value })} />
            </Field>
          </FormGrid>
          {canDirect && !editing && (
            <div className="rounded-card border border-border p-3">
              <Switch
                checked={draft.deductNow}
                onChange={(v) => patch({ deductNow: v })}
                label="Venda direta (baixa agora)"
                description="Balcão/retirada imediata: aprova, baixa o estoque (FIFO) e o pedido já nasce separado."
              />
            </div>
          )}
        </Section>

        {/* Celular: resumo completo no fim */}
        <SummaryCard
          className="lg:hidden"
          title={editing ? `Pedido ${draft.number}` : 'Nova venda'}
          customerName={customer?.name}
          itemsCount={withQty.length}
          totals={totals}
          commissionRate={effRate}
          paymentMethod={draft.paymentMethod}
          conditionLabel={conditionLabel}
          freightPending={draft.deliveryMode === 'DELIVERY' && draft.freightMode === 'PENDING'}
          issues={issues}
          actions={actionButtons}
        />
      </div>

      <div className="hidden lg:block lg:sticky lg:top-4">
        <SummaryCard
          title={editing ? `Pedido ${draft.number}` : 'Nova venda'}
          customerName={customer?.name}
          itemsCount={withQty.length}
          totals={totals}
          commissionRate={effRate}
          paymentMethod={draft.paymentMethod}
          conditionLabel={conditionLabel}
          freightPending={draft.deliveryMode === 'DELIVERY' && draft.freightMode === 'PENDING'}
          issues={issues}
          actions={actionButtons}
        />
      </div>

      {/* Celular: barra fixa com total */}
      <div className="lg:hidden sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-surface border-t border-border shadow-pop flex items-center gap-3 z-10">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-muted">Total · {withQty.length} itens</div>
          <div className="num font-semibold text-fg text-lg leading-tight">{money(totals.total)}</div>
        </div>
        <Button variant="primary" icon={primary.icon} loading={save.running} onClick={() => void save.run(primary.mode)}>
          {primary.label.replace('Enviar para aprovação', 'Enviar')}
        </Button>
      </div>
    </div>
  );
}
