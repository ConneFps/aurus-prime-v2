/**
 * Financeiro do animal: despesas × receitas/prêmios, venda e parcelas.
 */
import { BadgeDollarSign, Minus, Plus, Receipt, Scale, TrendingDown, TrendingUp } from 'lucide-react';
import { useMemo } from 'react';
import { date, formatDocument, formatPhone, money, moneyCompact, monthLabel } from '../../../domain/format';
import { EQUINE_EVENT_LABELS, PAYMENT_METHOD_LABELS } from '../../../domain/labels';
import type { EquineEvent, EquineEventType, EquineSale, FinancialEntry } from '../../../domain/types';
import { BarsChart, Button, Card, CardHeader, DataTable, DescriptionList, RankBars, Stat, StatGrid, StatusBadge, type Column } from '../../../ui';
import { ENTRY_STATUS, entryStatus, eventCost, eventIncome, str } from '../model';
import { MoneyValue, useStatIcon } from '../parts';
import { EventList } from './EventList';
import type { EquineFinance } from './finance';

const SALE_STATUS = {
  ACTIVE: { label: 'Venda ativa', tone: 'success' as const },
  CANCELLED: { label: 'Cancelada', tone: 'neutral' as const },
};

export function FinanceTab({
  events,
  sales,
  finance: f,
  canEdit,
  onNew,
  onEdit,
}: {
  events: EquineEvent[];
  sales: EquineSale[];
  finance: EquineFinance;
  canEdit: boolean;
  onNew: (t: EquineEventType) => void;
  onEdit: (e: EquineEvent) => void;
}) {
  const ic = useStatIcon();
  const withAmount = events.filter((e) => Number(e.amount) > 0);

  const monthly = useMemo(() => {
    const m = new Map<string, { month: string; despesas: number; receitas: number }>();
    withAmount.forEach((e) => {
      const k = e.date.slice(0, 7);
      const row = m.get(k) || { month: k, despesas: 0, receitas: 0 };
      row.despesas += eventCost(e);
      row.receitas += eventIncome(e);
      m.set(k, row);
    });
    const keys = Array.from(m.keys()).sort();
    if (!keys.length) return [];
    // Preenche os meses sem lançamento para o eixo ficar contínuo.
    const out: { month: string; despesas: number; receitas: number }[] = [];
    let [y, mo] = keys[0].split('-').map(Number);
    const last = keys[keys.length - 1];
    for (let guard = 0; guard < 120; guard++) {
      const k = `${y}-${String(mo).padStart(2, '0')}`;
      out.push(m.get(k) || { month: k, despesas: 0, receitas: 0 });
      if (k >= last) break;
      mo += 1;
      if (mo > 12) {
        mo = 1;
        y += 1;
      }
    }
    return out.slice(-12);
  }, [withAmount]);

  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    withAmount
      .filter((e) => eventCost(e) > 0)
      .forEach((e) => {
        const k = e.type === 'EXPENSE' ? str(e.data.category) || 'Outras despesas' : EQUINE_EVENT_LABELS[e.type].label;
        m.set(k, (m.get(k) || 0) + eventCost(e));
      });
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value }));
  }, [withAmount]);

  const cols: Column<FinancialEntry>[] = [
    { key: 'n', header: 'Parcela', mobile: 'title', cell: (e) => <span className="num">{`${e.installment}/${e.installments}`}</span> },
    { key: 'due', header: 'Vencimento', mobile: 'subtitle', sortValue: (e) => e.dueDate, cell: (e) => <span className="num">{date(e.dueDate)}</span> },
    { key: 'amount', header: 'Valor', align: 'right', cell: (e) => <span className="num">{money(e.amount)}</span> },
    { key: 'paid', header: 'Recebido', align: 'right', cell: (e) => <span className="num">{money(e.paidAmount)}</span> },
    { key: 'method', header: 'Forma', hideBelow: 'lg', cell: (e) => (e.method ? PAYMENT_METHOD_LABELS[e.method] : '—') },
    { key: 'status', header: 'Situação', mobile: 'badge', cell: (e) => <StatusBadge info={ENTRY_STATUS[entryStatus(e)]} /> },
  ];

  const cancelled = sales.filter((s) => s.status === 'CANCELLED');

  return (
    <div className="space-y-4">
      <StatGrid cols={4}>
        <Stat label="Despesas" tone="danger" icon={ic(<TrendingDown className="size-4" />)} value={<MoneyValue value={f.cost} />} hint={`${withAmount.filter((e) => eventCost(e) > 0).length} lançamento(s)`} />
        <Stat label="Receitas e prêmios" tone="success" icon={ic(<TrendingUp className="size-4" />)} value={<MoneyValue value={f.income} />} hint={f.prizes ? `Prêmios ${money(f.prizes)}` : undefined} />
        <Stat
          label="Venda"
          tone="accent"
          icon={ic(<BadgeDollarSign className="size-4" />)}
          value={f.sale ? <MoneyValue value={f.sale.totalPrice} /> : '—'}
          hint={f.sale ? (f.open > 0 ? `A receber ${money(f.open)}` : 'Quitada') : 'Animal não vendido'}
        />
        <Stat label="Resultado" tone={f.result >= 0 ? 'success' : 'danger'} icon={ic(<Scale className="size-4" />)} value={<MoneyValue value={f.result} />} hint="Receitas + venda − despesas" />
      </StatGrid>

      {f.sale && (
        <Card>
          <CardHeader
            icon={<Receipt className="size-4" />}
            title={`Venda para ${f.sale.buyerName}`}
            subtitle={`${date(f.sale.date)} · ${money(f.sale.totalPrice)} em ${f.sale.installmentsCount}x`}
            actions={<StatusBadge info={SALE_STATUS[f.sale.status]} />}
          />
          <DescriptionList
            cols={4}
            className="mb-4"
            items={[
              { label: 'CPF / CNPJ', value: f.sale.buyerDocument ? <span className="num">{formatDocument(f.sale.buyerDocument)}</span> : '—' },
              { label: 'Telefone', value: f.sale.buyerPhone ? formatPhone(f.sale.buyerPhone) : '—' },
              { label: 'E-mail', value: f.sale.buyerEmail || '—' },
              { label: 'Recebido', value: <span className="num text-success">{money(f.received)}</span> },
              { label: 'Endereço', value: f.sale.buyerAddress, span: true, hidden: !f.sale.buyerAddress },
              { label: 'Observações', value: f.sale.notes, span: true, hidden: !f.sale.notes },
            ]}
          />
          <DataTable bare dense columns={cols} rows={f.saleEntries} rowKey={(e) => e.id} emptyTitle="Sem parcelas" pageSize={24} />
        </Card>
      )}

      {monthly.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <Card>
            <CardHeader title="Despesas × receitas por mês" subtitle="Eventos com valor (custos, prêmios e receitas)" />
            <BarsChart
              data={monthly}
              xKey="month"
              series={[
                { key: 'despesas', name: 'Despesas' },
                { key: 'receitas', name: 'Receitas' },
              ]}
              height={230}
              format={money}
              axisFormat={moneyCompact}
              xFormat={monthLabel}
            />
          </Card>
          <Card>
            <CardHeader title="Despesas por categoria" />
            {byCategory.length ? <RankBars items={byCategory} format={money} /> : <p className="text-sm text-subtle">Nenhuma despesa lançada.</p>}
          </Card>
        </div>
      )}

      <Card padded={false}>
        <CardHeader
          className="px-4 pt-4 sm:px-5 sm:pt-5"
          title="Lançamentos do animal"
          subtitle="Custos de saúde, manejo, transporte, hospedagem, despesas avulsas, prêmios e receitas"
          actions={
            canEdit && (
              <div className="flex gap-2">
                <Button size="sm" icon={<Minus className="size-4" />} onClick={() => onNew('EXPENSE')}>
                  Despesa
                </Button>
                <Button size="sm" icon={<Plus className="size-4" />} onClick={() => onNew('REVENUE')}>
                  Receita
                </Button>
              </div>
            )
          }
        />
        <div className="border-t border-border">
          <EventList events={withAmount} canEdit={canEdit} onEdit={onEdit} showType empty={<p className="px-5 py-8 text-center text-sm text-subtle">Nenhum lançamento com valor.</p>} />
        </div>
      </Card>

      {cancelled.length > 0 && (
        <Card>
          <CardHeader title="Vendas canceladas" />
          <ul className="divide-y divide-border -my-2 text-sm">
            {cancelled.map((s) => (
              <li key={s.id} className="py-2">
                <div className="flex justify-between gap-3">
                  <span className="text-fg">
                    {s.buyerName} · {date(s.date)}
                  </span>
                  <span className="num text-muted line-through">{money(s.totalPrice)}</span>
                </div>
                {s.notes && <div className="text-xs text-subtle">{s.notes}</div>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
