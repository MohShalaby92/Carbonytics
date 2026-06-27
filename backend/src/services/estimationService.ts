import { Calculation } from '../models/Calculation';
import { Organization } from '../models/Organization';

/**
 * Conservative gap-filling estimation (GHGP completeness + ISO 14064-1
 * conservativeness): when activity data is missing for a period, suggest an
 * estimate from the organization's own history — never silently drop gaps,
 * never silently mix estimates with measured data.
 *
 * Method hierarchy (first match wins):
 *   1. same-period-prior-year — entries for the category whose calculation
 *      period started ~one year before the target period;
 *   2. adjacent-period-average — average of the category's entries in
 *      calculations starting within ±120 days of the target period;
 *   3. intensity-proxy — the category's most recent historical year, scaled
 *      by the ratio of organization denominators (production preferred, then
 *      revenue, employees, floor area) between that year and the target year.
 *
 * A documented conservativeness uplift (+10%) is applied so estimation
 * defaults do not underestimate. The caller saves the result as a normal
 * entry flagged isEstimate + estimationMethod (quality low, DQ score 5).
 */

export const CONSERVATIVENESS_UPLIFT = 0.10;

export interface EstimateSuggestion {
  suggestedValue: number;
  rawValue: number;
  unit: string;
  method: string;
  conservativenessUplift: number;
  basedOnCalculations: Array<{ id: string; title: string; periodStart: Date; value: number }>;
  notes: string[];
}

export async function suggestEstimate(params: {
  organizationId: string;
  categoryId: string;
  facilityId?: string;
  periodStart: Date;
  periodEnd: Date;
}): Promise<EstimateSuggestion | null> {
  const { organizationId, categoryId, facilityId, periodStart } = params;

  const baseFilter: any = { organizationId };
  if (facilityId) baseFilter.facilityId = facilityId;

  const collect = (calcs: any[]) => {
    const hits: Array<{ id: string; title: string; periodStart: Date; value: number; unit: string }> = [];
    for (const c of calcs) {
      for (const e of c.data || []) {
        if (String(e.categoryId) !== String(categoryId)) continue;
        if (e.isEstimate) continue; // never chain estimates off estimates
        hits.push({ id: c._id.toString(), title: c.title, periodStart: c.period?.start, value: e.value, unit: e.unit });
      }
    }
    return hits;
  };

  // 1. Same period, prior year (±45 days around target start minus one year).
  const priorYearStart = new Date(periodStart);
  priorYearStart.setFullYear(priorYearStart.getFullYear() - 1);
  const window = 45 * 24 * 60 * 60 * 1000;
  const priorCalcs = await Calculation.find({
    ...baseFilter,
    'period.start': {
      $gte: new Date(priorYearStart.getTime() - window),
      $lte: new Date(priorYearStart.getTime() + window),
    },
  }).lean();
  const prior = collect(priorCalcs);
  if (prior.length > 0) {
    const raw = prior.reduce((s, h) => s + h.value, 0) / prior.length;
    return finish(raw, prior, 'same-period-prior-year');
  }

  // 2. Adjacent periods (±120 days around the target start, excluding it).
  const adjWindow = 120 * 24 * 60 * 60 * 1000;
  const adjacentCalcs = await Calculation.find({
    ...baseFilter,
    'period.start': {
      $gte: new Date(periodStart.getTime() - adjWindow),
      $lte: new Date(periodStart.getTime() + adjWindow),
    },
  }).lean();
  const adjacent = collect(adjacentCalcs);
  if (adjacent.length > 0) {
    const raw = adjacent.reduce((s, h) => s + h.value, 0) / adjacent.length;
    return finish(raw, adjacent, 'adjacent-period-average');
  }

  // 3. Intensity proxy: scale the most recent historical year's value by the
  // organization's denominator ratio. Only fires when a denominator for the
  // SAME metric exists in both the historical and the target year.
  const targetYear = periodStart.getFullYear();
  const lookback = new Date(periodStart);
  lookback.setFullYear(lookback.getFullYear() - 3);
  const [histCalcs, org] = await Promise.all([
    Calculation.find({
      ...baseFilter,
      'period.start': { $gte: lookback, $lt: periodStart },
    }).lean(),
    Organization.findById(organizationId).select('denominators').lean(),
  ]);
  const denominators = (org as any)?.denominators || [];
  const hist = collect(histCalcs).filter(
    (h) => h.periodStart && new Date(h.periodStart).getFullYear() < targetYear
  );
  if (hist.length > 0 && denominators.length > 0) {
    // Most recent historical year first; within it, prefer the most causal
    // metric available in BOTH years.
    const years = [...new Set(hist.map((h) => new Date(h.periodStart).getFullYear()))].sort((a, b) => b - a);
    const METRIC_PRIORITY = ['production', 'revenue', 'employees', 'floor_area', 'custom'] as const;
    for (const histYear of years) {
      for (const metric of METRIC_PRIORITY) {
        const histDenom = denominators.find((d: any) => d.year === histYear && d.metric === metric && d.value > 0);
        const targetDenom = denominators.find((d: any) => d.year === targetYear && d.metric === metric && d.value > 0);
        if (!histDenom || !targetDenom) continue;

        const yearHits = hist.filter((h) => new Date(h.periodStart).getFullYear() === histYear);
        const histAvg = yearHits.reduce((s, h) => s + h.value, 0) / yearHits.length;
        const ratio = targetDenom.value / histDenom.value;
        const result = finish(
          histAvg * ratio,
          yearHits,
          `intensity-proxy (${metric}: ${histYear}→${targetYear})`
        );
        result.notes.splice(
          1,
          0,
          `Scaled by ${metric} ratio ${targetDenom.value.toLocaleString()} ${targetDenom.unit} (${targetYear}) / ${histDenom.value.toLocaleString()} ${histDenom.unit} (${histYear}) = ${Math.round(ratio * 1000) / 1000}.`
        );
        if (ratio > 2 || ratio < 0.5) {
          result.notes.splice(2, 0, 'Denominator changed more than 2× between years — review this estimate carefully before saving.');
        }
        return result;
      }
    }
  }

  // No usable proxy data (no history, or no denominator recorded for both the
  // historical and target year): the gap must be entered manually or
  // documented in the exclusions register — never silently invented.
  return null;

  function finish(
    raw: number,
    basis: Array<{ id: string; title: string; periodStart: Date; value: number; unit: string }>,
    methodName: string
  ): EstimateSuggestion {
    const suggested = Math.round(raw * (1 + CONSERVATIVENESS_UPLIFT) * 100) / 100;
    return {
      suggestedValue: suggested,
      rawValue: Math.round(raw * 100) / 100,
      unit: basis[0].unit,
      method: `${methodName} +${CONSERVATIVENESS_UPLIFT * 100}% conservativeness`,
      conservativenessUplift: CONSERVATIVENESS_UPLIFT,
      basedOnCalculations: basis.map(({ id, title, periodStart: ps, value }) => ({ id, title, periodStart: ps, value })),
      notes: [
        `Average of ${basis.length} historical ${basis.length === 1 ? 'entry' : 'entries'} (${methodName}).`,
        `Conservativeness uplift of ${CONSERVATIVENESS_UPLIFT * 100}% applied per ISO 14064-1 (do not underestimate).`,
        'Save with isEstimate=true so the entry stays distinguishable from measured data (quality low, DQ score 5).',
      ],
    };
  }
}
