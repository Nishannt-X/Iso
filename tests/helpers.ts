import { initSchema, openDb, run, type DatabaseSync, type Param } from '../src/db/db.js';

/** In-memory database with the schema applied and one admin user (id 1). */
export function freshDb(): DatabaseSync {
  const db = openDb(':memory:');
  initSchema(db);
  run(db, "INSERT INTO staff_users (email, name, role, password_hash) VALUES ('t@example.invalid', 'Test Admin', 'admin', 'x')");
  return db;
}

export function expectSqlError(fn: () => unknown, pattern: RegExp): void {
  let thrown: unknown;
  try {
    fn();
  } catch (err) {
    thrown = err;
  }
  if (!(thrown instanceof Error)) throw new Error(`expected SQL error matching ${pattern}, but nothing was thrown`);
  if (!pattern.test(thrown.message)) throw new Error(`expected error matching ${pattern}, got: ${thrown.message}`);
}

/** Raw-SQL fixtures for schema tests (domain tests use the real repository functions). */
export function insertPackage(db: DatabaseSync, code: string, slug: string): number {
  return Number(run(db, "INSERT INTO packages (code, slug, data_origin) VALUES (?, ?, 'synthetic')", code, slug).lastInsertRowid);
}

export function insertVersion(
  db: DatabaseSync,
  packageId: number,
  versionNo: number,
  status: 'draft' | 'published' | 'superseded',
  extra: { title?: string; childPct?: number | null } = {},
): number {
  const params: Param[] = [packageId, versionNo, status, extra.title ?? 'T', extra.childPct ?? null];
  return Number(
    run(
      db,
      `INSERT INTO package_versions
         (package_id, version_no, status, title, summary, days, nights, region, child_pct,
          itinerary_json, inclusions_json, exclusions_json, created_by)
       VALUES (?, ?, ?, ?, 's', 2, 1, 'Kerala', ?, '[]', '[]', '[]', 1)`,
      ...params,
    ).lastInsertRowid,
  );
}

export function insertSeason(db: DatabaseSync, versionId: number, position = 1): number {
  return Number(
    run(
      db,
      "INSERT INTO package_version_seasons (version_id, position, name, start_md, end_md, price_pp_twin_inr) VALUES (?, ?, 'S', '01-01', '03-31', 1000)",
      versionId,
      position,
    ).lastInsertRowid,
  );
}
