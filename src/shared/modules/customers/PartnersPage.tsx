/**
 * MÓDULO DE REFERÊNCIA — Parceiros (CRUD simples).
 * Use este arquivo como modelo de estrutura para as demais telas:
 *  - PageHeader com ações; Toolbar com busca + filtro; DataTable responsiva;
 *  - formulário em Drawer; gravação via useCrud (sem regra de negócio) ou
 *    useOps (com regra); useAction para loading/toast; useConfirm p/ excluir.
 */
import { Download, Edit3, Handshake, Plus, Power, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSession } from '../../app/session';
import { useCrud, useAction, useTable } from '../../data/react';
import { formatDocument, matchesSearch } from '../../domain/format';
import { optionsOf, PARTNER_KIND_LABELS, UF_LIST } from '../../domain/labels';
import type { Partner, PartnerKind } from '../../domain/types';
import {
  Badge,
  Button,
  DataTable,
  Drawer,
  exportCsv,
  Field,
  FormGrid,
  Input,
  MaskedInput,
  Menu,
  PageHeader,
  SearchInput,
  Segmented,
  Select,
  Switch,
  Textarea,
  Toolbar,
  useConfirm,
  type Column,
} from '../../ui';

type Draft = Omit<Partner, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };

const EMPTY: Draft = {
  kind: 'CATTLE_SUPPLIER',
  name: '',
  tradeName: '',
  document: '',
  stateRegistration: '',
  inspection: null,
  contactName: '',
  phone: '',
  email: '',
  city: '',
  state: '',
  notes: '',
  active: true,
};

