import { Request, Response, CookieOptions } from 'express';
import { User } from '../models/User';
import { Organization } from '../models/Organization';
import { ApiResponseUtil } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  AccessTokenPayload,
} from '../utils/jwt';
import { tokenStore } from '../services/tokenStore';
import { config } from '../config/config';
import { AuthenticatedRequest } from '../types';

const REFRESH_COOKIE = 'refreshToken';

const refreshCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: config.COOKIE_SECURE,
  sameSite: 'strict',
  domain: config.COOKIE_DOMAIN,
  path: '/api/auth',
  maxAge: tokenStore.ttlSeconds * 1000,
});

/** Issue an access token (returned in body) + a revocable refresh token (httpOnly cookie). */
async function issueSession(res: Response, payload: AccessTokenPayload): Promise<string> {
  const accessToken = generateAccessToken(payload);
  const { token: refreshToken, jti } = generateRefreshToken(payload.id);
  await tokenStore.store(payload.id, jti);
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
  return accessToken;
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
}

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, name, organizationName, industry } = req.body;

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return ApiResponseUtil.error(res, 'User already exists with this email', 400);
  }

  const organization = new Organization({
    name: organizationName,
    industry,
    country: 'Egypt',
    size: 'medium',
  });
  await organization.save();

  const user = new User({
    email,
    password,
    name,
    organizationId: organization._id,
    role: 'admin', // First user in an organization becomes its admin
  });
  await user.save();

  user.lastLogin = new Date();
  await user.save();

  const accessToken = await issueSession(res, {
    id: user._id.toString(),
    email: user.email,
    organizationId: user.organizationId.toString(),
    role: user.role,
  });

  ApiResponseUtil.success(
    res,
    {
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
      accessToken,
    },
    'Registration successful',
    201
  );
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email, isActive: true })
    .populate('organizationId', 'name industry isActive')
    .select('+password');

  // Generic message for both unknown user and bad password (no user enumeration).
  if (!user) {
    return ApiResponseUtil.error(res, 'Invalid email or password', 401);
  }

  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    return ApiResponseUtil.error(res, 'Invalid email or password', 401);
  }

  const organization = user.organizationId as any;
  if (!organization?.isActive) {
    return ApiResponseUtil.error(res, 'Invalid email or password', 401);
  }

  user.lastLogin = new Date();
  await user.save();

  const accessToken = await issueSession(res, {
    id: user._id.toString(),
    email: user.email,
    organizationId: organization._id.toString(),
    role: user.role,
  });

  ApiResponseUtil.success(
    res,
    {
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
      accessToken,
    },
    'Login successful'
  );
});

export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  // Prefer the httpOnly cookie; accept a body token only as a transitional fallback.
  const token = req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;

  if (!token) {
    return ApiResponseUtil.error(res, 'Refresh token is required', 401);
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch (error) {
    clearRefreshCookie(res);
    return ApiResponseUtil.error(res, 'Invalid refresh token', 401);
  }

  const valid = await tokenStore.isValid(decoded.id, decoded.jti);
  if (!valid) {
    clearRefreshCookie(res);
    return ApiResponseUtil.error(res, 'Refresh token has been revoked', 401);
  }

  const user = await User.findById(decoded.id).populate(
    'organizationId',
    'name industry isActive'
  );
  if (!user || !user.isActive) {
    await tokenStore.revoke(decoded.jti, decoded.id);
    clearRefreshCookie(res);
    return ApiResponseUtil.error(res, 'User not found or inactive', 401);
  }

  const organization = user.organizationId as any;
  if (!organization?.isActive) {
    return ApiResponseUtil.error(res, 'Organization is inactive', 401);
  }

  // Rotate: revoke the used token and issue a fresh pair.
  await tokenStore.revoke(decoded.jti, decoded.id);
  const accessToken = await issueSession(res, {
    id: user._id.toString(),
    email: user.email,
    organizationId: organization._id.toString(),
    role: user.role,
  });

  ApiResponseUtil.success(res, { accessToken }, 'Token refreshed successfully');
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;
  if (token) {
    try {
      const decoded = verifyRefreshToken(token);
      await tokenStore.revoke(decoded.jti, decoded.id);
    } catch {
      // ignore — token already invalid
    }
  }
  clearRefreshCookie(res);
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
    const existingUser = await User.findOne({ email, _id: { $ne: req.user.id } });
    if (existingUser) {
      return ApiResponseUtil.error(res, 'Email is already taken', 400);
    }
    updates.email = email;
  }

  const user = await User.findByIdAndUpdate(req.user.id, updates, {
    new: true,
    runValidators: true,
  }).populate('organizationId', 'name industry country size');

  if (!user) {
    return ApiResponseUtil.error(res, 'User not found', 404);
  }

  ApiResponseUtil.success(
    res,
    {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      organization: user.organizationId,
      updatedAt: user.updatedAt,
    },
    'Profile updated successfully'
  );
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

  const isCurrentPasswordValid = await user.comparePassword(currentPassword);
  if (!isCurrentPasswordValid) {
    return ApiResponseUtil.error(res, 'Current password is incorrect', 400);
  }

  user.password = newPassword;
  await user.save();

  // Invalidate every existing session for this user — they must log in again.
  await tokenStore.revokeAllForUser(user._id.toString());
  clearRefreshCookie(res);

  ApiResponseUtil.success(res, null, 'Password changed successfully. Please log in again.');
});
