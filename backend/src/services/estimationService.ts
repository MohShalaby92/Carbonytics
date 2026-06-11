import { Calculation } from '../models/Calculation';

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
 *      calculations starting within ±120 days of the target period.
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

  // No proxy data: the intensity-proxy rung needs denominator series
  // (kWh/m², per-FTE) that do not exist yet.
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
