import ExcelJS from 'exceljs';
import { BrandedPdf, docxKit, THEMES } from './reportKit';
import { formatPedigreeLine } from './pedigree';

/**
 * Binary renderers for the GHG inventory report (PDF / DOCX / XLSX). The PDF and
 * DOCX are built on the shared branded reportKit (cover with the Carbonytics
 * logo, running header/footer, accent section headings, styled tables — §49);
 * the XLSX is a multi-sheet workbook (exceljs). Each takes the object produced by
 * buildGHGInventoryReport (the same spine as the markdown renderer).
 */

const num = (v: number) => (typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(v ?? ''));
const day = (iso: string) => String(iso || '').split('T')[0];
const methodMix = (methods: Record<string, number>, total: number) =>
  Object.entries(methods || {})
    .map(([m, v]) => `${m}: ${Math.round(((v as number) / Math.max(total, 0.01)) * 100)}%`)
    .join(', ');

const ghgMeta = (r: any): [string, string][] => [
  ['Organization', `${r.organization.name} (${r.organization.industry}, ${r.organization.country})`],
  ['Reporting period', `${day(r.reportingPeriod.start)} to ${day(r.reportingPeriod.end)}`],
  ['Consolidation', String(r.organization.consolidationApproach)],
  ['GWP set', `${r.methodology.gwpSet} (${r.methodology.gwpSource})`],
  ['Total emissions', `${num(r.emissions.byScope.total)} kg CO2e`],
  ['Generated', `${day(r.generatedAt)} by ${r.generatedBy}`],
];

// ---------------------------------------------------------------- PDF

