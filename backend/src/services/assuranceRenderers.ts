/**
 * Branded PDF / DOCX / XLSX renderers for the Assurance Package and the
 * Inventory Management Plan (§49). Both are internal Carbonytics documents
 * (Carbonytics green theme). The assurance package is the verifier sampling
 * bundle — its activity-data register is the natural Excel deliverable; PDF/DOCX
 * give a readable summary. The IMP is a narrative process document (PDF/DOCX).
 */
import ExcelJS from 'exceljs';
import { BrandedPdf, docxKit, THEMES, fmtDay } from './reportKit';
import { formatPedigreeLine } from './pedigree';

const num = (v: any) => (typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(v ?? ''));
const txt = (v: any) => (v === undefined || v === null ? '' : String(v));

// ----------------------------------------------------------------- Assurance

const assuranceMeta = (pkg: any): [string, string][] => {
  const r = pkg.inventoryReport;
  const ev = pkg.evidenceSummary;
  return [
    ['Organization', `${r.organization.name} (${r.organization.country})`],
    ['Reporting period', `${fmtDay(r.reportingPeriod.start)} to ${fmtDay(r.reportingPeriod.end)}`],
    ['Register lines', String(ev.dataLinesTotal)],
    ['Evidence coverage', `${ev.coveragePercent}% (${ev.dataLinesWithEvidence}/${ev.dataLinesTotal} lines, ${ev.totalAttachments} files)`],
    ['Generated', `${fmtDay(r.generatedAt)} by ${r.generatedBy}`],
  ];
};

export async function renderAssurancePdf(pkg: any): Promise<Buffer> {
  const r = pkg.inventoryReport;
  const pdf = await BrandedPdf.create(THEMES.carbonytics, 'Assurance Package');
  pdf.cover({
    title: `Assurance Package - ${r.organization.name}`,
    subtitle: 'Verifier sampling bundle - ISO 14064-3 / ISSA 5000 readiness',
    meta: assuranceMeta(pkg),
    note: pkg.note,
  });

  pdf.heading('Emissions summary');
  pdf.table(['Scope', 'kg CO2e'], [pdf.maxW - 140, 140], [
    ['Scope 1 (direct)', num(r.emissions.byScope.scope1)],
    ['Scope 2 (purchased energy)', num(r.emissions.byScope.scope2)],
    ['Scope 3 (value chain)', num(r.emissions.byScope.scope3)],
    ['Total', num(r.emissions.byScope.total)],
  ]);
  pdf.kv('Weighted data-quality score', `${r.dataQuality.weightedDqScore ?? '-'} / 5 (1 best)`);
  if (r.dataQuality.pedigree) pdf.kv('GHG-Protocol pedigree (DQI)', formatPedigreeLine(r.dataQuality.pedigree));

  pdf.heading('Evidence summary');
  const ev = pkg.evidenceSummary;
  pdf.kv('Total attachments', String(ev.totalAttachments));
  pdf.kv('Data lines with evidence', `${ev.dataLinesWithEvidence} of ${ev.dataLinesTotal} (${ev.coveragePercent}%)`);

  pdf.heading('Activity-data register');
  pdf.note('The full register with every provenance column is in the Excel export; this is a readable summary.');
  pdf.table(
    ['Category (Scope)', 'Activity', 'Factor', 'Method', 'DQ', 'kg CO2e', 'Ev'],
    [pdf.maxW * 0.2, pdf.maxW * 0.13, pdf.maxW * 0.22, pdf.maxW * 0.14, 26, pdf.maxW * 0.12, 24],
    (pkg.activityRegister || []).map((e: any) => [
      `${txt(e.category)} (S${txt(e.scope)})`,
      `${num(e.value)} ${txt(e.unit)}`,
      txt(e.factorName) || '-',
      txt(e.method) || '-',
      txt(e.dqScore) || '-',
      num(e.emissions),
      String(e.evidenceCount || 0),
    ])
  );

  pdf.heading('Publication snapshots');
  if (!(pkg.snapshots || []).length) pdf.para('No publication snapshots recorded.', { indent: 8 });
  else pdf.table(['Version', 'Reason', 'By', 'Date'], [60, pdf.maxW * 0.4, pdf.maxW * 0.3, pdf.maxW - 60 - pdf.maxW * 0.7],
    pkg.snapshots.slice(0, 60).map((s: any) => [txt(s.version), txt(s.reason) || '-', txt(s.createdBy) || '-', fmtDay(s.createdAt)]));

  pdf.heading('Audit-trail extract');
  const audit = pkg.auditTrail || [];
  pdf.note(`${audit.length} entries in period (most recent first; capped at 500). Showing up to 50 here; full extract in the Excel export.`);
  pdf.table(['Date', 'Action', 'Entity'], [110, pdf.maxW * 0.45, pdf.maxW - 110 - pdf.maxW * 0.45],
    audit.slice(0, 50).map((a: any) => [fmtDay(a.createdAt), txt(a.action), txt(a.entityType) || txt(a.entity) || '-']));
  return pdf.finish();
}

