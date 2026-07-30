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

export const healthRouter: Router = Router()

healthRouter.get('/', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    version: pkg.version,
    commit: process.env.RENDER_GIT_COMMIT ?? null,
    secondsSinceLastPass: secondsSinceLastPass(),
  })
})
