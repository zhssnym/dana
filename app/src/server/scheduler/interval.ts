// The 60-second reminder interval (11.7). It skips a tick while a pass still runs in this process;
// SKIP LOCKED in the pass handles overlap across instances. A skipped tick is safe: the next poll picks it up.
// Every pass is caught here, because an unhandled rejection in a timer ends the process.
import { pino } from 'pino'

import { createReminderPass } from './pass.js'
import type { ReminderPassDeps } from './pass.js'
import { createSecurityLogger } from '../security/log.js'

export const REMINDER_TICK_MS = 60_000

export interface ReminderSchedulerOptions extends ReminderPassDeps {
  /** For tests only. */
  intervalMs?: number
}

export interface ReminderSchedulerHandle {
  /** Stops future ticks. A pass in flight runs to completion. */
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
