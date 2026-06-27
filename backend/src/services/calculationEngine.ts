import { EmissionCategory } from '../models/EmissionCategory';
import { EmissionFactor } from '../models/EmissionFactor';
import { Organization } from '../models/Organization';
import { GWP_SETS, DEFAULT_GWP_SET, GwpSetName, isGwpSetName } from '../data/gwpSets';
import { logger } from '../utils/logger';
import { config } from '../config/config';
import axios from 'axios';

export interface CalculationInput {
  categoryId: string;
  value: number;
  unit: string;
  factorId?: string;
  metadata?: Record<string, any>;
  userId?: string;
  organizationId?: string;
  /** Year the activity occurred (e.g. period start year) — used for factor-vintage checks. */
  activityYear?: number;
}

export interface GasBreakdown {
  co2: number;
  ch4: number;
  n2o: number;
  co2e: number;
  /**
   * Biogenic CO2 (kg) from biomass combustion, when the factor is flagged
   * biogenic. Reported SEPARATELY as a memo item, EXCLUDED from `co2e` (the
   * scope total) per the GHG Protocol. Biomass CH4/N2O stay in `co2e`.
   */
  biogenicCO2?: number;
}

export interface CalculationProvenance {
  /** GWP-100 set in force for this organization when computed. */
  gwpSet: GwpSetName;
  /**
   * 'per-gas'  — factor supplied per-gas values; GWPs from gwpSet were applied.
   * 'embedded' — factor is denominated in kg CO2e; its GWPs are embedded by the
   *              publisher and were NOT applied again (no double application).
   */
  gwpApplied: 'per-gas' | 'embedded';
  gasBreakdown?: GasBreakdown;
}

export interface CalculationResult {
  calculation: {
    categoryId: string;
    value: number;
    unit: string;
    factor: number;
    emissions: number;
    metadata?: Record<string, any>;
  };
  factor: {
    id: string;
    name: string;
    value: number;
    unit: string;
    source: string;
    year: number;
    region: string;
    uncertainty?: number;
    /** Set when the factor came from a specific supplier (supplier engagement). */
    supplierId?: string;
    supplierName?: string;
  };
  category: {
    id: string;
    name: string;
    scope: number;
    description: string;
  };
  quality: {
    rating: 'high' | 'medium' | 'low';
    confidence: number;
    notes: string[];
    /** PCAF-style data-quality score: 1 (best) … 5 (worst). */
    dqScore?: number;
  };
  provenance: CalculationProvenance;
  /**
   * Biogenic CO2 (kg) reported separately as a memo item — biomass combustion
   * CO2, EXCLUDED from `calculation.emissions` (the scope total). Set only when
   * the factor is flagged biogenic and per-gas computation was used.
   */
  biogenicCO2?: number;
  /**
   * Fugitive material balance — set when refrigerant component masses were
   * supplied. `releasedKg` is the derived activity quantity (× the blend factor).
   */
  materialBalance?: {
    releasedKg: number;
    components: {
      purchases: number;
      inventoryStart: number;
      inventoryEnd: number;
      chargedIntoEquipment: number;
      recovered: number;
    };
  };
  /** Scope 2 dual reporting (purchased electricity only). */
  scope2Dual?: {
    locationBased: number; // kg CO2e via grid-average factor
    marketBased: number; // kg CO2e via the market-based hierarchy
    marketMethod: string; // which rung of the hierarchy produced the figure
  };
}

// Short-lived cache of organization GWP-set choices so batch imports don't
// query the organization per row.
const gwpSetCache = new Map<string, { set: GwpSetName; expires: number }>();
const GWP_CACHE_TTL_MS = 5 * 60 * 1000;

/** Drop the cached GWP-set choice — called when an organization changes it so
 * the new methodology applies to the very next calculation. */
export function invalidateGwpSetCache(organizationId?: string): void {
  if (organizationId) gwpSetCache.delete(organizationId);
  else gwpSetCache.clear();
}

export class CalculationEngine {
  
