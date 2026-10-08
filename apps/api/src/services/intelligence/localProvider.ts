import type { AnalysisSpec } from '@bfp/domain';
import { applyAnalysisOperations, type AnalysisOperation } from '@bfp/shared';
import { BUSINESS_GLOSSARY, withRequiredDatasets } from '@bfp/semantic-layer';
import { matchesSearchQuery } from '@api/http/textSearch';
import {
  buildSuggestions,
  composeAnswer,
  describeBasis,
  describeOperations,
} from '@api/services/intelligence/compose';
import {
  buildSpecFromIntent,
  buildUpdateOperations,
  parseIntent,
  resolveDimensionId,
} from '@api/services/intelligence/nlu';
import { findGovernedTool, type ToolContext } from '@api/services/intelligence/tools';
import type { ProviderResult } from '@api/services/intelligence/types';

const DEFAULT_CONTEXT: AnalysisSpec = {
  metrics: [],
  dimensions: [],
  filters: [],
  dateRange: { type: 'LAST_N_DAYS', value: 90 },
  visualization: { type: 'AUTO' },
};

async function runQuery(spec: AnalysisSpec, toolContext: ToolContext) {
  const tool = findGovernedTool('runAnalyticsQuery')!;
  await tool.execute({ analysisSpec: spec }, toolContext);
  return toolContext.queries[toolContext.queries.length - 1]!.result;
}

function replaceOperations(spec: AnalysisSpec): AnalysisOperation[] {
  return [
    { type: 'CLEAR' },
    ...(spec.datasets ?? []).map((datasetId): AnalysisOperation => ({
      type: 'ADD_DATASET',
      datasetId,
    })),
    ...spec.metrics.map((metric): AnalysisOperation => ({
      type: 'ADD_METRIC',
      metricId: metric.id,
    })),
    ...spec.dimensions.map((dimension): AnalysisOperation => ({
      type: 'ADD_DIMENSION',
      dimensionId: dimension.id,
      granularity: dimension.granularity,
    })),
    ...spec.filters.map((filter): AnalysisOperation => ({ type: 'ADD_FILTER', filter })),
    ...(spec.dateRange
      ? [{ type: 'SET_DATE_RANGE', dateRange: spec.dateRange } satisfies AnalysisOperation]
      : []),
  ];
}

/**
 * Deterministic provider: interprets the prompt with the governed lexicon, executes
 * runAnalyticsQuery for every numeric statement and narrates the structured evidence.
 */
