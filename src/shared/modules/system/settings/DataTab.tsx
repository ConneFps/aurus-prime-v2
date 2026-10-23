import { DatabaseBackup, FileJson, FileSpreadsheet, History } from 'lucide-react';
import { useState } from 'react';
import { useOps, useSession } from '../../../app/session';
import { useBackend } from '../../../data/react';
import { integer, today } from '../../../domain/format';
import { EMBEDDED_CHILD_TABLES, TABLE_NAMES, TABLES, type TableName } from '../../../domain/schema';
import { MigrationWizard } from '../../../migration/MigrationWizard';
import { Button, Callout, Card, CardHeader, exportCsv, Progress, toast } from '../../../ui';

const EXPORT_TABLES = TABLE_NAMES.filter((t) => !EMBEDDED_CHILD_TABLES.includes(t));

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Valor de célula para planilha: objetos/listas viram JSON. */
const cell = (v: unknown): string | number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  return JSON.stringify(v);
};

export function DataTab() {
  const { can } = useSession();
  const backend = useBackend();
  const ops = useOps();
  const [progress, setProgress] = useState<{ done: number; current: string } | null>(null);
  const [busyTable, setBusyTable] = useState<TableName | null>(null);

  const exportAll = async () => {
    try {
      const tables: Record<string, unknown[]> = {};
      let total = 0;
      for (let i = 0; i < EXPORT_TABLES.length; i++) {
        const t = EXPORT_TABLES[i];
        setProgress({ done: i, current: TABLES[t].label });
        const rows = await backend.data.list(t);
        tables[t] = rows;
        total += rows.length;
      }
      setProgress({ done: EXPORT_TABLES.length, current: 'Gerando arquivo…' });
      const payload = { app: 'Aurus Prime 2.0', exportedAt: new Date().toISOString(), backend: backend.info.label, tables };
      downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `aurus-prime-backup-${today()}.json`);
      toast.success(`Backup gerado: ${integer(total)} registros em ${EXPORT_TABLES.length} tabelas.`);
      void ops.log('EXPORT', 'all', null, `Exportação completa (JSON) — ${total} registros`).catch(() => undefined);
    } catch (e) {
      toast.error('Falha na exportação: ' + (e as Error).message);
    } finally {
      setProgress(null);
    }
  };

  const exportTable = async (t: TableName) => {
    setBusyTable(t);
    try {
      const rows = (await backend.data.list(t)) as unknown as Record<string, unknown>[];
      if (!rows.length) {
        toast.info(`${TABLES[t].label}: nenhum registro.`);
        return;
      }
      const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
      exportCsv(`${t}-${today()}`, rows, keys.map((k) => ({ header: k, value: (r: Record<string, unknown>) => cell(r[k]) })));
      void ops.log('EXPORT', t, null, `Exportação CSV: ${TABLES[t].label} (${rows.length} registros)`).catch(() => undefined);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyTable(null);
    }
  };

  return (
    <div className="space-y-5">
      {can('data.export') && (
        <div className="grid gap-5 lg:grid-cols-[360px_1fr] items-start">
          <Card>
            <CardHeader icon={<FileJson className="size-4" />} title="Backup completo" subtitle="Todas as tabelas em um único arquivo JSON." />
            <p className="text-sm text-muted mb-4">Guarde em local seguro. O arquivo contém dados de clientes, financeiro e usuários.</p>
            {progress ? (
              <div className="space-y-2">
                <Progress value={progress.done} max={EXPORT_TABLES.length} />
                <p className="text-xs text-muted">
                  {progress.current} · {progress.done}/{EXPORT_TABLES.length}
                </p>
              </div>
            ) : (
              <Button variant="primary" block icon={<DatabaseBackup className="size-4" />} onClick={() => void exportAll()}>
                Exportar tudo (JSON)
              </Button>
            )}
          </Card>
          <Card>
            <CardHeader icon={<FileSpreadsheet className="size-4" />} title="Planilha por tabela" subtitle="CSV com separador ; — abre direto no Excel." />
            <ul className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3 -my-1">
              {EXPORT_TABLES.map((t) => (
                <li key={t} className="flex items-center justify-between gap-2 py-1.5 border-b border-border/60">
                  <span className="text-sm text-fg truncate">{TABLES[t].label}</span>
                  <Button size="xs" variant="ghost" loading={busyTable === t} icon={<FileSpreadsheet className="size-3.5" />} onClick={() => void exportTable(t)}>
                    CSV
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {can('data.migrate') && (
        <Card>
          <CardHeader icon={<History className="size-4" />} title="Migração do sistema antigo" subtitle="Traz lotes, clientes, vendas, estoque e financeiro do Aurus Prime 1.0 (Firebase)." />
          <MigrationWizard />
        </Card>
      )}

      {!can('data.export') && !can('data.migrate') && <Callout tone="info">Seu perfil não pode exportar dados. Fale com o administrador.</Callout>}
    </div>
  );
}
