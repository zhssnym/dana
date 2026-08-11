/*
The beginning of 10.5's logging policy: one module every log line passes
through, so the never-log list (task titles, notes, step titles, invite email
addresses, tokens, session identifiers) is structurally absent rather than
filtered at each call site.

At P1 it carries the one category this package produces, authentication
events, and it enforces the list by allowing only fields named here rather
than by removing forbidden ones: a whitelist cannot be defeated by a field
nobody thought of. P9 owns the full policy and the rest of 10.5's categories,
and extends this module rather than replacing it.

It builds its own pino instance rather than importing the boot file's, because
the boot file imports this module's consumers and a cycle through an
entrypoint that also runs main() is a hazard nobody needs. P9 can pass one in.
*/
import { pino } from 'pino'

const logger = pino()

/** The only fields any auth log line may carry. */
export interface AuthLogFields {
  /** Never the email, never the session identifier: the primary key only. */
  userId?: string
  /** Machine-readable outcome, from a fixed vocabulary at the call site. */
  reason?: string
  provisioned?: boolean
  /** How many rows an event touched or could not touch. A number carries no
   * content by construction, which is why 10.5 admits row counts on deletions
   * while admitting none of the rows themselves; P7 added it for the reminders
   * a zone sync could not compute (8.6, and the unresolved list it reports
   * rather than throws). */
  count?: number
}

export function logAuthEvent(event: string, fields: AuthLogFields = {}): void {
  logger.info(
    {
      event,
      ...(fields.userId === undefined ? {} : { user_id: fields.userId }),
      ...(fields.reason === undefined ? {} : { reason: fields.reason }),
      ...(fields.provisioned === undefined
        ? {}
        : { provisioned: fields.provisioned }),
      ...(fields.count === undefined ? {} : { count: fields.count }),
    },
    'auth',
  )
}
