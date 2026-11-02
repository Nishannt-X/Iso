#!/usr/bin/env tsx
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateRedirectsJson } from '../src/domain/legacy-redirects.js';

// CLI checker to validate legacy redirect JSON files against security, cycle, and structural rules.
// Usage: tsx scripts/check-redirects.ts [path-to-redirects.json]
// Default: docs/legacy-redirects.example.json

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    console.log('Usage: tsx scripts/check-redirects.ts [path-to-redirects.json]');
    console.log('\nValidates legacy URL redirect mapping for:');
    console.log('  - External URLs / open redirects (//, https://, javascript:)');
    console.log('  - Direct self-loops (A -> A)');
    console.log('  - Redirect chains (A -> B -> C) and cycles');
    console.log('  - Duplicate or malformed paths');
    console.log('  - Duplicate keys in raw JSON text');
    process.exit(0);
  }

  const targetFile = args[0]
    ? resolve(process.cwd(), args[0])
    : resolve(process.cwd(), 'docs/legacy-redirects.example.json');

  if (!existsSync(targetFile)) {
    console.error(`Error: File not found at ${targetFile}`);
    process.exit(1);
  }

  let content: string;
  try {
    content = readFileSync(targetFile, 'utf8');
  } catch (err) {
    console.error(`Error reading ${targetFile}:`, err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  console.log(`Checking legacy redirects in: ${targetFile}`);
  const result = validateRedirectsJson(content);

  if (!result.ok) {
    console.error(`\nValidation FAILED: ${result.issues.length} issue(s) detected:\n`);
    for (const issue of result.issues) {
      const loc = issue.path ? ` [${issue.path}]` : '';
      console.error(`  - [${issue.code}]${loc} (${issue.field}): ${issue.message}`);
    }
    process.exit(1);
  }

  console.log(`\n✓ Validation SUCCESSFUL: ${result.count} redirect(s) verified.`);
  console.log('  - 0 external / open redirect destinations');
  console.log('  - 0 self-loops');
  console.log('  - 0 redirect chains or cycles');
  console.log('  - 0 malformed or duplicate paths');
}

main();
