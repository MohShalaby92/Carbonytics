import { Response } from 'express';
import { Inventory } from '../models/Inventory';
import { InventorySnapshot } from '../models/InventorySnapshot';
import { Calculation } from '../models/Calculation';
import { CalculationSnapshot } from '../models/CalculationSnapshot';
import { Organization } from '../models/Organization';
import { DEFAULT_GWP_SET, isGwpSetName } from '../data/gwpSets';
import { AuthenticatedRequest } from '../types';
import { ApiResponseUtil } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { recordAudit } from '../utils/audit';
import {
  ensureInventory,
  defaultPeriodForYear,
  computeInventoryFigures,
} from '../services/inventoryService';
import { computeCompleteness } from '../services/completenessService';

/**
 * Lock every not-yet-locked member calculation of an inventory (status-only
 * update — the single mutation the immutability guard allows) and write a
 * per-calculation publication snapshot for each, exactly as the per-calculation
 * lock does. Returns how many were newly locked.
 */
async function lockMemberCalculations(
  organizationId: string,
  inventoryId: string,
  email: string,
  comment?: string
): Promise<number> {
  const members = await Calculation.find({ organizationId, inventoryId })
    .select('_id status')
    .lean();
  let lockedNow = 0;
  for (const m of members as any[]) {
    if (m.status === 'locked') continue;
    const updated = await Calculation.findOneAndUpdate(
      { _id: m._id, organizationId },
      { $set: { status: 'locked' } },
      { new: true }
    );
    if (!updated) continue;
    const version = (await CalculationSnapshot.countDocuments({ calculationId: m._id })) + 1;
    await CalculationSnapshot.create({
      organizationId,
      calculationId: m._id,
      version,
      snapshot: updated.toJSON(),
      reason: 'publish',
      comment,
      createdBy: email,
    });
    lockedNow++;
  }
  return lockedNow;
}

/** Unlock every locked member calculation (reverses a publish). Clears prior
 * verification — a reopened year may be restated, invalidating any sign-off. */
async function unlockMemberCalculations(
  organizationId: string,
  inventoryId: string
): Promise<number> {
  const members = await Calculation.find({ organizationId, inventoryId, status: 'locked' })
    .select('_id')
    .lean();
  let unlockedNow = 0;
  for (const m of members as any[]) {
    const updated = await Calculation.findOneAndUpdate(
      { _id: m._id, organizationId },
      { $set: { status: 'completed', verification: { verified: false } } },
      { new: true }
    );
    if (updated) unlockedNow++;
  }
  return unlockedNow;
}

/** List the organization's reporting-year inventories with live figures. */
export const getInventories = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return ApiResponseUtil.error(res, 'Authentication required', 401);

  const inventories = await Inventory.find({ organizationId: req.user.organizationId })
    .sort({ reportingYear: -1 })
    .lean();

  const withFigures = await Promise.all(
    inventories.map(async (inv: any) => ({
      ...inv,
      id: inv._id.toString(),
      current: await computeInventoryFigures(req.user!.organizationId, inv._id.toString()),
    }))
  );

  ApiResponseUtil.success(res, { inventories: withFigures, count: withFigures.length });
});

/** One inventory with live figures, completeness, and (if published) drift. */
export const getInventoryById = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return ApiResponseUtil.error(res, 'Authentication required', 401);

  const inventory = await Inventory.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId,
  });
  if (!inventory) return ApiResponseUtil.error(res, 'Inventory not found', 404);

  const [current, completeness, snapshotCount] = await Promise.all([
    computeInventoryFigures(req.user.organizationId, inventory._id.toString()),
    computeCompleteness({
      organizationId: req.user.organizationId,
      start: inventory.period.start,
      end: inventory.period.end,
    }),
    InventorySnapshot.countDocuments({ inventoryId: inventory._id }),
  ]);

  ApiResponseUtil.success(res, {
    ...inventory.toJSON(),
    current,
    completeness,
    snapshotVersions: snapshotCount,
  });
});

