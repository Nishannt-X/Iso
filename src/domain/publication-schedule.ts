import { all, get, run, transaction, type DatabaseSync } from '../db/db.js';
import { writeAudit } from './audit.js';
import { DomainError, getDraftForPackage, getVersion, publish, validatePublishable } from './packages.js';

export interface PublicationSchedule {
  packageId: number;
  draftId: number;
  publishAt: string;
  note: string;
  expectedLockVersion: number;
  status: 'pending' | 'published' | 'failed' | 'cancelled';
  error: string | null;
}

export function getPublicationSchedule(db: DatabaseSync, packageId: number): PublicationSchedule | null {
  const r = get<{ package_id: number; draft_id: number; publish_at: string; note: string; expected_lock_version: number; status: PublicationSchedule['status']; error: string | null }>(db,
    'SELECT * FROM package_publication_schedule WHERE package_id = ?', packageId);
  return r ? { packageId: r.package_id, draftId: r.draft_id, publishAt: r.publish_at, note: r.note, expectedLockVersion: r.expected_lock_version, status: r.status, error: r.error } : null;
}

export function schedulePublication(db: DatabaseSync, input: { packageId: number; publishAt: string; note: string; actorId: number; expectedLockVersion: number }, now: Date): void {
  const when = new Date(input.publishAt);
  if (Number.isNaN(when.getTime()) || when <= now || when.getTime() - now.getTime() > 365 * 86400_000) throw new DomainError('validation', 'Choose a future publish time within one year.');
  if (!input.note.trim() || input.note.length > 300) throw new DomainError('validation', 'Add a short publish note.');
  transaction(db, () => {
    const draft = getDraftForPackage(db, input.packageId);
    if (!draft) throw new DomainError('invalid_state', 'This package has no draft to schedule.');
    if (draft.lockVersion !== input.expectedLockVersion) throw new DomainError('conflict', 'The draft changed. Reload and review it before scheduling.');
    const issues = validatePublishable(draft);
    if (issues.length) throw new DomainError('validation', 'The draft is not ready to publish.', issues);
    run(db, `INSERT INTO package_publication_schedule (package_id, draft_id, publish_at, note, expected_lock_version, scheduled_by, status, error)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL)
      ON CONFLICT(package_id) DO UPDATE SET draft_id=excluded.draft_id, publish_at=excluded.publish_at, note=excluded.note,
      expected_lock_version=excluded.expected_lock_version, scheduled_by=excluded.scheduled_by, status='pending', error=NULL`,
    input.packageId, draft.id, when.toISOString(), input.note.trim(), draft.lockVersion, input.actorId);
    writeAudit(db, input.actorId, 'version.schedule', 'package_version', draft.id, { publishAt: when.toISOString() });
  });
}

export function cancelPublication(db: DatabaseSync, packageId: number, actorId: number): void {
  transaction(db, () => {
    const schedule = getPublicationSchedule(db, packageId);
    if (!schedule || schedule.status !== 'pending') throw new DomainError('invalid_state', 'There is no pending publication to cancel.');
    run(db, "UPDATE package_publication_schedule SET status='cancelled' WHERE package_id=?", packageId);
    writeAudit(db, actorId, 'version.cancel_schedule', 'package_version', schedule.draftId);
  });
}

/** Called at startup and once per minute. A stale edited draft fails safely and remains private. */
export function runDuePublications(db: DatabaseSync, now: Date): { published: number; failed: number } {
  const due = all<{ package_id: number; draft_id: number; publish_at: string; note: string; expected_lock_version: number; scheduled_by: number }>(db,
    "SELECT package_id, draft_id, publish_at, note, expected_lock_version, scheduled_by FROM package_publication_schedule WHERE status='pending' AND publish_at <= ? ORDER BY publish_at LIMIT 100", now.toISOString());
  let published = 0;
  let failed = 0;
  for (const item of due) {
    try {
      const version = getVersion(db, item.draft_id);
      if (version?.status === 'draft') publish(db, { draftId: item.draft_id, actorId: item.scheduled_by, note: item.note, expectedLockVersion: item.expected_lock_version });
      else if (version?.status !== 'published') throw new DomainError('invalid_state', 'Scheduled draft is no longer available.');
      run(db, "UPDATE package_publication_schedule SET status='published', error=NULL WHERE package_id=? AND status='pending'", item.package_id);
      published++;
    } catch (err) {
      const reason = err instanceof DomainError ? err.message : 'Publication failed; ask an admin to review.';
      run(db, "UPDATE package_publication_schedule SET status='failed', error=? WHERE package_id=? AND status='pending'", reason.slice(0, 300), item.package_id);
      failed++;
    }
  }
  return { published, failed };
}
