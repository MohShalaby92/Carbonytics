/**
 * GHG-Protocol data-quality indicators — the five "pedigree-matrix" dimensions
 * (§C / §48). The GHG Protocol Scope 3 Technical Guidance asks for data quality
 * assessed across five dimensions, each scored and combined:
 *
 *   - technological  representativeness — how well the factor's process/tech
 *                    matches the actual activity (supplier-specific = best).
 *   - temporal       representativeness — vintage gap between the factor's year
 *                    and the activity year.
 *   - geographical   representativeness — factor region vs the org's geography
 *                    (Egypt is the primary default, so egypt = best).
 *   - completeness   — gas/scope coverage of the data point (multi-gas best).
 *   - reliability    — source pedigree: measured vs a recognized dataset vs
 *                    an undocumented/estimated value.
 *
 * Scored 1 (best) … 5 (worst) — the SAME direction as the existing PCAF-style
 * `dqScore`, so the two read consistently. This module is ADDITIVE: it never
 * touches `dqScore`/`weightedDqScore` or any emission value — it only describes
 * the quality of data the platform already stored (no fabricated factors,
 * policy #2). Pure + deterministic, so it is unit-testable and reused by the
 * report, the renderers, the ESRS map and the Data Quality tab.
 *
 * The technological/reliability tiers reuse the §5 primary/secondary/estimated
 * classification (`classifyEntryDataType`) so the hierarchy stays consistent.
 */

import { classifyEntryDataType } from './dataQuality';

/** Per-entry inputs — all sourced from the calc entry + a report-time factor lookup. */
export interface PedigreeInput {
  // ---- from the calculation entry (already persisted) ----
  method?: string;
  supplierId?: unknown;
  isEstimate?: boolean;
  /** Factor vintage year snapshotted on the entry. */
  factorYear?: number;
  /** Free-text source string snapshotted on the entry. */
  factorSource?: string;
  /** 'per-gas' | 'embedded' — how GWP was applied. */
  gwpApplied?: string;
  /** In-scope per-gas masses (kg) for per-gas factors; absent on embedded/legacy entries. */
  gasBreakdown?: { co2?: number; ch4?: number; n2o?: number };
  /** Activity year of the calculation (period midpoint). */
  activityYear?: number;
  // ---- from the factor (report-time lookup by factorId) ----
  /** egypt | mena | global | eu | us */
  factorRegion?: string;
  /** high | medium | low */
  factorQualityRating?: string;
  /** organizationId present and not supplier-linked → an org-defined custom factor. */
  factorIsOrgCustom?: boolean;
  /** category.calculationMethod === 'spend_based'. */
  categorySpendBased?: boolean;
}

export interface EntryPedigree {
  technological: number;
  temporal: number;
  geographical: number;
  completeness: number;
  reliability: number;
  /** Mean of the five dimensions (1 dp). */
  overall: number;
}

const isSpend = (i: PedigreeInput): boolean => {
  const m = (i.method || '').toLowerCase();
  return i.categorySpendBased === true || m === 'spend_based' || m === 'spend-based';
};

/** Recognized peer-reviewed / government / authoritative datasets (reliability tier 2). */
const RECOGNIZED_SOURCE = /DEFRA|EPA|IPCC|EFDB|GHG\s*Protocol|GHGP|\bIEA\b|eGRID|EEHC|EEAA/i;

/** Technological representativeness (1 best … 5 worst). */
export function scoreTechnological(i: PedigreeInput): number {
  const dt = classifyEntryDataType({ method: i.method, supplierId: i.supplierId, isEstimate: i.isEstimate });
  if (dt === 'estimated') return 5; // gap-filled — no real technological basis
  if (dt === 'primary') return 1; // supplier-specific / material-balance (the actual process)
  if (isSpend(i)) return 4; // monetary EEIO proxy — least process-specific
  if (i.factorIsOrgCustom) return 2; // org-defined custom factor
  return 3; // database / regional average factor
}

/** Temporal representativeness — vintage gap |activityYear − factorYear| (1 best … 5 worst). */
export function scoreTemporal(i: PedigreeInput): number {
  if (i.factorYear == null || i.activityYear == null) return 5; // unknown vintage — conservative
  const gap = Math.abs(i.activityYear - i.factorYear);
  if (gap <= 2) return 1;
  if (gap <= 5) return 2;
  if (gap <= 8) return 3;
  if (gap <= 12) return 4;
  return 5;
}

