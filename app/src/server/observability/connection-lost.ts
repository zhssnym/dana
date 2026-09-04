/*
What a production boot does when the database seam loses a pooled connection
(issue #174).

**Why this exists at all.** The first fix for #174 stopped a reset connection
ending the process: node-postgres emits a dead socket's error on the client and
re-emits an idle one's on the pool, and an EventEmitter 'error' with no listener
throws, so one RST used to take a whole Vitest file, and in production would have
taken the single instance. The listeners that fixed it wrote a line to stderr,
and that traded a loud failure for a silent one. Production has a structured
logger and an error tracker, `GET /api/health` reports the engine, and none of
them would have said a word while a pool lost a connection a minute.

**The half that makes the silence expensive** is that the error a caller sees is
not this one. A socket that dies inside a transaction rejects the statement, and
drizzle then runs its ROLLBACK on the same dead connection, so what surfaces to
the route — and therefore to the request error line and to Sentry — is the
rollback's `Connection terminated unexpectedly` rather than the `ECONNRESET`
underneath it. This line is where the real code lives.

**One line and one message per lost connection**, not one per query that fails
because of it: the seam reports from the client's own 'error' event, which fires
once for the connection, and its pool listener is silent for exactly that reason.

The shape follows `database-fallback.ts`, which is the precedent for a boot
condition worth alerting on: an event name shared by the log line and the Sentry
tag, a sentence written in the source rather than assembled, and the decision in
a function so that `main()` holds wiring and no judgement.

Spec 10.5 (the enumeration this line was added to), 11.12 (the tracker and the
fingerprint), issue #174.
*/
import type { ConnectionLostEvent } from '../../../db/client.js'
import type { SecurityLogger } from '../security/log.js'
import type { ErrorTracker } from './error-tracker.js'

export const DATABASE_CONNECTION_LOST_EVENT = 'database_connection_lost'

/**
 * The sentence, a source constant so the log line and the Sentry message are
 * the same words rather than two paraphrases that drift (10.5).
 */
export const DATABASE_CONNECTION_LOST_MESSAGE =
  'A database connection was lost and discarded from the pool. One of these is ' +
  'a transient the pool absorbs; a rate of them is the network or the database ' +
  'dropping connections, and the requests in flight on each one failed.'

/**
 * The driver's code, or `unknown`, and never anything else.
 *
 * A tag and a fingerprint are a key space, and 11.12 requires the caller to
 * keep it closed: `ECONNRESET`, `ETIMEDOUT`, `57P01` and the like are the whole
 * of what a connection-level failure carries, so anything not shaped like one
 * groups under `unknown` rather than opening a new Sentry issue per value.
 */
export function connectionLostCode(code: string | undefined): string {
  return code !== undefined && /^[A-Za-z0-9_]{1,32}$/.test(code) ? code : 'unknown'
}

export interface ConnectionLostReport {
  event: ConnectionLostEvent
  log: SecurityLogger
  tracker: ErrorTracker
}

/**
 * Writes the 10.5 line and sends the 11.12 message. Warn rather than error:
 * the pool recovers by itself and the request that was on that connection has
 * already failed on its own path, so this is the fact somebody needs when a
 * pattern appears, not a page at three in the morning.
 */
export function reportConnectionLost(report: ConnectionLostReport): void {
  const code = connectionLostCode(report.event.code)
  report.log.operation('warn', DATABASE_CONNECTION_LOST_EVENT, {
    reason: code,
    // The connection's own message. The logger's whitelist runs over it again
    // and writes `other` for anything that is not plain words (10.5).
    note: report.event.message,
  })
  report.tracker.captureMessage(`${DATABASE_CONNECTION_LOST_MESSAGE} Code: ${code}.`, {
    level: 'warning',
    tags: { event: DATABASE_CONNECTION_LOST_EVENT, code },
    // Grouped by code, so a hundred resets are one issue with a count rather
    // than a hundred issues over the free tier's quota (11.12).
    fingerprint: [DATABASE_CONNECTION_LOST_EVENT, code],
  })
}
