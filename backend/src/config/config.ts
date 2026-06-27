import dotenv from 'dotenv';

dotenv.config();

const isProd = (process.env.NODE_ENV || 'development') === 'production';

// Secrets that must never be used in production. Catches the old hardcoded default.
const WEAK_SECRETS = new Set([
  'your-super-secret-jwt-key',
  'your_jwt_secret_key_here_min_64_characters_recommended_for_security',
  'secret',
  'changeme',
  'test-secret',
]);

/**
 * Resolve a secret from env with safety checks.
 * - In production: required, must be >= 32 chars, must not be a known weak value.
 * - In development: falls back to a clearly-marked dev value (with a warning) so
 *   local setup stays frictionless, but never silently in production.
 */
function resolveSecret(name: string, fallbackFrom?: string): string {
  const value = process.env[name];

  if (value) {
    if (isProd && (value.length < 32 || WEAK_SECRETS.has(value))) {
      throw new Error(
        `${name} is too weak for production. Use a random value of at least 32 characters ` +
          `(e.g. \`openssl rand -base64 48\`).`,
      );
    }
    return value;
  }

  if (isProd) {
    throw new Error(`Missing required environment variable in production: ${name}`);
  }

  // Development-only fallback. Derived so access/refresh secrets still differ.
  const devValue = `dev-only-insecure-${name}${fallbackFrom ? '-' + fallbackFrom : ''}`;
  // eslint-disable-next-line no-console
  console.warn(
    `⚠️  ${name} is not set — using an insecure development fallback. ` +
      `Set ${name} in your environment before deploying.`,
  );
  return devValue;
}

const JWT_ACCESS_SECRET = resolveSecret('JWT_SECRET');
const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET
    ? resolveSecret('JWT_REFRESH_SECRET')
    : (isProd
        ? (() => { throw new Error('Missing required environment variable in production: JWT_REFRESH_SECRET'); })()
        : `${JWT_ACCESS_SECRET}-refresh`);

export const config = {
  // Server
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '5000', 10),
  IS_PROD: isProd,

  // Database
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/carbonytics',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',

  // JWT — access tokens are short-lived; refresh tokens are revocable (see tokenStore)
  JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET,
  JWT_SECRET: JWT_ACCESS_SECRET, // back-compat alias
  JWT_ACCESS_EXPIRE: process.env.JWT_ACCESS_EXPIRE || process.env.JWT_EXPIRE || '15m',
  JWT_REFRESH_EXPIRE: process.env.JWT_REFRESH_EXPIRE || process.env.REFRESH_TOKEN_EXPIRE || '7d',

  // Cookies (refresh token is delivered as an httpOnly cookie)
  COOKIE_SECURE: process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === 'true'
    : isProd,
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || undefined,

  // External APIs
  AIRPORT_API_KEY: process.env.AIRPORT_API_KEY,
  EMISSION_FACTORS_API_KEY: process.env.EMISSION_FACTORS_API_KEY,

  // Email
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,

  // File Upload
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10), // 10MB
  UPLOAD_PATH: process.env.UPLOAD_PATH || './uploads',

  // Rate Limiting
  RATE_LIMIT_WINDOW: parseInt(process.env.RATE_LIMIT_WINDOW || '900000', 10), // 15 minutes
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  AUTH_RATE_LIMIT_MAX: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '10', 10),

  // CORS
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:3000',

  // Cache
  CACHE_TTL: parseInt(process.env.CACHE_TTL || '3600', 10), // 1 hour

  // Feature flags
  // When true, the public POST /api/auth/register endpoint returns 403. Used on
  // closed/invite-only deployments (e.g. the specialist-review instance) where
  // accounts are pre-created out of band (scripts/seedReviewAccounts.ts) and
  // self-service signup must not be exposed to the public internet.
  DISABLE_REGISTRATION: process.env.DISABLE_REGISTRATION === 'true',
} as const;

if (isProd && !process.env.MONGODB_URI) {
  throw new Error('Missing required environment variable in production: MONGODB_URI');
}
