import { NotFoundError } from '@api/common/errors';
import type { DatasetRepository } from '@api/repositories/types';
import type {
  Account,
  Company,
  CompanyProduct,
  Conversation,
  CRMInteraction,
  DigitalEvent,
  FunnelEvent,
  MediaCampaign,
  MediaTouchpoint,
  Partner,
  Product,
} from '@bfp/domain';

/** Curated, chronological milestone shown in the Cliente PJ 360 journey. */
export interface JourneyMilestone {
  id: string;
  occurredAt: string;
  kind:
    | 'media'
    | 'site'
    | 'lead'
    | 'opening'
    | 'account'
    | 'onboarding'
    | 'transaction'
    | 'product'
    | 'crm'
    | 'activation';
  title: string;
  category: string;
  source: string;
}

const CHANNEL_MEDIA_LABEL: Record<string, string> = {
  GOOGLE_SEARCH: 'Google Ads',
  META: 'Meta Ads',
  LINKEDIN: 'LinkedIn Ads',
  ORGANIC: 'Busca orgânica',
  EMAIL: 'E-mail marketing',
};

const PRODUCT_CATEGORY_LABEL: Record<Product['category'], string> = {
  BANKING: 'Contas PJ',
  CREDIT: 'Crédito PJ',
  PAYMENTS: 'Pagamentos PJ',
  INSURANCE: 'Seguros PJ',
  BENEFITS: 'Benefícios PJ',
};

const DAY_MS = 24 * 60 * 60 * 1000;

function buildJourney(input: {
  company: Company;
  touchpoints: MediaTouchpoint[];
  companyProducts: CompanyProduct[];
  productById: Map<string, Product>;
  crm: CRMInteraction[];
  digitalEvents: DigitalEvent[];
}): JourneyMilestone[] {
  const { company } = input;
  const milestones: JourneyMilestone[] = [];
  const push = (milestone: JourneyMilestone | null) => {
    if (milestone) {
      milestones.push(milestone);
    }
  };

  const firstImpression = input.touchpoints.find(
    (touchpoint) => touchpoint.touchpointType === 'IMPRESSION',
  );
  if (firstImpression) {
    const media = CHANNEL_MEDIA_LABEL[firstImpression.channel] ?? firstImpression.channel;
    push({
      id: `media:${firstImpression.id}`,
      occurredAt: firstImpression.occurredAt,
      kind: 'media',
      title: `Exposição ${media}`,
      category: 'Mídia',
      source: media,
    });
  }

  const firstVisit = input.touchpoints.find(
    (touchpoint) =>
      (touchpoint.touchpointType === 'LANDING_PAGE_VISIT' ||
        touchpoint.touchpointType === 'CLICK') &&
      (!firstImpression || touchpoint.occurredAt >= firstImpression.occurredAt),
  );
  if (firstVisit) {
    push({
      id: `site:${firstVisit.id}`,
      occurredAt: firstVisit.occurredAt,
      kind: 'site',
      title: 'Visita ao site',
      category: 'Jornada digital',
      source: 'FullStory · Site Itaú Empresas',
    });
  }

  push({
    id: `lead:${company.id}`,
    occurredAt: company.leadCreatedAt,
    kind: 'lead',
    title: 'Lead criado',
    category: 'Aquisição',
    source: 'CRM',
  });
  push(
    company.accountOpeningStartedAt
      ? {
          id: `opening:${company.id}`,
          occurredAt: company.accountOpeningStartedAt,
          kind: 'opening',
          title: 'Início da abertura',
          category: 'Abertura de contas',
          source: 'Jornada digital',
        }
      : null,
  );
  push(
    company.accountOpenedAt
      ? {
          id: `account:${company.id}`,
          occurredAt: company.accountOpenedAt,
          kind: 'account',
          title: 'Conta aberta',
          category: 'Abertura de contas',
          source: 'Cadastro PJ',
        }
      : null,
  );
  push(
    company.onboardingCompletedAt
      ? {
          id: `onboarding:${company.id}`,
          occurredAt: company.onboardingCompletedAt,
          kind: 'onboarding',
          title: 'Onboarding concluído',
          category: 'Onboarding',
          source: 'Operação PJ',
        }
      : null,
  );

  const firstLogin = input.digitalEvents.find((event) => event.eventType === 'LOGIN');
  if (firstLogin) {
    push({
      id: `login:${firstLogin.id}`,
      occurredAt: firstLogin.occurredAt,
      kind: 'site',
      title:
        firstLogin.channel === 'APP'
          ? 'Primeiro acesso ao App Itaú Empresas'
          : firstLogin.channel === 'BANKLINE'
            ? 'Primeiro acesso ao Bankline'
            : 'Primeiro acesso via API',
      category: 'Jornada digital',
      source: 'FullStory',
    });
  }

  const firstTransaction = input.digitalEvents.find((event) => event.eventType === 'TRANSACTION');
  if (firstTransaction) {
    const product = firstTransaction.productId
      ? input.productById.get(firstTransaction.productId)
      : undefined;
    const isPix = product?.name.toLowerCase().includes('pix') ?? false;
    push({
      id: `transaction:${firstTransaction.id}`,
      occurredAt: firstTransaction.occurredAt,
      kind: 'transaction',
      title: isPix ? 'Primeiro Pix' : 'Primeira transação',
      category: 'Transações',
      source: product?.shortName ?? 'Conta PJ',
    });
  }

  for (const item of input.companyProducts) {
    const product = input.productById.get(item.productId);
    if (!product || product.category === 'BANKING') {
      continue;
    }

    push({
      id: `product:${item.id}`,
      occurredAt: item.contractedAt,
      kind: 'product',
      title: `${product.shortName} contratado`,
      category: 'Produtos',
      source: PRODUCT_CATEGORY_LABEL[product.category],
    });
  }

  const lastCrm = input.crm[input.crm.length - 1];
  if (lastCrm) {
    push({
      id: `crm:${lastCrm.id}`,
      occurredAt: lastCrm.occurredAt,
      kind: 'crm',
      title: 'Interação CRM',
      category: 'Relacionamento',
      source: 'CRM Empresas',
    });
  }

  return milestones.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
}