export async function renderInventoryPdf(r: any): Promise<Buffer> {
  const pdf = await BrandedPdf.create(THEMES.carbonytics, 'GHG Inventory Report');
  pdf.cover({
    title: r.title,
    subtitle: 'GHG Protocol Corporate Standard / ISO 14064-1 inventory',
    meta: ghgMeta(r),
    note: 'Figures in kg CO2e unless noted. Biogenic CO2 is reported as a memo item outside the scope totals.',
  });

  pdf.heading('1. Organizational boundary');
  pdf.kv('Organization', `${r.organization.name} (${r.organization.industry}, ${r.organization.country})`);
  pdf.kv('Consolidation approach', r.organization.consolidationApproach);
  (r.organization.facilities || []).forEach((f: any) =>
    pdf.bullet(`${f.name} (${f.country}) - ownership ${f.ownershipPercent}%, operational control: ${f.operationalControl ? 'yes' : 'no'}`)
  );

  pdf.heading('2. Reporting period');
  pdf.para(`${day(r.reportingPeriod.start)} to ${day(r.reportingPeriod.end)}`, { indent: 8 });
  if (r.inventory && r.inventory.status && r.inventory.status !== 'none')
    pdf.note(`Reporting-year inventory: ${r.inventory.reportingYear} - ${r.inventory.status}${r.inventory.isBaseYear ? ' (base year)' : ''}`);

  pdf.heading('3. Methodology');
  pdf.kv('Standard', r.methodology.standard);
  pdf.kv('GWP set', `${r.methodology.gwpSet} (${r.methodology.gwpSource})${r.methodology.gwpSetPinned ? ' - pinned (published year)' : ''}`);
  pdf.kv('Factor policy', r.methodology.factorPolicy);
  pdf.kv('Scope 2', r.methodology.scope2Note);

  pdf.heading('4. Emissions by scope (kg CO2e)');
  pdf.table(['Scope', 'kg CO2e'], [pdf.maxW - 140, 140], [
    ['Scope 1 (direct)', num(r.emissions.byScope.scope1)],
    ['Scope 2 (purchased energy)', num(r.emissions.byScope.scope2)],
    ['Scope 3 (value chain)', num(r.emissions.byScope.scope3)],
    ['Total', num(r.emissions.byScope.total)],
  ]);
  pdf.note(`Biogenic CO2 (memo, excluded from the scope totals): ${num(r.emissions.biogenicCO2 || 0)} kg CO2. Biomass CH4/N2O remain in Scope 1.`);
  pdf.kv('Scope 2 dual reporting', `location-based ${num(r.emissions.scope2Dual.locationBased)} · market-based ${num(r.emissions.scope2Dual.marketBased)} kg CO2e`);
  if (r.emissions.perGas) {
    const pg = r.emissions.perGas;
    pdf.subheading(`Per-gas breakdown (Kyoto gases) - CO2e under ${pg.gwpSet}`);
    pdf.table(['Gas', 'Mass (kg)', 'CO2e (kg)'], [pdf.maxW - 220, 110, 110], [
      ['CO2 (fossil, in-scope)', num(pg.massKg.co2), num(pg.co2eByGas.co2)],
      ['CH4', num(pg.massKg.ch4), num(pg.co2eByGas.ch4)],
      ['N2O', num(pg.massKg.n2o), num(pg.co2eByGas.n2o)],
      ['Per-gas subtotal', '', num(pg.perGasSubtotalCo2e)],
      ['CO2e factors (gases not separated)', '', num(pg.co2eNotSeparated)],
    ]);
    pdf.note(pg.note);
  }
  pdf.subheading(`Intensity metrics (${r.intensity.year})`);
  if ((r.intensity.metrics || []).length)
    r.intensity.metrics.forEach((m: any) => pdf.bullet(`${m.label}: ${m.intensityKgCo2ePerUnit} kg CO2e per ${m.denominatorUnit} (denominator ${num(m.denominatorValue)} ${m.denominatorUnit})`));
  else pdf.note(r.intensity.note || 'No denominators recorded for the reporting year.');
  if (r.consolidation) {
    const c = r.consolidation;
    pdf.subheading('Consolidation (organizational boundary)');
    pdf.para(`Approach: ${c.approach} · Gross: ${num(c.grossTotal)} · Consolidated: ${num(c.consolidatedTotal)} kg CO2e (${c.overallSharePercent}% of gross)`, { indent: 8 });
    if ((c.byEntity || []).some((e: any) => e.sharePercent < 100))
      pdf.table(['Entity', 'Share %', 'Gross', 'Consolidated'], [pdf.maxW * 0.4, 70, 90, pdf.maxW - pdf.maxW * 0.4 - 160],
        c.byEntity.map((e: any) => [e.name, String(e.sharePercent), num(e.gross), num(e.consolidated)]));
  }

  pdf.heading('5. Emissions by category (method mix)');
  pdf.table(['Category', 'Scope', 'kg CO2e', 'Primary', 'Methods'], [pdf.maxW * 0.3, 36, 84, 52, pdf.maxW - pdf.maxW * 0.3 - 172],
    r.emissions.byCategory.map((c: any) => [
      `${c.category}${c.subcategory ? ` (${c.subcategory})` : ''}`,
      String(c.scope),
      num(c.emissions),
      c.dataSources ? `${c.dataSources.primarySharePercent}%` : '-',
      methodMix(c.methods, c.emissions),
    ]));

  pdf.heading('6. Data quality');
  pdf.para(`High: ${r.dataQuality.high} · Medium: ${r.dataQuality.medium} · Low: ${r.dataQuality.low} · Unrated: ${r.dataQuality.unrated} (rated share ${r.dataQuality.ratedShare}%)`, { indent: 8 });
  if (r.dataQuality.weightedDqScore) pdf.kv('PCAF weighted DQ', `${r.dataQuality.weightedDqScore} (1 best .. 5 worst, emissions-weighted)`);
  if (r.dataQuality.dataSources) pdf.para(`Data source: ${r.dataQuality.dataSources.primarySharePercent}% primary (supplier-specific / measured) · ${r.dataQuality.dataSources.secondarySharePercent}% secondary.`, { indent: 8 });
  pdf.para(`Estimated (gap-filled) data: ${r.dataQuality.estimates.count} entries, ${r.dataQuality.estimates.emissionsShare}% of emissions`, { indent: 8 });
  if (r.dataQuality.pedigree) pdf.kv('GHG-Protocol pedigree (DQI)', formatPedigreeLine(r.dataQuality.pedigree));

  pdf.heading('7. Completeness');
  const cm = r.completeness;
  pdf.para(`Relevant: ${cm.relevantCount} · covered: ${cm.coveredCount} · documented exclusions: ${cm.excludedCount} · undocumented gaps: ${cm.gapCount} -> ${cm.completenessPercent}% complete`, { indent: 8 });
  if (!cm.screened) pdf.note(cm.note);
  (cm.gaps || []).forEach((g: any) => pdf.bullet(`Gap - Scope ${g.scope}: ${g.category}`));

  pdf.heading('8. Supplier engagement');
  const se = r.supplierEngagement;
  if (se.suppliers === 0) pdf.para('No suppliers registered.', { indent: 8 });
  else {
    pdf.para(`Registered suppliers: ${se.suppliers} (integrated ${se.engagementStatuses.dataIntegrated}, received ${se.engagementStatuses.dataReceived}, awaiting ${se.engagementStatuses.awaitingResponse}, not engaged ${se.engagementStatuses.notEngaged})`, { indent: 8 });
    pdf.para(`Supplier-specific (primary) data: ${se.supplierSpecificData.entries} entries, ${num(se.supplierSpecificData.emissionsKgCo2e)} kg CO2e (${se.supplierSpecificData.emissionsShare}% of emissions)`, { indent: 8 });
  }

  pdf.heading('9. Emission factor register');
  pdf.table(['Factor', 'Source', 'Year', 'Uses'], [pdf.maxW * 0.46, pdf.maxW * 0.3, 60, 50],
    r.factorRegister.map((f: any) => [f.name, f.source || '-', String(f.year || '-'), String(f.uses)]));

  pdf.heading('10. Exclusions register');
  if ((r.exclusions || []).length === 0) pdf.para('No documented exclusions.', { indent: 8 });
  (r.exclusions || []).forEach((e: any) => pdf.bullet(`${e.source}${e.scope ? ` (Scope ${e.scope})` : ''}: ${e.justification}${e.estimatedEmissions ? ` - est. ${num(e.estimatedEmissions)} kg CO2e/yr` : ''}`));

  pdf.heading('11. Base year & targets');
  if ((r.targets || []).length === 0) pdf.para('No targets configured.', { indent: 8 });
  (r.targets || []).forEach((t: any) => pdf.bullet(`${t.name}: ${t.targetReduction}% below ${t.baselineYear} baseline (${num(t.baselineEmissions)} kg CO2e) by ${t.targetYear}`));

  pdf.heading('12. Inventory controls');
  pdf.para(`Calculations in period: ${r.inventoryControls.calculationsInPeriod} (${r.inventoryControls.lockedCalculations} locked/published, ${r.inventoryControls.verifiedCalculations} independently verified)`, { indent: 8 });
  pdf.para(`Audit-trail entries in period: ${r.inventoryControls.auditTrailEntriesInPeriod}`, { indent: 8 });

  pdf.heading('13. Uncertainty statement');
  pdf.para(r.uncertaintyStatement, { indent: 8 });
  return pdf.finish();
}

