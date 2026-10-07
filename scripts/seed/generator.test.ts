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
});
