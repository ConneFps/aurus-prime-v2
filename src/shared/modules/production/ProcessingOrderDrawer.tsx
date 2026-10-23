/**
 * Nova ordem de desossa (OS): parceiro, lotes enviados (RAW ou FINISHED),
 * transporte e custos → ops.createProcessingOrder. Opcionalmente baixa o romaneio.
 */
import { Package, Trash2, Truck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOps } from '../../app/session';
import { useSettings } from '../../app/settings';
import { useAction, useBackend, useTable } from '../../data/react';
import { addDays, date, kg, money, round3, today } from '../../domain/format';
import { STAGE_LABELS } from '../../domain/labels';
import type { StockLot } from '../../domain/types';
import {
  Badge,
  Button,
  Callout,
  Checkbox,
  Combobox,
  DateInput,
  Drawer,
  Field,
  FormGrid,
  FormSection,
  IconButton,
  Input,
  MaskedInput,
  MoneyInput,
  Textarea,
  WeightInput,
  type ComboOption,
} from '../../ui';
import { usePartnerOptions } from '../common/lookups';
import { printRomaneio } from './romaneio';
import { lineKey } from './slaughter-model';
import { Metric } from './shared';

interface ItemLine {
  key: string;
  lotId: string;
  qty: number | null;
}

interface Draft {
  partnerId: string;
  sentDate: string;
  expectedReturnDate: string;
  items: ItemLine[];
  driverName: string;
  vehiclePlate: string;
  driverPhone: string;
  dispatchDocument: string;
  freightCost: number | null;
  processingCost: number | null;
  notes: string;
  printRomaneio: boolean;
}

