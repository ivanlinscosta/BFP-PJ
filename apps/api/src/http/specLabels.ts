import type { AnalysisSpec } from '@bfp/domain';
import {
  getDimensionDefinition,
  getMetricDefinition,
  resolveDimensionValueLabel,
} from '@bfp/semantic-layer';
import { describeAnalysisSpec, type SpecLabelResolver } from '@bfp/shared';

/** Label resolver backed by the governed semantic catalog. */
export const semanticLabelResolver: SpecLabelResolver = {
  metric: (id) => getMetricDefinition(id)?.shortName ?? id,
  dimension: (id) => getDimensionDefinition(id)?.label ?? id,
  value: (fieldId, value) => resolveDimensionValueLabel(fieldId, value),
};

/** Human description of an AnalysisSpec using governed labels. */
export function describeSpec(spec: AnalysisSpec) {
  return describeAnalysisSpec(spec, semanticLabelResolver);
}
