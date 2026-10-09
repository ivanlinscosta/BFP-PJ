import type {
  AcquisitionChannel,
  AppAction,
  AppScreen,
  NpsTouchpoint,
  TransactionType,
  AcquisitionSource,
  AgeRange,
  AnnualRevenueRange,
  CampaignChannel,
  CampaignObjective,
  CampaignSource,
  CompanySize,
  ConversationChannel,
  CRMInteractionOutcome,
  CRMInteractionType,
  DigitalChannel,
  DigitalEventType,
  EmployeeCountRange,
  PartnerRole,
  ProductCategory,
} from '@bfp/domain';

export const DATASET_SEED = 42;
export const REFERENCE_DATE = '2026-09-30T23:59:59.999Z';
export const HISTORY_START_DATE = '2025-10-01T00:00:00.000Z';

export const BASE_COUNTS = {
  companies: 3000,
  partners: 9000,
  accounts: 3600,
  products: 10,
  companyProducts: 8000,
  mediaCampaigns: 40,
  mediaTouchpoints: 60000,
  funnelEvents: 50000,
  crmInteractions: 12000,
  conversations: 8000,
  digitalEvents: 80000,
  appNavigationEvents: 90000,
  transactions: 45000,
  npsResponses: 5000,
  qualityStatuses: 0,
  auditLogs: 0,
} as const;

export const DATASET_PATH = new URL('../../data/dataset.json', import.meta.url);

export const MANAGER_IDS = Array.from(
  { length: 24 },
  (_, index) => `rm-${String(index + 1).padStart(2, '0')}`,
);

export const SEGMENTS = [
  'Varejo',
  'Serviços',
  'Tecnologia',
  'Saúde',
  'Logística',
  'Educação',
  'Construção',
  'Indústria',
  'Alimentação',
  'Agronegócio',
] as const;

export const INDUSTRIES_BY_SEGMENT: Record<(typeof SEGMENTS)[number], readonly string[]> = {
  Varejo: ['Moda', 'Casa & Decoração', 'Farmácia', 'Autopeças'],
  Serviços: ['Consultoria', 'Facilities', 'Jurídico', 'Contabilidade'],
  Tecnologia: ['SaaS B2B', 'Software House', 'Marketplace', 'Cibersegurança'],
  Saúde: ['Clínicas', 'Laboratórios', 'Odontologia', 'Telemedicina'],
  Logística: ['Transportes', 'Last Mile', 'Armazenagem', 'Frete Fracionado'],
  Educação: ['EdTech', 'Cursos Livres', 'Ensino Profissionalizante', 'Treinamento Corporativo'],
  Construção: ['Materiais', 'Engenharia', 'Reformas', 'Incorporação'],
  Indústria: ['Metalurgia', 'Alimentos', 'Têxtil', 'Plásticos'],
  Alimentação: ['Restaurantes', 'Food Service', 'Distribuição', 'Padarias'],
  Agronegócio: ['Insumos', 'Produção Rural', 'Distribuição', 'AgTech'],
};

export const COMPANY_SIZE_TO_EMPLOYEE_RANGE: Record<CompanySize, readonly EmployeeCountRange[]> = {
  MEI: ['1-5'],
  Micro: ['1-5', '6-10'],
  Pequena: ['6-10', '11-50'],
  Média: ['11-50', '51-200', '201-500'],
  Grande: ['201-500', '500+'],
};

export const COMPANY_SIZE_TO_REVENUE_RANGE: Record<CompanySize, readonly AnnualRevenueRange[]> = {
  MEI: ['ATE_360K'],
  Micro: ['ATE_360K', '360K_A_4_8M'],
  Pequena: ['360K_A_4_8M', '4_8M_A_50M'],
  Média: ['4_8M_A_50M', '50M_A_300M'],
  Grande: ['50M_A_300M', 'ACIMA_300M'],
};

