import { Check, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemeMode } from '../../../app/theme';
import { Card, CardHeader, cn } from '../../../ui';

const MODES: { value: ThemeMode; label: string; hint: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', hint: 'Melhor em ambientes iluminados e para impressão de tela.', icon: Sun },
  { value: 'dark', label: 'Escuro', hint: 'Cansa menos a vista à noite e economiza bateria no celular.', icon: Moon },
];

export function AppearanceTab() {
  const { mode, setMode } = useTheme();
  return (
    <Card className="max-w-3xl">
      <CardHeader title="Tema" subtitle="A escolha vale só para este aparelho e este navegador. Cada pessoa pode usar o seu." />
      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Tema">
        {MODES.map((m) => {
          const active = mode === m.value;
          const Icon = m.icon;
          return (
            <button
              key={m.value}
              data-mode={m.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setMode(m.value)}
              className={cn(
                'text-left rounded-card border p-3 transition-colors cursor-pointer',
                active ? 'border-primary ring-2 ring-primary/25' : 'border-border hover:border-border-strong',
              )}
            >
              <div className={cn('h-20 rounded-control flex items-center justify-center', active ? 'bg-primary-soft text-primary' : 'bg-surface-2 text-muted')}>
                <Icon className="size-8" />
              </div>
              <div className="flex items-start justify-between gap-2 mt-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-fg">
                    <Icon className="size-4" /> {m.label}
                  </div>
                  <p className="text-xs text-muted mt-0.5">{m.hint}</p>
                </div>
                {active && (
                  <span className="size-5 rounded-full bg-primary text-primary-fg flex items-center justify-center shrink-0">
                    <Check className="size-3.5" />
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
