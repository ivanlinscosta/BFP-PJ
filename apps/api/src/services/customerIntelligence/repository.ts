import fs from 'node:fs';
import path from 'node:path';
import {
  BatchWriteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  type BatchWriteCommandInput,
  type BatchWriteCommandOutput,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';

type WriteRequests = NonNullable<BatchWriteCommandInput['RequestItems']>;
import type {
  CustomerIntelligenceProfile,
  DnaDimensionId,
  RecommendationOutcome,
} from '@bfp/customer-intelligence';
import { DNA_DIMENSIONS } from '@bfp/customer-intelligence';

/**
 * Compact per-customer row used by clusters and similarity (the full profile is ~20 KB; this
 * summary is a few hundred bytes so a whole population can be scanned quickly).
 */
export interface CustomerIntelligenceSummary {
  customerId: string;
  tradeName: string;
  segment: string;
  industry: string;
  companySize: string;
  state: string;
  region: string;
  dna: Record<DnaDimensionId, number>;
  topActionId: string;
  topActionName: string;
  topScore: number;
  topConfidence: number;
  signalTypes: string[];
  updatedAt: string;
}

export function summarize(profile: CustomerIntelligenceProfile): CustomerIntelligenceSummary {
  const top = profile.recommendations[0];
  return {
    customerId: profile.customerId,
    tradeName: profile.identity.tradeName,
    segment: profile.identity.segment,
    industry: profile.identity.industry,
    companySize: profile.identity.companySize,
    state: profile.identity.state,
    region: profile.identity.region,
    dna: Object.fromEntries(DNA_DIMENSIONS.map((id) => [id, profile.dna[id].score])) as Record<
      DnaDimensionId,
      number
    >,
    topActionId: top?.actionId ?? 'NO_ACTION',
    topActionName: top?.actionName ?? 'Não abordar agora',
    topScore: top?.score ?? 0,
    topConfidence: top?.confidence ?? 0,
    signalTypes: profile.signals.map((signal) => signal.type),
    updatedAt: profile.updatedAt,
  };
}

/** Read model of the Customer Intelligence profile (materialized by the rebuild). */
export interface CustomerIntelligenceRepository {
  getProfile(customerId: string): Promise<CustomerIntelligenceProfile | undefined>;
  getProfiles(customerIds: readonly string[]): Promise<CustomerIntelligenceProfile[]>;
  listSummaries(): Promise<CustomerIntelligenceSummary[]>;
  putProfiles(profiles: CustomerIntelligenceProfile[]): Promise<void>;
}

/** Operational feedback of recommendations (viewed, accepted, dismissed, activated…). */
export interface RecommendationOutcomeRepository {
  put(outcome: RecommendationOutcome): Promise<void>;
  listByCustomer(customerId: string): Promise<RecommendationOutcome[]>;
}

export class InMemoryCustomerIntelligenceRepository implements CustomerIntelligenceRepository {
  private readonly profiles = new Map<string, CustomerIntelligenceProfile>();
  private summaries: CustomerIntelligenceSummary[] | null = null;

  constructor(profiles: CustomerIntelligenceProfile[] = []) {
    for (const profile of profiles) this.profiles.set(profile.customerId, profile);
  }

  async getProfile(customerId: string) {
    return this.profiles.get(customerId);
  }

  async getProfiles(customerIds: readonly string[]) {
    return customerIds.flatMap((id) => {
      const profile = this.profiles.get(id);
      return profile ? [profile] : [];
    });
  }

  async listSummaries() {
    this.summaries ??= [...this.profiles.values()].map(summarize);
    return this.summaries;
  }

  async putProfiles(profiles: CustomerIntelligenceProfile[]) {
    for (const profile of profiles) this.profiles.set(profile.customerId, profile);
    this.summaries = null;
  }
}

export class InMemoryRecommendationOutcomeRepository implements RecommendationOutcomeRepository {
  private readonly outcomes: RecommendationOutcome[] = [];

  async put(outcome: RecommendationOutcome) {
    this.outcomes.push(outcome);
  }

  async listByCustomer(customerId: string) {
    return this.outcomes
      .filter((outcome) => outcome.customerId === customerId)
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
  }
}

const PROFILE_PK = 'INTEL#PROFILE';
const SUMMARY_PK = 'INTEL#SUMMARY';
const outcomePk = (customerId: string) => `INTEL#OUTCOME#${customerId}`;

/** DynamoDB implementation on the existing dataset table (single-table, `INTEL#` partitions). */
export class DynamoCustomerIntelligenceRepository implements CustomerIntelligenceRepository {
  private summaryCache: { loadedAt: number; items: CustomerIntelligenceSummary[] } | null = null;

  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async getProfile(customerId: string) {
    const response = await this.client.send(
      new GetCommand({ TableName: this.tableName, Key: { PK: PROFILE_PK, SK: customerId } }),
    );
    return response.Item?.profile as CustomerIntelligenceProfile | undefined;
  }

  async getProfiles(customerIds: readonly string[]) {
    const profiles = await Promise.all(customerIds.map((id) => this.getProfile(id)));
    return profiles.filter((profile): profile is CustomerIntelligenceProfile => Boolean(profile));
  }

  async listSummaries() {
    if (this.summaryCache && Date.now() - this.summaryCache.loadedAt < 5 * 60_000) {
      return this.summaryCache.items;
    }
    const items: CustomerIntelligenceSummary[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const response = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'PK = :pk',
          ExpressionAttributeValues: { ':pk': SUMMARY_PK },
          ExclusiveStartKey: start,
        }),
      );
      for (const item of response.Items ?? [])
        items.push(item.summary as CustomerIntelligenceSummary);
      start = response.LastEvaluatedKey;
    } while (start);
    this.summaryCache = { loadedAt: Date.now(), items };
    return items;
  }

  async putProfiles(profiles: CustomerIntelligenceProfile[]) {
    const requests = profiles.flatMap((profile) => [
      { PutRequest: { Item: { PK: PROFILE_PK, SK: profile.customerId, profile } } },
      {
        PutRequest: {
          Item: { PK: SUMMARY_PK, SK: profile.customerId, summary: summarize(profile) },
        },
      },
    ]);
    for (let index = 0; index < requests.length; index += 25) {
      let pending: WriteRequests | undefined = {
        [this.tableName]: requests.slice(index, index + 25),
      };
      for (
        let attempt = 0;
        pending && Object.keys(pending).length > 0 && attempt < 8;
        attempt += 1
      ) {
        const response: BatchWriteCommandOutput = await this.client.send(
          new BatchWriteCommand({ RequestItems: pending }),
        );
        pending = response.UnprocessedItems;
        if (pending && Object.keys(pending).length > 0)
          await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
      }
    }
    this.summaryCache = null;
  }
}

