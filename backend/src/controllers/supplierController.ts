import { Response } from 'express';
import { Supplier, deriveEngagementStatus } from '../models/Supplier';
import { EmissionCategory } from '../models/EmissionCategory';
import { EmissionFactor } from '../models/EmissionFactor';
import { Calculation } from '../models/Calculation';
import { ApiResponseUtil } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthenticatedRequest } from '../types';
import { recordAudit } from '../utils/audit';

/** Serialize a supplier with its derived engagement status and request counts. */
function toSupplierJson(supplier: any) {
  const json = supplier.toJSON ? supplier.toJSON() : supplier;
  const requests = json.dataRequests || [];
  return {
    ...json,
    engagementStatus: deriveEngagementStatus(json),
    requestCounts: {
      sent: requests.filter((r: any) => r.status === 'sent').length,
      received: requests.filter((r: any) => r.status === 'received').length,
      fulfilled: requests.filter((r: any) => r.status === 'fulfilled').length,
      declined: requests.filter((r: any) => r.status === 'declined').length,
    },
  };
}

export const getSuppliers = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }
  const includeInactive = req.query.includeInactive === 'true';
  const filter: any = { organizationId: req.user.organizationId };
  if (!includeInactive) filter.isActive = true;

  const suppliers = await Supplier.find(filter)
    .populate('categories', 'category scope')
    .sort({ name: 1 });

  const mapped = suppliers.map(toSupplierJson);
  ApiResponseUtil.success(res, {
    suppliers: mapped,
    count: mapped.length,
    engagement: {
      total: mapped.length,
      notEngaged: mapped.filter((s) => s.engagementStatus === 'not_engaged').length,
      awaitingResponse: mapped.filter((s) => s.engagementStatus === 'awaiting_response').length,
      dataReceived: mapped.filter((s) => s.engagementStatus === 'data_received').length,
      dataIntegrated: mapped.filter((s) => s.engagementStatus === 'data_integrated').length,
    },
  });
});

export const createSupplier = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }
  const { name, contactName, contactEmail, categories, notes } = req.body;

  // Category references must resolve (and exist) — bad ids fail loudly here
  // instead of dangling on the supplier record.
  const categoryIds: string[] = Array.isArray(categories) ? categories : [];
  if (categoryIds.length > 0) {
    const found = await EmissionCategory.countDocuments({ _id: { $in: categoryIds } });
    if (found !== categoryIds.length) {
      return ApiResponseUtil.error(res, 'One or more category ids do not exist', 400);
    }
  }

  const supplier = await Supplier.create({
    organizationId: req.user.organizationId,
    name: String(name).trim(),
    contactName: contactName ? String(contactName).trim() : undefined,
    contactEmail: contactEmail ? String(contactEmail).trim() : undefined,
    categories: categoryIds,
    notes,
  });

  await recordAudit({
    organizationId: req.user.organizationId,
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'create',
    resourceType: 'supplier',
    resourceId: supplier._id.toString(),
    after: { name: supplier.name, contactEmail: supplier.contactEmail, categories: categoryIds },
  });

  ApiResponseUtil.success(res, toSupplierJson(supplier), 'Supplier created', 201);
});

export const updateSupplier = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }
  const { supplierId } = req.params;
  const { name, contactName, contactEmail, categories, notes, isActive } = req.body;

  const prior = await Supplier.findOne({ _id: supplierId, organizationId: req.user.organizationId }).lean();
  if (!prior) {
    return ApiResponseUtil.error(res, 'Supplier not found', 404);
  }

  const updates: any = {};
  if (name !== undefined) updates.name = String(name).trim();
  if (contactName !== undefined) updates.contactName = String(contactName).trim();
  if (contactEmail !== undefined) updates.contactEmail = String(contactEmail).trim();
  if (notes !== undefined) updates.notes = notes;
  if (isActive !== undefined) updates.isActive = Boolean(isActive);
  if (categories !== undefined) {
    const categoryIds: string[] = Array.isArray(categories) ? categories : [];
    if (categoryIds.length > 0) {
      const found = await EmissionCategory.countDocuments({ _id: { $in: categoryIds } });
      if (found !== categoryIds.length) {
        return ApiResponseUtil.error(res, 'One or more category ids do not exist', 400);
      }
    }
    updates.categories = categoryIds;
  }

  const supplier = await Supplier.findOneAndUpdate(
    { _id: supplierId, organizationId: req.user.organizationId },
    updates,
    { new: true, runValidators: true }
  ).populate('categories', 'category scope');

  await recordAudit({
    organizationId: req.user.organizationId,
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'update',
    resourceType: 'supplier',
    resourceId: supplierId,
    before: { name: (prior as any).name, contactEmail: (prior as any).contactEmail, isActive: (prior as any).isActive },
    after: updates,
  });

  ApiResponseUtil.success(res, toSupplierJson(supplier!), 'Supplier updated');
});

