import type { VisualizationType } from '@bfp/domain';

/** Chart types that can be drawn (AUTO resolves to one of them; legacy values are aliases). */
export type ChartType = Exclude<VisualizationType, 'AUTO' | 'BAR' | 'GROUPED_BAR' | 'STACKED_BAR'>;

/** Groups of the visualization menu, in display order. */
export const VISUALIZATION_CATEGORIES = [
  { id: 'BASIC', label: 'Básico' },
  { id: 'COMPARISON', label: 'Comparação' },
  { id: 'COMPOSITION', label: 'Composição' },
  { id: 'TREND', label: 'Tendência' },
  { id: 'DISTRIBUTION', label: 'Distribuição' },
  { id: 'RELATION', label: 'Relação' },
  { id: 'JOURNEY', label: 'Jornada' },
  { id: 'MULTIDIMENSIONAL', label: 'Análise multidimensional' },
  { id: 'GEOGRAPHY', label: 'Geografia' },
  { id: 'SPECIALIZED', label: 'Especializados' },
] as const;

export type VisualizationCategory = (typeof VISUALIZATION_CATEGORIES)[number]['id'];

/** Library-independent description of a chart type (UI icon and renderer live in the web app). */
export interface VisualizationMeta {
  type: ChartType;
  name: string;
  description: string;
  category: VisualizationCategory;
  /** What the analysis needs to use this chart, in business words. */
  requirement: string;
}

