// @vitest-environment jsdom
/*
AC-664: given a folder page carrying a `folder_ref` block, when the person
turns a *different* paragraph on that page into a Task, then the transaction
carries `create_task` and no `put_block` for the reference at all, and the
stored row is still a `folder_ref` naming the same folder.

**Why a gesture that has nothing to do with the reference gets its own
criterion.** `dehydrateCanvas` takes the reference map as a required third
argument, and the argument for that — written into its own docstring — is that
"an optional argument is a call site that drops it in silence again with
nothing to read". Required stops a *missing* argument. It does not stop a
*wrong* one, and `FolderCanvas` has two call sites: the change handler, which
AC-660 to AC-663 all drive, and the Task-creation path, which none of them
did. The adversarial review of issue #255 substituted an empty map at the
second one and measured **typecheck clean, AC-660, AC-661 and AC-662 green**,
with the original defect re-firing through this gesture.

**And this path is the worse of the two to lose it on.** An ordinary save
leaves the editor mounted, so the person can undo. `create_task` forces a
checkpoint — `CanvasWriter` reports one for any transaction carrying that
operation and `FolderCanvas` remounts the session on the page the server
answered — so the editor's history starts again on the flattened page and undo
cannot reach back past it. The case below asserts that remount as well as the
row, because it is why this is not merely a second copy of AC-660.

**What is not established here.** "Convert to Task" driven on the reference
block *itself* is a different gesture: `createTask` replaces a paragraph with
the Task rather than inserting beside it, so the reference is deleted. That is
a deliberate removal and the carry restores nothing removed (AC-660's third
case is that rule), but nobody has ruled on whether turning a reference into a
Task is a sensible thing to offer at all, and this criterion does not decide
it by pinning it.

Spec 4.17, 7.16, 12.9. Issue #255.
*/
import { cleanup, waitFor } from '@testing-library/react'
import { sql } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

import type { PageView } from '../../src/shared/pages.js'
import type { DocumentTransaction } from '../../src/shared/page-document.js'
import type { CanvasEditor } from '../../src/client/components/page/canvas/schema.js'
import type { Db, DbClient } from '../../db/client.js'
import type { CanvasApiSpy, CanvasSurfaceSpy } from '../support/folder-canvas-harness.js'
import { createTaskThroughTheDialog, mountCanvas, settled } from '../support/folder-canvas-harness.js'
import type { FolderPageRoute } from '../support/folder-ref-page.js'
import { seedOwner, seedReferencePage, storedBlock } from '../support/folder-ref-page.js'
import { cleanupUsers, createTestDb, rows } from '../support/helpers.js'

const surface = vi.hoisted((): CanvasSurfaceSpy => ({ props: null }))
const api = vi.hoisted((): CanvasApiSpy => ({ sent: [], page: { blocks: [], items: [] }, revision: 1 }))
const route = vi.hoisted((): FolderPageRoute => ({ send: null, refusals: [] }))

vi.mock('../../src/client/components/page/canvas/CanvasSurface.js', () => ({
  CanvasSurface: (props: NonNullable<CanvasSurfaceSpy['props']>) => { surface.props = props; return null },
}))
vi.mock('../../src/client/api/http.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  mutateApi: async (_schema: unknown, options: { body: DocumentTransaction }) => {
    api.sent.push(options.body)
    api.page = await route.send!(options.body)
    return api.page
  },
}))

let client: DbClient
let db: Db
let viewer = ''
const seededUsers: string[] = []

beforeAll(async () => {
  client = await createTestDb()
  db = client.db
  viewer = await seedOwner(db, 'ac664')
  seededUsers.push(viewer)
}, 60_000)

afterAll(async () => {
  if ((client as DbClient | undefined) === undefined) return
  for (const id of seededUsers) await db.execute(sql`DELETE FROM events WHERE actor_id = ${id}::uuid`)
  await cleanupUsers(db, seededUsers)
  await client.close()
})

afterEach(cleanup)
beforeEach(() => {
  surface.props = null
  api.sent = []
  api.page = { blocks: [], items: [] }
  route.send = null
  route.refusals = []
  sessionStorage.clear()
})

/** The editor instance this session is holding, which a remount replaces. */
function editorNow(): CanvasEditor {
  const captured = surface.props
  if (captured === null) throw new Error('CanvasSurface was never rendered; the canvas did not mount.')
  return captured.editor
}

async function seed(name: string): Promise<{ folder: string; referenced: string; reference: string; prose: string; page: PageView }> {
  const seeded = await seedReferencePage(db, viewer, route, name, 'The studio archive')
  api.sent = []
  return seeded
}

describe('AC-664 creating a Task elsewhere on the page leaves a folder reference alone', () => {
  test('the create_task transaction writes nothing to the reference and the row keeps its relation', async () => {
    const { folder, referenced, reference, prose, page } = await seed('a Task beside a reference')
    expect(await storedBlock(db, reference)).toMatchObject({ kind: 'folder_ref', ref_folder_id: referenced })

    const container = mountCanvas(page, folder)
    await waitFor(() => { expect(surface.props).not.toBeNull() })
    const mounted = editorNow()

    await createTaskThroughTheDialog(surface, prose, 'Write the studio brief')
    await settled(container)
    expect(route.refusals).toEqual([])

    /* Nothing was pending, so the gesture is exactly one transaction and it is
       the one carrying the Task. A second would mean the flush before it found
       work, which would make the assertion below read the wrong body. */
    expect(api.sent).toHaveLength(1)
    const sent = api.sent[0]!
    expect(sent.operations.some((operation) => operation.op === 'create_task')).toBe(true)

    /* The assertion the empty-map substitution fails. With the map dropped at
       this call site the reference projects as an ordinary paragraph, differs
       from the baseline, and is written back flat — so a `put_block` for it
       appears here where there should be none. */
    expect(sent.operations.filter((operation) => operation.op === 'put_block' && operation.id === reference)).toEqual([])
    expect(await storedBlock(db, reference)).toMatchObject({ kind: 'folder_ref', ref_folder_id: referenced, text: 'The studio archive', rich_content: null })

    /* Why this path is worse than an ordinary save: the transaction carried
       `create_task`, so the session checkpointed and the editor is a new one.
       Whatever this gesture wrote is past the end of the person's undo. */
    expect(editorNow()).not.toBe(mounted)

    // And the Task itself landed, so the case is not passing by doing nothing.
    const task = await rows(db, sql`SELECT title FROM tasks WHERE folder_id=${folder}::uuid`)
    expect(task.map((row) => String(row.title))).toEqual(['Write the studio brief'])
  })
})
