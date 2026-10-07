import type { LineageGraph } from '@bfp/domain';

import { getMetricDefinition, METRIC_CATALOG } from './catalog';

/** Options to scope lineage generation to a subset of governed metrics. */
export interface BuildLineageOptions {
  metricIds?: readonly string[];
}

/** Builds the entity → field → metric lineage graph described by the semantic layer architecture. */
export function buildLineage(options: BuildLineageOptions = {}): LineageGraph {
  const selectedMetrics = (options.metricIds ?? METRIC_CATALOG.map((metric) => metric.id))
    .map((metricId) => getMetricDefinition(metricId))
    .filter((metric): metric is NonNullable<typeof metric> => Boolean(metric));

  const nodeMap = new Map<string, LineageGraph['nodes'][number]>();
  const edgeMap = new Map<string, LineageGraph['edges'][number]>();

  const addNode = (node: LineageGraph['nodes'][number]) => {
    nodeMap.set(node.id, node);
  };

  const addEdge = (edge: LineageGraph['edges'][number]) => {
    edgeMap.set(`${edge.from}->${edge.to}:${edge.type}`, edge);
  };

  for (const metric of selectedMetrics) {
    const metricNodeId = `metric:${metric.id}`;
    addNode({ id: metricNodeId, kind: 'metric', label: metric.name });

    for (const field of metric.sourceFields) {
      const entityNodeId = `entity:${field.entityType}`;
      const fieldNodeId = `field:${field.entityType}.${field.field}`;

      addNode({ id: entityNodeId, kind: 'entity', label: field.entityType });
      addNode({ id: fieldNodeId, kind: 'field', label: `${field.entityType}.${field.field}` });
      addEdge({ from: entityNodeId, to: fieldNodeId, type: 'contains' });
      addEdge({ from: fieldNodeId, to: metricNodeId, type: 'feeds' });
    }

    if (metric.aggregation === 'RATIO') {
      addEdge({ from: `metric:${metric.numerator}`, to: metricNodeId, type: 'depends_on' });
      addEdge({ from: `metric:${metric.denominator}`, to: metricNodeId, type: 'depends_on' });

      const numeratorMetric = getMetricDefinition(metric.numerator);
      const denominatorMetric = getMetricDefinition(metric.denominator);

      if (numeratorMetric) {
        addNode({
          id: `metric:${numeratorMetric.id}`,
          kind: 'metric',
          label: numeratorMetric.name,
        });
      }

      if (denominatorMetric) {
        addNode({
          id: `metric:${denominatorMetric.id}`,
          kind: 'metric',
          label: denominatorMetric.name,
        });
      }
    }
  }

  return {
    nodes: [...nodeMap.values()],
    edges: [...edgeMap.values()],
  };
}

/** Convenience helper to build lineage for a single governed metric identifier. */
export function resolveLineage(metricId: string): LineageGraph {
  return buildLineage({ metricIds: [metricId] });
}
