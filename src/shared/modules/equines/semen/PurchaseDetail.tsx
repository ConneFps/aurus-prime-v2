/**
 * Detalhe de uma compra de sêmen: dados, histórico de uso e parcelas.
 */
import { Droplets } from 'lucide-react';
import { date, formatDocument, money } from '../../../domain/format';
import { PAYMENT_METHOD_LABELS } from '../../../domain/labels';
import type { FinancialEntry, SemenPurchase } from '../../../domain/types';
import { Button, Card, CardHeader, DescriptionList, Drawer, Progress, StatusBadge } from '../../../ui';
import { ENTRY_STATUS, entryBalance, entryStatus, SEMEN_STATUS, SEMEN_STORAGE, semenStatus } from '../model';

export function PurchaseDetail({
  purchase: p,
  entries,
  canEdit,
  onClose,
  onUse,
}: {
  purchase: SemenPurchase | null;
  entries: FinancialEntry[];
  canEdit: boolean;
  onClose: () => void;
  onUse: (p: SemenPurchase) => void;
}) {
  if (!p) return <Drawer open={false} onClose={onClose} />;
  const st = semenStatus(p);
  const mine = entries.filter((e) => e.semenPurchaseId === p.id).sort((a, b) => a.installment - b.installment);
  const paid = mine.reduce((s, e) => s + (e.paidAmount || 0), 0);
  const open = mine.reduce((s, e) => s + entryBalance(e), 0);
  const used = p.dosesQuantity - p.dosesAvailable;
  return (
    <Drawer
      open
      width="lg"
      onClose={onClose}
      title={p.stallionName}
      description={[p.stallionBreed, p.stallionRegistry, p.ownerHaras].filter(Boolean).join(' · ') || 'Compra de sêmen'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          {canEdit && p.status === 'ACTIVE' && p.dosesAvailable > 0 && (
            <Button variant="primary" icon={<Droplets className="size-4" />} onClick={() => onUse(p)}>
              {st === 'EXPIRED' ? 'Dar baixa (descarte)' : 'Usar doses'}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        <Card>
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted">Doses disponíveis</div>
              <div className="font-display text-3xl font-semibold text-fg num">
                {p.dosesAvailable}
                <span className="text-base text-muted"> / {p.dosesQuantity}</span>
              </div>
            </div>
            <StatusBadge info={SEMEN_STATUS[st]} />
          </div>
          <Progress value={p.dosesAvailable} max={p.dosesQuantity} tone={st === 'EXPIRED' ? 'danger' : 'info'} className="mt-3 h-2" />
          <div className="mt-1.5 text-xs text-muted">
            {used} usada(s){p.expiryDate ? ` · validade ${date(p.expiryDate)}` : ''}
          </div>
        </Card>

        <DescriptionList
          cols={2}
          items={[
            { label: 'Fornecedor', value: p.supplierName },
            { label: 'CPF / CNPJ', value: p.supplierDocument ? <span className="num">{formatDocument(p.supplierDocument)}</span> : '—' },
            { label: 'Contato', value: p.supplierContact || '—' },
            { label: 'Nota fiscal', value: [p.invoiceNumber, p.invoiceDate && date(p.invoiceDate)].filter(Boolean).join(' · ') || '—' },
            { label: 'Lote', value: p.lotCode || '—' },
            { label: 'Data da compra', value: date(p.purchaseDate) },
            { label: 'Armazenamento', value: SEMEN_STORAGE[p.storageType] },
            { label: 'Botijão / caneca', value: p.canister || '—' },
            { label: 'Preço por dose', value: p.dosePrice ? money(p.dosePrice) : '—' },
            { label: 'Valor total', value: money(p.totalValue) },
            { label: 'Éguas previstas', value: p.intendedMares || '—' },
            { label: 'Veterinário', value: p.veterinarian || '—' },
            { label: 'Observações', value: p.notes, span: true, hidden: !p.notes },
          ]}
        />

        <Card padded={false}>
          <CardHeader className="px-4 pt-4" title="Histórico de uso" subtitle={`${p.usage?.length || 0} registro(s)`} />
          {p.usage?.length ? (
            <ul className="divide-y divide-border border-t border-border">
              {[...p.usage]
                .sort((a, b) => (a.date < b.date ? 1 : -1))
                .map((u, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="text-fg">{u.mareName || 'Égua não informada'}</div>
                      <div className="text-xs text-muted">
                        {date(u.date)}
                        {u.notes ? ` · ${u.notes}` : ''}
                      </div>
                    </div>
                    <span className="num font-medium text-fg whitespace-nowrap">
                      {u.doses} dose{u.doses > 1 ? 's' : ''}
                    </span>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="border-t border-border px-4 py-4 text-sm text-subtle">Nenhuma dose usada ainda.</p>
          )}
        </Card>

        <Card padded={false}>
          <CardHeader
            className="px-4 pt-4"
            title="Parcelas"
            subtitle={`${mine.length} parcela(s)${p.paymentMethod ? ` · ${PAYMENT_METHOD_LABELS[p.paymentMethod]}` : ''} · pago ${money(paid)} · em aberto ${money(open)}`}
          />
          {mine.length ? (
            <ul className="divide-y divide-border border-t border-border">
              {mine.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="num text-muted w-10">
                    {e.installment}/{e.installments}
                  </span>
                  <span className="num text-muted flex-1">{date(e.dueDate)}</span>
                  <span className="num font-medium text-fg">{money(e.amount)}</span>
                  <StatusBadge info={ENTRY_STATUS[entryStatus(e)]} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="border-t border-border px-4 py-4 text-sm text-subtle">Sem parcelas.</p>
          )}
        </Card>
      </div>
    </Drawer>
  );
}
