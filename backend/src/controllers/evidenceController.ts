import { Response } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import { Calculation } from '../models/Calculation';
import { Evidence } from '../models/Evidence';
import { AuthenticatedRequest } from '../types';
import { ApiResponseUtil } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { recordAudit } from '../utils/audit';
import { config } from '../config/config';
import {
  storeEvidenceFile,
  openEvidenceDownloadStream,
  deleteEvidenceFile,
} from '../services/evidenceStorage';

// Evidence files are buffered in memory then streamed to GridFS. Common
// assurance artifacts only (invoice PDF, meter photo, supplier letter, exports).
const ALLOWED = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'text/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export const evidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) return cb(null, true);
    cb(new Error('Unsupported evidence file type. Allowed: PDF, image, CSV/Excel, Word, text.'));
  },
});

const evidenceMeta = (e: any) => ({
  id: e._id.toString(),
  calculationId: e.calculationId.toString(),
  entryIndex: e.entryIndex,
  filename: e.filename,
  contentType: e.contentType,
  size: e.size,
  sha256: e.sha256,
  description: e.description,
  uploadedByEmail: e.uploadedByEmail,
  createdAt: e.createdAt,
});

/**
 * Attach an evidence file to a specific calculation data line (§4.3).
 * Multipart: `file` + `entryIndex` (+ optional `description`). Allowed even on a
 * locked/published calculation — supporting evidence is often added during
 * assurance — because it never mutates the calculation itself.
 */
export const uploadEvidence = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return ApiResponseUtil.error(res, 'Authentication required', 401);
  if (!req.file) return ApiResponseUtil.error(res, 'No file uploaded (field name must be "file")', 400);

  const calc = await Calculation.findOne({
    _id: req.params.calcId,
    organizationId: req.user.organizationId,
  }).select('data title');
  if (!calc) return ApiResponseUtil.error(res, 'Calculation not found', 404);

  const entryIndex = parseInt(String(req.body.entryIndex), 10);
  if (!Number.isInteger(entryIndex) || entryIndex < 0 || entryIndex >= (calc.data?.length || 0)) {
    return ApiResponseUtil.error(
      res,
      `Invalid entryIndex — calculation "${calc.title}" has ${calc.data?.length || 0} data line(s)`,
      400
    );
  }

  const sha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
  const gridFsId = await storeEvidenceFile(req.file.buffer, req.file.originalname, req.file.mimetype, {
    organizationId: req.user.organizationId,
    calculationId: calc._id.toString(),
    entryIndex,
    sha256,
  });

  const evidence = await Evidence.create({
    organizationId: req.user.organizationId,
    calculationId: calc._id,
    entryIndex,
    gridFsId,
    filename: req.file.originalname,
    contentType: req.file.mimetype,
    size: req.file.size,
    sha256,
    description: req.body.description ? String(req.body.description).trim() : undefined,
    uploadedBy: req.user.id,
    uploadedByEmail: req.user.email,
  });

  await recordAudit({
    organizationId: req.user.organizationId,
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'create',
    resourceType: 'evidence',
    resourceId: evidence._id.toString(),
    after: { calculationId: calc._id.toString(), entryIndex, filename: evidence.filename, size: evidence.size, sha256 },
  });

  ApiResponseUtil.success(res, evidenceMeta(evidence), 'Evidence attached', 201);
});

/**
 * List evidence metadata for a calculation (§4.3). Returns a flat list plus a
 * per-entry-index count map for the UI.
 */
export const listEvidence = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return ApiResponseUtil.error(res, 'Authentication required', 401);

  const calc = await Calculation.findOne({
    _id: req.params.calcId,
    organizationId: req.user.organizationId,
  }).select('_id');
  if (!calc) return ApiResponseUtil.error(res, 'Calculation not found', 404);

  const items = await Evidence.find({
    organizationId: req.user.organizationId,
    calculationId: calc._id,
  })
    .sort({ entryIndex: 1, createdAt: 1 })
    .lean();

  const countByEntry: Record<number, number> = {};
  for (const e of items as any[]) countByEntry[e.entryIndex] = (countByEntry[e.entryIndex] || 0) + 1;

  ApiResponseUtil.success(res, {
    calculationId: (calc._id as any).toString(),
    count: items.length,
    countByEntry,
    evidence: items.map(evidenceMeta),
  });
});

/** Stream evidence bytes for download (tenant-scoped). */
export const downloadEvidence = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return ApiResponseUtil.error(res, 'Authentication required', 401);

  const evidence = await Evidence.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId,
  });
  if (!evidence) return ApiResponseUtil.error(res, 'Evidence not found', 404);

  res.setHeader('Content-Type', evidence.contentType || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(evidence.filename)}"`
  );

  const stream = openEvidenceDownloadStream(evidence.gridFsId);
  stream.on('error', () => {
    if (!res.headersSent) ApiResponseUtil.error(res, 'Evidence file bytes not found', 404);
    else res.end();
  });
  stream.pipe(res);
});

/**
 * Delete an evidence attachment (admin/manager). BLOCKED when the linked
 * calculation is locked/published — evidence supporting a published figure must
 * persist for the audit trail. Removes the GridFS bytes and the metadata; audited.
 */
export const deleteEvidence = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return ApiResponseUtil.error(res, 'Authentication required', 401);

  const evidence = await Evidence.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId,
  });
  if (!evidence) return ApiResponseUtil.error(res, 'Evidence not found', 404);

  const calc = await Calculation.findById(evidence.calculationId).select('status');
  if (calc?.status === 'locked') {
    return ApiResponseUtil.error(
      res,
      'Cannot delete evidence for a locked (published) calculation — unlock it first if a correction is genuinely required.',
      409
    );
  }

  await deleteEvidenceFile(evidence.gridFsId);
  await Evidence.deleteOne({ _id: evidence._id });

  await recordAudit({
    organizationId: req.user.organizationId,
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'delete',
    resourceType: 'evidence',
    resourceId: evidence._id.toString(),
    before: { calculationId: evidence.calculationId.toString(), entryIndex: evidence.entryIndex, filename: evidence.filename },
  });

  ApiResponseUtil.success(res, { id: evidence._id.toString() }, 'Evidence deleted');
});
