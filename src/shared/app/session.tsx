/**
 * Sessão do usuário interno (e vendedor externo): autenticação + perfil + permissões.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { AuthUser, ProfileResolution } from '../data/api';
import { queryClient, useBackend } from '../data/react';
import { can as roleCan, type Permission } from '../domain/permissions';
import type { PortalAccount, Profile } from '../domain/types';
import { createOps } from '../ops';
import type { Actor, Ops } from '../ops/types';

export interface Session {
  status: 'loading' | 'signed-out' | 'denied' | 'ready';
  user: AuthUser | null;
  profile: Profile | null;
  deniedMessage?: string;
  deniedReason?: Extract<ProfileResolution, { status: 'denied' }>['reason'];
  can: (p: Permission) => boolean;
  actor: Actor | null;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionCtx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const backend = useBackend();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<Session['status']>('loading');
  const [deniedMessage, setDenied] = useState<string>();
  const [deniedReason, setDeniedReason] = useState<Session['deniedReason']>();

  const resolve = useCallback(async () => {
    const u = backend.auth.current();
    if (!u) {
      setProfile(null);
      setStatus('signed-out');
      return;
    }
    setStatus('loading');
    const r = await backend.auth.ensureProfile();
    if (r.status === 'ok') {
      setProfile(r.profile);
      setStatus('ready');
    } else {
      setProfile(null);
      setDenied(r.message);
      setDeniedReason(r.reason);
      setStatus('denied');
    }
  }, [backend]);

  useEffect(() => {
    let last: string | null | undefined;
    return backend.auth.onChange((u) => {
      if (last !== undefined && last !== (u?.id ?? null)) queryClient.clear();
      last = u?.id ?? null;
      setUser(u);
      setAuthReady(true);
    });
  }, [backend]);

  useEffect(() => {
    if (!authReady) return;
    void resolve();
  }, [authReady, user?.id, resolve]);

  const actor = useMemo<Actor | null>(
    () => (profile ? { id: profile.id, name: profile.name, email: profile.email, role: profile.role } : null),
    [profile],
  );

  const value = useMemo<Session>(
    () => ({
      status,
      user,
      profile,
      deniedMessage,
      deniedReason,
      actor,
      can: (p) => roleCan(profile?.role, p),
      signOut: async () => {
        await backend.auth.signOut();
      },
      refresh: resolve,
    }),
    [status, user, profile, deniedMessage, deniedReason, actor, backend, resolve],
  );

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession(): Session {
  const s = useContext(SessionCtx);
  if (!s) throw new Error('SessionProvider ausente');
  return s;
}

/** Permissão do usuário logado. */
export function useCan(p: Permission): boolean {
  return useSession().can(p);
}

/** Operações de negócio ligadas ao usuário logado. */
export function useOps(): Ops {
  const backend = useBackend();
  const { actor } = useSession();
  return useMemo(
    () => createOps({ data: backend.data, actor: actor || { id: 'anon', name: 'Anônimo', email: '', role: 'OPERATOR' } }),
    [backend, actor],
  );
}

// ----------------------------------------------------------------------------
// Portal do cliente
// ----------------------------------------------------------------------------

export interface PortalSession {
  status: 'loading' | 'signed-out' | 'no-account' | 'ready';
  user: AuthUser | null;
  account: PortalAccount | null;
  /** Aviso para a tela de cadastro em análise (ex.: confirmar e-mail para usar o convite). */
  notice: string | null;
  ops: Ops | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const PortalCtx = createContext<PortalSession | null>(null);

export function PortalSessionProvider({ children }: { children: React.ReactNode }) {
  const backend = useBackend();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState<PortalAccount | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<PortalSession['status']>('loading');

  const resolve = useCallback(async () => {
    if (!backend.auth.current()) {
      setAccount(null);
      setStatus('signed-out');
      return;
    }
    setStatus('loading');
    const r = await backend.auth.getPortalAccount();
    if (r.status === 'ok') {
      setAccount(r.account);
      setNotice(r.notice ?? null);
      setStatus('ready');
    } else {
      setAccount(null);
      setNotice(null);
      setStatus('no-account');
    }
  }, [backend]);

  useEffect(() => backend.auth.onChange((u) => {
    setUser(u);
    setReady(true);
  }), [backend]);

  useEffect(() => {
    if (ready) void resolve();
  }, [ready, user?.id, resolve]);

  const ops = useMemo(
    () =>
      account
        ? createOps({ data: backend.data, actor: { id: account.id, name: account.name, email: account.email, role: 'CUSTOMER' } })
        : null,
    [account, backend],
  );

  const value = useMemo<PortalSession>(
    () => ({ status, user, account, notice, ops, refresh: resolve, signOut: () => backend.auth.signOut() }),
    [status, user, account, notice, ops, resolve, backend],
  );
  return <PortalCtx.Provider value={value}>{children}</PortalCtx.Provider>;
}

export function usePortalSession(): PortalSession {
  const s = useContext(PortalCtx);
  if (!s) throw new Error('PortalSessionProvider ausente');
  return s;
}
