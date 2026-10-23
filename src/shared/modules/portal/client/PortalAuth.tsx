/**
 * Entrada do portal: entrar com e-mail e senha e criar conta.
 */
import { BadgeCheck, Mail, QrCode, Scale, Truck } from 'lucide-react';
import React, { useState } from 'react';
import { useAction, useBackend } from '../../../data/react';
import { isValidCNPJ, isValidCPF, isValidEmail, onlyDigits } from '../../../domain/format';
import { Button, Field, FormGrid, Input, MaskedInput, Segmented } from '../../../ui';
import { AddressFields } from './AddressFields';
import { BrandMark } from './parts';

export function PortalAuth({ brand, logoUrl }: { brand: string; logoUrl?: string | null }) {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  return (
    <div className="min-h-dvh bg-bg lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* Vitrine da marca */}
      <aside className="relative overflow-hidden border-b lg:border-b-0 lg:border-r border-border bg-surface">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-soft via-transparent to-transparent pointer-events-none" />
        <div className="relative px-5 sm:px-8 lg:px-12 py-6 lg:py-12 lg:h-full flex flex-col">
          <div className="flex items-center gap-3">
            <BrandMark name={brand} logoUrl={logoUrl} />
            <div className="min-w-0">
              <div className="font-display text-lg font-semibold text-fg leading-tight truncate">{brand}</div>
              <div className="text-xs text-muted">Portal do cliente</div>
            </div>
          </div>
          <div className="hidden lg:flex flex-1 flex-col justify-center max-w-md">
            <h2 className="font-display text-4xl font-semibold text-fg leading-[1.1] text-balance">Cortes selecionados, pesados na hora e entregues no seu endereço.</h2>
            <ul className="mt-8 space-y-4 text-sm">
              <Perk icon={<Scale />} title="Peso conferido na balança">Você paga pelo peso real. Se passar do combinado, pedimos sua confirmação.</Perk>
              <Perk icon={<QrCode />} title="Pagamento por Pix">QR Code e copia-e-cola direto no pedido, com envio do comprovante.</Perk>
              <Perk icon={<Truck />} title="Acompanhe cada etapa">Do recebimento à entrega, sem precisar ligar.</Perk>
            </ul>
          </div>
        </div>
      </aside>

      {/* Formulário */}
      <main className="px-4 sm:px-8 py-8 lg:py-12 flex justify-center lg:items-center">
        <div className="w-full max-w-lg">
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-fg">{mode === 'in' ? 'Bem-vindo de volta' : 'Crie sua conta'}</h1>
          <p className="text-sm text-muted mt-1">
            {mode === 'in' ? 'Entre para ver o catálogo, fazer pedidos e acompanhar entregas.' : 'Seu cadastro passa por uma análise rápida da nossa equipe antes do primeiro pedido.'}
          </p>
          <Segmented
            className="mt-6 w-full [&>button]:flex-1 [&>button]:justify-center"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'in', label: 'Entrar' },
              { value: 'up', label: 'Criar conta' },
            ]}
          />
          <div className="mt-6">{mode === 'in' ? <SignInForm /> : <SignUpForm />}</div>
        </div>
      </main>
    </div>
  );
}

function Perk({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="size-9 rounded-control bg-primary-soft text-primary flex items-center justify-center shrink-0 [&>svg]:size-4.5">{icon}</span>
      <div>
        <div className="font-semibold text-fg">{title}</div>
        <div className="text-muted mt-0.5">{children}</div>
      </div>
    </li>
  );
}

function SignInForm() {
  const { auth } = useBackend();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const signIn = useAction(async () => {
    if (!isValidEmail(email)) throw new Error('Informe um e-mail válido.');
    if (!password) throw new Error('Informe sua senha.');
    await auth.signInWithPassword(email.trim().toLowerCase(), password);
  });
  const reset = useAction(
    async () => {
      if (!isValidEmail(email)) throw new Error('Digite seu e-mail no campo acima para receber o link.');
      await auth.sendPasswordReset(email.trim().toLowerCase());
    },
    { success: 'Enviamos um link para redefinir sua senha.' },
  );
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void signIn.run();
      }}
    >
      <Field label="E-mail">
        <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com.br" />
      </Field>
      <Field
        label={
          <span className="flex items-center justify-between">
            Senha
            <button type="button" onClick={() => void reset.run()} className="text-primary hover:underline font-normal cursor-pointer">
              Esqueci minha senha
            </button>
          </span>
        }
      >
        <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Button type="submit" variant="primary" size="lg" block loading={signIn.running}>
        Entrar
      </Button>
    </form>
  );
}

interface SignUpDraft {
  name: string;
  email: string;
  password: string;
  phone: string;
  personType: 'F' | 'J';
  document: string;
  companyName: string;
  zipCode: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
}

const EMPTY: SignUpDraft = {
  name: '',
  email: '',
  password: '',
  phone: '',
  personType: 'J',
  document: '',
  companyName: '',
  zipCode: '',
  street: '',
  number: '',
  complement: '',
  district: '',
  city: '',
  state: '',
};