export const CHANNEL_TO_SOURCE: Record<AcquisitionChannel, AcquisitionSource> = {
  GOOGLE_SEARCH: 'PAID',
  LINKEDIN: 'PAID',
  META: 'PAID',
  ORGANIC: 'ORGANIC',
  REFERRAL: 'REFERRAL',
  EMAIL: 'OUTBOUND',
  INSIDE_SALES: 'OUTBOUND',
};

export const CAMPAIGNABLE_CHANNELS: readonly CampaignChannel[] = [
  'GOOGLE_SEARCH',
  'LINKEDIN',
  'META',
  'ORGANIC',
  'EMAIL',
];

export const CHANNEL_PROFILES = {
  GOOGLE_SEARCH: {
    companyWeight: 25,
    companySizes: [
      ['MEI', 12],
      ['Micro', 30],
      ['Pequena', 34],
      ['Média', 20],
      ['Grande', 4],
    ] as const,
    qualifyRate: 0.88,
    accountOpeningRate: 0.8,
    accountOpenedRate: 0.7,
    onboardingCompletedRate: 0.68,
    activationBase: 0.5,
    churnRate: 0.07,
    touchpointWeight: 32,
    touchpointCost: 12,
  },
  LINKEDIN: {
    companyWeight: 9,
    companySizes: [
      ['MEI', 2],
      ['Micro', 10],
      ['Pequena', 24],
      ['Média', 42],
      ['Grande', 22],
    ] as const,
    qualifyRate: 0.86,
    accountOpeningRate: 0.82,
    accountOpenedRate: 0.68,
    onboardingCompletedRate: 0.62,
    activationBase: 0.48,
    churnRate: 0.05,
    touchpointWeight: 18,
    touchpointCost: 32,
  },
  META: {
    companyWeight: 30,
    companySizes: [
      ['MEI', 22],
      ['Micro', 34],
      ['Pequena', 28],
      ['Média', 13],
      ['Grande', 3],
    ] as const,
    qualifyRate: 0.8,
    accountOpeningRate: 0.74,
    accountOpenedRate: 0.54,
    onboardingCompletedRate: 0.47,
    activationBase: 0.34,
    churnRate: 0.09,
    touchpointWeight: 40,
    touchpointCost: 9,
  },
  ORGANIC: {
    companyWeight: 6,
    companySizes: [
      ['MEI', 10],
      ['Micro', 26],
      ['Pequena', 34],
      ['Média', 22],
      ['Grande', 8],
    ] as const,
    qualifyRate: 0.92,
    accountOpeningRate: 0.86,
    accountOpenedRate: 0.76,
    onboardingCompletedRate: 0.73,
    activationBase: 0.56,
    churnRate: 0.05,
    touchpointWeight: 10,
    touchpointCost: 0.8,
  },
  REFERRAL: {
    companyWeight: 11,
    companySizes: [
      ['MEI', 6],
      ['Micro', 22],
      ['Pequena', 34],
      ['Média', 26],
      ['Grande', 12],
    ] as const,
    qualifyRate: 0.9,
    accountOpeningRate: 0.82,
    accountOpenedRate: 0.71,
    onboardingCompletedRate: 0.65,
    activationBase: 0.49,
    churnRate: 0.05,
    touchpointWeight: 0,
    touchpointCost: 0,
  },
  EMAIL: {
    companyWeight: 3,
    companySizes: [
      ['MEI', 8],
      ['Micro', 24],
      ['Pequena', 33],
      ['Média', 25],
      ['Grande', 10],
    ] as const,
    qualifyRate: 0.78,
    accountOpeningRate: 0.74,
    accountOpenedRate: 0.61,
    onboardingCompletedRate: 0.53,
    activationBase: 0.41,
    churnRate: 0.07,
    touchpointWeight: 14,
    touchpointCost: 5,
  },
  INSIDE_SALES: {
    companyWeight: 16,
    companySizes: [
      ['MEI', 4],
      ['Micro', 16],
      ['Pequena', 36],
      ['Média', 30],
      ['Grande', 14],
    ] as const,
    qualifyRate: 0.76,
    accountOpeningRate: 0.72,
    accountOpenedRate: 0.63,
    onboardingCompletedRate: 0.58,
    activationBase: 0.42,
    churnRate: 0.06,
    touchpointWeight: 0,
    touchpointCost: 0,
  },
} satisfies Record<
  AcquisitionChannel,
  {
    companyWeight: number;
    companySizes: readonly (readonly [CompanySize, number])[];
    qualifyRate: number;
    accountOpeningRate: number;
    accountOpenedRate: number;
    onboardingCompletedRate: number;
    activationBase: number;
    churnRate: number;
    touchpointWeight: number;
    touchpointCost: number;
  }
