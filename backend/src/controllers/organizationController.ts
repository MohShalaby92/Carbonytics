import { Request, Response } from 'express';
import { User } from '../models/User';
import { Organization } from '../models/Organization';
import { ApiResponseUtil } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthenticatedRequest } from '../types';
import { generateTemporaryPassword, escapeRegex } from '../utils/security';
import { recordAudit } from '../utils/audit';
import { AuditLog } from '../models/AuditLog';
import { Facility } from '../models/Facility';
import { invalidateGwpSetCache } from '../services/calculationEngine';
import { config } from '../config/config';

export const getOrganization = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }

  const organization = await Organization.findById(req.user.organizationId);
  
  if (!organization) {
    return ApiResponseUtil.error(res, 'Organization not found', 404);
  }

  ApiResponseUtil.success(res, {
    id: organization._id,
    name: organization.name,
    industry: organization.industry,
    country: organization.country,
    size: organization.size,
    consolidationApproach: organization.consolidationApproach || 'operational_control',
    settings: organization.settings,
    targets: organization.targets || [],
    exclusions: organization.exclusions || [],
    denominators: organization.denominators || [],
    isActive: organization.isActive,
    createdAt: organization.createdAt,
    updatedAt: organization.updatedAt,
  });
});

/** Replace the organization's emission-reduction targets (admin/manager). */
export const updateOrganizationTargets = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }

  const { targets } = req.body;
  if (!Array.isArray(targets)) {
    return ApiResponseUtil.error(res, 'targets must be an array', 400);
  }

  const prior = await Organization.findById(req.user.organizationId).select('targets').lean();

  const organization = await Organization.findByIdAndUpdate(
    req.user.organizationId,
    { targets },
    { new: true, runValidators: true }
  );

  if (!organization) {
    return ApiResponseUtil.error(res, 'Organization not found', 404);
  }

  await recordAudit({
    organizationId: req.user.organizationId,
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'update',
    resourceType: 'organization-targets',
    resourceId: req.user.organizationId,
    before: { targets: (prior as any)?.targets || [] },
    after: { targets: organization.targets || [] },
  });

  ApiResponseUtil.success(res, { targets: organization.targets || [] }, 'Targets updated successfully');
});

/**
 * Replace the denominator series for intensity metrics (admin/manager).
 * One value per (year, metric) — duplicates are rejected so intensity figures
 * are never ambiguous.
 */
export const updateOrganizationDenominators = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }

  const { denominators } = req.body;
  if (!Array.isArray(denominators)) {
    return ApiResponseUtil.error(res, 'denominators must be an array', 400);
  }

  const seen = new Set<string>();
  for (const d of denominators) {
    const key = `${d.year}|${d.metric}${d.metric === 'custom' ? `|${(d.label || '').trim().toLowerCase()}` : ''}`;
    if (seen.has(key)) {
      return ApiResponseUtil.error(
        res,
        `Duplicate denominator for ${d.metric}${d.label ? ` (${d.label})` : ''} in ${d.year} — one value per year and metric`,
        400
      );
    }
    seen.add(key);
  }

  const prior = await Organization.findById(req.user.organizationId).select('denominators').lean();

  const organization = await Organization.findByIdAndUpdate(
    req.user.organizationId,
    { denominators },
    { new: true, runValidators: true }
  );

  if (!organization) {
    return ApiResponseUtil.error(res, 'Organization not found', 404);
  }

  await recordAudit({
    organizationId: req.user.organizationId,
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'update',
    resourceType: 'organization-denominators',
    resourceId: req.user.organizationId,
    before: { denominators: (prior as any)?.denominators || [] },
    after: { denominators: organization.denominators || [] },
  });

  ApiResponseUtil.success(
    res,
    { denominators: organization.denominators || [] },
    'Denominator series updated'
  );
});

/**
 * Replace the documented exclusions register (admin/manager).
 * Every excluded source needs a justification; materiality estimate optional.
 */
export const updateOrganizationExclusions = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }

  const { exclusions } = req.body;
  if (!Array.isArray(exclusions)) {
    return ApiResponseUtil.error(res, 'exclusions must be an array', 400);
  }

  const prior = await Organization.findById(req.user.organizationId).select('exclusions').lean();

  const organization = await Organization.findByIdAndUpdate(
    req.user.organizationId,
    { exclusions },
    { new: true, runValidators: true }
  );

  if (!organization) {
    return ApiResponseUtil.error(res, 'Organization not found', 404);
  }

  await recordAudit({
    organizationId: req.user.organizationId,
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'update',
    resourceType: 'organization-exclusions',
    resourceId: req.user.organizationId,
    before: { exclusions: (prior as any)?.exclusions || [] },
    after: { exclusions: organization.exclusions || [] },
  });

  ApiResponseUtil.success(
    res,
    { exclusions: organization.exclusions || [] },
    'Exclusions register updated'
  );
});

