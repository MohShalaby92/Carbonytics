import { Request, Response } from 'express';
import { Calculation } from '../models/Calculation';
import { EmissionCategory } from '../models/EmissionCategory';
import { Organization } from '../models/Organization';
import { Facility } from '../models/Facility';
import { Supplier, deriveEngagementStatus } from '../models/Supplier';
import { computeCompleteness } from '../services/completenessService';
import { User } from '../models/User';
import { EmissionFactor } from '../models/EmissionFactor';
import { AuditLog } from '../models/AuditLog';
import { CalculationSnapshot } from '../models/CalculationSnapshot';
import { Inventory } from '../models/Inventory';
import { Evidence } from '../models/Evidence';
import { midpointYear } from '../services/inventoryService';
import { computeConsolidation, ConsolidationApproach } from '../services/consolidationService';
import { classifyEntryDataType, summarizeDataTypeShares, DataType } from '../services/dataQuality';
import { GWP_SETS, DEFAULT_GWP_SET, isGwpSetName } from '../data/gwpSets';
import { CONSERVATIVENESS_UPLIFT } from '../services/estimationService';
import { ApiResponseUtil } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthenticatedRequest } from '../types';
import { BenchmarkService } from '../services/benchmarkService';
import { renderInventoryPdf, renderInventoryDocx, renderInventoryXlsx } from '../services/reportRenderers';

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
  const [organization, facilities, calculations, auditCount, suppliers] = await Promise.all([
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
    Supplier.find({ organizationId: user.organizationId, isActive: true }).lean(),
  ]);

  if (!organization) {
    throw new Error('Organization not found');
  }

  const completeness = await computeCompleteness({
    organizationId: user.organizationId,
    start,
    end,
  });

  // GWP-set resolution with per-inventory-year locking: a PUBLISHED reporting
  // year reports the GWP set frozen at publish, so historical inventories don't
  // shift when the org later switches AR4/AR5/AR6. An open (draft/review) year,
  // or a period with no inventory, uses the org's current set.
  const liveGwpSet = isGwpSetName(organization.settings?.gwpSet)
    ? organization.settings!.gwpSet!
    : DEFAULT_GWP_SET;
  const reportingYear = midpointYear(start, end);
  const inventoryDoc = await Inventory.findOne({
    organizationId: user.organizationId,
    reportingYear,
  }).lean();
  const gwpSetPinned =
    (inventoryDoc as any)?.status === 'published' && isGwpSetName((inventoryDoc as any)?.gwpSet);
  const gwpSet = gwpSetPinned ? ((inventoryDoc as any).gwpSet as typeof liveGwpSet) : liveGwpSet;

  // Totals by scope + per-category breakdown with method mix.
  const byScope = { scope1: 0, scope2: 0, scope3: 0, total: 0 };
  const byCategory: Record<string, { scope: number; subcategory?: string; emissions: number; methods: Record<string, number>; entries: number; primary: number; secondary: number; estimated: number }> = {};
  // Org-wide primary/secondary/estimated data-source split (§5).
  const dataTypeItems: { emissions: number; dataType: DataType }[] = [];
  const dual = { locationBased: 0, marketBased: 0, electricityEntries: 0, methods: new Set<string>() };
  const quality = { high: 0, medium: 0, low: 0, unrated: 0 };
  // PCAF-style weighted DQ (emissions-weighted) + estimated-data share.
  let dqWeighted = 0, dqEmissions = 0, estimateCount = 0, estimateEmissions = 0, totalEntryEmissions = 0;
  // Supplier-specific (primary-data) entry share.
  let supplierEntryCount = 0, supplierEntryEmissions = 0;
  const factorRegister = new Map<string, { name: string; source?: string; year?: number; uses: number }>();
  let lockedCount = 0;
  let verifiedCount = 0;
  // Biogenic CO2 (biomass combustion) — accumulated as a MEMO item, reported
  // OUTSIDE the Scope 1/2/3 totals per the GHG Protocol.
  let biogenicCO2 = 0;
  // Per-gas breakdown (§1.4): in-scope gas masses summed over entries computed
  // via the per-gas path. CO2e-denominated (embedded) entries have no split.
  const perGasMass = { co2: 0, ch4: 0, n2o: 0 };
  let perGasEntries = 0;
  let perGasEntryCo2e = 0;

  for (const calc of calculations) {
    byScope.scope1 += calc.emissions?.scope1 || 0;
    byScope.scope2 += calc.emissions?.scope2 || 0;
    byScope.scope3 += calc.emissions?.scope3 || 0;
    if ((calc as any).status === 'locked') lockedCount++;
    if ((calc as any).verification?.verified) verifiedCount++;

    for (const entry of calc.data || []) {
      const cat: any = entry.categoryId;
      const name = cat?.category || 'Unknown';
      if (!byCategory[name]) {
        byCategory[name] = { scope: cat?.scope || 0, subcategory: cat?.subcategory, emissions: 0, methods: {}, entries: 0, primary: 0, secondary: 0, estimated: 0 };
      }
      byCategory[name].emissions += entry.emissions || 0;
      byCategory[name].entries += 1;
      const method = (entry as any).method || 'unspecified';
      byCategory[name].methods[method] = (byCategory[name].methods[method] || 0) + (entry.emissions || 0);

      // Primary vs secondary data-source split (§5), per category + org-wide.
      const dataType = classifyEntryDataType({
        method: (entry as any).method,
        supplierId: (entry as any).supplierId,
        isEstimate: (entry as any).isEstimate,
      });
      byCategory[name][dataType] += entry.emissions || 0;
      dataTypeItems.push({ emissions: entry.emissions || 0, dataType });

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
      if ((entry as any).supplierId) {
        supplierEntryCount++;
        supplierEntryEmissions += em;
      }
      if ((entry as any).biogenicCO2) {
        biogenicCO2 += (entry as any).biogenicCO2;
      }
      const gb = (entry as any).gasBreakdown;
      if (gb && ((gb.co2 || 0) || (gb.ch4 || 0) || (gb.n2o || 0))) {
        perGasMass.co2 += gb.co2 || 0;
        perGasMass.ch4 += gb.ch4 || 0;
        perGasMass.n2o += gb.n2o || 0;
        perGasEntries += 1;
        perGasEntryCo2e += em;
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
  biogenicCO2 = Math.round(biogenicCO2 * 100) / 100;

  // Per-gas breakdown (§1.4): the engine separates CO2/CH4/N2O only for factors
  // that carry per-gas values; CO2e-denominated (embedded) factors report a
  // single CO2e number that cannot be split. Masses below are exact (GWP-
  // independent); their CO2e is shown under the report's GWP set. The remainder
  // (co2eNotSeparated) is the CO2e from embedded factors. Biogenic CO2 is a
  // separate memo (above) and is excluded here.
  const r4 = (v: number) => Math.round(v * 10000) / 10000;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const gwpV = GWP_SETS[gwpSet].values;
  const totalEntries = quality.high + quality.medium + quality.low + quality.unrated;
  const perGasCo2e = {
    co2: r2(perGasMass.co2 * gwpV.co2),
    ch4: r2(perGasMass.ch4 * gwpV.ch4),
    n2o: r2(perGasMass.n2o * gwpV.n2o),
  };
  const perGas = {
    available: perGasEntries > 0,
    entriesWithPerGas: perGasEntries,
    entriesTotal: totalEntries,
    gwpSet,
    massKg: { co2: r4(perGasMass.co2), ch4: r4(perGasMass.ch4), n2o: r4(perGasMass.n2o) },
    co2eByGas: perGasCo2e,
    perGasSubtotalCo2e: r2(perGasCo2e.co2 + perGasCo2e.ch4 + perGasCo2e.n2o),
    co2eNotSeparated: r2(byScope.total - perGasEntryCo2e),
    note:
      perGasEntries > 0
        ? `Per-gas masses cover ${perGasEntries} of ${totalEntries} entries (those computed with per-gas factors). CO2e is shown under ${gwpSet}. The remaining ${r2(byScope.total - perGasEntryCo2e).toLocaleString()} kg CO2e comes from CO2e-denominated factors whose gases are not separated. Biogenic CO2 is a separate memo.`
        : 'No per-gas factors were used in this period: all entries used CO2e-denominated factors (no gas split available). Biogenic CO2, if any, is a separate memo.',
  };

  // Intensity metrics: total emissions over each denominator recorded for the
  // reporting year (year of the period midpoint, so fiscal years resolve to
  // the year they mostly cover). Unrounded division, rounded once for output.
  const midpoint = new Date((start.getTime() + end.getTime()) / 2);
  const intensityYear = midpoint.getFullYear();
  const yearDenominators = (organization.denominators || []).filter((d) => d.year === intensityYear);
  const intensity = {
    year: intensityYear,
    metrics: yearDenominators
      .filter((d) => d.value > 0)
      .map((d) => ({
        metric: d.metric,
        label: d.label || d.metric.replace(/_/g, ' '),
        denominatorValue: d.value,
        denominatorUnit: d.unit,
        // 6 significant digits: per-EGP intensities are tiny, per-FTE are not —
        // fixed decimal places would zero out one or bloat the other.
        intensityKgCo2ePerUnit: Number((byScope.total / d.value).toPrecision(6)),
      })),
    note:
      yearDenominators.length === 0
        ? `No denominators recorded for ${intensityYear} — add them under Compliance → Intensity & Denominators to report intensity metrics.`
        : undefined,
  };

  // Supplier engagement (Scope 3 method hierarchy): registry size, request
  // lifecycle counts for requests whose period overlaps the reporting period,
  // and the share of emissions computed from supplier-specific factors.
  const requestsInPeriod = suppliers.flatMap((s: any) =>
    (s.dataRequests || []).filter(
      (r: any) => new Date(r.period?.start) <= end && new Date(r.period?.end) >= start
    )
  );
  const supplierEngagement = {
    suppliers: suppliers.length,
    engagementStatuses: {
      notEngaged: suppliers.filter((s: any) => deriveEngagementStatus(s) === 'not_engaged').length,
      awaitingResponse: suppliers.filter((s: any) => deriveEngagementStatus(s) === 'awaiting_response').length,
      dataReceived: suppliers.filter((s: any) => deriveEngagementStatus(s) === 'data_received').length,
      dataIntegrated: suppliers.filter((s: any) => deriveEngagementStatus(s) === 'data_integrated').length,
    },
    dataRequestsInPeriod: {
      total: requestsInPeriod.length,
      sent: requestsInPeriod.filter((r: any) => r.status === 'sent').length,
      received: requestsInPeriod.filter((r: any) => r.status === 'received').length,
      fulfilled: requestsInPeriod.filter((r: any) => r.status === 'fulfilled').length,
      declined: requestsInPeriod.filter((r: any) => r.status === 'declined').length,
    },
    supplierSpecificData: {
      entries: supplierEntryCount,
      emissionsKgCo2e: Math.round(supplierEntryEmissions * 100) / 100,
      emissionsShare:
        totalEntryEmissions > 0
          ? Math.round((supplierEntryEmissions / totalEntryEmissions) * 1000) / 10
          : 0,
    },
  };

  // Consolidation roll-up (§1.2): gross (100%) vs the org's reported share under
  // its consolidation approach, with equity / control / M&A pro-rating per entity.
  const consolidationApproach = (organization.consolidationApproach || 'operational_control') as ConsolidationApproach;
  const consolidation = await computeConsolidation({
    organizationId: user.organizationId,
    start,
    end,
    approach: consolidationApproach,
  });

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
        entityType: f.entityType || 'site',
        parentFacilityId: f.parentFacilityId ? String(f.parentFacilityId) : null,
        ownershipPercent: f.ownershipPercent,
        operationalControl: f.operationalControl,
        financialControl: f.financialControl,
      })),
    },
    reportingPeriod: { start: start.toISOString(), end: end.toISOString() },
    // Reporting-year inventory wrapper (lifecycle status + frozen figures).
    inventory: inventoryDoc
      ? {
          reportingYear: (inventoryDoc as any).reportingYear,
          status: (inventoryDoc as any).status,
          isBaseYear: !!(inventoryDoc as any).isBaseYear,
          gwpSet: (inventoryDoc as any).gwpSet,
          gwpSetPinned,
          publishedAt: (inventoryDoc as any).publishedAt,
          publishedBy: (inventoryDoc as any).publishedBy,
          frozenTotals: (inventoryDoc as any).frozenTotals,
          frozenCompletenessPercent: (inventoryDoc as any).frozenCompletenessPercent,
          recalcThresholdPercent: (inventoryDoc as any).recalcThresholdPercent,
        }
      : { reportingYear, status: 'none', note: `No reporting-year inventory exists for ${reportingYear}.` },
    methodology: {
      standard: 'GHG Protocol Corporate Standard (operational alignment); ISO 14064-1 informed',
      gwpSet,
      gwpSource: GWP_SETS[gwpSet].label,
      // True when the reporting year is published and the GWP set is frozen to
      // the inventory (so it no longer follows the org's live setting).
      gwpSetPinned,
      gwpSetNote: gwpSetPinned
        ? `GWP set pinned to the published ${reportingYear} inventory; the organization's current set is ${liveGwpSet}.`
        : `GWP set follows the organization's current selection (${liveGwpSet}); it will be frozen when the ${reportingYear} reporting year is published.`,
      factorPolicy:
        'Egyptian emission factors are the primary default; supplier-specific (custom) or other regional factors are applied when explicitly selected by the user. Factor vintage is matched to the activity year.',
      scope2Note:
        'Dual reporting: location-based uses the Egyptian grid-average factor; market-based uses supplier-specific rates where chosen, otherwise grid average (no contractual-instrument market in Egypt).',
      tool: 'Carbonytics',
    },
    emissions: {
      unit: 'kg CO2e',
      byScope,
      // Biogenic CO2 (biomass combustion) reported SEPARATELY as a memo item,
      // EXCLUDED from byScope per the GHG Protocol. Biomass CH4/N2O stay in Scope 1.
      biogenicCO2,
      // Per-gas breakdown (CO2/CH4/N2O masses + CO2e) for per-gas factors (§1.4).
      perGas,
      scope2Dual: {
        locationBased: dual.locationBased,
        marketBased: dual.marketBased,
        electricityEntries: dual.electricityEntries,
        methodsUsed: Array.from(dual.methods),
      },
      byCategory: Object.entries(byCategory)
        .map(([category, v]) => {
          const total = v.primary + v.secondary + v.estimated;
          const pct = (x: number) => (total > 0 ? Math.round((x / total) * 1000) / 10 : 0);
          return {
            category,
            scope: v.scope,
            subcategory: v.subcategory,
            emissions: Math.round(v.emissions * 100) / 100,
            methods: v.methods,
            entries: v.entries,
            // Primary vs secondary data-source share for this category (§5).
            dataSources: {
              primaryEmissions: Math.round(v.primary * 100) / 100,
              secondaryEmissions: Math.round(v.secondary * 100) / 100,
              estimatedEmissions: Math.round(v.estimated * 100) / 100,
              primarySharePercent: pct(v.primary),
              secondarySharePercent: pct(v.secondary + v.estimated),
            },
          };
        })
        .sort((a, b) => b.emissions - a.emissions),
    },
    // Consolidation roll-up: gross vs the org's reported share (§1.2).
    consolidation,
    intensity,
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
      // Org-wide primary vs secondary data-source share (§5). Primary =
      // supplier-specific / material-balance (directly sourced); secondary =
      // database/average factor; estimated = gap-filled (weakest secondary).
      dataSources: summarizeDataTypeShares(dataTypeItems),
    },
    supplierEngagement,
    completeness,
    factorRegister: Array.from(factorRegister.values()).sort((a, b) => b.uses - a.uses),
    exclusions: organization.exclusions || [],
    targets: organization.targets || [],
    inventoryControls: {
      calculationsInPeriod: calculations.length,
      lockedCalculations: lockedCount,
      verifiedCalculations: verifiedCount,
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

  const format = (req.query.format as string) || 'json';
  const stem = `ghg_inventory_${start.toISOString().split('T')[0]}_${end.toISOString().split('T')[0]}`;
  // Binary/document exports of the same report object (markdown spine).
  const exports: Record<string, { type: string; ext: string; build: () => Promise<Buffer> | Buffer }> = {
    markdown: { type: 'text/markdown; charset=utf-8', ext: 'md', build: () => Buffer.from(renderInventoryMarkdown(report)) },
    pdf: { type: 'application/pdf', ext: 'pdf', build: () => renderInventoryPdf(report) },
    docx: { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx', build: () => renderInventoryDocx(report) },
    xlsx: { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx', build: () => renderInventoryXlsx(report) },
  };

  if (exports[format]) {
    const { type, ext, build } = exports[format];
    const body = await build();
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Disposition', `attachment; filename="${stem}.${ext}"`);
    return res.send(body);
  }

  ApiResponseUtil.success(res, report);
});

/**
 * Completeness assessment (GHG Protocol completeness principle): relevant
 * categories vs covered/excluded/gap, per scope, for the reporting period.
 */
export const getCompletenessReport = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }
  const { start, end } = parsePeriod(req);
  const completeness = await computeCompleteness({
    organizationId: req.user.organizationId,
    start,
    end,
  });
  ApiResponseUtil.success(res, completeness);
});