/** Single source of names, descriptions and categories of every chart type. */
export const VISUALIZATION_META: readonly VisualizationMeta[] = [
  {
    type: 'KPI',
    name: 'Indicador',
    description: 'Destaca o valor de cada métrica',
    category: 'BASIC',
    requirement: 'Remova as dimensões para ver só os indicadores.',
  },
  {
    type: 'TABLE',
    name: 'Tabela',
    description: 'Consulte os valores exatos',
    category: 'BASIC',
    requirement: 'Adicione uma métrica.',
  },
  {
    type: 'BAR_HORIZONTAL',
    name: 'Barras horizontais',
    description: 'Compare categorias com nomes longos ou muitas categorias',
    category: 'COMPARISON',
    requirement: 'Adicione uma dimensão para comparar.',
  },
  {
    type: 'COLUMN',
    name: 'Colunas',
    description: 'Compare poucas categorias lado a lado',
    category: 'COMPARISON',
    requirement: 'Adicione uma dimensão para comparar.',
  },
  {
    type: 'BAR_GROUPED',
    name: 'Barras agrupadas',
    description: 'Compare várias métricas ou séries por categoria',
    category: 'COMPARISON',
    requirement: 'Use 2 a 4 métricas com 1 dimensão, ou 1 métrica com 2 dimensões.',
  },
  {
    type: 'COLUMN_GROUPED',
    name: 'Colunas agrupadas',
    description: 'Compare métricas lado a lado em cada categoria',
    category: 'COMPARISON',
    requirement: 'Use 2 a 4 métricas com 1 dimensão, ou 1 métrica com 2 dimensões.',
  },
  {
    type: 'BAR_STACKED',
    name: 'Barras empilhadas',
    description: 'Partes de um total em cada categoria',
    category: 'COMPOSITION',
    requirement: 'Use uma métrica que soma (contagem, valor) com 2 dimensões.',
  },
  {
    type: 'COLUMN_STACKED',
    name: 'Colunas empilhadas',
    description: 'Total de cada categoria dividido em partes',
    category: 'COMPOSITION',
    requirement: 'Use uma métrica que soma (contagem, valor) com 2 dimensões.',
  },
  {
    type: 'BAR_100_STACKED',
    name: 'Barras 100% empilhadas',
    description: 'Composição relativa de cada categoria',
    category: 'COMPOSITION',
    requirement: 'Use uma métrica que soma (contagem, valor) com 2 dimensões.',
  },
  {
    type: 'COLUMN_100_STACKED',
    name: 'Colunas 100% empilhadas',
    description: 'Mix percentual em cada categoria',
    category: 'COMPOSITION',
    requirement: 'Use uma métrica que soma (contagem, valor) com 2 dimensões.',
  },
  {
    type: 'DONUT',
    name: 'Rosca',
    description: 'Participação de poucas categorias no total',
    category: 'COMPOSITION',
    requirement: 'Use 1 métrica que soma com 1 dimensão de até 8 categorias.',
  },
  {
    type: 'TREEMAP',
    name: 'Treemap',
    description: 'Peso de muitas categorias no total',
    category: 'COMPOSITION',
    requirement: 'Use 1 métrica que soma com 1 ou 2 dimensões.',
  },
  {
    type: 'LINE',
    name: 'Linha',
    description: 'Evolução ao longo do tempo',
    category: 'TREND',
    requirement: 'Adicione uma dimensão de tempo (ex.: Mês).',
  },
  {
    type: 'MULTI_LINE',
    name: 'Múltiplas linhas',
    description: 'Evolução de várias séries ao longo do tempo',
    category: 'TREND',
    requirement: 'Use tempo com uma segunda dimensão ou com 2+ métricas.',
  },
  {
    type: 'AREA',
    name: 'Área',
    description: 'Evolução de volumes ao longo do tempo',
    category: 'TREND',
    requirement: 'Adicione uma dimensão de tempo (ex.: Mês).',
  },
  {
    type: 'AREA_STACKED',
    name: 'Área empilhada',
    description: 'Evolução do total e de suas partes',
    category: 'TREND',
    requirement: 'Use tempo, uma métrica que soma e uma segunda dimensão.',
  },
  {
    type: 'HISTOGRAM',
    name: 'Histograma',
    description: 'Como os valores se distribuem em faixas',
    category: 'DISTRIBUTION',
    requirement: 'Use 1 métrica com 1 dimensão de muitas categorias.',
  },
  {
    type: 'BOX_PLOT',
    name: 'Box plot',
    description: 'Mediana, quartis e outliers por grupo',
    category: 'DISTRIBUTION',
    requirement: 'Use 1 métrica com 1 ou 2 dimensões (vários valores por grupo).',
  },
  {
    type: 'SCATTER',
    name: 'Dispersão',
    description: 'Relação entre duas métricas',
    category: 'RELATION',
    requirement: 'Adicione duas métricas numéricas e uma dimensão.',
  },
  {
    type: 'BUBBLE',
    name: 'Bolhas',
    description: 'Duas métricas nos eixos e uma no tamanho',
    category: 'RELATION',
    requirement: 'Adicione três métricas numéricas e uma dimensão.',
  },
  {
    type: 'QUADRANT',
    name: 'Quadrantes',
    description: 'Classifica cada item em quatro grupos pela mediana',
    category: 'RELATION',
    requirement: 'Adicione duas métricas numéricas e uma dimensão.',
  },
  {
    type: 'FUNNEL',
    name: 'Funil',
    description: 'Etapas ordenadas da jornada',
    category: 'JOURNEY',
    requirement: 'Use métricas de etapas da jornada (ex.: Leads, Contas abertas, Ativações).',
  },
  {
    type: 'SANKEY',
    name: 'Sankey',
    description: 'Fluxos de uma origem para um destino',
    category: 'JOURNEY',
    requirement: 'Adicione uma dimensão de origem (ex.: Canal) e uma de destino (ex.: Produto).',
  },
  {
    type: 'TIMELINE',
    name: 'Timeline',
    description: 'Eventos ao longo do tempo',
    category: 'JOURNEY',
    requirement: 'Use uma data diária e uma dimensão de tipo de evento.',
  },
  {
    type: 'HEATMAP',
    name: 'Mapa de calor',
    description: 'Cruzamento de duas dimensões',
    category: 'MULTIDIMENSIONAL',
    requirement: 'Use 1 métrica com 2 dimensões.',
  },
  {
    type: 'COHORT',
    name: 'Cohort',
    description: 'Grupos de início × tempo decorrido',
    category: 'MULTIDIMENSIONAL',
    requirement: 'Use uma data de início (ex.: Abertura) e uma data de evento (ex.: Ativação).',
  },
  {
    type: 'RETENTION_CURVE',
    name: 'Curva de retenção',
    description: 'Percentual acumulado ao longo dos meses',
    category: 'MULTIDIMENSIONAL',
    requirement: 'Use uma data de início (ex.: Abertura) e uma data de evento (ex.: Ativação).',
  },
  {
    type: 'RADAR',
    name: 'Radar',
    description: 'Perfil em várias métricas comparáveis',
    category: 'MULTIDIMENSIONAL',
    requirement: 'Use 3+ métricas na mesma escala (ex.: scores do DNA).',
  },
  {
    type: 'MAP',
    name: 'Mapa',
    description: 'Valores por estado ou região do Brasil',
    category: 'GEOGRAPHY',
    requirement: 'Adicione Estado ou Região para usar o mapa.',
  },
  {
    type: 'CALENDAR_HEATMAP',
    name: 'Calendário',
    description: 'Intensidade por dia do ano',
    category: 'SPECIALIZED',
    requirement: 'Use 1 métrica com uma data diária.',
  },
  {
    type: 'WATERFALL',
    name: 'Cascata',
    description: 'Contribuição de cada parte para o total',
    category: 'SPECIALIZED',
    requirement: 'Use 1 métrica que soma com 1 dimensão.',
  },
  {
    type: 'RANKING',
    name: 'Ranking',
    description: 'Top N em lista com barras',
    category: 'SPECIALIZED',
    requirement: 'Use 1 métrica com 1 dimensão.',
  },
];

export const VISUALIZATION_META_BY_TYPE = new Map(
  VISUALIZATION_META.map((meta) => [meta.type, meta]),
);

/** Chart types of the catalog, in menu order. */
export const CHART_TYPES: readonly ChartType[] = VISUALIZATION_META.map((meta) => meta.type);

const LEGACY_TYPES: Partial<Record<VisualizationType, ChartType>> = {
  BAR: 'BAR_HORIZONTAL',
  GROUPED_BAR: 'COLUMN_GROUPED',
  STACKED_BAR: 'COLUMN_STACKED',
};

/** Maps legacy values of saved analyses (BAR, GROUPED_BAR, STACKED_BAR) to the current types. */
export function normalizeVisualizationType(type: VisualizationType): ChartType | 'AUTO' {
  return LEGACY_TYPES[type] ?? (type as ChartType | 'AUTO');
}

/** Display name of a chart type ("Automático" for AUTO). */
export function visualizationName(type: VisualizationType) {
  const normalized = normalizeVisualizationType(type);
  return normalized === 'AUTO'
    ? 'Automático'
    : (VISUALIZATION_META_BY_TYPE.get(normalized)?.name ?? normalized);
}
