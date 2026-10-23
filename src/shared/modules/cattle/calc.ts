/**
 * Calculadora de compra — simulação de recria + engorda (por cabeça).
 * Mesmas fórmulas da planilha/sistema antigo (AcquisitionCalculator), com
 * ponto de equilíbrio e totais para o lote.
 */
export interface SimParams {
  cabecas: number;
  // Compra
  pesoCompra: number;
  valorPago: number;
  // Recria
  pesoFinalRecria: number;
  gmdRecria: number;
  consumoSuplementoRecriaPercent: number;
  pesoSacaSuplementoRecria: number;
  custoSacaSuplementoRecria: number;
  // Engorda
  pesoFinalEngorda: number;
  gmdEngorda: number;
  consumoSuplementoEngordaPercent: number;
  pesoSacaSuplementoEngorda: number;
  custoSacaSuplementoEngorda: number;
  // Custos operacionais mensais (R$/cabeça/mês)
  salMineralMensal: number;
  terraPropriaMensal: number;
  maoObraMinMensal: number;
  maoObraMaxMensal: number;
  outrasDespesasMensais: number;
  // Comercialização
  rendimentoCarcacaPercent: number;
  precoVendaArroba: number;
  custoComercializacao: number;
}

export const DEFAULT_PARAMS: SimParams = {
  cabecas: 100,
  pesoCompra: 200,
  valorPago: 2650,
  pesoFinalRecria: 330,
  gmdRecria: 600,
  consumoSuplementoRecriaPercent: 0.1,
  pesoSacaSuplementoRecria: 25,
  custoSacaSuplementoRecria: 74,
  pesoFinalEngorda: 390,
  gmdEngorda: 900,
  consumoSuplementoEngordaPercent: 0.3,
  pesoSacaSuplementoEngorda: 25,
  custoSacaSuplementoEngorda: 95,
  salMineralMensal: 60,
  terraPropriaMensal: 15,
  maoObraMinMensal: 3,
  maoObraMaxMensal: 5,
  outrasDespesasMensais: 3,
  rendimentoCarcacaPercent: 52,
  precoVendaArroba: 320,
  custoComercializacao: 325,
};

/** Nomes antigos (com acento) → atuais, para abrir simulações migradas. */
const LEGACY_KEYS: Record<string, keyof SimParams> = {
  'rendimentoCarcaçaPercent': 'rendimentoCarcacaPercent',
  'preçoVendaArroba': 'precoVendaArroba',
  'custoComercializaçao': 'custoComercializacao',
};

export function fromParams(p: Record<string, number | string | null> | null | undefined): SimParams {
  const out: SimParams = { ...DEFAULT_PARAMS };
  for (const [k, v] of Object.entries(p || {})) {
    const key = (LEGACY_KEYS[k] || k) as keyof SimParams;
    if (key in out && v !== null && v !== '' && Number.isFinite(Number(v))) out[key] = Number(v);
  }
  return out;
}

