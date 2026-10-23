import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppRoot } from '@shared/app/Root';
import { initTheme } from '@shared/app/theme';
import { configurePdf } from '@shared/ui';
import { createBackend } from './backend';
import { kit } from './shell';
import './index.css';

initTheme('light');
configurePdf({ accent: [30, 107, 69], company: 'MVGB Agro — Aurus Prime' });

createBackend().then((backend) => {
  // Migração: leitura direta do banco antigo no mesmo projeto Firebase
  const fb = (backend as { firebase?: { app: import('firebase/app').FirebaseApp; config: { legacyFirestoreDatabaseId?: string } } }).firebase;
  if (fb) void import('./backend/legacy').then((m) => m.registerLegacySource(fb.app, fb.config.legacyFirestoreDatabaseId));
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <AppRoot backend={backend} kit={kit} />
    </React.StrictMode>,
  );
});
