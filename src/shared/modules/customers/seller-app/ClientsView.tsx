/**
 * Clientes do vendedor externo: somente a própria carteira + solicitações de cadastro.
 */
import { Mail, MapPin, MessageCircle, Phone, ShoppingCart, UserPlus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { date, dateTime, formatDocument, formatPhone, matchesSearch, money, relativeDays } from '../../../domain/format';
import { PAYMENT_METHOD_LABELS, RANKING } from '../../../domain/labels';
import type { Customer } from '../../../domain/types';
import { Badge, Button, Callout, Card, CardHeader, DescriptionList, EmptyState, PageHeader, PageLoader, SearchInput, Segmented, Stars } from '../../../ui';
import { REQUEST_STATUS } from '../CustomerRequests';
import { addressLine, cityLabel, displayName, isCounted, telUrl, whatsappUrl } from '../helpers';
import { ListCard, OrderRow, SectionTitle, useMyCustomers, useMyRequests, useMySales } from './shared';

export function ClientsView() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('aba') === 'solicitacoes' ? 'requests' : 'clients';
  const { rows: customers, loading } = useMyCustomers();
  const { rows: requests } = useMyRequests();
  const [q, setQ] = useState('');

  const list = useMemo(
    () =>
      customers
        .filter((c) => matchesSearch([c.name, c.tradeName, c.document, c.city, c.district, c.contactName], q))
        .sort((a, b) => displayName(a).localeCompare(displayName(b), 'pt-BR')),
    [customers, q],
  );
  const reqs = useMemo(
    () => requests.filter((r) => matchesSearch([r.name, r.tradeName, r.document, r.city], q)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [requests, q],
  );

  return (
    <>
      <PageHeader
        title="Meus clientes"
        subtitle="Somente os clientes da sua carteira. Precisa de um cliente novo? Solicite o cadastro."
        actions={
          <Link to="/clientes/solicitar">
            <Button variant="primary" icon={<UserPlus className="size-4" />}>
              Solicitar novo cliente
            </Button>
          </Link>
        }
      />
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <Segmented
          value={tab}
          onChange={(v) => setParams(v === 'requests' ? { aba: 'solicitacoes' } : {}, { replace: true })}
          options={[
            { value: 'clients', label: 'Carteira', count: customers.length },
            { value: 'requests', label: 'Solicitações', count: requests.length },
          ]}
        />
        <SearchInput value={q} onChange={setQ} placeholder={tab === 'clients' ? 'Buscar cliente, cidade, CNPJ…' : 'Buscar solicitação…'} className="sm:w-72" />
      </div>

      {tab === 'clients' ? (
        list.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {list.map((c) => (
              <ClientCard key={c.id} c={c} />
            ))}
          </div>
        ) : (
          <ListCard>
            <EmptyState
              icon={<Users className="size-5" />}
              title={loading ? 'Carregando…' : q ? 'Nenhum cliente encontrado' : 'Sua carteira está vazia'}
              description={q ? 'Tente outra busca.' : 'Solicite o cadastro de um cliente — depois de aprovado ele aparece aqui.'}
            />
          </ListCard>
        )
      ) : reqs.length ? (
        <ListCard>
          {reqs.map((r) => (
            <div key={r.id} className="px-4 py-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-fg truncate">{r.tradeName || r.name}</div>
                  <div className="text-xs text-muted truncate num">
                    {formatDocument(r.document)} · {cityLabel(r)}
                  </div>
                </div>
                <Badge tone={REQUEST_STATUS[r.status].tone} dot>
                  {REQUEST_STATUS[r.status].label}
                </Badge>
              </div>
              {(r.status === 'REJECTED' || r.status === 'BLOCKED') && (r.blockReason || r.rejectionReason) && (
                <div className="text-sm rounded-control bg-danger-soft px-3 py-2 text-fg">
                  <span className="font-medium">Motivo:</span> {r.blockReason || r.rejectionReason}
                </div>
              )}
              {r.status === 'APPROVED' && (
                <div className="text-xs text-muted">
                  Aprovada por {r.reviewedByName || '—'} em {dateTime(r.reviewedAt)}
                  {r.createdCustomerId && (
                    <>
                      {' · '}
                      <Link to={`/clientes/${r.createdCustomerId}`} className="text-primary hover:underline">
                        abrir cliente
                      </Link>
                    </>
                  )}
                </div>
              )}
              {r.status === 'PENDING' && <div className="text-xs text-muted">Enviada em {date(r.createdAt)} — a equipe interna está analisando.</div>}
            </div>
          ))}
        </ListCard>
      ) : (
        <ListCard>
          <EmptyState
            icon={<UserPlus className="size-5" />}
            title="Nenhuma solicitação"
            description="Quando você pedir o cadastro de um cliente, acompanhe aqui a aprovação."
            action={
              <Link to="/clientes/solicitar">
                <Button>Solicitar novo cliente</Button>
              </Link>
            }
          />
        </ListCard>
      )}
    </>
  );
}

