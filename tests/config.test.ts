import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  test('defaults: port 3000, local db, site URL from the port', () => {
    assert.deepEqual(loadConfig({}), { port: 3000, dbPath: 'data/kochi-tours.db', siteUrl: 'http://localhost:3000' });
    assert.equal(loadConfig({ PORT: '4100' }).siteUrl, 'http://localhost:4100');
  });
  test('SITE_URL is used without a trailing slash', () => {
    assert.equal(loadConfig({ SITE_URL: 'https://tours.example/' }).siteUrl, 'https://tours.example');
  });
  test('rejects a SITE_URL that is not an http(s) origin, and a bad PORT', () => {
    for (const bad of ['tours.example', 'ftp://x.example', 'https://x.example/path', 'javascript:alert(1)']) {
      assert.throws(() => loadConfig({ SITE_URL: bad }), /SITE_URL must be/, bad);
    }
    assert.throws(() => loadConfig({ PORT: '0' }), /PORT must be/);
  });
});