function buildSummary(input: {
  company: Company;
  activeProducts: number;
  lastInteractionAt: string | null;
}) {
  const { company } = input;
  const onboardingDays =
    company.accountOpenedAt && company.onboardingCompletedAt
      ? Math.max(
          0,
          Math.round(
            (new Date(company.onboardingCompletedAt).getTime() -
              new Date(company.accountOpenedAt).getTime()) /
              DAY_MS,
          ),
        )
      : null;
  const activatedD30 =
    company.accountOpenedAt && company.activationDate
      ? new Date(company.activationDate).getTime() - new Date(company.accountOpenedAt).getTime() <=
        30 * DAY_MS
      : false;

  return {
    acquisitionChannel: company.acquisitionChannel,
    accountOpenedAt: company.accountOpenedAt,
    onboardingStatus: company.onboardingCompletedAt
      ? 'COMPLETED'
      : company.onboardingStartedAt
        ? 'IN_PROGRESS'
        : 'NOT_STARTED',
    onboardingDays,
    activatedD30,
    activeProducts: input.activeProducts,
    lastInteractionAt: input.lastInteractionAt,
  };
}

function byOccurredAt<T extends { occurredAt: string }>(left: T, right: T) {
  return left.occurredAt.localeCompare(right.occurredAt);
}

function pushTimelineEvent(
  timeline: Array<Record<string, unknown>>,
  entityType: string,
  id: string,
  eventAt: string | null | undefined,
  label: string,
  payload: Record<string, unknown>,
) {
  if (!eventAt) {
    return;
  }

  timeline.push({
    id: `${entityType}:${id}:${label}`,
    entityType,
    eventAt,
    label,
    payload,
  });
}

