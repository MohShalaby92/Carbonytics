import * as XLSX from 'xlsx';
import path from 'path';
import { EmissionCategory } from '../models/EmissionCategory';
import { EmissionFactor } from '../models/EmissionFactor';
import { logger } from '../utils/logger';

interface ExcelEmissionCategory {
  Scope: string;
  'Emission Category': string;
  Description: string;
  Clarification?: string;
  'Calculation Method'?: string;
  'Emission Factors'?: string;
  Unit?: string;
  Priority?: string;
  Industries?: string;
}

interface ExcelEmissionFactor {
  'Category': string;
  'Subcategory'?: string;
  'Factor Name': string;
  'Factor Value': number;
  'Unit': string;
  'Source': string;
  'Region': string;
  'Year': number;
  'Fuel Type'?: string;
  'Vehicle Type'?: string;
  'Material Type'?: string;
  'Uncertainty'?: number;
  'Quality'?: string;
  'Egyptian Factor'?: number;
  'Egyptian Source'?: string;
  'Notes'?: string;
}

export class DataImportService {
  
  async importEmissionCategories(filePath?: string): Promise<void> {
    try {
      logger.info('Starting emission categories import...');
      
      // Use provided file or default classification data
      const dataPath = filePath || path.join(__dirname, '../data/carbon-classification.xlsx');
      
      // Read Excel file
      const workbook = XLSX.readFile(dataPath);
      const worksheet = workbook.Sheets['Emission Categories Detailed'] || 
                       workbook.Sheets[workbook.SheetNames[0]];
      
      const rawData: ExcelEmissionCategory[] = XLSX.utils.sheet_to_json(worksheet);
      
      logger.info(`Found ${rawData.length} categories to import`);
      
      // Process each category
      for (const row of rawData) {
        await this.processEmissionCategory(row);
      }
      
      logger.info('Emission categories import completed');
      
    } catch (error) {
      logger.error('Failed to import emission categories:', error);
      throw error;
    }
  }

  private async processEmissionCategory(row: ExcelEmissionCategory): Promise<void> {
    try {
      const scope = this.parseScope(row.Scope);
      const category = row['Emission Category']?.trim();
      
      if (!scope || !category) {
        logger.warn(`Skipping invalid category: ${JSON.stringify(row)}`);
        return;
      }

      // Parse industries
      const industries = row.Industries ? 
        row.Industries.split(',').map(i => i.trim()).filter(Boolean) : [];

      // Determine calculation method based on description/clarification
      const calculationMethod = this.determineCalculationMethod(
        row.Description, 
        row.Clarification
      );

      // Create category document
      const categoryData = {
        scope,
        category,
        description: row.Description?.trim() || '',
        clarification: row.Clarification?.trim(),
        baseUnit: this.extractUnit(row.Unit || row['Emission Factors'] || ''),
        allowedUnits: this.parseAllowedUnits(row.Unit),
        priority: this.parsePriority(row.Priority),
        industries,
        calculationMethod,
        egyptianContext: {
          relevance: this.determineEgyptianRelevance(category, industries),
          considerations: this.getEgyptianConsiderations(category),
        },
        requiredInputs: this.generateRequiredInputs(calculationMethod, category),
      };

      // Upsert category
      await EmissionCategory.findOneAndUpdate(
        { scope, category },
        categoryData,
        { upsert: true, new: true }
      );

      logger.info(`Processed category: ${scope} - ${category}`);
      
    } catch (error) {
      logger.error(`Failed to process category ${row['Emission Category']}:`, error);
    }
  }

  async importEmissionFactors(filePath?: string): Promise<void> {
    try {
      logger.info('Starting emission factors import...');
      
      const dataPath = filePath || path.join(__dirname, '../data/emission-factors.xlsx');
      
      // Read Excel file
      const workbook = XLSX.readFile(dataPath);
      
      // Process each sheet (scope 1, 2, 3)
      for (const sheetName of workbook.SheetNames) {
        if (sheetName.toLowerCase().includes('scope')) {
          await this.processFactorSheet(workbook, sheetName);
        }
      }
      
      logger.info('Emission factors import completed');
      
    } catch (error) {
      logger.error('Failed to import emission factors:', error);
      throw error;
    }
  }