export class DynamoRecommendationOutcomeRepository implements RecommendationOutcomeRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async put(outcome: RecommendationOutcome) {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: outcomePk(outcome.customerId),
          SK: `${outcome.timestamp}#${outcome.recommendationId}#${outcome.status}`,
          outcome,
        },
      }),
    );
  }

  async listByCustomer(customerId: string) {
    const response = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': outcomePk(customerId) },
        ScanIndexForward: false,
        Limit: 100,
      }),
    );
    return (response.Items ?? []).map((item) => item.outcome as RecommendationOutcome);
  }
}

let cachedLocalProfiles: CustomerIntelligenceProfile[] | null = null;

/** Local development: profiles materialized by `npm run intelligence:rebuild`. */
export function loadLocalProfiles(dataPath: string): CustomerIntelligenceProfile[] {
  if (cachedLocalProfiles) return cachedLocalProfiles;
  const directory = path.dirname(dataPath);
  const candidates = [
    path.resolve(process.cwd(), directory, 'customer-intelligence.json'),
    path.resolve(process.cwd(), 'apps/api', directory, 'customer-intelligence.json'),
    path.resolve(process.cwd(), 'data/customer-intelligence.json'),
  ];
  const file = candidates.find((candidate) => fs.existsSync(candidate));
  cachedLocalProfiles = file
    ? (JSON.parse(fs.readFileSync(file, 'utf8')) as CustomerIntelligenceProfile[])
    : [];
  return cachedLocalProfiles;
}
