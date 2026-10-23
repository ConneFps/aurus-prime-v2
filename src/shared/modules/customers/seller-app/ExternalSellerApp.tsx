/**
 * Aplicativo do VENDEDOR EXTERNO — montado no lugar de todo o layout interno.
 * Mobile-first: cabeçalho simples + navegação inferior fixa no celular, abas no desktop.
 */
import { ClipboardList, Home, Lock, LogOut, Plus, Users, Wallet } from 'lucide-react';
import { Link, Navigate, Route, Routes, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useSession } from '../../../app/session';
import { useSettings } from '../../../app/settings';
import { Avatar, Button, cn, IconButton } from '../../../ui';
import { ClientsView, ClientView } from './ClientsView';
import { CommissionsView } from './CommissionsView';
import { HomeView } from './HomeView';
import { EditOrderView, NewOrderView, OrdersView, OrderView } from './OrdersView';
import { PricesView } from './PricesView';
import { RequestFormView } from './RequestFormView';

const NAV = [
  { to: '/', label: 'Início', icon: Home },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/pedidos/novo', label: 'Novo pedido', icon: Plus, primary: true },
  { to: '/pedidos', label: 'Pedidos', icon: ClipboardList },
  { to: '/comissoes', label: 'Comissões', icon: Wallet },
];

function isActive(to: string, path: string) {
  if (to === '/') return path === '/';
  if (to === '/pedidos/novo') return path === '/pedidos/novo';
  if (to === '/pedidos') return path.startsWith('/pedidos') && path !== '/pedidos/novo';
  return path === to || path.startsWith(to + '/');
}

export function ExternalSellerApp() {
  const { profile, signOut } = useSession();
  const { settings } = useSettings();
  const { pathname } = useLocation();
  const editor = /^\/pedidos\/(novo|[^/]+\/editar)$/.test(pathname);

  if (profile && !profile.active)
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="bg-surface border border-border rounded-card shadow-card max-w-sm w-full p-8 text-center space-y-4">
          <div className="size-14 rounded-full bg-danger-soft text-danger flex items-center justify-center mx-auto">
            <Lock className="size-6" />
          </div>
          <h1 className="font-display text-xl font-semibold text-fg">Acesso suspenso</h1>
          <p className="text-sm text-muted">Seu acesso de vendedor externo está suspenso. Fale com o comercial para reativar.</p>
          <Button block variant="primary" onClick={() => void signOut()}>
            Sair
          </Button>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur no-print">
        <div className={cn('mx-auto px-4 sm:px-6 h-14 flex items-center gap-4', editor ? 'max-w-[1400px]' : 'max-w-5xl')}>
          <Link to="/" className="min-w-0 shrink-0 leading-tight">
            <div className="font-display text-[17px] font-semibold text-fg truncate">{settings.tradeName || 'Aurus Prime'}</div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-primary font-semibold">Vendedor externo</div>
          </Link>
          <nav className="max-sm:hidden flex items-center gap-1 ml-4 self-stretch">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  'relative inline-flex items-center gap-1.5 px-3 text-sm font-medium h-full transition-colors whitespace-nowrap',
                  n.primary ? 'text-primary hover:text-primary-hover' : isActive(n.to, pathname) ? 'text-fg' : 'text-muted hover:text-fg',
                )}
              >
                <n.icon className="size-4" />
                {n.label}
                {isActive(n.to, pathname) && <span className="absolute left-2 right-2 bottom-0 h-0.5 rounded-full bg-primary" />}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 min-w-0">
            <div className="text-right leading-tight min-w-0 max-sm:hidden">
              <div className="text-sm font-medium text-fg truncate">{profile?.name}</div>
              <div className="text-[11px] text-muted truncate">{profile?.email}</div>
            </div>
            <Avatar name={profile?.name} size={32} />
            <IconButton label="Sair" onClick={() => void signOut()}>
              <LogOut className="size-4" />
            </IconButton>
          </div>
        </div>
      </header>

      <main className={cn('mx-auto px-4 sm:px-6 pt-5 sm:pt-6', editor ? 'max-w-[1400px] pb-6' : 'max-w-5xl pb-28 sm:pb-12')}>
        <Routes>
          <Route path="/" element={<HomeView />} />
          <Route path="/clientes" element={<ClientsView />} />
          <Route path="/clientes/solicitar" element={<RequestFormView />} />
          <Route path="/clientes/:id" element={<ClientView />} />
          <Route path="/pedidos" element={<OrdersView />} />
          <Route path="/pedidos/novo" element={<NewOrderView />} />
          <Route path="/pedidos/:id" element={<OrderView />} />
          <Route path="/pedidos/:id/editar" element={<EditOrderView />} />
          <Route path="/comissoes" element={<CommissionsView />} />
          <Route path="/precos" element={<PricesView />} />
          {/* Links do sistema interno que podem chegar aqui */}
          <Route path="/vendas/nova" element={<RedirectNewSale />} />
          <Route path="/vendas/:id" element={<RedirectSale />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {!editor && (
        <nav className="sm:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)] no-print">
          <div className="grid grid-cols-5 h-16">
            {NAV.map((n) =>
              n.primary ? (
                <Link key={n.to} to={n.to} className="flex flex-col items-center justify-center gap-0.5" aria-label={n.label}>
                  <span className="size-11 -mt-5 rounded-full bg-primary text-primary-fg shadow-pop flex items-center justify-center ring-4 ring-bg">
                    <Plus className="size-5" />
                  </span>
                  <span className="text-[10px] font-medium text-primary">Novo</span>
                </Link>
              ) : (
                <Link
                  key={n.to}
                  to={n.to}
                  className={cn('flex flex-col items-center justify-center gap-1 text-[10px] font-medium', isActive(n.to, pathname) ? 'text-primary' : 'text-muted')}
                >
                  <n.icon className="size-5" />
                  {n.label}
                </Link>
              ),
            )}
          </div>
        </nav>
      )}
    </div>
  );
}

function RedirectNewSale() {
  const [params] = useSearchParams();
  const c = params.get('cliente');
  return <Navigate to={`/pedidos/novo${c ? `?cliente=${c}` : ''}`} replace />;
}

function RedirectSale() {
  const { id } = useParams();
  return <Navigate to={`/pedidos/${id}`} replace />;
}
