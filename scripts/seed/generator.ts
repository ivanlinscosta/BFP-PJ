import { Faker, base, pt_BR } from '@faker-js/faker';
import type {
  AppNavigationEvent,
  NpsResponse,
  Transaction,
  AcquisitionChannel,
  Account,
  AccountStatus,
  AccountType,
  AnnualRevenueRange,
  CampaignChannel,
  CampaignStatus,
  Company,
  CompanyProduct,
  CompanySize,
  CompanyStatus,
  Conversation,
  CRMInteraction,
  DatasetBundle,
  DigitalEvent,
  FunnelEvent,
  FunnelEventType,
  MediaCampaign,
  MediaTouchpoint,
  Partner,
  Product,
  RiskProfile,
  TouchpointType,
} from '@bfp/domain';
import {
  AGE_RANGE_WEIGHTS,
  BASE_COUNTS,
  BRAZIL_STATES,
  CAMPAIGN_OBJECTIVE_BY_CHANNEL,
  CAMPAIGN_SOURCE_BY_CHANNEL,
  CAMPAIGNABLE_CHANNELS,
  CHANNEL_PROFILES,
  CHANNEL_TO_SOURCE,
  COMPANY_NAME_PREFIXES,
  COMPANY_NAME_SUFFIXES,
  COMPANY_SIZE_TO_EMPLOYEE_RANGE,
  COMPANY_SIZE_TO_REVENUE_RANGE,
  CONVERSATION_CHANNEL_WEIGHTS,
  CONVERSATION_SUBJECTS,
  CRM_OUTCOME_WEIGHTS,
  CRM_TYPE_WEIGHTS,
  DATASET_SEED,
  DIGITAL_CHANNEL_WEIGHTS,
  DIGITAL_EVENT_TYPE_WEIGHTS,
  HISTORY_START_DATE,
  INDUSTRIES_BY_SEGMENT,
  LEAD_CONVERSION_TARGETS,
  MANAGER_IDS,
  PARTNER_ROLE_ORDER,
  PRODUCT_CATALOG,
  PROSPECT_SIZE_FACTORS,
  REFERENCE_DATE,
  SEGMENTS,
  APP_ACTION_WEIGHTS,
  APP_SCREEN_SECONDS,
  APP_SCREEN_WEIGHTS,
  APP_VERSIONS,
  NPS_TOUCHPOINT_WEIGHTS,
  TRANSACTION_CHANNEL_WEIGHTS,
  TRANSACTION_TICKET,
  TRANSACTION_TYPE_WEIGHTS,
} from './constants';
import { createKeyedRandom, mulberry32 } from './prng';

export interface GenerationOptions {
  scale?: number;
  seed?: number;
  referenceDate?: string;
}

export interface GenerationCounts {
  companies: number;
  partners: number;
  accounts: number;
  products: number;
  companyProducts: number;
  mediaCampaigns: number;
  mediaTouchpoints: number;
  funnelEvents: number;
  crmInteractions: number;
  conversations: number;
  digitalEvents: number;
  appNavigationEvents: number;
  transactions: number;
  npsResponses: number;
  qualityStatuses: number;
  auditLogs: number;
}

interface CompanyPlan {
  company: Company;
  referenceDate: Date;
  leadDate: Date;
  accountOpeningStartedAt: Date | null;
  accountOpenedAt: Date | null;
  onboardingStartedAt: Date | null;
  onboardingCompletedAt: Date | null;
  activationDate: Date | null;
  churnedAt: Date | null;
  acquisitionTouchpointChannel: CampaignChannel | null;
  touchpointCostFactor: number;
  revenueWeight: number;
  qualified: boolean;
  unresolvedConversationTarget: number;
  fastOnboarding: boolean;
  partnerCount: number;
  accountCount: number;
  productCount: number;
  conversationCount: number;
  crmInteractionCount: number;
  digitalEventCount: number;
  touchpointCount: number;
  funnelEventCount: number;
}

interface WeightedValue<TValue> {
  value: TValue;
  weight: number;
}

const ACCOUNT_TYPES: readonly AccountType[] = ['CHECKING', 'PAYMENT', 'DIGITAL_WALLET'];
const ACCOUNT_PROVIDERS = ['BFP Bank', 'BFP Cash', 'BFP Payments'] as const;
const TOUCHPOINT_TYPE_WEIGHTS: readonly WeightedValue<TouchpointType>[] = [
  { value: 'IMPRESSION', weight: 50 },
  { value: 'CLICK', weight: 24 },
  { value: 'LANDING_PAGE_VISIT', weight: 18 },
  { value: 'FORM_SUBMIT', weight: 8 },
];
const FUNNEL_EVENT_WEIGHTS: readonly WeightedValue<FunnelEventType>[] = [
  { value: 'LEAD_CREATED', weight: 1 },
  { value: 'QUALIFIED', weight: 4 },
  { value: 'ACCOUNT_OPENING_STARTED', weight: 4 },
  { value: 'ACCOUNT_OPENED', weight: 2 },
  { value: 'ONBOARDING_STARTED', weight: 4 },
  { value: 'ONBOARDING_COMPLETED', weight: 4 },
  { value: 'ACTIVATED', weight: 1 },
  { value: 'CHURNED', weight: 1 },
];

const SIZE_WEIGHT_MAP: Record<CompanySize, number> = {
  MEI: 1,
  Micro: 2,
  Pequena: 3,
  Média: 5,
  Grande: 4,
};

const REVENUE_WEIGHT_MAP: Record<AnnualRevenueRange, number> = {
  ATE_360K: 1,
  '360K_A_4_8M': 2,
  '4_8M_A_50M': 4,
  '50M_A_300M': 6,
  ACIMA_300M: 8,
};

const REVENUE_INDEX: Record<AnnualRevenueRange, number> = {
  ATE_360K: 0,
  '360K_A_4_8M': 1,
  '4_8M_A_50M': 2,
  '50M_A_300M': 3,
  ACIMA_300M: 4,
};

const ACCOUNT_STATUS_BY_COMPANY_STATUS: Record<CompanyStatus, AccountStatus> = {
  LEAD: 'PENDING',
  ACCOUNT_OPENING: 'PENDING',
  ONBOARDING: 'OPEN',
  ACTIVE: 'OPEN',
  INACTIVE: 'CLOSED',
};

const HISTORY_START = new Date(HISTORY_START_DATE);
const DEFAULT_REFERENCE = new Date(REFERENCE_DATE);

/** Resolves deterministic target volumes from the base architecture counts and an optional scale factor. */
export function resolveGenerationCounts(scale = 1): GenerationCounts {
  const resolvedScale = Number.isFinite(scale) && scale > 0 ? scale : 1;

  const scaledCount = (base: number, minimum: number) => {
    if (resolvedScale >= 1) {
      return base;
    }

    return Math.max(minimum, Math.round(base * resolvedScale));
  };

  return {
    companies: scaledCount(BASE_COUNTS.companies, 24),
    partners: scaledCount(BASE_COUNTS.partners, 72),
    accounts: scaledCount(BASE_COUNTS.accounts, 30),
    products: BASE_COUNTS.products,
    companyProducts: scaledCount(BASE_COUNTS.companyProducts, 60),
    mediaCampaigns: scaledCount(BASE_COUNTS.mediaCampaigns, 5),
    mediaTouchpoints: scaledCount(BASE_COUNTS.mediaTouchpoints, 480),
    funnelEvents: scaledCount(BASE_COUNTS.funnelEvents, 360),
    crmInteractions: scaledCount(BASE_COUNTS.crmInteractions, 96),
    conversations: scaledCount(BASE_COUNTS.conversations, 72),
    digitalEvents: scaledCount(BASE_COUNTS.digitalEvents, 720),
    appNavigationEvents: scaledCount(BASE_COUNTS.appNavigationEvents, 900),
    transactions: scaledCount(BASE_COUNTS.transactions, 450),
    npsResponses: scaledCount(BASE_COUNTS.npsResponses, 60),
    qualityStatuses: 0,
    auditLogs: 0,
  };
}

