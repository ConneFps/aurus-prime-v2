/** Guias do Painel e da área de Gado. */
import type { Guide } from '../types';

export const CATTLE_GUIDES: Guide[] = [
  {
    id: 'dashboard',
    summary: 'A primeira tela depois de entrar: indicadores do negócio, pendências do dia e suas tarefas abertas.',
    audience: 'Todos os usuários internos (a logística abre direto na Separação).',
    tasks: [
      {
        title: 'Usar o painel no dia a dia',
        steps: [
          'Confira os indicadores do topo (vendas, estoque, contas) e clique em um deles para abrir a tela correspondente.',
          'No quadro "Minhas tarefas", conclua tarefas clicando no círculo ou crie uma nova digitando o título e teclando Enter.',
          'Use o menu lateral para ir aos módulos.',
        ],
      },
    ],
    tips: ['Os números do painel respeitam o seu papel: o vendedor vê os próprios pedidos, o financeiro vê contas.'],
  },
  {
    id: 'tasks',
    summary: 'Quadro de tarefas da equipe: o que precisa ser feito, quem faz e até quando. Tarefas vencidas ficam destacadas em vermelho.',
    audience: 'Todos os usuários internos.',
    tasks: [
      {
        title: 'Criar uma tarefa',
        steps: [
          'Clique em "Nova tarefa".',
          'Informe o título (há sugestões rápidas como Vacinação, Pesagem do lote, Agendar abate) e, se quiser, uma descrição.',
          'Escolha o responsável, o vencimento (atalhos Hoje, Amanhã, Em 7 dias) e a prioridade (Alta, Média, Baixa).',
          'Salve. A tarefa aparece no quadro e no painel inicial do responsável.',
        ],
      },
      {
        title: 'Acompanhar e concluir',
        steps: [
          'Use os filtros "Minhas", "Todas" e "Vencidas" e alterne a visão "Por situação" ou "Por prioridade".',
          'Clique no círculo do cartão para concluir; a data de conclusão é registrada. Clique de novo para reabrir.',
          'Clique no cartão para ver detalhes ou editar. O menu "…" tem a opção de excluir.',
        ],
      },
    ],
    tips: [
      'Quem criou, o responsável e os gerentes podem editar uma tarefa; os demais só consultam.',
      'Tarefas ligadas a um cliente, lote ou pedido mostram um atalho para abrir o registro.',
      'Exporte a lista em planilha para reuniões de equipe.',
    ],
    faq: [{ q: 'A tarefa avisa por e-mail?', a: 'Não. Ela aparece no painel inicial do responsável, com destaque quando vence.' }],
  },
  {
    id: 'batches',
    summary:
      'Cadastro e acompanhamento de cada lote de gado — da compra ao abate: animais, custos, ração, abate e desossa, vendas e o resultado (DRE) do lote.',
    audience: 'Gerente, operador, financeiro.',
    tasks: [
      {
        title: 'Cadastrar um lote comprado',
        steps: [
          'Clique em "Novo lote de gado" e siga os passos do assistente.',
          'Identificação: nome, manejo (campo ou confinamento), empresa e fornecedor.',
          'Compra: data, nota fiscal, GTA, cabeças e peso vivo total — ou os animais individuais (brinco, sexo, raça, peso e preço).',
          'Marque "Lançar o custo de compra no lote" para o valor entrar direto nos custos.',
          'Informe a previsão de abate e o preço de referência de venda (R$/kg) para as projeções.',
        ],
      },
      {
        title: 'Acompanhar o resultado do lote',
        steps: [
          'Abra o lote na lista. A aba Resumo mostra custo total, custo por cabeça e por arroba, receita e margem.',
          'Nas abas Animais, Custos, Ração, Abate & desossa e Vendas você vê cada detalhe — e pode lançar custos rápidos.',
          'Use "Relatório em PDF" para enviar o resultado do lote aos sócios.',
          'Quando tudo estiver vendido, use "Encerrar lote".',
        ],
      },
    ],
    tips: [
      'A receita do lote considera as vendas com baixa em estoque deste lote + o estoque que ainda resta (avaliado pelo preço de referência).',
      'Custos de ração, abate e desossa entram sozinhos quando registrados nas respectivas telas.',
      'Brincos são únicos entre os animais vivos — o sistema avisa duplicidades.',
    ],
    faq: [
      { q: 'Posso cadastrar só a quantidade, sem os animais?', a: 'Sim: escolha "Só quantidade e peso". Os animais podem ser adicionados depois pela aba Animais (inclusive colando uma lista).' },
      { q: 'Onde vejo o DRE de vários lotes juntos?', a: 'Em Relatórios → DRE por lote de gado.' },
    ],
  },
  {
    id: 'feed',
    summary: 'Entrada de ração por nota fiscal, consumo por lote e custo lançado automaticamente no resultado de cada lote.',
    audience: 'Operador, gerente.',
    tasks: [
      {
        title: 'Registrar uma compra de ração',
        steps: ['Cadastre o tipo de ração (aba Tipos de ração) se ainda não existir.', 'Lance a compra com nota, fornecedor, quantidade (kg) e valor total — o custo por kg é calculado.', 'Se a ração for exclusiva de alguns lotes, marque-os; senão, qualquer lote pode consumir.'],
      },
      {
        title: 'Lançar o consumo',
        steps: ['Na aba Consumos, escolha o lote, a ração, a data e a quantidade (diária, semanal ou mensal).', 'O sistema baixa o saldo da compra e lança o custo de ração no lote.', 'Para corrigir, use "Remover consumo": o saldo e o custo voltam.'],
      },
    ],
    tips: ['O gráfico "Custo de ração por lote" mostra quem está consumindo mais.', 'Compras esgotadas ficam no filtro "Esgotadas" para consulta.'],
  },
  {
    id: 'costs',
    summary: 'Todos os custos dos lotes em um só lugar — aquisição, engorda, abate e desossa, impostos e créditos — com importação de planilhas.',
    audience: 'Financeiro, gerente.',
    tasks: [
      {
        title: 'Lançar um custo',
        steps: [
          'Escolha o lote, a categoria (ex.: Frete de compra, Vacinas, Funrural), a data e o valor.',
          'Se for pagar depois, gere a conta a pagar no mesmo lançamento (parcelas e vencimento).',
          'Créditos (retorno do abate, crédito de imposto) reduzem o custo do lote.',
        ],
      },
      {
        title: 'Importar custos de uma planilha',
        steps: ['Use "Importar custos (CSV)" e envie a planilha.', 'Confira o casamento das colunas e das categorias sugeridas.', 'Confirme; os lançamentos aparecem com a origem "Importação".'],
      },
    ],
    tips: [
      'Custos lançados por outras telas (ração, abate, desossa) só podem ser alterados na tela de origem.',
      'A aba "Fiscal por lote" resume Funrural, ICMS, SENAR e taxas de cada lote.',
      'Exporte em planilha ou PDF para o contador.',
    ],
  },
  {
    id: 'calculator',
    summary: 'Simule recria e engorda antes de comprar: dias de ciclo, custos, arrobas produzidas, lucro e preço de equilíbrio.',
    audience: 'Gerente, compras.',
    tasks: [
      {
        title: 'Simular uma compra',
        steps: [
          'Preencha os blocos: 1. Compra (peso, valor por cabeça), 2. Recria, 3. Engorda (GMD, suplemento), 4. Custos mensais por cabeça e 5. Comercialização (preço da arroba, rendimento de carcaça).',
          'Veja o resultado por cabeça, a margem e o preço de equilíbrio da arroba.',
          'Use a sensibilidade para testar variações de preço e ganho de peso.',
          'Salve como cenário para comparar depois.',
        ],
      },
    ],
    tips: ['A simulação não mexe em nenhum dado real — é só para decidir a compra.'],
  },
];
