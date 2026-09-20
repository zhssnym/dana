/*
Harness for the Label lifecycle criteria, AC-540 to AC-554 (issue #227,
parent #208).

It sits beside `labels-harness.ts` rather than inside it, and the split is by
what each one is about: that file is #226's definitions, assignments and
projections, this one is what happens to them when Work is copied, moved,
exported, trashed or purged. Everything here either drives one of the acts of
7.16 and 7.13, or reads the rows an act left behind.

**Two rules the helpers here exist to make cheap to obey.**

*Assert the rows as well as the response.* Most of #227 is a rule of the form
"X is copied and Y is not", and the response of a duplicate is one id. A
criterion that only reads what came back through the API cannot see a row that
was written and then hidden by a projection's own scope — which is precisely
the failure mode of a Personal assignment belonging to somebody else, because
the viewer's read filters it out either way. So `folderLabelRows`,
`taskLabelAssignments` and their neighbours read the tables directly, and every
one of them takes explicit ids.

*Read a second person's view through a second person's session.* Where a rule
is "nobody else's Personal Label crosses", the honest check is both: the row is
absent from the table, **and** the other person's own read does not show it.
The first catches a copy that wrote it; the second catches a copy that wrote it
into a shape their projection happens to surface.
*/
import { sql } from 'drizzle-orm'
import { expect } from 'vitest'

import type { Db } from '../../db/client.js'
import type { ImportWorkflowBody } from '../../src/shared/workflows.js'

import { expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import type { RawResponse } from './http-client.js'

/* ------------------------------------------------------------------ *
 * The acts
 * ------------------------------------------------------------------ */

/** UTC for every act that takes a zone. Nothing in #227 turns on a day, and
 * naming one zone keeps the date arithmetic AC-200 and AC-277 own out of
 * these files entirely. */
export const ZONE = 'UTC'

export function postFolderDuplicate(
  actor: Actor,
  folderId: string,
): Promise<RawResponse> {
  return actor.browser.json(
    `/folders/${folderId}/duplicate?tz=${encodeURIComponent(ZONE)}`,
    'POST',
  )
}

export async function duplicateFolderOk(
  actor: Actor,
  folderId: string,
): Promise<string> {
  const made = await postFolderDuplicate(actor, folderId)
  expectStatus(made, 201, 'POST /folders/:id/duplicate must answer the copy')
  return String((made.json() as { id?: unknown }).id)
}

export function postTaskDuplicate(
  actor: Actor,
  taskId: string,
): Promise<RawResponse> {
  return actor.browser.json(
    `/tasks/${taskId}/duplicate?tz=${encodeURIComponent(ZONE)}`,
    'POST',
  )
}

export async function duplicateTaskOk(
  actor: Actor,
  taskId: string,
): Promise<string> {
  const made = await postTaskDuplicate(actor, taskId)
  expectStatus(made, 201, 'POST /tasks/:id/duplicate must answer the copy')
  return String((made.json() as { id?: unknown }).id)
}

/** 7.6's move: the only path by which a task changes folder. */
export function moveTask(
  actor: Actor,
  taskId: string,
  folderId: string,
): Promise<RawResponse> {
  return actor.browser.json(`/tasks/${taskId}`, 'PATCH', {
    folder_id: folderId,
  })
}

export async function moveTaskOk(
  actor: Actor,
  taskId: string,
  folderId: string,
): Promise<void> {
  const moved = await moveTask(actor, taskId, folderId)
  expectStatus(moved, 200, 'PATCH /tasks/:id must move the task (spec 7.6)')
}

export function importWorkflow(
  actor: Actor,
  file: unknown,
): Promise<RawResponse> {
  return actor.browser.json(
    `/workflows/import?tz=${encodeURIComponent(ZONE)}`,
    'POST',
    file,
  )
}

export async function importWorkflowOk(
  actor: Actor,
  file: unknown,
): Promise<{ id: string; name: string }[]> {
  const imported = await importWorkflow(actor, file)
  expectStatus(imported, 201, 'POST /workflows/import must create the folders')
  return (imported.json() as { folders: { id: string; name: string }[] })
    .folders
}

export function deleteTask(actor: Actor, taskId: string): Promise<RawResponse> {
  return actor.browser.json(`/tasks/${taskId}`, 'DELETE')
}

/** 7.6's `restore` transition, which is also the trash restore: the two
 * meanings have disjoint domains and one handler forks on the row's state
 * (`routes/trash.ts` records the reasoning). */
export function restoreTask(
  actor: Actor,
  taskId: string,
): Promise<RawResponse> {
  return actor.browser.json(`/tasks/${taskId}/restore`, 'POST', {})
}

export function deleteFolder(
  actor: Actor,
  folderId: string,
): Promise<RawResponse> {
  return actor.browser.json(`/folders/${folderId}`, 'DELETE')
}

export function purgeTask(actor: Actor, taskId: string): Promise<RawResponse> {
  return actor.browser.json(`/trash/tasks/${taskId}`, 'DELETE')
}

export function purgeFolder(
  actor: Actor,
  folderId: string,
): Promise<RawResponse> {
  return actor.browser.json(`/trash/folders/${folderId}`, 'DELETE')
}

/* ------------------------------------------------------------------ *
 * The rows an act left behind
 * ------------------------------------------------------------------ */

export interface LabelRow extends Record<string, unknown> {
  id: string
  name: string
  color: string
  description: string | null
  archived: boolean
}

/** One folder's whole Folder Label catalog, from the table rather than from
 * `GET /labels`, so an archived definition is visible to the assertion
 * whatever the listing's default is. In the order #208 fixes. */
export async function folderLabelRows(
  db: Db,
  folderId: string,
): Promise<LabelRow[]> {
  const found = (await db.execute(
    sql`SELECT id, name, color, description,
               (archived_at IS NOT NULL) AS archived
          FROM labels
         WHERE folder_id = ${folderId}::uuid AND scope = 'folder'
         ORDER BY (archived_at IS NOT NULL) ASC, lower(name) ASC, id ASC`,
  )) as unknown as { rows: Record<string, unknown>[] }
  return found.rows.map((row) => ({
    ...row,
    id: String(row.id),
    name: String(row.name),
    color: String(row.color),
    description: row.description === null ? null : String(row.description),
    archived: row.archived === true,
  }))
}

/** Every Personal Label definition one account holds, whoever can see it. */
export async function personalLabelRows(
  db: Db,
  ownerId: string,
): Promise<LabelRow[]> {
  const found = (await db.execute(
    sql`SELECT id, name, color, description,
               (archived_at IS NOT NULL) AS archived
          FROM labels
         WHERE owner_user_id = ${ownerId}::uuid AND scope = 'personal'
         ORDER BY (archived_at IS NOT NULL) ASC, lower(name) ASC, id ASC`,
  )) as unknown as { rows: Record<string, unknown>[] }
  return found.rows.map((row) => ({
    ...row,
    id: String(row.id),
    name: String(row.name),
    color: String(row.color),
    description: row.description === null ? null : String(row.description),
    archived: row.archived === true,
  }))
}

/** The Folder Label ids standing against one task, from the table. */
export async function taskFolderLabelIds(
  db: Db,
  taskId: string,
): Promise<string[]> {
  const found = (await db.execute(
    sql`SELECT label_id FROM task_folder_labels
         WHERE task_id = ${taskId}::uuid ORDER BY label_id ASC`,
  )) as unknown as { rows: { label_id: unknown }[] }
  return found.rows.map((row) => String(row.label_id))
}

/** The Personal Label ids standing against one task for one owner. Takes the
 * owner explicitly, because "nobody else's crosses" is only assertable when
 * the query can be asked about somebody else. */
export async function taskPersonalLabelIds(
  db: Db,
  taskId: string,
  ownerId: string,
): Promise<string[]> {
  const found = (await db.execute(
    sql`SELECT label_id FROM task_personal_labels
         WHERE task_id = ${taskId}::uuid AND owner_user_id = ${ownerId}::uuid
         ORDER BY label_id ASC`,
  )) as unknown as { rows: { label_id: unknown }[] }
  return found.rows.map((row) => String(row.label_id))
}

/** Every Personal assignment on one task, whoever owns it: the query that
 * catches a copy which wrote another member's row and a projection which
 * then hid it. */
export async function allTaskPersonalRows(
  db: Db,
  taskId: string,
): Promise<{ label_id: string; owner_user_id: string }[]> {
  const found = (await db.execute(
    sql`SELECT label_id, owner_user_id FROM task_personal_labels
         WHERE task_id = ${taskId}::uuid
         ORDER BY owner_user_id ASC, label_id ASC`,
  )) as unknown as { rows: Record<string, unknown>[] }
  return found.rows.map((row) => ({
    label_id: String(row.label_id),
    owner_user_id: String(row.owner_user_id),
  }))
}

export async function folderPersonalLabelIds(
  db: Db,
  folderId: string,
  ownerId: string,
): Promise<string[]> {
  const found = (await db.execute(
    sql`SELECT label_id FROM folder_personal_labels
         WHERE folder_id = ${folderId}::uuid
           AND owner_user_id = ${ownerId}::uuid
         ORDER BY label_id ASC`,
  )) as unknown as { rows: { label_id: unknown }[] }
  return found.rows.map((row) => String(row.label_id))
}

export async function allFolderPersonalRows(
  db: Db,
  folderId: string,
): Promise<{ label_id: string; owner_user_id: string }[]> {
  const found = (await db.execute(
    sql`SELECT label_id, owner_user_id FROM folder_personal_labels
         WHERE folder_id = ${folderId}::uuid
         ORDER BY owner_user_id ASC, label_id ASC`,
  )) as unknown as { rows: Record<string, unknown>[] }
  return found.rows.map((row) => ({
    label_id: String(row.label_id),
    owner_user_id: String(row.owner_user_id),
  }))
}

/** The copied tasks of a duplicated folder, by title, so a criterion can
 * reach the copy of a particular source task without re-deriving the order
 * the duplicate wrote them in. */
export async function tasksByTitle(
  db: Db,
  folderId: string,
): Promise<Map<string, string>> {
  const found = (await db.execute(
    sql`SELECT id, title FROM tasks
         WHERE folder_id = ${folderId}::uuid AND deleted_at IS NULL`,
  )) as unknown as { rows: Record<string, unknown>[] }
  return new Map(found.rows.map((row) => [String(row.title), String(row.id)]))
}

/** The one task a map must hold, named so a missing one fails as the fixture
 * problem it is rather than as `undefined` reaching an assertion. */
export function taskNamed(tasks: ReadonlyMap<string, string>, title: string): string {
  const id = tasks.get(title)
  expect(id, `the copy must carry a task titled ${JSON.stringify(title)}`).toBeDefined()
  return id as string
}

/* ------------------------------------------------------------------ *
 * Workflow files
 * ------------------------------------------------------------------ */

/** The body `folderToWorkflowFile` answers, as an unknown the import can be
 * handed: the round-trip criteria write one half with the exporter and read
 * it back through the endpoint, which is the only way to prove the two halves
 * are one format. */
export function asFile(file: ImportWorkflowBody): unknown {
  return JSON.parse(JSON.stringify(file)) as unknown
}
