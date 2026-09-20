/*
The M1 Label domain (issue #226, parent #208): definitions in two scopes,
three assignment relations, five caps, and the two batch projections every
Task and Folder read is assembled from.

Routes validate and serialize; every decision that touches rows is here,
behind the rule the rest of this directory keeps — no query leaves this file
without being scoped to the viewer or to a target the caller has already
resolved access on. Results are discriminated unions rather than thrown
statuses, so the route layer owns the mapping onto 7.0's taxonomy.

## Four things worth reading before changing anything here

**Scope is part of identity and the database knows it.** Migration 0022's two
composite foreign keys are the load-bearing part of this feature, not the
handlers below: `task_folder_labels` carries its Folder and both of its keys
are composite against it, so a Folder Label from Folder A on a Task in Folder
B is a row Postgres refuses. The guards in this file exist to turn that
refusal into a 422 a person can read, never to be the only thing standing
between the two Folders. If you find yourself relaxing a guard, check the
constraint first: it will refuse you anyway, and a 500 is what that looks
like from a route.

**A Personal Label is private, and privacy here is a property of the FROM
clause.** Every statement below that touches `task_personal_labels` or
`folder_personal_labels` carries `owner_user_id = <viewer>`, so a statement
that forgets its scope returns nothing rather than somebody else's
classification of shared work. That is the same construction 10.2's
membership join is, applied to a second kind of privacy.

**The two projection readers are batch readers, and they must stay that way.**
`taskLabelsFor` and `folderPersonalLabelsFor` each take every id at once and
answer with a Map. `readCards` calls the first once per list endpoint, so a
thousand-row view costs one extra statement rather than a thousand; AC-474
drives a list endpoint through a recording executor and fails if the count
moves with the number of rows.

**The access-loss rule is an absence rather than a mechanism.** #208 says a
Personal assignment may remain stored while its owner temporarily loses access
to the target, and must be completely invisible to reads, filters, search and
counts while that lasts. Both readers below join through the membership scope
themselves, so a retained row on a Folder the viewer was removed from
contributes nothing to any answer, and a restored membership makes it visible
again with no repair step. Nothing here deletes an assignment on access loss,
and nothing should: purging the target is what removes it, by the cascade.
*/
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import {
  FOLDER_LABEL_DEFINITION_CAP,
  FOLDER_PERSONAL_LABEL_CAP,
  PERSONAL_LABEL_DEFINITION_CAP,
  TASK_FOLDER_LABEL_CAP,
  TASK_PERSONAL_LABEL_CAP,
} from '../../shared/labels.js'
import type {
  GetLabelsQuery,
  LabelDefinition,
  LabelRef,
  LabelScope,
  TaskLabels,
} from '../../shared/labels.js'
import { idSet, inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'

/* ------------------------------------------------------------------ *
 * Serialization
 * ------------------------------------------------------------------ */

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

/**
 * The columns both read shapes are built from, and the one place the wire's
 * `archived` boolean is derived from the row's `archived_at` instant.
 *
 * `sort_name` is `lower(name)` given a name of its own because the batch
 * readers order across a UNION, and a set operation's ORDER BY may name only
 * output columns — `lower(name)` there is a syntax error on both backends.
 * Selecting the key is how the order stays the one sentence it is.
 */
const LABEL_COLUMNS = sql`l.id, l.scope, l.name, l.color, l.description,
       (l.archived_at IS NOT NULL) AS archived, l.folder_id,
       lower(l.name) AS sort_name`

/**
 * The order every Label list in this feature comes back in: active before
 * archived, then lower(name), then id.
 *
 * #208 fixes it, and it is written once because three readers produce Label
 * lists — the definition listing, the Task projection and the Folder
 * projection — and an order stated three times is an order that can one day
 * disagree with itself. `archived` is a boolean and false sorts first, which
 * is the active-first half; the id is the tiebreak that makes the order total,
 * so a page of Labels is stable across reads rather than merely usually so.
 */
const LABEL_ORDER = sql`archived ASC, sort_name ASC, id ASC`

function refFromRow(row: Record<string, unknown>): LabelRef {
  return {
    id: String(row.id),
    scope: String(row.scope) as LabelScope,
    name: String(row.name),
    color: String(row.color),
    archived: row.archived === true,
    folder_id: nullableString(row.folder_id),
  }
}

function definitionFromRow(row: Record<string, unknown>): LabelDefinition {
  return {
    ...refFromRow(row),
    description: nullableString(row.description),
  }
}

/* ------------------------------------------------------------------ *
 * The projections
 * ------------------------------------------------------------------ */

/**
 * The Labels of many Tasks at once: the viewer's own Personal ones, and each
 * Task's Folder ones, never another member's Personal ones.
 *
 * **One statement whatever the row count**, which is the property #226 asks
 * for by name and AC-474 measures. The two halves are a UNION ALL rather than
 * two round trips because they are ordered together and grouped together, and
 * because two statements is the first step toward two per row.
 *
 * **Both halves carry their own scope**, although every caller hands over ids
 * that came from a scoped read. That is 10.2's rule applied to a statement
 * whose caller happens to be trustworthy, and here it is also the access-loss
 * rule's implementation: delete the id list and each half returns the viewer's
 * own accessible rows, delete the scope and it returns nothing. Neither alone
 * is the authorization.
 */
export async function taskLabelsFor(
  executor: Executor,
  viewerId: string,
  taskIds: readonly string[],
): Promise<Map<string, TaskLabels>> {
  const byTask = new Map<string, TaskLabels>()
  for (const id of taskIds) byTask.set(id, { personal: [], folder: [] })
  if (taskIds.length === 0) return byTask

  const ids = idSet(taskIds)
  const found = await rowsOf(
    executor,
    sql`SELECT target_id, bucket, id, scope, name, color, archived, folder_id,
               sort_name
        FROM (
          SELECT tpl.task_id AS target_id, 'personal' AS bucket, ${LABEL_COLUMNS}
            FROM task_personal_labels tpl
            JOIN labels l ON l.id = tpl.label_id
            JOIN tasks t ON t.id = tpl.task_id AND t.deleted_at IS NULL
            JOIN folders f ON f.id = t.folder_id AND f.deleted_at IS NULL
            JOIN folder_members m
              ON m.folder_id = t.folder_id AND m.user_id = ${viewerId}
           WHERE tpl.owner_user_id = ${viewerId}
             AND tpl.task_id IN ${ids}
          UNION ALL
          SELECT tfl.task_id AS target_id, 'folder' AS bucket, ${LABEL_COLUMNS}
            FROM task_folder_labels tfl
            JOIN labels l ON l.id = tfl.label_id
            JOIN tasks t ON t.id = tfl.task_id AND t.deleted_at IS NULL
            JOIN folders f ON f.id = t.folder_id AND f.deleted_at IS NULL
            JOIN folder_members m
              ON m.folder_id = t.folder_id AND m.user_id = ${viewerId}
           WHERE tfl.task_id IN ${ids}
        ) applied
        ORDER BY target_id ASC, bucket ASC, ${LABEL_ORDER}`,
  )

  for (const row of found) {
    const entry = byTask.get(String(row.target_id))
    if (entry === undefined) continue
    const ref = refFromRow(row)
    if (String(row.bucket) === 'personal') entry.personal.push(ref)
    else entry.folder.push(ref)
  }
  return byTask
}

/** One Task's projection, for the single-row read path. The same statement
 * with a list of one, rather than a second query that could scope itself
 * differently from the batch. */
export async function taskLabelsOf(
  executor: Executor,
  viewerId: string,
  taskId: string,
): Promise<TaskLabels> {
  const found = await taskLabelsFor(executor, viewerId, [taskId])
  return found.get(taskId) ?? { personal: [], folder: [] }
}

/**
 * The viewer's own Personal Labels on many Folders at once.
 *
 * Personal only, and there is no second array: a Folder Label belongs to one
 * Folder and classifies the Tasks inside it, never the Folder that owns them
 * (#208 R4). The scope is the membership join plus `owner_user_id`, for
 * `taskLabelsFor`'s reasons.
 */
export async function folderPersonalLabelsFor(
  executor: Executor,
  viewerId: string,
  folderIds: readonly string[],
): Promise<Map<string, LabelRef[]>> {
  const byFolder = new Map<string, LabelRef[]>()
  for (const id of folderIds) byFolder.set(id, [])
  if (folderIds.length === 0) return byFolder

  const found = await rowsOf(
    executor,
    sql`SELECT fpl.folder_id AS target_id, ${LABEL_COLUMNS}
        FROM folder_personal_labels fpl
        JOIN labels l ON l.id = fpl.label_id
        JOIN folders f ON f.id = fpl.folder_id AND f.deleted_at IS NULL
        JOIN folder_members m
          ON m.folder_id = fpl.folder_id AND m.user_id = ${viewerId}
       WHERE fpl.owner_user_id = ${viewerId}
         AND fpl.folder_id IN ${idSet(folderIds)}
       ORDER BY target_id ASC, ${LABEL_ORDER}`,
  )

  for (const row of found) {
    byFolder.get(String(row.target_id))?.push(refFromRow(row))
  }
  return byFolder
}

/* ------------------------------------------------------------------ *
 * GET /labels
 * ------------------------------------------------------------------ */

export type ListLabelsResult =
  | { kind: 'listed'; labels: LabelDefinition[] }
  /** The `folder_id` selector named a Folder the viewer cannot reach. 404
   * rather than 403, because a 403 confirms the Folder exists (10.2). */
  | { kind: 'folder_not_found' }

/**
 * Every definition the viewer may read, filtered by the three query fields.
 *
 * **The two halves are scoped differently because the two scopes are
 * different.** A Personal definition is the viewer's own and nobody else's;
 * a Folder definition belongs to a live Folder the viewer is currently a
 * member of, which is the membership join again. Without `folder_id` the
 * Folder half is every such Folder, which is what #208 asks for.
 *
 * The listing order is Personal first, then Folder, and within each the
 * shared order: active before archived, lower(name), id. #208 writes it as
 * "Personal first, then Folder context, lower(name), id"; the Folder half is
 * grouped by its Folder so that a picker rendering "This Folder" headings
 * gets contiguous rows without a second sort.
 */
export async function listLabels(
  db: Db,
  viewerId: string,
  query: GetLabelsQuery,
): Promise<ListLabelsResult> {
  if (query.folder_id !== undefined) {
    const reachable = await rowsOf(
      db,
      sql`SELECT 1 FROM folders f
          JOIN folder_members m ON m.folder_id = f.id AND m.user_id = ${viewerId}
          WHERE f.id = ${query.folder_id} AND f.deleted_at IS NULL`,
    )
    if (reachable.length === 0) return { kind: 'folder_not_found' }
  }

  const state =
    query.state === 'all'
      ? sql``
      : query.state === 'active'
        ? sql` AND l.archived_at IS NULL`
        : sql` AND l.archived_at IS NOT NULL`

  const halves: SQL[] = []
  if (query.scope !== 'folder') {
    halves.push(sql`
      SELECT 0 AS scope_rank, NULL::uuid AS folder_rank, ${LABEL_COLUMNS}
        FROM labels l
       WHERE l.scope = 'personal' AND l.owner_user_id = ${viewerId}${state}`)
  }
  if (query.scope !== 'personal') {
    const one =
      query.folder_id === undefined
        ? sql``
        : sql` AND l.folder_id = ${query.folder_id}`
    halves.push(sql`
      SELECT 1 AS scope_rank, l.folder_id AS folder_rank, ${LABEL_COLUMNS}
        FROM labels l
        JOIN folders f ON f.id = l.folder_id AND f.deleted_at IS NULL
        JOIN folder_members m
          ON m.folder_id = l.folder_id AND m.user_id = ${viewerId}
       WHERE l.scope = 'folder'${one}${state}`)
  }
  if (halves.length === 0) return { kind: 'listed', labels: [] }

  const found = await rowsOf(
    db,
    sql`SELECT * FROM (${sql.join(halves, sql` UNION ALL `)}) visible
        ORDER BY scope_rank ASC, folder_rank ASC NULLS FIRST, ${LABEL_ORDER}`,
  )
  return { kind: 'listed', labels: found.map(definitionFromRow) }
}

/* ------------------------------------------------------------------ *
 * Definitions: create, patch, archive, restore
 * ------------------------------------------------------------------ */

export interface LabelFields {
  name: string
  color: string
  description?: string | null
}

export interface LabelPatch {
  name?: string
  color?: string
  description?: string | null
}

export type CreateLabelResult =
  | { kind: 'created'; label: LabelDefinition }
  /** A Label of this name already exists in this catalog, case-insensitively,
   * archived rows included. */
  | { kind: 'duplicate_name' }
  | { kind: 'definition_cap' }

export type PatchLabelResult =
  | { kind: 'patched'; label: LabelDefinition }
  | { kind: 'not_found' }
  | { kind: 'duplicate_name' }

export type ArchiveLabelResult =
  | { kind: 'ok'; label: LabelDefinition }
  | { kind: 'not_found' }

/**
 * Whether a rejection is one of migration 0022's two case-insensitive name
 * indexes, read off the driver's structured fields rather than off its
 * message.
 *
 * The name collision is resolved by the index and not by a SELECT before the
 * INSERT, which would be a check that is not tied to its write: two creates of
 * "Research" arriving together both find nothing and both insert. The index
 * decides, and this turns its 23505 into the 409 the route answers.
 *
 * The constraint name is compared rather than the server's prose, because the
 * created databases of the Postgres leg answer in this cluster's language and
 * `tests/guards/guard-postgres-leg-isolation.test.ts` fails a test that reads
 * prose. A unique violation from any *other* index is not swallowed: it is
 * rethrown, because a duplicate this code did not predict is a defect and a
 * 409 would hide it.
 */
function isDuplicateName(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 10 && current instanceof Error; depth += 1) {
    const candidate = current as Error & { code?: unknown; constraint?: unknown }
    if (candidate.code === '23505') {
      const constraint = String(candidate.constraint ?? '')
      return (
        constraint === 'labels_personal_name_idx' ||
        constraint === 'labels_folder_name_idx'
      )
    }
    current = current.cause
  }
  return false
}

