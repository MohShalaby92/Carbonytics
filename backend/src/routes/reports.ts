import { Router } from 'express';
import { query } from 'express-validator';
import {
  getDashboardData,
  getEmissionsReport,
  getComparisonReport,
  getTrendAnalysis,
  exportReport,
  getIndustryBenchmarks,
} from '../controllers/reportController';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { cache } from '../middleware/cache';

const router = Router();
router.use(authenticate);

// Validation middleware
const validateDateRange = [
  query('startDate').optional().isISO8601().withMessage('Valid start date is required'),
  query('endDate').optional().isISO8601().withMessage('Valid end date is required'),
];

const validateExportFormat = [
  query('format').optional().isIn(['pdf', 'excel', 'csv']).withMessage('Invalid export format'),
];

// Dashboard routes
router.get('/dashboard', cache(300), getDashboardData);

// Report routes
router.get('/emissions', 
  validate(validateDateRange), 
  cache(600), 
  getEmissionsReport
);

router.get('/comparison', 
  validate(validateDateRange), 
  cache(600), 
  getComparisonReport
);

router.get('/trends', 
  validate(validateDateRange), 
  cache(1800), 
  getTrendAnalysis
);

// Export routes
router.get('/export/:reportId', 
  validate(validateExportFormat), 
  exportReport
);

// Benchmark routes
router.get('/benchmarks', 
  cache(3600), 
  getIndustryBenchmarks
);

export default router;