/** Generates the deterministic synthetic DatasetBundle used by local development, tests, and demos. */
export function generateDatasetBundle(options: GenerationOptions = {}): DatasetBundle {
  const seed = options.seed ?? DATASET_SEED;
  const counts = resolveGenerationCounts(options.scale);
  const referenceDate = options.referenceDate ? new Date(options.referenceDate) : DEFAULT_REFERENCE;
  const faker = new Faker({ locale: [pt_BR, base] });
  faker.seed(seed);

  const products = PRODUCT_CATALOG.map((product, index) => ({
    ...product,
    createdAt: toIso(addDays(HISTORY_START, index * 9)),
    status: 'ACTIVE',
  })) satisfies Product[];

  const mediaCampaigns = generateCampaigns(counts.mediaCampaigns, seed, referenceDate);
  const campaignIdsByChannel = new Map<CampaignChannel, string[]>();
  for (const campaign of mediaCampaigns) {
    const ids = campaignIdsByChannel.get(campaign.channel) ?? [];
    ids.push(campaign.id);
    campaignIdsByChannel.set(campaign.channel, ids);
  }

  const companyChannels = buildCompanyChannels(counts.companies, seed);
  const companyPlans = companyChannels.map((channel, index) =>
    createCompanyPlan({
      index,
      channel,
      seed,
      faker,
      referenceDate,
      campaignIdsByChannel,
    }),
  );

  assignCompanyCounts(companyPlans, counts);

  const coreCompanies = companyPlans.map((plan) => plan.company);
  const partners = sortById(generatePartners(companyPlans, seed, faker));
  const accounts = sortById(generateAccounts(companyPlans, seed));
  const companyProducts = sortById(generateCompanyProducts(companyPlans, products, seed));
  const conversations = sortById(generateConversations(companyPlans, seed));
  const crmInteractions = sortById(generateCrmInteractions(companyPlans, conversations, seed));
  // ~1,2% of media events arrive without a matching company (late CRM sync). They are kept on
  // purpose so governance shows realistic referential-integrity quality instead of 100%.
  const mediaTouchpoints = sortById(generateTouchpoints(companyPlans, seed)).map(
    (touchpoint, index) =>
      index % 83 === 41 ? { ...touchpoint, companyId: 'company-sem-correspondencia' } : touchpoint,
  );
  const funnelEvents = sortById(generateFunnelEvents(companyPlans, seed));
  const digitalEvents = sortById(generateDigitalEvents(companyPlans, companyProducts, seed));
  const appNavigationEvents = generateAppNavigation(companyPlans, counts.appNavigationEvents, seed);
  const transactions = generateTransactions(companyPlans, counts.transactions, seed);
  const npsResponses = generateNpsResponses(companyPlans, conversations, counts.npsResponses, seed);
  const prospects = generateProspectLeads({
    coreCompanies,
    seed,
    faker,
    referenceDate,
    campaignIdsByChannel,
  });
  const showcase = applyShowcaseCompany(coreCompanies, companyProducts);
  const established = generateEstablishedCustomers({
    count:
      options.scale && options.scale < 1
        ? Math.max(30, Math.round(ESTABLISHED_CUSTOMERS * options.scale))
        : ESTABLISHED_CUSTOMERS,
    startIndex: coreCompanies.length + prospects.length,
    seed,
    faker,
  });
  const companies = sortById([...showcase.companies, ...prospects, ...established]);

  return {
    companies,
    partners,
    accounts,
    products: sortById(products),
    companyProducts: showcase.companyProducts,
    mediaCampaigns: sortById(mediaCampaigns),
    mediaTouchpoints,
    funnelEvents,
    crmInteractions,
    conversations,
    digitalEvents,
    appNavigationEvents,
    transactions,
    npsResponses,
    customerIntelligence: [],
    qualityStatuses: [],
    auditLogs: [],
  };
}

/**
 * Generates prospect leads that never progressed past the lead stage. They carry no events,
 * products or conversations, and calibrate each channel to LEAD_CONVERSION_TARGETS.
 */
function generateProspectLeads(input: {
  coreCompanies: Company[];
  seed: number;
  faker: Faker;
  referenceDate: Date;
  campaignIdsByChannel: Map<CampaignChannel, string[]>;
}): Company[] {
  const { coreCompanies, seed, faker, referenceDate, campaignIdsByChannel } = input;
  const prospects: Company[] = [];
  let index = coreCompanies.length;

  for (const channel of Object.keys(LEAD_CONVERSION_TARGETS) as AcquisitionChannel[]) {
    const channelCompanies = coreCompanies.filter(
      (company) => company.acquisitionChannel === channel,
    );
    const opened = channelCompanies.filter((company) => company.accountOpenedAt !== null).length;
    const targetLeads = Math.round(opened / LEAD_CONVERSION_TARGETS[channel]);
    const missing = Math.max(0, targetLeads - channelCompanies.length);
    const profile = CHANNEL_PROFILES[channel];
    const campaignIds = isCampaignChannel(channel) ? campaignIdsByChannel.get(channel) : undefined;

    for (let offset = 0; offset < missing; offset += 1) {
      const id = `company-${String(index + 1).padStart(4, '0')}`;
      const rand = createKeyedRandom(seed, `prospect:${id}`);
      const stateEntry = pickWeighted(
        BRAZIL_STATES.map((entry) => ({ value: entry, weight: entry.weight })),
        rand,
      );
      const city =
        stateEntry.cities[Math.floor(rand() * stateEntry.cities.length)] ?? stateEntry.cities[0];
      const size = pickWeighted(
        profile.companySizes.map(([value, weight]) => ({
          value,
          weight: weight * PROSPECT_SIZE_FACTORS[value],
        })),
        rand,
      );
      const segment = SEGMENTS[Math.floor(rand() * SEGMENTS.length)] ?? SEGMENTS[0];
      const industryOptions = INDUSTRIES_BY_SEGMENT[segment];
      const industry =
        industryOptions[Math.floor(rand() * industryOptions.length)] ?? industryOptions[0];
      const revenueRange = adjustRevenueRange(size, channel, rand);
      const leadDate = randomDateBetween(rand, HISTORY_START, addDays(referenceDate, -2));
      const companyNameRoot = faker.person.lastName();

      prospects.push({
        id,
        cnpjMasked: buildMaskedCnpj(index),
        legalName: `${COMPANY_NAME_PREFIXES[index % COMPANY_NAME_PREFIXES.length]} ${companyNameRoot} ${segment} ${COMPANY_NAME_SUFFIXES[index % COMPANY_NAME_SUFFIXES.length]}`,
        tradeName: buildTradeName(index, companyNameRoot, industry),
        segment,
        industry,
        companySize: size,
        state: stateEntry.state,
        city,
        region: stateEntry.region,
        employeeCountRange: pickWeighted(
          COMPANY_SIZE_TO_EMPLOYEE_RANGE[size].map((value) => ({ value, weight: 1 })),
          rand,
        ),
        annualRevenueRange: revenueRange,
        acquisitionSource: CHANNEL_TO_SOURCE[channel],
        acquisitionChannel: channel,
        acquisitionCampaignId:
          campaignIds && campaignIds.length > 0
            ? (campaignIds[index % campaignIds.length] ?? null)
            : null,
        leadCreatedAt: toIso(leadDate),
        accountOpeningStartedAt: null,
        accountOpenedAt: null,
        onboardingStartedAt: null,
        onboardingCompletedAt: null,
        activationDate: null,
        status: 'LEAD',
        relationshipManagerId: null,
        lgpdConsent: rand() > (channel === 'META' ? 0.12 : 0.05),
        riskProfile: resolveRiskProfile(rand, size, revenueRange),
        createdAt: toIso(leadDate),
      });
      index += 1;
    }
  }

  return prospects;
}

/** Renames the best-fitting core company so the Cliente PJ 360 demo has a stable showcase. */
function applyShowcaseCompany(companies: Company[], companyProducts: CompanyProduct[]) {
  const productCount = new Map<string, number>();
  for (const item of companyProducts) {
    productCount.set(item.companyId, (productCount.get(item.companyId) ?? 0) + 1);
  }

  const fastOnboarding = (company: Company) =>
    company.accountOpenedAt !== null &&
    company.onboardingCompletedAt !== null &&
    new Date(company.onboardingCompletedAt).getTime() -
      new Date(company.accountOpenedAt).getTime() <=
      3 * 24 * 60 * 60 * 1000;
  const score = (company: Company) =>
    (company.acquisitionChannel === 'GOOGLE_SEARCH' ? 8 : 0) +
    (company.segment === 'Tecnologia' ? 6 : 0) +
    (company.state === 'SP' ? 12 : 0) +
    (company.companySize === 'Média' ? 9 : 0) +
    (fastOnboarding(company) ? 4 : 0) +
    (company.activationDate ? 3 : 0) +
    (company.status === 'ACTIVE' ? 2 : 0) +
    Math.min(productCount.get(company.id) ?? 0, 4);
  const showcase = [...companies].sort(
    (left, right) => score(right) - score(left) || left.id.localeCompare(right.id),
  )[0];

  if (!showcase) {
    return { companies, companyProducts };
  }

  // The showcase reproduces the Cliente PJ 360 story: acquired by Google Search in July 2026,
  // fast onboarding, Conta PJ and Cartão PJ contracted and no working capital yet.
  return {
    companies: companies.map((company) =>
      company.id === showcase.id
        ? {
            ...company,
            tradeName: 'Atlas Tecnologia Ltda.',
            legalName: 'Atlas Soluções Tecnológicas Ltda.',
            segment: 'Tecnologia',
            industry: 'SaaS B2B',
            companySize: 'Média' as const,
            state: 'SP',
            city: 'São Paulo',
            region: 'Sudeste',
            leadCreatedAt: '2026-07-13T14:20:00.000Z',
            accountOpeningStartedAt: '2026-07-15T10:05:00.000Z',
            accountOpenedAt: '2026-07-18T16:40:00.000Z',
            onboardingStartedAt: '2026-07-18T17:00:00.000Z',
            onboardingCompletedAt: '2026-07-20T11:30:00.000Z',
            activationDate: '2026-07-23T09:15:00.000Z',
            status: 'ACTIVE' as const,
            createdAt: '2026-07-13T14:20:00.000Z',
          }
        : company,
    ),
    companyProducts: companyProducts
      .filter(
        (item) =>
          item.companyId !== showcase.id ||
          item.productId === 'product-001' ||
          item.productId === 'product-002',
      )
      .map((item) =>
        item.companyId === showcase.id
          ? {
              ...item,
              status: 'ACTIVE' as const,
              contractedAt:
                item.productId === 'product-001'
                  ? '2026-07-18T16:40:00.000Z'
                  : '2026-07-27T15:00:00.000Z',
            }
          : item,
      ),
  };
}