/**
 * Consolidation roll-up (§1.2): gross vs the org's reported share for the
 * period. Defaults to the org's configured consolidation approach; `?approach=`
 * (equity_share | operational_control | financial_control) overrides it so the
 * approaches can be compared side by side.
 */
export const getConsolidationReport = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }
  const { start, end } = parsePeriod(req);

  const valid: ConsolidationApproach[] = ['equity_share', 'operational_control', 'financial_control'];
  let approach = req.query.approach as ConsolidationApproach | undefined;
  if (approach && !valid.includes(approach)) {
    return ApiResponseUtil.error(res, `approach must be one of: ${valid.join(', ')}`, 400);
  }
  if (!approach) {
    const org = await Organization.findById(req.user.organizationId).select('consolidationApproach').lean();
    approach = ((org as any)?.consolidationApproach || 'operational_control') as ConsolidationApproach;
  }

  const result = await computeConsolidation({
    organizationId: req.user.organizationId,
    start,
    end,
    approach,
  });
  ApiResponseUtil.success(res, result);
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

  // Per-data-line evidence (§4.3): index the evidence for this period's
  // calculations so each register row carries its attachment chain — the
  // sampling/traceability surface a verifier needs.
  const evidenceDocs = await Evidence.find({
    organizationId: req.user.organizationId,
    calculationId: { $in: calcs.map((c: any) => c._id) },
  })
    .select('calculationId entryIndex filename contentType size sha256 uploadedByEmail createdAt')
    .lean();
  const evidenceByLine = new Map<string, any[]>();
  for (const ev of evidenceDocs as any[]) {
    const key = `${ev.calculationId.toString()}:${ev.entryIndex}`;
    const list = evidenceByLine.get(key) || [];
    list.push({
      id: ev._id.toString(),
      filename: ev.filename,
      contentType: ev.contentType,
      size: ev.size,
      sha256: ev.sha256,
      uploadedByEmail: ev.uploadedByEmail,
      uploadedAt: ev.createdAt,
      downloadPath: `/api/evidence/${ev._id.toString()}/download`,
    });
    evidenceByLine.set(key, list);
  }

  // Flat activity-data register: every entry with its full provenance chain —
  // the sampling surface for a verifier.
  const activityRegister = calcs.flatMap((c: any) =>
    (c.data || []).map((e: any, idx: number) => {
      const evidence = evidenceByLine.get(`${c._id.toString()}:${idx}`) || [];
      return {
        calculationId: c._id.toString(),
        calculationTitle: c.title,
        entryIndex: idx,
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
        factorVersion: e.factorVersion,
        gwpSet: e.gwpSet,
        gwpApplied: e.gwpApplied,
        method: e.method,
        supplierId: e.supplierId,
        supplierName: e.supplierName,
        quality: e.quality,
        dqScore: e.dqScore,
        isEstimate: e.isEstimate,
        estimationMethod: e.estimationMethod,
        scope2Location: e.scope2Location,
        scope2Market: e.scope2Market,
        scope2MarketMethod: e.scope2MarketMethod,
        notes: e.notes,
        evidenceCount: evidence.length,
        evidence,
      };
    })
  );

  const linesWithEvidence = activityRegister.filter((r: any) => r.evidenceCount > 0).length;

  ApiResponseUtil.success(res, {
    inventoryReport: report,
    activityRegister,
    evidenceSummary: {
      totalAttachments: evidenceDocs.length,
      dataLinesTotal: activityRegister.length,
      dataLinesWithEvidence: linesWithEvidence,
      coveragePercent:
        activityRegister.length > 0
          ? Math.round((linesWithEvidence / activityRegister.length) * 1000) / 10
          : 0,
    },
    auditTrail: audit.map((a: any) => ({ ...a, id: a._id.toString() })),
    snapshots: snapshots.map((s: any) => ({ ...s, id: s._id.toString() })),
    contents: ['inventoryReport', 'activityRegister', 'evidenceSummary', 'auditTrail', 'snapshots'],
    note: 'Per-data-line evidence attachments are included (§4.3): each activity-register row carries its evidence chain with download links; audit extract capped at 500 entries.',
  });
});