async function insertLabel(
  tx: Executor,
  scope: LabelScope,
  ownerUserId: string | null,
  folderId: string | null,
  fields: LabelFields,
): Promise<CreateLabelResult> {
  try {
    const inserted = await rowsOf(
      tx,
      sql`INSERT INTO labels (scope, owner_user_id, folder_id, name, color,
                              description)
          VALUES (${scope}, ${ownerUserId}::uuid, ${folderId}::uuid,
                  ${fields.name}, ${fields.color},
                  ${fields.description ?? null})
          RETURNING id, scope, name, color, description,
                    (archived_at IS NOT NULL) AS archived, folder_id`,
    )
    const row = inserted[0]
    if (row === undefined) throw new Error('INSERT INTO labels returned no row')
    return { kind: 'created', label: definitionFromRow(row) }
  } catch (error) {
    if (isDuplicateName(error)) return { kind: 'duplicate_name' }
    throw error
  }
}

/**
 * POST /labels/personal.
 *
 * The count, the insert and the cap are one transaction behind a lock, which
 * is this directory's cap discipline (10.3): nothing sits under 500 either, so
 * a count that is not tied to its insert is a suggestion, and two creates
 * arriving together at 499 both read 499 and both insert.
 *
 * The lock is the owner's user row, because the set being counted is "the
 * Personal Labels this account holds" and the account is the only row that
 * names it — the row that would break the cap is the one neither caller has
 * created yet, so the Labels themselves cannot be locked. It is the same row
 * `createFolder` takes for the same reason, and nothing in this system holds
 * a folder or a task while waiting on a user, so the two queue rather than
 * deadlock.
 *
 * Archived definitions are inside the count. They still hold their names and
 * can be restored, so they are still definitions; excluding them would make
 * the cap something a person could exceed and then not understand.
 */
