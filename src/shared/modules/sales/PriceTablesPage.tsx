/**
 * /comercial/precos — tabelas de preço com aprovação, duplicação e exportação.
 */
import { Check, CheckCircle2, CopyPlus, Download, FileDown, FileText, Globe, Pencil, Plus, Power, Save, Send, Tag, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useOps, useSession } from '../../app/session';
import { useSettings } from '../../app/settings';
import { useAction, useCrud, useTable } from '../../data/react';
import { date, dateTime, matchesSearch, today } from '../../domain/format';
import type { LabelInfo } from '../../domain/labels';
import type { PriceTable } from '../../domain/types';
import {
  Badge,
  Button,
  Callout,
  DataTable,
  Drawer,
  Menu,
  PageHeader,
  SearchInput,
  Segmented,
  Stat,
  StatGrid,
  StatusBadge,
  Toolbar,
  useConfirm,
  usePrompt,
  type Column,
} from '../../ui';
import { useProductOptions, useStockBalances } from '../common/lookups';
import { priceTableCsv, priceTablePdf } from './pdf';
import { draftFromTable, itemsOf, KIND_LABELS, PriceTableEditor, type TableDraft } from './pricing/PriceTableEditor';

const APPROVAL: Record<PriceTable['approvalStatus'], LabelInfo> = {
  DRAFT: { label: 'Rascunho', tone: 'neutral' },
  PENDING: { label: 'Aguardando aprovação', tone: 'warning' },
  APPROVED: { label: 'Aprovada', tone: 'success' },
  REJECTED: { label: 'Recusada', tone: 'danger' },
};

type Filter = 'ALL' | 'IN_USE' | 'PENDING' | 'DRAFT' | 'INACTIVE';

function validity(t: Pick<PriceTable, 'validFrom' | 'validTo'>) {
  if (!t.validFrom && !t.validTo) return 'Sem prazo';
  if (t.validFrom && t.validTo) return `${date(t.validFrom)} a ${date(t.validTo)}`;
  return t.validFrom ? `Desde ${date(t.validFrom)}` : `Até ${date(t.validTo)}`;
}

