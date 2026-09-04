import { readFileSync } from 'node:fs'
import path from 'node:path'

import { Router } from 'express'

// The npm scripts (dev, start) always launch from app/, so the package
// manifest is reachable from the working directory in both the tsx and the
// compiled dist layout, which place this module at different depths.
const pkg = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'),
) as { version: string }

let lastPassAt: number | null = null
let databaseKind: 'postgres' | 'pglite' | null = null

// Called by the reminder scheduler (P7) after each completed pass; health
// reports the age so tick liveness is observable separately from process
// liveness (spec 11.12).
export function recordSchedulerPass(): void {
  lastPassAt = Date.now()
}

export function secondsSinceLastPass(): number | null {
  if (lastPassAt === null) return null
  return Math.round((Date.now() - lastPassAt) / 1000)
}

/*
Which engine the seam chose, reported here so that a production instance
running on the embedded database can be seen from outside without reaching for
Render's logs (issue #80). The boot calls this after `createDbClient`, exactly
as the scheduler calls `recordSchedulerPass` after a pass: health reports what
the process has told it rather than holding a database handle of its own.

Null means nothing has declared one, which is every app constructed without a
client — this file's own tests included. A production boot always declares, so
a null here in production would itself be the finding.
*/
export function recordDatabaseKind(kind: 'postgres' | 'pglite'): void {
  databaseKind = kind
}

export function reportedDatabaseKind(): 'postgres' | 'pglite' | null {
  return databaseKind
}

export const healthRouter: Router = Router()

healthRouter.get('/', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    version: pkg.version,
    commit: process.env.RENDER_GIT_COMMIT ?? null,
    secondsSinceLastPass: secondsSinceLastPass(),
    database: reportedDatabaseKind(),
  })
})
