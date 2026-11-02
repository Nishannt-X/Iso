import { loadConfig } from '../src/config.js';
import { all } from '../src/db/db.js';
import { resetDatabase } from '../src/db/seed.js';

const { dbPath, demoStaffPassword } = loadConfig();
const db = resetDatabase(dbPath, { staffPassword: demoStaffPassword });
const rows = all<{ code: string; status: string }>(
  db,
  `SELECT p.code, COALESCE(v.status, 'none') AS status FROM packages p
   LEFT JOIN package_versions v ON v.package_id = p.id AND v.status IN ('published', 'draft') ORDER BY p.code`,
);
console.log(`Database reset at ${dbPath}`);
for (const r of rows) console.log(`  ${r.code}  ${r.status}`);
db.close();
