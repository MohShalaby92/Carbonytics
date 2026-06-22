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
import { ensureInventory, midpointYear } from './inventoryService';
import { buildEntryFromComputed } from './calculationPersistence';
import { logger } from '../utils/logger';
import { analyzeImportQuality, QualityRow, HistoryPoint, ImportWarning } from './importQuality';
import {
  IMPORT_COLUMNS,
  VALIDATION_LISTS,
  GROUP_FILL,
  mapRowToCanonical,
  stripScopePrefix,
  parseBoolean,
  parseNumberOrUndefined,
  buildMetadataFromRow,
  groupKey,
  duplicateKey,
} from './importMapping';
import {
  newBrandedWorkbook,
  addBandTitle,
  addParagraph,
  addReferenceSheet,
  styleHeaderRow,
  styleHeaderCells,
  applyInlineList,
  applyRangeList,
  workbookToBuffer,
  BRAND_GREEN,
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

interface ImportRowResult {
  rowNumber: number;
  status: 'imported' | 'failed' | 'skipped';
  category?: string;
  emissions?: number;
  error?: string;
}

interface ImportResult {
  processed: number;
  successful: number;
  failed: number;
  skipped: number;
  createdCalculations: number;
  calculationIds: string[];
  rows: ImportRowResult[];
  // Legacy row-error list (kept for back-compat with existing callers/UI).
  errors: Array<{
    row: number;
    error: string;
    data: any;
  }>;
}

/** One row after canonical mapping + category/factor/facility resolution + engine compute. */
interface ResolvedRow {
  rowNumber: number;
  canonical: Record<string, string>;
  categoryId?: string;
  categoryName?: string;
  scope?: number;
  spendBased?: boolean;
  factorId?: string;
  factorName?: string;
  factorSource?: string;
  facilityId?: string;
  facilityName?: string;
  isEstimate: boolean;
  estimationMethod?: string;
  metadata: Record<string, any>;
  periodStart?: string;
  periodEnd?: string;
  value?: number;
  unit?: string;
  computed?: any; // CalculationResult
  emissions?: number;
  dqScore?: number;
  duplicate: boolean;
  errors: string[];
}

/** Per-row dry-run preview (what each row WILL produce, before importing). */
interface PreviewRow {
  rowNumber: number;
  category?: string;
  scope?: number;
  factor?: string;
  factorSource?: string;
  facility?: string;
  value?: number;
  unit?: string;
  emissions?: number;
  dqScore?: number;
  isEstimate: boolean;
  duplicate: boolean;
  errors: string[];
}

interface PreviewResult {
  valid: boolean;
  rowCount: number;
  errors: string[];
  warnings: ImportWarning[];
  duplicateCount: number;
  rows: PreviewRow[];
}

// UTF-8 BOM so spreadsheet apps read exported CSVs (e.g. "m³") with the right encoding.
const UTF8_BOM = '﻿';

interface ExportColumn {
  key: string;
  header: string;
  /** input = round-trip column (header matches the import template); output = computed/provenance. */
  input: boolean;
  width: number;
}

/**
 * Export columns: the leading block mirrors the import template headers EXACTLY
 * (so an export re-imports cleanly) and is DERIVED from IMPORT_COLUMNS so the two
 * can never drift — every method-specific input (travel route/distance/class,
 * combustion fuel, mobile vehicle, spend currency, fugitive material balance) is
 * round-tripped, not just the simple activity columns. The computed/provenance
 * columns the importer ignores follow. This is the round-trip contract.
 */
const EXPORT_INPUT_COLUMNS: ExportColumn[] = IMPORT_COLUMNS.map((c) => ({
  key: c.key,
  header: c.header,
  input: true,
  width: c.width,
}));

const EXPORT_OUTPUT_COLUMNS: ExportColumn[] = [
  { key: 'scope', header: 'Scope', input: false, width: 7 },
  { key: 'status', header: 'Status', input: false, width: 11 },
  { key: 'verified', header: 'Verified', input: false, width: 9 },
  { key: 'emissions', header: 'Emissions (kg CO2e)', input: false, width: 18 },
  { key: 'factorName', header: 'Factor Name', input: false, width: 36 },
  { key: 'factorValue', header: 'Factor Value', input: false, width: 14 },
  { key: 'factorSource', header: 'Factor Source', input: false, width: 24 },
  { key: 'factorYear', header: 'Factor Year', input: false, width: 10 },
  { key: 'factorVersion', header: 'Factor Version', input: false, width: 12 },
  { key: 'method', header: 'Method', input: false, width: 18 },
  { key: 'gwpSet', header: 'GWP Set', input: false, width: 10 },
  { key: 'gwpApplied', header: 'GWP Applied', input: false, width: 12 },
  { key: 'dqScore', header: 'DQ Score', input: false, width: 9 },
  { key: 'quality', header: 'Quality', input: false, width: 9 },
  { key: 'supplier', header: 'Supplier', input: false, width: 18 },
  { key: 'scope2Location', header: 'Scope2 Location', input: false, width: 14 },
  { key: 'scope2Market', header: 'Scope2 Market', input: false, width: 14 },
  { key: 'scope2Method', header: 'Scope2 Method', input: false, width: 30 },
  { key: 'biogenicCO2', header: 'Biogenic CO2 (kg, memo)', input: false, width: 18 },
  { key: 'gasCo2', header: 'Gas CO2 (kg)', input: false, width: 12 },
  { key: 'gasCh4', header: 'Gas CH4 (kg)', input: false, width: 12 },
  { key: 'gasN2o', header: 'Gas N2O (kg)', input: false, width: 12 },
  { key: 'mbReleased', header: 'MB Released (kg)', input: false, width: 14 },
  { key: 'reportingYear', header: 'Reporting Year', input: false, width: 12 },
  { key: 'calculationId', header: 'Calculation ID', input: false, width: 26 },
  { key: 'entryIndex', header: 'Entry Index', input: false, width: 10 },
];

// Round-trip input columns first (derived from the import model), then computed.
const EXPORT_COLUMNS: ExportColumn[] = [...EXPORT_INPUT_COLUMNS, ...EXPORT_OUTPUT_COLUMNS];

export class CSVService {

  /**
   * Import activity rows into Calculations. Each row is resolved (category /
   * factor / facility / estimate / metadata) and recomputed by the SAME engine
   * the calculator uses, then rows are grouped into multi-entry Calculations by
   * Title + period + facility, linked to their reporting-year inventory (with the
   * published-year lock honoured) and pinned to the factor version in force.
   */
  async importCalculations(
    filePath: string,
    userId: string,
    organizationId: string,
    opts: { skipDuplicates?: boolean } = {}
  ): Promise<ImportResult> {
    logger.info(`Starting import from: ${filePath}`);
    const rawRows = await this.readRows(filePath);
    const resolved = await this.resolveRows(rawRows, organizationId, userId);

    const result: ImportResult = {
      processed: resolved.length,
      successful: 0,
      failed: 0,
      skipped: 0,
      createdCalculations: 0,
      calculationIds: [],
      rows: [],
      errors: [],
    };

    // Partition: failed (errors / no compute), skipped (flagged duplicate when
    // the caller opted to skip), and importable.
    const importable: ResolvedRow[] = [];
    for (const rr of resolved) {
      if (rr.errors.length || !rr.computed) {
        const error = rr.errors.join('; ') || 'could not compute';
        result.failed++;
        result.rows.push({ rowNumber: rr.rowNumber, status: 'failed', category: rr.categoryName, error });
        result.errors.push({ row: rr.rowNumber, error, data: rr.canonical });
      } else if (opts.skipDuplicates && rr.duplicate) {
        result.skipped++;
        result.rows.push({ rowNumber: rr.rowNumber, status: 'skipped', category: rr.categoryName, emissions: rr.emissions, error: 'duplicate of existing data' });
      } else {
        importable.push(rr);
      }
    }

    // Group rows (Title + period + facility) into multi-entry calculations.
    const groups = new Map<string, ResolvedRow[]>();
    for (const rr of importable) {
      const key = groupKey(rr.canonical, rr.rowNumber, rr.facilityId);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(rr);
    }

    for (const rows of groups.values()) {
      const first = rows[0];
      const start = new Date(first.periodStart!);
      const end = new Date(first.periodEnd!);
      const reportingYear = midpointYear(start, end);

      // Link to the reporting-year inventory; refuse to write into a published year.
      const inventory = await ensureInventory(organizationId, reportingYear);
      if (inventory.status === 'published') {
        const error = `Reporting year ${reportingYear} is published and locked — reopen it (Compliance → Reporting Years) before importing.`;
        for (const rr of rows) {
          result.failed++;
          result.rows.push({ rowNumber: rr.rowNumber, status: 'failed', category: rr.categoryName, error });
          result.errors.push({ row: rr.rowNumber, error, data: rr.canonical });
        }
        continue;
      }

      const emissions = { scope1: 0, scope2: 0, scope3: 0, total: 0 };
      const data: any[] = [];
      for (const rr of rows) {
        const entry = await buildEntryFromComputed(rr.computed, {
          categoryId: rr.categoryId!,
          isEstimate: rr.isEstimate,
          estimationMethod: rr.estimationMethod,
          notes: rr.canonical.notes,
        });
        data.push(entry);
        if (rr.scope === 1) emissions.scope1 += entry.emissions;
        else if (rr.scope === 2) emissions.scope2 += entry.emissions;
        else if (rr.scope === 3) emissions.scope3 += entry.emissions;
      }
      emissions.scope1 = Math.round(emissions.scope1 * 100) / 100;
      emissions.scope2 = Math.round(emissions.scope2 * 100) / 100;
      emissions.scope3 = Math.round(emissions.scope3 * 100) / 100;
      emissions.total = emissions.scope1 + emissions.scope2 + emissions.scope3;

      const title = (first.canonical.title || '').trim() || `Imported — ${first.categoryName} ${reportingYear}`;
      try {
        const calc = await Calculation.create({
          organizationId,
          userId,
          ...(first.facilityId ? { facilityId: first.facilityId } : {}),
          inventoryId: inventory._id,
          title,
          description: `Imported ${rows.length} ${rows.length === 1 ? 'entry' : 'entries'} on ${new Date().toISOString().slice(0, 10)}`,
          period: { start, end },
          emissions,
          data,
          status: 'completed',
        });
        result.createdCalculations++;
        result.calculationIds.push(String(calc._id));
        for (const rr of rows) {
          result.successful++;
          result.rows.push({ rowNumber: rr.rowNumber, status: 'imported', category: rr.categoryName, emissions: rr.emissions });
        }
      } catch (e) {
        const error = e instanceof Error ? e.message : 'failed to save calculation';
        for (const rr of rows) {
          result.failed++;
          result.rows.push({ rowNumber: rr.rowNumber, status: 'failed', category: rr.categoryName, error });
          result.errors.push({ row: rr.rowNumber, error, data: rr.canonical });
        }
      }
    }

    result.rows.sort((a, b) => a.rowNumber - b.rowNumber);
    logger.info(
      `Import completed. Processed ${result.processed}, imported ${result.successful} (${result.createdCalculations} calcs), failed ${result.failed}, skipped ${result.skipped}`
    );
    return result;
  }

  /**
   * Resolve raw rows to canonical keys, look up category / factor / facility,
   * run the authoritative engine compute, and flag rows that duplicate existing
   * data. Shared by the dry-run preview and the import so the preview shows
   * EXACTLY what the import will produce. Never writes anything.
   */
  private async resolveRows(
    rawRows: CSVCalculationRow[],
    organizationId: string,
    userId?: string,
    existingCalcs?: any[]
  ): Promise<ResolvedRow[]> {
    const canonicals = rawRows.map((r) => mapRowToCanonical(r));

    // Preload reference data once.
    const categories = await EmissionCategory.find().lean();
    const catByName = new Map<string, any>();
    const catById = new Map<string, any>();
    for (const c of categories as any[]) {
      catByName.set(String(c.category).trim().toLowerCase(), c);
      catById.set(String(c._id), c);
    }

    const anyCode = canonicals.some((c) => c.factorCode);
    const factorList = anyCode
      ? await EmissionFactor.find({ factorCode: { $exists: true, $ne: null } })
          .select('factorCode name source categoryId organizationId')
          .lean()
      : [];
    const factorByCode = new Map<string, any>();
    for (const f of factorList as any[]) {
      if (f.factorCode) factorByCode.set(String(f.factorCode).trim().toLowerCase(), f);
    }

    const facilities = await Facility.find({ organizationId, isActive: true }).lean();
    const facByName = new Map<string, any>();
    const facById = new Map<string, any>();
    for (const f of facilities as any[]) {
      facByName.set(String(f.name).trim().toLowerCase(), f);
      facById.set(String(f._id), f);
    }

    // Existing data → duplicate-detection keys. The preview shares its single
    // org-calculations scan with the quality screening (see previewImport).
    const existing =
      existingCalcs ??
      (await Calculation.find({ organizationId })
        .select('period facilityId data.categoryId data.value')
        .lean());
    const dupeSet = new Set<string>();
    for (const c of existing as any[]) {
      const ps = c.period?.start ? new Date(c.period.start).toISOString().slice(0, 10) : '';
      const pe = c.period?.end ? new Date(c.period.end).toISOString().slice(0, 10) : '';
      const fid = c.facilityId ? String(c.facilityId) : '';
      for (const e of c.data || []) {
        if (!e.categoryId) continue;
        dupeSet.add(duplicateKey({ categoryId: String(e.categoryId), periodStart: ps, periodEnd: pe, facilityId: fid, value: e.value }));
      }
    }

    const out: ResolvedRow[] = [];
    for (let i = 0; i < canonicals.length; i++) {
      const canonical = canonicals[i];
      const rr: ResolvedRow = {
        // Real sheet/file row when the reader recorded one (Excel), else the
        // header-offset index as a fallback (header is row 1, data starts at 2).
        rowNumber: (rawRows[i] as any)?.__rowNumber ?? i + 2,
        canonical,
        isEstimate: parseBoolean(canonical.isEstimate),
        estimationMethod: canonical.estimationMethod,
        metadata: {},
        periodStart: canonical.periodStart,
        periodEnd: canonical.periodEnd,
        unit: canonical.unit,
        duplicate: false,
        errors: [],
      };

      // Required fields.
      if (!canonical.category) rr.errors.push('Missing Category');
      const value = parseNumberOrUndefined(canonical.value);
      if (value === undefined || value < 0) rr.errors.push('Missing or invalid Value');
      else rr.value = value;
      if (!canonical.unit) rr.errors.push('Missing Unit');
      if (!canonical.periodStart) rr.errors.push('Missing Period Start');
      if (!canonical.periodEnd) rr.errors.push('Missing Period End');

      // Category (name with optional "Scope N — " prefix, or id).
      let category: any;
      if (canonical.category) {
        category = catByName.get(stripScopePrefix(canonical.category).toLowerCase());
        if (!category && mongoose.isValidObjectId(canonical.category)) category = catById.get(canonical.category);
        if (!category) rr.errors.push(`Category not found: ${canonical.category}`);
        else {
          rr.categoryId = String(category._id);
          rr.categoryName = category.category;
          rr.scope = category.scope;
          rr.spendBased = category.calculationMethod === 'spend_based';
        }
      }

      // Factor (by code or id) — must belong to the same category + org/shared scope.
      if (canonical.factorCode && rr.categoryId) {
        let f: any = factorByCode.get(canonical.factorCode.trim().toLowerCase());
        if (!f && mongoose.isValidObjectId(canonical.factorCode)) {
          f = await EmissionFactor.findById(canonical.factorCode).select('factorCode name source categoryId organizationId').lean();
        }
        if (!f) rr.errors.push(`Factor Code not found: ${canonical.factorCode}`);
        else if (f.organizationId && String(f.organizationId) !== organizationId) rr.errors.push(`Factor not available to your organization: ${canonical.factorCode}`);
        else if (String(f.categoryId) !== rr.categoryId) rr.errors.push(`Factor ${canonical.factorCode} belongs to a different category`);
        else {
          rr.factorId = String(f._id);
          rr.factorName = f.name;
          rr.factorSource = f.source;
        }
      }

      // Facility (by name or id), validated against the organization.
      if (canonical.facility) {
        let fac: any = facByName.get(canonical.facility.trim().toLowerCase());
        if (!fac && mongoose.isValidObjectId(canonical.facility)) fac = facById.get(canonical.facility);
        if (!fac) rr.errors.push(`Facility not found: ${canonical.facility}`);
        else {
          rr.facilityId = String(fac._id);
          rr.facilityName = fac.name;
        }
      }

      rr.metadata = buildMetadataFromRow(canonical);

      // Authoritative server-side compute — only when the row is otherwise valid.
      if (rr.errors.length === 0 && rr.categoryId && rr.value !== undefined) {
        try {
          const computed = await calculationEngine.calculate({
            categoryId: rr.categoryId,
            value: rr.value,
            unit: canonical.unit,
            factorId: rr.factorId,
            metadata: rr.metadata,
            userId,
            organizationId,
            activityYear: canonical.periodStart ? new Date(canonical.periodStart).getFullYear() : undefined,
          });
          rr.computed = computed;
          rr.emissions = computed.calculation.emissions;
          rr.dqScore = rr.isEstimate ? 5 : computed.quality?.dqScore;
          if (!rr.factorName) {
            rr.factorName = computed.factor.name;
            rr.factorSource = computed.factor.source;
          }
          rr.duplicate = dupeSet.has(
            duplicateKey({
              categoryId: rr.categoryId,
              periodStart: rr.periodStart || '',
              periodEnd: rr.periodEnd || '',
              facilityId: rr.facilityId || '',
              value: computed.calculation.value,
            })
          );
        } catch (e) {
          rr.errors.push(e instanceof Error ? e.message : 'calculation failed');
        }
      }

      out.push(rr);
    }

    return out;
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
    // Prefer the template's / export's "Activity Data" sheet by name; fall back
    // to the first sheet for a plain single-sheet upload.
    const sheet =
      workbook.worksheets.find((w) => w.name.trim().toLowerCase() === 'activity data') ||
      workbook.worksheets[0];
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
        // Record the REAL sheet row so error messages line up even when blank
        // rows in the middle are skipped (rowNumber would otherwise drift).
        (obj as any).__rowNumber = rowNumber;
        rows.push(obj as CSVCalculationRow);
      }
    });

    return rows;
  }

  /**
   * Dry-run preview: resolve every row exactly as the import would and report,
   * per row, the resolved category/factor, computed emissions, DQ score,
   * duplicate flag and any errors — plus advisory file-level data-quality
   * warnings. Writes nothing; this is what the user reviews before importing.
   */
  async previewImport(filePath: string, organizationId: string): Promise<PreviewResult> {
    const rawRows = await this.readRows(filePath);

    // One org-calculations scan shared by duplicate detection (resolveRows) and
    // the advisory quality screening (qualityWarnings) — they used to query the
    // whole collection independently on every preview.
    const existingCalcs = await Calculation.find({ organizationId })
      .select('period facilityId data.categoryId data.value')
      .lean();

    const resolved = await this.resolveRows(rawRows, organizationId, undefined, existingCalcs);

    const errors: string[] = [];
    for (const rr of resolved) for (const e of rr.errors) errors.push(`Row ${rr.rowNumber}: ${e}`);

    let warnings: ImportWarning[] = [];
    try {
      warnings = await this.qualityWarnings(resolved, organizationId, existingCalcs);
    } catch (e) {
      // Quality screening is advisory — never fail a preview on it.
      logger.warn('Import quality screening failed (non-blocking):', e);
    }

    const rows: PreviewRow[] = resolved.map((rr) => ({
      rowNumber: rr.rowNumber,
      category: rr.categoryName,
      scope: rr.scope,
      factor: rr.factorName,
      factorSource: rr.factorSource,
      facility: rr.facilityName,
      value: rr.value,
      unit: rr.unit,
      emissions: rr.emissions,
      dqScore: rr.dqScore,
      isEstimate: rr.isEstimate,
      duplicate: rr.duplicate,
      errors: rr.errors,
    }));

    return {
      valid: resolved.length > 0 && resolved.every((r) => r.errors.length === 0),
      rowCount: resolved.length,
      errors,
      warnings,
      duplicateCount: rows.filter((r) => r.duplicate).length,
      rows,
    };
  }

  /**
   * Advisory data-quality warnings (duplicate-within-file / outlier vs prior
   * period / spend double-count) computed from the resolved rows + org history.
   */
  private async qualityWarnings(resolved: ResolvedRow[], organizationId: string, preloadedCalcs?: any[]): Promise<ImportWarning[]> {
    const qualityRows: QualityRow[] = [];
    for (const rr of resolved) {
      if (!rr.categoryName || rr.value === undefined || !rr.unit) continue;
      qualityRows.push({
        rowNumber: rr.rowNumber,
        categoryKey: rr.categoryName.trim().toLowerCase(),
        categoryName: rr.categoryName,
        scope: rr.scope!,
        spendBased: !!rr.spendBased,
        value: rr.value,
        unit: rr.unit,
        periodStart: rr.periodStart || undefined,
        periodEnd: rr.periodEnd || undefined,
      });
    }
    if (qualityRows.length === 0) return [];

    const categories = await EmissionCategory.find().select('category scope').lean();
    const byId = new Map<string, any>();
    for (const c of categories as any[]) byId.set(String(c._id), c);

    const calcs =
      preloadedCalcs ??
      (await Calculation.find({ organizationId }).select('period data.categoryId data.value').lean());
    const history: HistoryPoint[] = [];
    for (const c of calcs as any[]) {
      for (const e of c.data || []) {
        const cat = e.categoryId ? byId.get(String(e.categoryId)) : undefined;
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

  /**
   * Export stored calculations as a complete, round-trippable file. Filters on
   * the reporting PERIOD (not createdAt) and includes ALL statuses by default
   * (locked/verified data is the audited record), with optional status / scope /
   * category / facility filters. One row per entry carries every provenance
   * field (real factor source/year/version, DQ, Scope-2 dual, biogenic, per-gas,
   * material balance, supplier) — the hard-coded "System Default" / "Medium" of
   * the old export are gone. Returns the file bytes + content metadata.
   */
  async exportCalculations(
    organizationId: string,
    filters: {
      startDate?: string;
      endDate?: string;
      scopes?: number[];
      categories?: string[];
      facilityId?: string;
      status?: string;
    } = {},
    format: 'xlsx' | 'csv' = 'xlsx'
  ): Promise<{ buffer: Buffer; contentType: string; ext: string; fileName: string }> {
    const query: any = { organizationId };
    if (filters.status) query.status = filters.status;
    if (filters.facilityId) query.facilityId = filters.facilityId;
    if (filters.startDate || filters.endDate) {
      query['period.start'] = {};
      if (filters.startDate) query['period.start'].$gte = new Date(filters.startDate);
      if (filters.endDate) query['period.start'].$lte = new Date(filters.endDate);
    }

    const calculations = await Calculation.find(query)
      .populate('data.categoryId', 'category scope')
      .populate('facilityId', 'name')
      .sort({ 'period.start': 1, createdAt: 1 })
      .lean();

    const rows = await this.buildExportRows(calculations as any[], filters);
    const totals = this.exportTotals(rows);

    if (format === 'csv') {
      return {
        buffer: this.exportToCsv(rows),
        contentType: 'text/csv',
        ext: 'csv',
        fileName: `carbonytics_emissions_${Date.now()}.csv`,
      };
    }
    return {
      buffer: await this.exportToXlsx(rows, totals, filters),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ext: 'xlsx',
      fileName: `carbonytics_emissions_${Date.now()}.xlsx`,
    };
  }

  /** One row per stored entry with every data point, plus the Factor Code for round-trip pinning. */
  private async buildExportRows(calcs: any[], filters: any): Promise<Record<string, any>[]> {
    // Resolve factorId → factorCode so the export can pin the same factor on re-import.
    const factorIds = new Set<string>();
    for (const c of calcs) for (const e of c.data || []) if (e.factorId) factorIds.add(String(e.factorId));
    const codeById = new Map<string, string>();
    if (factorIds.size) {
      const fl = await EmissionFactor.find({ _id: { $in: [...factorIds] } }).select('factorCode').lean();
      for (const f of fl as any[]) if (f.factorCode) codeById.set(String(f._id), f.factorCode);
    }

    const rows: Record<string, any>[] = [];
    for (const c of calcs) {
      const facilityName = c.facilityId && (c.facilityId as any).name ? (c.facilityId as any).name : '';
      const reportingYear =
        c.period?.start && c.period?.end ? midpointYear(new Date(c.period.start), new Date(c.period.end)) : '';
      (c.data || []).forEach((e: any, idx: number) => {
        const cat = e.categoryId;
        const scope = cat?.scope;
        if (filters.scopes && filters.scopes.length && !filters.scopes.includes(scope)) return;
        if (filters.categories && filters.categories.length && cat && !filters.categories.includes(String(cat._id))) return;
        rows.push({
          category: cat?.category || '',
          value: e.value,
          unit: e.unit,
          periodStart: c.period?.start ? new Date(c.period.start).toISOString().slice(0, 10) : '',
          periodEnd: c.period?.end ? new Date(c.period.end).toISOString().slice(0, 10) : '',
          title: c.title || '',
          facility: facilityName,
          notes: e.notes || '',
          // Pin the same factor on re-import: prefer the human factor code, but
          // fall back to the raw id (the importer also resolves a factor by id)
          // so factors without a code still round-trip instead of silently
          // reverting to the category default.
          factorCode: e.factorId ? codeById.get(String(e.factorId)) || String(e.factorId) : '',
          isEstimate: e.isEstimate ? 'Yes' : 'No',
          estimationMethod: e.estimationMethod || '',
          // Method-specific activity inputs (so travel / spend / combustion /
          // mobile round-trip), then fugitive material-balance components.
          fuelType: e.activityInput?.fuelType || '',
          vehicleType: e.activityInput?.vehicleType || '',
          origin: e.activityInput?.origin || '',
          destination: e.activityInput?.destination || '',
          distance: e.activityInput?.distance ?? '',
          travelMode: e.activityInput?.travelMode || '',
          travelClass: e.activityInput?.travelClass || '',
          roundTrip: e.activityInput?.roundTrip === true ? 'Yes' : e.activityInput?.roundTrip === false ? 'No' : '',
          currency: e.activityInput?.currency || '',
          mbPurchases: e.materialBalance?.purchases ?? '',
          mbInventoryStart: e.materialBalance?.inventoryStart ?? '',
          mbInventoryEnd: e.materialBalance?.inventoryEnd ?? '',
          mbCharged: e.materialBalance?.chargedIntoEquipment ?? '',
          mbRecovered: e.materialBalance?.recovered ?? '',
          scope,
          status: c.status,
          verified: c.verification?.verified ? 'Yes' : 'No',
          emissions: e.emissions,
          factorName: e.factorName || '',
          factorValue: e.factor,
          factorSource: e.factorSource || '',
          factorYear: e.factorYear || '',
          factorVersion: e.factorVersion ?? '',
          method: e.method || '',
          gwpSet: e.gwpSet || '',
          gwpApplied: e.gwpApplied || '',
          dqScore: e.dqScore ?? '',
          quality: e.quality || '',
          supplier: e.supplierName || '',
          scope2Location: e.scope2Location ?? '',
          scope2Market: e.scope2Market ?? '',
          scope2Method: e.scope2MarketMethod || '',
          biogenicCO2: e.biogenicCO2 ?? '',
          gasCo2: e.gasBreakdown?.co2 ?? '',
          gasCh4: e.gasBreakdown?.ch4 ?? '',
          gasN2o: e.gasBreakdown?.n2o ?? '',
          mbReleased: e.materialBalance?.releasedKg ?? '',
          reportingYear,
          calculationId: String(c._id),
          entryIndex: idx,
        });
      });
    }
    return rows;
  }

  private exportTotals(rows: Record<string, any>[]): { count: number; scope1: number; scope2: number; scope3: number; total: number } {
    const t = { count: rows.length, scope1: 0, scope2: 0, scope3: 0, total: 0 };
    for (const r of rows) {
      const e = Number(r.emissions) || 0;
      if (r.scope === 1) t.scope1 += e;
      else if (r.scope === 2) t.scope2 += e;
      else if (r.scope === 3) t.scope3 += e;
    }
    t.scope1 = Math.round(t.scope1 * 100) / 100;
    t.scope2 = Math.round(t.scope2 * 100) / 100;
    t.scope3 = Math.round(t.scope3 * 100) / 100;
    t.total = Math.round((t.scope1 + t.scope2 + t.scope3) * 100) / 100;
    return t;
  }

  private exportToCsv(rows: Record<string, any>[]): Buffer {
    // Neutralize spreadsheet formula injection: a field beginning with = + - @
    // (or a leading control char Excel/Sheets treat as a formula lead) is
    // prefixed with a single quote so it renders as text, never an executable
    // formula, when a user opens the export in Excel/Google Sheets.
    const sanitize = (v: any) => {
      const s = String(v ?? '');
      return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    };
    const esc = (v: any) => `"${sanitize(v).replace(/"/g, '""')}"`;
    const header = EXPORT_COLUMNS.map((c) => esc(c.header)).join(',');
    const body = rows.map((r) => EXPORT_COLUMNS.map((c) => esc(r[c.key])).join(',')).join('\n');
    return Buffer.from(UTF8_BOM + header + '\n' + body, 'utf8');
  }

  private async exportToXlsx(
    rows: Record<string, any>[],
    totals: { count: number; scope1: number; scope2: number; scope3: number; total: number },
    filters: any
  ): Promise<Buffer> {
    const wb = newBrandedWorkbook();

    const period = filters.startDate || filters.endDate ? `${filters.startDate || '…'} to ${filters.endDate || '…'}` : 'All dates';
    const sum = wb.addWorksheet('Summary');
    sum.columns = [{ header: 'Field', key: 'k', width: 32 }, { header: 'Value', key: 'v', width: 52 }] as any;
    ([
      ['Report', 'Carbonytics emissions export'],
      ['Generated at', new Date().toISOString()],
      ['Reporting period filter', period],
      ['Status filter', filters.status || 'all statuses'],
      ['Entries exported', totals.count],
      ['Scope 1 (kg CO2e)', totals.scope1],
      ['Scope 2 (kg CO2e)', totals.scope2],
      ['Scope 3 (kg CO2e)', totals.scope3],
      ['Total (kg CO2e)', totals.total],
      ['Note', 'The leading columns match the import template — edit and re-import for a round-trip.'],
    ] as [string, any][]).forEach((r) => sum.addRow({ k: r[0], v: r[1] }));
    styleHeaderRow(sum);

    const ws = wb.addWorksheet('Activity Data');
    ws.columns = EXPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width })) as any;
    rows.forEach((r) => ws.addRow(r));
    // Green headers for the round-trip input columns, slate for computed/provenance.
    styleHeaderCells(ws, EXPORT_COLUMNS.map((c) => (c.input ? BRAND_GREEN : 'FF4E5D70')));
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: EXPORT_COLUMNS.length } };
    return workbookToBuffer(wb);
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

}
