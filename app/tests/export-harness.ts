/*
Harness for the 7.22 data export criteria (AC-390 to AC-393), on the P1 auth
harness and the P2 folder one like every other package here.

**Setup goes through the API, deliberately and almost everywhere.** An export
is a read over nine tables that other surfaces wrote, so a fixture assembled
with INSERT statements would be measuring this module against a workspace
Dana itself would never produce. Folders, tasks, steps, page blocks, shelves,
comments and saved views therefore arrive through the endpoints that own
them. Two things are seeded directly and each for its own reason: a `files`
row, because the only way to make one through the API is a multipart upload
carrying real image bytes through sharp, which is `uploads-harness.ts`'s job
and not a dependency this package needs; and AC-393's thousand-and-first
task, because no criterion should spend a thousand HTTP round trips to prove
an arithmetic fact about a cap.

**The two-workspace fixture is the point of the file.** Almost every question
these criteria ask — what belongs in the document, what must never be in it —
is a question about a second person, so `twoWorkspaces` builds the same shape
for every criterion that needs it: one folder each, a shared folder the other
person owns, and three tasks in it with different relationships to the
viewer.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { expect } from 'vitest'

import type { Db } from '../db/client.js'
import type { ExportDocument } from '../src/shared/export.js'
import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, addMemberOk, connect, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import type { RawResponse } from './http-client.js'

export { Cast, expectStatus, startAuthTestApp }
export type { Actor, AuthTestApp, ExportDocument }

/** The route under test, spelled once. */
export const EXPORT_PATH = '/me/export'

export function requestExport(actor: Actor): Promise<RawResponse> {
  return actor.browser.api(EXPORT_PATH)
}

/** The export, asserted 200 and parsed. Every criterion but the refusals. */
export async function exportOf(actor: Actor): Promise<ExportDocument> {
  const response = await requestExport(actor)
  expectStatus(
    response,
    200,
    'GET /api/v1/me/export must answer the caller their own data (spec 7.22)',
  )
  return response.json() as ExportDocument
}

/* ------------------------------------------------------------------ *
 * Setup through the surfaces that own each row
 * ------------------------------------------------------------------ */

export interface CreatedTask {
  id: string
  title: string
}

export async function createTask(
  actor: Actor,
  folderId: string,
  title: string,
  extra: Record<string, unknown> = {},
): Promise<CreatedTask> {
  const response = await actor.browser.json('/tasks', 'POST', {
    title,
    folder_id: folderId,
    ...extra,
  })
  expectStatus(
    response,
    201,
    `POST /tasks must create ${JSON.stringify(title)} (spec 7.6)`,
  )
  const body = response.json() as { id: string }
  return { id: body.id, title }
}

/** One paragraph on a folder's page (7.16), which the export carries as a
 * folder's `blocks`. */
export async function writeParagraph(
  actor: Actor,
  folderId: string,
  text: string,
): Promise<void> {
  const response = await actor.browser.json(
    `/folders/${folderId}/page`,
    'PUT',
    { blocks: [{ kind: 'paragraph', position: 0, text }] },
  )
  expectStatus(
    response,
    200,
    'PUT /folders/:id/page must write the page (spec 7.16)',
  )
}

export async function writeComment(
  actor: Actor,
  folderId: string,
  body: string,
  fileId?: string,
): Promise<string> {
  const response = await actor.browser.json(
    `/folders/${folderId}/comments`,
    'POST',
    fileId === undefined ? { body } : { body, file_id: fileId },
  )
  expectStatus(
    response,
    201,
    'POST /folders/:id/comments must create the comment (spec 7.14)',
  )
  return (response.json() as { id: string }).id
}

export async function createShelf(actor: Actor, name: string): Promise<string> {
  const response = await actor.browser.json('/shelves', 'POST', { name })
  expectStatus(response, 201, 'POST /shelves must create the shelf (spec 7.16)')
  return (response.json() as { id: string }).id
}

export async function createView(actor: Actor, name: string): Promise<string> {
  const response = await actor.browser.json('/views', 'POST', {
    name,
    definition: { status: 'pending' },
  })
  expectStatus(response, 201, 'POST /views must save the view (spec 4.19)')
  return (response.json() as { id: string }).id
}

export async function describeFolder(
  actor: Actor,
  folderId: string,
  description: string,
): Promise<void> {
  const response = await actor.browser.json(`/folders/${folderId}`, 'PATCH', {
    description,
  })
  expectStatus(
    response,
    200,
    'PATCH /folders/:id must write the description (spec 7.4, 7.21)',
  )
}

