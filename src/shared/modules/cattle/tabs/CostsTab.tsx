/**
 * Custos do lote: totais por grupo, lista, remoção e lançamentos.
 */
import { Download, FileUp, ListPlus, Plus, Receipt, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CostGroupChips, useGroupTotals } from '../CostGroupChips';
import { useOps, useSession } from '../../../app/session';
import { useAction } from '../../../data/react';
import { date, money } from '../../../domain/format';
import { COST_GROUP_LABELS } from '../../../domain/labels';
import type { Batch, BatchCost, CostGroup } from '../../../domain/types';
import { Badge, Button, cn, DataTable, exportCsv, Menu, Segmented, Toolbar, useConfirm, type Column } from '../../../ui';
import { categoryLabel, COST_GROUP_ORDER, COST_SOURCE_LABELS, groupOf, isCreditCategory, isRemovableCost, netCostOf, signedAmount } from '../helpers';

export function CostsTab({
  batch,
  costs,
  onAdd,
  onQuick,
  onImport,
}: {
  batch: Batch;
  costs: BatchCost[];
  onAdd: () => void;
  onQuick: () => void;
  onImport: () => void;
}) {
  const ops = useOps();
  const { can } = useSession();
  const confirm = useConfirm();
  const canEdit = can('costs.manage');
  const [group, setGroup] = useState<CostGroup | 'ALL'>('ALL');

  const byGroup = useGroupTotals(costs);
  const filtered = useMemo(() => costs.filter((c) => group === 'ALL' || groupOf(c.category) === group), [costs, group]);
  const total = netCostOf(filtered);

  const removeOp = useAction((c: BatchCost) => ops.removeBatchCost(c.id), { success: 'Custo removido' });
  const remove = async (c: BatchCost) => {
    const ok = await confirm({
      title: `Remover ${categoryLabel(c.category)} de ${money(c.amount)}?`,
      message: c.financialEntryId ? 'A conta a pagar vinculada (em aberto) também será cancelada.' : 'O custo sai do resultado do lote.',
      danger: true,
      confirmLabel: 'Remover',
    });
    if (ok) await removeOp.run(c);
  };

  const columns: Column<BatchCost>[] = [
    { key: 'date', header: 'Data', sortValue: (c) => c.date, cell: (c) => <span className="num">{date(c.date)}</span> },
    {
      key: 'category',
      header: 'Categoria',
      mobile: 'title',
      sortValue: (c) => categoryLabel(c.category),
      cell: (c) => (
        <div className="min-w-0">
          <div className="text-fg truncate">{categoryLabel(c.category)}</div>
          {c.description && <div className="text-xs text-muted truncate max-w-[280px]">{c.description}</div>}
        </div>
      ),
    },
    { key: 'group', header: 'Grupo', mobile: 'subtitle', hideBelow: 'md', sortValue: (c) => groupOf(c.category), cell: (c) => COST_GROUP_LABELS[groupOf(c.category)] },
    { key: 'doc', header: 'Documento', hideBelow: 'lg', mobile: false, cell: (c) => c.documentNumber || '—' },
    { key: 'partner', header: 'Parceiro', hideBelow: 'xl', mobile: false, cell: (c) => c.partnerName || '—' },
    {
      key: 'source',
      header: 'Origem',
      hideBelow: 'lg',
      mobile: false,
      cell: (c) => (
        <span className="inline-flex gap-1">
          <Badge size="xs">{COST_SOURCE_LABELS[c.source]}</Badge>
          {c.financialEntryId && (
            <Badge size="xs" tone="info">
              A pagar
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Valor',
      align: 'right',
      mobile: 'badge',
      sortValue: (c) => signedAmount(c),
      cell: (c) => <span className={cn('num font-medium', isCreditCategory(c.category) && 'text-success')}>{money(signedAmount(c))}</span>,
    },
  ];

  return (
    <>
      <CostGroupChips totals={byGroup} value={group} onChange={setGroup} className="mb-4" />

      <Toolbar>
        <Segmented
          size="sm"
          value={group}
          onChange={setGroup}
          options={[{ value: 'ALL' as const, label: 'Todos', count: costs.length }, ...COST_GROUP_ORDER.filter((g) => byGroup.has(g)).map((g) => ({ value: g, label: COST_GROUP_LABELS[g] }))]}
        />
        <div className="flex flex-wrap gap-2 lg:ml-auto">
          {canEdit && (
            <>
              <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={onAdd}>
                Lançar custo
              </Button>
              <Button size="sm" icon={<ListPlus className="size-4" />} onClick={onQuick}>
                Lançamento rápido
              </Button>
              <Button size="sm" icon={<FileUp className="size-4" />} onClick={onImport}>
                Importar
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            icon={<Download className="size-4" />}
            onClick={() =>
              exportCsv(`custos-${batch.code}`, filtered, [
                { header: 'Data', value: (c) => date(c.date) },
                { header: 'Grupo', value: (c) => COST_GROUP_LABELS[groupOf(c.category)] },
                { header: 'Categoria', value: (c) => categoryLabel(c.category) },
                { header: 'Descrição', value: (c) => c.description },
                { header: 'Documento', value: (c) => c.documentNumber },
                { header: 'Parceiro', value: (c) => c.partnerName },
                { header: 'Origem', value: (c) => COST_SOURCE_LABELS[c.source] },
                { header: 'Valor', value: (c) => signedAmount(c) },
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
        rowKey={(c) => c.id}
        initialSort={{ key: 'date', dir: 'desc' }}
        emptyTitle="Nenhum custo lançado"
        emptyDescription="Lance compra, frete, vacinas, impostos… ou importe uma planilha."
        empty={
          !costs.length ? (
            <div className="py-12 text-center">
              <Receipt className="size-7 mx-auto text-subtle mb-3" />
              <p className="text-sm text-muted">Nenhum custo lançado neste lote.</p>
            </div>
          ) : undefined
        }
        footer={
          <tr>
            <td className="px-3 first:pl-4 py-2.5 text-sm" colSpan={2}>
              Total {group === 'ALL' ? 'líquido' : COST_GROUP_LABELS[group as CostGroup].toLowerCase()}
            </td>
            <td className="hidden md:table-cell" />
            <td className="hidden lg:table-cell" />
            <td className="hidden xl:table-cell" />
            <td className="hidden lg:table-cell" />
            <td className="px-3 py-2.5 text-sm text-right num">{money(total)}</td>
            {canEdit && <td />}
          </tr>
        }
        rowActions={
          canEdit
            ? (c) => (
                <Menu
                  items={
                    isRemovableCost(c)
                      ? [{ label: 'Remover custo', icon: <Trash2 />, danger: true, onClick: () => void remove(c) }]
                      : [{ label: `Lançado em: ${COST_SOURCE_LABELS[c.source]}`, disabled: true, onClick: () => undefined }]
                  }
                />
              )
            : undefined
        }
      />
    </>
  );
}
