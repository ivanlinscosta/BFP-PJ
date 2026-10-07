import type {
  AudiencePreview,
  AudienceRule,
  AudienceRuleGroup,
  Company,
  CompanyProduct,
  FilterOperator,
  Product,
  ScalarFilterValue,
} from '@bfp/domain';

/** Value types handled by audience fields. */
export type AudienceFieldType = 'enum' | 'multi';

/** Governed attribute that can be used in an audience rule. */
export interface AudienceFieldDefinition {
  id: string;
  label: string;
  type: AudienceFieldType;
  operators: readonly FilterOperator[];
  /** Static options; dynamic fields (state, product…) are derived from the data. */
  options?: ReadonlyArray<{ value: string; label: string }>;
}

const ENUM_OPERATORS = ['EQ', 'NEQ', 'IN', 'NOT_IN'] as const satisfies readonly FilterOperator[];
const MULTI_OPERATORS = ['IN', 'NOT_IN'] as const satisfies readonly FilterOperator[];

/** Audience attributes exposed by the rule builder. They never include PII. */
export const AUDIENCE_FIELDS: readonly AudienceFieldDefinition[] = [
  { id: 'state', label: 'Estado', type: 'enum', operators: ENUM_OPERATORS },
  { id: 'region', label: 'Região', type: 'enum', operators: ENUM_OPERATORS },
  {
    id: 'company_size',
    label: 'Porte da empresa',
    type: 'enum',
    operators: ENUM_OPERATORS,
    options: ['MEI', 'Micro', 'Pequena', 'Média', 'Grande'].map((value) => ({
      value,
      label: value,
    })),
  },
  { id: 'segment', label: 'Segmento', type: 'enum', operators: ENUM_OPERATORS },
  {
    id: 'acquisition_channel',
    label: 'Canal',
    type: 'enum',
    operators: ENUM_OPERATORS,
    options: [
      { value: 'GOOGLE_SEARCH', label: 'Google Search' },
      { value: 'META', label: 'Meta' },
      { value: 'LINKEDIN', label: 'LinkedIn' },
      { value: 'ORGANIC', label: 'Organic' },
      { value: 'REFERRAL', label: 'Referral' },
      { value: 'EMAIL', label: 'E-mail' },
      { value: 'INSIDE_SALES', label: 'Inside Sales' },
    ],
  },
  {
    id: 'company_status',
    label: 'Status da empresa',
    type: 'enum',
    operators: ENUM_OPERATORS,
    options: [
      { value: 'LEAD', label: 'Lead' },
      { value: 'ACCOUNT_OPENING', label: 'Abrindo conta' },
      { value: 'ONBOARDING', label: 'Em onboarding' },
      { value: 'ACTIVE', label: 'Ativa' },
      { value: 'INACTIVE', label: 'Inativa' },
    ],
  },
  {
    id: 'onboarding_status',
    label: 'Onboarding',
    type: 'enum',
    operators: ENUM_OPERATORS,
    options: [
      { value: 'COMPLETED', label: 'Concluído' },
      { value: 'IN_PROGRESS', label: 'Em andamento' },
      { value: 'NOT_STARTED', label: 'Não iniciado' },
    ],
  },
  {
    id: 'activation_d30',
    label: 'Ativação D30',
    type: 'enum',
    operators: ['EQ', 'NEQ'],
    options: [
      { value: 'YES', label: 'Sim' },
      { value: 'NO', label: 'Não' },
    ],
  },
  { id: 'product', label: 'Produto', type: 'multi', operators: MULTI_OPERATORS },
];

const AUDIENCE_FIELD_BY_ID = new Map(AUDIENCE_FIELDS.map((field) => [field.id, field]));
const DAY_MS = 24 * 60 * 60 * 1000;

/** Data needed to evaluate audiences without exposing row-level records. */
export interface AudienceDataset {
  companies: readonly Company[];
  companyProducts: readonly CompanyProduct[];
  products: readonly Product[];
}

