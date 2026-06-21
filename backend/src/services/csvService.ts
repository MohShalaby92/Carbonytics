import csvParser from 'csv-parser';
import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { Calculation } from '../models/Calculation';
import { EmissionCategory } from '../models/EmissionCategory';
import { EmissionFactor } from '../models/EmissionFactor';
import { Facility } from '../models/Facility';
import { calculationEngine } from './calculationEngine';
import { escapeRegex } from '../utils/security';
import { logger } from '../utils/logger';
import { analyzeImportQuality, QualityRow, HistoryPoint, ImportWarning } from './importQuality';
import { IMPORT_COLUMNS, VALIDATION_LISTS, GROUP_FILL } from './importMapping';
import {
  newBrandedWorkbook,
  addBandTitle,
  addParagraph,
  addReferenceSheet,
  styleHeaderCells,
  applyInlineList,
  applyRangeList,
  workbookToBuffer,
} from './importExportKit';

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
        // Strip a leading UTF-8 BOM from the first header — Excel and our own CSV
        // export (UTF-8 BOM for "m³" etc.) prepend one, which would otherwise turn
        // the first column into "﻿category" and fail every row.
        .pipe(csvParser({ mapHeaders: ({ header }) => header.replace(/^﻿/, '').trim() }))
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

  /**
   * Branded, self-documenting import template generated from the LIVE database
   * (so it can never drift from the real categories / factors / facilities).
   * XLSX is the premium default (multi-sheet, dropdowns, worked examples,
   * reference sheets); CSV is a headers-only fallback for CSV-only workflows.
   * Returns the file bytes + content metadata for the controller to stream.
   */
  async buildImportTemplate(
    organizationId: string,
    format: 'xlsx' | 'csv' = 'xlsx'
  ): Promise<{ buffer: Buffer; contentType: string; ext: string; fileName: string }> {
    if (format === 'csv') {
      return {
        buffer: this.buildCsvTemplate(),
        contentType: 'text/csv',
        ext: 'csv',
        fileName: 'carbonytics_import_template.csv',
      };
    }

    // Shared library factors + this org's customs (mirrors the engine's tenant scope).
    const sharedOrOrg = [
      { organizationId: { $exists: false } },
      { organizationId: null },
      { organizationId },
    ];
    const [categories, factors, facilities] = await Promise.all([
      EmissionCategory.find({ isActive: true }).sort({ scope: 1, category: 1 }).lean(),
      EmissionFactor.find({ isActive: true, factorCode: { $exists: true, $ne: null }, $or: sharedOrOrg })
        .populate('categoryId', 'category scope')
        .sort({ name: 1 })
        .lean(),
      Facility.find({ organizationId, isActive: true }).sort({ name: 1 }).lean(),
    ]);

    const buffer = await this.buildXlsxTemplate(categories as any[], factors as any[], facilities as any[]);
    return {
      buffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ext: 'xlsx',
      fileName: 'carbonytics_import_template.xlsx',
    };
  }

  /** Headers-only CSV template (the columns map 1:1 to the XLSX Activity Data sheet). */
  private buildCsvTemplate(): Buffer {
    const csv = IMPORT_COLUMNS.map((c) => `"${c.header.replace(/"/g, '""')}"`).join(',') + '\n';
    return Buffer.from(UTF8_BOM + csv, 'utf8');
  }

  /** The full branded workbook: Instructions, Activity Data, Examples + references. */
  private async buildXlsxTemplate(categories: any[], factors: any[], facilities: any[]): Promise<Buffer> {
    const wb = newBrandedWorkbook();

    // Dynamic dropdown sources.
    const categoryValues = categories.map((c) => `Scope ${c.scope} — ${c.category}`);
    const unitSet = new Set<string>();
    ['kWh', 'MWh', 'GJ', 'TJ', 'MJ', 'mmBtu', 'therm', 'kg', 't', 'short ton', 'lb', 'L', 'm³',
      'gallon', 'scf', 'km', 'miles', 'EGP', 'USD', 'EUR', 'GBP', 'tkm', 'pkm', 'unit', 'franchise']
      .forEach((u) => unitSet.add(u));
    categories.forEach((c) => (c.allowedUnits || []).forEach((u: any) => u?.unit && unitSet.add(u.unit)));
    const unitValues = [...unitSet];
    const facilityValues = facilities.map((f) => f.name);

    const N = 200; // number of validated data rows in Activity Data
    const colNum = (key: string) => IMPORT_COLUMNS.findIndex((c) => c.key === key) + 1;

    // ===== 1. Instructions =====
    const ins = wb.addWorksheet('Instructions');
    for (let i = 1; i <= 10; i++) ins.getColumn(i).width = 12;
    addBandTitle(wb, ins, 'Carbonytics — Data Import Template', 'Fill in the Activity Data sheet, then upload this file on Import & Export.');
    let r = 4;
    r = addParagraph(ins, r, 'What this is.', 'A guided workbook for importing emissions activity data. Every entry is recomputed by the same engine the calculator uses, so imported figures are identical to entering them by hand — with full provenance (factor, GWP, data quality, Scope-2 dual, biogenic split).');
    r = addParagraph(ins, r, 'How to use it.', '1) Skim the Categories and Factor Library sheets. 2) Enter one activity per row on Activity Data (use the dropdowns). 3) Save, then upload on Import & Export — Validate first to preview exactly what each row will produce, then Import.');
    r = addParagraph(ins, r, 'Required columns.', 'Category, Value, Unit, Period Start, Period End. Everything else is optional.');
    r = addParagraph(ins, r, 'Pinning a factor.', 'Leave Factor Code blank to use the Egyptian-default factor (the product default). To pin a specific factor, copy its code from the Factor Library sheet.');
    r = addParagraph(ins, r, 'Grouping.', 'Rows that share a Title + period + facility merge into one calculation (e.g. an electricity line + a gas line under “Q1 Energy”). Leave Title blank to keep a row on its own.');
    r = addParagraph(ins, r, 'Estimates.', 'Set Is Estimate = Yes for gap-filled values; they are stored flagged (quality low, DQ 5) so they stay distinguishable from measured data.');
    r = addParagraph(ins, r, 'Round-trip.', 'Exporting your data produces a file with these same columns (plus computed results) — edit it and re-import. The Validate step flags likely duplicates so you decide what to re-import.');
    r = addParagraph(ins, r, 'Header colours.', 'Green = required · slate = grouping/context · teal = factor · amber = estimate · grey = method-specific (fill only when relevant to the category).');

    // ===== 2. Activity Data (the fill-in sheet) =====
    const ad = wb.addWorksheet('Activity Data');
    ad.columns = IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width })) as any;
    styleHeaderCells(ad, IMPORT_COLUMNS.map((c) => GROUP_FILL[c.group]));
    IMPORT_COLUMNS.forEach((c, i) => { if (c.note) ad.getRow(1).getCell(i + 1).note = c.note; });
    ad.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: IMPORT_COLUMNS.length } };
    applyRangeList(ad, colNum('category'), 2, N + 1, `Lists!$A$2:$A$${categoryValues.length + 1}`);
    applyRangeList(ad, colNum('unit'), 2, N + 1, `Lists!$B$2:$B$${unitValues.length + 1}`);
    if (facilityValues.length) applyRangeList(ad, colNum('facility'), 2, N + 1, `Lists!$C$2:$C$${facilityValues.length + 1}`);
    applyInlineList(ad, colNum('isEstimate'), 2, N + 1, VALIDATION_LISTS.YesNo);
    applyInlineList(ad, colNum('roundTrip'), 2, N + 1, VALIDATION_LISTS.YesNo);
    applyInlineList(ad, colNum('travelMode'), 2, N + 1, VALIDATION_LISTS.TravelModes);
    applyInlineList(ad, colNum('travelClass'), 2, N + 1, VALIDATION_LISTS.TravelClasses);
    applyInlineList(ad, colNum('currency'), 2, N + 1, VALIDATION_LISTS.Currencies);

    // ===== 3. Examples (worked, not imported) =====
    this.addExamplesSheet(wb, facilityValues[0] || '');

    // ===== 4. Categories reference =====
    addReferenceSheet(wb, 'Categories',
      [
        { header: 'Scope', key: 'scope', width: 8 },
        { header: 'Category', key: 'category', width: 28 },
        { header: 'Description', key: 'description', width: 50 },
        { header: 'Method', key: 'method', width: 16 },
        { header: 'Base Unit', key: 'baseUnit', width: 12 },
        { header: 'Allowed Units', key: 'units', width: 36 },
        { header: 'Required Inputs (* = required)', key: 'reqInputs', width: 40 },
        { header: 'Egyptian Considerations', key: 'egypt', width: 50 },
      ],
      categories.map((c) => ({
        scope: c.scope,
        category: c.category,
        description: c.description || '',
        method: c.calculationMethod,
        baseUnit: c.baseUnit,
        units: (c.allowedUnits || []).map((u: any) => u.unit).join(', '),
        reqInputs: (c.requiredInputs || []).map((ri: any) => `${ri.field}${ri.required ? '*' : ''}`).join(', '),
        egypt: c.egyptianContext?.considerations || '',
      }))
    );

    // ===== 5. Factor Library reference =====
    addReferenceSheet(wb, 'Factor Library',
      [
        { header: 'Factor Code', key: 'code', width: 38 },
        { header: 'Name', key: 'name', width: 40 },
        { header: 'Category', key: 'category', width: 26 },
        { header: 'Value', key: 'value', width: 14 },
        { header: 'Unit', key: 'unit', width: 18 },
        { header: 'Source', key: 'source', width: 26 },
        { header: 'Year', key: 'year', width: 8 },
        { header: 'Region', key: 'region', width: 10 },
        { header: 'Quality', key: 'quality', width: 10 },
        { header: 'Supplier', key: 'supplier', width: 20 },
      ],
      factors.map((f) => ({
        code: f.factorCode,
        name: f.name,
        category: f.categoryId?.category || '',
        value: f.factor,
        unit: f.unit,
        source: f.source,
        year: f.year,
        region: f.region,
        quality: f.qualityRating || '',
        supplier: f.supplierName || '',
      }))
    );

    // ===== 6. Units reference =====
    addReferenceSheet(wb, 'Units',
      [
        { header: 'Dimension', key: 'd', width: 16 },
        { header: 'Accepted Units', key: 'u', width: 48 },
        { header: 'Notes', key: 'n', width: 62 },
      ],
      [
        { d: 'Energy', u: 'kWh, MWh, GJ, TJ, MJ, mmBtu, therm, Btu', n: 'Converted to the factor’s energy basis (e.g. EPA fuels are per mmBtu).' },
        { d: 'Mass', u: 'kg, t (tonne), short ton, lb, g', n: 'Solid fuels / materials / refrigerant masses.' },
        { d: 'Volume / fuel', u: 'L, m³, gallon, scf, ft³, bbl', n: 'Liquid & gaseous fuels.' },
        { d: 'Distance', u: 'km, miles, m, nm', n: 'Mobile distance-based & travel.' },
        { d: 'Spend', u: 'EGP, USD, EUR, GBP', n: 'Spend-based categories; non-EGP is converted to EGP.' },
        { d: 'Transport', u: 'tkm (tonne-km), pkm (passenger-km)', n: 'Freight & passenger transport.' },
        { d: '⚠ Note', u: '', n: 'If a unit cannot be converted to the chosen factor’s unit, the row fails with a clear error — never a silent wrong number.' },
      ]
    );

    // ===== 7. Lists (hidden dropdown sources) =====
    const lists = wb.addWorksheet('Lists', { state: 'veryHidden' });
    lists.getCell('A1').value = 'Categories';
    lists.getCell('B1').value = 'Units';
    lists.getCell('C1').value = 'Facilities';
    categoryValues.forEach((v, i) => (lists.getCell(i + 2, 1).value = v));
    unitValues.forEach((v, i) => (lists.getCell(i + 2, 2).value = v));
    facilityValues.forEach((v, i) => (lists.getCell(i + 2, 3).value = v));

    return workbookToBuffer(wb);
  }

  /** Worked example rows on their own sheet (banner makes clear they are NOT imported). */
  private addExamplesSheet(wb: import('exceljs').Workbook, facilityName: string): void {
    const ws = wb.addWorksheet('Examples');
    IMPORT_COLUMNS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });
    const lastColLetter = ws.getColumn(IMPORT_COLUMNS.length).letter;
    ws.mergeCells(`A1:${lastColLetter}1`);
    const banner = ws.getCell('A1');
    banner.value = 'Examples — copy the pattern into the “Activity Data” sheet. THIS SHEET IS NOT IMPORTED.';
    banner.font = { bold: true, color: { argb: 'FF9A6A1F' } };
    banner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDF3E2' } };
    banner.alignment = { vertical: 'middle' };
    ws.getRow(1).height = 22;
    IMPORT_COLUMNS.forEach((c, i) => (ws.getCell(2, i + 1).value = c.header));
    styleHeaderCells(ws, IMPORT_COLUMNS.map((c) => GROUP_FILL[c.group]), 2);

    const rows: Record<string, any>[] = [
      { title: 'Q1 Energy', category: 'Scope 2 — Purchased Electricity', value: 1000, unit: 'kWh', periodStart: '2026-01-01', periodEnd: '2026-03-31', facility: facilityName, notes: 'Office electricity (Egyptian-default factor)' },
      { title: 'Q1 Energy', category: 'Scope 1 — Stationary Combustion', value: 1, unit: 'short ton', factorCode: 'EPA25F_STAT_ANTHRACITE_SHORT_TON', periodStart: '2026-01-01', periodEnd: '2026-03-31', notes: 'Anthracite — pinned factor; same Title groups it with the row above' },
      { category: 'Scope 1 — Mobile Combustion', value: 100, unit: 'km', factorCode: 'DEFRA24_MOBILE_COMBUSTION__CARS_BY_MARKET_SEGMENT_MINI_DIESEL_KM', periodStart: '2026-01-01', periodEnd: '2026-03-31', notes: 'Distance-based (km factor)' },
      { category: 'Scope 1 — Fugitive Emissions', value: 0, unit: 'kg', mbPurchases: 100, mbInventoryStart: 20, mbInventoryEnd: 15, mbCharged: 30, mbRecovered: 10, periodStart: '2026-01-01', periodEnd: '2026-03-31', notes: 'Material balance — released mass derived from the MB columns' },
      { category: 'Scope 3 — Business Travel', value: 1, unit: 'km', origin: 'CAI', destination: 'DXB', distance: 2196, travelMode: 'Flight', travelClass: 'Economy', roundTrip: 'Yes', periodStart: '2026-01-01', periodEnd: '2026-03-31', notes: 'Flight — distance-based, round trip' },
      { category: 'Scope 2 — Purchased Electricity', value: 1200, unit: 'kWh', isEstimate: 'Yes', estimationMethod: 'prior-year +10%', periodStart: '2026-04-01', periodEnd: '2026-06-30', notes: 'Gap-filled estimate (flagged DQ 5)' },
    ];
    rows.forEach((rowObj, ri) =>
      IMPORT_COLUMNS.forEach((c, ci) => {
        const v = rowObj[c.key];
        if (v !== undefined) ws.getCell(3 + ri, ci + 1).value = v;
      })
    );
  }

  /**
   * Validate an uploaded CSV or Excel file (shared row reader). When an
   * organizationId is supplied, also runs advisory data-quality screening (§4.3)
   * — duplicate / outlier / spend-double-count warnings that never block import.
   */
  async validateCSV(filePath: string, organizationId?: string): Promise<{
    valid: boolean;
    rowCount: number;
    errors: string[];
    warnings: ImportWarning[];
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

    let warnings: ImportWarning[] = [];
    if (organizationId) {
      try {
        warnings = await this.computeImportWarnings(rows, organizationId);
      } catch (e) {
        // Quality screening is advisory — never fail a validation on it.
        logger.warn('Import quality screening failed (non-blocking):', e);
      }
    }

    return {
      valid: errors.length === 0,
      rowCount: rows.length,
      errors,
      warnings,
      preview: rows.slice(0, 5),
    };
  }

  /**
   * Resolve categories + the organization's historical activity, then run the
   * pure import-quality checks (§4.3). Category identity is the lowercased name.
   */
  private async computeImportWarnings(
    rows: CSVCalculationRow[],
    organizationId: string
  ): Promise<ImportWarning[]> {
    const categories = await EmissionCategory.find()
      .select('category scope calculationMethod')
      .lean();
    const byName = new Map<string, any>();
    const byId = new Map<string, any>();
    for (const c of categories as any[]) {
      byName.set(String(c.category).trim().toLowerCase(), c);
      byId.set(c._id.toString(), c);
    }

    // Parsed file rows (skip ones that fail the basic required-field checks).
    const qualityRows: QualityRow[] = [];
    rows.forEach((row, idx) => {
      const value = parseFloat(row.value);
      const name = String(row.category || '').trim().toLowerCase();
      const cat = byName.get(name);
      if (!row.category || !cat || isNaN(value) || !row.unit) return;
      qualityRows.push({
        rowNumber: idx + 2,
        categoryKey: name,
        categoryName: cat.category,
        scope: cat.scope,
        spendBased: cat.calculationMethod === 'spend_based',
        value,
        unit: row.unit,
        periodStart: row.period_start || undefined,
        periodEnd: row.period_end || undefined,
      });
    });
    if (qualityRows.length === 0) return [];

    // History: the org's existing activity entries (category + period + value).
    const calcs = await Calculation.find({ organizationId })
      .select('period data.categoryId data.value')
      .lean();
    const history: HistoryPoint[] = [];
    for (const c of calcs as any[]) {
      for (const e of c.data || []) {
        const cat = e.categoryId ? byId.get(e.categoryId.toString()) : undefined;
        if (!cat) continue;
        history.push({
          categoryKey: String(cat.category).trim().toLowerCase(),
          scope: cat.scope,
          value: e.value,
          periodStart: c.period?.start ? new Date(c.period.start).toISOString() : undefined,
          periodEnd: c.period?.end ? new Date(c.period.end).toISOString() : undefined,
        });
      }
    }

    return analyzeImportQuality(qualityRows, history);
  }
}
