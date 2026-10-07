import type { DatasetBundle } from '@bfp/domain';
import { evaluateCoherence } from './coherence';
import { readDatasetBundle } from './io';

interface StatsBlock {
  counts: Record<string, number>;
  dateRanges: string[];
  nullRates: string[];
  revenueDistribution: string[];
}

/** Builds the textual statistics summary consumed by the validation CLI and tests. */
export function buildDatasetStats(bundle: DatasetBundle): StatsBlock {
  return {
    counts: {
      companies: bundle.companies.length,
      partners: bundle.partners.length,
      accounts: bundle.accounts.length,
      products: bundle.products.length,
      companyProducts: bundle.companyProducts.length,
      mediaCampaigns: bundle.mediaCampaigns.length,
      mediaTouchpoints: bundle.mediaTouchpoints.length,
      funnelEvents: bundle.funnelEvents.length,
      crmInteractions: bundle.crmInteractions.length,
      conversations: bundle.conversations.length,
      digitalEvents: bundle.digitalEvents.length,
      qualityStatuses: bundle.qualityStatuses.length,
      auditLogs: bundle.auditLogs.length,
    },
    dateRanges: [
      describeDateRange(
        'companies.createdAt',
        bundle.companies.map((item) => item.createdAt),
      ),
      describeDateRange(
        'mediaCampaigns.startDate',
        bundle.mediaCampaigns.map((item) => item.startDate),
      ),
      describeDateRange(
        'mediaTouchpoints.occurredAt',
        bundle.mediaTouchpoints.map((item) => item.occurredAt),
      ),
      describeDateRange(
        'funnelEvents.occurredAt',
        bundle.funnelEvents.map((item) => item.occurredAt),
      ),
      describeDateRange(
        'digitalEvents.occurredAt',
        bundle.digitalEvents.map((item) => item.occurredAt),
      ),
    ],
    nullRates: [
      describeNullRate(
        'companies.accountOpenedAt',
        bundle.companies.map((item) => item.accountOpenedAt),
      ),
      describeNullRate(
        'companies.onboardingCompletedAt',
        bundle.companies.map((item) => item.onboardingCompletedAt),
      ),
      describeNullRate(
        'companies.activationDate',
        bundle.companies.map((item) => item.activationDate),
      ),
      describeNullRate(
        'accounts.closedAt',
        bundle.accounts.map((item) => item.closedAt),
      ),
      describeNullRate(
        'companyProducts.cancelledAt',
        bundle.companyProducts.map((item) => item.cancelledAt),
      ),
      describeNullRate(
        'conversations.resolvedAt',
        bundle.conversations.map((item) => item.resolvedAt),
      ),
      describeNullRate(
        'crmInteractions.relatedConversationId',
        bundle.crmInteractions.map((item) => item.relatedConversationId),
      ),
      describeNullRate(
        'digitalEvents.value',
        bundle.digitalEvents.map((item) => item.value),
      ),
    ],
    revenueDistribution: summarizeRevenueDistribution(bundle),
  };
}

async function main() {
  const bundle = await readDatasetBundle();
  const stats = buildDatasetStats(bundle);
  const assertions = evaluateCoherence(bundle);

  console.log('DATASET COUNTS');
  for (const [name, count] of Object.entries(stats.counts)) {
    console.log(`- ${name}: ${count}`);
  }

  console.log('\nDATE RANGES');
  stats.dateRanges.forEach((line) => console.log(`- ${line}`));

  console.log('\nNULL RATES');
  stats.nullRates.forEach((line) => console.log(`- ${line}`));

  console.log('\nREVENUE DISTRIBUTION');
  stats.revenueDistribution.forEach((line) => console.log(`- ${line}`));

  console.log('\nCOHERENCE CHECKS');
  let hasFailure = false;
  for (const assertion of assertions) {
    const status = assertion.passed ? 'PASS' : 'FAIL';
    if (!assertion.passed) {
      hasFailure = true;
    }
    console.log(`- [${status}] ${assertion.name} :: ${assertion.details}`);
  }

  if (hasFailure) {
    process.exit(1);
  }
}

function describeDateRange(label: string, values: string[]) {
  const ordered = [...values].sort((left, right) => left.localeCompare(right));
  return `${label}: ${ordered[0] ?? 'n/a'} → ${ordered[ordered.length - 1] ?? 'n/a'}`;
}

function describeNullRate(label: string, values: Array<unknown | null>) {
  const nulls = values.filter((value) => value === null).length;
  const rate = values.length === 0 ? 0 : (nulls / values.length) * 100;
  return `${label}: ${nulls}/${values.length} (${rate.toFixed(1)}%)`;
}

function summarizeRevenueDistribution(bundle: DatasetBundle) {
  const counts = new Map<string, number>();
  for (const company of bundle.companies) {
    counts.set(company.annualRevenueRange, (counts.get(company.annualRevenueRange) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([range, count]) => `${range}: ${count}`);
}

await main();
