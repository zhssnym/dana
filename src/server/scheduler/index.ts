// The scheduler entry point (11.7). Production's timer and the acceptance suite both use createReminderPass.
export { createReminderPass } from './pass.js'
export type {
  ReminderPass,
  ReminderPassDeps,
  ReminderPassOutcome,
  SchedulerLogger,
} from './pass.js'

export { REMINDER_TICK_MS, startReminderScheduler } from './interval.js'
export type {
  ReminderSchedulerHandle,
  ReminderSchedulerOptions,
} from './interval.js'
