import { Request, Response } from 'express';
import { Calculation } from '../models/Calculation';
import { EmissionFactor } from '../models/EmissionFactor';
import { EmissionCategory } from '../models/EmissionCategory';
import { AuthenticatedRequest } from '../types';
import { ApiResponseUtil } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { calculationEngine } from '../services/calculationEngine';
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
    calculations, // Array of calculation entries
  } = req.body;

  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }

  if (!title || !period || !calculations || !Array.isArray(calculations)) {
    return ApiResponseUtil.error(res, 'Title, period, and calculations array are required', 400);
  }

  // Validate period
  const startDate = new Date(period.start);
  const endDate = new Date(period.end);
  
  if (startDate >= endDate) {
    return ApiResponseUtil.error(res, 'End date must be after start date', 400);
  }

  // Calculate totals by scope
  const emissions = {
    scope1: 0,
    scope2: 0,
    scope3: 0,
    total: 0,
  };

  // Process each calculation entry
  const processedCalculations = [];
  
  for (const calc of calculations) {
    const category = await EmissionCategory.findById(calc.categoryId);
    if (!category) {
      return ApiResponseUtil.error(res, `Category not found: ${calc.categoryId}`, 400);
    }

    const entry = {
      categoryId: calc.categoryId,
      value: calc.value,
      unit: calc.unit,
      factor: calc.factor,
      emissions: calc.emissions,
      notes: calc.notes,
    };

    processedCalculations.push(entry);

    // Add to scope totals
    switch (category.scope) {
      case 1:
        emissions.scope1 += calc.emissions;
        break;
      case 2:
        emissions.scope2 += calc.emissions;
        break;
      case 3:
        emissions.scope3 += calc.emissions;
        break;
    }
  }

  emissions.total = emissions.scope1 + emissions.scope2 + emissions.scope3;

  // Create calculation document
  const calculation = new Calculation({
    organizationId: req.user.organizationId,
    userId: req.user.id,
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

  ApiResponseUtil.success(res, calculation, 'Calculation saved successfully', 201);
});

export const getCalculations = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }

  const { 
    status, 
    startDate, 
    endDate, 
    page = '1', 
    limit = '10' 
  } = req.query;

  const filter: any = {
    organizationId: req.user.organizationId,
  };

  if (status) {
    filter.status = status;
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