/** Precomputed, per-company attribute values used by the evaluator. */
export interface AudienceProfile {
  companyId: string;
  values: Record<string, string | readonly string[]>;
}

/** Semantic error raised for unknown fields or unsupported operators. */
export class AudienceRuleError extends Error {
  constructor(
    message: string,
    readonly path: string,
  ) {
    super(message);
  }
}

function onboardingStatus(company: Company) {
  if (company.onboardingCompletedAt) {
    return 'COMPLETED';
  }

  return company.onboardingStartedAt ? 'IN_PROGRESS' : 'NOT_STARTED';
}

function activatedWithin30Days(company: Company) {
  if (!company.accountOpenedAt || !company.activationDate) {
    return 'NO';
  }

  const elapsed =
    new Date(company.activationDate).getTime() - new Date(company.accountOpenedAt).getTime();
  return elapsed <= 30 * DAY_MS ? 'YES' : 'NO';
}

/** Builds the analysable base: only companies with LGPD consent can be targeted. */
export function buildAudienceProfiles(dataset: AudienceDataset): AudienceProfile[] {
  const productNameById = new Map(dataset.products.map((product) => [product.id, product.name]));
  const productsByCompany = new Map<string, string[]>();

  for (const item of dataset.companyProducts) {
    if (item.status === 'CANCELLED') {
      continue;
    }

    const name = productNameById.get(item.productId);
    if (!name) {
      continue;
    }

    const names = productsByCompany.get(item.companyId) ?? [];
    names.push(name);
    productsByCompany.set(item.companyId, names);
  }

  return dataset.companies
    .filter((company) => company.lgpdConsent)
    .map((company) => ({
      companyId: company.id,
      values: {
        state: company.state,
        region: company.region,
        company_size: company.companySize,
        segment: company.segment,
        acquisition_channel: company.acquisitionChannel,
        company_status: company.status,
        onboarding_status: onboardingStatus(company),
        activation_d30: activatedWithin30Days(company),
        product: productsByCompany.get(company.id) ?? [],
      },
    }));
}

function normalize(value: ScalarFilterValue) {
  return String(value).trim().toLocaleLowerCase('pt-BR');
}

function listValue(rule: AudienceRule): ScalarFilterValue[] {
  if (!('value' in rule)) {
    return [];
  }

  return Array.isArray(rule.value) ? [...rule.value] : [rule.value as ScalarFilterValue];
}

function matchesRule(profile: AudienceProfile, rule: AudienceRule, path: string): boolean {
  const field = AUDIENCE_FIELD_BY_ID.get(rule.field);
  if (!field) {
    throw new AudienceRuleError(`Campo de audiência desconhecido: ${rule.field}.`, path);
  }

  if (!field.operators.includes(rule.operator)) {
    throw new AudienceRuleError(
      `O operador ${rule.operator} não é suportado para ${field.label}.`,
      path,
    );
  }

  const expected = listValue(rule).map(normalize);
  if (expected.length === 0) {
    throw new AudienceRuleError(`Informe ao menos um valor para ${field.label}.`, path);
  }

  const raw = profile.values[rule.field];
  const actual = (Array.isArray(raw) ? raw : [raw]).map((value) =>
    normalize(value as ScalarFilterValue),
  );
  const hasAny = actual.some((value) =>
    expected.some((candidate) =>
      field.type === 'multi' ? value.includes(candidate) : value === candidate,
    ),
  );

  switch (rule.operator) {
    case 'EQ':
    case 'IN':
      return hasAny;
    case 'NEQ':
    case 'NOT_IN':
      return !hasAny;
    default:
      return false;
  }
}

