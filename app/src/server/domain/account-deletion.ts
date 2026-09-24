/*
The 8.10 account deletion transaction, steps 1 to 6c.

This file and its caller sit either side of a deliberate seam: the auth
module owns the DELETE /me route and session destruction, and this file owns
the transaction it calls. So the function below
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
one those sections state.

**Step 6c exists because no ON DELETE clause on users(id) fires here, and that
is the one thing to know before adding a table to this schema (issue #253,
2026-09-20).** Step 7 scrubs the users row rather than deleting it, and in
issue #230's words, which are better than #253's: *a row that is never deleted
fires no `ON DELETE` clause — not `CASCADE`, not `SET NULL`, not `RESTRICT` —
so a table that keyed its cleanup to `users` is not cleaned up at all, and
nothing anywhere reports it.* Fourteen cascade keys are in that position and
`sessions_user_id_fkey` is a fifteenth outside section 4, and before 6c nine
of the fifteen left a departed account's rows standing indefinitely.
`USER_CASCADE_DISPOSALS` below is the enumeration, one entry per foreign key
with what happens to it and why, and
`tests/guards/guard-account-deletion-sweep.test.ts` fails when the schema
grows a sixteenth that nothing here names — over `SET NULL` as well as
`CASCADE`, there being none of the former today and that being the reason to
enumerate it rather than to wait for one.
*/
import { notSamplePerson } from '../sample/people.js'
import { sql } from 'drizzle-orm'

import { deleteFolderRow, runRClean, transferOwnership } from './folders.js'
import { rowsOf } from '../database.js'
import { blocksNamingFiles, markBlocksReclaimed } from './files.js'
import type { Executor } from '../database.js'

/**
 * What becomes of one foreign key that points at `users(id)` with
 * `ON DELETE CASCADE` when the account it names is deleted under 8.10.
 *
 * `deleted` means a statement in the deletion transaction removes the rows,
 * and `where` names it. `retained` means the rows deliberately outlive the
 * account, and `why` is the argument for that rather than a note that nobody
 * got to it. **There is no third value meaning "the cascade handles it"**,
 * which is the false premise issue #253 exists to remove from this file.
 */
export interface UserCascadeDisposal {
  /** The constraint name, as `db/constraint-catalog.ts` spells it. */
  fk: string
  table: string
  disposition: 'deleted' | 'retained'
  /** Which statement removes the rows, or empty when they are retained. */
  where: string
  why: string
}

/**
 * Every `ON DELETE CASCADE` foreign key referencing `users(id)`, and what
 * account deletion does about each. The guard asserts this list against the
 * schema in both directions, so a table added with such a key and no entry
 * here goes red, and an entry naming a key the schema no longer has goes red
 * too.
 */
/**
 * What becomes of one foreign key that points at `users(id)` with
 * `ON DELETE RESTRICT` or `NO ACTION`.
 *
 * The list above is where to read first: that one enumerates the clauses that
 * promise to change a row and cannot, because 8.10 step 7 scrubs the `users`
 * row rather than deleting it. **These promise to *refuse* a delete that never
 * comes**, which is why the guard left them alone -- a clause that refuses
 * nothing leaves nothing in a wrong state.
 *
 * That reasoning is right for seventeen of the eighteen and was wrong for one.
 * `folder_facets.owner_id` names a **private facet**: writing that no other
 * member may read, in a folder the account is leaving. Nothing was ever going
 * to clear it, and nobody would ever have been able to read it or remove it
 * again. So the enumeration is widened rather than the clause changed: every
 * key here says whether its rows are **swept** by a statement this codebase
 * runs, or **outlive** the account deliberately, and the guard asserts the
 * list against the live schema in both directions. A nineteenth key is then a
 * decision somebody has to write down rather than a silence.
 *
 * `outlives` is the ordinary answer and is not an apology. 4.13 makes an act
 * survive its actor on purpose, which is the whole reason step 7 scrubs
 * instead of deleting, and provenance that vanished would rewrite the record
 * of work other people did.
 */
export interface UserRestrictDisposal {
  /** The constraint name, as `db/constraint-catalog.ts` spells it. */
  fk: string
  table: string
  disposition: 'swept' | 'outlives'
  /** Which statement removes the rows, or empty when they outlive. */
  where: string
  why: string
}

/** Every `ON DELETE RESTRICT` or `NO ACTION` foreign key referencing
 * `users(id)`, and what becomes of its rows when the account goes. */