export async function renderAssuranceDocx(pkg: any): Promise<Buffer> {
  const r = pkg.inventoryReport;
  const ev = pkg.evidenceSummary;
  const k = docxKit(THEMES.carbonytics, 'Assurance Package');
  const body: any[] = [
    k.h('Emissions summary'),
    k.table(['Scope', 'kg CO2e'], [
      ['Scope 1 (direct)', num(r.emissions.byScope.scope1)],
      ['Scope 2 (purchased energy)', num(r.emissions.byScope.scope2)],
      ['Scope 3 (value chain)', num(r.emissions.byScope.scope3)],
      ['Total', num(r.emissions.byScope.total)],
    ]),
    k.p(`Weighted data-quality score: ${r.dataQuality.weightedDqScore ?? '-'} / 5 (1 best)`),
  ];
  if (r.dataQuality.pedigree) body.push(k.p(`GHG-Protocol pedigree (DQI): ${formatPedigreeLine(r.dataQuality.pedigree)}`));
  body.push(
    k.h('Evidence summary'),
    k.p(`Total attachments: ${ev.totalAttachments}`),
    k.p(`Data lines with evidence: ${ev.dataLinesWithEvidence} of ${ev.dataLinesTotal} (${ev.coveragePercent}%)`),
    k.h('Activity-data register'),
    k.p('The full register with every provenance column is in the Excel export; this is a readable summary.', { italics: true, color: '777777', size: 16 }),
    k.table(['Category (Scope)', 'Activity', 'Factor', 'Method', 'DQ', 'kg CO2e', 'Ev'],
      (pkg.activityRegister || []).map((e: any) => [`${txt(e.category)} (S${txt(e.scope)})`, `${num(e.value)} ${txt(e.unit)}`, txt(e.factorName) || '-', txt(e.method) || '-', txt(e.dqScore) || '-', num(e.emissions), String(e.evidenceCount || 0)])),
    k.h('Publication snapshots'),
  );
  if (!(pkg.snapshots || []).length) body.push(k.p('No publication snapshots recorded.'));
  else body.push(k.table(['Version', 'Reason', 'By', 'Date'], pkg.snapshots.slice(0, 80).map((s: any) => [txt(s.version), txt(s.reason) || '-', txt(s.createdBy) || '-', fmtDay(s.createdAt)])));
  body.push(k.h('Audit-trail extract'), k.p(`${(pkg.auditTrail || []).length} entries in period (most recent first; capped at 500).`, { italics: true, color: '777777', size: 16 }));
  body.push(k.table(['Date', 'Action', 'Entity'], (pkg.auditTrail || []).slice(0, 80).map((a: any) => [fmtDay(a.createdAt), txt(a.action), txt(a.entityType) || txt(a.entity) || '-'])));
  return k.build({ title: `Assurance Package - ${r.organization.name}`, subtitle: 'Verifier sampling bundle - ISO 14064-3 / ISSA 5000 readiness', meta: assuranceMeta(pkg), note: pkg.note }, body);
}

