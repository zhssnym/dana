/*
The seams between the Discussion lifecycle (issue #320, `domain/consultation.ts`)
and structured input rounds (issue #321, `domain/consultation-input.ts`).

Both functions run **inside the writing transaction of the Discussion act that
calls them, under that Discussion's row lock** (the same lock every input-round
write takes), so whatever they write or read commits or rolls back with the act,
and no response can land between the act's check and its write.
*/
import { sql } from 'drizzle-orm'

import { rowsOf, type Executor } from '../database.js'

/**
 * Called once by `resolveDiscussion`, after the new Outcome is current (#321:
 * "resolving the parent Discussion closes any open round atomically").
 * Idempotent: a Discussion with no open round is untouched. Reopen has no
 * counterpart, because a closed round never reopens; a new one may be opened.
 * `closed_by` stays null and `close_reason` says why: the resolver is the
 * Discussion's `resolved_by`, and a copy here could only disagree with it.
 */
export async function onDiscussionResolved(
  tx: Executor,
  discussionId: string,
): Promise<void> {
  await tx.execute(
    sql`UPDATE discussion_input_rounds
           SET state = 'closed', close_reason = 'discussion_resolved',
               closed_at = now()
         WHERE discussion_id = ${discussionId}::uuid AND state = 'open'`,
  )
}

/**
 * Whether anybody other than `creatorId` has given structured input to the
 * Discussion. `trashDiscussion` asks it on the creator's own-unshared path
 * (#320: a creator may remove an accidental Discussion only while it has "no
 * structured-input response"), beside its own comment and Outcome checks.
 */
export async function discussionHasOtherInput(
  tx: Executor,
  discussionId: string,
  creatorId: string,
): Promise<boolean> {
  const rows = await rowsOf(
    tx,
    sql`SELECT EXISTS (
          SELECT 1 FROM discussion_input_responses r
            JOIN discussion_input_rounds ro ON ro.id = r.round_id
           WHERE ro.discussion_id = ${discussionId}::uuid
             AND r.user_id <> ${creatorId}::uuid) AS other`,
  )
  return rows[0]?.other === true
}
