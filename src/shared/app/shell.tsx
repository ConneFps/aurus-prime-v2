/**
 * Peças comuns aos shells das duas opções: navegação filtrada por permissão,
 * paleta de comandos (Ctrl+K), formulário de login e tela de acesso negado.
 * O VISUAL (moldura, cores, disposição) é de cada opção.
 */
import { ArrowRight, CornerDownLeft, KeyRound, Mail, Search, UserRound } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useBackend } from '../data/react';
import { matchesSearch } from '../domain/format';
import { Button, cn, Field, Input } from '../ui';
import { NAV, type NavItem, type NavSection } from './registry';
import { useSession } from './session';

// ---------------------------------------------------------------------------
// Navegação
// ---------------------------------------------------------------------------

export function useNav() {
  const { can } = useSession();
  const loc = useLocation();
  const sections = useMemo<NavSection[]>(
    () =>
      NAV.map((s) => ({ ...s, items: s.items.filter((i) => !i.permission || can(i.permission)) })).filter((s) => s.items.length > 0),
    [can],
  );
  const active = useMemo(() => {
    const path = loc.pathname;
    let best: { section: NavSection; item: NavItem; len: number } | null = null;
    for (const s of sections)
      for (const i of s.items) {
        const match = i.path === '/' ? path === '/' : path === i.path || path.startsWith(i.path + '/');
        if (match && (!best || i.path.length > best.len)) best = { section: s, item: i, len: i.path.length };
      }
    return best;
  }, [sections, loc.pathname]);
  return { sections, activeSection: active?.section ?? null, activeItem: active?.item ?? null };
}

// ---------------------------------------------------------------------------
// Paleta de comandos
// ---------------------------------------------------------------------------

interface Command {
  id: string;
  label: string;
  hint?: string;
  section?: string;
  icon?: React.ComponentType<{ className?: string }>;
  path: string;
}