  async calculate(input: CalculationInput): Promise<CalculationResult> {
    try {
      logger.info(`Starting calculation for category ${input.categoryId}`);
      
      // 1. Validate and get category
      const category = await this.getAndValidateCategory(input.categoryId);
      
      // 2. Get appropriate emission factor
      const factor = await this.selectEmissionFactor(category, input);

      // 2b. Fugitive material balance: when component masses are supplied, derive
      // the released refrigerant mass and use it as the activity quantity (× the
      // selected blend's kg CO2e/kg). Never fabricates a factor or a leak rate.
      const materialBalance = this.computeMaterialBalance(category, input);
      const activityValue = materialBalance ? materialBalance.releasedKg : input.value;
      const activityUnit = materialBalance ? 'kg' : input.unit;

      // 3. Perform unit conversion if needed
      const normalizedValue = await this.convertUnits(activityValue, activityUnit, category, factor);

      // 4. Resolve the organization's GWP set and calculate emissions.
      //    If the factor carries per-gas values, compute per gas × GWP;
      //    otherwise the factor is CO2e-denominated and used directly
      //    (its publisher's GWPs are embedded — never applied twice).
      const gwpSet = await this.resolveGwpSet(input.organizationId);
      const gasBreakdown = this.computePerGasEmissions(normalizedValue, factor, category, gwpSet);
      const emissions = gasBreakdown
        ? gasBreakdown.co2e
        : this.performCalculation(normalizedValue, factor, category, input);

      // 5. Assess calculation quality
      const quality = this.assessCalculationQuality(factor, category, input);

      // 6. Handle special calculations (e.g., business travel with distance)
      const finalEmissions = await this.handleSpecialCalculations(emissions, category, input, factor);

      // Special calculations recompute from the CO2e factor, so if one
      // overrode the result, GWPs were not applied per gas after all.
      const usedPerGas = !!gasBreakdown && finalEmissions === emissions;
      const provenance: CalculationProvenance = {
        gwpSet,
        gwpApplied: usedPerGas ? 'per-gas' : 'embedded',
        ...(usedPerGas && gasBreakdown ? { gasBreakdown } : {}),
      };

      // Biogenic CO2 (biomass) — separated from the scope total when the per-gas
      // path ran (a special-calculation override would have discarded the split).
      const biogenicCO2 =
        usedPerGas && gasBreakdown?.biogenicCO2 ? gasBreakdown.biogenicCO2 : undefined;

      // Scope 2 dual reporting for purchased electricity.
      const scope2Dual = await this.computeScope2Dual(
        category,
        factor,
        normalizedValue,
        finalEmissions,
        input
      );
      
      const result: CalculationResult = {
        calculation: {
          categoryId: input.categoryId,
          // For a material-balance calc the stored activity quantity is the
          // derived released mass (kg), not the placeholder input value.
          value: activityValue,
          unit: activityUnit,
          factor: factor.factor,
          emissions: finalEmissions,
          metadata: {
            ...input.metadata,
            // Method precedence: material balance (fugitive) > supplier-specific
            // (primary data) > the category default. Records how the number was made.
            calculationMethod: materialBalance
              ? 'material-balance'
              : factor.supplierId
              ? 'supplier-specific'
              : category.calculationMethod,
            factorRegion: factor.region,
            qualityRating: quality.rating,
          },
        },
        factor: {
          id: factor.id,
          name: factor.name,
          value: factor.factor,
          unit: factor.unit,
          source: factor.source,
          year: factor.year,
          region: factor.region,
          uncertainty: factor.uncertainty,
          ...(factor.supplierId
            ? { supplierId: factor.supplierId.toString(), supplierName: factor.supplierName }
            : {}),
        },
        category: {
          id: category.id,
          name: category.category,
          scope: category.scope,
          description: category.description,
        },
        quality,
        provenance,
        ...(biogenicCO2 ? { biogenicCO2 } : {}),
        ...(materialBalance ? { materialBalance } : {}),
        ...(scope2Dual ? { scope2Dual } : {}),
      };

      logger.info(`Calculation completed: ${finalEmissions} kg CO2e (GWP set ${gwpSet}, ${provenance.gwpApplied})`);
      return result;
      
    } catch (error) {
      logger.error('Calculation failed:', error);
      throw error;
    }
  }

  private async getAndValidateCategory(categoryId: string) {
    const category = await EmissionCategory.findById(categoryId);
    
    if (!category) {
      throw new Error('Emission category not found');
    }
    
    if (!category.isActive) {
      throw new Error('Emission category is not active');
    }
    
    return category;
  }

  private async selectEmissionFactor(category: any, input: CalculationInput) {
    let factor;
    
    if (input.factorId) {
      // Use specific factor if provided — but only if it is shared (library)
      // or belongs to the caller's organization (no cross-tenant factors).
      factor = await EmissionFactor.findById(input.factorId);
      if (!factor) {
        throw new Error('Specified emission factor not found');
      }
      if (
        factor.organizationId &&
        factor.organizationId.toString() !== (input.organizationId || '')
      ) {
        throw new Error('Specified emission factor not found');
      }
    } else {
      // Smart factor selection (GHGP method hierarchy + Egyptian-market mandate)
      factor = await this.findBestEmissionFactor(category, input);
    }
    
    if (!factor) {
      throw new Error('No suitable emission factor found for this category');
    }
    
    return factor;
  }

  /**
   * Automatic factor selection — Egyptian-default policy.
   *
   * EGYPTIAN factors are the PRIMARY DEFAULT (product mandate: the main
   * market is and will remain Egypt). A different factor is used only when
   * the user actively chooses one — by explicitly selecting it in the
   * calculator (input.factorId, which bypasses this method entirely) or by
   * creating/selecting their own custom factor. Tier order when nothing is
   * explicitly selected:
   *   1. EGYPTIAN shared factors (the default).
   *   2. The organization's own custom factors (used automatically only when
   *      no Egyptian factor exists for the category).
   *   3. Global, then other regional shared factors.
   *
   * Within a tier, the vintage closest to the activity year wins (preferring
   * factors published in or before that year), then isDefault as a tiebreak.
   */
  private async findBestEmissionFactor(category: any, input: CalculationInput) {
    const searchCriteria: any = {
      categoryId: category._id,
      isActive: true,
    };

    // Add metadata-based filtering
    if (input.metadata?.fuelType) {
      searchCriteria.fuelType = input.metadata.fuelType;
    }

    if (input.metadata?.vehicleType) {
      searchCriteria.vehicleType = input.metadata.vehicleType;
    }

    const activityYear = input.activityYear ?? new Date().getFullYear();
    const sharedScope = [{ organizationId: { $exists: false } }, { organizationId: null }];

    // Best vintage for the activity year: prefer factors published in or
    // before the year (no future factors), then smallest year distance,
    // then default factors.
    const pickBestVintage = (factors: any[]) => {
      if (factors.length === 0) return null;
      const notAfter = factors.filter((f) => (f.year ?? 0) <= activityYear);
      const pool = notAfter.length > 0 ? notAfter : factors;
      pool.sort((a, b) => {
        const da = Math.abs(activityYear - (a.year ?? 0));
        const db = Math.abs(activityYear - (b.year ?? 0));
        if (da !== db) return da - db;
        return (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0);
      });
      return pool[0];
    };

    // Tier 1: EGYPTIAN shared factors — the primary default.
    const egyptian = await EmissionFactor.find({
      ...searchCriteria,
      region: 'egypt',
      $or: sharedScope,
    });
    const bestEgyptian = pickBestVintage(egyptian);
    if (bestEgyptian) {
      logger.info(`Selected Egyptian (default) emission factor: ${bestEgyptian.name} (${bestEgyptian.year})`);
      return bestEgyptian;
    }

    // Tier 2: organization's own custom factors (no Egyptian factor exists).
    if (input.organizationId) {
      const customs = await EmissionFactor.find({
        ...searchCriteria,
        organizationId: input.organizationId,
      });
      const best = pickBestVintage(customs);
      if (best) {
        logger.info(`Selected org-custom emission factor: ${best.name} (${best.year})`);
        return best;
      }
    }

    // Tiers 3+: remaining shared library factors by region.
    const regions = ['global', 'mena', 'eu', 'us'];
    for (const region of regions) {
      const factors = await EmissionFactor.find({
        ...searchCriteria,
        region,
        $or: sharedScope,
      });
      const best = pickBestVintage(factors);
      if (best) {
        logger.info(`Selected ${region} emission factor: ${best.name} (${best.year})`);
        return best;
      }
    }

    // Fallback: any shared factor for this category.
    const rest = await EmissionFactor.find({ ...searchCriteria, $or: sharedScope });
    return pickBestVintage(rest);
  }

