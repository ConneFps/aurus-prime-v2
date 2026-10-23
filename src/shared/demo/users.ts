import { ROLE_LABELS } from '../domain/labels';
import { PORTAL_DEMO_EMAIL, PROFILE_SEEDS } from './seed-data';

/** Acessos sugeridos na tela de login da demonstração (qualquer senha funciona). */
export const DEMO_USERS: { email: string; name: string; role: string }[] = [
  ...PROFILE_SEEDS.map((p) => ({ email: p.email, name: p.name, role: ROLE_LABELS[p.role] })),
  { email: PORTAL_DEMO_EMAIL, name: 'Lívia Andrade — Bistrô Cambuí', role: 'Cliente do portal' },
];