>;

/**
 * Lead → account conversion targets per channel. The generator adds non-converting prospect
 * leads until each channel reaches its target, producing realistic funnel ratios.
 */
export const LEAD_CONVERSION_TARGETS: Record<AcquisitionChannel, number> = {
  GOOGLE_SEARCH: 0.148,
  ORGANIC: 0.136,
  REFERRAL: 0.121,
  META: 0.097,
  LINKEDIN: 0.084,
  EMAIL: 0.072,
  INSIDE_SALES: 0.068,
};

/** Smaller companies drop out of the funnel more often, so they are over-represented in prospects. */
export const PROSPECT_SIZE_FACTORS: Record<CompanySize, number> = {
  MEI: 1.45,
  Micro: 1.25,
  Pequena: 1.08,
  Média: 0.78,
  Grande: 1.02,
};

export const PRODUCT_CATALOG: ReadonlyArray<{
  id: string;
  name: string;
  shortName: string;
  category: ProductCategory;
  monthlyBasePrice: number;
  isCoreProduct: boolean;
}> = [
  {
    id: 'product-001',
    name: 'Conta PJ Completa',
    shortName: 'Conta PJ',
    category: 'BANKING',
    monthlyBasePrice: 0,
    isCoreProduct: true,
  },
  {
    id: 'product-002',
    name: 'Cartão Empresarial',
    shortName: 'Cartão PJ',
    category: 'PAYMENTS',
    monthlyBasePrice: 39,
    isCoreProduct: true,
  },
  {
    id: 'product-003',
    name: 'Pix Cobrança',
    shortName: 'Pix',
    category: 'PAYMENTS',
    monthlyBasePrice: 29,
    isCoreProduct: true,
  },
  {
    id: 'product-004',
    name: 'Antecipação de Recebíveis',
    shortName: 'Antecipação',
    category: 'CREDIT',
    monthlyBasePrice: 149,
    isCoreProduct: false,
  },
  {
    id: 'product-005',
    name: 'Capital de Giro Flex',
    shortName: 'Capital de Giro',
    category: 'CREDIT',
    monthlyBasePrice: 189,
    isCoreProduct: false,
  },
  {
    id: 'product-006',
    name: 'Folha e Benefícios',
    shortName: 'Benefícios',
    category: 'BENEFITS',
    monthlyBasePrice: 99,
    isCoreProduct: false,
  },
  {
    id: 'product-007',
    name: 'Seguro Empresarial',
    shortName: 'Seguro',
    category: 'INSURANCE',
    monthlyBasePrice: 129,
    isCoreProduct: false,
  },
  {
    id: 'product-008',
    name: 'Gateway de Pagamentos',
    shortName: 'Gateway',
    category: 'PAYMENTS',
    monthlyBasePrice: 159,
    isCoreProduct: false,
  },
  {
    id: 'product-009',
    name: 'Conta Escrow B2B',
    shortName: 'Escrow',
    category: 'BANKING',
    monthlyBasePrice: 119,
    isCoreProduct: false,
  },
  {
    id: 'product-010',
    name: 'Gestão Financeira Assistida',
    shortName: 'Gestão',
    category: 'BANKING',
    monthlyBasePrice: 89,
    isCoreProduct: false,
  },
];

