/*
The 7.13 surface: what waits in Trash and how it comes back.

Access is by folder membership at read time, never by who deleted (7.13),
so the membership join is the scope here exactly as it is everywhere else.
Two asymmetries this module is careful about:

- A task in a trashed folder is unreachable while its folder is (4.5): the
  folder waits in Trash as one entry and its tasks ride its fate, so the
  task listing and the task restore both join folders alive.
- Restore carries no 30 day guard of its own. The window is the purge's
  (11.7); a row the pass has not yet swept is a row a person may still
  save, and racing the broom to refuse them would help nobody.

The permanent delete lives at the bottom of this file, and so does the object
collection the 11.7 purge does. The endpoint calls the collection the purge
already does rather than writing a delete beside it, so the collection lives
here rather than in the pass, and
both callers hand it a selection: the pass its age predicate, the endpoint
one id the owner named. A row's files are the only index to the bytes in
the store, and whichever caller drops the row removes the objects after
the commit, 7.15's order, so a refused delete can never have destroyed
bytes whose rows survived.
*/
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type {
  GetTrashResponse,
  TrashedFolder,
  TrashedTask,
} from '../../shared/trash.js'
import type { ObjectStore } from '../files/store.js'
import { inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { recordEvent } from './events.js'
import { trashedDiscussions } from './consultation.js'
import { trashedFacets } from './facets.js'
import { mayPerform, presetOf } from './folder-access.js'
import type { FolderActorFacts } from './folder-access.js'
import type { FolderAccessPreset } from '../../shared/folder-access.js'

function toIso(value: unknown): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString()
}

/*
The view's shape is `shared/trash.ts`'s and is not restated here (#39).

It used to be: this file declared `TrashedTask`, `TrashedFolder` and
`TrashView` with the same fields the shared schemas carry, and nothing linked
the two, so `is_owner` could have been added on one side alone and the client
would have parsed a 200 into a missing field. `GET /trash` sends this value
verbatim (`routes/trash.ts`), and `api/http.ts` parses it through
`getTrashResponse`, so the parser is the contract and the server writes
against it.

Both drift directions were checked by breaking them, not reasoned about, and
the first attempt at this caught only one. A field added to the schema and
not to the mapping fails the return annotation on its own. A field added to
the mapping and not to the schema does **not**: excess-property checking
needs a fresh object literal in an annotated position, and a literal returned
from a `.map` callback loses that freshness, so `Promise<GetTrashResponse>`
alone accepted a row carrying an undeclared field that the client's
`z.object` would then have stripped in silence. The `(row): TrashedTask`
annotations on the two callbacks are what close that second direction; they
are load-bearing rather than decorative, and removing them removes half the
guard without changing a line of behaviour.
*/
export async function trashView(
  db: Db,
  viewerId: string,
): Promise<GetTrashResponse> {
  const tasks = await rowsOf(
    db,
    sql`SELECT t.id, t.title, t.folder_id, f.name AS folder_name, t.deleted_at,
               m.access,
               (f.owner_id = ${viewerId}) AS is_owner
        FROM tasks t
        JOIN folder_members m
          ON m.folder_id = t.folder_id AND m.user_id = ${viewerId}
        JOIN folders f ON f.id = t.folder_id AND f.deleted_at IS NULL
        WHERE t.deleted_at IS NOT NULL
        ORDER BY t.deleted_at DESC, t.id DESC`,
  )
  const folders = await rowsOf(
    db,
    sql`SELECT f.id, f.name, f.deleted_at, m.access,
               (f.owner_id = ${viewerId}) AS is_owner,
               (SELECT count(*)::int FROM tasks t
                 WHERE t.folder_id = f.id) AS task_count
        FROM folders f
        JOIN folder_members m
          ON m.folder_id = f.id AND m.user_id = ${viewerId}
        WHERE f.deleted_at IS NOT NULL
        ORDER BY f.deleted_at DESC, f.id DESC`,
  )
  /* The third kind (issue #210). It is read by
     `domain/facets.ts` rather than by a third query here, because the facet
     read carries the name-resolution rule -- a Work facet's name is its H1's
     text at read time -- and that rule must have exactly one implementation or
     a Trash row will one day say a different word from the tab it came from. */
  const facets = await trashedFacets(db, viewerId)
  /* The fourth kind (issue #320), read by `domain/consultation.ts` for the
     same one-implementation reason. */
  const discussions = await trashedDiscussions(db, viewerId)
  return {
    facets,
    discussions,
    tasks: tasks.map((row): TrashedTask => ({
      id: String(row.id),
      title: String(row.title),
      folder_id: String(row.folder_id),
      folder_name: String(row.folder_name),
      deleted_at: toIso(row.deleted_at),
      is_owner: Boolean(row.is_owner),
      my_access: accessOfRow(row, viewerId, String(row.folder_id)),
    })),
    folders: folders.map((row): TrashedFolder => ({
      id: String(row.id),
      name: String(row.name),
      task_count: Number(row.task_count),
      deleted_at: toIso(row.deleted_at),
      is_owner: Boolean(row.is_owner),
      my_access: accessOfRow(row, viewerId, String(row.id)),
    })),
  }
}