function ContactButtons({ c, compact }: { c: Customer; compact?: boolean }) {
  const phone = c.cellphone || c.phone;
  const tel = telUrl(phone);
  const wa = whatsappUrl(c.cellphone || c.phone, `Olá ${c.contactName?.split(' ')[0] || ''}! `);
  const size = compact ? 'sm' : 'md';
  return (
    <>
      {tel && (
        <a href={tel} onClick={(e) => e.stopPropagation()}>
          <Button size={size} icon={<Phone className="size-4" />}>
            Ligar
          </Button>
        </a>
      )}
      {wa && (
        <a href={wa} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
          <Button size={size} icon={<MessageCircle className="size-4" />}>
            WhatsApp
          </Button>
        </a>
      )}
    </>
  );
}

function ClientCard({ c }: { c: Customer }) {
  const nav = useNavigate();
  const blocked = c.status === 'BLOCKED';
  return (
    <Card className="flex flex-col gap-3" onClick={() => nav(`/clientes/${c.id}`)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-fg truncate">{displayName(c)}</div>
          {c.tradeName && <div className="text-xs text-muted truncate">{c.name}</div>}
          <div className="text-xs text-muted mt-1 inline-flex items-center gap-1">
            <MapPin className="size-3" /> {cityLabel(c)}
            {c.district ? ` · ${c.district}` : ''}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {blocked ? (
            <Badge tone="danger" dot>
              Bloqueado
            </Badge>
          ) : (
            <Badge tone={RANKING[c.ranking].tone} dot>
              {RANKING[c.ranking].label}
            </Badge>
          )}
          <Stars value={c.stars} />
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-muted border-t border-border pt-2.5">
        <span>
          Última compra: <span className="text-fg num">{c.lastPurchaseAt ? relativeDays(c.lastPurchaseAt) : 'nunca'}</span>
        </span>
        <span className="num text-fg">{money(c.totalPurchases)}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <ContactButtons c={c} compact />
        {!blocked && (
          <Button
            size="sm"
            variant="primary"
            className="ml-auto"
            icon={<ShoppingCart className="size-4" />}
            onClick={(e) => {
              e.stopPropagation();
              nav(`/pedidos/novo?cliente=${c.id}`);
            }}
          >
            Pedido
          </Button>
        )}
      </div>
    </Card>
  );
}

export function ClientView() {
  const { id } = useParams();
  const nav = useNavigate();
  const { rows: customers, loading } = useMyCustomers();
  const { rows: sales } = useMySales();
  const c = customers.find((x) => x.id === id);
  const mySales = useMemo(() => sales.filter((s) => s.customerId === id).sort((a, b) => (b.date + b.number).localeCompare(a.date + a.number)), [sales, id]);
  const counted = mySales.filter(isCounted);

  if (loading) return <PageLoader />;
  if (!c)
    return (
      <EmptyState
        title="Cliente não encontrado"
        description="Ele não está na sua carteira."
        action={
          <Link to="/clientes">
            <Button>Voltar para meus clientes</Button>
          </Link>
        }
      />
    );

  const total = counted.reduce((s, x) => s + x.totalValue, 0);
  return (
    <>
      <PageHeader
        back="/clientes"
        title={displayName(c)}
        subtitle={[c.tradeName ? c.name : null, formatDocument(c.document)].filter(Boolean).join(' · ')}
        actions={
          c.status === 'ACTIVE' && (
            <Button variant="primary" icon={<ShoppingCart className="size-4" />} onClick={() => nav(`/pedidos/novo?cliente=${c.id}`)}>
              Novo pedido
            </Button>
          )
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={RANKING[c.ranking].tone} dot>
            {RANKING[c.ranking].label}
          </Badge>
          <Stars value={c.stars} />
          {c.financialApproval === 'APPROVED' ? (
            <Badge tone="success">Crédito aprovado</Badge>
          ) : c.financialApproval === 'REJECTED' ? (
            <Badge tone="danger">Somente à vista</Badge>
          ) : (
            <Badge tone="warning">Crédito em análise</Badge>
          )}
        </div>
      </PageHeader>

      {c.status === 'BLOCKED' && (
        <Callout tone="danger" title="Cliente bloqueado" className="mb-4">
          Não é possível fazer pedidos para este cliente. Fale com a equipe interna.
        </Callout>
      )}

      <div className="flex flex-wrap gap-2 mb-5">
        <ContactButtons c={c} />
        {c.email && (
          <a href={`mailto:${c.email}`}>
            <Button icon={<Mail className="size-4" />}>E-mail</Button>
          </a>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <MiniStat label="Comprado" value={money(total)} />
        <MiniStat label="Pedidos" value={String(counted.length)} />
        <MiniStat label="Última compra" value={counted[0] ? date(counted[0].date) : '—'} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 mb-6">
        <Card>
          <CardHeader title="Contato e entrega" />
          <DescriptionList
            cols={1}
            items={[
              { label: 'Contato', value: c.contactName || '—' },
              { label: 'Celular', value: c.cellphone ? formatPhone(c.cellphone) : '—', hidden: !c.cellphone },
              { label: 'Telefone', value: c.phone ? formatPhone(c.phone) : '—', hidden: !c.phone },
              { label: 'E-mail', value: c.email || '—' },
              { label: 'Endereço', value: addressLine(c) || '—' },
            ]}
          />
        </Card>
        <Card>
          <CardHeader title="Condições comerciais" />
          <DescriptionList
            cols={1}
            items={[
              { label: 'Prazo', value: c.paymentTerms ? `${c.paymentTerms} dias` : 'À vista' },
              { label: 'Pagamento preferido', value: c.preferredPaymentMethod ? PAYMENT_METHOD_LABELS[c.preferredPaymentMethod] : '—' },
              {
                label: 'Formas liberadas',
                value: (
                  <span className="flex flex-wrap gap-1 mt-0.5">
                    {(c.allowedPaymentMethods || []).map((m) => (
                      <Badge key={m}>{PAYMENT_METHOD_LABELS[m]}</Badge>
                    ))}
                  </span>
                ),
              },
              { label: 'Observações', value: c.notes, hidden: !c.notes },
            ]}
          />
        </Card>
      </div>

      <SectionTitle title={`Pedidos (${mySales.length})`} />
      {mySales.length ? (
        <ListCard>
          {mySales.slice(0, 20).map((s) => (
            <OrderRow key={s.id} sale={s} showCustomer={false} />
          ))}
        </ListCard>
      ) : (
        <ListCard>
          <EmptyState title="Nenhum pedido seu para este cliente" className="py-8" />
        </ListCard>
      )}
    </>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-border bg-surface px-3 py-2.5 min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-subtle truncate">{label}</div>
      <div className="num font-semibold text-fg text-[15px] truncate mt-0.5">{value}</div>
    </div>
  );
}

