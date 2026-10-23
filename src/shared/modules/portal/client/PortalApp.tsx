/**
 * PORTAL DO CLIENTE — aplicativo do cliente (montado em /portal/*, fora do
 * layout interno, dentro de PortalSessionProvider). Mobile-first.
 */
import { Ban, ClipboardList, Clock, LayoutGrid, LogOut, MessageCircle, RefreshCw, ShoppingCart, UserRound, UserX } from 'lucide-react';
import React from 'react';
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { usePortalSession } from '../../../app/session';
import { useSettings } from '../../../app/settings';
import { useAction } from '../../../data/react';
import { Avatar, Button, cn, PageLoader } from '../../../ui';
import { brandName, waLink } from '../lib';
import { CartProvider, useCart } from './cart';
import { CartView } from './CartView';
import { CatalogView } from './CatalogView';
import { OrderDetailView } from './OrderDetailView';
import { OrdersView } from './OrdersView';
import { BrandMark, CenteredScreen, WhatsAppFab } from './parts';
import { PortalAuth } from './PortalAuth';
import { ProfileView } from './ProfileView';

export function PortalApp() {
  const s = usePortalSession();
  const { settings } = useSettings();
  const brand = brandName(settings);
  const out = useAction(() => s.signOut());
  const wa = (text: string) => waLink(settings.whatsapp, text);
  const brandRow = (
    <div className="flex items-center gap-2.5">
      <BrandMark name={brand} logoUrl={settings.logoUrl} size={32} />
      <span className="font-display font-semibold text-fg">{brand}</span>
    </div>
  );
  const exitBtn = (
    <Button variant="ghost" icon={<LogOut className="size-4" />} loading={out.running} onClick={() => void out.run()}>
      Sair
    </Button>
  );
  const talkBtn = (text: string) =>
    settings.whatsapp ? (
      <a href={wa(text)} target="_blank" rel="noopener noreferrer" className="flex">
        <Button variant="primary" block icon={<MessageCircle className="size-4" />}>
          Falar com a equipe
        </Button>
      </a>
    ) : null;

  if (s.status === 'loading') return <PageLoader label="Abrindo o portal…" />;
  if (s.status === 'signed-out') return <PortalAuth brand={brand} logoUrl={settings.logoUrl} />;
  if (s.status === 'no-account' || !s.account) {
    return (
      <CenteredScreen
        brand={brandRow}
        icon={<UserX />}
        tone="warning"
        title="Não encontramos seu cadastro no portal"
        actions={
          <>
            {talkBtn(`Olá! Tentei entrar no portal com ${s.user?.email || 'meu e-mail'} e não encontrei meu cadastro.`)}
            {exitBtn}
          </>
        }
      >
        O e-mail <strong className="text-fg">{s.user?.email}</strong> não tem conta de cliente. Saia e crie seu cadastro, ou fale com a nossa equipe.
      </CenteredScreen>
    );
  }

  const acc = s.account;
  if (acc.status === 'PENDING') {
    return (
      <CenteredScreen
        brand={brandRow}
        icon={<Clock />}
        tone="warning"
        title={s.notice ? 'Confirme o seu e-mail' : 'Cadastro em análise'}
        actions={
          <>
            {talkBtn(`Olá! Sou ${acc.name}${acc.companyName ? ` (${acc.companyName})` : ''} e enviei meu cadastro no portal.`)}
            <Button icon={<RefreshCw className="size-4" />} onClick={() => void s.refresh()}>
              Verificar novamente
            </Button>
            {exitBtn}
          </>
        }
      >
        {s.notice ||
          `Obrigado, ${acc.name.split(' ')[0]}! Nossa equipe está conferindo seus dados. Assim que o acesso for liberado, você já pode ver o catálogo e fazer pedidos por aqui.`}
      </CenteredScreen>
    );
  }
  if (acc.status === 'REJECTED' || acc.status === 'BLOCKED') {
    const rejected = acc.status === 'REJECTED';
    return (
      <CenteredScreen
        brand={brandRow}
        icon={<Ban />}
        tone="danger"
        title={rejected ? 'Cadastro não aprovado' : 'Acesso suspenso'}
        actions={
          <>
            {talkBtn(`Olá! Sou ${acc.name} e gostaria de falar sobre meu acesso ao portal.`)}
            {exitBtn}
          </>
        }
      >
        {rejected
          ? acc.rejectionReason
            ? `Motivo informado pela equipe: ${acc.rejectionReason}.`
            : 'Não foi possível liberar o seu cadastro.'
          : 'Seu acesso ao portal está temporariamente bloqueado.'}{' '}
        Fale com a gente para resolver.
      </CenteredScreen>
    );
  }

  return (
    <CartProvider accountId={acc.id}>
      <Shell brand={brand} logoUrl={settings.logoUrl} whatsapp={settings.whatsapp ? wa(`Olá! Sou ${acc.name}${acc.companyName ? ` (${acc.companyName})` : ''} e preciso de ajuda.`) : null}>
        <Routes>
          <Route index element={<CatalogView />} />
          <Route path="carrinho" element={<CartView />} />
          <Route path="pedidos" element={<OrdersView />} />
          <Route path="pedidos/:id" element={<OrderDetailView />} />
          <Route path="perfil" element={<ProfileView />} />
          <Route path="*" element={<Navigate to="/portal" replace />} />
        </Routes>
      </Shell>
    </CartProvider>
  );
}