/**
 * The viewer's own preset off a row this view's `folder_members` join already
 * scoped (issue #268).
 *
 * **Refused rather than defaulted**, which is the rule every other reader of
 * this column keeps: each default here would be a guess about authority, and
 * the safe-looking guess is the one that decides what a screen offers. The
 * join makes the column non-null for every row this view returns, so a throw
 * here is a broken invariant and not a case to handle.
 */
function accessOfRow(
  row: Record<string, unknown>,
  viewerId: string,
  folderId: string,
): FolderAccessPreset {
  const access = presetOf(row.access)
  if (access === null) {
    throw new Error(
      `folder_members.access holds an unknown preset for ${viewerId} in ${folderId}`,
    )
  }
  return access
}

/** Clears the mark and records the return; 'not_found' covers the row that
 * does not exist, is not trashed, is out of the viewer's membership, or
 * rides a trashed folder, which 10.2 makes one answer. */
/**
 * The actor's Folder facts for a **trashed** task (issue #228).
 *
 * `folderActorFacts` refuses a trashed folder and `accessibleTask` refuses a
 * trashed task, both correctly: the ordinary surface must not see either.
 * 7.13's two acts are the exceptions, and they need the same facts over the
 * rows those predicates hide, so this is that read and nothing more.
 */
async function trashedTaskFacts(
  tx: Executor,
  viewerId: string,
  taskId: string,
): Promise<FolderActorFacts | null> {
  const found = await rowsOf(
    tx,
    sql`SELECT t.folder_id, f.name, f.is_default, m.access,
               (f.owner_id = ${viewerId}) AS is_owner
        FROM tasks t
        JOIN folder_members m
          ON m.folder_id = t.folder_id AND m.user_id = ${viewerId}
        JOIN folders f ON f.id = t.folder_id
        WHERE t.id = ${taskId}`,
  )
  const row = found[0]
  if (row === undefined) return null
  const access = presetOf(row.access)
  if (access === null) {
    throw new Error(
      `folder_members.access holds an unknown preset for ${viewerId} in ${String(row.folder_id)}`,
    )
  }
  return {
    folderId: String(row.folder_id),
    actorId: viewerId,
    access,
    isOwner: row.is_owner === true,
    isDefault: row.is_default === true,
    name: String(row.name),
  }
}

export async function restoreTask(
  db: Db,
  viewerId: string,
  taskId: string,
): Promise<'restored' | 'not_found' | { kind: 'forbidden'; reason: string }> {
  return inTransaction(db, async (tx) => {
    const homes = await rowsOf(tx,sql`SELECT folder_id FROM tasks WHERE id=${taskId}::uuid`)
    if(homes[0]===undefined)return 'not_found'
    await tx.execute(sql`SELECT 1 FROM folders WHERE id=${homes[0].folder_id}::uuid FOR UPDATE`)
    const found = await rowsOf(
      tx,
      sql`SELECT t.id, t.title, t.folder_id
          FROM tasks t
          JOIN folder_members m
            ON m.folder_id = t.folder_id AND m.user_id = ${viewerId}
          JOIN folders f ON f.id = t.folder_id AND f.deleted_at IS NULL
          WHERE t.id = ${taskId} AND t.deleted_at IS NOT NULL
          FOR UPDATE OF t`,
    )
    const row = found[0]
    if (row === undefined) return 'not_found'
    /* #228's Can-edit list: restoring from Trash sits with Can edit, beside
       trashing itself. The task is trashed, so `lockedTask` cannot see it; the read
       above is the same membership scope with the deleted_at predicate
       inverted, and the facts come from it. */
    const held = await trashedTaskFacts(tx, viewerId, taskId)
    if (held === null) return 'not_found'
    const decision = mayPerform(held, 'task.restore')
    if (!decision.allowed) {
      return { kind: 'forbidden', reason: decision.reason }
    }
    await tx.execute(
      sql`UPDATE tasks SET deleted_at = NULL, updated_at = now()
          WHERE id = ${taskId}`,
    )
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'restored',
      subjectKind: 'task',
      subjectId: taskId,
      subjectName: String(row.title),
      folderId: String(row.folder_id),
      detail: 'restored from Trash',
    })
    return 'restored'
  })
}

