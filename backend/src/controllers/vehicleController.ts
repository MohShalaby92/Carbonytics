import { Response } from 'express';
import { Vehicle } from '../models/Vehicle';
import { EmissionFactor } from '../models/EmissionFactor';
import { Facility } from '../models/Facility';
import { ApiResponseUtil } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthenticatedRequest } from '../types';
import { recordAudit } from '../utils/audit';

/**
 * Fleet registry CRUD (§2.2). Mirrors the supplier/facility audited-CRUD
 * pattern: org-scoped, admin/manager-gated writes, soft-delete.
 */

/**
 * A vehicle's distance factor must be an EmissionFactor visible to the org
 * (shared library or the org's own custom). Cross-tenant factors are rejected.
 * Returns the resolved factor doc, or null when no factorId was supplied.
 */
async function resolveVehicleFactor(
  factorId: string | undefined,
  organizationId: string
): Promise<{ ok: true; factor: any | null } | { ok: false; message: string }> {
  if (!factorId) return { ok: true, factor: null };
  const factor = await EmissionFactor.findById(factorId);
  if (!factor) return { ok: false, message: 'Selected emission factor not found' };
  if (factor.organizationId && factor.organizationId.toString() !== organizationId) {
    return { ok: false, message: 'Selected emission factor not found' };
  }
  return { ok: true, factor };
}

export const getVehicles = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }
  const includeInactive = req.query.includeInactive === 'true';
  const filter: any = { organizationId: req.user.organizationId };
  if (!includeInactive) filter.isActive = true;

  const vehicles = await Vehicle.find(filter)
    .populate('factorId', 'name factor unit source year region')
    .populate('facilityId', 'name')
    .sort({ name: 1 });

  ApiResponseUtil.success(res, {
    vehicles,
    count: vehicles.length,
  });
});

export const createVehicle = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }
  const { name, vehicleType, fuel, size, registration, factorId, facilityId, notes } = req.body;

  const fr = await resolveVehicleFactor(factorId, req.user.organizationId);
  if (!fr.ok) return ApiResponseUtil.error(res, fr.message, 400);

  if (facilityId) {
    const facility = await Facility.findOne({ _id: facilityId, organizationId: req.user.organizationId });
    if (!facility) return ApiResponseUtil.error(res, 'Facility not found in your organization', 400);
  }

  const vehicle = await Vehicle.create({
    organizationId: req.user.organizationId,
    name: String(name).trim(),
    vehicleType: vehicleType || 'car',
    fuel: fuel ? String(fuel).trim() : undefined,
    size: size ? String(size).trim() : undefined,
    registration: registration ? String(registration).trim() : undefined,
    ...(factorId ? { factorId } : {}),
    ...(facilityId ? { facilityId } : {}),
    notes,
  });

  await recordAudit({
    organizationId: req.user.organizationId,
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'create',
    resourceType: 'fleet-vehicle',
    resourceId: vehicle._id.toString(),
    after: { name: vehicle.name, vehicleType: vehicle.vehicleType, fuel: vehicle.fuel, factorId },
  });

  const populated = await vehicle.populate('factorId', 'name factor unit source year region');
  ApiResponseUtil.success(res, populated, 'Vehicle added to fleet', 201);
});

export const updateVehicle = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }
  const { vehicleId } = req.params;
  const { name, vehicleType, fuel, size, registration, factorId, facilityId, notes, isActive } = req.body;

  const prior = await Vehicle.findOne({ _id: vehicleId, organizationId: req.user.organizationId }).lean();
  if (!prior) return ApiResponseUtil.error(res, 'Vehicle not found', 404);

  const updates: any = {};
  if (name !== undefined) updates.name = String(name).trim();
  if (vehicleType !== undefined) updates.vehicleType = vehicleType;
  if (fuel !== undefined) updates.fuel = fuel ? String(fuel).trim() : undefined;
  if (size !== undefined) updates.size = size ? String(size).trim() : undefined;
  if (registration !== undefined) updates.registration = registration ? String(registration).trim() : undefined;
  if (notes !== undefined) updates.notes = notes;
  if (isActive !== undefined) updates.isActive = Boolean(isActive);
  if (factorId !== undefined) {
    const fr = await resolveVehicleFactor(factorId || undefined, req.user.organizationId);
    if (!fr.ok) return ApiResponseUtil.error(res, fr.message, 400);
    updates.factorId = factorId || undefined;
  }
  if (facilityId !== undefined) {
    if (facilityId) {
      const facility = await Facility.findOne({ _id: facilityId, organizationId: req.user.organizationId });
      if (!facility) return ApiResponseUtil.error(res, 'Facility not found in your organization', 400);
    }
    updates.facilityId = facilityId || undefined;
  }

  const vehicle = await Vehicle.findOneAndUpdate(
    { _id: vehicleId, organizationId: req.user.organizationId },
    updates,
    { new: true, runValidators: true }
  ).populate('factorId', 'name factor unit source year region');

  await recordAudit({
    organizationId: req.user.organizationId,
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'update',
    resourceType: 'fleet-vehicle',
    resourceId: vehicleId,
    before: { name: prior.name, vehicleType: prior.vehicleType, fuel: prior.fuel },
    after: updates,
  });

  ApiResponseUtil.success(res, vehicle, 'Vehicle updated');
});

export const deactivateVehicle = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }
  const { vehicleId } = req.params;
  const vehicle = await Vehicle.findOneAndUpdate(
    { _id: vehicleId, organizationId: req.user.organizationId },
    { isActive: false },
    { new: true }
  );
  if (!vehicle) return ApiResponseUtil.error(res, 'Vehicle not found', 404);

  await recordAudit({
    organizationId: req.user.organizationId,
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'update',
    resourceType: 'fleet-vehicle',
    resourceId: vehicleId,
    after: { isActive: false },
  });

  ApiResponseUtil.success(res, vehicle, 'Vehicle deactivated');
});
