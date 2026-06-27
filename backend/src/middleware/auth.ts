import { Response, NextFunction } from 'express';
import { User } from '../models/User';
import { verifyAccessToken } from '../utils/jwt';
import { AuthenticatedRequest } from '../types';

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        message: 'Access token is required',
      });
      return;
    }

    const token = authHeader.substring(7);

    try {
      const decoded = verifyAccessToken(token);

      // Verify the user still exists and is active.
      const user = await User.findById(decoded.id).select('-password');
      if (!user || !user.isActive) {
        res.status(401).json({
          success: false,
          message: 'User not found or inactive',
        });
        return;
      }

      req.user = {
        id: decoded.id,
        email: decoded.email,
        organizationId: decoded.organizationId,
        role: decoded.role,
      };

      next();
    } catch (jwtError) {
      res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }
  } catch (error) {
    next(error);
  }
};

export const authorize = (...roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ success: false, message: 'Insufficient permissions' });
      return;
    }

    next();
  };
};

export const optionalAuth = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7);
      const decoded = verifyAccessToken(token);

      // Confirm the user is still active before trusting optional auth.
      const user = await User.findById(decoded.id).select('isActive');
      if (user && user.isActive) {
        req.user = {
          id: decoded.id,
          email: decoded.email,
          organizationId: decoded.organizationId,
          role: decoded.role,
        };
      }
    } catch (error) {
      // Ignore errors for optional auth — request proceeds unauthenticated.
    }
  }

  next();
};

