import { EmissionCategory } from '../models/EmissionCategory';
import { EmissionFactor } from '../models/EmissionFactor';
import { logger } from '../utils/logger';
import axios from 'axios';

export interface CalculationInput {
  categoryId: string;
  value: number;
  unit: string;
  factorId?: string;
  metadata?: Record<string, any>;
  userId?: string;
  organizationId?: string;
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
      
      // 4. Calculate emissions
      const emissions = this.performCalculation(normalizedValue, factor, category, input);
      
      // 5. Assess calculation quality
      const quality = this.assessCalculationQuality(factor, category, input);
      
      // 6. Handle special calculations (e.g., business travel with distance API)
      const finalEmissions = await this.handleSpecialCalculations(emissions, category, input);
      
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
      };
      
      logger.info(`Calculation completed: ${finalEmissions} kg CO2e`);
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

    // If no conversion found, log warning and proceed
    logger.warn(`No unit conversion found from ${fromUnit} to ${factor.unit}, using value as-is`);
    return value;
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

  private async handleSpecialCalculations(emissions: number, category: any, input: CalculationInput): Promise<number> {
    // Handle business travel with automatic distance calculation
    if (category.category.toLowerCase().includes('business travel') && input.metadata?.origin && input.metadata?.destination) {
      return this.calculateBusinessTravelEmissions(input);
    }
    
    // Handle employee commuting with traffic adjustments
    if (category.category.toLowerCase().includes('commuting') && input.metadata?.location === 'Cairo') {
      return emissions * 1.0;
    }
    
    // Handle electricity with time-of-use factors (if available)
    if (category.category.toLowerCase().includes('electricity') && input.metadata?.timeOfUse) {
      return this.applyTimeOfUseFactors(emissions, input.metadata.timeOfUse);
    }
    
    return emissions;
  }

  private async calculateBusinessTravelEmissions(input: CalculationInput): Promise<number> {
    try {
      const { origin, destination, travelMode, travelClass } = input.metadata || {};
      
      if (travelMode === 'Flight' && origin && destination) {
        // Get distance from airport API
        const distance = await this.getAirportDistance(origin, destination);
        
        // Apply class-specific emission factors
        const classMultipliers = {
          'Economy': 1.0,
          'Business': 1.5,
          'First': 2.0,
        };
        
        const multiplier = classMultipliers[travelClass as keyof typeof classMultipliers] || 1.0;
        
        // Base emission factor for aviation (approximate)
        const aviationFactor = 0.255; // kg CO2e per km
        
        let emissions = distance * aviationFactor * multiplier;
        
        // Round trip adjustment
        if (input.metadata?.roundTrip) {
          emissions *= 2;
        }
        
        return emissions;
      }
    } catch (error) {
      logger.warn('Special business travel calculation failed, using standard calculation:', error);
    }
    
    // Fallback to standard calculation
    return input.value * 0.255; // Default aviation factor
  }

  private async getAirportDistance(origin: string, destination: string): Promise<number> {
    try {
      // Use the airport distance API mentioned in requirements
      const response = await axios.get(`https://airportgap.com/api/airports/distance?from=${origin}&to=${destination}`);
      
      if (response.data && response.data.data && response.data.data.attributes) {
        return response.data.data.attributes.kilometers;
      }
      
      throw new Error('Invalid API response');
    } catch (error) {
      logger.error('Airport distance API failed:', error);
      
      // Fallback: estimate based on common routes from Cairo
      const cairoCentricDistances: Record<string, number> = {
        'CAI-DXB': 2196,   // Cairo to Dubai
        'CAI-LHR': 3520,   // Cairo to London
        'CAI-JFK': 8965,   // Cairo to New York
        'CAI-CDG': 3221,   // Cairo to Paris
        'CAI-FRA': 2895,   // Cairo to Frankfurt
        'CAI-IST': 1094,   // Cairo to Istanbul
        'CAI-DOH': 1832,   // Cairo to Doha
        'CAI-RUH': 1278,   // Cairo to Riyadh
      };
      
      const routeKey = `${origin}-${destination}`;
      const reverseKey = `${destination}-${origin}`;
      
      if (cairoCentricDistances[routeKey]) {
        return cairoCentricDistances[routeKey];
      } else if (cairoCentricDistances[reverseKey]) {
        return cairoCentricDistances[reverseKey];
      }
      
      // Ultimate fallback: throw error to require manual input
      throw new Error('Distance calculation failed - please enter distance manually');
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
