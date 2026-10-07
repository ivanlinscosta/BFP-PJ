import {
  MESH_DATASET_BY_ID,
  MESH_JOIN_KEY,
  datasetForDimension,
  datasetsForMetric,
  type MeshDatasetId,
} from '@bfp/semantic-layer';
import type { ValidatedAnalysisQuery } from '@bfp/semantic-layer';

/** Data mesh execution plan shown to the user: which bases were read and how they were joined. */
export interface MeshExecutionPlan {
  datasets: Array<{ id: string; name: string }>;
  joins: Array<{ left: string; right: string; key: string; description: string }>;
}

/**
 * Plans the joins needed by a validated query over the selected mesh datasets: each metric is
 * computed on its fact dataset; company attributes (Customer 360) are joined by company_id.
 */
export function planMeshExecution(query: ValidatedAnalysisQuery): MeshExecutionPlan {
  const facts = new Set<MeshDatasetId>(
    query.metrics.flatMap((metric) => datasetsForMetric(metric.definition.id)),
  );
  const attributeOwners = new Set<MeshDatasetId>(
    [...query.dimensions.map((d) => d.definition.id), ...query.filters.map((f) => f.definition.id)]
      .map((id) => datasetForDimension(id))
      .filter((id): id is MeshDatasetId => Boolean(id)),
  );
  const name = (id: string) => MESH_DATASET_BY_ID.get(id as MeshDatasetId)?.name ?? id;
  const joins: MeshExecutionPlan['joins'] = [];

  for (const fact of facts) {
    if (fact !== 'customer_360' && attributeOwners.has('customer_360')) {
      joins.push({
        left: fact,
        right: 'customer_360',
        key: MESH_JOIN_KEY,
        description: `${name(fact)} ⋈ ${name('customer_360')} por ${MESH_JOIN_KEY}`,
      });
    }
  }

  const factList = [...facts];
  for (const other of factList.slice(1)) {
    joins.push({
      left: factList[0]!,
      right: other,
      key: 'dimensões da análise',
      description: `${name(factList[0]!)} ⋈ ${name(other)} pelas dimensões selecionadas`,
    });
  }

  return {
    datasets: query.datasets.map((id) => ({ id, name: name(id) })),
    joins,
  };
}
