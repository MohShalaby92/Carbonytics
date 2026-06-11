import { Request, Response } from 'express';
import { Calculation } from '../models/Calculation';
import { EmissionCategory } from '../models/EmissionCategory';
import { Organization } from '../models/Organization';
import { Facility } from '../models/Facility';
import { AuditLog } from '../models/AuditLog';
import { CalculationSnapshot } from '../models/CalculationSnapshot';
import { GWP_SETS, DEFAULT_GWP_SET, isGwpSetName } from '../data/gwpSets';
import { ApiResponseUtil } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthenticatedRequest } from '../types';
import { BenchmarkService } from '../services/benchmarkService';

/**
 * GHG inventory report (GHG Protocol / ISO 14064-1 required content):
 * boundaries + consolidation approach, period, emissions by scope, Scope 2
 * dual figures, Scope 3 by category with method mix, exclusions register,
 * methodology (GWP set, factor register), data-quality summary, base-year
 * targets, and an audit-trail reference. JSON by default; ?format=markdown
 * downloads a rendered document.
 */
async function buildGHGInventoryReport(
  user: { organizationId: string; email: string },
  start: Date,
  end: Date
) {
  const [organization, facilities, calculations, auditCount] = await Promise.all([
    Organization.findById(user.organizationId),
    Facility.find({ organizationId: user.organizationId, isActive: true }).lean(),
    Calculation.find({
      organizationId: user.organizationId,
      'period.start': { $gte: start, $lte: end },
    })
      .populate('data.categoryId', 'category scope subcategory')
      .lean(),
    AuditLog.countDocuments({
      organizationId: user.organizationId,
      createdAt: { $gte: start, $lte: end },
    }),
  ]);

  if (!organization) {
    throw new Error('Organization not found');
  }

  const gwpSet = isGwpSetName(organization.settings?.gwpSet)
    ? organization.settings!.gwpSet!
    : DEFAULT_GWP_SET;

  // Totals by scope + per-category breakdown with method mix.
  const byScope = { scope1: 0, scope2: 0, scope3: 0, total: 0 };
  const byCategory: Record<string, { scope: number; subcategory?: string; emissions: number; methods: Record<string, number>; entries: number }> = {};
  const dual = { locationBased: 0, marketBased: 0, electricityEntries: 0, methods: new Set<string>() };
  const quality = { high: 0, medium: 0, low: 0, unrated: 0 };
  // PCAF-style weighted DQ (emissions-weighted) + estimated-data share.
  let dqWeighted = 0, dqEmissions = 0, estimateCount = 0, estimateEmissions = 0, totalEntryEmissions = 0;
  const factorRegister = new Map<string, { name: string; source?: string; year?: number; uses: number }>();
  let lockedCount = 0;

  for (const calc of calculations) {
    byScope.scope1 += calc.emissions?.scope1 || 0;
    byScope.scope2 += calc.emissions?.scope2 || 0;
    byScope.scope3 += calc.emissions?.scope3 || 0;
    if ((calc as any).status === 'locked') lockedCount++;

    for (const entry of calc.data || []) {
      const cat: any = entry.categoryId;
      const name = cat?.category || 'Unknown';
      if (!byCategory[name]) {
        byCategory[name] = { scope: cat?.scope || 0, subcategory: cat?.subcategory, emissions: 0, methods: {}, entries: 0 };
      }
      byCategory[name].emissions += entry.emissions || 0;
      byCategory[name].entries += 1;
      const method = (entry as any).method || 'unspecified';
      byCategory[name].methods[method] = (byCategory[name].methods[method] || 0) + (entry.emissions || 0);

      if ((entry as any).scope2Location !== undefined) {
        dual.locationBased += (entry as any).scope2Location || 0;
        dual.marketBased += (entry as any).scope2Market || 0;
        dual.electricityEntries += 1;
        if ((entry as any).scope2MarketMethod) dual.methods.add((entry as any).scope2MarketMethod);
      }

      const q = (entry as any).quality;
      if (q === 'high') quality.high++;
      else if (q === 'medium') quality.medium++;
      else if (q === 'low') quality.low++;
      else quality.unrated++;

      const em = entry.emissions || 0;
      totalEntryEmissions += em;
      if ((entry as any).dqScore) {
        dqWeighted += (entry as any).dqScore * em;
        dqEmissions += em;
      }
      if ((entry as any).isEstimate) {
        estimateCount++;
        estimateEmissions += em;
      }

      const fKey = `${(entry as any).factorName || 'unknown'}|${(entry as any).factorYear || ''}`;
      const existing = factorRegister.get(fKey);
      if (existing) existing.uses++;
      else
        factorRegister.set(fKey, {
          name: (entry as any).factorName || 'unknown',
          source: (entry as any).factorSource,
          year: (entry as any).factorYear,
          uses: 1,
        });
    }
  }
  byScope.scope1 = Math.round(byScope.scope1 * 100) / 100;
  byScope.scope2 = Math.round(byScope.scope2 * 100) / 100;
  byScope.scope3 = Math.round(byScope.scope3 * 100) / 100;
  byScope.total = Math.round((byScope.scope1 + byScope.scope2 + byScope.scope3) * 100) / 100;
  dual.locationBased = Math.round(dual.locationBased * 100) / 100;
  dual.marketBased = Math.round(dual.marketBased * 100) / 100;

  const report = {
    title: `GHG Inventory Report — ${organization.name}`,
    generatedAt: new Date().toISOString(),
    generatedBy: user.email,
    organization: {
      name: organization.name,
      industry: organization.industry,
      country: organization.country,
      consolidationApproach: organization.consolidationApproach || 'operational_control',
      facilities: facilities.map((f: any) => ({
        name: f.name,
        country: f.country,
        ownershipPercent: f.ownershipPercent,
        operationalControl: f.operationalControl,
      })),
    },
    reportingPeriod: { start: start.toISOString(), end: end.toISOString() },
    methodology: {
      standard: 'GHG Protocol Corporate Standard (operational alignment); ISO 14064-1 informed',
      gwpSet,
      gwpSource: GWP_SETS[gwpSet].label,
      factorPolicy:
        'Egyptian emission factors are the primary default; supplier-specific (custom) or other regional factors are applied when explicitly selected by the user. Factor vintage is matched to the activity year.',
      scope2Note:
        'Dual reporting: location-based uses the Egyptian grid-average factor; market-based uses supplier-specific rates where chosen, otherwise grid average (no contractual-instrument market in Egypt).',
      tool: 'Carbonytics',
    },
    emissions: {
      unit: 'kg CO2e',
      byScope,
      scope2Dual: {
        locationBased: dual.locationBased,
        marketBased: dual.marketBased,
        electricityEntries: dual.electricityEntries,
        methodsUsed: Array.from(dual.methods),
      },
      byCategory: Object.entries(byCategory)
        .map(([category, v]) => ({ category, ...v, emissions: Math.round(v.emissions * 100) / 100 }))
        .sort((a, b) => b.emissions - a.emissions),
    },
    dataQuality: {
      ...quality,
      // Emissions-weighted PCAF-style score (1 best … 5 worst); null until
      // entries carry dqScore (older entries predate scoring).
      weightedDqScore: dqEmissions > 0 ? Math.round((dqWeighted / dqEmissions) * 100) / 100 : null,
      estimates: {
        count: estimateCount,
        emissionsShare:
          totalEntryEmissions > 0
            ? Math.round((estimateEmissions / totalEntryEmissions) * 1000) / 10
            : 0,
      },
      ratedShare:
        quality.high + quality.medium + quality.low + quality.unrated > 0
          ? Math.round(
              ((quality.high + quality.medium + quality.low) /
                (quality.high + quality.medium + quality.low + quality.unrated)) * 100
            )
          : 0,
    },
    factorRegister: Array.from(factorRegister.values()).sort((a, b) => b.uses - a.uses),
    exclusions: organization.exclusions || [],
    targets: organization.targets || [],
    inventoryControls: {
      calculationsInPeriod: calculations.length,
      lockedCalculations: lockedCount,
      auditTrailEntriesInPeriod: auditCount,
    },
    uncertaintyStatement:
      'Quantitative uncertainty analysis has not yet been performed. Data-quality ratings per entry (factor specificity, regional representativeness, vintage) are reported above; baseline factors flagged low-quality should be validated against authoritative datasets before external assurance.',
  };

  return report;
}