/** Customers with accounts opened before the acquisition window (relationship history). */
export const ESTABLISHED_CUSTOMERS = 3000;

/**
 * Established customers: accounts opened between April and September 2025, before the
 * acquisition window. They carry no acquisition events here (the funnel calibration only uses
 * companies acquired inside the window); their behavior comes from the intelligence dataset.
 */
function generateEstablishedCustomers(input: {
  count: number;
  startIndex: number;
  seed: number;
  faker: Faker;
}): Company[] {
  const customers: Company[] = [];
  const channels = Object.keys(CHANNEL_PROFILES) as Array<keyof typeof CHANNEL_PROFILES>;
  for (let offset = 0; offset < input.count; offset += 1) {
    const index = input.startIndex + offset;
    const id = `company-${String(index + 1).padStart(5, '0')}`;
    const rand = createKeyedRandom(input.seed, `established:${id}`);
    const channel = pickWeighted(
      channels.map((value) => ({ value, weight: CHANNEL_PROFILES[value].companyWeight })),
      rand,
    );
    const profile = CHANNEL_PROFILES[channel];
    const stateEntry = pickWeighted(
      BRAZIL_STATES.map((entry) => ({ value: entry, weight: entry.weight })),
      rand,
    );
    const size = pickWeighted(
      profile.companySizes.map(([value, weight]) => ({ value, weight })),
      rand,
    );
    const segment = SEGMENTS[Math.floor(rand() * SEGMENTS.length)] ?? SEGMENTS[0];
    const industries = INDUSTRIES_BY_SEGMENT[segment];
    const industry = industries[Math.floor(rand() * industries.length)] ?? industries[0];
    const revenueRange = adjustRevenueRange(size, channel, rand);
    const opened = randomDateBetween(
      rand,
      new Date('2025-04-01T00:00:00.000Z'),
      new Date('2025-09-20T00:00:00.000Z'),
    );
    const lead = addDays(opened, -randomInteger(rand, 8, 120));
    const root = input.faker.person.lastName();
    customers.push({
      id,
      cnpjMasked: buildMaskedCnpj(index),
      legalName: `${COMPANY_NAME_PREFIXES[index % COMPANY_NAME_PREFIXES.length]} ${root} ${segment} ${COMPANY_NAME_SUFFIXES[index % COMPANY_NAME_SUFFIXES.length]}`,
      tradeName: buildTradeName(index, root, industry),
      segment,
      industry,
      companySize: size,
      state: stateEntry.state,
      city:
        stateEntry.cities[Math.floor(rand() * stateEntry.cities.length)] ?? stateEntry.cities[0],
      region: stateEntry.region,
      employeeCountRange: pickWeighted(
        COMPANY_SIZE_TO_EMPLOYEE_RANGE[size].map((value) => ({ value, weight: 1 })),
        rand,
      ),
      annualRevenueRange: revenueRange,
      acquisitionSource: CHANNEL_TO_SOURCE[channel],
      acquisitionChannel: channel,
      acquisitionCampaignId: null,
      leadCreatedAt: toIso(lead),
      accountOpeningStartedAt: toIso(addDays(opened, -randomInteger(rand, 1, 6))),
      accountOpenedAt: toIso(opened),
      onboardingStartedAt: toIso(opened),
      onboardingCompletedAt: toIso(addDays(opened, randomInteger(rand, 1, 12))),
      activationDate: toIso(addDays(opened, randomInteger(rand, 3, 40))),
      status: 'ACTIVE',
      relationshipManagerId: MANAGER_IDS[index % MANAGER_IDS.length] ?? MANAGER_IDS[0],
      lgpdConsent: rand() > 0.05,
      riskProfile: resolveRiskProfile(rand, size, revenueRange),
      createdAt: toIso(lead),
    });
  }
  return customers;
}

function generateCampaigns(total: number, seed: number, referenceDate: Date): MediaCampaign[] {
  const countsByChannel = allocateByWeights(
    total,
    CAMPAIGNABLE_CHANNELS.map((channel) => ({
      key: channel,
      weight: CHANNEL_PROFILES[channel].companyWeight,
      minimum: 1,
    })),
  );
  const campaigns: MediaCampaign[] = [];
  let runningIndex = 1;

  for (const channel of CAMPAIGNABLE_CHANNELS) {
    const channelTotal = countsByChannel.get(channel) ?? 0;
    for (let index = 0; index < channelTotal; index += 1) {
      const rand = createKeyedRandom(seed, `campaign:${channel}:${index}`);
      const monthOffset = Math.floor(rand() * 12);
      const start = new Date(Date.UTC(2025, 9 + monthOffset, 1, 0, 0, 0, 0));
      const end = new Date(
        Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0, 23, 59, 59, 999),
      );
      const objectiveOptions = CAMPAIGN_OBJECTIVE_BY_CHANNEL[channel];
      const objective = objectiveOptions[Math.floor(rand() * objectiveOptions.length)];
      const budgetBase =
        channel === 'LINKEDIN'
          ? 120000
          : channel === 'GOOGLE_SEARCH'
            ? 80000
            : channel === 'META'
              ? 95000
              : channel === 'EMAIL'
                ? 18000
                : 9000;
      const budget = Math.round(budgetBase + rand() * budgetBase * 0.35);
      const status = resolveCampaignStatus(end, referenceDate);
      campaigns.push({
        id: `campaign-${String(runningIndex).padStart(3, '0')}`,
        name: `${formatCampaignChannel(channel)} ${start.toLocaleString('pt-BR', { month: 'long', timeZone: 'UTC' })} ${start.getUTCFullYear()}`,
        channel,
        source: CAMPAIGN_SOURCE_BY_CHANNEL[channel],
        objective,
        budget,
        status,
        startDate: toIso(start),
        endDate: toIso(end),
        createdAt: toIso(addDays(start, -14)),
      });
      runningIndex += 1;
    }
  }

  return campaigns;
}

