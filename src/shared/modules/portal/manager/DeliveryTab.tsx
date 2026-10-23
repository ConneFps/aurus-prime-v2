/**
 * Aba "Entrega e frete": zonas por prefixo de CEP, teste de CEP e regras de entrega.
 */
import { MapPinned, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useSettings } from '../../../app/settings';
import { useAction, useCrud } from '../../../data/react';
import { formatCep, money, onlyDigits } from '../../../domain/format';
import { calculateFreight } from '../../../domain/freight';
import type { FreightZone } from '../../../domain/types';
import { Badge, Button, Callout, Card, CardHeader, DataTable, Drawer, Field, FormGrid, Input, MaskedInput, MoneyInput, Switch, useConfirm, type Column } from '../../../ui';
import { freightSettingsOf } from '../lib';
import { DeliverySettingsCard } from './DeliverySettingsCard';

type ZoneDraft = Omit<FreightZone, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };

export function DeliveryTab({ zones, loading }: { zones: FreightZone[]; loading: boolean }) {
  const [draft, setDraft] = useState<ZoneDraft | null>(null);

  const columns: Column<FreightZone>[] = [
    {
      key: 'label',
      header: 'Zona',
      mobile: 'title',
      sortValue: (z) => z.label,
      cell: (z) => (
        <div className="min-w-0">
          <div className="font-medium text-fg">{z.label}</div>
          {z.etaNote && <div className="text-xs text-muted truncate">{z.etaNote}</div>}
        </div>
      ),
    },
    {
      key: 'ceps',
      header: 'CEPs que começam com',
      hideBelow: 'md',
      cell: (z) => (
        <span className="flex flex-wrap gap-1">
          {z.cepPrefixes.map((p) => (
            <Badge key={p} size="xs" className="num">
              {p}…
            </Badge>
          ))}
        </span>
      ),
    },
    { key: 'price', header: 'Frete', align: 'right', mobile: 'subtitle', sortValue: (z) => z.price, cell: (z) => <span className="num">{money(z.price)}</span> },
    { key: 'min', header: 'Pedido mín.', align: 'right', hideBelow: 'md', sortValue: (z) => z.minOrderValue, cell: (z) => <span className="num text-muted">{z.minOrderValue ? money(z.minOrderValue) : '—'}</span> },
    { key: 'active', header: 'Status', mobile: 'badge', cell: (z) => <Badge tone={z.active ? 'success' : 'neutral'} dot>{z.active ? 'Ativa' : 'Inativa'}</Badge> },
  ];

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px] items-start">
      <div className="space-y-5 min-w-0">
        <Card padded={false}>
          <div className="px-4 sm:px-5 pt-4 sm:pt-5">
            <CardHeader
              icon={<MapPinned className="size-4.5" />}
              title="Zonas de frete"
              subtitle="O prefixo mais específico vence. CEP fora das zonas = frete a combinar."
              actions={
                <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => setDraft({ label: '', cepPrefixes: [], price: 0, minOrderValue: 0, etaNote: '', active: true })}>
                  <span className="max-sm:hidden">Nova zona</span>
                </Button>
              }
            />
          </div>
          <DataTable
            bare
            columns={columns}
            rows={zones}
            rowKey={(z) => z.id}
            loading={loading}
            initialSort={{ key: 'price', dir: 'asc' }}
            onRowClick={(z) => setDraft({ ...z })}
            emptyTitle="Nenhuma zona cadastrada"
            emptyDescription="Sem zonas, todo pedido com entrega fica com frete a combinar."
          />
        </Card>
        <DeliverySettingsCard />
      </div>
      <CepTester zones={zones} />
      <ZoneDrawer draft={draft} onClose={() => setDraft(null)} />
    </div>
  );
}

function CepTester({ zones }: { zones: FreightZone[] }) {
  const { settings } = useSettings();
  const [cep, setCep] = useState('');
  const [value, setValue] = useState<number | null>(300);
  const ok = onlyDigits(cep).length === 8;
  const r = ok ? calculateFreight('DELIVERY', cep, value || 0, freightSettingsOf(zones, settings)) : null;
  return (
    <Card className="xl:sticky xl:top-6">
      <CardHeader title="Testar CEP" subtitle="Veja o que o cliente verá no carrinho." />
      <FormGrid>
        <Field label="CEP">
          <MaskedInput mask="cep" value={cep} onChange={setCep} />
        </Field>
        <Field label="Valor dos produtos">
          <MoneyInput value={value} onChange={setValue} />
        </Field>
      </FormGrid>
      <div className="mt-4">
        {!r ? (
          <p className="text-sm text-subtle">Digite um CEP completo.</p>
        ) : r.kind === 'CHARGED' ? (
          <Callout tone="success" title={`Frete ${money(r.value)}`}>
            {r.label}
          </Callout>
        ) : r.kind === 'FREE' ? (
          <Callout tone="success" title="Frete grátis">
            {r.label}
          </Callout>
        ) : r.kind === 'BELOW_MINIMUM' ? (
          <Callout tone="warning" title="Abaixo do pedido mínimo">
            {r.label}. Faltam {money(r.missing)} — o cliente não consegue enviar.
          </Callout>
        ) : (
          <Callout tone="info" title="Frete a combinar">
            CEP {formatCep(cep)} fora das zonas: o pedido entra com frete pendente e a equipe informa o valor.
          </Callout>
        )}
      </div>
    </Card>
  );
}