function parsePeriod(req: AuthenticatedRequest): { start: Date; end: Date } {
  const end = req.query.endDate ? new Date(req.query.endDate as string) : new Date();
  const start = req.query.startDate
    ? new Date(req.query.startDate as string)
    : new Date(new Date(end).setFullYear(end.getFullYear() - 1));
  return { start, end };
}

export const getGHGInventoryReport = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }
  const { start, end } = parsePeriod(req);
  const report = await buildGHGInventoryReport(req.user, start, end);

  if ((req.query.format as string) === 'markdown') {
    const md = renderInventoryMarkdown(report);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ghg_inventory_${start.toISOString().split('T')[0]}_${end.toISOString().split('T')[0]}.md"`
    );
    return res.send(md);
  }

  ApiResponseUtil.success(res, report);
});

/**
 * Assurance package (ISO 14064-3 / ISSA 5000 readiness): one bundle a verifier
 * samples from — inventory report, complete activity-data register with
 * per-entry provenance, audit-trail extract, and publication snapshots.
 */
export const getAssurancePackage = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }
  const { start, end } = parsePeriod(req);

  const [report, calcs, audit, snapshots] = await Promise.all([
    buildGHGInventoryReport(req.user, start, end),
    Calculation.find({
      organizationId: req.user.organizationId,
      'period.start': { $gte: start, $lte: end },
    })
      .populate('data.categoryId', 'category scope')
      .lean(),
    AuditLog.find({
      organizationId: req.user.organizationId,
      createdAt: { $gte: start, $lte: end },
    })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean(),
    CalculationSnapshot.find({ organizationId: req.user.organizationId })
      .select('calculationId version reason comment createdBy createdAt')
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  // Flat activity-data register: every entry with its full provenance chain —
  // the sampling surface for a verifier.
  const activityRegister = calcs.flatMap((c: any) =>
    (c.data || []).map((e: any) => ({
      calculationId: c._id.toString(),
      calculationTitle: c.title,
      status: c.status,
      period: c.period,
      facilityId: c.facilityId,
      category: e.categoryId?.category,
      scope: e.categoryId?.scope,
      value: e.value,
      unit: e.unit,
      emissions: e.emissions,
      factor: e.factor,
      factorId: e.factorId,
      factorName: e.factorName,
      factorSource: e.factorSource,
      factorYear: e.factorYear,
      gwpSet: e.gwpSet,
      gwpApplied: e.gwpApplied,
      method: e.method,
      quality: e.quality,
      scope2Location: e.scope2Location,
      scope2Market: e.scope2Market,
      scope2MarketMethod: e.scope2MarketMethod,
      notes: e.notes,
    }))
  );

  ApiResponseUtil.success(res, {
    inventoryReport: report,
    activityRegister,
    auditTrail: audit.map((a: any) => ({ ...a, id: a._id.toString() })),
    snapshots: snapshots.map((s: any) => ({ ...s, id: s._id.toString() })),
    contents: ['inventoryReport', 'activityRegister', 'auditTrail', 'snapshots'],
    note: 'Per-data-line evidence attachments are not yet supported (gap analysis §4.3); audit extract capped at 500 entries.',
  });
});

