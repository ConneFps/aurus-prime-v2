/**
 * Aba "Links públicos": vitrines somente leitura para compartilhar (sem login).
 */
import { Copy, ExternalLink, Link2, MessageCircle, Plus, Power, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useOps } from '../../../app/session';
import { useSettings } from '../../../app/settings';
import { useAction, useCrud } from '../../../data/react';
import { date, integer, matchesSearch, today } from '../../../domain/format';
import type { CatalogItem, PublicCatalogLink } from '../../../domain/types';
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  DateInput,
  Drawer,
  Field,
  FormGrid,
  Input,
  MaskedInput,
  Menu,
  Modal,
  SearchInput,
  Segmented,
  Switch,
  Textarea,
  toast,
  useConfirm,
  type Column,
} from '../../../ui';
import { copyText, publicCatalogUrl, waLink } from '../lib';

const isExpired = (l: PublicCatalogLink) => !!l.expiresAt && l.expiresAt < today();

export function LinksTab({ links, catalog, loading }: { links: PublicCatalogLink[]; catalog: CatalogItem[]; loading: boolean }) {
  const crud = useCrud('public_catalog_links');
  const confirm = useConfirm();
  const [creating, setCreating] = useState(false);
  const [sharing, setSharing] = useState<PublicCatalogLink | null>(null);

  const toggle = useAction((l: PublicCatalogLink) => crud.update(l.id, { active: !l.active }), { success: 'Link atualizado' });
  const remove = useAction(async (l: PublicCatalogLink) => {
    if (await confirm({ title: `Excluir o link "${l.title}"?`, message: 'Quem tiver o endereço verá a mensagem de link indisponível.', danger: true, confirmLabel: 'Excluir' })) await crud.remove(l.id);
  });

  const columns: Column<PublicCatalogLink>[] = [
    {
      key: 'title',
      header: 'Catálogo',
      mobile: 'title',
      sortValue: (l) => l.title,
      cell: (l) => (
        <div className="min-w-0">
          <div className="font-medium text-fg truncate">{l.title}</div>
          <div className="text-xs text-muted truncate">
            {l.items.length} itens · {l.showPrices ? 'com preços' : 'sem preços'} · criado em {date(l.createdAt)}
          </div>
        </div>
      ),
    },
    { key: 'expires', header: 'Validade', hideBelow: 'md', sortValue: (l) => l.expiresAt || '9999', cell: (l) => <span className={isExpired(l) ? 'text-danger' : 'text-muted'}>{l.expiresAt ? date(l.expiresAt) : 'Sem prazo'}</span> },
    { key: 'views', header: 'Visualizações', align: 'right', mobile: 'subtitle', sortValue: (l) => l.views, cell: (l) => <span className="num">{integer(l.views)}</span> },
    {
      key: 'status',
      header: 'Status',
      mobile: 'badge',
      cell: (l) => (isExpired(l) ? <Badge tone="warning" dot>Expirado</Badge> : <Badge tone={l.active ? 'success' : 'neutral'} dot>{l.active ? 'Ativo' : 'Desativado'}</Badge>),
    },
  ];

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <p className="text-sm text-muted max-w-xl">Gere uma vitrine somente leitura para mandar a clientes novos pelo WhatsApp. Os itens e preços ficam congelados no momento da publicação.</p>
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
          Novo link
        </Button>
      </div>
      <DataTable
        columns={columns}
        rows={links}
        rowKey={(l) => l.id}
        loading={loading}
        initialSort={{ key: 'title', dir: 'asc' }}
        onRowClick={setSharing}
        emptyTitle="Nenhum link publicado"
        emptyDescription="Crie um link para divulgar o catálogo sem precisar de cadastro."
        rowActions={(l) => (
          <Menu
            items={[
              { label: 'Compartilhar', icon: <Link2 />, onClick: () => setSharing(l) },
              { label: 'Abrir vitrine', icon: <ExternalLink />, onClick: () => window.open(publicCatalogUrl(l.token), '_blank') },
              { label: l.active ? 'Desativar' : 'Reativar', icon: <Power />, onClick: () => void toggle.run(l) },
              'divider',
              { label: 'Excluir', icon: <Trash2 />, danger: true, onClick: () => void remove.run(l) },
            ]}
          />
        )}
      />
      <CreateLinkDrawer open={creating} catalog={catalog} onClose={() => setCreating(false)} onCreated={(l) => setSharing(l)} />
      <ShareModal link={sharing} onClose={() => setSharing(null)} />
    </>
  );
}

