/*
What a production boot does when the database seam has fallen back to the
embedded engine (issue #80).

`db/client.ts` chooses PGlite in `./.data` when no connection string is
supplied. That default is exactly right for the suite — it is the seam that
makes every test run with no Docker and no setup — and exactly wrong for a
production boot, where an unset or empty `DATABASE_URL` is a silent downgrade
to a database that lives inside the container. On Render's free web service the
filesystem does not survive a spin-down (#15 records the process suspending
when idle as measured), so on that fallback **every spin-down destroys every
row**: sessions, tasks, folders. What a person reports is "I have to sign in
again" (#6), which is the mildest thing it could possibly look like.

**This does not refuse the boot, and that was ruled rather than overlooked.**
`assertSignInIsPossible` is the precedent and its comment describes this hazard
almost word for word, but a hard refusal could take production down and force a
database purchase that has not happened. Breaking the site to prevent a
data-loss bug the site may not have is the wrong trade to make unilaterally.
Once #15's purchase lands and `DATABASE_URL` is guaranteed, the refusal becomes
the right thing, because the only way to reach it will be a misconfiguration.

**The defect being closed here is the invisibility**, not the fallback. The
boot already logged `{"event":"migrations_applied","database":"pglite"}`, which
is how #6 was diagnosable at all — but it reads as neutral information, nobody
was looking for it, and there is nothing for alerting to key on. So the
condition gets three things: an error-level line of its own with its own event
name and a sentence a person can act on, an alertable report through the same
observability module every 5xx goes through, and a field on `GET /api/health`
so it can be read from outside without reaching for Render's logs at all.
*/
import type { SecurityLogger } from '../security/log.js'
import type { ErrorTracker } from './error-tracker.js'

export const DATABASE_FALLBACK_EVENT = 'database_fallback_pglite'

/**
 * The sentence, written here as a constant so that the log line and the Sentry
 * message are the same words rather than two paraphrases that drift. It is
 * source text and carries nothing from a request or a row (10.5), which is the
 * condition `note` on the operation log is admitted under.
 */
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

/**
 * Reports the condition when it holds, and answers whether it did.
 *
 * A function rather than four lines in `main()` because `main()` binds a port,
 * migrates a database and starts the scheduler, so nothing in it can be
 * asserted without booting the process. This is the whole of the decision and
 * it is unit-tested beside this file.
 *
 * Production only. In development and under test the fallback is the intended
 * configuration, and a boot that shouted about it would train everyone to
 * ignore the one line that matters.
 */
export function reportDatabaseFallback(report: DatabaseFallbackReport): boolean {
  if (report.nodeEnv !== 'production' || report.kind !== 'pglite') return false
  report.log.operation('error', DATABASE_FALLBACK_EVENT, {
    database: report.kind,
    note: DATABASE_FALLBACK_MESSAGE,
  })
  report.tracker.captureMessage(DATABASE_FALLBACK_MESSAGE, {
    event: DATABASE_FALLBACK_EVENT,
  })
  return true
}
