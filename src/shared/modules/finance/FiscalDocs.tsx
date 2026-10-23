/**
 * Pendências documentais das vendas faturadas: NF sem número, boleto sem número.
 */
import { Download, FilePlus2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOps, useSession } from '../../app/session';
import { useAction } from '../../data/react';
import { daysBetween, date, matchesSearch, money, today } from '../../domain/format';
import { BILLING_LABELS, SALE_STATUS } from '../../domain/labels';
import type { Attachment, Sale } from '../../domain/types';
import {
  AttachmentList,
  Badge,
  Button,
  Callout,
  DataTable,
  DateInput,
  exportCsv,
  Field,
  FileDrop,
  FormGrid,
  Input,
  Modal,
  SearchInput,
  Segmented,
  Stat,
  StatGrid,
  StatusBadge,
  Toolbar,
  type Column,
} from '../../ui';
import { sum } from './helpers';
import { StatMoney } from './parts';

const DOC_STATUSES: Sale['status'][] = ['READY', 'DISPATCHED', 'DELIVERED'];

export interface DocPending {
  sale: Sale;
  missingNf: boolean;
  missingBoleto: boolean;
  days: number;
}

export function docPendencies(sales: Sale[]): DocPending[] {
  const t = today();
  return sales
    .filter((s) => DOC_STATUSES.includes(s.status))
    .map((s) => ({
      sale: s,
      missingNf: (s.billingType === 'NF_BOLETO' || s.billingType === 'NF_ONLY') && !s.invoiceNumber,
      missingBoleto: (s.billingType === 'NF_BOLETO' || s.billingType === 'BOLETO_ONLY') && !s.boletoNumber,
      days: Math.max(0, daysBetween(s.date, t)),
    }))
    .filter((p) => p.missingNf || p.missingBoleto);
}

type Scope = 'ALL' | 'NF' | 'BOLETO';

export function FiscalDocs({ sales, loading }: { sales: Sale[]; loading: boolean }) {
  const { can } = useSession();
  const canAttach = can('finance.manage') || can('sales.edit');
  const [scope, setScope] = useState<Scope>('ALL');
  const [q, setQ] = useState('');
  const [doc, setDoc] = useState<DocPending | null>(null);

  const all = useMemo(() => docPendencies(sales), [sales]);
  const rows = useMemo(
    () =>
      all
        .filter((p) => scope === 'ALL' || (scope === 'NF' ? p.missingNf : p.missingBoleto))
        .filter((p) => matchesSearch([p.sale.number, p.sale.customerName, p.sale.sellerName], q)),
    [all, scope, q],
  );
  const nf = all.filter((p) => p.missingNf);
  const bol = all.filter((p) => p.missingBoleto);

  const columns: Column<DocPending>[] = [
    {
      key: 'sale',
      header: 'Pedido',
      mobile: 'title',
      sortValue: (p) => p.sale.number,
      cell: (p) => (
        <div className="min-w-0">
          <Link to={`/vendas/${p.sale.id}`} className="font-medium text-primary hover:underline num" onClick={(e) => e.stopPropagation()}>
            {p.sale.number}
          </Link>
          <span className="sm:hidden text-muted font-normal"> · {p.sale.customerName}</span>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Cliente',
      mobile: false,
      sortValue: (p) => p.sale.customerName,
      cell: (p) => (
        <div className="min-w-0 max-w-[240px]">
          <div className="truncate text-fg">{p.sale.customerName}</div>
          {p.sale.sellerName && <div className="text-xs text-muted truncate">{p.sale.sellerName}</div>}
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Data',
      sortValue: (p) => p.sale.date,
      cell: (p) => (
        <div className="leading-tight">
          <div className="num">{date(p.sale.date)}</div>
          {p.days > 3 && <div className={p.days > 10 ? 'text-[11px] text-danger' : 'text-[11px] text-warning'}>há {p.days} dias</div>}
        </div>
      ),
    },
    { key: 'status', header: 'Status', hideBelow: 'md', mobile: false, cell: (p) => <StatusBadge info={SALE_STATUS[p.sale.status]} /> },
    { key: 'billing', header: 'Faturamento', hideBelow: 'lg', cell: (p) => BILLING_LABELS[p.sale.billingType] },
    {
      key: 'missing',
      header: 'Pendência',
      mobile: 'badge',
      cell: (p) => (
        <span className="inline-flex gap-1">
          {p.missingNf && <Badge tone="danger">Falta NF</Badge>}
          {p.missingBoleto && <Badge tone="warning">Falta boleto</Badge>}
        </span>
      ),
    },
    { key: 'value', header: 'Valor', align: 'right', sortValue: (p) => p.sale.totalValue, cell: (p) => money(p.sale.totalValue) },
  ];

  return (
    <div>
      <StatGrid cols={4} className="mb-6">
        <Stat label="Pedidos pendentes" tone="warning" value={all.length} hint="separados, expedidos ou entregues" />
        <Stat label="Sem nota fiscal" tone="danger" value={nf.length} hint={money(sum(nf, (p) => p.sale.totalValue))} onClick={() => setScope('NF')} />
        <Stat label="Sem boleto" tone="accent" value={bol.length} hint={money(sum(bol, (p) => p.sale.totalValue))} onClick={() => setScope('BOLETO')} />
        <Stat label="Valor envolvido" tone="info" value={<StatMoney value={sum(all, (p) => p.sale.totalValue)} />} hint="total dos pedidos pendentes" />
      </StatGrid>

      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar pedido, cliente, vendedor…" className="sm:w-72" />
        <Segmented
          size="sm"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'ALL', label: 'Todas', count: all.length },
            { value: 'NF', label: 'Falta NF', count: nf.length },
            { value: 'BOLETO', label: 'Falta boleto', count: bol.length },
          ]}
        />
        <div className="sm:ml-auto">
          <Button
            size="sm"
            variant="ghost"
            icon={<Download className="size-4" />}
            onClick={() =>
              exportCsv('pendencias-documentais', rows, [
                { header: 'Pedido', value: (p) => p.sale.number },
                { header: 'Data', value: (p) => date(p.sale.date) },
                { header: 'Cliente', value: (p) => p.sale.customerName },
                { header: 'Vendedor', value: (p) => p.sale.sellerName },
                { header: 'Status', value: (p) => SALE_STATUS[p.sale.status].label },
                { header: 'Faturamento', value: (p) => BILLING_LABELS[p.sale.billingType] },
                { header: 'Falta NF', value: (p) => (p.missingNf ? 'Sim' : '') },
                { header: 'Falta boleto', value: (p) => (p.missingBoleto ? 'Sim' : '') },
                { header: 'Valor', value: (p) => p.sale.totalValue },
                { header: 'Dias', value: (p) => p.days },
              ])
            }
          >
            Exportar
          </Button>
        </div>
      </Toolbar>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(p) => p.sale.id}
        loading={loading}
        initialSort={{ key: 'date', dir: 'asc' }}
        onRowClick={canAttach ? setDoc : undefined}
        rowActions={
          canAttach
            ? (p) => (
                <Button size="xs" variant="ghost" icon={<FilePlus2 className="size-3.5" />} onClick={() => setDoc(p)}>
                  <span className="max-sm:hidden">Registrar</span>
                </Button>
              )
            : undefined
        }
        emptyTitle="Nenhuma pendência documental"
        emptyDescription="Todos os pedidos faturados têm nota fiscal e boleto registrados."
      />

      <DocModal pending={doc} onClose={() => setDoc(null)} />
    </div>
  );
}