/** Geographical representativeness vs the org's geography (Egypt default) (1 best … 5 worst). */
export function scoreGeographical(i: PedigreeInput): number {
  switch ((i.factorRegion || '').toLowerCase()) {
    case 'egypt':
      return 1;
    case 'mena':
      return 2;
    case 'global':
      return 3; // a global average is region-agnostic, not region-mismatched
    case 'eu':
    case 'us':
      return 4; // a foreign region-specific factor applied in Egypt is mismatched
    default:
      return 5; // unknown region
  }
}

/** Completeness — gas/scope coverage of the data point (1 best … 5 worst). */
export function scoreCompleteness(i: PedigreeInput): number {
  if (i.isEstimate) return 5; // gap-filled — least complete
  const gb = i.gasBreakdown;
  const multiGas = !!gb && ((gb.ch4 ?? 0) > 0 || (gb.n2o ?? 0) > 0);
  if (i.gwpApplied === 'per-gas' && multiGas) return 1; // CO2 + CH4/N2O resolved
  if (i.gwpApplied === 'embedded') return 2; // a complete CO2e value (gases not separable)
  if (i.gwpApplied === 'per-gas') return 3; // per-gas but CO2-only
  return 3; // unknown — neutral
}

/** Reliability — source pedigree / measured vs modeled (1 best … 5 worst). */
export function scoreReliability(i: PedigreeInput): number {
  const dt = classifyEntryDataType({ method: i.method, supplierId: i.supplierId, isEstimate: i.isEstimate });
  if (dt === 'estimated') return 5;
  if (dt === 'primary') return 1; // measured / verified at the source
  if ((i.factorQualityRating || '').toLowerCase() === 'low') return 4;
  if (i.factorSource && RECOGNIZED_SOURCE.test(i.factorSource)) return 2; // recognized dataset
  if (i.factorSource) return 3; // other documented database
  return 5; // no source recorded
}

/** Score one entry across all five DQI dimensions. */
export function scoreEntryPedigree(i: PedigreeInput): EntryPedigree {
  const technological = scoreTechnological(i);
  const temporal = scoreTemporal(i);
  const geographical = scoreGeographical(i);
  const completeness = scoreCompleteness(i);
  const reliability = scoreReliability(i);
  const overall =
    Math.round(((technological + temporal + geographical + completeness + reliability) / 5) * 10) / 10;
  return { technological, temporal, geographical, completeness, reliability, overall };
}

export interface PedigreeSummary {
  technological: number | null;
  temporal: number | null;
  geographical: number | null;
  completeness: number | null;
  reliability: number | null;
  /** Mean of the five emissions-weighted dimension means (1 dp). */
  overall: number | null;
  /** Number of entries contributing (incl. zero-emission lines). */
  entries: number;
}

/**
 * Emissions-weight a set of scored entries into per-dimension means. A
 * dimension mean is Σ(score·emissions)/Σ(emissions); `overall` is the mean of
 * the five weighted dimension means so the headline always equals the average
 * of the bars shown. Returns nulls (not zeros) when there is no weight, so the
 * UI can show "—" rather than a misleading perfect score.
 */
export function summarizePedigree(
  items: { emissions: number; pedigree: EntryPedigree }[]
): PedigreeSummary {
  let w = 0;
  let entries = 0;
  const acc = { technological: 0, temporal: 0, geographical: 0, completeness: 0, reliability: 0 };
  for (const it of items) {
    entries++;
    const em = it.emissions || 0;
    if (em <= 0) continue; // zero-emission lines carry no weight
    w += em;
    acc.technological += it.pedigree.technological * em;
    acc.temporal += it.pedigree.temporal * em;
    acc.geographical += it.pedigree.geographical * em;
    acc.completeness += it.pedigree.completeness * em;
    acc.reliability += it.pedigree.reliability * em;
  }
  const r = (v: number): number | null => (w > 0 ? Math.round((v / w) * 10) / 10 : null);
  const technological = r(acc.technological);
  const temporal = r(acc.temporal);
  const geographical = r(acc.geographical);
  const completeness = r(acc.completeness);
  const reliability = r(acc.reliability);
  const overall =
    technological != null && temporal != null && geographical != null && completeness != null && reliability != null
      ? Math.round(((technological + temporal + geographical + completeness + reliability) / 5) * 10) / 10
      : null;
  return { technological, temporal, geographical, completeness, reliability, overall, entries };
}

/**
 * One-line dimension breakdown for the report renderers (markdown / PDF / DOCX /
 * CDP / ESRS). Callers prefix their own label. Pure formatter.
 */
export function formatPedigreeLine(p?: PedigreeSummary | null): string {
  if (!p || p.overall == null) return 'not yet scored';
  return `technological ${p.technological} · temporal ${p.temporal} · geographical ${p.geographical} · completeness ${p.completeness} · reliability ${p.reliability} (overall ${p.overall}/5, 1 best)`;
}
