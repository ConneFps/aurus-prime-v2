/**
 * Etapa 1 — cliente, crédito e tabela de preço.
 */
import { ExternalLink } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatDocument, money, percent } from '../../../domain/format';
import { COMPANY_LABELS, optionsOf, RANKING } from '../../../domain/labels';
import type { CompanyCode, Customer, PriceTable } from '../../../domain/types';
import { Badge, Callout, Combobox, Field, FormGrid, Progress, Select, Stars, type ComboOption } from '../../../ui';
import type { Draft } from './draft';
import { Section } from './Section';

export interface CreditInfo {
  open: number;
  limit: number;
  /** Em aberto + este pedido. */
  exposure: number;
  exceeded: boolean;
}

export function CustomerSection({
  draft,
  patch,
  onCustomer,
  onPriceTable,
  options,
  customers,
  customer,
  tables,
  credit,
  lockCustomer,
}: {
  draft: Draft;
  patch: (p: Partial<Draft>) => void;
  onCustomer: (id: string | null) => void;
  onPriceTable: (id: string | null) => void;
  options: ComboOption[];
  customers: Customer[];
  customer: Customer | null;
  tables: PriceTable[];
  credit: CreditInfo;
  lockCustomer?: boolean;
}) {
  const byId = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const richOptions = useMemo<ComboOption[]>(
    () =>
      options.map((o) => {
        const c = byId.get(o.value);
        if (!c) return o;
        return {
          ...o,
          description: [o.description, c.creditLimit ? `limite ${money(c.creditLimit)}` : null].filter(Boolean).join(' · '),
          right:
            c.status === 'BLOCKED' ? (
              <Badge tone="danger" size="xs">
                Bloqueado
              </Badge>
            ) : c.financialApproval !== 'APPROVED' ? (
              <Badge tone="warning" size="xs">
                Crédito {c.financialApproval === 'REJECTED' ? 'recusado' : 'pendente'}
              </Badge>
            ) : (
              <Badge tone={RANKING[c.ranking].tone} size="xs">
                {RANKING[c.ranking].label}
              </Badge>
            ),
        };
      }),
    [options, byId],
  );

  const tableOptions = useMemo(() => {
    const usable = tables.filter((t) => t.status === 'ACTIVE' && t.approvalStatus === 'APPROVED');
    const cur = tables.find((t) => t.id === draft.priceTableId);
    const list = cur && !usable.includes(cur) ? [cur, ...usable] : usable;
    return list.map((t) => ({
      value: t.id,
      label: `${t.name}${t.id === customer?.priceTableId ? ' (padrão do cliente)' : ''}${t.approvalStatus !== 'APPROVED' ? ' — não aprovada' : ''}`,
    }));
  }, [tables, draft.priceTableId, customer?.priceTableId]);

  const usedPct = credit.limit > 0 ? (credit.exposure / credit.limit) * 100 : 0;

  return (
    <Section step={1} title="Cliente" subtitle="Quem está comprando e com qual tabela de preços.">
      <Field label="Cliente" required>
        <Combobox
          value={draft.customerId}
          onChange={(v) => onCustomer(v)}
          options={richOptions}
          placeholder="Buscar cliente por nome, CNPJ/CPF ou código…"
          disabled={lockCustomer}
        />
      </Field>

      {customer && (
        <div className="rounded-card border border-border bg-surface-2/50 p-3 sm:p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={RANKING[customer.ranking].tone} dot>
              {RANKING[customer.ranking].label}
            </Badge>
            <Stars value={customer.stars} />
            {customer.isIntercompany && <Badge tone="info">Intercompany</Badge>}
            <span className="text-xs text-muted num">{formatDocument(customer.document)}</span>
            <Link to={`/clientes/${customer.id}`} target="_blank" className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline">
              Ver cadastro <ExternalLink className="size-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Info label="Limite de crédito" value={customer.creditLimit ? money(customer.creditLimit) : 'Sem limite'} />
            <Info label="Em aberto" value={money(credit.open)} tone={credit.open > 0 ? 'text-warning' : undefined} />
            <Info
              label="Disponível"
              value={customer.creditLimit ? money(Math.max(0, customer.creditLimit - credit.exposure)) : '—'}
              tone={credit.exceeded ? 'text-danger' : 'text-success'}
            />
            <Info
              label="Aprovação financeira"
              value={
                <Badge tone={customer.financialApproval === 'APPROVED' ? 'success' : customer.financialApproval === 'REJECTED' ? 'danger' : 'warning'} dot>
                  {customer.financialApproval === 'APPROVED' ? 'Aprovado' : customer.financialApproval === 'REJECTED' ? 'Recusado' : 'Pendente'}
                </Badge>
              }
            />
          </div>
          {customer.creditLimit > 0 && (
            <div>
              <Progress value={credit.exposure} max={customer.creditLimit} tone={credit.exceeded ? 'danger' : usedPct > 80 ? 'warning' : 'success'} />
              <div className="text-[11px] text-muted mt-1 num">{percent(usedPct, 0)} do limite com este pedido</div>
            </div>
          )}
        </div>
      )}

      {customer?.status === 'BLOCKED' && (
        <Callout tone="danger" title="Cliente bloqueado">
          Regularize o cadastro antes de vender para {customer.name}.
        </Callout>
      )}
      {customer && customer.status !== 'BLOCKED' && customer.financialApproval !== 'APPROVED' && (
        <Callout tone="warning" title={customer.financialApproval === 'REJECTED' ? 'Crédito recusado pelo financeiro' : 'Crédito ainda não aprovado pelo financeiro'}>
          {customer.financialApprovalNotes || 'O pedido pode ser registrado, mas prefira pagamento antecipado (Pix) até a aprovação.'}
        </Callout>
      )}
      {customer && credit.exceeded && (
        <Callout tone="warning" title="Limite de crédito estourado">
          Em aberto {money(credit.open)} + este pedido = {money(credit.exposure)}, acima do limite de {money(credit.limit)} (excede{' '}
          {money(credit.exposure - credit.limit)}).
        </Callout>
      )}

      <FormGrid>
        <Field label="Tabela de preço" hint={!tableOptions.length ? 'Nenhuma tabela aprovada — os preços vêm do cadastro do produto.' : undefined}>
          <Select value={draft.priceTableId || ''} onChange={(v) => onPriceTable(v || null)} placeholder="Preço do cadastro do produto" options={tableOptions} />
        </Field>
        {(customer?.isIntercompany || draft.channel === 'INTERCOMPANY') && (
          <Field label="Empresa emitente" hint="Empresa do grupo que fatura esta venda.">
            <Select
              value={draft.company || ''}
              onChange={(v) => patch({ company: (v || null) as CompanyCode | null })}
              placeholder="—"
              options={optionsOf(COMPANY_LABELS).filter((o) => o.value !== customer?.intercompanyCode)}
            />
          </Field>
        )}
      </FormGrid>
    </Section>
  );
}

function Info({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-subtle font-medium">{label}</div>
      <div className={`mt-0.5 num font-medium truncate ${tone || 'text-fg'}`}>{value}</div>
    </div>
  );
}
