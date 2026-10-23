import type { ShellKit } from '@shared/app/Root';
import { lazy } from 'react';
import { Layout } from './Layout';
import { Denied, Login } from './Login';

const Dashboard = lazy(async () => ({ default: (await import('./Dashboard')).Dashboard }));

export const kit: ShellKit = { Layout, Dashboard, Login, Denied };
