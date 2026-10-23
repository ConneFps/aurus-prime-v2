/**
 * Montagem de proposta rápida (cliente ou prospect) → PDF, WhatsApp, pedido.
 */
import { ArrowRight, Copy, FileDown, ListPlus, MessageCircle, RotateCcw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../../app/session';
import { useSettings } from '../../../app/settings';
import { useAction, useTable } from '../../../data/react';
import { date, money, number, round2 } from '../../../domain/format';
import type { Sale } from '../../../domain/types';
import {
  Button,
  Callout,
  Card,
  CardHeader,
  Combobox,
  DateInput,
  Divider,
  EmptyState,
  Field,
  FormGrid,
  IconButton,
  Input,
  MaskedInput,
  MoneyInput,
  PercentInput,
  Segmented,
  Select,
  Switch,
  Textarea,
  toast,
  WeightInput,
  type ComboOption,
} from '../../../ui';
import { useCustomerOptions, usePriceTableOptions, useProductOptions } from '../../common/lookups';
import { newKey } from '../editor/draft';
import { copyToClipboard, whatsappLink } from '../helpers';
import { PixBox } from '../PixBox';
import { emptyProposal, proposalMessage, proposalPdf, proposalPix, proposalToSaleItems, proposalTotals, recipientOf, type Proposal, type ProposalLine } from './proposal';

export function ProposalBuilder() {
  const nav = useNavigate();
  const { can, profile } = useSession();
  const { settings } = useSettings();
  const canEditPrice = can('sales.editPrice');
  const { options: customerOptions, customers } = useCustomerOptions({ onlyActive: true });
  const { tables, options: tableOptions } = usePriceTableOptions();
  const { products, options: productOptions } = useProductOptions({ onlyActive: true });
  const { rows: sales } = useTable('sales');
  const [p, setP] = useState<Proposal>(emptyProposal);
  const patch = (x: Partial<Proposal>) => setP((cur) => ({ ...cur, ...x }));
  const setLine = (key: string, x: Partial<ProposalLine>) => setP((cur) => ({ ...cur, lines: cur.lines.map((l) => (l.key === key ? { ...l, ...x } : l)) }));

  const customer = customers.find((c) => c.id === p.customerId) || null;
  const table = tables.find((t) => t.id === p.priceTableId) || null;
  const productMap = useMemo(() => new Map(products.map((x) => [x.id, x])), [products]);
  const t = proposalTotals(p, settings);
  const recipient = recipientOf(p, customer);

  const itemOptions = useMemo<ComboOption[]>(() => {
    if (!table) return productOptions;
    const price = new Map(table.items.map((i) => [i.productId, i]));
    return productOptions
      .filter((o) => price.has(o.value))
      .map((o) => ({ ...o, right: `${money(price.get(o.value)!.price)}/${price.get(o.value)!.unit === 'KG' ? 'kg' : 'un'}` }));
  }, [table, productOptions]);

  const recentSales = useMemo<ComboOption[]>(
    () =>
      sales
        .filter((s) => s.status !== 'CANCELLED' && s.status !== 'REJECTED')
        .sort((a, b) => b.number.localeCompare(a.number))
        .slice(0, 300)
        .map((s) => ({ value: s.id, label: `${s.number} — ${s.customerName}`, description: `${date(s.date)} · ${money(s.totalValue)}` })),
    [sales],
  );

  const priceOf = (productId: string) => {
    const it = table?.items.find((i) => i.productId === productId);
    return it ? it.price : productMap.get(productId)?.defaultPrice ?? 0;
  };

  const addProduct = (id: string | null) => {
    const pr = id ? productMap.get(id) : undefined;
    if (!pr) return;
    if (p.lines.some((l) => l.productId === pr.id)) return toast.info(`${pr.name} já está na proposta.`);
    const price = priceOf(pr.id);
    patch({ lines: [...p.lines, { key: newKey(), productId: pr.id, name: pr.name, unit: pr.unit, qty: null, price, refPrice: price, category: pr.category }] });
  };

  const addWholeTable = () => {
    if (!table) return;
    const have = new Set(p.lines.map((l) => l.productId));
    const extra = table.items
      .filter((i) => !have.has(i.productId))
      .map((i) => ({ key: newKey(), productId: i.productId, name: i.productName, unit: i.unit, qty: null, price: i.price, refPrice: i.price, category: productMap.get(i.productId)?.category }));
    extra.sort((a, b) => (a.category || '').localeCompare(b.category || '', 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'));
    patch({ lines: [...p.lines, ...extra] });
  };

  const onCustomer = (id: string | null) => {
    const c = customers.find((x) => x.id === id);
    const tableId = c?.priceTableId && tables.some((x) => x.id === c.priceTableId) ? c.priceTableId : p.priceTableId;
    patch({
      customerId: id,
      priceTableId: tableId,
      paymentConditions: c?.paymentTerms ? `Boleto ${c.paymentTerms}` : p.paymentConditions,
    });
  };

  const loadSale = (id: string | null) => {
    const s = sales.find((x) => x.id === id) as Sale | undefined;
    if (!s) return;
    const freightItems = (s.items || []).filter((i) => i.kind === 'FREIGHT').reduce((a, i) => a + i.total, 0);
    setP((cur) => ({
      ...cur,
      target: 'CUSTOMER',
      customerId: s.customerId,
      priceTableId: s.priceTableId ?? cur.priceTableId,
      freight: round2(s.freightValue || freightItems),
      discountPct: s.itemsSubtotal ? round2((s.discountValue / s.itemsSubtotal) * 100) : 0,
      paymentConditions: s.paymentTerms ? `${s.paymentMethod === 'BOLETO' ? 'Boleto' : 'Prazo'} ${s.paymentTerms} dias` : cur.paymentConditions,
      lines: (s.items || [])
        .filter((i) => i.kind === 'PRODUCT' || i.kind === 'SUPPLY')
        .map((i) => ({
          key: newKey(),
          productId: i.productId,
          supplyItemId: i.supplyItemId,
          name: i.productName,
          unit: i.unit,
          qty: i.qty,
          price: i.unitPrice,
          refPrice: i.unitPrice,
          category: i.productId ? productMap.get(i.productId)?.category : 'Material',
        })),
    }));
    toast.success(`Itens do pedido ${s.number} carregados`);
  };

  const pdf = useAction(() => proposalPdf(p, settings, recipient, profile?.name));
  const message = () => proposalMessage(p, settings, recipient);
  const valid = p.lines.length > 0 && (p.target === 'CUSTOMER' ? !!p.customerId : !!p.prospectName.trim());

  const convert = () => {
    const pixAsDiscount = p.includePix && t.pixDiscount > 0;
    nav('/vendas/nova', {
      state: {
        seed: {
          customerId: p.customerId,
          priceTableId: p.priceTableId,
          items: proposalToSaleItems(p),
          freightValue: p.freight || null,
          discountValue: round2(t.discount + (pixAsDiscount ? t.pixDiscount : 0)) || null,
          paymentMethod: pixAsDiscount ? 'PIX' : undefined,
          customerNotes: p.notes || null,
        },
        from: `Convertido de proposta (válida até ${date(p.validUntil)}) — confira quantidades e condições.`,
      },
    });
  };

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
      <div className="space-y-4 min-w-0">
        <Card className="space-y-4">
          <CardHeader
            title="Destinatário"
            subtitle="Cliente cadastrado ou prospect (nome livre)."
            className="mb-0"
            actions={
              <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => setP(emptyProposal())}>
                Nova
              </Button>
            }
          />
          <Segmented
            value={p.target}
            onChange={(v) => patch({ target: v })}
            options={[
              { value: 'CUSTOMER', label: 'Cliente cadastrado' },
              { value: 'PROSPECT', label: 'Prospect' },
            ]}
          />
          {p.target === 'CUSTOMER' ? (
            <Field label="Cliente" required>
              <Combobox value={p.customerId} onChange={onCustomer} options={customerOptions} placeholder="Buscar cliente…" />
            </Field>
          ) : (
            <FormGrid cols={3}>
              <Field label="Nome / empresa" required>
                <Input value={p.prospectName} onChange={(e) => patch({ prospectName: e.target.value })} placeholder="Ex.: Restaurante Sabor da Serra" />
              </Field>
              <Field label="WhatsApp">
                <MaskedInput mask="phone" value={p.prospectPhone} onChange={(v) => patch({ prospectPhone: v })} />
              </Field>
              <Field label="E-mail">
                <Input type="email" value={p.prospectEmail} onChange={(e) => patch({ prospectEmail: e.target.value })} />
              </Field>
            </FormGrid>
          )}
          <FormGrid>
            <Field label="Tabela de preço">
              <Select value={p.priceTableId || ''} onChange={(v) => patch({ priceTableId: v || null })} placeholder="Preço do cadastro" options={tableOptions.map((o) => ({ value: o.value, label: o.label }))} />
            </Field>
            <Field label="Copiar itens de um pedido" hint="Refaz o resumo de um pedido existente (com desconto e Pix).">
              <Combobox value={null} onChange={loadSale} options={recentSales} placeholder="Buscar pedido…" />
            </Field>
          </FormGrid>
        </Card>

        <Card className="space-y-4">
          <CardHeader
            title="Itens"
            subtitle="Sem quantidade, o item entra como lista de preços."
            className="mb-0"
            actions={
              table ? (
                <Button size="sm" variant="subtle" icon={<ListPlus className="size-4" />} onClick={addWholeTable}>
                  Tabela inteira
                </Button>
              ) : undefined
            }
          />
          <Combobox value={null} onChange={addProduct} options={itemOptions} placeholder="+ Adicionar produto…" />
          {p.lines.length === 0 ? (
            <EmptyState className="py-6" title="Nenhum item" description="Busque os cortes ou inclua a tabela inteira." />
          ) : (
            <ul className="divide-y divide-border rounded-card border border-border">
              {p.lines.map((l) => {
                const locked = !canEditPrice && (l.refPrice ?? 0) > 0;
                return (
                  <li key={l.key} className="grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_120px_130px_110px_auto] gap-2 items-center px-3 py-2">
                    <div className="col-span-2 sm:col-span-1 min-w-0">
                      <div className="text-sm font-medium text-fg truncate">{l.name}</div>
                      {l.category && <div className="text-[11px] text-muted">{l.category}</div>}
                    </div>
                    <WeightInput unit={l.unit} value={l.qty} onChange={(v) => setLine(l.key, { qty: v })} placeholder="qtd." className="h-9" />
                    <MoneyInput value={l.price} onChange={(v) => setLine(l.key, { price: v ?? 0 })} disabled={locked} className="h-9" />
                    <div className="text-right num text-sm font-semibold text-fg">{l.qty ? money(l.qty * l.price) : <span className="text-subtle font-normal">só preço</span>}</div>
                    <div className="flex justify-end">
                      <IconButton label="Remover" size="sm" variant="danger" onClick={() => patch({ lines: p.lines.filter((x) => x.key !== l.key) })}>
                        <Trash2 className="size-4" />
                      </IconButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="space-y-4">
          <CardHeader title="Condições" className="mb-0" />
          <FormGrid>
            <Field label="Validade">
              <DateInput value={p.validUntil} onChange={(v) => patch({ validUntil: v })} />
            </Field>
            <Field label="Pagamento">
              <Input value={p.paymentConditions} onChange={(e) => patch({ paymentConditions: e.target.value })} placeholder="Ex.: Boleto 28/35/42" />
            </Field>
            <Field label="Entrega" span="full">
              <Input value={p.deliveryTerms} onChange={(e) => patch({ deliveryTerms: e.target.value })} />
            </Field>
            <Field label="Frete">
              <MoneyInput value={p.freight} onChange={(v) => patch({ freight: v ?? 0 })} />
            </Field>
            <Field label="Desconto">
              <PercentInput value={p.discountPct} onChange={(v) => patch({ discountPct: Math.max(0, Math.min(100, v ?? 0)) })} />
            </Field>
            <Field label="Observações" span="full">
              <Textarea rows={2} value={p.notes} onChange={(e) => patch({ notes: e.target.value })} placeholder="Ex.: cortes porcionados a vácuo, entrega refrigerada." />
            </Field>
          </FormGrid>
          <Switch
            checked={p.includePix}
            onChange={(v) => patch({ includePix: v })}
            label="Incluir Pix (QR + copia e cola)"
            description={settings.pixDiscountPercent ? `Com ${number(settings.pixDiscountPercent)}% de desconto para pagamento no Pix.` : 'Chave Pix das configurações.'}
          />
        </Card>
      </div>

      <div className="lg:sticky lg:top-4 space-y-4">
        <Card className="space-y-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Proposta</div>
            <div className="font-display text-lg font-semibold text-fg leading-tight truncate">{recipient.name}</div>
            <div className="text-xs text-muted">
              {p.lines.length} itens · válida até {date(p.validUntil)}
            </div>
          </div>
          <Divider />
          {t.priced ? (
            <dl className="space-y-1.5 text-sm">
              <Row label="Subtotal" value={money(t.subtotal)} />
              {t.discount > 0 && <Row label={`Desconto (${number(p.discountPct)}%)`} value={`− ${money(t.discount)}`} />}
              {p.freight > 0 && <Row label="Frete" value={money(p.freight)} />}
              <div className="flex items-baseline justify-between pt-1">
                <span className="text-muted">Total</span>
                <span className="text-2xl font-semibold num text-fg">{money(t.total)}</span>
              </div>
              {t.pixDiscount > 0 && <Row label={`No Pix (−${number(t.pixPct)}%)`} value={money(t.pixTotal)} strong />}
            </dl>
          ) : (
            <p className="text-sm text-muted">Informe quantidades para calcular o total — ou envie como lista de preços.</p>
          )}
          {!valid && <Callout tone="info">Escolha o destinatário e inclua ao menos um item.</Callout>}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="primary" icon={<FileDown className="size-4" />} disabled={!valid} loading={pdf.running} onClick={() => void pdf.run()}>
              PDF
            </Button>
            <Button icon={<MessageCircle className="size-4" />} disabled={!valid} onClick={() => window.open(whatsappLink(recipient.phone, message()), '_blank', 'noopener')}>
              WhatsApp
            </Button>
            <Button
              variant="subtle"
              icon={<Copy className="size-4" />}
              disabled={!valid}
              onClick={async () => ((await copyToClipboard(message())) ? toast.success('Mensagem copiada') : toast.error('Não foi possível copiar.'))}
            >
              Copiar texto
            </Button>
            {can('sales.create') && (
              <Button variant="subtle" icon={<ArrowRight className="size-4" />} disabled={!valid || p.target !== 'CUSTOMER' || !t.priced} onClick={convert}>
                Virar pedido
              </Button>
            )}
          </div>
          {p.target === 'PROSPECT' && <p className="text-[11px] text-subtle">Para virar pedido, cadastre o prospect como cliente.</p>}
        </Card>
        {p.includePix && t.priced && t.pixTotal > 0 && (
          <Card>
            <CardHeader title="Pix da proposta" subtitle={`${settings.pixMerchantName || settings.tradeName} · chave ${settings.pixKey || '—'}`} className="mb-3" />
            <PixBox payload={proposalPix(p, settings, t.pixTotal)} amount={t.pixTotal} fileName="pix-proposta" stacked />
          </Card>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={strong ? 'num font-semibold text-success' : 'num text-fg'}>{value}</dd>
    </div>
  );
}
