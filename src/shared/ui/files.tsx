import { FileText, Image as ImageIcon, Paperclip, Trash2, UploadCloud } from 'lucide-react';
import React, { useRef, useState } from 'react';
import { useBackend } from '../data/react';
import { dateTime } from '../domain/format';
import type { Attachment } from '../domain/types';
import { cn, IconButton } from './Button';
import { toast } from './overlay';

const MAX_MB = 15;

/**
 * Área de envio de arquivos. Faz upload no Storage do backend e devolve o
 * Attachment para você gravar no registro (ex.: ops.attachSaleFile).
 */
export function FileDrop({
  folder,
  kind,
  accept,
  multiple,
  onUploaded,
  label = 'Arraste arquivos ou clique para enviar',
  hint = `PDF ou imagem, até ${MAX_MB} MB`,
  compact,
  disabled,
}: {
  folder: string;
  kind?: Attachment['kind'];
  accept?: string;
  multiple?: boolean;
  onUploaded: (att: Attachment) => void | Promise<void>;
  label?: string;
  hint?: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  const { storage } = useBackend();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);

  const handle = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        if (f.size > MAX_MB * 1024 * 1024) {
          toast.error(`"${f.name}" passa de ${MAX_MB} MB.`);
          continue;
        }
        const att = await storage.upload(folder, f, { kind });
        await onUploaded(att);
      }
    } catch (e) {
      toast.error('Falha no envio: ' + (e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) void handle(e.dataTransfer.files);
      }}
      onClick={() => !disabled && !busy && input.current?.click()}
      className={cn(
        'flex items-center gap-3 rounded-card border border-dashed cursor-pointer transition-colors',
        compact ? 'px-3 py-2.5' : 'flex-col justify-center text-center px-4 py-7',
        over ? 'border-primary bg-primary-soft/40' : 'border-border-strong hover:border-primary/60 hover:bg-surface-2/60',
        (disabled || busy) && 'opacity-60 cursor-wait',
      )}
    >
      <UploadCloud className={cn('text-muted', compact ? 'size-5' : 'size-7')} />
      <div className={compact ? 'text-left' : ''}>
        <div className="text-sm text-fg">{busy ? 'Enviando…' : label}</div>
        {hint && <div className="text-xs text-subtle mt-0.5">{hint}</div>}
      </div>
      <input ref={input} type="file" hidden accept={accept} multiple={multiple} onChange={(e) => void handle(e.target.files)} />
    </div>
  );
}

export function AttachmentList({
  items,
  onRemove,
  empty = 'Nenhum arquivo anexado.',
  className,
}: {
  items: Attachment[];
  onRemove?: (att: Attachment) => void;
  empty?: string;
  className?: string;
}) {
  const { storage } = useBackend();
  if (!items?.length) return <p className={cn('text-sm text-subtle', className)}>{empty}</p>;
  const open = async (a: Attachment) => {
    try {
      const url = await storage.url(a);
      if (url) window.open(url, '_blank', 'noopener');
      else toast.error('Arquivo indisponível.');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <ul className={cn('divide-y divide-border rounded-card border border-border', className)}>
      {items.map((a) => {
        const isImg = (a.mimeType || '').startsWith('image/');
        return (
          <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
            <span className="size-8 rounded-control bg-surface-2 text-muted flex items-center justify-center shrink-0">
              {isImg ? <ImageIcon className="size-4" /> : a.mimeType === 'application/pdf' ? <FileText className="size-4" /> : <Paperclip className="size-4" />}
            </span>
            <button type="button" onClick={() => void open(a)} className="min-w-0 flex-1 text-left cursor-pointer group">
              <div className="text-sm text-fg truncate group-hover:text-primary">{a.name}</div>
              <div className="text-xs text-subtle num">
                {a.kind && a.kind !== 'OTHER' ? `${a.kind} · ` : ''}
                {a.size ? `${Math.max(1, Math.round(a.size / 1024))} KB · ` : ''}
                {dateTime(a.uploadedAt)}
              </div>
            </button>
            {onRemove && (
              <IconButton label="Remover" size="sm" variant="danger" onClick={() => onRemove(a)}>
                <Trash2 className="size-4" />
              </IconButton>
            )}
          </li>
        );
      })}
    </ul>
  );
}
