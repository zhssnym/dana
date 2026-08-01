/*
Applies pending migrations and exits. Run from app/ with: npx tsx db/migrate.ts
Targets DATABASE_URL when set, else TEST_DATABASE_URL through the seam's
fallback, else the local PGlite directory .data/.

The journal at migrations/meta/_journal.json orders entries by its "when"
value, and the drizzle migrator treats a file as pending exactly when its
"when" is greater than the last applied one. A new migration therefore needs
a "when" strictly greater than every existing entry, and entries are never
reordered or edited after they land. Spec 11.5 records one transaction per
run, corrected at the P0 merge from an earlier per-file wording: all pending
files commit or roll back together (verified in the installed migrator;
section 13 item 16).
*/
import { createDbClient } from './client.js'

const client = await createDbClient({
  url: process.env.DATABASE_URL === '' ? undefined : process.env.DATABASE_URL,
  dataDir: '.data',
})
await client.runMigrations()
process.stdout.write(`migrations applied (${client.kind})\n`)
await client.close()
