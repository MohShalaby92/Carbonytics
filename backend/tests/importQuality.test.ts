import { analyzeImportQuality, QualityRow, HistoryPoint } from '../src/services/importQuality';

/**
 * Unit tests for import-time data-quality screening (§4.3, pure, no DB):
 * duplicate / outlier / spend-double-count detection. All advisory.
 */

const row = (over: Partial<QualityRow> = {}): QualityRow => ({
  rowNumber: 2,
  categoryKey: 'purchased electricity',
  categoryName: 'Purchased Electricity',
  scope: 2,
  value: 1000,
  unit: 'kWh',
  periodStart: '2026-01-01',
  periodEnd: '2026-01-31',
  ...over,
});

describe('duplicate detection (within file)', () => {
  it('flags two identical rows (category + period + value + unit)', () => {
    const w = analyzeImportQuality([row({ rowNumber: 2 }), row({ rowNumber: 5 })]);
    const dup = w.filter((x) => x.type === 'duplicate');
    expect(dup).toHaveLength(1);
    expect(dup[0].rows).toEqual([2, 5]);
  });

  it('does not flag rows that differ in value', () => {
    const w = analyzeImportQuality([row({ rowNumber: 2, value: 1000 }), row({ rowNumber: 3, value: 1200 })]);
    expect(w.filter((x) => x.type === 'duplicate')).toHaveLength(0);
  });

  it('does not flag rows in different periods', () => {
    const w = analyzeImportQuality([
      row({ rowNumber: 2, periodStart: '2026-01-01', periodEnd: '2026-01-31' }),
      row({ rowNumber: 3, periodStart: '2026-02-01', periodEnd: '2026-02-28' }),
    ]);
    expect(w.filter((x) => x.type === 'duplicate')).toHaveLength(0);
  });
});

describe('outlier detection (vs most recent prior period)', () => {
  const history: HistoryPoint[] = [
    { categoryKey: 'purchased electricity', scope: 2, value: 1000, periodStart: '2025-12-01', periodEnd: '2025-12-31' },
  ];

  it('flags a value > +50% vs the prior period', () => {
    const w = analyzeImportQuality([row({ value: 1700, periodStart: '2026-01-01' })], history);
    const out = w.filter((x) => x.type === 'outlier');
    expect(out).toHaveLength(1);
    expect(out[0].rows).toEqual([2]);
  });

  it('does not flag a value within ±50%', () => {
    const w = analyzeImportQuality([row({ value: 1200 })], history);
    expect(w.filter((x) => x.type === 'outlier')).toHaveLength(0);
  });

  it('does not flag when there is no prior history for the category', () => {
    const w = analyzeImportQuality([row({ value: 99999 })], []);
    expect(w.filter((x) => x.type === 'outlier')).toHaveLength(0);
  });

  it('respects a custom threshold', () => {
    const w = analyzeImportQuality([row({ value: 1200 })], history, { outlierThresholdPercent: 10 });
    expect(w.filter((x) => x.type === 'outlier')).toHaveLength(1); // 20% > 10%
  });
});

describe('spend double-counting guard (failure-mode #10)', () => {
  const spendRow = row({
    rowNumber: 4,
    categoryKey: 'purchased goods and services',
    categoryName: 'Purchased Goods & Services',
    scope: 3,
    spendBased: true,
    unit: 'EGP',
    value: 50000,
  });

  it('flags a spend-based row overlapping existing Scope 1/2 activity', () => {
    const history: HistoryPoint[] = [
      { categoryKey: 'mobile combustion', scope: 1, value: 400, periodStart: '2026-01-01', periodEnd: '2026-01-31' },
    ];
    const w = analyzeImportQuality([spendRow], history);
    const sd = w.filter((x) => x.type === 'spend-double-count');
    expect(sd).toHaveLength(1);
    expect(sd[0].rows).toEqual([4]);
  });

  it('flags a spend-based row overlapping Scope 1/2 rows in the SAME file', () => {
    const w = analyzeImportQuality([
      spendRow,
      row({ rowNumber: 2, scope: 2 }), // electricity Jan 2026, overlaps
    ]);
    expect(w.filter((x) => x.type === 'spend-double-count')).toHaveLength(1);
  });

  it('does not flag when periods do not overlap', () => {
    const history: HistoryPoint[] = [
      { categoryKey: 'mobile combustion', scope: 1, value: 400, periodStart: '2025-01-01', periodEnd: '2025-01-31' },
    ];
    const w = analyzeImportQuality([spendRow], history);
    expect(w.filter((x) => x.type === 'spend-double-count')).toHaveLength(0);
  });

  it('does not flag a non-spend row', () => {
    const history: HistoryPoint[] = [
      { categoryKey: 'mobile combustion', scope: 1, value: 400, periodStart: '2026-01-01', periodEnd: '2026-01-31' },
    ];
    const w = analyzeImportQuality([row({ scope: 3, spendBased: false })], history);
    expect(w.filter((x) => x.type === 'spend-double-count')).toHaveLength(0);
  });
});

describe('clean import', () => {
  it('returns no warnings for a single well-formed row with no history', () => {
    expect(analyzeImportQuality([row()], [])).toHaveLength(0);
  });
});
