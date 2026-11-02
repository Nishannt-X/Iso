import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { resolve } from 'node:path';
import {
  createRedirectResolver,
  detectDuplicateJsonKeys,
  isSafeSameSitePath,
  loadRedirectsFile,
  normalizePath,
  resolveRedirect,
  validateRedirectMap,
  validateRedirectsJson,
  validateRequestedPath,
} from '../../src/domain/legacy-redirects.js';

describe('legacy-redirects domain module', () => {
  describe('normalizePath', () => {
    test('normalizes paths and strips redundant trailing slashes', () => {
      assert.equal(normalizePath(''), '/');
      assert.equal(normalizePath('/'), '/');
      assert.equal(normalizePath('/packages/munnar'), '/packages/munnar');
      assert.equal(normalizePath('/packages/munnar/'), '/packages/munnar');
      assert.equal(normalizePath('/packages/munnar///'), '/packages/munnar');
      assert.equal(normalizePath('packages/munnar'), '/packages/munnar');
    });
  });

  describe('isSafeSameSitePath', () => {
    test('accepts valid same-site paths', () => {
      assert.equal(isSafeSameSitePath('/packages').ok, true);
      assert.equal(isSafeSameSitePath('/tours/munnar-tea.html').ok, true);
      assert.equal(isSafeSameSitePath('/destinations/fort-kochi').ok, true);
      assert.equal(isSafeSameSitePath('/packages/munnar?season=monsoon', 'destination').ok, true);
    });

    test('rejects external URLs and open redirect vectors', () => {
      const openRedirects = [
        'https://evil.com',
        'http://phishing.example.com',
        '//attacker.com',
        '//attacker.com/path',
        '/\\attacker.com',
        '\\\\attacker.com',
        '\\attacker.com',
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        '/@evil.com',
      ];
      for (const target of openRedirects) {
        const res = isSafeSameSitePath(target, 'destination');
        assert.equal(res.ok, false, `Expected ${target} to be rejected`);
        assert.equal(res.code, 'OPEN_REDIRECT', `Expected OPEN_REDIRECT for ${target}`);
      }
    });

    test('rejects malformed paths, backslashes, and control characters', () => {
      const malformed = [
        'not-starting-with-slash',
        '',
        '   ',
        '/path with space',
        '/path\r\nLocation: http://evil.com',
        '/path\0nullbyte',
        '/../secret',
        '/a/../b',
        '/test/.',
        '/path\\with\\backslash',
      ];
      for (const item of malformed) {
        const res = isSafeSameSitePath(item, 'source');
        assert.equal(res.ok, false, `Expected ${item} to be rejected`);
      }
    });

    test('rejects query and fragment in source paths, and fragment in destination paths', () => {
      assert.equal(isSafeSameSitePath('/old-tour.php?id=5', 'source').ok, false);
      assert.equal(isSafeSameSitePath('/old-tour.php#section', 'source').ok, false);
      assert.equal(isSafeSameSitePath('/new-package#section', 'destination').ok, false);
    });
  });

  describe('validateRequestedPath', () => {
    test('validates safe incoming paths', () => {
      const res = validateRequestedPath('/old-tour.php');
      assert.equal(res.ok, true);
      assert.equal(res.normalized, '/old-tour.php');
    });

    test('rejects malicious or malformed requested paths', () => {
      assert.equal(validateRequestedPath('//attacker.com').ok, false);
      assert.equal(validateRequestedPath('/\\evil.com').ok, false);
      assert.equal(validateRequestedPath('\\evil.com').ok, false);
      assert.equal(validateRequestedPath('/test\0byte').ok, false);
      assert.equal(validateRequestedPath(123).ok, false);
    });
  });

  describe('detectDuplicateJsonKeys', () => {
    test('detects duplicate keys in raw JSON string', () => {
      const json = '{\n  "/a": "/packages",\n  "/a": "/destinations"\n}';
      const dups = detectDuplicateJsonKeys(json);
      assert.deepEqual(dups, ['/a']);
    });

    test('handles valid non-duplicate JSON', () => {
      const json = '{\n  "/a": "/packages",\n  "/b": "/destinations"\n}';
      const dups = detectDuplicateJsonKeys(json);
      assert.deepEqual(dups, []);
    });
  });

  describe('validateRedirectMap', () => {
    test('validates a clean redirect map and returns usable map', () => {
      const input = {
        '/old-tours.html': '/packages',
        '/munnar-tea.php': '/packages/munnar',
        '/about-us': '/packages',
      };
      const result = validateRedirectMap(input);
      assert.equal(result.ok, true);
      assert.equal(result.count, 3);
      assert.equal(result.issues.length, 0);
      assert.equal(result.map.get('/old-tours.html'), '/packages');
      assert.equal(result.map.get('/munnar-tea.php'), '/packages/munnar');
    });

    test('rejects non-object structure', () => {
      assert.equal(validateRedirectMap(null).ok, false);
      assert.equal(validateRedirectMap('string').ok, false);
      assert.equal(validateRedirectMap([1, 2, 3]).ok, false);
    });

    test('rejects non-string values', () => {
      const result = validateRedirectMap({ '/old': 123 });
      assert.equal(result.ok, false);
      assert.equal(result.issues[0]?.code, 'INVALID_STRUCTURE');
    });

    test('rejects open redirects in destinations', () => {
      const result = validateRedirectMap({
        '/old-page': 'https://evil.com/phishing',
      });
      assert.equal(result.ok, false);
      assert.ok(result.issues.some((i) => i.code === 'OPEN_REDIRECT'));
    });

    test('rejects direct and trailing-slash self-loops', () => {
      const direct = validateRedirectMap({ '/packages/munnar': '/packages/munnar' });
      assert.equal(direct.ok, false);
      assert.ok(direct.issues.some((i) => i.code === 'SELF_LOOP'));

      const trailing = validateRedirectMap({ '/packages/munnar/': '/packages/munnar' });
      assert.equal(trailing.ok, false);
      assert.ok(trailing.issues.some((i) => i.code === 'SELF_LOOP'));
    });

    test('rejects redirect chains and multi-hop cycles', () => {
      const chain = validateRedirectMap({
        '/old-a': '/old-b',
        '/old-b': '/packages/canonical',
      });
      assert.equal(chain.ok, false);
      assert.ok(chain.issues.some((i) => i.code === 'CHAIN'));

      const cycle = validateRedirectMap({
        '/old-a': '/old-b',
        '/old-b': '/old-a',
      });
      assert.equal(cycle.ok, false);
      assert.ok(cycle.issues.some((i) => i.code === 'CHAIN'));
    });

    test('rejects duplicate source paths and case-insensitive collisions', () => {
      const duplicateNormalized = validateRedirectMap({
        '/munnar': '/packages/munnar',
        '/munnar/': '/packages/munnar',
      });
      assert.equal(duplicateNormalized.ok, false);
      assert.ok(duplicateNormalized.issues.some((i) => i.code === 'DUPLICATE_PATH'));

      const caseCollision = validateRedirectMap({
        '/Old-Tour': '/packages/munnar',
        '/old-tour': '/packages/munnar-2',
      });
      assert.equal(caseCollision.ok, false);
      assert.ok(caseCollision.issues.some((i) => i.code === 'DUPLICATE_PATH'));
    });
  });

  describe('validateRedirectsJson', () => {
    test('reports duplicate keys in raw JSON', () => {
      const raw = '{"/kerala": "/packages", "/kerala": "/destinations"}';
      const result = validateRedirectsJson(raw);
      assert.equal(result.ok, false);
      assert.ok(result.issues.some((i) => i.code === 'DUPLICATE_PATH'));
    });

    test('reports invalid JSON syntax', () => {
      const result = validateRedirectsJson('{ invalid json }');
      assert.equal(result.ok, false);
      assert.equal(result.issues[0]?.code, 'INVALID_STRUCTURE');
    });
  });

  describe('resolveRedirect & createRedirectResolver', () => {
    const validMap = validateRedirectMap({
      '/old-kerala-tour.php': '/packages/kerala-monsoon',
      '/alleppey-houseboat': '/packages/houseboat-escape',
      '/destinations/old-cochin': '/destinations/fort-kochi',
    }).map;

    test('resolves exact match', () => {
      assert.equal(resolveRedirect(validMap, '/old-kerala-tour.php'), '/packages/kerala-monsoon');
      assert.equal(resolveRedirect(validMap, '/alleppey-houseboat'), '/packages/houseboat-escape');
    });

    test('resolves trailing slash variations', () => {
      assert.equal(resolveRedirect(validMap, '/alleppey-houseboat/'), '/packages/houseboat-escape');
    });

    test('resolves case-insensitive variations', () => {
      assert.equal(resolveRedirect(validMap, '/Old-Kerala-Tour.php'), '/packages/kerala-monsoon');
      assert.equal(resolveRedirect(validMap, '/ALLEPPEY-HOUSEBOAT'), '/packages/houseboat-escape');
    });

    test('returns null for unmapped paths', () => {
      assert.equal(resolveRedirect(validMap, '/unknown-path'), null);
      assert.equal(resolveRedirect(validMap, '/packages'), null);
    });

    test('safely rejects malicious or malformed inputs without crashing', () => {
      assert.equal(resolveRedirect(validMap, '//evil.com'), null);
      assert.equal(resolveRedirect(validMap, '/\\evil.com'), null);
      assert.equal(resolveRedirect(validMap, '\\evil.com'), null);
      assert.equal(resolveRedirect(validMap, '/path\0byte'), null);
    });

    test('createRedirectResolver returns working pure function', () => {
      const lookup = createRedirectResolver(validMap);
      assert.equal(lookup('/old-kerala-tour.php'), '/packages/kerala-monsoon');
      assert.equal(lookup('/unknown'), null);
    });
  });

  describe('docs/legacy-redirects.example.json validation', () => {
    test('example JSON file exists and passes all validation checks', async () => {
      const examplePath = resolve(process.cwd(), 'docs/legacy-redirects.example.json');
      const result = await loadRedirectsFile(examplePath);
      assert.equal(result.ok, true, `Validation failed: ${JSON.stringify(result.issues)}`);
      assert.ok(result.count > 0, 'Expected at least one redirect in example file');
      assert.equal(result.issues.length, 0);

      // Verify sample lookup from the loaded file
      const target = resolveRedirect(result.map, '/old-site/kerala-tour-packages.html');
      assert.equal(target, '/packages');
    });
  });
});
