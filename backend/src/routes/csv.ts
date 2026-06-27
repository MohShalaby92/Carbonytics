import { Router } from 'express';
import {
  uploadCsvMiddleware,
  validateCSVFile,
  importCSVFile,
  getImportTemplate,
  exportCalculationsCSV,
} from '../controllers/csvController';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { query } from 'express-validator';

const router = Router();
router.use(authenticate);

// Roles permitted to author activity data — mirrors the /calculations create gate
// so a read-only viewer/verifier cannot create calculations via CSV import.
const CONTRIBUTOR_ROLES = ['admin', 'manager', 'user'] as const;

// Validation for export parameters
const exportValidation = [
  query('startDate').optional().isISO8601().withMessage('Valid start date required'),
  query('endDate').optional().isISO8601().withMessage('Valid end date required'),
  query('scopes').optional().isString().withMessage('Scopes must be comma-separated numbers'),
  query('categories').optional().isString().withMessage('Categories must be comma-separated IDs'),
];

// Import routes
router.post('/validate',
  uploadCsvMiddleware,
  validateCSVFile
);

router.post('/import',
  authorize(...CONTRIBUTOR_ROLES),
  uploadCsvMiddleware,
  importCSVFile
);

// Export routes
router.get('/template', getImportTemplate);

router.get('/export', 
  validate(exportValidation),
  exportCalculationsCSV
);

export default router;
