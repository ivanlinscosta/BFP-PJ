import type {
  AnalysisSpec,
  DimensionSemanticType,
  MetricSemanticType,
  VisualizationMode,
  VisualizationSpec,
} from '@bfp/domain';
import {
  CHART_TYPES,
  VISUALIZATION_META_BY_TYPE,
  normalizeVisualizationType,
  type ChartType,
} from './catalog';

/** Metric fields the engine reads (catalog definitions or API catalog items fit). */
export interface MetricLike {
  id: string;
  name?: string;
  shortName?: string;
  format: string;
  aggregation: string;
  additivity?: string;
  unit?: string;
  semanticType?: MetricSemanticType;
  funnelStage?: number;
}

/** Dimension fields the engine reads (catalog definitions or API catalog items fit). */
export interface DimensionLike {
  id: string;
  label?: string;
  name?: string;
  type: string;
  semanticType?: DimensionSemanticType;
  cohortRole?: 'START' | 'EVENT';
  geoLevel?: 'UF' | 'REGION';
  valueLabels?: Readonly<Record<string, string>>;
}

export interface ShapeMetric {
  id: string;
  label: string;
  format: string;
  semanticType: MetricSemanticType;
  additive: boolean;
  funnelStage?: number;
}

export interface ShapeDimension {
  id: string;
  label: string;
  semanticType: DimensionSemanticType;
  isTime: boolean;
  granularity?: string;
  /** Distinct values in the result (or known values of the catalog); undefined when unknown. */
  cardinality?: number;
  cohortRole?: 'START' | 'EVENT';
  geoLevel?: 'UF' | 'REGION';
}

/** What the analysis looks like, in the terms charts care about. */
export interface AnalysisShape {
  metrics: ShapeMetric[];
  dimensions: ShapeDimension[];
  /** Rows of the result, when known. */
  rows?: number;
}

/** Infers what a metric represents from its definition when the catalog does not declare it. */
export function inferMetricSemantic(metric: MetricLike): MetricSemanticType {
  if (metric.semanticType) return metric.semanticType;
  if (metric.funnelStage) return 'FUNNEL_VALUE';
  if (/score|dna_/.test(metric.id)) return 'SCORE';
  if (metric.format === 'percent') return metric.aggregation === 'RATIO' ? 'RATE' : 'PERCENTAGE';
  if (metric.format === 'currency') return metric.aggregation === 'SUM' ? 'VOLUME' : 'CURRENCY';
  if (metric.unit && /segund|dia|minut|hora/.test(metric.unit)) return 'DURATION';
  if (metric.aggregation === 'COUNT' || metric.aggregation === 'COUNT_DISTINCT') return 'COUNT';
  if (metric.aggregation === 'SUM') return 'VOLUME';
  if (metric.aggregation === 'AVG') return 'AMOUNT';
  return 'OTHER';
}

/** Infers what a dimension represents from its definition when the catalog does not declare it. */
export function inferDimensionSemantic(dimension: DimensionLike): DimensionSemanticType {
  if (dimension.semanticType) return dimension.semanticType;
  if (dimension.type === 'date') return 'TIME';
  return 'CATEGORY';
}

/**
 * Builds the shape of an analysis from its spec, the catalog and (optionally) the result, which
 * gives the real number of categories of each dimension.
 */
export function buildAnalysisShape(
  spec: Pick<AnalysisSpec, 'metrics' | 'dimensions'>,
  catalog: { metrics: readonly MetricLike[]; dimensions: readonly DimensionLike[] },
  result?: { rows: ReadonlyArray<Record<string, unknown>> },
): AnalysisShape {
  const metrics = spec.metrics.map((selection): ShapeMetric => {
    const metric = catalog.metrics.find((item) => item.id === selection.id);
    return {
      id: selection.id,
      label: metric?.shortName ?? metric?.name ?? selection.id,
      format: metric?.format ?? 'number',
      semanticType: metric ? inferMetricSemantic(metric) : 'OTHER',
      // Counts and sums add up across categories; rates, averages and scores do not.
      additive: metric
        ? metric.additivity
          ? metric.additivity === 'ADDITIVE'
          : metric.aggregation === 'SUM' || metric.aggregation === 'COUNT'
        : false,
      funnelStage: metric?.funnelStage,
    };
  });
  const dimensions = spec.dimensions.map((selection): ShapeDimension => {
    const dimension = catalog.dimensions.find((item) => item.id === selection.id);
    const semanticType = dimension ? inferDimensionSemantic(dimension) : 'CATEGORY';
    const distinct = result
      ? new Set(result.rows.map((row) => String(row[selection.id] ?? ''))).size
      : dimension?.valueLabels
        ? Object.keys(dimension.valueLabels).length
        : undefined;
    return {
      id: selection.id,
      label: dimension?.label ?? dimension?.name ?? selection.id,
      semanticType,
      isTime: semanticType === 'TIME' || Boolean(selection.granularity),
      granularity: selection.granularity,
      cardinality: distinct,
      cohortRole: dimension?.cohortRole,
      geoLevel: dimension?.geoLevel,
    };
  });
  return { metrics, dimensions, rows: result?.rows.length };
}

