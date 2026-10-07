import type {
  AnalysisSpec,
  AudienceDefinition,
  DashboardCard,
  DashboardDefinition,
  DemoUser,
  SharingLevel,
} from '@bfp/domain';
import { DEMO_USERS } from '@bfp/domain';
import { withRequiredDatasets } from '@bfp/semantic-layer';
import type { PersistedObject } from '@api/repositories/types';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function user(id: string): DemoUser {
  const found = DEMO_USERS.find((candidate) => candidate.id === id);
  if (!found) {
    throw new Error(`Demo user ${id} not found.`);
  }

  return found;
}

const MARIANA = user('usr-analyst');
const CAMILA = user('usr-admin');
const RAFAEL = user('usr-business');

interface AnalysisSeed {
  id: string;
  owner: DemoUser;
  name: string;
  ageMs: number;
  visibility: SharingLevel;
  spec: Omit<AnalysisSpec, 'id' | 'name' | 'metadata'>;
}

const last90 = { type: 'LAST_N_DAYS', value: 90 } as const;
const stateSP = { field: 'state', operator: 'EQ', value: 'SP' } as const;

const ANALYSES: AnalysisSeed[] = [
  {
    id: 'demo-analysis-conversion-channel',
    owner: MARIANA,
    name: 'Conversão de abertura por canal',
    ageMs: 25 * MINUTE,
    visibility: 'TEAM',
    spec: {
      metrics: [{ id: 'account_conversion_rate' }],
      dimensions: [{ id: 'acquisition_channel' }],
      filters: [stateSP],
      dateRange: last90,
      sorting: [{ field: 'account_conversion_rate', direction: 'DESC' }],
      visualization: { type: 'BAR' },
    },
  },
  {
    id: 'demo-analysis-cac-channel',
    owner: MARIANA,
    name: 'CAC por canal',
    ageMs: 2 * HOUR,
    visibility: 'TEAM',
    spec: {
      metrics: [{ id: 'cac' }],
      dimensions: [{ id: 'acquisition_channel' }],
      filters: [],
      dateRange: last90,
      sorting: [{ field: 'cac', direction: 'ASC' }],
      visualization: { type: 'BAR' },
    },
  },
  {
    id: 'demo-analysis-conversion-size',
    owner: MARIANA,
    name: 'Conversão por canal e porte',
    ageMs: 3 * HOUR,
    visibility: 'TEAM',
    spec: {
      metrics: [{ id: 'account_conversion_rate' }],
      dimensions: [{ id: 'acquisition_channel' }, { id: 'company_size' }],
      filters: [stateSP],
      dateRange: last90,
      visualization: { type: 'HEATMAP' },
    },
  },
  {
    id: 'demo-analysis-accounts-month',
    owner: MARIANA,
    name: 'Contas abertas por mês',
    ageMs: 5 * HOUR,
    visibility: 'TEAM',
    spec: {
      metrics: [{ id: 'accounts_opened' }],
      dimensions: [{ id: 'account_opened_date', granularity: 'month' }],
      filters: [],
      dateRange: { type: 'LAST_N_DAYS', value: 365 },
      visualization: { type: 'LINE' },
    },
  },
  {
    id: 'demo-analysis-spend-campaign',
    owner: MARIANA,
    name: 'Investimento em mídia por campanha',
    ageMs: 2 * HOUR,
    visibility: 'TEAM',
    spec: {
      metrics: [{ id: 'media_spend' }],
      dimensions: [{ id: 'acquisition_campaign' }],
      filters: [],
      dateRange: last90,
      sorting: [{ field: 'media_spend', direction: 'DESC' }],
      limit: 10,
      visualization: { type: 'BAR' },
    },
  },
  {
    id: 'demo-analysis-spend-channel',
    owner: MARIANA,
    name: 'Investimento em mídia por canal',
    ageMs: 6 * HOUR,
    visibility: 'TEAM',
    spec: {
      metrics: [{ id: 'media_spend' }],
      dimensions: [{ id: 'acquisition_channel' }],
      filters: [],
      dateRange: last90,
      visualization: { type: 'BAR' },
    },
  },
  {
    id: 'demo-analysis-new-clients-region',
    owner: MARIANA,
    name: 'Novos clientes PJ por região',
    ageMs: DAY,
    visibility: 'PRIVATE',
    spec: {
      metrics: [{ id: 'new_companies' }],
      dimensions: [{ id: 'region' }],
      filters: [],
      dateRange: last90,
      visualization: { type: 'BAR' },
    },
  },
  {
    id: 'demo-analysis-conversion-by-size',
    owner: MARIANA,
    name: 'Conversão por porte',
    ageMs: DAY + 2 * HOUR,
    visibility: 'PRIVATE',
    spec: {
      metrics: [{ id: 'account_conversion_rate' }],
      dimensions: [{ id: 'company_size' }],
      filters: [],
      dateRange: last90,
      visualization: { type: 'BAR' },
    },
  },
  {
    id: 'demo-analysis-accounts-campaign',
    owner: MARIANA,
    name: 'Contas abertas por campanha',
    ageMs: 3 * DAY,
    visibility: 'TEAM',
    spec: {
      metrics: [{ id: 'accounts_opened' }],
      dimensions: [{ id: 'acquisition_campaign' }],
      filters: [],
      dateRange: last90,
      sorting: [{ field: 'accounts_opened', direction: 'DESC' }],
      limit: 10,
      visualization: { type: 'BAR' },
    },
  },
  {
    id: 'demo-analysis-activation-segment',
    owner: RAFAEL,
    name: 'Ativação D30 por segmento',
    ageMs: DAY,
    visibility: 'READ_ONLY',
    spec: {
      metrics: [{ id: 'activation_d30_rate' }],
      dimensions: [{ id: 'segment' }],
      filters: [],
      dateRange: last90,
      visualization: { type: 'BAR' },
    },
  },
  {
    id: 'demo-analysis-accounts-channel',
    owner: RAFAEL,
    name: 'Contas abertas por canal',
    ageMs: DAY + HOUR,
    visibility: 'READ_ONLY',
    spec: {
      metrics: [{ id: 'accounts_opened' }],
      dimensions: [{ id: 'acquisition_channel' }],
      filters: [],
      dateRange: last90,
      visualization: { type: 'BAR' },
    },
  },
  {
    id: 'demo-analysis-onboarding-month',
    owner: RAFAEL,
    name: 'Onboardings concluídos por mês',
    ageMs: DAY + 3 * HOUR,
    visibility: 'READ_ONLY',
    spec: {
      metrics: [{ id: 'onboarding_completed' }],
      dimensions: [{ id: 'onboarding_completed_date', granularity: 'month' }],
      filters: [],
      dateRange: { type: 'LAST_N_DAYS', value: 365 },
      visualization: { type: 'LINE' },
    },
  },
  {
    id: 'demo-analysis-products-segment',
    owner: CAMILA,
    name: 'Produtos por cliente por segmento',
    ageMs: 2 * DAY,
    visibility: 'READ_ONLY',
    spec: {
      metrics: [{ id: 'products_per_company' }],
      dimensions: [{ id: 'segment' }],
      filters: [],
      dateRange: { type: 'LAST_N_DAYS', value: 365 },
      visualization: { type: 'BAR' },
    },
  },
  {
    id: 'demo-analysis-new-clients-size',
    owner: CAMILA,
    name: 'Novos clientes PJ por porte',
    ageMs: 2 * DAY,
    visibility: 'READ_ONLY',
    spec: {
      metrics: [{ id: 'new_companies' }],
      dimensions: [{ id: 'company_size' }],
      filters: [],
      dateRange: last90,
      visualization: { type: 'BAR' },
    },
  },
  {
    id: 'demo-analysis-active-segment',
    owner: CAMILA,
    name: 'Empresas ativas por segmento',
    ageMs: 2 * DAY + HOUR,
    visibility: 'READ_ONLY',
    spec: {
      metrics: [{ id: 'active_companies' }],
      dimensions: [{ id: 'segment' }],
      filters: [],
      dateRange: { type: 'ALL_TIME' },
      visualization: { type: 'BAR' },
    },
  },
  {
    id: 'demo-analysis-revenue-size',
    owner: CAMILA,
    name: 'Receita proxy por porte',
    ageMs: 2 * DAY + 2 * HOUR,
    visibility: 'READ_ONLY',
    spec: {
      metrics: [{ id: 'revenue_proxy' }],
      dimensions: [{ id: 'company_size' }],
      filters: [],
      dateRange: { type: 'LAST_N_DAYS', value: 365 },
      visualization: { type: 'BAR' },
    },
  },
];