export async function restoreFolder(
  db: Db,
  viewerId: string,
  folderId: string,
): Promise<'restored' | 'not_found' | { kind: 'forbidden'; reason: string }> {
  return inTransaction(db, async (tx) => {
    const found = await rowsOf(
      tx,
      sql`SELECT f.id, f.name, f.is_default, m.access,
                 (f.owner_id = ${viewerId}) AS is_owner
          FROM folders f
          JOIN folder_members m
            ON m.folder_id = f.id AND m.user_id = ${viewerId}
          WHERE f.id = ${folderId} AND f.deleted_at IS NOT NULL
          FOR UPDATE OF f`,
    )
    const row = found[0]
    if (row === undefined) return 'not_found'
    /*
    #228's Full-control list -- "trash/restore Folder administratively" --
    with governing R5: Full control restores, **and so does the owner whatever
    their ordinary Access**. That second clause is the custody anchor doing
    its job: an owner who lowered themselves to Can view, and whose folder was
    then trashed by an administrator, must still be able to get it back. The
    resolver expresses it as `owner: 'sufficient'` and this reads the
    resolver rather than restating the rule.

    Access is resolved here rather than through `folderActorFacts`, which
    hides a trashed folder by design; the join above is the same membership
    scope with the deleted_at predicate inverted (7.13: access to a trashed
    row is by membership, never by who deleted it).
    */
    const access = presetOf(row.access)
    if (access === null) {
      throw new Error(
        `folder_members.access holds an unknown preset for ${viewerId} in ${folderId}`,
      )
    }
    const decision = mayPerform(
      {
        folderId,
        actorId: viewerId,
        access,
        isOwner: row.is_owner === true,
        isDefault: row.is_default === true,
        name: String(row.name),
      },
      'folder.restore',
    )
    if (!decision.allowed) {
      return { kind: 'forbidden', reason: decision.reason }
    }
    await tx.execute(
      sql`UPDATE folders SET deleted_at = NULL WHERE id = ${folderId}`,
    )
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'restored',
      subjectKind: 'folder',
      subjectId: folderId,
      subjectName: String(row.name),
      folderId,
      detail: 'restored from Trash',
    })
    return 'restored'
  })
}

/* ------------------------------------------------------------------ *
 * The object collection and the permanent delete (items 36 and 38)
 * ------------------------------------------------------------------ */

export interface DestroyedFolders {
  folderIds: string[]
  /** The files rows the folder deletes cascaded away, whoever uploaded
   * them: the caller removes each from the store after its commit. */
  fileIds: string[]
}

export interface DestroyedTasks {
  taskIds: string[]
  /** The files rows that hung on the tasks' conversations alone and were
   * deleted with them; the caller removes each from the store after its
   * commit. */
  fileIds: string[]
}

/**
 * Deletes the folders `doomed` selects and collects the files rows the
 * cascade drops, in one statement over one snapshot (11.7). `doomed` is a query answering folder ids and carries
 * its own lock clause, so the purge's SKIP LOCKED claim and the endpoint's
 * FOR UPDATE both read as the same act: the claim, the collection and the
 * delete are three CTEs of one statement, which is what keeps the purge the
 * single wrapperless statement the scheduler's own test pins.
 */