function ZoneDrawer({ draft, onClose }: { draft: ZoneDraft | null; onClose: () => void }) {
  const crud = useCrud('freight_zones');
  const confirm = useConfirm();
  const [d, setD] = useState<ZoneDraft | null>(null);
  const [prefix, setPrefix] = useState('');
  const [lastDraft, setLastDraft] = useState<ZoneDraft | null>(null);
  if (draft !== lastDraft) {
    setLastDraft(draft);
    setD(draft);
    setPrefix('');
  }

  const addPrefix = () => {
    const p = onlyDigits(prefix).slice(0, 8);
    if (!d || !p) return;
    if (!d.cepPrefixes.includes(p)) setD({ ...d, cepPrefixes: [...d.cepPrefixes, p].sort() });
    setPrefix('');
  };

  const save = useAction(
    async (x: ZoneDraft) => {
      if (!x.label.trim()) throw new Error('Dê um nome para a zona.');
      if (!x.cepPrefixes.length) throw new Error('Inclua pelo menos um prefixo de CEP.');
      if (x.price < 0 || x.minOrderValue < 0) throw new Error('Valores não podem ser negativos.');
      const { id, ...data } = x;
      const row = { ...data, label: x.label.trim(), etaNote: x.etaNote?.trim() || null };
      if (id) await crud.update(id, row);
      else await crud.insert(row);
    },
    { success: 'Zona salva', onSuccess: onClose },
  );
  const remove = useAction(async () => {
    if (d?.id && (await confirm({ title: `Excluir a zona ${d.label}?`, message: 'CEPs desta zona passam a ficar com frete a combinar.', danger: true, confirmLabel: 'Excluir' }))) {
      await crud.remove(d.id);
      onClose();
    }
  });

  return (
    <Drawer
      open={!!draft}
      onClose={onClose}
      title={d?.id ? 'Editar zona de frete' : 'Nova zona de frete'}
      footer={
        <>
          {d?.id && (
            <Button variant="ghost" className="mr-auto text-danger" icon={<Trash2 className="size-4" />} onClick={() => void remove.run()}>
              Excluir
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.running} onClick={() => d && void save.run(d)}>
            Salvar
          </Button>
        </>
      }
    >
      {d && (
        <div className="space-y-5">
          <FormGrid>
            <Field label="Nome da zona" required span="full">
              <Input value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} placeholder="Ex.: Campinas" />
            </Field>
            <Field label="Prefixos de CEP" required span="full" hint="Só números. Ex.: 130 cobre 13000-000 a 13099-999; 13087 é mais específico.">
              <div className="flex gap-2">
                <Input
                  inputMode="numeric"
                  className="num"
                  value={prefix}
                  onChange={(e) => setPrefix(onlyDigits(e.target.value).slice(0, 8))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      addPrefix();
                    }
                  }}
                  placeholder="Digite e tecle Enter"
                />
                <Button onClick={addPrefix} disabled={!prefix}>
                  Incluir
                </Button>
              </div>
              {d.cepPrefixes.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {d.cepPrefixes.map((p) => (
                    <span key={p} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-pill bg-primary-soft text-primary text-xs font-medium num">
                      {p}…
                      <button type="button" className="p-0.5 rounded-full hover:bg-primary/20 cursor-pointer" aria-label={`Remover ${p}`} onClick={() => setD({ ...d, cepPrefixes: d.cepPrefixes.filter((x) => x !== p) })}>
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </Field>
            <Field label="Valor do frete">
              <MoneyInput value={d.price} onChange={(v) => setD({ ...d, price: v ?? 0 })} />
            </Field>
            <Field label="Pedido mínimo" hint="0 = sem mínimo.">
              <MoneyInput value={d.minOrderValue} onChange={(v) => setD({ ...d, minOrderValue: v ?? 0 })} />
            </Field>
            <Field label="Prazo / observação" span="full" hint="Mostrado ao cliente junto do frete.">
              <Input value={d.etaNote || ''} onChange={(e) => setD({ ...d, etaNote: e.target.value })} placeholder="Ex.: entrega às sextas" />
            </Field>
          </FormGrid>
          <Switch checked={d.active} onChange={(v) => setD({ ...d, active: v })} label="Zona ativa" description="Zonas inativas são ignoradas no cálculo." />
        </div>
      )}
    </Drawer>
  );
}
