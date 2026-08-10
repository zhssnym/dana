/*
The 8.10 account deletion transaction, steps 1 to 6.

Ownership of this file and its caller is the one seam docs/team/README.md
spells out: the Security engineer owns the DELETE /me route and session
destruction, this role owns the transaction it calls. So the function below
takes an executor rather than a handle and opens nothing: 8.10's first words
are "One transaction", and steps 7 and 8, the identity scrub and the session
revocation, live in the auth module and must commit with these six or not at
all. A route that scrubbed a user whose sessions still authenticated, or
transferred folders that a failed scrub then left owned by a live account,
would be exactly the split this shape prevents.

The order is 8.10's own, and it is the whole design rather than a preference.
folders.owner_id is RESTRICT (4.3), so every folder the account owns must be
handed on or deleted before the row is touched; the transfer runs before the
deletion so a folder with other members survives, and the deletion runs
before the membership sweep so a folder's own rows are gone before anything
counts what is left of it.

Nothing here is new machinery. Step 2 is 8.9's transfer with its second
caller, step 3 is 8.8's cascade, step 4 is 5.3's R-CLEAN, each imported from
the module that already owns it, so an implementation cannot drift from the
one AC-016, AC-018 and AC-019 already pin.
*/
import { sql } from 'drizzle-orm'

import { deleteFolderRow, runRClean, transferOwnership } from './folders.js'
import { rowsOf } from './db.js'
import type { Executor } from './db.js'

/**
 * Steps 1 to 6 of 8.10 for one account, inside the caller's transaction.
 *
 * The caller supplies the transaction and runs steps 7 and 8 after this
 * returns. Nothing here reads or writes the sessions table, and nothing here
 * scrubs the user row: after this function the account still exists, owns no
 * folder, holds no membership, appears on no roster, and offers no pending
 * invite.
 */
export async function deleteAccountData(
  tx: Executor,
  userId: string,
): Promise<void> {
  // 1. The invites the account had offered. Invalidated is 5.2's terminal
  // state for exactly this transition, and responded_at is set because 4.9
  // gives it to any terminal transition. The sweep is by inviter and pending
  // status and nothing wider: an invite merely addressed to this account's
  // email belongs to somebody else's decision and keeps waiting (AC-133).
  await tx.execute(
    sql`UPDATE invites SET status = 'invalidated', responded_at = now()
        WHERE inviter_id = ${userId} AND status = 'pending'`,
  )

  // 2. Owned folders that other people are in survive, under 8.9's rule:
  // the remaining member with the earliest join, ties to the lower user id.
  // The default folder is excluded by INV-2, which never lets one transfer,
  // and by INV-3, which never lets one hold a second member.
  const transferable = await rowsOf(
    tx,
    sql`SELECT id FROM folders f
        WHERE f.owner_id = ${userId} AND NOT f.is_default
          AND EXISTS (SELECT 1 FROM folder_members m
                       WHERE m.folder_id = f.id AND m.user_id <> ${userId})`,
  )
  for (const row of transferable) {
    await transferOwnership(tx, String(row.id), userId)
  }

  // 3. Everything still owned after the transfers: the default folder, which
  // 8.10 names outright, and every custom folder nobody else was in. The
  // cascade of 8.8 takes their tasks in all three statuses and, through the
  // tasks, steps, My Day entries and reminders; pending invites carrying the
  // folder go with it by the FK cascade of 5.2's folder-deleted row, which is
  // removal rather than the invalidation step 1 gave the survivors.
  const doomed = await rowsOf(
    tx,
    sql`SELECT id FROM folders WHERE owner_id = ${userId}`,
  )
  for (const row of doomed) {
    await deleteFolderRow(tx, String(row.id))
  }

  // 4. What remains are memberships in other people's folders, each left as
  // a clean leave would leave it: the account's assigned tasks in the folder
  // unassigned, its My Day entries for that folder's tasks deleted, the
  // membership row gone, and a folder that drops to exactly one member swept
  // so every task in it belongs to that member (INV-5).
  const memberships = await rowsOf(
    tx,
    sql`SELECT folder_id FROM folder_members WHERE user_id = ${userId}`,
  )
  for (const row of memberships) {
    await runRClean(tx, String(row.folder_id), userId)
  }

  // 5. Both rosters, in one statement: 4.2 stores the pair once in canonical
  // order, so deleting every row containing this account clears the entry
  // from the other side too. The rows are deleted rather than left for 7.3's
  // soft-deleted exclusion to hide, which is what 4.2 records the deletion
  // transaction doing explicitly.
  await tx.execute(
    sql`DELETE FROM connections
         WHERE user_a_id = ${userId} OR user_b_id = ${userId}`,
  )

  // 6. The remainder sweep. Steps 3 and 4 already took the entries their
  // folders and memberships accounted for; this takes any that outlived
  // both, so the end state is zero rows for the account whichever step
  // reached each one.
  await tx.execute(
    sql`DELETE FROM my_day_entries WHERE user_id = ${userId}`,
  )
}
