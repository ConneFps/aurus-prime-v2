/**
 * Opção B — leitura DIRETA do sistema antigo para a migração.
 *
 * O sistema antigo e o novo ficam no MESMO projeto Firebase; o antigo usa
 * outro banco nomeado (config.legacyFirestoreDatabaseId). A leitura usa a
 * sessão do próprio app (mesmo Firebase Auth → mesmo usuário/uid), e as
 * regras do banco antigo decidem o que pode ser lido: coleções negadas não
 * interrompem a migração (aparecem como aviso).
 *
 * Uso (coordenador, no main.tsx): registerLegacySource(backend.firebase.app, config.legacyFirestoreDatabaseId)
 */
import type { FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { collection, getDocs, getFirestore } from 'firebase/firestore';
import { readAllWith, type LegacyLister } from '@shared/migration/collections';
import { chunksToBlob, setLegacySource, type LegacySource } from '@shared/migration/source';

export function createLegacySource(app: FirebaseApp, legacyDatabaseId: string): LegacySource {
  const auth = getAuth(app);
  const db = getFirestore(app, legacyDatabaseId);
  const lister: LegacyLister = {
    async list(path) {
      const [first, ...rest] = path;
      const snap = await getDocs(collection(db, first, ...rest));
      return snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
    },
  };
  return {
    label: `Firebase do sistema atual (${app.options.projectId || 'projeto'} · banco ${legacyDatabaseId})`,
    async connect() {
      if (!auth.currentUser) throw new Error('Entre no sistema com o e-mail de administrador antes de migrar.');
    },
    async readAll(onProgress) {
      if (!auth.currentUser) await this.connect();
      return readAllWith(lister, onProgress);
    },
    async readAttachment(key) {
      const meta = await lister.list(['sales_attachments', key, 'chunks']);
      if (!meta.length) return null;
      const pieces = meta.map((d) => ({ index: typeof d.data.index === 'number' ? d.data.index : parseInt(d.id, 10) || 0, data: String(d.data.data || '') }));
      return chunksToBlob(pieces);
    },
  };
}

/** Registra a fonte "sistema antigo" para o assistente de migração (Configurações → Dados → Migração). */
export function registerLegacySource(app: FirebaseApp, legacyDatabaseId: string | null | undefined): void {
  if (!legacyDatabaseId) {
    setLegacySource(null);
    return;
  }
  setLegacySource(createLegacySource(app, legacyDatabaseId));
}
