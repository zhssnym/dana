// Reports a lost pooled database connection: one log line and one Sentry message per connection.
// The caller usually sees the rollback's "Connection terminated" error; this line carries the real code.
import type { ConnectionLostEvent } from '../../../db/client.js'
import type { SecurityLogger } from '../security/log.js'
import type { ErrorTracker } from './error-tracker.js'

export const DATABASE_CONNECTION_LOST_EVENT = 'database_connection_lost'

/** One constant so the log line and the Sentry message match. */
export const DATABASE_CONNECTION_LOST_MESSAGE =
  'A database connection was lost and discarded from the pool. One of these is ' +
  'a transient the pool absorbs; a rate of them is the network or the database ' +
  'dropping connections, and the requests in flight on each one failed.'

/** The driver's code, or `unknown`, so Sentry tags stay a closed key space (11.12). */
export function connectionLostCode(code: string | undefined): string {
  return code !== undefined && /^[A-Za-z0-9_]{1,32}$/.test(code) ? code : 'unknown'
}

export interface ConnectionLostReport {
  event: ConnectionLostEvent
  log: SecurityLogger
  tracker: ErrorTracker
}

/** Warn, not error: the pool recovers by itself and the request already failed on its own path. */
export function reportConnectionLost(report: ConnectionLostReport): void {
  const code = connectionLostCode(report.event.code)
  report.log.operation('warn', DATABASE_CONNECTION_LOST_EVENT, {
    reason: code,
    // The logger's whitelist filters this again (10.5).
    note: report.event.message,
  })
  report.tracker.captureMessage(`${DATABASE_CONNECTION_LOST_MESSAGE} Code: ${code}.`, {
    level: 'warning',
    tags: { event: DATABASE_CONNECTION_LOST_EVENT, code },
    // Grouped by code, so many resets are one Sentry issue.
    fingerprint: [DATABASE_CONNECTION_LOST_EVENT, code],
  })
}