export const BRAZIL_STATES = [
  {
    state: 'SP',
    region: 'Sudeste',
    weight: 26,
    cities: ['São Paulo', 'Campinas', 'Santos', 'Ribeirão Preto'],
  },
  {
    state: 'RJ',
    region: 'Sudeste',
    weight: 11,
    cities: ['Rio de Janeiro', 'Niterói', 'Duque de Caxias', 'Nova Iguaçu'],
  },
  {
    state: 'MG',
    region: 'Sudeste',
    weight: 13,
    cities: ['Belo Horizonte', 'Uberlândia', 'Contagem', 'Juiz de Fora'],
  },
  {
    state: 'ES',
    region: 'Sudeste',
    weight: 4,
    cities: ['Vitória', 'Vila Velha', 'Serra', 'Cariacica'],
  },
  {
    state: 'PR',
    region: 'Sul',
    weight: 8,
    cities: ['Curitiba', 'Londrina', 'Maringá', 'Cascavel'],
  },
  {
    state: 'RS',
    region: 'Sul',
    weight: 7,
    cities: ['Porto Alegre', 'Caxias do Sul', 'Pelotas', 'Novo Hamburgo'],
  },
  {
    state: 'SC',
    region: 'Sul',
    weight: 6,
    cities: ['Florianópolis', 'Joinville', 'Blumenau', 'Chapecó'],
  },
  {
    state: 'BA',
    region: 'Nordeste',
    weight: 7,
    cities: ['Salvador', 'Feira de Santana', 'Vitória da Conquista', 'Camaçari'],
  },
  {
    state: 'PE',
    region: 'Nordeste',
    weight: 5,
    cities: ['Recife', 'Jaboatão dos Guararapes', 'Olinda', 'Caruaru'],
  },
  {
    state: 'CE',
    region: 'Nordeste',
    weight: 5,
    cities: ['Fortaleza', 'Caucaia', 'Juazeiro do Norte', 'Sobral'],
  },
  {
    state: 'GO',
    region: 'Centro-Oeste',
    weight: 5,
    cities: ['Goiânia', 'Aparecida de Goiânia', 'Anápolis', 'Rio Verde'],
  },
  {
    state: 'DF',
    region: 'Centro-Oeste',
    weight: 4,
    cities: ['Brasília', 'Taguatinga', 'Ceilândia', 'Gama'],
  },
  {
    state: 'MT',
    region: 'Centro-Oeste',
    weight: 3,
    cities: ['Cuiabá', 'Rondonópolis', 'Sinop', 'Várzea Grande'],
  },
  {
    state: 'MS',
    region: 'Centro-Oeste',
    weight: 3,
    cities: ['Campo Grande', 'Dourados', 'Três Lagoas', 'Corumbá'],
  },
  {
    state: 'PA',
    region: 'Norte',
    weight: 4,
    cities: ['Belém', 'Ananindeua', 'Santarém', 'Marabá'],
  },
  {
    state: 'AM',
    region: 'Norte',
    weight: 3,
    cities: ['Manaus', 'Parintins', 'Itacoatiara', 'Manacapuru'],
  },
  {
    state: 'RO',
    region: 'Norte',
    weight: 1,
    cities: ['Porto Velho', 'Ji-Paraná', 'Ariquemes', 'Vilhena'],
  },
  {
    state: 'TO',
    region: 'Norte',
    weight: 1,
    cities: ['Palmas', 'Araguaína', 'Gurupi', 'Porto Nacional'],
  },
  {
    state: 'RN',
    region: 'Nordeste',
    weight: 2,
    cities: ['Natal', 'Mossoró', 'Parnamirim', 'Caicó'],
  },
  {
    state: 'PB',
    region: 'Nordeste',
    weight: 2,
    cities: ['João Pessoa', 'Campina Grande', 'Santa Rita', 'Patos'],
  },
  {
    state: 'AL',
    region: 'Nordeste',
    weight: 2,
    cities: ['Maceió', 'Arapiraca', 'Rio Largo', 'Palmeira dos Índios'],
  },
  {
    state: 'SE',
    region: 'Nordeste',
    weight: 1,
    cities: ['Aracaju', 'Nossa Senhora do Socorro', 'Lagarto', 'Itabaiana'],
  },
  {
    state: 'PI',
    region: 'Nordeste',
    weight: 1,
    cities: ['Teresina', 'Parnaíba', 'Picos', 'Floriano'],
  },
  {
    state: 'MA',
    region: 'Nordeste',
    weight: 2,
    cities: ['São Luís', 'Imperatriz', 'Caxias', 'Timon'],
  },
  {
    state: 'AC',
    region: 'Norte',
    weight: 1,
    cities: ['Rio Branco', 'Cruzeiro do Sul', 'Sena Madureira', 'Tarauacá'],
  },
  {
    state: 'AP',
    region: 'Norte',
    weight: 1,
    cities: ['Macapá', 'Santana', 'Laranjal do Jari', 'Oiapoque'],
  },
  {
    state: 'RR',
    region: 'Norte',
    weight: 1,
    cities: ['Boa Vista', 'Rorainópolis', 'Caracaraí', 'Bonfim'],
  },
];

