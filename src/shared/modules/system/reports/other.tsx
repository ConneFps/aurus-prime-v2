/**
 * Relatórios de equinos (plantel) e de auditoria do sistema.
 */
import { HeartPulse, ShieldCheck } from 'lucide-react';
import { integer, money, round2 } from '../../../domain/format';
import { EQUINE_SEX_LABELS, EQUINE_STATUS } from '../../../domain/labels';
import type { AuditLog, Equine } from '../../../domain/types';
import { StatusBadge } from '../../../ui';
import { ageLabel, ageMonths, eventCost, eventIncome, gestation, isInHerd, isPregnant, REPRO_STATUS } from '../../equines/model';
import { brlShort } from '../../finance/helpers';
import { AUDIT_ACTIONS, auditActionInfo, entityLabel } from '../audit';
import { inPeriod } from './data';
import { defineReport } from './types';

// ---------------------------------------------------------------------------
// Plantel de equinos
// ---------------------------------------------------------------------------

interface HerdRow {
  e: Equine;
  cost: number;
  income: number;
}

export const equineHerd = defineReport<HerdRow>({
  id: 'plantel-equinos',
  title: 'Plantel de equinos',
  description: 'Animais do haras com idade, status, reprodução, local e custos/receitas do período.',
  category: 'Equinos',
  icon: HeartPulse,
  permission: 'view.equines',
  tables: ['equines', 'equine_events'],
  filters: ['period'],
  period: { default: 'year', field: 'Eventos (custos e receitas)' },
  options: [
    {
      key: 'status',
      label: 'Animais',
      choices: [
        { value: 'herd', label: 'No plantel' },
        { value: 'all', label: 'Todos (inclui vendidos e óbitos)' },
      ],
      default: 'herd',
    },
  ],
  keywords: 'cavalos haras éguas garanhões prenhes',
  build(d, f) {
    const events = d.equine_events.filter((ev) => inPeriod(ev.date, f));
    const rows = d.equines
      .filter((e) => f.opts.status === 'all' || isInHerd(e))
      .map((e) => {
        const mine = events.filter((ev) => ev.equineId === e.id);
        return { e, cost: round2(mine.reduce((s, ev) => s + eventCost(ev), 0)), income: round2(mine.reduce((s, ev) => s + eventIncome(ev), 0)) };
      });
    const cost = round2(rows.reduce((s, r) => s + r.cost, 0));
    const income = round2(rows.reduce((s, r) => s + r.income, 0));
    const value = round2(rows.reduce((s, r) => s + (r.e.estimatedValue || 0), 0));
    const pregnant = rows.filter((r) => isPregnant(r.e)).length;
    return {
      rows,
      rowKey: (r) => r.e.id,
      link: (r) => `/equinos/${r.e.id}`,
      initialSort: { key: 'name', dir: 'asc' },
      orientation: 'landscape',
      stats: [
        { label: 'Animais', value: integer(rows.length), hint: `${rows.filter((r) => r.e.sex === 'EGUA').length} éguas · ${rows.filter((r) => r.e.sex === 'GARANHAO').length} garanhões` },
        { label: 'Éguas prenhes', value: integer(pregnant) },
        { label: 'Custos no período', value: money(cost), short: brlShort(cost), hint: income ? `receitas ${money(income)}` : undefined },
        { label: 'Valor estimado', value: money(value), short: brlShort(value) },
      ],
      columns: [
        { key: 'name', header: 'Nome', value: (r) => r.e.name, mobile: 'title', total: (rs) => `${rs.length} animais` },
        { key: 'sex', header: 'Sexo', value: (r) => EQUINE_SEX_LABELS[r.e.sex], mobile: 'subtitle' },
        { key: 'breed', header: 'Raça', value: (r) => r.e.breed, hideBelow: 'md' },
        { key: 'age', header: 'Idade', kind: 'text', value: (r) => ageLabel(r.e.birthDate), hideBelow: 'md' },
        { key: 'ageM', header: 'Meses', kind: 'int', value: (r) => ageMonths(r.e.birthDate), hideBelow: 'xl', noPdf: true },
        {
          key: 'repro',
          header: 'Reprodução',
          value: (r) => {
            const g = gestation(r.e);
            if (g) return `Prenhe — parto previsto ${g.dueDate.split('-').reverse().join('/')}`;
            return r.e.reproStatus ? REPRO_STATUS[r.e.reproStatus].label : '—';
          },
          hideBelow: 'lg',
        },
        { key: 'place', header: 'Local', value: (r) => [r.e.haras, r.e.paddock].filter(Boolean).join(' · ') || '—', hideBelow: 'lg' },
        { key: 'registry', header: 'Registro', value: (r) => r.e.registry || '—', hideBelow: 'xl' },
        { key: 'cost', header: 'Custos', kind: 'money', value: (r) => r.cost, total: 'sum', hideBelow: 'md' },
        { key: 'income', header: 'Receitas', kind: 'money', value: (r) => r.income, total: 'sum', hideBelow: 'lg' },
        { key: 'value', header: 'Valor estimado', kind: 'money', value: (r) => r.e.estimatedValue ?? null, total: 'sum', hideBelow: 'md' },
        { key: 'status', header: 'Status', value: (r) => EQUINE_STATUS[r.e.status].label, display: (r) => <StatusBadge info={EQUINE_STATUS[r.e.status]} />, mobile: 'badge' },
      ],
      note: 'Custos = eventos de saúde, manejo, transporte, hospedagem e despesas; receitas = prêmios e receitas lançados no período.',
    };
  },
});

