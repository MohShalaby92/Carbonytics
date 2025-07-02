import { Request, Response } from 'express';
import { User } from '../models/User';
import { Organization } from '../models/Organization';
import { ApiResponseUtil } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthenticatedRequest } from '../types';
import { generateTokens } from '../utils/jwt';

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
    settings: organization.settings,
    isActive: organization.isActive,
    createdAt: organization.createdAt,
    updatedAt: organization.updatedAt,
  });
});

export const updateOrganization = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }

  const { name, industry, country, size } = req.body;
  const updates: any = {};

  if (name) updates.name = name;
  if (industry) updates.industry = industry;
  if (country) updates.country = country;
  if (size) updates.size = size;

  const organization = await Organization.findByIdAndUpdate(
    req.user.organizationId,
    updates,
    { new: true, runValidators: true }
  );

  if (!organization) {
    return ApiResponseUtil.error(res, 'Organization not found', 404);
  }

  ApiResponseUtil.success(res, organization, 'Organization updated successfully');
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
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
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

  // Generate temporary password (in a real app, you'd send an email invitation)
  const temporaryPassword = Math.random().toString(36).slice(-8);

  const user = new User({
    email,
    name,
    password: temporaryPassword,
    organizationId: req.user.organizationId,
    role,
  });

  await user.save();

  ApiResponseUtil.success(res, {
    id: user._id,
    email: user.email,
    name: user.name,
    role: user.role,
    temporaryPassword, // In production, don't return this - send via email
    message: 'User invited successfully. Temporary password provided.',
  }, 'User invited successfully', 201);
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

  const { currency, timezone, language } = req.body;
  const settingsUpdate: any = {};

  if (currency) settingsUpdate['settings.currency'] = currency;
  if (timezone) settingsUpdate['settings.timezone'] = timezone;
  if (language) settingsUpdate['settings.language'] = language;

  const organization = await Organization.findByIdAndUpdate(
    req.user.organizationId,
    settingsUpdate,
    { new: true, runValidators: true }
  );

  if (!organization) {
    return ApiResponseUtil.error(res, 'Organization not found', 404);
  }

  ApiResponseUtil.success(res, organization.settings, 'Settings updated successfully');
});
