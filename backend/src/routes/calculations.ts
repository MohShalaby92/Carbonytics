import { Router } from 'express';
import {
  calculateEmissions,
  calculateBatchEmissions,
  calculateBusinessTravel,
  saveCalculation,
  getCalculations,
  getCalculationById,
} from '../controllers/calculationController';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { body } from 'express-validator';
import { clearCache } from '../middleware/cache';

const router = Router();

// All calculation routes require authentication
router.use(authenticate);

// Validation middleware
export const validateCalculation = [
  body('categoryId').isMongoId().withMessage('Valid category ID is required'),
  body('value').isNumeric().isFloat({ gt: 0 }).withMessage('Value must be a positive number'),
  body('unit').notEmpty().withMessage('Unit is required'),
  body('factorId').optional().isMongoId().withMessage('Factor ID must be valid if provided'),
  body('metadata').optional().isObject().withMessage('Metadata must be an object'),
];

export const validateBusinessTravel = [
  body('origin').notEmpty().withMessage('Origin is required'),
  body('destination').notEmpty().withMessage('Destination is required'),
  body('travelMode').isIn(['Flight', 'Car', 'Train', 'Bus']).withMessage('Valid travel mode is required'),
  body('travelClass').optional().isIn(['Economy', 'Business', 'First']).withMessage('Invalid travel class'),
  body('roundTrip').optional().isBoolean().withMessage('Round trip must be boolean'),
];

export const validateSaveCalculation = [
  body('title').notEmpty().withMessage('Title is required'),
  body('period.start').isISO8601().withMessage('Valid start date is required'),
  body('period.end').isISO8601().withMessage('Valid end date is required'),
  body('calculations').isArray({ min: 1 }).withMessage('At least one calculation is required'),
];

// Calculation endpoints
router.post('/calculate', 
  validate(validateCalculation),
  calculateEmissions
);

router.post('/calculate-batch',
  calculateBatchEmissions
);

router.post('/calculate-business-travel',
  validate(validateBusinessTravel),
  calculateBusinessTravel
);

router.post('/', 
  validate(validateSaveCalculation),
  clearCache('calculations'),
  saveCalculation
);

router.get('/', getCalculations);
router.get('/:id', getCalculationById);

export default router;