export function ProcessingOrderDrawer({ open, onClose, initialLotIds }: { open: boolean; onClose: () => void; initialLotIds?: string[] }) {
  const nav = useNavigate();
  const ops = useOps();
  const { data } = useBackend();
  const { settings } = useSettings();
  const { options: partnerOptions } = usePartnerOptions(['PROCESSOR', 'SLAUGHTERHOUSE']);
  const { rows: lots, loading: lotsLoading } = useTable('stock_lots', { where: [['status', '==', 'AVAILABLE']] }, { enabled: open });
  const { rows: orders, loading: ordersLoading } = useTable('processing_orders', undefined, { enabled: open });
  const [d, setD] = useState<Draft | null>(null);

  const available = useMemo(() => lots.filter((l) => l.balanceQty > 0.0005), [lots]);
  const lotById = useMemo(() => new Map(available.map((l) => [l.id, l])), [available]);

  // Inicializa ao abrir (último parceiro usado; lotes pré-selecionados com saldo total).
  const lotsReady = !lotsLoading && !ordersLoading;
  useEffect(() => {
    if (!open) {
      setD(null);
      return;
    }
    if (d || !lotsReady) return;
    const last = [...orders].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
    const sent = today();
    setD({
      partnerId: last?.partnerId || '',
      sentDate: sent,
      expectedReturnDate: addDays(sent, 7),
      items: (initialLotIds || [])
        .map((id) => lotById.get(id))
        .filter((l): l is StockLot => !!l)
        .map((l) => ({ key: lineKey(), lotId: l.id, qty: round3(l.balanceQty) })),
      driverName: '',
      vehiclePlate: '',
      driverPhone: '',
      dispatchDocument: '',
      freightCost: null,
      processingCost: null,
      notes: '',
      printRomaneio: true,
    });
  }, [open, d, lotsReady, orders, initialLotIds, lotById]);

  const set = (patch: Partial<Draft>) => setD((cur) => (cur ? { ...cur, ...patch } : cur));

  const lotOptions = useMemo<ComboOption[]>(() => {
    const used = new Set(d?.items.map((i) => i.lotId));
    return available
      .filter((l) => !used.has(l.id))
      .sort((a, b) => (a.stage === b.stage ? a.entryDate.localeCompare(b.entryDate) : a.stage === 'RAW' ? -1 : 1))
      .map((l) => ({
        value: l.id,
        label: `${l.productName}${l.lotCode ? ` · ${l.lotCode}` : ''}`,
        description: [STAGE_LABELS[l.stage], l.batchCode ? `lote ${l.batchCode}` : null, `entrada ${date(l.entryDate)}`].filter(Boolean).join(' · '),
        keywords: [l.batchCode, l.lotCode].filter(Boolean).join(' '),
        right: kg(l.balanceQty),
      }));
  }, [available, d?.items]);

  const totals = useMemo(() => {
    const items = d?.items || [];
    const sentKg = items.reduce((s, i) => s + (i.qty || 0), 0);
    const raw = items.reduce((s, i) => s + (i.qty || 0) * (lotById.get(i.lotId)?.unitCost || 0), 0);
    const extra = (d?.freightCost || 0) + (d?.processingCost || 0);
    const batches = new Set(items.map((i) => lotById.get(i.lotId)?.batchCode).filter(Boolean));
    return { sentKg, raw, extra, perKg: sentKg ? (raw + extra) / sentKg : 0, batches: [...batches] as string[] };
  }, [d, lotById]);

  const save = useAction(
    async (draft: Draft) => {
      if (!draft.partnerId) throw new Error('Selecione a desossa / processador.');
      if (!draft.sentDate) throw new Error('Informe a data de envio.');
      if (draft.expectedReturnDate && draft.expectedReturnDate < draft.sentDate) throw new Error('A previsão de retorno é anterior ao envio.');
      const items = draft.items.filter((i) => i.lotId);
      if (!items.length) throw new Error('Adicione ao menos um lote para enviar.');
      for (const i of items) {
        const lot = lotById.get(i.lotId);
        if (!lot) throw new Error('Um dos lotes não está mais disponível. Remova-o e tente de novo.');
        if (!i.qty || i.qty <= 0) throw new Error(`Informe o peso enviado de ${lot.productName}.`);
        if (i.qty > lot.balanceQty + 0.0005) throw new Error(`${lot.productName}: o envio (${kg(i.qty)}) passa do saldo (${kg(lot.balanceQty)}).`);
      }
      const id = await ops.createProcessingOrder({
        partnerId: draft.partnerId,
        sentDate: draft.sentDate,
        expectedReturnDate: draft.expectedReturnDate || null,
        items: items.map((i) => ({ lotId: i.lotId, qty: round3(i.qty || 0) })),
        driverName: draft.driverName.trim() || null,
        vehiclePlate: draft.vehiclePlate.trim().toUpperCase() || null,
        driverPhone: draft.driverPhone || null,
        dispatchDocument: draft.dispatchDocument.trim() || null,
        freightCost: draft.freightCost,
        processingCost: draft.processingCost,
        notes: draft.notes.trim() || null,
      });
      if (draft.printRomaneio) {
        const order = await data.get('processing_orders', id);
        if (order) printRomaneio(order, { company: settings.tradeName || settings.companyName, lotCodes: new Map(items.map((i) => [i.lotId, lotById.get(i.lotId)?.lotCode || ''])) });
      }
      return id;
    },
    {
      success: 'Ordem de desossa criada — estoque baixado',
      onSuccess: (id) => {
        onClose();
        nav(`/producao/processamento/${id}`);
      },
    },
  );

  const updateItem = (key: string, patch: Partial<ItemLine>) => d && set({ items: d.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title="Nova ordem de desossa"
      description="Envie carcaça, quartos ou cortes para processamento. O estoque é baixado no envio."
      footer={
        <>
          <span className="mr-auto self-center text-xs text-muted num hidden sm:block">
            {kg(totals.sentKg)} · {money(totals.raw + totals.extra)}
          </span>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" icon={<Truck className="size-4" />} loading={save.running} onClick={() => d && void save.run(d)}>
            Criar e enviar
          </Button>
        </>
      }
    >
      {d && (
        <div className="space-y-6">
          <FormGrid>
            <Field label="Desossa / processador" required span="full">
              <Combobox
                value={d.partnerId || null}
                onChange={(v) => set({ partnerId: v || '' })}
                options={partnerOptions}
                placeholder="Selecione…"
                emptyText="Nenhuma desossa ativa — cadastre em Parceiros"
              />
            </Field>
            <Field label="Data de envio" required>
              <DateInput value={d.sentDate} onChange={(v) => set({ sentDate: v, expectedReturnDate: d.expectedReturnDate === addDays(d.sentDate, 7) ? addDays(v, 7) : d.expectedReturnDate })} />
            </Field>
            <Field label="Previsão de retorno" hint="Usada para alertar atrasos.">
              <DateInput value={d.expectedReturnDate} onChange={(v) => set({ expectedReturnDate: v })} min={d.sentDate} />
            </Field>
          </FormGrid>

          <FormSection title="O que vai ser enviado" description="Lotes do estoque pós-abate (carcaça/quartos) ou de venda. O peso não pode passar do saldo.">
            <div className="space-y-2">
              {d.items.map((it) => {
                const lot = lotById.get(it.lotId);
                const over = !!lot && (it.qty || 0) > lot.balanceQty + 0.0005;
                return (
                  <div key={it.key} className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_170px_auto] gap-x-3 gap-y-2 items-start rounded-card border border-border p-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-fg truncate">{lot?.productName || 'Lote indisponível'}</span>
                        {lot && <Badge tone={lot.stage === 'RAW' ? 'warning' : 'info'}>{STAGE_LABELS[lot.stage]}</Badge>}
                      </div>
                      {lot && (
                        <div className="text-xs text-muted truncate num">
                          {lot.lotCode || 'sem código'}
                          {lot.batchCode ? ` · lote ${lot.batchCode}` : ''} · saldo {kg(lot.balanceQty)} · {money(lot.unitCost)}/kg
                        </div>
                      )}
                    </div>
                    <IconButton label="Remover" size="sm" variant="danger" className="sm:order-last" onClick={() => set({ items: d.items.filter((x) => x.key !== it.key) })}>
                      <Trash2 className="size-4" />
                    </IconButton>
                    <div className="col-span-2 sm:col-span-1">
                      <WeightInput value={it.qty} onChange={(v) => updateItem(it.key, { qty: v })} aria-label="Peso enviado" aria-invalid={over || undefined} />
                      {over ? (
                        <p className="text-xs text-danger mt-1">Máximo {kg(lot!.balanceQty)}</p>
                      ) : (
                        lot &&
                        (it.qty || 0) < lot.balanceQty - 0.0005 && (
                          <button type="button" className="text-xs text-primary hover:underline mt-1 cursor-pointer" onClick={() => updateItem(it.key, { qty: round3(lot.balanceQty) })}>
                            Enviar saldo todo
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
              <Combobox
                value={null}
                onChange={(v) => {
                  const lot = v ? lotById.get(v) : null;
                  if (lot) set({ items: [...d.items, { key: lineKey(), lotId: lot.id, qty: round3(lot.balanceQty) }] });
                }}
                options={lotOptions}
                placeholder={d.items.length ? 'Adicionar outro lote…' : 'Escolha o lote a enviar…'}
                searchPlaceholder="Produto, lote de gado ou código…"
                emptyText="Nenhum lote com saldo"
              />
              {totals.batches.length > 1 && (
                <Callout tone="info">Os itens vêm de lotes de gado diferentes ({totals.batches.join(', ')}). Os custos da OS não serão lançados em um lote específico.</Callout>
              )}
            </div>
          </FormSection>

          <FormSection title="Transporte">
            <FormGrid>
              <Field label="Motorista">
                <Input value={d.driverName} onChange={(e) => set({ driverName: e.target.value })} />
              </Field>
              <Field label="Placa do veículo">
                <Input value={d.vehiclePlate} onChange={(e) => set({ vehiclePlate: e.target.value.toUpperCase() })} placeholder="ABC-1D23" className="uppercase" />
              </Field>
              <Field label="Telefone do motorista">
                <MaskedInput mask="phone" value={d.driverPhone} onChange={(v) => set({ driverPhone: v })} />
              </Field>
              <Field label="Documento de saída" hint="NF, GTA ou nº do lacre.">
                <Input value={d.dispatchDocument} onChange={(e) => set({ dispatchDocument: e.target.value })} />
              </Field>
            </FormGrid>
          </FormSection>

          <FormSection title="Custos da ordem" description="Lançados como custo do lote de gado de origem (desossa e frete de retorno).">
            <FormGrid>
              <Field label="Custo da desossa" hint={d.processingCost && totals.sentKg ? `${money(d.processingCost / totals.sentKg)} por kg enviado` : 'Valor total cobrado pelo serviço.'}>
                <MoneyInput value={d.processingCost} onChange={(v) => set({ processingCost: v })} />
              </Field>
              <Field label="Frete">
                <MoneyInput value={d.freightCost} onChange={(v) => set({ freightCost: v })} />
              </Field>
              <Field label="Observações" span="full">
                <Textarea rows={2} value={d.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Instruções para a desossa (opcional)" />
              </Field>
            </FormGrid>
          </FormSection>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <Metric label="Peso enviado" value={kg(totals.sentKg)} hint={`${d.items.length} lote(s)`} />
            <Metric label="Matéria-prima" value={money(totals.raw)} />
            <Metric label="Desossa + frete" value={money(totals.extra)} />
            <Metric label="Custo por kg" value={totals.perKg ? money(totals.perKg) : '—'} tone="primary" />
          </div>

          <Checkbox checked={d.printRomaneio} onChange={(v) => set({ printRomaneio: v })} label="Baixar o romaneio em PDF ao criar" description="Documento para o motorista e a desossa assinarem." />
        </div>
      )}
      {!d && open && (
        <div className="py-16 text-center text-sm text-muted">
          <Package className="size-6 mx-auto mb-2 text-subtle" />
          Carregando lotes…
        </div>
      )}
    </Drawer>
  );
}
