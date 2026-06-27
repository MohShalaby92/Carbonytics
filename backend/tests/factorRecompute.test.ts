import { CalculationEngine } from '../src/services/calculationEngine';

/**
 * Unit tests for deterministic recompute (§3, no DB): recomputeEntryAgainstFactor
 * re-runs the engine math for a stored entry against a given factor snapshot.
 * This is the math the recompute-check endpoint uses to prove a locked inventory
 * reproduces its stored figures from pinned, immutable factor versions.
 */

const engine = new CalculationEngine();
const ELEC = { category: 'Purchased Electricity', calculationMethod: 'activity_based', baseUnit: 'kWh' };
const STAT = { category: 'Stationary Combustion', calculationMethod: 'activity_based', baseUnit: 'mmBtu' };

describe('recomputeEntryAgainstFactor — embedded (value x factor)', () => {
  it('reproduces a simple activity_based embedded entry', async () => {
    const r = await engine.recomputeEntryAgainstFactor(
      { value: 100, unit: 'kWh', gwpApplied: 'embedded' },
      { factor: 0.458, unit: 'kg CO2e/kWh' },
      ELEC
    );
    expect(r.supported).toBe(true);
    expect(r.emissions).toBe(45.8);
  });

  it('is deterministic in the factor value (different value snapshot -> different result)', async () => {
    const entry = { value: 1000, unit: 'kWh', gwpApplied: 'embedded' };
    const a = await engine.recomputeEntryAgainstFactor(entry, { factor: 0.5, unit: 'kg CO2e/kWh' }, ELEC);
    const b = await engine.recomputeEntryAgainstFactor(entry, { factor: 0.458, unit: 'kg CO2e/kWh' }, ELEC);
    expect(a.emissions).toBe(500);
    expect(b.emissions).toBe(458);
  });

  it('converts the activity unit into the factor denominator (kWh -> MWh)', async () => {
    const r = await engine.recomputeEntryAgainstFactor(
      { value: 1000, unit: 'kWh', gwpApplied: 'embedded' },
      { factor: 100, unit: 'kg CO2e/MWh' },
      ELEC
    );
    expect(r.supported).toBe(true);
    expect(r.emissions).toBe(100); // 1000 kWh = 1 MWh x 100
  });
});

describe('recomputeEntryAgainstFactor — per-gas', () => {
  it('reproduces a per-gas entry under the pinned GWP set (AR6)', async () => {
    const r = await engine.recomputeEntryAgainstFactor(
      { value: 1, unit: 'mmBtu', gwpApplied: 'per-gas', gwpSet: 'AR6' },
      { factor: 2621.14, unit: 'kg CO2e/mmBtu', co2: 2602, ch4: 0.276, n2o: 0.04, otherGhg: 0, metadata: {} },
      STAT
    );
    expect(r.supported).toBe(true);
    expect(r.emissions).toBe(2621.14); // 2602 + 0.276*29.8 + 0.04*273
  });

  it('honors the pinned GWP set (AR5 differs from AR6)', async () => {
    const factor = { factor: 0, unit: 'kg CO2e/mmBtu', co2: 2602, ch4: 0.276, n2o: 0.04, otherGhg: 0, metadata: {} };
    const ar6 = await engine.recomputeEntryAgainstFactor({ value: 1, unit: 'mmBtu', gwpApplied: 'per-gas', gwpSet: 'AR6' }, factor, STAT);
    const ar5 = await engine.recomputeEntryAgainstFactor({ value: 1, unit: 'mmBtu', gwpApplied: 'per-gas', gwpSet: 'AR5' }, factor, STAT);
    expect(ar6.emissions).not.toBe(ar5.emissions);
  });

  it('splits biogenic CO2 out of the scope total on recompute', async () => {
    const r = await engine.recomputeEntryAgainstFactor(
      { value: 1000, unit: 'mmBtu', gwpApplied: 'per-gas', gwpSet: 'AR6' },
      { factor: 0, unit: 'kg CO2e/mmBtu', co2: 52.07, ch4: 0.0032, n2o: 0.00063, otherGhg: 0, metadata: { biogenic: true } },
      STAT
    );
    expect(r.emissions).toBe(267.35); // CH4/N2O only
    expect(r.biogenicCO2).toBe(52070); // memo, excluded from scope total
  });
});

describe('recomputeEntryAgainstFactor — unsupported cases (no false drift)', () => {
  it('flags distance-based travel as unsupported', async () => {
    const r = await engine.recomputeEntryAgainstFactor(
      { value: 100, unit: 'km', gwpApplied: 'embedded' },
      { factor: 0.15, unit: 'kg CO2e/km' },
      { category: 'Business Travel', calculationMethod: 'activity_based' }
    );
    expect(r.supported).toBe(false);
    expect(r.note).toMatch(/travel/i);
  });

  it('flags an unconvertible unit as unsupported rather than guessing', async () => {
    const r = await engine.recomputeEntryAgainstFactor(
      { value: 100, unit: 'banana', gwpApplied: 'embedded' },
      { factor: 0.5, unit: 'kg CO2e/kWh' },
      ELEC
    );
    expect(r.supported).toBe(false);
  });
});
