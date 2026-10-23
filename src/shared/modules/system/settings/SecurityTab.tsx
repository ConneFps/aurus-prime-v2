import { Globe2, Plus, ShieldCheck, Timer, X } from 'lucide-react';
import { useState } from 'react';
import { Callout, Card, CardHeader, Field, IconButton, Input, Select } from '../../../ui';
import type { SettingsDraft } from './useSettingsDraft';

const IDLE_OPTIONS = [0, 5, 10, 15, 30, 60, 120, 240].map((m) => ({
  value: String(m),
  label: m === 0 ? 'Desligado (não sai sozinho)' : m < 60 ? `${m} minutos` : `${m / 60} hora${m > 60 ? 's' : ''}`,
}));

const DOMAIN_RE = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export function SecurityTab({ s }: { s: SettingsDraft }) {
  const { draft: d, set, canEdit } = s;
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const domains = d.corporateDomains || [];

  const add = () => {
    const v = text.trim().toLowerCase().replace(/^@/, '').replace(/^.*@/, '');
    if (!v) return;
    if (!DOMAIN_RE.test(v)) return setError('Domínio inválido. Ex.: minhaempresa.com.br');
    if (domains.includes(v)) return setError('Este domínio já está na lista.');
    set({ corporateDomains: [...domains, v] });
    setText('');
    setError(null);
  };

  const idleValue = String(d.idleTimeoutMinutes ?? 0);
  const idleOptions = IDLE_OPTIONS.some((o) => o.value === idleValue) ? IDLE_OPTIONS : [...IDLE_OPTIONS, { value: idleValue, label: `${idleValue} minutos` }];

  return (
    <div className="grid gap-5 lg:grid-cols-2 items-start">
      <Card>
        <CardHeader icon={<Globe2 className="size-4" />} title="Domínios corporativos" subtitle="E-mails destes domínios entram sem convite, com o papel Operador." />
        <div className="flex flex-wrap gap-2 mb-4">
          {domains.map((dm) => (
            <span key={dm} className="inline-flex items-center gap-1 rounded-pill border border-border bg-surface-2 pl-3 pr-1 h-8 text-sm text-fg num">
              @{dm}
              {canEdit && (
                <IconButton label={`Remover ${dm}`} size="sm" className="size-6" onClick={() => set({ corporateDomains: domains.filter((x) => x !== dm) })}>
                  <X className="size-3.5" />
                </IconButton>
              )}
            </span>
          ))}
          {!domains.length && <p className="text-sm text-subtle">Nenhum domínio — só entra quem for convidado.</p>}
        </div>
        {canEdit && (
          <form
            className="flex items-start gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <Field error={error} className="flex-1">
              <Input
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setError(null);
                }}
                placeholder="novaempresa.com.br"
                aria-label="Novo domínio"
                prefix="@"
              />
            </Field>
            <IconButton label="Adicionar domínio" variant="secondary" type="submit" className="size-10">
              <Plus className="size-4" />
            </IconButton>
          </form>
        )}
        <Callout tone="warning" className="mt-4">
          Qualquer pessoa com e-mail destes domínios consegue entrar. Remova domínios de empresas que saíram do grupo.
        </Callout>
      </Card>

      <div className="space-y-5">
        <Card>
          <CardHeader icon={<Timer className="size-4" />} title="Sair por inatividade" subtitle="Protege computadores compartilhados (expedição, balcão)." />
          <Field label="Tempo sem uso até sair" hint="Um aviso aparece 1 minuto antes. Vale para todos os usuários internos.">
            <Select value={idleValue} onChange={(v) => set({ idleTimeoutMinutes: Number(v) })} options={idleOptions} disabled={!canEdit} />
          </Field>
        </Card>
        <Card>
          <CardHeader icon={<ShieldCheck className="size-4" />} title="Como o acesso funciona" />
          <ol className="space-y-2.5 text-sm text-muted list-decimal pl-5">
            <li>
              <span className="text-fg">Convite</span> — o e-mail convidado entra com o papel escolhido (inclusive e-mails de fora, como vendedores externos).
            </li>
            <li>
              <span className="text-fg">Domínio corporativo</span> — entra automaticamente como Operador; o administrador ajusta o papel depois.
            </li>
            <li>
              <span className="text-fg">Demais e-mails</span> — acesso negado, com mensagem para pedir convite.
            </li>
            <li>
              <span className="text-fg">Usuário desativado</span> — não consegue entrar, mas o histórico dele continua no sistema.
            </li>
          </ol>
          <p className="text-xs text-subtle mt-3">Clientes do portal têm cadastro próprio e aprovação em Portal do cliente → Contas.</p>
        </Card>
      </div>
    </div>
  );
}
