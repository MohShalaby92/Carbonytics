import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from 'docx';
import ExcelJS from 'exceljs';
import { formatPedigreeLine } from './pedigree';

/**
 * Binary renderers for the GHG inventory report (PDF / DOCX / XLSX), closing the
 * §8 "GHG inventory report (PDF/DOCX/XLSX)" P0 requirement. Each takes the object
 * produced by buildGHGInventoryReport (the same spine as the markdown renderer)
 * and mirrors its 13-section structure, returning a Buffer.
 *
 * No headless browser: pdf-lib (already a dependency) draws the PDF with a small
 * wrap + auto-pagination helper; docx builds the Word document; exceljs (already
 * used on the import path) builds a multi-sheet workbook.
 */

const num = (v: number) => (typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(v ?? ''));
const day = (iso: string) => String(iso || '').split('T')[0];

/**
 * pdf-lib's standard fonts use WinAnsi (CP1252) and throw on characters outside
 * it. Map the Unicode punctuation/symbols the report uses to ASCII, then drop any
 * remaining non-Latin-1 code points. (DOCX/XLSX are UTF-8 and need no sanitizing.)
 */
const pdfSafe = (s: any): string =>
  String(s ?? '')
    .replace(/→/g, '->')
    .replace(/[—–]/g, '-')
    .replace(/…/g, '...')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (m) => '0123456789'['₀₁₂₃₄₅₆₇₈₉'.indexOf(m)])
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x00-\xFF]/g, '');
const methodMix = (methods: Record<string, number>, total: number) =>
  Object.entries(methods || {})
    .map(([m, v]) => `${m}: ${Math.round(((v as number) / Math.max(total, 0.01)) * 100)}%`)
    .join(', ');

// ---------------------------------------------------------------- PDF (pdf-lib)

