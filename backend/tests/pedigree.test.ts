import {
  scoreTechnological,
  scoreTemporal,
  scoreGeographical,
  scoreCompleteness,
  scoreReliability,
  scoreEntryPedigree,
  summarizePedigree,
  EntryPedigree,
} from '../src/services/pedigree';

/**
 * Unit tests for the GHG-Protocol DQI / pedigree-matrix scoring (§C/§48, no DB).
 * All expected values are hand-computed against the documented rubric
 * (1 best … 5 worst). Pure functions — pass plain input objects.
 */

describe('scoreTechnological', () => {
  it('estimate (gap-filled) is the worst — 5', () => {
    expect(scoreTechnological({ isEstimate: true })).toBe(5);
  });
  it('supplier-specific / material-balance / any supplierId is the best — 1', () => {
    expect(scoreTechnological({ method: 'supplier-specific' })).toBe(1);
    expect(scoreTechnological({ method: 'material-balance' })).toBe(1);
    expect(scoreTechnological({ method: 'spend_based', supplierId: 'x' })).toBe(1); // supplier beats spend
  });
  it('spend-based (no supplier) is 4', () => {
    expect(scoreTechnological({ method: 'spend_based' })).toBe(4);
    expect(scoreTechnological({ method: 'activity_based', categorySpendBased: true })).toBe(4);
  });
  it('org-custom factor is 2', () => {
    expect(scoreTechnological({ method: 'activity_based', factorIsOrgCustom: true })).toBe(2);
  });
  it('database / regional average factor is 3', () => {
    expect(scoreTechnological({ method: 'activity_based' })).toBe(3);
  });
});

describe('scoreTemporal', () => {
  it('scores the vintage gap |activityYear - factorYear|', () => {
    expect(scoreTemporal({ factorYear: 2024, activityYear: 2024 })).toBe(1); // gap 0
    expect(scoreTemporal({ factorYear: 2022, activityYear: 2024 })).toBe(1); // gap 2
    expect(scoreTemporal({ factorYear: 2021, activityYear: 2024 })).toBe(2); // gap 3
    expect(scoreTemporal({ factorYear: 2019, activityYear: 2024 })).toBe(2); // gap 5
    expect(scoreTemporal({ factorYear: 2018, activityYear: 2024 })).toBe(3); // gap 6
    expect(scoreTemporal({ factorYear: 2016, activityYear: 2024 })).toBe(3); // gap 8
    expect(scoreTemporal({ factorYear: 2015, activityYear: 2024 })).toBe(4); // gap 9
    expect(scoreTemporal({ factorYear: 2012, activityYear: 2024 })).toBe(4); // gap 12
    expect(scoreTemporal({ factorYear: 2011, activityYear: 2024 })).toBe(5); // gap 13
  });
  it('a missing factor year or activity year is conservative — 5', () => {
    expect(scoreTemporal({ activityYear: 2024 })).toBe(5);
    expect(scoreTemporal({ factorYear: 2024 })).toBe(5);
  });
});

describe('scoreGeographical', () => {
  it('Egypt (the primary default) is best; foreign-specific worse than a global average', () => {
    expect(scoreGeographical({ factorRegion: 'egypt' })).toBe(1);
    expect(scoreGeographical({ factorRegion: 'mena' })).toBe(2);
    expect(scoreGeographical({ factorRegion: 'global' })).toBe(3);
    expect(scoreGeographical({ factorRegion: 'eu' })).toBe(4);
    expect(scoreGeographical({ factorRegion: 'us' })).toBe(4);
    expect(scoreGeographical({})).toBe(5); // unknown
  });
});

describe('scoreCompleteness', () => {
  it('multi-gas best, embedded CO2e next, CO2-only / estimate worse', () => {
    expect(scoreCompleteness({ gwpApplied: 'per-gas', gasBreakdown: { co2: 5, ch4: 1 } })).toBe(1);
    expect(scoreCompleteness({ gwpApplied: 'per-gas', gasBreakdown: { n2o: 0.5 } })).toBe(1);
    expect(scoreCompleteness({ gwpApplied: 'embedded' })).toBe(2);
    expect(scoreCompleteness({ gwpApplied: 'per-gas', gasBreakdown: { co2: 5 } })).toBe(3); // CO2-only
    expect(scoreCompleteness({ gwpApplied: 'per-gas' })).toBe(3); // no breakdown snapshot (legacy)
    expect(scoreCompleteness({})).toBe(3); // unknown
    expect(scoreCompleteness({ isEstimate: true })).toBe(5);
  });
});

