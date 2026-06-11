import csvParser from 'csv-parser';
import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { Calculation } from '../models/Calculation';
import { EmissionCategory } from '../models/EmissionCategory';
import { calculationEngine } from './calculationEngine';
import { escapeRegex } from '../utils/security';
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

// UTF-8 BOM so spreadsheet apps read exported CSVs (e.g. "m³") with the right encoding.
const UTF8_BOM = '﻿';

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

    logger.info(`Starting import from: ${filePath}`);
    const rows = await this.readRows(filePath);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
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

    logger.info(
      `Import completed. Processed: ${result.processed}, Successful: ${result.successful}, Failed: ${result.failed}`
    );
    return result;
  }

  /** Read tabular rows from a CSV or Excel (.xlsx/.xls) file into plain row objects. */
  private async readRows(filePath: string): Promise<CSVCalculationRow[]> {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.xlsx' || ext === '.xls') {
      return this.readRowsFromExcel(filePath);
    }
    return this.readRowsFromCSV(filePath);
  }

  private readRowsFromCSV(filePath: string): Promise<CSVCalculationRow[]> {
    return new Promise((resolve, reject) => {
      const rows: CSVCalculationRow[] = [];
      fs.createReadStream(filePath)
        .pipe(csvParser())
        .on('data', (row: CSVCalculationRow) => rows.push(row))
        .on('end', () => resolve(rows))
        .on('error', (error) => reject(error));
    });
  }

  private async readRowsFromExcel(filePath: string): Promise<CSVCalculationRow[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];

    const headers: string[] = [];
    const rows: CSVCalculationRow[] = [];

    const cellToString = (cell: any): string => {
      if (cell === null || cell === undefined) return '';
      if (cell instanceof Date) return cell.toISOString().split('T')[0];
      if (typeof cell === 'object') {
        if ('text' in cell) return String(cell.text).trim();
        if ('result' in cell) return String(cell.result).trim();
        if ('richText' in cell) return cell.richText.map((r: any) => r.text).join('').trim();
      }
      return String(cell).trim();
    };

    sheet.eachRow((row, rowNumber) => {
      const values = row.values as any[]; // 1-indexed; values[0] is undefined
      if (rowNumber === 1) {
        for (let i = 1; i < values.length; i++) {
          headers[i] = values[i] != null ? String(values[i]).trim() : '';
        }
        return;
      }
      const obj: Record<string, any> = {};
      for (let i = 1; i < headers.length; i++) {
        const key = headers[i];
        if (!key) continue;
        obj[key] = cellToString(values[i]);
      }
      // Skip fully empty rows
      if (Object.values(obj).some((v) => v !== '')) {
        rows.push(obj as CSVCalculationRow);
      }
    });

    return rows;
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

    // Find category by name (case-insensitive exact match), or by id if a valid
    // ObjectId was supplied. The id branch is guarded so a plain name never gets
    // cast to ObjectId (which previously threw and failed every import row).
    const term = String(row.category).trim();
    const orConditions: any[] = [
      { category: { $regex: new RegExp(`^${escapeRegex(term)}$`, 'i') } },
    ];
    if (mongoose.isValidObjectId(term)) {
      orConditions.push({ _id: term });
    }
    const category = await EmissionCategory.findOne({ $or: orConditions });

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
      activityYear: row.period_start ? new Date(row.period_start).getFullYear() : undefined,
    };

    // Perform calculation (server-side, authoritative)
    const calculationResult = await calculationEngine.calculate(calculationInput);

    // Create calculation record
    const calculationData = {
      organizationId,
      userId,
      title: `Imported - ${category.category}`,
      description: row.notes || `Imported from file on ${new Date().toISOString()}`,
      period: {
        start: row.period_start ? new Date(row.period_start) : new Date(),
        end: row.period_end ? new Date(row.period_end) : new Date(),
      },
      data: [{
        categoryId: category._id,
        value: calculationResult.calculation.value,
        unit: calculationResult.calculation.unit,
        factor: calculationResult.factor?.value,
        emissions: calculationResult.calculation.emissions,
        quality: calculationResult.quality?.rating,
        dqScore: calculationResult.quality?.dqScore,
        factorId: calculationResult.factor?.id,
        factorName: calculationResult.factor?.name,
        factorSource: calculationResult.factor?.source,
        factorYear: calculationResult.factor?.year,
        gwpSet: calculationResult.provenance?.gwpSet,
        gwpApplied: calculationResult.provenance?.gwpApplied,
        method: calculationResult.calculation.metadata?.calculationMethod,
        scope2Location: calculationResult.scope2Dual?.locationBased,
        scope2Market: calculationResult.scope2Dual?.marketBased,
        scope2MarketMethod: calculationResult.scope2Dual?.marketMethod,
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

      fs.writeFileSync(filePath, UTF8_BOM + csvContent, 'utf8');

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

      fs.writeFileSync(filePath, UTF8_BOM + csvContent, 'utf8');

      logger.info(`CSV template saved to: ${filePath}`);
      return fileName;

    } catch (error) {
      logger.error('CSV template generation failed:', error);
      throw error;
    }
  }

  /** Validate an uploaded CSV or Excel file (shared row reader). */
  async validateCSV(filePath: string): Promise<{
    valid: boolean;
    rowCount: number;
    errors: string[];
    preview: any[];
  }> {
    const errors: string[] = [];
    const rows = await this.readRows(filePath);

    rows.forEach((row, idx) => {
      const n = idx + 2; // account for header row
      if (!row.category) errors.push(`Row ${n}: Missing category`);
      if (!row.value || isNaN(parseFloat(row.value))) errors.push(`Row ${n}: Invalid or missing value`);
      if (!row.unit) errors.push(`Row ${n}: Missing unit`);
    });

    return {
      valid: errors.length === 0,
      rowCount: rows.length,
      errors,
      preview: rows.slice(0, 5),
    };
  }
}
