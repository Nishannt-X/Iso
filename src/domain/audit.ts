import { run, type DatabaseSync } from '../db/db.js';

/**
 * Appends one row to audit_log. `meta` may hold ids, enum values and counts only: never names, contact
 * details, message text, notes or passwords, because the log is readable by every admin and must stay free of personal data.
 * Call it inside the transaction that makes the change, so a change and its record succeed or fail together.
 */
export function writeAudit(
  db: DatabaseSync,
  actorId: number | null,
  action: string,
  entity: string,
  entityId: number,
  meta: Record<string, string | number | boolean | null> = {},
): void {
  run(db, 'INSERT INTO audit_log (actor_id, action, entity, entity_id, meta_json) VALUES (?, ?, ?, ?, ?)', actorId, action, entity, entityId, JSON.stringify(meta));
}
