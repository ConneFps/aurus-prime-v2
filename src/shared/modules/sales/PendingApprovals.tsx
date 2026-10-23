/**
 * Destaque no topo da lista: pedidos aguardando aprovação (quem tem sales.approve).
 */
import { AlertTriangle, Check, Hourglass, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useOps } from '../../app/session';
import { useAction } from '../../data/react';
import { date, money } from '../../domain/format';
import type { Customer, Sale } from '../../domain/types';
import { Badge, Button, Card, CardHeader, IconButton, usePrompt } from '../../ui';

export function PendingApprovals({
  sales,
  customers,
  onShowAll,
}: {
  sales: Sale[];
  customers: Map<string, Customer>;
  onShowAll: () => void;
}) {
  const ops = useOps();
  const prompt = usePrompt();
  const [busy, setBusy] = useState<string | null>(null);
  const approve = useAction(async (s: Sale) => {
    setBusy(s.id);
    try {
      await ops.approveSale(s.id);
    } finally {
      setBusy(null);
    }
  }, { success: 'Pedido aprovado' });
  const reject = useAction((s: Sale, reason: string) => ops.rejectSale(s.id, reason), { success: 'Pedido recusado' });
  const askReject = async (s: Sale) => {
    const reason = await prompt({ title: `Recusar pedido ${s.number}?`, label: 'Motivo da recusa', confirmLabel: 'Recusar', danger: true });
    if (reason) await reject.run(s, reason);
  };
  if (!sales.length) return null;
  const total = sales.reduce((s, x) => s + x.totalValue, 0);
  const shown = sales.slice(0, 5);

  return (
    <Card className="mb-5 border-warning/40">
      <CardHeader
        icon={<Hourglass className="size-4" />}
        title={`${sales.length} ${sales.length === 1 ? 'pedido aguardando' : 'pedidos aguardando'} aprovação`}
        subtitle={`${money(total)} em pedidos — aprove para liberar a separação e gerar as parcelas.`}
        actions={
          sales.length > shown.length ? (
            <Button size="sm" variant="ghost" onClick={onShowAll}>
              Ver todos
            </Button>
          ) : undefined
        }
        className="mb-3"
      />
      <ul className="divide-y divide-border -mx-4 sm:-mx-5">
        {shown.map((s) => {
          const c = customers.get(s.customerId);
          const creditIssue = c && c.financialApproval !== 'APPROVED';
          const blocked = c?.status === 'BLOCKED';
          return (
            <li key={s.id} className="flex items-center gap-3 px-4 sm:px-5 py-2.5">
              <Link to={`/vendas/${s.id}`} className="min-w-0 flex-1 group">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium text-fg truncate group-hover:text-primary">{s.customerName}</span>
                  {blocked ? (
                    <Badge tone="danger" size="xs">
                      Bloqueado
                    </Badge>
                  ) : creditIssue ? (
                    <Badge tone="warning" size="xs">
                      <AlertTriangle className="size-3" /> Crédito {c.financialApproval === 'REJECTED' ? 'recusado' : 'pendente'}
                    </Badge>
                  ) : null}
                </div>
                <div className="text-xs text-muted num truncate">
                  <span className="sm:hidden font-semibold text-fg">{money(s.totalValue)} · </span>
                  Nº {s.number} · {date(s.date)} · {s.sellerName || 'sem vendedor'}
                </div>
              </Link>
              <span className="hidden sm:inline num text-sm font-semibold text-fg shrink-0">{money(s.totalValue)}</span>
              <div className="flex items-center gap-1 shrink-0">
                <IconButton label="Recusar" size="sm" variant="danger" disabled={reject.running} onClick={() => void askReject(s)}>
                  <X className="size-4" />
                </IconButton>
                <Button size="sm" variant="primary" icon={<Check className="size-4" />} loading={busy === s.id} disabled={blocked || !!busy} onClick={() => void approve.run(s)}>
                  <span className="hidden sm:inline">Aprovar</span>
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
