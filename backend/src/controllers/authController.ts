import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { Organization } from '../models/Organization';
import { ApiResponseUtil } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { generateTokens } from '../utils/jwt';
import { config } from '../config/config';
import { AuthenticatedRequest } from '../types';

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, name, organizationName, industry } = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return ApiResponseUtil.error(res, 'User already exists with this email', 400);
  }

  // Create organization first
  const organization = new Organization({
    name: organizationName,
    industry,
    country: 'Egypt', // Default for this project
    size: 'medium', // Default, can be updated later
  });

  await organization.save();

  // Create user
  const user = new User({
    email,
    password,
    name,
    organizationId: organization._id,
    role: 'admin', // First user in organization becomes admin
  });

  await user.save();

  // Generate tokens
  const tokens = generateTokens({
    id: user._id.toString(),
    email: user.email,
    organizationId: user.organizationId.toString(),
    role: user.role,
  });

  // Update last login
  user.lastLogin = new Date();
  await user.save();

  ApiResponseUtil.success(res, {
    user: {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
    },
    organization: {
      id: organization._id,
      name: organization.name,
      industry: organization.industry,
    },
    ...tokens,
  }, 'Registration successful', 201);
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  // Find user and include password for comparison
  const user = await User.findOne({ email, isActive: true })
    .populate('organizationId', 'name industry isActive')
    .select('+password');

  if (!user) {
    return ApiResponseUtil.error(res, 'Invalid email or password', 401);
  }

  // Check organization is active
  const organization = user.organizationId as any;
  if (!organization?.isActive) {
    return ApiResponseUtil.error(res, 'Organization is inactive', 401);
  }

  // Compare password
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    return ApiResponseUtil.error(res, 'Invalid email or password', 401);
  }

  // Generate tokens
  const tokens = generateTokens({
    id: user._id.toString(),
    email: user.email,
    organizationId: user.organizationId._id.toString(),
    role: user.role,
  });

  // Update last login
  user.lastLogin = new Date();
  await user.save();

  ApiResponseUtil.success(res, {
    user: {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
      lastLogin: user.lastLogin,
    },
    organization: {
      id: organization._id,
      name: organization.name,
      industry: organization.industry,
    },
    ...tokens,
  }, 'Login successful');
});

export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return ApiResponseUtil.error(res, 'Refresh token is required', 400);
  }

  try {
    const decoded = jwt.verify(refreshToken, config.JWT_SECRET) as any;
    
    // Find user to ensure they still exist and are active
    const user = await User.findById(decoded.id)
      .populate('organizationId', 'name industry isActive');

    if (!user || !user.isActive) {
      return ApiResponseUtil.error(res, 'User not found or inactive', 401);
    }

    const organization = user.organizationId as any;
    if (!organization?.isActive) {
      return ApiResponseUtil.error(res, 'Organization is inactive', 401);
    }

    // Generate new tokens
    const tokens = generateTokens({
      id: user._id.toString(),
      email: user.email,
      organizationId: user.organizationId._id.toString(),
      role: user.role,
    });

    ApiResponseUtil.success(res, tokens, 'Token refreshed successfully');
  } catch (error) {
    return ApiResponseUtil.error(res, 'Invalid refresh token', 401);
  }
});

export const logout = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  // In a production setup, need to invalidate the token on the server side
  // For now, the client will remove the token from localStorage
  ApiResponseUtil.success(res, null, 'Logged out successfully');
});

export const getProfile = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }

  const user = await User.findById(req.user.id)
    .populate('organizationId', 'name industry country size settings')
    .select('-password');

  if (!user) {
    return ApiResponseUtil.error(res, 'User not found', 404);
  }

  ApiResponseUtil.success(res, {
    id: user._id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    lastLogin: user.lastLogin,
    organization: user.organizationId,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
});

export const updateProfile = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }

  const { name, email } = req.body;
  const updates: any = {};

  if (name) updates.name = name;
  if (email) {
    // Check if email is already taken by another user
    const existingUser = await User.findOne({ 
      email, 
      _id: { $ne: req.user.id } 
    });
    
    if (existingUser) {
      return ApiResponseUtil.error(res, 'Email is already taken', 400);
    }
    
    updates.email = email;
  }

  const user = await User.findByIdAndUpdate(
    req.user.id, 
    updates, 
    { new: true, runValidators: true }
  ).populate('organizationId', 'name industry country size');

  if (!user) {
    return ApiResponseUtil.error(res, 'User not found', 404);
  }

  ApiResponseUtil.success(res, {
    id: user._id,
    email: user.email,
    name: user.name,
    role: user.role,
    organization: user.organizationId,
    updatedAt: user.updatedAt,
  }, 'Profile updated successfully');
});

export const changePassword = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return ApiResponseUtil.error(res, 'Authentication required', 401);
  }

  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user.id).select('+password');
  if (!user) {
    return ApiResponseUtil.error(res, 'User not found', 404);
  }

  // Verify current password
  const isCurrentPasswordValid = await user.comparePassword(currentPassword);
  if (!isCurrentPasswordValid) {
    return ApiResponseUtil.error(res, 'Current password is incorrect', 400);
  }

  // Update password
  user.password = newPassword;
  await user.save();

  ApiResponseUtil.success(res, null, 'Password changed successfully');
});
