import { Request, Response } from 'express';
import { Calculation } from '../models/Calculation';
import { EmissionFactor } from '../models/EmissionFactor';
import { EmissionCategory } from '../models/EmissionCategory';
import { Facility } from '../models/Facility';
import { CalculationSnapshot } from '../models/CalculationSnapshot';
import { AuthenticatedRequest } from '../types';
import { ApiResponseUtil } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { calculationEngine } from '../services/calculationEngine';
import { getVersionByNumber } from '../services/factorVersioning';
import { buildEntryFromComputed } from '../services/calculationPersistence';
import { suggestEstimate } from '../services/estimationService';
import { computeCompleteness } from '../services/completenessService';
import { ensureInventory, midpointYear } from '../services/inventoryService';
import { recordAudit } from '../utils/audit';
import { body, validationResult } from 'express-validator';

export const calculateEmissions = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return ApiResponseUtil.error(res, 'Validation failed', 400, 
      errors.array().reduce((acc, error) => {
        const param = typeof (error as any).param === 'string' ? (error as any).param : 'unknown';
        acc[param] = [error.msg];
        return acc;
      }, {} as Record<string, string[]>)
    );
  }

  const { categoryId, value, unit, factorId, metadata } = req.body;

  try {
    const calculationInput = {
      categoryId,
      value: parseFloat(value),
      unit,
      factorId,
      metadata: metadata || {},
      userId: req.user?.id,
      organizationId: req.user?.organizationId,
    };

    // Use enhanced calculation engine
    const result = await calculationEngine.calculate(calculationInput);

    ApiResponseUtil.success(res, result, 'Emissions calculated successfully');
  } catch (error) {
    if (error instanceof Error) {
      ApiResponseUtil.error(res, error.message, 400);
    } else {
      ApiResponseUtil.error(res, 'Calculation failed', 500);
    }
  }
});

export const calculateBatchEmissions = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { calculations } = req.body;

  if (!Array.isArray(calculations) || calculations.length === 0) {
    return ApiResponseUtil.error(res, 'Calculations array is required and must not be empty', 400);
  }

  if (calculations.length > 50) {
    return ApiResponseUtil.error(res, 'Maximum 50 calculations allowed per batch', 400);
  }

  try {
    const calculationInputs = calculations.map(calc => ({
      ...calc,
      value: parseFloat(calc.value),
      metadata: calc.metadata || {},
      userId: req.user?.id,
      organizationId: req.user?.organizationId,
    }));

    const results = await calculationEngine.calculateBatch(calculationInputs);
    const summary = calculationEngine.summarizeCalculations(results);

    ApiResponseUtil.success(res, {
      results,
      summary,
      count: results.length,
    }, 'Batch calculation completed successfully');
  } catch (error) {
    if (error instanceof Error) {
      ApiResponseUtil.error(res, error.message, 400);
    } else {
      ApiResponseUtil.error(res, 'Batch calculation failed', 500);
    }
  }
});

export const calculateBusinessTravel = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { origin, destination, travelClass, roundTrip, travelMode } = req.body;

  try {
    // Find business travel category
    const businessTravelCategory = await EmissionCategory.findOne({
      category: { $regex: /business travel/i },
      scope: 3,
    });

    if (!businessTravelCategory) {
      return ApiResponseUtil.error(res, 'Business travel category not found', 404);
    }

    const calculationInput = {
      categoryId: businessTravelCategory.id,
      value: 1, // Will be calculated based on distance
      unit: 'trip',
      metadata: {
        origin,
        destination,
        travelClass,
        roundTrip: roundTrip === true || roundTrip === 'true',
        travelMode,
      },
      userId: req.user?.id,
      organizationId: req.user?.organizationId,
    };

    const result = await calculationEngine.calculate(calculationInput);

    ApiResponseUtil.success(res, result, 'Business travel calculation completed successfully');
  } catch (error) {
    if (error instanceof Error) {
      ApiResponseUtil.error(res, error.message, 400);
    } else {
      ApiResponseUtil.error(res, 'Business travel calculation failed', 500);
    }
  }
});

