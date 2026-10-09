import { ACTION_CATALOG, ACTION_SCORING } from './actions';
import { detectChanges } from './changes';
import { aggregateCluster } from './cluster';
import { DEFAULT_DNA_CONFIG, DEFAULT_NBA_CONFIG } from './config';
import { computeDna, levelOf, normalize } from './dna';
import { checkEligibility } from './eligibility';
import { explainDeterministically } from './explanation';
import { computeFeatures, relativeChange, RELEVANT_GAP_PRODUCTS } from './features';
import { generateCandidates, rankNextBestActions } from './nba';
import { buildCustomerProfile, buildCustomerProfiles } from './pipeline';
import { decayStrength, detectSignals } from './signals';
import { distance, similarityVector } from './similarity';
import type { CustomerRawData } from './types';
import { AS_OF, baseRaw, creditIntentRaw, daysAgo } from './__fixtures__/raw';

const DIMENSIONS = [
  'digitalEngagement',
  'productDepth',
  'relationshipStrength',
  'commercialIntent',
  'businessMomentum',
  'transactionActivity',
] as const;

function profileOf(raw: CustomerRawData) {
  return buildCustomerProfile(raw, AS_OF);
}

describe('FeatureCalculator', () => {
  it('computes windows from the as-of date and ignores data after it', () => {
    const raw = creditIntentRaw();
    const future = {
      ...raw,
      events: [...raw.events, { ...raw.events[0]!, timestamp: '2027-01-01T00:00:00.000Z' }],
    };
    expect(computeFeatures(future, AS_OF)).toEqual(computeFeatures(raw, AS_OF));
    const features = computeFeatures(raw, AS_OF);
    expect(features.credit_page_views_14d).toBeGreaterThanOrEqual(3);
    expect(features.credit_searches_14d).toBe(2);
    expect(features.owned_products).not.toContain('CAPITAL_DE_GIRO');
  });

  it('returns 0 relative change when there is no previous value', () => {
    expect(relativeChange(10, 0)).toBe(0);
    expect(relativeChange(12, 10)).toBeCloseTo(0.2);
  });
});

describe('DnaEngine', () => {
  it('normalizes linear, inverse, log and boolean features into 0–1', () => {
    expect(normalize(5, { kind: 'linear', min: 0, max: 10 })).toBeCloseTo(0.5);
    expect(normalize(20, { kind: 'linear', min: 0, max: 10 })).toBe(1);
    expect(normalize(true, { kind: 'boolean' })).toBe(1);
  });

  it('scores every dimension 0–100 deterministically with drivers', () => {
    const features = computeFeatures(creditIntentRaw(), AS_OF);
    const first = computeDna(features, undefined, DEFAULT_DNA_CONFIG);
    const second = computeDna(features, undefined, DEFAULT_DNA_CONFIG);
    expect(second).toEqual(first);
    for (const id of DIMENSIONS) {
      expect(first[id].score).toBeGreaterThanOrEqual(0);
      expect(first[id].score).toBeLessThanOrEqual(100);
      expect(first[id].drivers.length).toBeGreaterThan(0);
      expect(first[id].level).toBe(levelOf(first[id].score));
    }
  });

  it('maps levels with the configured thresholds and detects trends vs. 30 days ago', () => {
    expect(levelOf(95)).toBe('VERY_HIGH');
    expect(levelOf(70)).toBe('HIGH');
    expect(levelOf(40)).toBe('MEDIUM');
    expect(levelOf(39)).toBe('LOW');
    const profile = profileOf(creditIntentRaw());
    expect(profile.dna.commercialIntent.trend).toBe('UP');
  });
});

describe('SignalEngine', () => {
  it('detects credit intent, product gap and growth with evidence and expiry', () => {
    const profile = profileOf(creditIntentRaw());
    const types = profile.signals.map((signal) => signal.type);
    expect(types).toEqual(
      expect.arrayContaining([
        'HIGH_CREDIT_INTENT',
        'PRODUCT_GAP_WORKING_CAPITAL',
        'TRANSACTION_GROWTH',
      ]),
    );
    const intent = profile.signals.find((signal) => signal.type === 'HIGH_CREDIT_INTENT')!;
    expect(intent.evidence.length).toBeGreaterThan(0);
    expect(intent.expiresAt! > intent.detectedAt).toBe(true);
  });

  it('decays strength with a 21-day half-life', () => {
    expect(decayStrength(1, daysAgo(0), AS_OF)).toBeCloseTo(1, 1);
    expect(decayStrength(1, daysAgo(21), AS_OF)).toBeCloseTo(0.5, 1);
  });

  it('does not detect intent for a quiet customer', () => {
    const raw = baseRaw();
    const features = computeFeatures(raw, AS_OF);
    const signals = detectSignals({ features, raw, dna: computeDna(features), asOf: AS_OF });
    expect(signals.map((signal) => signal.type)).not.toContain('HIGH_CREDIT_INTENT');
  });
});

