import { assessQuality, getQualityStatus } from './index';

describe('@bfp/semantic-layer quality', () => {
  it('classifies healthy summaries at or above every governance threshold', () => {
    const assessment = assessQuality({
      freshnessMinutes: 60,
      completenessRatio: 0.995,
      validityRatio: 0.99,
      uniquenessRatio: 1,
      incidentCount: 0,
    });

    expect(assessment.status).toBe('HEALTHY');
    expect(assessment.score).toBeGreaterThanOrEqual(90);
    expect(assessment.reasons).toHaveLength(0);
  });

  it('classifies warning summaries when a governed threshold is missed without collapse', () => {
    const assessment = assessQuality({
      freshnessMinutes: 1800,
      completenessRatio: 0.95,
      validityRatio: 0.98,
      uniquenessRatio: 0.99,
      incidentCount: 1,
    });

    expect(assessment.status).toBe('WARNING');
    expect(assessment.score).toBeGreaterThanOrEqual(70);
    expect(assessment.components.freshness).toBeLessThan(100);
    expect(assessment.components.completeness).toBeLessThan(100);
    expect(assessment.reasons).toContain('Atualização fora do SLO de freshness.');
    expect(assessment.reasons).toContain('Completude abaixo do limiar governado.');
  });

  it('classifies critical summaries when freshness or validity collapses', () => {
    const assessment = assessQuality({
      freshnessMinutes: 6000,
      completenessRatio: 0.82,
      validityRatio: 0.5,
      uniquenessRatio: 0.7,
      incidentCount: 3,
    });

    expect(assessment.status).toBe('CRITICAL');
    expect(assessment.score).toBeLessThan(70);
    expect(assessment.components.freshness).toBe(0);
    expect(assessment.components.validity).toBeLessThan(70);
  });

  it('derives the health state directly when only the status is needed', () => {
    expect(
      getQualityStatus({
        freshnessMinutes: 100,
        completenessRatio: 0.99,
        validityRatio: 0.99,
        uniquenessRatio: 0.995,
        incidentCount: 0,
      }),
    ).toBe('HEALTHY');
  });
});