function renderInventoryMarkdown(r: any): string {
  const lines: string[] = [];
  const kg = (v: number) => `${v.toLocaleString()} kg CO2e`;
  lines.push(`# ${r.title}`);
  lines.push(`Generated ${r.generatedAt} by ${r.generatedBy}`);
  lines.push('');
  lines.push('## 1. Organizational boundary');
  lines.push(`- Organization: ${r.organization.name} (${r.organization.industry}, ${r.organization.country})`);
  lines.push(`- Consolidation approach: **${r.organization.consolidationApproach}**`);
  if (r.organization.facilities.length > 0) {
    lines.push(`- Facilities (${r.organization.facilities.length}):`);
    r.organization.facilities.forEach((f: any) =>
      lines.push(`  - ${f.name} (${f.country}) — ownership ${f.ownershipPercent}%, operational control: ${f.operationalControl ? 'yes' : 'no'}`)
    );
  }
  lines.push('');
  lines.push('## 2. Reporting period');
  lines.push(`${r.reportingPeriod.start.split('T')[0]} → ${r.reportingPeriod.end.split('T')[0]}`);
  lines.push('');
  lines.push('## 3. Methodology');
  lines.push(`- Standard: ${r.methodology.standard}`);
  lines.push(`- GWP set: **${r.methodology.gwpSet}** (${r.methodology.gwpSource})`);
  lines.push(`- Factor policy: ${r.methodology.factorPolicy}`);
  lines.push(`- Scope 2: ${r.methodology.scope2Note}`);
  lines.push('');
  lines.push('## 4. Emissions by scope');
  lines.push(`| Scope | kg CO2e |`);
  lines.push(`|---|---|`);
  lines.push(`| Scope 1 (direct) | ${r.emissions.byScope.scope1.toLocaleString()} |`);
  lines.push(`| Scope 2 (purchased energy) | ${r.emissions.byScope.scope2.toLocaleString()} |`);
  lines.push(`| Scope 3 (value chain) | ${r.emissions.byScope.scope3.toLocaleString()} |`);
  lines.push(`| **Total** | **${r.emissions.byScope.total.toLocaleString()}** |`);
  lines.push('');
  lines.push('### Scope 2 dual reporting');
  lines.push(`- Location-based: ${kg(r.emissions.scope2Dual.locationBased)}`);
  lines.push(`- Market-based: ${kg(r.emissions.scope2Dual.marketBased)}`);
  r.emissions.scope2Dual.methodsUsed.forEach((m: string) => lines.push(`  - Method: ${m}`));
  lines.push('');
  lines.push('## 5. Emissions by category (with method mix)');
  lines.push(`| Category | Scope | kg CO2e | Methods |`);
  lines.push(`|---|---|---|---|`);
  r.emissions.byCategory.forEach((c: any) => {
    const methods = Object.entries(c.methods)
      .map(([m, v]: any) => `${m}: ${Math.round((v / Math.max(c.emissions, 0.01)) * 100)}%`)
      .join(', ');
    lines.push(`| ${c.category}${c.subcategory ? ` (${c.subcategory})` : ''} | ${c.scope} | ${c.emissions.toLocaleString()} | ${methods} |`);
  });
  lines.push('');
  lines.push('## 6. Data quality');
  lines.push(`High: ${r.dataQuality.high} · Medium: ${r.dataQuality.medium} · Low: ${r.dataQuality.low} · Unrated: ${r.dataQuality.unrated} (rated share ${r.dataQuality.ratedShare}%)`);
  if (r.dataQuality.weightedDqScore) {
    lines.push(`PCAF-style weighted DQ score: **${r.dataQuality.weightedDqScore}** (1 best … 5 worst, emissions-weighted)`);
  }
  lines.push(`Estimated (gap-filled) data: ${r.dataQuality.estimates.count} entries, ${r.dataQuality.estimates.emissionsShare}% of emissions — estimates carry +10% conservativeness and DQ 5.`);
  lines.push('');
  lines.push('## 7. Emission factor register');
  lines.push(`| Factor | Source | Year | Uses |`);
  lines.push(`|---|---|---|---|`);
  r.factorRegister.forEach((f: any) => lines.push(`| ${f.name} | ${f.source || '—'} | ${f.year || '—'} | ${f.uses} |`));
  lines.push('');
  lines.push('## 8. Exclusions register');
  if (r.exclusions.length === 0) lines.push('No documented exclusions.');
  r.exclusions.forEach((e: any) =>
    lines.push(`- **${e.source}**${e.scope ? ` (Scope ${e.scope})` : ''}: ${e.justification}${e.estimatedEmissions ? ` — est. ${e.estimatedEmissions} kg CO2e/yr` : ''}`)
  );
  lines.push('');
  lines.push('## 9. Base year & targets');
  if (r.targets.length === 0) lines.push('No targets configured.');
  r.targets.forEach((t: any) =>
    lines.push(`- ${t.name}: ${t.targetReduction}% below ${t.baselineYear} baseline (${t.baselineEmissions.toLocaleString()} kg CO2e) by ${t.targetYear}`)
  );
  lines.push('');
  lines.push('## 10. Inventory controls');
  lines.push(`- Calculations in period: ${r.inventoryControls.calculationsInPeriod} (${r.inventoryControls.lockedCalculations} locked/published)`);
  lines.push(`- Audit-trail entries in period: ${r.inventoryControls.auditTrailEntriesInPeriod}`);
  lines.push('');
  lines.push('## 11. Uncertainty statement');
  lines.push(r.uncertaintyStatement);
  lines.push('');
  return lines.join('\n');
}

