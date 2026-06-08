import Database from '../config/database';
import { config } from '../config/config';
import { logger } from '../utils/logger';

/**
 * Revocable refresh-token store backed by Redis.
 *
 * Each issued refresh token has a unique `jti`. We persist `refresh:<jti> -> userId`
 * with a TTL equal to the token's lifetime, and track the set of a user's active
 * jtis under `refresh:user:<userId>` so we can revoke everything for a user at once
 * (used on logout-all and password change).
 *
 * Degradation: if Redis is unavailable, refresh validation falls back to signature-only
 * verification. Access tokens remain short-lived (default 15m), so the practical exposure
 * is bounded, but server-side revocation is unavailable until Redis recovers. This is
 * logged loudly. For strict deployments, run Redis as a hard dependency.
 */

function parseExpiryToSeconds(expiry: string): number {
  if (/^\d+$/.test(expiry)) return parseInt(expiry, 10);
  const match = /^(\d+)\s*([smhd])$/.exec(expiry.trim());
  if (!match) return 7 * 24 * 60 * 60; // safe default: 7 days
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * multipliers[unit];
}

const REFRESH_TTL_SECONDS = parseExpiryToSeconds(config.JWT_REFRESH_EXPIRE);

const tokenKey = (jti: string) => `refresh:${jti}`;
const userSetKey = (userId: string) => `refresh:user:${userId}`;

function redis() {
  return Database.getInstance().redis;
}

export const tokenStore = {
  ttlSeconds: REFRESH_TTL_SECONDS,

  async store(userId: string, jti: string): Promise<void> {
    const client = redis();
    if (!client) {
      logger.warn('Redis unavailable: refresh token not persisted (revocation degraded).');
      return;
    }
    try {
      await client.setEx(tokenKey(jti), REFRESH_TTL_SECONDS, userId);
      await client.sAdd(userSetKey(userId), jti);
      await client.expire(userSetKey(userId), REFRESH_TTL_SECONDS);
    } catch (error) {
      logger.error('Failed to store refresh token:', error);
    }
  },

  /** Returns true if the jti is recognised for this user (or Redis is unavailable). */
  async isValid(userId: string, jti: string): Promise<boolean> {
    const client = redis();
    if (!client) {
      logger.warn('Redis unavailable: accepting refresh token on signature only.');
      return true; // fail-open, bounded by short access-token lifetime
    }
    try {
      const stored = await client.get(tokenKey(jti));
      return stored === userId;
    } catch (error) {
      logger.error('Failed to validate refresh token:', error);
      return true;
    }
  },

  async revoke(jti: string, userId?: string): Promise<void> {
    const client = redis();
    if (!client) return;
    try {
      await client.del(tokenKey(jti));
      if (userId) await client.sRem(userSetKey(userId), jti);
    } catch (error) {
      logger.error('Failed to revoke refresh token:', error);
    }
  },

  async revokeAllForUser(userId: string): Promise<void> {
    const client = redis();
    if (!client) return;
    try {
      const jtis = await client.sMembers(userSetKey(userId));
      const keys = jtis.map(tokenKey);
      if (keys.length > 0) await client.del(keys);
      await client.del(userSetKey(userId));
    } catch (error) {
      logger.error('Failed to revoke user refresh tokens:', error);
    }
  },
};