/*
A `files` row without an upload. 7.15's own path runs bytes through sharp and
belongs to the uploads harness; what these criteria need is a row with an
owner, a name and a size, so that the export can be asked whether it reports
one. `kind` is 'file' and the row is folder-scoped, which migration 0012's
files_folderless_kind_check requires of everything but an avatar and a cover.
*/
export async function seedFile(
  db: Db,
  ownerId: string,
  folderId: string,
  name: string,
): Promise<string> {
  const id = randomUUID()
  await db.execute(sql`
    INSERT INTO files (id, owner_id, folder_id, kind, name, mime, bytes)
    VALUES (${id}::uuid, ${ownerId}::uuid, ${folderId}::uuid, 'file',
            ${name}, 'text/plain', 12)
  `)
  return id
}

/** AC-393's cap fixture: `count` tasks in one statement. A thousand POSTs
 * would measure the machine rather than the cap. */
export async function seedBulkTasks(
  db: Db,
  folderId: string,
  createdBy: string,
  count: number,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO tasks (folder_id, title, created_by)
    SELECT ${folderId}::uuid, 'bulk task ' || g::text, ${createdBy}::uuid
    FROM generate_series(1, ${count}) g
  `)
}

/* ------------------------------------------------------------------ *
 * The two-workspace fixture
 * ------------------------------------------------------------------ */

export interface TwoWorkspaces {
  viewer: Actor
  other: Actor
  /** A folder the viewer owns, with a task, a step, a page and a comment. */
  ownFolderId: string
  ownTask: CreatedTask
  /** A folder the *other* person owns and the viewer belongs to. */
  sharedFolderId: string
  /** In the shared folder, written by the viewer. Belongs in the export. */
  taskViewerWrote: CreatedTask
  /** In the shared folder, written by the other person and assigned to the
   * viewer. Belongs in the export. */
  taskAssignedToViewer: CreatedTask
  /** In the shared folder, the other person's alone. Must not appear. */
  taskOfTheirs: CreatedTask
  /** A folder the other person owns and the viewer has never seen. */
  privateFolderId: string
  privateTask: CreatedTask
  viewerFileId: string
  viewerCommentBody: string
}

/**
 * The fixture three of the four criteria share: two people, one folder each,
 * one folder between them, and one folder of the other person's that the
 * viewer is not in at all.
 */
export async function twoWorkspaces(
  app: AuthTestApp,
  cast: Cast,
): Promise<TwoWorkspaces> {
  const [viewer, other] = (await cast.of(app)) as [Actor, Actor]
  await connect(app.db, viewer.id, other.id)

  const ownFolderId = await createFolder(viewer, 'Viewer folder')
  await describeFolder(viewer, ownFolderId, 'What this folder is for.')
  const ownTask = await createTask(viewer, ownFolderId, 'Viewer own task', {
    notes: 'a note of my own',
    important: true,
    steps: ['first step'],
  })
  await writeParagraph(viewer, ownFolderId, 'A paragraph on my own page.')

  const viewerFileId = await seedFile(
    app.db,
    viewer.id,
    ownFolderId,
    'viewer-attachment.txt',
  )
  const viewerCommentBody = 'A comment the viewer wrote.'
  await writeComment(viewer, ownFolderId, viewerCommentBody, viewerFileId)

  const sharedFolderId = await createFolder(other, 'Shared folder')
  await addMemberOk(other, sharedFolderId, viewer.id)

  const taskViewerWrote = await createTask(
    viewer,
    sharedFolderId,
    'Task the viewer wrote elsewhere',
    { steps: ['elsewhere step'] },
  )
  const taskAssignedToViewer = await createTask(
    other,
    sharedFolderId,
    'Task assigned to the viewer',
    { assignee_id: viewer.id },
  )
  const taskOfTheirs = await createTask(
    other,
    sharedFolderId,
    'Task that is theirs alone',
    { assignee_id: other.id },
  )

  const privateFolderId = await createFolder(other, 'Private folder')
  const privateTask = await createTask(
    other,
    privateFolderId,
    'Private task the viewer never sees',
  )

  return {
    viewer,
    other,
    ownFolderId,
    ownTask,
    sharedFolderId,
    taskViewerWrote,
    taskAssignedToViewer,
    taskOfTheirs,
    privateFolderId,
    privateTask,
    viewerFileId,
    viewerCommentBody,
  }
}

/** The folder entry the document carries for one id, asserted present. */
export function folderIn(
  document: ExportDocument,
  folderId: string,
): ExportDocument['folders'][number] {
  const found = document.folders.find((folder) => folder.id === folderId)
  expect(
    found,
    'the export must carry every folder the person owns (spec 7.22)',
  ).toBeDefined()
  return found as ExportDocument['folders'][number]
}