export async function renderAssuranceXlsx(pkg: any): Promise<Buffer> {
  const r = pkg.inventoryReport;
  const ev = pkg.evidenceSummary;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Carbonytics';
  const argb = 'FF1F945E';
  const head = (ws: ExcelJS.Worksheet) => { ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }; };

  const sum = wb.addWorksheet('Summary');
  sum.columns = [{ header: 'Field', key: 'k', width: 36 }, { header: 'Value', key: 'v', width: 60 }];
  [
    ['Report', `Assurance Package - ${r.organization.name}`],
    ['Reporting period', `${fmtDay(r.reportingPeriod.start)} to ${fmtDay(r.reportingPeriod.end)}`],
    ['Total emissions (kg CO2e)', r.emissions.byScope.total],
    ['Scope 1 / 2 / 3 (kg CO2e)', `${r.emissions.byScope.scope1} / ${r.emissions.byScope.scope2} / ${r.emissions.byScope.scope3}`],
    ['Weighted DQ (1 best..5)', r.dataQuality.weightedDqScore ?? 'n/a'],
    ['Register lines', ev.dataLinesTotal],
    ['Lines with evidence', ev.dataLinesWithEvidence],
    ['Evidence coverage %', ev.coveragePercent],
    ['Total attachments', ev.totalAttachments],
  ].forEach((row) => sum.addRow({ k: row[0], v: row[1] }));
  head(sum);

  const reg = wb.addWorksheet('Activity Register');
  reg.columns = [
    { header: 'Calculation', key: 'calc', width: 26 }, { header: 'Status', key: 'st', width: 11 },
    { header: 'Category', key: 'cat', width: 22 }, { header: 'Scope', key: 'sc', width: 7 },
    { header: 'Value', key: 'val', width: 12 }, { header: 'Unit', key: 'un', width: 10 },
    { header: 'Factor', key: 'fac', width: 28 }, { header: 'Factor source', key: 'fs', width: 20 },
    { header: 'Factor year', key: 'fy', width: 11 }, { header: 'Method', key: 'me', width: 18 },
    { header: 'GWP set', key: 'gw', width: 10 }, { header: 'DQ', key: 'dq', width: 6 },
    { header: 'Estimate', key: 'es', width: 9 }, { header: 'Supplier', key: 'su', width: 18 },
    { header: 'kg CO2e', key: 'em', width: 14 }, { header: 'Evidence files', key: 'ev', width: 13 },
  ];
  (pkg.activityRegister || []).forEach((e: any) => reg.addRow({
    calc: txt(e.calculationTitle), st: txt(e.status), cat: txt(e.category), sc: txt(e.scope), val: e.value, un: txt(e.unit),
    fac: txt(e.factorName), fs: txt(e.factorSource), fy: txt(e.factorYear), me: txt(e.method), gw: txt(e.gwpSet),
    dq: txt(e.dqScore), es: e.isEstimate ? 'yes' : '', su: txt(e.supplierName), em: e.emissions, ev: e.evidenceCount || 0,
  }));
  head(reg);

  const evs = wb.addWorksheet('Evidence');
  evs.columns = [{ header: 'Calculation', key: 'c', width: 26 }, { header: 'Line', key: 'l', width: 7 }, { header: 'Filename', key: 'f', width: 30 }, { header: 'Size (B)', key: 's', width: 12 }, { header: 'SHA-256', key: 'h', width: 50 }, { header: 'Uploaded by', key: 'u', width: 26 }];
  (pkg.activityRegister || []).forEach((e: any) => (e.evidence || []).forEach((v: any) => evs.addRow({ c: txt(e.calculationTitle), l: e.entryIndex, f: txt(v.filename), s: v.size, h: txt(v.sha256), u: txt(v.uploadedByEmail) })));
  head(evs);

  const snap = wb.addWorksheet('Snapshots');
  snap.columns = [{ header: 'Version', key: 'v', width: 10 }, { header: 'Reason', key: 'r', width: 30 }, { header: 'Comment', key: 'c', width: 40 }, { header: 'By', key: 'b', width: 26 }, { header: 'Date', key: 'd', width: 14 }];
  (pkg.snapshots || []).forEach((s: any) => snap.addRow({ v: txt(s.version), r: txt(s.reason), c: txt(s.comment), b: txt(s.createdBy), d: fmtDay(s.createdAt) }));
  head(snap);

  const aud = wb.addWorksheet('Audit Trail');
  aud.columns = [{ header: 'Date', key: 'd', width: 22 }, { header: 'Action', key: 'a', width: 30 }, { header: 'Entity', key: 'e', width: 22 }, { header: 'By', key: 'b', width: 26 }];
  (pkg.auditTrail || []).forEach((a: any) => aud.addRow({ d: fmtDay(a.createdAt), a: txt(a.action), e: txt(a.entityType) || txt(a.entity), b: txt(a.userEmail) || txt(a.performedBy) || txt(a.createdBy) }));
  head(aud);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ----------------------------------------------------------------- IMP