export const saveCalculation = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const {
    title,
    description,
    period,
    facilityId,
    calculations, // Array of calculation entries
  } = req.body;

  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }

  if (!title || !period || !calculations || !Array.isArray(calculations)) {
    return ApiResponseUtil.error(res, 'Title, period, and calculations array are required', 400);
  }

  // Optional facility tag must belong to this organization.
  if (facilityId) {
    const facility = await Facility.findOne({ _id: facilityId, organizationId: req.user.organizationId });
    if (!facility) {
      return ApiResponseUtil.error(res, 'Facility not found in your organization', 400);
    }
  }

  // Validate period
  const startDate = new Date(period.start);
  const endDate = new Date(period.end);
  
  if (startDate >= endDate) {
    return ApiResponseUtil.error(res, 'End date must be after start date', 400);
  }

  // Link this calculation to its reporting-year inventory (created Draft on
  // first use). A published reporting year is closed and immutable — new data
  // must wait for an audited reopen, mirroring the per-calculation lock.
  const reportingYear = midpointYear(startDate, endDate);
  const inventory = await ensureInventory(req.user.organizationId, reportingYear);
  if (inventory.status === 'published') {
    return ApiResponseUtil.error(
      res,
      `Reporting year ${reportingYear} is published and locked. Reopen it (Compliance → Reporting Years) before adding or changing data.`,
      409
    );
  }

  // Calculate totals by scope
  const emissions = {
    scope1: 0,
    scope2: 0,
    scope3: 0,
    total: 0,
  };

  // Process each calculation entry — recompute emissions SERVER-SIDE so stored
  // totals cannot be spoofed by the client and stay consistent with the engine.
  const processedCalculations = [];

  for (const calc of calculations) {
    const category = await EmissionCategory.findById(calc.categoryId);
    if (!category) {
      return ApiResponseUtil.error(res, `Category not found: ${calc.categoryId}`, 400);
    }

    let computed;
    try {
      computed = await calculationEngine.calculate({
        categoryId: String(calc.categoryId),
        value: parseFloat(calc.value),
        unit: calc.unit,
        factorId: calc.factorId,
        metadata: calc.metadata || {},
        userId: req.user.id,
        organizationId: req.user.organizationId,
        activityYear: startDate.getFullYear(),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'calculation failed';
      return ApiResponseUtil.error(res, `Could not compute entry for category ${calc.categoryId}: ${reason}`, 400);
    }

    // Build the persisted entry (provenance + pinned immutable factor version)
    // via the shared helper that the importer also uses, so calculator-saved and
    // imported entries are byte-identical.
    const entry = await buildEntryFromComputed(computed, {
      categoryId: calc.categoryId,
      isEstimate: calc.isEstimate,
      estimationMethod: calc.estimationMethod,
      notes: calc.notes,
    });

    processedCalculations.push(entry);

    // Add to scope totals using the authoritative category scope.
    switch (category.scope) {
      case 1:
        emissions.scope1 += entry.emissions;
        break;
      case 2:
        emissions.scope2 += entry.emissions;
        break;
      case 3:
        emissions.scope3 += entry.emissions;
        break;
    }
  }

  // Guard against floating-point drift in the stored totals.
  emissions.scope1 = Math.round(emissions.scope1 * 100) / 100;
  emissions.scope2 = Math.round(emissions.scope2 * 100) / 100;
  emissions.scope3 = Math.round(emissions.scope3 * 100) / 100;

  emissions.total = emissions.scope1 + emissions.scope2 + emissions.scope3;

  // Create calculation document
  const calculation = new Calculation({
    organizationId: req.user.organizationId,
    userId: req.user.id,
    ...(facilityId ? { facilityId } : {}),
    inventoryId: inventory._id,
    title,
    description,
    period: {
      start: startDate,
      end: endDate,
    },
    emissions,
    data: processedCalculations,
    status: 'completed',
  });

  await calculation.save();

  await recordAudit({
    organizationId: req.user.organizationId,
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'create',
    resourceType: 'calculation',
    resourceId: calculation._id.toString(),
    after: { title, period: { start: startDate, end: endDate }, emissions, entries: processedCalculations.length },
  });

  ApiResponseUtil.success(res, calculation, 'Calculation saved successfully', 201);
});

