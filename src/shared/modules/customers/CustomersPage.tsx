/**
 * /clientes — carteira de clientes: indicadores, filtros, cadastro, importação
 * e solicitações de vendedores externos.
 */
import { CheckCircle2, Download, Edit3, Eye, FileUp, Lock, Plus, ShoppingCart, SlidersHorizontal, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/session';
import { useAction, useCrud, useTable } from '../../data/react';
import { date, formatDocument, matchesSearch, money, startOfMonth } from '../../domain/format';
import { CUSTOMER_CATEGORY_LABELS, optionsOf, PAYMENT_METHOD_LABELS, RANKING } from '../../domain/labels';
import type { Customer, CustomerCategory, Ranking } from '../../domain/types';
import {
  Badge,
  Button,
  Card,
  cn,
  DataTable,
  EmptyState,
  exportCsv,
  Menu,
  PageHeader,
  SearchInput,
  Segmented,
  Select,
  Stars,
  Stat,
  StatGrid,
  Toolbar,
  type Column,
} from '../../ui';
import { CustomerFormDrawer } from './CustomerForm';
import { CustomerImportModal } from './CustomerImport';
import { CustomerRequestsPanel } from './CustomerRequests';
import { cityLabel } from './helpers';

type Filters = {
  category: CustomerCategory | '';
  ranking: Ranking | '';
  seller: string;
  status: 'ACTIVE' | 'BLOCKED' | '';
  approval: 'PENDING' | 'APPROVED' | 'REJECTED' | '';
  city: string;
};
const NO_FILTERS: Filters = { category: '', ranking: '', seller: '', status: '', approval: '', city: '' };

const APPROVAL = {
  PENDING: { label: 'Crédito pendente', tone: 'warning' as const },
  APPROVED: { label: 'Crédito aprovado', tone: 'success' as const },
  REJECTED: { label: 'Crédito reprovado', tone: 'danger' as const },
};

export function CustomersPage() {
  const nav = useNavigate();
  const { can } = useSession();
  const canEdit = can('customers.manage');
  const canRequest = !canEdit && can('customers.request');
  const [params, setParams] = useSearchParams();
  const tab = params.get('aba') === 'solicitacoes' ? 'requests' : 'customers';
  const { rows, loading } = useTable('customers');
  const { rows: requests } = useTable('customer_requests', { where: [['status', '==', 'PENDING']] });
  const crud = useCrud('customers');

  const [q, setQ] = useState('');
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [editing, setEditing] = useState<Customer | 'new' | null>(null);
  const [importing, setImporting] = useState(false);

  const setTab = (t: 'customers' | 'requests') => setParams(t === 'requests' ? { aba: 'solicitacoes' } : {}, { replace: true });
  const patchF = (p: Partial<Filters>) => setF((x) => ({ ...x, ...p }));
  const activeFilters = Object.values(f).filter(Boolean).length;

  const sellers = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((c) => c.sellerId && m.set(c.sellerId, c.sellerName || '—'));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [rows]);
  const cities = useMemo(() => Array.from(new Set(rows.map((c) => c.city).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'pt-BR')), [rows]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (c) =>
          (!f.category || c.category === f.category) &&
          (!f.ranking || c.ranking === f.ranking) &&
          (!f.seller || (f.seller === 'NONE' ? !c.sellerId : c.sellerId === f.seller)) &&
          (!f.status || c.status === f.status) &&
          (!f.approval || c.financialApproval === f.approval) &&
          (!f.city || c.city === f.city) &&
          matchesSearch([c.name, c.tradeName, c.document, c.code, c.city, c.contactName, c.email, c.sellerName], q),
      ),
    [rows, f, q],
  );

  const stats = useMemo(() => {
    const month = startOfMonth();
    const s = { active: 0, blocked: 0, newMonth: 0, gold: 0, silver: 0, bronze: 0, pending: 0 };
    for (const c of rows) {
      if (c.status === 'ACTIVE') s.active++;
      else s.blocked++;
      if (c.createdAt.slice(0, 10) >= month) s.newMonth++;
      if (c.ranking === 'GOLD') s.gold++;
      else if (c.ranking === 'SILVER') s.silver++;
      else s.bronze++;
      if (c.financialApproval === 'PENDING') s.pending++;
    }
    return s;
  }, [rows]);

  const toggleBlock = useAction((c: Customer) => crud.update(c.id, { status: c.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE' }), { success: 'Situação atualizada' });

  const columns: Column<Customer>[] = [
    {
      key: 'name',
      header: 'Cliente',
      mobile: 'title',
      sortValue: (c) => c.name,
      cell: (c) => (
        <div className="min-w-0 max-w-[320px]">
          <div className="font-medium text-fg truncate">{c.name}</div>
          <div className="text-xs text-muted truncate num">{[c.tradeName, formatDocument(c.document)].filter(Boolean).join(' · ')}</div>
        </div>
      ),
    },
    { key: 'city', header: 'Cidade', mobile: 'subtitle', sortValue: (c) => c.city || '', cell: (c) => <span className="whitespace-nowrap">{cityLabel(c)}</span> },
    { key: 'seller', header: 'Vendedor', hideBelow: 'lg', sortValue: (c) => c.sellerName || '', cell: (c) => <span className="whitespace-nowrap">{c.sellerName || <span className="text-subtle">Direta</span>}</span> },
    {
      key: 'ranking',
      header: 'Ranking',
      sortValue: (c) => c.totalPurchases,
      mobile: 'badge',
      cell: (c) => (
        <span className="inline-flex items-center gap-2">
          <Badge tone={RANKING[c.ranking].tone} dot>
            {RANKING[c.ranking].label}
          </Badge>
          <span className="max-md:hidden">
            <Stars value={c.stars} />
          </span>
        </span>
      ),
    },
    { key: 'total', header: 'Total comprado', align: 'right', sortValue: (c) => c.totalPurchases, cell: (c) => money(c.totalPurchases) },
    {
      key: 'last',
      header: 'Último pedido',
      hideBelow: 'md',
      sortValue: (c) => c.lastPurchaseAt || '',
      cell: (c) => (
        <div className="leading-tight">
          <div className="num">{c.lastPurchaseAt ? date(c.lastPurchaseAt) : '—'}</div>
          <div className="text-xs text-subtle num">{c.ordersCount} pedido(s)</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (c) => (
        <span className="inline-flex flex-wrap gap-1.5">
          {c.status === 'BLOCKED' ? (
            <Badge tone="danger" dot>
              Bloqueado
            </Badge>
          ) : (
            <Badge tone="success" dot>
              Ativo
            </Badge>
          )}
          {c.financialApproval !== 'APPROVED' && <Badge tone={APPROVAL[c.financialApproval].tone}>{APPROVAL[c.financialApproval].label}</Badge>}
        </span>
      ),
    },
  ];

  const doExport = () =>
    exportCsv('clientes', filtered, [
      { header: 'Código', value: (c) => c.code },
      { header: 'Razão social / nome', value: (c) => c.name },
      { header: 'Nome fantasia', value: (c) => c.tradeName },
      { header: 'Tipo', value: (c) => (c.personType === 'J' ? 'PJ' : 'PF') },
      { header: 'CPF/CNPJ', value: (c) => formatDocument(c.document) },
      { header: 'Inscrição estadual', value: (c) => c.stateRegistration },
      { header: 'Categoria', value: (c) => CUSTOMER_CATEGORY_LABELS[c.category] },
      { header: 'Segmento', value: (c) => c.segment },
      { header: 'Contato', value: (c) => c.contactName },
      { header: 'Celular', value: (c) => c.cellphone },
      { header: 'Telefone', value: (c) => c.phone },
      { header: 'E-mail', value: (c) => c.email },
      { header: 'E-mail financeiro', value: (c) => c.financialEmail },
      { header: 'CEP', value: (c) => c.zipCode },
      { header: 'Logradouro', value: (c) => c.street },
      { header: 'Número', value: (c) => c.number },
      { header: 'Complemento', value: (c) => c.complement },
      { header: 'Bairro', value: (c) => c.district },
      { header: 'Cidade', value: (c) => c.city },
      { header: 'UF', value: (c) => c.state },
      { header: 'Vendedor', value: (c) => c.sellerName },
      { header: 'Prazo', value: (c) => c.paymentTerms },
      { header: 'Forma preferida', value: (c) => (c.preferredPaymentMethod ? PAYMENT_METHOD_LABELS[c.preferredPaymentMethod] : '') },
      { header: 'Limite de crédito', value: (c) => c.creditLimit },
      { header: 'Aprovação financeira', value: (c) => APPROVAL[c.financialApproval].label },
      { header: 'Ranking', value: (c) => RANKING[c.ranking].label },
      { header: 'Estrelas', value: (c) => c.stars },
      { header: 'Total comprado', value: (c) => c.totalPurchases },
      { header: 'Pedidos', value: (c) => c.ordersCount },
      { header: 'Última compra', value: (c) => (c.lastPurchaseAt ? date(c.lastPurchaseAt) : '') },
      { header: 'Status', value: (c) => (c.status === 'ACTIVE' ? 'Ativo' : 'Bloqueado') },
    ]);

  return (
    <>
      <PageHeader
        eyebrow="Comercial"
        title="Clientes"
        subtitle="Cadastro, ranking, crédito e carteira dos vendedores."
        actions={
          <>
            <Button icon={<Download className="size-4" />} onClick={doExport} className="max-sm:hidden">
              Exportar
            </Button>
            {canEdit && (
              <Button icon={<FileUp className="size-4" />} onClick={() => setImporting(true)}>
                Importar
              </Button>
            )}
            {canEdit && (
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
                Novo cliente
              </Button>
            )}
            {canRequest && (
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => nav('/clientes/pre-cadastro')}>
                Pré-cadastrar cliente
              </Button>
            )}
          </>
        }
      />

      <StatGrid cols={4} className="mb-5">
        <Stat
          label="Ativos"
          value={stats.active}
          hint={stats.blocked ? `${stats.blocked} bloqueado(s)` : `${rows.length} no cadastro`}
          onClick={() => patchF({ status: f.status === 'ACTIVE' ? '' : 'ACTIVE' })}
        />
        <Stat label="Novos no mês" value={stats.newMonth} hint="desde o dia 1º" tone="info" />
        <RankingStat gold={stats.gold} silver={stats.silver} bronze={stats.bronze} value={f.ranking} onPick={(r) => patchF({ ranking: f.ranking === r ? '' : r })} />
        <Stat
          label="Crédito a aprovar"
          value={stats.pending}
          hint="com o financeiro"
          tone="warning"
          onClick={() => patchF({ approval: f.approval === 'PENDING' ? '' : 'PENDING' })}
        />
      </StatGrid>

      <Segmented
        className="mb-4"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'customers', label: 'Clientes', count: rows.length },
          { value: 'requests', label: 'Pré-cadastros', count: requests.length },
        ]}
      />

      {tab === 'requests' ? (
        <CustomerRequestsPanel />
      ) : (
        <>
          <Toolbar className="sm:items-start">
            <div className="flex gap-2 w-full sm:w-auto">
              <SearchInput value={q} onChange={setQ} placeholder="Buscar cliente, CNPJ, cidade…" className="flex-1 sm:w-72" />
              <div className="sm:hidden">
                <Button icon={<SlidersHorizontal className="size-4" />} onClick={() => setShowFilters((v) => !v)} variant={activeFilters ? 'subtle' : 'secondary'}>
                  {activeFilters ? `Filtros (${activeFilters})` : 'Filtros'}
                </Button>
              </div>
            </div>
            <div className={cn('grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center', !showFilters && 'max-sm:hidden')}>
              <Select className="sm:w-40" value={f.category} onChange={(v) => patchF({ category: v })} placeholder="Categoria: todas" options={optionsOf(CUSTOMER_CATEGORY_LABELS)} />
              <Select className="sm:w-40" value={f.ranking} onChange={(v) => patchF({ ranking: v })} placeholder="Ranking: todos" options={optionsOf(RANKING)} />
              <Select
                className="sm:w-44"
                value={f.seller}
                onChange={(v) => patchF({ seller: v })}
                placeholder="Vendedor: todos"
                options={[{ value: 'NONE', label: 'Sem vendedor (direta)' }, ...sellers.map(([id, name]) => ({ value: id, label: name }))]}
              />
              <Select
                className="sm:w-36"
                value={f.status}
                onChange={(v) => patchF({ status: v })}
                placeholder="Status: todos"
                options={[
                  { value: 'ACTIVE', label: 'Ativos' },
                  { value: 'BLOCKED', label: 'Bloqueados' },
                ]}
              />
              <Select
                className="sm:w-44"
                value={f.approval}
                onChange={(v) => patchF({ approval: v })}
                placeholder="Crédito: todos"
                options={[
                  { value: 'PENDING', label: 'Crédito pendente' },
                  { value: 'APPROVED', label: 'Crédito aprovado' },
                  { value: 'REJECTED', label: 'Crédito reprovado' },
                ]}
              />
              <Select className="sm:w-40" value={f.city} onChange={(v) => patchF({ city: v })} placeholder="Cidade: todas" options={cities.map((c) => ({ value: c, label: c }))} />
              {activeFilters > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setF(NO_FILTERS)}>
                  Limpar filtros
                </Button>
              )}
            </div>
          </Toolbar>

          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(c) => c.id}
            loading={loading}
            initialSort={{ key: 'total', dir: 'desc' }}
            onRowClick={(c) => nav(`/clientes/${c.id}`)}
            rowClassName={(c) => (c.status === 'BLOCKED' ? 'opacity-70' : undefined)}
            empty={
              !rows.length && !loading ? (
                <EmptyState
                  icon={<Users className="size-5" />}
                  title="Nenhum cliente cadastrado ainda"
                  description="Cadastre o primeiro cliente ou importe sua planilha."
                  action={
                    canEdit ? (
                      <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
                        Novo cliente
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <EmptyState title="Nenhum cliente encontrado" description="Ajuste a busca ou limpe os filtros." />
              )
            }
            rowActions={(c) => (
              <Menu
                items={[
                  { label: 'Abrir ficha', icon: <Eye />, onClick: () => nav(`/clientes/${c.id}`) },
                  { label: 'Novo pedido', icon: <ShoppingCart />, onClick: () => nav(`/vendas/nova?cliente=${c.id}`), hidden: !can('sales.create') || c.status === 'BLOCKED' },
                  { label: 'Editar cadastro', icon: <Edit3 />, onClick: () => setEditing(c), hidden: !canEdit },
                  'divider',
                  {
                    label: c.status === 'ACTIVE' ? 'Bloquear' : 'Desbloquear',
                    icon: c.status === 'ACTIVE' ? <Lock /> : <CheckCircle2 />,
                    onClick: () => void toggleBlock.run(c),
                    hidden: !canEdit,
                    danger: c.status === 'ACTIVE',
                  },
                ]}
              />
            )}
          />
          {filtered.length > 0 && (
            <p className="text-xs text-muted mt-3 num">
              {filtered.length} cliente(s) · {money(filtered.reduce((s, c) => s + (c.totalPurchases || 0), 0))} comprados no total
            </p>
          )}
        </>
      )}

      {editing && (
        <CustomerFormDrawer
          customer={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(id, isNew) => {
            setEditing(null);
            if (isNew) nav(`/clientes/${id}`);
          }}
        />
      )}
      {importing && <CustomerImportModal onClose={() => setImporting(false)} />}
    </>
  );
}

function RankingStat({
  gold,
  silver,
  bronze,
  value,
  onPick,
}: {
  gold: number;
  silver: number;
  bronze: number;
  value: Ranking | '';
  onPick: (r: Ranking) => void;
}) {
  const items: { r: Ranking; n: number }[] = [
    { r: 'GOLD', n: gold },
    { r: 'SILVER', n: silver },
    { r: 'BRONZE', n: bronze },
  ];
  return (
    <Card className="flex flex-col gap-2 min-w-0">
      <span className="text-xs font-medium text-muted uppercase tracking-wider truncate">Ranking</span>
      <div className="grid grid-cols-3 gap-1">
        {items.map(({ r, n }) => (
          <button
            key={r}
            type="button"
            onClick={() => onPick(r)}
            className={cn(
              'rounded-control px-1.5 py-1 text-left cursor-pointer transition-colors hover:bg-surface-2',
              value === r && 'bg-surface-2 ring-1 ring-border-strong',
            )}
          >
            <div className="text-xl sm:text-[22px] font-semibold text-fg leading-none num">{n}</div>
            <div className="mt-1">
              <Badge tone={RANKING[r].tone} size="xs" dot>
                {RANKING[r].label}
              </Badge>
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}