/**
 * Inventory Management Plan (IMP) — the GHGP/ISO 14064-1 process document
 * describing HOW the inventory is produced: boundary, roles, methodology,
 * data management, QA/QC controls, DQ rubric, base-year and recalculation
 * policy. Auto-generated from the organization's live configuration so it
 * never drifts from actual system behavior. Also the canonical place where
 * the rounding policy is documented (gap analysis §2.1).
 */
async function buildInventoryManagementPlan(
  user: { organizationId: string; email: string },
  start: Date,
  end: Date
) {
  const [organization, facilities, users, factorTotal, customFactors] = await Promise.all([
    Organization.findById(user.organizationId),
    Facility.find({ organizationId: user.organizationId, isActive: true }).lean(),
    User.find({ organizationId: user.organizationId, isActive: true })
      .select('email role name')
      .lean(),
    EmissionFactor.countDocuments({ isActive: true, organizationId: { $exists: false } }),
    EmissionFactor.countDocuments({ isActive: true, organizationId: user.organizationId }),
  ]);

  if (!organization) {
    throw new Error('Organization not found');
  }

  const gwpSet = isGwpSetName(organization.settings?.gwpSet)
    ? organization.settings!.gwpSet!
    : DEFAULT_GWP_SET;

  const byRole = (role: string) =>
    users.filter((u: any) => u.role === role).map((u: any) => `${u.name} <${u.email}>`);

  return {
    title: `Inventory Management Plan — ${organization.name}`,
    generatedAt: new Date().toISOString(),
    generatedBy: user.email,
    autoGenerated:
      'This IMP is generated from the live system configuration; statements below describe enforced behavior, not aspirations.',
    organization: {
      name: organization.name,
      industry: organization.industry,
      country: organization.country,
      consolidationApproach: organization.consolidationApproach || 'operational_control',
      facilities: facilities.map((f: any) => ({
        name: f.name,
        country: f.country,
        city: f.city,
        ownershipPercent: f.ownershipPercent,
        operationalControl: f.operationalControl,
      })),
    },
    rolesAndResponsibilities: {
      inventoryAdministrators: byRole('admin'),
      inventoryManagers: byRole('manager'),
      contributors: byRole('user'),
      note: 'Administrators control users, settings and the audit trail; managers may additionally lock/unlock calculations, manage facilities, exclusions, denominators and custom factors; contributors enter and calculate data.',
    },
    reportingPeriod: {
      start: start.toISOString(),
      end: end.toISOString(),
      note: 'Arbitrary fiscal years are supported; calculations are grouped by their activity period.',
    },
    methodology: {
      standard: 'GHG Protocol Corporate Standard (operational alignment); ISO 14064-1 informed',
      gwpSet,
      gwpSource: GWP_SETS[gwpSet].label,
      gwpApplication:
        'Factors carrying true per-gas masses are converted gas-by-gas with the selected GWP set (gwpApplied=per-gas); factors already denominated in kg CO2e are used as-is (gwpApplied=embedded). GWPs are never applied twice.',
      factorSelectionPolicy:
        'Tier order: Egyptian shared factors (primary default) → organization custom (supplier-specific) → global → other regions; within a tier the vintage closest to (and not after) the activity year wins. Explicit user selection always overrides.',
      scope2:
        'Dual reporting per the Scope 2 Guidance: location-based uses the Egyptian grid-average factor; market-based uses supplier-specific rates where configured, otherwise grid average (no contractual-instrument market in Egypt).',
      units:
        'Unit conversions use a fixed table; unknown unit pairs fail loudly rather than guessing. HHV/LHV energy-basis and imperial energy units are not yet supported.',
      roundingPolicy:
        'Intermediate arithmetic is unrounded; each stored entry is rounded to 2 decimal places (kg CO2e) once at save, and scope/period totals are re-rounded once at aggregation. Reports show stored values without further rounding.',
    },
    dataManagement: {
      collection:
        'Activity data enters via the guided calculator (per-category forms with required inputs) or CSV/XLSX import with row-level validation; entries without a valid unit are rejected.',
      supplierEngagement:
        'Suppliers are registered with the categories they feed; data requests are tracked through a sent → received → fulfilled/declined lifecycle. Supplier data lands as a supplier-linked custom factor (entries computed with it record the supplier-specific method and DQ 1) or as linked activity data; every step is audited.',
      estimationPolicy: `Gaps are filled only on explicit request, using the documented hierarchy: same-period-prior-year → adjacent-period-average → intensity-proxy (denominator-scaled). Every suggestion carries a +${CONSERVATIVENESS_UPLIFT_PCT}% conservativeness uplift (ISO: do not underestimate); saved estimates are flagged isEstimate with the method stored verbatim, forced to quality=low and DQ 5, and are never chained off other estimates. Gaps with no usable proxy are directed to manual entry or the exclusions register.`,
      denominators:
        (organization.denominators || []).length > 0
          ? (organization.denominators || []).map(
              (d: any) => `${d.year} ${d.label || d.metric}: ${d.value.toLocaleString()} ${d.unit}`
            )
          : ['No denominator series recorded yet.'],
    },
    qaqcControls: [
      'Locked (published) calculations are immutable at the model layer; corrections require an audited unlock by an admin/manager.',
      'A versioned snapshot is recorded at every lock; restatement diffs between any two versions are available on demand.',
      'An append-only audit trail records who/when/before/after for calculations, locks, factors, settings, facilities, exclusions, denominators and imports.',
      'Factor-vintage staleness triggers a warning and a data-quality penalty instead of silent acceptance.',
      'Custom emission factors are restricted to admins/managers and visually marked; shared library factors are never silently overwritten by imports (idempotent upsert by factor code).',
      'Tenant isolation is enforced in every query; cross-organization factor references are rejected.',
    ],
    dataQualityRubric: {
      scale: 'PCAF-style 1 (best) … 5 (worst), stored per entry and emissions-weighted in reports',
      levels: [
        '1 — organization/supplier-specific factor',
        '2 — Egyptian region-specific factor',
        '3 — global average factor',
        '4 — spend-based method or low-quality factor',
        '5 — estimated (gap-filled) entry',
      ],
    },
    factorLibrary: {
      sharedFactors: factorTotal,
      organizationCustomFactors: customFactors,
      sources: 'DEFRA/DESNZ 2024, EPA Hub 2025 (Table 10), IPCC 2006 EFDB defaults, GHGP cross-sector tool, Egyptian national factors (IEA/EEHC), organization custom entries.',
    },
    exclusions: organization.exclusions || [],
    baseYearAndRecalculation: {
      targets: organization.targets || [],
      recalculationPolicy:
        'Restatements of published figures occur only through the audited unlock → correct → re-lock path, each producing a new snapshot version with the operator and comment recorded. A formal significance threshold (e.g. 5% of base-year emissions) and frozen base-year inventories await the reporting-year object (planned).',
    },
    improvementPlan: [
      'Evidence attachments per data line (planned).',
      'Factor version history for in-place edits (planned).',
      'Reporting-year object: per-year GWP locking, frozen base year, recalculation threshold engine (planned).',
      'PDF/DOCX report rendering (currently markdown/JSON).',
      'Hard publish gate on the full-year inventory (soft completeness gate on lock is in place).',
    ],
  };
}