describe('scoreReliability', () => {
  it('measured best; recognized dataset 2; other DB 3; low-quality 4; estimate/no-source 5', () => {
    expect(scoreReliability({ method: 'supplier-specific' })).toBe(1);
    expect(scoreReliability({ method: 'material-balance' })).toBe(1);
    expect(scoreReliability({ method: 'activity_based', factorSource: 'DEFRA 2024' })).toBe(2);
    expect(scoreReliability({ factorSource: 'IEA Egypt/EEHC' })).toBe(2);
    expect(scoreReliability({ method: 'activity_based', factorSource: 'Local factors' })).toBe(3);
    expect(scoreReliability({ method: 'activity_based', factorQualityRating: 'low', factorSource: 'DEFRA' })).toBe(4);
    expect(scoreReliability({ method: 'activity_based' })).toBe(5); // no source recorded
    expect(scoreReliability({ isEstimate: true })).toBe(5);
  });
});

describe('scoreEntryPedigree', () => {
  it('an Egyptian supplier-specific recent multi-gas line scores 1 across the board', () => {
    const p = scoreEntryPedigree({
      method: 'supplier-specific',
      supplierId: 's1',
      factorYear: 2024,
      activityYear: 2024,
      factorRegion: 'egypt',
      gwpApplied: 'per-gas',
      gasBreakdown: { co2: 5, ch4: 1 },
      factorSource: 'Misr Cement cradle-to-gate',
    });
    expect(p).toEqual({ technological: 1, temporal: 1, geographical: 1, completeness: 1, reliability: 1, overall: 1 });
  });

  it('a bare estimate scores 5 across the board', () => {
    const p = scoreEntryPedigree({ isEstimate: true });
    expect(p).toEqual({ technological: 5, temporal: 5, geographical: 5, completeness: 5, reliability: 5, overall: 5 });
  });

  it('a global DEFRA database factor (8 yr old, embedded) averages 2.6', () => {
    const p = scoreEntryPedigree({
      method: 'activity_based',
      factorYear: 2016,
      activityYear: 2024,
      factorRegion: 'global',
      gwpApplied: 'embedded',
      factorSource: 'DEFRA 2024',
    });
    // tech 3, temporal 3 (gap 8), geo 3, completeness 2 (embedded), reliability 2 (DEFRA) -> 13/5 = 2.6
    expect(p).toEqual({ technological: 3, temporal: 3, geographical: 3, completeness: 2, reliability: 2, overall: 2.6 });
  });
});

describe('summarizePedigree', () => {
  const best: EntryPedigree = { technological: 1, temporal: 1, geographical: 1, completeness: 1, reliability: 1, overall: 1 };
  const mixed: EntryPedigree = { technological: 3, temporal: 3, geographical: 3, completeness: 2, reliability: 2, overall: 2.6 };

  it('emissions-weights the per-dimension means and derives overall from them', () => {
    const s = summarizePedigree([
      { emissions: 300, pedigree: best },
      { emissions: 100, pedigree: mixed },
    ]);
    expect(s.technological).toBe(1.5); // (1*300 + 3*100)/400
    expect(s.temporal).toBe(1.5);
    expect(s.geographical).toBe(1.5);
    expect(s.completeness).toBe(1.3); // (1*300 + 2*100)/400 = 1.25 -> 1.3
    expect(s.reliability).toBe(1.3);
    expect(s.overall).toBe(1.4); // mean(1.5,1.5,1.5,1.3,1.3) = 7.1/5 = 1.42 -> 1.4
    expect(s.entries).toBe(2);
  });

  it('ignores zero-emission lines in the weighting but still counts them', () => {
    const s = summarizePedigree([
      { emissions: 0, pedigree: { technological: 5, temporal: 5, geographical: 5, completeness: 5, reliability: 5, overall: 5 } },
      { emissions: 100, pedigree: best },
    ]);
    expect(s.overall).toBe(1);
    expect(s.entries).toBe(2);
  });

  it('returns nulls (not zeros) when there is no emission weight', () => {
    expect(summarizePedigree([]).overall).toBeNull();
    const s = summarizePedigree([{ emissions: 0, pedigree: best }]);
    expect(s.overall).toBeNull();
    expect(s.technological).toBeNull();
    expect(s.entries).toBe(1);
  });
});