function matchesGroup(profile: AudienceProfile, group: AudienceRuleGroup, path: string): boolean {
  if (group.rules.length === 0) {
    return true;
  }

  const evaluate = (rule: AudienceRule | AudienceRuleGroup, index: number) =>
    rule.kind === 'group'
      ? matchesGroup(profile, rule, `${path}.rules[${index}]`)
      : matchesRule(profile, rule, `${path}.rules[${index}]`);

  return group.operator === 'AND' ? group.rules.every(evaluate) : group.rules.some(evaluate);
}

/** Validates a rule tree against the governed audience fields without evaluating data. */
export function validateAudienceRules(group: AudienceRuleGroup, path = 'filterGroups'): void {
  group.rules.forEach((rule, index) => {
    const rulePath = `${path}.rules[${index}]`;
    if (rule.kind === 'group') {
      validateAudienceRules(rule, rulePath);
      return;
    }

    const field = AUDIENCE_FIELD_BY_ID.get(rule.field);
    if (!field) {
      throw new AudienceRuleError(`Campo de audiência desconhecido: ${rule.field}.`, rulePath);
    }
    if (!field.operators.includes(rule.operator)) {
      throw new AudienceRuleError(
        `O operador ${rule.operator} não é suportado para ${field.label}.`,
        rulePath,
      );
    }
    if (listValue(rule).length === 0) {
      throw new AudienceRuleError(`Informe ao menos um valor para ${field.label}.`, rulePath);
    }
  });
}

/** Returns the company ids that match the rule tree. Used for counts and simulated activation. */
export function evaluateAudience(profiles: readonly AudienceProfile[], group: AudienceRuleGroup) {
  validateAudienceRules(group);
  return profiles
    .filter((profile) => matchesGroup(profile, group, 'filterGroups'))
    .map((profile) => profile.companyId);
}

function labelForOption(fieldId: string, value: string) {
  return (
    AUDIENCE_FIELD_BY_ID.get(fieldId)?.options?.find((option) => option.value === value)?.label ??
    value
  );
}

/** Builds the aggregated, PII-free preview of an audience. */
export function previewAudience(
  profiles: readonly AudienceProfile[],
  group: AudienceRuleGroup,
  options: { freshness: string; sources: string[]; distributionFields?: string[] },
): AudiencePreview {
  const matchedIds = new Set(evaluateAudience(profiles, group));
  const matched = profiles.filter((profile) => matchedIds.has(profile.companyId));
  const distributionFields = options.distributionFields ?? ['company_size', 'state'];

  return {
    size: matched.length,
    baseSize: profiles.length,
    share: profiles.length === 0 ? 0 : matched.length / profiles.length,
    distributions: distributionFields.map((fieldId) => {
      const counts = new Map<string, number>();
      for (const profile of matched) {
        const raw = profile.values[fieldId];
        for (const value of Array.isArray(raw) ? raw : [raw]) {
          counts.set(String(value), (counts.get(String(value)) ?? 0) + 1);
        }
      }

      return {
        field: fieldId,
        label: AUDIENCE_FIELD_BY_ID.get(fieldId)?.label ?? fieldId,
        buckets: [...counts.entries()]
          .sort((left, right) => right[1] - left[1])
          .map(([value, count]) => ({ value, label: labelForOption(fieldId, value), count })),
      };
    }),
    freshness: options.freshness,
    sources: options.sources,
  };
}

/** Lists the distinct values available for each audience field, with labels. */
export function listAudienceFieldOptions(profiles: readonly AudienceProfile[]) {
  return AUDIENCE_FIELDS.map((field) => {
    if (field.options) {
      return { ...field, options: [...field.options] };
    }

    const values = new Set<string>();
    for (const profile of profiles) {
      const raw = profile.values[field.id];
      for (const value of Array.isArray(raw) ? raw : [raw]) {
        values.add(String(value));
      }
    }

    return {
      ...field,
      options: [...values]
        .sort((left, right) => left.localeCompare(right, 'pt-BR'))
        .map((value) => ({ value, label: value })),
    };
  });
}
