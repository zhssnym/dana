/*
Harness for S22a's criteria (AC-266 to AC-273): the four frozen changes
RFC 0005 change control item 44 ruled, which are a hand order on a folder's
unscheduled list, a per-viewer cover for a place page, a width on a page
block, and the widened workflow file.

Three decisions worth the words.

**Tasks are seeded with explicit `created_at` instants, never with now().**
Q2's row order is "status_rank, created_at descending, id descending", and
three inserts a microsecond apart would leave the id tie-break deciding the
sequence from a random uuid. Every order assertion in these files would then
be a coin toss dressed as a criterion. The instants below are minutes apart
so the expected sequence is the one the spec's own keys produce.

**The order is read through the API, never off the column.** `tasks.position`
holds a fractional index and its value is the server's business; a test that
asserted a key would pin the contract to the midpoint algorithm and go red the
day that changed. What section 6 promises anybody is a sequence, so a sequence
is what these read, through GET /folders/:id/tasks.

**Titles carry the file's own prefix.** On the TEST_DATABASE_URL leg every
worker shares one database (helpers.ts), so a stray row should say which
package left it and no assertion here sweeps a whole table.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { expect } from 'vitest'

import type { Db } from '../../db/client.js'
import type { Actor } from './folders-harness.js'
import { expectStatus } from './folders-harness.js'

export interface SeedOrderedTaskOptions {
  folderId: string
  createdBy: string
  title: string
  /** Minutes into the past; larger is older, so Q2 lists smaller first. */
  agoMinutes: number
  status?: 'pending' | 'completed' | 'abandoned'
  dueDate?: string | null
}

/** One undated open task with a stated birthday, so Q2's order is decided by
 * the spec's keys rather than by a uuid comparison. */
export async function seedOrderedTask(
  db: Db,
  options: SeedOrderedTaskOptions,
): Promise<string> {
  const id = randomUUID()
  const status = options.status ?? 'pending'
  const completed = status === 'completed'
  const bornAt = new Date(
    Date.now() - options.agoMinutes * 60_000,
  ).toISOString()
  await db.execute(sql`
    INSERT INTO tasks (id, folder_id, title, status, due_date, created_by,
                       completed_at, completed_by, created_at, updated_at)
    VALUES (${id}::uuid, ${options.folderId}::uuid, ${options.title},
            ${status}, ${options.dueDate ?? null}::date,
            ${options.createdBy}::uuid,
            ${completed ? bornAt : null}::timestamptz,
            ${completed ? options.createdBy : null}::uuid,
            ${bornAt}::timestamptz, ${bornAt}::timestamptz)
  `)
  return id
}

/** The titles of Q7's second section, in the order the endpoint answers. */
export async function unscheduledTitles(
  actor: Actor,
  folderId: string,
): Promise<string[]> {
  const response = await actor.browser.json(
    `/folders/${folderId}/tasks?tz=UTC`,
    'GET',
  )
  expectStatus(response, 200, 'the folder page reads its open sections (Q7)')
  const body = response.json() as { unscheduled?: Array<{ title?: unknown }> }
  return (body.unscheduled ?? []).map((row) => String(row.title))
}

/** The same for the first section, which B4 leaves alone. */
export async function scheduledTitles(
  actor: Actor,
  folderId: string,
): Promise<string[]> {
  const response = await actor.browser.json(
    `/folders/${folderId}/tasks?tz=UTC`,
    'GET',
  )
  expectStatus(response, 200, 'the folder page reads its open sections (Q7)')
  const body = response.json() as { scheduled?: Array<{ title?: unknown }> }
  return (body.scheduled ?? []).map((row) => String(row.title))
}

/** POST /tasks/:id/order, unasserted, so a case can read the refusal. */
export function placeTask(
  actor: Actor,
  taskId: string,
  neighbours: { after_id: string | null; before_id: string | null },
) {
  return actor.browser.json(`/tasks/${taskId}/order`, 'POST', neighbours)
}

/** The same, asserted, for setup where the placement is not the case. */
export async function placeTaskOk(
  actor: Actor,
  taskId: string,
  neighbours: { after_id: string | null; before_id: string | null },
): Promise<void> {
  const response = await placeTask(actor, taskId, neighbours)
  expectStatus(
    response,
    200,
    'POST /tasks/:id/order must place an undated open task and answer its TaskDetail (spec 7.6 as amended)',
  )
}

/** A stored file, seeded directly: uploads are S4's surface and the byte
 * store is not what a cover criterion is about. `kind = 'cover'` is 4.16's
 * own value for exactly this. */
export async function seedCoverFile(
  db: Db,
  ownerId: string,
  folderId: string | null = null,
): Promise<string> {
  const id = randomUUID()
  await db.execute(sql`
    INSERT INTO files (id, owner_id, folder_id, kind, name, mime, bytes)
    VALUES (${id}::uuid, ${ownerId}::uuid, ${folderId}::uuid, 'cover',
            ${`s22a cover ${id.slice(0, 8)}.png`}, 'image/png', 4096)
  `)
  return id
}

/** A workflow file with one folder, for the B3 cases to decorate. */
export function workflowFile(
  folderName: string,
  tasks: readonly Record<string, unknown>[],
  blocks?: readonly Record<string, unknown>[],
): Record<string, unknown> {
  return {
    dana: 'workflow',
    version: 1,
    name: folderName,
    folders: [{ name: folderName, tasks, ...(blocks ? { blocks } : {}) }],
  }
}

/** The id of the single folder a workflow import created. */
export function importedFolderId(body: unknown): string {
  const created = body as { folders?: Array<{ id?: unknown }> }
  const id = created.folders?.[0]?.id
  expect(typeof id, 'the import answers the folders it created (7.16)').toBe(
    'string',
  )
  return String(id)
}