export async function createPersonalLabel(
  db: Db,
  viewerId: string,
  fields: LabelFields,
): Promise<CreateLabelResult> {
  return inTransaction(db, async (tx) => {
    await tx.execute(sql`SELECT 1 FROM users WHERE id = ${viewerId} FOR UPDATE`)
    const held = await rowsOf(
      tx,
      sql`SELECT count(*)::int AS n FROM labels
          WHERE scope = 'personal' AND owner_user_id = ${viewerId}`,
    )
    if (Number(held[0]?.n ?? 0) >= PERSONAL_LABEL_DEFINITION_CAP) {
      return { kind: 'definition_cap' }
    }
    return insertLabel(tx, 'personal', viewerId, null, fields)
  })
}

/**
 * POST /folders/:folderId/labels. The caller has resolved Folder access.
 *
 * The lock is the Folder row, for the reason above one target over: the set
 * being counted is "the Labels this Folder holds". `task-order.ts` and
 * `pages.ts` take the same row, and the ordering convention this directory
 * keeps is folder before task, which nothing here violates because nothing
 * here takes a task lock as well.
 */
export async function createFolderLabel(
  db: Db,
  folderId: string,
  fields: LabelFields,
): Promise<CreateLabelResult> {
  return inTransaction(db, async (tx) => {
    await tx.execute(
      sql`SELECT 1 FROM folders WHERE id = ${folderId}::uuid FOR UPDATE`,
    )
    const held = await rowsOf(
      tx,
      sql`SELECT count(*)::int AS n FROM labels
          WHERE scope = 'folder' AND folder_id = ${folderId}`,
    )
    if (Number(held[0]?.n ?? 0) >= FOLDER_LABEL_DEFINITION_CAP) {
      return { kind: 'definition_cap' }
    }
    return insertLabel(tx, 'folder', null, folderId, fields)
  })
}

