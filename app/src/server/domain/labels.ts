/*
The M1 Label domain (issue #226, parent #208): definitions in two scopes,
three assignment relations, five caps, and the two batch projections every
Task and Folder read is assembled from.

Routes validate and serialize; every decision that touches rows is here,
behind the rule the rest of this directory keeps — no query leaves this file
without being scoped to the viewer or to a target the caller has already
resolved access on. Results are discriminated unions rather than thrown
statuses, so the route layer owns the mapping onto 7.0's taxonomy.

## Five things worth reading before changing anything here

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
thousand-row view costs one extra statement rather than a thousand, and the
count must never move with the number of rows.

**Applying a Folder Label is authorized in this file and not in the route
(issue #274).** Every other Label gate is the route's, because every other
Label act resolves from the Folder preset alone and a route can read that
beside its own `accessOf`. The two Task-assignment endpoints cannot:
`label.apply` carries `whenAssignedToActor: ['can_contribute']`, so the answer
depends on the Task's **current assignee**, and #228's Assigned-work rule
requires that fact be read in the same transaction and snapshot as the
mutation it authorizes. So `attachTaskLabel` and `detachTaskLabel` take the
Task's row lock, read the assignee off it, resolve the actor's Folder facts
against the same snapshot, and ask `mayPerform`. Nothing below states a bar;
`shared/folder-actions.ts` holds every one of them, and this file carries the
target facts to it. The scope decides *which* action is being performed — a
Folder Label is `label.apply` and a Personal one is `personal.label`, which
#228's personal-actions rule puts outside Folder Access at membership — so the
Label has to be resolved before its actor can be judged.

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
import { LIST_ROW_CAP, takeCapped } from '../../shared/list-cap.js'
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
import { idSet, inTransaction, pairSet, rowsOf } from '../database.js'
import type { Executor, IdPair } from '../database.js'
import { recordEvent } from './events.js'
import { folderActorFacts, mayPerform } from './folder-access.js'
import type { FolderAction } from './folder-access.js'

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
 * for by name. The two halves are a UNION ALL rather than
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
  | { kind: 'listed'; labels: LabelDefinition[]; truncated: boolean }
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
  if (halves.length === 0) {
    return { kind: 'listed', labels: [], truncated: false }
  }

  /* 10.3's list cap, read one row over so that a full answer is known to have
     had something behind it without a second count — the same probe
     `views/cards.ts` calls CAP_PROBE, spelled here because that constant lives
     downstream of this module and importing it would be a cycle. The
     allocation is `takeCapped`, which every other capped body uses; this one
     has a single section, so it takes the first LIST_ROW_CAP of the order
     above and reports whether it dropped anything. */
  const found = await rowsOf(
    db,
    sql`SELECT * FROM (${sql.join(halves, sql` UNION ALL `)}) visible
        ORDER BY scope_rank ASC, folder_rank ASC NULLS FIRST, ${LABEL_ORDER}
        LIMIT ${LIST_ROW_CAP + 1}`,
  )
  const capped = takeCapped([found.map(definitionFromRow)])
  return {
    kind: 'listed',
    labels: capped.sections[0] ?? [],
    truncated: capped.truncated,
  }
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
 * The unique index a rejection came from, or null where the rejection is not a
 * 23505 at all — read off the driver's structured fields rather than off its
 * message.
 *
 * **This is the one reader of that error in this module**, and both callers
 * below go through it: the live create path, which turns two of 0022's indexes
 * into a 409, and the workflow import, which turns one of them into a 422. A
 * second hand-rolled walk of `error.cause` would be a second thing to keep in
 * step with the driver.
 *
 * The constraint name is compared rather than the server's prose, because the
 * server's prose is translated into the cluster's language.
 */
