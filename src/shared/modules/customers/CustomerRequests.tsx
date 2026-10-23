/**
 * Pré-cadastros de clientes (vendedores internos e externos): o financeiro
 * confere, define limite/condição/forma de pagamento e LIBERA (cria o cliente)
 * ou BLOQUEIA com motivo.
 */
import { Ban, Check, Inbox } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOps, useSession } from '../../app/session';
import { useAction, useTable } from '../../data/react';
import { date, dateTime, formatDocument, matchesSearch, money } from '../../domain/format';
import { PAYMENT_METHOD_LABELS } from '../../domain/labels';
import type { CustomerRequest } from '../../domain/types';
import { Badge, Button, Callout, DataTable, Drawer, EmptyState, Field, FormSection, SearchInput, Segmented, Textarea, toast, Toolbar, usePrompt, type Column } from '../../ui';
import { CustomerFields, validateCustomer } from './CustomerForm';
import { cityLabel, draftFromRequest, draftToRow, findDuplicate, type CustomerDraft } from './helpers';

export const REQUEST_STATUS = {
  PENDING: { label: 'Aguardando financeiro', tone: 'warning' as const },
  APPROVED: { label: 'Liberado', tone: 'success' as const },
  BLOCKED: { label: 'Bloqueado', tone: 'danger' as const },
  REJECTED: { label: 'Recusado', tone: 'danger' as const },
};

/** "À vista" e afins viram condição vazia (= à vista) no cadastro do cliente. */
function termsForCustomer(t: string | null | undefined): string {
  const v = (t || '').trim();
  return /^(a|à)\s*vista$/i.test(v) ? '' : v.replace(/\s*dias?$/i, '').trim();
}

export function CustomerRequestsPanel() {
  const { can } = useSession();
  const canRelease = can('customers.approveFinancial');
  const { rows, loading } = useTable('customer_requests');
  const { rows: customers } = useTable('customers');
  const [status, setStatus] = useState<'PENDING' | 'APPROVED' | 'BLOCKED' | 'ALL'>('PENDING');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<CustomerRequest | null>(null);

  const counts = useMemo(() => {
    const c = { PENDING: 0, APPROVED: 0, BLOCKED: 0, ALL: rows.length };
    rows.forEach((r) => (c[r.status === 'REJECTED' ? 'BLOCKED' : r.status] += 1));
    return c;
  }, [rows]);

  const filtered = useMemo(
    () =>
      rows
        .filter((r) => status === 'ALL' || r.status === status || (status === 'BLOCKED' && r.status === 'REJECTED'))
        .filter((r) => matchesSearch([r.name, r.tradeName, r.document, r.city, r.requestedByName], q))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [rows, status, q],
  );

  const columns: Column<CustomerRequest>[] = [
    {
      key: 'name',
      header: 'Cliente solicitado',
      mobile: 'title',
      sortValue: (r) => r.name,
      cell: (r) => (
        <div className="min-w-0">
          <div className="font-medium text-fg truncate">{r.name}</div>
          {r.tradeName && <div className="text-xs text-muted truncate">{r.tradeName}</div>}
        </div>
      ),
    },
    {
      key: 'doc',
      header: 'Documento',
      cell: (r) => {
        const dup = r.status === 'PENDING' ? findDuplicate(customers, r.document) : null;
        return (
          <span className="inline-flex items-center gap-1.5">
            <span className="num">{formatDocument(r.document)}</span>
            {dup && <Badge tone="danger">já cadastrado</Badge>}
          </span>
        );
      },
    },
    { key: 'city', header: 'Cidade', hideBelow: 'lg', cell: (r) => cityLabel(r) },
    { key: 'by', header: 'Vendedor', mobile: 'subtitle', sortValue: (r) => r.requestedByName, cell: (r) => r.requestedByName },
    {
      key: 'limit',
      header: 'Limite',
      align: 'right',
      hideBelow: 'lg',
      sortValue: (r) => r.financialApproval?.creditLimit ?? r.suggestedCreditLimit ?? 0,
      cell: (r) =>
        r.financialApproval ? (
          <span className="num">{money(r.financialApproval.creditLimit)}</span>
        ) : r.suggestedCreditLimit ? (
          <span className="num text-muted" title="Sugerido pelo vendedor">
            {money(r.suggestedCreditLimit)} (sug.)
          </span>
        ) : (
          <span className="text-subtle">—</span>
        ),
    },
    { key: 'at', header: 'Enviada em', sortValue: (r) => r.createdAt, cell: (r) => <span className="num">{date(r.createdAt)}</span> },
    {
      key: 'status',
      header: 'Status',
      mobile: 'badge',
      cell: (r) => (
        <Badge tone={REQUEST_STATUS[r.status].tone} dot>
          {REQUEST_STATUS[r.status].label}
        </Badge>
      ),
    },
  ];

  return (
    <>
      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar solicitação…" className="sm:w-72" />
        <Segmented
          size="sm"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'PENDING', label: 'Aguardando', count: counts.PENDING },
            { value: 'APPROVED', label: 'Liberados', count: counts.APPROVED },
            { value: 'BLOCKED', label: 'Bloqueados', count: counts.BLOCKED },
            { value: 'ALL', label: 'Todos', count: counts.ALL },
          ]}
        />
      </Toolbar>
      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.id}
        loading={loading}
        onRowClick={setOpen}
        initialSort={{ key: 'at', dir: 'desc' }}
        empty={
          <EmptyState
            icon={<Inbox className="size-5" />}
            title={status === 'PENDING' ? 'Nenhum pré-cadastro aguardando' : 'Nenhum pré-cadastro'}
            description="Os vendedores fazem o pré-cadastro do cliente e o financeiro libera o crédito aqui."
          />
        }
      />
      {open && <RequestReviewDrawer request={open} canRelease={canRelease} onClose={() => setOpen(null)} />}
    </>
  );
}

