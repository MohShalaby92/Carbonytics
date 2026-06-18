import { GWP_SETS, DEFAULT_GWP_SET, isGwpSetName } from '../data/gwpSets';

/**
 * Calculation-lineage helpers (§7): turn a stored calculation entry into the
 * human-readable "how this number was produced" formula for the drill-down.
 *
 * Everything here is PURE and derived solely from the stored entry — the engine
 * is never re-run. The three non-trivial paths are all exactly recoverable from
 * what was persisted at save time:
 *   - per-gas: emissions = Σ gasMass × GWP (the masses are snapshotted on the entry);
 *   - material balance: the released refrigerant mass + its component derivation;
 *   - unit conversion: the input was converted into the factor's denominator before
 *     multiplying, so the implied converted quantity is exactly emissions ÷ factor.
 *
 * (Deterministic reproduction — recomputing against the pinned immutable factor
 * version — is the separate §40 recompute-check, reused by the lineage UI.)
 */

/** Minimal stored-entry shape needed to derive a formula. */
export interface LineageFormulaInput {
  value: number;
  unit: string;
  factor: number;
  emissions: number;
  gwpSet?: string;
  gwpApplied?: 'per-gas' | 'embedded';
  gasBreakdown?: { co2?: number; ch4?: number; n2o?: number };
  materialBalance?: {
    releasedKg?: number;
    purchases?: number;
    inventoryStart?: number;
    inventoryEnd?: number;
    chargedIntoEquipment?: number;
    recovered?: number;
  };
}

const CO2E = 'kg CO2e';

/** Compact number formatting: round to 6 dp, strip trailing zeros, group thousands. */
export function fmtNum(n: number | undefined | null): string {
  if (n === undefined || n === null || !isFinite(n)) return '—';
  const r = Math.round(n * 1e6) / 1e6;
  return r.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

/**
 * Build the exactly-derived calculation formula string for a stored entry.
 * Uses only CP1252-safe symbols (× · ) so the string is safe everywhere the
 * lineage is surfaced (JSON, React, and any future renderer).
 */
export function buildEntryFormula(e: LineageFormulaInput): string {
  const emissions = e.emissions || 0;

  // 1) Per-gas path: emissions = Σ gasMass × GWP (in-scope CO2 carries GWP 1).
  if (e.gwpApplied === 'per-gas' && e.gasBreakdown) {
    const set = isGwpSetName(e.gwpSet) ? e.gwpSet : DEFAULT_GWP_SET;
    const g = GWP_SETS[set].values;
    const gb = e.gasBreakdown;
    const parts: string[] = [];
    if (gb.co2) parts.push(`CO2 ${fmtNum(gb.co2)} kg`);
    if (gb.ch4) parts.push(`CH4 ${fmtNum(gb.ch4)} kg × ${fmtNum(g.ch4)}`);
    if (gb.n2o) parts.push(`N2O ${fmtNum(gb.n2o)} kg × ${fmtNum(g.n2o)}`);
    const body = parts.length ? parts.join(' + ') : `${fmtNum(emissions)} ${CO2E}`;
    return `(${body}) = ${fmtNum(emissions)} ${CO2E} · per-gas × ${set} GWP`;
  }

  // 2) Fugitive material balance: the activity quantity is the DERIVED released
  //    mass (purchases + stock change − charged − recovered), then × the blend factor.
  const mb = e.materialBalance;
  if (mb && mb.releasedKg !== undefined && mb.releasedKg !== null) {
    const stockChange = (mb.inventoryStart || 0) - (mb.inventoryEnd || 0);
    const derivation =
      `purchases ${fmtNum(mb.purchases || 0)}` +
      ` + stock change ${fmtNum(stockChange)}` +
      ` - charged ${fmtNum(mb.chargedIntoEquipment || 0)}` +
      ` - recovered ${fmtNum(mb.recovered || 0)}`;
    return `${fmtNum(mb.releasedKg)} kg released [${derivation}] × ${fmtNum(e.factor)} = ${fmtNum(emissions)} ${CO2E}`;
  }

  // 3) Standard path: emissions = activityValue × factor, where activityValue is
  //    the input converted into the factor's denominator. When no conversion was
  //    needed, value × factor literally equals emissions. Otherwise the implied
  //    converted quantity is exactly emissions ÷ factor.
  if (e.factor && e.factor > 0) {
    const normalized = emissions / e.factor;
    const noConversion =
      Math.abs(normalized - e.value) <= Math.max(0.01, Math.abs(e.value) * 0.001);
    if (noConversion) {
      return `${fmtNum(e.value)} ${e.unit} × ${fmtNum(e.factor)} = ${fmtNum(emissions)} ${CO2E}`;
    }
    return `${fmtNum(e.value)} ${e.unit} (= ${fmtNum(normalized)} in factor units) × ${fmtNum(
      e.factor
    )} = ${fmtNum(emissions)} ${CO2E}`;
  }

  // 4) Zero / missing factor (e.g., a zero-emission line).
  return `${fmtNum(e.value)} ${e.unit} × ${fmtNum(e.factor)} = ${fmtNum(emissions)} ${CO2E}`;
}

/**
 * Reconciliation verdict: does a set of contributing line emissions sum to the
 * figure reported for that scope/category? Both are rounded to 2dp and compared
 * with a small tolerance (calc-level scope roll-ups are pre-rounded, so a sub-cent
 * residual is expected and reported rather than hidden).
 */
export function reconcile(
  lineSum: number,
  reportedEmissions: number,
  tolerance = 0.05
): { lineSum: number; reportedEmissions: number; residual: number; reconciled: boolean } {
  const ls = Math.round(lineSum * 100) / 100;
  const rep = Math.round(reportedEmissions * 100) / 100;
  const residual = Math.round((ls - rep) * 100) / 100;
  return {
    lineSum: ls,
    reportedEmissions: rep,
    residual,
    reconciled: Math.abs(residual) <= tolerance,
  };
}
