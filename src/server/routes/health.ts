import { readFileSync } from 'node:fs'
import path from 'node:path'

import { Router } from 'express'

import { secondsSinceLastPass } from '../observability/scheduler-pass.js'

// npm scripts always run from the repository root, so package.json is found from cwd in both
// the tsx and the compiled layout.
const pkg = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'),
) as { version: string }

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
    version: pkg.version,
    commit: process.env.RENDER_GIT_COMMIT ?? null,
    secondsSinceLastPass: secondsSinceLastPass(),
    database: reportedDatabaseKind(),
  })
})