/** Create a reporting-year inventory (Draft). Duplicate years are rejected. */
export const createInventory = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return ApiResponseUtil.error(res, 'Authentication required', 401);

  const year = parseInt(req.body.reportingYear, 10);
  if (!year || year < 2000 || year > 2100) {
    return ApiResponseUtil.error(res, 'A valid reportingYear (2000–2100) is required', 400);
  }

  const existing = await Inventory.findOne({ organizationId: req.user.organizationId, reportingYear: year });
  if (existing) {
    return ApiResponseUtil.error(res, `Reporting year ${year} already has an inventory`, 409);
  }

  // Optional custom period (fiscal years); defaults to the calendar year.
  let period = defaultPeriodForYear(year);
  if (req.body.period?.start && req.body.period?.end) {
    const start = new Date(req.body.period.start);
    const end = new Date(req.body.period.end);
    if (!(start < end)) {
      return ApiResponseUtil.error(res, 'period.end must be after period.start', 400);
    }
    period = { start, end };
  }

  const inventory = await Inventory.create({
    organizationId: req.user.organizationId,
    reportingYear: year,
    period,
    status: 'draft',
  });

  await recordAudit({
    organizationId: req.user.organizationId,
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'create',
    resourceType: 'inventory',
    resourceId: inventory._id.toString(),
    after: { reportingYear: year, status: 'draft', period },
  });

  ApiResponseUtil.success(res, inventory, 'Reporting-year inventory created', 201);
});

/** Transition between the open statuses (Draft ↔ Review). Publishing and
 * reopening have their own endpoints (they lock/unlock the member data). */
export const transitionInventory = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return ApiResponseUtil.error(res, 'Authentication required', 401);

  const target = req.body.status;
  if (target !== 'draft' && target !== 'review') {
    return ApiResponseUtil.error(
      res,
      'status must be "draft" or "review". Use /publish to publish and /reopen to reopen.',
      400
    );
  }

  const inventory = await Inventory.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId,
  });
  if (!inventory) return ApiResponseUtil.error(res, 'Inventory not found', 404);

  if (inventory.status === 'published') {
    return ApiResponseUtil.error(
      res,
      'A published reporting year is locked. Reopen it before changing status.',
      409
    );
  }

  const before = inventory.status;
  inventory.status = target;
  await inventory.save();

  await recordAudit({
    organizationId: req.user.organizationId,
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'update',
    resourceType: 'inventory-status',
    resourceId: inventory._id.toString(),
    before: { status: before },
    after: { status: target },
  });

  ApiResponseUtil.success(res, inventory, `Inventory moved to ${target}`);
});

/**
 * Publish (lock) a reporting year: freeze the GWP set and whole-year totals,
 * lock every member calculation (with a per-calculation snapshot), and write an
 * immutable InventorySnapshot. The completeness check here is a SOFT warning;
 * the hard gate is layered on in SI-5.
 */
export const publishInventory = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return ApiResponseUtil.error(res, 'Authentication required', 401);

  const inventory = await Inventory.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId,
  });
  if (!inventory) return ApiResponseUtil.error(res, 'Inventory not found', 404);
  if (inventory.status === 'published') {
    return ApiResponseUtil.success(res, inventory, 'Inventory is already published');
  }

  // Completeness (advisory in SI-2 — a hard gate replaces this in SI-5).
  const completeness = await computeCompleteness({
    organizationId: req.user.organizationId,
    start: inventory.period.start,
    end: inventory.period.end,
  });
  let completenessWarning: string | undefined;
  if (completeness.screened && completeness.gapCount > 0) {
    completenessWarning = `Published reporting year ${inventory.reportingYear} with ${completeness.gapCount} undocumented completeness gap(s) (${completeness.completenessPercent}% complete): ${completeness.gaps
      .map((g) => g.category)
      .join(', ')}.`;
  }

  // Freeze the GWP set from the org's current methodology.
  const org = await Organization.findById(req.user.organizationId).select('settings.gwpSet').lean();
  const gwpSet = isGwpSetName((org as any)?.settings?.gwpSet)
    ? ((org as any).settings.gwpSet as 'AR4' | 'AR5' | 'AR6')
    : DEFAULT_GWP_SET;

  // Lock all member calculations + capture their snapshots.
  const lockedNow = await lockMemberCalculations(
    req.user.organizationId,
    inventory._id.toString(),
    req.user.email,
    req.body?.comment
  );

  // Frozen whole-year figures (after the locks, so lockedCount is accurate).
  const figures = await computeInventoryFigures(req.user.organizationId, inventory._id.toString());

  inventory.status = 'published';
  inventory.gwpSet = gwpSet;
  inventory.frozenTotals = {
    scope1: figures.scope1,
    scope2: figures.scope2,
    scope3: figures.scope3,
    total: figures.total,
  };
  inventory.frozenCompletenessPercent = completeness.completenessPercent;
  inventory.publishedAt = new Date();
  inventory.publishedBy = req.user.email;
  await inventory.save();

  // Immutable year-level snapshot (restatement history).
  const version = (await InventorySnapshot.countDocuments({ inventoryId: inventory._id })) + 1;
  await InventorySnapshot.create({
    organizationId: req.user.organizationId,
    inventoryId: inventory._id,
    version,
    snapshot: {
      reportingYear: inventory.reportingYear,
      period: inventory.period,
      gwpSet,
      isBaseYear: inventory.isBaseYear,
      frozenTotals: inventory.frozenTotals,
      completenessPercent: completeness.completenessPercent,
      calculationCount: figures.calculationCount,
      lockedCount: figures.lockedCount,
      publishedAt: inventory.publishedAt,
      publishedBy: inventory.publishedBy,
    },
    reason: 'publish',
    comment: req.body?.comment,
    createdBy: req.user.email,
  });

  await recordAudit({
    organizationId: req.user.organizationId,
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'lock',
    resourceType: 'inventory',
    resourceId: inventory._id.toString(),
    before: { status: 'draft/review' },
    after: {
      status: 'published',
      gwpSet,
      frozenTotals: inventory.frozenTotals,
      calculationsLocked: lockedNow,
      snapshotVersion: version,
    },
    comment: req.body?.comment,
  });

  ApiResponseUtil.success(
    res,
    { ...inventory.toJSON(), calculationsLocked: lockedNow, snapshotVersion: version, completenessWarning },
    `Reporting year ${inventory.reportingYear} published — ${lockedNow} calculation(s) locked, snapshot v${version}${
      completenessWarning ? ' (with completeness warning)' : ''
    }`
  );
});