function uniqueViolationConstraint(error: unknown): string | null {
  let current: unknown = error
  for (let depth = 0; depth < 10 && current instanceof Error; depth += 1) {
    const candidate = current as Error & { code?: unknown; constraint?: unknown }
    if (candidate.code === '23505') return String(candidate.constraint ?? '')
    current = current.cause
  }
  return null
}

/**
 * Whether a rejection is one of migration 0022's two case-insensitive name
 * indexes.
 *
 * The name collision is resolved by the index and not by a SELECT before the
 * INSERT, which would be a check that is not tied to its write: two creates of
 * "Research" arriving together both find nothing and both insert. The index
 * decides, and this turns its 23505 into the 409 the route answers.
 *
 * A unique violation from any *other* index is not swallowed: it is rethrown,
 * because a duplicate this code did not predict is a defect and a 409 would
 * hide it.
 */
function isDuplicateName(error: unknown): boolean {
  const constraint = uniqueViolationConstraint(error)
  return (
    constraint === 'labels_personal_name_idx' ||
    constraint === 'labels_folder_name_idx'
  )
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
 * (10.2). For the Folder scope it is **membership** of the Folder in the path,
 * and membership only: there is deliberately no owner test, and there is
 * deliberately no Access test either.
 *
 * **The bar is the route's, and this predicate is visibility (issue #274).**
 * The two answer different questions and must not be folded together: a Label
 * of a Folder the viewer is not in must be 404, and a Label of a Folder they
 * are in that they may not manage must be **403** carrying the rule's
 * sentence. Putting the preset in this WHERE clause would turn the second
 * into the first and tell a member that their own Folder's Label does not
 * exist. `routes/labels.ts`'s `gate` asks `label.vocabulary.manage` before
 * any of this runs.
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
  /** Issue #274: the caller sees the target and the Label and may not modify
   * the Folder's shared classification of this work. 403 carrying the rule's
   * own sentence, never 404 — 10.2 forbids a 403 only where it would confirm
   * something the caller cannot already see, and a member can see both. */
  | { kind: 'forbidden'; reason: string }

export type DetachResult =
  | { kind: 'detached' }
  | { kind: 'not_found' }
  | { kind: 'forbidden'; reason: string }

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
 * Whether this actor may classify this Task with a Label of this scope, or
 * the refusal to answer with (issue #274).
 *
 * Null means "carry on", which is the shape the two callers want: every other
 * branch of theirs is a refusal too, and an authorization answer that read
 * `allowed: true` would be the one value in the function that had to be
 * unwrapped before it could be ignored.
 *
 * **Every argument is read inside the caller's transaction, under the Task
 * row lock it has already taken**, which is #228's Assigned-work requirement
 * and the reason this is not two lines in `routes/labels.ts`: a reassignment
 * that commits first must be seen, and a projection saying "assigned to me"
 * must never authorize.
 *
 * It states no bar. `shared/folder-actions.ts` holds them, and the only
 * decision here is which of the two actions the Label's scope names.
 */
async function classificationRefusal(
  tx: Executor,
  viewerId: string,
  folderId: string,
  scope: LabelScope,
  assigneeId: string | null,
): Promise<
  { kind: 'not_found' } | { kind: 'forbidden'; reason: string } | null
> {
  const facts = await folderActorFacts(tx, viewerId, folderId)
  /* Membership read again inside the transaction rather than trusted from the
     route's own read. A removal that commits in between is the same class of
     race as a reassignment, and 10.2's answer for somebody who is no longer a
     member is 404 rather than 403. */
  if (facts === null) return { kind: 'not_found' }
  const action: FolderAction =
    scope === 'folder' ? 'label.apply' : 'personal.label'
  const decision = mayPerform(facts, action, { assigneeId })
  return decision.allowed
    ? null
    : { kind: 'forbidden', reason: decision.reason }
}

/**
 * PUT /tasks/:taskId/labels/:labelId. The caller has resolved Task access;
 * the Task's Folder, its assignee and the actor's standing are all read here,
 * under the lock, because the gate below depends on all three.
 *
 * The order of the three refusals is decided here.
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
  labelId: string,
): Promise<AttachResult> {
  return inTransaction(db, async (tx) => {
    /* The lock is the first statement of the transaction: the count
       below has to be read after the lock is held, or the second caller reads
       the same number the first one did and both insert.

       It carries the two facts the gate needs besides — the Task's Folder and
       its current assignee — so that both are the row's own under the lock
       rather than a caller's argument that was true a moment ago (#274). */
    const locked = await rowsOf(
      tx,
      sql`SELECT folder_id, assignee_id FROM tasks
          WHERE id = ${taskId}::uuid FOR UPDATE`,
    )
    const task = locked[0]
    if (task === undefined) return { kind: 'not_found' }
    const taskFolderId = String(task.folder_id)

    const label = await visibleLabel(tx, viewerId, labelId)
    if (label === null) return { kind: 'not_found' }
    if (label.scope === 'folder' && label.folderId !== taskFolderId) {
      return { kind: 'wrong_target' }
    }
    /* Authority before state, and after scope. Scope is what decides which
       action this is, so it has to be settled first; the archive check below
       is a fact about the Label's state, and telling somebody who may not
       classify this work that the Label they named is archived would answer a
       question they are not entitled to ask. */
    const refusal = await classificationRefusal(
      tx,
      viewerId,
      taskFolderId,
      label.scope,
      nullableString(task.assignee_id),
    )
    if (refusal !== null) return refusal
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
    const added = await rowsOf(
      tx,
      sql`INSERT INTO task_folder_labels (folder_id, task_id, label_id)
          VALUES (${taskFolderId}::uuid, ${taskId}::uuid, ${labelId}::uuid)
          ON CONFLICT DO NOTHING
          RETURNING label_id`,
    )
    if (added.length > 0) {
      await recordLabelEvent(tx, viewerId, taskId, taskFolderId, labelId, 'added')
    }
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
 *
 * **It became a transaction in #274 and was three statements outside one
 * before.** `label.apply` governs removal exactly as it governs application —
 * R8 names both in one clause — so the assignee that authorizes it has to be
 * read under the lock the DELETE runs behind, for the reason the attach one
 * over records.
 */
export async function detachTaskLabel(
  db: Db,
  viewerId: string,
  taskId: string,
  labelId: string,
): Promise<DetachResult> {
  return inTransaction(db, async (tx) => {
    const locked = await rowsOf(
      tx,
      sql`SELECT folder_id, assignee_id FROM tasks
          WHERE id = ${taskId}::uuid FOR UPDATE`,
    )
    const task = locked[0]
    if (task === undefined) return { kind: 'not_found' }

    const label = await visibleLabel(tx, viewerId, labelId)
    if (label === null) return { kind: 'not_found' }
    const refusal = await classificationRefusal(
      tx,
      viewerId,
      String(task.folder_id),
      label.scope,
      nullableString(task.assignee_id),
    )
    if (refusal !== null) return refusal

    if (label.scope === 'personal') {
      await tx.execute(
        sql`DELETE FROM task_personal_labels
            WHERE task_id = ${taskId} AND label_id = ${labelId}
              AND owner_user_id = ${viewerId}`,
      )
    } else {
      const removed = await rowsOf(
        tx,
        sql`DELETE FROM task_folder_labels
            WHERE task_id = ${taskId} AND label_id = ${labelId}
            RETURNING label_id`,
      )
      if (removed.length > 0) {
        await recordLabelEvent(
          tx,
          viewerId,
          taskId,
          String(task.folder_id),
          labelId,
          'removed',
        )
      }
    }
    return { kind: 'detached' }
  })
}

/*
A Folder Label put on or taken off a Task is an event of that Task, so the
issue timeline can say "added bug" (m3 issue page). Only Folder Labels: a
Personal Label is its owner's private classification, and an event would show
it to every member. Only a real change records, so a repeated PUT or DELETE
adds no second row. The verb is 'edited' with the act in the detail, because
4.13's verb list is a CHECK constraint.
*/
async function recordLabelEvent(
  tx: Executor,
  viewerId: string,
  taskId: string,
  folderId: string,
  labelId: string,
  act: 'added' | 'removed',
): Promise<void> {
  const names = await rowsOf(
    tx,
    sql`SELECT (SELECT title FROM tasks WHERE id = ${taskId}::uuid) AS task,
               (SELECT name FROM labels WHERE id = ${labelId}::uuid) AS label`,
  )
  const row = names[0]
  await recordEvent(tx, {
    actorId: viewerId,
    verb: 'edited',
    subjectKind: 'task',
    subjectId: taskId,
    subjectName: String(row?.task ?? ''),
    folderId,
    detail: `${act} the label '${String(row?.label ?? '')}'`,
  })
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

/* ------------------------------------------------------------------ *
 * The lifecycle integrations (issue #227, #208 R6A)
 * ------------------------------------------------------------------ */

/*
Everything below is a copy rule, and one sentence decides all of them:

> **A Personal Label is the viewer's own and never travels to another person;
> a Folder Label belongs to its Folder and is re-created with new ids when the
> Folder is copied, never pointed at the source's ids.**

**The word "archived" means two different things across these functions, and
that is the issue's own reading rather than an inconsistency.** Archiving a
definition says "this may not be **newly applied**" (#208 R5), so a duplicate
making *new* assignments must not make one out of an archived Label.
Duplicating a Folder is not making new assignments in that sense: it copies a
Folder's whole taxonomy, state included, so archived definitions come across
archived and the assignments standing against them come with them. #227 area 9
states both halves in one paragraph, and getting one of them backwards is the
most likely way this section goes wrong.

**No cap is checked here and none needs to be.** Every copy below is bounded by
what the source already holds, and the source satisfied 10.3's cap when it was
written: a Task carries at most 100 Folder Labels, so its copy carries at most
100; a Folder holds at most 250 definitions, so its copy holds at most 250. A
cap check would refuse nothing, and to mean anything it would need the lock
`insertLabel` takes.
*/

/**
 * The Labels a duplicated Task carries, written inside the caller's
 * transaction, for a copy made **in the source's own Folder** — which is the
 * only form 7.16's `POST /tasks/:id/duplicate` has.
 *
 * The Folder Label assignments keep the **same** ids, and that is the whole
 * difference from the Folder duplicate below: the copy is in the same Folder,
 * so the Folder's vocabulary is already the copy's vocabulary, and minting a
 * second "Urgent" beside the first would be the name-merging #208 forbids,
 * read backwards.
 *
 * Only `duplicatorId`'s own Personal assignments cross, and only active
 * definitions on either side. Another member's Personal Labels are not copied
 * and are not read: the statement carries `owner_user_id = <duplicator>` for
 * the same reason every other statement in this file does.
 */
export async function copyTaskLabelsForDuplicate(
  tx: Executor,
  duplicatorId: string,
  sourceTaskId: string,
  copyTaskId: string,
): Promise<void> {
  /* The Folder rides from the source assignment row rather than from an
     argument. `task_folder_labels_task_scope_fkey` holds the pair to the
     Task's Folder, so taking the value from the row being copied makes the
     invariant unfalsifiable here rather than merely satisfied. */
  await tx.execute(
    sql`INSERT INTO task_folder_labels (folder_id, task_id, label_id)
        SELECT tfl.folder_id, ${copyTaskId}::uuid, tfl.label_id
          FROM task_folder_labels tfl
          JOIN labels l ON l.id = tfl.label_id
         WHERE tfl.task_id = ${sourceTaskId}::uuid
           AND l.archived_at IS NULL`,
  )
  await tx.execute(
    sql`INSERT INTO task_personal_labels (task_id, label_id, owner_user_id)
        SELECT ${copyTaskId}::uuid, tpl.label_id, tpl.owner_user_id
          FROM task_personal_labels tpl
          JOIN labels l ON l.id = tpl.label_id
         WHERE tpl.task_id = ${sourceTaskId}::uuid
           AND tpl.owner_user_id = ${duplicatorId}::uuid
           AND l.archived_at IS NULL`,
  )
}

/**
 * The Folder Label vocabulary of a duplicated Folder: every definition of the
 * source, archived ones included and still archived, under **new ids**.
 *
 * Answers the source-to-copy mapping, which is what the assignment copy below
 * remaps through. A caller that pointed the copy's assignments at the source's
 * ids would be refused by `task_folder_labels_label_scope_fkey` rather than
 * quietly sharing one vocabulary across two Folders, which is why this can
 * only be got wrong loudly.
 *
 * **The mapping is the reason this is a loop.** `INSERT ... SELECT ...
 * RETURNING id` answers the new ids in no defined correspondence to the rows
 * they came from, and the only column that could pair them up afterwards is
 * the name — which is exactly the name-matching #208 forbids everywhere else.
 * One statement per definition, bounded by 10.3's 250, inside a transaction
 * that already writes one statement per page block and per task.
 */
export async function copyFolderLabelCatalog(
  tx: Executor,
  sourceFolderId: string,
  copyFolderId: string,
): Promise<IdPair[]> {
  const sources = await rowsOf(
    tx,
    sql`SELECT id FROM labels
         WHERE folder_id = ${sourceFolderId}::uuid AND scope = 'folder'
         ORDER BY created_at ASC, id ASC`,
  )
  const pairs: IdPair[] = []
  for (const row of sources) {
    const sourceId = String(row.id)
    /* `archived_at` is carried as a column rather than read out and written
       back, so no timestamp crosses the driver: node-postgres hands back a
       Date and PGlite a string, and a value that never leaves the database
       cannot be spelled differently by the two legs. */
    const made = await rowsOf(
      tx,
      sql`INSERT INTO labels
            (scope, folder_id, name, color, description, archived_at)
          SELECT 'folder', ${copyFolderId}::uuid, l.name, l.color,
                 l.description, l.archived_at
            FROM labels l WHERE l.id = ${sourceId}::uuid
          RETURNING id`,
    )
    const copyId = made[0]?.id
    if (copyId === undefined) continue
    pairs.push([sourceId, String(copyId)])
  }
  return pairs
}

/**
 * The assignments of a duplicated Folder: its Tasks' Folder Labels remapped
 * onto the copied vocabulary, and the duplicator's own **active** Personal
 * Labels on the source Folder and on the source Tasks.
 *
 * `labelPairs` is `copyFolderLabelCatalog`'s answer and `taskPairs` is the
 * source-to-copy Task mapping the duplicate built as it went. Each rides as
 * one bind parameter, so the whole remap is three statements whatever the
 * Folder holds.
 *
 * **The Folder Label half copies archived assignments and the Personal half
 * does not**, which is the two readings of "archived" the section header
 * separates. The Folder's taxonomy is being duplicated, state and all; the
 * duplicator's private classification is being newly applied to work that did
 * not exist a moment ago, and an archived Personal Label may not be newly
 * applied.
 *
 * **No other member's Personal Label crosses**, in either statement, and the
 * scope is written into the FROM clause rather than inferred from the caller.
 */
export async function copyFolderLabelAssignments(
  tx: Executor,
  duplicatorId: string,
  sourceFolderId: string,
  copyFolderId: string,
  labelPairs: readonly IdPair[],
  taskPairs: readonly IdPair[],
): Promise<void> {
  if (labelPairs.length > 0 && taskPairs.length > 0) {
    await tx.execute(
      sql`INSERT INTO task_folder_labels (folder_id, task_id, label_id)
          SELECT ${copyFolderId}::uuid, tm.new_id, lm.new_id
            FROM task_folder_labels tfl
            JOIN ${pairSet(taskPairs)} tm ON tm.old_id = tfl.task_id
            JOIN ${pairSet(labelPairs)} lm ON lm.old_id = tfl.label_id
           WHERE tfl.folder_id = ${sourceFolderId}::uuid`,
    )
  }

  await tx.execute(
    sql`INSERT INTO folder_personal_labels
          (folder_id, label_id, owner_user_id)
        SELECT ${copyFolderId}::uuid, fpl.label_id, fpl.owner_user_id
          FROM folder_personal_labels fpl
          JOIN labels l ON l.id = fpl.label_id
         WHERE fpl.folder_id = ${sourceFolderId}::uuid
           AND fpl.owner_user_id = ${duplicatorId}::uuid
           AND l.archived_at IS NULL`,
  )

  if (taskPairs.length > 0) {
    await tx.execute(
      sql`INSERT INTO task_personal_labels (task_id, label_id, owner_user_id)
          SELECT tm.new_id, tpl.label_id, tpl.owner_user_id
            FROM task_personal_labels tpl
            JOIN ${pairSet(taskPairs)} tm ON tm.old_id = tpl.task_id
            JOIN labels l ON l.id = tpl.label_id
           WHERE tpl.owner_user_id = ${duplicatorId}::uuid
             AND l.archived_at IS NULL`,
    )
  }
}

/**
 * A workflow file that declares two Folder Labels whose names `lower()` makes
 * one, carried out of the import transaction with enough of the file's own
 * shape to say where.
 *
 * **The field path is the point of the class.** By the time the driver rejects
 * the INSERT, all that is left is a SQLSTATE and an index name; the folder this
 * vocabulary came from and the name that collided are known only inside the
 * loop, and a route that had to guess would answer a sentence about a file
 * without saying which part of it. `field` is the same path
 * `canonicalWorkflowBody`'s own refusals use, so a reader of the message cannot
 * tell which of the two mechanisms refused their file — which is the whole
 * intent.
 *
 * The message is the sentence itself, so `sendFieldValidationError` composes
 * `<field>: <message>.` exactly as it does for a schema issue.
 */
export class WorkflowLabelNameConflict extends Error {
  constructor(
    readonly folderIndex: number,
    readonly labelName: string,
  ) {
    super(
      `labels: the name ${JSON.stringify(labelName)} is declared twice in ` +
        'one folder, and names are compared without regard to case',
    )
    this.name = 'WorkflowLabelNameConflict'
  }

  /** Where in the file the two definitions are, addressed from its root. */
  get field(): string {
    return `folders.${String(this.folderIndex)}.labels`
  }
}

/**
 * The Folder Labels an imported workflow file asks for, created inside the
 * Folder the import has just made, answered as a map from the file's own
 * portable key to the id each one was given (7.16, #227 area 4).
 *
 * **Imported Labels are always active**, which is #227's rule and is also the
 * only one that could be right: archived means "may not be newly applied", and
 * every Label here is about to be applied to work created in the same
 * transaction.
 *
 * Nothing merges against an existing catalog by name, because the Folder was
 * created moments ago and its catalog is empty. That is worth stating rather
 * than leaving to the reader: "do not merge against unrelated existing Labels
 * by name" is satisfied structurally here, and would stop being satisfied the
 * day an import learned to add to a Folder that already exists.
 *
 * **A file naming one Folder's Label twice is refused here and nowhere
 * else** (2026-09-20). Two things are worth saying about that, because the
 * obvious alternative was tried on #227's branch and reverted.
 *
 * **It is the only fold, and it is `lower()` in the database.** A check in
 * `canonicalWorkflowBody` folding with JavaScript `toLowerCase()` stood here
 * for a day and had to go: two implementations of Unicode lowercasing
 * disagree on nine BMP code points and on Greek final sigma, and every
 * disagreement is a *false 422* for whichever of the two partners the file
 * happens to carry. The measurement and the export Dana could not re-import
 * are in `shared/workflows.ts` beside the rules that remain.
 *
 * **Which statement raises it moved in #279 and the fold did not.** The
 * vocabulary is now written by one multi-row INSERT rather than by one
 * statement per definition — 250 per Folder and 50 Folders is 12,500 awaited
 * round trips inside the import's write transaction — and a multi-row INSERT
 * raises its 23505 once for the whole statement, which knows the constraint
 * but not which of the 250 rows the file's owner should go and look at. So
 * the fold runs first, over the file's own rows, as
 * `row_number() OVER (PARTITION BY lower(name))` in the same session and
 * therefore under the same collation and ctype as
 * `labels_folder_name_idx` itself: same fold, same answer, and the ordinal it
 * returns is the one the loop's second INSERT would have raised on, so the
 * name in the message is still the file's own spelling of the colliding
 * definition.
 *
 * **It is not a check untied to its write**, which is the thing
 * `isDuplicateName` above warns about for the live create. That warning is
 * about a SELECT over a table two callers can write to between the read and
 * the INSERT. This reads the statement's own input array, inside the
 * transaction that made the Folder three statements ago, and the index is
 * still there underneath: a 23505 escaping this function means the Folder's
 * catalog was not empty, which is a defect in the caller rather than a file
 * to refuse, and a 500 is the honest answer to it.
 *
 * **And it answers 422 rather than the live create's 409.** The two answer
 * different questions: a 409 is a collision with a catalog the caller can go
 * and look at, and this is one file disagreeing with itself, which is exactly
 * what an undeclared key is — 422 there already. It matters at the screen as
 * well as in the taxonomy: `mutationFailureMessage` in
 * `client/api/queryClient.ts` surfaces the server's own sentence only for a
 * 422 on a mutation carrying `VALIDATION_ERROR_TOAST_META`, which
 * `useImportWorkflowFile` does, so a 409 would throw this sentence away and
 * show a generic toast.
 */
export async function createWorkflowFolderLabels(
  tx: Executor,
  folderId: string,
  definitions: readonly {
    key: string
    name: string
    color: string
    description?: string | null | undefined
  }[],
  /** Which folder of the file this vocabulary belongs to, so that a collision
   * only the database can see is named where the file's owner can find it.
   * The importer knows it; nothing downstream of the INSERT could recover
   * it. */
  folderIndex: number,
): Promise<Map<string, string>> {
  const byKey = new Map<string, string>()
  if (definitions.length === 0) return byKey

  /* The file's vocabulary as rows, written once and read by both statements
     below, so that what the fold refused and what the INSERT wrote cannot
     drift apart. Each value is an ordinary bind parameter rather than one
     jsonb document — `idSet`'s spelling is right for a list of uuids and
     wrong for a person's text, a lone surrogate in a hand-made file being a
     jsonb cast error where the driver's own encoding has always taken it —
     and 250 definitions is 10.3's cap, so this is at most 1000 parameters
     against the protocol's 65535. */
  const input = sql`(VALUES ${sql.join(
    definitions.map(
      (definition, index) =>
        sql`(${definition.name}::text, ${definition.color}::text,
             ${definition.description ?? null}::text, ${index + 1}::int)`,
    ),
    sql`, `,
  )}) AS d(name, color, description, ord)`

  /* The fold, ahead of the write and in the database's own `lower()`: the
     first definition whose name repeats an earlier one is the row the
     per-definition loop's INSERT used to raise 23505 on, and naming it is the
     whole point of the class this throws. */
  const collision = await rowsOf(
    tx,
    sql`SELECT c.ord AS ord
          FROM (SELECT d.ord AS ord,
                       row_number() OVER (PARTITION BY lower(d.name)
                                          ORDER BY d.ord) AS seq
                  FROM ${input}) c
         WHERE c.seq > 1
         ORDER BY c.ord ASC
         LIMIT 1`,
  )
  const at = collision[0]?.ord
  if (at !== undefined) {
    const offending = definitions[Number(at) - 1]
    if (offending === undefined) {
      throw new Error('the fold named a definition the file does not carry')
    }
    throw new WorkflowLabelNameConflict(folderIndex, offending.name)
  }

  const made = await rowsOf(
    tx,
    sql`INSERT INTO labels (scope, folder_id, name, color, description)
        SELECT 'folder', ${folderId}::uuid, d.name, d.color, d.description
          FROM ${input}
         ORDER BY d.ord
        RETURNING id, name`,
  )
  /* `RETURNING` answers the ids in no promised correspondence to the rows
     they came from, which is why `copyFolderLabelCatalog` above is still a
     loop — there the only column that could pair them is the name, and the
     two catalogs are two vocabularies that #208 forbids matching by name. It
     is sound here and only here: these rows are one Folder's own new
     vocabulary, and the fold two statements up has just proved the file
     carries no two names `lower()` makes one, so no two carry the same name
     exactly either. A key with no row is a defect rather than a Label to drop
     in silence. */
  const idByName = new Map(made.map((row) => [String(row.name), String(row.id)]))
  for (const definition of definitions) {
    const id = idByName.get(definition.name)
    if (id === undefined) {
      throw new Error('INSERT INTO labels returned no row for a definition')
    }
    byKey.set(definition.key, id)
  }
  return byKey
}

/**
 * One imported Task's Folder Label assignments, by the ids
 * `createWorkflowFolderLabels` answered. A key the file never declared is
 * refused by the schema before this runs, so an unknown one cannot arrive
 * here and is not silently dropped here either.
 *
 * **One statement per Task rather than one per assignment** (issue #279). The
 * loop this replaces was the import's own worst case: 10.3 admits 100 Folder
 * Labels per Task and the format admits 1000 Tasks, so a valid file could
 * spend 100,000 awaited round trips inside one write transaction, measured at
 * about 11 seconds on a machine where the same file without Labels cost 0.7.
 * Dana runs exactly one production instance with one `pg.Pool` and an
 * in-process reminder tick sharing it, so that window is an availability
 * shape rather than a slow request.
 *
 * The ids ride as one bind parameter through `idSet`, which is the spelling
 * `database.ts` measured on both backends; `ON CONFLICT DO NOTHING` still
 * absorbs a file that names one key twice on one Task, which a multi-row
 * INSERT needs it to do for rows *within* the statement as much as against
 * rows already there — verified on the leg, and it is DO UPDATE rather than
 * DO NOTHING that refuses to touch a row twice in one command.
 *
 * **Per Task and deliberately not per Folder**, which was written and
 * measured before this was chosen. Collecting a whole Folder's assignments
 * and writing them in one statement took the same file from 3.2 seconds to
 * 2.6 against a 0.7-second floor the Labels have nothing to do with — and it
 * makes the bind parameter grow with the file rather than with 10.3's
 * per-Task cap of 100. A 3 MB body can declare something like half a million
 * assignments in one Folder, which is tens of megabytes of jsonb built in
 * this process and parsed in that one, so the Folder-wide spelling buys half
 * a second at the cap by making the worst case a memory shape instead of a
 * time one. One statement per Task keeps the parameter bounded by a cap
 * 10.3 states.
 */
export async function applyWorkflowTaskLabels(
  tx: Executor,
  folderId: string,
  taskId: string,
  labelIds: readonly string[],
): Promise<void> {
  if (labelIds.length === 0) return
  await tx.execute(
    sql`INSERT INTO task_folder_labels (folder_id, task_id, label_id)
        SELECT ${folderId}::uuid, ${taskId}::uuid, assigned.label_id
          FROM ${idSet(labelIds)} AS assigned(label_id)
        ON CONFLICT DO NOTHING`,
  )
}