interface DashboardData {
  totalEmissions: {
    scope1: number;
    scope2: number;
    scope3: number;
    total: number;
  };
  recentCalculations: any[];
  emissionsTrend: any[];
  categoryBreakdown: any[];
  organizationStats: {
    totalCalculations: number;
    lastCalculationDate: Date | null;
    avgMonthlyEmissions: number;
  };
}

export const getDashboardData = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }

  const organizationId = req.user.organizationId;
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  // Get recent calculations (last 12 months)
  const recentCalculations = await Calculation.find({
    organizationId,
    createdAt: { $gte: twelveMonthsAgo },
    status: 'completed',
  })
    .populate('userId', 'name')
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  // Calculate total emissions
  const totalEmissions = recentCalculations.reduce(
    (acc, calc) => ({
      scope1: acc.scope1 + calc.emissions.scope1,
      scope2: acc.scope2 + calc.emissions.scope2,
      scope3: acc.scope3 + calc.emissions.scope3,
      total: acc.total + calc.emissions.total,
    }),
    { scope1: 0, scope2: 0, scope3: 0, total: 0 }
  );

  // Get emissions trend (monthly aggregation)
  const trendData = await Calculation.aggregate([
    {
      $match: {
        organizationId: req.user.organizationId,
        createdAt: { $gte: twelveMonthsAgo },
        status: 'completed',
      },
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
        },
        scope1: { $sum: '$emissions.scope1' },
        scope2: { $sum: '$emissions.scope2' },
        scope3: { $sum: '$emissions.scope3' },
        total: { $sum: '$emissions.total' },
        count: { $sum: 1 },
      },
    },
    {
      $sort: { '_id.year': 1, '_id.month': 1 },
    },
  ]);

  // Get category breakdown
  const categoryBreakdown = await Calculation.aggregate([
    {
      $match: {
        organizationId: req.user.organizationId,
        createdAt: { $gte: twelveMonthsAgo },
        status: 'completed',
      },
    },
    { $unwind: '$data' },
    {
      $lookup: {
        from: 'emissioncategories',
        localField: 'data.categoryId',
        foreignField: '_id',
        as: 'category',
      },
    },
    { $unwind: '$category' },
    {
      $group: {
        _id: {
          categoryId: '$data.categoryId',
          categoryName: '$category.category',
          scope: '$category.scope',
        },
        totalEmissions: { $sum: '$data.emissions' },
        calculationCount: { $sum: 1 },
      },
    },
    {
      $sort: { totalEmissions: -1 },
    },
    { $limit: 10 },
  ]);

  // Organization stats
  const [totalCalculations, lastCalculation] = await Promise.all([
    Calculation.countDocuments({ organizationId, status: 'completed' }),
    Calculation.findOne({ organizationId, status: 'completed' })
      .sort({ createdAt: -1 })
      .select('createdAt')
      .lean(),
  ]);

  const avgMonthlyEmissions = trendData.length > 0 
    ? trendData.reduce((sum, item) => sum + item.total, 0) / trendData.length 
    : 0;

  const dashboardData: DashboardData = {
    totalEmissions,
    recentCalculations: recentCalculations.slice(0, 5), // Limit to 5 for dashboard
    emissionsTrend: trendData,
    categoryBreakdown,
    organizationStats: {
      totalCalculations,
      lastCalculationDate: lastCalculation?.createdAt || null,
      avgMonthlyEmissions,
    },
  };

  ApiResponseUtil.success(res, dashboardData);
});

