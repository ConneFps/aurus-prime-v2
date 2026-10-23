/**
 * Cenários da calculadora: lista (abrir/excluir), comparação lado a lado e PDF.
 */
import { FolderOpen, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAction, useCrud } from '../../data/react';
import { dateTime, integer, kg, money, number, percent } from '../../domain/format';
import type { CattleSimulation } from '../../domain/types';
import { cn, createPdf, Drawer, EmptyState, IconButton, Modal, Select, useConfirm } from '../../ui';
import { computeSim, fromParams, PARAM_META, type SimParams, type SimResult } from './calc';

export function ScenariosDrawer({
  open,
  onClose,
  sims,
  onOpen,
  currentId,
}: {
  open: boolean;
  onClose: () => void;
  sims: CattleSimulation[];
  onOpen: (s: CattleSimulation) => void;
  currentId: string | null;
}) {
  const crud = useCrud('cattle_simulations');
  const confirm = useConfirm();
  const removeOp = useAction((s: CattleSimulation) => crud.remove(s.id), { success: 'Cenário excluído' });
  const sorted = useMemo(() => [...sims].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')), [sims]);
  return (
    <Drawer open={open} onClose={onClose} title="Cenários salvos" description="Abra um cenário para continuar a simulação.">
      {!sorted.length ? (
        <EmptyState icon={<FolderOpen className="size-5" />} title="Nenhum cenário salvo" description="Monte uma simulação e clique em “Salvar cenário”." />
      ) : (
        <ul className="divide-y divide-border rounded-card border border-border">
          {sorted.map((s) => {
            const r = computeSim(fromParams(s.params));
            return (
              <li key={s.id} className={cn('flex items-center gap-3 px-3 py-3', s.id === currentId && 'bg-primary-soft/40')}>
                <button type="button" className="min-w-0 flex-1 text-left cursor-pointer" onClick={() => onOpen(s)}>
                  <div className="text-sm font-medium text-fg truncate">{s.name}</div>
                  <div className="text-xs text-muted truncate">
                    {dateTime(s.updatedAt)}
                    {s.createdByName ? ` · ${s.createdByName}` : ''}
                  </div>
                </button>
                <div className="text-right shrink-0">
                  <div className={cn('text-sm font-semibold num', r.lucroCiclo >= 0 ? 'text-success' : 'text-danger')}>{money(r.lucroCiclo)}</div>
                  <div className="text-xs text-muted num">{percent(r.margemCustoTotal)} · {integer(r.duracaoTotalDias)} d</div>
                </div>
                <IconButton
                  label="Excluir cenário"
                  variant="danger"
                  size="sm"
                  onClick={async () => {
                    if (await confirm({ title: `Excluir “${s.name}”?`, danger: true, confirmLabel: 'Excluir' })) await removeOp.run(s);
                  }}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}
    </Drawer>
  );
}

// ---------------------------------------------------------------------------

type Pick = { name: string; params: SimParams };

const RESULT_ROWS: { label: string; get: (r: SimResult) => number; fmt: (v: number) => string; better?: 'high' | 'low' }[] = [
  { label: 'Dias de ciclo', get: (r) => r.duracaoTotalDias, fmt: (v) => integer(v), better: 'low' },
  { label: '@ produzidas', get: (r) => r.arrobasProduzidas, fmt: (v) => number(v, 2), better: 'high' },
  { label: 'Receita', get: (r) => r.receitaVenda, fmt: money, better: 'high' },
  { label: 'Suplementação', get: (r) => r.custoTotalSuplementacao, fmt: money, better: 'low' },
  { label: 'Custos mensais no ciclo', get: (r) => r.custoOperacionalTotalCiclo, fmt: money, better: 'low' },
  { label: 'Custo total', get: (r) => r.custoTotalCiclo, fmt: money, better: 'low' },
  { label: 'Lucro por cabeça', get: (r) => r.lucroCiclo, fmt: money, better: 'high' },
  { label: 'Margem sobre o custo', get: (r) => r.margemCustoTotal, fmt: (v) => percent(v), better: 'high' },
  { label: 'Rentabilidade ao mês', get: (r) => r.rentabilidadeMensal, fmt: (v) => percent(v, 2), better: 'high' },
  { label: 'Equilíbrio (R$/@)', get: (r) => r.equilibrioArroba, fmt: money, better: 'low' },
  { label: 'Lucro do lote', get: (r) => r.lucroLote, fmt: money, better: 'high' },
];

const fmtParam = (unit: string, v: number) =>
  unit === 'R$' || unit === 'R$/mês' ? money(v) : unit === 'kg' ? kg(v) : unit === '%' ? percent(v, 3) : unit === 'g' ? `${integer(v)} g` : integer(v);

export function CompareModal({ open, onClose, sims, current }: { open: boolean; onClose: () => void; sims: CattleSimulation[]; current: Pick }) {
  const options = useMemo(() => [{ value: '__current', label: current.name }, ...sims.map((s) => ({ value: s.id, label: s.name }))], [sims, current.name]);
  const [a, setA] = useState('__current');
  const [b, setB] = useState('');
  useEffect(() => {
    if (open) {
      setA('__current');
      setB(sims[0]?.id || '');
    }
  }, [open, sims]);
  const resolve = (id: string): Pick | null => (id === '__current' ? current : (() => {
    const s = sims.find((x) => x.id === id);
    return s ? { name: s.name, params: fromParams(s.params) } : null;
  })());
  const A = resolve(a);
  const B = resolve(b);
  const ra = A ? computeSim(A.params) : null;
  const rb = B ? computeSim(B.params) : null;
  const changed = A && B ? PARAM_META.filter((m) => A.params[m.key] !== B.params[m.key]) : [];

  return (
    <Modal open={open} onClose={onClose} size="xl" title="Comparar cenários" description="Resultado por cabeça lado a lado; em destaque o melhor de cada linha.">
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Select value={a} onChange={setA} options={options} />
        <Select value={b} onChange={setB} options={options} placeholder="Escolha o 2º cenário" />
      </div>
      {!A || !B || !ra || !rb ? (
        <EmptyState title="Escolha dois cenários" description={sims.length ? undefined : 'Salve pelo menos um cenário para comparar com o atual.'} />
      ) : (
        <div className="space-y-5">
          <CompareTable
            head={[A.name, B.name]}
            rows={RESULT_ROWS.map((row) => {
              const va = row.get(ra);
              const vb = row.get(rb);
              const winA = row.better && Math.abs(va - vb) > 0.005 ? (row.better === 'high' ? va > vb : va < vb) : null;
              return { label: row.label, a: row.fmt(va), b: row.fmt(vb), diff: row.fmt(vb - va), winA };
            })}
          />
          <div>
            <div className="text-[11px] uppercase tracking-wider text-subtle font-medium mb-2">Premissas diferentes ({changed.length})</div>
            {changed.length ? (
              <CompareTable
                head={[A.name, B.name]}
                rows={changed.map((m) => ({ label: `${m.label} · ${m.section}`, a: fmtParam(m.unit, A.params[m.key]), b: fmtParam(m.unit, B.params[m.key]), diff: fmtParam(m.unit, B.params[m.key] - A.params[m.key]), winA: null }))}
              />
            ) : (
              <p className="text-sm text-muted">As premissas são iguais.</p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function CompareTable({ head, rows }: { head: [string, string]; rows: { label: string; a: string; b: string; diff: string; winA: boolean | null }[] }) {
  return (
    <div className="scroll-x rounded-card border border-border">
      <table className="w-full text-sm sm:min-w-[520px]">
        <thead>
          <tr className="bg-surface-2/60 text-[11px] uppercase tracking-wider text-muted">
            <th className="text-left font-semibold px-2 sm:px-3 py-2">Indicador</th>
            <th className="text-right font-semibold px-3 py-2 max-w-[160px] truncate">{head[0]}</th>
            <th className="text-right font-semibold px-3 py-2 max-w-[160px] truncate">{head[1]}</th>
            <th className="hidden sm:table-cell text-right font-semibold px-3 py-2">Diferença</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-border">
              <td className="px-2 sm:px-3 py-2 text-muted">{r.label}</td>
              <td className={cn('px-2 sm:px-3 py-2 text-right num', r.winA === true && 'text-success font-semibold')}>{r.a}</td>
              <td className={cn('px-2 sm:px-3 py-2 text-right num', r.winA === false && 'text-success font-semibold')}>{r.b}</td>
              <td className="hidden sm:table-cell px-3 py-2 text-right num text-muted">{r.diff}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function exportSimPdf(name: string, p: SimParams, r: SimResult) {
  const pdf = createPdf({ title: 'Simulação de compra — recria e engorda', subtitle: name });
  pdf.keyValues(
    [
      ['Lucro por cabeça', money(r.lucroCiclo)],
      ['Margem sobre o custo', percent(r.margemCustoTotal)],
      ['Rentabilidade ao mês', percent(r.rentabilidadeMensal, 2)],
      ['Ciclo', `${integer(r.duracaoTotalDias)} dias (${number(r.duracaoTotalCicloMeses, 1)} meses)`],
      ['@ produzidas', number(r.arrobasProduzidas, 2)],
      ['Equilíbrio', `${money(r.equilibrioArroba)}/@`],
      ['Receita por cabeça', money(r.receitaVenda)],
      ['Custo total por cabeça', money(r.custoTotalCiclo)],
      ...(p.cabecas > 1
        ? ([
            [`Investimento (${integer(p.cabecas)} cab)`, money(r.investimentoLote)],
            [`Lucro do lote`, money(r.lucroLote)],
          ] as [string, string][])
        : []),
    ],
    { title: 'Resultado' },
  );
  pdf.table(
    [
      { k: 'Compra do animal', v: p.valorPago },
      { k: 'Suplemento na recria', v: r.custoTotalSuplementoRecria },
      { k: 'Suplemento na engorda', v: r.custoTotalSuplementoEngorda },
      { k: 'Custos mensais no ciclo', v: r.custoOperacionalTotalCiclo },
      { k: 'Comercialização', v: p.custoComercializacao },
    ],
    [
      { header: 'Composição do custo por cabeça', value: (x) => x.k },
      { header: 'Valor', value: (x) => money(x.v), align: 'right' },
      { header: '%', value: (x) => (r.custoTotalCiclo ? percent((x.v / r.custoTotalCiclo) * 100) : '—'), align: 'right' },
    ],
    { foot: ['Total', money(r.custoTotalCiclo), '100%'] },
  );
  pdf.table(
    [
      { k: 'Recria', gain: r.ganhoPesoRecria, days: r.duracaoRecriaDias, daily: r.consumoDiarioSuplementoRecria, total: r.consumoTotalSuplementoRecria, cost: r.custoTotalSuplementoRecria },
      { k: 'Engorda', gain: r.ganhoPesoEngorda, days: r.duracaoEngordaDias, daily: r.consumoDiarioSuplementoEngorda, total: r.consumoTotalSuplementoEngorda, cost: r.custoTotalSuplementoEngorda },
    ],
    [
      { header: 'Fase', value: (x) => x.k },
      { header: 'Ganho', value: (x) => kg(Math.round(x.gain * 10) / 10), align: 'right' },
      { header: 'Dias', value: (x) => integer(x.days), align: 'right' },
      { header: 'Suplemento/dia', value: (x) => kg(Math.round(x.daily * 100) / 100), align: 'right' },
      { header: 'Suplemento total', value: (x) => kg(Math.round(x.total)), align: 'right' },
      { header: 'Custo', value: (x) => money(x.cost), align: 'right' },
    ],
    { title: 'Fases' },
  );
  pdf.table(PARAM_META, [
    { header: 'Seção', value: (m) => m.section },
    { header: 'Premissa', value: (m) => m.label },
    { header: 'Valor', value: (m) => fmtParam(m.unit, p[m.key]), align: 'right' },
  ], { title: 'Premissas' });
  pdf.save(`simulacao-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'gado'}`);
}