export function useCommandHotkey(onOpen: () => void) {
  const ref = useRef(onOpen);
  ref.current = onOpen;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ref.current();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { sections } = useNav();
  const { can } = useSession();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<Command[]>(() => {
    const quick: Command[] = [];
    if (can('sales.create')) quick.push({ id: 'q-sale', label: 'Nova venda', hint: 'Criar pedido', section: 'Ações rápidas', path: '/vendas/nova' });
    if (can('cattle.manage')) quick.push({ id: 'q-batch', label: 'Lotes de gado', hint: 'Cadastrar novo lote', section: 'Ações rápidas', path: '/gado/lotes' });
    if (can('picking.perform')) quick.push({ id: 'q-pick', label: 'Separar pedidos', hint: 'Fila de separação', section: 'Ações rápidas', path: '/estoque/separacao' });
    if (can('finance.pay')) quick.push({ id: 'q-fin', label: 'Baixar parcelas', hint: 'Contas a receber', section: 'Ações rápidas', path: '/financeiro' });
    return [
      ...quick,
      ...sections.flatMap((s) => s.items.map((i) => ({ id: i.id, label: i.label, hint: i.description, section: s.label, icon: i.icon, path: i.path }))),
    ];
  }, [sections, can]);

  const filtered = useMemo(() => commands.filter((c) => matchesSearch([c.label, c.hint, c.section], q)), [commands, q]);
  useEffect(() => setHi(0), [q, open]);
  useEffect(() => {
    if (!open) setQ('');
  }, [open]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${hi}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [hi]);

  if (!open) return null;
  const go = (c: Command) => {
    onClose();
    nav(c.path);
  };
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-start justify-center px-3 pt-[12vh]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] anim-fade" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Ir para"
        className="relative w-full max-w-xl rounded-card border border-border bg-surface shadow-pop anim-pop overflow-hidden"
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHi((h) => Math.min(h + 1, filtered.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHi((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter' && filtered[hi]) go(filtered[hi]);
          else if (e.key === 'Escape') onClose();
        }}
      >
        <div className="flex items-center gap-3 px-4 border-b border-border">
          <Search className="size-4 text-subtle" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ir para tela ou ação…"
            className="h-12 flex-1 bg-transparent outline-none text-[15px] placeholder:text-subtle"
          />
          <kbd className="hidden sm:inline text-[10px] text-subtle border border-border rounded px-1.5 py-0.5">ESC</kbd>
        </div>
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-1.5">
          {filtered.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted">Nada encontrado.</p>}
          {filtered.map((c, i) => {
            const Icon = c.icon || ArrowRight;
            return (
              <button
                key={c.id}
                data-i={i}
                type="button"
                onMouseEnter={() => setHi(i)}
                onClick={() => go(c)}
                className={cn('w-full flex items-center gap-3 rounded-control px-3 py-2.5 text-left cursor-pointer', i === hi && 'bg-surface-2')}
              >
                <Icon className="size-4 text-muted shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-fg truncate">{c.label}</span>
                  {c.hint && <span className="block text-xs text-subtle truncate">{c.hint}</span>}
                </span>
                <span className="text-[11px] text-subtle shrink-0 hidden sm:block">{c.section}</span>
                {i === hi && <CornerDownLeft className="size-3.5 text-subtle shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Login (interno)
// ---------------------------------------------------------------------------

function friendly(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/invalid.*credential|wrong-password|invalid login|invalid_credentials|user-not-found/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/network|fetch/i.test(m)) return 'Sem conexão com o servidor. Verifique a internet.';
  return m;
}

/** Login: Google (principal) ou e-mail e senha, com primeiro acesso (criar senha) e recuperação. */
export function LoginForm({ className }: { className?: string }) {
  const backend = useBackend();
  const [mode, setMode] = useState<'google' | 'login' | 'first' | 'reset'>('google');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const go = (m: typeof mode) => {
    setMode(m);
    setError(null);
    setInfo(null);
    setPassword('');
    setConfirm('');
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await fn();
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  };

  const link = 'block mx-auto text-xs text-muted hover:text-fg cursor-pointer';
  const emailField = (
    <Field label="E-mail">
      <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} prefix={<Mail className="size-4" />} placeholder="voce@empresa.com" required />
    </Field>
  );
  const feedback = (
    <>
      {error && <p className="text-sm text-danger">{error}</p>}
      {info && <p className="text-sm text-success">{info}</p>}
    </>
  );

  if (mode === 'first') {
    return (
      <form
        className={cn('w-full space-y-4', className)}
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            if (password.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
            if (password !== confirm) throw new Error('As duas senhas não são iguais.');
            await backend.auth.signUpWithPassword(email.trim(), password, name.trim());
          });
        }}
      >
        <p className="text-sm text-muted">Para quem não usa conta Google: use o e-mail que recebeu o convite. Depois enviaremos um link para confirmar.</p>
        <Field label="Seu nome">
          <Input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} prefix={<UserRound className="size-4" />} required />
        </Field>
        {emailField}
        <Field label="Crie uma senha" hint="Pelo menos 6 caracteres.">
          <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} prefix={<KeyRound className="size-4" />} required />
        </Field>
        <Field label="Repita a senha">
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} prefix={<KeyRound className="size-4" />} required />
        </Field>
        {feedback}
        <Button type="submit" variant="primary" block size="lg" loading={busy}>
          Criar acesso
        </Button>
        <button type="button" onClick={() => go('login')} className={link}>
          Já tenho senha — entrar
        </button>
      </form>
    );
  }

  if (mode === 'reset') {
    return (
      <form
        className={cn('w-full space-y-4', className)}
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await backend.auth.sendPasswordReset(email.trim());
            setInfo('Se o e-mail estiver cadastrado, enviamos um link para criar uma nova senha.');
          });
        }}
      >
        <p className="text-sm text-muted">Informe seu e-mail e enviaremos um link para criar uma nova senha.</p>
        {emailField}
        {feedback}
        <Button type="submit" variant="primary" block size="lg" loading={busy}>
          Enviar link
        </Button>
        <button type="button" onClick={() => go('login')} className={link}>
          Voltar ao login
        </button>
      </form>
    );
  }

  if (mode === 'google') {
    return (
      <div className={cn('w-full space-y-4', className)}>
        <Button variant="primary" block size="lg" loading={busy} onClick={() => void run(() => backend.auth.signInWithGoogle())}>
          Entrar com Google
        </Button>
        <p className="text-xs text-muted text-center">Use a conta Google do seu e-mail da empresa.</p>
        {feedback}
        <div className="flex items-center gap-3 text-[11px] text-subtle uppercase tracking-wider pt-2">
          <span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
        </div>
        <Button block onClick={() => go('login')} icon={<Mail className="size-4" />}>
          Entrar com e-mail e senha
        </Button>
      </div>
    );
  }

  return (
    <form
      className={cn('w-full space-y-4', className)}
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => backend.auth.signInWithPassword(email.trim(), password));
      }}
    >
      {emailField}
      <Field label="Senha">
        <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} prefix={<KeyRound className="size-4" />} required />
      </Field>
      {feedback}
      <Button type="submit" variant="primary" block size="lg" loading={busy}>
        Entrar
      </Button>
      <div className="flex items-center justify-between gap-3 text-xs">
        <button type="button" onClick={() => go('reset')} className="text-muted hover:text-fg cursor-pointer">
          Esqueci minha senha
        </button>
        <button type="button" onClick={() => go('first')} className="text-primary font-medium hover:underline cursor-pointer">
          Primeiro acesso? Criar senha
        </button>
      </div>
      <button type="button" onClick={() => go('google')} className={link}>
        Voltar para o login com Google
      </button>
    </form>
  );
}

/** Conteúdo da tela "acesso negado" (a moldura é de cada opção). */
export function DeniedContent({ message }: { message?: string }) {
  const s = useSession();
  const unverified = s.deniedReason === 'UNVERIFIED';
  return (
    <div className="space-y-5 text-center">
      <div>
        <h1 className="font-display text-2xl font-semibold text-fg">{unverified ? 'Confirme o seu e-mail' : 'Acesso não liberado'}</h1>
        <p className="text-sm text-muted mt-2">{message || 'Seu usuário ainda não tem acesso a este sistema.'}</p>
        {s.user?.email && !unverified && <p className="text-xs text-subtle mt-2">Conectado como {s.user.email}</p>}
      </div>
      {!unverified && <p className="text-sm text-muted">Peça a um administrador para enviar um convite para o seu e-mail ou use um e-mail corporativo.</p>}
      <div className="flex flex-col sm:flex-row gap-2 justify-center">
        <Button variant="primary" onClick={() => void s.refresh()}>
          {unverified ? 'Já confirmei, entrar' : 'Tentar novamente'}
        </Button>
        <Button onClick={() => void s.signOut()}>{unverified ? 'Voltar' : 'Sair e usar outro e-mail'}</Button>
      </div>
      {!unverified && (
        <a href="#/portal" className="inline-block text-xs text-primary hover:underline">
          Sou cliente — ir para o portal de pedidos
        </a>
      )}
    </div>
  );
}

/** Saudação conforme a hora. */
export function greeting(name?: string | null) {
  const h = new Date().getHours();
  const g = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const first = (name || '').trim().split(/\s+/)[0];
  return first ? `${g}, ${first}` : g;
}
