import { useEffect, useState } from 'react';

/** true quando a largura da tela é ≥ min (px). */
export function useMinWidth(min = 640): boolean {
  const q = `(min-width: ${min}px)`;
  const [ok, setOk] = useState(() => (typeof window === 'undefined' ? true : window.matchMedia(q).matches));
  useEffect(() => {
    const m = window.matchMedia(q);
    const h = () => setOk(m.matches);
    h();
    m.addEventListener('change', h);
    return () => m.removeEventListener('change', h);
  }, [q]);
  return ok;
}
