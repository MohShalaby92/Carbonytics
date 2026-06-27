import { AuditLog } from '../models/AuditLog';
import { logger } from './logger';

interface AuditEvent {
  organizationId: string;
  userId?: string;
  userEmail?: string;
  action: 'create' | 'update' | 'delete' | 'lock' | 'unlock' | 'import';
  resourceType: string;
  resourceId?: string;
  before?: any;
  after?: any;
  comment?: string;
}

/**
 * Write one append-only audit entry. Failures are logged loudly but never
 * break the business operation (the operation itself remains the source of
 * truth; missing audit writes surface in logs for operational follow-up).
 */
export async function recordAudit(event: AuditEvent): Promise<void> {
  try {
    await AuditLog.create(event);
  } catch (error) {
    logger.error(
      `AUDIT WRITE FAILED (${event.action} ${event.resourceType} ${event.resourceId || ''})`,
      error
    );
  }
}