  private async convertUnits(value: number, fromUnit: string, category: any, factor: any): Promise<number> {
    // 'trip' is a sentinel for distance-based travel: the value is a placeholder
    // that handleSpecialCalculations recomputes from distance, so skip conversion.
    if (fromUnit === 'trip') {
      return value;
    }

    const conversions = this.getUnitConversions();

    // Prefer the factor's OWN denominator unit — the unit its per-unit value is
    // expressed in (e.g. 'kg CO2e/mmBtu' → 'mmBtu'). A single category can then
    // hold factors on different physical bases: EPA stationary fuels are per
    // mmBtu (energy, HHV) or per short ton / scf / gallon, none of which is the
    // category's base unit. This converts the input INTO the factor's denominator,
    // which is always dimensionally correct. Guarded — only used when the input
    // equals, or has a KNOWN conversion to, that denominator; otherwise we fall
    // through to the legacy base-unit handling so existing factors are unaffected.
    const denom = this.factorDenominator(factor.unit);
    if (denom) {
      if (fromUnit === denom) return value;
      const denomKey = `${fromUnit}_to_${denom}`;
      if (conversions[denomKey] !== undefined) return value * conversions[denomKey];
    }

    // Check if units match
    if (fromUnit === factor.unit || fromUnit === category.baseUnit) {
      return value;
    }

    // Find conversion factor in category's allowed units
    const allowedUnit = category.allowedUnits?.find((u: any) => u.unit === fromUnit);

    if (allowedUnit && allowedUnit.conversionToBase) {
      return value * allowedUnit.conversionToBase;
    }

    // Common unit conversions
    const conversionKey = `${fromUnit}_to_${factor.unit}`;

    if (conversions[conversionKey]) {
      return value * conversions[conversionKey];
    }

    // If no conversion is known and the units genuinely differ, FAIL LOUDLY.
    // Silently using the value as-is here previously produced wrong-magnitude results.
    throw new Error(
      `Cannot convert units: no known conversion from "${fromUnit}" to "${factor.unit}" ` +
        `for category "${category.category}". Provide the value in "${factor.unit}" ` +
        `(or "${category.baseUnit}"), or add a conversion for this unit.`
    );
  }

  /**
   * The denominator unit of a factor's unit string ('kg CO2e/mmBtu' → 'mmBtu').
   * Returns null for a bare unit with no '/', which the legacy match path handles.
   */
  private factorDenominator(unit?: string): string | null {
    if (!unit || typeof unit !== 'string') return null;
    const slash = unit.indexOf('/');
    if (slash < 0) return null;
    const denom = unit.slice(slash + 1).trim();
    return denom || null;
  }

