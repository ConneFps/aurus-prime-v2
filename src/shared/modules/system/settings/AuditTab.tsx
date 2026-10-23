import { Download, ScrollText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTable } from '../../../data/react';
import { dateTime, matchesSearch } from '../../../domain/format';
import type { AuditLog } from '../../../domain/types';
import { Button, DataTable, DateInput, DescriptionList, exportCsv, Field, Modal, SearchInput, Select, StatusBadge, type Column } from '../../../ui';
import { AUDIT_ACTIONS, auditActionInfo, entityLabel } from '../audit';
import { localDay } from '../reports/data';

export function AuditTab() {
  const { rows, loading } = useTable('audit_logs');
  const [q, setQ] = useState('');
  const [user, setUser] = useState('');
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [open, setOpen] = useState<AuditLog | null>(null);

  const users = useMemo(() => [...new Set(rows.map((r) => r.userName || r.userEmail || 'Sistema'))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [rows]);
  const entities = useMemo(() => [...new Set(rows.map((r) => r.entity).filter(Boolean))].map((e) => ({ value: e, label: entityLabel(e) })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')), [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        const day = localDay(r.at);
        return (
          (!user || (r.userName || r.userEmail || 'Sistema') === user) &&
          (!action || r.action === action) &&
          (!entity || r.entity === entity) &&
          (!from || day >= from) &&
          (!to || day <= to) &&
          matchesSearch([r.summary, r.userName, r.userEmail, r.entityId, entityLabel(r.entity)], q)
        );
      }),
    [rows, user, action, entity, from, to, q],
  );

  const columns: Column<AuditLog>[] = [
    { key: 'at', header: 'Data e hora', sortValue: (r) => r.at, cell: (r) => <span className="num whitespace-nowrap">{dateTime(r.at)}</span>, mobile: 'subtitle' },
    { key: 'user', header: 'Usuário', sortValue: (r) => r.userName || '', cell: (r) => r.userName || r.userEmail || 'Sistema', hideBelow: 'md' },
    { key: 'action', header: 'Ação', sortValue: (r) => r.action, cell: (r) => <StatusBadge info={auditActionInfo(r.action)} />, mobile: 'badge' },
    { key: 'entity', header: 'Área', sortValue: (r) => entityLabel(r.entity), cell: (r) => entityLabel(r.entity), hideBelow: 'lg' },
    { key: 'summary', header: 'Resumo', cell: (r) => <span className="line-clamp-2">{r.summary}</span>, mobile: 'title' },
  ];

  return (
    <>
      <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 items-end mb-4">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar no resumo…" className="lg:col-span-2" />
        <Select value={user} onChange={setUser} options={[{ value: '', label: 'Todos os usuários' }, ...users.map((u) => ({ value: u, label: u }))]} />
        <Select value={action} onChange={setAction} options={[{ value: '', label: 'Todas as ações' }, ...Object.entries(AUDIT_ACTIONS).map(([v, i]) => ({ value: v, label: i.label }))]} />
        <Select value={entity} onChange={setEntity} options={[{ value: '', label: 'Todas as áreas' }, ...entities]} />
        <Button
          icon={<Download className="size-4" />}
          disabled={!filtered.length}
          onClick={() =>
            exportCsv('auditoria', filtered, [
              { header: 'Data e hora', value: (r) => dateTime(r.at) },
              { header: 'Usuário', value: (r) => r.userName || r.userEmail },
              { header: 'E-mail', value: (r) => r.userEmail },
              { header: 'Ação', value: (r) => auditActionInfo(r.action).label },
              { header: 'Área', value: (r) => entityLabel(r.entity) },
              { header: 'Registro', value: (r) => r.entityId },
              { header: 'Resumo', value: (r) => r.summary },
              { header: 'Dados', value: (r) => (r.data ? JSON.stringify(r.data) : '') },
            ])
          }
        >
          Exportar
        </Button>
        <Field label="De" className="lg:col-start-1">
          <DateInput value={from} onChange={setFrom} />
        </Field>
        <Field label="Até">
          <DateInput value={to} onChange={setTo} />
        </Field>
        <p className="text-xs text-subtle sm:col-span-2 lg:col-span-4 lg:text-right pb-2.5 num">
          {filtered.length} de {rows.length} registros
        </p>
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.id}
        loading={loading}
        initialSort={{ key: 'at', dir: 'desc' }}
        onRowClick={setOpen}
        emptyTitle="Nenhum registro de auditoria"
        emptyDescription="Ajuste os filtros. Ações importantes (aprovações, pagamentos, estornos, exclusões) ficam registradas aqui."
      />

      <Modal open={!!open} onClose={() => setOpen(null)} title="Registro de auditoria" size="lg" footer={<Button onClick={() => setOpen(null)}>Fechar</Button>}>
        {open && (
          <div className="space-y-5">
            <DescriptionList
              items={[
                { label: 'Data e hora', value: <span className="num">{dateTime(open.at)}</span> },
                { label: 'Ação', value: <StatusBadge info={auditActionInfo(open.action)} /> },
                { label: 'Usuário', value: open.userName || 'Sistema' },
                { label: 'E-mail', value: open.userEmail || '—' },
                { label: 'Área', value: entityLabel(open.entity) },
                { label: 'Registro (id)', value: <span className="num text-xs break-all">{open.entityId || '—'}</span> },
                { label: 'Resumo', value: open.summary, span: true },
              ]}
            />
            <div>
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-subtle font-medium mb-1.5">
                <ScrollText className="size-3.5" /> Dados registrados
              </div>
              {open.data && Object.keys(open.data).length ? (
                <pre className="rounded-control bg-surface-2 border border-border p-3 text-xs text-fg overflow-auto max-h-80 num whitespace-pre-wrap break-all">
                  {JSON.stringify(open.data, null, 2)}
                </pre>
              ) : (
                <p className="text-sm text-subtle">Sem dados adicionais.</p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
