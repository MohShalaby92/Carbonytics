import { Router } from 'express';
import { 
  upload,
  validateCSVFile,
  importCSVFile,
  getImportTemplate,
  exportCalculationsCSV,
} from '../controllers/csvController';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { query } from 'express-validator';

const router = Router();
router.use(authenticate);

// Validation for export parameters
const exportValidation = [
  query('startDate').optional().isISO8601().withMessage('Valid start date required'),
  query('endDate').optional().isISO8601().withMessage('Valid end date required'),
  query('scopes').optional().isString().withMessage('Scopes must be comma-separated numbers'),
  query('categories').optional().isString().withMessage('Categories must be comma-separated IDs'),
];

// Import routes
router.post('/validate', 
  upload.single('file'), 
  validateCSVFile
);

router.post('/import', 
  upload.single('file'), 
  importCSVFile
);

// Export routes
router.get('/template', getImportTemplate);

router.get('/export', 
  validate(exportValidation),
  exportCalculationsCSV
);

export default router;
