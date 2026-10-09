import { DIMENSION_COLUMNS } from '@bfp/analytics-engine';
import { MESH_DATASETS } from '@bfp/semantic-layer';
import { generateDatasetBundle } from './generator';
import { buildLakeTables, goldCtas, silverDdl } from './lake-model';

describe('data mesh lake model', () => {
  const bundle = generateDatasetBundle({ scale: 0.05 });
  // The intelligence snapshot is materialized by `intelligence:rebuild`; one row is enough here.
  const tables = buildLakeTables({
    ...bundle,
    customerIntelligence: [
      {
        id: 'company-0001:2026-10-09',
        companyId: 'company-0001',
        calculatedAt: '2026-10-09T12:00:00.000Z',
        nbaActionId: 'OFFER_WORKING_CAPITAL',
        nbaScore: 87,
        nbaConfidence: 93,
        primarySignal: 'HIGH_CREDIT_INTENT',
        signalCount: 4,
        dnaDigitalEngagement: 91,
        dnaProductDepth: 47,
        dnaRelationshipStrength: 82,
        dnaCommercialIntent: 85,
        dnaBusinessMomentum: 70,
        dnaTransactionActivity: 75,
        commercialIntentLevel: 'HIGH',
        digitalEngagementLevel: 'VERY_HIGH',
        dnaVersion: 'dna-1.0.0',
        modelVersion: 'nba-1.0.0',
      },
    ],
  });

  it('publishes one normalized table per mesh data product', () => {
    expect(tables.map((table) => table.dataset.id)).toEqual(
      MESH_DATASETS.map((dataset) => dataset.id),
    );
    for (const table of tables) {
      const columns = table.dataset.columns.map((column) => column.name);
      expect(Object.keys(table.rows[0] ?? {})).toEqual(columns);
      expect(columns).toContain('company_id');
    }
  });

  it('exposes every column used by the Athena compiler', () => {
    for (const table of tables) {
      const columns = new Set(table.dataset.columns.map((column) => column.name));
      for (const column of Object.values(DIMENSION_COLUMNS[table.dataset.id])) {
        expect(columns.has(column), `${table.dataset.table}.${column}`).toBe(true);
      }
    }
  });

  it('keeps company attributes only in Customer 360 and maps FullStory events', () => {
    const media = tables.find((table) => table.dataset.id === 'media_touchpoints')!;
    expect(media.dataset.columns.map((column) => column.name)).not.toContain('company_size');
    const journey = tables.find((table) => table.dataset.id === 'digital_journey')!;
    expect(journey.rows[0]).toMatchObject({
      event_type: expect.any(String),
      page_url: expect.stringContaining('https://'),
    });
    expect(JSON.stringify(tables.map((table) => table.rows.slice(0, 5)))).not.toContain('cnpj');
    expect(silverDdl('bfp_pj_dev', 'bucket', tables[0]!)).toContain(
      'bfp_pj_dev_customer360.silver_customer_360',
    );
    expect(goldCtas('bfp_pj_dev', 'bucket', tables[0]!)).toContain("format = 'PARQUET'");
  });
});