export interface VisualizationCompatibility {
  compatible: boolean;
  /** Why the chart cannot be used (or what to add), in business words. */
  reason?: string;
  requirements?: string[];
}

export interface VisualizationEvaluation extends VisualizationCompatibility {
  type: ChartType;
  /** 0–100: how well the chart represents the analysis (0 when incompatible). */
  score: number;
  /** Why the chart fits (or not) this analysis. */
  why: string;
}

export interface VisualizationRecommendation {
  type: ChartType;
  score: number;
  reason: string;
  recommended: boolean;
}

interface Facts {
  m: number;
  d: number;
  metrics: ShapeMetric[];
  time: ShapeDimension[];
  categories: ShapeDimension[];
  first?: ShapeDimension;
  second?: ShapeDimension;
  allAdditive: boolean;
  sameFormat: boolean;
  card: number;
  secondCard: number;
}

function factsOf(shape: AnalysisShape): Facts {
  const time = shape.dimensions.filter((dimension) => dimension.isTime);
  const categories = shape.dimensions.filter((dimension) => !dimension.isTime);
  const formats = new Set(shape.metrics.map((metric) => metric.format));
  return {
    m: shape.metrics.length,
    d: shape.dimensions.length,
    metrics: shape.metrics,
    time,
    categories,
    first: shape.dimensions[0],
    second: shape.dimensions[1],
    allAdditive: shape.metrics.length > 0 && shape.metrics.every((metric) => metric.additive),
    sameFormat: formats.size <= 1,
    card: shape.dimensions[0]?.cardinality ?? 6,
    secondCard: shape.dimensions[1]?.cardinality ?? 4,
  };
}

const lower = (text: string) => text.toLowerCase();

type Rule = (f: Facts) => { score: number; why: string } | string;

/**
 * One rule per chart: a string means incompatible (the string says what is missing); otherwise
 * the score and the reason the chart fits. Scores rank charts; the reason is shown to the user.
 */
