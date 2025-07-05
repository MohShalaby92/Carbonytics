import { Request, Response } from 'express';
import { Calculation } from '../models/Calculation';
import { EmissionCategory } from '../models/EmissionCategory';
import { ApiResponseUtil } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthenticatedRequest } from '../types';
import { BenchmarkService } from '../services/benchmarkService';

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