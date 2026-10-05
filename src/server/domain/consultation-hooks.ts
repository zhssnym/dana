// Hooks between Discussion acts and input rounds. Both run inside the act's transaction,
// under the Discussion's row lock.
import { sql } from 'drizzle-orm'

import { rowsOf, type Executor } from '../database.js'

/** Called by `resolveDiscussion`: closes any open round. Idempotent. A closed round never reopens. */
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

/** Whether anyone but `creatorId` gave structured input; a creator may trash only without it. */
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