function createCompanyPlan(input: {
  index: number;
  channel: keyof typeof CHANNEL_PROFILES;
  seed: number;
  faker: Faker;
  referenceDate: Date;
  campaignIdsByChannel: Map<CampaignChannel, string[]>;
}): CompanyPlan {
  const { index, channel, seed, faker, referenceDate, campaignIdsByChannel } = input;
  const id = `company-${String(index + 1).padStart(4, '0')}`;
  const rand = createKeyedRandom(seed, id);
  const stateEntry = pickWeighted(
    BRAZIL_STATES.map((entry) => ({ value: entry, weight: entry.weight })),
    rand,
  );
  const city =
    stateEntry.cities[Math.floor(rand() * stateEntry.cities.length)] ?? stateEntry.cities[0];
  const size = pickWeighted(
    CHANNEL_PROFILES[channel].companySizes.map(([value, weight]) => ({ value, weight })),
    rand,
  );
  const employeeCountRange = pickWeighted(
    COMPANY_SIZE_TO_EMPLOYEE_RANGE[size].map((value) => ({ value, weight: 1 })),
    rand,
  );
  const revenueRange = adjustRevenueRange(size, channel, rand);
  const segment = SEGMENTS[Math.floor(rand() * SEGMENTS.length)] ?? SEGMENTS[0];
  const industryOptions = INDUSTRIES_BY_SEGMENT[segment];
  const industry =
    industryOptions[Math.floor(rand() * industryOptions.length)] ?? industryOptions[0];
  const leadDate = randomDateBetween(rand, HISTORY_START, addDays(referenceDate, -5));
  const profile = CHANNEL_PROFILES[channel];
  const qualified = rand() < profile.qualifyRate;
  const accountOpeningStartedAt = qualified
    ? nullIfAfter(addDays(leadDate, randomInteger(rand, 0, 10)), referenceDate)
    : null;
  const accountStartedDate = accountOpeningStartedAt;
  const accountOpenedCandidate = accountStartedDate
    ? nullIfAfter(addDays(accountStartedDate, randomInteger(rand, 1, 14)), referenceDate)
    : null;
  const accountOpened =
    Boolean(accountOpenedCandidate) && rand() < clamp(profile.accountOpenedRate + 0.18, 0.12, 0.95);
  const accountOpenedAt = accountOpened && accountOpenedCandidate ? accountOpenedCandidate : null;
  const onboardingStartedAt = accountOpenedAt
    ? nullIfAfter(addDays(accountOpenedAt, randomInteger(rand, 0, 2)), referenceDate)
    : null;
  const onboardingDurationDays = onboardingStartedAt ? pickOnboardingDuration(rand, channel) : null;
  const onboardingCompleted =
    Boolean(onboardingStartedAt) && rand() < profile.onboardingCompletedRate;
  const onboardingCompletedAt =
    onboardingCompleted && onboardingStartedAt && onboardingDurationDays !== null
      ? nullIfAfter(addDays(onboardingStartedAt, onboardingDurationDays), referenceDate)
      : null;
  const unresolvedConversationTarget = resolveUnresolvedConversationTarget(rand, channel, size);
  const fastOnboarding = onboardingDurationDays !== null && onboardingDurationDays <= 3;
  const activationChance = clamp(
    profile.activationBase +
      (fastOnboarding ? 0.3 : -0.12) +
      (unresolvedConversationTarget > 1
        ? -0.32
        : unresolvedConversationTarget === 1
          ? -0.08
          : 0.08) +
      (size === 'Média' ? 0.06 : size === 'Grande' ? 0.04 : 0),
    0.05,
    0.92,
  );
  const activatedWithin30 = Boolean(onboardingCompletedAt) && rand() < activationChance;
  const activatedLate = Boolean(onboardingCompletedAt) && !activatedWithin30 && rand() < 0.14;
  const activationDate = onboardingCompletedAt
    ? activatedWithin30
      ? addDays(accountOpenedAt ?? onboardingCompletedAt, randomInteger(rand, 4, 27))
      : activatedLate
        ? addDays(accountOpenedAt ?? onboardingCompletedAt, randomInteger(rand, 33, 75))
        : null
    : null;
  const churnedAt =
    activationDate && rand() < profile.churnRate
      ? addDays(activationDate, randomInteger(rand, 25, 140))
      : null;
  const normalizedActivationDate =
    activationDate && activationDate <= referenceDate ? activationDate : null;
  const normalizedChurnDate = churnedAt && churnedAt <= referenceDate ? churnedAt : null;
  const status = resolveCompanyStatus({
    accountOpeningStartedAt: accountStartedDate,
    accountOpenedAt,
    onboardingCompletedAt,
    activationDate: normalizedActivationDate,
    churnedAt: normalizedChurnDate,
  });
  const managerId =
    status === 'LEAD' ? null : (MANAGER_IDS[index % MANAGER_IDS.length] ?? MANAGER_IDS[0]);
  const campaignIds =
    channel in CAMPAIGN_SOURCE_BY_CHANNEL
      ? campaignIdsByChannel.get(channel as CampaignChannel)
      : undefined;
  const acquisitionCampaignId =
    campaignIds && campaignIds.length > 0
      ? (campaignIds[index % campaignIds.length] ?? null)
      : null;
  const companyNameRoot = faker.person.lastName();
  const legalName = `${COMPANY_NAME_PREFIXES[index % COMPANY_NAME_PREFIXES.length]} ${companyNameRoot} ${segment} ${COMPANY_NAME_SUFFIXES[index % COMPANY_NAME_SUFFIXES.length]}`;
  const tradeName = buildTradeName(index, companyNameRoot, industry);
  const company: Company = {
    id,
    cnpjMasked: buildMaskedCnpj(index),
    legalName,
    tradeName,
    segment,
    industry,
    companySize: size,
    state: stateEntry.state,
    city,
    region: stateEntry.region,
    employeeCountRange,
    annualRevenueRange: revenueRange,
    acquisitionSource: CHANNEL_TO_SOURCE[channel],
    acquisitionChannel: channel,
    acquisitionCampaignId,
    leadCreatedAt: toIso(leadDate),
    accountOpeningStartedAt: accountStartedDate ? toIso(accountStartedDate) : null,
    accountOpenedAt: accountOpenedAt ? toIso(accountOpenedAt) : null,
    onboardingStartedAt: onboardingStartedAt ? toIso(onboardingStartedAt) : null,
    onboardingCompletedAt: onboardingCompletedAt ? toIso(onboardingCompletedAt) : null,
    activationDate: normalizedActivationDate ? toIso(normalizedActivationDate) : null,
    status,
    relationshipManagerId: managerId,
    lgpdConsent: rand() > (channel === 'META' ? 0.12 : 0.05),
    riskProfile: resolveRiskProfile(rand, size, revenueRange),
    createdAt: toIso(leadDate),
  };

  return {
    company,
    referenceDate,
    leadDate,
    accountOpeningStartedAt: accountStartedDate,
    accountOpenedAt,
    onboardingStartedAt,
    onboardingCompletedAt,
    activationDate: normalizedActivationDate,
    churnedAt: normalizedChurnDate,
    acquisitionTouchpointChannel: isCampaignChannel(channel) ? channel : null,
    touchpointCostFactor: profile.touchpointCost,
    revenueWeight: REVENUE_WEIGHT_MAP[revenueRange],
    qualified,
    unresolvedConversationTarget,
    fastOnboarding,
    partnerCount: 0,
    accountCount: 0,
    productCount: 0,
    conversationCount: 0,
    crmInteractionCount: 0,
    digitalEventCount: 0,
    touchpointCount: 0,
    funnelEventCount: 0,
  };
}

function assignCompanyCounts(companyPlans: CompanyPlan[], counts: GenerationCounts) {
  const partnerCounts = allocateIntegerCounts({
    items: companyPlans,
    total: counts.partners,
    getId: (plan) => plan.company.id,
    getMinimum: () => 1,
    getMaximum: (plan) => resolveProductCap(plan.company.companySize) + 1,
    getWeight: (plan) =>
      SIZE_WEIGHT_MAP[plan.company.companySize] + (plan.company.region === 'Sudeste' ? 1 : 0),
  });
  const accountCounts = allocateIntegerCounts({
    items: companyPlans,
    total: counts.accounts,
    getId: (plan) => plan.company.id,
    getMinimum: (plan) => (plan.accountOpenedAt ? 1 : 0),
    getMaximum: (plan) => (plan.accountOpenedAt ? 3 : 0),
    getWeight: (plan) => (plan.accountOpenedAt ? SIZE_WEIGHT_MAP[plan.company.companySize] + 1 : 0),
  });
  const companyProductCounts = allocateIntegerCounts({
    items: companyPlans,
    total: counts.companyProducts,
    getId: (plan) => plan.company.id,
    getMinimum: (plan) => (plan.accountOpenedAt ? 1 : 0),
    getMaximum: (plan) => (plan.accountOpenedAt ? resolveProductCap(plan.company.companySize) : 0),
    getWeight: (plan) =>
      plan.accountOpenedAt
        ? SIZE_WEIGHT_MAP[plan.company.companySize] * 2 +
          (plan.company.companySize === 'Média' ? 5 : 0)
        : 0,
  });
  const conversationCounts = allocateIntegerCounts({
    items: companyPlans,
    total: counts.conversations,
    getId: (plan) => plan.company.id,
    getMinimum: (plan) => (plan.unresolvedConversationTarget > 0 ? 1 : 0),
    getMaximum: () => 6,
    getWeight: (plan) =>
      1 +
      plan.unresolvedConversationTarget * 4 +
      (plan.company.status === 'ONBOARDING' ? 2 : 0) +
      (plan.company.status === 'ACCOUNT_OPENING' ? 1 : 0),
  });
  const crmInteractionCounts = allocateIntegerCounts({
    items: companyPlans,
    total: counts.crmInteractions,
    getId: (plan) => plan.company.id,
    getMinimum: (plan) => (plan.company.relationshipManagerId ? 1 : 0),
    getMaximum: () => 12,
    getWeight: (plan) =>
      plan.company.relationshipManagerId
        ? 1 + conversationCounts.get(plan.company.id)! + accountCounts.get(plan.company.id)!
        : 0,
  });
  const digitalEventCounts = allocateIntegerCounts({
    items: companyPlans,
    total: counts.digitalEvents,
    getId: (plan) => plan.company.id,
    getMinimum: (plan) => (plan.accountOpenedAt ? 2 : 0),
    getMaximum: (plan) => (plan.accountOpenedAt ? 64 : 0),
    getWeight: (plan) =>
      plan.accountOpenedAt
        ? 2 +
          companyProductCounts.get(plan.company.id)! * 3 +
          (plan.activationDate ? 8 : 0) +
          plan.revenueWeight
        : 0,
  });
  const touchpointCounts = allocateIntegerCounts({
    items: companyPlans,
    total: counts.mediaTouchpoints,
    getId: (plan) => plan.company.id,
    getMinimum: (plan) => (plan.acquisitionTouchpointChannel ? 4 : 0),
    getMaximum: (plan) => (plan.acquisitionTouchpointChannel ? 40 : 0),
    getWeight: (plan) =>
      plan.acquisitionTouchpointChannel
        ? CHANNEL_PROFILES[plan.company.acquisitionChannel].touchpointWeight +
          (plan.company.acquisitionChannel === 'META' ? 6 : 0)
        : 0,
  });
  const funnelEventCounts = allocateIntegerCounts({
    items: companyPlans,
    total: counts.funnelEvents,
    getId: (plan) => plan.company.id,
    getMinimum: () => 1,
    getMaximum: () => 28,
    getWeight: (plan) => {
      let score = 3;
      if (plan.qualified) score += 3;
      if (plan.accountOpeningStartedAt) score += 4;
      if (plan.accountOpenedAt) score += 6;
      if (plan.onboardingStartedAt) score += 5;
      if (plan.onboardingCompletedAt) score += 5;
      if (plan.activationDate) score += 4;
      if (plan.churnedAt) score += 2;
      return score;
    },
  });

  for (const plan of companyPlans) {
    plan.partnerCount = partnerCounts.get(plan.company.id) ?? 0;
    plan.accountCount = accountCounts.get(plan.company.id) ?? 0;
    plan.productCount = companyProductCounts.get(plan.company.id) ?? 0;
    plan.conversationCount = conversationCounts.get(plan.company.id) ?? 0;
    plan.crmInteractionCount = crmInteractionCounts.get(plan.company.id) ?? 0;
    plan.digitalEventCount = digitalEventCounts.get(plan.company.id) ?? 0;
    plan.touchpointCount = touchpointCounts.get(plan.company.id) ?? 0;
    plan.funnelEventCount = funnelEventCounts.get(plan.company.id) ?? 0;
  }
}

