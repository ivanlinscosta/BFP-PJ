import type { Company, DatasetBundle } from '@bfp/domain';

export interface CoherenceAssertion {
  name: string;
  passed: boolean;
  details: string;
}

/** Evaluates the mandatory synthetic-data business narratives from architecture §13. */
export function evaluateCoherence(bundle: DatasetBundle): CoherenceAssertion[] {
  const byChannel = buildChannelMetrics(bundle);
  const google = byChannel.GOOGLE_SEARCH;
  const linkedin = byChannel.LINKEDIN;
  const organic = byChannel.ORGANIC;
  const meta = byChannel.META;
  const productAverages = buildProductsPerCompany(bundle);
  const activationRates = buildActivationRates(bundle);

  return [
    {
      name: 'Google Search: volume médio, boa conversão, CAC intermediário',
      passed:
        google.companyCount > organic.companyCount &&
        google.companyCount < meta.companyCount &&
        google.conversionRate > meta.conversionRate &&
        google.cac > organic.cac &&
        google.cac < linkedin.cac,
      details: `volume=${google.companyCount}, conv=${google.conversionRate.toFixed(3)}, cac=${google.cac.toFixed(2)}`,
    },
    {
      name: 'LinkedIn: menor volume, CAC alto, empresas maiores e maior receita potencial',
      passed:
        linkedin.companyCount < google.companyCount &&
        linkedin.cac > google.cac &&
        linkedin.averageSizeScore > google.averageSizeScore &&
        linkedin.averageRevenueScore > google.averageRevenueScore,
      details: `volume=${linkedin.companyCount}, cac=${linkedin.cac.toFixed(2)}, porte=${linkedin.averageSizeScore.toFixed(2)}, receita=${linkedin.averageRevenueScore.toFixed(2)}`,
    },
    {
      name: 'Organic: CAC muito baixo e boa conversão',
      passed:
        organic.cac < google.cac * 0.2 && organic.conversionRate >= google.conversionRate * 0.9,
      details: `cac=${organic.cac.toFixed(2)}, conv=${organic.conversionRate.toFixed(3)}`,
    },
    {
      name: 'Funil realista: conversão lead → conta entre 5% e 20% por canal',
      passed: [google, linkedin, organic, meta].every(
        (channel) => channel.conversionRate >= 0.05 && channel.conversionRate <= 0.2,
      ),
      details: `google=${google.conversionRate.toFixed(3)}, organic=${organic.conversionRate.toFixed(3)}, meta=${meta.conversionRate.toFixed(3)}, linkedin=${linkedin.conversionRate.toFixed(3)}`,
    },
    {
      name: 'Meta: alto volume e conversão inferior a Google Search',
      passed:
        meta.companyCount > google.companyCount && meta.conversionRate < google.conversionRate,
      details: `volume=${meta.companyCount}, conv=${meta.conversionRate.toFixed(3)}`,
    },
    {
      name: 'Empresas médias contratam mais produtos',
      passed:
        productAverages.Média > productAverages.Pequena &&
        productAverages.Média > productAverages.Grande,
      details: `MEI=${productAverages.MEI.toFixed(2)}, Micro=${productAverages.Micro.toFixed(2)}, Pequena=${productAverages.Pequena.toFixed(2)}, Média=${productAverages.Média.toFixed(2)}, Grande=${productAverages.Grande.toFixed(2)}`,
    },
    {
      name: 'Onboarding ≤3 dias aumenta ativação D30',
      passed: activationRates.fastOnboarding > activationRates.slowOnboarding,
      details: `até3d=${activationRates.fastOnboarding.toFixed(3)}, acima3d=${activationRates.slowOnboarding.toFixed(3)}`,
    },
    {
      name: '>1 conversa não resolvida reduz ativação D30',
      passed: activationRates.lowUnresolved > activationRates.highUnresolved,
      details: `até1=${activationRates.lowUnresolved.toFixed(3)}, acima1=${activationRates.highUnresolved.toFixed(3)}`,
    },
  ];
}

function buildChannelMetrics(bundle: DatasetBundle) {
  const companyIdsByChannel = new Map<string, string[]>();
  const sizeScoreByChannel = new Map<string, number[]>();
  const revenueScoreByChannel = new Map<string, number[]>();

  for (const company of bundle.companies) {
    const ids = companyIdsByChannel.get(company.acquisitionChannel) ?? [];
    ids.push(company.id);
    companyIdsByChannel.set(company.acquisitionChannel, ids);

    const sizeScores = sizeScoreByChannel.get(company.acquisitionChannel) ?? [];
    sizeScores.push(companySizeScore(company));
    sizeScoreByChannel.set(company.acquisitionChannel, sizeScores);

    const revenueScores = revenueScoreByChannel.get(company.acquisitionChannel) ?? [];
    revenueScores.push(revenueScore(company));
    revenueScoreByChannel.set(company.acquisitionChannel, revenueScores);
  }

  return {
    GOOGLE_SEARCH: summarizeChannel(
      bundle,
      companyIdsByChannel.get('GOOGLE_SEARCH') ?? [],
      average(sizeScoreByChannel.get('GOOGLE_SEARCH') ?? []),
      average(revenueScoreByChannel.get('GOOGLE_SEARCH') ?? []),
    ),
    LINKEDIN: summarizeChannel(
      bundle,
      companyIdsByChannel.get('LINKEDIN') ?? [],
      average(sizeScoreByChannel.get('LINKEDIN') ?? []),
      average(revenueScoreByChannel.get('LINKEDIN') ?? []),
    ),
    ORGANIC: summarizeChannel(
      bundle,
      companyIdsByChannel.get('ORGANIC') ?? [],
      average(sizeScoreByChannel.get('ORGANIC') ?? []),
      average(revenueScoreByChannel.get('ORGANIC') ?? []),
    ),
    META: summarizeChannel(
      bundle,
      companyIdsByChannel.get('META') ?? [],
      average(sizeScoreByChannel.get('META') ?? []),
      average(revenueScoreByChannel.get('META') ?? []),
    ),
  };
}

