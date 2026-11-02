import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { isInitialised, openDb, SCHEMA_VERSION, schemaVersion } from './db/db.js';
import { migrateSchema } from './db/migrate.js';
import { loadRedirectsFileSync } from './domain/legacy-redirects.js';
import { runDuePublications } from './domain/publication-schedule.js';

const config = loadConfig();
const db = openDb(config.dbPath);
if (!isInitialised(db)) {
  console.error(`Database at "${config.dbPath}" is empty. Run "npm run db:reset" first.`);
  process.exit(1);
}

if (schemaVersion(db) < SCHEMA_VERSION) migrateSchema(db);
if (schemaVersion(db) < SCHEMA_VERSION) {
  console.error(`Database at "${config.dbPath}" uses an older schema. Run "npm run db:reset" to rebuild it (this deletes its data).`);
  process.exit(1);
}

let redirects: Map<string, string> | undefined;
if (config.redirectsFile) {
  const result = loadRedirectsFileSync(config.redirectsFile);
  if (!result.ok) {
    console.error(`Redirect file "${config.redirectsFile}" is invalid:`);
    for (const issue of result.issues) console.error(`  [${issue.code}] ${issue.message}`);
    process.exit(1);
  }
  redirects = result.map;
  console.log(`Loaded ${result.count} legacy redirects from ${config.redirectsFile}`);
}

runDuePublications(db, new Date());
const publicationTimer = setInterval(() => runDuePublications(db, new Date()), 60_000);
publicationTimer.unref();

const server = serve({ fetch: createApp(db, { siteUrl: config.siteUrl, trustProxy: config.trustProxy, geminiApiKey: config.geminiApiKey, redirects }).fetch, port: config.port }, (info) => {
  console.log(`Kochi Tours listening on http://localhost:${info.port} (db: ${config.dbPath})`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    clearInterval(publicationTimer);
    server.close();
    db.close();
    process.exit(0);
  });
}