export async function destroyFolders(
  executor: Executor,
  doomed: SQL,
): Promise<DestroyedFolders> {
  const rows = await rowsOf(
    executor,
    sql`WITH doomed AS (${doomed}),
        victims AS (
          SELECT f.id AS file_id, f.folder_id
            FROM files f JOIN doomed d ON d.id = f.folder_id),
        removed AS (
          DELETE FROM folders WHERE id IN (SELECT id FROM doomed)
          RETURNING id)
        SELECT r.id AS folder_id, v.file_id
          FROM removed r LEFT JOIN victims v ON v.folder_id = r.id`,
  )
  const folderIds = new Set<string>()
  const fileIds: string[] = []
  for (const row of rows) {
    folderIds.add(String(row.folder_id))
    if (row.file_id !== null && row.file_id !== undefined) {
      fileIds.push(String(row.file_id))
    }
  }
  return { folderIds: [...folderIds], fileIds }
}

/**
 * Deletes the tasks `doomed` selects. A task carries no files row of its
 * own (4.16 scopes files to folders), but its conversation may: 4.15's
 * comment_files hang uploads on comments, and the task's cascade takes the
 * comments and with them the only reference anyone had to those rows. So
 * the statement collects the files that hung on the doomed tasks'
 * conversations and on nothing else, and a second statement deletes those
 * rows; a file also placed on a page, a cover, or another task's
 * conversation stays, its other reference being a live one. The second
 * statement runs only when the first collected something, so a purge with
 * nothing to collect is still the single statement it has always been.
 */
