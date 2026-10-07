import type { DatasetEntityType, QualityStatus } from '@bfp/domain';
import { DATA_PRODUCT_CATALOG, assessQuality } from '@bfp/semantic-layer';
import type { ApiContext } from '@api/http/context';
import { profileDatasetQuality } from '@api/http/dataQuality';

function sourceEntityIncluded(
  sourceEntityTypes: readonly DatasetEntityType[],
  entityType: DatasetEntityType | 'dataProduct' | 'semanticCatalog',
) {
  return (sourceEntityTypes as readonly string[]).includes(entityType);
}

function weightedAverage(values: Array<{ value: number; weight: number }>) {
  const totalWeight = values.reduce((sum, entry) => sum + entry.weight, 0);
  return totalWeight === 0
    ? 0
    : values.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / totalWeight;
}

/** Data products enriched with measured quality, freshness against SLO and record counts. */
export async function buildDataProductQualityCatalog(context: ApiContext) {
  const repository = context.getDatasetRepository();
  const now = context.clock();
  const [statuses, loadedAt] = await Promise.all([
    repository.listByType<QualityStatus>('qualityStatus'),
    context.getDataLoadedAt(),
  ]);
  const profiles = await profileDatasetQuality(
    repository,
    DATA_PRODUCT_CATALOG.flatMap((product) => [...product.sourceEntityTypes]),
    now.getTime(),
  );
  const freshnessMinutes = Math.max(
    0,
    Math.round((now.getTime() - new Date(loadedAt).getTime()) / 60_000),
  );

  return DATA_PRODUCT_CATALOG.map((product) => {
    const sourceProfiles = product.sourceEntityTypes
      .map((entityType) => profiles.get(entityType))
      .filter((profile): profile is NonNullable<typeof profile> => Boolean(profile));
    const weights = sourceProfiles.map((profile) => ({ profile, weight: profile.records }));
    const completeness = weightedAverage(
      weights.map(({ profile, weight }) => ({ value: profile.completeness, weight })),
    );
    const validity = weightedAverage(
      weights.map(({ profile, weight }) => ({ value: profile.validity, weight })),
    );
    const uniqueness = weightedAverage(
      weights.map(({ profile, weight }) => ({ value: profile.uniqueness, weight })),
    );
    const relatedStatuses = statuses.filter(
      (status) =>
        status.scopeId === product.id ||
        sourceEntityIncluded(product.sourceEntityTypes, status.scopeType),
    );
    const openIncidentCount = relatedStatuses
      .flatMap((status) => status.incidents)
      .filter((incident) => incident.status === 'OPEN').length;
    const assessment = assessQuality(
      {
        freshnessMinutes,
        completenessRatio: completeness,
        validityRatio: validity,
        uniquenessRatio: uniqueness,
        incidentCount: openIncidentCount,
      },
      {
        freshnessSLOMinutes: product.freshnessSLOMinutes,
        completenessThreshold: product.qualityThreshold,
        validityThreshold: product.qualityThreshold,
        uniquenessThreshold: 0.99,
      },
    );

    return {
      ...product,
      quality: assessment,
      qualityRatio: (completeness + validity + uniqueness) / 3,
      measures: { completeness, validity, uniqueness },
      freshness: {
        lastLoadedAt: loadedAt,
        minutes: freshnessMinutes,
        withinSLO: freshnessMinutes <= product.freshnessSLOMinutes,
      },
      openIncidentCount,
      sourceStats: sourceProfiles.map((profile) => ({
        entityType: profile.entityType,
        count: profile.records,
      })),
      relatedStatusIds: relatedStatuses.map((status) => status.id),
    };
  });
}

export async function buildQualitySummary(context: ApiContext) {
  const dataProducts = await buildDataProductQualityCatalog(context);
  const statusEntries = await context
    .getDatasetRepository()
    .listByType<QualityStatus>('qualityStatus');
  const openIncidents = statusEntries
    .flatMap((status) => status.incidents)
    .filter((incident) => incident.status === 'OPEN');
  const averageScore =
    dataProducts.length === 0
      ? 100
      : Math.round(
          dataProducts.reduce((total, product) => total + product.quality.score, 0) /
            dataProducts.length,
        );

  return {
    overview: {
      score: averageScore,
      status:
        averageScore < 70
          ? 'CRITICAL'
          : averageScore < 90 || openIncidents.length > 0
            ? 'WARNING'
            : 'HEALTHY',
      openIncidentCount: openIncidents.length,
      trackedScopes: dataProducts.length + statusEntries.length,
    },
    statuses: statusEntries,
    dataProducts,
  };
}
