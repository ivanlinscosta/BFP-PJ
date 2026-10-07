import type {
  Company,
  CompanyProduct,
  Conversation,
  DatasetEntity,
  DatasetEntityType,
  MediaCampaign,
  MediaTouchpoint,
} from '@bfp/domain';
import type { DatasetRepository } from '@api/repositories/types';

/** Measured data-quality ratios for one entity type. */
export interface EntityQualityProfile {
  entityType: DatasetEntityType;
  records: number;
  completeness: number;
  validity: number;
  uniqueness: number;
}

const REQUIRED_FIELDS: Partial<Record<DatasetEntityType, readonly string[]>> = {
  company: [
    'id',
    'cnpjMasked',
    'segment',
    'companySize',
    'state',
    'region',
    'acquisitionChannel',
    'leadCreatedAt',
    'status',
  ],
  partner: ['id', 'companyId', 'role', 'joinedAt'],
  account: ['id', 'companyId', 'type', 'status', 'openedAt'],
  product: ['id', 'name', 'category', 'status'],
  companyProduct: ['id', 'companyId', 'productId', 'status', 'contractedAt'],
  campaign: ['id', 'name', 'channel', 'budget', 'startDate', 'endDate'],
  touchpoint: ['id', 'companyId', 'channel', 'touchpointType', 'occurredAt'],
  funnelEvent: ['id', 'companyId', 'eventType', 'occurredAt'],
  crmInteraction: ['id', 'companyId', 'interactionType', 'outcome', 'occurredAt'],
  conversation: ['id', 'companyId', 'channel', 'status', 'startedAt'],
  digitalEvent: ['id', 'companyId', 'eventType', 'channel', 'occurredAt'],
  appNavigation: ['id', 'companyId', 'screen', 'action', 'platform', 'occurredAt'],
  transaction: ['id', 'companyId', 'transactionType', 'channel', 'amount', 'occurredAt'],
  npsResponse: ['id', 'companyId', 'touchpoint', 'score', 'respondedAt'],
};

function isFilled(value: unknown) {
  return value !== null && value !== undefined && value !== '';
}

function ordered(...values: Array<string | null>) {
  const timestamps = values.filter((value): value is string => Boolean(value)).map(Date.parse);
  return timestamps.every((value, index) => index === 0 || value >= timestamps[index - 1]!);
}

function readField(entity: DatasetEntity, field: string) {
  return (entity as unknown as Record<string, unknown>)[field];
}

function isValid(
  entityType: DatasetEntityType,
  entity: DatasetEntity,
  companyIds: ReadonlySet<string>,
): boolean {
  const companyId = readField(entity, 'companyId');
  if (typeof companyId === 'string' && companyIds.size > 0 && !companyIds.has(companyId)) {
    return false;
  }

  switch (entityType) {
    case 'company': {
      const company = entity as Company;
      return (
        /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\*\*$/.test(company.cnpjMasked) &&
        ordered(
          company.leadCreatedAt,
          company.accountOpeningStartedAt,
          company.accountOpenedAt,
          company.onboardingCompletedAt,
        )
      );
    }
    case 'campaign': {
      const campaign = entity as MediaCampaign;
      return campaign.budget > 0 && ordered(campaign.startDate, campaign.endDate);
    }
    case 'touchpoint':
      return (entity as MediaTouchpoint).cost >= 0;
    case 'conversation': {
      const conversation = entity as Conversation;
      return ordered(conversation.startedAt, conversation.resolvedAt);
    }
    case 'companyProduct': {
      const item = entity as CompanyProduct;
      return ordered(item.contractedAt, item.cancelledAt) && item.monthlyRevenueProxy >= 0;
    }
    default:
      return true;
  }
}

/** Profiles the quality of one entity type with deterministic, explainable checks. */
export function profileEntityQuality(
  entityType: DatasetEntityType,
  entities: readonly DatasetEntity[],
  companyIds: ReadonlySet<string>,
): EntityQualityProfile {
  if (entities.length === 0) {
    return { entityType, records: 0, completeness: 0, validity: 0, uniqueness: 0 };
  }

  const required = REQUIRED_FIELDS[entityType] ?? ['id'];
  let filled = 0;
  let valid = 0;
  for (const entity of entities) {
    filled += required.filter((field) => isFilled(readField(entity, field))).length;
    valid += isValid(entityType, entity, companyIds) ? 1 : 0;
  }

  const distinctIds = new Set(entities.map((entity) => entity.id)).size;
  return {
    entityType,
    records: entities.length,
    completeness: filled / (entities.length * required.length),
    validity: valid / entities.length,
    uniqueness: distinctIds / entities.length,
  };
}

const PROFILE_TTL_MS = 5 * 60 * 1000;
const profileCache = new WeakMap<
  DatasetRepository,
  { loadedAt: number; profiles: Map<DatasetEntityType, EntityQualityProfile> }
>();

/** Profiles (and caches) every entity type referenced by the governed data products. */
export async function profileDatasetQuality(
  repository: DatasetRepository,
  entityTypes: readonly DatasetEntityType[],
  nowMs: number,
) {
  const cached = profileCache.get(repository);
  if (cached && nowMs - cached.loadedAt < PROFILE_TTL_MS) {
    const missing = entityTypes.filter((type) => !cached.profiles.has(type));
    if (missing.length === 0) {
      return cached.profiles;
    }
  }

  const companies = await repository.listByType<Company>('company');
  const companyIds = new Set(companies.map((company) => company.id));
  const profiles = new Map<DatasetEntityType, EntityQualityProfile>();

  await Promise.all(
    [...new Set(entityTypes)].map(async (entityType) => {
      const entities =
        entityType === 'company' ? companies : await repository.listByType(entityType);
      profiles.set(entityType, profileEntityQuality(entityType, entities, companyIds));
    }),
  );

  profileCache.set(repository, { loadedAt: nowMs, profiles });
  return profiles;
}
