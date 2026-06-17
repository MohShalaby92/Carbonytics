/**
 * Data-source classification (§5) — primary vs secondary data, the split CDP
 * asks for per Scope 3 category and SBTi expects to improve over time.
 *
 *  - primary   — data sourced directly from the activity in the value chain:
 *                supplier-specific emissions/factors, or a refrigerant
 *                material-balance measurement. The top of the GHGP method
 *                hierarchy (PCAF DQ 1).
 *  - estimated — a gap-filled value (isEstimate): the weakest secondary data;
 *                broken out separately for transparency.
 *  - secondary — everything else (activity data × an average/database factor,
 *                spend-based): a database/proxy emission factor.
 *
 * Pure + deterministic so it is unit-testable and can be reused by the report,
 * the CDP mapping, and the YoY trend.
 */

export type DataType = 'primary' | 'secondary' | 'estimated';

export function classifyEntryDataType(e: {
  method?: string;
  supplierId?: unknown;
  isEstimate?: boolean;
}): DataType {
  if (e.isEstimate === true) return 'estimated';
  if (e.method === 'supplier-specific' || e.method === 'material-balance' || !!e.supplierId) {
    return 'primary';
  }
  return 'secondary';
}

export interface DataTypeShares {
  primaryEmissions: number;
  secondaryEmissions: number; // database/average factor (excludes estimated)
  estimatedEmissions: number; // gap-filled
  total: number;
  /** % of emissions from primary data (1 dp). */
  primarySharePercent: number;
  /** % from secondary data, INCLUDING estimates (1 dp). */
  secondarySharePercent: number;
}

/** Roll a set of {emissions, dataType} into primary/secondary/estimated shares. */
export function summarizeDataTypeShares(
  items: { emissions: number; dataType: DataType }[]
): DataTypeShares {
  let primary = 0;
  let secondary = 0;
  let estimated = 0;
  for (const it of items) {
    if (it.dataType === 'primary') primary += it.emissions;
    else if (it.dataType === 'estimated') estimated += it.emissions;
    else secondary += it.emissions;
  }
  const total = primary + secondary + estimated;
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 1000) / 10 : 0);
  return {
    primaryEmissions: Math.round(primary * 100) / 100,
    secondaryEmissions: Math.round(secondary * 100) / 100,
    estimatedEmissions: Math.round(estimated * 100) / 100,
    total: Math.round(total * 100) / 100,
    primarySharePercent: pct(primary),
    secondarySharePercent: pct(secondary + estimated),
  };
}