  private async processFactorSheet(workbook: XLSX.WorkBook, sheetName: string): Promise<void> {
    const worksheet = workbook.Sheets[sheetName];
    const rawData: ExcelEmissionFactor[] = XLSX.utils.sheet_to_json(worksheet);
    
    logger.info(`Processing ${rawData.length} factors from ${sheetName}`);
    
    for (const row of rawData) {
      await this.processEmissionFactor(row);
    }
  }

  private async processEmissionFactor(row: ExcelEmissionFactor): Promise<void> {
    try {
      const categoryName = row.Category?.trim();
      if (!categoryName || !row['Factor Value']) {
        return;
      }

      // Find matching category
      const category = await EmissionCategory.findOne({
        category: new RegExp(categoryName, 'i')
      });

      if (!category) {
        logger.warn(`Category not found for factor: ${categoryName}`);
        return;
      }

      // Create global factor
      const globalFactorData = {
        categoryId: category._id,
        factorCode: this.generateFactorCode(categoryName, row['Factor Name']),
        name: row['Factor Name']?.trim() || categoryName,
        factor: row['Factor Value'],
        unit: row.Unit?.trim() || category.baseUnit,
        source: row.Source?.trim() || 'DEFRA 2024',
        region: (row.Region?.toLowerCase() || 'global') as any,
        year: row.Year || 2024,
        fuelType: row['Fuel Type']?.trim(),
        vehicleType: row['Vehicle Type']?.trim(),
        materialType: row['Material Type']?.trim(),
        uncertainty: row.Uncertainty,
        qualityRating: (row.Quality?.toLowerCase() || 'medium') as any,
        egyptianData: {
          isLocalFactor: false,
          notes: row.Notes?.trim(),
        },
      };

      await EmissionFactor.findOneAndUpdate(
        { 
          categoryId: category._id, 
          factorCode: globalFactorData.factorCode,
          region: globalFactorData.region 
        },
        globalFactorData,
        { upsert: true }
      );

      // Create Egyptian factor if available
      if (row['Egyptian Factor'] && row['Egyptian Factor'] > 0) {
        const egyptianFactorData = {
          ...globalFactorData,
          factorCode: globalFactorData.factorCode + '_EG',
          factor: row['Egyptian Factor'],
          source: row['Egyptian Source']?.trim() || 'EEHC Egypt',
          region: 'egypt' as any,
          country: 'EG',
          egyptianData: {
            isLocalFactor: true,
            localSource: row['Egyptian Source']?.trim(),
            notes: row.Notes?.trim(),
          },
        };

        await EmissionFactor.findOneAndUpdate(
          { 
            categoryId: category._id, 
            factorCode: egyptianFactorData.factorCode 
          },
          egyptianFactorData,
          { upsert: true }
        );
      }

      logger.debug(`Processed factor: ${row['Factor Name']}`);
      
    } catch (error) {
      logger.error(`Failed to process factor ${row['Factor Name']}:`, error);
    }
  }

  // Helper methods
  private parseScope(scopeText: string): number | null {
    if (!scopeText) return null;
    const match = scopeText.match(/(\d+)/);
    const scope = match ? parseInt(match[1]) : null;
    return scope && [1, 2, 3].includes(scope) ? scope : null;
  }

  private determineCalculationMethod(description?: string, clarification?: string): string {
    const text = `${description || ''} ${clarification || ''}`.toLowerCase();
    
    if (text.includes('activity data') || text.includes('fuel consumption')) {
      return 'activity_based';
    } else if (text.includes('spend') || text.includes('cost')) {
      return 'spend_based';
    } else if (text.includes('direct') || text.includes('measured')) {
      return 'direct';
    }
    
    return 'activity_based'; // Default
  }