const CONSERVATIVENESS_UPLIFT_PCT = CONSERVATIVENESS_UPLIFT * 100;

export const getInventoryManagementPlan = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }
  const { start, end } = parsePeriod(req);
  const imp = await buildInventoryManagementPlan(req.user, start, end);

  if ((req.query.format as string) === 'markdown') {
    const md = renderImpMarkdown(imp);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="imp_${start.toISOString().split('T')[0]}_${end.toISOString().split('T')[0]}.md"`
    );
    return res.send(md);
  }

  ApiResponseUtil.success(res, imp);
});

// kg CO2e → metric tonnes CO2e (CDP/SBTi report in tonnes), 3 dp.
const toTonnes = (kg: number) => Math.round((kg / 1000) * 1000) / 1000;

/**
 * Full Scope 2 location-based and market-based totals (kg CO2e) from a GHG
 * inventory report. The stored headline `byScope.scope2` is the MARKET-based
 * figure: computeScope2Dual sets marketBased = the entry's emissions, and the
 * Egyptian grid-average fallback makes location == market. Swapping the
 * electricity market figure for its location figure yields the location-based
 * total while preserving any NON-electricity Scope 2 (purchased steam/heat/
 * cooling, identical under both methods) — which the per-electricity dual
 * figures (scope2Dual) omit. Shared by the CDP and ESRS mappings so they cannot
 * diverge.
 */
function scope2Totals(r: any): { location: number; market: number } {
  const market = r.emissions.byScope.scope2;
  const location = Math.round(
    (market - r.emissions.scope2Dual.marketBased + r.emissions.scope2Dual.locationBased) * 100
  ) / 100;
  return { location, market };
}

/**
 * CDP Climate Change questionnaire mapping. Reshapes the GHG inventory onto the
 * emissions-relevant CDP modules (C0/C5/C6/C7/C10) in metric tonnes CO2e. This
 * is a PREPARATION AID, not a submission — CDP is disclosed through CDP's own
 * portal and figures should be reviewed before filing.
 */
async function buildCdpMapping(user: { organizationId: string; email: string }, start: Date, end: Date) {
  const r = await buildGHGInventoryReport(user, start, end);
  const baseTarget = (r.targets || [])[0] as any;
  // Full Scope 2 totals (incl. non-electricity steam/heat/cooling), not the
  // electricity-only dual figures, so non-electricity Scope 2 is not dropped.
  const scope2 = scope2Totals(r);

  // Scope 3 categories present, mapped to CDP C6.5 relevance rows. CDP asks for
  // the share of each category calculated from primary (supplier-specific) data.
  const scope3Categories = r.emissions.byCategory
    .filter((c: any) => c.scope === 3)
    .map((c: any) => ({
      category: c.category,
      tCO2e: toTonnes(c.emissions),
      methodsUsed: Object.keys(c.methods),
      'primary data %': c.dataSources ? c.dataSources.primarySharePercent : 0,
      'secondary data %': c.dataSources ? c.dataSources.secondarySharePercent : 0,
      relevance: 'Relevant, calculated',
    }));

  return {
    title: `CDP Climate Change mapping — ${r.organization.name}`,
    generatedAt: new Date().toISOString(),
    generatedBy: user.email,
    disclaimer:
      'Preparation aid only — not an official CDP response. Figures are mapped from the Carbonytics inventory to CDP Climate Change emissions modules (metric tonnes CO2e). Review and submit through CDP\'s own portal; some qualitative questions are not auto-fillable.',
    unit: 'metric tonnes CO2e (t CO2e)',
    C0_introduction: {
      'C0.1 organization': r.organization.name,
      'C0.2 reporting period': { start: r.reportingPeriod.start, end: r.reportingPeriod.end },
      'C0.5 boundary (consolidation approach)': r.organization.consolidationApproach,
    },
    C5_emissions_methodology: {
      'C5.1 base year': baseTarget
        ? { year: baseTarget.baselineYear, scope1and2_tCO2e: toTonnes(baseTarget.baselineEmissions) }
        : 'No base year set (configure a target/base year).',
      'C5.2 standard, protocols, methodologies': [
        r.methodology.standard,
        `GWP set: ${r.methodology.gwpSet} (${r.methodology.gwpSource})`,
      ],
    },
    C6_emissions_data: {
      'C6.1 Scope 1 (t CO2e)': toTonnes(r.emissions.byScope.scope1),
      'C6.3 Scope 2 (t CO2e)': {
        locationBased: toTonnes(scope2.location),
        marketBased: toTonnes(scope2.market),
        methodsUsed: r.emissions.scope2Dual.methodsUsed,
      },
      'C6.5 Scope 3 by category (t CO2e)': scope3Categories,
      'C6.5 Scope 3 total (t CO2e)': toTonnes(r.emissions.byScope.scope3),
      'C6.10 intensity': r.intensity.metrics.map((m: any) => ({
        denominator: `${m.denominatorValue} ${m.denominatorUnit}`,
        // CDP intensity uses tonnes per unit.
        intensity_tCO2e_per_unit: toTonnes(r.emissions.byScope.total) / m.denominatorValue,
        metric: m.label,
      })),
    },
    C7_emissions_breakdowns: {
      'C7.1 by scope': {
        scope1_tCO2e: toTonnes(r.emissions.byScope.scope1),
        scope2_location_tCO2e: toTonnes(scope2.location),
        scope2_market_tCO2e: toTonnes(scope2.market),
        scope3_tCO2e: toTonnes(r.emissions.byScope.scope3),
      },
      'C7.x by category (t CO2e)': r.emissions.byCategory.map((c: any) => ({
        category: c.category,
        scope: c.scope,
        tCO2e: toTonnes(c.emissions),
      })),
    },
    C10_verification: {
      'C10.1 verification status':
        r.inventoryControls.verifiedCalculations > 0
          ? `${r.inventoryControls.verifiedCalculations} of ${r.inventoryControls.calculationsInPeriod} calculations independently verified in-platform; ${r.inventoryControls.lockedCalculations} locked/published.`
          : 'No third-party verification recorded yet. Inventory controls: audit trail, lock/snapshot immutability, PCAF-style data-quality scoring.',
      dataQualityWeighted: r.dataQuality.weightedDqScore,
      completenessPercent: r.completeness.completenessPercent,
    },
  };
}

/**
 * SBTi target-readiness summary. Frames the inventory + targets against SBTi
 * near-term criteria (1.5°C, linear annual reduction, the Scope 3 >40% rule).
 * NOT an official SBTi validation — targets are validated by SBTi directly.
 */
async function buildSbtiSummary(user: { organizationId: string; email: string }, start: Date, end: Date) {
  const r = await buildGHGInventoryReport(user, start, end);
  const scope12 = r.emissions.byScope.scope1 + r.emissions.byScope.scope2;
  const total = r.emissions.byScope.total;
  const scope3Share = total > 0 ? Math.round((r.emissions.byScope.scope3 / total) * 1000) / 10 : 0;
  const scope3TargetRequired = scope3Share >= 40; // SBTi: Scope 3 target required if >40% of total

  // SBTi cross-sector near-term minimum: ~4.2%/yr linear reduction for 1.5°C.
  const SBTI_MIN_ANNUAL_LINEAR = 4.2;

  const targets = (r.targets || []).map((t: any) => {
    const years = Math.max(1, t.targetYear - t.baselineYear);
    const impliedAnnualLinear = Math.round((t.targetReduction / years) * 100) / 100;
    return {
      name: t.name,
      baselineYear: t.baselineYear,
      targetYear: t.targetYear,
      reductionPercent: t.targetReduction,
      impliedAnnualLinearPercent: impliedAnnualLinear,
      meetsNearTerm1p5Ambition: impliedAnnualLinear >= SBTI_MIN_ANNUAL_LINEAR,
      note:
        impliedAnnualLinear >= SBTI_MIN_ANNUAL_LINEAR
          ? `Implied ${impliedAnnualLinear}%/yr meets the ~${SBTI_MIN_ANNUAL_LINEAR}%/yr linear minimum for a 1.5°C near-term target.`
          : `Implied ${impliedAnnualLinear}%/yr is below the ~${SBTI_MIN_ANNUAL_LINEAR}%/yr linear minimum for a 1.5°C near-term target — increase ambition or shorten the horizon.`,
    };
  });

  return {
    title: `SBTi target-readiness summary — ${r.organization.name}`,
    generatedAt: new Date().toISOString(),
    generatedBy: user.email,
    disclaimer:
      'Preparation aid only — not an official SBTi validation. Science Based Targets are validated by the SBTi directly against the current criteria. This summary frames your inventory and configured targets against headline near-term criteria to gauge readiness.',
    unit: 'metric tonnes CO2e (t CO2e)',
    reportingPeriod: { start: r.reportingPeriod.start, end: r.reportingPeriod.end },
    inventory: {
      scope1_tCO2e: toTonnes(r.emissions.byScope.scope1),
      scope2_tCO2e: toTonnes(r.emissions.byScope.scope2),
      scope1and2_tCO2e: toTonnes(scope12),
      scope3_tCO2e: toTonnes(r.emissions.byScope.scope3),
      total_tCO2e: toTonnes(total),
      scope3SharePercent: scope3Share,
    },
    boundaryAndScreening: {
      scope3TargetRequired,
      scope3Rule: 'SBTi requires a Scope 3 target when Scope 3 is ≥40% of total emissions.',
      completenessPercent: r.completeness.completenessPercent,
      relevantCategoriesScreened: r.completeness.screened,
    },
    targets:
      targets.length > 0
        ? targets
        : ['No targets configured — set a base year and reduction target to assess SBTi near-term readiness.'],
    nextSteps: [
      'Confirm a base-year inventory and recalculation policy (a frozen base year is pending the reporting-year object).',
      scope3TargetRequired
        ? 'A Scope 3 target is required (Scope 3 ≥40% of total) — ensure Scope 3 categories are screened and covered.'
        : 'A Scope 3 target may still be recommended even below the 40% threshold.',
      'Submit targets to the SBTi for official validation.',
    ],
  };
}

/**
 * ESRS E1 (Climate Change) mapping for CSRD reporting. Reshapes the GHG
 * inventory onto the quantitative E1 datapoints — E1-6 gross Scope 1 / Scope 2
 * (location + market) / Scope 3 by category / total GHG (location + market) in
 * metric tonnes CO2e, plus the E1-6 GHG intensity per net revenue — and adds
 * qualitative pointers for the narrative datapoints (E1-1 transition plan, E1-4
 * targets) it can seed from configured targets. NOT an official ESRS submission:
 * ESRS disclosures sit in the management report under the CSRD and require a
 * materiality assessment, narrative datapoints and external assurance produced
 * outside this tool.
 */
async function buildEsrsE1Mapping(user: { organizationId: string; email: string }, start: Date, end: Date) {
  const r = await buildGHGInventoryReport(user, start, end);

  const scope1 = r.emissions.byScope.scope1;
  const scope3 = r.emissions.byScope.scope3;
  // Full Scope 2 location/market totals (see scope2Totals): preserves any
  // non-electricity Scope 2 (steam/heat/cooling) that the per-electricity dual
  // figures omit. Shared with the CDP mapping so the two cannot diverge.
  const { location: scope2Location, market: scope2Market } = scope2Totals(r);
  const totalMarketBased = Math.round((scope1 + scope2Market + scope3) * 100) / 100;
  const totalLocationBased = Math.round((scope1 + scope2Location + scope3) * 100) / 100;

  // Scope 3 by GHGP category (ESRS E1-6 requires the significant categories).
  const scope3ByCategory = r.emissions.byCategory
    .filter((c: any) => c.scope === 3)
    .map((c: any) => ({
      category: c.category,
      tCO2e: toTonnes(c.emissions),
      methodsUsed: Object.keys(c.methods),
    }));

  // E1-6 GHG intensity is specifically per NET REVENUE (t CO2e / monetary unit).
  const revenueDenom = (r.intensity.metrics || []).find((m: any) => m.metric === 'revenue');
  const ghgIntensityPerNetRevenue = revenueDenom
    ? {
        netRevenue: revenueDenom.denominatorValue,
        netRevenueUnit: revenueDenom.denominatorUnit,
        // 6 significant digits (per-currency intensities are tiny); tonnes per revenue unit.
        intensityLocationBased_tCO2ePerUnit: Number(
          (toTonnes(totalLocationBased) / revenueDenom.denominatorValue).toPrecision(6)
        ),
        intensityMarketBased_tCO2ePerUnit: Number(
          (toTonnes(totalMarketBased) / revenueDenom.denominatorValue).toPrecision(6)
        ),
      }
    : {
        note: `No net-revenue denominator recorded for ${r.intensity.year}. Add a "revenue" denominator under Compliance → Intensity & Denominators to disclose the ESRS E1-6 GHG intensity per net revenue.`,
      };

  const targets = (r.targets || []).map((t: any) => ({
    name: t.name,
    baselineYear: t.baselineYear,
    targetYear: t.targetYear,
    reductionPercent: t.targetReduction,
    baselineEmissions_tCO2e: toTonnes(t.baselineEmissions),
  }));

  return {
    title: `ESRS E1 Climate Change mapping — ${r.organization.name}`,
    generatedAt: new Date().toISOString(),
    generatedBy: user.email,
    standard: 'ESRS E1 Climate Change (EU CSRD / EFRAG ESRS Set 1)',
    disclaimer:
      'Preparation aid only — not an official ESRS/CSRD submission. Figures are mapped from the Carbonytics inventory onto ESRS E1 Climate Change datapoints (metric tonnes CO2e). ESRS disclosures form part of the management report under the CSRD and require a double-materiality assessment, narrative datapoints and external assurance produced outside this tool. Review with your sustainability and finance teams before filing.',
    unit: 'metric tonnes CO2e (t CO2e)',
    reportingPeriod: { start: r.reportingPeriod.start, end: r.reportingPeriod.end },
    organization: {
      name: r.organization.name,
      country: r.organization.country,
      consolidationApproach: r.organization.consolidationApproach,
    },
    'E1-1 transition plan for climate change mitigation':
      targets.length > 0
        ? 'Reduction targets are configured (see E1-4). A narrative transition plan — decarbonisation levers, locked-in emissions, CapEx alignment and Paris-compatibility — is a qualitative datapoint and must be authored separately.'
        : 'No reduction targets configured and no transition-plan narrative is stored. A transition plan is a qualitative E1-1 datapoint authored outside this tool.',
    'E1-4 targets related to climate change mitigation and adaptation':
      targets.length > 0
        ? targets
        : ['No targets configured — set a base year and reduction target under Targets to seed ESRS E1-4.'],
    'E1-5 energy consumption and mix':
      'Not auto-mapped — energy consumption and the renewable/non-renewable mix are not tracked as discrete ESRS E1-5 datapoints (the inventory holds activity data per category, not a consolidated energy register).',
    'E1-6 gross GHG emissions': {
      'Scope 1 (t CO2e)': toTonnes(scope1),
      'Scope 2 location-based (t CO2e)': toTonnes(scope2Location),
      'Scope 2 market-based (t CO2e)': toTonnes(scope2Market),
      'Scope 3 (t CO2e)': toTonnes(scope3),
      'Scope 3 by category (t CO2e)': scope3ByCategory,
      'Total GHG emissions, location-based (t CO2e)': toTonnes(totalLocationBased),
      'Total GHG emissions, market-based (t CO2e)': toTonnes(totalMarketBased),
      'Biogenic CO2 emissions (t CO2, memo — outside the scope totals)': toTonnes(r.emissions.biogenicCO2 || 0),
      'GHG intensity per net revenue (E1-6)': ghgIntensityPerNetRevenue,
      note: 'Biogenic CO2 from biomass combustion is disclosed separately as a memo item (above), outside the gross Scope 1/2/3 totals, per ESRS E1-6 and the GHG Protocol. The share of Scope 1 emissions covered by regulated emission-trading schemes is not yet tracked.',
    },
    'E1-7 GHG removals and carbon credits':
      'Not tracked — GHG removals and the cancellation of carbon credits are not recorded in the inventory yet.',
    'E1-8 internal carbon pricing':
      'Not tracked — no internal carbon-pricing scheme is configured.',
    'E1-9 anticipated financial effects':
      'Narrative/financial datapoint — anticipated financial effects from physical and transition risks are not derivable from the emissions inventory and must be authored with finance.',
    dataQualityAndAssurance: {
      completenessPercent: r.completeness.completenessPercent,
      relevantCategoriesScreened: r.completeness.screened,
      weightedDataQualityScore: r.dataQuality.weightedDqScore,
      independentlyVerifiedCalculations: r.inventoryControls.verifiedCalculations,
      lockedCalculations: r.inventoryControls.lockedCalculations,
      note: 'The CSRD requires limited assurance (phasing toward reasonable assurance). In-platform controls supporting assurance: an append-only audit trail, lock/snapshot immutability, PCAF-style data-quality scoring and independent verifier sign-off.',
    },
  };
}

export const getCdpMapping = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }
  const { start, end } = parsePeriod(req);
  const mapping = await buildCdpMapping(req.user, start, end);

  if ((req.query.format as string) === 'markdown') {
    const md = renderCdpMarkdown(mapping);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="cdp_mapping_${start.toISOString().split('T')[0]}_${end.toISOString().split('T')[0]}.md"`
    );
    return res.send(md);
  }
  ApiResponseUtil.success(res, mapping);
});

