import { cn } from '@shared/ui';

/** Marca "folha" desta opção (original). */
export function Leaf({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={cn('shrink-0', className)} aria-hidden>
      <rect width="64" height="64" rx="16" fill="var(--primary, #1e6b45)" />
      <path d="M32 13c9 6 14 14 14 22a14 14 0 0 1-28 0c0-8 5-16 14-22Z" fill="#f5f4f0" />
      <path d="M32 22v26" stroke="var(--primary, #1e6b45)" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M32 34l7-6M32 41l-7-6" stroke="var(--primary, #1e6b45)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ className, light }: { className?: string; light?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <Leaf size={32} />
      <div className="leading-none">
        <div className={cn('font-display text-[17px] font-extrabold tracking-tight', light ? 'text-white' : 'text-fg')}>
          MVGB <span className={light ? 'text-white/80' : 'text-primary'}>Agro</span>
        </div>
        <div className={cn('text-[10px] font-medium uppercase tracking-[0.18em] mt-1', light ? 'text-white/70' : 'text-subtle')}>Aurus Prime</div>
      </div>
    </div>
  );
}
