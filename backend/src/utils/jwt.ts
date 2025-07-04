import jwt from 'jsonwebtoken';
import { config } from '../config/config';

export interface JwtPayload {
  id: string;
  email: string;
  role: string;
  organizationId?: string;
}

export const generateTokens = (payload: JwtPayload) => {
  const accessToken = jwt.sign(
    payload, 
    config.JWT_SECRET as string, 
    { 
      expiresIn: config.JWT_EXPIRE || '7d' 
    } as jwt.SignOptions
  );

  const refreshToken = jwt.sign(
    payload, 
    config.JWT_SECRET as string, 
    { 
      expiresIn: config.REFRESH_TOKEN_EXPIRE || '30d' 
    } as jwt.SignOptions
  );

  return { accessToken, refreshToken };
};

export const verifyToken = (token: string): JwtPayload => {
  return jwt.verify(token, config.JWT_SECRET as string) as JwtPayload;
};

export const decodeToken = (token: string): JwtPayload | null => {
  try {
    return jwt.decode(token) as JwtPayload;
  } catch (error) {
    return null;
  }
};
