import { Database, Info, RefreshCw, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../../app/session';
import { useBackend } from '../../../data/react';
import { integer } from '../../../domain/format';
import { ROLE_LABELS } from '../../../domain/labels';
import { EMBEDDED_CHILD_TABLES, TABLE_NAMES, TABLES } from '../../../domain/schema';
import { Badge, Button, Callout, Card, CardHeader, DescriptionList, Skeleton } from '../../../ui';

export const APP_VERSION = '2.0';
const COUNT_TABLES = TABLE_NAMES.filter((t) => !EMBEDDED_CHILD_TABLES.includes(t));

export function AboutTab() {
  const backend = useBackend();
  const { profile } = useSession();
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setCounts(null);
    setError(null);
    try {
      const entries = await Promise.all(COUNT_TABLES.map(async (t) => [t, (await backend.data.list(t)).length] as const));
      setCounts(Object.fromEntries(entries));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [backend]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = counts ? Object.values(counts).reduce((s, n) => s + n, 0) : 0;

  return (
    <div className="grid gap-5 lg:grid-cols-[360px_1fr] items-start">
      <div className="space-y-5">
        <Card>
          <CardHeader icon={<Info className="size-4" />} title="Aurus Prime" subtitle="ERP de gado de corte — MVGB Agro" />
          <DescriptionList
            cols={1}
            items={[
              { label: 'Versão', value: <span className="num">{APP_VERSION}</span> },
              {
                label: 'Banco de dados',
                value: (
                  <span className="inline-flex items-center gap-2">
                    {backend.info.label}
                    {backend.info.demo && <Badge tone="warning">Demonstração</Badge>}
                  </span>
                ),
              },
              { label: 'Conectado como', value: profile ? `${profile.name} · ${ROLE_LABELS[profile.role]}` : '—' },
              { label: 'E-mail', value: profile?.email || '—' },
            ]}
          />
        </Card>
        {backend.info.demo && (
          <Callout tone="warning" title="Modo demonstração">
            Os dados são de exemplo e ficam só na memória do navegador: recarregar a página volta tudo ao início. Nada é gravado em servidor.
          </Callout>
        )}
        <Card>
          <CardHeader icon={<Sparkles className="size-4" />} title="Novidades da versão 2.0" />
          <p className="text-sm text-muted">
            Pedido com ciclo único, separação com pesagem e baixa FIFO, abate e desossa em passos, portal do cliente, aplicativo do vendedor externo e relatórios em
            PDF e planilha.
          </p>
          <Link to="/treinamento?g=novidades" className="inline-block mt-3 text-sm text-primary hover:underline underline-offset-4">
            Ver tudo o que mudou →
          </Link>
        </Card>
      </div>

      <Card>
        <CardHeader
          icon={<Database className="size-4" />}
          title="Registros por tabela"
          subtitle={counts ? `${integer(total)} registros no total` : 'Contando…'}
          actions={
            <Button size="sm" variant="ghost" icon={<RefreshCw className="size-4" />} onClick={() => void load()} disabled={!counts && !error}>
              Atualizar
            </Button>
          }
        />
        {error && <Callout tone="danger">{error}</Callout>}
        <ul className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
          {COUNT_TABLES.map((t) => (
            <li key={t} className="flex items-center justify-between gap-3 py-2 border-b border-border/60 text-sm">
              <span className="text-fg truncate">{TABLES[t].label}</span>
              {counts ? <span className="num text-muted">{integer(counts[t] || 0)}</span> : <Skeleton className="h-4 w-10" />}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
