/** Guias de abertura: primeiros passos, novidades da 2.0 e o fluxo do pedido. */
import type { Guide } from '../types';

export const START_GUIDES: Guide[] = [
  {
    id: 'primeiros-passos',
    title: 'Primeiros passos',
    section: 'Comece aqui',
    summary:
      'Como entrar, se localizar e trabalhar no Aurus Prime 2.0. O sistema funciona no computador e no celular — a expedição e os vendedores costumam usar o celular.',
    tasks: [
      {
        title: 'Entrar no sistema',
        steps: [
          'Abra o endereço do sistema e clique em "Entrar com Google" usando a conta do seu e-mail da empresa. Quem não usa Google entra com e-mail e senha (no primeiro acesso, "Primeiro acesso? Criar senha").',
          'E-mails dos domínios da empresa entram direto como Operador; o administrador ajusta o papel depois.',
          'Quem é de fora (vendedor externo, contador) precisa de um convite: peça ao administrador em Configurações → Usuários e acessos.',
          'Se aparecer "acesso negado", confira se está usando o mesmo e-mail do convite.',
        ],
      },
      {
        title: 'Se localizar nas telas',
        steps: [
          'O menu lateral é dividido por área: Painel, Gado, Abate e desossa, Estoque e expedição, Comercial, Financeiro, Equinos e Sistema.',
          'Você só vê o que o seu papel permite. Se faltar alguma tela, fale com o administrador.',
          'Toda tela segue o mesmo desenho: título com as ações principais à direita (Exportar, Novo…), indicadores, filtros e a lista.',
          'Clique numa linha para abrir o detalhe ou editar. O botão "…" no fim da linha mostra as demais ações.',
          'No celular as listas viram cartões e os formulários abrem em tela cheia.',
        ],
      },
      {
        title: 'Organizar o dia com tarefas',
        steps: [
          'Abra Painel → Tarefas e filtre por "Minhas" para ver o que está com você.',
          'Tarefas vencidas ficam em vermelho no topo. Conclua clicando no círculo à esquerda.',
          'Crie tarefas para a equipe com responsável, prazo e prioridade.',
        ],
      },
    ],
    tips: [
      'Toda ação importante (aprovar, pagar, estornar, excluir) fica registrada na Auditoria com seu nome, data e hora.',
      'O sistema sai sozinho depois de um tempo sem uso (padrão 15 minutos). Um aviso aparece 1 minuto antes.',
      'Quase toda lista tem botão de Exportar (planilha) e muitas telas geram PDF prontos para enviar ao cliente.',
      'Prefira o tema escuro ou claro em Configurações → Aparência; a escolha vale só para o seu aparelho.',
    ],
    faq: [
      { q: 'Esqueci minha senha. E agora?', a: 'Quem entra pelo Google não usa senha do sistema. Quem entra com e-mail e senha usa "Esqueci minha senha" (em "Entrar com e-mail e senha") e recebe o link no e-mail.' },
      { q: 'Posso usar no celular?', a: 'Sim. Todas as telas funcionam a partir de 375 px de largura; separação, pesagem e aplicativo do vendedor foram pensados para o celular.' },
      { q: 'Alterei algo errado. Tem como desfazer?', a: 'Pagamentos têm estorno, pedidos podem ser cancelados com motivo e o estoque tem ajuste. Na dúvida, veja a Auditoria para saber o que mudou.' },
    ],
  },
  {
    id: 'novidades',
    title: 'Novidades da versão 2.0',
    section: 'Comece aqui',
    summary:
      'O Aurus Prime foi refeito do zero: menos cliques, status sempre visíveis, fluxos guiados passo a passo e números conferidos. Veja o que mudou em relação à versão antiga.',
    tasks: [
      {
        title: 'Pedido com ciclo único',
        steps: [
          'Todo pedido segue o mesmo caminho: Rascunho → Aguardando aprovação → Aprovado → Em separação → (Aguardando cliente) → Separado → Expedido → Entregue.',
          'O estoque é baixado uma única vez, ao concluir a separação, sempre do lote mais antigo primeiro (FIFO).',
          'As parcelas do contas a receber são criadas na aprovação e acompanham o valor final depois da pesagem.',
        ],
      },
      {
        title: 'Produção guiada',
        steps: [
          'Abate em passos: lote e frigorífico → pesagem → custos do abate → entrada no estoque pós-abate → revisão.',
          'Desossa com ordem de serviço (OS): envio de carcaça/quartos, retornos parciais ou total, perdas por tipo (osso, sebo, apara, evaporação) e rendimento calculado.',
          'O custo de cada etapa vai automaticamente para o resultado (DRE) do lote de gado.',
        ],
      },
      {
        title: 'Novos canais de venda',
        steps: [
          'Portal do cliente: o cliente cria a conta, faz pedidos pelo catálogo, aceita a diferença de peso e paga com Pix.',
          'Aplicativo do vendedor externo: carteira de clientes, pedidos, tabela de preços e comissões no celular.',
          'Links públicos de catálogo para mandar por WhatsApp, com ou sem preços.',
        ],
      },
      {
        title: 'Gestão e controle',
        steps: [
          'Relatórios com filtros, prévia na tela, PDF e planilha (vendas, estoque, DRE por lote, aging, fluxo de caixa, comissões…).',
          'Comissão liberada conforme o cliente paga cada parcela.',
          'Tarefas da equipe com prazo e prioridade, auditoria completa e permissões por papel.',
          'Funciona com dois bancos de dados (PostgreSQL ou Firebase) e tem tema claro e escuro.',
        ],
      },
    ],
    tips: [
      'Os dados da versão antiga são trazidos pelo assistente de migração (Configurações → Dados), feito pelo administrador.',
      'Muitas regras antigas continuam iguais: janela de entrega (seg/ter → quarta; qua/qui → sexta), ranking Bronze/Prata/Ouro e Pix com QR Code.',
    ],
  },
  {
    id: 'fluxo-pedido',
    title: 'Fluxo do pedido',
    section: 'Comece aqui',
    path: '/vendas',
    summary: 'Resumo de quem faz o quê em cada etapa do pedido — vale para pedidos internos, de vendedor externo e do portal.',
    tasks: [
      {
        title: 'Etapas e responsáveis',
        steps: [
          'Vendedor: cria o pedido (Comercial → Vendas → Nova venda), escolhe cliente, cortes, entrega e pagamento. Salva como rascunho ou envia para aprovação.',
          'Financeiro/gerente: aprova ou recusa (com motivo). Cliente bloqueado não pode ser aprovado. Na aprovação nascem as parcelas a receber.',
          'Logística: em Estoque e expedição → Separação, inicia a separação, pesa cada item no celular e conclui — o estoque é baixado do lote mais antigo (FIFO).',
          'Se o peso final passar da tolerância combinada, o pedido vai para "Aguardando cliente" até o cliente aceitar a diferença (no portal) ou alguém registrar o aceite.',
          'Logística: anexa a nota fiscal quando exigida, imprime o romaneio e marca como Expedido.',
          'Entrega: marque como Entregue (ou Retirado, se o cliente buscou).',
          'Financeiro: dá baixa nas parcelas conforme os pagamentos chegam; a comissão do vendedor é liberada na mesma proporção.',
        ],
      },
    ],
    faq: [
      { q: 'Dá para editar um pedido aprovado?', a: 'Sim, enquanto o estoque não foi baixado (até a etapa Em separação). Depois disso, cancele ou ajuste pela separação.' },
      { q: 'O que acontece se faltar estoque na separação?', a: 'A baixa fica parcial e o sistema avisa quais itens faltaram; você pode remover o item ou enviar quantidade menor.' },
    ],
  },
];
