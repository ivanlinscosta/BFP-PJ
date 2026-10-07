import { evaluateCoherence } from './coherence';
import { generateDatasetBundle, resolveGenerationCounts } from './generator';

describe('seed generator', () => {
  it('is deterministic for the same small-scale input', () => {
    const left = generateDatasetBundle({ scale: 0.05 });
    const right = generateDatasetBundle({ scale: 0.05 });

    expect(left).toEqual(right);
  });

  it('matches the scaled target counts and mandatory coherence rules', () => {
    const scale = 0.05;
    const bundle = generateDatasetBundle({ scale });
    const counts = resolveGenerationCounts(scale);
    const assertions = evaluateCoherence(bundle);

    const prospects = bundle.companies.filter((company) => company.status === 'LEAD');
    const coreCompanies = bundle.companies.length - prospects.length;
    expect(coreCompanies).toBeGreaterThan(0);
    expect(coreCompanies).toBeLessThanOrEqual(counts.companies);
    expect(prospects.length).toBeGreaterThan(counts.companies);
    expect(bundle.companies.some((company) => company.tradeName === 'Atlas Tecnologia Ltda.')).toBe(
      true,
    );
    expect(bundle.partners).toHaveLength(counts.partners);
    expect(bundle.accounts).toHaveLength(counts.accounts);
    expect(bundle.products).toHaveLength(counts.products);
    expect(bundle.companyProducts).toHaveLength(counts.companyProducts);
    expect(bundle.mediaCampaigns).toHaveLength(counts.mediaCampaigns);
    expect(bundle.mediaTouchpoints).toHaveLength(counts.mediaTouchpoints);
    expect(bundle.funnelEvents).toHaveLength(counts.funnelEvents);
    expect(bundle.crmInteractions).toHaveLength(counts.crmInteractions);
    expect(bundle.conversations).toHaveLength(counts.conversations);
    expect(bundle.digitalEvents).toHaveLength(counts.digitalEvents);
    expect(assertions.every((assertion) => assertion.passed)).toBe(true);
  });

  it('generates app navigation, transactions and NPS tied to companies with an open account', () => {
    const scale = 0.05;
    const bundle = generateDatasetBundle({ scale });
    const counts = resolveGenerationCounts(scale);
    const opened = new Map(
      bundle.companies
        .filter((company) => company.accountOpenedAt)
        .map((company) => [company.id, company.accountOpenedAt ?? '']),
    );

    expect(bundle.appNavigationEvents).toHaveLength(counts.appNavigationEvents);
    expect(bundle.transactions).toHaveLength(counts.transactions);
    expect(bundle.npsResponses).toHaveLength(counts.npsResponses);

    for (const item of [...bundle.appNavigationEvents, ...bundle.transactions]) {
      expect(opened.has(item.companyId)).toBe(true);
    }
    expect(bundle.transactions.every((transaction) => transaction.amount > 0)).toBe(true);
    expect(
      bundle.npsResponses.every((response) => response.score >= 0 && response.score <= 10),
    ).toBe(true);
    expect(new Set(bundle.appNavigationEvents.map((event) => event.screen)).size).toBeGreaterThan(
      5,
    );
  });
});
