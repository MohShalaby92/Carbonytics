import { Facility } from '../models/Facility';
import { Calculation } from '../models/Calculation';

/**
 * Consolidation roll-up (GHG Protocol §1.2): stored per-calculation emissions
 * are GROSS (100% of the activity). The organization REPORTS its share per the
 * chosen consolidation approach:
 *
 *  - equity_share        — the org's economic interest: the product of
 *                          ownershipPercent down the entity chain (each node's
 *                          share is held by its immediate parent).
 *  - operational_control — 100% if the org has operational control of the
 *                          entity, else 0% (control is not fractional).
 *  - financial_control   — 100% if the org has financial control, else 0%.
 *
 * Each entity's contribution is then pro-rated by the fraction of the reporting
 * period it was held (M&A effective dates acquiredDate/disposedDate).
 * Calculations with no entity tag are the org's own operations — wholly
 * consolidated (share 1, no pro-rating).
 *
 * Simplifications (documented): control uses the node's own flag (not the whole
 * chain), and M&A pro-rating uses the node's own dates (ancestor acquisitions
 * are not cascaded). Equity share IS cumulative down the chain.
 */

export type ConsolidationApproach = 'equity_share' | 'financial_control' | 'operational_control';

const r2 = (n: number) => Math.round(n * 100) / 100;

async function loadFacilityMap(organizationId: string): Promise<Map<string, any>> {
  // Include inactive — calculations may reference soft-deleted facilities.
  const facilities = await Facility.find({ organizationId }).lean();
  const map = new Map<string, any>();
  for (const f of facilities as any[]) map.set(String(f._id), f);
  return map;
}

/** Equity interest of the org in a node = product of ownership shares up the chain. */
function equityShare(facilityId: string, map: Map<string, any>): number {
  let share = 1;
  let current: any = facilityId;
  const seen = new Set<string>();
  while (current) {
    const key = String(current);
    if (seen.has(key)) break; // defensive against a pre-existing cycle
    seen.add(key);
    const node = map.get(key);
    if (!node) break;
    share *= (node.ownershipPercent ?? 100) / 100;
    current = node.parentFacilityId;
  }
  return share;
}

/** Control inclusion (1 or 0) for the control approaches — the node's own flag. */
function controlShare(facilityId: string, map: Map<string, any>, approach: ConsolidationApproach): number {
  const node = map.get(String(facilityId));
  if (!node) return 1; // unknown entity — treat as wholly consolidated (defensive)
  if (approach === 'financial_control') return node.financialControl === false ? 0 : 1;
  return node.operationalControl === false ? 0 : 1; // operational_control
}

/** Fraction of [start,end] during which the node was held (M&A pro-rating). */
function timeFraction(facilityId: string, map: Map<string, any>, start: Date, end: Date): number {
  const node = map.get(String(facilityId));
  if (!node) return 1;
  const ps = start.getTime();
  const pe = end.getTime();
  if (pe <= ps) return 0;
  const acq = node.acquiredDate ? new Date(node.acquiredDate).getTime() : -Infinity;
  const dis = node.disposedDate ? new Date(node.disposedDate).getTime() : Infinity;
  const s = Math.max(ps, acq);
  const e = Math.min(pe, dis);
  if (e <= s) return 0;
  return (e - s) / (pe - ps);
}

/** Effective consolidation share for a calculation tagged to a facility. */
export function effectiveShare(
  facilityId: string | null | undefined,
  map: Map<string, any>,
  approach: ConsolidationApproach,
  start: Date,
  end: Date
): number {
  if (!facilityId) return 1; // org's own operations
  const base = approach === 'equity_share'
    ? equityShare(facilityId, map)
    : controlShare(facilityId, map, approach);
  return base * timeFraction(facilityId, map, start, end);
}

export interface ConsolidationResult {
  approach: ConsolidationApproach;
  grossTotal: number;
  consolidatedTotal: number;
  /** Share applied overall (consolidated / gross), as a percentage. */
  overallSharePercent: number;
  byEntity: Array<{
    entityId: string | null;
    name: string;
    entityType?: string;
    sharePercent: number;
    gross: number;
    consolidated: number;
  }>;
}

export async function computeConsolidation(input: {
  organizationId: string;
  start: Date;
  end: Date;
  approach: ConsolidationApproach;
}): Promise<ConsolidationResult> {
  const { organizationId, start, end, approach } = input;
  const [map, calcs] = await Promise.all([
    loadFacilityMap(organizationId),
    Calculation.find({
      organizationId,
      'period.start': { $gte: start, $lte: end },
    })
      .select('facilityId emissions')
      .lean(),
  ]);

  let gross = 0;
  let consolidated = 0;
  const byEntity = new Map<string, any>();

  for (const c of calcs as any[]) {
    const g = c.emissions?.total || 0;
    gross += g;
    const facKey = c.facilityId ? String(c.facilityId) : null;
    const share = effectiveShare(facKey, map, approach, start, end);
    const cons = g * share;
    consolidated += cons;

    const key = facKey || 'unassigned';
    const node = facKey ? map.get(facKey) : null;
    const existing = byEntity.get(key) || {
      entityId: facKey,
      name: node ? node.name : 'Organization (unassigned)',
      entityType: node ? node.entityType : undefined,
      sharePercent: r2(share * 100),
      gross: 0,
      consolidated: 0,
    };
    existing.gross += g;
    existing.consolidated += cons;
    existing.sharePercent = r2(share * 100);
    byEntity.set(key, existing);
  }

  return {
    approach,
    grossTotal: r2(gross),
    consolidatedTotal: r2(consolidated),
    overallSharePercent: gross > 0 ? r2((consolidated / gross) * 100) : 100,
    byEntity: Array.from(byEntity.values())
      .map((e) => ({ ...e, gross: r2(e.gross), consolidated: r2(e.consolidated) }))
      .sort((a, b) => b.consolidated - a.consolidated),
  };
}