/**
 * Suggest a conservative gap-filling estimate for a missing period
 * (same-period-prior-year → adjacent-period-average, +10% conservativeness).
 * Returns a suggestion only — saving it is a normal save with isEstimate=true.
 */
export const estimateCalculationValue = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }
  const { categoryId, facilityId, period } = req.body;
  if (!categoryId || !period?.start || !period?.end) {
    return ApiResponseUtil.error(res, 'categoryId and period {start,end} are required', 400);
  }

  const suggestion = await suggestEstimate({
    organizationId: req.user.organizationId,
    categoryId: String(categoryId),
    facilityId: facilityId ? String(facilityId) : undefined,
    periodStart: new Date(period.start),
    periodEnd: new Date(period.end),
  });

  if (!suggestion) {
    return ApiResponseUtil.error(
      res,
      'No historical data available to estimate from (needs prior-year or adjacent-period entries for this category). Enter the value manually or document the gap in the exclusions register.',
      404
    );
  }

  ApiResponseUtil.success(res, suggestion, 'Estimate suggested — review before saving');
});

/** Lock (publish) a calculation: it becomes immutable until explicitly unlocked. */
export const lockCalculation = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }
  const { id } = req.params;

  const existing = await Calculation.findOne({ _id: id, organizationId: req.user.organizationId });
  if (!existing) {
    return ApiResponseUtil.error(res, 'Calculation not found', 404);
  }
  if (existing.status === 'locked') {
    return ApiResponseUtil.success(res, existing, 'Calculation is already locked');
  }

  const before = existing.status;
  // Status-only update — the single mutation the immutability guards allow.
  const updated = await Calculation.findOneAndUpdate(
    { _id: id, organizationId: req.user.organizationId },
    { $set: { status: 'locked' } },
    { new: true }
  );

  // Versioned snapshot at every publication — restatement history (§7.3).
  const version =
    (await CalculationSnapshot.countDocuments({ calculationId: id })) + 1;
  await CalculationSnapshot.create({
    organizationId: req.user.organizationId,
    calculationId: id,
    version,
    snapshot: updated!.toJSON(),
    reason: 'lock',
    comment: req.body?.comment,
    createdBy: req.user.email,
  });

  await recordAudit({
    organizationId: req.user.organizationId,
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'lock',
    resourceType: 'calculation',
    resourceId: id,
    before: { status: before },
    after: { status: 'locked', snapshotVersion: version },
    comment: req.body?.comment,
  });

  // Soft completeness gate (GHG Protocol completeness): publishing with
  // undocumented gaps is allowed but flagged. A hard gate awaits the
  // reporting-year/inventory object (see gap analysis) — locking a single
  // calculation is not yet the same as publishing the full-year inventory.
  let completenessWarning: string | undefined;
  try {
    const completeness = await computeCompleteness({
      organizationId: req.user.organizationId,
      start: existing.period.start,
      end: existing.period.end,
    });
    if (completeness.screened && completeness.gapCount > 0) {
      completenessWarning = `Published with ${completeness.gapCount} undocumented completeness gap(s) for this period (${completeness.completenessPercent}% complete). Add data or document an exclusion for: ${completeness.gaps
        .map((g) => g.category)
        .join(', ')}.`;
    }
  } catch {
    // Completeness is advisory — never block a lock on its computation.
  }

  ApiResponseUtil.success(
    res,
    { ...updated!.toJSON(), completenessWarning },
    `Calculation locked — snapshot v${version} recorded${completenessWarning ? ' (with completeness warning)' : ''}`
  );
});