function validate(d: SignUpDraft): Partial<Record<keyof SignUpDraft, string>> {
  const e: Partial<Record<keyof SignUpDraft, string>> = {};
  if (d.name.trim().length < 3) e.name = 'Informe seu nome completo.';
  if (!isValidEmail(d.email)) e.email = 'E-mail inválido.';
  if (d.password.length < 6) e.password = 'Use pelo menos 6 caracteres.';
  if (onlyDigits(d.phone).length < 10) e.phone = 'Informe um telefone com DDD.';
  const doc = onlyDigits(d.document);
  if (d.personType === 'J' ? !isValidCNPJ(doc) : !isValidCPF(doc)) e.document = d.personType === 'J' ? 'CNPJ inválido.' : 'CPF inválido.';
  if (d.personType === 'J' && !d.companyName.trim()) e.companyName = 'Informe a razão social.';
  if (onlyDigits(d.zipCode).length !== 8) e.zipCode = 'CEP inválido.';
  if (!d.street.trim()) e.street = 'Informe a rua.';
  if (!d.number.trim()) e.number = 'Informe o número.';
  if (!d.city.trim()) e.city = 'Informe a cidade.';
  if (!d.state) e.state = 'UF';
  return e;
}

function SignUpForm() {
  const { auth } = useBackend();
  const [d, setD] = useState<SignUpDraft>(EMPTY);
  const [tried, setTried] = useState(false);
  const errors = tried ? validate(d) : {};
  const set = <K extends keyof SignUpDraft>(k: K, v: SignUpDraft[K]) => setD((cur) => ({ ...cur, [k]: v }));

  const submit = useAction(
    async () => {
      setTried(true);
      const errs = validate(d);
      if (Object.keys(errs).length) throw new Error('Confira os campos destacados.');
      await auth.signUpPortal({
        email: d.email.trim().toLowerCase(),
        password: d.password,
        name: d.name.trim(),
        phone: onlyDigits(d.phone),
        companyName: d.companyName.trim() || undefined,
        personType: d.personType,
        document: onlyDigits(d.document),
        zipCode: onlyDigits(d.zipCode),
        street: d.street.trim(),
        number: d.number.trim(),
        complement: d.complement.trim() || undefined,
        district: d.district.trim(),
        city: d.city.trim(),
        state: d.state,
      });
    },
    { success: 'Cadastro enviado! Avisaremos quando for liberado.' },
  );

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void submit.run();
      }}
      noValidate
    >
      <Section title="Seus dados">
        <FormGrid>
          <Field label="Nome completo" required error={errors.name} span="full">
            <Input autoComplete="name" value={d.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="E-mail" required error={errors.email}>
            <Input type="email" autoComplete="email" value={d.email} onChange={(e) => set('email', e.target.value)} prefix={<Mail className="size-4" />} />
          </Field>
          <Field label="Telefone / WhatsApp" required error={errors.phone}>
            <MaskedInput mask="phone" autoComplete="tel" value={d.phone} onChange={(v) => set('phone', v)} />
          </Field>
          <Field label="Crie uma senha" required error={errors.password} hint="Mínimo de 6 caracteres." span="full">
            <Input type="password" autoComplete="new-password" value={d.password} onChange={(e) => set('password', e.target.value)} />
          </Field>
        </FormGrid>
      </Section>

      <Section title="Cadastro para faturamento">
        <Segmented
          size="sm"
          value={d.personType}
          onChange={(v) => setD({ ...d, personType: v, document: '' })}
          options={[
            { value: 'J', label: 'Empresa (CNPJ)' },
            { value: 'F', label: 'Pessoa física (CPF)' },
          ]}
        />
        <FormGrid className="mt-4">
          <Field label={d.personType === 'J' ? 'CNPJ' : 'CPF'} required error={errors.document}>
            <MaskedInput mask="document" value={d.document} onChange={(v) => set('document', v)} placeholder={d.personType === 'J' ? '00.000.000/0000-00' : '000.000.000-00'} />
          </Field>
          <Field label={d.personType === 'J' ? 'Razão social' : 'Nome do estabelecimento'} required={d.personType === 'J'} error={errors.companyName}>
            <Input value={d.companyName} onChange={(e) => set('companyName', e.target.value)} placeholder={d.personType === 'F' ? 'Opcional' : undefined} />
          </Field>
        </FormGrid>
      </Section>

      <Section title="Endereço de entrega">
        <AddressFields value={d} onChange={(patch) => setD((cur) => ({ ...cur, ...patch }))} errors={errors} />
      </Section>

      <div className="space-y-3">
        <Button type="submit" variant="primary" size="lg" block loading={submit.running} icon={<BadgeCheck className="size-4" />}>
          Enviar cadastro
        </Button>
        <p className="text-xs text-subtle text-center">
          Ao enviar, você concorda em receber contato da nossa equipe sobre o seu cadastro e seus pedidos.
        </p>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary mb-3">{title}</h2>
      {children}
    </section>
  );
}
