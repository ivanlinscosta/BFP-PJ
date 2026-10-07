import { buildLineage, resolveLineage } from './index';

describe('@bfp/semantic-layer lineage', () => {
  it('builds a graph with entities, fields, metrics, and ratio dependencies', () => {
    const graph = buildLineage({ metricIds: ['cac'] });

    expect(graph.nodes.some((node) => node.id === 'metric:cac')).toBe(true);
    expect(graph.nodes.some((node) => node.id === 'metric:media_spend')).toBe(true);
    expect(graph.nodes.some((node) => node.id === 'metric:accounts_opened')).toBe(true);
    expect(graph.nodes.some((node) => node.id === 'field:touchpoint.cost')).toBe(true);
    expect(
      graph.edges.some(
        (edge) => edge.from === 'entity:touchpoint' && edge.to === 'field:touchpoint.cost',
      ),
    ).toBe(true);
    expect(
      graph.edges.some((edge) => edge.from === 'metric:media_spend' && edge.to === 'metric:cac'),
    ).toBe(true);
    expect(
      graph.edges.some(
        (edge) => edge.from === 'metric:accounts_opened' && edge.to === 'metric:cac',
      ),
    ).toBe(true);
  });

  it('can resolve lineage for a single governed metric id', () => {
    const graph = resolveLineage('activation_d30_rate');

    expect(graph.nodes.some((node) => node.id === 'metric:activation_d30_rate')).toBe(true);
    expect(graph.edges.some((edge) => edge.type === 'depends_on')).toBe(true);
  });
});
