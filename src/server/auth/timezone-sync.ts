/*
8.1's zone sync. sameZone applies the alias rule ("US/Eastern" is
"America/New_York"). writeTimezone is the one function both doors (login sync
and PATCH /me) call, so neither can skip the reminder recompute (AC-086).
*/
import { sql } from 'drizzle-orm'

import { logAuthEvent } from '../security/log.js'
import { recomputeReminders } from '../time/index.js'
import type { Executor, RecomputeOutcome } from '../time/index.js'

/** The canonical tzdb name via Intl (which also folds case), or null for no zone. */
export function canonicalZone(value: string): string | null {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions()
      .timeZone
  } catch {
    return null
  }
}

export function sameZone(a: string, b: string): boolean {
  const left = canonicalZone(a)
  const right = canonicalZone(b)
  return left !== null && left === right
}

/**
 * Writes users.timezone, then recomputes reminders, in the caller's
 * transaction. The order matters: recomputeReminders reads the zone from the
 * row, so calling it before the UPDATE silently recomputes in the old zone.
 * Which rows move (scheduled only, AC-154) is the engine's rule, not this one's.
 */
export async function writeTimezone(
  tx: Executor,
  userId: string,
  timezone: string,
): Promise<RecomputeOutcome> {
  await tx.execute(
    sql`UPDATE users SET timezone = ${timezone} WHERE id = ${userId}`,
  )
  const outcome = await recomputeReminders(tx, {
    kind: 'assignee_timezone',
    userId,
  })

  if (outcome.unresolved.length > 0) {
    /*
    Logged, never thrown: one bad reminder row must not block sign-in. Only the
    count and user id are logged, never the engine's free-form reason (10.5).
    */
    logAuthEvent('timezone_reminders_unresolved', {
      userId,
      count: outcome.unresolved.length,
    })
  }
  return outcome
}