/** Read the append-only audit trail (admin only), newest first, paginated. */
export const getAuditLog = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }

  const { resourceType, page = '1', limit = '25' } = req.query;
  const filter: any = { organizationId: req.user.organizationId };
  if (resourceType) filter.resourceType = resourceType;

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 25));

  const [entries, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  ApiResponseUtil.paginated(
    res,
    entries.map((e: any) => ({ ...e, id: e._id.toString() })),
    pageNum,
    limitNum,
    total
  );
});

export const updateOrganization = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }

  const { name, industry, country, size, consolidationApproach } = req.body;
  const updates: any = {};

  if (name) updates.name = name;
  if (industry) updates.industry = industry;
  if (country) updates.country = country;
  if (size) updates.size = size;
  if (consolidationApproach) updates.consolidationApproach = consolidationApproach;

  const prior = await Organization.findById(req.user.organizationId)
    .select('name industry country size consolidationApproach')
    .lean();

  const organization = await Organization.findByIdAndUpdate(
    req.user.organizationId,
    updates,
    { new: true, runValidators: true }
  );

  if (!organization) {
    return ApiResponseUtil.error(res, 'Organization not found', 404);
  }

  // Boundary/identity changes are methodology-relevant — always audited.
  await recordAudit({
    organizationId: req.user.organizationId,
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'update',
    resourceType: 'organization',
    resourceId: req.user.organizationId,
    before: prior,
    after: updates,
  });

  ApiResponseUtil.success(res, organization, 'Organization updated successfully');
});

// ---- Facilities (organizational boundary: organization → sites) ----

export const getFacilities = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }
  const includeInactive = req.query.includeInactive === 'true';
  const filter: any = { organizationId: req.user.organizationId };
  if (!includeInactive) filter.isActive = true;
  const facilities = await Facility.find(filter).sort({ name: 1 });
  ApiResponseUtil.success(res, { facilities, count: facilities.length });
});

export const createFacility = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }
  const { name, country, city, ownershipPercent, operationalControl, notes } = req.body;

  const facility = await Facility.create({
    organizationId: req.user.organizationId,
    name: String(name).trim(),
    country: country ? String(country).trim() : 'Egypt',
    city: city ? String(city).trim() : undefined,
    ownershipPercent: ownershipPercent !== undefined ? parseFloat(ownershipPercent) : 100,
    operationalControl: operationalControl !== undefined ? Boolean(operationalControl) : true,
    notes,
  });

  await recordAudit({
    organizationId: req.user.organizationId,
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'create',
    resourceType: 'facility',
    resourceId: facility._id.toString(),
    after: { name: facility.name, country: facility.country, ownershipPercent: facility.ownershipPercent, operationalControl: facility.operationalControl },
  });

  ApiResponseUtil.success(res, facility.toJSON(), 'Facility created', 201);
});

export const updateFacility = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }
  const { facilityId } = req.params;
  const { name, country, city, ownershipPercent, operationalControl, notes, isActive } = req.body;

  const prior = await Facility.findOne({ _id: facilityId, organizationId: req.user.organizationId }).lean();
  if (!prior) {
    return ApiResponseUtil.error(res, 'Facility not found', 404);
  }

  const updates: any = {};
  if (name !== undefined) updates.name = String(name).trim();
  if (country !== undefined) updates.country = String(country).trim();
  if (city !== undefined) updates.city = String(city).trim();
  if (ownershipPercent !== undefined) updates.ownershipPercent = parseFloat(ownershipPercent);
  if (operationalControl !== undefined) updates.operationalControl = Boolean(operationalControl);
  if (notes !== undefined) updates.notes = notes;
  if (isActive !== undefined) updates.isActive = Boolean(isActive);

  const facility = await Facility.findOneAndUpdate(
    { _id: facilityId, organizationId: req.user.organizationId },
    updates,
    { new: true, runValidators: true }
  );

  await recordAudit({
    organizationId: req.user.organizationId,
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'update',
    resourceType: 'facility',
    resourceId: facilityId,
    before: { name: (prior as any).name, ownershipPercent: (prior as any).ownershipPercent, operationalControl: (prior as any).operationalControl, isActive: (prior as any).isActive },
    after: updates,
  });

  ApiResponseUtil.success(res, facility!.toJSON(), 'Facility updated');
});

