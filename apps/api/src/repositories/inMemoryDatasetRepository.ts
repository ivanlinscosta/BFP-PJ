import type {
  Account,
  AuditLogEntry,
  Company,
  CompanyProduct,
  Conversation,
  CRMInteraction,
  DatasetBundle,
  DatasetEntity,
  DatasetEntityType,
  DigitalEvent,
  FunnelEvent,
  MediaCampaign,
  MediaTouchpoint,
  Partner,
  Product,
  QualityStatus,
} from '@bfp/domain';
import type { CompanyQueryOptions, DatasetRepository } from './types';

interface IndexedTimelineEntity<TEntity extends DatasetEntity> {
  entityType: DatasetEntityType;
  timestamp: string;
  entity: TEntity;
}

/** In-memory repository backed by the deterministic DatasetBundle artifact. */
export class InMemoryDatasetRepository implements DatasetRepository {
  private readonly byType = new Map<DatasetEntityType, Map<string, DatasetEntity>>();
  private readonly companyTimeline = new Map<string, IndexedTimelineEntity<DatasetEntity>[]>();

  constructor(bundle: DatasetBundle) {
    this.indexCompanies(bundle.companies);
    this.indexItems(
      'partner',
      bundle.partners,
      (item) => item.id,
      (item) => item.companyId,
      (item) => item.joinedAt,
    );
    this.indexItems(
      'account',
      bundle.accounts,
      (item) => item.id,
      (item) => item.companyId,
      (item) => item.openedAt,
    );
    this.indexItems(
      'product',
      bundle.products,
      (item) => item.id,
      () => undefined,
      (item) => item.createdAt,
    );
    this.indexItems(
      'companyProduct',
      bundle.companyProducts,
      (item) => item.id,
      (item) => item.companyId,
      (item) => item.contractedAt,
    );
    this.indexItems(
      'campaign',
      bundle.mediaCampaigns,
      (item) => item.id,
      () => undefined,
      (item) => item.createdAt,
    );
    this.indexItems(
      'touchpoint',
      bundle.mediaTouchpoints,
      (item) => item.id,
      (item) => item.companyId,
      (item) => item.occurredAt,
    );
    this.indexItems(
      'funnelEvent',
      bundle.funnelEvents,
      (item) => item.id,
      (item) => item.companyId,
      (item) => item.occurredAt,
    );
    this.indexItems(
      'crmInteraction',
      bundle.crmInteractions,
      (item) => item.id,
      (item) => item.companyId,
      (item) => item.occurredAt,
    );
    this.indexItems(
      'conversation',
      bundle.conversations,
      (item) => item.id,
      (item) => item.companyId,
      (item) => item.startedAt,
    );
    this.indexItems(
      'digitalEvent',
      bundle.digitalEvents,
      (item) => item.id,
      (item) => item.companyId,
      (item) => item.occurredAt,
    );
    this.indexItems(
      'qualityStatus',
      bundle.qualityStatuses,
      (item) => item.id,
      (item) => item.companyId ?? undefined,
      (item) => item.checkedAt,
    );
    this.indexItems(
      'auditLog',
      bundle.auditLogs,
      (item) => item.id,
      (item) => item.companyId ?? undefined,
      (item) => item.timestamp,
    );
  }

  async getById<TEntity extends DatasetEntity>(entityType: DatasetEntityType, id: string) {
    return this.byType.get(entityType)?.get(id) as TEntity | undefined;
  }

  async listByType<TEntity extends DatasetEntity>(entityType: DatasetEntityType) {
    return [...(this.byType.get(entityType)?.values() ?? [])] as TEntity[];
  }

  async put<TEntity extends DatasetEntity>(entityType: DatasetEntityType, entity: TEntity) {
    this.indexItems(
      entityType,
      [entity],
      (item) => item.id,
      (item) => this.getCompanyId(entityType, item),
      (item) => this.getTimestamp(entityType, item),
    );
  }

