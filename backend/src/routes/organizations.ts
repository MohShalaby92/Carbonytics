import { Router } from 'express';
import { body } from 'express-validator';
import {
  getOrganization,
  updateOrganization,
  updateOrganizationTargets,
  updateOrganizationExclusions,
  updateOrganizationDenominators,
  updateRelevantCategories,
  getAuditLog,
  getFacilities,
  createFacility,
  updateFacility,
  deactivateFacility,
  getOrganizationUsers,
  inviteUser,
  updateUserRole,
  removeUser,
  getOrganizationSettings,
  updateOrganizationSettings,
  getOnboarding,
  updateOnboarding,
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
  body('consolidationApproach')
    .optional()
    .isIn(['equity_share', 'financial_control', 'operational_control'])
    .withMessage('Consolidation approach must be equity_share, financial_control or operational_control'),
];

const validateFacility = [
  body('name').optional({ values: 'undefined' }).trim().notEmpty().withMessage('Facility name cannot be empty'),
  body('parentFacilityId').optional({ values: 'falsy' }).isMongoId().withMessage('parentFacilityId must be a valid id'),
  body('entityType').optional().isIn(['subsidiary', 'division', 'site', 'asset']).withMessage('entityType must be subsidiary, division, site or asset'),
  body('ownershipPercent').optional().isFloat({ min: 0, max: 100 }).withMessage('Ownership must be 0-100%'),
  body('operationalControl').optional().isBoolean().withMessage('operationalControl must be boolean'),
  body('financialControl').optional().isBoolean().withMessage('financialControl must be boolean'),
  body('acquiredDate').optional({ values: 'falsy' }).isISO8601().withMessage('acquiredDate must be a valid date'),
  body('disposedDate').optional({ values: 'falsy' }).isISO8601().withMessage('disposedDate must be a valid date'),
];

const ALL_ROLES = ['admin', 'manager', 'user', 'viewer', 'verifier'];

const validateUserInvite = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('role').isIn(ALL_ROLES).withMessage('Valid role is required'),
  body('name').notEmpty().withMessage('Name is required'),
];

const validateUserRoleUpdate = [
  body('role').isIn(ALL_ROLES).withMessage('Valid role is required'),
];

const validateSettings = [
  body('currency').optional().isLength({ min: 3, max: 3 }).withMessage('Currency must be 3 characters'),
  body('timezone').optional().notEmpty().withMessage('Timezone cannot be empty'),
  body('language').optional().notEmpty().withMessage('Language cannot be empty'),
  body('gwpSet').optional().isIn(['AR4', 'AR5', 'AR6']).withMessage('GWP set must be AR4, AR5 or AR6'),
  body('persona').optional().isIn(['enterprise', 'consultant', 'sme']).withMessage('Persona must be enterprise, consultant or sme'),
];

const validateExclusions = [
  body('exclusions').isArray().withMessage('exclusions must be an array'),
  body('exclusions.*.source').trim().notEmpty().withMessage('Excluded source is required'),
  body('exclusions.*.justification').trim().notEmpty().withMessage('Justification is required for every exclusion'),
  body('exclusions.*.scope').optional().isIn([1, 2, 3]).withMessage('Scope must be 1, 2 or 3'),
  body('exclusions.*.categoryId').optional({ values: 'falsy' }).isMongoId().withMessage('categoryId must be a valid id'),
  body('exclusions.*.estimatedEmissions').optional().isFloat({ min: 0 }).withMessage('Materiality estimate must be >= 0'),
];

const validateRelevantCategories = [
  body('relevantCategories').isArray().withMessage('relevantCategories must be an array'),
  body('relevantCategories.*').isMongoId().withMessage('Each relevant category must be a valid id'),
];

const validateDenominators = [
  body('denominators').isArray().withMessage('denominators must be an array'),
  body('denominators.*.year').isInt({ min: 2000, max: 2100 }).withMessage('Year must be 2000-2100'),
  body('denominators.*.metric')
    .isIn(['production', 'revenue', 'employees', 'floor_area', 'custom'])
    .withMessage('Metric must be production, revenue, employees, floor_area or custom'),
  body('denominators.*.value').isFloat({ gt: 0 }).withMessage('Denominator value must be > 0'),
  body('denominators.*.unit').trim().notEmpty().withMessage('Unit is required for every denominator'),
  body('denominators.*.label').optional().trim(),
];

const validateTargets = [
  body('targets').isArray().withMessage('targets must be an array'),
  body('targets.*.name').trim().notEmpty().withMessage('Target name is required'),
  body('targets.*.baselineYear').isInt({ min: 2000 }).withMessage('Baseline year must be 2000+'),
  body('targets.*.baselineEmissions').isFloat({ min: 0 }).withMessage('Baseline emissions must be >= 0'),
  body('targets.*.targetYear').isInt({ min: 2000 }).withMessage('Target year must be 2000+'),
  body('targets.*.targetReduction').isFloat({ min: 1, max: 100 }).withMessage('Reduction must be 1-100%'),
];

// Organization routes
router.get('/', getOrganization);
router.put('/', validate(validateOrganizationUpdate), authorize('admin', 'manager'), updateOrganization);
router.put('/targets', validate(validateTargets), authorize('admin', 'manager'), updateOrganizationTargets);
router.put('/exclusions', validate(validateExclusions), authorize('admin', 'manager'), updateOrganizationExclusions);
router.put('/denominators', validate(validateDenominators), authorize('admin', 'manager'), updateOrganizationDenominators);
router.put('/relevant-categories', validate(validateRelevantCategories), authorize('admin', 'manager'), updateRelevantCategories);

// Append-only audit trail (admin read access)
router.get('/audit-log', authorize('admin'), getAuditLog);

// Facilities (organizational boundary: organization → sites)
router.get('/facilities', getFacilities);
router.post('/facilities', body('name').trim().notEmpty().withMessage('Facility name is required'), validate(validateFacility), authorize('admin', 'manager'), createFacility);
router.put('/facilities/:facilityId', validate(validateFacility), authorize('admin', 'manager'), updateFacility);
router.delete('/facilities/:facilityId', authorize('admin', 'manager'), deactivateFacility);

// User management routes
router.get('/users', getOrganizationUsers);
router.post('/users/invite', validate(validateUserInvite), authorize('admin'), inviteUser);
router.put('/users/:userId/role', validate(validateUserRoleUpdate), authorize('admin'), updateUserRole);
router.delete('/users/:userId', authorize('admin'), removeUser);

// Settings routes
router.get('/settings', getOrganizationSettings);
router.put('/settings', validate(validateSettings), authorize('admin'), updateOrganizationSettings);

// Guided onboarding (§10): state read by any authenticated user; advancing the
// wizard is an admin/manager action (it configures the org boundary/methodology).
router.get('/onboarding', getOnboarding);
router.patch('/onboarding', authorize('admin', 'manager'), updateOnboarding);

export default router;