interface DashboardSeed {
  id: string;
  owner: DemoUser;
  name: string;
  description: string;
  ageMs: number;
  visibility: SharingLevel;
  team: string;
  analysisIds: string[];
  favoriteOf: DemoUser[];
}

const DASHBOARDS: DashboardSeed[] = [
  {
    id: 'demo-dashboard-acquisition',
    owner: MARIANA,
    name: 'Aquisição por canal',
    description: 'Conversão e custo para acompanhar a aquisição PJ.',
    ageMs: 25 * MINUTE,
    visibility: 'TEAM',
    team: 'Growth PJ',
    analysisIds: [
      'demo-analysis-conversion-channel',
      'demo-analysis-cac-channel',
      'demo-analysis-conversion-size',
      'demo-analysis-accounts-month',
    ],
    favoriteOf: [MARIANA],
  },
  {
    id: 'demo-dashboard-media',
    owner: MARIANA,
    name: 'Mídia e campanhas',
    description: 'Seus recortes de investimento e CAC por campanha.',
    ageMs: 2 * HOUR,
    visibility: 'TEAM',
    team: 'Growth PJ',
    analysisIds: [
      'demo-analysis-spend-campaign',
      'demo-analysis-cac-channel',
      'demo-analysis-spend-channel',
      'demo-analysis-accounts-campaign',
      'demo-analysis-conversion-channel',
    ],
    favoriteOf: [MARIANA],
  },
  {
    id: 'demo-dashboard-onboarding',
    owner: RAFAEL,
    name: 'Jornada de onboarding',
    description: 'Da abertura à ativação: análises para o time.',
    ageMs: DAY,
    visibility: 'READ_ONLY',
    team: 'Onboarding PJ',
    analysisIds: [
      'demo-analysis-activation-segment',
      'demo-analysis-accounts-channel',
      'demo-analysis-onboarding-month',
    ],
    favoriteOf: [],
  },
  {
    id: 'demo-dashboard-weekly',
    owner: MARIANA,
    name: 'Minha leitura da semana',
    description: 'Uma coleção pessoal para retomar suas perguntas.',
    ageMs: DAY + 30 * MINUTE,
    visibility: 'PRIVATE',
    team: 'Growth PJ',
    analysisIds: [
      'demo-analysis-new-clients-region',
      'demo-analysis-conversion-by-size',
      'demo-analysis-cac-channel',
    ],
    favoriteOf: [],
  },
  {
    id: 'demo-dashboard-customers',
    owner: CAMILA,
    name: 'Clientes PJ por segmento',
    description: 'Recortes da base e de produtos por cliente.',
    ageMs: 2 * DAY,
    visibility: 'READ_ONLY',
    team: 'Clientes PJ',
    analysisIds: [
      'demo-analysis-products-segment',
      'demo-analysis-new-clients-size',
      'demo-analysis-active-segment',
      'demo-analysis-revenue-size',
    ],
    favoriteOf: [MARIANA],
  },
  {
    id: 'demo-dashboard-channels',
    owner: MARIANA,
    name: 'Comparativo de canais',
    description: 'Análises salvas para discutir oportunidades no time.',
    ageMs: 3 * DAY,
    visibility: 'TEAM',
    team: 'Acquisition PJ',
    analysisIds: ['demo-analysis-cac-channel', 'demo-analysis-accounts-campaign'],
    favoriteOf: [],
  },
];