export async function buildCustomer360(datasetRepository: DatasetRepository, companyId: string) {
  const company = await datasetRepository.getById<Company>('company', companyId);
  if (!company) {
    throw new NotFoundError('Customer not found.');
  }

  const [
    partners,
    accounts,
    companyProducts,
    touchpoints,
    funnelEvents,
    crmInteractions,
    conversations,
    digitalEvents,
    campaigns,
    products,
  ] = await Promise.all([
    datasetRepository.listByCompany(companyId, { entityTypes: ['partner'] }),
    datasetRepository.listByCompany(companyId, { entityTypes: ['account'] }),
    datasetRepository.listByCompany(companyId, { entityTypes: ['companyProduct'] }),
    datasetRepository.listByCompany(companyId, { entityTypes: ['touchpoint'] }),
    datasetRepository.listByCompany(companyId, { entityTypes: ['funnelEvent'] }),
    datasetRepository.listByCompany(companyId, { entityTypes: ['crmInteraction'] }),
    datasetRepository.listByCompany(companyId, { entityTypes: ['conversation'] }),
    datasetRepository.listByCompany(companyId, { entityTypes: ['digitalEvent'] }),
    datasetRepository.listByType('campaign'),
    datasetRepository.listByType('product'),
  ]);

  const companyPartners = partners as Partner[];
  const companyAccounts = accounts as Account[];
  const companyProductLinks = companyProducts as CompanyProduct[];
  const companyTouchpoints = (touchpoints as MediaTouchpoint[]).sort(byOccurredAt);
  const companyFunnelEvents = (funnelEvents as FunnelEvent[]).sort(byOccurredAt);
  const companyCrmInteractions = (crmInteractions as CRMInteraction[]).sort(byOccurredAt);
  const companyConversations = (conversations as Conversation[]).sort((left, right) =>
    left.startedAt.localeCompare(right.startedAt),
  );
  const companyDigitalEvents = (digitalEvents as DigitalEvent[]).sort(byOccurredAt);
  const typedCampaigns = campaigns as MediaCampaign[];
  const typedProducts = products as Product[];

  const productById = new Map(typedProducts.map((product) => [product.id, product]));
  const campaignIds = new Set(
    [...companyTouchpoints, ...companyFunnelEvents]
      .map((entry) => entry.campaignId)
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  );
  const relatedCampaigns = typedCampaigns.filter((campaign) => campaignIds.has(campaign.id));

  const timeline: Array<Record<string, unknown>> = [];
  pushTimelineEvent(timeline, 'company', company.id, company.leadCreatedAt, 'lead_created', {
    company,
  });
  pushTimelineEvent(
    timeline,
    'company',
    company.id,
    company.accountOpeningStartedAt,
    'account_opening_started',
    { company },
  );
  pushTimelineEvent(timeline, 'company', company.id, company.accountOpenedAt, 'account_opened', {
    company,
  });
  pushTimelineEvent(
    timeline,
    'company',
    company.id,
    company.onboardingStartedAt,
    'onboarding_started',
    { company },
  );
  pushTimelineEvent(
    timeline,
    'company',
    company.id,
    company.onboardingCompletedAt,
    'onboarding_completed',
    { company },
  );
  pushTimelineEvent(timeline, 'company', company.id, company.activationDate, 'activated', {
    company,
  });

  for (const partner of companyPartners) {
    pushTimelineEvent(timeline, 'partner', partner.id, partner.joinedAt, 'partner_joined', {
      partner,
    });
  }

  for (const account of companyAccounts) {
    pushTimelineEvent(timeline, 'account', account.id, account.createdAt, 'account_created', {
      account,
    });
    pushTimelineEvent(timeline, 'account', account.id, account.openedAt, 'account_opened', {
      account,
    });
    pushTimelineEvent(timeline, 'account', account.id, account.closedAt, 'account_closed', {
      account,
    });
  }

  for (const companyProduct of companyProductLinks) {
    pushTimelineEvent(
      timeline,
      'companyProduct',
      companyProduct.id,
      companyProduct.contractedAt,
      'product_contracted',
      { companyProduct },
    );
    pushTimelineEvent(
      timeline,
      'companyProduct',
      companyProduct.id,
      companyProduct.activatedAt,
      'product_activated',
      { companyProduct },
    );
    pushTimelineEvent(
      timeline,
      'companyProduct',
      companyProduct.id,
      companyProduct.cancelledAt,
      'product_cancelled',
      { companyProduct },
    );
  }

  for (const touchpoint of companyTouchpoints) {
    pushTimelineEvent(
      timeline,
      'touchpoint',
      touchpoint.id,
      touchpoint.occurredAt,
      touchpoint.touchpointType.toLowerCase(),
      { touchpoint },
    );
  }

  for (const funnelEvent of companyFunnelEvents) {
    pushTimelineEvent(
      timeline,
      'funnelEvent',
      funnelEvent.id,
      funnelEvent.occurredAt,
      funnelEvent.eventType.toLowerCase(),
      { funnelEvent },
    );
  }

  for (const interaction of companyCrmInteractions) {
    pushTimelineEvent(
      timeline,
      'crmInteraction',
      interaction.id,
      interaction.occurredAt,
      interaction.interactionType.toLowerCase(),
      { interaction },
    );
  }

  for (const conversation of companyConversations) {
    pushTimelineEvent(
      timeline,
      'conversation',
      conversation.id,
      conversation.startedAt,
      'conversation_started',
      { conversation },
    );
    pushTimelineEvent(
      timeline,
      'conversation',
      conversation.id,
      conversation.resolvedAt,
      'conversation_resolved',
      { conversation },
    );
  }

  for (const digitalEvent of companyDigitalEvents) {
    pushTimelineEvent(
      timeline,
      'digitalEvent',
      digitalEvent.id,
      digitalEvent.occurredAt,
      digitalEvent.eventType.toLowerCase(),
      { digitalEvent },
    );
  }

  timeline.sort((left, right) => String(left.eventAt).localeCompare(String(right.eventAt)));

  const journey = buildJourney({
    company,
    touchpoints: companyTouchpoints,
    companyProducts: [...companyProductLinks].sort((left, right) =>
      left.contractedAt.localeCompare(right.contractedAt),
    ),
    productById,
    crm: companyCrmInteractions,
    digitalEvents: companyDigitalEvents,
  });
  const lastInteractionAt =
    [
      companyCrmInteractions[companyCrmInteractions.length - 1]?.occurredAt,
      companyConversations[companyConversations.length - 1]?.startedAt,
      companyDigitalEvents[companyDigitalEvents.length - 1]?.occurredAt,
    ]
      .filter((value): value is string => Boolean(value))
      .sort()
      .pop() ?? null;

  return {
    company,
    partners: companyPartners,
    accounts: companyAccounts,
    products: companyProductLinks.map((companyProduct) => ({
      companyProduct,
      product: productById.get(companyProduct.productId) ?? null,
    })),
    campaigns: relatedCampaigns,
    touchpoints: companyTouchpoints,
    funnel: companyFunnelEvents,
    crm: companyCrmInteractions,
    conversations: companyConversations,
    digitalEvents: companyDigitalEvents,
    timeline,
    journey,
    summary: buildSummary({
      company,
      activeProducts: companyProductLinks.filter((item) => item.status !== 'CANCELLED').length,
      lastInteractionAt,
    }),
  };
}
