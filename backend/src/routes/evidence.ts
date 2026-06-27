import { Router } from 'express';
import {
  evidenceUploadMiddleware,
  uploadEvidence,
  listEvidence,
  downloadEvidence,
  deleteEvidence,
} from '../controllers/evidenceController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// Contributor+ may attach evidence; viewer/verifier are read-only.
const CONTRIBUTOR_ROLES = ['admin', 'manager', 'user'] as const;

// Attach / list evidence for a specific calculation's data lines (§4.3).
router.post(
  '/calculation/:calcId',
  authorize(...CONTRIBUTOR_ROLES),
  evidenceUploadMiddleware,
  uploadEvidence
);
router.get('/calculation/:calcId', listEvidence);

// Download bytes / delete an individual evidence record.
router.get('/:id/download', downloadEvidence);
router.delete('/:id', authorize('admin', 'manager'), deleteEvidence);

export default router;
