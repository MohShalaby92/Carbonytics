import { Request, Response } from 'express';
import { EmissionFactor } from '../models/EmissionFactor';
import { EmissionCategory } from '../models/EmissionCategory';
import { ApiResponseUtil } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthenticatedRequest } from '../types';
import { recordAudit } from '../utils/audit';

// .lean() bypasses the model's toJSON transform, so re-add the `id` field the
// frontend relies on.
const withId = <T extends { _id: any }>(doc: T): T & { id: string } => ({
  ...doc,
  id: doc._id.toString(),
});

/**
 * Visibility filter for factors: shared factors (no organizationId) are visible to
 * everyone; an organization's custom factors are visible only to that organization.
 */
const visibleToOrg = (req: Request): any[] => {
  const orgId = (req as AuthenticatedRequest).user?.organizationId;
  const scope: any[] = [{ organizationId: { $exists: false } }, { organizationId: null }];
  if (orgId) scope.push({ organizationId: orgId });
  return scope;
};

export const getEmissionFactors = asyncHandler(async (req: Request, res: Response) => {
  const { 
    categoryId, 
    region = 'egypt', 
    year, 
    source, 
    fuelType, 
    vehicleType,
    active = 'true',
    limit = '50',
    page = '1'
  } = req.query;

  const filter: any = {};
  
  if (active === 'true') {
    filter.isActive = true;
  }
  
  if (categoryId) {
    filter.categoryId = categoryId;
  }
  
  if (region) {
    // Prefer the requested region but include global factors as a fallback, so
    // generic (global) factors still appear under the default 'egypt' view.
    filter.region = region === 'global' ? 'global' : { $in: [region as string, 'global'] };
  }

  // Shared factors + this organization's custom factors only.
  filter.$or = visibleToOrg(req);

  if (year) {
    filter.year = parseInt(year as string);
  }
  
  if (source) {
    filter.source = source;
  }
  
  if (fuelType) {
    filter.fuelType = fuelType;
  }
  
  if (vehicleType) {
    filter.vehicleType = vehicleType;
  }

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const [factors, total] = await Promise.all([
    EmissionFactor.find(filter)
      .populate('categoryId', 'category scope description')
      .sort({ year: -1, isDefault: -1, factor: 1 })
      .limit(limitNum)
      .skip(skip)
      .lean(),
    EmissionFactor.countDocuments(filter),
  ]);

  ApiResponseUtil.paginated(res, factors.map(withId), pageNum, limitNum, total);
});

export const getFactorsByCategory = asyncHandler(async (req: Request, res: Response) => {
  const { categoryId } = req.params;
  const { region = 'egypt', preferLocal = 'true' } = req.query;

  // Check if category exists
  const category = await EmissionCategory.findById(categoryId);
  if (!category) {
    return ApiResponseUtil.error(res, 'Category not found', 404);
  }

  // The organization's own custom factors always come first.
  const orgId = (req as AuthenticatedRequest).user?.organizationId;
  const customFactors = orgId
    ? await EmissionFactor.find({ categoryId, isActive: true, organizationId: orgId })
        .sort({ year: -1, createdAt: -1 })
        .lean()
    : [];

  const sharedScope = [{ organizationId: { $exists: false } }, { organizationId: null }];
  let factors;

  if (preferLocal === 'true') {
    // First try to get Egyptian factors, fallback to global
    const egyptianFactors = await EmissionFactor.find({
      categoryId,
      region: 'egypt',
      isActive: true,
      $or: sharedScope,
    })
      .sort({ year: -1, isDefault: -1 })
      .lean();

    if (egyptianFactors.length > 0) {
      factors = egyptianFactors;
    } else {
      // Fallback to global factors
      factors = await EmissionFactor.find({
        categoryId,
        region: 'global',
        isActive: true,
        $or: sharedScope,
      })
        .sort({ year: -1, isDefault: -1 })
        .lean();
    }
  } else {
    // Get factors for specified region
    factors = await EmissionFactor.find({
      categoryId,
      region,
      isActive: true,
      $or: sharedScope,
    })
      .sort({ year: -1, isDefault: -1 })
      .lean();
  }

  // Egyptian/library factors first (the primary default — preselected by the
  // calculator UI), then the organization's custom factors as explicit
  // alternatives the user can switch to.
  const allFactors = [...factors, ...customFactors].map(withId);

  ApiResponseUtil.success(res, {
    category: {
      id: category.id,
      name: category.category,
      scope: category.scope,
    },
    factors: allFactors,
    region: preferLocal === 'true' ? 'egypt (with global fallback)' : region,
    count: allFactors.length,
  });
});

