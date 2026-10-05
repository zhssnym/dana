/*
Harness for AC-820 to AC-825 (issue #185): a composed folder page, the file the
product writes from it, and the rows that file makes on the way back in.

**Every criterion here is a round trip, and a round trip has three places it can
lie.** The page can be composed wrong, so the fixtures are driven through
`POST /folders/:id/page/actions` — the same document transaction a person's own
save goes through — and read back before anything is exported. The file can be
written from something other than what the product hands the writer, so
`savedWorkflow` makes the call `FolderPage.tsx` makes, argument for argument,
off the same endpoints. And the import can answer 201 while writing a different
page, which is why nothing here is judged by the response: `pageRows` reads
`page_blocks` and `tasks` directly, in the folder's own order, and `shapeOf`
turns that into something two folders in two accounts can be compared by.

**Identities are replaced by text on purpose.** A template imported into
another account carries none of the exporter's ids — that is the property #185
asks for — so `under` and `nested_under` name the *text* of the heading or the
list item a row belongs to. Comparing ids would be comparing the one thing that
is guaranteed to differ; comparing text is comparing the thing a person sees.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { expect } from 'vitest'

import type { Db } from '../../db/client.js'
import { folderToWorkflowFile } from '../../src/shared/workflows.js'
import type { WorkflowExport } from '../../src/shared/workflows.js'
import { getFolderDependenciesResponse } from '../../src/shared/task-dependencies.js'
import type {
  DocumentBlockKind,
  DocumentOperation,
  DocumentOutlineItem,
  PageView,
} from '../../src/shared/pages.js'
import type { TaskDetail } from '../../src/shared/tasks.js'

import { listLabels } from './labels-harness.js'
import { expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import type { RawResponse } from './http-client.js'

/** UTC everywhere. Nothing in #185 turns on a day, and naming one zone keeps
 * the date arithmetic AC-200 and AC-277 own out of these files. */
export const ZONE = 'UTC'

/* ------------------------------------------------------------------ *
 * Composing a page
 * ------------------------------------------------------------------ */

export function put(
  id: string,
  kind: DocumentBlockKind,
  text: string | null,
  extra: Partial<Extract<DocumentOperation, { op: 'put_block' }>> = {},
): DocumentOperation {
  return {
    op: 'put_block',
    id,
    block_kind: kind,
    text,
    rich_content: null,
    file_id: null,
    ref_folder_id: null,
    width_pct: null,
    checked: null,
    ...extra,
  }
}

export function at(
  id: string,
  section: string | null = null,
  listParent: string | null = null,
): DocumentOutlineItem {
  return {
    kind: 'block',
    id,
    section_block_id: section,
    list_parent_block_id: listParent,
  }
}

export function task(id: string, section: string | null = null): DocumentOutlineItem {
  return { kind: 'task', id, section_block_id: section, list_parent_block_id: null }
}

export async function readPage(actor: Actor, folderId: string): Promise<PageView> {
  const response = await actor.browser.json(`/folders/${folderId}/page`, 'GET')
  expectStatus(response, 200, 'GET /folders/:id/page must answer the page (7.16)')
  return response.json() as PageView
}

/** One document transaction against the page as it stands, refused loudly. */
export async function compose(
  actor: Actor,
  folderId: string,
  operations: DocumentOperation[],
  why: string,
): Promise<PageView> {
  const base = await readPage(actor, folderId)
  const response = await actor.browser.json(
    `/folders/${folderId}/page/actions`,
    'POST',
    {
      action: 'document_transaction',
      mutation_id: randomUUID(),
      base_revision: base.revision as string,
      operations,
    },
  )
  expectStatus(response, 200, why)
  return readPage(actor, folderId)
}

/* ------------------------------------------------------------------ *
 * The file the product writes
 * ------------------------------------------------------------------ */

/**
 * "Save as workflow", as `FolderPage.tsx` performs it.
 *
 * The page, the **pending** work read one detail at a time, and the folder's
 * own Label vocabulary — the three reads that page makes, through the same
 * endpoints, handed to the writer in the same order. A criterion that built a
 * file by hand would prove something about a fixture; this proves something
 * about the file a person downloads.
 */