/**
 * The scope predicate that resolves one definition for writing, written once
 * for both scopes.
 *
 * It is a WHERE clause on `labels` rather than a lookup followed by a check,
 * so a Label the viewer may not manage is not found rather than found and
 * refused — which is what makes a foreign id a 404 with no existence leak
 * (10.2). For the Folder scope it is membership of the Folder in the path,
 * and #208's interim rule is that every member may manage: there is
 * deliberately no owner test here, and #209 is where that changes.
 */
function writableLabel(
  viewerId: string,
  labelId: string,
  folderId: string | null,
): SQL {
  return folderId === null
    ? sql`l.id = ${labelId} AND l.scope = 'personal'
          AND l.owner_user_id = ${viewerId}`
    : sql`l.id = ${labelId} AND l.scope = 'folder'
          AND l.folder_id = ${folderId}
          AND EXISTS (SELECT 1 FROM folders f
                      JOIN folder_members m
                        ON m.folder_id = f.id AND m.user_id = ${viewerId}
                      WHERE f.id = l.folder_id AND f.deleted_at IS NULL)`
}

/**
 * PATCH on either scope: any subset of name, color and description.
 *
 * Editing an archived Label is allowed and this function does not ask about
 * the state, which is #208's rule stated as an absence: retiring a Label is
 * not the same as freezing it, and a person tidying their archived vocabulary
 * is doing something reasonable.
 *
 * An empty patch writes nothing and touches nothing, including `updated_at`,
 * which is the 4.5 convention `patchTask` keeps for the same reason: a request
 * that changed nothing should not look like a mutation to anything reading
 * timestamps.
 */