function generatePartners(companyPlans: CompanyPlan[], seed: number, faker: Faker): Partner[] {
  const partners: Partner[] = [];
  let runningIndex = 1;

  for (const plan of companyPlans) {
    const rand = createKeyedRandom(seed, `partners:${plan.company.id}`);
    const roleSequence = Array.from(
      { length: plan.partnerCount },
      (_, index) => PARTNER_ROLE_ORDER[index] ?? 'OPERATIONS',
    );
    const baseOwnership = roleSequence.length > 0 ? 100 / Math.min(roleSequence.length, 3) : 0;

    roleSequence.forEach((role, index) => {
      const isOwner = role === 'OWNER';
      const ownershipPercentage = isOwner
        ? roundNumber(baseOwnership + rand() * 20, 2)
        : index === 1 && plan.partnerCount > 1
          ? roundNumber(100 - baseOwnership, 2)
          : 0;
      partners.push({
        id: `partner-${String(runningIndex).padStart(5, '0')}`,
        companyId: plan.company.id,
        name: faker.person.fullName(),
        role,
        ownershipPercentage,
        ageRange: pickWeighted(
          AGE_RANGE_WEIGHTS.map(([value, weight]) => ({ value, weight })),
          rand,
        ),
        state: plan.company.state,
        joinedAt: toIso(addDays(plan.leadDate, index)),
      });
      runningIndex += 1;
    });
  }

  return partners;
}

function generateAccounts(companyPlans: CompanyPlan[], seed: number): Account[] {
  const accounts: Account[] = [];
  let runningIndex = 1;

  for (const plan of companyPlans) {
    if (!plan.accountOpenedAt) {
      continue;
    }

    const rand = createKeyedRandom(seed, `accounts:${plan.company.id}`);

    for (let index = 0; index < plan.accountCount; index += 1) {
      const type = ACCOUNT_TYPES[index % ACCOUNT_TYPES.length] ?? 'CHECKING';
      const createdAt = addDays(plan.accountOpeningStartedAt ?? plan.leadDate, index);
      const openedAt = addDays(plan.accountOpenedAt, index === 0 ? 0 : index * 4);
      const status = index === 0 ? ACCOUNT_STATUS_BY_COMPANY_STATUS[plan.company.status] : 'OPEN';
      const closedAt = status === 'CLOSED' ? addDays(plan.churnedAt ?? openedAt, 3 + index) : null;
      accounts.push({
        id: `account-${String(runningIndex).padStart(5, '0')}`,
        companyId: plan.company.id,
        provider: ACCOUNT_PROVIDERS[index % ACCOUNT_PROVIDERS.length] ?? 'BFP Bank',
        type,
        status,
        accountNumberMasked: `****${String(1000 + Math.floor(rand() * 9000))}`,
        openedAt: toIso(openedAt),
        createdAt: toIso(createdAt),
        closedAt: closedAt ? toIso(closedAt) : null,
      });
      runningIndex += 1;
    }
  }

  return accounts;
}

function generateCompanyProducts(
  companyPlans: CompanyPlan[],
  products: Product[],
  seed: number,
): CompanyProduct[] {
  const companyProducts: CompanyProduct[] = [];
  let runningIndex = 1;

  for (const plan of companyPlans) {
    if (!plan.accountOpenedAt || plan.productCount === 0) {
      continue;
    }

    const rand = createKeyedRandom(seed, `company-products:${plan.company.id}`);
    const productPool = [...products].sort((left, right) => left.id.localeCompare(right.id));

    for (let index = 0; index < plan.productCount; index += 1) {
      const product = productPool[index % productPool.length] ?? productPool[0];
      const contractedAt = addDays(plan.accountOpenedAt, randomInteger(rand, 0, 18) + index);
      const activatedAt = plan.activationDate
        ? addDays(contractedAt, randomInteger(rand, 0, 9))
        : null;
      const cancelledAt =
        plan.company.status === 'INACTIVE' && index > 0
          ? addDays(plan.churnedAt ?? contractedAt, index)
          : null;
      const status = cancelledAt ? 'CANCELLED' : activatedAt ? 'ACTIVE' : 'CONTRACTED';
      const sizeMultiplier =
        SIZE_WEIGHT_MAP[plan.company.companySize] *
        (plan.company.acquisitionChannel === 'LINKEDIN' ? 1.12 : 1);
      companyProducts.push({
        id: `company-product-${String(runningIndex).padStart(5, '0')}`,
        companyId: plan.company.id,
        productId: product.id,
        status,
        contractedAt: toIso(contractedAt),
        activatedAt: activatedAt ? toIso(activatedAt) : null,
        cancelledAt: cancelledAt ? toIso(cancelledAt) : null,
        monthlyRevenueProxy: roundNumber(product.monthlyBasePrice * Math.max(1, sizeMultiplier), 2),
      });
      runningIndex += 1;
    }
  }

  return companyProducts;
}

function generateConversations(companyPlans: CompanyPlan[], seed: number): Conversation[] {
  const conversations: Conversation[] = [];
  let runningIndex = 1;

  for (const plan of companyPlans) {
    const rand = createKeyedRandom(seed, `conversations:${plan.company.id}`);
    const unresolvedCount = Math.min(plan.unresolvedConversationTarget, plan.conversationCount);

    for (let index = 0; index < plan.conversationCount; index += 1) {
      const startedBase = plan.onboardingStartedAt ?? plan.accountOpeningStartedAt ?? plan.leadDate;
      const startedAt = clampDate(
        addDays(startedBase, randomInteger(rand, 0, 45)),
        HISTORY_START,
        plan.referenceDate,
      );
      const unresolved = index < unresolvedCount;
      const status = unresolved ? (index % 2 === 0 ? 'OPEN' : 'ESCALATED') : 'RESOLVED';
      const resolvedAt =
        status === 'RESOLVED'
          ? clampDate(
              addDays(startedAt, randomInteger(rand, 1, 9)),
              HISTORY_START,
              plan.referenceDate,
            )
          : null;
      conversations.push({
        id: `conversation-${String(runningIndex).padStart(5, '0')}`,
        companyId: plan.company.id,
        channel: pickWeighted(
          CONVERSATION_CHANNEL_WEIGHTS.map(([value, weight]) => ({ value, weight })),
          rand,
        ),
        status,
        subject:
          CONVERSATION_SUBJECTS[(index + runningIndex) % CONVERSATION_SUBJECTS.length] ??
          CONVERSATION_SUBJECTS[0],
        startedAt: toIso(startedAt),
        resolvedAt: resolvedAt ? toIso(resolvedAt) : null,
        ownerId: plan.company.relationshipManagerId ?? MANAGER_IDS[0],
        messageCount: 2 + randomInteger(rand, 0, 12),
      });
      runningIndex += 1;
    }
  }

  return conversations;
}

