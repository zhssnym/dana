// 8.10 account deletion, steps 1 to 6c, inside the caller's transaction (the auth module runs steps 7 and 8).
// Step 7 scrubs the users row instead of deleting it, so no ON DELETE clause on users(id) ever fires:
// every table keyed to users needs an entry below and, if swept, a statement in step 6c.
import { sql } from 'drizzle-orm'

import { deleteFolderRow, runRClean, transferOwnership } from './folders.js'
import { rowsOf } from '../database.js'
import { blocksNamingFiles, markBlocksReclaimed } from './files.js'
import type { Executor } from '../database.js'

/** What account deletion does about one CASCADE foreign key to users(id): `deleted` (by `where`) or `retained` (`why`). */
export interface UserCascadeDisposal {
  /** The constraint name, as the migrations spell it. */
  fk: string
  table: string
  disposition: 'deleted' | 'retained'
  where: string
  why: string
}

/**
 * What becomes of one RESTRICT or NO ACTION foreign key to users(id): swept by a statement, or outlives the account.
 * Outliving is normal: 4.13 keeps acts after their actor.
 */
export interface UserRestrictDisposal {
  /** The constraint name, as the migrations spell it. */
  fk: string
  table: string
  disposition: 'swept' | 'outlives'
  where: string
  why: string
}

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
    fk: 'profile_doc_roots_person_fkey',
    table: 'profile_doc_roots',
    disposition: 'outlives',
    where: '',
    why: 'A project-managed profile Doc remains with its project after the person deletes their account. The user row remains without identity. A person-owned Doc leaves with its owned Folder.',
  },
  {
    fk: 'member_profile_sections_subject_fkey',
    table: 'member_profile_sections',
    disposition: 'outlives',
    where: '',
    why: 'Project-managed legacy writing remains with the project after account deletion. Step 4a deletes the account owner\'s shared writing.',
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

/** Every CASCADE foreign key to users(id). The guard test checks this list against the schema both ways. */
export const USER_CASCADE_DISPOSALS: readonly UserCascadeDisposal[] = [
  {
    fk: 'profile_doc_migrations_editor_fkey',
    table: 'profile_doc_migrations',
    disposition: 'retained',
    where: '',
    why: 'The migration keeps the last editor of project-managed source writing as provenance. Step 4a deletes a departing account\'s shared source and migration snapshot.',
  },
  {
    fk: 'member_profile_sections_editor_fkey',
    table: 'member_profile_sections',
    disposition: 'retained',
    where: '',
    why: 'A project-scoped content section may have been edited by another project member. Account deletion scrubs the author identity without removing the teammate’s current project content. Removing the membership deletes its own sections, not the canonical linked files.',
  },
  {
    fk: 'profile_doc_grants_user_fkey',
    table: 'profile_doc_grants',
    disposition: 'deleted',
    where: 'step 6c, in this file',
    why: 'The user row stays after account deletion, so its cascade does not run. Step 6c removes selected reader and editor grants to prevent access by the deleted account.',
  },
  {
    fk: 'feedback_user_id_fkey',
    table: 'feedback',
    disposition: 'deleted',
    where: 'step 5, in this file',
    why: 'Feedback holds words and screenshots the person wrote. The scrub keeps the users row, so the cascade never fires; step 5 deletes the rows.',
  },
  {
    fk: 'folders_archived_by_fkey',
    table: 'folders',
    disposition: 'retained',
    where: '',
    why: 'Archive provenance on shared Work outlives the actor, as event provenance does. Account deletion soft-deletes the user; the archive list joins only live users, so it no longer exposes that person’s name, while the Work and its original actor id remain for its other members.',
  },
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
    fk: 'direct_conversations_user_a_id_fkey',
    table: 'direct_conversations',
    disposition: 'deleted',
    where: 'step 5, in this file',
    why: 'A private exchange belongs to both participants. Deleting either account removes the whole conversation and its messages, so no private text remains attached to a scrubbed user.',
  },
  {
    fk: 'direct_conversations_user_b_id_fkey',
    table: 'direct_conversations',
    disposition: 'deleted',
    where: 'step 5, in this file',
    why: 'The same pair deletion checks both user columns. It removes a conversation even when this account is the second participant in canonical order.',
  },
  {
    fk: 'direct_messages_author_id_fkey',
    table: 'direct_messages',
    disposition: 'deleted',
    where: 'step 5, through direct_messages_conversation_id_fkey',
    why: 'Only a participant can send a message. Step 5 removes every conversation containing the account, and the conversation foreign key then removes every message it authored.',
  },
  {
    fk: 'folder_members_bio_author_id_fkey',
    table: 'folder_members',
    disposition: 'retained',
    where: '',
    why: 'A teammate overview can be written by a different project member. Their account deletion scrubs their name but keeps the project membership and its writing attribution for the remaining team. Removing that membership follows the existing member cleanup.',
  },
  {
    fk: 'folder_members_bio_last_editor_id_fkey',
    table: 'folder_members',
    disposition: 'retained',
    where: '',
    why: 'The last editor of a teammate overview can belong to another account. Account deletion scrubs that account name while the project overview and editor reference remain with the current membership. Member removal deletes the profile row.',
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
    why: "handleDeleteMe runs DELETE FROM sessions WHERE user_id inside this same transaction, which is 11.6's rule that revocation never waits for the pruning pass.",
  },
  {
    fk: 'comment_likes_user_id_fkey',
    table: 'comment_likes',
    disposition: 'deleted',
    where: 'step 6c, in this file',
    why: "A reaction (4.15, one row per person per reaction key) carries no text: it is a per-person marker on a shared object, the same shape as my_day_entries and connections, which this transaction already deletes, and not one of 8.10's three surviving references. What a remaining member sees change is the departed person leaving each reaction's `by` list, and a reaction only they held disappearing.",
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
    why: "Retained deliberately. The row holds no text: an idempotency key, a SHA-256 of a payload, a revision string and the ids of tasks that survive in the folder. It is read a second way that is not about its actor at all — pages.ts treats any Folder page receipt on a folder (an array-valued created_task_ids; a Task or facet document's receipt holds an object) as the mark that the folder's document is on the document-transaction path, and refuses the legacy whole-page writer against it. Deleting a departed member's receipts could therefore take the last such mark off a folder that other people are still editing and re-open a writer that must stay shut for them. The rows are not orphaned: page_document_receipts_folder_id_fkey is a cascade off a real DELETE, so step 3 takes the receipts of every folder that dies with the account, and what is left belongs to a folder that outlives it.",
  },
]

