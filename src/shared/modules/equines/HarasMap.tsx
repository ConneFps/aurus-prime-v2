/**
 * "Mapa do haras": animais agrupados por haras → baia/piquete.
 */
import { DoorOpen, ExternalLink, Warehouse } from 'lucide-react';
import { useMemo } from 'react';
import type { Equine } from '../../domain/types';
import { Badge, Card, CardHeader, EmptyState } from '../../ui';
import { distinct } from './model';
import { EquineChip } from './EquineCard';

const NO_HARAS = 'Sem haras informado';
const NO_PADDOCK = 'Sem baia definida';

export function HarasMap({ equines }: { equines: Equine[] }) {
  const groups = useMemo(() => {
    const byHaras = new Map<string, Equine[]>();
    equines.forEach((e) => {
      const k = e.haras?.trim() || NO_HARAS;
      byHaras.set(k, [...(byHaras.get(k) || []), e]);
    });
    return Array.from(byHaras.entries())
      .sort(([a], [b]) => (a === NO_HARAS ? 1 : b === NO_HARAS ? -1 : a.localeCompare(b, 'pt-BR')))
      .map(([haras, list]) => {
        const byPaddock = new Map<string, Equine[]>();
        list.forEach((e) => {
          const k = e.paddock?.trim() || NO_PADDOCK;
          byPaddock.set(k, [...(byPaddock.get(k) || []), e]);
        });
        const paddocks = Array.from(byPaddock.entries())
          .sort(([a], [b]) => (a === NO_PADDOCK ? 1 : b === NO_PADDOCK ? -1 : a.localeCompare(b, 'pt-BR', { numeric: true })))
          .map(([name, animals]) => ({ name, animals: animals.sort((x, y) => x.name.localeCompare(y.name, 'pt-BR')) }));
        const gps = list.find((e) => e.gps)?.gps || null;
        const address = list.find((e) => e.locationAddress)?.locationAddress || null;
        return { haras, paddocks, total: list.length, managers: distinct(list.map((e) => e.manager)), gps, address };
      });
  }, [equines]);

  if (!equines.length) return <EmptyState icon={<Warehouse className="size-5" />} title="Nenhum animal para mostrar" description="Ajuste os filtros ou cadastre animais." />;

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <Card key={g.haras}>
          <CardHeader
            icon={<Warehouse className="size-4" />}
            title={g.haras}
            subtitle={[`${g.total} ${g.total === 1 ? 'animal' : 'animais'} em ${g.paddocks.length} ${g.paddocks.length === 1 ? 'local' : 'locais'}`, g.managers.length ? `Responsável: ${g.managers.join(', ')}` : null, g.address]
              .filter(Boolean)
              .join(' · ')}
            actions={
              g.gps ? (
                <a
                  href={`https://www.google.com/maps?q=${encodeURIComponent(g.gps)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  GPS <ExternalLink className="size-3" />
                </a>
              ) : undefined
            }
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {g.paddocks.map((p) => (
              <div key={p.name} className="rounded-card border border-border bg-surface-2/60 p-2.5">
                <div className="flex items-center justify-between gap-2 px-1 pb-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted min-w-0">
                    <DoorOpen className="size-3.5 shrink-0" />
                    <span className="truncate">{p.name}</span>
                  </span>
                  <Badge size="xs">{p.animals.length}</Badge>
                </div>
                <div className="space-y-1.5">
                  {p.animals.map((e) => (
                    <EquineChip key={e.id} equine={e} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