function generateCrmInteractions(
  companyPlans: CompanyPlan[],
  conversations: Conversation[],
  seed: number,
): CRMInteraction[] {
  const conversationsByCompany = groupBy(conversations, (conversation) => conversation.companyId);
  const interactions: CRMInteraction[] = [];
  let runningIndex = 1;

  for (const plan of companyPlans) {
    if (!plan.company.relationshipManagerId || plan.crmInteractionCount === 0) {
      continue;
    }

    const rand = createKeyedRandom(seed, `crm:${plan.company.id}`);
    const companyConversations = conversationsByCompany.get(plan.company.id) ?? [];

    for (let index = 0; index < plan.crmInteractionCount; index += 1) {
      const occurredBase = plan.accountOpeningStartedAt ?? plan.leadDate;
      const occurredAt = clampDate(
        addDays(occurredBase, randomInteger(rand, 0, 60)),
        HISTORY_START,
        plan.referenceDate,
      );
      const relatedConversation =
        companyConversations.length > 0
          ? companyConversations[index % companyConversations.length]
          : undefined;
      interactions.push({
        id: `crm-${String(runningIndex).padStart(5, '0')}`,
        companyId: plan.company.id,
        interactionType: pickWeighted(
          CRM_TYPE_WEIGHTS.map(([value, weight]) => ({ value, weight })),
          rand,
        ),
        direction: index % 4 === 0 ? 'INBOUND' : 'OUTBOUND',
        outcome: pickWeighted(
          CRM_OUTCOME_WEIGHTS.map(([value, weight]) => ({ value, weight })),
          rand,
        ),
        occurredAt: toIso(occurredAt),
        ownerId: plan.company.relationshipManagerId,
        relatedConversationId: relatedConversation?.id ?? null,
      });
      runningIndex += 1;
    }
  }

  return interactions;
}

function generateTouchpoints(companyPlans: CompanyPlan[], seed: number): MediaTouchpoint[] {
  const touchpoints: MediaTouchpoint[] = [];
  let runningIndex = 1;

  for (const plan of companyPlans) {
    if (!plan.acquisitionTouchpointChannel || plan.touchpointCount === 0) {
      continue;
    }

    const rand = createKeyedRandom(seed, `touchpoints:${plan.company.id}`);

    for (let index = 0; index < plan.touchpointCount; index += 1) {
      const type = pickWeighted(TOUCHPOINT_TYPE_WEIGHTS, rand);
      const daysBeforeLead = randomInteger(rand, 1, 90);
      const occurredAt = clampDate(
        addHours(addDays(plan.leadDate, -daysBeforeLead), randomInteger(rand, 0, 23)),
        HISTORY_START,
        plan.referenceDate,
      );
      const impressions =
        type === 'IMPRESSION'
          ? 200 + randomInteger(rand, 0, 2000)
          : type === 'CLICK'
            ? 80 + randomInteger(rand, 0, 220)
            : 1 + randomInteger(rand, 0, 40);
      const clicks =
        type === 'IMPRESSION'
          ? Math.max(1, Math.round(impressions * 0.02))
          : type === 'CLICK'
            ? 1 + randomInteger(rand, 0, 5)
            : type === 'LANDING_PAGE_VISIT'
              ? 1 + randomInteger(rand, 0, 2)
              : 1;
      const baseCost = plan.touchpointCostFactor;
      const cost =
        type === 'IMPRESSION'
          ? roundNumber((impressions / 1000) * baseCost, 2)
          : type === 'CLICK'
            ? roundNumber(baseCost * (0.6 + rand() * 0.7), 2)
            : type === 'LANDING_PAGE_VISIT'
              ? roundNumber(baseCost * 0.45, 2)
              : roundNumber(baseCost * 0.3, 2);

      touchpoints.push({
        id: `touchpoint-${String(runningIndex).padStart(6, '0')}`,
        companyId: plan.company.id,
        campaignId: plan.company.acquisitionCampaignId,
        channel: plan.acquisitionTouchpointChannel,
        touchpointType: type,
        occurredAt: toIso(occurredAt),
        cost,
        impressions,
        clicks,
      });
      runningIndex += 1;
    }
  }

  return touchpoints;
}

function generateFunnelEvents(companyPlans: CompanyPlan[], seed: number): FunnelEvent[] {
  const events: FunnelEvent[] = [];
  let runningIndex = 1;

  for (const plan of companyPlans) {
    const rand = createKeyedRandom(seed, `funnel:${plan.company.id}`);
    const milestones = getCompanyMilestones(plan);
    const milestoneCounts = allocateIntegerCounts({
      items: milestones,
      total: plan.funnelEventCount,
      getId: (milestone) => milestone.eventType,
      getMinimum: () => 1,
      getMaximum: () => 6,
      getWeight: (milestone) =>
        FUNNEL_EVENT_WEIGHTS.find((entry) => entry.value === milestone.eventType)?.weight ?? 1,
    });

    for (const milestone of milestones) {
      const repetitions = milestoneCounts.get(milestone.eventType) ?? 0;
      for (let index = 0; index < repetitions; index += 1) {
        const occurredAt = addHours(milestone.date, index * 6 + randomInteger(rand, 0, 4));
        events.push({
          id: `funnel-${String(runningIndex).padStart(6, '0')}`,
          companyId: plan.company.id,
          eventType: milestone.eventType,
          occurredAt: toIso(clampDate(occurredAt, HISTORY_START, plan.referenceDate)),
          sourceChannel: plan.company.acquisitionChannel,
          campaignId: plan.company.acquisitionCampaignId,
        });
        runningIndex += 1;
      }
    }
  }

  return events;
}

function generateDigitalEvents(
  companyPlans: CompanyPlan[],
  companyProducts: CompanyProduct[],
  seed: number,
): DigitalEvent[] {
  const productsByCompany = groupBy(companyProducts, (product) => product.companyId);
  const events: DigitalEvent[] = [];
  let runningIndex = 1;

  for (const plan of companyPlans) {
    if (!plan.accountOpenedAt || plan.digitalEventCount === 0) {
      continue;
    }

    const rand = createKeyedRandom(seed, `digital:${plan.company.id}`);
    const ownedProducts = productsByCompany.get(plan.company.id) ?? [];

    for (let index = 0; index < plan.digitalEventCount; index += 1) {
      const occurredBase = plan.activationDate ?? plan.accountOpenedAt;
      const occurredAt = clampDate(
        addDays(occurredBase, randomInteger(rand, 0, 150)),
        HISTORY_START,
        plan.referenceDate,
      );
      const eventType = pickWeighted(
        DIGITAL_EVENT_TYPE_WEIGHTS.map(([value, weight]) => ({ value, weight })),
        rand,
      );
      const linkedProduct =
        ownedProducts.length > 0 ? ownedProducts[index % ownedProducts.length] : undefined;
      events.push({
        id: `digital-${String(runningIndex).padStart(6, '0')}`,
        companyId: plan.company.id,
        eventType,
        channel: pickWeighted(
          DIGITAL_CHANNEL_WEIGHTS.map(([value, weight]) => ({ value, weight })),
          rand,
        ),
        productId: linkedProduct?.productId ?? null,
        occurredAt: toIso(occurredAt),
        sessionId: `${plan.company.id}-session-${String(index + 1).padStart(3, '0')}`,
        value:
          eventType === 'TRANSACTION'
            ? roundNumber(150 + rand() * 8500 * plan.revenueWeight, 2)
            : eventType === 'ERROR'
              ? roundNumber(1 + rand() * 9, 2)
              : null,
      });
      runningIndex += 1;
    }
  }

  return events;
}

/** Companies with an open account, weighted by how intensely they use the bank. */
function allocateActiveUsage(companyPlans: CompanyPlan[], total: number, maximum: number) {
  return allocateIntegerCounts({
    items: companyPlans,
    total,
    getId: (plan) => plan.company.id,
    getMinimum: (plan) => (plan.accountOpenedAt ? 1 : 0),
    getMaximum: (plan) => (plan.accountOpenedAt ? maximum : 0),
    getWeight: (plan) =>
      plan.accountOpenedAt
        ? 1 +
          SIZE_WEIGHT_MAP[plan.company.companySize] * 2 +
          (plan.activationDate ? 6 : 0) +
          plan.revenueWeight * 2 -
          (plan.churnedAt ? 3 : 0)
        : 0,
  });
}

