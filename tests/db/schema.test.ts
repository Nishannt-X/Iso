import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { all, get, isInitialised, run } from '../../src/db/db.js';
import { expectSqlError, freshDb, insertPackage, insertSeason, insertVersion } from '../helpers.js';

describe('schema bootstrap', () => {
  test('foreign keys are on and the schema is marked initialised', () => {
    const db = freshDb();
    assert.equal(isInitialised(db), true);
    assert.equal(get<{ foreign_keys: number }>(db, 'PRAGMA foreign_keys')?.foreign_keys, 1);
  });

  test('FK errors surface: version without package, and package delete with versions', () => {
    const db = freshDb();
    expectSqlError(() => insertVersion(db, 999, 1, 'draft'), /FOREIGN KEY/);
    const p = insertPackage(db, 'P1', 'p-one');
    insertVersion(db, p, 1, 'draft');
    expectSqlError(() => run(db, 'DELETE FROM packages WHERE id = ?', p), /FOREIGN KEY/);
  });
});

describe('I1: one draft and one published per package', () => {
  test('a second draft for the same package is rejected', () => {
    const db = freshDb();
    const p = insertPackage(db, 'P1', 'p-one');
    insertVersion(db, p, 1, 'draft');
    expectSqlError(() => insertVersion(db, p, 2, 'draft'), /UNIQUE/);
  });

  test('a second published version is rejected but another package is fine', () => {
    const db = freshDb();
    const p = insertPackage(db, 'P1', 'p-one');
    const q = insertPackage(db, 'P2', 'p-two');
    insertVersion(db, p, 1, 'published');
    expectSqlError(() => insertVersion(db, p, 2, 'published'), /UNIQUE/);
    insertVersion(db, q, 1, 'published');
    insertVersion(db, p, 2, 'draft'); // one draft alongside one published is the normal editing state
  });

  test('many superseded versions may coexist', () => {
    const db = freshDb();
    const p = insertPackage(db, 'P1', 'p-one');
    insertVersion(db, p, 1, 'superseded');
    insertVersion(db, p, 2, 'superseded');
    insertVersion(db, p, 3, 'published');
  });
});

describe('I2: version immutability', () => {
  test('draft rows are editable and deletable', () => {
    const db = freshDb();
    const v = insertVersion(db, insertPackage(db, 'P1', 'p-one'), 1, 'draft');
    run(db, "UPDATE package_versions SET title = 'Changed' WHERE id = ?", v);
    assert.equal(get<{ title: string }>(db, 'SELECT title FROM package_versions WHERE id = ?', v)?.title, 'Changed');
    run(db, 'DELETE FROM package_versions WHERE id = ?', v);
  });

  test('draft may become published but not superseded', () => {
    const db = freshDb();
    const p = insertPackage(db, 'P1', 'p-one');
    const a = insertVersion(db, p, 1, 'draft');
    expectSqlError(() => run(db, "UPDATE package_versions SET status = 'superseded' WHERE id = ?", a), /draft version can only/);
    run(db, "UPDATE package_versions SET status = 'published' WHERE id = ?", a);
  });

  test('a published version cannot be edited or deleted', () => {
    const db = freshDb();
    const v = insertVersion(db, insertPackage(db, 'P1', 'p-one'), 1, 'published');
    expectSqlError(() => run(db, "UPDATE package_versions SET title = 'x' WHERE id = ?", v), /immutable/);
    expectSqlError(() => run(db, 'UPDATE package_versions SET child_pct = 50 WHERE id = ?', v), /immutable/);
    expectSqlError(() => run(db, 'DELETE FROM package_versions WHERE id = ?', v), /cannot be deleted/);
  });

  test('published -> superseded is allowed, but not combined with any other change', () => {
    const db = freshDb();
    const v = insertVersion(db, insertPackage(db, 'P1', 'p-one'), 1, 'published');
    expectSqlError(() => run(db, "UPDATE package_versions SET status = 'superseded', title = 'sneaky' WHERE id = ?", v), /immutable/);
    expectSqlError(() => run(db, "UPDATE package_versions SET status = 'draft' WHERE id = ?", v), /immutable/);
    run(db, "UPDATE package_versions SET status = 'superseded' WHERE id = ?", v);
    assert.equal(get<{ status: string }>(db, 'SELECT status FROM package_versions WHERE id = ?', v)?.status, 'superseded');
  });

  test('a superseded version is frozen and undeletable', () => {
    const db = freshDb();
    const v = insertVersion(db, insertPackage(db, 'P1', 'p-one'), 1, 'superseded');
    expectSqlError(() => run(db, "UPDATE package_versions SET title = 'x' WHERE id = ?", v), /immutable/);
    expectSqlError(() => run(db, "UPDATE package_versions SET status = 'published' WHERE id = ?", v), /immutable/);
    expectSqlError(() => run(db, 'DELETE FROM package_versions WHERE id = ?', v), /cannot be deleted/);
  });

  test('CHECK constraints reject bad child_pct, bad slug and a zero season price', () => {
    const db = freshDb();
    const p = insertPackage(db, 'P1', 'p-one');
    expectSqlError(() => insertVersion(db, p, 1, 'draft', { childPct: 101 }), /CHECK/);
    expectSqlError(() => insertPackage(db, 'P2', 'Bad Slug'), /CHECK/);
    const v = insertVersion(db, p, 1, 'draft', { childPct: 0 }); // 0 is a legal explicit rule
    expectSqlError(
      () => run(db, "INSERT INTO package_version_seasons (version_id, position, name, start_md, end_md, price_pp_twin_inr) VALUES (?, 1, 'S', '01-01', '03-31', 0)", v),
      /CHECK/,
    );
  });
});