export const getSbtiSummary = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }
  const { start, end } = parsePeriod(req);
  const summary = await buildSbtiSummary(req.user, start, end);

  if ((req.query.format as string) === 'markdown') {
    const md = renderSbtiMarkdown(summary);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="sbti_summary_${start.toISOString().split('T')[0]}_${end.toISOString().split('T')[0]}.md"`
    );
    return res.send(md);
  }
  ApiResponseUtil.success(res, summary);
});

export const getEsrsE1Mapping = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }
  const { start, end } = parsePeriod(req);
  const mapping = await buildEsrsE1Mapping(req.user, start, end);

  if ((req.query.format as string) === 'markdown') {
    const md = renderEsrsMarkdown(mapping);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="esrs_e1_${start.toISOString().split('T')[0]}_${end.toISOString().split('T')[0]}.md"`
    );
    return res.send(md);
  }
  ApiResponseUtil.success(res, mapping);
});

function renderCdpMarkdown(m: any): string {
  const lines: string[] = [];
  lines.push(`# ${m.title}`);
  lines.push(`Generated ${m.generatedAt} by ${m.generatedBy}`);
  lines.push('');
  lines.push(`> ${m.disclaimer}`);
  lines.push('');
  lines.push(`All figures in **${m.unit}**.`);
  lines.push('');
  lines.push('## C0. Introduction');
  lines.push(`- C0.1 Organization: ${m.C0_introduction['C0.1 organization']}`);
  lines.push(`- C0.2 Reporting period: ${m.C0_introduction['C0.2 reporting period'].start.split('T')[0]} → ${m.C0_introduction['C0.2 reporting period'].end.split('T')[0]}`);
  lines.push(`- C0.5 Boundary (consolidation): ${m.C0_introduction['C0.5 boundary (consolidation approach)']}`);
  lines.push('');
  lines.push('## C5. Emissions methodology');
  const by = m.C5_emissions_methodology['C5.1 base year'];
  lines.push(`- C5.1 Base year: ${typeof by === 'string' ? by : `${by.year} (Scope 1+2: ${by.scope1and2_tCO2e} t CO2e)`}`);
  (m.C5_emissions_methodology['C5.2 standard, protocols, methodologies'] as string[]).forEach((s) => lines.push(`- C5.2 ${s}`));
  lines.push('');
  lines.push('## C6. Emissions data');
  lines.push(`- C6.1 Scope 1: **${m.C6_emissions_data['C6.1 Scope 1 (t CO2e)']}** t CO2e`);
  const s2 = m.C6_emissions_data['C6.3 Scope 2 (t CO2e)'];
  lines.push(`- C6.3 Scope 2 location-based: **${s2.locationBased}** · market-based: **${s2.marketBased}** t CO2e`);
  lines.push(`- C6.5 Scope 3 total: **${m.C6_emissions_data['C6.5 Scope 3 total (t CO2e)']}** t CO2e`);
  const s3 = m.C6_emissions_data['C6.5 Scope 3 by category (t CO2e)'];
  if (s3.length > 0) {
    lines.push('');
    lines.push('| Scope 3 category | t CO2e | Relevance | Methods |');
    lines.push('|---|---|---|---|');
    s3.forEach((c: any) => lines.push(`| ${c.category} | ${c.tCO2e} | ${c.relevance} | ${c.methodsUsed.join(', ')} |`));
  }
  lines.push('');
  lines.push('## C10. Verification');
  lines.push(`- ${m.C10_verification['C10.1 verification status']}`);
  lines.push(`- Weighted data-quality score: ${m.C10_verification.dataQualityWeighted ?? '—'} / 5 · Completeness: ${m.C10_verification.completenessPercent}%`);
  lines.push('');
  return lines.join('\n');
}

