import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  buildCustomerProfiles,
  buildIntelligenceReport,
  type CustomerIntelligenceProfile,
  type CustomerRawData,
  type IntelligenceReport,
} from '@bfp/customer-intelligence';
import type { CustomerIntelligenceSnapshot, DatasetBundle } from '@bfp/domain';
import { DATASET_PATH } from '../constants';
import { generateDatasetBundle } from '../generator';
import { readDatasetBundle, writeDatasetBundle } from '../io';
import { generateIntelligenceRaw, INTELLIGENCE_AS_OF } from './generator';

export const PROFILES_PATH = new URL('../../../data/customer-intelligence.json', import.meta.url);
export const REPORT_PATH = new URL('../../../data/intelligence-report.json', import.meta.url);

/** Features → DNA → signals → NBA for every customer, plus the synthetic data report. */
export function rebuildIntelligence(bundle: DatasetBundle, asOf = INTELLIGENCE_AS_OF) {
  const { raws } = generateIntelligenceRaw(bundle);
  return rebuildFromRaw(raws, asOf);
}

export function rebuildFromRaw(raws: CustomerRawData[], asOf = INTELLIGENCE_AS_OF) {
  const startedAt = performance.now();
  const profiles = buildCustomerProfiles(raws, asOf);
  const report = buildIntelligenceReport(raws, profiles, asOf, performance.now() - startedAt);
  return { raws, profiles, report };
}

export async function loadBundle() {
  return existsSync(DATASET_PATH) ? readDatasetBundle() : generateDatasetBundle();
}

/** Governed snapshot (1 row per company) published in the mesh as `customer_intelligence`. */
export function toSnapshot(profile: CustomerIntelligenceProfile): CustomerIntelligenceSnapshot {
  const top = profile.recommendations[0];
  const strongest = [...profile.signals].sort((left, right) => right.strength - left.strength)[0];
  return {
    id: `${profile.customerId}:${profile.updatedAt.slice(0, 10)}`,
    companyId: profile.customerId,
    calculatedAt: profile.updatedAt,
    nbaActionId: top?.actionId ?? 'NO_ACTION',
    nbaScore: top?.score ?? 0,
    nbaConfidence: top?.confidence ?? 0,
    primarySignal: strongest?.type ?? null,
    signalCount: profile.signals.length,
    dnaDigitalEngagement: profile.dna.digitalEngagement.score,
    dnaProductDepth: profile.dna.productDepth.score,
    dnaRelationshipStrength: profile.dna.relationshipStrength.score,
    dnaCommercialIntent: profile.dna.commercialIntent.score,
    dnaBusinessMomentum: profile.dna.businessMomentum.score,
    dnaTransactionActivity: profile.dna.transactionActivity.score,
    commercialIntentLevel: profile.dna.commercialIntent.level,
    digitalEngagementLevel: profile.dna.digitalEngagement.level,
    dnaVersion: profile.dnaVersion,
    modelVersion: profile.modelVersion,
  };
}

/** Writes the snapshots into the dataset bundle so the semantic layer and the lake can read them. */
export async function writeSnapshotsToBundle(
  bundle: DatasetBundle,
  profiles: CustomerIntelligenceProfile[],
) {
  await writeDatasetBundle({ ...bundle, customerIntelligence: profiles.map(toSnapshot) });
}

export async function writeLocalReadModel(
  profiles: CustomerIntelligenceProfile[],
  report: IntelligenceReport,
) {
  await mkdir(new URL('.', PROFILES_PATH), { recursive: true });
  await writeFile(PROFILES_PATH, JSON.stringify(profiles), 'utf8');
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

export function printReport(report: IntelligenceReport) {
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
  console.log(`Customer Intelligence · as-of ${report.asOf}`);
  console.log(`Clientes: ${report.customers}`);
  console.log(
    `Volumes: ${report.volumes.transactionWeeks} semanas de transações · ${report.volumes.sessions} sessões · ${report.volumes.digitalEvents} eventos digitais · ${report.volumes.interactions} interações · ${report.volumes.products} produtos · ${report.volumes.signals} sinais · ${report.volumes.recommendations} recomendações`,
  );
  console.log('DNA (média · baixo/médio/alto/muito alto):');
  for (const [dimension, value] of Object.entries(report.dnaDistribution)) {
    console.log(
      `  ${dimension}: ${value.mean} · ${value.levels.LOW}/${value.levels.MEDIUM}/${value.levels.HIGH}/${value.levels.VERY_HIGH}`,
    );
  }
  console.log('NBA #1:');
  for (const item of report.nbaDistribution)
    console.log(`  ${item.actionName}: ${pct(item.share)} (${item.customers})`);
  console.log(
    `NO_ACTION: ${pct(report.noActionRate)} · maior concentração: ${pct(report.maxActionShare)} · ${report.concentrationOk ? 'OK' : 'CONCENTRAÇÃO ACIMA DO LIMITE'}`,
  );
  console.log(`Duração do pipeline: ${report.durationsMs.features_dna_signals_nba} ms`);
}
