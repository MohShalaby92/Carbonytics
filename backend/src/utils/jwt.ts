import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config/config';

export interface AccessTokenPayload {
  id: string;
  email: string;
  role: string;
  organizationId: string;
}

interface AccessClaims extends AccessTokenPayload {
  type: 'access';
}

interface RefreshClaims {
  id: string;
  jti: string;
  type: 'refresh';
}

export const generateAccessToken = (payload: AccessTokenPayload): string => {
  const claims: AccessClaims = { ...payload, type: 'access' };
  return jwt.sign(claims, config.JWT_ACCESS_SECRET, {
    expiresIn: config.JWT_ACCESS_EXPIRE,
  } as jwt.SignOptions);
};

export interface GeneratedRefreshToken {
  token: string;
  jti: string;
}

export const generateRefreshToken = (userId: string): GeneratedRefreshToken => {
  const jti = crypto.randomUUID();
  const claims: RefreshClaims = { id: userId, jti, type: 'refresh' };
  const token = jwt.sign(claims, config.JWT_REFRESH_SECRET, {
    expiresIn: config.JWT_REFRESH_EXPIRE,
  } as jwt.SignOptions);
  return { token, jti };
};

export const verifyAccessToken = (token: string): AccessClaims => {
  const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET) as AccessClaims;
  if (decoded.type !== 'access') {
    throw new jwt.JsonWebTokenError('Invalid token type');
  }
  return decoded;
};

export const verifyRefreshToken = (token: string): RefreshClaims => {
  const decoded = jwt.verify(token, config.JWT_REFRESH_SECRET) as RefreshClaims;
  if (decoded.type !== 'refresh') {
    throw new jwt.JsonWebTokenError('Invalid token type');
  }
  return decoded;
};
