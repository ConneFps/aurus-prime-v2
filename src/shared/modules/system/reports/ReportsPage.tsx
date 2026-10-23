import { ChevronRight, FileBarChart, Lock } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSession } from '../../../app/session';
import { matchesSearch } from '../../../domain/format';
import { Badge, Card, EmptyState, PageHeader, SearchInput, Segmented, Toolbar } from '../../../ui';
import { FILTER_LABELS } from './ReportFiltersCard';
import { REPORTS, reportById } from './registry';
import { ReportViewer } from './ReportViewer';
import { REPORT_CATEGORIES, type ReportCategory, type ReportDef } from './types';

const filterChips = (r: ReportDef) => [
  ...(r.filters.includes('period') ? ['Período'] : []),
  ...r.filters.filter((f) => f !== 'period').map((f) => FILTER_LABELS[f as keyof typeof FILTER_LABELS]),
];

export function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const { can } = useSession();
  const open = reportById(params.get('r'));

  if (open) {
    if (open.permission && !can(open.permission))
      return (
        <>
          <PageHeader back="/relatorios" eyebrow="Relatórios" title={open.title} />
          <Card>
            <EmptyState icon={<Lock className="size-5" />} title="Sem acesso a este relatório" description="Seu perfil não tem permissão para ver estes dados. Fale com o administrador." />
          </Card>
        </>
      );
    return <ReportViewer key={open.id} def={open} />;
  }
  return <ReportCatalog onOpen={(id) => setParams({ r: id })} />;
}

function ReportCatalog({ onOpen }: { onOpen: (id: string) => void }) {
  const { can } = useSession();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<ReportCategory | 'ALL'>('ALL');
  const allowed = useMemo(() => REPORTS.filter((r) => !r.permission || can(r.permission)), [can]);
  const visible = allowed.filter((r) => (cat === 'ALL' || r.category === cat) && matchesSearch([r.title, r.description, r.category, r.keywords], q));
  const cats = REPORT_CATEGORIES.filter((c) => allowed.some((r) => r.category === c));

  return (
    <>
      <PageHeader
        eyebrow="Sistema"
        title="Relatórios"
        subtitle="Escolha um relatório, ajuste os filtros, confira na tela e baixe em PDF ou planilha."
      />
      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar relatório…" className="sm:w-72" />
        <Segmented
          size="sm"
          value={cat}
          onChange={setCat}
          options={[{ value: 'ALL' as const, label: 'Todos', count: allowed.length }, ...cats.map((c) => ({ value: c, label: c, count: allowed.filter((r) => r.category === c).length }))]}
        />
      </Toolbar>
      {!visible.length ? (
        <Card>
          <EmptyState icon={<FileBarChart className="size-5" />} title="Nenhum relatório encontrado" description="Tente outra palavra ou escolha outra categoria." />
        </Card>
      ) : (
        <div className="space-y-7">
          {cats
            .filter((c) => visible.some((r) => r.category === c))
            .map((c) => (
              <section key={c}>
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle mb-3">{c}</h2>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {visible
                    .filter((r) => r.category === c)
                    .map((r) => (
                      <ReportCard key={r.id} report={r} onOpen={() => onOpen(r.id)} />
                    ))}
                </div>
              </section>
            ))}
        </div>
      )}
    </>
  );
}

function ReportCard({ report, onOpen }: { report: ReportDef; onOpen: () => void }) {
  const Icon = report.icon;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group text-left bg-surface border border-border rounded-card shadow-card p-4 sm:p-5 hover:border-border-strong transition-colors cursor-pointer flex flex-col gap-3 min-w-0"
    >
      <div className="flex items-start gap-3">
        <span className="size-10 rounded-control bg-primary-soft text-primary flex items-center justify-center shrink-0">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-fg leading-tight group-hover:text-primary transition-colors">{report.title}</h3>
          <p className="text-xs text-muted mt-1 leading-relaxed">{report.description}</p>
        </div>
        <ChevronRight className="size-4 text-subtle shrink-0 mt-1 group-hover:text-primary transition-colors" />
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mt-auto pt-1">
        {filterChips(report).map((f) => (
          <Badge key={f} size="xs">
            {f}
          </Badge>
        ))}
        <span className="ml-auto text-[10px] uppercase tracking-wider text-subtle font-medium">PDF · Planilha</span>
      </div>
    </button>
  );
}
