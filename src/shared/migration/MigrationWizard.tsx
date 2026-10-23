/**
 * Assistente de migração do sistema antigo (Configurações → Dados → Migração).
 *
 *  1) Origem: arquivo de backup (.json) ou conexão direta (getLegacySource()).
 *  2) Conferir: contagens, avisos e o que não tem correspondência.
 *  3) Importar: grava pelo DataApi com progresso (importPlan).
 *  4) Concluído: resumo, checagens recomendadas e relatório (JSON).
 *
 * Só para quem tem a permissão 'data.migrate' (administrador).
 */
import { ArrowLeft, Download, RotateCcw, ShieldAlert, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSession } from '../app/session';
import { useAction, useBackend } from '../data/react';
import { integer } from '../domain/format';
import { Button, EmptyState, toast, useConfirm } from '../ui';
import { copyLegacyFiles, importPlan, readBackupFile, resolveLegacyStorageLinks, type FileCopyResult, type ImportProgress, type ImportResult } from './importer';
import { ImportStep, PreviewStep, SourceStep, Stepper, SummaryStep, type LogLine, type ReadStatus } from './MigrationSteps';
import { getLegacySource } from './source';
import { transformLegacy, type MigrationPlan } from './transform';

type Step = 0 | 1 | 2 | 3;

interface Source {
  kind: 'file' | 'direct';
  label: string;
  readAt: string;
  totalDocs: number;
}

const tick = () => new Promise((r) => setTimeout(r, 30));

