import { Router } from 'express';
import { body } from 'express-validator';
import {
  getVehicles,
  createVehicle,
  updateVehicle,
  deactivateVehicle,
} from '../controllers/vehicleController';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validation';

const router = Router();
router.use(authenticate);

const validateVehicle = [
  body('name').optional({ values: 'undefined' }).trim().notEmpty().withMessage('Vehicle name cannot be empty'),
  body('vehicleType')
    .optional()
    .isIn(['car', 'van', 'hgv', 'motorbike', 'bus', 'other'])
    .withMessage('Invalid vehicle type'),
];

router.get('/', getVehicles);
router.post(
  '/',
  body('name').trim().notEmpty().withMessage('Vehicle name is required'),
  validate(validateVehicle),
  authorize('admin', 'manager'),
  createVehicle
);
router.put('/:vehicleId', validate(validateVehicle), authorize('admin', 'manager'), updateVehicle);
router.delete('/:vehicleId', authorize('admin', 'manager'), deactivateVehicle);

export default router;