/** Soft-delete: facilities referenced by calculations must stay resolvable. */
export const deactivateFacility = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }
  const { facilityId } = req.params;

  const facility = await Facility.findOneAndUpdate(
    { _id: facilityId, organizationId: req.user.organizationId },
    { isActive: false },
    { new: true }
  );
  if (!facility) {
    return ApiResponseUtil.error(res, 'Facility not found', 404);
  }

  await recordAudit({
    organizationId: req.user.organizationId,
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'delete',
    resourceType: 'facility',
    resourceId: facilityId,
    before: { isActive: true },
    after: { isActive: false },
    comment: 'Soft-deleted (deactivated) — historical calculations keep referencing it',
  });

  ApiResponseUtil.success(res, facility.toJSON(), 'Facility deactivated');
});

export const getOrganizationUsers = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }

  const { page = '1', limit = '10', role, search } = req.query;

  const filter: any = {
    organizationId: req.user.organizationId,
    isActive: true,
  };

  if (role) {
    filter.role = role;
  }

  if (search) {
    const safe = escapeRegex(String(search));
    filter.$or = [
      { name: { $regex: safe, $options: 'i' } },
      { email: { $regex: safe, $options: 'i' } },
    ];
  }

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const [users, total] = await Promise.all([
    User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip(skip)
      .lean(),
    User.countDocuments(filter),
  ]);

  ApiResponseUtil.paginated(res, users, pageNum, limitNum, total);
});

export const inviteUser = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }

  const { email, name, role } = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return ApiResponseUtil.error(res, 'User already exists with this email', 400);
  }

  // Generate a cryptographically secure temporary password.
  // In production this should be delivered via an email invite / reset link,
  // never returned in the API response.
  const temporaryPassword = generateTemporaryPassword(16);

  const user = new User({
    email,
    name,
    password: temporaryPassword,
    organizationId: req.user.organizationId,
    role,
  });

  await user.save();

  ApiResponseUtil.success(
    res,
    {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      // Only surface the temporary password outside production (dev/demo convenience).
      // In production, deliver it via email/reset link instead.
      ...(config.IS_PROD ? {} : { temporaryPassword }),
      message: config.IS_PROD
        ? 'User invited. A temporary password has been generated and should be sent via email.'
        : 'User invited successfully. Temporary password provided (development only).',
    },
    'User invited successfully',
    201
  );
});

export const updateUserRole = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }

  const { userId } = req.params;
  const { role } = req.body;

  // Prevent changing own role
  if (userId === req.user.id) {
    return ApiResponseUtil.error(res, 'Cannot change your own role', 400);
  }

  const user = await User.findOneAndUpdate(
    { 
      _id: userId, 
      organizationId: req.user.organizationId 
    },
    { role },
    { new: true, runValidators: true }
  ).select('-password');

  if (!user) {
    return ApiResponseUtil.error(res, 'User not found', 404);
  }

  ApiResponseUtil.success(res, user, 'User role updated successfully');
});

export const removeUser = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }

  const { userId } = req.params;

  // Prevent removing self
  if (userId === req.user.id) {
    return ApiResponseUtil.error(res, 'Cannot remove yourself', 400);
  }

  const user = await User.findOneAndUpdate(
    { 
      _id: userId, 
      organizationId: req.user.organizationId 
    },
    { isActive: false },
    { new: true }
  );

  if (!user) {
    return ApiResponseUtil.error(res, 'User not found', 404);
  }

  ApiResponseUtil.success(res, null, 'User removed successfully');
});

export const getOrganizationSettings = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }

  const organization = await Organization.findById(req.user.organizationId)
    .select('settings');

  if (!organization) {
    return ApiResponseUtil.error(res, 'Organization not found', 404);
  }

  ApiResponseUtil.success(res, organization.settings);
});

export const updateOrganizationSettings = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }

  const { currency, timezone, language, gwpSet } = req.body;
  const settingsUpdate: any = {};

  if (currency) settingsUpdate['settings.currency'] = currency;
  if (timezone) settingsUpdate['settings.timezone'] = timezone;
  if (language) settingsUpdate['settings.language'] = language;
  if (gwpSet) settingsUpdate['settings.gwpSet'] = gwpSet;

  const prior = await Organization.findById(req.user.organizationId).select('settings').lean();

  const organization = await Organization.findByIdAndUpdate(
    req.user.organizationId,
    settingsUpdate,
    { new: true, runValidators: true }
  );

  if (!organization) {
    return ApiResponseUtil.error(res, 'Organization not found', 404);
  }

  // A GWP-set change is a methodology change — apply it to the next calculation.
  if (gwpSet) invalidateGwpSetCache(req.user.organizationId);

  // Methodology-relevant settings changes (especially the GWP set) are audited.
  await recordAudit({
    organizationId: req.user.organizationId,
    userId: req.user.id,
    userEmail: req.user.email,
    action: 'update',
    resourceType: 'organization-settings',
    resourceId: req.user.organizationId,
    before: { settings: (prior as any)?.settings },
    after: { settings: organization.settings },
  });

  ApiResponseUtil.success(res, organization.settings, 'Settings updated successfully');
});
