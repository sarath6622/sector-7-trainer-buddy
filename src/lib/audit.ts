import 'server-only';
import type { db as DbType } from './db';

type Db = typeof DbType;

/**
 * Writes an AuditLog entry. Fire-and-forget — never throws so caller mutations
 * always succeed even if the log write fails.
 */
export function writeAudit(
  db: Db,
  userId: string,
  action: string,
  entity: string,
  entityId: string,
  details?: Record<string, unknown>,
): void {
  db.auditLog
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .create({ data: { userId, action, entity, entityId, details: (details ?? undefined) as any } })
    .catch((err: unknown) => console.error('[audit] write failed:', err));
}
