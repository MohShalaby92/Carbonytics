/**
 * Branded PDF / DOCX / XLSX renderers for the disclosure-framework mappings
 * (§49): CDP Climate Change, SBTi target readiness, ESRS E1 (CSRD). Each mirrors
 * the same data the markdown renderer used, but laid out as a presentable,
 * framework-accented document via the shared reportKit toolkit. End users get
 * PDF/Word (and Excel where the content is tabular) — markdown stays dev-only.
 */
import ExcelJS from 'exceljs';
import { BrandedPdf, docxKit, THEMES, fmtDay } from './reportKit';
import { formatPedigreeLine } from './pedigree';

const cdpMeta = (m: any): [string, string][] => [
  ['Organization', String(m.C0_introduction['C0.1 organization'])],
  ['Reporting period', `${fmtDay(m.C0_introduction['C0.2 reporting period'].start)} to ${fmtDay(m.C0_introduction['C0.2 reporting period'].end)}`],
  ['Boundary', String(m.C0_introduction['C0.5 boundary (consolidation approach)'])],
  ['Units', String(m.unit)],
  ['Generated', `${fmtDay(m.generatedAt)} by ${m.generatedBy}`],
];

const baseYearStr = (by: any) => (typeof by === 'string' ? by : `${by.year} (Scope 1+2: ${by.scope1and2_tCO2e} t CO2e)`);

// ----------------------------------------------------------------- CDP

export async function renderCdpPdf(m: any): Promise<Buffer> {
  const pdf = await BrandedPdf.create(THEMES.cdp, 'CDP Climate Change');
  pdf.cover({ title: m.title, subtitle: 'Climate-change disclosure preparation aid', meta: cdpMeta(m), note: m.disclaimer });

  pdf.heading('C0. Introduction');
  pdf.kv('C0.1 Organization', m.C0_introduction['C0.1 organization']);
  pdf.kv('C0.2 Reporting period', `${fmtDay(m.C0_introduction['C0.2 reporting period'].start)} to ${fmtDay(m.C0_introduction['C0.2 reporting period'].end)}`);
  pdf.kv('C0.5 Boundary', m.C0_introduction['C0.5 boundary (consolidation approach)']);

  pdf.heading('C5. Emissions methodology');
  pdf.kv('C5.1 Base year', baseYearStr(m.C5_emissions_methodology['C5.1 base year']));
  (m.C5_emissions_methodology['C5.2 standard, protocols, methodologies'] as string[]).forEach((s) => pdf.bullet(s));

  pdf.heading('C6. Emissions data');
  pdf.kv('C6.1 Scope 1', `${m.C6_emissions_data['C6.1 Scope 1 (t CO2e)']} t CO2e`);
  const s2 = m.C6_emissions_data['C6.3 Scope 2 (t CO2e)'];
  pdf.kv('C6.3 Scope 2', `location-based ${s2.locationBased} · market-based ${s2.marketBased} t CO2e`);
  pdf.kv('C6.5 Scope 3 total', `${m.C6_emissions_data['C6.5 Scope 3 total (t CO2e)']} t CO2e`);
  const s3 = m.C6_emissions_data['C6.5 Scope 3 by category (t CO2e)'] || [];
  if (s3.length) {
    pdf.subheading('C6.5 Scope 3 by category');
    pdf.table(['Scope 3 category', 't CO2e', 'Relevance', 'Methods'], [pdf.maxW * 0.34, 60, 90, pdf.maxW - pdf.maxW * 0.34 - 150],
      s3.map((c: any) => [c.category, String(c.tCO2e), c.relevance, (c.methodsUsed || []).join(', ')]));
  }

  pdf.heading('C10. Verification & data quality');
  pdf.bullet(m.C10_verification['C10.1 verification status']);
  pdf.bullet(`GHG-Protocol pedigree (DQI): ${formatPedigreeLine(m.C10_verification.pedigree)}`);
  pdf.bullet(`Weighted data-quality score: ${m.C10_verification.dataQualityWeighted ?? '-'} / 5 (1 best) · Completeness: ${m.C10_verification.completenessPercent}%`);
  return pdf.finish();
}