function DocModal({ pending, onClose }: { pending: DocPending | null; onClose: () => void }) {
  const ops = useOps();
  const [kind, setKind] = useState<'NF' | 'BOLETO'>('NF');
  const [number, setNumber] = useState('');
  const [nfDate, setNfDate] = useState(today());
  const [att, setAtt] = useState<Attachment | null>(null);

  useEffect(() => {
    if (!pending) return;
    setKind(pending.missingNf ? 'NF' : 'BOLETO');
    setNumber('');
    setNfDate(today());
    setAtt(null);
  }, [pending]);

  const save = useAction(
    async () => {
      if (!pending) return;
      if (!number.trim()) throw new Error(kind === 'NF' ? 'Informe o número da nota fiscal.' : 'Informe o número do boleto.');
      if (!att) throw new Error('Anexe o arquivo do documento (PDF ou imagem).');
      await ops.attachSaleFile(
        pending.sale.id,
        att,
        kind === 'NF' ? { invoiceNumber: number.trim(), invoiceDate: nfDate || null } : { boletoNumber: number.trim() },
      );
    },
    { success: kind === 'NF' ? 'Nota fiscal registrada' : 'Boleto registrado', onSuccess: onClose },
  );

  const s = pending?.sale;
  return (
    <Modal
      open={!!pending}
      onClose={onClose}
      title={s ? `Documento do pedido ${s.number}` : ''}
      description={s ? `${s.customerName} · ${money(s.totalValue)} · ${BILLING_LABELS[s.billingType]}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.running} disabled={!att || !number.trim()} onClick={() => void save.run()}>
            Salvar documento
          </Button>
        </>
      }
    >
      {pending && (
        <div className="space-y-4">
          {pending.missingNf && pending.missingBoleto && (
            <Segmented
              value={kind}
              onChange={(k) => {
                setKind(k);
                setAtt(null);
              }}
              options={[
                { value: 'NF', label: 'Nota fiscal' },
                { value: 'BOLETO', label: 'Boleto' },
              ]}
            />
          )}
          <FormGrid>
            <Field label={kind === 'NF' ? 'Número da NF' : 'Número / nosso número do boleto'} required>
              <Input value={number} onChange={(e) => setNumber(e.target.value)} autoFocus />
            </Field>
            {kind === 'NF' && (
              <Field label="Data de emissão">
                <DateInput value={nfDate} onChange={setNfDate} />
              </Field>
            )}
          </FormGrid>
          {att ? (
            <AttachmentList items={[att]} onRemove={() => setAtt(null)} />
          ) : (
            <FileDrop
              folder={`sales/${pending.sale.id}`}
              kind={kind === 'NF' ? 'NF' : 'BOLETO'}
              accept="application/pdf,image/*"
              onUploaded={setAtt}
              label={`Enviar arquivo ${kind === 'NF' ? 'da NF' : 'do boleto'}`}
            />
          )}
          <Callout tone="info">O arquivo fica anexado ao pedido e o número aparece para a logística e no portal do cliente.</Callout>
        </div>
      )}
    </Modal>
  );
}
