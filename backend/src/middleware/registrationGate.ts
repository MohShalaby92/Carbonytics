import { Request, Response, NextFunction } from 'express';
import { config } from '../config/config';
import { ApiResponseUtil } from '../utils/apiResponse';

/**
 * Blocks public self-service registration when DISABLE_REGISTRATION=true.
 *
 * Used on closed/invite-only deployments (the specialist-review instance) where
 * accounts are pre-created out of band (scripts/seedReviewAccounts.ts). On open
 * deployments (flag unset) this is a transparent pass-through, so dev/test and
 * the default stack are unaffected.
 */
export function registrationGate(req: Request, res: Response, next: NextFunction): void {
  if (config.DISABLE_REGISTRATION) {
    ApiResponseUtil.error(res, 'Self-service registration is disabled on this instance', 403);
    return;
  }
  next();
}
