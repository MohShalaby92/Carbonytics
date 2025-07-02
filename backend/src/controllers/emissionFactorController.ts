import { Request, Response } from 'express';
import { EmissionFactor } from '../models/EmissionFactor';
import { EmissionCategory } from '../models/EmissionCategory';
import { ApiResponseUtil } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';

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
    filter.region = region;
  }
  
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

  ApiResponseUtil.paginated(res, factors, pageNum, limitNum, total);
});

export const getFactorsByCategory = asyncHandler(async (req: Request, res: Response) => {
  const { categoryId } = req.params;
  const { region = 'egypt', preferLocal = 'true' } = req.query;

  // Check if category exists
  const category = await EmissionCategory.findById(categoryId);
  if (!category) {
    return ApiResponseUtil.error(res, 'Category not found', 404);
  }

  let factors;
  
  if (preferLocal === 'true') {
    // First try to get Egyptian factors, fallback to global
    const egyptianFactors = await EmissionFactor.find({
      categoryId,
      region: 'egypt',
      isActive: true,
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
    })
      .sort({ year: -1, isDefault: -1 })
      .lean();
  }

  ApiResponseUtil.success(res, {
    category: {
      id: category.id,
      name: category.category,
      scope: category.scope,
    },
    factors,
    region: preferLocal === 'true' ? 'egypt (with global fallback)' : region,
    count: factors.length,
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

  ApiResponseUtil.success(res, factor);
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
    factors,
    count: factors.length,
  });
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