  private getUnitConversions(): Record<string, number> {
    return {
      // Energy conversions
      'MWh_to_kWh': 1000,
      'kWh_to_MWh': 0.001,
      'GJ_to_kWh': 277.778,
      'kWh_to_GJ': 0.0036,
      'TJ_to_GJ': 1000,
      'GJ_to_TJ': 0.001,
      'TJ_to_kWh': 277777.78,
      'kWh_to_TJ': 0.0000036,
      'therm_to_kWh': 29.31,
      'kWh_to_therm': 0.0341,
      'therm_to_GJ': 0.1055,
      'GJ_to_therm': 9.478,
      'toe_to_GJ': 41.868,
      'GJ_to_toe': 0.0239,
      'toe_to_kWh': 11630,
      'kWh_to_toe': 0.000086,
      'kcal_to_kWh': 0.001163,
      'kWh_to_kcal': 860.05,
      'MJ_to_kWh': 0.2778,
      'kWh_to_MJ': 3.6,
      'Btu_to_kWh': 0.000293,
      'kWh_to_Btu': 3412.14,

      // Imperial energy basis (mmBtu) — EPA factors are denominated per mmBtu
      // (HHV). 1 mmBtu = 293.07107 kWh = 1.05505585 GJ = 10 therms = 1e6 Btu.
      'mmBtu_to_kWh': 293.07107,
      'kWh_to_mmBtu': 0.00341214163,
      'mmBtu_to_GJ': 1.05505585,
      'GJ_to_mmBtu': 0.947817120,
      'mmBtu_to_MJ': 1055.05585,
      'MJ_to_mmBtu': 0.000947817120,
      'mmBtu_to_therm': 10,
      'therm_to_mmBtu': 0.1,
      'mmBtu_to_Btu': 1000000,
      'Btu_to_mmBtu': 0.000001,
      'MWh_to_mmBtu': 3.41214163,
      'mmBtu_to_MWh': 0.29307107,
      'TJ_to_mmBtu': 947.817120,

      // US short ton (= 907.18474 kg) — EPA solid-fuel physical basis.
      'short ton_to_kg': 907.18474,
      'kg_to_short ton': 0.00110231131,
      'short ton_to_t': 0.90718474,
      't_to_short ton': 1.10231131,
      'short ton_to_lb': 2000,
      'lb_to_short ton': 0.0005,

      // US gallon (= 3.785411784 L) — EPA liquid-fuel physical basis.
      'gallon_to_L': 3.78541178,
      'L_to_gallon': 0.264172052,
      'gallon_to_m³': 0.00378541178,
      'm³_to_gallon': 264.172052,

      // Standard cubic foot (scf) — EPA gaseous-fuel physical basis. The existing
      // m³↔scf pair (below) already converts m³ input to the scf denominator; these
      // add the imperial cubic-foot aliases.
      'ft³_to_scf': 1,
      'scf_to_ft³': 1,
      'Nm³_to_scf': 35.3146667,

      // Mass conversions
      't_to_kg': 1000,
      'kg_to_t': 0.001,
      'g_to_kg': 0.001,
      'kg_to_g': 1000,
      'lb_to_kg': 0.453592,
      'kg_to_lb': 2.20462,
      'oz_to_kg': 0.0283495,
      'kg_to_oz': 35.274,
      'ton_UK_to_kg': 1016.05,
      'kg_to_ton_UK': 0.000984,
      'ton_US_to_kg': 907.185,
      'kg_to_ton_US': 0.00110231,
      'ton_UK_to_t': 1.01605,
      't_to_ton_UK': 0.984207,
      'ton_US_to_t': 0.907185,
      't_to_ton_US': 1.10231,
      
      // Distance conversions
      'miles_to_km': 1.60934,
      'km_to_miles': 0.621371,
      'm_to_km': 0.001,
      'km_to_m': 1000,
      'ft_to_m': 0.3048,
      'm_to_ft': 3.28084,
      'in_to_m': 0.0254,
      'm_to_in': 39.3701,
      'nm_to_km': 1.852,  // nautical miles
      'km_to_nm': 0.539957,
      'miles_to_m': 1609.34,
      'm_to_miles': 0.000621371,
      
      // Volume conversions (Liquid)
      'm³_to_L': 1000,
      'L_to_m³': 0.001,
      'gal_US_to_L': 3.78541,
      'L_to_gal_US': 0.264172,
      'gal_UK_to_L': 4.54609,
      'L_to_gal_UK': 0.219969,
      'gal_to_L': 3.78541,  // default to US gallon
      'L_to_gal': 0.264172,
      'bbl_to_L': 158.987,  // barrel (petroleum)
      'L_to_bbl': 0.00629,
      'ft³_to_L': 28.3168,
      'L_to_ft³': 0.0353147,
      'ft³_to_m³': 0.0283168,
      'm³_to_ft³': 35.3147,
      'ml_to_L': 0.001,
      'L_to_ml': 1000,
      
      // Area conversions
      'hectare_to_m²': 10000,
      'm²_to_hectare': 0.0001,
      'acre_to_m²': 4046.86,
      'm²_to_acre': 0.000247105,
      'acre_to_hectare': 0.404686,
      'hectare_to_acre': 2.47105,
      'km²_to_m²': 1000000,
      'm²_to_km²': 0.000001,
      'km²_to_hectare': 100,
      'hectare_to_km²': 0.01,
      'ft²_to_m²': 0.092903,
      'm²_to_ft²': 10.7639,
      
      // Transportation specific conversions
      'passenger_km_to_passenger_mile': 0.621371,
      'passenger_mile_to_passenger_km': 1.60934,
      'vehicle_km_to_vehicle_mile': 0.621371,
      'vehicle_mile_to_vehicle_km': 1.60934,
      'tonne_km_to_tonne_mile': 0.621371,
      'tonne_mile_to_tonne_km': 1.60934,
      'kg_km_to_kg_mile': 0.621371,
      'kg_mile_to_kg_km': 1.60934,
      
      // Time conversions (for rates)
      'day_to_hour': 24,
      'hour_to_day': 0.0416667,
      'week_to_day': 7,
      'day_to_week': 0.142857,
      'year_to_day': 365.25,
      'day_to_year': 0.00273973,
      'month_to_day': 30,
      'day_to_month': 0.0328542,
      
      // Pressure conversions (for gas measurements)
      'bar_to_psi': 14.5038,
      'psi_to_bar': 0.0689476,
      'atm_to_bar': 1.01325,
      'bar_to_atm': 0.986923,
      'Pa_to_bar': 0.00001,
      'bar_to_Pa': 100000,
      
      // Temperature conversions (difference, not absolute)
      'degC_to_degF_diff': 1.8,  // for temperature differences
      'degF_to_degC_diff': 0.555556,
      'K_to_degC_diff': 1,
      'degC_to_K_diff': 1,
      
      // Waste-related conversions
      'yd³_to_m³': 0.764555,
      'm³_to_yd³': 1.30795,
      'yd³_to_L': 764.555,
      'L_to_yd³': 0.00130795,
      
      // Water-specific conversions
      'kgal_to_L': 3785.41,  // thousand gallons US
      'L_to_kgal': 0.000264172,
      'Mgal_to_L': 3785410,  // million gallons US
      'L_to_Mgal': 0.000000264172,
      'kgal_to_m³': 3.78541,
      'm³_to_kgal': 0.264172,
      
      // Financial conversions (rates per unit)
      'USD_per_kWh_to_EGP_per_kWh': 50,  // approximate exchange rate
      'EUR_per_kWh_to_EGP_per_kWh': 59,  // approximate exchange rate
      'GBP_per_kWh_to_EGP_per_kWh': 69,  // approximate exchange rate
      
      // Electricity grid losses (typical transmission & distribution)
      'kWh_delivered_to_kWh_generated': 1.08,  // ~8% T&D losses
      'kWh_generated_to_kWh_delivered': 0.926,
      
      // Fuel density conversions (approximate)
      'L_diesel_to_kg': 0.85,
      'kg_to_L_diesel': 1.176,
      'L_petrol_to_kg': 0.75,
      'kg_to_L_petrol': 1.333,
      'L_LPG_to_kg': 0.55,
      'kg_to_L_LPG': 1.818,
      
      // Gas volume conversions (at standard conditions)
      'Nm³_to_m³': 1,  // normal cubic meters to cubic meters (at STP)
      'm³_to_Nm³': 1,
      'scf_to_m³': 0.0283168,  // standard cubic feet
      'm³_to_scf': 35.3147,
      
      // Additional energy conversions for specific fuels
      'L_diesel_to_kWh': 10,  // approximate net calorific value
      'kWh_to_L_diesel': 0.1,
      'L_petrol_to_kWh': 9,   // approximate net calorific value
      'kWh_to_L_petrol': 0.111,
      'kg_LPG_to_kWh': 12.8,  // approximate net calorific value
      'kWh_to_kg_LPG': 0.078,
      'kg_natural_gas_to_kWh': 13.5,  // approximate net calorific value
      'kWh_to_kg_natural_gas': 0.074,
      
      // Paper and material conversions
      'ream_to_kg': 2.5,  // standard ream of paper
      'kg_to_ream': 0.4,
      'sheet_to_kg': 0.005,  // standard A4 paper sheet
      'kg_to_sheet': 200,
    };
  }

