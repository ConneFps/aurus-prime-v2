/**
 * Documentos: fotos do animal, anexos dos eventos e documentação em texto.
 */
import { FileText, Images, Paperclip, Star, Trash2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useAction, useCrud } from '../../../data/react';
import { date } from '../../../domain/format';
import { EQUINE_EVENT_LABELS } from '../../../domain/labels';
import type { Attachment, Equine, EquineEvent } from '../../../domain/types';
import { AttachmentList, Badge, Card, CardHeader, DescriptionList, FileDrop, IconButton, useConfirm } from '../../../ui';
import { PhotoThumb } from '../parts';

export function DocumentsTab({ equine: e, events, canEdit }: { equine: Equine; events: EquineEvent[]; canEdit: boolean }) {
  const equines = useCrud('equines');
  const evCrud = useCrud('equine_events');
  const confirm = useConfirm();
  const setPhotos = useAction((photos: Attachment[]) => equines.update(e.id, { photos }), { success: 'Fotos atualizadas' });
  // Vários arquivos no mesmo envio: acumula sem depender do re-render.
  const photosRef = useRef<Attachment[]>(e.photos || []);
  useEffect(() => {
    photosRef.current = e.photos || [];
  }, [e.photos]);
  const addPhoto = useAction(async (att: Attachment) => {
    const next = [...photosRef.current, att];
    photosRef.current = next;
    await equines.update(e.id, { photos: next });
  });
  const removeAtt = useAction(
    async (ev: EquineEvent, att: Attachment) => {
      if (await confirm({ title: `Remover "${att.name}"?`, message: `Anexo de "${ev.title}".`, danger: true, confirmLabel: 'Remover' }))
        await evCrud.update(ev.id, { attachments: ev.attachments.filter((a) => a.id !== att.id) });
    },
  );
  const withFiles = events.filter((ev) => ev.attachments?.length).sort((a, b) => (a.date < b.date ? 1 : -1));
  const photos = e.photos || [];
  const totalFiles = withFiles.reduce((s, ev) => s + ev.attachments.length, 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader icon={<Images className="size-4" />} title="Fotos" subtitle={`${photos.length} foto(s) · a primeira é a principal`} />
        {photos.length > 0 && (
          <div className="mb-4 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {photos.map((p, i) => (
              <div key={p.id} className="relative">
                <PhotoThumb att={p} className="aspect-square w-full" />
                {i === 0 && (
                  <Badge tone="primary" size="xs" className="absolute left-1.5 top-1.5">
                    Principal
                  </Badge>
                )}
                {canEdit && (
                  <div className="absolute right-1 top-1 flex gap-1">
                    {i > 0 && (
                      <IconButton label="Tornar principal" size="sm" variant="secondary" onClick={() => void setPhotos.run([p, ...photos.filter((x) => x.id !== p.id)])}>
                        <Star className="size-4" />
                      </IconButton>
                    )}
                    <IconButton
                      label="Remover foto"
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        if (await confirm({ title: 'Remover esta foto?', danger: true, confirmLabel: 'Remover' })) void setPhotos.run(photos.filter((x) => x.id !== p.id));
                      }}
                    >
                      <Trash2 className="size-4 text-danger" />
                    </IconButton>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {canEdit ? (
          <FileDrop folder={`equines/${e.id}`} kind="PHOTO" accept="image/*" multiple compact={photos.length > 0} label="Enviar fotos do animal" hint="JPG ou PNG" onUploaded={(att) => addPhoto.run(att).then(() => undefined)} />
        ) : (
          !photos.length && <p className="text-sm text-subtle">Nenhuma foto.</p>
        )}
      </Card>

      <Card>
        <CardHeader icon={<Paperclip className="size-4" />} title="Anexos dos registros" subtitle={`${totalFiles} arquivo(s) — exames, laudos, notas e comprovantes`} />
        {withFiles.length ? (
          <div className="space-y-4">
            {withFiles.map((ev) => (
              <div key={ev.id}>
                <div className="mb-1.5 flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-fg">{ev.title}</span>
                  <Badge tone={EQUINE_EVENT_LABELS[ev.type].tone} size="xs">
                    {EQUINE_EVENT_LABELS[ev.type].label}
                  </Badge>
                  <span className="text-xs text-muted num">{date(ev.date)}</span>
                </div>
                <AttachmentList items={ev.attachments} onRemove={canEdit ? (att) => void removeAtt.run(ev, att) : undefined} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-subtle">Nenhum anexo. Anexe exames e documentos ao registrar saúde, treinos, transportes etc.</p>
        )}
      </Card>

      <Card>
        <CardHeader icon={<FileText className="size-4" />} title="Documentação" />
        <DescriptionList
          cols={2}
          items={[
            { label: 'Registro', value: [e.registry, e.secondaryRegistry].filter(Boolean).join(' · ') || '—' },
            { label: 'Microchip', value: e.chipId || '—' },
            { label: 'Pedigree / documentos', value: e.pedigreeNotes || '—' },
            { label: 'Atestados sanitários', value: e.healthCertificates || '—' },
            { label: 'Teste genético', value: e.geneticTest || '—' },
          ]}
        />
      </Card>
    </div>
  );
}
