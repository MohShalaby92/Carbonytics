import { Router } from 'express';
import {
  getInventories,
  getInventoryById,
  createInventory,
  transitionInventory,
  publishInventory,
  reopenInventory,
  setBaseYear,
  getRecalculationCheck,
  getInventorySnapshots,
} from '../controllers/inventoryController';
import { authenticate, authorize } from '../middleware/auth';
import { clearCache } from '../middleware/cache';

const router = Router();

// All inventory routes require authentication.
router.use(authenticate);

// Reads — open to all authenticated roles.
router.get('/', getInventories);
router.get('/:id', getInventoryById);
router.get('/:id/snapshots', getInventorySnapshots);
router.get('/:id/recalculation-check', getRecalculationCheck);

// Lifecycle mutations — admin/manager only (the inventory governs the year).
router.post('/', authorize('admin', 'manager'), createInventory);
router.patch('/:id/status', authorize('admin', 'manager'), transitionInventory);
router.patch('/:id/publish', authorize('admin', 'manager'), clearCache('calculations'), publishInventory);
router.patch('/:id/reopen', authorize('admin', 'manager'), clearCache('calculations'), reopenInventory);
router.patch('/:id/base-year', authorize('admin', 'manager'), setBaseYear);

export default router;
