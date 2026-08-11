/*
11.7's 60-second in-process interval, and the guard that keeps two passes from
overlapping inside one process.

**Why the guard is here and not in the pass.** 11.7 requires the pass to stay
a plain callable, and every criterion that runs one expects a call to run a
whole cycle: a guard inside the callable would silently turn a second
concurrent call into a no-op, which is exactly the shape AC-089's third case
exists to distinguish from the real answer. Two ticks that genuinely overlap
are decided by SELECT ... FOR UPDATE SKIP LOCKED in the pass, which is also
what decides the case this process cannot guard at all, the deploy overlap
window running two instances for about ninety seconds. This guard covers the
other case: one process whose pass is running longer than a minute, where a
second tick would queue work behind the first for no gain.

**A skipped tick costs nothing.** 11.7's first consequence is that the poll is
over fire_at <= now(), so a tick that does not run is picked up by the next
one inside the six-hour stale window. That is what makes skipping the honest
response to a slow pass rather than a loss.

**Nothing escapes the timer.** A rejected promise inside a timer callback is
an unhandled rejection, which ends the process on Node 24's default. Every
pass is caught and logged here, and a failed cycle pings no heartbeat, so
repeated failure surfaces as heartbeat silence rather than as a quiet process
that stopped delivering (11.12).
*/
import { DrizzleQueryError } from 'drizzle-orm'
import { pino } from 'pino'

import { createReminderPass } from './pass.js'
import type { ReminderPassDeps } from './pass.js'

/*
A stack safe to log, the boot file's own function copied rather than imported:
that file composes this module, so importing back into it would point the
scheduler at the entrypoint that runs main(), which is the cycle
src/server/security/log.ts already refuses for the same reason. Section 13
item 18 is why the function exists at all: Drizzle wraps a failed statement in
an error whose message embeds the SQL and its bound parameters, and
Error.stack opens with that message, so a background loop logging a database
failure verbatim would put row content into the logs against 10.5. The
message is dropped and the frames, which say where it failed, are kept. P9's
logging policy module is where the two copies become one.
*/
function safeStack(err: unknown): string | undefined {
  if (!(err instanceof Error)) return undefined
  const stack = err.stack ?? ''
  const carriesQuery =
    err instanceof DrizzleQueryError || err.message.startsWith('Failed query: ')
  if (!carriesQuery) return stack
  const frames = stack.indexOf('\n    at ')
  return frames === -1 ? err.name : `${err.name}${stack.slice(frames)}`
}

/** 11.7's interval, named rather than inlined so the sentence and the number
 * are in one place. */
export const REMINDER_TICK_MS = 60_000

export interface ReminderSchedulerOptions extends ReminderPassDeps {
  /** Overridable for tests alone; production is 11.7's sixty seconds. */
  intervalMs?: number
}

export interface ReminderSchedulerHandle {
  /** Stops future ticks. A pass already in flight runs to completion, which
   * is what makes shutdown safe: 8.6 tolerates a duplicate from a crash
   * between send and mark, and there is no reason to manufacture one. */
  stop(): void
}

export function startReminderScheduler(
  options: ReminderSchedulerOptions,
): ReminderSchedulerHandle {
  const logger = options.logger ?? pino()
  const pass = createReminderPass(options)
  let inFlight = false

  const tick = (): void => {
    if (inFlight) {
      logger.warn(
        { event: 'reminder_pass_overlapped' },
        'reminder pass still running, skipping this tick (spec 11.7)',
      )
      return
    }
    inFlight = true
    void pass()
      .catch((err: unknown) => {
        logger.error(
          {
            event: 'reminder_pass_failed',
            reason: err instanceof Error ? err.name : 'unknown',
            stack: safeStack(err),
          },
          'reminder pass failed',
        )
      })
      .finally(() => {
        inFlight = false
      })
  }

  const timer = setInterval(tick, options.intervalMs ?? REMINDER_TICK_MS)
  return {
    stop: () => {
      clearInterval(timer)
    },
  }
}
