/*
What other Consultation state follows a Discussion's lifecycle, called from
inside the transaction that changes it, so the two land or fail together.

`onDiscussionResolved` is #321's "resolving the parent Discussion closes any
open round atomically". The resolve transaction calls it after taking the
Discussion's row lock (the same lock every input-round write takes, see
domain/consultation-input.ts), so no response can land in the round between
the resolve's check and this close. It is idempotent: a Discussion with no
open round is untouched. Reopening a Discussion needs no hook, because a
closed round never reopens (#321); a new round may be opened instead.
*/
import { sql } from 'drizzle-orm'

import type { Executor } from '../database.js'

export async function onDiscussionResolved(
  tx: Executor,
  discussionId: string,
): Promise<void> {
  /* `closed_by` stays null and `close_reason` says why: the resolver is the
     Discussion's `resolved_by`, which the resolve writes in its own
     statement, and a copy here could only disagree with it. */
  await tx.execute(
    sql`UPDATE discussion_input_rounds
           SET state = 'closed', close_reason = 'discussion_resolved',
               closed_at = now()
         WHERE discussion_id = ${discussionId}::uuid AND state = 'open'`,
  )
}