const RULES: Record<ChartType, Rule> = {
  KPI: (f) =>
    f.m === 0
      ? 'Adicione uma métrica.'
      : f.d > 0
        ? 'Remova as dimensões para ver só os indicadores.'
        : {
            score: f.m === 1 ? 95 : 90,
            why: f.m === 1 ? 'Destaca o valor da métrica.' : 'Destaca cada métrica lado a lado.',
          },
  TABLE: (f) =>
    f.m === 0
      ? 'Adicione uma métrica.'
      : {
          score: f.d >= 3 ? 92 : f.m >= 3 && f.d >= 1 ? 76 : f.d === 0 ? 70 : 60,
          why:
            f.d >= 3
              ? 'Com três ou mais dimensões, a tabela é a leitura mais clara.'
              : 'Boa para consultar os valores exatos.',
        },
  BAR_HORIZONTAL: (f) => {
    if (f.m === 0 || f.d === 0) return 'Adicione uma dimensão para comparar.';
    if (f.d > 2 || (f.d === 2 && f.m > 1)) return 'Use 1 dimensão (ou 2 com uma métrica).';
    if (f.d === 2) return { score: 58, why: 'Compara as séries em barras deitadas.' };
    if (f.first!.isTime) return { score: 40, why: 'Para tempo, linha costuma ser melhor.' };
    if (f.m > 1) return { score: 70, why: 'Compara as métricas em barras deitadas.' };
    return f.card >= 6
      ? {
          score: 98,
          why: `Melhor opção para comparar ${f.card} valores de ${lower(f.first!.label)}, inclusive com nomes longos.`,
        }
      : { score: 86, why: `Compara ${lower(f.first!.label)} em ordem de grandeza.` };
  },
  COLUMN: (f) => {
    if (f.m === 0 || f.d === 0) return 'Adicione uma dimensão para comparar.';
    if (f.d > 2 || (f.d === 2 && f.m > 1)) return 'Use 1 dimensão (ou 2 com uma métrica).';
    if (f.d === 2) return { score: 56, why: 'Compara as séries em colunas.' };
    if (f.first!.isTime) return { score: 62, why: 'Mostra cada período como uma coluna.' };
    if (f.m > 1) return { score: 68, why: 'Compara as métricas em colunas.' };
    return f.card <= 6
      ? { score: 92, why: `Boa para comparar poucas categorias (${f.card}) lado a lado.` }
      : { score: 70, why: 'Alternativa às barras para comparação.' };
  },
  BAR_GROUPED: (f) => {
    if (f.m >= 2 && f.m <= 4 && f.d === 1 && !f.first!.isTime) {
      return f.card >= 6
        ? { score: f.sameFormat ? 89 : 72, why: 'Compara as métricas em cada categoria.' }
        : { score: f.sameFormat ? 80 : 66, why: 'Compara as métricas em cada categoria.' };
    }
    if (f.m === 1 && f.d === 2 && f.categories.length === 2) {
      return { score: 72, why: `Compara ${lower(f.second!.label)} dentro de cada grupo.` };
    }
    return 'Use 2 a 4 métricas com 1 dimensão, ou 1 métrica com 2 dimensões.';
  },
  COLUMN_GROUPED: (f) => {
    if (f.m >= 2 && f.m <= 4 && f.d === 1) {
      return f.sameFormat
        ? {
            score: f.card <= 6 ? 93 : 84,
            why: 'Métricas comparáveis lado a lado em cada categoria.',
          }
        : { score: 70, why: 'Compara métricas em escalas diferentes (eixo duplo).' };
    }
    if (f.m === 1 && f.d === 2) {
      return {
        score: f.secondCard <= 5 ? 76 : 60,
        why: `Compara ${lower(f.second!.label)} dentro de cada ${lower(f.first!.label)}.`,
      };
    }
    return 'Use 2 a 4 métricas com 1 dimensão, ou 1 métrica com 2 dimensões.';
  },
  BAR_STACKED: (f) => stackRule(f, 74, 'Partes do total de cada categoria, em barras.'),
  COLUMN_STACKED: (f) => stackRule(f, 82, 'Mostra o total de cada categoria dividido em partes.'),
  BAR_100_STACKED: (f) => stackRule(f, 64, 'Composição relativa (100%) de cada categoria.'),
  COLUMN_100_STACKED: (f) => stackRule(f, 68, 'Mix percentual de cada categoria.'),
  DONUT: (f) => {
    if (f.m !== 1 || f.d !== 1 || f.first!.isTime)
      return 'Use 1 métrica que soma com 1 dimensão de até 8 categorias.';
    if (!f.allAdditive)
      return 'A rosca só faz sentido para métricas que somam (partes de um total).';
    if (f.card <= 6) return { score: 78, why: 'Participação de cada categoria no total.' };
    if (f.card <= 8) return { score: 50, why: 'Participação no total (já há muitas fatias).' };
    return { score: 22, why: `Há categorias demais (${f.card}) para uma rosca legível.` };
  },
  TREEMAP: (f) => {
    if (f.m !== 1 || f.d < 1 || f.d > 2 || f.time.length > 0)
      return 'Use 1 métrica que soma com 1 ou 2 dimensões (sem tempo).';
    if (!f.allAdditive) return 'O treemap precisa de uma métrica que soma (tamanho das áreas).';
    return f.card >= 8
      ? { score: 86, why: `Mostra o peso de ${f.card} categorias no total.` }
      : { score: 55, why: 'Mostra o peso de cada categoria no total.' };
  },
  LINE: (f) => {
    if (f.m === 0 || f.time.length === 0) return 'Adicione uma dimensão de tempo (ex.: Mês).';
    if (f.d > 2) return 'Use tempo e no máximo mais uma dimensão.';
    if (f.d === 1)
      return { score: 97, why: 'Linha facilita a leitura da evolução ao longo do tempo.' };
    return { score: 72, why: 'Evolução de cada série ao longo do tempo.' };
  },
  MULTI_LINE: (f) => {
    if (f.time.length === 0) return 'Adicione uma dimensão de tempo (ex.: Mês).';
    if (f.d === 2 && f.m === 1 && f.categories.length === 1) {
      const card = f.categories[0]!.cardinality ?? 4;
      return card <= 6
        ? { score: 95, why: `Uma linha por ${lower(f.categories[0]!.label)} ao longo do tempo.` }
        : { score: 60, why: 'Muitas linhas: considere filtrar as principais.' };
    }
    if (f.d === 1 && f.m >= 2)
      return { score: 90, why: 'Evolução de cada métrica ao longo do tempo.' };
    return 'Use tempo com uma segunda dimensão ou com 2+ métricas.';
  },
  AREA: (f) => {
    if (f.m === 0 || f.time.length === 0) return 'Adicione uma dimensão de tempo (ex.: Mês).';
    if (f.d > 2) return 'Use tempo e no máximo mais uma dimensão.';
    const volume = f.metrics.every((metric) =>
      ['VOLUME', 'COUNT', 'CURRENCY', 'AMOUNT', 'FUNNEL_VALUE'].includes(metric.semanticType),
    );
    return volume && f.d === 1
      ? { score: 80, why: 'Destaca o volume acumulado em cada período.' }
      : { score: 58, why: 'Evolução preenchida ao longo do tempo.' };
  },
  AREA_STACKED: (f) => {
    if (f.time.length === 0) return 'Adicione uma dimensão de tempo (ex.: Mês).';
    if (!f.allAdditive) return 'Empilhar só faz sentido para métricas que somam.';
    if ((f.d === 2 && f.m === 1 && f.categories.length === 1) || (f.d === 1 && f.m >= 2)) {
      return { score: 83, why: 'Mostra a evolução do total e de cada parte.' };
    }
    return 'Use tempo, uma métrica que soma e uma segunda dimensão.';
  },
  HISTOGRAM: (f) => {
    if (f.m !== 1 || f.d !== 1 || f.first!.isTime)
      return 'Use 1 métrica com 1 dimensão de muitas categorias.';
    return f.card >= 15
      ? {
          score: 72,
          why: `Mostra como os valores das ${f.card} categorias se distribuem em faixas.`,
        }
      : { score: 32, why: 'Poucas categorias para formar faixas.' };
  },
  BOX_PLOT: (f) => {
    if (f.m !== 1 || f.d < 1 || f.d > 2) return 'Use 1 métrica com 1 ou 2 dimensões.';
    if (f.d === 2 && !f.second!.isTime && f.secondCard >= 4) {
      return { score: 62, why: `Distribuição dos valores em cada ${lower(f.first!.label)}.` };
    }
    if (f.d === 1 && f.card >= 8) return { score: 48, why: 'Resume a distribuição dos valores.' };
    return 'Precisa de vários valores por grupo (ex.: 2 dimensões).';
  },
  SCATTER: (f) => {
    if (f.m < 2) return 'Adicione duas métricas numéricas.';
    if (f.d !== 1) return 'Adicione uma dimensão (cada ponto é um valor dela).';
    if (f.m === 2) {
      return f.sameFormat
        ? { score: 76, why: 'Relação entre as duas métricas, um ponto por categoria.' }
        : {
            score: 95,
            why: `Mostra a relação entre ${lower(f.metrics[0]!.label)} e ${lower(f.metrics[1]!.label)} por ${lower(f.first!.label)}.`,
          };
    }
    return { score: 78, why: 'Relação entre as duas primeiras métricas.' };
  },
  BUBBLE: (f) => {
    if (f.m < 3) return 'Adicione três métricas numéricas (a terceira é o tamanho).';
    if (f.d !== 1) return 'Adicione uma dimensão (cada bolha é um valor dela).';
    return {
      score: f.sameFormat ? 84 : 96,
      why: `${f.metrics[0]!.label} × ${f.metrics[1]!.label}, com ${lower(f.metrics[2]!.label)} no tamanho.`,
    };
  },
  QUADRANT: (f) => {
    if (f.m < 2) return 'Adicione duas métricas numéricas.';
    if (f.d !== 1) return 'Adicione uma dimensão (cada ponto é um valor dela).';
    return {
      score: f.sameFormat ? 70 : 83,
      why: 'Classifica cada item em quatro grupos pela mediana.',
    };
  },
  FUNNEL: (f) => {
    const stages = f.metrics.filter((metric) => metric.funnelStage);
    if (f.d === 1 && f.first!.semanticType === 'FUNNEL_STAGE' && f.m === 1) {
      return { score: 96, why: 'Etapas ordenadas da jornada.' };
    }
    if (f.d === 0 && stages.length >= 3 && stages.length === f.m) {
      return { score: 99, why: `Mostra a queda entre as ${f.m} etapas da jornada.` };
    }
    return 'Use 3+ métricas de etapas da jornada (ex.: Leads, Contas abertas, Ativações D30) sem dimensões.';
  },
  SANKEY: (f) => {
    const roles = new Set(f.categories.map((dimension) => dimension.semanticType));
    if (f.m === 1 && f.d === 2 && roles.has('SOURCE') && roles.has('DESTINATION')) {
      if (!f.allAdditive) return 'O Sankey precisa de uma métrica que soma (largura dos fluxos).';
      return { score: 94, why: 'Mostra os fluxos da origem para o destino.' };
    }
    return 'Adicione uma dimensão de origem (ex.: Canal) e uma de destino (ex.: Produto).';
  },
  TIMELINE: (f) => {
    const daily = f.time.some(
      (dimension) => dimension.granularity === 'date' || !dimension.granularity,
    );
    const event = f.categories.some((dimension) => dimension.semanticType === 'EVENT');
    if (f.m >= 1 && f.d === 2 && daily && event) {
      return { score: 80, why: 'Eventos ao longo do tempo, por tipo.' };
    }
    return 'Use uma data diária e uma dimensão de tipo de evento.';
  },
  HEATMAP: (f) => {
    if (f.m !== 1 || f.d !== 2) return 'Use 1 métrica com 2 dimensões.';
    return f.time.length === 0
      ? {
          score: 96,
          why: `Facilita o cruzamento entre ${lower(f.first!.label)} e ${lower(f.second!.label)}.`,
        }
      : { score: 78, why: 'Intensidade de cada combinação ao longo do tempo.' };
  },
  COHORT: (f) => cohortRule(f, 97, 'Compara grupos de início pelo tempo decorrido até o evento.'),
  RETENTION_CURVE: (f) =>
    cohortRule(f, 86, 'Percentual acumulado que chega ao evento a cada mês desde o início.'),
  RADAR: (f) => {
    if (f.m < 3) return 'Use 3+ métricas na mesma escala (ex.: scores do DNA).';
    if (f.d > 1) return 'Use no máximo uma dimensão (cada série é um valor dela).';
    const scores = f.metrics.every((metric) => metric.semanticType === 'SCORE');
    if (scores) return { score: 90, why: 'Perfil em várias dimensões na mesma escala (0–100).' };
    if (f.sameFormat && f.metrics.every((metric) => metric.format === 'percent')) {
      return { score: 62, why: 'Compara percentuais na mesma escala.' };
    }
    return 'As métricas precisam estar na mesma escala (ex.: scores ou percentuais).';
  },
  MAP: (f) => {
    const geo = f.categories.find((dimension) => dimension.semanticType === 'GEO');
    if (!geo) return 'Adicione Estado ou Região para usar o mapa.';
    if (f.m === 0 || f.d !== 1) return 'Use 1 métrica com a dimensão geográfica (sem outras).';
    return {
      score: geo.geoLevel === 'REGION' ? 84 : 93,
      why: `Mostra a distribuição por ${lower(geo.label)} no mapa do Brasil.`,
    };
  },
  CALENDAR_HEATMAP: (f) => {
    const daily = f.time.find((dimension) => dimension.granularity === 'date');
    if (f.m === 1 && f.d === 1 && daily) {
      return { score: 88, why: 'Intensidade de cada dia ao longo do calendário.' };
    }
    return 'Use 1 métrica com uma data diária.';
  },
  WATERFALL: (f) => {
    if (f.m !== 1 || f.d !== 1 || f.first!.isTime) return 'Use 1 métrica que soma com 1 dimensão.';
    if (!f.allAdditive) return 'A cascata precisa de uma métrica que soma (contribuições).';
    return { score: 56, why: 'Mostra a contribuição de cada parte para o total.' };
  },
  RANKING: (f) => {
    if (f.m === 0 || f.d !== 1 || f.first!.isTime) return 'Use 1 métrica com 1 dimensão.';
    return {
      score: f.card >= 5 ? 82 : 60,
      why: `Top ${Math.min(f.card, 10)} de ${lower(f.first!.label)} em lista.`,
    };
  },
};