const impMeta = (p: any): [string, string][] => [
  ['Organization', `${p.organization.name} (${p.organization.industry}, ${p.organization.country})`],
  ['Consolidation', String(p.organization.consolidationApproach)],
  ['Reporting period', `${fmtDay(p.reportingPeriod.start)} to ${fmtDay(p.reportingPeriod.end)}`],
  ['Generated', `${fmtDay(p.generatedAt)} by ${p.generatedBy}`],
];

export async function renderImpPdf(p: any): Promise<Buffer> {
  const pdf = await BrandedPdf.create(THEMES.carbonytics, 'Inventory Management Plan');
  pdf.cover({ title: `Inventory Management Plan - ${p.organization.name}`, subtitle: 'GHG inventory process document (auditor-ready)', meta: impMeta(p), note: p.autoGenerated });

  pdf.heading('1. Organization & boundary');
  pdf.kv('Organization', `${p.organization.name} (${p.organization.industry}, ${p.organization.country})`);
  pdf.kv('Consolidation approach', p.organization.consolidationApproach);
  (p.organization.facilities || []).forEach((f: any) => pdf.bullet(`${f.name}${f.city ? `, ${f.city}` : ''} (${f.country}) - ownership ${f.ownershipPercent}%, operational control: ${f.operationalControl ? 'yes' : 'no'}`));

  pdf.heading('2. Roles & responsibilities');
  pdf.kv('Administrators', p.rolesAndResponsibilities.inventoryAdministrators.join('; ') || '-');
  pdf.kv('Managers', p.rolesAndResponsibilities.inventoryManagers.join('; ') || '-');
  pdf.kv('Contributors', p.rolesAndResponsibilities.contributors.join('; ') || '-');
  pdf.note(p.rolesAndResponsibilities.note);

  pdf.heading('3. Reporting period');
  pdf.para(`${fmtDay(p.reportingPeriod.start)} to ${fmtDay(p.reportingPeriod.end)} - ${p.reportingPeriod.note}`, { indent: 8 });

  pdf.heading('4. Methodology');
  pdf.kv('Standard', p.methodology.standard);
  pdf.kv('GWP set', `${p.methodology.gwpSet} (${p.methodology.gwpSource})`);
  pdf.kv('GWP application', p.methodology.gwpApplication);
  pdf.kv('Factor selection', p.methodology.factorSelectionPolicy);
  pdf.kv('Scope 2', p.methodology.scope2);
  pdf.kv('Units', p.methodology.units);
  pdf.kv('Rounding policy', p.methodology.roundingPolicy);

  pdf.heading('5. Data management');
  pdf.kv('Collection', p.dataManagement.collection);
  pdf.kv('Supplier engagement', p.dataManagement.supplierEngagement);
  pdf.kv('Estimation policy', p.dataManagement.estimationPolicy);
  pdf.subheading('Denominator series');
  (p.dataManagement.denominators || []).forEach((d: string) => pdf.bullet(d));

  pdf.heading('6. QA/QC controls');
  (p.qaqcControls || []).forEach((c: string) => pdf.bullet(c));

  pdf.heading('7. Data-quality rubric');
  pdf.para(p.dataQualityRubric.scale, { indent: 8 });
  (p.dataQualityRubric.levels || []).forEach((l: string) => pdf.bullet(l));

  pdf.heading('8. Emission factor library');
  pdf.kv('Shared / organization-custom', `${p.factorLibrary.sharedFactors} / ${p.factorLibrary.organizationCustomFactors}`);
  pdf.kv('Sources', p.factorLibrary.sources);

  pdf.heading('9. Exclusions register');
  if (!(p.exclusions || []).length) pdf.para('No documented exclusions.', { indent: 8 });
  (p.exclusions || []).forEach((e: any) => pdf.bullet(`${e.source}${e.scope ? ` (Scope ${e.scope})` : ''}: ${e.justification}${e.estimatedEmissions ? ` - est. ${num(e.estimatedEmissions)} kg CO2e/yr` : ''}`));

  pdf.heading('10. Base year & recalculation policy');
  if (!(p.baseYearAndRecalculation.targets || []).length) pdf.bullet('No targets configured.');
  (p.baseYearAndRecalculation.targets || []).forEach((t: any) => pdf.bullet(`Target: ${t.name} - ${t.targetReduction}% below ${t.baselineYear} (${num(t.baselineEmissions)} kg CO2e) by ${t.targetYear}`));
  pdf.note(p.baseYearAndRecalculation.recalculationPolicy);

  pdf.heading('11. Improvement plan');
  (p.improvementPlan || []).forEach((i: string) => pdf.bullet(i));
  return pdf.finish();
}

