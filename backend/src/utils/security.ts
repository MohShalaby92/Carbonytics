import crypto from 'crypto';

/**
 * Cryptographically secure temporary password.
 * Uses crypto.randomBytes (NOT Math.random) and includes mixed character classes.
 */
export const generateTemporaryPassword = (length = 16): string => {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += charset[bytes[i] % charset.length];
  }
  return out;
};

/** Escape user input before using it inside a RegExp (prevents ReDoS / regex injection). */
export const escapeRegex = (input: string): string =>
  input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