/** Moment after the account is open when a company uses the bank, bounded by the history. */
function usageDate(plan: CompanyPlan, rand: () => number) {
  const start = plan.activationDate ?? plan.accountOpenedAt ?? plan.leadDate;
  const end =
    plan.churnedAt && plan.churnedAt < plan.referenceDate ? plan.churnedAt : plan.referenceDate;
  return clampDate(randomDateBetween(rand, start, end > start ? end : start), HISTORY_START, end);
}

/** Itaú Empresas app telemetry: screen views, clicks, completions, abandons and errors. */
function generateAppNavigation(
  companyPlans: CompanyPlan[],
  total: number,
  seed: number,
): AppNavigationEvent[] {
  const counts = allocateActiveUsage(companyPlans, total, 120);
  const events: AppNavigationEvent[] = [];
  let runningIndex = 1;

  for (const plan of companyPlans) {
    const count = counts.get(plan.company.id) ?? 0;
    if (count === 0) continue;

    const rand = createKeyedRandom(seed, `app:${plan.company.id}`);
    const platform = rand() < 0.57 ? 'ANDROID' : 'IOS';
    let sessionIndex = 0;
    let sessionStart = usageDate(plan, rand);

    for (let index = 0; index < count; index += 1) {
      // A session groups 3-8 consecutive screens a few seconds apart.
      if (index % (3 + (sessionIndex % 6)) === 0) {
        sessionIndex += 1;
        sessionStart = usageDate(plan, rand);
      }
      const screen = pickWeighted(
        APP_SCREEN_WEIGHTS.map(([value, weight]) => ({ value, weight })),
        rand,
      );
      const action = pickWeighted(
        APP_ACTION_WEIGHTS.map(([value, weight]) => ({ value, weight })),
        rand,
      );
      const durationSeconds = Math.max(
        2,
        Math.round(APP_SCREEN_SECONDS[screen] * (0.4 + rand() * 1.4)),
      );
      events.push({
        id: `app-${String(runningIndex).padStart(7, '0')}`,
        companyId: plan.company.id,
        sessionId: `${plan.company.id}-app-${String(sessionIndex).padStart(4, '0')}`,
        screen,
        action,
        platform,
        appVersion: APP_VERSIONS[Math.floor(rand() * APP_VERSIONS.length)] ?? APP_VERSIONS[0],
        durationSeconds,
        occurredAt: toIso(
          clampDate(
            new Date(sessionStart.getTime() + (index % 8) * 40_000),
            HISTORY_START,
            plan.referenceDate,
          ),
        ),
      });
      runningIndex += 1;
    }
  }

  return events;
}

/** Pix, boletos, TED and card transactions (amounts only; no counterpart data). */
function generateTransactions(
  companyPlans: CompanyPlan[],
  total: number,
  seed: number,
): Transaction[] {
  const counts = allocateActiveUsage(companyPlans, total, 80);
  const transactions: Transaction[] = [];
  let runningIndex = 1;

  for (const plan of companyPlans) {
    const count = counts.get(plan.company.id) ?? 0;
    if (count === 0) continue;

    const rand = createKeyedRandom(seed, `transactions:${plan.company.id}`);
    for (let index = 0; index < count; index += 1) {
      const transactionType = pickWeighted(
        TRANSACTION_TYPE_WEIGHTS.map(([value, weight]) => ({ value, weight })),
        rand,
      );
      // Log-normal-ish ticket: most values near the median, a long tail of large payments.
      const spread = Math.exp((rand() - 0.5) * 2.2);
      transactions.push({
        id: `trx-${String(runningIndex).padStart(7, '0')}`,
        companyId: plan.company.id,
        transactionType,
        channel: pickWeighted(
          TRANSACTION_CHANNEL_WEIGHTS.map(([value, weight]) => ({ value, weight })),
          rand,
        ),
        amount: roundNumber(
          TRANSACTION_TICKET[transactionType] * (0.6 + plan.revenueWeight * 0.5) * spread,
          2,
        ),
        occurredAt: toIso(usageDate(plan, rand)),
      });
      runningIndex += 1;
    }
  }

  return transactions;
}

/**
 * NPS answers (0-10, no free text). Fast onboarding and resolved service raise the score;
 * unresolved conversations lower it, so detractors correlate with service problems.
 */
function generateNpsResponses(
  companyPlans: CompanyPlan[],
  conversations: Conversation[],
  total: number,
  seed: number,
): NpsResponse[] {
  const unresolved = new Map<string, number>();
  for (const conversation of conversations) {
    if (conversation.status !== 'RESOLVED') {
      unresolved.set(conversation.companyId, (unresolved.get(conversation.companyId) ?? 0) + 1);
    }
  }
  const counts = allocateActiveUsage(companyPlans, total, 4);
  const responses: NpsResponse[] = [];
  let runningIndex = 1;

  for (const plan of companyPlans) {
    const count = counts.get(plan.company.id) ?? 0;
    if (count === 0) continue;

    const rand = createKeyedRandom(seed, `nps:${plan.company.id}`);
    const base =
      8.5 +
      (plan.fastOnboarding ? 0.9 : -0.3) +
      (plan.activationDate ? 0.5 : -0.6) -
      Math.min(3, (unresolved.get(plan.company.id) ?? 0) * 1.1);
    for (let index = 0; index < count; index += 1) {
      responses.push({
        id: `nps-${String(runningIndex).padStart(6, '0')}`,
        companyId: plan.company.id,
        touchpoint: pickWeighted(
          NPS_TOUCHPOINT_WEIGHTS.map(([value, weight]) => ({ value, weight })),
          rand,
        ),
        score: Math.round(clamp(base + (rand() - 0.5) * 4, 0, 10)),
        respondedAt: toIso(usageDate(plan, rand)),
      });
      runningIndex += 1;
    }
  }

  return responses;
}

function buildCompanyChannels(total: number, seed: number) {
  const allocations = allocateByWeights(
    total,
    Object.entries(CHANNEL_PROFILES).map(([channel, profile]) => ({
      key: channel as keyof typeof CHANNEL_PROFILES,
      weight: profile.companyWeight,
      minimum: channel === 'ORGANIC' || channel === 'LINKEDIN' ? 1 : 0,
    })),
  );
  const channels = Object.entries(CHANNEL_PROFILES).flatMap(([channel]) =>
    Array.from(
      { length: allocations.get(channel as keyof typeof CHANNEL_PROFILES) ?? 0 },
      () => channel as keyof typeof CHANNEL_PROFILES,
    ),
  );

  return shuffle(channels, mulberry32(seed));
}

function getCompanyMilestones(plan: CompanyPlan) {
  const milestones: Array<{ eventType: FunnelEventType; date: Date }> = [
    { eventType: 'LEAD_CREATED', date: plan.leadDate },
  ];
  if (plan.qualified) {
    milestones.push({ eventType: 'QUALIFIED', date: addHours(plan.leadDate, 12) });
  }
  if (plan.accountOpeningStartedAt) {
    milestones.push({ eventType: 'ACCOUNT_OPENING_STARTED', date: plan.accountOpeningStartedAt });
  }
  if (plan.accountOpenedAt) {
    milestones.push({ eventType: 'ACCOUNT_OPENED', date: plan.accountOpenedAt });
  }
  if (plan.onboardingStartedAt) {
    milestones.push({ eventType: 'ONBOARDING_STARTED', date: plan.onboardingStartedAt });
  }
  if (plan.onboardingCompletedAt) {
    milestones.push({ eventType: 'ONBOARDING_COMPLETED', date: plan.onboardingCompletedAt });
  }
  if (plan.activationDate) {
    milestones.push({ eventType: 'ACTIVATED', date: plan.activationDate });
  }
  if (plan.churnedAt) {
    milestones.push({ eventType: 'CHURNED', date: plan.churnedAt });
  }

  return milestones;
}

function allocateByWeights<TKey extends string>(
  total: number,
  specs: Array<{ key: TKey; weight: number; minimum: number }>,
) {
  const result = new Map<TKey, number>();
  const totalMinimum = specs.reduce((sum, spec) => sum + spec.minimum, 0);
  let remaining = total - totalMinimum;

  for (const spec of specs) {
    result.set(spec.key, spec.minimum);
  }

  const weightSum = specs.reduce((sum, spec) => sum + spec.weight, 0);
  const distributable = remaining;
  const provisional = specs.map((spec) => {
    const desired = distributable > 0 ? (distributable * spec.weight) / weightSum : 0;
    const floorValue = Math.floor(desired);
    result.set(spec.key, (result.get(spec.key) ?? 0) + floorValue);
    remaining -= floorValue;
    return { key: spec.key, remainder: desired - floorValue };
  });

  provisional
    .sort((left, right) => right.remainder - left.remainder)
    .slice(0, remaining)
    .forEach((item) => {
      result.set(item.key, (result.get(item.key) ?? 0) + 1);
    });

  return result;
}

