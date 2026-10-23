/**
 * Opção B — layout "Campo Claro": barra superior com menus por área,
 * abas da área atual logo abaixo e menu em tela cheia no celular.
 */
import { CommandPalette, useCommandHotkey, useNav } from '@shared/app/shell';
import { useSession } from '@shared/app/session';
import { useTheme } from '@shared/app/theme';
import { useBackend } from '@shared/data/react';
import { ROLE_LABELS } from '@shared/domain/labels';
import type { NavSection } from '@shared/app/registry';
import { Avatar, cn } from '@shared/ui';
import { ChevronDown, LogOut, Menu, Moon, Search, Sun, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Wordmark } from './Brand';

export function Layout({ children }: { children: React.ReactNode }) {
  const [palette, setPalette] = useState(false);
  const [mobile, setMobile] = useState(false);
  const loc = useLocation();
  const { activeSection, activeItem } = useNav();
  useCommandHotkey(() => setPalette(true));
  useEffect(() => setMobile(false), [loc.pathname]);

  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="sticky top-0 z-40 bg-surface/95 backdrop-blur border-b border-border no-print">
        <div className="mx-auto max-w-[1400px] h-16 px-4 sm:px-6 flex items-center gap-3 min-w-0">
          <button onClick={() => setMobile(true)} className="xl:hidden -ml-1 size-10 inline-flex items-center justify-center rounded-control text-muted hover:text-fg cursor-pointer" aria-label="Abrir menu">
            <Menu className="size-5" />
          </button>
          <Link to="/" aria-label="Início" className="shrink-0">
            <Wordmark />
          </Link>
          <TopNav />
          <div className="ml-auto flex items-center gap-1.5">
            <DemoPill />
            <button
              onClick={() => setPalette(true)}
              className="h-9 inline-flex items-center gap-2 rounded-pill bg-surface-2 px-3 text-[13px] text-muted hover:text-fg cursor-pointer"
              aria-label="Buscar"
            >
              <Search className="size-4" />
              <span className="hidden 2xl:inline">Buscar</span>
              <kbd className="hidden 2xl:inline text-[10px] text-subtle whitespace-nowrap">Ctrl K</kbd>
            </button>
            <UserMenu />
          </div>
        </div>
        {activeSection && activeSection.items.length > 1 && (
          <div className="border-t border-border">
            <nav aria-label={activeSection.label} className="mx-auto max-w-[1360px] px-4 sm:px-6 scroll-x">
              <ul className="flex gap-1 min-w-max">
                {activeSection.items.map((it) => {
                  const active = activeItem?.id === it.id;
                  return (
                    <li key={it.id}>
                      <NavLink
                        to={it.path}
                        className={cn(
                          'relative inline-flex items-center gap-2 h-11 px-3 text-[13px] font-medium whitespace-nowrap',
                          active ? 'text-primary' : 'text-muted hover:text-fg',
                        )}
                      >
                        <it.icon className="size-4" strokeWidth={1.9} />
                        {it.label}
                        {active && <span className="absolute left-2 right-2 bottom-0 h-[2.5px] rounded-full bg-primary" />}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-[1360px] px-4 sm:px-6 py-6 sm:py-8">{children}</main>

      {mobile && <MobileMenu onClose={() => setMobile(false)} />}
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}

function DemoPill() {
  const backend = useBackend();
  if (!backend.info.demo) return null;
  return <span className="hidden 2xl:inline-flex items-center h-7 px-2.5 rounded-pill bg-accent-soft text-accent text-[11px] font-semibold">Demonstração</span>;
}

/** Menus suspensos por área (desktop). */
function TopNav() {
  const { sections, activeSection } = useNav();
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const loc = useLocation();
  useEffect(() => setOpen(null), [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(null);
    };
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    document.addEventListener('mousedown', h);
    window.addEventListener('keydown', k);
    return () => {
      document.removeEventListener('mousedown', h);
      window.removeEventListener('keydown', k);
    };
  }, [open]);

  return (
    <div ref={ref} className="hidden xl:flex items-center gap-0 ml-2 min-w-0">
      {sections.map((s) => {
        const single = s.items.length === 1;
        const isActive = activeSection?.id === s.id;
        const cls = cn(
          'h-9 inline-flex items-center gap-1 px-2.5 rounded-pill text-[13px] font-medium transition-colors cursor-pointer whitespace-nowrap',
          isActive ? 'bg-primary-soft text-primary' : 'text-muted hover:text-fg hover:bg-surface-2',
        );
        if (single)
          return (
            <Link key={s.id} to={s.items[0].path} className={cls}>
              {s.label}
            </Link>
          );
        return (
          <div key={s.id} className="relative">
            <button type="button" className={cls} aria-expanded={open === s.id} onClick={() => setOpen((o) => (o === s.id ? null : s.id))}>
              {s.label}
              <ChevronDown className={cn('size-3.5 transition-transform', open === s.id && 'rotate-180')} />
            </button>
            {open === s.id && <Dropdown section={s} />}
          </div>
        );
      })}
    </div>
  );
}

function Dropdown({ section }: { section: NavSection }) {
  return (
    <div className="absolute left-0 top-full mt-2 w-[340px] rounded-card border border-border bg-surface shadow-pop p-2 anim-pop z-50">
      {section.items.map((it) => (
        <Link key={it.id} to={it.path} className="flex items-start gap-3 rounded-control p-2.5 hover:bg-surface-2">
          <span className="size-9 rounded-control bg-primary-soft text-primary flex items-center justify-center shrink-0">
            <it.icon className="size-[18px]" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-fg">{it.label}</span>
            {it.description && <span className="block text-xs text-muted mt-0.5">{it.description}</span>}
          </span>
        </Link>
      ))}
    </div>
  );
}

function UserMenu() {
  const { profile, signOut } = useSession();
  const { mode, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-pill p-1 pr-2 hover:bg-surface-2 cursor-pointer" aria-label="Minha conta">
        <Avatar name={profile?.name} size={32} />
        <ChevronDown className="size-3.5 text-subtle hidden sm:block" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-card border border-border bg-surface shadow-pop p-2 anim-pop z-50">
          <div className="px-2.5 py-2 border-b border-border mb-1">
            <div className="text-sm font-semibold truncate">{profile?.name}</div>
            <div className="text-xs text-muted truncate">{profile?.email}</div>
            <div className="text-[11px] text-primary font-medium mt-1">{profile ? ROLE_LABELS[profile.role] : ''}</div>
          </div>
          <button onClick={toggle} className="w-full flex items-center gap-2.5 h-9 px-2.5 rounded-control text-sm hover:bg-surface-2 cursor-pointer">
            {mode === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            {mode === 'dark' ? 'Tema claro' : 'Tema escuro'}
          </button>
          <button onClick={() => void signOut()} className="w-full flex items-center gap-2.5 h-9 px-2.5 rounded-control text-sm text-danger hover:bg-danger-soft cursor-pointer">
            <LogOut className="size-4" /> Sair
          </button>
        </div>
      )}
    </div>
  );
}

function MobileMenu({ onClose }: { onClose: () => void }) {
  const { sections, activeItem } = useNav();
  const { profile, signOut } = useSession();
  return (
    <div className="xl:hidden fixed inset-0 z-[60] bg-surface flex flex-col anim-fade">
      <div className="h-16 px-4 flex items-center justify-between border-b border-border shrink-0">
        <Wordmark />
        <button onClick={onClose} className="size-10 inline-flex items-center justify-center rounded-control text-muted cursor-pointer" aria-label="Fechar menu">
          <X className="size-5" />
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {sections.map((s) => (
          <div key={s.id}>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-subtle mb-1.5">{s.label}</div>
            <div className="grid grid-cols-2 gap-2">
              {s.items.map((it) => (
                <NavLink
                  key={it.id}
                  to={it.path}
                  className={cn(
                    'flex items-center gap-2 rounded-control border px-3 py-2.5 text-[13px] font-medium',
                    activeItem?.id === it.id ? 'border-primary bg-primary-soft text-primary' : 'border-border text-fg',
                  )}
                >
                  <it.icon className="size-4 shrink-0" />
                  <span className="truncate">{it.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-border p-4 flex items-center gap-3 shrink-0">
        <Avatar name={profile?.name} size={36} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{profile?.name}</div>
          <div className="text-xs text-muted">{profile ? ROLE_LABELS[profile.role] : ''}</div>
        </div>
        <button onClick={() => void signOut()} className="h-9 px-3 rounded-control border border-border text-sm cursor-pointer">
          Sair
        </button>
      </div>
    </div>
  );
}
