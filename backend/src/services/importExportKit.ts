/**
 * Branded XLSX toolkit for the Import/Export round-trip. Thin, reusable helpers
 * over exceljs that apply the Carbonytics brand (deep-green headers, logo cover
 * band) consistently — the spreadsheet equivalent of `services/reportKit.ts`
 * (which themes the PDF/DOCX reports). Reuses the brand accent from `THEMES`.
 */
import ExcelJS from 'exceljs';
import { THEMES } from './reportKit';
import { BRAND_ICON_PNG_BASE64 } from '../assets/brandIcon';

const rgbToArgb = (c: [number, number, number]) =>
  'FF' + c.map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase();

export const BRAND_GREEN = rgbToArgb(THEMES.carbonytics.accent); // FF1F945E
export const BRAND_INK = rgbToArgb(THEMES.carbonytics.ink); // FF13242C
export const BRAND_GREEN_LIGHT = 'FFE7F3EC';
export const BRAND_GREY_LIGHT = 'FFF1F4F3';
const WHITE = 'FFFFFFFF';

export function newBrandedWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Carbonytics';
  wb.created = new Date();
  return wb;
}

/** Float the dotted-C logo near the top-left of a sheet (best-effort). */
export function addLogo(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet): void {
  try {
    const imageId = wb.addImage({ base64: BRAND_ICON_PNG_BASE64, extension: 'png' });
    ws.addImage(imageId, { tl: { col: 0.25, row: 0.3 } as any, ext: { width: 48, height: 48 } });
  } catch {
    /* logo is decorative — never fail a download on it */
  }
}

/** Apply the branded header style to a row and freeze everything above it. */
export function styleHeaderRow(
  ws: ExcelJS.Worksheet,
  rowNumber = 1,
  argb: string = BRAND_GREEN
): void {
  const row = ws.getRow(rowNumber);
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: WHITE }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
  });
  row.height = 26;
  ws.views = [{ state: 'frozen', ySplit: rowNumber }];
}

/** Per-column header fills (lets the Activity Data sheet group columns by colour). */
export function styleHeaderCells(
  ws: ExcelJS.Worksheet,
  fills: string[],
  rowNumber = 1
): void {
  const row = ws.getRow(rowNumber);
  fills.forEach((argb, i) => {
    const cell = row.getCell(i + 1);
    cell.font = { bold: true, color: { argb: WHITE }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  row.height = 30;
  ws.views = [{ state: 'frozen', ySplit: rowNumber, xSplit: 0 }];
}

/** A branded title band across the first columns + subtitle, with the logo. */
export function addBandTitle(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  title: string,
  subtitle?: string,
  span = 10
): void {
  const last = String.fromCharCode(64 + span); // e.g. 'J'
  ws.mergeCells(`A1:${last}1`);
  const t = ws.getCell('A1');
  t.value = `      ${title}`;
  t.font = { bold: true, size: 18, color: { argb: WHITE } };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_GREEN } };
  t.alignment = { vertical: 'middle', horizontal: 'left' };
  ws.getRow(1).height = 42;

  if (subtitle) {
    ws.mergeCells(`A2:${last}2`);
    const s = ws.getCell('A2');
    s.value = subtitle;
    s.font = { italic: true, size: 11, color: { argb: BRAND_INK } };
    s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_GREEN_LIGHT } };
    s.alignment = { vertical: 'middle', horizontal: 'left' };
    ws.getRow(2).height = 20;
  }
  addLogo(wb, ws);
}

/** Write a bold-label + body paragraph into a single wide column, returning next row. */
export function addParagraph(
  ws: ExcelJS.Worksheet,
  rowNumber: number,
  label: string | null,
  body: string,
  span = 10
): number {
  const last = String.fromCharCode(64 + span);
  ws.mergeCells(`A${rowNumber}:${last}${rowNumber}`);
  const cell = ws.getCell(`A${rowNumber}`);
  if (label) {
    cell.value = { richText: [{ font: { bold: true, color: { argb: BRAND_INK } }, text: `${label}  ` }, { text: body }] } as any;
  } else {
    cell.value = body;
  }
  cell.alignment = { wrapText: true, vertical: 'top' };
  ws.getRow(rowNumber).height = Math.max(16, Math.ceil(body.length / (span * 10)) * 15);
  return rowNumber + 1;
}

/** Add a styled reference sheet from column defs + row objects. */
export function addReferenceSheet(
  wb: ExcelJS.Workbook,
  name: string,
  columns: Partial<ExcelJS.Column>[],
  rows: Record<string, any>[],
  argb: string = BRAND_GREEN
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name);
  ws.columns = columns as ExcelJS.Column[];
  rows.forEach((r) => ws.addRow(r));
  styleHeaderRow(ws, 1, argb);
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
}

/** Apply an inline list dropdown (short fixed lists) to a column over a row range. */
export function applyInlineList(
  ws: ExcelJS.Worksheet,
  colNumber: number,
  firstRow: number,
  lastRow: number,
  values: string[]
): void {
  const formula = `"${values.join(',')}"`;
  for (let r = firstRow; r <= lastRow; r++) {
    ws.getCell(r, colNumber).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [formula],
      showErrorMessage: false, // advisory — never block paste of a valid alternative
    } as ExcelJS.DataValidation;
  }
}

/** Apply a range-backed list dropdown (dynamic lists on the hidden Lists sheet). */
export function applyRangeList(
  ws: ExcelJS.Worksheet,
  colNumber: number,
  firstRow: number,
  lastRow: number,
  rangeRef: string
): void {
  for (let r = firstRow; r <= lastRow; r++) {
    ws.getCell(r, colNumber).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [rangeRef],
      showErrorMessage: false,
    } as ExcelJS.DataValidation;
  }
}

export async function workbookToBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