export const getEmissionsReport = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }

  const { startDate, endDate, scope, category } = req.query;

  const filter: any = {
    organizationId: req.user.organizationId,
    status: 'completed',
  };

  // Date range filter
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate as string);
    if (endDate) filter.createdAt.$lte = new Date(endDate as string);
  }

  const calculations = await Calculation.find(filter)
    .populate('userId', 'name email')
    .populate('data.categoryId', 'category scope description')
    .sort({ createdAt: -1 })
    .lean();

  // Filter by scope and category if provided
  let filteredData = calculations;
  if (scope || category) {
    filteredData = calculations.map(calc => ({
      ...calc,
      data: calc.data.filter((item: any) => {
        const matchScope = scope ? item.categoryId.scope === parseInt(scope as string) : true;
        const matchCategory = category ? item.categoryId._id.toString() === category : true;
        return matchScope && matchCategory;
      }),
    })).filter(calc => calc.data.length > 0);
  }

  // Calculate summary statistics
  const summary = filteredData.reduce(
    (acc, calc) => ({
      scope1: acc.scope1 + calc.emissions.scope1,
      scope2: acc.scope2 + calc.emissions.scope2,
      scope3: acc.scope3 + calc.emissions.scope3,
      total: acc.total + calc.emissions.total,
      calculationCount: acc.calculationCount + 1,
    }),
    { scope1: 0, scope2: 0, scope3: 0, total: 0, calculationCount: 0 }
  );

  ApiResponseUtil.success(res, {
    calculations: filteredData,
    summary,
    period: {
      startDate: startDate || 'All time',
      endDate: endDate || 'All time',
    },
    filters: { scope, category },
  });
});

