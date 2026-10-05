import { Router } from 'express'

import { secondsSinceLastPass } from '../observability/scheduler-pass.js'

let databaseKind: 'postgres' | 'pglite' | null = null

/*
The database engine the boot chose, so production on embedded PGlite is visible
from outside. Null means never declared (apps built without a client).
*/
export function recordDatabaseKind(kind: 'postgres' | 'pglite'): void {
  databaseKind = kind
}

export function reportedDatabaseKind(): 'postgres' | 'pglite' | null {
  return databaseKind
}

/** Exempt from the canonical-host redirect: Render probes its own hostname. */
export const HEALTH_PATH = '/api/health'

export const healthRouter: Router = Router()

healthRouter.get('/', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    // The deployed commit identifies the release: each merge to main deploys.
    commit: process.env.RENDER_GIT_COMMIT ?? null,
    secondsSinceLastPass: secondsSinceLastPass(),
    database: reportedDatabaseKind(),
  })
})
