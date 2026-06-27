import { Router } from 'express';
import {
  getEmissionCategories,
  getCategoryById,
  getCategoriesByScope,
  getCategoriesForIndustry,
} from '../controllers/emissionCategoryController';
import { authenticate, optionalAuth } from '../middleware/auth';
import { cache } from '../middleware/cache';

const router = Router();

// Public routes (with optional auth for personalization)
router.get('/', optionalAuth, cache(3600), getEmissionCategories);
router.get('/scope/:scope', cache(3600), getCategoriesByScope);
router.get('/industry/:industry', cache(1800), getCategoriesForIndustry);
router.get('/:id', cache(3600), getCategoryById);

export default router;