// ---------------------------------------------------------------------------
// Auditoria
// ---------------------------------------------------------------------------

export const auditReport = defineReport<AuditLog>({
  id: 'auditoria',
  title: 'Auditoria',
  description: 'Quem fez o quê e quando: criações, alterações, aprovações, pagamentos, estornos e exclusões.',
  category: 'Sistema',
  icon: ShieldCheck,
  permission: 'audit.view',
  tables: ['audit_logs', 'profiles'],
  filters: ['period', 'user'],
  period: { default: '3m', field: 'Data do registro' },
  options: [
    {
      key: 'action',
      label: 'Ação',
      choices: [{ value: 'ALL', label: 'Todas' }, ...Object.entries(AUDIT_ACTIONS).map(([value, i]) => ({ value, label: i.label }))],
      default: 'ALL',
    },
  ],
  keywords: 'log histórico usuário segurança',
  build(d, f) {
    const action = f.opts.action || 'ALL';
    const rows = d.audit_logs.filter((l) => inPeriod(l.at, f) && (!f.userId || l.userId === f.userId) && (action === 'ALL' || l.action === action));
    const users = new Set(rows.map((r) => r.userId || r.userName)).size;
    const critical = rows.filter((r) => r.action === 'DELETE' || r.action === 'CANCEL' || r.action === 'REVERSAL').length;
    const top = [...rows.reduce((m, r) => m.set(r.userName || '—', (m.get(r.userName || '—') || 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1])[0];
    return {
      rows,
      rowKey: (r) => r.id,
      initialSort: { key: 'at', dir: 'desc' },
      orientation: 'landscape',
      stats: [
        { label: 'Registros', value: integer(rows.length) },
        { label: 'Usuários', value: integer(users) },
        { label: 'Exclusões e estornos', value: integer(critical), tone: critical ? 'warning' : undefined },
        { label: 'Mais ativo', value: top?.[0] || '—', hint: top ? `${top[1]} registros` : undefined },
      ],
      columns: [
        { key: 'at', header: 'Data e hora', kind: 'dateTime', value: (r) => r.at, mobile: 'subtitle' },
        { key: 'user', header: 'Usuário', value: (r) => r.userName || r.userEmail || 'Sistema', hideBelow: 'md' },
        { key: 'action', header: 'Ação', value: (r) => auditActionInfo(r.action).label, display: (r) => <StatusBadge info={auditActionInfo(r.action)} />, mobile: 'badge' },
        { key: 'entity', header: 'Área', value: (r) => entityLabel(r.entity), hideBelow: 'lg' },
        { key: 'summary', header: 'Resumo', value: (r) => r.summary, mobile: 'title' },
      ],
      note: 'Detalhes completos de cada registro (dados alterados) em Configurações → Auditoria.',
    };
  },
});