export async function renderCdpDocx(m: any): Promise<Buffer> {
  const k = docxKit(THEMES.cdp, 'CDP Climate Change');
  const s2 = m.C6_emissions_data['C6.3 Scope 2 (t CO2e)'];
  const s3 = m.C6_emissions_data['C6.5 Scope 3 by category (t CO2e)'] || [];
  const body: any[] = [
    k.h('C0. Introduction'),
    k.p(`C0.1 Organization: ${m.C0_introduction['C0.1 organization']}`),
    k.p(`C0.2 Reporting period: ${fmtDay(m.C0_introduction['C0.2 reporting period'].start)} to ${fmtDay(m.C0_introduction['C0.2 reporting period'].end)}`),
    k.p(`C0.5 Boundary (consolidation): ${m.C0_introduction['C0.5 boundary (consolidation approach)']}`),
    k.h('C5. Emissions methodology'),
    k.p(`C5.1 Base year: ${baseYearStr(m.C5_emissions_methodology['C5.1 base year'])}`),
    ...(m.C5_emissions_methodology['C5.2 standard, protocols, methodologies'] as string[]).map((s) => k.bullet(s)),
    k.h('C6. Emissions data'),
    k.p(`C6.1 Scope 1: ${m.C6_emissions_data['C6.1 Scope 1 (t CO2e)']} t CO2e`, { bold: true }),
    k.p(`C6.3 Scope 2 — location-based ${s2.locationBased} · market-based ${s2.marketBased} t CO2e`),
    k.p(`C6.5 Scope 3 total: ${m.C6_emissions_data['C6.5 Scope 3 total (t CO2e)']} t CO2e`, { bold: true }),
  ];
  if (s3.length) {
    body.push(k.sub('C6.5 Scope 3 by category'));
    body.push(k.table(['Scope 3 category', 't CO2e', 'Relevance', 'Methods'], s3.map((c: any) => [c.category, String(c.tCO2e), c.relevance, (c.methodsUsed || []).join(', ')])));
  }
  body.push(
    k.h('C10. Verification & data quality'),
    k.bullet(m.C10_verification['C10.1 verification status']),
    k.bullet(`GHG-Protocol pedigree (DQI): ${formatPedigreeLine(m.C10_verification.pedigree)}`),
    k.bullet(`Weighted data-quality score: ${m.C10_verification.dataQualityWeighted ?? '-'} / 5 (1 best) · Completeness: ${m.C10_verification.completenessPercent}%`)
  );
  return k.build({ title: m.title, subtitle: 'Climate-change disclosure preparation aid', meta: cdpMeta(m), note: m.disclaimer }, body);
}

// ----------------------------------------------------------------- SBTi

const sbtiMeta = (s: any): [string, string][] => [
  ['Scope 1+2', `${s.inventory.scope1and2_tCO2e} t CO2e`],
  ['Scope 3', `${s.inventory.scope3_tCO2e} t CO2e (${s.inventory.scope3SharePercent}% of total)`],
  ['Total', `${s.inventory.total_tCO2e} t CO2e`],
  ['Units', String(s.unit)],
  ['Generated', `${fmtDay(s.generatedAt)} by ${s.generatedBy}`],
];

