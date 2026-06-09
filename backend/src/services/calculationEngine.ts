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
  };
  provenance: CalculationProvenance;
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
      
      // 3. Perform unit conversion if needed
      const normalizedValue = await this.convertUnits(input.value, input.unit, category, factor);

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
      
      const result: CalculationResult = {
        calculation: {
          categoryId: input.categoryId,
          value: input.value,
          unit: input.unit,
          factor: factor.factor,
          emissions: finalEmissions,
          metadata: {
            ...input.metadata,
            calculationMethod: category.calculationMethod,
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
        },
        category: {
          id: category.id,
          name: category.category,
          scope: category.scope,
          description: category.description,
        },
        quality,
        provenance,
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
      // Use specific factor if provided
      factor = await EmissionFactor.findById(input.factorId);
      if (!factor) {
        throw new Error('Specified emission factor not found');
      }
    } else {
      // Smart factor selection: prefer Egyptian factors
      factor = await this.findBestEmissionFactor(category, input);
    }
    
    if (!factor) {
      throw new Error('No suitable emission factor found for this category');
    }
    
    return factor;
  }

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

    // Priority order: Egyptian -> Global -> Others
    const regions = ['egypt', 'global', 'mena', 'eu', 'us'];
    
    for (const region of regions) {
      const factor = await EmissionFactor.findOne({
        ...searchCriteria,
        region,
      }).sort({ 
        year: -1,      // Latest year first
        isDefault: -1,  // Default factors first
        qualityRating: -1, // High quality first
      });
      
      if (factor) {
        logger.info(`Selected ${region} emission factor: ${factor.name}`);
        return factor;
      }
    }

    // Fallback: any factor for this category
    return EmissionFactor.findOne(searchCriteria).sort({ year: -1 });
  }

  private async convertUnits(value: number, fromUnit: string, category: any, factor: any): Promise<number> {
    // 'trip' is a sentinel for distance-based travel: the value is a placeholder
    // that handleSpecialCalculations recomputes from distance, so skip conversion.
    if (fromUnit === 'trip') {
      return value;
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
    const conversions = this.getUnitConversions();
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
    const co2 = value * (factor.co2 || 0); // kg CO2 (GWP 1)
    const ch4 = value * (factor.ch4 || 0); // kg CH4
    const n2o = value * (factor.n2o || 0); // kg N2O
    // otherGhg, when present, is already CO2e-denominated by convention.
    const otherCo2e = value * (factor.otherGhg || 0);

    const co2e =
      Math.round((co2 * gwp.co2 + ch4 * gwp.ch4 + n2o * gwp.n2o + otherCo2e) * 100) / 100;

    return {
      co2: Math.round(co2 * 10000) / 10000,
      ch4: Math.round(ch4 * 10000) / 10000,
      n2o: Math.round(n2o * 10000) / 10000,
      co2e,
    };
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
    if (factor.region === 'egypt') {
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
    
    return {
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
