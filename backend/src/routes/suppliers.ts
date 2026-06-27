import { Router } from 'express';
import { body } from 'express-validator';
import {
  getSuppliers,
  createSupplier,
  updateSupplier,
  deactivateSupplier,
  createDataRequest,
  updateDataRequest,
  fulfillDataRequest,
} from '../controllers/supplierController';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validation';

const router = Router();
router.use(authenticate);

const validateSupplier = [
  body('name').optional({ values: 'undefined' }).trim().notEmpty().withMessage('Supplier name cannot be empty'),
  body('contactEmail').optional({ values: 'falsy' }).isEmail().withMessage('Contact email must be valid'),
  body('categories').optional().isArray().withMessage('categories must be an array of category ids'),
];

const validateDataRequest = [
  body('period.start').notEmpty().withMessage('Request period start is required'),
  body('period.end').notEmpty().withMessage('Request period end is required'),
  body('message').optional().trim().isLength({ max: 1000 }).withMessage('Message too long (max 1000)'),
];

const validateRequestUpdate = [
  body('status').isIn(['received', 'declined']).withMessage('status must be received or declined'),
];

const validateFulfillment = [
  body('type')
    .isIn(['custom-factor', 'activity-data', 'document'])
    .withMessage('type must be custom-factor, activity-data or document'),
];

router.get('/', getSuppliers);
router.post(
  '/',
  body('name').trim().notEmpty().withMessage('Supplier name is required'),
  validate(validateSupplier),
  authorize('admin', 'manager'),
  createSupplier
);
router.put('/:supplierId', validate(validateSupplier), authorize('admin', 'manager'), updateSupplier);
router.delete('/:supplierId', authorize('admin', 'manager'), deactivateSupplier);

// Data-request workflow
router.post('/:supplierId/requests', validate(validateDataRequest), authorize('admin', 'manager'), createDataRequest);
router.patch('/:supplierId/requests/:requestId', validate(validateRequestUpdate), authorize('admin', 'manager'), updateDataRequest);
router.post('/:supplierId/requests/:requestId/fulfill', validate(validateFulfillment), authorize('admin', 'manager'), fulfillDataRequest);

export default router;
