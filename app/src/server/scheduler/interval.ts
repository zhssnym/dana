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

**The failure path is logged here and the success path is not, which is a
decision and not the hole issue #276 found.** Until that issue this file
discarded the outcome entirely: `void pass().catch(…)` wrote a line for a
throw and nothing whatever for a pass that deleted somebody's picture. The
`reminder_pass_completed` line that answers it lives in `./pass.js`, at the
end of the callable, for two reasons that both say the same thing — 11.7
contemplates this timer being replaced by an external per-minute trigger, and
a record that lives in the driver goes when the driver does; and the callable
is the acceptance suite's only way in, so a line written here is a line
nothing can test. A throw cannot reach that line, which is why this catch
stays.
*/
import { pino } from 'pino'

import { createReminderPass } from './pass.js'
import type { ReminderPassDeps } from './pass.js'
import { createSecurityLogger } from '../security/log.js'

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
  const logger = createSecurityLogger(options.logger ?? pino())
  const pass = createReminderPass(options)
  let inFlight = false

  const tick = (): void => {
    if (inFlight) {
      logger.operation('warn', 'reminder_pass_overlapped')
      return
    }
    inFlight = true
    void pass()
      .catch((err: unknown) => {
        logger.operation(
          'error',
          'reminder_pass_failed',
          { reason: err instanceof Error ? err.name : 'unknown' },
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
