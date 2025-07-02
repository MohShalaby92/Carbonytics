import * as XLSX from 'xlsx';
import { EmissionCategory } from '../models/EmissionCategory';
import { EmissionFactor } from '../models/EmissionFactor';
import { logger } from '../utils/logger';

export class ExcelParserService {
  
  async parseAndImportExcel(filePath: string): Promise<{
    categoriesImported: number;
    factorsImported: number;
    errors: string[];
  }> {
    const results = {
      categoriesImported: 0,
      factorsImported: 0,
      errors: [] as string[],
    };

    try {
      logger.info(`Starting Excel import from: ${filePath}`);
      
      const workbook = XLSX.readFile(filePath);
      
      // Process each sheet
      for (const sheetName of workbook.SheetNames) {
        try {
          await this.processSheet(workbook, sheetName, results);
        } catch (error) {
          results.errors.push(`Error processing sheet ${sheetName}: ${error}`);
        }
      }
      
      logger.info(`Excel import completed. Categories: ${results.categoriesImported}, Factors: ${results.factorsImported}`);
      
    } catch (error) {
      logger.error('Excel import failed:', error);
      results.errors.push(`General error: ${error}`);
    }

    return results;
  }

  private async processSheet(
    workbook: XLSX.WorkBook, 
    sheetName: string, 
    results: { categoriesImported: number; factorsImported: number; errors: string[] }
  ): Promise<void> {
    
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    if (data.length === 0) {
      logger.warn(`Empty sheet: ${sheetName}`);
      return;
    }

    // Determine sheet type based on headers
    const headers = Object.keys(data[0] as any);
    
    if (this.isCategorySheet(headers)) {
      await this.processCategorySheet(data, results);
    } else if (this.isFactorSheet(headers)) {
      await this.processFactorSheet(data, results);
    } else {
      results.errors.push(`Unknown sheet format: ${sheetName}`);
    }
  }

  private isCategorySheet(headers: string[]): boolean {
    const categoryHeaders = ['scope', 'category', 'description', 'emission category'];
    return categoryHeaders.some(header => 
      headers.some(h => h.toLowerCase().includes(header))
    );
  }

  private isFactorSheet(headers: string[]): boolean {
    const factorHeaders = ['factor', 'emission factor', 'co2', 'unit'];
    return factorHeaders.some(header => 
      headers.some(h => h.toLowerCase().includes(header))
    );
  }

  private async processCategorySheet(
    data: any[], 
    results: { categoriesImported: number; factorsImported: number; errors: string[] }
  ): Promise<void> {
    
    for (const row of data) {
      try {
        const categoryData = this.parseCategory(row);
        if (categoryData) {
          await EmissionCategory.findOneAndUpdate(
            { scope: categoryData.scope, category: categoryData.category },
            categoryData,
            { upsert: true, new: true }
          );
          results.categoriesImported++;
        }
      } catch (error) {
        results.errors.push(`Category row error: ${error}`);
      }
    }
  }

  private async processFactorSheet(
    data: any[], 
    results: { categoriesImported: number; factorsImported: number; errors: string[] }
  ): Promise<void> {
    
    for (const row of data) {
      try {
        const factorData = await this.parseFactor(row);
        if (factorData) {
          await EmissionFactor.findOneAndUpdate(
            { 
              categoryId: factorData.categoryId, 
              factorCode: factorData.factorCode 
            },
            factorData,
            { upsert: true, new: true }
          );
          results.factorsImported++;
        }
      } catch (error) {
        results.errors.push(`Factor row error: ${error}`);
      }
    }
  }

  private parseCategory(row: any): any | null {
    // Extract scope
    const scopeText = this.findValueByKeys(row, ['scope', 'Scope']);
    const scope = this.extractScope(scopeText);
    
    // Extract category
    const category = this.findValueByKeys(row, ['category', 'Category', 'Emission Category', 'emission category']);
    
    if (!scope || !category) {
      return null;
    }

    return {
      scope,
      category: category.trim(),
      description: this.findValueByKeys(row, ['description', 'Description']) || '',
      clarification: this.findValueByKeys(row, ['clarification', 'Clarification']),
      baseUnit: this.extractUnit(this.findValueByKeys(row, ['unit', 'Unit', 'Units'])) || 'unit',
      priority: this.extractPriority(this.findValueByKeys(row, ['priority', 'Priority'])),
      calculationMethod: 'activity_based', // Default
      displayOrder: scope * 100, // Basic ordering
    };
  }

