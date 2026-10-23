/** Guias de Abate e desossa e de Estoque e expedição. */
import type { Guide } from '../types';

export const PRODUCTION_GUIDES: Guide[] = [
  {
    id: 'slaughter',
    summary: 'Registro do abate dos lotes prontos: pesagem, custos do frigorífico e entrada automática das carcaças/quartos no estoque pós-abate.',
    audience: 'Gerente, operador.',
    tasks: [
      {
        title: 'Registrar um abate (passo a passo)',
        steps: [
          'Clique em "Registrar abate" e siga os passos.',
          'Lote e frigorífico: escolha o lote, o frigorífico, a data do abate e a GTA de saída.',
          'Pesagem: informe o peso de saída (balança) e o peso de carcaça — total ou por animal. O sistema mostra rendimento de carcaça e quebra de transporte.',
          'Custos do abate: frete, taxa de abate, retorno (couro/miúdos, entra como crédito) e demais custos.',
          'Estoque pós-abate: confira a divisão sugerida em traseiro, dianteiro e ponta de agulha (ajuste se precisar).',
          'Revisão: confira tudo e confirme. O lote passa para "Abatido", os animais para "Abatido" e as carcaças entram no estoque pós-abate.',
        ],
      },
    ],
    tips: [
      'Rendimento de carcaça a partir de 54% é considerado alto; abaixo de 50%, baixo.',
      'O custo por kg de carcaça (custo do lote ÷ carcaça) vira o custo do estoque pós-abate — é ele que segue para a desossa.',
    ],
    faq: [
      {
        q: 'Registrei um peso errado no abate. E agora?',
        a: 'Antes de enviar para a desossa, corrija o saldo em Estoque pós-abate → Ajustar saldo (com motivo). Custos lançados errado se corrigem em Custos e fiscal. Tudo fica na auditoria.',
      },
    ],
  },
  {
    id: 'raw_stock',
    summary: 'Carcaças e quartos que saíram do frigorífico e aguardam desossa, com idade, validade, custo e lote de origem.',
    audience: 'Logística, operador, gerente.',
    tasks: [
      {
        title: 'Enviar para a desossa',
        steps: ['Selecione os lotes com saldo e clique em "Enviar para desossa".', 'Isso abre a ordem de processamento já com os itens escolhidos (veja o guia Processamento).'],
      },
      {
        title: 'Corrigir saldo ou registrar perda',
        steps: ['No menu "…" do lote use "Ajustar saldo" (contagem física) ou "Registrar perda" (com motivo).', 'As duas ações ficam no histórico de movimentações e na auditoria.'],
      },
    ],
    tips: ['O indicador "Mais antigo" mostra há quantos dias a carcaça mais velha está parada — priorize a desossa dela.'],
  },
  {
    id: 'processing',
    summary: 'Ordens de desossa (OS): envio de carcaça e quartos para o parceiro, retorno em cortes, perdas por tipo e rendimento.',
    audience: 'Logística, gerente.',
    tasks: [
      {
        title: 'Abrir uma ordem de desossa',
        steps: [
          'Clique em "Abrir ordem", escolha o parceiro de desossa e os lotes do estoque pós-abate a enviar.',
          'Informe motorista, placa, documento de saída, previsão de retorno, frete e custo da desossa.',
          'Ao salvar, o estoque pós-abate é baixado e a OS fica "Em processamento". Imprima o "Romaneio (PDF)" para o motorista.',
        ],
      },
      {
        title: 'Registrar o retorno dos cortes',
        steps: [
          'Abra a OS e clique em registrar retorno. Escolha "Parcial (ainda volta mais)" ou "Total (fecha a ordem)".',
          'Informe a NF de retorno e os cortes recebidos (produto, quantidade e validade).',
          'Declare as perdas: osso, sebo/gordura, apara, evaporação e outras. A diferença sem explicação aparece como "não classificado".',
          'Os cortes entram no estoque de venda com custo calculado (matéria-prima + desossa + frete) e o rendimento é atualizado.',
        ],
      },
    ],
    tips: [
      'Rendimento = cortes retornados ÷ quilos enviados. 72% ou mais é bom; abaixo de 66% merece conversa com o parceiro.',
      'OS atrasadas (passou a previsão de retorno) aparecem destacadas na lista.',
      'Compare parceiros em Relatórios → Rendimento de desossa.',
    ],
  },
  {
    id: 'products',
    summary: 'Cadastro dos cortes vendidos e da matéria-prima pós-abate: categoria, unidade, estoque mínimo, preço padrão, validade e imagem.',
    audience: 'Gerente, comercial.',
    tasks: [
      {
        title: 'Cadastrar um corte',
        steps: [
          'Clique em novo produto e informe nome, código, categoria (Traseiro, Dianteiro, Especiais, Processados…) e tipo (churrasco, dia a dia, carcaça).',
          'Escolha a unidade: quilo (kg) ou unidade (ex.: hambúrguer).',
          'Defina estoque mínimo (gera alerta), preço padrão e validade em dias (preenche a validade no retorno da desossa).',
          'Adicione imagem e descrição — elas aparecem no catálogo do portal.',
        ],
      },
    ],
    tips: ['Desative produtos que saíram de linha em vez de excluir: o histórico continua.', 'O filtro "Abaixo do mínimo" mostra o que precisa ser reposto.'],
  },
  {
    id: 'stock',
    summary: 'Saldo do estoque de venda por corte e por lote, com validade, origem (próprio ou intercompany), custo e valor.',
    audience: 'Logística, comercial, gerente.',
    tasks: [
      {
        title: 'Consultar o estoque',
        steps: [
          'Alterne "Por produto" (saldo somado) e "Por lote" (cada peça/lote com validade).',
          'Filtre por categoria, origem ou pelos atalhos "Vencendo" e "Vencidos".',
          'Clique no produto para ver os lotes na ordem em que serão vendidos (o mais antigo primeiro).',
        ],
      },
      {
        title: 'Dar entrada manual',
        steps: [
          'Use a entrada no estoque de venda para compras de terceiros ou transferências intercompany.',
          'Informe produto, quantidade, custo, lote, validade, local (câmara/prateleira) e, se for transferência, a empresa e a NF de origem.',
        ],
      },
      {
        title: 'Inventário (contagem)',
        steps: ['Gere o "PDF de inventário (contagem)" e conte a câmara.', 'Ajuste as diferenças pelo menu do lote → Ajustar saldo (novo saldo contado + motivo).'],
      },
    ],
    tips: ['Lotes bloqueados (ex.: aguardando análise) não são usados na separação até serem liberados.', 'Exporte em planilha por produto ou por lote.'],
  },
  {
    id: 'movements',
    summary: 'Tudo que entrou e saiu do estoque (abate, desossa, vendas, estornos, perdas e ajustes), o registro de perdas e a conferência das baixas de venda.',
    audience: 'Logística, gerente, financeiro.',
    tasks: [
      {
        title: 'Investigar uma diferença',
        steps: ['Na aba Movimentações, filtre por produto, tipo ou período.', 'Cada linha mostra quem fez, quando, o pedido/cliente ou o motivo.'],
      },
      {
        title: 'Registrar perdas',
        steps: ['Na aba Perdas, registre produto, lote, quantidade e motivo (avaria, validade vencida, divergência de pesagem…).', 'O saldo do lote é baixado e o valor perdido aparece no resumo por motivo e por origem.'],
      },
      {
        title: 'Conferir baixas de venda (conciliação)',
        steps: ['A aba Conciliação compara os itens de cada pedido com o que foi baixado do estoque.', 'Use "Só divergentes" para ver pedidos com baixa pendente ou parcial e regularize quando houver saldo.'],
      },
    ],
  },
  {
    id: 'supplies',
    summary: 'Embalagens, etiquetas, sacolas e insumos de limpeza/escritório: saldo, mínimo, entradas, saídas e consumo.',
    audience: 'Logística.',
    tasks: [
      {
        title: 'Movimentar materiais',
        steps: ['Cadastre o material com unidade (un, cx, pct, kg, L), mínimo e custo.', 'Lance Entrada (compra), Saída (consumo) ou Ajuste de saldo (contagem).', 'Marque "Material vendável" para poder incluir no pedido (ex.: sacola personalizada) — a saída é automática na venda.'],
      },
    ],
    tips: ['O filtro "Abaixo do mín." mostra o que comprar. O consumo dos últimos 30 dias ajuda a planejar.'],
  },
  {
    id: 'picking',
    summary: 'Fila de separação: separar, pesar, dar baixa no estoque (FIFO) e expedir os pedidos aprovados. Pensada para usar no celular, ao lado da balança.',
    audience: 'Logística, vendedores.',
    tasks: [
      {
        title: 'Separar e pesar um pedido',
        steps: [
          'Na fila, toque no pedido (abas A separar, Em separação, Aguardando cliente, Prontos, Em rota).',
          'Toque em "Iniciar separação".',
          'Para cada item, informe o peso real da balança e o número de pacotes. O lote é escolhido automaticamente (FIFO), mas você pode trocar.',
          'Se faltar um corte, envie 0 ou remova o item; se o cliente pediu algo a mais, adicione o item.',
          'Toque em "Concluir separação": o estoque é baixado e o total final é recalculado com o peso real.',
        ],
      },
      {
        title: 'Expedir',
        steps: [
          'Com o pedido "Separado", anexe a nota fiscal quando o tipo de faturamento exigir (NF obrigatória para expedir).',
          'Imprima o romaneio e marque "Expedir". Na entrega, marque "Entregue" (ou "Retirado" no balcão).',
        ],
      },
    ],
    tips: [
      'Se a diferença entre o estimado e o pesado passar da tolerância, o pedido fica "Aguardando cliente" até o aceite.',
      'Itens por unidade (UN) não pedem peso, só quantidade.',
    ],
    faq: [
      {
        q: 'Errei o peso depois de concluir. Como corrijo?',
        a: 'Cancelar o pedido devolve ao estoque o que foi baixado (estorno de venda) e cancela as parcelas; depois é só lançar o pedido de novo. Para pequenas diferenças, fale com o gerente.',
      },
    ],
  },
];
