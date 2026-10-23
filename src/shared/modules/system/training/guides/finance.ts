/** Guias do Financeiro, Equinos e Sistema. */
import type { Guide } from '../types';

export const FINANCE_GUIDES: Guide[] = [
  {
    id: 'finance',
    summary: 'Contas a receber e a pagar em parcelas, baixas (inclusive parciais), estornos e fluxo de caixa.',
    audience: 'Financeiro, gerente.',
    tasks: [
      {
        title: 'Dar baixa num recebimento',
        steps: [
          'Na aba A receber, filtre (vencidos, hoje, 7 dias, mês ou período) e encontre a parcela.',
          'Clique em receber, informe valor, data e forma. Valor menor que o saldo vira pagamento parcial.',
          'O status do pedido e a comissão do vendedor são atualizados automaticamente.',
        ],
      },
      {
        title: 'Lançar uma conta a pagar',
        steps: ['Clique em "Conta a pagar", informe fornecedor, categoria, valor, vencimento e parcelas.', 'Anexe o boleto/nota e, se quiser, vincule a um lote de gado.', 'Pague pela mesma tela quando chegar o dia.'],
      },
      {
        title: 'Corrigir uma baixa errada',
        steps: ['Abra a parcela e use "estornar" no pagamento, com o motivo.', 'O saldo volta a ficar em aberto e o estorno fica registrado na auditoria.'],
      },
    ],
    tips: [
      'Vencido = em aberto com vencimento antes de hoje — aparece em vermelho com os dias de atraso.',
      'A aba Fluxo de caixa mostra o realizado e o previsto por período.',
      'Contas de vendas nascem na aprovação do pedido; não precisam ser lançadas à mão.',
    ],
  },
  {
    id: 'statements',
    summary: 'Posição financeira de cada cliente: saldo em aberto, atrasos por faixa (aging), limite de crédito e extrato completo.',
    audience: 'Financeiro, cobrança.',
    tasks: [
      {
        title: 'Cobrar um cliente em atraso',
        steps: [
          'Use o filtro "Em atraso" (ou "Acima do limite") e abra o cliente.',
          'Confira o extrato (pedidos, parcelas e pagamentos) do período.',
          'Gere o PDF do extrato ou envie a mensagem de cobrança pelo WhatsApp direto da tela.',
        ],
      },
    ],
    tips: ['O quadro "Aging da carteira" mostra quanto está a vencer, até 30, 60, 90 e mais de 90 dias.'],
  },
  {
    id: 'commissions',
    summary: 'Comissão de cada vendedor (interno e externo), liberada na proporção do que o cliente já pagou.',
    audience: 'Financeiro, gerente.',
    tasks: [
      {
        title: 'Fechar a comissão do mês',
        steps: [
          'Escolha o período (normalmente "Mês passado").',
          'Confira por vendedor: faturamento, base, comissão total, liberada (parcelas pagas) e pendente.',
          'Abra o vendedor para ver pedido a pedido e exporte o PDF ou a planilha para pagamento.',
        ],
      },
    ],
    tips: ['Ligue "Só quem vendeu" para esconder vendedores sem vendas no período.'],
  },
  {
    id: 'fiscal',
    summary: 'Impostos e taxas dos lotes (Funrural, ICMS, SENAR, GTA, inspeção) e documentos pendentes das vendas (pedidos sem NF ou boleto).',
    audience: 'Financeiro, contador.',
    tasks: [
      {
        title: 'Conferir pendências fiscais',
        steps: ['Na aba Documentos pendentes, veja pedidos que exigem NF/boleto e ainda não têm o arquivo.', 'Abra o pedido e anexe o documento.', 'Na aba Impostos por lote, confira e exporte os tributos de cada lote para o contador.'],
      },
    ],
  },
  {
    id: 'equines',
    summary: 'Plantel do haras: cadastro, genealogia, saúde, treino, casqueamento, transporte, hospedagem, competições, reprodução, documentos e financeiro de cada animal.',
    audience: 'Equipe do haras, gerente.',
    tasks: [
      {
        title: 'Cadastrar um animal',
        steps: ['Clique em novo animal: nome, sexo, raça, pelagem, nascimento, registro e fotos.', 'Complete genealogia (pai, mãe, avós), localização (haras, piquete) e valores.'],
      },
      {
        title: 'Lançar eventos na ficha',
        steps: [
          'Abra a ficha e escolha a aba: Saúde (vacina, vermífugo, exame…), Treinamento, Casqueamento, Transporte, Hospedagem ou Competições.',
          'Informe data, custo/prêmio e uma data de alerta para o próximo cuidado.',
          'Os alertas vencidos e dos próximos 30 dias aparecem no topo do Plantel.',
        ],
      },
      {
        title: 'Vender um animal',
        steps: ['Na ficha, use "Vender animal": comprador, valor e parcelas.', 'As parcelas vão para o contas a receber; o animal sai do plantel ativo.'],
      },
    ],
    tips: ['Na aba Reprodução, informe a cobertura: a data prevista do parto é calculada (340 dias).', 'Use "PDF da ficha" para enviar a compradores.'],
  },
  {
    id: 'semen',
    summary: 'Banco de sêmen: compras de doses (garanhão, fornecedor, botijão, validade), uso por égua, coletas próprias e parcelas a pagar.',
    audience: 'Equipe do haras.',
    tasks: [
      {
        title: 'Registrar compra e uso de doses',
        steps: ['Lance a compra com garanhão, fornecedor, nota, doses, preço, armazenamento, validade e parcelas.', 'Use "Usar doses" ao inseminar: data, quantidade e égua. O saldo é baixado.', 'Acompanhe "Vencendo" e "Vencidas" para não perder doses.'],
      },
    ],
  },
  {
    id: 'reports',
    summary: 'Catálogo de relatórios com filtros, prévia na tela (tabela, totais e gráfico) e saída em PDF ou planilha.',
    audience: 'Gerente, financeiro, comercial.',
    tasks: [
      {
        title: 'Gerar um relatório',
        steps: [
          'Escolha o relatório no catálogo (Vendas, Estoque, Gado e produção, Financeiro, Equinos, Sistema) ou use a busca.',
          'Ajuste o período (este mês, mês passado, 3 meses, ano, tudo ou datas) e os filtros: cliente, vendedor, lote, produto, parceiro.',
          'Confira a prévia: indicadores, gráfico, tabela e a linha de totais. Clique numa linha para abrir o registro (cliente, lote…).',
          'Baixe em PDF (com cabeçalho da empresa e filtros usados) ou Planilha (abre no Excel).',
        ],
      },
    ],
    tips: [
      'No DRE por lote de gado, escolha um lote no filtro para ver o demonstrativo conta a conta.',
      'A Curva ABC mostra os poucos clientes que fazem 80% do faturamento — priorize o atendimento deles.',
      'No celular, toque em "Mais filtros" para abrir os filtros.',
    ],
  },
  {
    id: 'training',
    summary: 'Esta central de ajuda: guias de cada tela com passo a passo, dicas e perguntas frequentes.',
    tasks: [
      {
        title: 'Encontrar ajuda rápido',
        steps: ['Digite na busca o que quer fazer (ex.: "baixa", "desossa", "Pix").', 'Use o índice para navegar por área.', 'Clique em "Abrir módulo" para ir direto à tela do guia.'],
      },
    ],
  },
  {
    id: 'settings',
    summary: 'Dados da empresa e logotipo, cobrança Pix, usuários e acessos, segurança, auditoria, exportação/migração de dados, aparência e informações do sistema.',
    audience: 'Administrador (alguns itens: gerente).',
    tasks: [
      {
        title: 'Convidar e gerir usuários',
        steps: [
          'Em Usuários e acessos, clique em "Convidar usuário": e-mail, nome, papel e (para vendedores) comissão.',
          'Envie a mensagem de convite pelo WhatsApp ou e-mail. O convite pendente pode ser revogado.',
          'Clique num usuário para mudar papel, comissão, empresa ou desativar o acesso. Veja em "Papéis e permissões" o que cada papel pode.',
        ],
      },
      {
        title: 'Ajustar o Pix e a empresa',
        steps: [
          'Em Empresa, revise razão social, CNPJ, endereço e envie o logotipo.',
          'Em Cobrança e Pix, informe chave, tipo, nome e cidade do recebedor e confira a prévia do QR Code com o app do banco.',
          'Clique em "Salvar alterações" na barra que aparece no rodapé.',
        ],
      },
      {
        title: 'Auditoria e backup',
        steps: ['Em Auditoria, filtre por usuário, ação, área e período; clique no registro para ver os dados alterados.', 'Em Dados, exporte tudo em JSON (backup) ou cada tabela em planilha.'],
      },
    ],
    tips: ['Não é possível remover o último administrador ativo nem alterar o próprio papel.', 'Domínios corporativos e o tempo de inatividade ficam em Segurança.'],
  },
];
