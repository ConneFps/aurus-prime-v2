import { Building2, ImageOff, Trash2 } from 'lucide-react';
import { useBackend } from '../../../data/react';
import { formatCep, formatDocument, formatPhone, onlyDigits } from '../../../domain/format';
import { UF_LIST } from '../../../domain/labels';
import { Button, Card, CepInput, Field, FileDrop, FormGrid, FormSection, Input, MaskedInput, Select, toast } from '../../../ui';
import type { SettingsDraft } from './useSettingsDraft';

export function CompanyTab({ s }: { s: SettingsDraft }) {
  const { draft: d, set, canEdit } = s;
  const { storage } = useBackend();
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px] items-start">
      <Card>
        <fieldset disabled={!canEdit} className="space-y-7">
          <FormSection title="Dados da empresa" description="Aparecem no cabeçalho dos PDFs (pedidos, propostas, relatórios) e no portal do cliente.">
            <FormGrid>
              <Field label="Razão social" required span="full">
                <Input value={d.companyName} onChange={(e) => set({ companyName: e.target.value })} />
              </Field>
              <Field label="Nome fantasia" hint="Usado nos PDFs quando preenchido.">
                <Input value={d.tradeName || ''} onChange={(e) => set({ tradeName: e.target.value })} />
              </Field>
              <Field label="CNPJ">
                <MaskedInput mask="document" value={formatDocument(d.document)} onChange={(v) => set({ document: onlyDigits(v) })} />
              </Field>
              <Field label="Inscrição estadual">
                <Input value={d.stateRegistration || ''} onChange={(e) => set({ stateRegistration: e.target.value })} />
              </Field>
              <Field label="Telefone">
                <MaskedInput mask="phone" value={formatPhone(d.phone)} onChange={(v) => set({ phone: onlyDigits(v) })} />
              </Field>
              <Field label="WhatsApp comercial" hint="Com DDI e DDD, só números (ex.: 5519999990000). Botão de contato no portal.">
                <Input inputMode="numeric" className="num" value={d.whatsapp || ''} onChange={(e) => set({ whatsapp: onlyDigits(e.target.value) })} />
              </Field>
              <Field label="E-mail">
                <Input type="email" value={d.email || ''} onChange={(e) => set({ email: e.target.value })} />
              </Field>
            </FormGrid>
          </FormSection>
          <FormSection title="Endereço">
            <FormGrid cols={4}>
              <Field label="CEP" hint="Preenche o endereço sozinho.">
                <CepInput
                  value={formatCep(d.zipCode)}
                  onChange={(v) => set({ zipCode: onlyDigits(v) })}
                  onAddress={(a) => set({ street: a.street, district: a.district, city: a.city, state: a.state })}
                />
              </Field>
              <Field label="Rua / rodovia" span={2}>
                <Input value={d.street || ''} onChange={(e) => set({ street: e.target.value })} />
              </Field>
              <Field label="Número">
                <Input value={d.number || ''} onChange={(e) => set({ number: e.target.value })} />
              </Field>
              <Field label="Bairro" span={2}>
                <Input value={d.district || ''} onChange={(e) => set({ district: e.target.value })} />
              </Field>
              <Field label="Cidade">
                <Input value={d.city || ''} onChange={(e) => set({ city: e.target.value })} />
              </Field>
              <Field label="UF">
                <Select value={d.state || ''} onChange={(v) => set({ state: v })} placeholder="—" options={UF_LIST.map((u) => ({ value: u, label: u }))} />
              </Field>
            </FormGrid>
          </FormSection>
        </fieldset>
      </Card>

      <Card>
        <FormSection title="Logotipo" description="PNG ou JPG com fundo transparente ou branco.">
          <div className="rounded-card border border-border bg-surface-2 h-36 flex items-center justify-center overflow-hidden">
            {d.logoUrl ? (
              <img src={d.logoUrl} alt="Logotipo da empresa" className="max-h-28 max-w-[85%] object-contain" />
            ) : (
              <div className="text-center text-subtle text-xs">
                <ImageOff className="size-6 mx-auto mb-1.5" />
                Sem logotipo
              </div>
            )}
          </div>
          {canEdit && (
            <>
              <FileDrop
                folder="settings"
                kind="PHOTO"
                accept="image/*"
                compact
                label={d.logoUrl ? 'Trocar logotipo' : 'Enviar logotipo'}
                hint="Imagem até 15 MB"
                onUploaded={async (att) => {
                  try {
                    const url = att.url || (await storage.url(att));
                    set({ logoUrl: url });
                    toast.info('Logotipo carregado — clique em Salvar para aplicar.');
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              />
              {d.logoUrl && (
                <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={() => set({ logoUrl: null })}>
                  Remover logotipo
                </Button>
              )}
            </>
          )}
        </FormSection>
        <div className="mt-5 flex items-start gap-3 text-xs text-muted">
          <Building2 className="size-4 shrink-0 mt-0.5" />
          <p>O nome fantasia (ou a razão social) sai no topo de todos os PDFs gerados pelo sistema.</p>
        </div>
      </Card>
    </div>
  );
}
