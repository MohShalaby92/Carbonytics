import { buildEntryFormula, reconcile, fmtNum } from '../src/services/lineage';

/**
 * Unit tests for the calculation-lineage formula + reconciliation helpers
 * (§7, pure — no DB). The formula is derived solely from stored entry fields.
 */

describe('fmtNum', () => {
  it('groups thousands and strips trailing zeros', () => {
    expect(fmtNum(53117.1)).toBe('53,117.1');
    expect(fmtNum(1000)).toBe('1,000');
    expect(fmtNum(0.10764)).toBe('0.10764');
  });
  it('handles null/undefined/non-finite', () => {
    expect(fmtNum(undefined)).toBe('—');
    expect(fmtNum(null)).toBe('—');
    expect(fmtNum(Infinity)).toBe('—');
  });
});

describe('buildEntryFormula — standard value × factor', () => {
  it('no unit conversion: value × factor literally equals emissions', () => {
    expect(buildEntryFormula({ value: 100, unit: 'kWh', factor: 0.4, emissions: 40 })).toBe(
      '100 kWh × 0.4 = 40 kg CO2e'
    );
  });
  it('per-mmBtu EPA factor (grouping)', () => {
    expect(
      buildEntryFormula({ value: 1000, unit: 'mmBtu', factor: 53.1171, emissions: 53117.1 })
    ).toBe('1,000 mmBtu × 53.1171 = 53,117.1 kg CO2e');
  });
  it('unit conversion: shows the implied converted quantity (emissions ÷ factor)', () => {
    // 2000 lb of a fuel priced per short ton (1 short ton) × 100 = 100.
    const f = buildEntryFormula({ value: 2000, unit: 'lb', factor: 100, emissions: 100 });
    expect(f).toContain('2,000 lb');
    expect(f).toContain('in factor units');
    expect(f).toContain('× 100 = 100 kg CO2e');
  });
  it('a tiny rounding residual is NOT treated as a conversion', () => {
    // emissions rounded to 2dp: 33.33 / 0.3333 = 99.99... still "no conversion" vs value 100.
    const f = buildEntryFormula({ value: 100, unit: 'kg', factor: 0.3333, emissions: 33.33 });
    expect(f).toBe('100 kg × 0.3333 = 33.33 kg CO2e');
  });
  it('zero/missing factor → zero-emission line', () => {
    expect(buildEntryFormula({ value: 5, unit: 'kg', factor: 0, emissions: 0 })).toBe(
      '5 kg × 0 = 0 kg CO2e'
    );
  });
});

describe('buildEntryFormula — per-gas path', () => {
  it('AR6: Σ gasMass × GWP with the in-scope CO2 at GWP 1', () => {
    // 10×1 + 1×29.8 + 0.5×273 = 176.3
    const f = buildEntryFormula({
      value: 1000,
      unit: 'mmBtu',
      factor: 0,
      emissions: 176.3,
      gwpApplied: 'per-gas',
      gwpSet: 'AR6',
      gasBreakdown: { co2: 10, ch4: 1, n2o: 0.5 },
    });
    expect(f).toBe(
      '(CO2 10 kg + CH4 1 kg × 29.8 + N2O 0.5 kg × 273) = 176.3 kg CO2e · per-gas × AR6 GWP'
    );
  });
  it('omits a gas with zero mass', () => {
    const f = buildEntryFormula({
      value: 1,
      unit: 'mmBtu',
      factor: 0,
      emissions: 64.8,
      gwpApplied: 'per-gas',
      gwpSet: 'AR5',
      gasBreakdown: { co2: 5, ch4: 2, n2o: 0 }, // 5 + 2×28 + 0 = 61... (illustrative)
    });
    expect(f).toContain('CO2 5 kg');
    expect(f).toContain('CH4 2 kg × 28'); // AR5 ch4
    expect(f).not.toContain('N2O');
    expect(f).toContain('per-gas × AR5 GWP');
  });
  it('falls back to AR6 GWP when the entry has no gwpSet', () => {
    const f = buildEntryFormula({
      value: 1,
      unit: 'mmBtu',
      factor: 0,
      emissions: 29.8,
      gwpApplied: 'per-gas',
      gasBreakdown: { co2: 0, ch4: 1, n2o: 0 },
    });
    expect(f).toContain('CH4 1 kg × 29.8'); // AR6 default
  });
});

describe('buildEntryFormula — fugitive material balance', () => {
  it('shows the released-mass derivation × the blend factor', () => {
    // released 65 = 100 + (20-15) - 30 - 10 ; × 2088 = 135720
    const f = buildEntryFormula({
      value: 65,
      unit: 'kg',
      factor: 2088,
      emissions: 135720,
      materialBalance: {
        releasedKg: 65,
        purchases: 100,
        inventoryStart: 20,
        inventoryEnd: 15,
        chargedIntoEquipment: 30,
        recovered: 10,
      },
    });
    expect(f).toBe(
      '65 kg released [purchases 100 + stock change 5 - charged 30 - recovered 10] × 2,088 = 135,720 kg CO2e'
    );
  });
});

describe('reconcile', () => {
  it('exact match reconciles with zero residual', () => {
    expect(reconcile(40, 40)).toEqual({
      lineSum: 40,
      reportedEmissions: 40,
      residual: 0,
      reconciled: true,
    });
  });
  it('the demo baseline total reconciles', () => {
    expect(reconcile(9193.02, 9193.02).reconciled).toBe(true);
  });
  it('a sub-cent rounding residual is still reconciled (within tolerance)', () => {
    expect(reconcile(100.04, 100).reconciled).toBe(true);
  });
  it('a material residual fails reconciliation', () => {
    const r = reconcile(40.06, 40);
    expect(r.reconciled).toBe(false);
    expect(r.residual).toBe(0.06);
  });
});
