import type {
  AnalysisSpec,
  DateGranularity,
  DimensionDefinition,
  FilterCondition,
  ResolvedSourceField,
  SemanticError,
  SemanticValidation,
  ValidatedAnalysisQuery,
} from '@bfp/domain';

import {
  DATE_DIMENSION_IDS,
  DIMENSION_CATALOG,
  DIMENSION_DEFINITION_BY_ID,
  METRIC_CATALOG,
  METRIC_DEFINITION_BY_ID,
  compatibility,
  type GovernedDimensionDefinition,
  type GovernedMetricDefinition,
  type SourceFieldRef,
} from './catalog';
import { MESH_DATASET_BY_ID, requiredDatasets, type MeshDatasetId } from './mesh';

/** Validation options. */
export interface ValidateOptions {
  /**
   * When true (default), the user must have selected every mesh dataset the query needs.
   * The engine is only triggered over the selected data products.
   */
  requireDatasets?: boolean;
}

const unaryOperators = new Set(['EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'CONTAINS']);
const setOperators = new Set(['IN', 'NOT_IN']);
const nullaryOperators = new Set(['IS_NULL', 'IS_NOT_NULL']);

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

function createError(
  code: SemanticError['code'],
  path: string,
  message: string,
  details?: Record<string, unknown>,
): SemanticError {
  return { code, path, message, details };
}

function isDateDimension(dimension: DimensionDefinition): boolean {
  return dimension.type === 'date';
}

function normalizeGranularity(
  dimension: GovernedDimensionDefinition,
  requestedGranularity: DateGranularity | undefined,
): DateGranularity | undefined {
  if (!isDateDimension(dimension)) {
    return undefined;
  }

  return requestedGranularity ?? 'date';
}

function validateFilterShape(filter: FilterCondition, path: string): SemanticError[] {
  if (setOperators.has(filter.operator)) {
    if (!('value' in filter) || !Array.isArray(filter.value) || filter.value.length === 0) {
      return [
        createError(
          'INVALID_FILTER_VALUE',
          path,
          `O operador ${filter.operator} exige uma lista não vazia em \`${path}.value\`.`,
        ),
      ];
    }

    return [];
  }

  if (filter.operator === 'BETWEEN') {
    if (!('value' in filter) || !Array.isArray(filter.value) || filter.value.length !== 2) {
      return [
        createError(
          'INVALID_FILTER_VALUE',
          path,
          'O operador BETWEEN exige exatamente dois valores em `value`.',
        ),
      ];
    }

    return [];
  }

  if (nullaryOperators.has(filter.operator)) {
    return [];
  }

  if (unaryOperators.has(filter.operator)) {
    if (!('value' in filter)) {
      return [
        createError(
          'INVALID_FILTER_VALUE',
          path,
          `O operador ${filter.operator} exige um valor escalar em \`${path}.value\`.`,
        ),
      ];
    }

    return [];
  }

  return [
    createError(
      'INVALID_FILTER_OPERATOR',
      path,
      `Operador de filtro não suportado: ${filter.operator}.`,
    ),
  ];
}

function resolveSourceFields(fields: readonly SourceFieldRef[]) {
  return fields.map((field): ResolvedSourceField => ({
    entityType: field.entityType,
    field: field.field,
  }));
}

function collectRequiredFields(resolvedQuery: ValidatedAnalysisQuery) {
  const dedupedFieldMap = new Map<string, ResolvedSourceField>();

  for (const field of resolvedQuery.metrics.flatMap((metric) => metric.sourceFields)) {
    dedupedFieldMap.set(`${field.entityType}.${field.field}`, field);
  }

  for (const field of resolvedQuery.dimensions.flatMap((dimension) => dimension.sourceFields)) {
    dedupedFieldMap.set(`${field.entityType}.${field.field}`, field);
  }

  for (const field of resolvedQuery.filters.flatMap((filter) => filter.sourceFields)) {
    dedupedFieldMap.set(`${field.entityType}.${field.field}`, field);
  }

  resolvedQuery.requiredSourceFields = [...dedupedFieldMap.values()];
  resolvedQuery.requiredEntityTypes = unique(
    resolvedQuery.requiredSourceFields.map((field) => field.entityType),
  ) as ValidatedAnalysisQuery['requiredEntityTypes'];
}

function metricSupportsFilter(metric: GovernedMetricDefinition, fieldId: string): boolean {
  return metric.allowedFilters.includes(fieldId);
}

function metricHasUnsupportedTemporalGrouping(
  metric: GovernedMetricDefinition,
  selectedDimensions: readonly GovernedDimensionDefinition[],
): boolean {
  if (metric.additivity !== 'NON_ADDITIVE' || metric.supportsTemporalGrouping !== false) {
    return false;
  }

  return selectedDimensions.some((dimension) => DATE_DIMENSION_IDS.has(dimension.id));
}

/**
 * Validates a serializable `AnalysisSpec` against the governed semantic catalog and resolves
 * the metric, dimension, and filter definitions required by the analytics engine.
 */
export function validateAnalysisSpec(
  spec: AnalysisSpec,
  options: ValidateOptions = {},
): SemanticValidation {
  const errors: SemanticError[] = [];
  const requireSelection = options.requireDatasets ?? true;

  const resolvedMetrics = spec.metrics.map((selection, index) => {
    const definition = METRIC_DEFINITION_BY_ID.get(selection.id);

    if (!definition) {
      errors.push(
        createError(
          'UNKNOWN_METRIC',
          `metrics[${index}].id`,
          `A métrica \`${selection.id}\` não existe no catálogo governado.`,
        ),
      );

      return undefined;
    }

    return {
      request: selection,
      definition,
      alias: selection.alias?.trim() || definition.id,
      baseEntity: definition.baseEntity,
      sourceFields: resolveSourceFields(definition.sourceFields),
    };
  });

  const resolvedDimensions = spec.dimensions.map((selection, index) => {
    const definition = DIMENSION_DEFINITION_BY_ID.get(selection.id);

    if (!definition) {
      errors.push(
        createError(
          'UNKNOWN_DIMENSION',
          `dimensions[${index}].id`,
          `A dimensão \`${selection.id}\` não existe no catálogo governado.`,
        ),
      );

      return undefined;
    }

    if (selection.granularity && !isDateDimension(definition)) {
      errors.push(
        createError(
          'INVALID_GRANULARITY',
          `dimensions[${index}].granularity`,
          `A dimensão \`${definition.name}\` não suporta granularidade temporal.`,
        ),
      );
    }

    if (selection.granularity && definition.supportedGranularities) {
      const supportedGranularities = new Set(definition.supportedGranularities);
      if (!supportedGranularities.has(selection.granularity)) {
        errors.push(
          createError(
            'INVALID_GRANULARITY',
            `dimensions[${index}].granularity`,
            `A granularidade \`${selection.granularity}\` não é suportada por \`${definition.name}\`.`,
          ),
        );
      }
    }

    return {
      request: selection,
      definition,
      granularity: normalizeGranularity(definition, selection.granularity),
      baseEntity: definition.baseEntity,
      sourceFields: resolveSourceFields(definition.sourceFields),
    };
  });

  const resolvedFilters = spec.filters.map((filter, index) => {
    const shapeErrors = validateFilterShape(filter, `filters[${index}]`);
    errors.push(...shapeErrors);

    const definition = DIMENSION_DEFINITION_BY_ID.get(filter.field);
    if (!definition) {
      errors.push(
        createError(
          'INVALID_FILTER_FIELD',
          `filters[${index}].field`,
          `O filtro referencia o campo semântico desconhecido \`${filter.field}\`.`,
        ),
      );

      return undefined;
    }

    const allowedOperators = new Set<string>(definition.allowedOperators);
    if (!allowedOperators.has(filter.operator)) {
      errors.push(
        createError(
          'INVALID_FILTER_OPERATOR',
          `filters[${index}].operator`,
          `O operador \`${filter.operator}\` não é permitido para a dimensão \`${definition.name}\`.`,
          { dimensionId: definition.id, allowedOperators: definition.allowedOperators },
        ),
      );
    }

    return {
      request: filter,
      definition,
      baseEntity: definition.baseEntity,
      sourceFields: resolveSourceFields(definition.sourceFields),
    };
  });

  const knownMetrics = resolvedMetrics.filter((metric): metric is NonNullable<typeof metric> =>
    Boolean(metric),
  );
  const knownDimensions = resolvedDimensions.filter(
    (dimension): dimension is NonNullable<typeof dimension> => Boolean(dimension),
  );
  const knownFilters = resolvedFilters.filter((filter): filter is NonNullable<typeof filter> =>
    Boolean(filter),
  );

  for (const metric of knownMetrics) {
    for (const dimension of knownDimensions) {
      if (!compatibility(metric.definition.id, dimension.definition.id)) {
        errors.push(
          createError(
            'INCOMPATIBLE_DIMENSION',
            `dimensions.${dimension.definition.id}`,
            `A métrica ${metric.definition.name} não suporta a dimensão ${dimension.definition.name}.`,
            { metricId: metric.definition.id, dimensionId: dimension.definition.id },
          ),
        );
      }
    }

    if (
      metricHasUnsupportedTemporalGrouping(
        metric.definition,
        knownDimensions.map((item) => item.definition),
      )
    ) {
      const firstDateDimension = knownDimensions.find((dimension) =>
        isDateDimension(dimension.definition),
      );
      errors.push(
        createError(
          'UNSUPPORTED_GRAIN',
          `metrics.${metric.definition.id}`,
          `A métrica ${metric.definition.name} é não aditiva e não suporta agrupamento temporal por ${firstDateDimension?.definition.name}.`,
          { metricId: metric.definition.id, dimensionId: firstDateDimension?.definition.id },
        ),
      );
    }

    for (const filter of knownFilters) {
      if (!metricSupportsFilter(metric.definition, filter.definition.id)) {
        errors.push(
          createError(
            'INCOMPATIBLE_FILTER',
            `filters.${filter.definition.id}`,
            `A métrica ${metric.definition.name} não aceita o filtro ${filter.definition.name} neste MVP.`,
            { metricId: metric.definition.id, filterField: filter.definition.id },
          ),
        );
      }
    }
  }

  const sortableFields = new Set<string>();
  for (const metric of knownMetrics) {
    sortableFields.add(metric.definition.id);
    sortableFields.add(metric.alias);
  }
  for (const dimension of knownDimensions) {
    sortableFields.add(dimension.definition.id);
  }

  for (const [index, sort] of (spec.sorting ?? []).entries()) {
    if (!sortableFields.has(sort.field)) {
      errors.push(
        createError(
          'INVALID_SORT_FIELD',
          `sorting[${index}].field`,
          `O campo de ordenação \`${sort.field}\` não corresponde a nenhuma métrica ou dimensão resolvida.`,
        ),
      );
    }
  }

  const needed = requiredDatasets({
    metricIds: knownMetrics.map((metric) => metric.definition.id),
    dimensionIds: knownDimensions.map((dimension) => dimension.definition.id),
    filterFields: knownFilters.map((filter) => filter.definition.id),
  });
  const selected = spec.datasets ?? [];
  for (const [index, datasetId] of selected.entries()) {
    if (!MESH_DATASET_BY_ID.has(datasetId as MeshDatasetId)) {
      errors.push(
        createError(
          'UNKNOWN_DATASET',
          `datasets[${index}]`,
          `A base \`${datasetId}\` não existe no data mesh.`,
        ),
      );
    }
  }
  if (requireSelection) {
    if (selected.length === 0) {
      errors.push(
        createError(
          'MISSING_DATASETS',
          'datasets',
          'Selecione as bases de dados da análise antes de executá-la.',
          { requiredDatasets: needed },
        ),
      );
    } else {
      for (const datasetId of needed.filter((id) => !selected.includes(id))) {
        errors.push(
          createError(
            'DATASET_NOT_SELECTED',
            'datasets',
            `A análise precisa da base ${MESH_DATASET_BY_ID.get(datasetId)?.name ?? datasetId}. Adicione-a às bases selecionadas.`,
            { datasetId },
          ),
        );
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const resolvedQuery: ValidatedAnalysisQuery = {
    spec,
    metrics: knownMetrics,
    dimensions: knownDimensions,
    filters: knownFilters,
    requiredEntityTypes: [],
    requiredSourceFields: [],
    dateRange: spec.dateRange,
    comparison: spec.comparison,
    sorting: spec.sorting,
    limit: spec.limit,
    visualization: spec.visualization,
    datasets: requireSelection
      ? selected.filter((id) => needed.includes(id as MeshDatasetId))
      : needed,
  };

  collectRequiredFields(resolvedQuery);

  return {
    ok: true,
    errors: [],
    warnings: [],
    resolvedQuery,
  };
}

/** Returns the current semantic catalog sizes for lightweight discovery endpoints. */
export function summarizeCatalog() {
  return {
    metrics: METRIC_CATALOG.length,
    dimensions: DIMENSION_CATALOG.length,
  };
}