function summarizeChannel(
  bundle: DatasetBundle,
  companyIds: string[],
  averageSizeScore: number,
  averageRevenueScore: number,
) {
  const companySet = new Set(companyIds);
  const convertedCompanies = bundle.companies.filter(
    (company) => companySet.has(company.id) && company.accountOpenedAt !== null,
  );
  const cost = bundle.mediaTouchpoints
    .filter((touchpoint) => companySet.has(touchpoint.companyId))
    .reduce((sum, touchpoint) => sum + touchpoint.cost, 0);
  const companyCount = companyIds.length;
  const conversionRate = companyCount === 0 ? 0 : convertedCompanies.length / companyCount;
  const cac =
    convertedCompanies.length === 0 ? Number.POSITIVE_INFINITY : cost / convertedCompanies.length;

  return {
    companyCount,
    conversionRate,
    cac,
    averageSizeScore,
    averageRevenueScore,
  };
}

function buildProductsPerCompany(bundle: DatasetBundle) {
  const totals = new Map<Company['companySize'], number[]>();

  for (const company of bundle.companies) {
    const count = bundle.companyProducts.filter((item) => item.companyId === company.id).length;
    const values = totals.get(company.companySize) ?? [];
    values.push(count);
    totals.set(company.companySize, values);
  }

  return {
    MEI: average(totals.get('MEI') ?? []),
    Micro: average(totals.get('Micro') ?? []),
    Pequena: average(totals.get('Pequena') ?? []),
    Média: average(totals.get('Média') ?? []),
    Grande: average(totals.get('Grande') ?? []),
  };
}

function buildActivationRates(bundle: DatasetBundle) {
  const unresolvedByCompany = new Map<string, number>();

  for (const conversation of bundle.conversations) {
    if (conversation.status === 'RESOLVED') {
      continue;
    }
    unresolvedByCompany.set(
      conversation.companyId,
      (unresolvedByCompany.get(conversation.companyId) ?? 0) + 1,
    );
  }

  const fastCompanies = bundle.companies.filter(
    (company) =>
      company.accountOpenedAt &&
      company.onboardingCompletedAt &&
      diffDays(company.accountOpenedAt, company.onboardingCompletedAt) <= 3,
  );
  const slowCompanies = bundle.companies.filter(
    (company) =>
      company.accountOpenedAt &&
      company.onboardingCompletedAt &&
      diffDays(company.accountOpenedAt, company.onboardingCompletedAt) > 3,
  );
  // Activation D30 is only defined for companies that opened an account.
  const openedCompanies = bundle.companies.filter((company) => company.accountOpenedAt !== null);
  const lowUnresolved = openedCompanies.filter(
    (company) => (unresolvedByCompany.get(company.id) ?? 0) <= 1,
  );
  const highUnresolved = openedCompanies.filter(
    (company) => (unresolvedByCompany.get(company.id) ?? 0) > 1,
  );

  return {
    fastOnboarding: rate(fastCompanies, activatedWithin30Days),
    slowOnboarding: rate(slowCompanies, activatedWithin30Days),
    lowUnresolved: rate(lowUnresolved, activatedWithin30Days),
    highUnresolved: rate(highUnresolved, activatedWithin30Days),
  };
}

function activatedWithin30Days(company: Company) {
  if (!company.accountOpenedAt || !company.activationDate) {
    return false;
  }
  return diffDays(company.accountOpenedAt, company.activationDate) <= 30;
}

function diffDays(from: string, to: string) {
  return (new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24);
}

function companySizeScore(company: Company) {
  switch (company.companySize) {
    case 'MEI':
      return 1;
    case 'Micro':
      return 2;
    case 'Pequena':
      return 3;
    case 'Média':
      return 4;
    case 'Grande':
      return 5;
    default:
      return 0;
  }
}

function revenueScore(company: Company) {
  switch (company.annualRevenueRange) {
    case 'ATE_360K':
      return 1;
    case '360K_A_4_8M':
      return 2;
    case '4_8M_A_50M':
      return 3;
    case '50M_A_300M':
      return 4;
    case 'ACIMA_300M':
      return 5;
    default:
      return 0;
  }
}

function rate<TValue>(items: TValue[], predicate: (item: TValue) => boolean) {
  if (items.length === 0) {
    return 0;
  }
  return items.filter(predicate).length / items.length;
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