export async function renderSbtiPdf(s: any): Promise<Buffer> {
  const pdf = await BrandedPdf.create(THEMES.sbti, 'SBTi Target Readiness');
  pdf.cover({ title: s.title, subtitle: 'Science-based target readiness assessment', meta: sbtiMeta(s), note: s.disclaimer });

  pdf.heading('Inventory');
  pdf.kv('Scope 1+2', `${s.inventory.scope1and2_tCO2e} t CO2e (S1 ${s.inventory.scope1_tCO2e} · S2 ${s.inventory.scope2_tCO2e})`);
  pdf.kv('Scope 3', `${s.inventory.scope3_tCO2e} t CO2e (${s.inventory.scope3SharePercent}% of total)`);
  pdf.kv('Total', `${s.inventory.total_tCO2e} t CO2e`);

  pdf.heading('Boundary & screening');
  pdf.kv('Scope 3 target required (>=40% rule)', s.boundaryAndScreening.scope3TargetRequired ? 'yes' : 'no');
  pdf.bullet(s.boundaryAndScreening.scope3Rule);
  pdf.kv('Completeness', `${s.boundaryAndScreening.completenessPercent}% · relevance screened: ${s.boundaryAndScreening.relevantCategoriesScreened ? 'yes' : 'no'}`);

  pdf.heading('Targets vs near-term 1.5C ambition');
  if (Array.isArray(s.targets) && typeof s.targets[0] === 'string') {
    pdf.para(s.targets[0], { indent: 8 });
  } else {
    pdf.table(['Target', 'By', 'vs base', 'Linear/yr', 'Meets 1.5C'], [pdf.maxW * 0.34, 50, 60, 70, pdf.maxW - pdf.maxW * 0.34 - 180],
      s.targets.map((t: any) => [`${t.name} (${t.reductionPercent}% by ${t.targetYear})`, String(t.targetYear), String(t.baselineYear), `${t.impliedAnnualLinearPercent}%`, t.meetsNearTerm1p5Ambition ? 'yes' : 'no']));
    s.targets.forEach((t: any) => pdf.note(`${t.name}: ${t.note}`));
  }

  pdf.heading('Next steps');
  s.nextSteps.forEach((n: string) => pdf.bullet(n));
  return pdf.finish();
}

export async function renderSbtiDocx(s: any): Promise<Buffer> {
  const k = docxKit(THEMES.sbti, 'SBTi Target Readiness');
  const body: any[] = [
    k.h('Inventory'),
    k.p(`Scope 1+2: ${s.inventory.scope1and2_tCO2e} t CO2e (S1 ${s.inventory.scope1_tCO2e} · S2 ${s.inventory.scope2_tCO2e})`, { bold: true }),
    k.p(`Scope 3: ${s.inventory.scope3_tCO2e} t CO2e (${s.inventory.scope3SharePercent}% of total)`),
    k.p(`Total: ${s.inventory.total_tCO2e} t CO2e`, { bold: true }),
    k.h('Boundary & screening'),
    k.p(`Scope 3 target required (>=40% rule): ${s.boundaryAndScreening.scope3TargetRequired ? 'yes' : 'no'} — ${s.boundaryAndScreening.scope3Rule}`),
    k.p(`Completeness: ${s.boundaryAndScreening.completenessPercent}% · relevance screened: ${s.boundaryAndScreening.relevantCategoriesScreened ? 'yes' : 'no'}`),
    k.h('Targets vs near-term 1.5C ambition'),
  ];
  if (Array.isArray(s.targets) && typeof s.targets[0] === 'string') {
    body.push(k.p(s.targets[0]));
  } else {
    body.push(k.table(['Target', 'Base year', 'Target year', 'Reduction', 'Linear/yr', 'Meets 1.5C'],
      s.targets.map((t: any) => [t.name, String(t.baselineYear), String(t.targetYear), `${t.reductionPercent}%`, `${t.impliedAnnualLinearPercent}%/yr`, t.meetsNearTerm1p5Ambition ? 'yes' : 'no'])));
    s.targets.forEach((t: any) => body.push(k.p(`${t.name}: ${t.note}`, { italics: true, color: '777777', size: 16 })));
  }
  body.push(k.h('Next steps'), ...s.nextSteps.map((n: string) => k.bullet(n)));
  return k.build({ title: s.title, subtitle: 'Science-based target readiness assessment', meta: sbtiMeta(s), note: s.disclaimer }, body);
}

// ----------------------------------------------------------------- ESRS E1