export async function renderInventoryPdf(r: any): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageW = 595.28;
  const pageH = 841.89; // A4
  const margin = 50;
  const maxW = pageW - margin * 2;
  let page: PDFPage = pdf.addPage([pageW, pageH]);
  let y = pageH - margin;

  const ensure = (h: number) => {
    if (y - h < margin) {
      page = pdf.addPage([pageW, pageH]);
      y = pageH - margin;
    }
  };
  const wrap = (text: string, f: PDFFont, size: number, width: number): string[] => {
    const words = pdfSafe(text).replace(/\s+/g, ' ').trim().split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(t, size) > width && cur) {
        lines.push(cur);
        cur = w;
      } else {
        cur = t;
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  };
  const draw = (
    text: string,
    opts: { size?: number; f?: PDFFont; indent?: number; color?: any; gap?: number } = {}
  ) => {
    const size = opts.size ?? 10;
    const f = opts.f ?? font;
    const indent = opts.indent ?? 0;
    const gap = opts.gap ?? 4;
    for (const ln of wrap(text, f, size, maxW - indent)) {
      ensure(size + gap);
      page.drawText(ln, { x: margin + indent, y, size, font: f, color: opts.color ?? rgb(0.12, 0.12, 0.12) });
      y -= size + gap;
    }
  };
  const heading = (t: string) => {
    y -= 8;
    ensure(16);
    draw(t, { size: 13, f: bold, color: rgb(0.05, 0.32, 0.16) });
    y -= 2;
  };
  const kv = (k: string, v: any) => draw(`${k}: ${v}`, { indent: 10 });
  const table = (cols: string[], widths: number[], rows: string[][], headerColor = rgb(0.92, 0.95, 0.92)) => {
    const size = 9;
    const drawRowAt = (cells: string[], f: PDFFont, fill?: any) => {
      const cellLines = cells.map((c, i) => wrap(c, f, size, widths[i] - 4));
      const lineCount = Math.max(...cellLines.map((l) => l.length));
      const rowH = lineCount * (size + 2) + 4;
      ensure(rowH);
      if (fill) page.drawRectangle({ x: margin, y: y - rowH + (size + 2), width: maxW, height: rowH, color: fill });
      const top = y;
      for (let li = 0; li < lineCount; li++) {
        let x = margin + 2;
        for (let ci = 0; ci < cells.length; ci++) {
          const ln = cellLines[ci][li] || '';
          page.drawText(ln, { x, y: top - li * (size + 2), size, font: f });
          x += widths[ci];
        }
      }
      y = top - rowH;
    };
    drawRowAt(cols, bold, headerColor);
    for (const row of rows) drawRowAt(row, font);
    y -= 4;
  };

  // Title block
  draw(r.title, { size: 18, f: bold, color: rgb(0.05, 0.32, 0.16), gap: 6 });
  draw(`Generated ${day(r.generatedAt)} by ${r.generatedBy}`, { size: 9, color: rgb(0.4, 0.4, 0.4) });
  y -= 4;

  heading('1. Organizational boundary');
  kv('Organization', `${r.organization.name} (${r.organization.industry}, ${r.organization.country})`);
  kv('Consolidation approach', r.organization.consolidationApproach);
  if ((r.organization.facilities || []).length) {
    kv('Facilities', String(r.organization.facilities.length));
    r.organization.facilities.forEach((f: any) =>
      draw(`• ${f.name} (${f.country}) — ownership ${f.ownershipPercent}%, operational control: ${f.operationalControl ? 'yes' : 'no'}`, { indent: 18, size: 9 })
    );
  }

  heading('2. Reporting period');
  draw(`${day(r.reportingPeriod.start)} → ${day(r.reportingPeriod.end)}`, { indent: 10 });
  if (r.inventory && r.inventory.status && r.inventory.status !== 'none') {
    draw(`Reporting-year inventory: ${r.inventory.reportingYear} — ${r.inventory.status}${r.inventory.isBaseYear ? ' (base year)' : ''}`, { indent: 10, size: 9, color: rgb(0.4, 0.4, 0.4) });
  }

  heading('3. Methodology');
  kv('Standard', r.methodology.standard);
  kv('GWP set', `${r.methodology.gwpSet} (${r.methodology.gwpSource})${r.methodology.gwpSetPinned ? ' — pinned (published year)' : ''}`);
  kv('Factor policy', r.methodology.factorPolicy);
  kv('Scope 2', r.methodology.scope2Note);

  heading('4. Emissions by scope (kg CO2e)');
  table(['Scope', 'kg CO2e'], [maxW - 140, 140], [
    ['Scope 1 (direct)', num(r.emissions.byScope.scope1)],
    ['Scope 2 (purchased energy)', num(r.emissions.byScope.scope2)],
    ['Scope 3 (value chain)', num(r.emissions.byScope.scope3)],
    ['Total', num(r.emissions.byScope.total)],
  ]);
  draw(`Biogenic CO2 (memo — excluded from the scope totals above): ${num(r.emissions.biogenicCO2 || 0)} kg CO2. Biomass CH4/N2O remain in Scope 1.`, { indent: 10, size: 9, color: rgb(0.4, 0.4, 0.4) });
  draw(`Scope 2 dual reporting — location-based: ${num(r.emissions.scope2Dual.locationBased)} · market-based: ${num(r.emissions.scope2Dual.marketBased)} kg CO2e`, { indent: 10, size: 9 });
  (r.emissions.scope2Dual.methodsUsed || []).forEach((m: string) => draw(`• Method: ${m}`, { indent: 18, size: 8, color: rgb(0.4, 0.4, 0.4) }));
  if (r.emissions.perGas) {
    const pg = r.emissions.perGas;
    draw(`Per-gas breakdown (Kyoto gases) — CO2e under ${pg.gwpSet}`, { indent: 10, f: bold, size: 10 });
    table(['Gas', 'Mass (kg)', 'CO2e (kg)'], [maxW - 220, 110, 110], [
      ['CO2 (fossil, in-scope)', num(pg.massKg.co2), num(pg.co2eByGas.co2)],
      ['CH4', num(pg.massKg.ch4), num(pg.co2eByGas.ch4)],
      ['N2O', num(pg.massKg.n2o), num(pg.co2eByGas.n2o)],
      ['Per-gas subtotal', '', num(pg.perGasSubtotalCo2e)],
      ['CO2e factors (gases not separated)', '', num(pg.co2eNotSeparated)],
    ]);
    draw(pg.note, { indent: 10, size: 8, color: rgb(0.4, 0.4, 0.4) });
  }
  draw(`Intensity metrics (${r.intensity.year})`, { indent: 10, f: bold, size: 10 });
  if ((r.intensity.metrics || []).length) {
    r.intensity.metrics.forEach((m: any) => draw(`• ${m.label}: ${m.intensityKgCo2ePerUnit} kg CO2e per ${m.denominatorUnit} (denominator ${num(m.denominatorValue)} ${m.denominatorUnit})`, { indent: 18, size: 9 }));
  } else {
    draw(r.intensity.note || 'No denominators recorded for the reporting year.', { indent: 18, size: 9, color: rgb(0.4, 0.4, 0.4) });
  }
  if (r.consolidation) {
    const c = r.consolidation;
    draw('Consolidation (organizational boundary)', { indent: 10, f: bold, size: 10 });
    draw(`Approach: ${c.approach} · Gross: ${num(c.grossTotal)} · Consolidated: ${num(c.consolidatedTotal)} kg CO2e (${c.overallSharePercent}% of gross)`, { indent: 18, size: 9 });
    if ((c.byEntity || []).some((e: any) => e.sharePercent < 100)) {
      table(['Entity', 'Share %', 'Gross', 'Consolidated'], [maxW * 0.4, 70, 90, maxW - maxW * 0.4 - 160],
        c.byEntity.map((e: any) => [e.name, String(e.sharePercent), num(e.gross), num(e.consolidated)]));
    }
  }

  heading('5. Emissions by category (with method mix)');
  table(['Category', 'Scope', 'kg CO2e', 'Primary', 'Methods'], [maxW * 0.3, 36, 84, 52, maxW - maxW * 0.3 - 172],
    r.emissions.byCategory.map((c: any) => [
      `${c.category}${c.subcategory ? ` (${c.subcategory})` : ''}`,
      String(c.scope),
      num(c.emissions),
      c.dataSources ? `${c.dataSources.primarySharePercent}%` : '—',
      methodMix(c.methods, c.emissions),
    ]));

  heading('6. Data quality');
  draw(`High: ${r.dataQuality.high} · Medium: ${r.dataQuality.medium} · Low: ${r.dataQuality.low} · Unrated: ${r.dataQuality.unrated} (rated share ${r.dataQuality.ratedShare}%)`, { indent: 10, size: 9 });
  if (r.dataQuality.weightedDqScore) draw(`PCAF-style weighted DQ score: ${r.dataQuality.weightedDqScore} (1 best … 5 worst, emissions-weighted)`, { indent: 10, size: 9 });
  if (r.dataQuality.dataSources) draw(`Data source: ${r.dataQuality.dataSources.primarySharePercent}% primary (supplier-specific / measured) · ${r.dataQuality.dataSources.secondarySharePercent}% secondary. Primary-data share per category is tracked for CDP/SBTi and should rise over time.`, { indent: 10, size: 9 });
  draw(`Estimated (gap-filled) data: ${r.dataQuality.estimates.count} entries, ${r.dataQuality.estimates.emissionsShare}% of emissions`, { indent: 10, size: 9 });
  if (r.dataQuality.pedigree) draw(`GHG-Protocol pedigree (DQI): ${formatPedigreeLine(r.dataQuality.pedigree)}`, { indent: 10, size: 9 });

  heading('7. Completeness');
  const cm = r.completeness;
  draw(`Relevant: ${cm.relevantCount} · covered: ${cm.coveredCount} · documented exclusions: ${cm.excludedCount} · undocumented gaps: ${cm.gapCount} → ${cm.completenessPercent}% complete`, { indent: 10, size: 9 });
  if (!cm.screened) draw(cm.note, { indent: 10, size: 8, color: rgb(0.4, 0.4, 0.4) });
  (cm.gaps || []).forEach((g: any) => draw(`• Gap — Scope ${g.scope}: ${g.category}`, { indent: 18, size: 9 }));

  heading('8. Supplier engagement');
  const se = r.supplierEngagement;
  if (se.suppliers === 0) draw('No suppliers registered.', { indent: 10, size: 9 });
  else {
    draw(`Registered suppliers: ${se.suppliers} (integrated ${se.engagementStatuses.dataIntegrated}, received ${se.engagementStatuses.dataReceived}, awaiting ${se.engagementStatuses.awaitingResponse}, not engaged ${se.engagementStatuses.notEngaged})`, { indent: 10, size: 9 });
    draw(`Supplier-specific (primary) data: ${se.supplierSpecificData.entries} entries, ${num(se.supplierSpecificData.emissionsKgCo2e)} kg CO2e (${se.supplierSpecificData.emissionsShare}% of emissions)`, { indent: 10, size: 9 });
  }

  heading('9. Emission factor register');
  table(['Factor', 'Source', 'Year', 'Uses'], [maxW * 0.46, maxW * 0.3, 60, 50],
    r.factorRegister.map((f: any) => [f.name, f.source || '—', String(f.year || '—'), String(f.uses)]));

  heading('10. Exclusions register');
  if ((r.exclusions || []).length === 0) draw('No documented exclusions.', { indent: 10, size: 9 });
  r.exclusions.forEach((e: any) => draw(`• ${e.source}${e.scope ? ` (Scope ${e.scope})` : ''}: ${e.justification}${e.estimatedEmissions ? ` — est. ${num(e.estimatedEmissions)} kg CO2e/yr` : ''}`, { indent: 18, size: 9 }));

  heading('11. Base year & targets');
  if ((r.targets || []).length === 0) draw('No targets configured.', { indent: 10, size: 9 });
  r.targets.forEach((t: any) => draw(`• ${t.name}: ${t.targetReduction}% below ${t.baselineYear} baseline (${num(t.baselineEmissions)} kg CO2e) by ${t.targetYear}`, { indent: 18, size: 9 }));

  heading('12. Inventory controls');
  draw(`Calculations in period: ${r.inventoryControls.calculationsInPeriod} (${r.inventoryControls.lockedCalculations} locked/published, ${r.inventoryControls.verifiedCalculations} independently verified)`, { indent: 10, size: 9 });
  draw(`Audit-trail entries in period: ${r.inventoryControls.auditTrailEntriesInPeriod}`, { indent: 10, size: 9 });

  heading('13. Uncertainty statement');
  draw(r.uncertaintyStatement, { indent: 10, size: 9 });

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