function stackRule(f: Facts, score: number, why: string): { score: number; why: string } | string {
  if (!f.allAdditive)
    return 'Empilhar só faz sentido para métricas que somam (contagens, valores).';
  if (f.m === 1 && f.d === 2 && f.categories.length >= 1) {
    return { score: f.secondCard <= 6 ? score : score - 18, why };
  }
  if (f.m >= 2 && f.d === 1 && f.sameFormat) return { score: score - 12, why };
  return 'Use uma métrica que soma com 2 dimensões (ou várias métricas que somam com 1).';
}

function cohortRule(f: Facts, score: number, why: string): { score: number; why: string } | string {
  const start = f.time.find((dimension) => dimension.cohortRole === 'START');
  const event = f.time.find((dimension) => dimension.cohortRole === 'EVENT');
  if (f.m === 1 && f.d === 2 && start && event) return { score, why };
  return 'Use uma data de início (ex.: Abertura de conta) e uma de evento (ex.: Ativação).';
}

/** Compatibility of one chart type with the analysis, and what is missing when incompatible. */
export function checkVisualizationCompatibility(
  type: ChartType,
  shape: AnalysisShape,
): VisualizationCompatibility {
  const outcome = RULES[type](factsOf(shape));
  if (typeof outcome === 'string') {
    return { compatible: false, reason: outcome, requirements: [outcome] };
  }
  return { compatible: true };
}