  /**
   * Scope 2 dual reporting (GHG Protocol Scope 2 Guidance): every purchased-
   * electricity record carries BOTH a location-based figure (grid average)
   * and a market-based figure.
   *
   * Market-based hierarchy implemented so far:
   *   - supplier-specific emission rate → the organization's own custom
   *     factor, when one was used for the calculation;
   *   - otherwise grid average as the final fallback. Egypt has no
   *     contractual-instrument market (no certificate tracking system or
   *     published residual mix), so per the Guidance the grid average is the
   *     correct market-based figure in the absence of instruments.
   * Certificate/PPA registry rungs are future work (see gap analysis §2.3).
   */
  private async computeScope2Dual(
    category: any,
    usedFactor: any,
    normalizedValue: number,
    finalEmissions: number,
    input: CalculationInput
  ): Promise<{ locationBased: number; marketBased: number; marketMethod: string } | null> {
    if (category.scope !== 2 || !/electricity/i.test(category.category || '')) {
      return null;
    }

    const usedSupplierSpecific =
      usedFactor.organizationId &&
      usedFactor.organizationId.toString() === (input.organizationId || '');

    if (usedSupplierSpecific) {
      // A supplier-specific (market-instrument) factor was used → it is the
      // MARKET-based figure. The location-based figure falls back to the shared
      // grid-average for the location: Egyptian grid first (market mandate),
      // global as fallback, else the computed value if no grid factor exists.
      const sharedScope = [{ organizationId: { $exists: false } }, { organizationId: null }];
      let gridFactor = await EmissionFactor.findOne({
        categoryId: category._id,
        region: 'egypt',
        isActive: true,
        $or: sharedScope,
      }).sort({ year: -1, isDefault: -1 });
      if (!gridFactor) {
        gridFactor = await EmissionFactor.findOne({
          categoryId: category._id,
          region: 'global',
          isActive: true,
          $or: sharedScope,
        }).sort({ year: -1, isDefault: -1 });
      }
      const locationBased = gridFactor
        ? Math.round(normalizedValue * gridFactor.factor * 100) / 100
        : finalEmissions;
      return {
        locationBased,
        marketBased: finalEmissions,
        marketMethod: usedFactor.supplierName
          ? `supplier-specific rate (${usedFactor.supplierName})`
          : 'supplier-specific rate (organization custom factor)',
      };
    }

    // A grid-average factor was selected (the Egyptian grid default, an eGRID US
    // subregion, or another regional grid). That factor IS the location-based
    // factor, so the location-based figure equals the headline result — never a
    // different grid. With no contractual instruments, market-based equals it.
    return {
      locationBased: finalEmissions,
      marketBased: finalEmissions,
      marketMethod:
        usedFactor.region === 'egypt'
          ? 'grid average — no contractual-instrument market in Egypt (Scope 2 Guidance fallback)'
          : 'grid-average factor (location-based) — no contractual instruments applied',
    };
  }

  /** Organization's chosen GWP set (cached briefly for batch flows). */
  private async resolveGwpSet(organizationId?: string): Promise<GwpSetName> {
    if (!organizationId) return DEFAULT_GWP_SET;
    const cached = gwpSetCache.get(organizationId);
    if (cached && cached.expires > Date.now()) return cached.set;
    try {
      const org = await Organization.findById(organizationId).select('settings.gwpSet').lean();
      const set = isGwpSetName((org as any)?.settings?.gwpSet)
        ? ((org as any).settings.gwpSet as GwpSetName)
        : DEFAULT_GWP_SET;
      gwpSetCache.set(organizationId, { set, expires: Date.now() + GWP_CACHE_TTL_MS });
      return set;
    } catch {
      return DEFAULT_GWP_SET;
    }
  }

