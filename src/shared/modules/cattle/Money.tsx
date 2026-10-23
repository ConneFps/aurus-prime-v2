import { useEffect, useState } from 'react';
import { integer, money, number } from '../../domain/format';

/** R$ curto para cartões no celular: R$ 4.814 · R$ 69,1 mil · R$ 265 mil · R$ 1,2 mi. */
export function brlShort(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (a >= 1e6) return `${s}R$ ${number(a / 1e6, 1)} mi`;
  if (a >= 1e5) return `${s}R$ ${integer(a / 1000)} mil`;
  if (a >= 1e4) return `${s}R$ ${number(a / 1000, 1)} mil`;
  return `${s}R$ ${integer(a)}`;
}

/** Valor em reais: curto no celular, completo a partir de sm. */
export function StatMoney({ value }: { value: number }) {
  return (
    <>
      <span className="sm:hidden text-xl">{brlShort(value)}</span>
      <span className="hidden sm:inline">{money(value)}</span>
    </>
  );
}

/** true a partir de 640 px (breakpoint sm) — usado para esconder ícones decorativos no celular. */
export function useSmUp(): boolean {
  const q = '(min-width: 640px)';
  const [m, setM] = useState(() => (typeof window === 'undefined' ? true : window.matchMedia(q).matches));
  useEffect(() => {
    const mq = window.matchMedia(q);
    const h = () => setM(mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return m;
}
