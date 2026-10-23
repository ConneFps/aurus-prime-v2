/**
 * Animais do lote: situação (morte/venda), pesos e pesagem.
 */
import { Download, HeartOff, HandCoins, Plus, RotateCcw, Scale, Tag } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useOps, useSession } from '../../../app/session';
import { useAction, useCrud } from '../../../data/react';
import { integer, kg, matchesSearch, money, number } from '../../../domain/format';
import { ANIMAL_STATUS } from '../../../domain/labels';
import type { Animal, AnimalStatus, Batch } from '../../../domain/types';
import {
  Button,
  Card,
  DataTable,
  Drawer,
  EmptyState,
  exportCsv,
  Menu,
  SearchInput,
  Segmented,
  StatusBadge,
  Toolbar,
  usePrompt,
  WeightInput,
  type Column,
} from '../../../ui';
import { daysOnFeed, isActiveBatch, SEX_LABELS } from '../helpers';

export function AnimalsTab({ batch, animals, onAdd }: { batch: Batch; animals: Animal[]; onAdd: () => void }) {
  const ops = useOps();
  const { can } = useSession();
  const prompt = usePrompt();
  const canEdit = can('cattle.manage');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<AnimalStatus | 'ALL'>('ALL');
  const [weighing, setWeighing] = useState(false);
  const days = daysOnFeed(batch);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: animals.length };
    animals.forEach((a) => (c[a.status] = (c[a.status] || 0) + 1));
    return c;
  }, [animals]);
  const filtered = useMemo(
    () => animals.filter((a) => status === 'ALL' || a.status === status).filter((a) => matchesSearch([a.tag, a.breed, a.notes], q)),
    [animals, status, q],
  );
  const totals = useMemo(() => {
    const entry = filtered.reduce((s, a) => s + a.entryWeightKg, 0);
    const price = filtered.reduce((s, a) => s + a.purchasePrice, 0);
    return { entry, price, avg: filtered.length ? entry / filtered.length : 0 };
  }, [filtered]);

  const statusOp = useAction((a: Animal, to: 'DEAD' | 'SOLD' | 'ALIVE', notes: string | null) => ops.setAnimalStatus(a.id, to, notes), {
    success: 'Situação do animal atualizada',
  });
  const changeStatus = async (a: Animal, to: 'DEAD' | 'SOLD' | 'ALIVE') => {
    const notes = await prompt({
      title: to === 'DEAD' ? `Registrar morte do animal ${a.tag}` : to === 'SOLD' ? `Venda do animal ${a.tag} (vivo)` : `Voltar ${a.tag} para “vivo”`,
      label: to === 'DEAD' ? 'Causa / observação' : to === 'SOLD' ? 'Comprador, valor, observação' : 'Motivo',
      required: false,
      confirmLabel: 'Confirmar',
      danger: to === 'DEAD',
    });
    if (notes !== null) await statusOp.run(a, to, notes || null);
  };

  const columns: Column<Animal>[] = [
    { key: 'tag', header: 'Brinco', mobile: 'title', sortValue: (a) => a.tag, cell: (a) => <span className="font-medium num">{a.tag}</span> },
    {
      key: 'sex',
      header: 'Sexo / raça',
      mobile: 'subtitle',
      sortValue: (a) => a.sex || '',
      cell: (a) => [a.sex ? SEX_LABELS[a.sex] : null, a.breed].filter(Boolean).join(' · ') || '—',
    },
    { key: 'entry', header: 'Entrada', align: 'right', sortValue: (a) => a.entryWeightKg, cell: (a) => kg(a.entryWeightKg) },
    {
      key: 'current',
      header: 'Peso atual',
      align: 'right',
      sortValue: (a) => a.exitWeightKg || a.currentWeightKg || 0,
      cell: (a) => {
        const w = a.exitWeightKg || a.currentWeightKg;
        if (!w) return '—';
        const gain = w - a.entryWeightKg;
        return (
          <span>
            {kg(w)}
            {Math.abs(gain) > 0.05 && <span className={gain >= 0 ? 'text-success text-xs ml-1' : 'text-danger text-xs ml-1'}>{gain >= 0 ? '+' : ''}{number(gain, 1)}</span>}
          </span>
        );
      },
    },
    { key: 'carcass', header: 'Carcaça', align: 'right', hideBelow: 'md', sortValue: (a) => a.carcassWeightKg || 0, cell: (a) => (a.carcassWeightKg ? kg(a.carcassWeightKg) : '—') },
    { key: 'price', header: 'Compra', align: 'right', hideBelow: 'md', sortValue: (a) => a.purchasePrice, cell: (a) => money(a.purchasePrice) },
    { key: 'status', header: 'Situação', mobile: 'badge', sortValue: (a) => a.status, cell: (a) => <StatusBadge info={ANIMAL_STATUS[a.status]} /> },
  ];

  if (!animals.length)
    return (
      <Card>
        <EmptyState
          icon={<Tag className="size-5" />}
          title="Sem animais individuais"
          description={`Este lote foi cadastrado só pela quantidade: ${integer(batch.headCount)} cabeças${batch.purchaseWeightKg ? `, ${kg(batch.purchaseWeightKg)}` : ''}. Inclua os brincos para acompanhar peso, morte e venda por animal.`}
          action={
            canEdit && isActiveBatch(batch) ? (
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={onAdd}>
                Adicionar animais
              </Button>
            ) : undefined
          }
        />
      </Card>
    );

  return (
    <>
      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar brinco, raça…" className="sm:w-64" />
        <Segmented
          size="sm"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'ALL', label: 'Todos', count: counts.ALL },
            { value: 'ALIVE', label: 'Vivos', count: counts.ALIVE || 0 },
            { value: 'SLAUGHTERED', label: 'Abatidos', count: counts.SLAUGHTERED || 0 },
            { value: 'DEAD', label: 'Mortes', count: counts.DEAD || 0 },
            { value: 'SOLD', label: 'Vendidos', count: counts.SOLD || 0 },
          ]}
        />
        <div className="flex flex-wrap gap-2 lg:ml-auto">
          {canEdit && (counts.ALIVE || 0) > 0 && (
            <Button size="sm" icon={<Scale className="size-4" />} onClick={() => setWeighing(true)}>
              Registrar pesagem
            </Button>
          )}
          {canEdit && isActiveBatch(batch) && (
            <Button size="sm" icon={<Plus className="size-4" />} onClick={onAdd}>
              Adicionar animais
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            icon={<Download className="size-4" />}
            onClick={() =>
              exportCsv(`animais-${batch.code}`, filtered, [
                { header: 'Brinco', value: (a) => a.tag },
                { header: 'Sexo', value: (a) => (a.sex ? SEX_LABELS[a.sex] : '') },
                { header: 'Raça', value: (a) => a.breed },
                { header: 'Peso entrada (kg)', value: (a) => a.entryWeightKg },
                { header: 'Peso atual (kg)', value: (a) => a.currentWeightKg },
                { header: 'Peso saída (kg)', value: (a) => a.exitWeightKg },
                { header: 'Carcaça (kg)', value: (a) => a.carcassWeightKg },
                { header: 'Preço de compra', value: (a) => a.purchasePrice },
                { header: 'Situação', value: (a) => ANIMAL_STATUS[a.status].label },
                { header: 'Observações', value: (a) => a.notes },
              ])
            }
          >
            CSV
          </Button>
        </div>
      </Toolbar>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(a) => a.id}
        initialSort={{ key: 'tag', dir: 'asc' }}
        pageSize={50}
        emptyTitle="Nenhum animal neste filtro"
        footer={
          <tr>
            <td className="px-3 first:pl-4 py-2.5 text-sm" colSpan={2}>
              {integer(filtered.length)} animais · média {kg(Math.round(totals.avg * 10) / 10)}
            </td>
            <td className="px-3 py-2.5 text-sm text-right num">{kg(Math.round(totals.entry))}</td>
            <td />
            <td className="hidden md:table-cell" />
            <td className="hidden md:table-cell px-3 py-2.5 text-sm text-right num">{money(totals.price)}</td>
            <td />
            {canEdit && <td />}
          </tr>
        }
        rowActions={
          canEdit
            ? (a) => (
                <Menu
                  items={[
                    { label: 'Registrar morte', icon: <HeartOff />, danger: true, onClick: () => void changeStatus(a, 'DEAD'), hidden: a.status !== 'ALIVE' },
                    { label: 'Venda do animal vivo', icon: <HandCoins />, onClick: () => void changeStatus(a, 'SOLD'), hidden: a.status !== 'ALIVE' },
                    { label: 'Voltar para “vivo”', icon: <RotateCcw />, onClick: () => void changeStatus(a, 'ALIVE'), hidden: a.status !== 'DEAD' && a.status !== 'SOLD' },
                  ]}
                />
              )
            : undefined
        }
      />
      {days !== null && <p className="text-xs text-subtle mt-3">Ganho mostrado ao lado do peso atual = peso atual − peso de entrada ({integer(days)} dias no lote).</p>}

      {canEdit && <WeighingDrawer open={weighing} onClose={() => setWeighing(false)} animals={animals.filter((a) => a.status === 'ALIVE')} days={days} />}
    </>
  );
}

