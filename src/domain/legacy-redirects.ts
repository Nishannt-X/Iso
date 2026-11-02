// Legacy redirect mapping module and validation utility.
// Enforces same-site integrity, prevents open redirects, self-loops, chains/cycles,
// duplicate or malformed paths, and provides a pure lookup function for middleware.

import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';

export type RedirectIssueCode =
  | 'INVALID_STRUCTURE'
  | 'MALFORMED_PATH'
  | 'OPEN_REDIRECT'
  | 'SELF_LOOP'
  | 'CHAIN'
  | 'DUPLICATE_PATH';

export interface RedirectIssue {
  readonly code: RedirectIssueCode;
  readonly field: 'source' | 'destination' | 'structure';
  readonly path: string;
  readonly message: string;
}

export interface ValidationSuccess {
  readonly ok: true;
  readonly count: number;
  readonly issues: readonly [];
  readonly map: Map<string, string>;
}

export interface ValidationFailure {
  readonly ok: false;
  readonly count: number;
  readonly issues: readonly RedirectIssue[];
  readonly map: Map<string, string>;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

/**
 * Normalizes a path for consistent routing and duplicate detection:
 * - Trims whitespace
 * - Ensures leading '/'
 * - Strips redundant trailing slashes (except root '/')
 */
export function normalizePath(rawPath: string): string {
  if (!rawPath || rawPath === '/') {
    return '/';
  }
  let path = rawPath.trim();
  if (!path.startsWith('/')) {
    path = `/${path}`;
  }
  while (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  return path;
}

/**
 * Extracts the pathname component of a URL or path, ignoring query strings and fragments.
 */
function extractPathname(urlOrPath: string): string {
  try {
    const parsed = new URL(urlOrPath, 'http://localhost');
    return parsed.pathname;
  } catch {
    const queryIdx = urlOrPath.indexOf('?');
    const hashIdx = urlOrPath.indexOf('#');
    let endIdx = urlOrPath.length;
    if (queryIdx !== -1) endIdx = Math.min(endIdx, queryIdx);
    if (hashIdx !== -1) endIdx = Math.min(endIdx, hashIdx);
    return urlOrPath.slice(0, endIdx);
  }
}

const hasControlChars = (s: string): boolean => [...s].some((ch) => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f);

/**
 * Validates whether a given string is a safe same-site path.
 * Rejects external URLs, protocol-relative paths, backslashes, schemes,
 * control characters, and path traversal.
 */
export function isSafeSameSitePath(
  raw: unknown,
  role: 'source' | 'destination' = 'source',
): { ok: true } | { ok: false; code: 'MALFORMED_PATH' | 'OPEN_REDIRECT'; reason: string } {
  if (typeof raw !== 'string') {
    return { ok: false, code: 'MALFORMED_PATH', reason: 'Path must be a string' };
  }
  const path = raw.trim();
  if (path.length === 0) {
    return { ok: false, code: 'MALFORMED_PATH', reason: 'Path cannot be empty' };
  }

  // Reject URI scheme prefixes (e.g. http:, https:, javascript:, data:) -> open redirect / XSS
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path)) {
    return { ok: false, code: 'OPEN_REDIRECT', reason: 'Absolute URL schemes are forbidden; only same-site paths are allowed' };
  }

  // Reject protocol-relative and backslash injection (open redirect vectors)
  if (path.startsWith('//') || path.startsWith('/\\') || path.startsWith('\\')) {
    return { ok: false, code: 'OPEN_REDIRECT', reason: "Protocol-relative URLs starting with '//' or backslashes are forbidden" };
  }
  if (path.includes('\\')) {
    return { ok: false, code: 'OPEN_REDIRECT', reason: 'Backslashes are not permitted in same-site paths' };
  }

  // Must begin with a single '/'
  if (!path.startsWith('/')) {
    return { ok: false, code: 'MALFORMED_PATH', reason: "Path must begin with a leading '/'" };
  }