  private async parseFactor(row: any): Promise<any | null> {
    const categoryName = this.findValueByKeys(row, ['category', 'Category', 'Activity']);
    const factorValue = this.findValueByKeys(row, ['factor', 'Factor', 'Emission Factor', 'CO2']);
    
    if (!categoryName || !factorValue) {
      return null;
    }

    // Find matching category
    const category = await EmissionCategory.findOne({
      category: new RegExp(categoryName.trim(), 'i')
    });

    if (!category) {
      throw new Error(`Category not found: ${categoryName}`);
    }

    const factorName = this.findValueByKeys(row, ['name', 'Name', 'Fuel', 'Material']) || categoryName;
    
    return {
      categoryId: category._id,
      factorCode: this.generateFactorCode(categoryName, factorName),
      name: factorName.trim(),
      factor: parseFloat(factorValue),
      unit: this.findValueByKeys(row, ['unit', 'Unit']) || 'kg CO2e',
      source: this.findValueByKeys(row, ['source', 'Source']) || 'Excel Import',
      region: this.parseRegion(this.findValueByKeys(row, ['region', 'Region'])),
      year: this.parseYear(this.findValueByKeys(row, ['year', 'Year'])),
      fuelType: this.findValueByKeys(row, ['fuel', 'Fuel Type', 'fuelType']),
      vehicleType: this.findValueByKeys(row, ['vehicle', 'Vehicle Type', 'vehicleType']),
      egyptianData: {
        isLocalFactor: this.isEgyptianFactor(row),
        notes: this.findValueByKeys(row, ['notes', 'Notes', 'Comments']),
      },
    };
  }

  // Helper methods
  private findValueByKeys(row: any, keys: string[]): any {
    for (const key of keys) {
      const exactMatch = row[key];
      if (exactMatch !== undefined && exactMatch !== null && exactMatch !== '') {
        return exactMatch;
      }
      
      // Case-insensitive search
      const foundKey = Object.keys(row).find(k => 
        k.toLowerCase() === key.toLowerCase()
      );
      if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && row[foundKey] !== '') {
        return row[foundKey];
      }
    }
    return null;
  }

  private extractScope(scopeText: any): number | null {
    if (!scopeText) return null;
    const match = String(scopeText).match(/(\d+)/);
    const scope = match ? parseInt(match[1]) : null;
    return scope && [1, 2, 3].includes(scope) ? scope : null;
  }

  private extractUnit(unitText: any): string {
    if (!unitText) return 'unit';
    
    const unitMap: Record<string, string> = {
      'kwh': 'kWh',
      'kilowatt': 'kWh',
      'liters': 'L',
      'litres': 'L',
      'kilograms': 'kg',
      'tonnes': 't',
      'kilometers': 'km',
      'kilometres': 'km',
      'cubic': 'm³',
    };

    const text = String(unitText).toLowerCase();
    for (const [key, value] of Object.entries(unitMap)) {
      if (text.includes(key)) {
        return value;
      }
    }

    return String(unitText).trim() || 'unit';
  }

  private extractPriority(priorityText: any): 'high' | 'medium' | 'low' {
    if (!priorityText) return 'medium';
    
    const text = String(priorityText).toLowerCase();
    if (text.includes('high')) return 'high';
    if (text.includes('low')) return 'low';
    return 'medium';
  }

  private parseRegion(regionText: any): string {
    if (!regionText) return 'global';
    
    const text = String(regionText).toLowerCase();
    if (text.includes('egypt') || text.includes('eg')) return 'egypt';
    if (text.includes('mena')) return 'mena';
    if (text.includes('eu')) return 'eu';
    if (text.includes('us')) return 'us';
    
    return 'global';
  }

  private parseYear(yearText: any): number {
    if (!yearText) return new Date().getFullYear();
    
    const year = parseInt(String(yearText));
    return year && year > 2000 && year <= new Date().getFullYear() + 1 ? year : new Date().getFullYear();
  }

  private isEgyptianFactor(row: any): boolean {
    const egyptianIndicators = ['egypt', 'egyptian', 'eg', 'local', 'eehc', 'capmas'];
    const text = JSON.stringify(row).toLowerCase();
    
    return egyptianIndicators.some(indicator => text.includes(indicator));
  }

  private generateFactorCode(category: string, name: string): string {
    const cleanCategory = category.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
    const cleanName = name.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
    
    return `${cleanCategory}_${cleanName}`.substring(0, 50); // Limit length
  }
}