export const PARTNER_ROLE_ORDER: readonly PartnerRole[] = [
  'OWNER',
  'LEGAL_REPRESENTATIVE',
  'ADMINISTRATOR',
  'FINANCE',
  'OPERATIONS',
];

export const AGE_RANGE_WEIGHTS: readonly (readonly [AgeRange, number])[] = [
  ['18-25', 6],
  ['26-35', 31],
  ['36-45', 34],
  ['46-60', 22],
  ['60+', 7],
];

export const CRM_TYPE_WEIGHTS: readonly (readonly [CRMInteractionType, number])[] = [
  ['CALL', 28],
  ['EMAIL', 22],
  ['WHATSAPP', 26],
  ['MEETING', 10],
  ['TASK', 14],
];

export const CRM_OUTCOME_WEIGHTS: readonly (readonly [CRMInteractionOutcome, number])[] = [
  ['CONNECTED', 34],
  ['NO_ANSWER', 16],
  ['FOLLOW_UP', 24],
  ['RESOLVED', 18],
  ['OPEN', 8],
];

export const CONVERSATION_CHANNEL_WEIGHTS: readonly (readonly [ConversationChannel, number])[] = [
  ['WHATSAPP', 46],
  ['CHAT', 18],
  ['EMAIL', 22],
  ['PHONE', 14],
];

export const DIGITAL_EVENT_TYPE_WEIGHTS: readonly (readonly [DigitalEventType, number])[] = [
  ['LOGIN', 30],
  ['FEATURE_USE', 29],
  ['TRANSACTION', 23],
  ['DOCUMENT_UPLOAD', 12],
  ['ERROR', 6],
];

export const DIGITAL_CHANNEL_WEIGHTS: readonly (readonly [DigitalChannel, number])[] = [
  ['BANKLINE', 58],
  ['APP', 31],
  ['API', 11],
];

/** Screens of the Itaú Empresas app and how often companies visit them. */
export const APP_SCREEN_WEIGHTS: readonly (readonly [AppScreen, number])[] = [
  ['HOME', 26],
  ['EXTRATO', 20],
  ['PIX', 18],
  ['BOLETOS', 11],
  ['CARTOES', 7],
  ['CREDITO', 5],
  ['INVESTIMENTOS', 4],
  ['FOLHA_PAGAMENTO', 4],
  ['MAQUININHA', 3],
  ['PERFIL', 2],
];

export const APP_ACTION_WEIGHTS: readonly (readonly [AppAction, number])[] = [
  ['VIEW', 52],
  ['CLICK', 27],
  ['COMPLETE', 14],
  ['ABANDON', 5],
  ['ERROR', 2],
];

/** Typical time on screen (seconds) used to draw navigation durations. */
export const APP_SCREEN_SECONDS: Record<AppScreen, number> = {
  HOME: 18,
  EXTRATO: 55,
  PIX: 70,
  BOLETOS: 85,
  CARTOES: 40,
  CREDITO: 95,
  INVESTIMENTOS: 75,
  FOLHA_PAGAMENTO: 120,
  MAQUININHA: 45,
  PERFIL: 30,
};