export function computeSim(d: SimParams) {
  const precoKgVivo = d.pesoCompra > 0 ? d.valorPago / d.pesoCompra : 0;

  const ganhoPesoRecria = d.pesoFinalRecria - d.pesoCompra;
  const duracaoRecriaDias = d.gmdRecria > 0 ? Math.max(0, ganhoPesoRecria) / (d.gmdRecria / 1000) : 0;
  const pesoMedioRecria = (d.pesoCompra + d.pesoFinalRecria) / 2;
  const custoSuplementoKgRecria = d.pesoSacaSuplementoRecria > 0 ? d.custoSacaSuplementoRecria / d.pesoSacaSuplementoRecria : 0;
  const consumoDiarioSuplementoRecria = pesoMedioRecria * (d.consumoSuplementoRecriaPercent / 100);
  const consumoTotalSuplementoRecria = consumoDiarioSuplementoRecria * duracaoRecriaDias;
  const custoTotalSuplementoRecria = consumoTotalSuplementoRecria * custoSuplementoKgRecria;

  const ganhoPesoEngorda = d.pesoFinalEngorda - d.pesoFinalRecria;
  const duracaoEngordaDias = d.gmdEngorda > 0 ? Math.max(0, ganhoPesoEngorda) / (d.gmdEngorda / 1000) : 0;
  const pesoMedioEngorda = (d.pesoFinalRecria + d.pesoFinalEngorda) / 2;
  const custoSuplementoKgEngorda = d.pesoSacaSuplementoEngorda > 0 ? d.custoSacaSuplementoEngorda / d.pesoSacaSuplementoEngorda : 0;
  const consumoDiarioSuplementoEngorda = pesoMedioEngorda * (d.consumoSuplementoEngordaPercent / 100);
  const consumoTotalSuplementoEngorda = consumoDiarioSuplementoEngorda * duracaoEngordaDias;
  const custoTotalSuplementoEngorda = consumoTotalSuplementoEngorda * custoSuplementoKgEngorda;

  const maoObraMediaMensal = (d.maoObraMinMensal + d.maoObraMaxMensal) / 2;
  const duracaoTotalDias = duracaoRecriaDias + duracaoEngordaDias;
  const duracaoTotalCicloMeses = duracaoTotalDias / 30;
  const custoOperacionalMensalTotal = d.salMineralMensal + d.terraPropriaMensal + maoObraMediaMensal + d.outrasDespesasMensais;
  const custoOperacionalTotalCiclo = custoOperacionalMensalTotal * duracaoTotalCicloMeses;

  const pesoCarcaca = d.pesoFinalEngorda * (d.rendimentoCarcacaPercent / 100);
  const arrobasProduzidas = pesoCarcaca / 15;
  const receitaVenda = arrobasProduzidas * d.precoVendaArroba;

  const custoTotalSuplementacao = custoTotalSuplementoRecria + custoTotalSuplementoEngorda;
  const custoTotalCiclo = d.valorPago + custoTotalSuplementacao + custoOperacionalTotalCiclo + d.custoComercializacao;
  const lucroCiclo = receitaVenda - custoTotalCiclo;
  const margemCustoTotal = custoTotalCiclo > 0 ? (lucroCiclo / custoTotalCiclo) * 100 : 0;
  const margemReceita = receitaVenda > 0 ? (lucroCiclo / receitaVenda) * 100 : 0;
  const rentabilidadeMensal = duracaoTotalCicloMeses > 0 ? margemCustoTotal / duracaoTotalCicloMeses : 0;
  /** Preço mínimo da @ para empatar. */
  const equilibrioArroba = arrobasProduzidas > 0 ? custoTotalCiclo / arrobasProduzidas : 0;
  /** Custo de cada @ produzida além da compra (custo da @ engordada). */
  const arrobasCompra = (d.pesoCompra * (d.rendimentoCarcacaPercent / 100)) / 15;
  const custoArrobaProduzida = arrobasProduzidas - arrobasCompra > 0 ? (custoTotalCiclo - d.valorPago) / (arrobasProduzidas - arrobasCompra) : 0;
  const n = Math.max(1, d.cabecas || 1);

  return {
    precoKgVivo,
    ganhoPesoRecria,
    duracaoRecriaDias,
    pesoMedioRecria,
    custoSuplementoKgRecria,
    consumoDiarioSuplementoRecria,
    consumoTotalSuplementoRecria,
    custoTotalSuplementoRecria,
    ganhoPesoEngorda,
    duracaoEngordaDias,
    pesoMedioEngorda,
    custoSuplementoKgEngorda,
    consumoDiarioSuplementoEngorda,
    consumoTotalSuplementoEngorda,
    custoTotalSuplementoEngorda,
    maoObraMediaMensal,
    duracaoTotalDias,
    duracaoTotalCicloMeses,
    custoOperacionalMensalTotal,
    custoOperacionalTotalCiclo,
    pesoCarcaca,
    arrobasProduzidas,
    arrobasCompra,
    receitaVenda,
    custoTotalSuplementacao,
    custoTotalCiclo,
    lucroCiclo,
    margemCustoTotal,
    margemReceita,
    rentabilidadeMensal,
    equilibrioArroba,
    custoArrobaProduzida,
    // Lote
    investimentoLote: custoTotalCiclo * n,
    receitaLote: receitaVenda * n,
    lucroLote: lucroCiclo * n,
  };
}

