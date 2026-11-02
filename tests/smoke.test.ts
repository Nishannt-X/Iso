import assert from 'node:assert/strict';
import { test } from 'node:test';
import { get, openDb, transaction } from '../src/db/db.js';

test('openDb enforces foreign keys', () => {
  const db = openDb(':memory:');
  assert.equal(get<{ foreign_keys: number }>(db, 'PRAGMA foreign_keys')?.foreign_keys, 1);
  db.close();
});

test('transaction commits on success and rolls back on error', () => {
  const db = openDb(':memory:');
  db.exec('CREATE TABLE t (x INTEGER)');
  transaction(db, () => db.exec('INSERT INTO t VALUES (1)'));
  assert.throws(() => transaction(db, () => { db.exec('INSERT INTO t VALUES (2)'); throw new Error('boom'); }), /boom/);
  assert.equal(get<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM t')?.n, 1);
  db.close();
});
