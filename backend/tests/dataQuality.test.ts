import { classifyEntryDataType, summarizeDataTypeShares, DataType } from '../src/services/dataQuality';

/**
 * Unit tests for the primary-vs-secondary data-source classification (§5, no DB).
 */

describe('classifyEntryDataType', () => {
  it('supplier-specific method is primary', () => {
    expect(classifyEntryDataType({ method: 'supplier-specific' })).toBe('primary');
  });
  it('a supplierId (any method) is primary', () => {
    expect(classifyEntryDataType({ method: 'spend_based', supplierId: 'abc' })).toBe('primary');
  });
  it('material-balance (measured refrigerant) is primary', () => {
    expect(classifyEntryDataType({ method: 'material-balance' })).toBe('primary');
  });
  it('an estimate is estimated, even if otherwise activity-based', () => {
    expect(classifyEntryDataType({ method: 'activity_based', isEstimate: true })).toBe('estimated');
  });
  it('an estimate beats a supplierId (gap-filled wins the label)', () => {
    expect(classifyEntryDataType({ method: 'supplier-specific', supplierId: 'x', isEstimate: true })).toBe('estimated');
  });
  it('activity_based with a database factor is secondary', () => {
    expect(classifyEntryDataType({ method: 'activity_based' })).toBe('secondary');
  });
  it('spend_based is secondary', () => {
    expect(classifyEntryDataType({ method: 'spend_based' })).toBe('secondary');
  });
  it('unspecified method is secondary', () => {
    expect(classifyEntryDataType({})).toBe('secondary');
  });
});

describe('summarizeDataTypeShares', () => {
  const item = (emissions: number, dataType: DataType) => ({ emissions, dataType });

  it('computes primary/secondary/estimated shares', () => {
    const s = summarizeDataTypeShares([
      item(100, 'primary'),
      item(300, 'secondary'),
      item(100, 'estimated'),
    ]);
    expect(s.total).toBe(500);
    expect(s.primaryEmissions).toBe(100);
    expect(s.secondaryEmissions).toBe(300);
    expect(s.estimatedEmissions).toBe(100);
    expect(s.primarySharePercent).toBe(20); // 100/500
    expect(s.secondarySharePercent).toBe(80); // (300+100)/500 — estimates count as secondary
  });

  it('shares sum to 100 (primary + secondary-incl-estimated)', () => {
    const s = summarizeDataTypeShares([item(85, 'primary'), item(15, 'secondary')]);
    expect(s.primarySharePercent + s.secondarySharePercent).toBe(100);
  });

  it('handles an all-secondary inventory', () => {
    const s = summarizeDataTypeShares([item(50, 'secondary'), item(50, 'secondary')]);
    expect(s.primarySharePercent).toBe(0);
    expect(s.secondarySharePercent).toBe(100);
  });

  it('returns zeros for an empty set (no divide-by-zero)', () => {
    const s = summarizeDataTypeShares([]);
    expect(s.total).toBe(0);
    expect(s.primarySharePercent).toBe(0);
    expect(s.secondarySharePercent).toBe(0);
  });
});