// ---------------------------------------------------------------- DOCX

export async function renderInventoryDocx(r: any): Promise<Buffer> {
  const k = docxKit(THEMES.carbonytics, 'GHG Inventory Report');
  const body: any[] = [
    k.h('1. Organizational boundary'),
    k.p(`Organization: ${r.organization.name} (${r.organization.industry}, ${r.organization.country})`),
    k.p(`Consolidation approach: ${r.organization.consolidationApproach}`),
    ...(r.organization.facilities || []).map((f: any) => k.bullet(`${f.name} (${f.country}) - ownership ${f.ownershipPercent}%, operational control: ${f.operationalControl ? 'yes' : 'no'}`)),
    k.h('2. Reporting period'),
    k.p(`${day(r.reportingPeriod.start)} to ${day(r.reportingPeriod.end)}`),
  ];
  if (r.inventory && r.inventory.status && r.inventory.status !== 'none')
    body.push(k.p(`Reporting-year inventory: ${r.inventory.reportingYear} - ${r.inventory.status}${r.inventory.isBaseYear ? ' (base year)' : ''}`));
  body.push(
    k.h('3. Methodology'),
    k.p(`Standard: ${r.methodology.standard}`),
    k.p(`GWP set: ${r.methodology.gwpSet} (${r.methodology.gwpSource})${r.methodology.gwpSetPinned ? ' - pinned (published year)' : ''}`, { bold: true }),
    k.p(`Factor policy: ${r.methodology.factorPolicy}`),
    k.p(`Scope 2: ${r.methodology.scope2Note}`),
    k.h('4. Emissions by scope (kg CO2e)'),
    k.table(['Scope', 'kg CO2e'], [
      ['Scope 1 (direct)', num(r.emissions.byScope.scope1)],
      ['Scope 2 (purchased energy)', num(r.emissions.byScope.scope2)],
      ['Scope 3 (value chain)', num(r.emissions.byScope.scope3)],
      ['Total', num(r.emissions.byScope.total)],
    ]),
    k.p(`Biogenic CO2 (memo, excluded from the scope totals): ${num(r.emissions.biogenicCO2 || 0)} kg CO2. Biomass CH4/N2O remain in Scope 1.`),
    k.p(`Scope 2 dual reporting - location-based: ${num(r.emissions.scope2Dual.locationBased)} · market-based: ${num(r.emissions.scope2Dual.marketBased)} kg CO2e`)
  );
  if (r.emissions.perGas) {
    const pg = r.emissions.perGas;
    body.push(k.sub(`Per-gas breakdown - CO2e under ${pg.gwpSet}`));
    body.push(k.table(['Gas', 'Mass (kg)', 'CO2e (kg)'], [
      ['CO2 (fossil, in-scope)', num(pg.massKg.co2), num(pg.co2eByGas.co2)],
      ['CH4', num(pg.massKg.ch4), num(pg.co2eByGas.ch4)],
      ['N2O', num(pg.massKg.n2o), num(pg.co2eByGas.n2o)],
      ['Per-gas subtotal', '', num(pg.perGasSubtotalCo2e)],
      ['CO2e factors (gases not separated)', '', num(pg.co2eNotSeparated)],
    ]));
  }
  body.push(k.sub(`Intensity metrics (${r.intensity.year})`));
  if ((r.intensity.metrics || []).length)
    r.intensity.metrics.forEach((m: any) => body.push(k.bullet(`${m.label}: ${m.intensityKgCo2ePerUnit} kg CO2e per ${m.denominatorUnit} (denominator ${num(m.denominatorValue)} ${m.denominatorUnit})`)));
  else body.push(k.p(r.intensity.note || 'No denominators recorded for the reporting year.'));
  if (r.consolidation) {
    const c = r.consolidation;
    body.push(k.p(`Consolidation (organizational boundary) - approach: ${c.approach}, gross ${num(c.grossTotal)}, consolidated ${num(c.consolidatedTotal)} kg CO2e (${c.overallSharePercent}% of gross).`));
    if ((c.byEntity || []).some((e: any) => e.sharePercent < 100))
      body.push(k.table(['Entity', 'Share %', 'Gross', 'Consolidated'], c.byEntity.map((e: any) => [e.name, String(e.sharePercent), num(e.gross), num(e.consolidated)])));
  }
  body.push(
    k.h('5. Emissions by category (method mix)'),
    k.table(['Category', 'Scope', 'kg CO2e', 'Primary', 'Methods'], r.emissions.byCategory.map((c: any) => [
      `${c.category}${c.subcategory ? ` (${c.subcategory})` : ''}`,
      String(c.scope),
      num(c.emissions),
      c.dataSources ? `${c.dataSources.primarySharePercent}%` : '-',
      methodMix(c.methods, c.emissions),
    ])),
    k.h('6. Data quality'),
    k.p(`High: ${r.dataQuality.high} · Medium: ${r.dataQuality.medium} · Low: ${r.dataQuality.low} · Unrated: ${r.dataQuality.unrated} (rated share ${r.dataQuality.ratedShare}%)`)
  );
  if (r.dataQuality.weightedDqScore) body.push(k.p(`PCAF weighted DQ score: ${r.dataQuality.weightedDqScore} (1 best .. 5 worst, emissions-weighted)`, { bold: true }));
  if (r.dataQuality.dataSources) body.push(k.p(`Data source: ${r.dataQuality.dataSources.primarySharePercent}% primary (supplier-specific / measured) · ${r.dataQuality.dataSources.secondarySharePercent}% secondary.`));
  body.push(k.p(`Estimated (gap-filled) data: ${r.dataQuality.estimates.count} entries, ${r.dataQuality.estimates.emissionsShare}% of emissions`));
  if (r.dataQuality.pedigree) body.push(k.p(`GHG-Protocol pedigree (DQI): ${formatPedigreeLine(r.dataQuality.pedigree)}`));
  const cm = r.completeness;
  body.push(
    k.h('7. Completeness'),
    k.p(`Relevant: ${cm.relevantCount} · covered: ${cm.coveredCount} · documented exclusions: ${cm.excludedCount} · undocumented gaps: ${cm.gapCount} -> ${cm.completenessPercent}% complete`)
  );
  if (!cm.screened) body.push(k.p(cm.note));
  (cm.gaps || []).forEach((g: any) => body.push(k.bullet(`Gap - Scope ${g.scope}: ${g.category}`)));
  const se = r.supplierEngagement;
  body.push(k.h('8. Supplier engagement'));
  if (se.suppliers === 0) body.push(k.p('No suppliers registered.'));
  else {
    body.push(k.p(`Registered suppliers: ${se.suppliers} (integrated ${se.engagementStatuses.dataIntegrated}, received ${se.engagementStatuses.dataReceived}, awaiting ${se.engagementStatuses.awaitingResponse}, not engaged ${se.engagementStatuses.notEngaged})`));
    body.push(k.p(`Supplier-specific (primary) data: ${se.supplierSpecificData.entries} entries, ${num(se.supplierSpecificData.emissionsKgCo2e)} kg CO2e (${se.supplierSpecificData.emissionsShare}% of emissions)`));
  }
  body.push(
    k.h('9. Emission factor register'),
    k.table(['Factor', 'Source', 'Year', 'Uses'], r.factorRegister.map((f: any) => [f.name, f.source || '-', String(f.year || '-'), String(f.uses)])),
    k.h('10. Exclusions register')
  );
  if ((r.exclusions || []).length === 0) body.push(k.p('No documented exclusions.'));
  (r.exclusions || []).forEach((e: any) => body.push(k.bullet(`${e.source}${e.scope ? ` (Scope ${e.scope})` : ''}: ${e.justification}${e.estimatedEmissions ? ` - est. ${num(e.estimatedEmissions)} kg CO2e/yr` : ''}`)));
  body.push(k.h('11. Base year & targets'));
  if ((r.targets || []).length === 0) body.push(k.p('No targets configured.'));
  (r.targets || []).forEach((t: any) => body.push(k.bullet(`${t.name}: ${t.targetReduction}% below ${t.baselineYear} baseline (${num(t.baselineEmissions)} kg CO2e) by ${t.targetYear}`)));
  body.push(
    k.h('12. Inventory controls'),
    k.p(`Calculations in period: ${r.inventoryControls.calculationsInPeriod} (${r.inventoryControls.lockedCalculations} locked/published, ${r.inventoryControls.verifiedCalculations} independently verified)`),
    k.p(`Audit-trail entries in period: ${r.inventoryControls.auditTrailEntriesInPeriod}`),
    k.h('13. Uncertainty statement'),
    k.p(r.uncertaintyStatement)
  );
  return k.build({ title: r.title, subtitle: 'GHG Protocol Corporate Standard / ISO 14064-1 inventory', meta: ghgMeta(r), note: 'Figures in kg CO2e unless noted.' }, body);
}

// ---------------------------------------------------------------- XLSX (exceljs)

export async function renderInventoryXlsx(r: any): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Carbonytics';
  wb.created = new Date();
  const headerStyle = (ws: ExcelJS.Worksheet) => {
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F945E' } };
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