// ---------------------------------------------------------------- DOCX (docx)

function dRow(cells: string[], header = false): TableRow {
  return new TableRow({
    children: cells.map(
      (c) =>
        new TableCell({
          width: { size: Math.floor(100 / cells.length), type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: c, bold: header, size: 18 })] })],
        })
    ),
  });
}

export async function renderInventoryDocx(r: any): Promise<Buffer> {
  const children: any[] = [];
  const h = (t: string) => children.push(new Paragraph({ text: t, heading: HeadingLevel.HEADING_2 }));
  const p = (t: string) => children.push(new Paragraph({ children: [new TextRun({ text: t, size: 20 })] }));
  const bullet = (t: string) => children.push(new Paragraph({ children: [new TextRun({ text: t, size: 20 })], bullet: { level: 0 } }));

  children.push(new Paragraph({ text: r.title, heading: HeadingLevel.TITLE }));
  children.push(new Paragraph({ children: [new TextRun({ text: `Generated ${day(r.generatedAt)} by ${r.generatedBy}`, italics: true, size: 18, color: '666666' })] }));

  h('1. Organizational boundary');
  p(`Organization: ${r.organization.name} (${r.organization.industry}, ${r.organization.country})`);
  p(`Consolidation approach: ${r.organization.consolidationApproach}`);
  (r.organization.facilities || []).forEach((f: any) => bullet(`${f.name} (${f.country}) — ownership ${f.ownershipPercent}%, operational control: ${f.operationalControl ? 'yes' : 'no'}`));

  h('2. Reporting period');
  p(`${day(r.reportingPeriod.start)} → ${day(r.reportingPeriod.end)}`);
  if (r.inventory && r.inventory.status && r.inventory.status !== 'none') {
    p(`Reporting-year inventory: ${r.inventory.reportingYear} — ${r.inventory.status}${r.inventory.isBaseYear ? ' (base year)' : ''}`);
  }

  h('3. Methodology');
  p(`Standard: ${r.methodology.standard}`);
  p(`GWP set: ${r.methodology.gwpSet} (${r.methodology.gwpSource})${r.methodology.gwpSetPinned ? ' — pinned (published year)' : ''}`);
  p(`Factor policy: ${r.methodology.factorPolicy}`);
  p(`Scope 2: ${r.methodology.scope2Note}`);

  h('4. Emissions by scope (kg CO2e)');
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      dRow(['Scope', 'kg CO2e'], true),
      dRow(['Scope 1 (direct)', num(r.emissions.byScope.scope1)]),
      dRow(['Scope 2 (purchased energy)', num(r.emissions.byScope.scope2)]),
      dRow(['Scope 3 (value chain)', num(r.emissions.byScope.scope3)]),
      dRow(['Total', num(r.emissions.byScope.total)]),
    ],
  }));
  p(`Biogenic CO2 (memo — excluded from the scope totals above): ${num(r.emissions.biogenicCO2 || 0)} kg CO2. Biomass-combustion CO2 is reported separately per the GHG Protocol; biomass CH4/N2O remain in Scope 1.`);
  p(`Scope 2 dual reporting — location-based: ${num(r.emissions.scope2Dual.locationBased)} · market-based: ${num(r.emissions.scope2Dual.marketBased)} kg CO2e`);
  if (r.emissions.perGas) {
    const pg = r.emissions.perGas;
    p(`Per-gas breakdown (Kyoto gases) — CO2e under ${pg.gwpSet}:`);
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        dRow(['Gas', 'Mass (kg)', 'CO2e (kg)'], true),
        dRow(['CO2 (fossil, in-scope)', num(pg.massKg.co2), num(pg.co2eByGas.co2)]),
        dRow(['CH4', num(pg.massKg.ch4), num(pg.co2eByGas.ch4)]),
        dRow(['N2O', num(pg.massKg.n2o), num(pg.co2eByGas.n2o)]),
        dRow(['Per-gas subtotal', '', num(pg.perGasSubtotalCo2e)]),
        dRow(['CO2e factors (gases not separated)', '', num(pg.co2eNotSeparated)]),
      ],
    }));
  }
  p(`Intensity metrics (${r.intensity.year}):`);
  if ((r.intensity.metrics || []).length) r.intensity.metrics.forEach((m: any) => bullet(`${m.label}: ${m.intensityKgCo2ePerUnit} kg CO2e per ${m.denominatorUnit} (denominator ${num(m.denominatorValue)} ${m.denominatorUnit})`));
  else p(r.intensity.note || 'No denominators recorded for the reporting year.');

  if (r.consolidation) {
    const c = r.consolidation;
    p(`Consolidation (organizational boundary) — approach: ${c.approach}, gross ${num(c.grossTotal)}, consolidated ${num(c.consolidatedTotal)} kg CO2e (${c.overallSharePercent}% of gross).`);
    if ((c.byEntity || []).some((e: any) => e.sharePercent < 100)) {
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          dRow(['Entity', 'Share %', 'Gross', 'Consolidated'], true),
          ...c.byEntity.map((e: any) => dRow([e.name, String(e.sharePercent), num(e.gross), num(e.consolidated)])),
        ],
      }));
    }
  }

  h('5. Emissions by category (with method mix)');
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      dRow(['Category', 'Scope', 'kg CO2e', 'Primary', 'Methods'], true),
      ...r.emissions.byCategory.map((c: any) => dRow([
        `${c.category}${c.subcategory ? ` (${c.subcategory})` : ''}`,
        String(c.scope),
        num(c.emissions),
        c.dataSources ? `${c.dataSources.primarySharePercent}%` : '—',
        methodMix(c.methods, c.emissions),
      ])),
    ],
  }));

  h('6. Data quality');
  p(`High: ${r.dataQuality.high} · Medium: ${r.dataQuality.medium} · Low: ${r.dataQuality.low} · Unrated: ${r.dataQuality.unrated} (rated share ${r.dataQuality.ratedShare}%)`);
  if (r.dataQuality.weightedDqScore) p(`PCAF-style weighted DQ score: ${r.dataQuality.weightedDqScore} (1 best … 5 worst, emissions-weighted)`);
  if (r.dataQuality.dataSources) p(`Data source: ${r.dataQuality.dataSources.primarySharePercent}% primary (supplier-specific / measured) · ${r.dataQuality.dataSources.secondarySharePercent}% secondary. Primary-data share per category is tracked for CDP/SBTi.`);
  p(`Estimated (gap-filled) data: ${r.dataQuality.estimates.count} entries, ${r.dataQuality.estimates.emissionsShare}% of emissions`);
  if (r.dataQuality.pedigree) p(`GHG-Protocol pedigree (DQI): ${formatPedigreeLine(r.dataQuality.pedigree)}`);

  h('7. Completeness');
  const cm = r.completeness;
  p(`Relevant: ${cm.relevantCount} · covered: ${cm.coveredCount} · documented exclusions: ${cm.excludedCount} · undocumented gaps: ${cm.gapCount} → ${cm.completenessPercent}% complete`);
  if (!cm.screened) p(cm.note);
  (cm.gaps || []).forEach((g: any) => bullet(`Gap — Scope ${g.scope}: ${g.category}`));

  h('8. Supplier engagement');
  const se = r.supplierEngagement;
  if (se.suppliers === 0) p('No suppliers registered.');
  else {
    p(`Registered suppliers: ${se.suppliers} (integrated ${se.engagementStatuses.dataIntegrated}, received ${se.engagementStatuses.dataReceived}, awaiting ${se.engagementStatuses.awaitingResponse}, not engaged ${se.engagementStatuses.notEngaged})`);
    p(`Supplier-specific (primary) data: ${se.supplierSpecificData.entries} entries, ${num(se.supplierSpecificData.emissionsKgCo2e)} kg CO2e (${se.supplierSpecificData.emissionsShare}% of emissions)`);
  }

  h('9. Emission factor register');
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      dRow(['Factor', 'Source', 'Year', 'Uses'], true),
      ...r.factorRegister.map((f: any) => dRow([f.name, f.source || '—', String(f.year || '—'), String(f.uses)])),
    ],
  }));

  h('10. Exclusions register');
  if ((r.exclusions || []).length === 0) p('No documented exclusions.');
  r.exclusions.forEach((e: any) => bullet(`${e.source}${e.scope ? ` (Scope ${e.scope})` : ''}: ${e.justification}${e.estimatedEmissions ? ` — est. ${num(e.estimatedEmissions)} kg CO2e/yr` : ''}`));

  h('11. Base year & targets');
  if ((r.targets || []).length === 0) p('No targets configured.');
  r.targets.forEach((t: any) => bullet(`${t.name}: ${t.targetReduction}% below ${t.baselineYear} baseline (${num(t.baselineEmissions)} kg CO2e) by ${t.targetYear}`));

  h('12. Inventory controls');
  p(`Calculations in period: ${r.inventoryControls.calculationsInPeriod} (${r.inventoryControls.lockedCalculations} locked/published, ${r.inventoryControls.verifiedCalculations} independently verified)`);
  p(`Audit-trail entries in period: ${r.inventoryControls.auditTrailEntriesInPeriod}`);

  h('13. Uncertainty statement');
  p(r.uncertaintyStatement);

  const doc = new Document({ sections: [{ children }] });
  return Buffer.from(await Packer.toBuffer(doc));
}