export const USER_RESTRICT_DISPOSALS: readonly UserRestrictDisposal[] = [
  {
    fk: 'folder_facets_owner_id_fkey',
    table: 'folder_facets',
    disposition: 'swept',
    where: "runRClean, in domain/folders.ts, via deletePrivateFacetsOf",
    why: "4.30 and 8.10: a private facet is the owner's own writing that no other member may ever read, so it goes permanently with the membership, by every path, because R-CLEAN is where all three of them meet. Left standing it is unreadable by its owner, who has left, unreadable by everybody else, `facet.read` admitting no preset, and unrestorable by either.",
  },
  {
    fk: 'folder_facets_created_by_fkey',
    table: 'folder_facets',
    disposition: 'outlives',
    where: '',
    why: 'Provenance and never authority: nothing reads it to decide anything, and a facet the folder still has must keep saying who made it.',
  },
  {
    fk: 'folders_owner_id_fkey',
    table: 'folders',
    disposition: 'swept',
    where: 'steps 2 and 3, in this file',
    why: '8.9 and 8.10: a folder with other members is transferred and one without is deleted outright, so no folder is left owned by a scrubbed account.',
  },
  {
    fk: 'folder_access_history_actor_id_fkey',
    table: 'folder_access_history',
    disposition: 'outlives',
    where: '',
    why: '7.4: a former member keeps their entries, and the record of who changed whose Access survives the people in it, which is what makes it a record.',
  },
  {
    fk: 'folder_access_history_member_id_fkey',
    table: 'folder_access_history',
    disposition: 'outlives',
    where: '',
    why: 'As the actor key: the history of a membership outlives the membership, and 4.30 and 4.28 keep the same rule for their own tables.',
  },
  {
    fk: 'folder_responsibilities_member_id_fkey',
    table: 'folder_responsibilities',
    disposition: 'outlives',
    where: '',
    why: "4.28: history survives the membership it describes. The standing is *closed* by runRClean rather than deleted, which is AC-570's last case.",
  },
  {
    fk: 'folder_responsibilities_updated_by_fkey',
    table: 'folder_responsibilities',
    disposition: 'outlives',
    where: '',
    why: 'Provenance on a document the folder keeps, and a scrub must never fabricate a different historical actor.',
  },
  {
    fk: 'folder_responsibility_history_actor_id_fkey',
    table: 'folder_responsibility_history',
    disposition: 'outlives',
    where: '',
    why: '4.29: the append-only record is the authority on who did what and may not lose its actors.',
  },
  {
    fk: 'folder_responsibility_history_member_id_fkey',
    table: 'folder_responsibility_history',
    disposition: 'outlives',
    where: '',
    why: 'The same record, its other reference: a revision about a person who has left still describes work the folder did.',
  },
  {
    fk: 'tasks_created_by_fkey',
    table: 'tasks',
    disposition: 'outlives',
    where: '',
    why: "4.13: a Task in somebody else's folder survives its author, and deleting it would take that folder's work with the account.",
  },
  {
    fk: 'tasks_completed_by_fkey',
    table: 'tasks',
    disposition: 'outlives',
    where: '',
    why: "`tasks_completed_by_check` ties this column to the status, so it cannot be nulled without reopening somebody else's finished Task.",
  },
  {
    fk: 'reminders_created_by_fkey',
    table: 'reminders',
    disposition: 'outlives',
    where: '',
    why: 'A reminder rides its Task, which survives; 8.6 delivers to the assignee, and a scrubbed author changes nothing about that.',
  },
  {
    fk: 'invites_inviter_id_fkey',
    table: 'invites',
    disposition: 'outlives',
    where: '',
    why: "Pending invitations are invalidated at step 1 rather than deleted, so the record of who invited whom stays readable to the folder's administrators.",
  },
  {
    fk: 'invites_accepted_by_fkey',
    table: 'invites',
    disposition: 'outlives',
    where: '',
    why: 'The same row, its other reference: an accepted invitation is history of how a membership began.',
  },
  {
    fk: 'events_actor_id_fkey',
    table: 'events',
    disposition: 'outlives',
    where: '',
    why: "4.13 in one line: an event is what somebody did, it is purged at ninety days by 11.7, and it is not the account's to take with them.",
  },
  {
    fk: 'comments_author_id_fkey',
    table: 'comments',
    disposition: 'outlives',
    where: '',
    why: '7.14: authorship is provenance rather than standing authority, so a departed member keeps their old words.',
  },
  {
    fk: 'discussions_created_by_fkey',
    table: 'discussions',
    disposition: 'outlives',
    where: '',
    why: "#320 and #228's authorship rule: a Discussion is the Folder's shared history, and who opened it is provenance that confers no standing authority once the member is gone.",
  },
  {
    fk: 'discussions_resolved_by_fkey',
    table: 'discussions',
    disposition: 'outlives',
    where: '',
    why: '#320: who resolved a Discussion is part of the record of how the Folder decided, and it is not the account\'s to take with them.',
  },
  {
    fk: 'discussion_outcomes_actor_id_fkey',
    table: 'discussion_outcomes',
    disposition: 'outlives',
    where: '',
    why: '#320: an Outcome is an immutable, addressable record other people link to; its actor is provenance and deleting it would rewrite what the Folder concluded.',
  },
  {
    fk: 'discussion_input_rounds_created_by_fkey',
    table: 'discussion_input_rounds',
    disposition: 'outlives',
    where: '',
    why: "#321: an input round is part of its Discussion's history, and who asked for input is provenance that confers no standing authority once the member is gone.",
  },
  {
    fk: 'discussion_input_rounds_closed_by_fkey',
    table: 'discussion_input_rounds',
    disposition: 'outlives',
    where: '',
    why: '#321: who closed a round is part of the record of how the Folder decided, like who resolved its Discussion.',
  },
  {
    fk: 'discussion_input_responses_user_id_fkey',
    table: 'discussion_input_responses',
    disposition: 'outlives',
    where: '',
    why: "#321 \"responses freeze when the round closes\" and \"do not silently rewrite closed response history\": a departed member's response stays what the Folder heard, as their comments do (#228).",
  },
  {
    fk: 'files_owner_id_fkey',
    table: 'files',
    disposition: 'swept',
    where: 'step 6a, in this file',
    why: '7.15: the account\'s own uploads are deleted with it and their objects removed after the commit, which is why this key never refuses the scrub.',
  },
  {
    fk: 'task_dependencies_created_by_fkey',
    table: 'task_dependencies',
    disposition: 'outlives',
    where: '',
    why: "7.25: a dependency is a fact about two Tasks in somebody's folder, and who wrote it down is provenance the folder keeps.",
  },
]