const esrsMeta = (m: any): [string, string][] => [
  ['Organization', `${m.organization.name} (${m.organization.country})`],
  ['Consolidation', String(m.organization.consolidationApproach)],
  ['Reporting period', `${fmtDay(m.reportingPeriod.start)} to ${fmtDay(m.reportingPeriod.end)}`],
  ['Standard', `${m.standard} · ${m.unit}`],
  ['Generated', `${fmtDay(m.generatedAt)} by ${m.generatedBy}`],
];

const esrsTargets = (m: any) => m['E1-4 targets related to climate change mitigation and adaptation'];
const e6Rows = (e6: any): string[][] => [
  ['Gross Scope 1', String(e6['Scope 1 (t CO2e)'])],
  ['Gross Scope 2, location-based', String(e6['Scope 2 location-based (t CO2e)'])],
  ['Gross Scope 2, market-based', String(e6['Scope 2 market-based (t CO2e)'])],
  ['Gross Scope 3', String(e6['Scope 3 (t CO2e)'])],
  ['Total GHG, location-based', String(e6['Total GHG emissions, location-based (t CO2e)'])],
  ['Total GHG, market-based', String(e6['Total GHG emissions, market-based (t CO2e)'])],
  ['Biogenic CO2 (memo, outside scopes)', String(e6['Biogenic CO2 emissions (t CO2, memo — outside the scope totals)'])],
];

export async function renderEsrsPdf(m: any): Promise<Buffer> {
  const pdf = await BrandedPdf.create(THEMES.esrs, 'ESRS E1 (CSRD)');
  pdf.cover({ title: m.title, subtitle: 'ESRS E1 climate-change datapoint mapping', meta: esrsMeta(m), note: m.disclaimer });

  pdf.heading('E1-1 Transition plan');
  pdf.para(m['E1-1 transition plan for climate change mitigation'], { indent: 8 });
  pdf.heading('E1-4 Targets');
  const targets = esrsTargets(m);
  if (Array.isArray(targets) && typeof targets[0] === 'string') pdf.para(targets[0], { indent: 8 });
  else pdf.table(['Target', 'Base yr', 'Target yr', 'Reduction', 'Base emissions (t CO2e)'], [pdf.maxW * 0.3, 56, 60, 70, pdf.maxW - pdf.maxW * 0.3 - 186],
    targets.map((t: any) => [t.name, String(t.baselineYear), String(t.targetYear), `${t.reductionPercent}%`, String(t.baselineEmissions_tCO2e)]));
  pdf.heading('E1-5 Energy consumption & mix');
  pdf.para(m['E1-5 energy consumption and mix'], { indent: 8 });

  const e6 = m['E1-6 gross GHG emissions'];
  pdf.heading('E1-6 Gross Scopes 1/2/3 and total GHG');
  pdf.table(['Datapoint', 't CO2e'], [pdf.maxW - 120, 120], e6Rows(e6));
  const s3 = e6['Scope 3 by category (t CO2e)'] || [];
  if (s3.length) {
    pdf.subheading('Scope 3 by category');
    pdf.table(['Category', 't CO2e', 'Methods'], [pdf.maxW * 0.4, 70, pdf.maxW - pdf.maxW * 0.4 - 70],
      s3.map((c: any) => [c.category, String(c.tCO2e), (c.methodsUsed || []).join(', ')]));
  }
  pdf.subheading('GHG intensity per net revenue');
  const gi = e6['GHG intensity per net revenue (E1-6)'];
  if (gi.note) pdf.para(gi.note, { indent: 8 });
  else {
    pdf.kv('Net revenue', `${Number(gi.netRevenue).toLocaleString()} ${gi.netRevenueUnit}`);
    pdf.kv('Intensity (location-based)', `${gi.intensityLocationBased_tCO2ePerUnit} t CO2e / ${gi.netRevenueUnit}`);
    pdf.kv('Intensity (market-based)', `${gi.intensityMarketBased_tCO2ePerUnit} t CO2e / ${gi.netRevenueUnit}`);
  }
  pdf.note(e6.note);

  pdf.heading('E1-7 / E1-8 / E1-9');
  pdf.bullet(`E1-7 GHG removals and carbon credits: ${m['E1-7 GHG removals and carbon credits']}`);
  pdf.bullet(`E1-8 Internal carbon pricing: ${m['E1-8 internal carbon pricing']}`);
  pdf.bullet(`E1-9 Anticipated financial effects: ${m['E1-9 anticipated financial effects']}`);

  pdf.heading('Data quality & assurance');
  const dq = m.dataQualityAndAssurance;
  pdf.bullet(`GHG-Protocol pedigree (DQI): ${formatPedigreeLine(dq.pedigreeMatrix)}`);
  pdf.bullet(`Completeness: ${dq.completenessPercent}% · relevance screened: ${dq.relevantCategoriesScreened ? 'yes' : 'no'}`);
  pdf.bullet(`Weighted data-quality score: ${dq.weightedDataQualityScore ?? '-'} / 5 (1 best)`);
  pdf.bullet(`Independently verified calculations: ${dq.independentlyVerifiedCalculations} · locked/published: ${dq.lockedCalculations}`);
  pdf.note(dq.note);
  return pdf.finish();
}