  /**
   * Fugitive material balance (GHG Protocol screening / mass-balance method).
   * Derives the refrigerant mass RELEASED over the period from component masses:
   *
   *   released = purchases + (inventoryStart − inventoryEnd)
   *              − chargedIntoEquipment − recovered
   *
   * i.e. refrigerant acquired/drawn-down that did NOT go into new equipment and
   * was NOT recovered/recycled/destroyed. Every input is a user-supplied mass
   * (kg) — no leak rate or factor is assumed. Returns null (use the plain path)
   * unless the category is Fugitive and a `materialBalance` metadata object is
   * present. The released mass is later multiplied by the selected blend factor
   * (kg CO2e/kg), so the GWP is the publisher's embedded value.
   */
  private computeMaterialBalance(
    category: any,
    input: CalculationInput
  ): { releasedKg: number; components: { purchases: number; inventoryStart: number; inventoryEnd: number; chargedIntoEquipment: number; recovered: number } } | null {
    const name = (category.category || '').toLowerCase();
    const mb = input.metadata?.materialBalance;
    if (!name.includes('fugitive') || !mb || typeof mb !== 'object') return null;

    const n = (v: any) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : 0);
    const components = {
      purchases: n(mb.purchases),
      inventoryStart: n(mb.inventoryStart),
      inventoryEnd: n(mb.inventoryEnd),
      chargedIntoEquipment: n(mb.chargedIntoEquipment),
      recovered: n(mb.recovered),
    };
    // Released mass cannot be negative (a net inventory build-up is not an
    // emission); clamp at 0 and let the user document any anomaly.
    const released = Math.max(
      0,
      components.purchases +
        (components.inventoryStart - components.inventoryEnd) -
        components.chargedIntoEquipment -
        components.recovered
    );
    return { releasedKg: Math.round(released * 10000) / 10000, components };
  }

  /**
   * Per-gas calculation: activity × gas factor × GWP, summed to CO2e.
   * Returns null when the factor has no per-gas values (CO2e-denominated) or
   * the method isn't a plain activity multiplication — those use the legacy path.
   */
  private computePerGasEmissions(
    value: number,
    factor: any,
    category: any,
    gwpSet: GwpSetName
  ): GasBreakdown | null {
    const hasPerGas = (factor.co2 || 0) > 0 || (factor.ch4 || 0) > 0 || (factor.n2o || 0) > 0;
    if (!hasPerGas) return null;
    if (category.calculationMethod !== 'activity_based') return null;

    const gwp = GWP_SETS[gwpSet].values;
    const totalCo2 = value * (factor.co2 || 0); // kg CO2 (GWP 1)
    const ch4 = value * (factor.ch4 || 0); // kg CH4
    const n2o = value * (factor.n2o || 0); // kg N2O
    // otherGhg, when present, is already CO2e-denominated by convention.
    const otherCo2e = value * (factor.otherGhg || 0);

    // Biogenic CO2 (biomass combustion) is reported SEPARATELY as a memo item,
    // NOT in the Scope 1/2/3 totals (GHG Protocol). Only the CO2 is biogenic —
    // biomass CH4/N2O still count in the scope. The split changes WHERE the CO2
    // is reported, not its value (biogenic CO2 is GWP 1; no double-application).
    const isBiogenic = factor.metadata?.biogenic === true;
    const biogenicCO2 = isBiogenic ? totalCo2 : 0;
    const scopeCo2 = isBiogenic ? 0 : totalCo2;

    const co2e =
      Math.round((scopeCo2 * gwp.co2 + ch4 * gwp.ch4 + n2o * gwp.n2o + otherCo2e) * 100) / 100;

    return {
      co2: Math.round(scopeCo2 * 10000) / 10000,
      ch4: Math.round(ch4 * 10000) / 10000,
      n2o: Math.round(n2o * 10000) / 10000,
      co2e,
      ...(biogenicCO2 > 0 ? { biogenicCO2: Math.round(biogenicCO2 * 10000) / 10000 } : {}),
    };
  }

  /**
   * Deterministic recompute of a STORED calculation entry against a given factor
   * snapshot (the recompute-check endpoint, §3). Reuses exactly the same pure
   * math the original calculation used — unit conversion into the factor's
   * denominator, then either the per-gas path (when the entry was computed per
   * gas) or the plain value × factor path — so a locked inventory's pinned
   * factor version reproduces its stored figure bit-for-bit.
   *
   * Returns { supported:false } for entries whose result came from a special
   * calculation (distance/class-based travel, time-of-use) that needs metadata
   * not stored on the entry, or whose unit no longer converts — those cannot be
   * reproduced from the entry alone and must not be falsely flagged as drift.
   */
  async recomputeEntryAgainstFactor(
    entry: { value: number; unit: string; gwpSet?: string; gwpApplied?: string; method?: string },
    factorLike: any,
    category: any
  ): Promise<{ supported: boolean; emissions?: number; biogenicCO2?: number; note?: string }> {
    const catName = (category?.category || '').toLowerCase();
    if (catName.includes('travel')) {
      return {
        supported: false,
        note: 'Distance/class-based travel — original distance metadata is not stored on the entry',
      };
    }

    let converted: number;
    try {
      converted = await this.convertUnits(entry.value, entry.unit, category, factorLike);
    } catch (e) {
      return { supported: false, note: e instanceof Error ? e.message : 'unit conversion failed' };
    }

    if (entry.gwpApplied === 'per-gas') {
      const gwpSet = isGwpSetName(entry.gwpSet) ? (entry.gwpSet as GwpSetName) : DEFAULT_GWP_SET;
      const gb = this.computePerGasEmissions(converted, factorLike, category, gwpSet);
      if (gb) {
        return { supported: true, emissions: gb.co2e, ...(gb.biogenicCO2 ? { biogenicCO2: gb.biogenicCO2 } : {}) };
      }
      // Entry was per-gas but this snapshot carries no per-gas values — fall back
      // to the plain path (will surface as a mismatch if the snapshot is wrong).
    }

    const emissions = this.performCalculation(converted, factorLike, category, {
      categoryId: '',
      value: converted,
      unit: factorLike?.unit,
      metadata: {},
    });
    return { supported: true, emissions };
  }

  private performCalculation(value: number, factor: any, category: any, input: CalculationInput): number {
    // Basic calculation: value * emission factor
    let emissions = value * factor.factor;
    
    // Apply calculation method specific logic
    switch (category.calculationMethod) {
      case 'activity_based':
        // Direct multiplication - already done above
        break;
        
      case 'spend_based':
        // For spend-based, might need currency conversion or sector-specific factors
        emissions = this.applySpendBasedCalculation(value, factor, input);
        break;
        
      case 'hybrid':
        // Combine activity and spend-based approaches
        emissions = this.applyHybridCalculation(value, factor, input);
        break;
        
      default:
        // Default to direct calculation
        break;
    }
    
    // Apply any regional adjustments for Egyptian context
    if (factor.egyptianData?.adjustmentFactor) {
      emissions *= factor.egyptianData.adjustmentFactor;
    }
    
    return Math.round(emissions * 100) / 100; // Round to 2 decimal places
  }

  private applySpendBasedCalculation(value: number, factor: any, input: CalculationInput): number {
    // For spend-based calculations, apply currency conversion if needed
    let adjustedValue = value;
    
    if (input.metadata?.currency && input.metadata.currency !== 'EGP') {
      // Apply currency conversion (simplified - in production, use real-time rates)
      const conversionRates: Record<string, number> = {
        'USD': 50,    // 1 USD = 50 EGP (approximate)
        'EUR': 59,    // 1 EUR = 59 EGP (approximate)
        'GBP': 69,    // 1 GBP = 69 EGP (approximate)
      };
      
      adjustedValue = value * (conversionRates[input.metadata.currency] || 1);
    }
    
    return adjustedValue * factor.factor;
  }

  private applyHybridCalculation(value: number, factor: any, input: CalculationInput): number {
    // Hybrid approach - use activity data when available, fallback to spend-based
    if (input.metadata?.activityData) {
      return input.metadata.activityData * factor.factor;
    }
    
    return this.applySpendBasedCalculation(value, factor, input);
  }

  private assessCalculationQuality(factor: any, category: any, input: CalculationInput) {
    const notes: string[] = [];
    let confidence = 100;
    let rating: 'high' | 'medium' | 'low' = 'high';
    
    // Factor quality assessment
    if (factor.supplierId) {
      notes.push(`Using supplier-specific emission factor (primary data: ${factor.supplierName || 'supplier'})`);
      confidence += 10;
    } else if (factor.region === 'egypt') {
      notes.push('Using Egyptian-specific emission factor');
      confidence += 10;
    } else {
      notes.push('Using global emission factor (Egyptian factor not available)');
      confidence -= 10;
    }
    
    // Factor vintage vs activity period (factor-year matching requirement):
    // activity in FY2025 should not silently use a 2022-vintage factor.
    if (input.activityYear && factor.year && input.activityYear - factor.year >= 2) {
      notes.push(
        `Factor vintage (${factor.year}) is stale for activity year ${input.activityYear} — refresh the factor library for this period`
      );
      confidence -= 10;
      rating = rating === 'high' ? 'medium' : rating;
    }

    // Factor age assessment
    const currentYear = new Date().getFullYear();
    const factorAge = currentYear - factor.year;

    if (factorAge <= 2) {
      notes.push('Recent emission factor (≤2 years old)');
    } else if (factorAge <= 5) {
      notes.push('Moderately recent emission factor (3-5 years old)');
      confidence -= 5;
    } else {
      notes.push('Older emission factor (>5 years old) - consider updating');
      confidence -= 15;
      rating = 'medium';
    }
    
    // Factor source assessment
    const highQualitySources = ['DEFRA', 'IPCC', 'IEA', 'EEHC', 'EPA'];
    if (highQualitySources.some(source => factor.source.includes(source))) {
      notes.push('High-quality data source');
    } else {
      notes.push('Custom or secondary data source');
      confidence -= 5;
    }
    
    // Uncertainty assessment
    if (factor.uncertainty) {
      if (factor.uncertainty > 50) {
        notes.push('High uncertainty in emission factor');
        confidence -= 20;
        rating = 'low';
      } else if (factor.uncertainty > 20) {
        notes.push('Moderate uncertainty in emission factor');
        confidence -= 10;
        rating = rating === 'high' ? 'medium' : rating;
      }
    }
    
    // Data completeness assessment
    const requiredInputs = category.requiredInputs || [];
    const providedInputs = Object.keys(input.metadata || {});
    const completeness = providedInputs.length / Math.max(requiredInputs.length, 1);
    
    if (completeness < 0.5) {
      notes.push('Limited input data provided');
      confidence -= 15;
      rating = 'medium';
    } else if (completeness < 1) {
      notes.push('Some optional input data missing');
      confidence -= 5;
    }
    
    // Final confidence adjustment
    confidence = Math.max(0, Math.min(100, confidence));

    // Adjust rating based on final confidence
    if (confidence < 50) {
      rating = 'low';
    } else if (confidence < 75) {
      rating = rating === 'low' ? 'low' : 'medium';
    }

    // PCAF-style data-quality score (1 best … 5 worst), derived from the
    // factor tier and calculation method. Estimates are forced to 5 by the
    // save path (the engine never sees the isEstimate flag).
    //
    // A supplier-linked factor is PRIMARY data: the entry uses the
    // supplier-specific method (top of the GHGP Scope 3 hierarchy) regardless
    // of the category's default method, so the spend-based downgrade does not
    // apply to it — it pins DQ 1.
    const isSupplierSpecific = !!factor.supplierId;
    let dqScore = 3; // global/average factor with activity data
    if (factor.organizationId) dqScore = 1; // supplier/organization-specific
    else if (factor.region === 'egypt') dqScore = 2; // region-specific
    if (!isSupplierSpecific && category.calculationMethod === 'spend_based') dqScore = Math.max(dqScore, 4);
    if (!isSupplierSpecific && factor.qualityRating === 'low') dqScore = Math.max(dqScore, 4);

    return {
      dqScore,
      rating,
      confidence,
      notes,
    };
  }

  private async handleSpecialCalculations(
    emissions: number,
    category: any,
    input: CalculationInput,
    factor: any
  ): Promise<number> {
    const categoryName = (category.category || '').toLowerCase();

    // Distance-based travel: recompute from actual distance and the selected factor.
    const hasRoute = input.metadata?.origin && input.metadata?.destination;
    const hasDistance = typeof input.metadata?.distance === 'number' && input.metadata.distance > 0;
    if (categoryName.includes('travel') && (hasRoute || hasDistance)) {
      return this.calculateBusinessTravelEmissions(input, factor);
    }

    // Electricity with time-of-use factors (if provided)
    if (categoryName.includes('electricity') && input.metadata?.timeOfUse) {
      return this.applyTimeOfUseFactors(emissions, input.metadata.timeOfUse);
    }

    return emissions;
  }

  /**
   * Distance-based travel emissions.
   * emissions = distance(km) × factor(kg CO2e per km) × classMultiplier × roundTripMultiplier
   *
   * The per-distance emission factor comes from the selected DB factor (NOT a hardcoded
   * constant). The factor for travel categories must be expressed per km / passenger-km.
   * If a real distance cannot be determined, this throws so the caller can require manual
   * input — it never silently returns a placeholder value.
   */
  private async calculateBusinessTravelEmissions(input: CalculationInput, factor: any): Promise<number> {
    const { origin, destination, travelMode, travelClass, roundTrip } = input.metadata || {};

    // 1. Determine distance (km): explicit value preferred, else airport lookup for flights.
    let distance: number | undefined =
      typeof input.metadata?.distance === 'number' && input.metadata.distance > 0
        ? input.metadata.distance
        : undefined;

    if (distance === undefined && travelMode === 'Flight' && origin && destination) {
      distance = await this.getAirportDistance(String(origin), String(destination));
    }

    if (distance === undefined || !(distance > 0)) {
      throw new Error(
        'Unable to determine travel distance automatically. Please provide "distance" (in km) in the calculation metadata.'
      );
    }

    // 2. Per-km emission factor from the selected DB factor.
    const perKm = Number(factor?.factor);
    if (!Number.isFinite(perKm) || perKm <= 0) {
      throw new Error('No valid per-distance emission factor available for this travel category.');
    }

    // 3. Cabin-class multiplier applies to flights only (simplified estimate).
    const classMultipliers: Record<string, number> = { Economy: 1.0, Business: 1.5, First: 2.0 };
    const classMultiplier =
      travelMode === 'Flight' ? classMultipliers[String(travelClass)] ?? 1.0 : 1.0;

    const roundTripMultiplier = roundTrip === true || roundTrip === 'true' ? 2 : 1;

    const emissions = distance * perKm * classMultiplier * roundTripMultiplier;
    return Math.round(emissions * 100) / 100;
  }

  private async getAirportDistance(origin: string, destination: string): Promise<number> {
    const from = encodeURIComponent(origin.trim().toUpperCase());
    const to = encodeURIComponent(destination.trim().toUpperCase());

    try {
      const headers: Record<string, string> = {};
      if (config.AIRPORT_API_KEY) {
        headers.Authorization = `Bearer ${config.AIRPORT_API_KEY}`;
      }
      const response = await axios.post(
        'https://airportgap.com/api/airports/distance',
        { from, to },
        { headers, timeout: 5000 }
      );

      const km = response.data?.data?.attributes?.kilometers;
      if (typeof km === 'number' && km > 0) {
        return km;
      }
      throw new Error('Invalid airport distance API response');
    } catch (error) {
      logger.warn('Airport distance lookup failed; trying local fallback table.', error);

      // Offline fallback for common Cairo routes (IATA codes).
      const cairoCentricDistances: Record<string, number> = {
        'CAI-DXB': 2196, 'CAI-LHR': 3520, 'CAI-JFK': 8965, 'CAI-CDG': 3221,
        'CAI-FRA': 2895, 'CAI-IST': 1094, 'CAI-DOH': 1832, 'CAI-RUH': 1278,
      };
      const o = origin.trim().toUpperCase();
      const d = destination.trim().toUpperCase();
      const dist = cairoCentricDistances[`${o}-${d}`] ?? cairoCentricDistances[`${d}-${o}`];
      if (dist) return dist;

      // No silent default — force explicit distance entry instead of a wrong number.
      throw new Error(
        'Distance calculation failed for this route. Please enter the distance (in km) manually.'
      );
    }
  }

  private applyTimeOfUseFactors(emissions: number, timeOfUse: string): number {
    // Egyptian grid has different emission factors by time of day due to energy mix
    const timeFactors = {
      'peak': 1.0,      // Peak hours: higher fossil fuel usage
      'off-peak': 1.0,  // Off-peak: more renewable/efficient generation
      'standard': 1.0,  // Standard hours
    };
    
    const factor = timeFactors[timeOfUse as keyof typeof timeFactors] || 1.0;
    return emissions * factor;
  }

  // Batch calculation for multiple items
  async calculateBatch(inputs: CalculationInput[]): Promise<CalculationResult[]> {
    const results: CalculationResult[] = [];
    
    for (const input of inputs) {
      try {
        const result = await this.calculate(input);
        results.push(result);
      } catch (error) {
        logger.error(`Batch calculation failed for input ${input.categoryId}:`, error);
        // Continue with other calculations
      }
    }
    
    return results;
  }

  // Generate calculation summary
  summarizeCalculations(results: CalculationResult[]): {
    totalEmissions: number;
    scopeBreakdown: Record<number, number>;
    categoryBreakdown: Record<string, number>;
    qualityAssessment: {
      averageConfidence: number;
      highQualityCount: number;
      mediumQualityCount: number;
      lowQualityCount: number;
    };
  } {
    const summary = {
      totalEmissions: 0,
      scopeBreakdown: {} as Record<number, number>,
      categoryBreakdown: {} as Record<string, number>,
      qualityAssessment: {
        averageConfidence: 0,
        highQualityCount: 0,
        mediumQualityCount: 0,
        lowQualityCount: 0,
      },
    };

    let totalConfidence = 0;

    results.forEach(result => {
      const emissions = result.calculation.emissions;
      const scope = result.category.scope;
      const categoryName = result.category.name;

      // Total emissions
      summary.totalEmissions += emissions;

      // Scope breakdown
      summary.scopeBreakdown[scope] = (summary.scopeBreakdown[scope] || 0) + emissions;

      // Category breakdown
      summary.categoryBreakdown[categoryName] = (summary.categoryBreakdown[categoryName] || 0) + emissions;

      // Quality assessment
      totalConfidence += result.quality.confidence;
      
      switch (result.quality.rating) {
        case 'high':
          summary.qualityAssessment.highQualityCount++;
          break;
        case 'medium':
          summary.qualityAssessment.mediumQualityCount++;
          break;
        case 'low':
          summary.qualityAssessment.lowQualityCount++;
          break;
      }
    });

    summary.qualityAssessment.averageConfidence = results.length > 0 ? 
      Math.round(totalConfidence / results.length) : 0;

    return summary;
  }
}

export const calculationEngine = new CalculationEngine();