function renderSbtiMarkdown(s: any): string {
  const lines: string[] = [];
  lines.push(`# ${s.title}`);
  lines.push(`Generated ${s.generatedAt} by ${s.generatedBy}`);
  lines.push('');
  lines.push(`> ${s.disclaimer}`);
  lines.push('');
  lines.push(`All figures in **${s.unit}**.`);
  lines.push('');
  lines.push('## Inventory');
  lines.push(`- Scope 1+2: **${s.inventory.scope1and2_tCO2e}** t CO2e (S1 ${s.inventory.scope1_tCO2e} · S2 ${s.inventory.scope2_tCO2e})`);
  lines.push(`- Scope 3: **${s.inventory.scope3_tCO2e}** t CO2e (${s.inventory.scope3SharePercent}% of total)`);
  lines.push(`- Total: **${s.inventory.total_tCO2e}** t CO2e`);
  lines.push('');
  lines.push('## Boundary & screening');
  lines.push(`- Scope 3 target required (≥40% rule): **${s.boundaryAndScreening.scope3TargetRequired ? 'yes' : 'no'}** — ${s.boundaryAndScreening.scope3Rule}`);
  lines.push(`- Completeness: ${s.boundaryAndScreening.completenessPercent}% · relevance screened: ${s.boundaryAndScreening.relevantCategoriesScreened ? 'yes' : 'no'}`);
  lines.push('');
  lines.push('## Targets vs near-term 1.5°C ambition');
  if (Array.isArray(s.targets) && typeof s.targets[0] === 'string') {
    lines.push(s.targets[0]);
  } else {
    s.targets.forEach((t: any) => {
      lines.push(`- **${t.name}**: ${t.reductionPercent}% by ${t.targetYear} vs ${t.baselineYear} → ~${t.impliedAnnualLinearPercent}%/yr linear. ${t.meetsNearTerm1p5Ambition ? '✅' : '⚠️'} ${t.note}`);
    });
  }
  lines.push('');
  lines.push('## Next steps');
  s.nextSteps.forEach((n: string) => lines.push(`- ${n}`));
  lines.push('');
  return lines.join('\n');
}

