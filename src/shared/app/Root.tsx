/**
 * Raiz do aplicativo. As duas opções usam este mesmo esqueleto e injetam
 * seu visual pelo ShellKit (layout, login, painel, tela de acesso negado).
 */
import { ShieldAlert } from 'lucide-react';
import React, { Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Backend } from '../data/api';
import { BackendProvider } from '../data/react';
import type { Permission } from '../domain/permissions';
import { Button, DialogProvider, EmptyState, PageLoader, ToastProvider } from '../ui';
import { IdleGuard } from './IdleGuard';
import { ExternalSellerApp, PortalApp, PublicCatalogPage, ROUTES } from './registry';
import { PortalSessionProvider, SessionProvider, useSession } from './session';

export interface ShellKit {
  /** Layout interno (menu, topo) — envolve as páginas. */
  Layout: React.ComponentType<{ children: React.ReactNode }>;
  Dashboard: React.ComponentType;
  Login: React.ComponentType;
  Denied: React.ComponentType<{ message?: string }>;
  /** Tela de boas-vindas quando o banco ainda não foi configurado (opcional). */
  Splash?: React.ComponentType;
}

export function AppRoot({ backend, kit }: { backend: Backend; kit: ShellKit }) {
  return (
    <BackendProvider backend={backend}>
      <ToastProvider>
        <DialogProvider>
          <HashRouter>
            <Routes>
              <Route
                path="/portal/*"
                element={
                  <PortalSessionProvider>
                    <Suspense fallback={<PageLoader />}>
                      <PortalApp />
                    </Suspense>
                  </PortalSessionProvider>
                }
              />
              <Route
                path="/catalogo/:token"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <PublicCatalogPage />
                  </Suspense>
                }
              />
              <Route
                path="/*"
                element={
                  <SessionProvider>
                    <Internal kit={kit} />
                  </SessionProvider>
                }
              />
            </Routes>
          </HashRouter>
        </DialogProvider>
      </ToastProvider>
    </BackendProvider>
  );
}

function Internal({ kit }: { kit: ShellKit }) {
  const s = useSession();
  if (s.status === 'loading') return <PageLoader label="Entrando…" />;
  if (s.status === 'signed-out') return <kit.Login />;
  if (s.status === 'denied') return <kit.Denied message={s.deniedMessage} />;
  const role = s.profile?.role;
  return (
    <>
      <IdleGuard onTimeout={() => void s.signOut()} />
      {role === 'EXTERNAL_SELLER' ? (
        <Suspense fallback={<PageLoader />}>
          <ExternalSellerApp />
        </Suspense>
      ) : (
        <kit.Layout>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={role === 'LOGISTICS' ? <Navigate to="/estoque/separacao" replace /> : <kit.Dashboard />} />
              {ROUTES.map((r) => (
                <Route
                  key={r.path}
                  path={r.path}
                  element={
                    <Guard permission={r.permission}>
                      <r.element />
                    </Guard>
                  }
                />
              ))}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </kit.Layout>
      )}
    </>
  );
}

function Guard({ permission, children }: { permission?: Permission; children: React.ReactNode }) {
  const { can } = useSession();
  if (permission && !can(permission)) {
    return (
      <EmptyState
        icon={<ShieldAlert className="size-5" />}
        title="Sem acesso a esta área"
        description="Seu perfil não tem permissão para abrir esta tela. Fale com um administrador se precisar."
      />
    );
  }
  return <>{children}</>;
}

function NotFound() {
  const loc = useLocation();
  return (
    <EmptyState
      title="Página não encontrada"
      description={`O endereço ${loc.pathname} não existe.`}
      action={
        <Button variant="primary" onClick={() => (window.location.hash = '#/')}>
          Ir para o painel
        </Button>
      }
    />
  );
}