function WeighingDrawer({ open, onClose, animals, days }: { open: boolean; onClose: () => void; animals: Animal[]; days: number | null }) {
  const crud = useCrud('animals');
  const [weights, setWeights] = useState<Record<string, number | null>>({});
  useEffect(() => {
    if (open) setWeights({});
  }, [open]);
  const sorted = useMemo(() => [...animals].sort((a, b) => a.tag.localeCompare(b.tag, 'pt-BR', { numeric: true })), [animals]);
  const changed = sorted.filter((a) => weights[a.id] && weights[a.id] !== a.currentWeightKg);
  const avgGain = changed.length && days ? (changed.reduce((s, a) => s + (weights[a.id]! - a.entryWeightKg), 0) / changed.length / days) * 1000 : null;

  const save = useAction(
    async () => {
      if (!changed.length) throw new Error('Informe o peso de pelo menos um animal.');
      for (const a of changed) await crud.update(a.id, { currentWeightKg: weights[a.id]! });
      return changed.length;
    },
    { success: (n) => `Pesagem registrada (${n} animais)`, onSuccess: onClose },
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Registrar pesagem"
      description="Informe o peso atual dos animais pesados. Os demais mantêm o último peso."
      footer={
        <>
          <span className="mr-auto self-center text-sm text-muted num">
            {changed.length} pesados{avgGain ? ` · GMD ${integer(avgGain)} g/dia` : ''}
          </span>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.running} onClick={() => void save.run()}>
            Salvar pesagem
          </Button>
        </>
      }
    >
      <ul className="divide-y divide-border rounded-card border border-border">
        {sorted.map((a) => (
          <li key={a.id} className="grid grid-cols-[minmax(0,1fr)_150px] items-center gap-3 px-3 py-2">
            <div className="min-w-0">
              <div className="text-sm font-medium text-fg num">{a.tag}</div>
              <div className="text-xs text-muted num">
                entrada {kg(a.entryWeightKg)}
                {a.currentWeightKg && a.currentWeightKg !== a.entryWeightKg ? ` · último ${kg(a.currentWeightKg)}` : ''}
              </div>
            </div>
            <WeightInput aria-label={`Peso ${a.tag}`} value={weights[a.id] ?? null} onChange={(v) => setWeights((w) => ({ ...w, [a.id]: v }))} placeholder="Peso" />
          </li>
        ))}
      </ul>
    </Drawer>
  );
}