  // Reject control characters and null bytes (CRLF header injection / byte smuggling)
  if (hasControlChars(path)) {
    return { ok: false, code: 'MALFORMED_PATH', reason: 'Path contains ASCII control characters or null bytes' };
  }

  // Reject unencoded whitespace
  if (/\s/.test(path)) {
    return { ok: false, code: 'MALFORMED_PATH', reason: 'Path contains unencoded whitespace' };
  }

  // Disallow /@ which can trigger credential/host parsing ambiguities
  if (path.startsWith('/@')) {
    return { ok: false, code: 'OPEN_REDIRECT', reason: "Paths starting with '/@' are forbidden" };
  }

  // Path traversal segments like /../ or ending with /.. or /.
  if (/(?:^|\/)\.\.(?:\/|$)/.test(path) || /(?:^|\/)\.(?:\/|$)/.test(path)) {
    return { ok: false, code: 'MALFORMED_PATH', reason: "Path traversal segments ('.' or '..') are forbidden" };
  }

  // Source paths are matched against request pathname; query string and fragments are disallowed
  if (role === 'source' && (path.includes('?') || path.includes('#'))) {
    return { ok: false, code: 'MALFORMED_PATH', reason: "Source paths must be pathnames only and cannot contain '?' or '#'" };
  }

  // Destination paths in HTTP 301 redirects should not contain fragment identifiers
  if (role === 'destination' && path.includes('#')) {
    return { ok: false, code: 'MALFORMED_PATH', reason: "Destination paths cannot contain fragment identifiers ('#')" };
  }

  // URL parsing validation against a dummy base
  try {
    const DUMMY_BASE = 'http://localhost';
    const parsed = new URL(path, DUMMY_BASE);
    if (parsed.origin !== DUMMY_BASE || parsed.hostname !== 'localhost' || parsed.username || parsed.password || parsed.port) {
      return { ok: false, code: 'OPEN_REDIRECT', reason: 'Path resolves to an external origin or credentials' };
    }
  } catch {
    return { ok: false, code: 'MALFORMED_PATH', reason: 'Path is not a valid URI' };
  }

  return { ok: true };
}

/**
 * Validates an incoming HTTP request path before lookup.
 * Rejects control characters, null bytes, backslashes, and open-redirect prefixes.
 */
export function validateRequestedPath(path: unknown): { ok: boolean; normalized?: string; reason?: string } {
  if (typeof path !== 'string') {
    return { ok: false, reason: 'Requested path must be a string' };
  }
  const trimmed = path.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\') || trimmed.includes('\\')) {
    return { ok: false, reason: 'Invalid or dangerous requested path format' };
  }
  if (hasControlChars(trimmed)) {
    return { ok: false, reason: 'Requested path contains control characters or null bytes' };
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return { ok: false, reason: 'Requested path contains scheme' };
  }
  return { ok: true, normalized: normalizePath(trimmed) };
}

/**
 * Detects duplicate top-level keys in raw JSON text.
 * ponytail: JSON duplicate key check uses a lightweight regex scanner over raw JSON text instead of an
 * external AST parser, sufficient for flat key-value redirect maps without introducing npm dependencies.
 */
export function detectDuplicateJsonKeys(jsonText: string): string[] {
  const duplicates: string[] = [];
  const seen = new Set<string>();
  const keyPattern = /"((?:[^"\\]|\\.)*)"\s*:/g;
  let match: RegExpExecArray | null;

  while ((match = keyPattern.exec(jsonText)) !== null) {
    try {
      const key = JSON.parse(`"${match[1]}"`) as string;
      if (seen.has(key)) {
        duplicates.push(key);
      } else {
        seen.add(key);
      }
    } catch {
      // If unescaping fails, continue regex execution
    }
  }

  return duplicates;
}

