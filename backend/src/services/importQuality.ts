/**
 * Import-time data-quality screening (§4.3) — pure, deterministic checks run on
 * upload validation. All findings are ADVISORY warnings (never block an import):
 *
 *  - duplicate detection: same category + period + value + unit twice in a file
 *    (the classic "same meter+period entered twice" error)
 *  - outlier detection: a value that deviates more than ±N% from the most recent
 *    prior period for the same category (peer/period anomaly)
 *  - spend double-counting (report failure-mode #10): a spend-based row whose
 *    period overlaps Scope 1/2 activity data — fuel/electricity spend in Cat 1 on
 *    top of the same energy already counted as Scope 1/2.
 *
 * Kept pure (no DB) so it is unit-testable; the caller resolves categories and
 * historical activity and passes them in.
 */

export interface QualityRow {
  rowNumber: number; // 1-based file row (header offset already applied)
  categoryKey: string; // normalized category identity (lowercased name)
  categoryName: string;
  scope?: number;
  spendBased?: boolean; // category.calculationMethod === 'spend_based'
  value: number;
  unit: string;
  periodStart?: string; // ISO date
  periodEnd?: string;
}

export interface HistoryPoint {
  categoryKey: string;
  scope?: number;
  value: number;
  periodStart?: string;
  periodEnd?: string;
}

export interface ImportWarning {
  type: 'duplicate' | 'outlier' | 'spend-double-count';
  rows: number[];
  message: string;
}

/** Two date ranges overlap (inclusive). Missing dates ⇒ cannot determine ⇒ false. */
function periodsOverlap(aStart?: string, aEnd?: string, bStart?: string, bEnd?: string): boolean {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  const as = new Date(aStart).getTime();
  const ae = new Date(aEnd).getTime();
  const bs = new Date(bStart).getTime();
  const be = new Date(bEnd).getTime();
  if ([as, ae, bs, be].some((t) => isNaN(t))) return false;
  return as <= be && bs <= ae;
}

export function analyzeImportQuality(
  rows: QualityRow[],
  history: HistoryPoint[] = [],
  opts: { outlierThresholdPercent?: number } = {}
): ImportWarning[] {
  const threshold = opts.outlierThresholdPercent ?? 50;
  const warnings: ImportWarning[] = [];

  // 1. Duplicate detection within the file.
  const dupGroups = new Map<string, number[]>();
  for (const r of rows) {
    const key = `${r.categoryKey}|${r.periodStart || ''}|${r.periodEnd || ''}|${r.value}|${r.unit}`;
    const g = dupGroups.get(key) || [];
    g.push(r.rowNumber);
    dupGroups.set(key, g);
  }
  for (const group of dupGroups.values()) {
    if (group.length > 1) {
      warnings.push({
        type: 'duplicate',
        rows: group,
        message: `Possible duplicate — rows ${group.join(', ')} share the same category, period, value and unit. Confirm this isn't the same activity entered twice.`,
      });
    }
  }

  // 2. Outlier vs the most recent prior period (same category).
  for (const r of rows) {
    if (!(r.value > 0) || !r.periodStart) continue;
    const priors = history.filter(
      (h) =>
        h.categoryKey === r.categoryKey &&
        h.value > 0 &&
        h.periodStart &&
        new Date(h.periodStart) < new Date(r.periodStart!)
    );
    if (priors.length === 0) continue;
    priors.sort((a, b) => new Date(b.periodStart!).getTime() - new Date(a.periodStart!).getTime());
    const prior = priors[0];
    const deltaPct = (Math.abs(r.value - prior.value) / prior.value) * 100;
    if (deltaPct > threshold) {
      warnings.push({
        type: 'outlier',
        rows: [r.rowNumber],
        message: `Row ${r.rowNumber}: ${r.categoryName} value ${r.value} ${r.unit} deviates ${Math.round(
          deltaPct
        )}% from the most recent prior period (${prior.value}). Verify the reading before importing.`,
      });
    }
  }

  // 3. Spend double-counting guard (failure-mode #10).
  const scope12: { periodStart?: string; periodEnd?: string }[] = [
    ...history.filter((h) => h.scope === 1 || h.scope === 2),
    ...rows.filter((r) => r.scope === 1 || r.scope === 2),
  ].map((p) => ({ periodStart: p.periodStart, periodEnd: p.periodEnd }));

  for (const r of rows) {
    if (!r.spendBased) continue;
    const overlaps = scope12.some((s) =>
      periodsOverlap(r.periodStart, r.periodEnd, s.periodStart, s.periodEnd)
    );
    if (overlaps) {
      warnings.push({
        type: 'spend-double-count',
        rows: [r.rowNumber],
        message: `Row ${r.rowNumber}: spend-based "${r.categoryName}" overlaps a period that already has Scope 1/2 activity data. Make sure fuel/electricity isn't double-counted here on top of the energy already in Scope 1/2.`,
      });
    }
  }

  return warnings;
}