export async function patchLabel(
  db: Db,
  viewerId: string,
  labelId: string,
  folderId: string | null,
  patch: LabelPatch,
): Promise<PatchLabelResult> {
  return inTransaction(db, async (tx) => {
    const sets: SQL[] = []
    if (patch.name !== undefined) sets.push(sql`name = ${patch.name}`)
    if (patch.color !== undefined) sets.push(sql`color = ${patch.color}`)
    if (patch.description !== undefined) {
      sets.push(sql`description = ${patch.description}`)
    }

    if (sets.length === 0) {
      const found = await rowsOf(
        tx,
        sql`SELECT ${LABEL_COLUMNS} FROM labels l
            WHERE ${writableLabel(viewerId, labelId, folderId)}`,
      )
      const row = found[0]
      return row === undefined
        ? { kind: 'not_found' }
        : { kind: 'patched', label: definitionFromRow(row) }
    }

    sets.push(sql`updated_at = now()`)
    try {
      const updated = await rowsOf(
        tx,
        sql`UPDATE labels l SET ${sql.join(sets, sql`, `)}
            WHERE ${writableLabel(viewerId, labelId, folderId)}
            RETURNING l.id, l.scope, l.name, l.color, l.description,
                      (l.archived_at IS NOT NULL) AS archived, l.folder_id`,
      )
      const row = updated[0]
      return row === undefined
        ? { kind: 'not_found' }
        : { kind: 'patched', label: definitionFromRow(row) }
    } catch (error) {
      if (isDuplicateName(error)) return { kind: 'duplicate_name' }
      throw error
    }
  })
}

