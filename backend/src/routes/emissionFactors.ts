import { Router } from 'express';
import { body } from 'express-validator';
import {
  getEmissionFactors,
  getFactorsByCategory,
  getDefaultFactor,
  searchFactors,
  getFactorSources,
  createEmissionFactor,
} from '../controllers/emissionFactorController';
import { authenticate, authorize, optionalAuth } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { cache, clearCache } from '../middleware/cache';

const router = Router();

const validateCreateFactor = [
  body('categoryId').isMongoId().withMessage('Valid category ID is required'),
  body('name').trim().notEmpty().withMessage('Factor name is required'),
  body('factor').isFloat({ gt: 0 }).withMessage('Factor must be a positive number'),
  body('unit').trim().notEmpty().withMessage('Unit is required (e.g. kg CO2e/kWh)'),
  body('source').optional().trim(),
  body('year').optional().isInt({ min: 2000 }).withMessage('Year must be 2000 or later'),
];

// Public routes. optionalAuth runs BEFORE cache so the cache key is scoped to the
// organization — required because responses can include org-custom factors.
router.get('/', optionalAuth, cache(1800), getEmissionFactors);
router.get('/search', cache(900), searchFactors);
router.get('/sources', cache(3600), getFactorSources);
router.get('/category/:categoryId', optionalAuth, cache(1800), getFactorsByCategory);
router.get('/category/:categoryId/default', optionalAuth, cache(1800), getDefaultFactor);

// Custom factors (admin/manager). Clears the factor cache so new factors show up
// immediately in the calculator.
router.post(
  '/',
  authenticate,
  authorize('admin', 'manager'),
  validate(validateCreateFactor),
  clearCache('emission-factors'),
  createEmissionFactor
);

export default router;