/** Reopen a published year for restatement: unlock member calculations and set
 * the inventory back to Draft. Audited. */
export const reopenInventory = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return ApiResponseUtil.error(res, 'Authentication required', 401);

  const inventory = await Inventory.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId,
  });
  if (!inventory) return ApiResponseUtil.error(res, 'Inventory not found', 404);
  if (inventory.status !== 'published') {
    return ApiResponseUtil.success(res, inventory, 'Inventory is not published');
  }

  const unlockedNow = await unlockMemberCalculations(
    req.user.organizationId,
    inventory._id.toString()
  );

  inventory.status = 'draft';
  inventory.publishedAt = undefined;
  inventory.publishedBy = undefined;
  await inventory.save();

  await recordAudit({
    organizationId: req.user.organizationId,
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'unlock',
    resourceType: 'inventory',
    resourceId: inventory._id.toString(),
    before: { status: 'published' },
    after: { status: 'draft', calculationsUnlocked: unlockedNow },
    comment: req.body?.comment,
  });

  ApiResponseUtil.success(
    res,
    { ...inventory.toJSON(), calculationsUnlocked: unlockedNow },
    `Reporting year ${inventory.reportingYear} reopened — ${unlockedNow} calculation(s) unlocked`
  );
});

/**
 * Designate (or clear) the base year. At most one inventory per organization is
 * the base year — designating a new one clears the previous. Optionally sets the
 * GHG Protocol recalculation significance threshold (percent).
 */
export const setBaseYear = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return ApiResponseUtil.error(res, 'Authentication required', 401);

  const { isBaseYear, recalcThresholdPercent } = req.body;
  if (typeof isBaseYear !== 'boolean') {
    return ApiResponseUtil.error(res, 'isBaseYear (boolean) is required', 400);
  }

  const inventory = await Inventory.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId,
  });
  if (!inventory) return ApiResponseUtil.error(res, 'Inventory not found', 404);

  if (recalcThresholdPercent !== undefined) {
    const t = Number(recalcThresholdPercent);
    if (!isFinite(t) || t < 0 || t > 100) {
      return ApiResponseUtil.error(res, 'recalcThresholdPercent must be between 0 and 100', 400);
    }
    inventory.recalcThresholdPercent = t;
  }

  const before = { isBaseYear: inventory.isBaseYear, recalcThresholdPercent: inventory.recalcThresholdPercent };

  if (isBaseYear) {
    // Only one base year per organization.
    await Inventory.updateMany(
      { organizationId: req.user.organizationId, _id: { $ne: inventory._id }, isBaseYear: true },
      { $set: { isBaseYear: false } }
    );
    inventory.isBaseYear = true;
  } else {
    inventory.isBaseYear = false;
  }
  await inventory.save();

  await recordAudit({
    organizationId: req.user.organizationId,
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'update',
    resourceType: 'inventory-base-year',
    resourceId: inventory._id.toString(),
    before,
    after: { isBaseYear: inventory.isBaseYear, recalcThresholdPercent: inventory.recalcThresholdPercent },
  });

  ApiResponseUtil.success(
    res,
    inventory,
    isBaseYear
      ? `Reporting year ${inventory.reportingYear} set as the base year (recalculation threshold ${inventory.recalcThresholdPercent}%)`
      : `Reporting year ${inventory.reportingYear} is no longer the base year`
  );
});