export const USER_CASCADE_DISPOSALS: readonly UserCascadeDisposal[] = [
  {
    fk: 'connections_user_a_id_fkey',
    table: 'connections',
    disposition: 'deleted',
    where: 'step 5, in this file',
    why: '4.2 stores the pair once in canonical order, so one statement over both columns clears the entry from both rosters.',
  },
  {
    fk: 'connections_user_b_id_fkey',
    table: 'connections',
    disposition: 'deleted',
    where: 'step 5, in this file',
    why: 'The same statement: 8.10 step 5 deletes every row containing the account, whichever column holds it.',
  },
  {
    fk: 'folder_members_user_id_fkey',
    table: 'folder_members',
    disposition: 'deleted',
    where: "step 3's folder deletes and step 4's R-CLEAN, in this file",
    why: "folder_members_folder_id_fkey is itself ON DELETE CASCADE, so step 3 takes the rows in folders the account still owned, and step 4 then reads folder_members by user_id and runs 5.3's R-CLEAN over what is left, which deletes the membership row. Between them no row survives, whichever step reached it.",
  },
  {
    fk: 'my_day_entries_user_id_fkey',
    table: 'my_day_entries',
    disposition: 'deleted',
    where: 'step 6, in this file',
    why: "Steps 3 and 4 take the entries their folders and memberships account for; step 6 is the remainder sweep by user_id, so the end state is zero rows however each one was reached.",
  },
  {
    fk: 'sessions_user_id_fkey',
    table: 'sessions',
    disposition: 'deleted',
    where: 'step 8, in src/server/auth/account.ts',
    why: "handleDeleteMe runs DELETE FROM sessions WHERE user_id inside this same transaction, which is 11.6's rule that revocation never waits for the pruning pass. The table is 10.1's and sits outside section 4, so db/constraint-catalog.ts does not carry it and the guard names it as the one admitted exception, exactly as AC-001 does.",
  },
  {
    fk: 'comment_likes_user_id_fkey',
    table: 'comment_likes',
    disposition: 'deleted',
    where: 'step 6c, in this file',
    why: "A like carries no text and names nobody on the wire: commentSelect answers a count and the viewer's own bit, and 4.15 calls it the whole reaction set. It is therefore not one of 8.10's three surviving references, and it is the same shape as my_day_entries and connections, which this transaction already deletes — a per-person marker on a shared object. What a remaining member sees change is one number on a comment.",
  },
  {
    fk: 'discussion_reads_user_id_fkey',
    table: 'discussion_reads',
    disposition: 'deleted',
    where: 'step 6c, in this file',
    why: "Migration 0048's read marker: when this account last opened a Discussion. It is this account's own unread state, carries no text, and means nothing once the account is gone; nobody else ever reads it.",
  },
  {
    fk: 'labels_owner_user_id_fkey',
    table: 'labels',
    disposition: 'deleted',
    where: 'step 6c, in this file',
    why: "4.24's Personal Label is one person's own catalog, private to them, carrying a name, a colour and a description they wrote. Scoped by owner_user_id, which is NOT NULL on a Personal Label and NULL on every Folder Label, so it reaches exactly the personal catalog and no shared one. A Folder Label in a folder the account owned goes at step 3 through labels_folder_id_fkey, a cascade off a real DELETE that does fire, and the assignment rows follow this one: task_personal_labels and folder_personal_labels key onto labels(id, owner_user_id) ON DELETE CASCADE.",
  },
  {
    fk: 'mention_notices_user_id_fkey',
    table: 'mention_notices',
    disposition: 'deleted',
    where: 'step 6c, in this file',
    why: "Wave 2's @mention ledger: a row only records that this account was already told about one mention, so it is this account's own notification state and means nothing once the account is gone. The mention itself is a run in someone else's writing and stays there, as their authored text.",
  },
  {
    fk: 'notifications_user_id_fkey',
    table: 'notifications',
    disposition: 'deleted',
    where: 'step 6c, in this file',
    why: "4.14's row is one recipient's copy, so every row keyed to this account is that account's own notification history and nobody else's. Events are untouched: events_actor_id_fkey is RESTRICT and other people's notifications about this account's acts are their history, not this account's.",
  },
  {
    fk: 'sample_objects_user_id_fkey',
    table: 'sample_objects',
    disposition: 'deleted',
    where: 'step 6c, in this file',
    why: "4.21's bookkeeping marks which of this account's own objects came from the sample workspace. Its id column carries no foreign key at all, so once step 3 and this step have taken the shelves, folders, tasks and views it names, every row left is a mark on something that no longer exists.",
  },
  {
    fk: 'shelves_user_id_fkey',
    table: 'shelves',
    disposition: 'deleted',
    where: 'step 6c, in this file',
    why: "4.18's shelf is one person's own grouping and nobody else can read it (AC-366), and it carries a name and a description the person wrote. The page blocks hanging on it go with it by page_blocks_shelf_id_fkey, which is a cascade off a real DELETE and does fire.",
  },
  {
    fk: 'task_thread_reads_user_id_fkey',
    table: 'task_thread_reads',
    disposition: 'deleted',
    where: 'step 6c, in this file',
    why: "Migration 0049's read marker: when this account last opened a task's thread. The same shape as discussion_reads: this account's own unread state, carrying no text, meaning nothing once the account is gone, and read by nobody else.",
  },
  {
    fk: 'user_page_covers_user_id_fkey',
    table: 'user_page_covers',
    disposition: 'deleted',
    where: 'step 6c, in this file',
    why: "4.20's row dresses one person's own built-in pages. Step 6a reaches the ones whose picture this account uploaded, through user_page_covers_file_id_fkey; a cover set from a preset is reached by nothing, which is why this statement is by user_id rather than left to that cascade.",
  },
  {
    fk: 'user_page_descriptions_user_id_fkey',
    table: 'user_page_descriptions',
    disposition: 'deleted',
    where: 'step 6c, in this file',
    why: '4.22 stores up to 500 characters the person wrote about their own built-in page, readable by nobody else. It is text on a dissolved account and nothing points at it.',
  },
  {
    fk: 'user_settings_user_id_fkey',
    table: 'user_settings',
    disposition: 'deleted',
    where: 'step 6c, in this file',
    why: "4.10 and 4.19's preferences: theme, clock, density, pins, sidebar order. Purely this account's, read by nothing else, and a fresh sign-in on the same Google account provisions a new row rather than finding this one, the scrub having released google_sub.",
  },
  {
    fk: 'user_views_user_id_fkey',
    table: 'user_views',
    disposition: 'deleted',
    where: 'step 6c, in this file',
    why: "4.19's saved View carries a name and a criteria document the person wrote, and it is private to them. A View can name folders this account no longer has any relationship to, so leaving it standing keeps a description of other people's work in a row nobody can reach.",
  },
  {
    fk: 'page_document_receipts_actor_id_fkey',
    table: 'page_document_receipts',
    disposition: 'retained',
    where: '',
    why: "Retained deliberately, and this is the one of the fifteen that is. The row holds no text: an idempotency key, a SHA-256 of a payload, a revision string and the ids of tasks that survive in the folder. It is read a second way that is not about its actor at all — pages.ts treats any Folder page receipt on a folder (an array-valued created_task_ids; a Task or facet document's receipt holds an object) as the mark that the folder's document is on the document-transaction path, and refuses the legacy whole-page writer against it. Deleting a departed member's receipts could therefore take the last such mark off a folder that other people are still editing and re-open a writer that must stay shut for them. The rows are not orphaned: page_document_receipts_folder_id_fkey is a cascade off a real DELETE, so step 3 takes the receipts of every folder that dies with the account, and what is left belongs to a folder that outlives it.",
  },
]

