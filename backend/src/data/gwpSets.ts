/**
 * Versioned Global Warming Potential (GWP-100) reference sets.
 *
 * Values follow the GHG Protocol "Global Warming Potential Values" tables
 * (IPCC AR4/AR5/AR6, 100-year horizon, no climate-carbon feedbacks).
 * Different reporting regimes mandate different sets (e.g. UNFCCC inventories
 * use AR5; Kigali/Montreal use AR4), so the set is selectable per organization
 * (settings.gwpSet) instead of hard-coded.
 *
 * The engine applies these ONLY to factors that carry per-gas values
 * (kg CO2 / kg CH4 / kg N2O per activity unit). Factors denominated directly
 * in kg CO2e already embed a GWP set and are never multiplied again
 * (see CalculationResult.provenance.gwpApplied).
 */

export type GwpSetName = 'AR4' | 'AR5' | 'AR6';

export interface GwpSet {
  name: GwpSetName;
  label: string;
  source: string;
  values: {
    co2: number;
    ch4: number; // fossil methane
    ch4Biogenic: number;
    n2o: number;
    sf6: number;
    nf3: number;
  };
}

export const GWP_SETS: Record<GwpSetName, GwpSet> = {
  AR4: {
    name: 'AR4',
    label: 'IPCC Fourth Assessment Report (2007), GWP-100',
    source: 'IPCC AR4 via GHG Protocol GWP values table',
    values: { co2: 1, ch4: 25, ch4Biogenic: 25, n2o: 298, sf6: 22800, nf3: 17200 },
  },
  AR5: {
    name: 'AR5',
    label: 'IPCC Fifth Assessment Report (2014), GWP-100',
    source: 'IPCC AR5 via GHG Protocol GWP values table',
    values: { co2: 1, ch4: 28, ch4Biogenic: 28, n2o: 265, sf6: 23500, nf3: 16100 },
  },
  AR6: {
    name: 'AR6',
    label: 'IPCC Sixth Assessment Report (2021), GWP-100',
    source: 'IPCC AR6 via GHG Protocol GWP values table (Aug 2024)',
    values: { co2: 1, ch4: 29.8, ch4Biogenic: 27.0, n2o: 273, sf6: 25184, nf3: 17423 },
  },
};

export const DEFAULT_GWP_SET: GwpSetName = 'AR6';

export const isGwpSetName = (v: any): v is GwpSetName =>
  v === 'AR4' || v === 'AR5' || v === 'AR6';
