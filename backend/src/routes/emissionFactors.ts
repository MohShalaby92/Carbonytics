import { Router } from 'express';
import { body } from 'express-validator';
import {
  getEmissionFactors,
  getFactorsByCategory,
  getDefaultFactor,
  searchFactors,
  getFactorSources,
  createEmissionFactor,
  updateEmissionFactor,
  getFactorVersions,
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
  // Optional per-gas values (kg gas per activity unit) — enable GWP-set-aware calculation.
  body('co2').optional().isFloat({ min: 0 }).withMessage('co2 must be >= 0'),
  body('ch4').optional().isFloat({ min: 0 }).withMessage('ch4 must be >= 0'),
  body('n2o').optional().isFloat({ min: 0 }).withMessage('n2o must be >= 0'),
];

const validateUpdateFactor = [
  body('factor').optional().isFloat({ gt: 0 }).withMessage('Factor must be a positive number'),
  body('unit').optional().trim().notEmpty().withMessage('Unit cannot be empty'),
  body('year').optional().isInt({ min: 2000 }).withMessage('Year must be 2000 or later'),
  body('co2').optional().isFloat({ min: 0 }).withMessage('co2 must be >= 0'),
  body('ch4').optional().isFloat({ min: 0 }).withMessage('ch4 must be >= 0'),
  body('n2o').optional().isFloat({ min: 0 }).withMessage('n2o must be >= 0'),
];

// Public routes. optionalAuth runs BEFORE cache so the cache key is scoped to the
// organization — required because responses can include org-custom factors.
router.get('/', optionalAuth, cache(1800), getEmissionFactors);
router.get('/search', cache(900), searchFactors);
router.get('/sources', cache(3600), getFactorSources);
router.get('/category/:categoryId', optionalAuth, cache(1800), getFactorsByCategory);
router.get('/category/:categoryId/default', optionalAuth, cache(1800), getDefaultFactor);

// Immutable factor version history (§3). Authenticated so a custom factor's
// history stays scoped to its organization.
router.get('/:id/versions', authenticate, getFactorVersions);

// Custom factors (admin/manager). Clears the factor cache so new/edited factors
// show up immediately in the calculator.
router.post(
  '/',
  authenticate,
  authorize('admin', 'manager'),
  validate(validateCreateFactor),
  clearCache('emission-factors'),
  createEmissionFactor
);

// Edit an org-custom factor — records a new immutable version on each value change.
router.put(
  '/:id',
  authenticate,
  authorize('admin', 'manager'),
  validate(validateUpdateFactor),
  clearCache('emission-factors'),
  updateEmissionFactor
);

export default router;
