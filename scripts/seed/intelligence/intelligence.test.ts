import { generateDatasetBundle } from '../generator';
import { generateIntelligenceRaw } from './generator';
import { buildIntelligenceLakeTables } from './lake-tables';
import { rebuildFromRaw, toSnapshot } from './rebuild';

describe('synthetic Customer Intelligence', () => {
  const bundle = generateDatasetBundle({ scale: 0.05 });
  const { raws } = generateIntelligenceRaw(bundle);
  const { profiles, report } = rebuildFromRaw(raws);
  const atlas = profiles.find((profile) => profile.identity.tradeName.startsWith('Atlas'))!;

  it('reproduces the Atlas story from raw behavior (scores are computed, not hardcoded)', () => {
    expect(atlas).toBeDefined();
    const dna = atlas.dna;
    const expected = {
      relationshipStrength: 82,
      digitalEngagement: 91,
      productDepth: 48,
      commercialIntent: 84,
      businessMomentum: 68,
      transactionActivity: 76,
    } as const;
    for (const [dimension, target] of Object.entries(expected)) {
      expect(
        Math.abs(dna[dimension as keyof typeof expected].score - target),
        dimension,
      ).toBeLessThanOrEqual(5);
    }
    const [top] = atlas.recommendations;
    expect(top?.actionId).toBe('OFFER_WORKING_CAPITAL');
    expect(top?.score).toBeGreaterThanOrEqual(84);
    expect(top?.score).toBeLessThanOrEqual(90);
    expect(atlas.readingShift.intentLevel).toEqual({ previous: 'MEDIUM', current: 'HIGH' });
    expect(atlas.readingShift.topAction.currentRank).toBe(1);
    expect(atlas.readingShift.topAction.previousRank).toBeGreaterThan(1);
  });

  it('varies the #1 action across customers and keeps NO_ACTION as a real outcome', () => {
    expect(
      new Set(profiles.map((profile) => profile.recommendations[0]?.actionId)).size,
    ).toBeGreaterThanOrEqual(6);
    expect(report.noActionRate).toBeGreaterThan(0);
    expect(report.concentrationOk).toBe(true);
  });

  it('is deterministic', () => {
    const again = rebuildFromRaw(generateIntelligenceRaw(bundle).raws).profiles;
    expect(again.map(toSnapshot)).toEqual(profiles.map(toSnapshot));
  });

  it('publishes the governed snapshot and the gold tables without personal data', () => {
    const snapshot = toSnapshot(atlas);
    expect(snapshot).toMatchObject({
      nbaActionId: 'OFFER_WORKING_CAPITAL',
      dnaVersion: 'dna-1.0.0',
    });
    const tables = buildIntelligenceLakeTables(
      raws.slice(0, 20),
      profiles.slice(0, 20),
      atlas.updatedAt,
    );
    expect(tables.map((table) => table.dataset.table)).toEqual([
      'customer_features',
      'customer_dna',
      'customer_signals',
      'nba_recommendations',
      'nba_outcomes',
    ]);
    for (const table of tables) {
      for (const row of table.rows.slice(0, 3)) {
        expect(Object.keys(row)).toEqual(table.dataset.columns.map((column) => column.name));
      }
    }
    expect(JSON.stringify(tables.map((table) => table.rows.slice(0, 5)))).not.toMatch(
      /cnpj|tradeName|legalName/i,
    );
  });
});
