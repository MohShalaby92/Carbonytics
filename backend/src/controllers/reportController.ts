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
import { GWP_SETS, DEFAULT_GWP_SET, isGwpSetName } from '../data/gwpSets';
import { CONSERVATIVENESS_UPLIFT } from '../services/estimationService';
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
  // Supplier-specific (primary-data) entry share.
  let supplierEntryCount = 0, supplierEntryEmissions = 0;
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
      if ((entry as any).supplierId) {
        supplierEntryCount++;
        supplierEntryEmissions += em;
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
    },
    supplierEngagement,
    completeness,
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
      'Completeness dashboard and publish gates (planned).',
      'Evidence attachments per data line (planned).',
      'Factor version history for in-place edits (planned).',
      'Reporting-year object: per-year GWP locking, frozen base year, recalculation threshold engine (planned).',
      'PDF/DOCX report rendering (currently markdown/JSON).',
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
  lines.push(`- Calculations in period: ${r.inventoryControls.calculationsInPeriod} (${r.inventoryControls.lockedCalculations} locked/published)`);
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