function renderEsrsMarkdown(m: any): string {
  const lines: string[] = [];
  lines.push(`# ${m.title}`);
  lines.push(`Generated ${m.generatedAt} by ${m.generatedBy}`);
  lines.push('');
  lines.push(`> ${m.disclaimer}`);
  lines.push('');
  lines.push(`Standard: **${m.standard}** · all figures in **${m.unit}**.`);
  lines.push(`Reporting period: ${m.reportingPeriod.start.split('T')[0]} → ${m.reportingPeriod.end.split('T')[0]}`);
  lines.push(`Organization: ${m.organization.name} (${m.organization.country}) · consolidation: ${m.organization.consolidationApproach}`);
  lines.push('');

  lines.push('## E1-1 Transition plan for climate change mitigation');
  lines.push(m['E1-1 transition plan for climate change mitigation']);
  lines.push('');

  lines.push('## E1-4 Targets related to climate change mitigation and adaptation');
  const targets = m['E1-4 targets related to climate change mitigation and adaptation'];
  if (Array.isArray(targets) && typeof targets[0] === 'string') {
    lines.push(targets[0]);
  } else {
    lines.push('| Target | Base year | Target year | Reduction | Base-year emissions (t CO2e) |');
    lines.push('|---|---|---|---|---|');
    targets.forEach((t: any) =>
      lines.push(`| ${t.name} | ${t.baselineYear} | ${t.targetYear} | ${t.reductionPercent}% | ${t.baselineEmissions_tCO2e} |`)
    );
  }
  lines.push('');

  lines.push('## E1-5 Energy consumption and mix');
  lines.push(m['E1-5 energy consumption and mix']);
  lines.push('');

  const e6 = m['E1-6 gross GHG emissions'];
  lines.push('## E1-6 Gross Scopes 1, 2, 3 and total GHG emissions');
  lines.push('| Datapoint | t CO2e |');
  lines.push('|---|---|');
  lines.push(`| Gross Scope 1 | ${e6['Scope 1 (t CO2e)']} |`);
  lines.push(`| Gross Scope 2, location-based | ${e6['Scope 2 location-based (t CO2e)']} |`);
  lines.push(`| Gross Scope 2, market-based | ${e6['Scope 2 market-based (t CO2e)']} |`);
  lines.push(`| Gross Scope 3 | ${e6['Scope 3 (t CO2e)']} |`);
  lines.push(`| **Total GHG, location-based** | **${e6['Total GHG emissions, location-based (t CO2e)']}** |`);
  lines.push(`| **Total GHG, market-based** | **${e6['Total GHG emissions, market-based (t CO2e)']}** |`);
  lines.push(`| Biogenic CO2 (memo, outside scopes) | ${e6['Biogenic CO2 emissions (t CO2, memo — outside the scope totals)']} |`);
  lines.push('');
  const s3 = e6['Scope 3 by category (t CO2e)'];
  if (s3.length > 0) {
    lines.push('### Scope 3 by category');
    lines.push('| Category | t CO2e | Methods |');
    lines.push('|---|---|---|');
    s3.forEach((c: any) => lines.push(`| ${c.category} | ${c.tCO2e} | ${c.methodsUsed.join(', ')} |`));
    lines.push('');
  }
  lines.push('### GHG intensity per net revenue');
  const gi = e6['GHG intensity per net revenue (E1-6)'];
  if (gi.note) {
    lines.push(gi.note);
  } else {
    lines.push(`- Net revenue: ${gi.netRevenue.toLocaleString()} ${gi.netRevenueUnit}`);
    lines.push(`- Intensity (location-based): **${gi.intensityLocationBased_tCO2ePerUnit}** t CO2e / ${gi.netRevenueUnit}`);
    lines.push(`- Intensity (market-based): **${gi.intensityMarketBased_tCO2ePerUnit}** t CO2e / ${gi.netRevenueUnit}`);
  }
  lines.push(`> ${e6.note}`);
  lines.push('');

  lines.push('## E1-7 / E1-8 / E1-9');
  lines.push(`- E1-7 GHG removals and carbon credits: ${m['E1-7 GHG removals and carbon credits']}`);
  lines.push(`- E1-8 Internal carbon pricing: ${m['E1-8 internal carbon pricing']}`);
  lines.push(`- E1-9 Anticipated financial effects: ${m['E1-9 anticipated financial effects']}`);
  lines.push('');

  lines.push('## Data quality & assurance');
  const dq = m.dataQualityAndAssurance;
  lines.push(`- Completeness: ${dq.completenessPercent}% · relevance screened: ${dq.relevantCategoriesScreened ? 'yes' : 'no'}`);
  lines.push(`- Weighted data-quality score: ${dq.weightedDataQualityScore ?? '—'} / 5 (1 best)`);
  lines.push(`- Independently verified calculations: ${dq.independentlyVerifiedCalculations} · locked/published: ${dq.lockedCalculations}`);
  lines.push(`- ${dq.note}`);
  lines.push('');
  return lines.join('\n');
}