export function PriceTablesPage() {
  const ops = useOps();
  const crud = useCrud('price_tables');
  const confirm = useConfirm();
  const prompt = usePrompt();
  const { can } = useSession();
  const { settings } = useSettings();
  const canManage = can('pricing.manage');
  const canApprove = can('pricing.approve');
  const showCost = can('sales.viewCost');
  const { rows: tables, loading } = useTable('price_tables');
  const { rows: customers } = useTable('customers');
  const { products } = useProductOptions();
  const { byProduct } = useStockBalances('FINISHED');
  const avgCost = useMemo(() => {
    const m = new Map<string, number>();
    byProduct.forEach((v, k) => v.qty > 0 && m.set(k, v.value / v.qty));
    return m;
  }, [byProduct]);

  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [draft, setDraft] = useState<TableDraft | null>(null);
  const editing = draft?.id ? tables.find((t) => t.id === draft.id) || null : null;

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    customers.forEach((c) => c.priceTableId && m.set(c.priceTableId, (m.get(c.priceTableId) || 0) + 1));
    return m;
  }, [customers]);

  const t0 = today();
  const expired = (t: PriceTable) => !!t.validTo && t.validTo < t0;
  const match: Record<Filter, (t: PriceTable) => boolean> = {
    ALL: () => true,
    IN_USE: (t) => t.status === 'ACTIVE' && t.approvalStatus === 'APPROVED' && !expired(t),
    PENDING: (t) => t.approvalStatus === 'PENDING',
    DRAFT: (t) => t.approvalStatus === 'DRAFT' || t.approvalStatus === 'REJECTED',
    INACTIVE: (t) => t.status === 'INACTIVE' || expired(t),
  };
  const filtered = tables.filter((t) => match[filter](t) && matchesSearch([t.name, KIND_LABELS[t.kind], t.notes], q));
  const count = (f: Filter) => tables.filter(match[f]).length;

  // ---- Ações ---------------------------------------------------------------
  type Mode = 'SAVE' | 'SUBMIT' | 'APPROVE';
  const save = useAction(
    async (d: TableDraft, mode: Mode) => {
      if (!d.name.trim()) throw new Error('Informe o nome da tabela.');
      if (d.validFrom && d.validTo && d.validTo < d.validFrom) throw new Error('A data final da vigência é anterior à inicial.');
      const items = itemsOf(d, products);
      if (!items.length) throw new Error('Inclua pelo menos um produto com preço.');
      const base = { name: d.name.trim(), kind: d.kind, status: d.status, validFrom: d.validFrom, validTo: d.validTo, notes: d.notes.trim() || null, items };
      let id = d.id;
      let approval: PriceTable['approvalStatus'] = 'DRAFT';
      if (!id) {
        const row = await crud.insert({ ...base, approvalStatus: 'DRAFT', approvedById: null, approvedByName: null, approvedAt: null });
        id = row.id;
      } else {
        const cur = tables.find((t) => t.id === id);
        const changed =
          JSON.stringify(cur?.items.map((i) => [i.productId, i.price]).sort()) !== JSON.stringify(items.map((i) => [i.productId, i.price]).sort()) ||
          cur?.validFrom !== d.validFrom ||
          cur?.validTo !== d.validTo;
        // Preço ou vigência alterados voltam para rascunho (precisa nova aprovação).
        const reset = changed && (cur?.approvalStatus === 'APPROVED' || cur?.approvalStatus === 'PENDING');
        await crud.update(id, { ...base, ...(reset ? { approvalStatus: 'DRAFT' as const, approvedById: null, approvedByName: null, approvedAt: null } : {}) });
        approval = reset ? 'DRAFT' : cur?.approvalStatus || 'DRAFT';
      }
      if (mode === 'SUBMIT' && (approval === 'DRAFT' || approval === 'REJECTED')) await ops.submitPriceTable(id);
      if (mode === 'APPROVE' && approval !== 'APPROVED') {
        if (approval === 'REJECTED') await ops.submitPriceTable(id);
        await ops.approvePriceTable(id);
      }
      return mode;
    },
    {
      success: (m) => (m === 'APPROVE' ? 'Tabela salva e aprovada' : m === 'SUBMIT' ? 'Tabela enviada para aprovação' : 'Tabela salva'),
      onSuccess: () => setDraft(null),
    },
  );
  const submit = useAction((t: PriceTable) => ops.submitPriceTable(t.id), { success: 'Tabela enviada para aprovação' });
  const approve = useAction((t: PriceTable) => ops.approvePriceTable(t.id), { success: 'Tabela aprovada' });
  const reject = useAction((t: PriceTable, reason: string) => ops.rejectPriceTable(t.id, reason), { success: 'Tabela recusada' });
  const toggle = useAction((t: PriceTable) => crud.update(t.id, { status: t.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }), { success: 'Situação atualizada' });
  const remove = useAction((t: PriceTable) => crud.remove(t.id), { success: 'Tabela excluída' });
  const sync = useAction((t: PriceTable) => ops.syncCatalogFromPriceTable(t.id), { success: (n) => `${n} itens do catálogo do portal atualizados` });

  const askReject = async (t: PriceTable) => {
    const reason = await prompt({ title: `Recusar "${t.name}"?`, label: 'Motivo (o autor verá nas observações)', confirmLabel: 'Recusar', danger: true });
    if (reason) await reject.run(t, reason);
    return !!reason;
  };
  const askRemove = async (t: PriceTable) => {
    const used = usage.get(t.id) || 0;
    if (
      await confirm({
        title: `Excluir "${t.name}"?`,
        message: used ? `${used} cliente(s) usam esta tabela como padrão — eles passarão a usar o preço do cadastro.` : 'Esta ação não pode ser desfeita.',
        danger: true,
        confirmLabel: 'Excluir',
      })
    )
      await remove.run(t);
  };
  const duplicate = (t: PriceTable) => setDraft({ ...draftFromTable(t), id: undefined, name: `${t.name} (cópia)`, status: 'ACTIVE' });

  const columns: Column<PriceTable>[] = [
    {
      key: 'name',
      header: 'Tabela',
      mobile: 'title',
      sortValue: (t) => t.name,
      cell: (t) => (
        <div className="min-w-0">
          <div className="font-medium text-fg truncate">{t.name}</div>
          {t.notes && <div className="text-xs text-muted truncate max-w-[360px]">{t.notes.split('\n').slice(-1)[0]}</div>}
        </div>
      ),
    },
    { key: 'kind', header: 'Tipo', mobile: 'subtitle', sortValue: (t) => t.kind, cell: (t) => KIND_LABELS[t.kind] },
    { key: 'items', header: 'Produtos', align: 'right', sortValue: (t) => t.items.length, cell: (t) => t.items.length },
    {
      key: 'validity',
      header: 'Vigência',
      hideBelow: 'md',
      sortValue: (t) => t.validFrom || '',
      cell: (t) => <span className={expired(t) ? 'text-danger num' : 'num text-muted'}>{expired(t) ? `Vencida em ${date(t.validTo)}` : validity(t)}</span>,
    },
    { key: 'customers', header: 'Clientes', align: 'right', hideBelow: 'lg', sortValue: (t) => usage.get(t.id) || 0, cell: (t) => usage.get(t.id) || '—' },
    {
      key: 'status',
      header: 'Situação',
      mobile: 'badge',
      sortValue: (t) => t.approvalStatus,
      cell: (t) => (
        <span className="inline-flex flex-wrap gap-1.5">
          <StatusBadge info={APPROVAL[t.approvalStatus]} />
          {t.status === 'INACTIVE' && <Badge>Inativa</Badge>}
        </span>
      ),
    },
    {
      key: 'approved',
      header: 'Aprovação',
      hideBelow: 'xl',
      cell: (t) => (t.approvedByName ? <span className="text-xs text-muted">{`${t.approvedByName} · ${dateTime(t.approvedAt)}`}</span> : <span className="text-subtle">—</span>),
    },
  ];

  const pending = tables.filter((t) => t.approvalStatus === 'PENDING');
  const readOnly = !canManage;
  const status = editing?.approvalStatus;

  return (
    <>
      <PageHeader
        eyebrow="Comercial"
        title="Tabelas de preço"
        subtitle="Preço por corte para cada perfil de cliente. Somente tabelas aprovadas e ativas aparecem no pedido."
        actions={
          canManage && (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setDraft(draftFromTable(null))}>
              Nova tabela
            </Button>
          )
        }
      />

      <StatGrid cols={4} className="mb-5">
        <Stat label="Em uso" icon={<CheckCircle2 className="size-4" />} tone="success" value={count('IN_USE')} hint="aprovadas e vigentes" onClick={() => setFilter('IN_USE')} />
        <Stat label="Aguardando" icon={<Send className="size-4" />} tone="warning" value={count('PENDING')} hint="para aprovação" onClick={() => setFilter('PENDING')} />
        <Stat label="Rascunhos" icon={<Pencil className="size-4" />} tone="neutral" value={count('DRAFT')} hint="ou recusadas" onClick={() => setFilter('DRAFT')} />
        <Stat label="Clientes vinculados" icon={<Tag className="size-4" />} tone="info" value={[...usage.values()].reduce((a, b) => a + b, 0)} hint={`de ${customers.length} clientes`} />
      </StatGrid>

      {canApprove && pending.length > 0 && filter !== 'PENDING' && (
        <Callout
          tone="warning"
          className="mb-4"
          title={`${pending.length} tabela(s) aguardando sua aprovação`}
          action={
            <Button size="sm" onClick={() => setFilter('PENDING')}>
              Ver
            </Button>
          }
        >
          {pending.map((t) => t.name).join(' · ')}
        </Callout>
      )}

      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar tabela…" className="sm:w-72" />
        <Segmented
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'ALL', label: 'Todas', count: tables.length },
            { value: 'IN_USE', label: 'Em uso', count: count('IN_USE') },
            { value: 'PENDING', label: 'Aguardando', count: count('PENDING') },
            { value: 'DRAFT', label: 'Rascunhos', count: count('DRAFT') },
            { value: 'INACTIVE', label: 'Inativas/vencidas', count: count('INACTIVE') },
          ]}
        />
      </Toolbar>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(t) => t.id}
        loading={loading}
        initialSort={{ key: 'name', dir: 'asc' }}
        onRowClick={(t) => setDraft(draftFromTable(t))}
        emptyTitle={tables.length ? 'Nenhuma tabela neste filtro' : 'Nenhuma tabela de preço ainda'}
        emptyDescription={tables.length ? 'Tente outro filtro ou busca.' : 'Crie a primeira tabela — os preços preenchem o pedido automaticamente.'}
        rowActions={(t) => (
          <Menu
            items={[
              { label: canManage ? 'Editar' : 'Ver preços', icon: <Pencil />, onClick: () => setDraft(draftFromTable(t)) },
              { label: 'Enviar para aprovação', icon: <Send />, hidden: !canManage || !(t.approvalStatus === 'DRAFT' || t.approvalStatus === 'REJECTED'), onClick: () => void submit.run(t) },
              { label: 'Aprovar', icon: <Check />, hidden: !canApprove || !(t.approvalStatus === 'PENDING' || t.approvalStatus === 'DRAFT'), onClick: () => void approve.run(t) },
              { label: 'Recusar', icon: <X />, hidden: !canApprove || t.approvalStatus !== 'PENDING', onClick: () => void askReject(t) },
              'divider',
              { label: 'PDF para o cliente', icon: <FileText />, onClick: () => priceTablePdf(t, products, settings) },
              { label: 'Planilha (CSV)', icon: <FileDown />, onClick: () => priceTableCsv(t, products) },
              { label: 'Duplicar', icon: <CopyPlus />, hidden: !canManage, onClick: () => duplicate(t) },
              { label: 'Atualizar catálogo do portal', icon: <Globe />, hidden: !can('portal.manage') || t.kind !== 'PORTAL' || t.approvalStatus !== 'APPROVED', onClick: () => void sync.run(t) },
              { label: t.status === 'ACTIVE' ? 'Desativar' : 'Ativar', icon: <Power />, hidden: !canManage, onClick: () => void toggle.run(t) },
              'divider',
              { label: 'Excluir', icon: <Trash2 />, danger: true, hidden: !canManage, onClick: () => void askRemove(t) },
            ]}
          />
        )}
      />

      <Drawer
        open={!!draft}
        onClose={() => setDraft(null)}
        width="xl"
        title={draft?.id ? (readOnly ? draft.name : 'Editar tabela') : 'Nova tabela de preço'}
        description={
          editing ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              <StatusBadge info={APPROVAL[editing.approvalStatus]} />
              {editing.approvedByName && <span>Aprovada por {editing.approvedByName} em {dateTime(editing.approvedAt)}</span>}
            </span>
          ) : undefined
        }
        footer={
          draft && (
            <>
              {editing && (
                <Button variant="ghost" icon={<Download className="size-4" />} onClick={() => priceTablePdf(editing, products, settings)} className="mr-auto max-sm:hidden">
                  PDF
                </Button>
              )}
              <Button variant="ghost" onClick={() => setDraft(null)} className={readOnly ? undefined : 'max-sm:hidden'}>
                {readOnly ? 'Fechar' : 'Cancelar'}
              </Button>
              {!readOnly && (
                <Button icon={<Save className="size-4" />} loading={save.running} onClick={() => void save.run(draft, 'SAVE')}>
                  <span className="sm:hidden">Rascunho</span>
                  <span className="hidden sm:inline">Salvar rascunho</span>
                </Button>
              )}
              {!readOnly && !canApprove && status !== 'PENDING' && (
                <Button variant="primary" icon={<Send className="size-4" />} loading={save.running} onClick={() => void save.run(draft, 'SUBMIT')}>
                  Salvar e enviar
                </Button>
              )}
              {!readOnly && canApprove && (
                <Button variant="primary" icon={<CheckCircle2 className="size-4" />} loading={save.running} onClick={() => void save.run(draft, 'APPROVE')}>
                  Salvar e aprovar
                </Button>
              )}
              {readOnly && canApprove && editing && (editing.approvalStatus === 'PENDING' || editing.approvalStatus === 'DRAFT') && (
                <>
                  {editing.approvalStatus === 'PENDING' && (
                    <Button variant="danger" icon={<X className="size-4" />} onClick={() => void askReject(editing).then((ok) => ok && setDraft(null))}>
                      Recusar
                    </Button>
                  )}
                  <Button variant="primary" icon={<Check className="size-4" />} loading={approve.running} onClick={() => void approve.run(editing).then(() => setDraft(null))}>
                    Aprovar
                  </Button>
                </>
              )}
            </>
          )
        }
      >
        {draft && (
          <div className="space-y-4">
            {!readOnly && editing?.approvalStatus === 'APPROVED' && (
              <Callout tone="info">Alterar preços ou vigência volta a tabela para rascunho{canApprove ? ' — use “Salvar e aprovar” para mantê-la em uso.' : ' até nova aprovação.'}</Callout>
            )}
            {editing?.approvalStatus === 'REJECTED' && editing.notes && <Callout tone="danger" title="Tabela recusada">{editing.notes.split('\n').slice(-1)[0]}</Callout>}
            <PriceTableEditor draft={draft} setDraft={(fn) => setDraft((d) => (d ? fn(d) : d))} products={products} tables={tables} avgCost={avgCost} showCost={showCost} readOnly={readOnly} />
          </div>
        )}
      </Drawer>
    </>
  );
}
