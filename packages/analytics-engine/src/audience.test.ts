import type { AudienceRuleGroup, Company, CompanyProduct, Product } from '@bfp/domain';
import {
  AudienceRuleError,
  buildAudienceProfiles,
  evaluateAudience,
  listAudienceFieldOptions,
  previewAudience,
} from './audience';

function company(overrides: Partial<Company> & Pick<Company, 'id'>): Company {
  return {
    cnpjMasked: '10.000.000/0001-**',
    legalName: 'Empresa Sintética',
    tradeName: 'Empresa',
    segment: 'Tecnologia',
    industry: 'SaaS B2B',
    companySize: 'Pequena',
    state: 'SP',
    city: 'São Paulo',
    region: 'Sudeste',
    employeeCountRange: '11-50',
    annualRevenueRange: '4_8M_A_50M',
    acquisitionSource: 'PAID',
    acquisitionChannel: 'GOOGLE_SEARCH',
    acquisitionCampaignId: null,
    leadCreatedAt: '2026-06-01T00:00:00.000Z',
    accountOpeningStartedAt: '2026-06-02T00:00:00.000Z',
    accountOpenedAt: '2026-06-05T00:00:00.000Z',
    onboardingStartedAt: '2026-06-05T00:00:00.000Z',
    onboardingCompletedAt: '2026-06-07T00:00:00.000Z',
    activationDate: '2026-06-20T00:00:00.000Z',
    status: 'ACTIVE',
    relationshipManagerId: 'rm-01',
    lgpdConsent: true,
    riskProfile: 'LOW',
    createdAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

const products: Product[] = [
  {
    id: 'p-1',
    name: 'Capital de Giro Flex',
    shortName: 'Giro',
    category: 'CREDIT',
    status: 'ACTIVE',
    monthlyBasePrice: 0,
    isCoreProduct: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];
const companyProducts: CompanyProduct[] = [
  {
    id: 'cp-1',
    companyId: 'c-2',
    productId: 'p-1',
    status: 'ACTIVE',
    contractedAt: '2026-07-01T00:00:00.000Z',
    activatedAt: null,
    cancelledAt: null,
    monthlyRevenueProxy: 10,
    contractChannel: 'APP',
  },
];
const companies = [
  company({ id: 'c-1' }),
  company({ id: 'c-2' }),
  company({ id: 'c-3', companySize: 'Grande' }),
  company({ id: 'c-4', state: 'RJ' }),
  company({ id: 'c-5', activationDate: '2026-09-01T00:00:00.000Z' }),
  company({ id: 'c-6', lgpdConsent: false }),
];

const capitalDeGiroOpportunity: AudienceRuleGroup = {
  kind: 'group',
  id: 'root',
  operator: 'AND',
  rules: [
    { kind: 'rule', id: 'r1', field: 'state', operator: 'EQ', value: 'SP' },
    { kind: 'rule', id: 'r2', field: 'company_size', operator: 'IN', value: ['Pequena', 'Média'] },
    { kind: 'rule', id: 'r3', field: 'onboarding_status', operator: 'EQ', value: 'COMPLETED' },
    { kind: 'rule', id: 'r4', field: 'activation_d30', operator: 'EQ', value: 'YES' },
    { kind: 'rule', id: 'r5', field: 'product', operator: 'NOT_IN', value: ['Capital de Giro'] },
  ],
};

describe('audience engine', () => {
  const profiles = buildAudienceProfiles({ companies, companyProducts, products });

  it('excludes companies without LGPD consent from the analysable base', () => {
    expect(profiles.map((profile) => profile.companyId)).not.toContain('c-6');
  });

  it('evaluates AND groups including multi-valued product exclusion and D30 activation', () => {
    expect(evaluateAudience(profiles, capitalDeGiroOpportunity)).toEqual(['c-1']);
  });

  it('supports OR and nested groups', () => {
    const group: AudienceRuleGroup = {
      kind: 'group',
      id: 'root',
      operator: 'OR',
      rules: [
        { kind: 'rule', id: 'a', field: 'state', operator: 'EQ', value: 'RJ' },
        {
          kind: 'group',
          id: 'nested',
          operator: 'AND',
          rules: [
            { kind: 'rule', id: 'b', field: 'company_size', operator: 'EQ', value: 'Grande' },
            { kind: 'rule', id: 'c', field: 'state', operator: 'EQ', value: 'SP' },
          ],
        },
      ],
    };

    expect(evaluateAudience(profiles, group).sort()).toEqual(['c-3', 'c-4']);
  });

  it('returns aggregated previews without row-level data', () => {
    const preview = previewAudience(profiles, capitalDeGiroOpportunity, {
      freshness: '2026-09-30T00:00:00.000Z',
      sources: ['CRM'],
    });

    expect(preview).toMatchObject({ size: 1, baseSize: 5, share: 0.2 });
    expect(preview.distributions[0]).toMatchObject({
      field: 'company_size',
      buckets: [{ value: 'Pequena', label: 'Pequena', count: 1 }],
    });
    expect(JSON.stringify(preview)).not.toContain('c-1');
  });

  it('rejects unknown fields and unsupported operators with actionable paths', () => {
    expect(() =>
      evaluateAudience(profiles, {
        kind: 'group',
        id: 'root',
        operator: 'AND',
        rules: [{ kind: 'rule', id: 'x', field: 'cpf', operator: 'EQ', value: '1' }],
      }),
    ).toThrow(AudienceRuleError);
    expect(() =>
      evaluateAudience(profiles, {
        kind: 'group',
        id: 'root',
        operator: 'AND',
        rules: [{ kind: 'rule', id: 'y', field: 'activation_d30', operator: 'IN', value: ['YES'] }],
      }),
    ).toThrow('não é suportado');
  });

  it('lists field options derived from data and static labels', () => {
    const options = listAudienceFieldOptions(profiles);
    expect(options.find((field) => field.id === 'state')?.options).toEqual([
      { value: 'RJ', label: 'RJ' },
      { value: 'SP', label: 'SP' },
    ]);
    expect(options.find((field) => field.id === 'onboarding_status')?.options?.[0]?.label).toBe(
      'Concluído',
    );
  });
});