export const getDefaultFactor = asyncHandler(async (req: Request, res: Response) => {
  const { categoryId } = req.params;
  const { region = 'egypt', fuelType, vehicleType } = req.query;

  const filter: any = {
    categoryId,
    isActive: true,
  };

  // Add specific filters if provided
  if (fuelType) filter.fuelType = fuelType;
  if (vehicleType) filter.vehicleType = vehicleType;

  // Try to find Egyptian factor first
  let factor = await EmissionFactor.findOne({
    ...filter,
    region: 'egypt',
    isDefault: true,
  }).lean();

  // Fallback to global factor
  if (!factor) {
    factor = await EmissionFactor.findOne({
      ...filter,
      region: 'global',
      isDefault: true,
    }).lean();
  }

  // Fallback to any factor for the category
  if (!factor) {
    factor = await EmissionFactor.findOne({
      ...filter,
      region: region === 'egypt' ? 'egypt' : 'global',
    })
      .sort({ year: -1, isDefault: -1 })
      .lean();
  }

  if (!factor) {
    return ApiResponseUtil.error(res, 'No emission factor found for this category', 404);
  }

  ApiResponseUtil.success(res, withId(factor));
});

export const searchFactors = asyncHandler(async (req: Request, res: Response) => {
  const { q, region, scope } = req.query;
  
  if (!q) {
    return ApiResponseUtil.error(res, 'Search query is required', 400);
  }

  const searchRegex = new RegExp(q as string, 'i');
  
  // Build aggregation pipeline
  const pipeline: any[] = [
    {
      $lookup: {
        from: 'emissioncategories',
        localField: 'categoryId',
        foreignField: '_id',
        as: 'category',
      },
    },
    {
      $unwind: '$category',
    },
    {
      $match: {
        isActive: true,
        // This route is publicly cached, so org-custom factors are excluded from
        // search results (they remain reachable via the per-category endpoint).
        organizationId: { $in: [null, undefined] },
        $or: [
          { name: searchRegex },
          { 'category.category': searchRegex },
          { 'category.description': searchRegex },
          { fuelType: searchRegex },
          { vehicleType: searchRegex },
        ],
        ...(region && { region }),
        ...(scope && { 'category.scope': parseInt(scope as string) }),
      },
    },
    {
      $sort: { 'category.scope': 1, year: -1, isDefault: -1 },
    },
    {
      $limit: 20,
    },
  ];

  const factors = await EmissionFactor.aggregate(pipeline);

  ApiResponseUtil.success(res, {
    query: q,
    factors: factors.map(withId),
    count: factors.length,
  });
});

/**
 * Create an organization-scoped custom emission factor (admin/manager only).
 * Custom factors are only visible to the creating organization and appear first
 * in that organization's per-category factor list.
 */
export const createEmissionFactor = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }

  const { categoryId, name, factor, unit, source, year, description, co2, ch4, n2o } = req.body;

  const category = await EmissionCategory.findById(categoryId);
  if (!category) {
    return ApiResponseUtil.error(res, 'Category not found', 404);
  }

  const doc = await EmissionFactor.create({
    categoryId,
    name: String(name).trim(),
    description: description ? String(description).trim() : undefined,
    factor: parseFloat(factor),
    unit: String(unit).trim(),
    source: source ? String(source).trim() : 'Custom',
    region: 'global',
    country: 'EG',
    year: year ? parseInt(year, 10) : new Date().getFullYear(),
    qualityRating: 'medium',
    organizationId: req.user.organizationId,
    isDefault: false,
    // Optional per-gas values (kg gas per activity unit). When present, the
    // engine computes per gas × the organization's GWP set instead of using
    // the CO2e value directly.
    ...(co2 !== undefined ? { co2: parseFloat(co2) } : {}),
    ...(ch4 !== undefined ? { ch4: parseFloat(ch4) } : {}),
    ...(n2o !== undefined ? { n2o: parseFloat(n2o) } : {}),
  });

  await recordAudit({
    organizationId: req.user.organizationId,
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'create',
    resourceType: 'emission-factor',
    resourceId: doc._id.toString(),
    after: { name: doc.name, factor: doc.factor, unit: doc.unit, source: doc.source, year: doc.year, co2: doc.co2, ch4: doc.ch4, n2o: doc.n2o },
  });

  ApiResponseUtil.success(res, doc.toJSON(), 'Custom emission factor created', 201);
});

export const getFactorSources = asyncHandler(async (req: Request, res: Response) => {
  const sources = await EmissionFactor.distinct('source');
  const regions = await EmissionFactor.distinct('region');
  const years = await EmissionFactor.distinct('year');
  
  ApiResponseUtil.success(res, {
    sources: sources.sort(),
    regions: regions.sort(),
    years: years.sort((a, b) => b - a), // Latest first
  });
});