/**
 * Deterministic recompute check (§3 — the §2.1 "recompute a locked inventory
 * and get identical results" requirement). For each entry, re-run the engine
 * math against the PINNED immutable factor version (or, for pre-versioning
 * entries, the live factor as best-effort) and compare to the stored figure.
 * Also re-runs against the LIVE factor to detect whether the factor has drifted
 * since the pin — proving the pin, not the live factor, is what reproduces a
 * locked result. Read-only; never mutates anything.
 */
export const recomputeCheck = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }
  const calc = await Calculation.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId,
  }).lean();
  if (!calc) {
    return ApiResponseUtil.error(res, 'Calculation not found', 404);
  }

  const entries: any[] = (calc as any).data || [];
  const catIds = [...new Set(entries.map((e) => String(e.categoryId)).filter(Boolean))];
  const cats = await EmissionCategory.find({ _id: { $in: catIds } }).lean();
  const catById = new Map(cats.map((c: any) => [String(c._id), c]));

  const TOL = 0.011; // stored results are rounded to 2dp
  let pinned = 0;
  let unpinned = 0;
  let supported = 0;
  let unsupported = 0;
  let mismatches = 0;
  let drifted = 0;
  const results: any[] = [];

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const category = catById.get(String(e.categoryId));
    const versionPinned = e.factorVersion != null && e.factorVersionId != null;
    if (versionPinned) pinned++;
    else unpinned++;

    const factorSnapshot = versionPinned
      ? await getVersionByNumber(String(e.factorId), e.factorVersion)
      : null;
    const liveFactor = e.factorId ? await EmissionFactor.findById(e.factorId).lean() : null;
    // Check against the pinned version when present, else the live factor.
    const checkFactor = factorSnapshot || liveFactor;

    if (!category || !checkFactor) {
      unsupported++;
      results.push({
        index: i,
        categoryName: (category as any)?.category,
        factorName: e.factorName,
        factorVersion: e.factorVersion ?? null,
        versionPinned,
        recomputeSupported: false,
        note: !category ? 'category not found' : 'factor record not found',
        storedEmissions: e.emissions,
      });
      continue;
    }

    const rc = await calculationEngine.recomputeEntryAgainstFactor(e, checkFactor, category);
    if (!rc.supported) {
      unsupported++;
      results.push({
        index: i,
        categoryName: (category as any).category,
        factorName: e.factorName,
        factorVersion: e.factorVersion ?? null,
        versionPinned,
        recomputeSupported: false,
        note: rc.note,
        storedEmissions: e.emissions,
      });
      continue;
    }

    supported++;
    const recomputed = rc.emissions as number;
    const matches = Math.abs(recomputed - e.emissions) <= TOL;
    if (!matches) mismatches++;

    // Drift: would the LIVE factor now produce a different number than the pin?
    let liveEmissions: number | undefined;
    let factorChangedSincePin = false;
    if (versionPinned && liveFactor) {
      const live = await calculationEngine.recomputeEntryAgainstFactor(e, liveFactor, category);
      if (live.supported && typeof live.emissions === 'number') {
        liveEmissions = live.emissions;
        factorChangedSincePin = Math.abs(live.emissions - recomputed) > TOL;
        if (factorChangedSincePin) drifted++;
      }
    }

    results.push({
      index: i,
      categoryName: (category as any).category,
      factorName: e.factorName,
      factorVersion: e.factorVersion ?? null,
      currentFactorVersion: (liveFactor as any)?.currentVersion ?? null,
      versionPinned,
      recomputeSupported: true,
      storedEmissions: e.emissions,
      recomputedEmissions: Math.round(recomputed * 100) / 100,
      matches,
      ...(liveEmissions !== undefined ? { liveEmissions: Math.round(liveEmissions * 100) / 100 } : {}),
      factorChangedSincePin,
    });
  }

  const reproducible = supported > 0 && mismatches === 0;
  // Deterministic = every entry pins an immutable version, so the result is
  // reproducible FOREVER (not just against today's live factor).
  const deterministic = supported > 0 && unpinned === 0 && mismatches === 0;

  ApiResponseUtil.success(
    res,
    {
      calculationId: (calc as any)._id.toString(),
      title: (calc as any).title,
      status: (calc as any).status,
      locked: (calc as any).status === 'locked',
      entryCount: entries.length,
      reproducible,
      deterministic,
      summary: { pinned, unpinned, supported, unsupported, mismatches, driftedFactors: drifted },
      entries: results,
    },
    deterministic
      ? 'Deterministic — every entry reproduces its stored figure from a pinned, immutable factor version'
      : reproducible
      ? 'Reproducible against current factors; some entries predate version pinning'
      : 'Recompute check complete — see per-entry detail'
  );
});

