import { Router } from 'express';
import {
  calculateEmissions,
  calculateBatchEmissions,
  calculateBusinessTravel,
  saveCalculation,
  getCalculations,
  getCalculationById,
  lockCalculation,
  unlockCalculation,
  verifyCalculation,
  getCalculationSnapshots,
  getSnapshotDiff,
  estimateCalculationValue,
} from '../controllers/calculationController';
import { authenticate, authorize } from '../middleware/auth';

// Contributor+ roles may compute and save; viewer/verifier are read-only.
const CONTRIBUTOR_ROLES = ['admin', 'manager', 'user'] as const;
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

// Calculation endpoints (write/compute actions — viewer/verifier are read-only)
router.post('/calculate',
  authorize(...CONTRIBUTOR_ROLES),
  validate(validateCalculation),
  calculateEmissions
);

router.post('/calculate-batch',
  authorize(...CONTRIBUTOR_ROLES),
  calculateBatchEmissions
);

router.post('/calculate-business-travel',
  authorize(...CONTRIBUTOR_ROLES),
  validate(validateBusinessTravel),
  calculateBusinessTravel
);

// Conservative gap-filling suggestion (does not save anything).
router.post('/estimate',
  authorize(...CONTRIBUTOR_ROLES),
  body('categoryId').isMongoId().withMessage('Valid category ID is required'),
  body('period.start').isISO8601().withMessage('Valid period start is required'),
  body('period.end').isISO8601().withMessage('Valid period end is required'),
  estimateCalculationValue
);

router.post('/',
  authorize(...CONTRIBUTOR_ROLES),
  validate(validateSaveCalculation),
  clearCache('calculations'),
  saveCalculation
);

router.get('/', getCalculations);
router.get('/:id', getCalculationById);

// Inventory lifecycle: lock = publish (immutable), unlock = audited correction path.
router.patch('/:id/lock', authorize('admin', 'manager'), clearCache('calculations'), lockCalculation);
router.patch('/:id/unlock', authorize('admin', 'manager'), clearCache('calculations'), unlockCalculation);

// Independent verification: verifier (or admin) signs off a locked inventory.
router.patch('/:id/verify', authorize('verifier', 'admin'), clearCache('calculations'), verifyCalculation);

// Publication snapshots + restatement diffs.
router.get('/:id/snapshots', getCalculationSnapshots);
router.get('/:id/snapshots/diff', getSnapshotDiff);

export default router;