// ---------------------------------------------------------------- XLSX (exceljs)

export async function renderInventoryXlsx(r: any): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Carbonytics';
  wb.created = new Date();
  const headerStyle = (ws: ExcelJS.Worksheet) => {
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F2EA' } };
  };

  const summary = wb.addWorksheet('Summary');
  summary.columns = [{ header: 'Field', key: 'k', width: 32 }, { header: 'Value', key: 'v', width: 70 }];
  [
    ['Report', r.title],
    ['Generated at', r.generatedAt],
    ['Generated by', r.generatedBy],
    ['Organization', r.organization.name],
    ['Industry', r.organization.industry],
    ['Country', r.organization.country],
    ['Consolidation approach', r.organization.consolidationApproach],
    ['Facilities', (r.organization.facilities || []).length],
    ['Reporting period start', day(r.reportingPeriod.start)],
    ['Reporting period end', day(r.reportingPeriod.end)],
    ['Standard', r.methodology.standard],
    ['GWP set', `${r.methodology.gwpSet} (${r.methodology.gwpSource})`],
    ['Total emissions (kg CO2e)', r.emissions.byScope.total],
    ['Weighted DQ score', r.dataQuality.weightedDqScore ?? 'n/a'],
    ['Completeness %', r.completeness.completenessPercent],
    ['Locked calculations', r.inventoryControls.lockedCalculations],
    ['Verified calculations', r.inventoryControls.verifiedCalculations],
  ].forEach((row) => summary.addRow({ k: row[0], v: row[1] }));
  headerStyle(summary);

  const scope = wb.addWorksheet('Emissions by Scope');
  scope.columns = [{ header: 'Scope', key: 's', width: 34 }, { header: 'kg CO2e', key: 'e', width: 20 }];
  scope.addRow({ s: 'Scope 1 (direct)', e: r.emissions.byScope.scope1 });
  scope.addRow({ s: 'Scope 2 (purchased energy)', e: r.emissions.byScope.scope2 });
  scope.addRow({ s: 'Scope 3 (value chain)', e: r.emissions.byScope.scope3 });
  scope.addRow({ s: 'Total', e: r.emissions.byScope.total });
  scope.addRow({ s: 'Scope 2 location-based', e: r.emissions.scope2Dual.locationBased });
  scope.addRow({ s: 'Scope 2 market-based', e: r.emissions.scope2Dual.marketBased });
  scope.addRow({ s: 'Biogenic CO2 (memo, excl. from scope totals)', e: r.emissions.biogenicCO2 || 0 });
  headerStyle(scope);

  if (r.emissions.perGas) {
    const pg = r.emissions.perGas;
    const pgs = wb.addWorksheet('Per-Gas Breakdown');
    pgs.columns = [
      { header: 'Gas', key: 'g', width: 36 },
      { header: 'Mass (kg)', key: 'm', width: 18 },
      { header: `CO2e (kg, ${pg.gwpSet})`, key: 'e', width: 22 },
    ];
    pgs.addRow({ g: 'CO2 (fossil, in-scope)', m: pg.massKg.co2, e: pg.co2eByGas.co2 });
    pgs.addRow({ g: 'CH4', m: pg.massKg.ch4, e: pg.co2eByGas.ch4 });
    pgs.addRow({ g: 'N2O', m: pg.massKg.n2o, e: pg.co2eByGas.n2o });
    pgs.addRow({ g: 'Per-gas subtotal', m: '', e: pg.perGasSubtotalCo2e });
    pgs.addRow({ g: 'CO2e factors (gases not separated)', m: '', e: pg.co2eNotSeparated });
    pgs.addRow({ g: 'Biogenic CO2 (memo, excl. from scopes)', m: r.emissions.biogenicCO2 || 0, e: '' });
    headerStyle(pgs);
  }

  const cat = wb.addWorksheet('By Category');
  cat.columns = [
    { header: 'Category', key: 'c', width: 34 },
    { header: 'Scope', key: 's', width: 8 },
    { header: 'Subcategory', key: 'sub', width: 20 },
    { header: 'kg CO2e', key: 'e', width: 16 },
    { header: 'Entries', key: 'n', width: 10 },
    { header: 'Primary %', key: 'p', width: 11 },
    { header: 'Secondary %', key: 'sec', width: 12 },
    { header: 'Method mix', key: 'm', width: 50 },
  ];
  r.emissions.byCategory.forEach((c: any) => cat.addRow({ c: c.category, s: c.scope, sub: c.subcategory || '', e: c.emissions, n: c.entries, p: c.dataSources ? c.dataSources.primarySharePercent : 0, sec: c.dataSources ? c.dataSources.secondarySharePercent : 0, m: methodMix(c.methods, c.emissions) }));
  headerStyle(cat);

  if ((r.intensity.metrics || []).length) {
    const it = wb.addWorksheet('Intensity');
    it.columns = [
      { header: 'Metric', key: 'm', width: 24 },
      { header: 'Denominator', key: 'd', width: 18 },
      { header: 'Unit', key: 'u', width: 12 },
      { header: 'kg CO2e per unit', key: 'i', width: 20 },
    ];
    r.intensity.metrics.forEach((m: any) => it.addRow({ m: m.label, d: m.denominatorValue, u: m.denominatorUnit, i: m.intensityKgCo2ePerUnit }));
    headerStyle(it);
  }

  if (r.consolidation) {
    const co = wb.addWorksheet('Consolidation');
    co.columns = [
      { header: 'Entity', key: 'n', width: 34 },
      { header: 'Share %', key: 's', width: 12 },
      { header: 'Gross kg CO2e', key: 'g', width: 18 },
      { header: 'Consolidated kg CO2e', key: 'c', width: 22 },
    ];
    r.consolidation.byEntity.forEach((e: any) => co.addRow({ n: e.name, s: e.sharePercent, g: e.gross, c: e.consolidated }));
    co.addRow({ n: `TOTAL (${r.consolidation.approach})`, s: r.consolidation.overallSharePercent, g: r.consolidation.grossTotal, c: r.consolidation.consolidatedTotal });
    headerStyle(co);
  }

  const reg = wb.addWorksheet('Factor Register');
  reg.columns = [
    { header: 'Factor', key: 'n', width: 44 },
    { header: 'Source', key: 's', width: 30 },
    { header: 'Year', key: 'y', width: 10 },
    { header: 'Uses', key: 'u', width: 10 },
  ];
  r.factorRegister.forEach((f: any) => reg.addRow({ n: f.name, s: f.source || '', y: f.year || '', u: f.uses }));
  headerStyle(reg);

  const dq = wb.addWorksheet('Data Quality & Completeness');
  dq.columns = [{ header: 'Field', key: 'k', width: 36 }, { header: 'Value', key: 'v', width: 24 }];
  [
    ['High-quality entries', r.dataQuality.high],
    ['Medium-quality entries', r.dataQuality.medium],
    ['Low-quality entries', r.dataQuality.low],
    ['Unrated entries', r.dataQuality.unrated],
    ['Rated share %', r.dataQuality.ratedShare],
    ['Weighted DQ score (PCAF 1-5)', r.dataQuality.weightedDqScore ?? 'n/a'],
    ['Primary data share %', r.dataQuality.dataSources?.primarySharePercent ?? 'n/a'],
    ['Secondary data share %', r.dataQuality.dataSources?.secondarySharePercent ?? 'n/a'],
    ['Estimated entries', r.dataQuality.estimates.count],
    ['Estimated emissions share %', r.dataQuality.estimates.emissionsShare],
    ['GHG-Protocol pedigree overall (DQI 1 best-5 worst)', r.dataQuality.pedigree?.overall ?? 'n/a'],
    ['Pedigree technological', r.dataQuality.pedigree?.technological ?? 'n/a'],
    ['Pedigree temporal', r.dataQuality.pedigree?.temporal ?? 'n/a'],
    ['Pedigree geographical', r.dataQuality.pedigree?.geographical ?? 'n/a'],
    ['Pedigree completeness', r.dataQuality.pedigree?.completeness ?? 'n/a'],
    ['Pedigree reliability', r.dataQuality.pedigree?.reliability ?? 'n/a'],
    ['Relevant categories', r.completeness.relevantCount],
    ['Covered categories', r.completeness.coveredCount],
    ['Documented exclusions', r.completeness.excludedCount],
    ['Undocumented gaps', r.completeness.gapCount],
    ['Completeness %', r.completeness.completenessPercent],
  ].forEach((row) => dq.addRow({ k: row[0], v: row[1] }));
  headerStyle(dq);

  if ((r.exclusions || []).length) {
    const ex = wb.addWorksheet('Exclusions');
    ex.columns = [
      { header: 'Source', key: 's', width: 30 },
      { header: 'Scope', key: 'sc', width: 10 },
      { header: 'Justification', key: 'j', width: 60 },
      { header: 'Est. kg CO2e/yr', key: 'e', width: 18 },
    ];
    r.exclusions.forEach((e: any) => ex.addRow({ s: e.source, sc: e.scope || '', j: e.justification, e: e.estimatedEmissions || '' }));
    headerStyle(ex);
  }

  if ((r.targets || []).length) {
    const tg = wb.addWorksheet('Targets');
    tg.columns = [
      { header: 'Target', key: 'n', width: 30 },
      { header: 'Baseline year', key: 'by', width: 14 },
      { header: 'Baseline kg CO2e', key: 'be', width: 18 },
      { header: 'Reduction %', key: 'r', width: 14 },
      { header: 'Target year', key: 'ty', width: 14 },
    ];
    r.targets.forEach((t: any) => tg.addRow({ n: t.name, by: t.baselineYear, be: t.baselineEmissions, r: t.targetReduction, ty: t.targetYear }));
    headerStyle(tg);
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