export async function renderEsrsDocx(m: any): Promise<Buffer> {
  const k = docxKit(THEMES.esrs, 'ESRS E1 (CSRD)');
  const e6 = m['E1-6 gross GHG emissions'];
  const targets = esrsTargets(m);
  const s3 = e6['Scope 3 by category (t CO2e)'] || [];
  const gi = e6['GHG intensity per net revenue (E1-6)'];
  const dq = m.dataQualityAndAssurance;
  const body: any[] = [
    k.h('E1-1 Transition plan'), k.p(m['E1-1 transition plan for climate change mitigation']),
    k.h('E1-4 Targets'),
  ];
  if (Array.isArray(targets) && typeof targets[0] === 'string') body.push(k.p(targets[0]));
  else body.push(k.table(['Target', 'Base year', 'Target year', 'Reduction', 'Base emissions (t CO2e)'],
    targets.map((t: any) => [t.name, String(t.baselineYear), String(t.targetYear), `${t.reductionPercent}%`, String(t.baselineEmissions_tCO2e)])));
  body.push(k.h('E1-5 Energy consumption & mix'), k.p(m['E1-5 energy consumption and mix']));
  body.push(k.h('E1-6 Gross Scopes 1/2/3 and total GHG'), k.table(['Datapoint', 't CO2e'], e6Rows(e6)));
  if (s3.length) { body.push(k.sub('Scope 3 by category')); body.push(k.table(['Category', 't CO2e', 'Methods'], s3.map((c: any) => [c.category, String(c.tCO2e), (c.methodsUsed || []).join(', ')]))); }
  body.push(k.sub('GHG intensity per net revenue'));
  if (gi.note) body.push(k.p(gi.note));
  else body.push(
    k.p(`Net revenue: ${Number(gi.netRevenue).toLocaleString()} ${gi.netRevenueUnit}`),
    k.p(`Intensity (location-based): ${gi.intensityLocationBased_tCO2ePerUnit} t CO2e / ${gi.netRevenueUnit}`, { bold: true }),
    k.p(`Intensity (market-based): ${gi.intensityMarketBased_tCO2ePerUnit} t CO2e / ${gi.netRevenueUnit}`, { bold: true })
  );
  body.push(
    k.h('E1-7 / E1-8 / E1-9'),
    k.bullet(`E1-7 GHG removals and carbon credits: ${m['E1-7 GHG removals and carbon credits']}`),
    k.bullet(`E1-8 Internal carbon pricing: ${m['E1-8 internal carbon pricing']}`),
    k.bullet(`E1-9 Anticipated financial effects: ${m['E1-9 anticipated financial effects']}`),
    k.h('Data quality & assurance'),
    k.bullet(`GHG-Protocol pedigree (DQI): ${formatPedigreeLine(dq.pedigreeMatrix)}`),
    k.bullet(`Completeness: ${dq.completenessPercent}% · relevance screened: ${dq.relevantCategoriesScreened ? 'yes' : 'no'}`),
    k.bullet(`Weighted data-quality score: ${dq.weightedDataQualityScore ?? '-'} / 5 (1 best)`),
    k.bullet(`Independently verified calculations: ${dq.independentlyVerifiedCalculations} · locked/published: ${dq.lockedCalculations}`)
  );
  return k.build({ title: m.title, subtitle: 'ESRS E1 climate-change datapoint mapping', meta: esrsMeta(m), note: m.disclaimer }, body);
}