/** Soft-delete: suppliers referenced by factors/requests must stay resolvable. */
export const deactivateSupplier = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }
  const { supplierId } = req.params;

  const supplier = await Supplier.findOneAndUpdate(
    { _id: supplierId, organizationId: req.user.organizationId },
    { isActive: false },
    { new: true }
  );
  if (!supplier) {
    return ApiResponseUtil.error(res, 'Supplier not found', 404);
  }

  await recordAudit({
    organizationId: req.user.organizationId,
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'delete',
    resourceType: 'supplier',
    resourceId: supplierId,
    before: { isActive: true },
    after: { isActive: false },
    comment: 'Soft-deleted (deactivated) — supplier-specific factors and request history remain',
  });

  ApiResponseUtil.success(res, toSupplierJson(supplier), 'Supplier deactivated');
});

// ---- Data-request workflow ----

/**
 * Record that a data request was issued to the supplier (the actual ask happens
 * outside the platform — this tracks the engagement lifecycle and its outcome).
 */
export const createDataRequest = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }
  const { supplierId } = req.params;
  const { period, categoryId, message } = req.body;

  if (!period?.start || !period?.end) {
    return ApiResponseUtil.error(res, 'period {start, end} is required', 400);
  }
  if (categoryId) {
    const category = await EmissionCategory.findById(categoryId);
    if (!category) {
      return ApiResponseUtil.error(res, 'Category not found', 404);
    }
  }

  const supplier = await Supplier.findOne({ _id: supplierId, organizationId: req.user.organizationId });
  if (!supplier) {
    return ApiResponseUtil.error(res, 'Supplier not found', 404);
  }
  if (!supplier.isActive) {
    return ApiResponseUtil.error(res, 'Supplier is deactivated — reactivate it before issuing requests', 400);
  }

  supplier.dataRequests.push({
    period: { start: new Date(period.start), end: new Date(period.end) },
    ...(categoryId ? { categoryId } : {}),
    ...(message ? { message: String(message).trim() } : {}),
    status: 'sent',
    sentAt: new Date(),
  } as any);
  await supplier.save();

  const request = supplier.dataRequests[supplier.dataRequests.length - 1];

  await recordAudit({
    organizationId: req.user.organizationId,
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'create',
    resourceType: 'supplier-data-request',
    resourceId: request._id.toString(),
    after: { supplier: supplier.name, period, categoryId, message },
  });

  ApiResponseUtil.success(res, toSupplierJson(supplier), 'Data request recorded', 201);
});

/** Advance a request to received/declined (fulfillment has its own endpoint). */
export const updateDataRequest = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }
  const { supplierId, requestId } = req.params;
  const { status, notes } = req.body;

  if (!['received', 'declined'].includes(status)) {
    return ApiResponseUtil.error(res, 'status must be received or declined (use /fulfill to integrate data)', 400);
  }

  const supplier = await Supplier.findOne({ _id: supplierId, organizationId: req.user.organizationId });
  if (!supplier) {
    return ApiResponseUtil.error(res, 'Supplier not found', 404);
  }
  const request = supplier.dataRequests.find((r) => r._id.toString() === requestId);
  if (!request) {
    return ApiResponseUtil.error(res, 'Data request not found', 404);
  }
  if (request.status === 'fulfilled') {
    return ApiResponseUtil.error(res, 'Request is already fulfilled — its status cannot be changed', 400);
  }

  const priorStatus = request.status;
  request.status = status;
  request.respondedAt = new Date();
  if (notes) {
    request.fulfillment = { ...(request.fulfillment || {}), notes: String(notes).trim() } as any;
  }
  await supplier.save();

  await recordAudit({
    organizationId: req.user.organizationId,
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'update',
    resourceType: 'supplier-data-request',
    resourceId: requestId,
    before: { status: priorStatus },
    after: { status, notes },
  });

  ApiResponseUtil.success(res, toSupplierJson(supplier), `Request marked ${status}`);
});

/**
 * Fulfill a data request — the supplier's data lands as one of:
 *  - 'custom-factor': creates a supplier-specific org custom emission factor
 *    (supplierId stamped on the factor; entries computed with it record the
 *    supplier-specific method and DQ 1);
 *  - 'activity-data': links an existing calculation that captured the data;
 *  - 'document': records that documentation was received (no structured data).
 */