function RequestReviewDrawer({ request, canRelease, onClose }: { request: CustomerRequest; canRelease: boolean; onClose: () => void }) {
  const ops = useOps();
  const nav = useNavigate();
  const prompt = usePrompt();
  const { rows: customers } = useTable('customers');
  const [draft, setDraft] = useState<CustomerDraft>(() => ({
    ...draftFromRequest(request),
    creditLimit: request.suggestedCreditLimit ?? 0,
    paymentTerms: termsForCustomer(request.suggestedPaymentTerms),
  }));
  const [financeNotes, setFinanceNotes] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const set = (p: Partial<CustomerDraft>) => setDraft((d) => ({ ...d, ...p }));
  const { errors, duplicate } = validateCustomer(draft, customers);
  const pending = request.status === 'PENDING';
  const editable = pending && canRelease;
  const release = request.financialApproval;

  const approve = useAction(
    async () => {
      setShowErrors(true);
      // CPF/CNPJ já cadastrado não impede: a liberação reativa o cliente existente.
      const first = Object.entries(errors).find(([k]) => !(k === 'document' && duplicate))?.[1];
      if (first) throw new Error(first);
      const { documents: _d, ...overrides } = draftToRow(draft);
      return ops.approveCustomerRequest(request.id, overrides, {
        creditLimit: draft.creditLimit || 0,
        paymentTerms: draft.paymentTerms || null,
        paymentMethod: draft.preferredPaymentMethod ?? null,
        notes: financeNotes.trim() || null,
      });
    },
    {
      success: 'Cliente liberado pelo financeiro',
      onSuccess: (id) => {
        onClose();
        nav(`/clientes/${id}`);
      },
    },
  );

  const block = useAction(
    async () => {
      const reason = await prompt({
        title: `Bloquear ${request.tradeName || request.name}?`,
        message: `O vendedor ${request.requestedByName} verá o motivo. Se o cliente já estiver cadastrado, ele também fica bloqueado.`,
        label: 'Motivo do bloqueio',
        placeholder: 'Ex.: restrição no CNPJ, protestos, documentação incompleta…',
        confirmLabel: 'Bloquear',
        danger: true,
      });
      if (!reason) return false;
      await ops.blockCustomerRequest(request.id, reason);
      toast.success('Pré-cadastro bloqueado');
      return true;
    },
    { onSuccess: (ok) => ok && onClose() },
  );

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      title={pending ? 'Liberação de pré-cadastro' : 'Pré-cadastro de cliente'}
      description={`Enviada por ${request.requestedByName} em ${dateTime(request.createdAt)}`}
      footer={
        editable ? (
          <>
            <Button variant="ghost" icon={<Ban className="size-4" />} loading={block.running} onClick={() => void block.run()}>
              Bloquear
            </Button>
            <Button variant="primary" icon={<Check className="size-4" />} loading={approve.running} onClick={() => void approve.run()}>
              {duplicate ? 'Liberar cliente existente' : 'Liberar cliente'}
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>Fechar</Button>
        )
      }
    >
      <div className="space-y-5">
        {(request.status === 'REJECTED' || request.status === 'BLOCKED') && (
          <Callout tone="danger" title={`${request.status === 'BLOCKED' ? 'Bloqueado' : 'Recusado'} por ${request.reviewedByName || '—'} em ${dateTime(request.reviewedAt)}`}>
            {request.blockReason || request.rejectionReason}
          </Callout>
        )}
        {request.status === 'APPROVED' && (
          <Callout
            tone="success"
            title={`Liberado por ${request.reviewedByName || '—'} em ${dateTime(request.reviewedAt)}`}
            action={
              request.createdCustomerId ? (
                <Button size="sm" onClick={() => nav(`/clientes/${request.createdCustomerId}`)}>
                  Abrir cliente
                </Button>
              ) : undefined
            }
          >
            {release && (
              <span className="num">
                Limite {money(release.creditLimit)} · {release.paymentTerms || 'à vista'}
                {release.paymentMethod ? ` · ${PAYMENT_METHOD_LABELS[release.paymentMethod]}` : ''}
                {release.notes ? ` — ${release.notes}` : ''}
              </span>
            )}
          </Callout>
        )}
        {(request.suggestedCreditLimit || request.suggestedPaymentTerms) && (
          <Callout tone="info" title={`Sugestão de ${request.requestedByName}`}>
            <span className="num">
              Limite {request.suggestedCreditLimit ? money(request.suggestedCreditLimit) : '—'} · Condição {request.suggestedPaymentTerms || '—'}
            </span>
          </Callout>
        )}
        {editable && (
          <Callout tone="info">
            Confira os dados e ajuste o <strong>Financeiro</strong> (limite, condição e forma de pagamento) antes de liberar. O cliente entra na carteira de{' '}
            <strong>{request.requestedByName}</strong> já com o crédito aprovado.
          </Callout>
        )}
        {pending && !canRelease && <Callout tone="warning">Aguardando a análise do financeiro.</Callout>}
        {request.notes && <Callout tone="info" title="Observação do vendedor">{request.notes}</Callout>}
        <fieldset disabled={!editable} className="disabled:opacity-90">
          <CustomerFields
            draft={draft}
            set={set}
            mode="request"
            errors={showErrors ? errors : { document: duplicate ? errors.document : undefined }}
            duplicate={pending ? duplicate : null}
          />
        </fieldset>
        {editable && (
          <FormSection title="Observação do financeiro" description="Fica registrada no pré-cadastro e na ficha do cliente.">
            <Field label="Observação">
              <Textarea rows={2} value={financeNotes} onChange={(e) => setFinanceNotes(e.target.value)} placeholder="Ex.: limite revisto em 90 dias; exigir boleto." />
            </Field>
          </FormSection>
        )}
      </div>
    </Drawer>
  );
}