/**
 * Archive and restore, one function because they are one column.
 *
 * **No assignment is touched either way**, which is the whole of what
 * non-destructive means here and is why this is an UPDATE of one column
 * rather than an UPDATE and a DELETE. An archived Label keeps every Task and
 * Folder it is on, keeps appearing in their projections with `archived: true`,
 * and merely stops being newly applicable; restoring it re-enables
 * application under the same id, so every saved View and every filter that
 * named it still names it.
 */
export async function setLabelArchived(
  db: Db,
  viewerId: string,
  labelId: string,
  folderId: string | null,
  archived: boolean,
): Promise<ArchiveLabelResult> {
  const updated = await rowsOf(
    db,
    sql`UPDATE labels l
        SET archived_at = ${archived ? sql`now()` : sql`NULL`},
            updated_at = now()
        WHERE ${writableLabel(viewerId, labelId, folderId)}
        RETURNING l.id, l.scope, l.name, l.color, l.description,
                  (l.archived_at IS NOT NULL) AS archived, l.folder_id`,
  )
  const row = updated[0]
  return row === undefined
    ? { kind: 'not_found' }
    : { kind: 'ok', label: definitionFromRow(row) }
}

/* ------------------------------------------------------------------ *
 * Assignments
 * ------------------------------------------------------------------ */

export type AttachResult =
  | { kind: 'attached' }
  /** The target or the Label names nothing the viewer may see. One answer for
   * both, because telling them apart is the existence leak 10.2 forbids. */
  | { kind: 'not_found' }
  /** A Label the viewer can see that cannot classify this target: a Folder
   * Label from another Folder, or a Folder Label on a Folder. 422 naming
   * `label_id`, because the caller can see the thing they named and is owed
   * the reason. */
  | { kind: 'wrong_target' }
  /** #208: an archived Label cannot be newly applied. */
  | { kind: 'archived' }
  | { kind: 'assignment_cap' }

export type DetachResult = { kind: 'detached' } | { kind: 'not_found' }

/** What a Label looks like to a viewer deciding whether it may be applied. */
interface VisibleLabel {
  id: string
  scope: LabelScope
  folderId: string | null
  archived: boolean
}

/**
 * The Label if the viewer may see it at all, whatever they mean to do with
 * it, and null otherwise.
 *
 * Visibility is the union of the two scopes' rules: a Personal Label the
 * viewer owns, or a Folder Label belonging to a live Folder they are a member
 * of. It is one statement rather than two so that "can the caller see this
 * id" has one answer, and the callers below decide separately whether the
 * Label they can see fits the target they named. That separation is what
 * makes a 404 and a 422 mean different things here: not-found is "you cannot
 * see it", wrong-target is "you can, and it does not belong here".
 */
async function visibleLabel(
  executor: Executor,
  viewerId: string,
  labelId: string,
): Promise<VisibleLabel | null> {
  const found = await rowsOf(
    executor,
    sql`SELECT l.id, l.scope, l.folder_id,
               (l.archived_at IS NOT NULL) AS archived
        FROM labels l
        WHERE l.id = ${labelId}
          AND (
            (l.scope = 'personal' AND l.owner_user_id = ${viewerId})
            OR (l.scope = 'folder' AND EXISTS (
                  SELECT 1 FROM folders f
                  JOIN folder_members m
                    ON m.folder_id = f.id AND m.user_id = ${viewerId}
                  WHERE f.id = l.folder_id AND f.deleted_at IS NULL))
          )`,
  )
  const row = found[0]
  if (row === undefined) return null
  return {
    id: String(row.id),
    scope: String(row.scope) as LabelScope,
    folderId: nullableString(row.folder_id),
    archived: row.archived === true,
  }
}