const NAV = [
  { to: '/portal', label: 'Catálogo', icon: LayoutGrid, end: true },
  { to: '/portal/pedidos', label: 'Pedidos', icon: ClipboardList, end: false },
  { to: '/portal/perfil', label: 'Perfil', icon: UserRound, end: false },
];

function Shell({ brand, logoUrl, whatsapp, children }: { brand: string; logoUrl?: string | null; whatsapp: string | null; children: React.ReactNode }) {
  const { account } = usePortalSession();
  const { count } = useCart();
  const loc = useLocation();
  const inCart = loc.pathname.startsWith('/portal/carrinho');
  const onCatalog = loc.pathname === '/portal' || loc.pathname === '/portal/';
  return (
    <div className="min-h-dvh bg-bg overflow-x-clip">
      <header className="sticky top-0 z-40 bg-surface/95 backdrop-blur border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center gap-4">
          <NavLink to="/portal" className="flex items-center gap-2.5 min-w-0">
            <BrandMark name={brand} logoUrl={logoUrl} size={34} />
            <div className="min-w-0 leading-tight">
              <div className="font-display font-semibold text-fg truncate">{brand}</div>
              <div className="text-[11px] text-muted truncate">{account?.companyName || 'Portal do cliente'}</div>
            </div>
          </NavLink>
          <nav className="hidden sm:flex items-center gap-1 ml-6">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cn('h-9 px-3 rounded-control text-sm font-medium inline-flex items-center gap-2 transition-colors', isActive ? 'bg-primary-soft text-primary' : 'text-muted hover:text-fg hover:bg-surface-2')
                }
              >
                <n.icon className="size-4" />
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <NavLink
              to="/portal/carrinho"
              aria-label={`Carrinho (${count} ${count === 1 ? 'item' : 'itens'})`}
              className={({ isActive }) =>
                cn(
                  'relative h-10 rounded-control inline-flex items-center gap-2 px-3 text-sm font-medium transition-colors',
                  isActive ? 'bg-primary text-primary-fg' : 'bg-surface-2 text-fg hover:bg-surface-3 border border-border',
                )
              }
            >
              <ShoppingCart className="size-4.5" />
              <span className="max-sm:hidden">Carrinho</span>
              {count > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-accent text-accent-fg text-[11px] font-semibold flex items-center justify-center num shadow-card">
                  {count}
                </span>
              )}
            </NavLink>
            <NavLink to="/portal/perfil" className="max-sm:hidden" title={account?.name}>
              <Avatar name={account?.name} size={36} />
            </NavLink>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-28 sm:pb-16">{children}</main>

      {/* Navegação inferior (celular) */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur border-t border-border h-16 grid grid-cols-4 pb-[env(safe-area-inset-bottom)]">
        {[NAV[0], { to: '/portal/carrinho', label: 'Carrinho', icon: ShoppingCart, end: false }, NAV[1], NAV[2]].map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => cn('relative flex flex-col items-center justify-center gap-1 text-[11px] font-medium', isActive ? 'text-primary' : 'text-muted')}
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute top-0 h-0.5 w-10 rounded-full bg-primary" />}
                <span className="relative">
                  <n.icon className="size-5" />
                  {n.to === '/portal/carrinho' && count > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-4 h-4 px-1 rounded-full bg-accent text-accent-fg text-[10px] font-semibold flex items-center justify-center num">
                      {count}
                    </span>
                  )}
                </span>
                {n.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {whatsapp && !inCart && <WhatsAppFab href={whatsapp} raised={onCatalog && count > 0 ? 'bar' : 'nav'} />}
    </div>
  );
}