export async function savedWorkflow(
  actor: Actor,
  folderId: string,
  name: string,
): Promise<WorkflowExport> {
  const page = await readPage(actor, folderId)
  const listed = await actor.browser.json(
    `/folders/${folderId}/tasks?tz=${ZONE}`,
    'GET',
  )
  expectStatus(listed, 200, 'GET /folders/:id/tasks must answer the cards (Q7)')
  const cards = listed.json() as {
    scheduled?: { id: string; status: string }[]
    unscheduled?: { id: string; status: string }[]
  }
  const pending = [...(cards.scheduled ?? []), ...(cards.unscheduled ?? [])].filter(
    (card) => card.status === 'pending',
  )
  const details: TaskDetail[] = []
  for (const card of pending) {
    const read = await actor.browser.json(`/tasks/${card.id}`, 'GET')
    expectStatus(read, 200, 'GET /tasks/:id must answer the detail (7.6)')
    details.push(read.json() as TaskDetail)
  }
  const waits = await actor.browser.json(`/folders/${folderId}/dependencies`, 'GET')
  expectStatus(waits, 200, 'GET /folders/:id/dependencies must answer (7.25)')
  const { dependencies } = getFolderDependenciesResponse.parse(waits.json())
  const labels = await listLabels(actor, { scope: 'folder', folder_id: folderId })
  return folderToWorkflowFile(
    name,
    details,
    page.blocks,
    page,
    labels,
    undefined,
    dependencies,
  )
}

/** The file as it travels: JSON on a disk, not an object in this process. */
export function asFile(saved: WorkflowExport): unknown {
  return JSON.parse(JSON.stringify(saved.file)) as unknown
}

export function importWorkflow(actor: Actor, file: unknown): Promise<RawResponse> {
  return actor.browser.json(`/workflows/import?tz=${ZONE}`, 'POST', file)
}

export async function importWorkflowOk(
  actor: Actor,
  file: unknown,
  why = 'POST /workflows/import must create the folder (7.16)',
): Promise<string> {
  const response = await importWorkflow(actor, file)
  expectStatus(response, 201, why)
  const made = (response.json() as { folders: { id: string }[] }).folders
  expect(made, 'the import makes exactly one folder').toHaveLength(1)
  return String(made[0]?.id)
}

/* ------------------------------------------------------------------ *
 * The rows, which are what every criterion here judges
 * ------------------------------------------------------------------ */

export interface PageRow {
  id: string
  /** `task`, or the block's 4.17 kind. */
  kind: string
  text: string | null
  sectionId: string | null
  listParentId: string | null
  checked: boolean | null
}

/**
 * The folder's page as the database holds it, in the order `page_position`
 * puts it — blocks and Tasks in one sequence, which is what 4.17 says they
 * form.
 */
export async function pageRows(db: Db, folderId: string): Promise<PageRow[]> {
  const found = (await db.execute(sql`
    SELECT id, kind, text, section_block_id, list_parent_block_id, checked,
           page_position, position
      FROM page_blocks
     WHERE folder_id = ${folderId}::uuid
    UNION ALL
    SELECT id, 'task' AS kind, title AS text, section_block_id,
           NULL AS list_parent_block_id, NULL AS checked, page_position,
           NULL AS position
      FROM tasks
     WHERE folder_id = ${folderId}::uuid AND deleted_at IS NULL
     ORDER BY page_position, position
  `)) as unknown as { rows: Record<string, unknown>[] }
  return found.rows.map((row) => ({
    id: String(row.id),
    kind: String(row.kind),
    text: row.text === null || row.text === undefined ? null : String(row.text),
    sectionId:
      row.section_block_id === null || row.section_block_id === undefined
        ? null
        : String(row.section_block_id),
    listParentId:
      row.list_parent_block_id === null || row.list_parent_block_id === undefined
        ? null
        : String(row.list_parent_block_id),
    checked:
      row.checked === null || row.checked === undefined ? null : Boolean(row.checked),
  }))
}

export interface PageShape {
  kind: string
  text: string | null
  /** The text of the heading this row belongs to, or null for the page root. */
  under: string | null
  /** The text of the list item this one is nested under, or null. */
  nested_under: string | null
}

/** The rows with every identity replaced by the text of what it names, so two
 * folders in two accounts are comparable by what a person would see. */
export function shapeOf(rows: readonly PageRow[]): PageShape[] {
  const textOf = new Map(rows.map((row) => [row.id, row.text]))
  return rows.map((row) => ({
    kind: row.kind,
    text: row.text,
    under: row.sectionId === null ? null : (textOf.get(row.sectionId) ?? '(missing)'),
    nested_under:
      row.listParentId === null ? null : (textOf.get(row.listParentId) ?? '(missing)'),
  }))
}

/** The whole round trip in one call: compose already done, export, import into
 * `into`, and answer both shapes for comparison. */
export async function roundTrip(
  db: Db,
  from: Actor,
  folderId: string,
  into: Actor,
  name: string,
): Promise<{ saved: WorkflowExport; madeId: string; before: PageShape[]; after: PageShape[] }> {
  const saved = await savedWorkflow(from, folderId, name)
  const before = shapeOf(await pageRows(db, folderId))
  const madeId = await importWorkflowOk(into, asFile(saved))
  const after = shapeOf(await pageRows(db, madeId))
  return { saved, madeId, before, after }
}