const AUDIENCES: Array<
  Omit<AudienceDefinition, 'createdAt' | 'updatedAt' | 'createdBy' | 'ownerName'> & {
    owner: DemoUser;
    ageMs: number;
  }
> = [
  {
    id: 'demo-audience-working-capital',
    owner: MARIANA,
    ageMs: 3 * HOUR,
    name: 'Oportunidade Capital de Giro — SP',
    description: 'Empresas ativadas em SP sem Capital de Giro contratado.',
    filters: [],
    logicalOperator: 'AND',
    filterGroups: {
      kind: 'group',
      id: 'root',
      operator: 'AND',
      rules: [
        { kind: 'rule', id: 'r-state', field: 'state', operator: 'EQ', value: 'SP' },
        {
          kind: 'rule',
          id: 'r-size',
          field: 'company_size',
          operator: 'IN',
          value: ['Pequena', 'Média'],
        },
        {
          kind: 'rule',
          id: 'r-onboarding',
          field: 'onboarding_status',
          operator: 'EQ',
          value: 'COMPLETED',
        },
        { kind: 'rule', id: 'r-d30', field: 'activation_d30', operator: 'EQ', value: 'YES' },
        {
          kind: 'rule',
          id: 'r-product',
          field: 'product',
          operator: 'NOT_IN',
          value: ['Capital de Giro'],
        },
      ],
    },
    status: 'READY',
  },
  {
    id: 'demo-audience-meta-reactivation',
    owner: MARIANA,
    ageMs: 2 * DAY,
    name: 'Reengajamento Meta — onboarding pendente',
    description: 'Empresas vindas de Meta que abriram conta e não concluíram o onboarding.',
    filters: [],
    logicalOperator: 'AND',
    filterGroups: {
      kind: 'group',
      id: 'root',
      operator: 'AND',
      rules: [
        {
          kind: 'rule',
          id: 'r-channel',
          field: 'acquisition_channel',
          operator: 'EQ',
          value: 'META',
        },
        {
          kind: 'rule',
          id: 'r-onboarding',
          field: 'onboarding_status',
          operator: 'EQ',
          value: 'IN_PROGRESS',
        },
      ],
    },
    status: 'ACTIVATED',
    lastDestination: 'MEDIA',
  },
];