function ShareModal({ link, onClose }: { link: PublicCatalogLink | null; onClose: () => void }) {
  const url = link ? publicCatalogUrl(link.token) : '';
  const message = link ? `${link.title}${link.message ? `\n${link.message}` : ''}\n\nConfira nosso catálogo: ${url}` : '';
  return (
    <Modal open={!!link} onClose={onClose} size="sm" title="Compartilhar catálogo" description={link?.title}>
      {link && (
        <div className="space-y-4">
          {!link.active && <p className="text-sm text-warning">Este link está desativado — reative para que funcione.</p>}
          <div className="rounded-control border border-border bg-surface-2 px-3 py-2.5 text-xs font-mono text-fg break-all select-all">{url}</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Button
              icon={<Copy className="size-4" />}
              onClick={async () => ((await copyText(url)) ? toast.success('Link copiado') : toast.error('Não foi possível copiar.'))}
            >
              Copiar
            </Button>
            <a href={waLink(null, message)} target="_blank" rel="noopener noreferrer" className="flex">
              <Button block icon={<MessageCircle className="size-4" />}>
                WhatsApp
              </Button>
            </a>
            <a href={url} target="_blank" rel="noopener noreferrer" className="flex">
              <Button block icon={<ExternalLink className="size-4" />}>
                Abrir
              </Button>
            </a>
          </div>
          <p className="text-xs text-subtle">
            {integer(link.views)} visualizações · {link.items.length} itens · {link.expiresAt ? `válido até ${date(link.expiresAt)}` : 'sem prazo de validade'}
          </p>
        </div>
      )}
    </Modal>
  );
}

function CreateLinkDrawer({ open, catalog, onClose, onCreated }: { open: boolean; catalog: CatalogItem[]; onClose: () => void; onCreated: (l: PublicCatalogLink) => void }) {
  const ops = useOps();
  const { settings } = useSettings();
  const available = useMemo(() => catalog.filter((c) => c.available).sort((a, b) => a.sortOrder - b.sortOrder), [catalog]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [showPrices, setShowPrices] = useState(true);
  const [expiresAt, setExpiresAt] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [scope, setScope] = useState<'ALL' | 'PICK'>('ALL');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');

  const reset = () => {
    setTitle('');
    setMessage('');
    setShowPrices(true);
    setExpiresAt('');
    setWhatsapp('');
    setScope('ALL');
    setPicked(new Set());
    setQ('');
  };

  const publish = useAction(
    async () => {
      if (!title.trim()) throw new Error('Dê um título ao catálogo.');
      if (scope === 'PICK' && !picked.size) throw new Error('Escolha pelo menos um item.');
      return ops.publishCatalogLink({
        title: title.trim(),
        message: message.trim() || null,
        showPrices,
        expiresAt: expiresAt || null,
        catalogItemIds: scope === 'PICK' ? [...picked] : [],
        whatsapp: whatsapp.replace(/\D/g, '') || null,
      });
    },
    {
      success: 'Link publicado',
      onSuccess: (l) => {
        reset();
        onClose();
        onCreated(l);
      },
    },
  );

  const shown = available.filter((c) => matchesSearch([c.name, c.category], q));
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Novo link de catálogo"
      description="Vitrine pública, sem login, para divulgar pelo WhatsApp."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={publish.running} onClick={() => void publish.run()}>
            Publicar link
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <FormGrid>
          <Field label="Título" required span="full">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Catálogo Churrasco — Primavera" />
          </Field>
          <Field label="Mensagem de abertura" span="full">
            <Textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ex.: Cortes maturados com entrega em Campinas e região." />
          </Field>
          <Field label="Válido até" hint="Vazio = sem prazo.">
            <DateInput value={expiresAt} min={today()} onChange={setExpiresAt} />
          </Field>
          <Field label="WhatsApp para pedidos" hint={settings.whatsapp ? 'Vazio = WhatsApp da empresa.' : undefined}>
            <MaskedInput mask="phone" value={whatsapp} onChange={setWhatsapp} />
          </Field>
        </FormGrid>
        <Switch checked={showPrices} onChange={setShowPrices} label="Mostrar preços" description="Desligue para uma vitrine só com os produtos." />
        <div>
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: 'ALL', label: `Todos os disponíveis (${available.length})` },
              { value: 'PICK', label: `Escolher itens${picked.size ? ` (${picked.size})` : ''}` },
            ]}
          />
          {scope === 'PICK' && (
            <div className="mt-3 space-y-2">
              <div className="flex gap-2">
                <SearchInput value={q} onChange={setQ} className="flex-1" />
                <Button size="md" variant="ghost" onClick={() => setPicked(picked.size === available.length ? new Set() : new Set(available.map((c) => c.id)))}>
                  {picked.size === available.length ? 'Nenhum' : 'Todos'}
                </Button>
              </div>
              <ul className="max-h-80 overflow-y-auto rounded-card border border-border divide-y divide-border">
                {shown.map((c) => (
                  <li key={c.id} className="px-3 py-2">
                    <Checkbox
                      checked={picked.has(c.id)}
                      onChange={(v) => {
                        const n = new Set(picked);
                        if (v) n.add(c.id);
                        else n.delete(c.id);
                        setPicked(n);
                      }}
                      label={c.name}
                      description={c.category}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
}
