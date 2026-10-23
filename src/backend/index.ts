import type { Backend } from '@shared/data/api';
import config from '../../firebase-applet-config.json';

/** O arquivo firebase-applet-config.json aponta para um projeto e um banco? */
export function isFirebaseConfigured(): boolean {
  return Boolean(config.projectId && config.apiKey && config.firestoreDatabaseId);
}

function urlParam(name: string): string | null {
  try {
    return new URLSearchParams(location.search).get(name);
  } catch {
    return null;
  }
}

/** Demonstração só em build de teste (VITE_FORCE_DEMO=1); o app publicado sempre usa o Firebase. */
export function isDemoRequested(): boolean {
  return import.meta.env.VITE_FORCE_DEMO === '1';
}

/**
 * Firebase quando configurado; senão (ou em build de teste) a demonstração,
 * onde `?as=email` entra automaticamente com um dos usuários de exemplo.
 */
export async function createBackend(): Promise<Backend> {
  if (isFirebaseConfigured() && !isDemoRequested()) {
    const { createFirebaseBackend } = await import('./firebase');
    return createFirebaseBackend(config);
  }
  const { createDemoBackend } = await import('@shared/demo');
  const b = await createDemoBackend();
  const as = urlParam('as');
  if (as) await b.auth.signInWithPassword(as, 'demo');
  return b;
}