export const getComparisonReport = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }

  const { startDate, endDate, compareToDate } = req.query;

  if (!compareToDate) {
    return ApiResponseUtil.error(res, 'Comparison date is required', 400);
  }

  const baseFilter = {
    organizationId: req.user.organizationId,
    status: 'completed',
  };

  // Current period
  const currentFilter: any = { ...baseFilter };
  if (startDate && endDate) {
    currentFilter.createdAt = {
      $gte: new Date(startDate as string),
      $lte: new Date(endDate as string),
    };
  }

  // Comparison period
  const compareDate = new Date(compareToDate as string);
  const comparisonFilter = {
    ...baseFilter,
    createdAt: { $lt: compareDate },
  };

  const [currentCalculations, comparisonCalculations] = await Promise.all([
    Calculation.find(currentFilter).lean(),
    Calculation.find(comparisonFilter).lean(),
  ]);

  const currentSummary = currentCalculations.reduce(
    (acc, calc) => ({
      scope1: acc.scope1 + calc.emissions.scope1,
      scope2: acc.scope2 + calc.emissions.scope2,
      scope3: acc.scope3 + calc.emissions.scope3,
      total: acc.total + calc.emissions.total,
    }),
    { scope1: 0, scope2: 0, scope3: 0, total: 0 }
  );

  const comparisonSummary = comparisonCalculations.reduce(
    (acc, calc) => ({
      scope1: acc.scope1 + calc.emissions.scope1,
      scope2: acc.scope2 + calc.emissions.scope2,
      scope3: acc.scope3 + calc.emissions.scope3,
      total: acc.total + calc.emissions.total,
    }),
    { scope1: 0, scope2: 0, scope3: 0, total: 0 }
  );

  // Calculate percentage changes
  const changes = {
    scope1: comparisonSummary.scope1 > 0 
      ? ((currentSummary.scope1 - comparisonSummary.scope1) / comparisonSummary.scope1) * 100 
      : 0,
    scope2: comparisonSummary.scope2 > 0 
      ? ((currentSummary.scope2 - comparisonSummary.scope2) / comparisonSummary.scope2) * 100 
      : 0,
    scope3: comparisonSummary.scope3 > 0 
      ? ((currentSummary.scope3 - comparisonSummary.scope3) / comparisonSummary.scope3) * 100 
      : 0,
    total: comparisonSummary.total > 0 
      ? ((currentSummary.total - comparisonSummary.total) / comparisonSummary.total) * 100 
      : 0,
  };

  ApiResponseUtil.success(res, {
    current: {
      period: { startDate, endDate },
      summary: currentSummary,
      calculationCount: currentCalculations.length,
    },
    comparison: {
      period: { endDate: compareToDate },
      summary: comparisonSummary,
      calculationCount: comparisonCalculations.length,
    },
    changes,
  });
});

