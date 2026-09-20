/*
Points one test file at the database its Vitest pool slot owns. Runs before
every file, in the worker, and is a few lines of string work on both legs.

**Why the env var and not an argument.** Every route to a database in this suite
ends at `createDbClient()` in `app/db/client.ts`, which reads TEST_DATABASE_URL
at call time. Rewriting the variable before the file under test is imported
therefore redirects the seam, the advisory lock connection in `helpers.ts`, and
anything else that reads it, without any of them knowing this file exists.
Verified against Vitest 4.1.10 on 2026-09-03: a setup file completes before the
test module is imported, and `VITEST_POOL_ID` is in the worker's environment by
then, which `guard-postgres-leg-isolation.test.ts` asserts every run by checking the
name of the database it was handed.

**This file opens no connection.** Creating and emptying the database is
`helpers.ts`'s first `createTestDb()`, so a file that never opens a database
never pays for one. The reasoning, and the 106 second measurement behind it, is
in `postgres-leg.ts`.

**On the PGlite leg this file does nothing.** `targetDatabaseUrl` answers
undefined when the global setup published no run, which is the case whenever
TEST_DATABASE_URL is unset or empty.

Spec 11.10.
*/
import { targetDatabaseUrl } from './postgres-leg.js'

const target = targetDatabaseUrl()
if (target !== undefined) process.env.TEST_DATABASE_URL = target