function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function MigrationWizard() {
  const { can, actor } = useSession();
  const backend = useBackend();
  const confirm = useConfirm();
  const legacy = useMemo(() => getLegacySource(), []);

  const [step, setStep] = useState<Step>(0);
  const [source, setSource] = useState<Source | null>(null);
  const [plan, setPlan] = useState<MigrationPlan | null>(null);
  const [readStatus, setReadStatus] = useState<ReadStatus[]>([]);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [filesResult, setFilesResult] = useState<FileCopyResult | null>(null);

  /** No PostgreSQL os ids de usuário do Firebase não existem (vínculos por id ficam vazios; os nomes são mantidos). */
  const keepLegacyUserIds = backend.info.kind !== 'supabase';
  /** Sistema antigo em OUTRO projeto Firebase: usuários e contas do portal são ligados pelo e-mail. */
  const otherProject = !!legacy?.crossProject;

  const buildPlan = async (dump: Record<string, unknown>, now: string) => {
    if (!otherProject) return transformLegacy(dump, { now, keepLegacyUserIds });
    const [profiles, accounts] = await Promise.all([
      backend.data.list('profiles').catch(() => []),
      backend.data.list('portal_accounts').catch(() => []),
    ]);
    return transformLegacy(dump, {
      now,
      keepLegacyUserIds,
      otherProject,
      currentUsers: profiles.map((p) => ({ id: p.id, email: p.email })),
      currentPortalAccounts: accounts.map((a) => ({ id: a.id, email: a.email })),
    });
  };

  const fromFile = useAction(async (file: File) => {
    const f = await readBackupFile(file);
    await tick();
    const ts = typeof f.metadata?.timestamp === 'string' ? f.metadata.timestamp : new Date().toISOString();
    const p = await buildPlan(f.dump, ts);
    setSource({ kind: 'file', label: `arquivo ${f.fileName} (${integer(f.totalDocs)} documentos)`, readAt: ts, totalDocs: f.totalDocs });
    setPlan(p);
    setStep(1);
  });

  const fromLegacy = useAction(async () => {
    if (!legacy) return;
    setReadStatus([]);
    await legacy.connect();
    // 1º aviso de cada coleção = começou a ler; 2º = terminou (count = documentos, -1 = sem acesso).
    const dump = await legacy.readAll((collection, count) =>
      setReadStatus((cur) =>
        cur.some((r) => r.collection === collection)
          ? cur.map((r) => (r.collection === collection ? { collection, count, reading: false } : r))
          : [...cur, { collection, count, reading: true }],
      ),
    );
    setReadStatus((cur) => cur.map((r) => ({ ...r, reading: false })));
    await tick();
    const now = new Date().toISOString();
    const total = Object.entries(dump).reduce((s, [k, v]) => s + (k.startsWith('_') || !Array.isArray(v) ? 0 : v.length), 0);
    setSource({ kind: 'direct', label: `${legacy.label} (${integer(total)} documentos)`, readAt: now, totalDocs: total });
    setPlan(await buildPlan(dump, now));
    setStep(1);
  });

  const runImport = useAction(async () => {
      if (!plan) return null;
      const ok = await confirm({
        title: 'Importar os dados do sistema antigo?',
        message:
          'Os registros serão gravados no sistema novo. Se você já importou antes, os mesmos registros são atualizados (sem duplicar) com os dados do sistema antigo.',
        confirmLabel: 'Importar agora',
      });
      if (!ok) return null;
      setStep(2);
      setLog([]);
      setProgress(null);
      setFilesResult(null);
      const r = await importPlan(backend.data, plan, (p) => {
        setProgress(p);
        setLog((cur) => {
          const rest = cur.filter((l) => l.table !== p.table);
          const state: LogLine['state'] = p.phase === 'done' ? 'done' : p.phase === 'error' ? 'error' : 'running';
          return [...rest, { table: p.table, label: p.label, done: p.done, total: p.total, state, message: p.message }];
        });
      });
      // PDFs de NF/boleto em pedaços: só pela conexão direta (o arquivo de backup não os traz).
      let fr: FileCopyResult | null = null;
      if (plan.files.length && source?.kind === 'direct' && legacy?.readAttachment) {
        const label = 'Arquivos de NF e boleto (PDF)';
        const line = (done: number, state: LogLine['state'], message?: string) =>
          setLog((cur) => [...cur.filter((l) => l.table !== 'files'), { table: 'files', label, done, total: plan.files.length, state, message }]);
        line(0, 'running');
        fr = await copyLegacyFiles(backend, legacy, plan.files, (done) => line(done, 'running'));
        line(plan.files.length, fr.failed ? 'error' : 'done', fr.failed ? `${fr.failed} arquivo(s) com erro` : undefined);
      }
      // Outro projeto: anexos que só tinham o caminho no Storage antigo recebem o link de download.
      if (plan.storageLinks.length && legacy?.storageUrl) {
        const label = 'Links dos arquivos do Storage antigo';
        const line = (done: number, state: LogLine['state'], message?: string) =>
          setLog((cur) => [...cur.filter((l) => l.table !== 'links'), { table: 'links', label, done, total: plan.storageLinks.length, state, message }]);
        line(0, 'running');
        const lr = await resolveLegacyStorageLinks(backend.data, legacy, plan.storageLinks, (done) => line(done, 'running'));
        line(plan.storageLinks.length, lr.failed ? 'error' : 'done', lr.failed ? `${lr.failed} sem link` : undefined);
        fr = fr
          ? { total: fr.total + lr.total, copied: fr.copied + lr.copied, skipped: fr.skipped + lr.skipped, failed: fr.failed + lr.failed, errors: [...fr.errors, ...lr.errors].slice(0, 8) }
          : lr;
      }
      if (fr) setFilesResult(fr);
      // Registro de auditoria da migração (não interrompe se falhar).
      try {
        await backend.data.insert('audit_logs', {
          at: new Date().toISOString(),
          userId: actor?.id ?? null,
          userName: actor?.name ?? null,
          userEmail: actor?.email ?? null,
          action: 'IMPORT',
          entity: 'migration',
          entityId: null,
          summary: `Migração do sistema antigo: ${r.written} registros gravados${r.failed ? `, ${r.failed} com erro` : ''}${fr ? `, ${fr.copied} PDF(s) copiado(s)` : ''} (${source?.label || 'origem desconhecida'})`,
          data: { counts: plan.counts, failed: r.failed, files: fr },
        });
      } catch {
        /* auditoria é opcional */
      }
      setResult(r);
      setStep(3);
      if (r.ok && !fr?.failed) toast.success('Migração concluída');
      else toast.error('Migração concluída com erros — veja o resumo');
      return r;
  });

  const restart = () => {
    setStep(0);
    setPlan(null);
    setSource(null);
    setResult(null);
    setFilesResult(null);
    setLog([]);
    setProgress(null);
    setReadStatus([]);
  };

  const report = () =>
    downloadJson(`migracao-aurus-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`, {
      geradoEm: new Date().toISOString(),
      banco: backend.info.label,
      origem: source,
      registrosPorTabela: plan?.counts,
      documentosLidos: plan?.sourceCounts,
      avisos: plan?.warnings,
      naoMapeado: plan?.unmapped,
      ignorado: plan?.ignored,
      resultado: result,
      arquivos: filesResult,
    });

  if (!can('data.migrate')) {
    return (
      <EmptyState
        icon={<ShieldAlert className="size-6" />}
        title="Somente administradores podem migrar dados"
        description="Peça a um administrador para fazer a migração do sistema antigo."
      />
    );
  }

  return (
    <section>
      <Stepper current={step} />

      {step === 0 && (
        <SourceStep
          onFile={(f) => void fromFile.run(f)}
          fileBusy={fromFile.running}
          legacyLabel={legacy?.label ?? null}
          onConnect={() => void fromLegacy.run()}
          connecting={fromLegacy.running}
          readStatus={readStatus}
        />
      )}

      {step === 1 && plan && source && (
        <PreviewStep
          plan={plan}
          sourceLabel={source.label}
          filesNote={
            plan.files.length
              ? source.kind === 'direct' && legacy?.readAttachment
                ? `${integer(plan.files.length)} PDF(s) de NF/boleto guardados no banco antigo serão copiados para o pedido correspondente, depois dos registros.`
                : `${integer(plan.files.length)} PDF(s) de NF/boleto guardados no banco antigo não vêm no arquivo de backup. Para copiá-los, use "Conectar direto ao sistema antigo" (pode ser depois — nada duplica).`
              : null
          }
          footer={
            <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
              <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={restart}>
                Escolher outra origem
              </Button>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button variant="secondary" icon={<Download className="size-4" />} onClick={report}>
                  Baixar prévia (JSON)
                </Button>
                <Button variant="primary" icon={<Upload className="size-4" />} loading={runImport.running} onClick={() => void runImport.run()}>
                  Importar {integer(Object.values(plan.counts).reduce((s: number, n) => s + (n || 0), 0))} registros
                </Button>
              </div>
            </div>
          }
        />
      )}

      {step === 2 && <ImportStep progress={progress} log={log} />}

      {step === 3 && result && (
        <SummaryStep
          result={result}
          files={filesResult}
          warnings={plan?.warnings || []}
          actions={
            <div className="flex flex-col sm:flex-row sm:justify-end gap-2">
              <Button variant="secondary" icon={<RotateCcw className="size-4" />} onClick={restart}>
                Nova migração
              </Button>
              <Button variant="primary" icon={<Download className="size-4" />} onClick={report}>
                Baixar relatório (JSON)
              </Button>
            </div>
          }
        />
      )}
    </section>
  );
}