export async function runLocalProvider(input: {
  prompt: string;
  analysisSpec?: AnalysisSpec;
  toolContext: ToolContext;
}): Promise<ProviderResult> {
  const context = input.analysisSpec ?? DEFAULT_CONTEXT;
  const intent = parseIntent(input.prompt);

  if (intent.kind === 'UPDATE') {
    let operations = buildUpdateOperations(intent, context);

    if (intent.normalized.includes('investig') && intent.filters.length > 0) {
      const fields = new Set(intent.filters.map((filter) => filter.field));
      const month = resolveDimensionId(
        'month',
        context.metrics.map((metric) => metric.id),
      );
      operations = [
        ...intent.filters.map((filter): AnalysisOperation => ({ type: 'ADD_FILTER', filter })),
        ...context.dimensions
          .filter((dimension) => fields.has(dimension.id))
          .map((dimension): AnalysisOperation => ({
            type: 'REMOVE_DIMENSION',
            dimensionId: dimension.id,
          })),
        ...(month
          ? [
              {
                type: 'ADD_DIMENSION',
                dimensionId: month.id,
                granularity: month.granularity,
              } satisfies AnalysisOperation,
            ]
          : []),
      ];
    }

    const draftSpec = applyAnalysisOperations(context, operations);
    const datasetOperations = (withRequiredDatasets(draftSpec).datasets ?? [])
      .filter((datasetId) => !(draftSpec.datasets ?? []).includes(datasetId))
      .map((datasetId): AnalysisOperation => ({ type: 'ADD_DATASET', datasetId }));
    operations = [...datasetOperations, ...operations];
    const nextSpec = applyAnalysisOperations(context, operations);
    if (operations.length === datasetOperations.length || nextSpec.metrics.length === 0) {
      return {
        action: 'NONE',
        operations: [],
        message: 'Adicione uma métrica à análise antes de pedir esse ajuste.',
        answer: 'Para ajustar a análise, comece escolhendo uma métrica governada.',
        suggestions: ['Mostre a conversão de abertura por canal'],
      };
    }

    const result = await runQuery(nextSpec, input.toolContext);
    return {
      action: 'UPDATE_ANALYSIS',
      operations,
      analysisSpec: nextSpec,
      message: describeOperations(operations),
      // The adjusted analysis is answered too, so the conversation shows what changed in the data.
      answer: composeAnswer(result),
      basis: describeBasis(nextSpec),
      evidence: result.insights,
      suggestions: buildSuggestions(nextSpec, result),
    };
  }

  if (intent.kind === 'QUESTION' || intent.kind === 'BUILD') {
    const metricsFromContext =
      intent.metrics.length === 0 ? context.metrics.map((metric) => metric.id) : intent.metrics;
    const baseSpec = withRequiredDatasets({
      ...buildSpecFromIntent({ ...intent, metrics: metricsFromContext }, context),
      datasets: context.datasets,
    });
    // CAC only compares channels with paid acquisition; organic/referral have no media cost.
    const comparesCacByChannel =
      baseSpec.metrics.some((metric) => metric.id === 'cac') &&
      baseSpec.dimensions.some((dimension) => dimension.id === 'acquisition_channel') &&
      !baseSpec.filters.some((filter) => filter.field === 'acquisition_source');
    const spec: AnalysisSpec =
      intent.kind === 'QUESTION' && comparesCacByChannel
        ? {
            ...baseSpec,
            filters: [
              ...baseSpec.filters,
              { field: 'acquisition_source', operator: 'EQ', value: 'PAID' },
            ],
          }
        : baseSpec;

    if (spec.metrics.length === 0) {
      return {
        action: 'NONE',
        operations: [],
        message: 'Não identifiquei uma métrica governada na pergunta.',
        answer:
          'Não identifiquei uma métrica governada na pergunta. Tente mencionar, por exemplo, conversão de abertura, CAC ou ativação D30.',
        suggestions: ['Qual canal combina melhor conversão com menor CAC?'],
      };
    }

    const result = await runQuery(spec, input.toolContext);
    const answer = composeAnswer(result);

    if (intent.kind === 'BUILD') {
      const operations = replaceOperations(spec);
      return {
        action: 'UPDATE_ANALYSIS',
        operations,
        analysisSpec: spec,
        message: 'Montei a análise a partir da sua pergunta.',
        answer,
        basis: describeBasis(spec),
        evidence: result.insights,
        suggestions: buildSuggestions(spec, result),
      };
    }

    return {
      action: 'ANSWER_QUESTION',
      operations: [],
      analysisSpec: spec,
      message: answer,
      answer,
      basis: describeBasis(spec),
      evidence: result.insights,
      suggestions: buildSuggestions(spec, result),
    };
  }

  const glossary = BUSINESS_GLOSSARY.filter((term) =>
    matchesSearchQuery([term.term, ...term.synonyms], intent.normalized),
  ).slice(0, 2);
  if (glossary.length > 0) {
    const answer = glossary.map((term) => `${term.term}: ${term.definition}`).join(' ');
    return {
      action: 'NONE',
      operations: [],
      message: answer,
      answer,
      suggestions: buildSuggestions(context),
    };
  }

  return {
    action: 'NONE',
    operations: [],
    message: 'Não consegui relacionar a pergunta às métricas e dimensões governadas.',
    answer:
      'Não consegui relacionar a pergunta às métricas e dimensões governadas. Pergunte sobre conversão, CAC, ativação D30, contas abertas, investimento em mídia ou produtos por cliente.',
    suggestions: ['Qual canal combina melhor conversão com menor CAC?', 'Separar por porte'],
  };
}