function allocateIntegerCounts<TItem>(input: {
  items: TItem[];
  total: number;
  getId: (item: TItem) => string;
  getMinimum: (item: TItem) => number;
  getMaximum: (item: TItem) => number;
  getWeight: (item: TItem) => number;
}) {
  const result = new Map<string, number>();
  const capacities = new Map<string, number>();
  let assigned = 0;

  for (const item of input.items) {
    const id = input.getId(item);
    const minimum = Math.min(input.getMinimum(item), input.getMaximum(item));
    const maximum = Math.max(minimum, input.getMaximum(item));
    result.set(id, minimum);
    capacities.set(id, maximum - minimum);
    assigned += minimum;
  }

  let remaining = input.total - assigned;
  while (remaining > 0) {
    const eligible = input.items
      .map((item) => ({
        item,
        id: input.getId(item),
        current: result.get(input.getId(item)) ?? 0,
        capacity: capacities.get(input.getId(item)) ?? 0,
        weight: input.getWeight(item),
      }))
      .filter((entry) => entry.capacity > 0 && entry.weight > 0);

    if (eligible.length === 0) {
      break;
    }

    const weightSum = eligible.reduce((sum, entry) => sum + entry.weight, 0);
    const distributable = remaining;
    let distributed = 0;
    const remainders: Array<{ id: string; remainder: number }> = [];

    for (const entry of eligible) {
      const desired = (distributable * entry.weight) / weightSum;
      const baseExtra = Math.min(entry.capacity, Math.floor(desired));
      result.set(entry.id, entry.current + baseExtra);
      capacities.set(entry.id, entry.capacity - baseExtra);
      remaining -= baseExtra;
      distributed += baseExtra;
      remainders.push({ id: entry.id, remainder: desired - baseExtra });
    }

    if (remaining <= 0) {
      break;
    }

    remainders
      .sort((left, right) => right.remainder - left.remainder || left.id.localeCompare(right.id))
      .forEach((entry) => {
        if (remaining <= 0) {
          return;
        }
        const capacity = capacities.get(entry.id) ?? 0;
        if (capacity <= 0) {
          return;
        }
        result.set(entry.id, (result.get(entry.id) ?? 0) + 1);
        capacities.set(entry.id, capacity - 1);
        remaining -= 1;
        distributed += 1;
      });

    if (distributed === 0) {
      break;
    }
  }

  return result;
}

/** Varied, clearly synthetic trade names (e.g. "Ponto Reis Armazenagem"). */
function buildTradeName(index: number, root: string, industry: string) {
  const prefix = COMPANY_NAME_PREFIXES[(index * 7 + 3) % COMPANY_NAME_PREFIXES.length]!;
  // The showcase brand is reserved for the Cliente PJ 360 demo company.
  return index % 3 === 0
    ? `${root} ${industry}`
    : `${prefix === 'Atlas' ? 'Nova' : prefix} ${root} ${industry}`;
}

function buildMaskedCnpj(index: number) {
  const digits = String(10000000 + index).padStart(8, '0');
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/0001-**`;
}

function resolveRiskProfile(
  rand: () => number,
  size: CompanySize,
  revenueRange: AnnualRevenueRange,
): RiskProfile {
  const score = rand() + REVENUE_INDEX[revenueRange] * 0.08 - (size === 'MEI' ? 0.1 : 0);
  if (score < 0.44) {
    return 'LOW';
  }
  if (score < 0.78) {
    return 'MEDIUM';
  }
  return 'HIGH';
}

function adjustRevenueRange(
  size: CompanySize,
  channel: keyof typeof CHANNEL_PROFILES,
  rand: () => number,
): AnnualRevenueRange {
  const base = [...COMPANY_SIZE_TO_REVENUE_RANGE[size]];
  const baseIndex = Math.floor(rand() * base.length);
  const baseValue = base[baseIndex] ?? base[0] ?? 'ATE_360K';
  const currentIndex = REVENUE_INDEX[baseValue];
  const bump = channel === 'LINKEDIN' ? 1 : 0;
  const cappedIndex = Math.min(Object.keys(REVENUE_INDEX).length - 1, currentIndex + bump);
  return (Object.entries(REVENUE_INDEX).find(([, value]) => value === cappedIndex)?.[0] ??
    baseValue) as AnnualRevenueRange;
}

function resolveUnresolvedConversationTarget(
  rand: () => number,
  channel: keyof typeof CHANNEL_PROFILES,
  size: CompanySize,
) {
  const frictionScore =
    rand() +
    (channel === 'META' ? 0.18 : 0) +
    (channel === 'INSIDE_SALES' ? 0.12 : 0) -
    (size === 'Grande' ? 0.08 : 0);
  if (frictionScore > 1.02) {
    return 3;
  }
  if (frictionScore > 0.82) {
    return 2;
  }
  if (frictionScore > 0.58) {
    return 1;
  }
  return 0;
}

function resolveCompanyStatus(input: {
  accountOpeningStartedAt: Date | null;
  accountOpenedAt: Date | null;
  onboardingCompletedAt: Date | null;
  activationDate: Date | null;
  churnedAt: Date | null;
}): CompanyStatus {
  if (input.activationDate && input.churnedAt) {
    return 'INACTIVE';
  }
  if (input.activationDate) {
    return 'ACTIVE';
  }
  if (input.accountOpenedAt || input.onboardingCompletedAt) {
    return 'ONBOARDING';
  }
  if (input.accountOpeningStartedAt) {
    return 'ACCOUNT_OPENING';
  }
  return 'LEAD';
}

function resolveCampaignStatus(endDate: Date, referenceDate: Date): CampaignStatus {
  const diffDays = (referenceDate.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays < -3) {
    return 'PLANNED';
  }
  if (diffDays <= 7) {
    return 'ACTIVE';
  }
  return 'COMPLETED';
}

function resolveProductCap(size: CompanySize) {
  switch (size) {
    case 'MEI':
      return 3;
    case 'Micro':
      return 4;
    case 'Pequena':
      return 5;
    case 'Média':
      return 6;
    case 'Grande':
      return 5;
    default:
      return 4;
  }
}

function pickOnboardingDuration(rand: () => number, channel: keyof typeof CHANNEL_PROFILES) {
  const fastBias =
    channel === 'ORGANIC' || channel === 'GOOGLE_SEARCH' ? 0.62 : channel === 'META' ? 0.35 : 0.48;
  return rand() < fastBias ? randomInteger(rand, 1, 3) : randomInteger(rand, 4, 8);
}

function formatCampaignChannel(channel: CampaignChannel) {
  return channel === 'GOOGLE_SEARCH'
    ? 'Google Search'
    : channel === 'LINKEDIN'
      ? 'LinkedIn'
      : channel === 'META'
        ? 'Meta'
        : channel === 'ORGANIC'
          ? 'Orgânico'
          : 'Email';
}

function isCampaignChannel(value: string): value is CampaignChannel {
  return ['GOOGLE_SEARCH', 'LINKEDIN', 'META', 'ORGANIC', 'EMAIL'].includes(value);
}

function randomInteger(rand: () => number, min: number, max: number) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function randomDateBetween(rand: () => number, start: Date, end: Date) {
  const delta = end.getTime() - start.getTime();
  return new Date(start.getTime() + Math.floor(rand() * delta));
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function clampDate(date: Date, min: Date, max: Date) {
  if (date < min) {
    return new Date(min.getTime());
  }
  if (date > max) {
    return new Date(max.getTime());
  }
  return date;
}

function nullIfAfter(date: Date, max: Date) {
  return date > max ? null : date;
}

function toIso(date: Date) {
  return date.toISOString();
}

function roundNumber(value: number, digits: number) {
  return Number(value.toFixed(digits));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function pickWeighted<TValue>(items: readonly WeightedValue<TValue>[], rand: () => number) {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  let cursor = rand() * totalWeight;

  for (const item of items) {
    cursor -= item.weight;
    if (cursor <= 0) {
      return item.value;
    }
  }

  return items[items.length - 1]!.value;
}

function shuffle<TValue>(items: TValue[], rand: () => number) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rand() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex]!, copy[index]!];
  }
  return copy;
}

function sortById<TValue extends { id: string }>(items: TValue[]) {
  return [...items].sort((left, right) => left.id.localeCompare(right.id));
}

function groupBy<TValue, TKey>(items: TValue[], getKey: (item: TValue) => TKey) {
  const groups = new Map<TKey, TValue[]>();
  for (const item of items) {
    const key = getKey(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}