export async function destroyTasks(
  executor: Executor,
  doomed: SQL,
): Promise<DestroyedTasks> {
  const rows = await rowsOf(
    executor,
    sql`WITH doomed AS (${doomed}),
        victims AS (
          SELECT DISTINCT cf.file_id
            FROM comment_files cf
            JOIN comments c ON c.id = cf.comment_id
            JOIN doomed d ON d.id = c.task_id
           WHERE NOT EXISTS (
                   SELECT 1 FROM comment_files o
                   JOIN comments oc ON oc.id = o.comment_id
                   WHERE o.file_id = cf.file_id
                     AND (oc.task_id IS NULL
                          OR oc.task_id NOT IN (SELECT id FROM doomed)))
             AND NOT EXISTS (SELECT 1 FROM page_blocks b WHERE b.file_id = cf.file_id)
             AND NOT EXISTS (SELECT 1 FROM folders fo WHERE fo.cover_file_id = cf.file_id)
             AND NOT EXISTS (SELECT 1 FROM shelves s WHERE s.cover_file_id = cf.file_id)
             AND NOT EXISTS (SELECT 1 FROM user_page_covers u WHERE u.file_id = cf.file_id)),
        removed AS (
          DELETE FROM tasks WHERE id IN (SELECT id FROM doomed)
          RETURNING id)
        SELECT r.id AS task_id, NULL::uuid AS file_id FROM removed r
        UNION ALL
        SELECT NULL::uuid AS task_id, v.file_id FROM victims v`,
  )
  const taskIds: string[] = []
  const fileIds: string[] = []
  for (const row of rows) {
    if (row.task_id !== null && row.task_id !== undefined) {
      taskIds.push(String(row.task_id))
    }
    if (row.file_id !== null && row.file_id !== undefined) {
      fileIds.push(String(row.file_id))
    }
  }
  if (fileIds.length > 0) {
    await executor.execute(
      sql`DELETE FROM files WHERE id IN (${sql.join(
        fileIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    )
  }
  return { taskIds, fileIds }
}

/** The after-commit half, shared by the purge and the endpoint: every row
 * that named these objects is gone, so a refused rm is unreachable bytes
 * rather than a failure anyone can act on, and it must fail neither the
 * pass nor the response. */
export async function removeObjects(
  store: ObjectStore | undefined,
  fileIds: readonly string[],
): Promise<void> {
  if (store === undefined) return
  for (const id of fileIds) {
    try {
      await store.remove(id)
    } catch {
      // Unreachable bytes: see above.
    }
  }
}

export type DestroyOutcome =
  | { kind: 'destroyed'; fileIds: string[] }
  /** Visible to the caller and not theirs to perform, so this is 403 and not
   * 10.2's 404. The two acts no longer share one rule: permanently deleting
   * a **task** is Full control's (#228's Full-control list), and permanently
   * destroying a **folder** needs custody *and* Full control together (#228
   * and governing R5), so the refusal carries the resolver's own sentence
   * rather than one string for both. */
  | { kind: 'forbidden'; reason: string }
  /** Does not exist, is not in Trash, rides a trashed folder, or is out of
   * the viewer's membership: one answer (10.2). */
  | { kind: 'not_found' }

/**
 * DELETE /trash/tasks/:id. A Full-control member destroys a trashed task and
 * everything that hung on it, the way the purge would have at thirty days.
 * Only a trashed row qualifies: the live delete is 7.6's soft one, and a
 * permanent delete that skipped Trash would be a second, shorter road to the
 * same end. The event is recorded against the folder, which survives, so
 * the members' log says the row is gone and who took it.
 */
export async function destroyTask(
  db: Db,
  viewerId: string,
  taskId: string,
): Promise<DestroyOutcome> {
  return inTransaction(db, async (tx) => {
    const found = await rowsOf(
      tx,
      sql`SELECT t.title, t.folder_id, (f.owner_id = ${viewerId}) AS is_owner
          FROM tasks t
          JOIN folder_members m
            ON m.folder_id = t.folder_id AND m.user_id = ${viewerId}
          JOIN folders f ON f.id = t.folder_id AND f.deleted_at IS NULL
          WHERE t.id = ${taskId} AND t.deleted_at IS NOT NULL
          FOR UPDATE OF t`,
    )
    const row = found[0]
    if (row === undefined) return { kind: 'not_found' } as const
    /* #228 gives permanently deleting a Task from Trash to Full control:
       permanent deletion is an irreversible administrative act. Ownership is
       not authority (#209): a Full-control administrator who never owned the
       folder has it, and an owner who lowered their own Access does not. */
    const facts = await trashedTaskFacts(tx, viewerId, taskId)
    if (facts === null) return { kind: 'not_found' } as const
    const decision = mayPerform(facts, 'task.destroy')
    if (!decision.allowed) {
      return { kind: 'forbidden', reason: decision.reason } as const
    }
    const destroyed = await destroyTasks(
      tx,
      sql`SELECT id FROM tasks WHERE id = ${taskId}`,
    )
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'deleted',
      subjectKind: 'task',
      subjectId: taskId,
      subjectName: String(row.title),
      folderId: String(row.folder_id),
      detail: 'deleted permanently',
    })
    return { kind: 'destroyed', fileIds: destroyed.fileIds } as const
  })
}

/**
 * DELETE /trash/folders/:id. The owner, holding Full control, destroys a
 * trashed folder: its
 * tasks and their conversations, its page, its files rows and (after the
 * commit, by the caller) their bytes, its memberships and its events all go
 * by the named cascades, exactly as the purge takes them. No event records
 * it, because the folder's events cascade with the folder and an event
 * with nowhere to be read is not a record.
 */
export async function destroyFolder(
  db: Db,
  viewerId: string,
  folderId: string,
): Promise<DestroyOutcome> {
  return inTransaction(db, async (tx) => {
    const found = await rowsOf(
      tx,
      sql`SELECT (f.owner_id = ${viewerId}) AS is_owner, f.name, f.is_default,
                 m.access
          FROM folders f
          JOIN folder_members m
            ON m.folder_id = f.id AND m.user_id = ${viewerId}
          WHERE f.id = ${folderId} AND f.deleted_at IS NOT NULL
          FOR UPDATE OF f`,
    )
    const row = found[0]
    if (row === undefined) return { kind: 'not_found' } as const
    /* #228 and governing R5: permanent structural destruction requires custody
       **and** active administrative authority together -- the owner, who is
       also currently Full control. Either alone is refused. The resolver
       expresses it as `owner: 'required'` over a `full_control` bar. */
    const access = presetOf(row.access)
    if (access === null) {
      throw new Error(
        `folder_members.access holds an unknown preset for ${viewerId} in ${folderId}`,
      )
    }
    const decision = mayPerform(
      {
        folderId,
        actorId: viewerId,
        access,
        isOwner: row.is_owner === true,
        isDefault: row.is_default === true,
        name: String(row.name),
      },
      'folder.destroy',
    )
    if (!decision.allowed) {
      return { kind: 'forbidden', reason: decision.reason } as const
    }
    const destroyed = await destroyFolders(
      tx,
      sql`SELECT id FROM folders WHERE id = ${folderId}`,
    )
    return { kind: 'destroyed', fileIds: destroyed.fileIds } as const
  })
}
