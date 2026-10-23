import { DeniedContent, LoginForm } from '@shared/app/shell';
import { Card } from '@shared/ui';
import nelore from '../assets/nelore.jpg';
import { Leaf, Wordmark } from './Brand';

/** Opção B — login sobre a foto do campo, cartão claro à esquerda. */
export function Login() {
  return (
    <div className="relative min-h-screen bg-bg">
      <img src={nelore} alt="" className="hidden md:block absolute inset-0 size-full object-cover" />
      <div className="hidden md:block absolute inset-0 bg-gradient-to-r from-black/45 via-black/10 to-transparent" />
      <div className="relative min-h-screen flex items-stretch md:items-center md:px-10 lg:px-20">
        <Card className="w-full md:max-w-[440px] rounded-none md:rounded-card md:shadow-pop p-6 sm:p-9 flex flex-col">
          <Wordmark />
          <div className="mt-10 mb-7">
            <h1 className="font-display text-[28px] font-extrabold leading-tight">Bem-vindo</h1>
            <p className="text-sm text-muted mt-1.5">Entre para acompanhar gado, estoque, pedidos e financeiro.</p>
          </div>
          <LoginForm />
          <p className="mt-auto pt-8 text-xs text-subtle">
            É cliente?{' '}
            <a href="#/portal" className="text-primary font-medium hover:underline">
              Acesse o portal de pedidos
            </a>
          </p>
        </Card>
        <div className="hidden lg:block ml-auto self-end mb-12 max-w-sm text-white rounded-card bg-black/45 backdrop-blur-sm p-6">
          <p className="font-display text-2xl font-bold leading-snug">Do pasto ao pedido entregue.</p>
          <p className="text-sm text-white/85 mt-2">Lotes, abate, desossa, estoque por validade, vendas com Pix e portal do cliente.</p>
        </div>
      </div>
    </div>
  );
}

export function Denied({ message }: { message?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <Card className="w-full max-w-md p-8">
        <div className="flex justify-center mb-6">
          <Leaf size={44} />
        </div>
        <DeniedContent message={message} />
      </Card>
    </div>
  );
}