  private extractUnit(unitText: string): string {
    if (!unitText) return 'kg CO2e';
    
    // Common unit patterns
    const unitMap: Record<string, string> = {
      'kwh': 'kWh',
      'liters': 'L',
      'litres': 'L',
      'kg': 'kg',
      'tonnes': 't',
      'kilometers': 'km',
      'kilometres': 'km',
    };

    const normalized = unitText.toLowerCase();
    for (const [key, value] of Object.entries(unitMap)) {
      if (normalized.includes(key)) {
        return value;
      }
    }

    return 'unit'; // Generic fallback
  }

  private parseAllowedUnits(unitText?: string): Array<{unit: string, description: string, conversionToBase: number}> {
    // Default units for different categories
    const defaultUnits = [
      { unit: 'kWh', description: 'Kilowatt hours', conversionToBase: 1 },
      { unit: 'L', description: 'Liters', conversionToBase: 1 },
      { unit: 'kg', description: 'Kilograms', conversionToBase: 1 },
      { unit: 't', description: 'Tonnes', conversionToBase: 1000 },
      { unit: 'km', description: 'Kilometers', conversionToBase: 1 },
    ];

    return defaultUnits;
  }

  private parsePriority(priorityText?: string): 'high' | 'medium' | 'low' {
    if (!priorityText) return 'medium';
    
    const text = priorityText.toLowerCase();
    if (text.includes('high')) return 'high';
    if (text.includes('low')) return 'low';
    return 'medium';
  }

  private determineEgyptianRelevance(category: string, industries: string[]): 'high' | 'medium' | 'low' {
    const egyptianHighRelevance = [
      'stationary combustion',
      'mobile combustion',
      'purchased electricity',
      'natural gas',
      'diesel',
      'petrol',
    ];

    const categoryLower = category.toLowerCase();
    const hasHighRelevance = egyptianHighRelevance.some(term => 
      categoryLower.includes(term)
    );

    if (hasHighRelevance) return 'high';
    if (industries.includes('Energy/Utilities') || industries.includes('Oil & Gas')) return 'high';
    
    return 'medium';
  }

  private getEgyptianConsiderations(category: string): string {
    const considerations: Record<string, string> = {
      'stationary combustion': 'Egypt\'s heavy reliance on natural gas (80%+ of electricity)',
      'mobile combustion': 'Fuel subsidies being reduced. Growing EV market with local manufacturers',
      'purchased electricity': 'Grid factor 0.458 kg CO2e/kWh due to gas dependency',
      'purchased cooling': 'High demand due to hot climate, factor 0.7-1.2 kg CO2e/kWh',
    };

    const categoryLower = category.toLowerCase();
    for (const [key, value] of Object.entries(considerations)) {
      if (categoryLower.includes(key)) {
        return value;
      }
    }

    return '';
  }

  private generateRequiredInputs(method: string, category: string): Array<{field: string, type: string, required: boolean}> {
    const baseInputs = [
      { field: 'value', type: 'number', required: true },
      { field: 'unit', type: 'select', required: true },
      { field: 'period', type: 'date', required: true },
    ];

    // Add category-specific inputs
    if (category.toLowerCase().includes('travel')) {
      baseInputs.push(
        { field: 'origin', type: 'text', required: true },
        { field: 'destination', type: 'text', required: true },
        { field: 'travelClass', type: 'select', required: false }
      );
    }

    if (category.toLowerCase().includes('fuel') || category.toLowerCase().includes('combustion')) {
      baseInputs.push(
        { field: 'fuelType', type: 'select', required: true }
      );
    }

    return baseInputs;
  }

  private generateFactorCode(category: string, factorName?: string): string {
    const cleanCategory = category.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
    const cleanFactor = factorName ? 
      factorName.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase() : 
      'DEFAULT';
    
    return `${cleanCategory}_${cleanFactor}`;
  }
}