export async function renderImpDocx(p: any): Promise<Buffer> {
  const k = docxKit(THEMES.carbonytics, 'Inventory Management Plan');
  const body: any[] = [
    k.h('1. Organization & boundary'),
    k.p(`${p.organization.name} (${p.organization.industry}, ${p.organization.country})`),
    k.p(`Consolidation approach: ${p.organization.consolidationApproach}`, { bold: true }),
    ...(p.organization.facilities || []).map((f: any) => k.bullet(`${f.name}${f.city ? `, ${f.city}` : ''} (${f.country}) - ownership ${f.ownershipPercent}%, operational control: ${f.operationalControl ? 'yes' : 'no'}`)),
    k.h('2. Roles & responsibilities'),
    k.p(`Administrators: ${p.rolesAndResponsibilities.inventoryAdministrators.join('; ') || '-'}`),
    k.p(`Managers: ${p.rolesAndResponsibilities.inventoryManagers.join('; ') || '-'}`),
    k.p(`Contributors: ${p.rolesAndResponsibilities.contributors.join('; ') || '-'}`),
    k.p(p.rolesAndResponsibilities.note, { italics: true, color: '777777', size: 16 }),
    k.h('3. Reporting period'),
    k.p(`${fmtDay(p.reportingPeriod.start)} to ${fmtDay(p.reportingPeriod.end)} - ${p.reportingPeriod.note}`),
    k.h('4. Methodology'),
    k.p(`Standard: ${p.methodology.standard}`),
    k.p(`GWP set: ${p.methodology.gwpSet} (${p.methodology.gwpSource})`, { bold: true }),
    k.p(`GWP application: ${p.methodology.gwpApplication}`),
    k.p(`Factor selection: ${p.methodology.factorSelectionPolicy}`),
    k.p(`Scope 2: ${p.methodology.scope2}`),
    k.p(`Units: ${p.methodology.units}`),
    k.p(`Rounding policy: ${p.methodology.roundingPolicy}`),
    k.h('5. Data management'),
    k.p(`Collection: ${p.dataManagement.collection}`),
    k.p(`Supplier engagement: ${p.dataManagement.supplierEngagement}`),
    k.p(`Estimation policy: ${p.dataManagement.estimationPolicy}`),
    k.sub('Denominator series'),
    ...(p.dataManagement.denominators || []).map((d: string) => k.bullet(d)),
    k.h('6. QA/QC controls'),
    ...(p.qaqcControls || []).map((c: string) => k.bullet(c)),
    k.h('7. Data-quality rubric'),
    k.p(p.dataQualityRubric.scale),
    ...(p.dataQualityRubric.levels || []).map((l: string) => k.bullet(l)),
    k.h('8. Emission factor library'),
    k.p(`Shared factors: ${p.factorLibrary.sharedFactors} · Organization custom: ${p.factorLibrary.organizationCustomFactors}`),
    k.p(`Sources: ${p.factorLibrary.sources}`),
    k.h('9. Exclusions register'),
    ...((p.exclusions || []).length ? (p.exclusions).map((e: any) => k.bullet(`${e.source}${e.scope ? ` (Scope ${e.scope})` : ''}: ${e.justification}${e.estimatedEmissions ? ` - est. ${num(e.estimatedEmissions)} kg CO2e/yr` : ''}`)) : [k.p('No documented exclusions.')]),
    k.h('10. Base year & recalculation policy'),
    ...((p.baseYearAndRecalculation.targets || []).length ? p.baseYearAndRecalculation.targets.map((t: any) => k.bullet(`Target: ${t.name} - ${t.targetReduction}% below ${t.baselineYear} (${num(t.baselineEmissions)} kg CO2e) by ${t.targetYear}`)) : [k.bullet('No targets configured.')]),
    k.p(p.baseYearAndRecalculation.recalculationPolicy, { italics: true, color: '777777', size: 16 }),
    k.h('11. Improvement plan'),
    ...(p.improvementPlan || []).map((i: string) => k.bullet(i)),
  ];
  return k.build({ title: `Inventory Management Plan - ${p.organization.name}`, subtitle: 'GHG inventory process document (auditor-ready)', meta: impMeta(p), note: p.autoGenerated }, body);
}