/**
 * PUT /tasks/:taskId/labels/:labelId. The caller has resolved Task access and
 * hands over the Task's Folder.
 *
 * The order of the three refusals is decided here and pinned by AC-476.
 * Wrong-target is checked before archived, because scope is a fact about
 * whether the Label belongs here at all and the archive state is a fact about
 * when it may be applied: telling a caller that a Folder-A Label is archived
 * would be answering a question they did not ask, about a Label that could
 * never go on this Task even if it were active.
 *
 * The insert is `ON CONFLICT DO NOTHING`, so a repeated PUT is idempotent,
 * which #208 asks for by name: per-Label mutations exist precisely so that two
 * members applying Labels at the same moment do not erase each other the way a
 * full-set replacement would.
 *
 * The cap count and the insert are one transaction behind the Task row's lock,
 * this directory's discipline again. The lock is the Task rather than the
 * viewer because both caps this endpoint can break are counted per Task.
 */
export async function attachTaskLabel(
  db: Db,
  viewerId: string,
  taskId: string,
  taskFolderId: string,
  labelId: string,
): Promise<AttachResult> {
  return inTransaction(db, async (tx) => {
    // The lock is the first statement of the transaction, which is what
    // cap-guards.test.ts asserts of every guard in this directory: the count
    // below has to be read after the lock is held, or the second caller reads
    // the same number the first one did and both insert.
    await tx.execute(
      sql`SELECT 1 FROM tasks WHERE id = ${taskId}::uuid FOR UPDATE`,
    )

    const label = await visibleLabel(tx, viewerId, labelId)
    if (label === null) return { kind: 'not_found' }
    if (label.scope === 'folder' && label.folderId !== taskFolderId) {
      return { kind: 'wrong_target' }
    }
    if (label.archived) return { kind: 'archived' }

    if (label.scope === 'personal') {
      const held = await rowsOf(
        tx,
        sql`SELECT count(*)::int AS n FROM task_personal_labels
            WHERE task_id = ${taskId} AND owner_user_id = ${viewerId}
              AND label_id <> ${labelId}`,
      )
      if (Number(held[0]?.n ?? 0) >= TASK_PERSONAL_LABEL_CAP) {
        return { kind: 'assignment_cap' }
      }
      await tx.execute(
        sql`INSERT INTO task_personal_labels (task_id, label_id, owner_user_id)
            VALUES (${taskId}::uuid, ${labelId}::uuid, ${viewerId}::uuid)
            ON CONFLICT DO NOTHING`,
      )
      return { kind: 'attached' }
    }

    const held = await rowsOf(
      tx,
      sql`SELECT count(*)::int AS n FROM task_folder_labels
          WHERE task_id = ${taskId} AND label_id <> ${labelId}`,
    )
    if (Number(held[0]?.n ?? 0) >= TASK_FOLDER_LABEL_CAP) {
      return { kind: 'assignment_cap' }
    }
    await tx.execute(
      sql`INSERT INTO task_folder_labels (folder_id, task_id, label_id)
          VALUES (${taskFolderId}::uuid, ${taskId}::uuid, ${labelId}::uuid)
          ON CONFLICT DO NOTHING`,
    )
    return { kind: 'attached' }
  })
}

/**
 * DELETE /tasks/:taskId/labels/:labelId.
 *
 * An archived Label's assignment may be removed, which is the asymmetry #208
 * states: archive stops new application and never traps what is already
 * applied. Removing an assignment that is not there succeeds, so a repeated
 * DELETE is idempotent for the PUT's reason.
 *
 * The Personal delete carries `owner_user_id = <viewer>` although the pair
 * (task_id, label_id) is already the primary key. It is the 10.2 habit applied
 * to a DELETE: the scope is what stops the statement from ever being able to
 * remove another member's private classification, and the key is what makes it
 * one row.
 */
export async function detachTaskLabel(
  db: Db,
  viewerId: string,
  taskId: string,
  labelId: string,
): Promise<DetachResult> {
  const label = await visibleLabel(db, viewerId, labelId)
  if (label === null) return { kind: 'not_found' }
  if (label.scope === 'personal') {
    await db.execute(
      sql`DELETE FROM task_personal_labels
          WHERE task_id = ${taskId} AND label_id = ${labelId}
            AND owner_user_id = ${viewerId}`,
    )
  } else {
    await db.execute(
      sql`DELETE FROM task_folder_labels
          WHERE task_id = ${taskId} AND label_id = ${labelId}`,
    )
  }
  return { kind: 'detached' }
}

