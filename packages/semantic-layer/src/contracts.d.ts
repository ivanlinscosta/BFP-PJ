declare module '@bfp/domain' {
  /** Machine-readable semantic validation error code. */
  export type SemanticErrorCode =
    | 'UNKNOWN_METRIC'
    | 'UNKNOWN_DIMENSION'
    | 'INVALID_GRANULARITY'
    | 'INVALID_FILTER_FIELD'
    | 'INVALID_FILTER_OPERATOR'
    | 'INVALID_FILTER_VALUE'
    | 'INCOMPATIBLE_DIMENSION'
    | 'INCOMPATIBLE_FILTER'
    | 'INVALID_SORT_FIELD'
    | 'UNSUPPORTED_GRAIN'
    | 'MISSING_DATASETS'
    | 'DATASET_NOT_SELECTED'
    | 'UNKNOWN_DATASET';

  /** Actionable semantic validation error returned to the API and UI layers. */
  export interface SemanticError {
    code: SemanticErrorCode;
    path: string;
    message: string;
    details?: Record<string, unknown>;
  }

  /** Resolved entity field required to execute an analytics query. */
  export interface ResolvedSourceField {
    entityType: DatasetEntityType;
    field: string;
  }

  /** Metric request enriched with the governed semantic definition. */
  export interface ResolvedMetricSelection {
    request: MetricSelection;
    definition: MetricDefinition;
    alias: string;
    baseEntity: DatasetEntityType;
    sourceFields: ResolvedSourceField[];
  }

  /** Dimension request enriched with the governed semantic definition. */
  export interface ResolvedDimensionSelection {
    request: DimensionSelection;
    definition: DimensionDefinition;
    granularity?: DateGranularity;
    baseEntity: DatasetEntityType;
    sourceFields: ResolvedSourceField[];
  }

  /** Filter request enriched with the governed semantic definition. */
  export interface ResolvedFilterCondition {
    request: FilterCondition;
    definition: DimensionDefinition;
    baseEntity: DatasetEntityType;
    sourceFields: ResolvedSourceField[];
  }

  /** Resolved query DTO that the analytics engine can consume in the next phase. */
  export interface ValidatedAnalysisQuery {
    spec: AnalysisSpec;
    metrics: ResolvedMetricSelection[];
    dimensions: ResolvedDimensionSelection[];
    filters: ResolvedFilterCondition[];
    requiredEntityTypes: DatasetEntityType[];
    requiredSourceFields: ResolvedSourceField[];
    dateRange?: DateRangeSpec;
    comparison?: ComparisonSpec;
    sorting?: SortSpec[];
    limit?: number;
    visualization: VisualizationSpec;
    /** Data mesh datasets selected by the user and actually required by the query. */
    datasets: string[];
  }

  /** Semantic validator result emitted by the governed catalog. */
  export interface SemanticValidation {
    ok: boolean;
    errors: SemanticError[];
    resolvedQuery?: ValidatedAnalysisQuery;
    warnings?: string[];
  }

  /** Single lineage node for data governance visualization. */
  export interface LineageNode {
    id: string;
    kind: 'entity' | 'field' | 'metric';
    label: string;
  }

  /** Directed lineage edge between semantic nodes. */
  export interface LineageEdge {
    from: string;
    to: string;
    type: 'contains' | 'feeds' | 'depends_on';
  }

  /** Testable lineage graph consumed by governance surfaces. */
  export interface LineageGraph {
    nodes: LineageNode[];
    edges: LineageEdge[];
  }
}

export {};
