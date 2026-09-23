/*
8.1's zone sync: the predicate that decides whether the column moves, and the
write that moves it.

The predicate is the alias rule, which needs one thing the shared validator
does not provide: whether two identifiers name the same zone. "US/Eastern" and
"America/New_York" are one zone, so a login reporting the alias of a stored
canonical name must not write over it, and a plain string comparison would.

The write is here for a reason worth stating. 8.1 gives users.timezone exactly
one consumer, reminder fire-instant computation, and 7.1 charges this
module with the consequence in its own words: a zone that moves recomputes
fire_at for the scheduled reminders on tasks assigned to that user, which is
8.6's fifth trigger and the only one outside the task endpoints. Two doors
reach it, the callback's login sync and PATCH /me (AC-086), and an
implementation wiring one and not the other leaves a traveler's reminders wrong
through the door it missed. One function both doors call is what makes that
half-wiring impossible rather than merely discouraged, and it is also the only
place the ordering below has to be got right.
*/
import { sql } from 'drizzle-orm'

import { logAuthEvent } from '../security/log.js'
import { recomputeReminders } from '../time/index.js'
import type { Executor, RecomputeOutcome } from '../time/index.js'

/**
 * The canonical tzdb name an identifier resolves to, or null when it names no
 * zone at all.
 *
 * Intl resolves an identifier to its canonical tzdb name, which is exactly the
 * question the alias rule asks, and it also folds the case-insensitivity 11.15
 * records. Anything that fails to resolve is not a zone and cannot be the same
 * zone as anything; the caller has already refused it through the shared
 * validator by the time it gets here.
 */
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
 * Writes users.timezone and fires 8.6's fifth trigger, in that order, inside
 * the caller's transaction.
 *
 * **The order is the whole contract.** recomputeReminders reads the current row
 * through a join on the assignee rather than taking a zone as a parameter, so a
 * call made before the UPDATE recomputes every instant in the zone this request
 * is replacing and records the answer as fresh. Taking a user id rather than a
 * zone is the engine's guard against exactly that, and the guard only works
 * from behind the write. Nothing about a wrong order fails loudly, which is why
 * both doors call this rather than each spelling out the pair.
 *
 * **The caller owns the transaction**, the shape every callable in
 * src/server/time takes. Here it carries a rule of its own: the column and the
 * instants derived from it commit together, so no fault between them can leave
 * an account in a new zone with every reminder still computed for the old one.
 *
 * **Only the rows 7.1 names move**, and this function does not arrange that.
 * The engine scopes the trigger to scheduled reminders on tasks assigned to
 * this user, and 8.6 leaves sent and skipped rows
 * alone (AC-154): a zone change alters neither the deadline nor the recipient,
 * so reviving a delivered row would send one person the same reminder twice.
 * That is enforced there rather than here, and a caller adding a state filter
 * of its own would be restating a rule it does not own.
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
    Reported, and this is the whole of what a caller does with it: a log line,
    never a throw and never a status code.

    7.1 already declines to fail sign-in over a zone problem, reading an
    unparseable tz as absent rather than answering 422, so a stale zone database
    can never lock anyone out. One reminder row that cannot be computed taking
    down every login for that account would be the same failure through a
    different door, and the row was already malformed before this request
    arrived: a stale instant on it is the smaller harm than a person who cannot
    sign in. The engine reports rather than throws for this trigger alone for
    that reason, and turning the report back into an error path here would undo
    the choice.

    The count and the user id, and not the engine's free-form reason. 10.5 logs
    row counts and this module is the whitelist that keeps task titles and
    addresses structurally absent from a log line; forwarding an exception
    message would put an unbounded string through it.
    */
    logAuthEvent('timezone_reminders_unresolved', {
      userId,
      count: outcome.unresolved.length,
    })
  }
  return outcome
}