/**
 * PUT /folders/:folderId/labels/:labelId. The caller has resolved Folder
 * access.
 *
 * **Personal Labels only.** A Folder Label supplied here is a 422 naming
 * `label_id` rather than a 404, because the caller can see it: it is a real
 * Label of a Folder they belong to, and what is wrong is the target. #208 R4
 * is the rule — a Folder Label classifies the Tasks in its Folder and never
 * the Folder that owns it — and migration 0022 enforces it underneath, the
 * assignment table's `owner_user_id` being NOT NULL where a Folder Label's is
 * NULL.
 */
export async function attachFolderLabel(
  db: Db,
  viewerId: string,
  folderId: string,
  labelId: string,
): Promise<AttachResult> {
  return inTransaction(db, async (tx) => {
    // Lock first, for attachTaskLabel's reason one target over.
    await tx.execute(
      sql`SELECT 1 FROM folders WHERE id = ${folderId}::uuid FOR UPDATE`,
    )

    const label = await visibleLabel(tx, viewerId, labelId)
    if (label === null) return { kind: 'not_found' }
    if (label.scope !== 'personal') return { kind: 'wrong_target' }
    if (label.archived) return { kind: 'archived' }

    const held = await rowsOf(
      tx,
      sql`SELECT count(*)::int AS n FROM folder_personal_labels
          WHERE folder_id = ${folderId} AND owner_user_id = ${viewerId}
            AND label_id <> ${labelId}`,
    )
    if (Number(held[0]?.n ?? 0) >= FOLDER_PERSONAL_LABEL_CAP) {
      return { kind: 'assignment_cap' }
    }
    await tx.execute(
      sql`INSERT INTO folder_personal_labels (folder_id, label_id, owner_user_id)
          VALUES (${folderId}::uuid, ${labelId}::uuid, ${viewerId}::uuid)
          ON CONFLICT DO NOTHING`,
    )
    return { kind: 'attached' }
  })
}

/** DELETE /folders/:folderId/labels/:labelId, `detachTaskLabel`'s twin one
 * target over: archived assignments may be removed, and a repeat succeeds. */
export async function detachFolderLabel(
  db: Db,
  viewerId: string,
  folderId: string,
  labelId: string,
): Promise<DetachResult> {
  const label = await visibleLabel(db, viewerId, labelId)
  if (label === null) return { kind: 'not_found' }
  await db.execute(
    sql`DELETE FROM folder_personal_labels
        WHERE folder_id = ${folderId} AND label_id = ${labelId}
          AND owner_user_id = ${viewerId}`,
  )
  return { kind: 'detached' }
}

/* ------------------------------------------------------------------ *
 * The move
 * ------------------------------------------------------------------ */

/**
 * The Folder Labels a Task carries, dropped because the Task is leaving the
 * Folder that owns them.
 *
 * **This is the one line of #227's lifecycle work that #226 cannot leave
 * undone**, and the reason is the schema rather than the product: migration
 * 0022's `task_folder_labels_task_scope_fkey` holds the assignment to the
 * Task's Folder, so a Task whose `folder_id` changes with assignments standing
 * would be refused by the database and the existing move would start failing.
 * Deleting them first is also exactly what #208 R6A says a move does —
 * "Personal Labels remain, source Folder Labels are removed, no destination
 * name matching" — so the constraint and the contract want the same thing.
 *
 * Personal assignments are deliberately untouched: they are the viewer's own
 * cross-Folder vocabulary and the Task is still the same Task.
 *
 * Called inside the caller's transaction, before the UPDATE that moves the
 * row, so the two commit together or not at all.
 */
export async function dropFolderLabelsOnMove(
  tx: Executor,
  taskId: string,
): Promise<void> {
  await tx.execute(
    sql`DELETE FROM task_folder_labels WHERE task_id = ${taskId}::uuid`,
  )
}
