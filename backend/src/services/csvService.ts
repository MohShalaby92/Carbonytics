import csvParser from 'csv-parser';
import fs from 'fs';
import path from 'path';
import { Calculation } from '../models/Calculation';
import { EmissionCategory } from '../models/EmissionCategory';
import { EmissionFactor } from '../models/EmissionFactor';
import { calculationEngine } from './calculationEngine';
import { logger } from '../utils/logger';

interface CSVCalculationRow {
  category: string;
  value: string;
  unit: string;
  period_start: string;
  period_end: string;
  notes?: string;
  [key: string]: any; // For dynamic fields
}

interface ImportResult {
  processed: number;
  successful: number;
  failed: number;
  errors: Array<{
    row: number;
    error: string;
    data: any;
  }>;
}

export class CSVService {
  
  async importCalculations(
    filePath: string, 
    userId: string, 
    organizationId: string
  ): Promise<ImportResult> {
    const result: ImportResult = {
      processed: 0,
      successful: 0,
      failed: 0,
      errors: [],
    };

    try {
      logger.info(`Starting CSV import from: ${filePath}`);
      
      const calculations: any[] = [];
      
      return new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
          .pipe(csvParser())
          .on('data', (row: CSVCalculationRow) => {
            calculations.push(row);
          })
          .on('end', async () => {
            try {
              for (let i = 0; i < calculations.length; i++) {
                const row = calculations[i];
                result.processed++;
                
                try {
                  await this.processCalculationRow(row, userId, organizationId, i + 2);
                  result.successful++;
                } catch (error) {
                  result.failed++;
                  result.errors.push({
                    row: i + 2,
                    error: error instanceof Error ? error.message : String(error),
                    data: row,
                  });
                }
              }
              
              logger.info(`CSV import completed. Processed: ${result.processed}, Successful: ${result.successful}, Failed: ${result.failed}`);
              resolve(result);
              
            } catch (error) {
              reject(error);
            }
          })
          .on('error', (error) => {
            reject(error);
          });
      });
      
    } catch (error) {
      logger.error('CSV import failed:', error);
      throw error;
    }
  }

  private async processCalculationRow(
    row: CSVCalculationRow, 
    userId: string, 
    organizationId: string,
    rowNumber: number
  ): Promise<void> {
    
    // Validate required fields
    if (!row.category) {
      throw new Error('Category is required');
    }
    
    if (!row.value || isNaN(parseFloat(row.value))) {
      throw new Error('Valid numeric value is required');
    }
    
    if (!row.unit) {
      throw new Error('Unit is required');
    }
    
    // Find category by name
    const category = await EmissionCategory.findOne({
      $or: [
        { category: { $regex: new RegExp(row.category, 'i') } },
        { _id: row.category }, // In case they use ID
      ]
    });
    
    if (!category) {
      throw new Error(`Category not found: ${row.category}`);
    }
    
    // Prepare calculation input
    const calculationInput = {
      categoryId: category._id.toString(),
      value: parseFloat(row.value),
      unit: row.unit,
      metadata: this.extractMetadata(row, category),
      userId,
      organizationId,
    };
    
    // Perform calculation
    const calculationResult = await calculationEngine.calculate(calculationInput);
    
    // Create calculation record
    const calculationData = {
      organizationId,
      userId,
      title: `Imported - ${category.category}`,
      description: row.notes || `Imported from CSV on ${new Date().toISOString()}`,
      period: {
        start: row.period_start ? new Date(row.period_start) : new Date(),
        end: row.period_end ? new Date(row.period_end) : new Date(),
      },
      data: [{
        categoryId: category._id,
        value: calculationResult.calculation.value,
        unit: calculationResult.calculation.unit,
        factor: calculationResult.calculation.factor,
        emissions: calculationResult.calculation.emissions,
        notes: row.notes,
      }],
      emissions: {
        scope1: category.scope === 1 ? calculationResult.calculation.emissions : 0,
        scope2: category.scope === 2 ? calculationResult.calculation.emissions : 0,
        scope3: category.scope === 3 ? calculationResult.calculation.emissions : 0,
        total: calculationResult.calculation.emissions,
      },
      status: 'completed',
    };
    
    await Calculation.create(calculationData);
  }

  private extractMetadata(row: CSVCalculationRow, category: any): Record<string, any> {
    const metadata: Record<string, any> = {};
    
    // Extract dynamic fields based on category requirements
    if (category.requiredInputs) {
      category.requiredInputs.forEach((input: any) => {
        const fieldValue = row[input.field] || row[input.field.toLowerCase()];
        if (fieldValue) {
          metadata[input.field] = input.type === 'number' ? parseFloat(fieldValue) : fieldValue;
        }
      });
    }
    
    // Extract common metadata fields
    const metadataFields = [
      'location', 'supplier', 'source', 'method', 'quality',
      'distance', 'weight', 'passengers', 'fuel_type',
      'vehicle_type', 'accommodation_type', 'travel_class'
    ];
    
    metadataFields.forEach(field => {
      if (row[field]) {
        metadata[field] = row[field];
      }
    });
    
    return metadata;
  }

  async exportCalculations(
    organizationId: string,
    filters: {
      startDate?: string;
      endDate?: string;
      scopes?: number[];
      categories?: string[];
    } = {}
  ): Promise<string> {
    try {
      logger.info('Starting calculations export to CSV');
      
      // Build query
      const query: any = { organizationId, status: 'completed' };
      
      if (filters.startDate || filters.endDate) {
        query.createdAt = {};
        if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
        if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
      }
      
      // Get calculations with populated data
      const calculations = await Calculation.find(query)
        .populate('data.categoryId')
        .sort({ createdAt: -1 })
        .lean();
      
      // Generate CSV content
      const csvContent = await this.generateCSVContent(calculations, filters);
      
      // Save to temporary file
      const fileName = `emissions_export_${Date.now()}.csv`;
      const filePath = path.join(process.cwd(), 'uploads', fileName);
      
      // Ensure uploads directory exists
      const uploadsDir = path.dirname(filePath);
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      
      fs.writeFileSync(filePath, csvContent);
      
      logger.info(`CSV export saved to: ${filePath}`);
      return fileName;
      
    } catch (error) {
      logger.error('CSV export failed:', error);
      throw error;
    }
  }

  private async generateCSVContent(calculations: any[], filters: any): Promise<string> {
    const headers = [
      'Date',
      'Category',
      'Scope',
      'Description',
      'Value',
      'Unit',
      'Emission Factor',
      'Emissions (kg CO2e)',
      'Source',
      'Quality Rating',
      'Notes'
    ];
    
    const rows: string[][] = [headers];
    
    for (const calc of calculations) {
      for (const entry of calc.data) {
        const category = entry.categoryId;
        
        // Apply scope filter
        if (filters.scopes && !filters.scopes.includes(category.scope)) {
          continue;
        }
        
        // Apply category filter
        if (filters.categories && !filters.categories.includes(category._id.toString())) {
          continue;
        }
        
        const row = [
          new Date(calc.createdAt).toISOString().split('T')[0],
          category.category || 'Unknown',
          category.scope?.toString() || '1',
          calc.title || '',
          entry.value?.toString() || '0',
          entry.unit || '',
          entry.factor?.toString() || '0',
          entry.emissions?.toString() || '0',
          'System Default',
          'Medium',
          entry.notes || ''
        ];
        
        rows.push(row);
      }
    }
    
    // Convert to CSV format
    return rows.map(row => 
      row.map(cell => `"${cell.toString().replace(/"/g, '""')}"`)
         .join(',')
    ).join('\n');
  }

  async exportTemplate(): Promise<string> {
    try {
      logger.info('Generating CSV import template');
      
      const headers = [
        'category',
        'value',
        'unit',
        'period_start',
        'period_end',
        'notes',
        'location',
        'supplier',
        'distance',
        'fuel_type',
        'travel_class'
      ];
      
      const sampleRows = [
        headers,
        [
          'Purchased Electricity',
          '1000',
          'kWh',
          '2024-01-01',
          '2024-01-31',
          'Office electricity consumption',
          'Cairo, Egypt',
          'Cairo Electricity Distribution Company',
          '',
          '',
          ''
        ],
        [
          'Business Travel',
          '500',
          'km',
          '2024-01-01',
          '2024-01-31',
          'Flight to Alexandria',
          'Cairo to Alexandria',
          'EgyptAir',
          '500',
          'Jet Fuel',
          'Economy'
        ],
        [
          'Natural Gas',
          '100',
          'm³',
          '2024-01-01',
          '2024-01-31',
          'Office heating',
          'Cairo, Egypt',
          'Egyptian Natural Gas Holding Company',
          '',
          'Natural Gas',
          ''
        ]
      ];
      
      const csvContent = sampleRows.map(row => 
        row.map(cell => `"${cell.toString().replace(/"/g, '""')}"`)
           .join(',')
      ).join('\n');
      
      // Save template file
      const fileName = `carbonytics_import_template.csv`;
      const filePath = path.join(process.cwd(), 'uploads', fileName);
      
      // Ensure uploads directory exists
      const uploadsDir = path.dirname(filePath);
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      
      fs.writeFileSync(filePath, csvContent);
      
      logger.info(`CSV template saved to: ${filePath}`);
      return fileName;
      
    } catch (error) {
      logger.error('CSV template generation failed:', error);
      throw error;
    }
  }

  async validateCSV(filePath: string): Promise<{
    valid: boolean;
    rowCount: number;
    errors: string[];
    preview: any[];
  }> {
    try {
      const errors: string[] = [];
      const preview: any[] = [];
      let rowCount = 0;
      
      return new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
          .pipe(csvParser())
          .on('data', (row: any) => {
            rowCount++;
            
            // Validate required columns
            if (!row.category) {
              errors.push(`Row ${rowCount}: Missing category`);
            }
            
            if (!row.value || isNaN(parseFloat(row.value))) {
              errors.push(`Row ${rowCount}: Invalid or missing value`);
            }
            
            if (!row.unit) {
              errors.push(`Row ${rowCount}: Missing unit`);
            }
            
            // Add to preview (first 5 rows)
            if (preview.length < 5) {
              preview.push(row);
            }
          })
          .on('end', () => {
            resolve({
              valid: errors.length === 0,
              rowCount,
              errors,
              preview,
            });
          })
          .on('error', (error) => {
            reject(error);
          });
      });
      
    } catch (error) {
      logger.error('CSV validation failed:', error);
      throw error;
    }
  }
}
