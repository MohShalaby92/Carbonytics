import {
  canonicalFactor,
  computeFactorHash,
  licenseForSource,
} from '../src/services/factorVersioning';

/**
 * Unit tests for the pure factor-versioning logic (§3, no DB):
 *  - canonicalFactor projection onto value-bearing fields
 *  - computeFactorHash stability (no churn) + change detection
 *  - licenseForSource inference (conservative; never fabricated)
 *
 * These are what the dedup choke point relies on: a re-import that changes a
 * factor's value must change the hash (→ new version); one that only refreshes
 * volatile metadata must NOT (→ same version).
 */

const FACTOR = (over: any = {}) => ({
  _id: 'a'.repeat(24),
  name: 'DEFRA Diesel',
  factor: 2.51233,
  unit: 'kg CO2e/L',
  co2: 0,
  ch4: 0,
  n2o: 0,
  otherGhg: 0,
  source: 'DEFRA 2024',
  year: 2024,
  region: 'global',
  metadata: { columnText: 'some import note' },
  ...over,
});

describe('computeFactorHash — stability and change detection', () => {
  it('is stable across calls for identical content', () => {
    expect(computeFactorHash(FACTOR())).toBe(computeFactorHash(FACTOR()));
  });

  it('ignores volatile metadata that does not affect computation', () => {
    const a = computeFactorHash(FACTOR({ metadata: { columnText: 'note A', uom: 'L' } }));
    const b = computeFactorHash(FACTOR({ metadata: { columnText: 'TOTALLY DIFFERENT', extra: 1 } }));
    expect(a).toBe(b); // same hash → no spurious version churn on re-import
  });

  it('changes when the headline factor value changes', () => {
    expect(computeFactorHash(FACTOR())).not.toBe(computeFactorHash(FACTOR({ factor: 2.6 })));
  });

  it('changes when a per-gas value changes', () => {
    expect(computeFactorHash(FACTOR({ ch4: 0 }))).not.toBe(computeFactorHash(FACTOR({ ch4: 0.0001 })));
  });

  it('changes when the unit, source, year, or license changes', () => {
    const base = computeFactorHash(FACTOR());
    expect(base).not.toBe(computeFactorHash(FACTOR({ unit: 'kg CO2e/gallon' })));
    expect(base).not.toBe(computeFactorHash(FACTOR({ source: 'DEFRA 2025' })));
    expect(base).not.toBe(computeFactorHash(FACTOR({ year: 2025 })));
    expect(base).not.toBe(computeFactorHash(FACTOR({ license: 'Open Government Licence v3.0' })));
  });

  it('reflects the biogenic flag (it changes WHERE the CO2 is reported)', () => {
    const fossil = computeFactorHash(FACTOR({ metadata: { biogenic: false } }));
    const bio = computeFactorHash(FACTOR({ metadata: { biogenic: true } }));
    expect(fossil).not.toBe(bio);
  });

  it('treats missing per-gas fields as 0 (undefined and 0 hash identically)', () => {
    const withUndef = computeFactorHash(FACTOR({ co2: undefined, ch4: undefined, n2o: undefined }));
    const withZero = computeFactorHash(FACTOR({ co2: 0, ch4: 0, n2o: 0 }));
    expect(withUndef).toBe(withZero);
  });
});

describe('canonicalFactor — projection', () => {
  it('coerces missing numerics to 0 and missing strings to empty', () => {
    const c = canonicalFactor({ name: 'x', factor: 1, unit: 'kg', source: 's', year: 2024 });
    expect(c.co2).toBe(0);
    expect(c.otherGhg).toBe(0);
    expect(c.sourceUrl).toBe('');
    expect(c.uncertainty).toBeNull();
    expect(c.biogenic).toBe(false);
  });

  it('only treats biogenic === true as biogenic (strict)', () => {
    expect(canonicalFactor(FACTOR({ metadata: { biogenic: 'true' } })).biogenic).toBe(false);
    expect(canonicalFactor(FACTOR({ metadata: { biogenic: true } })).biogenic).toBe(true);
  });
});

describe('licenseForSource — conservative inference', () => {
  it('maps well-known public datasets', () => {
    expect(licenseForSource('DEFRA 2024')).toBe('Open Government Licence v3.0');
    expect(licenseForSource('DESNZ/DEFRA')).toBe('Open Government Licence v3.0');
    expect(licenseForSource('EPA Hub 2025')).toBe('US Government Work (public domain)');
    expect(licenseForSource('eGRID 2024')).toBe('US Government Work (public domain)');
    expect(licenseForSource('IPCC EFDB')).toContain('IPCC');
    expect(licenseForSource('GHGP cross-sector')).toContain('GHG Protocol');
  });

  it('returns undefined for unknown/custom sources (never fabricated)', () => {
    expect(licenseForSource('Custom')).toBeUndefined();
    expect(licenseForSource('Local factors')).toBeUndefined();
    expect(licenseForSource(undefined)).toBeUndefined();
  });
});