describe('I2b: child rows follow the parent', () => {
  test('children of a draft can be inserted, updated and deleted', () => {
    const db = freshDb();
    const v = insertVersion(db, insertPackage(db, 'P1', 'p-one'), 1, 'draft');
    const s = insertSeason(db, v);
    run(db, 'UPDATE package_version_seasons SET price_pp_twin_inr = 2000 WHERE id = ?', s);
    run(db, "INSERT INTO package_version_tags (version_id, tag) VALUES (?, 'houseboat')", v);
    run(db, "INSERT INTO package_version_destinations (version_id, position, name) VALUES (?, 1, 'Kochi')", v);
    run(db, 'DELETE FROM package_version_seasons WHERE id = ?', s);
  });

  for (const status of ['published', 'superseded'] as const) {
    test(`INSERT, UPDATE and DELETE of children are rejected under a ${status} parent (all three tables)`, () => {
      const db = freshDb();
      const p = insertPackage(db, 'P1', 'p-one');
      const draft = insertVersion(db, p, 1, 'draft');
      const seasonId = insertSeason(db, draft);
      const tagId = Number(run(db, "INSERT INTO package_version_tags (version_id, tag) VALUES (?, 'a')", draft).lastInsertRowid);
      const destId = Number(run(db, "INSERT INTO package_version_destinations (version_id, position, name) VALUES (?, 1, 'Kochi')", draft).lastInsertRowid);
      run(db, "UPDATE package_versions SET status = 'published' WHERE id = ?", draft);
      if (status === 'superseded') run(db, "UPDATE package_versions SET status = 'superseded' WHERE id = ?", draft);

      const imm = /immutable/;
      expectSqlError(() => insertSeason(db, draft, 2), imm);
      expectSqlError(() => run(db, "INSERT INTO package_version_tags (version_id, tag) VALUES (?, 'b')", draft), imm);
      expectSqlError(() => run(db, "INSERT INTO package_version_destinations (version_id, position, name) VALUES (?, 2, 'Munnar')", draft), imm);
      expectSqlError(() => run(db, 'UPDATE package_version_seasons SET price_pp_twin_inr = 1 WHERE id = ?', seasonId), imm);
      expectSqlError(() => run(db, "UPDATE package_version_tags SET tag = 'z' WHERE id = ?", tagId), imm);
      expectSqlError(() => run(db, "UPDATE package_version_destinations SET name = 'z' WHERE id = ?", destId), imm);
      expectSqlError(() => run(db, 'DELETE FROM package_version_seasons WHERE id = ?', seasonId), imm);
      expectSqlError(() => run(db, 'DELETE FROM package_version_tags WHERE id = ?', tagId), imm);
      expectSqlError(() => run(db, 'DELETE FROM package_version_destinations WHERE id = ?', destId), imm);
    });
  }

  test('a child cannot be moved from a draft onto a published parent', () => {
    const db = freshDb();
    const published = insertVersion(db, insertPackage(db, 'P1', 'p-one'), 1, 'published');
    const draft = insertVersion(db, insertPackage(db, 'P2', 'p-two'), 1, 'draft');
    const s = insertSeason(db, draft);
    expectSqlError(() => run(db, 'UPDATE package_version_seasons SET version_id = ? WHERE id = ?', published, s), /immutable/);
  });
});

describe('slug lock', () => {
  test('slug is editable before first publish and locked after', () => {
    const db = freshDb();
    const p = insertPackage(db, 'P1', 'p-one');
    const v = insertVersion(db, p, 1, 'draft');
    run(db, "UPDATE packages SET slug = 'p-renamed' WHERE id = ?", p);
    run(db, "UPDATE package_versions SET status = 'published' WHERE id = ?", v);
    expectSqlError(() => run(db, "UPDATE packages SET slug = 'p-again' WHERE id = ?", p), /slug is locked/);
    run(db, "UPDATE packages SET slug = 'p-renamed' WHERE id = ?", p); // unchanged value is not a change
  });

  test('slug stays locked after the version is superseded', () => {
    const db = freshDb();
    const p = insertPackage(db, 'P1', 'p-one');
    insertVersion(db, p, 1, 'superseded');
    expectSqlError(() => run(db, "UPDATE packages SET slug = 'x' WHERE id = ?", p), /slug is locked/);
  });
});

describe('live_versions view and seed order', () => {
  test('exposes only published rows', () => {
    const db = freshDb();
    const a = insertPackage(db, 'A', 'a');
    const b = insertPackage(db, 'B', 'b');
    const c = insertPackage(db, 'C', 'c');
    insertVersion(db, a, 1, 'published');
    insertVersion(db, b, 1, 'draft');
    insertVersion(db, c, 1, 'superseded');
    insertVersion(db, c, 2, 'draft');
    const live = all<{ package_id: number }>(db, 'SELECT package_id FROM live_versions');
    assert.deepEqual(live.map((r) => r.package_id), [a]);
  });

  test('package, draft, children, then publish works with no FK errors', () => {
    const db = freshDb();
    const p = insertPackage(db, 'P1', 'p-one');
    const v = insertVersion(db, p, 1, 'draft');
    insertSeason(db, v);
    run(db, "INSERT INTO package_version_tags (version_id, tag) VALUES (?, 'x')", v);
    run(db, "UPDATE package_versions SET status = 'published' WHERE id = ?", v);
    assert.equal(all(db, 'SELECT 1 FROM live_versions').length, 1);
  });
});