export const getTrendAnalysis = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }

  const { startDate, endDate, granularity = 'month' } = req.query;

  const filter: any = {
    organizationId: req.user.organizationId,
    status: 'completed',
  };

  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate as string);
    if (endDate) filter.createdAt.$lte = new Date(endDate as string);
  }

  // Build aggregation pipeline based on granularity
  const dateGrouping = granularity === 'week' 
    ? { year: { $year: '$createdAt' }, week: { $week: '$createdAt' } }
    : granularity === 'day'
    ? { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } }
    : { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }; // default month

  const trendData = await Calculation.aggregate([
    { $match: filter },
    {
      $group: {
        _id: dateGrouping,
        scope1: { $sum: '$emissions.scope1' },
        scope2: { $sum: '$emissions.scope2' },
        scope3: { $sum: '$emissions.scope3' },
        total: { $sum: '$emissions.total' },
        calculationCount: { $sum: 1 },
        averageEmissions: { $avg: '$emissions.total' },
      },
    },
    {
      $sort: { 
        '_id.year': 1, 
        '_id.month': 1, 
        '_id.week': 1, 
        '_id.day': 1 
      },
    },
  ]);

  ApiResponseUtil.success(res, {
    trends: trendData,
    granularity,
    period: {
      startDate: startDate || 'All time',
      endDate: endDate || 'All time',
    },
  });
});

export const exportReport = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }

  const { reportId } = req.params;
  const { format = 'pdf' } = req.query;

  // This is a placeholder for MVP porpose - in production implementation, would:
  // 1. Generate the actual report file (PDF, Excel, CSV)
  // 2. Store it temporarily or stream it directly
  // 3. Return the file or a download link

  ApiResponseUtil.success(res, {
    message: 'Report export functionality not implemented yet',
    reportId,
    format,
    // In production implementation, return download URL or file buffer
  });
});

export const getIndustryBenchmarks = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      return ApiResponseUtil.error(res, 'Authentication required', 401);
    }
  
    try {
      const benchmarkService = new BenchmarkService();
      
      // Get query parameters for additional options
      const { includeComparison = 'false', includeRecommendations = 'false' } = req.query;
  
      // Get industry benchmarks
      const benchmarks = await benchmarkService.getIndustryBenchmarks(req.user.organizationId);
  
      let response: any = benchmarks;
  
      // Include comparison if requested
      if (includeComparison === 'true') {
        try {
          const comparison = await benchmarkService.compareOrganizationToBenchmarks(req.user.organizationId);
          response.comparison = comparison;
        } catch (error) {
          // If comparison fails, just log it and continue without comparison
          console.warn('Could not generate comparison:', (error instanceof Error ? error.message : String(error)));
          response.comparison = {
            available: false,
            reason: 'No completed calculations available for comparison',
          };
        }
      }
  
      // Include detailed recommendations if requested
      if (includeRecommendations === 'true' && response.comparison) {
        response.detailedRecommendations = response.comparison.recommendations;
      }
  
      ApiResponseUtil.success(res, response);
    } catch (error) {
      console.error('Error fetching industry benchmarks:', error);
      
      // Fallback to basic response if database query fails
      const fallbackResponse = {
        industry: 'Unknown',
        region: 'global',
        year: new Date().getFullYear(),
        benchmarks: {
          scope1: { average: 0, percentile25: 0, percentile75: 0 },
          scope2: { average: 0, percentile25: 0, percentile75: 0 },
          scope3: { average: 0, percentile25: 0, percentile75: 0 },
          total: { average: 0, percentile25: 0, percentile75: 0 },
        },
        topCategories: [],
        reductionOpportunities: [],
        bestPractices: [],
        metadata: {
          sampleSize: 0,
          dataQuality: 'low' as const,
          lastUpdated: new Date(),
          source: 'System Default',
          notes: 'Benchmark data temporarily unavailable. Using default values.',
        },
        comparison: {
          available: false,
          reason: 'Benchmark data temporarily unavailable',
        },
      };
  
      ApiResponseUtil.success(res, fallbackResponse);
    }
  });