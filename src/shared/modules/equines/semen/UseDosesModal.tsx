/**
 * Baixa de doses: compra (ops.useSemenDoses) ou coleta própria (atualiza o evento).
 */
import { useEffect, useMemo, useState } from 'react';
import { useOps } from '../../../app/session';
import { useAction, useCrud, useTable } from '../../../data/react';
import { date, today } from '../../../domain/format';
import type { EquineEvent, SemenPurchase } from '../../../domain/types';
import { Button, Combobox, DateInput, Field, FormGrid, Modal, NumberInput, Textarea, type ComboOption } from '../../../ui';
import { isInHerd, semenStatus } from '../model';

export type DoseSource = { kind: 'purchase'; purchase: SemenPurchase } | { kind: 'collection'; event: EquineEvent };

export interface CollectionUsage {
  date: string;
  doses: number;
  mareName?: string | null;
  notes?: string | null;
}

export const sourceInfo = (s: DoseSource) =>
  s.kind === 'purchase'
    ? { stallion: s.purchase.stallionName, available: s.purchase.dosesAvailable, sub: `${s.purchase.supplierName} · compra de ${date(s.purchase.purchaseDate)}` }
    : { stallion: s.event.equineName, available: Number(s.event.data.dosesAvailable) || 0, sub: `Coleta própria de ${date(s.event.date)}` };

const isExpired = (s: DoseSource) =>
  s.kind === 'purchase' ? semenStatus(s.purchase) === 'EXPIRED' : !!s.event.data.expiryDate && String(s.event.data.expiryDate) < today();

export function UseDosesModal({ source, onClose }: { source: DoseSource | null; onClose: () => void }) {
  const ops = useOps();
  const events = useCrud('equine_events');
  const { rows: herd } = useTable('equines');
  const [dt, setDt] = useState(today());
  const [doses, setDoses] = useState<number | null>(1);
  const [mare, setMare] = useState<string | null>(null);
  const [extra, setExtra] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  useEffect(() => {
    if (source) {
      const discard = isExpired(source);
      setDt(today());
      setDoses(discard ? sourceInfo(source).available : 1);
      setMare(null);
      setNotes(discard ? 'Descarte — sêmen vencido' : '');
    }
  }, [source]);

  const options = useMemo<ComboOption[]>(() => {
    const mares = herd
      .filter((h) => h.sex === 'EGUA' && isInHerd(h))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .map((h) => ({ value: h.name, label: h.name, description: [h.breed, h.paddock].filter(Boolean).join(' · ') }));
    return [...mares, ...extra.filter((x) => !mares.some((m) => m.value === x)).map((x) => ({ value: x, label: x, description: 'Fora do plantel' }))];
  }, [herd, extra]);

  const save = useAction(
    async () => {
      if (!source) return;
      const info = sourceInfo(source);
      if (!doses || doses <= 0 || !Number.isInteger(doses)) throw new Error('Informe a quantidade de doses (número inteiro).');
      if (doses > info.available) throw new Error(`Doses insuficientes: disponível ${info.available}.`);
      if (!dt) throw new Error('Informe a data do uso.');
      if (source.kind === 'purchase') {
        await ops.useSemenDoses(source.purchase.id, { date: dt, doses, mareName: mare, notes: notes.trim() || null });
      } else {
        const ev = source.event;
        const usage = (Array.isArray(ev.data.usage) ? (ev.data.usage as CollectionUsage[]) : []).concat({ date: dt, doses, mareName: mare, notes: notes.trim() || null });
        await events.update(ev.id, { data: { ...ev.data, dosesAvailable: info.available - doses, usage } });
      }
    },
    { success: 'Uso de doses registrado', onSuccess: onClose },
  );

  if (!source) return null;
  const info = sourceInfo(source);
  return (
    <Modal
      open
      onClose={onClose}
      title={`${isExpired(source) ? 'Dar baixa' : 'Usar doses'} — ${info.stallion}`}
      description={`${info.sub} · ${info.available} dose(s) disponível(is)`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.running} onClick={() => void save.run()}>
            Registrar uso
          </Button>
        </>
      }
    >
      <FormGrid cols={2}>
        <Field label="Data" required>
          <DateInput value={dt} onChange={setDt} />
        </Field>
        <Field label="Doses" required hint={`Máximo ${info.available}`}>
          <NumberInput value={doses} decimals={0} onChange={setDoses} />
        </Field>
        <Field label="Égua inseminada" span="full" hint={isExpired(source) ? 'Deixe em branco para descarte.' : 'Escolha do plantel ou digite o nome de uma égua de fora.'}>
          <Combobox
            value={mare}
            onChange={(v) => setMare(v)}
            options={options}
            allowClear
            placeholder="Selecione a égua…"
            searchPlaceholder="Buscar ou digitar nome…"
            onCreate={(text) => {
              const name = text.trim();
              if (!name) return;
              setExtra((x) => [...x, name]);
              setMare(name);
            }}
            createLabel="Usar este nome"
          />
        </Field>
        <Field label="Observações" span="full">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: inseminação — 1º ciclo" />
        </Field>
      </FormGrid>
    </Modal>
  );
}
