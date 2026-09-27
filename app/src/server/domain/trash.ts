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
import {
  joinVisibleFolder,
  mayPerform,
  presetFromRow,
  resolveScoped,
  visibleFolder,
} from './folder-access.js'
import type { FolderAccessPreset } from '../../shared/folder-access.js'
import {
  destroyableTrashedWith,
  ensureHomeBlock,
  lockPageTree,
  releaseSurvivors,
  restoreTrashedPage,
} from './page-tree.js'

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
        ${joinVisibleFolder(viewerId, { folderId: sql`t.folder_id`, folder: 'f' })}
        WHERE t.deleted_at IS NOT NULL
        ORDER BY t.deleted_at DESC, t.id DESC`,
  )
  const folders = await rowsOf(
    db,
    sql`SELECT f.id, f.name, f.deleted_at, m.access,
               (f.owner_id = ${viewerId}) AS is_owner,
               CASE WHEN f.project_id <> f.id
                         AND ${visibleFolder(sql`f.project_id`, viewerId, { trashed: 'any' })}
                    THEN (SELECT pr.name FROM folders pr WHERE pr.id = f.project_id) END
                 AS project_name,
               (SELECT count(*)::int FROM tasks t
                 WHERE t.folder_id = f.id) AS task_count
        FROM folders f
        ${joinVisibleFolder(viewerId, { folder: 'f', trashed: 'trashed' })}
        WHERE
          /* Wave 2: a sub-page trashed with its parent rides the parent's
             entry, which restores and purges the set. It is listed on its
             own only for a viewer who cannot see that entry (not a member
             of the initiating page), so it never vanishes from the one
             Trash that could bring it back. */
          (f.trashed_with_folder_id IS NULL
               OR NOT ${visibleFolder(sql`f.trashed_with_folder_id`, viewerId, { trashed: 'any' })})
        ORDER BY f.deleted_at DESC, f.id DESC`,
  )
  /* The third kind (issue #210). Since step 7 (migration 0061) a facet is a tab, and a trashed tab is
     listed with the folders above; the field stays, empty, for clients
     that read it. */
  const facets: [] = []
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
      project_name: row.project_name === null || row.project_name === undefined ? null : String(row.project_name),
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
  return presetFromRow(row.access, viewerId, folderId)
}

/** Clears the mark and records the return; 'not_found' covers the row that
 * does not exist, is not trashed, is out of the viewer's membership, or
 * rides a trashed folder, which 10.2 makes one answer. */
export async function restoreTask(
  db: Db,
  viewerId: string,
  taskId: string,
): Promise<'restored' | 'not_found' | { kind: 'forbidden'; reason: string }> {
  return inTransaction(db, async (tx) => {
    const homes = await rowsOf(tx,sql`SELECT folder_id FROM tasks WHERE id=${taskId}::uuid`)
    if(homes[0]===undefined)return 'not_found'
    await tx.execute(sql`SELECT 1 FROM folders WHERE id=${homes[0].folder_id}::uuid FOR UPDATE`)
    /* #228's Can-edit list: restoring from Trash sits with Can edit, beside
       trashing itself. The task is trashed, so `lockedTask` cannot see it;
       this is the same scope with the row's trash predicate inverted, and
       the facts come from the same locked read. */
    const found = await resolveScoped(tx, 'task', taskId, viewerId, {
      columns: sql`t.title, t.folder_id`,
      row: 'trashed',
      lock: true,
    })
    if (found === null) return 'not_found'
    const { row } = found
    const decision = mayPerform(found.facts, 'task.restore')
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

const ONE_DISCUSSION_TAB = 'This project already has a Discussion tab. Move it to Trash to bring this one back.'

/** SQLSTATE 23505 on the named index, never the server's prose. */
function violates(error: unknown, constraint: string): boolean {
  const e = error as { code?: unknown; constraint?: unknown; cause?: unknown } | null
  if (e === null || typeof e !== 'object') return false
  if (e.code === '23505' && e.constraint === constraint) return true
  return e.cause !== undefined && violates(e.cause, constraint)
}

export async function restoreFolder(
  db: Db,
  viewerId: string,
  folderId: string,
): Promise<
  | 'restored'
  | 'not_found'
  | { kind: 'forbidden'; reason: string }
  | { kind: 'conflict'; reason: string }
> {
  try {
    return await restoreFolderOnce(db, viewerId, folderId)
  } catch (error) {
    /* Step 7: one live Discussion tab per project. The check below answers
       the ordinary case; a tab brought back with its set is refused here. */
    if (violates(error, 'folders_one_discussion_per_project_idx')) {
      return { kind: 'conflict', reason: ONE_DISCUSSION_TAB }
    }
    throw error
  }
}

async function restoreFolderOnce(
  db: Db,
  viewerId: string,
  folderId: string,
): Promise<
  | 'restored'
  | 'not_found'
  | { kind: 'forbidden'; reason: string }
  | { kind: 'conflict'; reason: string }
> {
  return inTransaction(db, async (tx) => {
    // The tree lock before any row lock (page-tree.ts's lock order).
    await lockPageTree(tx)
    const found = await resolveScoped(tx, 'folder', folderId, viewerId, {
      folder: 'trashed',
      lock: true,
    })
    if (found === null) return 'not_found'
    /*
    #228's Full-control list -- "trash/restore Folder administratively" --
    with governing R5: Full control restores, **and so does the owner whatever
    their ordinary Access**. That second clause is the custody anchor doing
    its job: an owner who lowered themselves to Can view, and whose folder was
    then trashed by an administrator, must still be able to get it back. The
    resolver expresses it as `owner: 'sufficient'` and this reads the
    resolver rather than restating the rule.

    The read above is the ordinary membership scope with the Folder's trash
    predicate inverted (7.13: access to a trashed row is by membership, never
    by who deleted it).
    */
    const decision = mayPerform(found.facts, 'folder.restore')
    if (!decision.allowed) {
      return { kind: 'forbidden', reason: decision.reason }
    }
    /* Step 7: a Discussion tab whose project made another one while it was
       in Trash stays there; a project has one live Discussion tab. */
    const second = await rowsOf(
      tx,
      sql`SELECT 1 FROM folders t
            JOIN folders other ON other.project_id = t.project_id AND other.id <> t.id
           WHERE t.id = ${folderId}::uuid AND t.kind = 'discussion'
             AND other.kind = 'discussion' AND other.deleted_at IS NULL`,
    )
    if (second.length > 0) return { kind: 'conflict', reason: ONE_DISCUSSION_TAB }
    /* Wave 2: restoring a page on its own (a sub-page restored ahead of the
       page it was trashed with) takes it out of that set, and restoring an
       initiator brings its set back (`restorePageSubtree`). A page whose
       parent is live comes back with its home `page` block, appended at the
       end of the parent's document when it has none. */
    await restoreTrashedPage(tx, viewerId, folderId, found.facts.name)
    await ensureHomeBlock(tx, folderId)
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
  /* Step 7: one transaction (a savepoint inside the caller's), because the
     claim, the release of survivors and the delete must see the same rows.
     A project root's pages go with it (`folders_project_id_fkey`), so their
     files are collected too; a page that survives is released first. */
  return (executor as unknown as {
    transaction<T>(run: (tx: Executor) => Promise<T>): Promise<T>
  }).transaction(async (tx) => {
    const picked = await rowsOf(tx, sql`WITH doomed AS (${doomed}) SELECT id FROM doomed`)
    const ids = picked.map((row) => String(row.id))
    if (ids.length === 0) return { folderIds: [], fileIds: [] }
    await releaseSurvivors(tx, ids)
    const list = sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)
    const files = await rowsOf(
      tx,
      sql`SELECT f.id FROM files f JOIN folders fo ON fo.id = f.folder_id
           WHERE fo.id IN (${list}) OR fo.project_id IN (${list})`,
    )
    const removed = await rowsOf(tx, sql`DELETE FROM folders WHERE id IN (${list}) RETURNING id`)
    return {
      folderIds: removed.map((row) => String(row.id)),
      fileIds: files.map((row) => String(row.id)),
    }
  })
}

/**
 * Deletes the tasks `doomed` selects. A task carries no files row of its
 * own (4.16 scopes files to folders), and since M5 (migration 0059) no
 * comments either: its conversation is its Discussion, which a purge leaves
 * standing, unlinked (`discussions_task_id_fkey` SET NULL), with its files.
 * So there is nothing to collect, and `fileIds` is always empty; the field
 * stays so every caller keeps one shape.
 */
export async function destroyTasks(
  executor: Executor,
  doomed: SQL,
): Promise<DestroyedTasks> {
  const rows = await rowsOf(
    executor,
    sql`WITH doomed AS (${doomed})
        DELETE FROM tasks WHERE id IN (SELECT id FROM doomed)
        RETURNING id`,
  )
  return { taskIds: rows.map((row) => String(row.id)), fileIds: [] }
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
    const found = await resolveScoped(tx, 'task', taskId, viewerId, {
      columns: sql`t.title, t.folder_id`,
      row: 'trashed',
      lock: true,
    })
    if (found === null) return { kind: 'not_found' } as const
    const { row } = found
    /* #228 gives permanently deleting a Task from Trash to Full control:
       permanent deletion is an irreversible administrative act. Ownership is
       not authority (#209): a Full-control administrator who never owned the
       folder has it, and an owner who lowered their own Access does not. */
    const decision = mayPerform(found.facts, 'task.destroy')
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
    const found = await resolveScoped(tx, 'folder', folderId, viewerId, {
      folder: 'trashed',
      lock: true,
    })
    if (found === null) return { kind: 'not_found' } as const
    /* #228 and governing R5: permanent structural destruction requires custody
       **and** active administrative authority together -- the owner, who is
       also currently Full control. Either alone is refused. The resolver
       expresses it as `owner: 'required'` over a `full_control` bar. */
    const decision = mayPerform(found.facts, 'folder.destroy')
    if (!decision.allowed) {
      return { kind: 'forbidden', reason: decision.reason } as const
    }
    /* Wave 2: the pages trashed with this one go with it, each that this
       actor may destroy on its own terms; the rest are released by
       `folders_trashed_with_folder_id_fkey`'s SET NULL and stay in Trash as
       entries of their own. The 11.7 purge needs no such step: the set
       shares its initiator's `deleted_at`, so it ages out together. */
    const alsoDoomed = await destroyableTrashedWith(tx, viewerId, folderId)
    const destroyed = await destroyFolders(
      tx,
      sql`SELECT id FROM folders WHERE id IN (${sql.join(
        [folderId, ...alsoDoomed].map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    )
    return { kind: 'destroyed', fileIds: destroyed.fileIds } as const
  })
}
