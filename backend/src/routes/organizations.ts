import { Router } from 'express';
import { body } from 'express-validator';
import {
  getOrganization,
  updateOrganization,
  getOrganizationUsers,
  inviteUser,
  updateUserRole,
  removeUser,
  getOrganizationSettings,
  updateOrganizationSettings,
} from '../controllers/organizationController';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validation';

const router = Router();
router.use(authenticate);

// Validation middleware
const validateOrganizationUpdate = [
  body('name').optional().notEmpty().withMessage('Name cannot be empty'),
  body('industry').optional().notEmpty().withMessage('Industry cannot be empty'),
  body('country').optional().notEmpty().withMessage('Country cannot be empty'),
  body('size').optional().isIn(['small', 'medium', 'large']).withMessage('Invalid organization size'),
];

const validateUserInvite = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('role').isIn(['admin', 'manager', 'user']).withMessage('Valid role is required'),
  body('name').notEmpty().withMessage('Name is required'),
];

const validateUserRoleUpdate = [
  body('role').isIn(['admin', 'manager', 'user']).withMessage('Valid role is required'),
];

const validateSettings = [
  body('currency').optional().isLength({ min: 3, max: 3 }).withMessage('Currency must be 3 characters'),
  body('timezone').optional().notEmpty().withMessage('Timezone cannot be empty'),
  body('language').optional().notEmpty().withMessage('Language cannot be empty'),
];

// Organization routes
router.get('/', getOrganization);
router.put('/', validate(validateOrganizationUpdate), authorize('admin', 'manager'), updateOrganization);

// User management routes
router.get('/users', getOrganizationUsers);
router.post('/users/invite', validate(validateUserInvite), authorize('admin'), inviteUser);
router.put('/users/:userId/role', validate(validateUserRoleUpdate), authorize('admin'), updateUserRole);
router.delete('/users/:userId', authorize('admin'), removeUser);

// Settings routes
router.get('/settings', getOrganizationSettings);
router.put('/settings', validate(validateSettings), authorize('admin'), updateOrganizationSettings);

export default router;
