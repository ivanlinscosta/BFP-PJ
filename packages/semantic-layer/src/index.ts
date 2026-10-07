/**
 * Governed semantic layer for the MVP: metrics, dimensions, validation, quality, lineage,
 * data products, and glossary entries.
 */

export {
  BUSINESS_GLOSSARY,
  BUSINESS_TERM_BY_ID,
  DATA_PRODUCT_BY_ID,
  DATA_PRODUCT_CATALOG,
  DATE_DIMENSION_IDS,
  DIMENSION_CATALOG,
  DIMENSION_DEFINITION_BY_ID,
  METRIC_CATALOG,
  METRIC_DEFINITION_BY_ID,
  SEMANTIC_DOMAINS,
  compatibility,
  getDataProductForMetric,
  getDimensionDefinition,
  getMetricDefinition,
  listDimensionDefinitions,
  listMetricDefinitions,
  listSemanticDomains,
  resolveDimensionValueLabel,
} from './catalog';
export { buildLineage, resolveLineage, type BuildLineageOptions } from './lineage';
export {
  DEFAULT_QUALITY_THRESHOLDS,
  assessQuality,
  getQualityStatus,
  type DatasetQualitySummary,
  type QualityAssessment,
  type QualityThresholds,
} from './quality';
export { summarizeCatalog, validateAnalysisSpec, type ValidateOptions } from './validator';
export {
  MESH_DATASETS,
  MESH_DATASET_BY_ID,
  MESH_DATASET_IDS,
  MESH_JOIN_KEY,
  datasetForDimension,
  datasetForEntity,
  datasetsForMetric,
  requiredDatasets,
  withRequiredDatasets,
  type MeshColumn,
  type MeshDatasetDefinition,
  type MeshDatasetId,
} from './mesh';

export type {
  BusinessTerm,
  DataProductDefinition,
  DimensionDefinition,
  LineageGraph,
  MetricDefinition,
  SemanticError,
  SemanticValidation,
  ValidatedAnalysisQuery,
} from '@bfp/domain';
export type {
  GovernedDataProductDefinition,
  GovernedDimensionDefinition,
  GovernedMetricDefinition,
  SourceFieldRef,
} from './catalog';