function renderImpMarkdown(p: any): string {
  const lines: string[] = [];
  lines.push(`# ${p.title}`);
  lines.push(`Generated ${p.generatedAt} by ${p.generatedBy}`);
  lines.push('');
  lines.push(`> ${p.autoGenerated}`);
  lines.push('');
  lines.push('## 1. Organization & boundary');
  lines.push(`- ${p.organization.name} (${p.organization.industry}, ${p.organization.country})`);
  lines.push(`- Consolidation approach: **${p.organization.consolidationApproach}**`);
  if (p.organization.facilities.length > 0) {
    p.organization.facilities.forEach((f: any) =>
      lines.push(`- Facility: ${f.name}${f.city ? `, ${f.city}` : ''} (${f.country}) — ownership ${f.ownershipPercent}%, operational control: ${f.operationalControl ? 'yes' : 'no'}`)
    );
  } else {
    lines.push('- No facilities defined; the inventory covers the organization as a single site.');
  }
  lines.push('');
  lines.push('## 2. Roles & responsibilities');
  lines.push(`- Administrators: ${p.rolesAndResponsibilities.inventoryAdministrators.join('; ') || '—'}`);
  lines.push(`- Managers: ${p.rolesAndResponsibilities.inventoryManagers.join('; ') || '—'}`);
  lines.push(`- Contributors: ${p.rolesAndResponsibilities.contributors.join('; ') || '—'}`);
  lines.push(`- ${p.rolesAndResponsibilities.note}`);
  lines.push('');
  lines.push('## 3. Reporting period');
  lines.push(`${p.reportingPeriod.start.split('T')[0]} → ${p.reportingPeriod.end.split('T')[0]} — ${p.reportingPeriod.note}`);
  lines.push('');
  lines.push('## 4. Methodology');
  lines.push(`- Standard: ${p.methodology.standard}`);
  lines.push(`- GWP set: **${p.methodology.gwpSet}** (${p.methodology.gwpSource})`);
  lines.push(`- GWP application: ${p.methodology.gwpApplication}`);
  lines.push(`- Factor selection: ${p.methodology.factorSelectionPolicy}`);
  lines.push(`- Scope 2: ${p.methodology.scope2}`);
  lines.push(`- Units: ${p.methodology.units}`);
  lines.push(`- Rounding policy: ${p.methodology.roundingPolicy}`);
  lines.push('');
  lines.push('## 5. Data management');
  lines.push(`- Collection: ${p.dataManagement.collection}`);
  lines.push(`- Supplier engagement: ${p.dataManagement.supplierEngagement}`);
  lines.push(`- Estimation policy: ${p.dataManagement.estimationPolicy}`);
  lines.push('- Denominator series:');
  p.dataManagement.denominators.forEach((d: string) => lines.push(`  - ${d}`));
  lines.push('');
  lines.push('## 6. QA/QC controls');
  p.qaqcControls.forEach((c: string) => lines.push(`- ${c}`));
  lines.push('');
  lines.push('## 7. Data-quality rubric');
  lines.push(p.dataQualityRubric.scale);
  p.dataQualityRubric.levels.forEach((l: string) => lines.push(`- ${l}`));
  lines.push('');
  lines.push('## 8. Emission factor library');
  lines.push(`- Shared factors: ${p.factorLibrary.sharedFactors} · Organization custom: ${p.factorLibrary.organizationCustomFactors}`);
  lines.push(`- Sources: ${p.factorLibrary.sources}`);
  lines.push('');
  lines.push('## 9. Exclusions register');
  if (p.exclusions.length === 0) lines.push('No documented exclusions.');
  p.exclusions.forEach((e: any) =>
    lines.push(`- **${e.source}**${e.scope ? ` (Scope ${e.scope})` : ''}: ${e.justification}${e.estimatedEmissions ? ` — est. ${e.estimatedEmissions} kg CO2e/yr` : ''}`)
  );
  lines.push('');
  lines.push('## 10. Base year & recalculation policy');
  if (p.baseYearAndRecalculation.targets.length === 0) lines.push('- No targets configured.');
  p.baseYearAndRecalculation.targets.forEach((t: any) =>
    lines.push(`- Target: ${t.name} — ${t.targetReduction}% below ${t.baselineYear} (${t.baselineEmissions.toLocaleString()} kg CO2e) by ${t.targetYear}`)
  );
  lines.push(`- ${p.baseYearAndRecalculation.recalculationPolicy}`);
  lines.push('');
  lines.push('## 11. Improvement plan');
  p.improvementPlan.forEach((i: string) => lines.push(`- ${i}`));
  lines.push('');
  return lines.join('\n');
}

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
  if (r.inventory) {
    const inv = r.inventory;
    if (inv.status === 'none') {
      lines.push(`- Reporting-year inventory: none for ${inv.reportingYear} (figures are live/unpublished).`);
    } else {
      lines.push(
        `- Reporting-year inventory: **${inv.reportingYear} — ${inv.status}**${inv.isBaseYear ? ' (base year)' : ''}${
          inv.status === 'published' && inv.publishedAt ? `, published ${String(inv.publishedAt).split('T')[0]} by ${inv.publishedBy}` : ''
        }`
      );
    }
  }
  lines.push('');
  lines.push('## 3. Methodology');
  lines.push(`- Standard: ${r.methodology.standard}`);
  lines.push(`- GWP set: **${r.methodology.gwpSet}** (${r.methodology.gwpSource})${r.methodology.gwpSetPinned ? ' — *pinned (published year)*' : ''}`);
  if (r.methodology.gwpSetNote) lines.push(`  - ${r.methodology.gwpSetNote}`);
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
  lines.push(
    `*Biogenic CO2 (memo item — excluded from the scope totals above): ${(r.emissions.biogenicCO2 || 0).toLocaleString()} kg CO2.* Biomass-combustion CO2 is reported separately per the GHG Protocol; biomass CH4/N2O remain counted in Scope 1.`
  );
  lines.push('');
  lines.push('### Scope 2 dual reporting');
  lines.push(`- Location-based: ${kg(r.emissions.scope2Dual.locationBased)}`);
  lines.push(`- Market-based: ${kg(r.emissions.scope2Dual.marketBased)}`);
  r.emissions.scope2Dual.methodsUsed.forEach((m: string) => lines.push(`  - Method: ${m}`));
  lines.push('');
  const pg = r.emissions.perGas;
  if (pg) {
    lines.push('### Per-gas breakdown (Kyoto gases)');
    lines.push(`| Gas | Mass (kg) | CO2e (kg, ${pg.gwpSet}) |`);
    lines.push(`|---|---|---|`);
    lines.push(`| CO2 (fossil, in-scope) | ${pg.massKg.co2.toLocaleString()} | ${pg.co2eByGas.co2.toLocaleString()} |`);
    lines.push(`| CH4 | ${pg.massKg.ch4.toLocaleString()} | ${pg.co2eByGas.ch4.toLocaleString()} |`);
    lines.push(`| N2O | ${pg.massKg.n2o.toLocaleString()} | ${pg.co2eByGas.n2o.toLocaleString()} |`);
    lines.push(`| **Per-gas subtotal** | | **${pg.perGasSubtotalCo2e.toLocaleString()}** |`);
    lines.push(`| CO2e factors (gases not separated) | | ${pg.co2eNotSeparated.toLocaleString()} |`);
    lines.push(`| Biogenic CO2 (memo, excl. from scopes) | ${(r.emissions.biogenicCO2 || 0).toLocaleString()} | — |`);
    lines.push('');
    lines.push(`> ${pg.note}`);
    lines.push('');
  }
  lines.push(`### Intensity metrics (${r.intensity.year})`);
  if (r.intensity.metrics.length === 0) {
    lines.push(r.intensity.note || 'No denominators recorded for the reporting year.');
  } else {
    lines.push(`| Metric | Denominator | kg CO2e per unit |`);
    lines.push(`|---|---|---|`);
    r.intensity.metrics.forEach((m: any) =>
      lines.push(`| ${m.label} | ${m.denominatorValue.toLocaleString()} ${m.denominatorUnit} | ${m.intensityKgCo2ePerUnit} |`)
    );
  }
  lines.push('');
  if (r.consolidation) {
    const c = r.consolidation;
    lines.push('### Consolidation (organizational boundary)');
    lines.push(
      `Approach: **${c.approach}** · Gross: ${kg(c.grossTotal)} · Consolidated (reported share): **${kg(c.consolidatedTotal)}** (${c.overallSharePercent}% of gross)`
    );
    if (Array.isArray(c.byEntity) && c.byEntity.some((e: any) => e.sharePercent < 100)) {
      lines.push('');
      lines.push(`| Entity | Share | Gross | Consolidated |`);
      lines.push(`|---|---|---|---|`);
      c.byEntity.forEach((e: any) =>
        lines.push(`| ${e.name} | ${e.sharePercent}% | ${e.gross.toLocaleString()} | ${e.consolidated.toLocaleString()} |`)
      );
    }
    lines.push('');
  }
  lines.push('## 5. Emissions by category (with method mix)');
  lines.push(`| Category | Scope | kg CO2e | Primary data | Methods |`);
  lines.push(`|---|---|---|---|---|`);
  r.emissions.byCategory.forEach((c: any) => {
    const methods = Object.entries(c.methods)
      .map(([m, v]: any) => `${m}: ${Math.round((v / Math.max(c.emissions, 0.01)) * 100)}%`)
      .join(', ');
    const prim = c.dataSources ? `${c.dataSources.primarySharePercent}%` : '—';
    lines.push(`| ${c.category}${c.subcategory ? ` (${c.subcategory})` : ''} | ${c.scope} | ${c.emissions.toLocaleString()} | ${prim} | ${methods} |`);
  });
  lines.push('');
  lines.push('## 6. Data quality');
  lines.push(`High: ${r.dataQuality.high} · Medium: ${r.dataQuality.medium} · Low: ${r.dataQuality.low} · Unrated: ${r.dataQuality.unrated} (rated share ${r.dataQuality.ratedShare}%)`);
  if (r.dataQuality.weightedDqScore) {
    lines.push(`PCAF-style weighted DQ score: **${r.dataQuality.weightedDqScore}** (1 best … 5 worst, emissions-weighted)`);
  }
  if (r.dataQuality.dataSources) {
    const ds = r.dataQuality.dataSources;
    lines.push(
      `Data source: **${ds.primarySharePercent}% primary** (supplier-specific / measured) · ${ds.secondarySharePercent}% secondary (incl. ${r.dataQuality.estimates.emissionsShare}% estimated). Primary ${kg(ds.primaryEmissions)} / secondary ${kg(ds.secondaryEmissions + ds.estimatedEmissions)}. CDP/SBTi track primary-data share per category (see §5 table above) and expect it to rise over time.`
    );
  }
  lines.push(`Estimated (gap-filled) data: ${r.dataQuality.estimates.count} entries, ${r.dataQuality.estimates.emissionsShare}% of emissions — estimates carry +10% conservativeness and DQ 5.`);
  lines.push('');
  lines.push('## 7. Completeness');
  const cm = r.completeness;
  lines.push(`Relevant categories: ${cm.relevantCount} · covered: ${cm.coveredCount} · documented exclusions: ${cm.excludedCount} · undocumented gaps: ${cm.gapCount} → **${cm.completenessPercent}% complete**`);
  if (!cm.screened) lines.push(`> ${cm.note}`);
  if (cm.gaps.length > 0) {
    lines.push('Undocumented gaps (relevant, no data, no exclusion) — resolve before assurance:');
    cm.gaps.forEach((g: any) => lines.push(`- Scope ${g.scope}: ${g.category}`));
  } else if (cm.screened) {
    lines.push('No undocumented gaps: every relevant category has data or a documented exclusion.');
  }
  lines.push('');
  lines.push('## 8. Supplier engagement');
  if (r.supplierEngagement.suppliers === 0) {
    lines.push('No suppliers registered. Supplier-specific (primary) data raises the Scope 3 method hierarchy and DQ — register suppliers under Compliance → Suppliers.');
  } else {
    const se = r.supplierEngagement;
    lines.push(`- Registered suppliers: ${se.suppliers} (integrated: ${se.engagementStatuses.dataIntegrated}, received: ${se.engagementStatuses.dataReceived}, awaiting: ${se.engagementStatuses.awaitingResponse}, not engaged: ${se.engagementStatuses.notEngaged})`);
    lines.push(`- Data requests covering this period: ${se.dataRequestsInPeriod.total} (fulfilled: ${se.dataRequestsInPeriod.fulfilled}, received: ${se.dataRequestsInPeriod.received}, open: ${se.dataRequestsInPeriod.sent}, declined: ${se.dataRequestsInPeriod.declined})`);
    lines.push(`- Supplier-specific (primary) data: ${se.supplierSpecificData.entries} entries, ${kg(se.supplierSpecificData.emissionsKgCo2e)} (${se.supplierSpecificData.emissionsShare}% of emissions)`);
  }
  lines.push('');
  lines.push('## 9. Emission factor register');
  lines.push(`| Factor | Source | Year | Uses |`);
  lines.push(`|---|---|---|---|`);
  r.factorRegister.forEach((f: any) => lines.push(`| ${f.name} | ${f.source || '—'} | ${f.year || '—'} | ${f.uses} |`));
  lines.push('');
  lines.push('## 10. Exclusions register');
  if (r.exclusions.length === 0) lines.push('No documented exclusions.');
  r.exclusions.forEach((e: any) =>
    lines.push(`- **${e.source}**${e.scope ? ` (Scope ${e.scope})` : ''}: ${e.justification}${e.estimatedEmissions ? ` — est. ${e.estimatedEmissions} kg CO2e/yr` : ''}`)
  );
  lines.push('');
  lines.push('## 11. Base year & targets');
  if (r.targets.length === 0) lines.push('No targets configured.');
  r.targets.forEach((t: any) =>
    lines.push(`- ${t.name}: ${t.targetReduction}% below ${t.baselineYear} baseline (${t.baselineEmissions.toLocaleString()} kg CO2e) by ${t.targetYear}`)
  );
  lines.push('');
  lines.push('## 12. Inventory controls');
  lines.push(`- Calculations in period: ${r.inventoryControls.calculationsInPeriod} (${r.inventoryControls.lockedCalculations} locked/published, ${r.inventoryControls.verifiedCalculations} independently verified)`);
  lines.push(`- Audit-trail entries in period: ${r.inventoryControls.auditTrailEntriesInPeriod}`);
  lines.push('');
  lines.push('## 13. Uncertainty statement');
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

  // Completeness over the trailing 12 months (by activity period).
  const completeness = await computeCompleteness({
    organizationId,
    start: twelveMonthsAgo,
    end: new Date(),
  });

  const dashboardData: DashboardData & { completeness: typeof completeness } = {
    totalEmissions,
    recentCalculations: recentCalculations.slice(0, 5), // Limit to 5 for dashboard
    emissionsTrend: trendData,
    categoryBreakdown,
    organizationStats: {
      totalCalculations,
      lastCalculationDate: lastCalculation?.createdAt || null,
      avgMonthlyEmissions,
    },
    completeness,
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