export const fulfillDataRequest = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }
  const { supplierId, requestId } = req.params;
  const { type, factor, calculationId, notes } = req.body;

  if (!['custom-factor', 'activity-data', 'document'].includes(type)) {
    return ApiResponseUtil.error(res, 'type must be custom-factor, activity-data or document', 400);
  }

  const supplier = await Supplier.findOne({ _id: supplierId, organizationId: req.user.organizationId });
  if (!supplier) {
    return ApiResponseUtil.error(res, 'Supplier not found', 404);
  }
  const request = supplier.dataRequests.find((r) => r._id.toString() === requestId);
  if (!request) {
    return ApiResponseUtil.error(res, 'Data request not found', 404);
  }
  if (request.status === 'fulfilled') {
    return ApiResponseUtil.error(res, 'Request is already fulfilled', 400);
  }
  if (request.status === 'declined') {
    return ApiResponseUtil.error(res, 'Request was declined — issue a new request instead', 400);
  }

  const fulfillment: any = { type, ...(notes ? { notes: String(notes).trim() } : {}) };
  let createdFactor: any = null;

  if (type === 'custom-factor') {
    if (!factor?.categoryId || !factor?.name || factor?.factor === undefined || !factor?.unit) {
      return ApiResponseUtil.error(
        res,
        'factor {categoryId, name, factor, unit} is required for custom-factor fulfillment',
        400
      );
    }
    const category = await EmissionCategory.findById(factor.categoryId);
    if (!category) {
      return ApiResponseUtil.error(res, 'Factor category not found', 404);
    }
    const value = parseFloat(factor.factor);
    if (!Number.isFinite(value) || value < 0) {
      return ApiResponseUtil.error(res, 'Factor value must be a non-negative number', 400);
    }

    // Source documentation is mandatory for supplier data: default it to the
    // supplier identity so provenance is never just "Custom".
    createdFactor = await EmissionFactor.create({
      categoryId: factor.categoryId,
      name: String(factor.name).trim(),
      description: factor.description ? String(factor.description).trim() : undefined,
      factor: value,
      unit: String(factor.unit).trim(),
      source: factor.source ? String(factor.source).trim() : `Supplier: ${supplier.name}`,
      region: 'global',
      country: 'EG',
      year: factor.year ? parseInt(factor.year, 10) : new Date().getFullYear(),
      qualityRating: 'medium',
      organizationId: req.user.organizationId,
      supplierId: supplier._id,
      supplierName: supplier.name,
      isDefault: false,
      ...(factor.co2 !== undefined ? { co2: parseFloat(factor.co2) } : {}),
      ...(factor.ch4 !== undefined ? { ch4: parseFloat(factor.ch4) } : {}),
      ...(factor.n2o !== undefined ? { n2o: parseFloat(factor.n2o) } : {}),
    });
    fulfillment.factorId = createdFactor._id;

    await recordAudit({
      organizationId: req.user.organizationId,
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'create',
      resourceType: 'emission-factor',
      resourceId: createdFactor._id.toString(),
      after: {
        name: createdFactor.name,
        factor: createdFactor.factor,
        unit: createdFactor.unit,
        source: createdFactor.source,
        year: createdFactor.year,
        supplier: supplier.name,
      },
      comment: `Supplier-specific factor from data request ${requestId}`,
    });
  } else if (type === 'activity-data') {
    if (!calculationId) {
      return ApiResponseUtil.error(res, 'calculationId is required for activity-data fulfillment', 400);
    }
    const calculation = await Calculation.findOne({
      _id: calculationId,
      organizationId: req.user.organizationId,
    }).select('title');
    if (!calculation) {
      return ApiResponseUtil.error(res, 'Calculation not found in your organization', 404);
    }
    fulfillment.calculationId = calculation._id;
  } else if (type === 'document' && !fulfillment.notes) {
    return ApiResponseUtil.error(res, 'notes describing the received documentation are required', 400);
  }

  const priorStatus = request.status;
  request.status = 'fulfilled';
  request.respondedAt = request.respondedAt || new Date();
  request.fulfillment = fulfillment;
  await supplier.save();

  await recordAudit({
    organizationId: req.user.organizationId,
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'update',
    resourceType: 'supplier-data-request',
    resourceId: requestId,
    before: { status: priorStatus },
    after: { status: 'fulfilled', fulfillment: { type, factorId: fulfillment.factorId, calculationId: fulfillment.calculationId } },
    comment: `Fulfilled via ${type}`,
  });

  ApiResponseUtil.success(
    res,
    {
      supplier: toSupplierJson(supplier),
      ...(createdFactor ? { factor: createdFactor.toJSON() } : {}),
    },
    'Request fulfilled'
  );
});