/** List snapshot versions for a calculation (metadata only). */
export const getCalculationSnapshots = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }
  const snapshots = await CalculationSnapshot.find({
    calculationId: req.params.id,
    organizationId: req.user.organizationId,
  })
    .select('version reason comment createdBy createdAt')
    .sort({ version: -1 })
    .lean();
  ApiResponseUtil.success(res, {
    snapshots: snapshots.map((s: any) => ({ ...s, id: s._id.toString() })),
    count: snapshots.length,
  });
});

/**
 * Restatement diff between two snapshot versions: "what changed and why".
 * GET /:id/snapshots/diff?from=1&to=2
 */
export const getSnapshotDiff = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }
  const from = parseInt(req.query.from as string, 10);
  const to = parseInt(req.query.to as string, 10);
  if (!from || !to) {
    return ApiResponseUtil.error(res, 'from and to version query params are required', 400);
  }

  const [a, b] = await Promise.all([
    CalculationSnapshot.findOne({ calculationId: req.params.id, organizationId: req.user.organizationId, version: from }).lean(),
    CalculationSnapshot.findOne({ calculationId: req.params.id, organizationId: req.user.organizationId, version: to }).lean(),
  ]);
  if (!a || !b) {
    return ApiResponseUtil.error(res, 'One or both snapshot versions not found', 404);
  }

  const changes: Array<{ path: string; from: any; to: any }> = [];
  const sa: any = (a as any).snapshot, sb: any = (b as any).snapshot;
  const compare = (path: string, va: any, vb: any) => {
    if (JSON.stringify(va) !== JSON.stringify(vb)) changes.push({ path, from: va, to: vb });
  };
  compare('title', sa.title, sb.title);
  compare('period', sa.period, sb.period);
  compare('emissions.scope1', sa.emissions?.scope1, sb.emissions?.scope1);
  compare('emissions.scope2', sa.emissions?.scope2, sb.emissions?.scope2);
  compare('emissions.scope3', sa.emissions?.scope3, sb.emissions?.scope3);
  compare('emissions.total', sa.emissions?.total, sb.emissions?.total);
  compare('entryCount', (sa.data || []).length, (sb.data || []).length);
  const n = Math.max((sa.data || []).length, (sb.data || []).length);
  for (let i = 0; i < n; i++) {
    const ea: any = (sa.data || [])[i] || {}, eb: any = (sb.data || [])[i] || {};
    compare(`data[${i}].value`, ea.value, eb.value);
    compare(`data[${i}].emissions`, ea.emissions, eb.emissions);
    compare(`data[${i}].factor`, ea.factor, eb.factor);
  }

  ApiResponseUtil.success(res, {
    calculationId: req.params.id,
    from: { version: from, lockedAt: (a as any).createdAt, comment: (a as any).comment },
    to: { version: to, lockedAt: (b as any).createdAt, comment: (b as any).comment },
    identical: changes.length === 0,
    changes,
  });
});