  async listByCompany<TEntity extends DatasetEntity>(
    companyId: string,
    options: CompanyQueryOptions = {},
  ) {
    const timeline = this.companyTimeline.get(companyId) ?? [];
    const filtered = timeline.filter((entry) => {
      if (
        options.entityTypes &&
        options.entityTypes.length > 0 &&
        !options.entityTypes.includes(entry.entityType)
      ) {
        return false;
      }

      if (options.from && entry.timestamp < options.from) {
        return false;
      }

      if (options.to && entry.timestamp > options.to) {
        return false;
      }

      return true;
    });

    const limited = options.limit ? filtered.slice(0, options.limit) : filtered;
    return limited.map((entry) => entry.entity) as TEntity[];
  }

  private indexCompanies(companies: Company[]) {
    this.indexItems(
      'company',
      companies,
      (item) => item.id,
      (item) => item.id,
      (item) => item.createdAt,
    );
  }

  private getCompanyId(entityType: DatasetEntityType, item: DatasetEntity) {
    switch (entityType) {
      case 'company':
        return item.id;
      case 'partner':
      case 'account':
      case 'companyProduct':
      case 'touchpoint':
      case 'funnelEvent':
      case 'crmInteraction':
      case 'conversation':
      case 'digitalEvent':
        if ('companyId' in item && typeof item.companyId === 'string') {
          return item.companyId;
        }
        return undefined;
      case 'qualityStatus':
      case 'auditLog':
        return 'companyId' in item ? (item.companyId ?? undefined) : undefined;
      default:
        return undefined;
    }
  }

  private getTimestamp(entityType: DatasetEntityType, item: DatasetEntity) {
    switch (entityType) {
      case 'company':
        return 'createdAt' in item ? item.createdAt : '';
      case 'partner':
        return 'joinedAt' in item ? item.joinedAt : '';
      case 'account':
        return 'openedAt' in item ? item.openedAt : '';
      case 'product':
        return 'createdAt' in item ? item.createdAt : '';
      case 'companyProduct':
        return 'contractedAt' in item ? item.contractedAt : '';
      case 'campaign':
        return 'createdAt' in item ? item.createdAt : '';
      case 'touchpoint':
      case 'funnelEvent':
      case 'crmInteraction':
      case 'digitalEvent':
        return 'occurredAt' in item ? item.occurredAt : '';
      case 'conversation':
        return 'startedAt' in item ? item.startedAt : '';
      case 'qualityStatus':
        return 'checkedAt' in item ? item.checkedAt : '';
      case 'auditLog':
        return 'timestamp' in item ? item.timestamp : '';
    }
  }

  private indexItems<TEntity extends DatasetEntity>(
    entityType: DatasetEntityType,
    items: TEntity[],
    getId: (item: TEntity) => string,
    getCompanyId: (item: TEntity) => string | undefined,
    getTimestamp: (item: TEntity) => string,
  ) {
    const typedItems = this.byType.get(entityType) ?? new Map<string, DatasetEntity>();

    for (const item of items) {
      const id = getId(item);
      typedItems.set(id, item);

      const companyId = getCompanyId(item);
      if (!companyId) {
        continue;
      }

      const timeline = this.companyTimeline.get(companyId) ?? [];
      timeline.push({ entityType, timestamp: getTimestamp(item), entity: item });
      timeline.sort((left, right) => left.timestamp.localeCompare(right.timestamp));
      this.companyTimeline.set(companyId, timeline);
    }

    this.byType.set(entityType, typedItems);
  }
}

/** Creates an empty bundle for local development fallbacks. */
export function createEmptyDatasetBundle(): DatasetBundle {
  return {
    companies: [],
    partners: [],
    accounts: [],
    products: [],
    companyProducts: [],
    mediaCampaigns: [],
    mediaTouchpoints: [],
    funnelEvents: [],
    crmInteractions: [],
    conversations: [],
    digitalEvents: [],
    qualityStatuses: [],
    auditLogs: [],
  };
}

/** Re-exported domain aliases used by tests in this layer. */
export type InMemoryDatasetEntity =
  | Account
  | AuditLogEntry
  | Company
  | CompanyProduct
  | Conversation
  | CRMInteraction
  | DigitalEvent
  | FunnelEvent
  | MediaCampaign
  | MediaTouchpoint
  | Partner
  | Product
  | QualityStatus;
