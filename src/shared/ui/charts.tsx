/**
 * Gráficos (Recharts) com as regras de visualização do projeto:
 *  - barras finas (≤ 24px) com ponta arredondada de 4px, linha 2px,
 *    área com lavagem ~10%, grade discreta 1px, eixo único;
 *  - cores de série em ordem fixa (paleta validada p/ daltonismo) — definidas
 *    no tema como --chart-1..8; gráfico de série única usa --chart-primary;
 *  - legenda sempre que houver 2+ séries; textos nunca na cor da série;
 *  - tooltip com crosshair (linhas/áreas) e por barra.
 */
import React, { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import { cn } from './Button';

export interface Series {
  key: string;
  name: string;
  /** Índice fixo na paleta (1..8). Siga a entidade, não a posição. */
  slot?: number;
}

const cssVar = (name: string) => `var(${name})`;
export const seriesColor = (s: Series | undefined, i: number, single: boolean) =>
  single ? cssVar('--chart-primary') : cssVar(`--chart-${s?.slot || i + 1}`);

/** Re-renderiza quando o tema muda (para o Recharts ler as variáveis novas). */
function useThemeKey() {
  const [k, setK] = useState(0);
  useEffect(() => {
    const obs = new MutationObserver(() => setK((x) => x + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    return () => obs.disconnect();
  }, []);
  return k;
}

const axisProps = {
  tick: { fill: 'var(--muted)', fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: 'var(--chart-grid)' },
} as const;

function ChartTooltip({
  active,
  payload,
  label,
  format,
  labelFormat,
}: Partial<TooltipContentProps<number, string>> & { format: (v: number) => string; labelFormat?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-control border border-border bg-surface shadow-pop px-3 py-2 text-xs min-w-[140px]">
      <div className="text-muted mb-1">{labelFormat ? labelFormat(String(label)) : String(label)}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2 py-0.5">
          <span className="h-0.5 w-3 rounded-full" style={{ background: p.color || p.stroke || (p.payload as Record<string, string>)?.fill }} />
          <span className="font-semibold text-fg num">{format(Number(p.value) || 0)}</span>
          {payload.length > 1 && <span className="text-muted truncate">{p.name}</span>}
        </div>
      ))}
    </div>
  );
}

export function Legend({ series, kind = 'rect' }: { series: Series[]; kind?: 'rect' | 'line' }) {
  if (series.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {series.map((s, i) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span
            className={kind === 'line' ? 'h-0.5 w-3.5 rounded-full' : 'size-2.5 rounded-[3px]'}
            style={{ background: seriesColor(s, i, false) }}
          />
          {s.name}
        </span>
      ))}
    </div>
  );
}

export interface TrendProps<T> {
  data: T[];
  xKey: keyof T & string;
  series: Series[];
  height?: number;
  format?: (v: number) => string;
  axisFormat?: (v: number) => string;
  xFormat?: (v: string) => string;
  kind?: 'area' | 'line';
}

/** Evolução no tempo (área ou linha). */
export function TrendChart<T>({ data, xKey, series, height = 240, format = String, axisFormat, xFormat, kind = 'area' }: TrendProps<T>) {
  const tk = useThemeKey();
  const single = series.length === 1;
  const Chart = kind === 'area' ? AreaChart : LineChart;
  return (
    <div className="space-y-2">
      <Legend series={series} kind="line" />
      <div style={{ height }} key={tk}>
        <ResponsiveContainer width="100%" height="100%">
          <Chart data={data as object[]} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey={xKey as never} {...axisProps} tickFormatter={xFormat} minTickGap={16} />
            <YAxis {...axisProps} axisLine={false} width={78} tickFormatter={axisFormat || format} />
            <Tooltip
              cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }}
              content={(p) => <ChartTooltip {...(p as object)} format={format} labelFormat={xFormat} />}
            />
            {series.map((s, i) =>
              kind === 'area' ? (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.name}
                  stroke={seriesColor(s, i, single)}
                  fill={seriesColor(s, i, single)}
                  fillOpacity={0.1}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
                />
              ) : (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.name}
                  stroke={seriesColor(s, i, single)}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
                />
              ),
            )}
          </Chart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export interface BarsProps<T> {
  data: T[];
  xKey: keyof T & string;
  series: Series[];
  height?: number;
  format?: (v: number) => string;
  axisFormat?: (v: number) => string;
  xFormat?: (v: string) => string;
  /** 'vertical' = barras horizontais (categorias no eixo Y) — melhor para nomes longos. */
  layout?: 'horizontal' | 'vertical';
  stacked?: boolean;
}

/** Barras (comparação entre categorias). */
export function BarsChart<T>({
  data,
  xKey,
  series,
  height = 240,
  format = String,
  axisFormat,
  xFormat,
  layout = 'horizontal',
  stacked,
}: BarsProps<T>) {
  const tk = useThemeKey();
  const single = series.length === 1;
  const horizontalBars = layout === 'vertical';
  return (
    <div className="space-y-2">
      <Legend series={series} />
      <div style={{ height }} key={tk}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data as object[]}
            layout={layout}
            margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
            barCategoryGap="28%"
            barGap={2}
          >
            <CartesianGrid vertical={horizontalBars} horizontal={!horizontalBars} stroke="var(--chart-grid)" />
            {horizontalBars ? (
              <>
                <XAxis type="number" {...axisProps} tickFormatter={axisFormat || format} />
                <YAxis type="category" dataKey={xKey as never} {...axisProps} width={120} tickFormatter={xFormat} interval={0} />
              </>
            ) : (
              <>
                <XAxis dataKey={xKey as never} {...axisProps} tickFormatter={xFormat} minTickGap={8} />
                <YAxis {...axisProps} axisLine={false} width={78} tickFormatter={axisFormat || format} />
              </>
            )}
            <Tooltip cursor={{ fill: 'var(--surface-2)', opacity: 0.6 }} content={(p) => <ChartTooltip {...(p as object)} format={format} labelFormat={xFormat} />} />
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.name}
                fill={seriesColor(s, i, single)}
                maxBarSize={24}
                stackId={stacked ? 'a' : undefined}
                radius={stacked && i < series.length - 1 ? 0 : horizontalBars ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                stroke={stacked ? 'var(--surface)' : undefined}
                strokeWidth={stacked ? 2 : 0}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Minigráfico para cartões de indicador. */
export function Sparkline({ values, height = 36, className }: { values: number[]; height?: number; className?: string }) {
  const tk = useThemeKey();
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div className={cn('w-full', className)} style={{ height }} key={tk}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <Area type="monotone" dataKey="v" stroke="var(--chart-primary)" fill="var(--chart-primary)" fillOpacity={0.1} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Barras de composição em HTML (lista ranqueada) — alternativa acessível à pizza. */
export function RankBars({
  items,
  format = String,
  max,
  className,
}: {
  items: { label: React.ReactNode; value: number; hint?: React.ReactNode; slot?: number }[];
  format?: (v: number) => string;
  max?: number;
  className?: string;
}) {
  const m = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className={cn('space-y-2.5', className)}>
      {items.map((it, idx) => (
        <li key={idx} className="text-sm">
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <span className="truncate text-fg">{it.label}</span>
            <span className="num text-fg font-medium shrink-0">{format(it.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-surface-2 overflow-hidden" title={format(it.value)}>
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(2, (it.value / m) * 100)}%`, background: it.slot ? `var(--chart-${it.slot})` : 'var(--chart-primary)' }}
            />
          </div>
          {it.hint && <div className="text-xs text-subtle mt-0.5">{it.hint}</div>}
        </li>
      ))}
    </ul>
  );
}