/** Unlock a previously locked calculation (audited; admin/manager only). */
export const unlockCalculation = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }
  const { id } = req.params;

  const existing = await Calculation.findOne({ _id: id, organizationId: req.user.organizationId });
  if (!existing) {
    return ApiResponseUtil.error(res, 'Calculation not found', 404);
  }
  if (existing.status !== 'locked') {
    return ApiResponseUtil.success(res, existing, 'Calculation is not locked');
  }

  // Unlocking invalidates any prior verification — a restatement may change the
  // numbers a verifier signed off on, so verified state is cleared.
  const wasVerified = !!existing.verification?.verified;
  const updated = await Calculation.findOneAndUpdate(
    { _id: id, organizationId: req.user.organizationId },
    { $set: { status: 'completed', verification: { verified: false } } },
    { new: true }
  );

  await recordAudit({
    organizationId: req.user.organizationId,
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'unlock',
    resourceType: 'calculation',
    resourceId: id,
    before: { status: 'locked', verified: wasVerified },
    after: { status: 'completed', verified: false },
    comment: req.body?.comment,
  });

  ApiResponseUtil.success(res, updated, wasVerified ? 'Calculation unlocked — prior verification cleared' : 'Calculation unlocked');
});

/**
 * Mark a locked calculation as verified (verifier or admin). Verification is an
 * independent assurance annotation on a published (locked) inventory; it never
 * unlocks or mutates the emissions data, and is cleared automatically if the
 * calculation is later unlocked for restatement.
 */
export const verifyCalculation = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }
  const { id } = req.params;
  const { comment } = req.body;

  const existing = await Calculation.findOne({ _id: id, organizationId: req.user.organizationId });
  if (!existing) {
    return ApiResponseUtil.error(res, 'Calculation not found', 404);
  }
  if (existing.status !== 'locked') {
    return ApiResponseUtil.error(
      res,
      'Only a locked (published) calculation can be verified — lock it first so the figures are immutable.',
      400
    );
  }

  const verification = {
    verified: true,
    verifiedBy: req.user.email,
    verifiedAt: new Date(),
    ...(comment ? { comment: String(comment).trim() } : {}),
  };

  const updated = await Calculation.findOneAndUpdate(
    { _id: id, organizationId: req.user.organizationId },
    { $set: { verification } },
    { new: true }
  );

  await recordAudit({
    organizationId: req.user.organizationId,
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'update',
    resourceType: 'calculation-verification',
    resourceId: id,
    before: { verified: !!existing.verification?.verified },
    after: { verified: true, verifiedBy: req.user.email },
    comment: req.body?.comment,
  });

  ApiResponseUtil.success(res, updated, 'Calculation verified');
});

export const getCalculations = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }

  const {
    status,
    startDate,
    endDate,
    facilityId,
    page = '1',
    limit = '10'
  } = req.query;

  const filter: any = {
    organizationId: req.user.organizationId,
  };

  if (status) {
    filter.status = status;
  }

  if (facilityId) {
    filter.facilityId = facilityId;
  }

  if (startDate || endDate) {
    filter['period.start'] = {};
    if (startDate) filter['period.start'].$gte = new Date(startDate as string);
    if (endDate) filter['period.start'].$lte = new Date(endDate as string);
  }

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const [calculations, total] = await Promise.all([
    Calculation.find(filter)
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip(skip)
      .lean(),
    Calculation.countDocuments(filter),
  ]);

  ApiResponseUtil.paginated(res, calculations, pageNum, limitNum, total);
});

export const getCalculationById = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }

  const { id } = req.params;

  const calculation = await Calculation.findOne({
    _id: id,
    organizationId: req.user.organizationId,
  })
    .populate('userId', 'name email')
    .populate('data.categoryId', 'category scope description')
    .lean();

  if (!calculation) {
    return ApiResponseUtil.error(res, 'Calculation not found', 404);
  }

  ApiResponseUtil.success(res, calculation);
});
