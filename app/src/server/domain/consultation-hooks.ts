/*
The seams between the Discussion lifecycle (issue #320, `domain/consultation.ts`)
and structured input rounds (issue #321), which land separately.

Both functions run **inside the writing transaction of the Discussion act that
calls them, under that Discussion's row lock**, so whatever they write commits
or rolls back with the act. They do nothing until #321 fills them; the call
sites are the contract and must not move out of the transaction.
*/
import type { Executor } from '../database.js'

/**
 * Called once by `resolveDiscussion`, after the new Outcome is current and in
 * the same transaction (#320: "sibling M1-H2 will also require any open
 * structured-input round to close atomically"). #321 closes the Discussion's
 * open input round here. Reopen deliberately has no counterpart: reopening
 * never reopens an old round.
 */
export async function onDiscussionResolved(
  _tx: Executor,
  _discussionId: string,
): Promise<void> {
  // Input rounds (#321) close here.
}

/**
 * Whether anybody other than `creatorId` has contributed structured input to
 * the Discussion. `trashDiscussion` asks it on the creator's own-unshared path
 * (#320: a creator may remove an accidental Discussion only while it has "no
 * structured-input response"), beside its own comment and Outcome checks.
 */
export async function discussionHasOtherInput(
  _tx: Executor,
  _discussionId: string,
  _creatorId: string,
): Promise<boolean> {
  // Input-round responses (#321) are counted here.
  return false
}