describe('ChangeDetector', () => {
  it('reports transaction growth as an upward change', () => {
    const base = baseRaw();
    const raw = {
      ...base,
      transactions: base.transactions.map((week, index, all) =>
        index >= all.length - 4
          ? {
              ...week,
              inflowAmount: week.inflowAmount * 1.4,
              outflowAmount: week.outflowAmount * 1.4,
            }
          : week,
      ),
    };
    const changes = detectChanges(raw, computeFeatures(raw, AS_OF));
    const volume = changes.find((change) => change.metric === 'transaction_volume_30d');
    expect(volume?.direction).toBe('UP');
  });
});

describe('EligibilityEngine', () => {
  const offer = ACTION_CATALOG.find((action) => action.id === 'OFFER_WORKING_CAPITAL')!;

  it('blocks a product the customer already owns', () => {
    const raw = creditIntentRaw();
    const owned: CustomerRawData = {
      ...raw,
      products: [
        ...raw.products,
        {
          code: 'CAPITAL_DE_GIRO',
          contractedAt: daysAgo(100),
          status: 'ACTIVE',
          usageFrequency: 'MONTHLY',
          usageVolumeBand: 'MEDIUM',
        },
      ],
    };
    const result = checkEligibility(offer, computeFeatures(owned, AS_OF), owned);
    expect(result.eligible).toBe(false);
    expect(result.checks.find((check) => check.rule === 'productAlreadyOwned')?.passed).toBe(false);
  });

  it('blocks commercial offers without consent', () => {
    const raw = {
      ...creditIntentRaw(),
      consent: { commercialContact: false, digitalCommunication: false },
    };
    expect(checkEligibility(offer, computeFeatures(raw, AS_OF), raw).eligible).toBe(false);
  });
});