/**
 * Validates a parsed redirect map object or Map against all safety and consistency rules:
 * - Structure (must be object of string -> string)
 * - Same-site destination (no open redirects)
 * - No self-loops (source !== destination)
 * - No redirect chains or cycles (destination pathname cannot be another source)
 * - No duplicate source paths (including after slash and case normalization)
 * - No malformed paths
 */
export function validateRedirectMap(input: unknown): ValidationResult {
  const issues: RedirectIssue[] = [];
  const map = new Map<string, string>();

  // ponytail: redirect map is stored as an in-memory Map<string, string>; well-suited for the client's ~140
  // legacy URLs and up to tens of thousands of routes without requiring database queries or external caches.
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return {
      ok: false,
      count: 0,
      issues: [
        {
          code: 'INVALID_STRUCTURE',
          field: 'structure',
          path: '',
          message: 'Redirect map must be a JSON object mapping old paths to new paths',
        },
      ],
      map,
    };
  }

  const entries: [string, unknown][] =
    input instanceof Map
      ? Array.from(input.entries())
      : Object.entries(input as Record<string, unknown>);

  const validEntries: [string, string][] = [];
  const seenNormalizedSources = new Set<string>();
  const seenLowerSources = new Map<string, string>();

  for (const [rawSource, rawDest] of entries) {
    if (typeof rawDest !== 'string') {
      issues.push({
        code: 'INVALID_STRUCTURE',
        field: 'destination',
        path: String(rawSource),
        message: `Destination for '${rawSource}' must be a string, received ${typeof rawDest}`,
      });
      continue;
    }

    const sourceCheck = isSafeSameSitePath(rawSource, 'source');
    if (!sourceCheck.ok) {
      issues.push({
        code: sourceCheck.code,
        field: 'source',
        path: String(rawSource),
        message: `Invalid source path '${rawSource}': ${sourceCheck.reason}`,
      });
    }

    const destCheck = isSafeSameSitePath(rawDest, 'destination');
    if (!destCheck.ok) {
      issues.push({
        code: destCheck.code,
        field: 'destination',
        path: String(rawSource),
        message: `Invalid destination path '${rawDest}': ${destCheck.reason}`,
      });
    }

    if (sourceCheck.ok && destCheck.ok) {
      const normalizedSource = normalizePath(rawSource);
      const lowerSource = normalizedSource.toLowerCase();

      // Check duplicate exact normalized path
      if (seenNormalizedSources.has(normalizedSource)) {
        issues.push({
          code: 'DUPLICATE_PATH',
          field: 'source',
          path: rawSource,
          message: `Duplicate source path: '${rawSource}' normalizes to '${normalizedSource}', which was already defined`,
        });
      } else {
        seenNormalizedSources.add(normalizedSource);
      }

      // Check case-insensitive collision
      const existingCase = seenLowerSources.get(lowerSource);
      if (existingCase && existingCase !== rawSource) {
        issues.push({
          code: 'DUPLICATE_PATH',
          field: 'source',
          path: rawSource,
          message: `Duplicate source path (case-insensitive collision): '${rawSource}' collides with '${existingCase}'`,
        });
      } else {
        seenLowerSources.set(lowerSource, rawSource);
      }

      // Check self-loop (direct or trailing slash variant)
      const destPathname = extractPathname(rawDest);
      if (normalizedSource === normalizePath(destPathname)) {
        issues.push({
          code: 'SELF_LOOP',
          field: 'destination',
          path: rawSource,
          message: `Redirect from '${rawSource}' to '${rawDest}' is a self-loop (destination resolves to source path)`,
        });
      }

      validEntries.push([rawSource, rawDest]);
    }
  }

  // Check redirect chains and cycles:
  // ponytail: chain prevention prohibits any destination path from appearing as a source path in the map.
  // This enforces direct 1-hop redirects in O(N) validation time, eliminating all multi-hop chains and cycles.
  const sourceNormalizedPaths = new Set(validEntries.map(([s]) => normalizePath(s)));

  for (const [source, dest] of validEntries) {
    const destPathname = normalizePath(extractPathname(dest));
    if (sourceNormalizedPaths.has(destPathname) && destPathname !== normalizePath(source)) {
      issues.push({
        code: 'CHAIN',
        field: 'destination',
        path: source,
        message: `Destination '${dest}' for source '${source}' is also defined as a redirect source (chains and cycles are forbidden)`,
      });
    }
  }

  if (issues.length === 0) {
    for (const [source, dest] of validEntries) {
      const normalized = normalizePath(source);
      map.set(normalized, dest);
      if (source !== normalized) {
        map.set(source, dest);
      }
      const lower = normalized.toLowerCase();
      if (!map.has(lower)) {
        map.set(lower, dest);
      }
    }
    return {
      ok: true,
      count: validEntries.length,
      issues: [],
      map,
    };
  }

  return {
    ok: false,
    count: 0,
    issues,
    map: new Map(),
  };
}

