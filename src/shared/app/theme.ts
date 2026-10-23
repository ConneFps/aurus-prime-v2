import { useCallback, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark';
const KEY = 'aurus.theme';

function read(): ThemeMode | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

let defaultMode: ThemeMode = 'light';

/** Aplica o tema salvo (ou o padrão da opção) antes do primeiro render. */
export function initTheme(def: ThemeMode) {
  defaultMode = def;
  document.documentElement.dataset.theme = read() || def;
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => (document.documentElement.dataset.theme as ThemeMode) || read() || defaultMode);
  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      /* armazenamento indisponível */
    }
  }, [mode]);
  const toggle = useCallback(() => setMode((m) => (m === 'dark' ? 'light' : 'dark')), []);
  return { mode, setMode, toggle };
}