/** Every chart type of the catalog with compatibility, score and reason. */
export function evaluateVisualizations(shape: AnalysisShape): VisualizationEvaluation[] {
  const facts = factsOf(shape);
  return CHART_TYPES.map((type) => {
    const outcome = RULES[type](facts);
    return typeof outcome === 'string'
      ? {
          type,
          compatible: false,
          reason: outcome,
          requirements: [outcome],
          score: 0,
          why: outcome,
        }
      : { type, compatible: true, score: outcome.score, why: outcome.why };
  });
}

/** Best charts for the analysis, highest score first (Top 3 by default). */
export function recommendVisualizations(
  shape: AnalysisShape,
  limit = 3,
): VisualizationRecommendation[] {
  return evaluateVisualizations(shape)
    .filter((evaluation) => evaluation.compatible)
    .sort(
      (left, right) =>
        right.score - left.score ||
        CHART_TYPES.indexOf(left.type) - CHART_TYPES.indexOf(right.type),
    )
    .slice(0, limit)
    .map((evaluation, index) => ({
      type: evaluation.type,
      score: evaluation.score,
      reason: evaluation.why,
      recommended: index === 0,
    }));
}

/** AUTO when the platform picks the chart; MANUAL when the user pinned one. */
export function visualizationMode(visualization: VisualizationSpec | undefined): VisualizationMode {
  if (!visualization) return 'AUTO';
  if (visualization.mode) return visualization.mode;
  return normalizeVisualizationType(visualization.type) === 'AUTO' ? 'AUTO' : 'MANUAL';
}

