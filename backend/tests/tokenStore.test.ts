import { tokenStore } from '../src/services/tokenStore';

/**
 * Regression guard for the refresh-token revocation store (F-006). These run
 * with NO Redis connection (Database.getInstance().redis is null until
 * connectRedis() is called), which is exactly the "Redis unavailable" path.
 *
 * The security-critical invariant: `isValid` must FAIL CLOSED — a refresh token
 * is never accepted when the revocation store is unreachable, so a revoked token
 * can't be replayed during a Redis outage. The mutating helpers must degrade
 * gracefully (no throw) so an outage doesn't crash the auth flow.
 */
describe('tokenStore — fail-closed when Redis is unavailable (F-006)', () => {
  it('isValid returns FALSE when Redis is unavailable (revocation cannot be bypassed)', async () => {
    await expect(tokenStore.isValid('user-1', 'jti-1')).resolves.toBe(false);
  });

  it('isValid is false regardless of the user/jti pair when Redis is down', async () => {
    await expect(tokenStore.isValid('anyone', 'any-jti')).resolves.toBe(false);
    await expect(tokenStore.isValid('', '')).resolves.toBe(false);
  });

  it('store degrades gracefully (no throw) when Redis is unavailable', async () => {
    await expect(tokenStore.store('user-1', 'jti-1')).resolves.toBeUndefined();
  });

  it('revoke / revokeAllForUser degrade gracefully (no throw) when Redis is unavailable', async () => {
    await expect(tokenStore.revoke('jti-1', 'user-1')).resolves.toBeUndefined();
    await expect(tokenStore.revokeAllForUser('user-1')).resolves.toBeUndefined();
  });

  it('exposes a positive refresh TTL derived from config', () => {
    expect(typeof tokenStore.ttlSeconds).toBe('number');
    expect(tokenStore.ttlSeconds).toBeGreaterThan(0);
  });
});
