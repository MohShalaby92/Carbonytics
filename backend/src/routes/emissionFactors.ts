import { Router } from 'express';
import {
  getEmissionFactors,
  getFactorsByCategory,
  getDefaultFactor,
  searchFactors,
  getFactorSources,
} from '../controllers/emissionFactorController';
import { optionalAuth } from '../middleware/auth';
import { cache } from '../middleware/cache';

const router = Router();

// Public routes
router.get('/', cache(1800), optionalAuth, getEmissionFactors);
router.get('/search', cache(900), searchFactors);
router.get('/sources', cache(3600), getFactorSources);
router.get('/category/:categoryId', cache(1800), getFactorsByCategory);
router.get('/category/:categoryId/default', cache(1800), getDefaultFactor);

export default router;
