import { Request, Response } from 'express';
import { EmissionCategory } from '../models/EmissionCategory';
import { ApiResponseUtil } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { cache } from '../middleware/cache';

export const getEmissionCategories = asyncHandler(async (req: Request, res: Response) => {
  const { scope, industry, priority, search } = req.query;
  
  // Build filter
  const filter: any = { isActive: true };
  
  if (scope) {
    filter.scope = parseInt(scope as string);
  }
  
  if (industry) {
    filter.industries = { $in: [industry] };
  }
  
  if (priority) {
    filter.priority = priority;
  }
  
  if (search) {
    filter.$or = [
      { category: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
    ];
  }

  const categories = await EmissionCategory.find(filter)
    .sort({ scope: 1, displayOrder: 1, category: 1 })
    .lean();

  // Group by scope for better organization
  const groupedCategories = categories.reduce((acc, category) => {
    const scope = `scope${category.scope}`;
    if (!acc[scope]) acc[scope] = [];
    acc[scope].push(category);
    return acc;
  }, {} as Record<string, any[]>);

  ApiResponseUtil.success(res, {
    categories,
    grouped: groupedCategories,
    total: categories.length,
  });
});

export const getCategoryById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  
  const category = await EmissionCategory.findById(id).lean();
  
  if (!category) {
    return ApiResponseUtil.error(res, 'Category not found', 404);
  }

  ApiResponseUtil.success(res, category);
});

export const getCategoriesByScope = asyncHandler(async (req: Request, res: Response) => {
  const { scope } = req.params;
  const scopeNumber = parseInt(scope);
  
  if (![1, 2, 3].includes(scopeNumber)) {
    return ApiResponseUtil.error(res, 'Invalid scope. Must be 1, 2, or 3', 400);
  }

  const categories = await EmissionCategory.find({ 
    scope: scopeNumber, 
    isActive: true 
  })
    .sort({ displayOrder: 1, category: 1 })
    .lean();

  ApiResponseUtil.success(res, {
    scope: scopeNumber,
    categories,
    count: categories.length,
  });
});

export const getCategoriesForIndustry = asyncHandler(async (req: Request, res: Response) => {
  const { industry } = req.params;
  
  const categories = await EmissionCategory.find({
    $or: [
      { industries: { $in: [industry] } },
      { industries: { $size: 0 } }, // Categories applicable to all industries
    ],
    isActive: true,
  })
    .sort({ scope: 1, priority: 1, displayOrder: 1 })
    .lean();

  // Add relevance scoring for the industry
  const categoriesWithRelevance = categories.map(category => ({
    ...category,
    relevance: Array.isArray(category.industries) && category.industries.includes(industry) ? 'high' : 'medium',
  }));

  ApiResponseUtil.success(res, {
    industry,
    categories: categoriesWithRelevance,
    count: categories.length,
  });
});