export const APP_VERSIONS = ['7.12.0', '7.13.1', '7.14.0', '7.15.2'] as const;

export const TRANSACTION_TYPE_WEIGHTS: readonly (readonly [TransactionType, number])[] = [
  ['PIX_IN', 34],
  ['PIX_OUT', 27],
  ['BOLETO_ISSUED', 12],
  ['BOLETO_PAID', 13],
  ['TED', 5],
  ['CARD_PURCHASE', 9],
];

/** Median ticket (BRL) per transaction type, scaled by company revenue weight. */
export const TRANSACTION_TICKET: Record<TransactionType, number> = {
  PIX_IN: 1800,
  PIX_OUT: 1400,
  BOLETO_ISSUED: 3200,
  BOLETO_PAID: 2600,
  TED: 9500,
  CARD_PURCHASE: 380,
};

/**
 * Access profile by company size: share of App in digital navigation (the rest is Bankline) and
 * how often products are contracted through the Agência/gerente and transactions go through
 * Agência or API. Smaller companies live in the App; larger ones use Bankline, gerente and API.
 */
export const ACCESS_PROFILE_BY_SIZE: Record<
  CompanySize,
  { appShare: number; agencyContract: number; agencyTransaction: number; apiTransaction: number }
> = {
  MEI: { appShare: 0.8, agencyContract: 0.05, agencyTransaction: 0.02, apiTransaction: 0.0 },
  Micro: { appShare: 0.7, agencyContract: 0.08, agencyTransaction: 0.03, apiTransaction: 0.01 },
  Pequena: { appShare: 0.55, agencyContract: 0.15, agencyTransaction: 0.04, apiTransaction: 0.04 },
  Média: { appShare: 0.4, agencyContract: 0.25, agencyTransaction: 0.05, apiTransaction: 0.1 },
  Grande: { appShare: 0.25, agencyContract: 0.35, agencyTransaction: 0.06, apiTransaction: 0.18 },
};

export const NPS_TOUCHPOINT_WEIGHTS: readonly (readonly [NpsTouchpoint, number])[] = [
  ['APP', 38],
  ['ONBOARDING', 24],
  ['SERVICE', 23],
  ['RELATIONSHIP_MANAGER', 15],
];

export const CAMPAIGN_OBJECTIVE_BY_CHANNEL: Record<CampaignChannel, readonly CampaignObjective[]> =
  {
    GOOGLE_SEARCH: ['LEAD_GENERATION', 'RETARGETING'],
    LINKEDIN: ['LEAD_GENERATION', 'AWARENESS'],
    META: ['LEAD_GENERATION', 'RETARGETING', 'AWARENESS'],
    ORGANIC: ['AWARENESS', 'LEAD_GENERATION'],
    EMAIL: ['RETARGETING', 'LEAD_GENERATION'],
  };

export const CAMPAIGN_SOURCE_BY_CHANNEL: Record<CampaignChannel, CampaignSource> = {
  GOOGLE_SEARCH: 'PAID',
  LINKEDIN: 'PAID',
  META: 'PAID',
  ORGANIC: 'ORGANIC',
  EMAIL: 'OWNED',
};

export const CONVERSATION_SUBJECTS = [
  'Dúvida sobre onboarding',
  'Configuração de conta PJ',
  'Liberação de limite',
  'Integração de cobranças',
  'Ativação de Pix Cobrança',
  'Contestação de tarifa',
  'Acompanhamento comercial',
  'Pendência documental',
] as const;

export const COMPANY_NAME_PREFIXES = [
  'Grupo',
  'Rede',
  'Central',
  'Nova',
  'Prime',
  'Atlas',
  'Ponto',
  'Casa',
  'Portal',
  'Conecta',
] as const;

export const COMPANY_NAME_SUFFIXES = ['LTDA', 'S.A.', 'EIRELI', 'ME', 'Holding Ltda'] as const;
