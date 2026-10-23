/**
 * Opção B — leitura DIRETA do sistema antigo para a migração.
 *
 * Dois cenários (firebase-applet-config.json):
 *  - MESMO projeto: o antigo é outro banco nomeado (legacyFirestoreDatabaseId) e a
 *    leitura usa a sessão do próprio app (mesmo Firebase Auth → mesmo uid).
 *  - OUTRO projeto (bloco "legacy"): abre um app Firebase secundário com a
 *    configuração do projeto antigo e faz login Google por janela nele. O endereço
 *    do sistema novo precisa estar nos Domínios autorizados do projeto ANTIGO.
 * As regras do banco antigo decidem o que pode ser lido: coleções negadas não
 * interrompem a migração (aparecem como aviso).
 *
 * Uso (coordenador, no main.tsx): registerLegacySource(backend.firebase.app, backend.firebase.config)
 */
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, type Auth } from 'firebase/auth';
import { collection, getDocs, getFirestore, type Firestore } from 'firebase/firestore';
import { getDownloadURL, getStorage, ref as storageRef } from 'firebase/storage';
import { readAllWith, type LegacyLister } from '@shared/migration/collections';
import { chunksToBlob, setLegacySource, type LegacySource } from '@shared/migration/source';
import type { FirebaseBackendConfig } from './firebase';

const LEGACY_APP = 'legacy';

function listerFor(db: Firestore): LegacyLister {
  return {
    async list(path) {
      const [first, ...rest] = path;
      const snap = await getDocs(collection(db, first, ...rest));
      return snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
    },
  };
}

function sourceFor(app: FirebaseApp, auth: Auth, db: Firestore, label: string, crossProject: boolean): LegacySource {
  const lister = listerFor(db);
  return {
    label,
    crossProject,
    async connect() {
      if (auth.currentUser) return;
      if (!crossProject) throw new Error('Entre no sistema com o e-mail de administrador antes de migrar.');
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try {
        await signInWithPopup(auth, provider);
      } catch (e) {
        const code = (e as { code?: string }).code || '';
        if (code === 'auth/unauthorized-domain')
          throw new Error(
            `Este endereço (${location.hostname}) não está autorizado no Firebase do sistema ANTIGO. Inclua-o em Authentication → Configurações → Domínios autorizados do projeto antigo, ou use o arquivo de backup.`,
          );
        if (code === 'auth/popup-blocked') throw new Error('O navegador bloqueou a janela de login. Permita pop-ups para este site e tente de novo.');
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') throw new Error('Login no sistema antigo cancelado.');
        throw e;
      }
    },
    async readAll(onProgress) {
      await this.connect();
      return readAllWith(lister, onProgress);
    },
    async readAttachment(key) {
      const meta = await lister.list(['sales_attachments', key, 'chunks']);
      if (!meta.length) return null;
      const pieces = meta.map((d) => ({ index: typeof d.data.index === 'number' ? d.data.index : parseInt(d.id, 10) || 0, data: String(d.data.data || '') }));
      return chunksToBlob(pieces);
    },
    ...(crossProject
      ? {
          async storageUrl(path: string) {
            try {
              return await getDownloadURL(storageRef(getStorage(app), path));
            } catch {
              return null;
            }
          },
        }
      : {}),
  };
}

export function createLegacySource(app: FirebaseApp, config: Pick<FirebaseBackendConfig, 'projectId' | 'legacy' | 'legacyFirestoreDatabaseId'>): LegacySource | null {
  const other = config.legacy;
  if (other && other.projectId && other.projectId !== config.projectId) {
    const { firestoreDatabaseId, ...options } = other;
    const legacyApp = getApps().find((a) => a.name === LEGACY_APP) || initializeApp(options, LEGACY_APP);
    const auth = getAuth(legacyApp);
    auth.languageCode = 'pt-BR';
    return sourceFor(legacyApp, auth, getFirestore(legacyApp, firestoreDatabaseId), `Firebase do sistema atual (projeto ${other.projectId})`, true);
  }
  const dbId = other?.firestoreDatabaseId || config.legacyFirestoreDatabaseId;
  if (!dbId) return null;
  return sourceFor(app, getAuth(app), getFirestore(app, dbId), `Firebase do sistema atual (${app.options.projectId || 'projeto'} · banco ${dbId})`, false);
}

/** Registra a fonte "sistema antigo" para o assistente de migração (Configurações → Dados → Migração). */
export function registerLegacySource(app: FirebaseApp, config: Pick<FirebaseBackendConfig, 'projectId' | 'legacy' | 'legacyFirestoreDatabaseId'>): void {
  setLegacySource(createLegacySource(app, config));
}
