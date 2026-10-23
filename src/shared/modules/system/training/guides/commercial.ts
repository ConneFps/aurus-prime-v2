/** Guias da área Comercial e dos canais externos (portal e app do vendedor). */
import type { Guide } from '../types';

export const COMMERCIAL_GUIDES: Guide[] = [
  {
    id: 'sales',
    summary: 'Pedidos de venda: criação, aprovação, separação, nota fiscal, boletos/Pix e entrega — com o status sempre visível.',
    audience: 'Vendedores, financeiro, gerente, logística.',
    tasks: [
      {
        title: 'Lançar um pedido',
        steps: [
          'Clique em "Nova venda" e escolha o cliente (busca por nome, CNPJ/CPF ou código). Avisos de crédito e bloqueio aparecem na hora.',
          'Adicione os cortes: o preço vem da tabela de preço do cliente; a quantidade é estimada e o saldo de estoque aparece ao lado. Use a observação do item para instruções de corte.',
          'Entrega: escolha entrega (CEP ou zona de frete) ou retirada; a data sugerida segue a janela (seg/ter → quarta; qua/qui → sexta).',
          'Pagamento: forma (Pix, boleto, transferência, a prazo…), faturamento (NF + boleto, só NF…) e condição — à vista, prazos em dias (ex.: 28/35/42) ou parcelas mensais.',
          'Salve como rascunho ou "Enviar para aprovação".',
        ],
      },
      {
        title: 'Aprovar ou recusar',
        steps: [
          'Use a aba Aprovação da lista (ou abra o pedido) e clique em Aprovar ou Recusar (com motivo).',
          'Na aprovação as parcelas do contas a receber são criadas. Cliente bloqueado precisa ser desbloqueado antes.',
        ],
      },
      {
        title: 'Acompanhar até a entrega',
        steps: [
          'O detalhe do pedido mostra a linha do tempo, itens (estimado × pesado), documentos, financeiro e histórico.',
          'Anexe nota fiscal e boleto em Documentos. Gere o Pix com QR Code ou registre o pagamento.',
          'Ações por status: Ir para separação, Expedir, Marcar como entregue, Duplicar, PDF do pedido, Cancelar (com motivo).',
        ],
      },
    ],
    tips: [
      'Bonificação e amostra não geram cobrança, mas baixam estoque normalmente.',
      'Use "Duplicar pedido" para clientes que repetem a compra toda semana.',
      'O PDF do pedido e o relatório da lista saem com o cabeçalho da empresa.',
    ],
    faq: [
      { q: 'Por que não consigo editar o pedido?', a: 'Depois que o estoque é baixado (separação concluída), o pedido não é mais editável. Cancele e lance outro se precisar.' },
      { q: 'O vendedor pode mudar o preço?', a: 'Só quem tem a permissão "Alterar preço no pedido" (vendedor, financeiro, gerente e administrador, por padrão).' },
    ],
  },
  {
    id: 'intercompany',
    summary: 'Vendas e transferências entre as empresas do grupo (MVGB, GRTB, Girassol, Aurus), separadas das vendas a clientes.',
    audience: 'Financeiro, gerente.',
    tasks: [
      {
        title: 'Registrar uma venda intercompany',
        steps: [
          'Lance o pedido normalmente escolhendo como cliente a empresa do grupo (cadastrada como intercompany).',
          'A lista Intercompany mostra só esses pedidos, com os mesmos filtros e status das vendas.',
          'Na empresa que recebe, a entrada no estoque é feita com origem "Intercompany", empresa e NF de transferência.',
        ],
      },
    ],
    tips: ['O estoque separa saldo próprio e intercompany — a separação usa a origem certa automaticamente.'],
  },
  {
    id: 'proposals',
    summary: 'Propostas comerciais em segundos (PDF ou WhatsApp) que viram pedido com um clique, e cobranças Pix avulsas.',
    audience: 'Vendedores.',
    tasks: [
      {
        title: 'Montar e enviar uma proposta',
        steps: ['Na aba Proposta, escolha o cliente (ou digite um nome) e os cortes com preço e quantidade.', 'Gere o PDF ou envie o texto pelo WhatsApp.', 'Fechou? Converta a proposta em pedido sem redigitar.'],
      },
      {
        title: 'Cobrar com Pix avulso',
        steps: ['Na aba Cobrança Pix, informe valor e descrição.', 'Mostre o QR Code ou copie o "Pix copia e cola" e envie ao cliente.'],
      },
    ],
    tips: ['A chave, o nome e a cidade do Pix vêm de Configurações → Cobrança e Pix.'],
  },
  {
    id: 'customers',
    summary: 'Cadastro de clientes com crédito, ranking (Bronze, Prata, Ouro), estrelas, documentos, vendedor responsável e tabela de preço.',
    audience: 'Comercial, financeiro.',
    tasks: [
      {
        title: 'Pré-cadastro (vendedor)',
        steps: [
          'Vendedor não cadastra o cliente direto: em Clientes, clique em "Pré-cadastrar cliente".',
          'Preencha os dados, sugira o limite de crédito e a condição de pagamento e clique em "Enviar ao financeiro".',
          'Enquanto o financeiro analisa, não dá para fazer pedido para esse cliente. Se for bloqueado, o motivo aparece em Pré-cadastros.',
        ],
      },
      {
        title: 'Liberar ou bloquear um pré-cadastro (financeiro)',
        steps: [
          'Em Clientes → Pré-cadastros, abra o que está "Aguardando financeiro".',
          'Confira os dados, ajuste limite, condição e forma de pagamento (vêm preenchidos com a sugestão do vendedor) e clique em "Liberar cliente".',
          'Para negar, use "Bloquear" com o motivo. Se o CPF/CNPJ já estiver cadastrado, a liberação reativa o cliente existente e o bloqueio bloqueia esse cliente.',
        ],
      },
      {
        title: 'Cadastrar um cliente (financeiro, gerência, operação)',
        steps: [
          'Clique em novo cliente, informe CPF/CNPJ (o sistema avisa duplicidade) e o CEP (o endereço é preenchido sozinho).',
          'Escolha categoria, vendedor responsável, tabela de preço, formas de pagamento permitidas e limite de crédito.',
          'Anexe documentos (contrato social, comprovantes) na aba Documentos.',
        ],
      },
      {
        title: 'Aprovar o crédito',
        steps: ['O financeiro abre o cliente e usa "Aprovar crédito" ou "Reprovar crédito" (com observação).', 'O filtro "Crédito a aprovar" na lista mostra os pendentes.'],
      },
    ],
    tips: [
      'A ficha do cliente mostra pedidos, financeiro (em aberto e vencido) e acesso ao portal.',
      'Bloquear o cliente impede novas aprovações de pedido até ser desbloqueado.',
      'O ranking é recalculado pelo total comprado; as faixas ficam em Configurações → Cobrança e Pix.',
    ],
  },
  {
    id: 'pricing',
    summary: 'Tabelas de preço por corte para cada perfil de cliente (churrasco, geral, portal, intercompany), com aprovação antes de valer.',
    audience: 'Comercial, financeiro.',
    tasks: [
      {
        title: 'Criar ou reajustar uma tabela',
        steps: [
          'Crie uma tabela nova ou use "Duplicar" numa existente para reajustar.',
          'Informe os preços por corte e a vigência (de/até).',
          'Clique em "Enviar para aprovação". O financeiro aprova ou recusa (o motivo aparece nas observações).',
          'Só tabelas aprovadas e ativas aparecem no pedido.',
        ],
      },
    ],
    tips: ['"Atualizar catálogo do portal" copia os preços aprovados para o catálogo do cliente.', 'Gere o "PDF para o cliente" para mandar a tabela.'],
  },
  {
    id: 'portal',
    summary: 'Gestão do portal do cliente: pedidos feitos pelos clientes, liberação de contas, catálogo, entrega e frete e vitrines públicas.',
    audience: 'Comercial, gerente.',
    tasks: [
      {
        title: 'Liberar um cliente no portal',
        steps: [
          'Na aba Contas, abra a conta "Em análise".',
          'Vincule a um cliente existente (mesmo CNPJ/CPF) ou crie um cliente novo a partir do cadastro do portal.',
          'Clique em "Aprovar acesso". Para negar, use "Recusar" — o cliente verá o motivo.',
        ],
      },
      {
        title: 'Convidar um cliente (acesso já liberado)',
        steps: [
          'Na aba Contas, clique em "Convidar cliente", escolha o cliente e informe o e-mail de acesso.',
          'No primeiro login com esse e-mail, a conta entra aprovada e ligada ao cliente (quem usa senha confirma o e-mail pelo link).',
          'Use "Avisar" para mandar o link do portal pelo WhatsApp. "Cancelar" desfaz o convite.',
          'Os preços do portal seguem a tabela de preço do cliente, quando ele tiver uma; na aprovação do pedido o sistema confere os preços de novo.',
        ],
      },
      {
        title: 'Manter o catálogo e o frete',
        steps: [
          'Na aba Catálogo, defina o que aparece, preço, pedido mínimo, incremento (ex.: 0,5 kg), destaque e foto.',
          'Na aba Entrega e frete, cadastre as zonas por prefixo de CEP, frete grátis acima de um valor, retirada, horário de corte e datas bloqueadas.',
          'A tolerância de pesagem também fica ali: acima dela o cliente precisa aceitar a diferença; abaixo, aprova sozinho.',
        ],
      },
      {
        title: 'Compartilhar uma vitrine pública',
        steps: ['Na aba Links públicos, crie um link com título, mensagem, validade e se mostra preços.', 'Use "Compartilhar" para mandar pelo WhatsApp. Quem abre não precisa de login.'],
      },
    ],
    tips: ['Pedidos do portal entram como "Aguardando aprovação" e seguem o mesmo fluxo dos demais.', 'Use "Abrir o portal" para ver como o cliente enxerga.'],
  },
  {
    id: 'external_sellers',
    summary: 'Representantes com acesso ao aplicativo do vendedor: convites, comissão, carteira de clientes, solicitações de cadastro e ranking.',
    audience: 'Gerente, administrador.',
    tasks: [
      {
        title: 'Convidar um vendedor externo',
        steps: ['Clique em convidar, informe nome, e-mail, telefone e comissão.', 'Use "Copiar mensagem de convite" e envie por WhatsApp. Ele entra com o e-mail convidado.'],
      },
      {
        title: 'Acompanhar o desempenho',
        steps: ['O ranking mostra vendido e comissão estimada por período (este mês, mês passado, 90 dias).', 'Em "Ver carteira e pedidos" você vê os clientes e pedidos de cada um.', 'Ajuste a taxa em "Alterar comissão" ou bloqueie o acesso quando necessário.'],
      },
    ],
  },
  {
    id: 'partners',
    summary: 'Fornecedores de gado, frigoríficos, desossas, transportadoras, fornecedores de ração e demais parceiros.',
    audience: 'Comercial, gerente, financeiro.',
    tasks: [
      {
        title: 'Cadastrar um parceiro',
        steps: ['Clique em "Novo parceiro", escolha o tipo e preencha nome, CNPJ/CPF, contato e cidade.', 'Frigoríficos e desossas têm o campo de inspeção (SIF, SIE, SIM).', 'Desative em vez de excluir — inativos somem das listas de seleção, mas o histórico fica.'],
      },
    ],
  },
  {
    id: 'app-vendedor',
    title: 'Aplicativo do vendedor externo',
    section: 'Canais externos',
    summary: 'O que o representante vê no celular ao entrar com o e-mail convidado: início, clientes da carteira, pedidos, tabela de preços e comissões.',
    audience: 'Vendedores externos.',
    tasks: [
      {
        title: 'Fazer um pedido pelo app',
        steps: [
          'Toque em "Novo pedido" e escolha um cliente da sua carteira.',
          'Adicione os cortes (o preço vem da tabela do cliente) e escreva a observação de corte de cada item.',
          'Escolha a entrega e envie. O pedido segue para aprovação da equipe interna.',
          'Acompanhe em "Meus pedidos": aprovação, separação e entrega. Use "Repetir pedido" para recompra.',
        ],
      },
      {
        title: 'Pedir o cadastro de um cliente novo',
        steps: ['Em "Meus clientes", toque em "Solicitar novo cliente" e preencha os dados.', 'A equipe confere dados e crédito; aprovado, o cliente entra na sua carteira.'],
      },
    ],
    tips: ['Em "Minhas comissões" você vê a taxa atual e o valor confirmado quando o pedido é entregue ou pago.'],
  },
  {
    id: 'portal-cliente',
    title: 'Portal do cliente (visão do cliente)',
    section: 'Canais externos',
    summary: 'Como o cliente compra sozinho: cadastro, catálogo, carrinho, aceite da pesagem, pagamento com Pix e acompanhamento da entrega.',
    audience: 'Para explicar aos clientes.',
    tasks: [
      {
        title: 'Primeira compra do cliente',
        steps: [
          'O cliente cria a conta (CPF ou CNPJ, endereço) e aguarda a liberação pela equipe.',
          'Liberado, escolhe os cortes no catálogo, revisa o carrinho e a data de entrega sugerida e envia o pedido.',
          'Depois da pesagem, se o valor mudar além da tolerância, o cliente aceita ou recusa a diferença no próprio pedido.',
          'Paga com o QR Code Pix (ou envia o comprovante) e acompanha: recebido → confirmado → separando → em rota → entregue.',
        ],
      },
    ],
    tips: ['Os pedidos do portal aparecem em Comercial → Portal do cliente → Pedidos do portal e em Vendas.'],
  },
];