/**
 * Parses raw JSON text, checks for duplicate JSON keys, and validates the redirect map.
 */
export function validateRedirectsJson(jsonText: string): ValidationResult {
  const duplicateKeys = detectDuplicateJsonKeys(jsonText);
  const initialIssues: RedirectIssue[] = duplicateKeys.map((k) => ({
    code: 'DUPLICATE_PATH',
    field: 'source',
    path: k,
    message: `Duplicate key in JSON text: '${k}'`,
  }));

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    return {
      ok: false,
      count: 0,
      issues: [
        ...initialIssues,
        {
          code: 'INVALID_STRUCTURE',
          field: 'structure',
          path: '',
          message: `Invalid JSON syntax: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      map: new Map(),
    };
  }

  const result = validateRedirectMap(parsed);
  if (initialIssues.length > 0) {
    return {
      ok: false,
      count: 0,
      issues: [...initialIssues, ...result.issues],
      map: new Map(),
    };
  }

  return result;
}

/**
 * Loads and validates a JSON redirects file asynchronously.
 */
export async function loadRedirectsFile(filePath: string): Promise<ValidationResult> {
  const content = await readFile(filePath, 'utf8');
  return validateRedirectsJson(content);
}

/**
 * Loads and validates a JSON redirects file synchronously (useful at server startup).
 */
export function loadRedirectsFileSync(filePath: string): ValidationResult {
  const content = readFileSync(filePath, 'utf8');
  return validateRedirectsJson(content);
}

/**
 * Pure function callable by app middleware to resolve legacy path redirects.
 * Validates the requested path against injection attacks, normalizes trailing slashes,
 * performs O(1) map lookup with lowercase fallback, and verifies same-site destination.
 * Returns the destination string or null if no redirect matches.
 */
export function resolveRedirect(
  redirects: Map<string, string> | Record<string, string>,
  requestedPath: string,
): string | null {
  const validation = validateRequestedPath(requestedPath);
  if (!validation.ok || !validation.normalized) {
    return null;
  }

  const trimmed = requestedPath.trim();
  const normalized = validation.normalized;

  let target: string | undefined;

  if (redirects instanceof Map) {
    target =
      redirects.get(trimmed) ??
      redirects.get(normalized) ??
      redirects.get(normalized.toLowerCase());
  } else if (typeof redirects === 'object' && redirects !== null) {
    target =
      (redirects as Record<string, string>)[trimmed] ??
      (redirects as Record<string, string>)[normalized] ??
      (redirects as Record<string, string>)[normalized.toLowerCase()];
  }

  if (!target) {
    return null;
  }

  // Defensive check: ensure destination remains a safe same-site path
  const targetCheck = isSafeSameSitePath(target, 'destination');
  if (!targetCheck.ok) {
    return null;
  }

  return target;
}

/**
 * Higher-order helper returning a pure resolver function bound to a redirect map.
 */
export function createRedirectResolver(
  redirects: Map<string, string> | Record<string, string>,
): (requestedPath: string) => string | null {
  return (requestedPath: string) => resolveRedirect(redirects, requestedPath);
}
