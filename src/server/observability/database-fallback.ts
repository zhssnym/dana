// Production boot fell back to embedded PGlite: on Render that loses every row at each spin-down.
// This reports the condition loudly but does not refuse the boot.
import type { SecurityLogger } from '../security/log.js'
import type { ErrorTracker } from './error-tracker.js'

export const DATABASE_FALLBACK_EVENT = 'database_fallback_pglite'

/** One constant so the log line and the Sentry message match. Source text only (10.5). */
export const DATABASE_FALLBACK_MESSAGE =
  'Production is running on the embedded PGlite database inside the container ' +
  'because DATABASE_URL is unset or empty. Every spin-down destroys every row: ' +
  'sessions, tasks, folders. Set DATABASE_URL to a managed Postgres and redeploy.'

export interface DatabaseFallbackReport {
  kind: 'pglite' | 'postgres'
  nodeEnv: string | undefined
  log: SecurityLogger
  tracker: ErrorTracker
}

/** Reports the fallback in production only, and answers whether it did. */
export function reportDatabaseFallback(report: DatabaseFallbackReport): boolean {
  if (report.nodeEnv !== 'production' || report.kind !== 'pglite') return false
  report.log.operation('error', DATABASE_FALLBACK_EVENT, {
    database: report.kind,
    note: DATABASE_FALLBACK_MESSAGE,
  })
  // Error, not the tracker's default warning: this database loses everything on restart.
  report.tracker.captureMessage(DATABASE_FALLBACK_MESSAGE, {
    level: 'error',
    tags: { event: DATABASE_FALLBACK_EVENT },
  })
  return true
}