export function PartnersPage() {
  const { can } = useSession();
  const canEdit = can('partners.manage');
  const { rows, loading } = useTable('partners');
  const crud = useCrud('partners');
  const confirm = useConfirm();

  const [q, setQ] = useState('');
  const [kind, setKind] = useState<PartnerKind | 'ALL'>('ALL');
  const [draft, setDraft] = useState<Draft | null>(null);

  const filtered = useMemo(
    () =>
      rows
        .filter((p) => kind === 'ALL' || p.kind === kind)
        .filter((p) => matchesSearch([p.name, p.tradeName, p.document, p.city, p.contactName], q)),
    [rows, kind, q],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: rows.length };
    rows.forEach((r) => (c[r.kind] = (c[r.kind] || 0) + 1));
    return c;
  }, [rows]);

  const save = useAction(
    async (d: Draft) => {
      if (!d.name.trim()) throw new Error('Informe o nome.');
      const { id, ...data } = d;
      if (id) await crud.update(id, data);
      else await crud.insert(data);
    },
    { success: 'Parceiro salvo', onSuccess: () => setDraft(null) },
  );

  const toggle = useAction((p: Partner) => crud.update(p.id, { active: !p.active }), { success: 'Status atualizado' });
  const remove = useAction(async (p: Partner) => {
    if (await confirm({ title: `Excluir ${p.name}?`, message: 'Esta ação não pode ser desfeita.', danger: true, confirmLabel: 'Excluir' }))
      await crud.remove(p.id);
  });

  const columns: Column<Partner>[] = [
    {
      key: 'name',
      header: 'Nome',
      mobile: 'title',
      sortValue: (p) => p.name,
      cell: (p) => (
        <div className="min-w-0">
          <div className="font-medium text-fg truncate">{p.name}</div>
          {p.tradeName && <div className="text-xs text-muted truncate">{p.tradeName}</div>}
        </div>
      ),
    },
    { key: 'kind', header: 'Tipo', mobile: 'subtitle', sortValue: (p) => p.kind, cell: (p) => PARTNER_KIND_LABELS[p.kind] },
    { key: 'document', header: 'CPF/CNPJ', cell: (p) => <span className="num">{formatDocument(p.document) || '—'}</span>, hideBelow: 'md' },
    { key: 'city', header: 'Cidade', sortValue: (p) => p.city || '', cell: (p) => (p.city ? `${p.city}${p.state ? '/' + p.state : ''}` : '—'), hideBelow: 'lg' },
    { key: 'contact', header: 'Contato', cell: (p) => p.contactName || p.phone || '—', hideBelow: 'lg' },
    {
      key: 'status',
      header: 'Status',
      mobile: 'badge',
      cell: (p) => (
        <span className="inline-flex gap-1.5">
          {p.inspection && <Badge tone="info">{p.inspection}</Badge>}
          <Badge tone={p.active ? 'success' : 'neutral'} dot>
            {p.active ? 'Ativo' : 'Inativo'}
          </Badge>
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Comercial"
        title="Parceiros"
        subtitle="Fornecedores de gado, frigoríficos, desossas, transportadoras e demais parceiros."
        actions={
          <>
            <Button
              icon={<Download className="size-4" />}
              onClick={() =>
                exportCsv('parceiros', filtered, [
                  { header: 'Nome', value: (p) => p.name },
                  { header: 'Tipo', value: (p) => PARTNER_KIND_LABELS[p.kind] },
                  { header: 'Documento', value: (p) => p.document },
                  { header: 'Cidade', value: (p) => p.city },
                  { header: 'UF', value: (p) => p.state },
                  { header: 'Telefone', value: (p) => p.phone },
                  { header: 'E-mail', value: (p) => p.email },
                ])
              }
            >
              Exportar
            </Button>
            {canEdit && (
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setDraft({ ...EMPTY })}>
                Novo parceiro
              </Button>
            )}
          </>
        }
      />

      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar por nome, documento, cidade…" className="sm:w-80" />
        <Segmented
          size="sm"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'ALL', label: 'Todos', count: counts.ALL },
            { value: 'CATTLE_SUPPLIER', label: 'Gado', count: counts.CATTLE_SUPPLIER || 0 },
            { value: 'SLAUGHTERHOUSE', label: 'Frigoríficos', count: counts.SLAUGHTERHOUSE || 0 },
            { value: 'PROCESSOR', label: 'Desossa', count: counts.PROCESSOR || 0 },
            { value: 'CARRIER', label: 'Transporte', count: counts.CARRIER || 0 },
          ]}
        />
      </Toolbar>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(p) => p.id}
        loading={loading}
        initialSort={{ key: 'name', dir: 'asc' }}
        onRowClick={canEdit ? (p) => setDraft({ ...EMPTY, ...p }) : undefined}
        emptyTitle="Nenhum parceiro encontrado"
        emptyDescription={q ? 'Tente outra busca.' : 'Cadastre fornecedores, frigoríficos e transportadoras.'}
        empty={
          !rows.length && !loading ? (
            <div className="py-12 text-center">
              <Handshake className="size-8 mx-auto text-subtle mb-3" />
              <p className="text-sm text-muted">Nenhum parceiro cadastrado ainda.</p>
            </div>
          ) : undefined
        }
        rowActions={
          canEdit
            ? (p) => (
                <Menu
                  items={[
                    { label: 'Editar', icon: <Edit3 />, onClick: () => setDraft({ ...EMPTY, ...p }) },
                    { label: p.active ? 'Desativar' : 'Ativar', icon: <Power />, onClick: () => void toggle.run(p) },
                    'divider',
                    { label: 'Excluir', icon: <Trash2 />, danger: true, onClick: () => void remove.run(p) },
                  ]}
                />
              )
            : undefined
        }
      />

      <Drawer
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Editar parceiro' : 'Novo parceiro'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button variant="primary" loading={save.running} onClick={() => draft && void save.run(draft)}>
              Salvar
            </Button>
          </>
        }
      >
        {draft && (
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              void save.run(draft);
            }}
          >
            <FormGrid>
              <Field label="Tipo" required>
                <Select value={draft.kind} onChange={(v) => setDraft({ ...draft, kind: v })} options={optionsOf(PARTNER_KIND_LABELS)} />
              </Field>
              {(draft.kind === 'SLAUGHTERHOUSE' || draft.kind === 'PROCESSOR') && (
                <Field label="Inspeção">
                  <Select
                    value={draft.inspection || ''}
                    onChange={(v) => setDraft({ ...draft, inspection: (v || null) as Partner['inspection'] })}
                    placeholder="—"
                    options={[
                      { value: 'SIF', label: 'SIF (federal)' },
                      { value: 'SIE', label: 'SIE (estadual)' },
                      { value: 'SIM', label: 'SIM (municipal)' },
                    ]}
                  />
                </Field>
              )}
              <Field label="Razão social / nome" required span="full">
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus />
              </Field>
              <Field label="Nome fantasia">
                <Input value={draft.tradeName || ''} onChange={(e) => setDraft({ ...draft, tradeName: e.target.value })} />
              </Field>
              <Field label="CPF / CNPJ">
                <MaskedInput mask="document" value={draft.document} onChange={(v) => setDraft({ ...draft, document: v })} />
              </Field>
              <Field label="Contato">
                <Input value={draft.contactName || ''} onChange={(e) => setDraft({ ...draft, contactName: e.target.value })} />
              </Field>
              <Field label="Telefone">
                <MaskedInput mask="phone" value={draft.phone} onChange={(v) => setDraft({ ...draft, phone: v })} />
              </Field>
              <Field label="E-mail" span="full">
                <Input type="email" value={draft.email || ''} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
              </Field>
              <Field label="Cidade">
                <Input value={draft.city || ''} onChange={(e) => setDraft({ ...draft, city: e.target.value })} />
              </Field>
              <Field label="UF">
                <Select value={draft.state || ''} onChange={(v) => setDraft({ ...draft, state: v })} placeholder="—" options={UF_LIST.map((u) => ({ value: u, label: u }))} />
              </Field>
              <Field label="Observações" span="full">
                <Textarea value={draft.notes || ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
              </Field>
            </FormGrid>
            <Switch checked={draft.active} onChange={(v) => setDraft({ ...draft, active: v })} label="Parceiro ativo" description="Inativos não aparecem nas listas de seleção." />
            <button type="submit" hidden />
          </form>
        )}
      </Drawer>
    </>
  );
}