/**
 * Recalculation check (GHG Protocol base-year recalculation policy): compares an
 * inventory's CURRENT recomputed total against its FROZEN original (the first
 * publication snapshot, v1) and flags when the drift meets/exceeds the
 * significance threshold — the trigger for a base-year restatement. The
 * threshold is the organization's policy, taken from the base-year inventory
 * (falling back to this inventory's own threshold, default 5%).
 */
export const getRecalculationCheck = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return ApiResponseUtil.error(res, 'Authentication required', 401);

  const inventory = await Inventory.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId,
  });
  if (!inventory) return ApiResponseUtil.error(res, 'Inventory not found', 404);

  // The frozen reference is the FIRST publication (v1) — "as originally reported".
  const firstSnapshot = await InventorySnapshot.findOne({
    inventoryId: inventory._id,
    organizationId: req.user.organizationId,
  })
    .sort({ version: 1 })
    .lean();

  if (!firstSnapshot) {
    return ApiResponseUtil.success(res, {
      reportingYear: inventory.reportingYear,
      isBaseYear: inventory.isBaseYear,
      applicable: false,
      note: 'No frozen reference yet — publish this reporting year to establish the original figures before checking for recalculation drift.',
    });
  }

  const latestSnapshot = await InventorySnapshot.findOne({
    inventoryId: inventory._id,
    organizationId: req.user.organizationId,
  })
    .sort({ version: -1 })
    .select('version')
    .lean();

  const current = await computeInventoryFigures(req.user.organizationId, inventory._id.toString());
  const original = (firstSnapshot as any).snapshot?.frozenTotals || {};
  const originalTotal = original.total || 0;

  // Threshold = org policy (base-year inventory), falling back to this inventory.
  const baseYear = await Inventory.findOne({
    organizationId: req.user.organizationId,
    isBaseYear: true,
  })
    .select('recalcThresholdPercent reportingYear')
    .lean();
  const thresholdPercent =
    (baseYear as any)?.recalcThresholdPercent ?? inventory.recalcThresholdPercent ?? 5;

  const deltaKg = Math.round((current.total - originalTotal) * 100) / 100;
  const deltaPercent =
    originalTotal > 0 ? Math.round((deltaKg / originalTotal) * 10000) / 100 : null;
  const exceedsThreshold = deltaPercent !== null && Math.abs(deltaPercent) >= thresholdPercent;

  ApiResponseUtil.success(res, {
    reportingYear: inventory.reportingYear,
    isBaseYear: inventory.isBaseYear,
    applicable: true,
    frozen: {
      version: (firstSnapshot as any).version,
      total: originalTotal,
      publishedAt: (firstSnapshot as any).snapshot?.publishedAt,
    },
    latestPublishedVersion: (latestSnapshot as any)?.version,
    current: { total: current.total },
    deltaKg,
    deltaPercent,
    thresholdPercent,
    thresholdSource: baseYear ? `base year ${(baseYear as any).reportingYear}` : 'this inventory',
    exceedsThreshold,
    recommendation: exceedsThreshold
      ? `Change of ${deltaPercent}% meets/exceeds the ${thresholdPercent}% significance threshold — a base-year recalculation/restatement is warranted (GHG Protocol Corporate Standard, base-year recalculation policy).`
      : deltaPercent === null
      ? 'Original total was zero — drift percentage is not defined.'
      : `Change of ${deltaPercent}% is within the ${thresholdPercent}% significance threshold — no recalculation required.`,
  });
});

/** List the immutable publication snapshots for an inventory (metadata). */
export const getInventorySnapshots = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return ApiResponseUtil.error(res, 'Authentication required', 401);

  const snapshots = await InventorySnapshot.find({
    inventoryId: req.params.id,
    organizationId: req.user.organizationId,
  })
    .sort({ version: -1 })
    .lean();

  ApiResponseUtil.success(res, {
    snapshots: snapshots.map((s: any) => ({ ...s, id: s._id.toString() })),
    count: snapshots.length,
  });
});
