import { Building2, Database, Info, Lock, Palette, QrCode, ScrollText, ShieldCheck, Users } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useSession } from '../../../app/session';
import { Button, Callout, PageHeader, PageLoader, Tabs, type TabItem } from '../../../ui';
import { AboutTab } from './AboutTab';
import { AppearanceTab } from './AppearanceTab';
import { AuditTab } from './AuditTab';
import { BillingTab } from './BillingTab';
import { CompanyTab } from './CompanyTab';
import { DataTab } from './DataTab';
import { SecurityTab } from './SecurityTab';
import { UsersTab } from './UsersTab';
import { useSettingsDraft } from './useSettingsDraft';

type TabKey = 'empresa' | 'cobranca' | 'usuarios' | 'seguranca' | 'auditoria' | 'dados' | 'aparencia' | 'sobre';
const DRAFT_TABS: TabKey[] = ['empresa', 'cobranca', 'seguranca'];

export function SettingsPage() {
  const { can } = useSession();
  const [params, setParams] = useSearchParams();
  const s = useSettingsDraft();

  const items: TabItem<TabKey>[] = [
    { value: 'empresa', label: 'Empresa', icon: <Building2 /> },
    { value: 'cobranca', label: 'Cobrança e Pix', icon: <QrCode /> },
    { value: 'usuarios', label: 'Usuários e acessos', icon: <Users />, hidden: !can('users.manage') },
    { value: 'seguranca', label: 'Segurança', icon: <ShieldCheck /> },
    { value: 'auditoria', label: 'Auditoria', icon: <ScrollText />, hidden: !can('audit.view') },
    { value: 'dados', label: 'Dados', icon: <Database />, hidden: !can('data.export') && !can('data.migrate') },
    { value: 'aparencia', label: 'Aparência', icon: <Palette /> },
    { value: 'sobre', label: 'Sobre', icon: <Info /> },
  ];
  const visible = items.filter((i) => !i.hidden);
  const requested = params.get('tab') as TabKey | null;
  const tab: TabKey = visible.some((i) => i.value === requested) ? (requested as TabKey) : 'empresa';
  const setTab = (t: TabKey) => setParams({ tab: t }, { replace: true });
  const editsDraft = DRAFT_TABS.includes(tab);

  return (
    <>
      <PageHeader eyebrow="Sistema" title="Configurações" subtitle="Dados da empresa, cobrança Pix, usuários, segurança, auditoria e dados do sistema." />
      <Tabs value={tab} onChange={setTab} items={items} className="mb-5" />

      {editsDraft && !s.canEdit && (
        <Callout tone="info" className="mb-4" title="Somente leitura">
          <span className="inline-flex items-center gap-1.5">
            <Lock className="size-3.5" /> Apenas administradores e gerentes alteram estas configurações.
          </span>
        </Callout>
      )}

      {editsDraft && s.loading ? (
        <PageLoader />
      ) : (
        <div className={s.dirty ? 'pb-24' : undefined}>
          {tab === 'empresa' && <CompanyTab s={s} />}
          {tab === 'cobranca' && <BillingTab s={s} />}
          {tab === 'seguranca' && <SecurityTab s={s} />}
          {tab === 'usuarios' && <UsersTab />}
          {tab === 'auditoria' && <AuditTab />}
          {tab === 'dados' && <DataTab />}
          {tab === 'aparencia' && <AppearanceTab />}
          {tab === 'sobre' && <AboutTab />}
        </div>
      )}

      {s.dirty && s.canEdit && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 sm:px-6 sm:pb-5 pointer-events-none">
          <div className="pointer-events-auto mx-auto max-w-3xl rounded-card border border-border-strong bg-surface shadow-pop px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <div className="font-medium text-fg">Alterações não salvas</div>
              <div className="text-xs text-muted">{!s.exists ? 'As configurações serão criadas agora.' : 'Valem para todos os usuários assim que salvar.'}</div>
            </div>
            <div className="flex gap-2 sm:shrink-0">
              <Button variant="ghost" className="max-sm:flex-1" onClick={s.reset}>
                Descartar
              </Button>
              <Button variant="primary" className="max-sm:flex-1" loading={s.save.running} onClick={() => void s.save.run()}>
                Salvar alterações
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
