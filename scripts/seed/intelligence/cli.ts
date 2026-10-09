import {
  loadBundle,
  printReport,
  rebuildIntelligence,
  writeLocalReadModel,
  writeSnapshotsToBundle,
} from './rebuild';

/**
 * npm run intelligence:rebuild — computes features, Customer DNA, signals and Next Best Actions
 * for every customer and writes the local read model (data/customer-intelligence.json) plus the
 * synthetic data report (data/intelligence-report.json), and publishes one governed snapshot per
 * company in data/dataset.json (mesh dataset customer_intelligence). Deterministic (fixed seed and as-of).
 */
const bundle = await loadBundle();
const { profiles, report } = rebuildIntelligence(bundle);
await writeLocalReadModel(profiles, report);
await writeSnapshotsToBundle(bundle, profiles);
console.log(
  JSON.stringify({
    level: 'info',
    message: 'DNA_CALCULATED',
    profiles: report.profiles,
    customers: report.customers,
    signals: report.volumes.signals,
    recommendations: report.volumes.recommendations,
    durationMs: report.durationsMs.features_dna_signals_nba,
  }),
);
printReport(report);
if (!report.concentrationOk) process.exitCode = 1;