/**
 * Steps 1 to 6c of 8.10, inside the caller's transaction. Afterwards the account still exists but owns no folder,
 * holds no membership, connection or pending invite, and has no rows in step 6c's tables.
 */
export async function deleteAccountData(
  tx: Executor,
  userId: string,
): Promise<AccountDeletionCounts> {
  // 1. Invalidate the invites the account offered. Invites addressed to it are someone else's and keep waiting.
  const pendingInvites = await rowsOf(
    tx,
    sql`SELECT count(*)::int AS n FROM invites
        WHERE inviter_id = ${userId} AND status = 'pending'`,
  )
  await tx.execute(
    sql`UPDATE invites SET status = 'invalidated', responded_at = now()
        WHERE inviter_id = ${userId} AND status = 'pending'`,
  )

  // 2. Shared projects go to the member who joined earliest, ties to the lower user id (8.9).
  // The default folder never transfers (INV-2, INV-3).
  const transferable = await rowsOf(
    tx,
    sql`SELECT id FROM folders f
        WHERE f.owner_id = ${userId} AND NOT f.is_default AND f.id = f.project_id
          AND EXISTS (SELECT 1 FROM folder_members m
                       WHERE m.folder_id = f.id AND m.user_id <> ${userId})
        ORDER BY f.id`,
  )
  for (const row of transferable) {
    const projectId = String(row.id)
    await transferOwnership(tx, projectId, userId)
    await tx.execute(sql`UPDATE folders SET owner_id = (
      SELECT owner_id FROM folders WHERE id = ${projectId}::uuid)
      WHERE id IN (SELECT root_folder_id FROM profile_doc_roots
        WHERE custody_project_id = ${projectId}::uuid)`)
  }

  const managedFiles = await rowsOf(tx, sql`SELECT file.id FROM files file
    JOIN folders page ON page.id = file.folder_id
    JOIN profile_doc_roots r ON r.root_folder_id = page.project_id
    JOIN folders project ON project.id = r.custody_project_id
    WHERE project.owner_id = ${userId}::uuid`)
  const managedInDoomedProjects = await rowsOf(tx, sql`SELECT r.root_folder_id
    FROM profile_doc_roots r JOIN folders p ON p.id = r.custody_project_id
    WHERE p.owner_id = ${userId}::uuid ORDER BY r.root_folder_id`)
  for (const row of managedInDoomedProjects) {
    await deleteFolderRow(tx, String(row.root_folder_id))
  }

  // 3. Delete everything still owned. Collect the files rows first: the cascade drops them,
  // and they are the only index to the bytes in the store.
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

  // 4. Leave every other folder as a clean leave would (R-CLEAN, INV-5).
  const memberships = await rowsOf(
    tx,
    sql`SELECT folder_id FROM folder_members WHERE user_id = ${userId}`,
  )
  for (const row of memberships) {
    await runRClean(tx, String(row.folder_id), userId)
  }

  // 4a. A person keeps shared writing after an ordinary departure. Account
  // deletion removes it. Project-managed writing stays with the project.
  await tx.execute(sql`DELETE FROM member_profile_sections
    WHERE member_id = ${userId}::uuid AND area = 'shared'`)
  await tx.execute(sql`DELETE FROM profile_doc_migrations
    WHERE source_member_id = ${userId}::uuid AND source_area = 'shared'`)

  // 5. Both rosters in one statement: each pair is stored once.
  const connections = await rowsOf(
    tx,
    sql`SELECT count(*)::int AS n FROM connections
        WHERE user_a_id = ${userId} OR user_b_id = ${userId}`,
  )
  await tx.execute(
    sql`DELETE FROM connections
         WHERE user_a_id = ${userId} OR user_b_id = ${userId}`,
  )
  await tx.execute(
    sql`DELETE FROM direct_conversations
         WHERE user_a_id = ${userId} OR user_b_id = ${userId}`,
  )
  await tx.execute(sql`DELETE FROM feedback WHERE user_id = ${userId}`)

  // 6. Remove any My Day entries that outlived steps 3 and 4.
  const myDayEntries = await rowsOf(
    tx,
    sql`SELECT count(*)::int AS n FROM my_day_entries WHERE user_id = ${userId}`,
  )
  await tx.execute(
    sql`DELETE FROM my_day_entries WHERE user_id = ${userId}`,
  )

  // 6a. Delete every files row the account still owns; the caller removes the objects after commit.
  // Read the blocks wearing these files first, so they show as reclaimed after ON DELETE SET NULL.
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
  for (const row of managedFiles) fileIds.add(String(row.id))
  for (const row of cascadeFiles) fileIds.add(String(row.id))
  for (const row of ownedFiles) fileIds.add(String(row.id))

  // 6c. Tables whose only tie to the account is a users(id) CASCADE that never fires (step 7 scrubs instead).
  // One literal statement per table: the guard test reads this source for `DELETE FROM <table> WHERE`.
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
      sql`DELETE FROM profile_doc_grants WHERE user_id = ${userId} RETURNING 1 AS one`,
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
  files: number
  /** Step 6c's total across its tables. */
  personalRows: number
  /** The caller removes each from the store after the transaction commits. */
  fileIds: string[]
}
