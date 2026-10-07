import { QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { DatasetBundle } from '@bfp/domain';
import { loadConfig } from '@api/common/config';
import { DynamoDatasetRepository } from './dynamoDatasetRepository';
import { DynamoObjectRepository } from './dynamoObjectRepository';
import { createRepositories } from './factory';
import { InMemoryDatasetRepository } from './inMemoryDatasetRepository';
import { InMemoryObjectRepository } from './inMemoryObjectRepository';

const datasetBundle: DatasetBundle = {
  companies: [
    {
      id: 'company-1',
      cnpjMasked: '12.345.678/0001-**',
      legalName: 'Empresa Exemplo LTDA',
      tradeName: 'Empresa Exemplo',
      segment: 'Serviços',
      industry: 'Tecnologia',
      companySize: 'Pequena',
      state: 'SP',
      city: 'São Paulo',
      region: 'Sudeste',
      employeeCountRange: '11-50',
      annualRevenueRange: '360K_A_4_8M',
      acquisitionSource: 'PAID',
      acquisitionChannel: 'GOOGLE_SEARCH',
      acquisitionCampaignId: 'campaign-1',
      leadCreatedAt: '2026-01-01T00:00:00.000Z',
      accountOpeningStartedAt: '2026-01-02T00:00:00.000Z',
      accountOpenedAt: '2026-01-03T00:00:00.000Z',
      onboardingStartedAt: '2026-01-04T00:00:00.000Z',
      onboardingCompletedAt: '2026-01-05T00:00:00.000Z',
      activationDate: '2026-01-10T00:00:00.000Z',
      status: 'ACTIVE',
      relationshipManagerId: 'rm-1',
      lgpdConsent: true,
      riskProfile: 'LOW',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  partners: [
    {
      id: 'partner-1',
      companyId: 'company-1',
      name: 'Maria Silva',
      role: 'OWNER',
      ownershipPercentage: 100,
      ageRange: '36-45',
      state: 'SP',
      joinedAt: '2026-01-01T12:00:00.000Z',
    },
  ],
  accounts: [
    {
      id: 'account-1',
      companyId: 'company-1',
      provider: 'BFP Bank',
      type: 'CHECKING',
      status: 'OPEN',
      accountNumberMasked: '****1234',
      openedAt: '2026-01-03T00:00:00.000Z',
      createdAt: '2026-01-02T00:00:00.000Z',
      closedAt: null,
    },
  ],
  products: [
    {
      id: 'product-1',
      name: 'Conta PJ',
      shortName: 'Conta',
      category: 'BANKING',
      status: 'ACTIVE',
      monthlyBasePrice: 0,
      isCoreProduct: true,
      createdAt: '2025-12-01T00:00:00.000Z',
    },
  ],
  companyProducts: [
    {
      id: 'company-product-1',
      companyId: 'company-1',
      productId: 'product-1',
      status: 'ACTIVE',
      contractedAt: '2026-01-06T00:00:00.000Z',
      activatedAt: '2026-01-06T12:00:00.000Z',
      cancelledAt: null,
      monthlyRevenueProxy: 120,
    },
  ],
  mediaCampaigns: [
    {
      id: 'campaign-1',
      name: 'Search Janeiro',
      channel: 'GOOGLE_SEARCH',
      source: 'PAID',
      objective: 'LEAD_GENERATION',
      budget: 10000,
      status: 'ACTIVE',
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-01-31T23:59:59.999Z',
      createdAt: '2025-12-15T00:00:00.000Z',
    },
  ],
  mediaTouchpoints: [
    {
      id: 'touchpoint-1',
      companyId: 'company-1',
      campaignId: 'campaign-1',
      channel: 'GOOGLE_SEARCH',
      touchpointType: 'CLICK',
      occurredAt: '2026-01-01T08:00:00.000Z',
      cost: 15,
      impressions: 120,
      clicks: 1,
    },
  ],
  funnelEvents: [
    {
      id: 'funnel-1',
      companyId: 'company-1',
      eventType: 'ACCOUNT_OPENED',
      occurredAt: '2026-01-03T06:00:00.000Z',
      sourceChannel: 'GOOGLE_SEARCH',
      campaignId: 'campaign-1',
    },
  ],
  crmInteractions: [
    {
      id: 'crm-1',
      companyId: 'company-1',
      interactionType: 'CALL',
      direction: 'OUTBOUND',
      outcome: 'CONNECTED',
      occurredAt: '2026-01-04T09:00:00.000Z',
      ownerId: 'rm-1',
      relatedConversationId: null,
    },
  ],
  conversations: [
    {
      id: 'conversation-1',
      companyId: 'company-1',
      channel: 'WHATSAPP',
      status: 'OPEN',
      subject: 'Dúvida sobre onboarding',
      startedAt: '2026-01-04T10:00:00.000Z',
      resolvedAt: null,
      ownerId: 'rm-1',
      messageCount: 3,
    },
  ],
  digitalEvents: [
    {
      id: 'digital-1',
      companyId: 'company-1',
      eventType: 'LOGIN',
      channel: 'WEB',
      productId: 'product-1',
      occurredAt: '2026-01-10T08:00:00.000Z',
      sessionId: 'session-1',
      value: null,
    },
  ],
  qualityStatuses: [
    {
      id: 'quality-1',
      companyId: 'company-1',
      scopeType: 'company',
      scopeId: 'company-1',
      status: 'HEALTHY',
      score: 0.99,
      checkedAt: '2026-01-10T09:00:00.000Z',
      summary: 'Tudo ok',
      incidents: [],
    },
  ],
  auditLogs: [
    {
      id: 'audit-1',
      queryId: 'query-1',
      userId: 'usr-admin',
      companyId: 'company-1',
      timestamp: '2026-01-10T09:30:00.000Z',
      metrics: ['cac'],
      dimensions: ['acquisition_channel'],
      filters: [],
      executionMs: 42,
      status: 'SUCCESS',
    },
  ],
};

function createMockClient(items: Array<Record<string, unknown>> = []) {
  const commands: object[] = [];

  return {
    commands,
    send: vi.fn(async (command: object) => {
      commands.push(command);
      return { Items: items };
    }),
  };
}

describe('repositories', () => {
  it('loads dataset entities from the in-memory bundle', async () => {
    const repository = new InMemoryDatasetRepository(datasetBundle);

    const company = await repository.getById<(typeof datasetBundle.companies)[number]>(
      'company',
      'company-1',
    );
    const products = await repository.listByType('product');
    const timeline = await repository.listByCompany('company-1');
    const touchpointsOnly = await repository.listByCompany('company-1', {
      entityTypes: ['touchpoint', 'conversation'],
    });
    const januaryWindow = await repository.listByCompany('company-1', {
      from: '2026-01-04T00:00:00.000Z',
      to: '2026-01-04T23:59:59.999Z',
    });

    expect(company?.tradeName).toBe('Empresa Exemplo');
    expect(products).toHaveLength(1);
    expect(timeline.map((item) => ('id' in item ? item.id : 'unknown'))).toContain(
      'conversation-1',
    );
    expect(touchpointsOnly).toHaveLength(2);
    expect(januaryWindow.map((item) => ('id' in item ? item.id : 'unknown'))).toEqual([
      'crm-1',
      'conversation-1',
    ]);
  });

  it('stores and queries user objects in memory', async () => {
    const repository = new InMemoryObjectRepository();
    await repository.put({
      userId: 'usr-1',
      type: 'analysis',
      id: 'analysis-1',
      value: { name: 'A1' },
    });
    await repository.put({
      userId: 'usr-1',
      type: 'analysis',
      id: 'analysis-2',
      value: { name: 'A2' },
    });
    await repository.put({
      userId: 'usr-2',
      type: 'analysis',
      id: 'analysis-1',
      value: { name: 'B1' },
    });

    const one = await repository.get<{ name: string }>('usr-1', 'analysis', 'analysis-1');
    const userObjects = await repository.listByType<{ name: string }>('usr-1', 'analysis');
    const allById = await repository.findById<{ name: string }>('analysis-1');

    expect(one?.value.name).toBe('A1');
    expect(userObjects).toHaveLength(2);
    expect(allById).toHaveLength(2);
  });

  it('declares only the attribute names a company query uses (no date range)', async () => {
    const client = createMockClient([{ document: datasetBundle.companies[0] }]);
    const repository = new DynamoDatasetRepository(client, 'bfp-dev-dataset');

    await repository.listByCompany('company-1');

    const command = client.commands[0];
    expect(command).toBeInstanceOf(QueryCommand);
    if (command instanceof QueryCommand) {
      expect(command.input.KeyConditionExpression).toBe('#gsi1pk = :gsi1pk');
      expect(command.input.ExpressionAttributeNames).toEqual({ '#gsi1pk': 'GSI1PK' });
    }
  });

  it('builds QueryCommand shapes for dataset lookups in DynamoDB', async () => {
    const client = createMockClient([{ document: datasetBundle.companies[0] }]);
    const repository = new DynamoDatasetRepository(client, 'bfp-dev-dataset');

    await repository.getById('company', 'company-1');
    await repository.listByType('product');
    await repository.listByCompany('company-1', {
      entityTypes: ['touchpoint', 'conversation'],
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-31T23:59:59.999Z',
      limit: 25,
    });

    const getCommand = client.commands[0];
    const listCommand = client.commands[1];
    const companyCommand = client.commands[2];

    expect(getCommand).toBeInstanceOf(QueryCommand);
    expect(listCommand).toBeInstanceOf(QueryCommand);
    expect(companyCommand).toBeInstanceOf(QueryCommand);

    if (
      getCommand instanceof QueryCommand &&
      listCommand instanceof QueryCommand &&
      companyCommand instanceof QueryCommand
    ) {
      expect(getCommand.input).toMatchObject({
        TableName: 'bfp-dev-dataset',
        KeyConditionExpression: '#pk = :pk AND #sk = :sk',
        ExpressionAttributeValues: { ':pk': 'ENTITY#company', ':sk': 'company-1' },
      });
      expect(listCommand.input).toMatchObject({
        TableName: 'bfp-dev-dataset',
        KeyConditionExpression: '#pk = :pk',
        ExpressionAttributeValues: { ':pk': 'ENTITY#product' },
      });
      expect(companyCommand.input).toMatchObject({
        TableName: 'bfp-dev-dataset',
        IndexName: 'GSI1',
        KeyConditionExpression: '#gsi1pk = :gsi1pk AND #gsi1sk BETWEEN :from AND :to',
        FilterExpression: '#entityType IN (:entityType0, :entityType1)',
        Limit: 25,
      });
      expect(companyCommand.input.ExpressionAttributeValues).toMatchObject({
        ':gsi1pk': 'COMPANY#company-1',
        ':from': '2026-01-01T00:00:00.000Z#',
        ':to': '2026-01-31T23:59:59.999Z~',
        ':entityType0': 'touchpoint',
        ':entityType1': 'conversation',
      });
    }
  });

  it('builds QueryCommand and PutCommand shapes for user objects in DynamoDB', async () => {
    const client = createMockClient([
      { userId: 'usr-1', type: 'analysis', id: 'analysis-1', value: { name: 'A1' } },
    ]);
    const repository = new DynamoObjectRepository(client, 'bfp-dev-objects');

    await repository.get('usr-1', 'analysis', 'analysis-1');
    await repository.listByType('usr-1', 'analysis');
    await repository.findById('analysis-1');
    await repository.put({
      userId: 'usr-1',
      type: 'analysis',
      id: 'analysis-1',
      value: { name: 'A1' },
    });

    const getCommand = client.commands[0];
    const listCommand = client.commands[1];
    const findCommand = client.commands[2];
    const putCommand = client.commands[3];

    expect(getCommand).toBeInstanceOf(QueryCommand);
    expect(listCommand).toBeInstanceOf(QueryCommand);
    expect(findCommand).toBeInstanceOf(QueryCommand);
    expect(putCommand).toBeInstanceOf(PutCommand);

    if (
      getCommand instanceof QueryCommand &&
      listCommand instanceof QueryCommand &&
      findCommand instanceof QueryCommand &&
      putCommand instanceof PutCommand
    ) {
      expect(getCommand.input.ExpressionAttributeValues).toMatchObject({
        ':pk': 'USER#usr-1',
        ':sk': 'analysis#analysis-1',
      });
      expect(listCommand.input.KeyConditionExpression).toBe(
        '#pk = :pk AND begins_with(#sk, :skPrefix)',
      );
      expect(findCommand.input).toMatchObject({
        TableName: 'bfp-dev-objects',
        IndexName: 'GSI1',
        KeyConditionExpression: '#gsi1pk = :gsi1pk',
      });
      expect(putCommand.input.Item).toMatchObject({
        PK: 'USER#usr-1',
        SK: 'analysis#analysis-1',
        GSI1PK: 'ID#analysis-1',
        GSI1SK: 'USER#usr-1',
      });
    }
  });

  it('selects the correct repository implementation in the factory', () => {
    const inMemoryRepositories = createRepositories({ env: { NODE_ENV: 'test' }, datasetBundle });
    const dynamoRepositories = createRepositories({
      env: {
        NODE_ENV: 'test',
        DYNAMODB_TABLE_DATASET: 'dataset-table',
        DYNAMODB_TABLE_OBJECTS: 'objects-table',
      },
      config: loadConfig({
        NODE_ENV: 'test',
        DYNAMODB_TABLE_DATASET: 'dataset-table',
        DYNAMODB_TABLE_OBJECTS: 'objects-table',
      }),
      datasetClient: createMockClient(),
      objectClient: createMockClient(),
    });

    expect(inMemoryRepositories.datasetRepository).toBeInstanceOf(InMemoryDatasetRepository);
    expect(inMemoryRepositories.objectRepository).toBeInstanceOf(InMemoryObjectRepository);
    expect(dynamoRepositories.datasetRepository).toBeInstanceOf(DynamoDatasetRepository);
    expect(dynamoRepositories.objectRepository).toBeInstanceOf(DynamoObjectRepository);
  });
});