export interface ResolvedVisualization {
  /** Chart actually drawn. */
  type: ChartType;
  mode: VisualizationMode;
  /** Best chart for the analysis (what AUTO shows). */
  recommended: ChartType;
  /** The pinned chart cannot draw this analysis: what was asked and why. */
  incompatible?: { requested: ChartType; reason: string };
}

/**
 * Chart to draw. AUTO follows the recommendation (it may change when the analysis changes);
 * MANUAL keeps the user's chart, and when it no longer fits the analysis it is reported instead
 * of silently replaced.
 */
export function resolveVisualization(
  visualization: VisualizationSpec | undefined,
  shape: AnalysisShape,
): ResolvedVisualization {
  const recommended = recommendVisualizations(shape, 1)[0]?.type ?? 'TABLE';
  const mode = visualizationMode(visualization);
  const requested = normalizeVisualizationType(visualization?.type ?? 'AUTO');
  if (mode === 'AUTO' || requested === 'AUTO') {
    return { type: recommended, mode: 'AUTO', recommended };
  }
  const compatibility = checkVisualizationCompatibility(requested, shape);
  return compatibility.compatible
    ? { type: requested, mode: 'MANUAL', recommended }
    : {
        type: recommended,
        mode: 'MANUAL',
        recommended,
        incompatible: { requested, reason: compatibility.reason ?? '' },
      };
}

/** Shape summary without values, for telemetry ("1 métrica · 1 dimensão (CATEGORY 7)"). */
export function describeShape(shape: AnalysisShape) {
  return {
    metrics: shape.metrics.map((metric) => metric.semanticType),
    dimensions: shape.dimensions.map(
      (dimension) =>
        `${dimension.semanticType}${dimension.cardinality ? `:${dimension.cardinality}` : ''}`,
    ),
  };
}

/** Name of a chart type in the catalog. */
export function chartName(type: ChartType) {
  return VISUALIZATION_META_BY_TYPE.get(type)?.name ?? type;
}