/**
 * Steps 1 to 6c of 8.10 for one account, inside the caller's transaction.
 *
 * The caller supplies the transaction and runs steps 7 and 8 after this
 * returns. Nothing here reads or writes the sessions table, and nothing here
 * scrubs the user row: after this function the account still exists, owns no
 * folder, holds no membership, appears on no roster, offers no pending
 * invite, and holds no row in any of step 6c's eleven personal tables.
 */
export async function deleteAccountData(
  tx: Executor,
  userId: string,
): Promise<AccountDeletionCounts> {
  // 1. The invites the account had offered. Invalidated is 5.2's terminal
  // state for exactly this transition, and responded_at is set because 4.9
  // gives it to any terminal transition. The sweep is by inviter and pending
  // status and nothing wider: an invite merely addressed to this account's
  // email belongs to somebody else's decision and keeps waiting.
  const pendingInvites = await rowsOf(
    tx,
    sql`SELECT count(*)::int AS n FROM invites
        WHERE inviter_id = ${userId} AND status = 'pending'`,
  )
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
                       WHERE m.folder_id = f.id AND m.user_id <> ${userId}
                         AND ${notSamplePerson(sql`m.user_id`)})`,
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
  //
  // Step 6a's collection half runs first, because these deletes cascade the
  // files rows of every doomed folder, whoever uploaded them, and those rows
  // are the only index to the bytes in the store: read after the delete
  // there is nothing left that knows the objects exist.
  const cascadeFiles = await rowsOf(
    tx,
    sql`SELECT f.id FROM files f
        JOIN folders fo ON fo.id = f.folder_id
        WHERE fo.owner_id = ${userId}`,
  )
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
  const connections = await rowsOf(
    tx,
    sql`SELECT count(*)::int AS n FROM connections
        WHERE user_a_id = ${userId} OR user_b_id = ${userId}`,
  )
  await tx.execute(
    sql`DELETE FROM connections
         WHERE user_a_id = ${userId} OR user_b_id = ${userId}`,
  )

  // 6. The remainder sweep. Steps 3 and 4 already took the entries their
  // folders and memberships accounted for; this takes any that outlived
  // both, so the end state is zero rows for the account whichever step
  // reached each one.
  const myDayEntries = await rowsOf(
    tx,
    sql`SELECT count(*)::int AS n FROM my_day_entries WHERE user_id = ${userId}`,
  )
  await tx.execute(
    sql`DELETE FROM my_day_entries WHERE user_id = ${userId}`,
  )

  // 6a. Every files row still owned by the account, wherever it sits: the
  // folderless avatar, whose id was published on every roster the person
  // ever appeared in, and their uploads in folders that survive them. A
  // transferred folder keeps its other members' files; what leaves with the
  // person is what they put in (8.10 step 6a). The rows delete inside the transaction; the objects belong to the
  // caller, who removes every collected id from the store only after the
  // commit, the order 7.15's delete uses, so a rollback cannot have already
  // destroyed bytes whose rows survived.
  // Issue #267: a page block in a surviving folder that wore one of these
  // files keeps its row and loses its reference (ON DELETE SET NULL); read
  // them first so it reads as reclaimed rather than as a never-filled block.
  const wearers = await blocksNamingFiles(
    tx,
    sql`SELECT id FROM files WHERE owner_id = ${userId}`,
  )
  const ownedFiles = await rowsOf(
    tx,
    sql`DELETE FROM files WHERE owner_id = ${userId} RETURNING id`,
  )
  await markBlocksReclaimed(tx, wearers)
  const fileIds = new Set<string>()
  for (const row of cascadeFiles) fileIds.add(String(row.id))
  for (const row of ownedFiles) fileIds.add(String(row.id))

  /*
  6c. The personal-rows sweep (issue #253, 2026-09-20).

  Ten tables whose only tie to this account is a column declared
  `REFERENCES users(id) ON DELETE CASCADE`. Reading the schema, none of them
  belongs in this function — the cascade says the rows leave with the user.
  **It never fires.** Step 7 scrubs the users row rather than deleting it, so
  there is no DELETE for any of those cascades to hang off, and until this
  step every one of these rows outlived the account that made it. The
  argument for each table is its entry in `USER_CASCADE_DISPOSALS` above, and
  the guard holds this list and that one equal to the schema.

  Written as one statement per table rather than a loop over names: the
  guard reads this source for `DELETE FROM <table>`, and a table swept by an
  interpolated identifier would be invisible to it and to grep alike. The
  order is alphabetical and carries no meaning, none of the eleven referencing
  another; `shelves` cascades its page blocks and `labels` its assignment
  rows in task_personal_labels and folder_personal_labels, both of which are
  cascades off a real DELETE and do fire.
  */
  const swept = [
    await rowsOf(
      tx,
      sql`DELETE FROM comment_likes WHERE user_id = ${userId} RETURNING 1 AS one`,
    ),
    await rowsOf(
      tx,
      sql`DELETE FROM discussion_reads WHERE user_id = ${userId} RETURNING 1 AS one`,
    ),
    await rowsOf(
      tx,
      sql`DELETE FROM labels WHERE owner_user_id = ${userId} RETURNING 1 AS one`,
    ),
    await rowsOf(
      tx,
      sql`DELETE FROM mention_notices WHERE user_id = ${userId} RETURNING 1 AS one`,
    ),
    await rowsOf(
      tx,
      sql`DELETE FROM notifications WHERE user_id = ${userId} RETURNING 1 AS one`,
    ),
    await rowsOf(
      tx,
      sql`DELETE FROM sample_objects WHERE user_id = ${userId} RETURNING 1 AS one`,
    ),
    await rowsOf(
      tx,
      sql`DELETE FROM shelves WHERE user_id = ${userId} RETURNING 1 AS one`,
    ),
    await rowsOf(
      tx,
      sql`DELETE FROM task_thread_reads WHERE user_id = ${userId} RETURNING 1 AS one`,
    ),
    await rowsOf(
      tx,
      sql`DELETE FROM user_page_covers WHERE user_id = ${userId} RETURNING 1 AS one`,
    ),
    await rowsOf(
      tx,
      sql`DELETE FROM user_page_descriptions WHERE user_id = ${userId} RETURNING 1 AS one`,
    ),
    await rowsOf(
      tx,
      sql`DELETE FROM user_settings WHERE user_id = ${userId} RETURNING 1 AS one`,
    ),
    await rowsOf(
      tx,
      sql`DELETE FROM user_views WHERE user_id = ${userId} RETURNING 1 AS one`,
    ),
  ]
  const personalRows = swept.reduce((total, rows) => total + rows.length, 0)

  return {
    personalRows,
    invites: Number(pendingInvites[0]?.n ?? 0),
    foldersTransferred: transferable.length,
    foldersDeleted: doomed.length,
    memberships: memberships.length,
    connections: Number(connections[0]?.n ?? 0),
    myDayEntries: Number(myDayEntries[0]?.n ?? 0),
    files: fileIds.size,
    fileIds: [...fileIds],
  }
}

export interface AccountDeletionCounts {
  invites: number
  foldersTransferred: number
  foldersDeleted: number
  memberships: number
  connections: number
  myDayEntries: number
  /** Files rows step 3's cascades dropped plus the rows step 6a deleted. */
  files: number
  /** Step 6c's total across its eleven tables: the rows fourteen inert
   * cascades promised to take and did not (issue #253). One number rather
   * than ten, because the deletion log's question is whether the sweep ran
   * and reached something, not which table held what. */
  personalRows: number
  /** The collected object ids: the caller removes each from the store after
   * the transaction commits (8.10 step 6a). */
  fileIds: string[]
}