// ----------------------------------------------------------------- XLSX (CDP, ESRS)

const ACCENT_FILL = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });
function styleHeader(ws: ExcelJS.Worksheet, argb: string) {
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = ACCENT_FILL(argb);
}

export async function renderCdpXlsx(m: any): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Carbonytics';
  const argb = 'FFC21F4A';
  const sum = wb.addWorksheet('CDP Summary');
  sum.columns = [{ header: 'Field', key: 'k', width: 40 }, { header: 'Value', key: 'v', width: 50 }];
  const s2 = m.C6_emissions_data['C6.3 Scope 2 (t CO2e)'];
  [
    ['Report', m.title], ['Organization', m.C0_introduction['C0.1 organization']], ['Units', m.unit],
    ['C6.1 Scope 1 (t CO2e)', m.C6_emissions_data['C6.1 Scope 1 (t CO2e)']],
    ['C6.3 Scope 2 location-based (t CO2e)', s2.locationBased],
    ['C6.3 Scope 2 market-based (t CO2e)', s2.marketBased],
    ['C6.5 Scope 3 total (t CO2e)', m.C6_emissions_data['C6.5 Scope 3 total (t CO2e)']],
    ['C10.1 Verification status', m.C10_verification['C10.1 verification status']],
    ['Weighted DQ (1 best..5)', m.C10_verification.dataQualityWeighted ?? 'n/a'],
    ['Completeness %', m.C10_verification.completenessPercent],
  ].forEach((r) => sum.addRow({ k: r[0], v: r[1] }));
  styleHeader(sum, argb);
  const s3 = m.C6_emissions_data['C6.5 Scope 3 by category (t CO2e)'] || [];
  if (s3.length) {
    const ws = wb.addWorksheet('Scope 3 by category');
    ws.columns = [{ header: 'Category', key: 'c', width: 40 }, { header: 't CO2e', key: 'e', width: 14 }, { header: 'Relevance', key: 'r', width: 22 }, { header: 'Methods', key: 'm', width: 40 }];
    s3.forEach((c: any) => ws.addRow({ c: c.category, e: c.tCO2e, r: c.relevance, m: (c.methodsUsed || []).join(', ') }));
    styleHeader(ws, argb);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function renderEsrsXlsx(m: any): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Carbonytics';
  const argb = 'FF1C3F8F';
  const e6 = m['E1-6 gross GHG emissions'];
  const ws = wb.addWorksheet('E1-6 GHG emissions');
  ws.columns = [{ header: 'Datapoint', key: 'k', width: 48 }, { header: 't CO2e', key: 'v', width: 18 }];
  e6Rows(e6).forEach((r) => ws.addRow({ k: r[0], v: r[1] }));
  styleHeader(ws, argb);
  const s3 = e6['Scope 3 by category (t CO2e)'] || [];
  if (s3.length) {
    const w2 = wb.addWorksheet('Scope 3 by category');
    w2.columns = [{ header: 'Category', key: 'c', width: 40 }, { header: 't CO2e', key: 'e', width: 14 }, { header: 'Methods', key: 'm', width: 44 }];
    s3.forEach((c: any) => w2.addRow({ c: c.category, e: c.tCO2e, m: (c.methodsUsed || []).join(', ') }));
    styleHeader(w2, argb);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
