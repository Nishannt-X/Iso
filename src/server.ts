import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { isInitialised, openDb } from './db/db.js';

const config = loadConfig();
const db = openDb(config.dbPath);
if (!isInitialised(db)) {
  console.error(`Database at "${config.dbPath}" is empty. Run "npm run db:reset" first.`);
  process.exit(1);
}

const server = serve({ fetch: createApp(db, { siteUrl: config.siteUrl }).fetch, port: config.port }, (info) => {
  console.log(`Kochi Tours listening on http://localhost:${info.port} (db: ${config.dbPath})`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close();
    db.close();
    process.exit(0);
  });
}
