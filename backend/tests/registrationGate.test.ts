import type { Request, Response, NextFunction } from 'express';

/**
 * Guards the closed-registration flag used by the specialist-review deployment.
 * When DISABLE_REGISTRATION=true the public /api/auth/register route must return
 * 403 and NOT reach the controller; when unset it must be a transparent
 * pass-through so dev/test and the default stack are unaffected.
 *
 * The flag is read from env at module-load time (config singleton), so each case
 * loads the middleware in an isolated module registry with the env set.
 */
function loadGate(disable: boolean): (req: Request, res: Response, next: NextFunction) => void {
  let gate!: (req: Request, res: Response, next: NextFunction) => void;
  jest.isolateModules(() => {
    process.env.DISABLE_REGISTRATION = disable ? 'true' : 'false';
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    gate = require('../src/middleware/registrationGate').registrationGate;
  });
  return gate;
}

function mockRes(): Response & { statusCode: number; body: unknown } {
  const res: any = { statusCode: 200, body: undefined };
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((body: unknown) => {
    res.body = body;
    return res;
  });
  return res;
}

describe('registrationGate', () => {
  const original = process.env.DISABLE_REGISTRATION;
  afterAll(() => {
    if (original === undefined) delete process.env.DISABLE_REGISTRATION;
    else process.env.DISABLE_REGISTRATION = original;
  });

  it('passes through (calls next, no response) when the flag is unset/false', () => {
    const gate = loadGate(false);
    const res = mockRes();
    const next = jest.fn();
    gate({} as Request, res, next as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('blocks with 403 and does NOT call next when DISABLE_REGISTRATION=true', () => {
    const gate = loadGate(true);
    const res = mockRes();
    const next = jest.fn();
    gate({} as Request, res, next as NextFunction);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect((res.body as { success: boolean }).success).toBe(false);
  });
});