describe('NextBestActionEngine', () => {
  it('ranks Capital de Giro first for a customer with credit intent (Atlas pattern)', () => {
    const [top] = profileOf(creditIntentRaw()).recommendations;
    expect(top?.actionId).toBe('OFFER_WORKING_CAPITAL');
    expect(top?.score).toBeGreaterThanOrEqual(80);
    expect(top?.reasonCodes).toEqual(expect.arrayContaining(['HIGH_CREDIT_INTENT']));
  });

  it('prioritizes resolving a recent complaint over any offer', () => {
    const raw = creditIntentRaw();
    const profile = profileOf({
      ...raw,
      serviceCases: [
        {
          id: 's1',
          customerId: raw.identity.customerId,
          openedAt: daysAgo(3),
          kind: 'COMPLAINT',
          severity: 'CRITICAL',
          subject: 'Cobrança indevida',
          resolved: false,
          resolvedAt: null,
        },
      ],
    });
    expect(profile.recommendations[0]?.actionId).toBe('RESOLVE_SERVICE_ISSUE');
    expect(profile.recommendations.map((item) => item.actionId)).not.toContain(
      'OFFER_WORKING_CAPITAL',
    );
  });

  it('recommends completing onboarding when it is incomplete', () => {
    const raw = baseRaw('company-onb');
    const profile = profileOf({
      ...raw,
      identity: {
        ...raw.identity,
        status: 'ONBOARDING',
        relationshipStartDate: daysAgo(15),
        accountOpenedAt: daysAgo(10),
        onboardingCompletedAt: null,
      },
      products: raw.products.slice(0, 1),
      transactions: [],
    });
    expect(profile.recommendations[0]?.actionId).toBe('COMPLETE_ONBOARDING');
  });

  it('never suggests a product the customer already owns', () => {
    const raw = creditIntentRaw();
    const profile = profileOf({
      ...raw,
      products: [
        ...raw.products,
        {
          code: 'CAPITAL_DE_GIRO',
          contractedAt: daysAgo(100),
          status: 'ACTIVE',
          usageFrequency: 'MONTHLY',
          usageVolumeBand: 'MEDIUM',
        },
      ],
    });
    expect(profile.recommendations.map((item) => item.actionId)).not.toContain(
      'OFFER_WORKING_CAPITAL',
    );
  });

  it('respects the cooldown after a recent dismissal', () => {
    const raw = creditIntentRaw();
    const profile = profileOf({
      ...raw,
      outcomes: [
        {
          recommendationId: `${raw.identity.customerId}:OFFER_WORKING_CAPITAL:2026-10-04`,
          customerId: raw.identity.customerId,
          actionId: 'OFFER_WORKING_CAPITAL',
          status: 'DISMISSED',
          timestamp: daysAgo(5),
        },
      ],
    });
    expect(profile.recommendations.map((item) => item.actionId)).not.toContain(
      'OFFER_WORKING_CAPITAL',
    );
  });

  it('returns NO_ACTION first when there are no signals', () => {
    const raw = baseRaw('company-quiet');
    const features = computeFeatures(raw, AS_OF);
    const { recommendations } = rankNextBestActions({
      features,
      dna: computeDna(features),
      signals: [],
      raw,
    });
    expect(recommendations[0]?.actionId).toBe('NO_ACTION');
  });

  it('returns NO_ACTION with INSUFFICIENT_DATA when data quality is low', () => {
    const profile = profileOf({ ...creditIntentRaw(), sourceCoverage: 0.3 });
    expect(profile.recommendations).toHaveLength(1);
    expect(profile.recommendations[0]?.actionId).toBe('NO_ACTION');
    expect(profile.recommendations[0]?.reasonCodes).toContain('INSUFFICIENT_DATA');
  });

  it('includes NO_ACTION as an explicit alternative and uses the configured weights', () => {
    const profile = profileOf(creditIntentRaw());
    expect(profile.recommendations.some((item) => item.actionId === 'NO_ACTION')).toBe(true);
    const weights = DEFAULT_NBA_CONFIG.weights;
    expect(
      weights.relevance +
        weights.intent +
        weights.expectedImpact +
        weights.timing +
        weights.confidence,
    ).toBeCloseTo(1);
    const ranks = profile.recommendations.map((item) => item.rank);
    expect(ranks).toEqual(ranks.map((_, index) => index + 1));
  });

  it('generates candidates across objectives (not only cross-sell)', () => {
    const raw = creditIntentRaw();
    const features = computeFeatures(raw, AS_OF);
    const candidates = generateCandidates({
      features,
      dna: computeDna(features),
      signals: [],
      raw,
    });
    expect(new Set(candidates.map((action) => action.objective)).size).toBeGreaterThan(2);
  });
});

describe('Explanation, similarity and clusters', () => {
  it('explains deterministically from reason codes, labeled as non-AI', () => {
    const profile = profileOf(creditIntentRaw());
    const explanation = explainDeterministically(profile, profile.recommendations[0]!);
    expect(explanation.generatedBy).toBe('deterministic');
    expect(explanation.summary).toContain('#1');
    expect(explanation.explanation).toContain('crédito');
  });

  it('measures zero distance to itself and finds similar customers', () => {
    const profiles = buildCustomerProfiles(
      [creditIntentRaw('a'), creditIntentRaw('b'), baseRaw('c')],
      AS_OF,
    );
    const [a, b] = profiles;
    expect(distance(similarityVector(a!), similarityVector(a!))).toBe(0);
    expect(distance(similarityVector(a!), similarityVector(b!))).toBe(0);
    expect(a!.similar.customerIds).toContain('b');
  });

  it('aggregates individual NBAs into a cluster DNA', () => {
    const profiles = buildCustomerProfiles(
      [creditIntentRaw('a'), creditIntentRaw('b'), baseRaw('c')],
      AS_OF,
    );
    const cluster = aggregateCluster(profiles);
    expect(cluster.populationSize).toBe(3);
    expect(cluster.nextBestActions[0]).toMatchObject({
      actionId: 'OFFER_WORKING_CAPITAL',
      customers: 2,
    });
    const shares = cluster.nextBestActions.reduce((total, item) => total + item.share, 0);
    expect(shares).toBeCloseTo(1);
  });

  it('keeps every relevant product gap covered by an action', () => {
    for (const product of RELEVANT_GAP_PRODUCTS) {
      expect(Object.values(ACTION_SCORING).some((scoring) => scoring.product === product)).toBe(
        true,
      );
    }
  });
});
