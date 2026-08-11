/*
The module path 11.7 ratified at the P7 mid-package change control, and the
only way into the delivery loop that is not a timer.

That section fixes three things and deliberately no more: this path, the
export name (createReminderPass answering the callable, or runReminderPass
being it, the harness accepting either), and the two dependency names,
{ dbClient, notifications }, which are 11.10's own option names for the same
two things. The internals, the transaction shape and the return value are this
session's. The name chosen here is createReminderPass, the factory: the
dependencies are resolved once (the notifier, the database handle, the logger)
and the callable it answers is the same object the interval calls sixty times
an hour, so nothing is rebuilt per tick and the two callers, production's
timer and the acceptance suite, compose it identically.

Two things this module is not, in that section's words. It is not an HTTP
endpoint, adding one being a change to frozen section 7. And it is not a
second export path for production, which composes the same callable at boot as
it always would have.
*/
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
