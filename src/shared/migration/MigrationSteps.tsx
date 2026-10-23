/**
 * Partes visuais do assistente de migração (cada passo).
 * Estado e ações ficam em MigrationWizard.tsx.
 */
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, CircleDashed, FileJson, Loader2, PlugZap, Upload, XCircle } from 'lucide-react';
import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { integer } from '../domain/format';
import type { TableName } from '../domain/schema';
import { TABLES } from '../domain/schema';
import { Badge, Button, Callout, Card, CardHeader, cn, DataTable, Progress, Stat, StatGrid, type Column } from '../ui';
import { IMPORT_ORDER, type FileCopyResult, type ImportProgress, type ImportResult, type TableResult } from './importer';
import type { MigrationPlan } from './transform';

// ============================================================================
// Indicador de passos
// ============================================================================

export const STEPS = ['Origem dos dados', 'Conferir', 'Importar', 'Concluído'] as const;

export function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2 sm:gap-3 mb-5 overflow-x-auto pb-1">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex items-center gap-2 shrink-0">
            <span
              className={cn(
                'size-7 rounded-full flex items-center justify-center text-xs font-semibold num',
                done ? 'bg-success-soft text-success' : active ? 'bg-primary text-primary-fg' : 'bg-surface-2 text-muted',
              )}
            >
              {done ? <CheckCircle2 className="size-4" /> : i + 1}
            </span>
            <span className={cn('text-sm whitespace-nowrap', active ? 'text-fg font-medium' : 'text-muted', !active && 'hidden sm:inline')}>{label}</span>
            {i < STEPS.length - 1 && <span className="w-4 sm:w-8 h-px bg-border" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

// ============================================================================
// Passo 1 — origem
// ============================================================================

export interface ReadStatus {
  collection: string;
  count: number; // -1 = negado; 0 + reading = lendo
  reading: boolean;
}

export function SourceStep({
  onFile,
  fileBusy,
  legacyLabel,
  onConnect,
  connecting,
  readStatus,
}: {
  onFile: (f: File) => void;
  fileBusy: boolean;
  legacyLabel: string | null;
  onConnect: () => void;
  connecting: boolean;
  readStatus: ReadStatus[];
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const busy = fileBusy || connecting;
  return (
    <div className="space-y-4">
      <Callout tone="info" title="Traga os dados do sistema antigo para o Aurus Prime 2.0">
        Clientes, lotes, estoque, pedidos, contas a receber e a pagar, equinos, portal e cadastros. Pode repetir quantas vezes quiser: o que já foi migrado é
        atualizado, nunca duplicado.
      </Callout>
      <Callout tone="warning" title="Faça a importação final antes de começar a usar o sistema novo">
        Repetir a migração regrava os registros migrados com os dados do sistema antigo (por exemplo, saldos de estoque e parcelas). Depois que a equipe começar a
        lançar no sistema novo, não importe de novo.
      </Callout>
      <div className={cn('grid gap-4', legacyLabel && 'lg:grid-cols-2')}>
        <Card>
          <CardHeader icon={<FileJson className="size-4.5" />} title="Arquivo de backup (.json)" subtitle="Funciona sempre, sem login no sistema antigo" />
          <ol className="text-sm text-muted space-y-1.5 mb-4 list-decimal pl-5">
            <li>No sistema antigo, abra <b className="text-fg">Configurações → Backup</b>.</li>
            <li>
              Clique em <b className="text-fg">Gerar backup manual</b> — um arquivo <span className="num">.json</span> é baixado.
            </li>
            <li>Escolha esse arquivo abaixo (ou arraste para cá).</li>
          </ol>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f && !busy) onFile(f);
            }}
            className={cn(
              'flex flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed p-6 text-center cursor-pointer transition-colors',
              over ? 'border-primary bg-primary-soft' : 'border-border-strong hover:bg-surface-2',
              busy && 'opacity-60 pointer-events-none',
            )}
          >
            {fileBusy ? <Loader2 className="size-6 text-primary animate-spin" /> : <Upload className="size-6 text-primary" />}
            <span className="text-sm font-medium text-fg">{fileBusy ? 'Lendo e analisando o arquivo…' : 'Escolher arquivo de backup'}</span>
            <span className="text-xs text-muted">backup_firestore_mvgb_….json</span>
            <input
              ref={input}
              type="file"
              accept=".json,application/json"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                if (input.current) input.current.value = '';
              }}
            />
          </label>
          <p className="text-xs text-muted mt-3">
            O backup do sistema antigo não inclui portal do cliente, vendedores externos, materiais, perdas, sêmen e vendas excluídas
            {legacyLabel ? ' — para esses, use também a conexão direta (nada duplica).' : '.'}
          </p>
        </Card>
        {legacyLabel && (
          <Card>
            <CardHeader icon={<PlugZap className="size-4.5" />} title="Conectar direto ao sistema antigo" subtitle="Lê todas as informações, inclusive portal e materiais" />
            <p className="text-sm text-muted mb-1">Você entra com a sua conta Google de administrador do sistema antigo. Nada é alterado lá — só leitura.</p>
            <p className="text-xs text-subtle mb-4 break-words">{legacyLabel}</p>
            <Button variant="primary" icon={<PlugZap className="size-4" />} loading={connecting} disabled={fileBusy} onClick={onConnect} block>
              {connecting ? 'Lendo o sistema antigo…' : 'Conectar e ler dados'}
            </Button>
            {readStatus.length > 0 && (
              <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs max-h-64 overflow-auto">
                {readStatus.map((r) => (
                  <li key={r.collection} className="flex items-center justify-between gap-2 min-w-0">
                    <span className="truncate text-muted">{r.collection}</span>
                    {r.reading ? (
                      <Loader2 className="size-3.5 animate-spin text-primary shrink-0" />
                    ) : r.count < 0 ? (
                      <span className="text-warning shrink-0">sem acesso</span>
                    ) : (
                      <span className="num text-fg shrink-0">{integer(r.count)}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Passo 2 — prévia
// ============================================================================

interface CountRow {
  table: TableName;
  label: string;
  count: number;
}

const countColumns: Column<CountRow>[] = [
  { key: 'label', header: 'Informação', cell: (r) => r.label, sortValue: (r) => r.label, mobile: 'title' },
  { key: 'count', header: 'Registros', cell: (r) => <span className="num">{integer(r.count)}</span>, sortValue: (r) => r.count, align: 'right', mobile: 'badge' },
];

export function planRows(counts: Partial<Record<TableName, number>>): CountRow[] {
  const order = [...IMPORT_ORDER, ...(Object.keys(counts) as TableName[]).filter((t) => !IMPORT_ORDER.includes(t))];
  return order.filter((t) => counts[t]).map((t) => ({ table: t, label: TABLES[t]?.label || t, count: counts[t] || 0 }));
}

export function WarningList({ warnings, title = 'Avisos da migração' }: { warnings: string[]; title?: string }) {
  const [open, setOpen] = useState(false);
  if (!warnings.length) return null;
  return (
    <Card>
      <button type="button" className="w-full flex items-center justify-between gap-3 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="size-4.5 text-warning shrink-0" />
          <span className="text-[15px] font-semibold text-fg">{title}</span>
          <Badge tone="warning">{warnings.length}</Badge>
        </span>
        <span className="flex items-center gap-1 text-xs text-muted shrink-0">
          {open ? 'Ocultar' : 'Ver'} {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </span>
      </button>
      {open && (
        <ul className="mt-4 space-y-2 text-sm text-fg/90 list-disc pl-5">
          {warnings.map((w, i) => (
            <li key={i} className="break-words">
              {w}
            </li>
          ))}
        </ul>
      )}
      {!open && <p className="text-xs text-muted mt-2">Nada impede a importação — são pontos para conferir depois (cadastros criados automaticamente, dados que o sistema antigo não tinha…).</p>}
    </Card>
  );
}

export function PreviewStep({ plan, sourceLabel, filesNote, footer }: { plan: MigrationPlan; sourceLabel: string; filesNote?: string | null; footer: React.ReactNode }) {
  const c = plan.counts;
  const total = Object.values(c).reduce((s: number, n) => s + (n || 0), 0);
  const rows = planRows(c);
  return (
    <div className="space-y-4">
      <Callout tone="success" title={`${integer(total)} registros prontos para importar`}>
        Origem: {sourceLabel}. Nada foi gravado ainda — confira os números e clique em “Importar”.
      </Callout>
      {filesNote && <Callout tone="info">{filesNote}</Callout>}
      <StatGrid cols={4}>
        <Stat label="Clientes" value={<span className="num">{integer(c.customers || 0)}</span>} />
        <Stat label="Pedidos" value={<span className="num">{integer(c.sales || 0)}</span>} />
        <Stat label="Lotes de estoque" value={<span className="num">{integer(c.stock_lots || 0)}</span>} hint={`${integer(c.batches || 0)} lotes de gado`} />
        <Stat label="Contas (parcelas)" value={<span className="num">{integer(c.financial_entries || 0)}</span>} />
      </StatGrid>
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <Card padded={false}>
          <div className="p-4 sm:p-5 pb-0 sm:pb-0">
            <CardHeader title="O que será importado" subtitle="Quantidade por tipo de informação no sistema novo" />
          </div>
          <DataTable columns={countColumns} rows={rows} rowKey={(r) => r.table} dense bare pageSize={50} />
        </Card>
        <div className="space-y-4">
          <WarningList warnings={plan.warnings} />
          {plan.unmapped.length > 0 && (
            <Callout tone="info" title="Informações sem correspondência (não serão importadas)">
              {plan.unmapped.join(', ')}
            </Callout>
          )}
          {plan.ignored.length > 0 && (
            <Callout tone="info" title="Ignorado de propósito">
              {plan.ignored.join('; ')}
            </Callout>
          )}
        </div>
      </div>
      {footer}
    </div>
  );
}

// ============================================================================
// Passo 3 — importação
// ============================================================================

export interface LogLine {
  table: TableName | 'files' | 'links';
  label: string;
  done: number;
  total: number;
  state: 'running' | 'done' | 'error';
  message?: string;
}

export function ImportStep({ progress, log }: { progress: ImportProgress | null; log: LogLine[] }) {
  const pct = progress && progress.overallTotal ? Math.round((progress.overallDone / progress.overallTotal) * 100) : 0;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader icon={<Loader2 className="size-4.5 animate-spin" />} title="Importando…" subtitle="Não feche nem recarregue esta página até terminar." />
        <div className="flex items-end justify-between gap-3 mb-2">
          <span className="text-sm text-muted truncate">{progress ? progress.label : 'Preparando'}</span>
          <span className="text-2xl font-semibold num text-fg">{pct}%</span>
        </div>
        <Progress value={pct} />
        <p className="text-xs text-muted mt-2 num">
          {integer(progress?.overallDone || 0)} de {integer(progress?.overallTotal || 0)} registros
        </p>
      </Card>
      <Card>
        <CardHeader title="Andamento" />
        <ul className="space-y-1.5 text-sm">
          {log.map((l) => (
            <li key={l.table} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 min-w-0">
                {l.state === 'running' ? (
                  <Loader2 className="size-4 animate-spin text-primary shrink-0" />
                ) : l.state === 'error' ? (
                  <AlertTriangle className="size-4 text-warning shrink-0" />
                ) : (
                  <CheckCircle2 className="size-4 text-success shrink-0" />
                )}
                <span className="truncate">{l.label}</span>
              </span>
              <span className="num text-muted shrink-0">
                {integer(l.done)}/{integer(l.total)}
                {l.message ? <span className="text-warning"> · {l.message}</span> : null}
              </span>
            </li>
          ))}
          {!log.length && (
            <li className="flex items-center gap-2 text-muted">
              <CircleDashed className="size-4" /> Começando…
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}

// ============================================================================
// Passo 4 — resumo
// ============================================================================

const resultColumns: Column<TableResult>[] = [
  { key: 'label', header: 'Informação', cell: (r) => r.label, sortValue: (r) => r.label, mobile: 'title' },
  { key: 'written', header: 'Gravados', cell: (r) => <span className="num">{integer(r.written)}</span>, sortValue: (r) => r.written, align: 'right', mobile: 'subtitle' },
  {
    key: 'failed',
    header: 'Com erro',
    cell: (r) => (r.failed ? <Badge tone="danger">{integer(r.failed)}</Badge> : <span className="text-muted">—</span>),
    sortValue: (r) => r.failed,
    align: 'right',
    mobile: 'badge',
  },
  { key: 'errors', header: 'Detalhe', cell: (r) => <span className="text-xs text-muted break-words">{r.errors[0] || ''}</span>, hideBelow: 'md', mobile: false },
];

const CHECKS: { to: string; text: string }[] = [
  { to: '/estoque', text: 'Estoque: confira o saldo de cada corte com o do sistema antigo.' },
  { to: '/financeiro', text: 'Financeiro: confira as contas a receber em aberto e as vencidas.' },
  { to: '/clientes', text: 'Clientes: revise a liberação financeira e os cadastros provisórios criados na migração.' },
  { to: '/vendas', text: 'Pedidos: confira os últimos números — o próximo pedido continua a sequência do sistema antigo.' },
  { to: '/producao/cortes', text: 'Produtos: revise os produtos criados automaticamente a partir de nomes de corte.' },
  { to: '/gado/lotes', text: 'Lotes de gado: confira os custos de cada lote.' },
  { to: '/configuracoes', text: 'Usuários: os usuários antigos viraram convites — cada um entra com o mesmo e-mail e recebe o papel que tinha.' },
  { to: '/comercial/portal', text: 'Portal: confira as contas e o catálogo do portal do cliente.' },
];

export function SummaryStep({ result, files, warnings, actions }: { result: ImportResult; files?: FileCopyResult | null; warnings: string[]; actions: React.ReactNode }) {
  const secs = Math.max(1, Math.round((new Date(result.finishedAt).getTime() - new Date(result.startedAt).getTime()) / 1000));
  return (
    <div className="space-y-4">
      {result.ok ? (
        <Callout tone="success" title="Migração concluída">
          {integer(result.written)} registros gravados no sistema novo.
        </Callout>
      ) : (
        <Callout tone="warning" title="Migração concluída com erros">
          {integer(result.written)} registros gravados e {integer(result.failed)} com erro. Veja o detalhe abaixo, corrija se necessário e importe de novo (o que já
          entrou não duplica).
        </Callout>
      )}
      {files && files.total > 0 && (
        <Callout tone={files.failed ? 'warning' : 'success'} title="PDFs de NF e boleto">
          {integer(files.copied)} copiado(s){files.skipped ? `, ${integer(files.skipped)} já estavam no sistema novo` : ''}
          {files.failed ? `, ${integer(files.failed)} com erro` : ''}.
          {files.errors.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs">
              {files.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </Callout>
      )}
      <StatGrid cols={3}>
        <Stat label="Gravados" tone="success" icon={<CheckCircle2 className="size-4" />} value={<span className="num">{integer(result.written)}</span>} />
        <Stat label="Com erro" tone={result.failed ? 'danger' : 'neutral'} icon={<XCircle className="size-4" />} value={<span className="num">{integer(result.failed)}</span>} />
        <Stat label="Tempo" value={<span className="num">{secs < 60 ? `${secs} s` : `${Math.floor(secs / 60)} min ${secs % 60} s`}</span>} />
      </StatGrid>
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <Card>
          <CardHeader title="Confira agora" subtitle="Checagens recomendadas depois da migração" />
          <ul className="space-y-2 text-sm">
            {CHECKS.map((c) => (
              <li key={c.to} className="flex gap-2">
                <CheckCircle2 className="size-4 text-primary shrink-0 mt-0.5" />
                <Link to={c.to} className="text-fg hover:text-primary">
                  {c.text}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <div className="space-y-4">
          <Card padded={false}>
            <div className="p-4 sm:p-5 pb-0 sm:pb-0">
              <CardHeader title="Resultado por tipo de informação" />
            </div>
            <DataTable columns={resultColumns} rows={result.tables} rowKey={(r) => r.table} dense bare pageSize={50} />
          </Card>
          <WarningList warnings={warnings} />
        </div>
      </div>
      {actions}
    </div>
  );
}