function cards(analysisIds: string[]): DashboardCard[] {
  return analysisIds.map((analysisId, index) => {
    const analysis = ANALYSES.find((candidate) => candidate.id === analysisId);
    return {
      id: `card-${index + 1}`,
      title: analysis?.name ?? 'Análise',
      analysisId,
      layout: { mode: 'GRID', x: (index % 2) * 6, y: Math.floor(index / 2) * 4, w: 6, h: 4 },
    };
  });
}

/** Builds the demo workspace persisted objects relative to the current clock. */
export function buildDemoWorkspace(now: Date): Array<PersistedObject<unknown>> {
  const at = (ageMs: number) => new Date(now.getTime() - ageMs).toISOString();
  const objects: Array<PersistedObject<unknown>> = [];

  for (const seed of ANALYSES) {
    const value: AnalysisSpec = {
      ...withRequiredDatasets(seed.spec),
      id: seed.id,
      name: seed.name,
      metadata: {
        createdBy: seed.owner.id,
        createdAt: at(seed.ageMs + DAY),
        updatedAt: at(seed.ageMs),
        visibility: seed.visibility,
        ownerName: seed.owner.name,
        team: seed.owner.team,
      },
    };
    objects.push({
      userId: seed.owner.id,
      type: 'analysis',
      id: seed.id,
      value,
      shared: seed.visibility !== 'PRIVATE',
    });
  }

  for (const seed of DASHBOARDS) {
    const value: DashboardDefinition = {
      id: seed.id,
      name: seed.name,
      description: seed.description,
      cards: cards(seed.analysisIds),
      visibility: seed.visibility,
      team: seed.team,
      ownerName: seed.owner.name,
      createdBy: seed.owner.id,
      createdAt: at(seed.ageMs + 7 * DAY),
      updatedAt: at(seed.ageMs),
    };
    objects.push({
      userId: seed.owner.id,
      type: 'dashboard',
      id: seed.id,
      value,
      shared: seed.visibility !== 'PRIVATE',
    });

    for (const fan of seed.favoriteOf) {
      objects.push({
        userId: fan.id,
        type: 'favorite',
        id: `dashboard:${seed.id}`,
        value: { targetId: seed.id, targetType: 'dashboard' },
      });
    }
  }

  for (const { owner, ageMs, ...audience } of AUDIENCES) {
    const value: AudienceDefinition = {
      ...audience,
      createdBy: owner.id,
      ownerName: owner.name,
      createdAt: at(ageMs + DAY),
      updatedAt: at(ageMs),
    };
    objects.push({ userId: owner.id, type: 'audience', id: audience.id, value });
  }

  return objects;
}

/** Ids of every seeded analysis, used by tests to validate the workspace against the catalog. */
export const DEMO_ANALYSIS_SPECS = ANALYSES.map((seed) => ({
  id: seed.id,
  spec: withRequiredDatasets(seed.spec),
}));