export type SimResult = ReturnType<typeof computeSim>;

/** Resumo gravado junto com a simulação (para listar e comparar sem recalcular). */
export function resultSummary(r: SimResult): Record<string, number> {
  const round = (v: number) => Math.round(v * 100) / 100;
  return {
    duracaoTotalDias: round(r.duracaoTotalDias),
    arrobasProduzidas: round(r.arrobasProduzidas),
    receitaVenda: round(r.receitaVenda),
    custoTotalCiclo: round(r.custoTotalCiclo),
    lucroCiclo: round(r.lucroCiclo),
    margemCustoTotal: round(r.margemCustoTotal),
    rentabilidadeMensal: round(r.rentabilidadeMensal),
    equilibrioArroba: round(r.equilibrioArroba),
    lucroLote: round(r.lucroLote),
  };
}

/** Rótulos dos parâmetros (formulário, PDF e comparação). */
export const PARAM_META: { key: keyof SimParams; label: string; unit: 'kg' | 'R$' | 'g' | '%' | 'cab' | 'R$/mês'; section: string }[] = [
  { key: 'cabecas', label: 'Cabeças', unit: 'cab', section: 'Compra' },
  { key: 'pesoCompra', label: 'Peso de compra', unit: 'kg', section: 'Compra' },
  { key: 'valorPago', label: 'Valor pago por cabeça', unit: 'R$', section: 'Compra' },
  { key: 'pesoFinalRecria', label: 'Peso final da recria', unit: 'kg', section: 'Recria' },
  { key: 'gmdRecria', label: 'GMD na recria', unit: 'g', section: 'Recria' },
  { key: 'consumoSuplementoRecriaPercent', label: 'Consumo de suplemento (% PV)', unit: '%', section: 'Recria' },
  { key: 'pesoSacaSuplementoRecria', label: 'Peso da saca', unit: 'kg', section: 'Recria' },
  { key: 'custoSacaSuplementoRecria', label: 'Preço da saca', unit: 'R$', section: 'Recria' },
  { key: 'pesoFinalEngorda', label: 'Peso final (abate)', unit: 'kg', section: 'Engorda' },
  { key: 'gmdEngorda', label: 'GMD na engorda', unit: 'g', section: 'Engorda' },
  { key: 'consumoSuplementoEngordaPercent', label: 'Consumo de suplemento (% PV)', unit: '%', section: 'Engorda' },
  { key: 'pesoSacaSuplementoEngorda', label: 'Peso da saca', unit: 'kg', section: 'Engorda' },
  { key: 'custoSacaSuplementoEngorda', label: 'Preço da saca', unit: 'R$', section: 'Engorda' },
  { key: 'salMineralMensal', label: 'Sal mineral', unit: 'R$/mês', section: 'Custos mensais por cabeça' },
  { key: 'terraPropriaMensal', label: 'Terra própria / arrendamento', unit: 'R$/mês', section: 'Custos mensais por cabeça' },
  { key: 'maoObraMinMensal', label: 'Mão de obra (mínimo)', unit: 'R$/mês', section: 'Custos mensais por cabeça' },
  { key: 'maoObraMaxMensal', label: 'Mão de obra (máximo)', unit: 'R$/mês', section: 'Custos mensais por cabeça' },
  { key: 'outrasDespesasMensais', label: 'Outras despesas', unit: 'R$/mês', section: 'Custos mensais por cabeça' },
  { key: 'rendimentoCarcacaPercent', label: 'Rendimento de carcaça', unit: '%', section: 'Comercialização' },
  { key: 'precoVendaArroba', label: 'Preço da arroba', unit: 'R$', section: 'Comercialização' },
  { key: 'custoComercializacao', label: 'Custo de comercialização por cabeça', unit: 'R$', section: 'Comercialização' },
];
