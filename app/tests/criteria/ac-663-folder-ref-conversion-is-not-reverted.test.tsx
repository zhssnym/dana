// @vitest-environment jsdom
/*
AC-663: given a folder page carrying a `folder_ref` block, when the person
retypes it as a heading, lets the save land, and then makes it a paragraph
again without leaving the page, then the stored row is a paragraph with no
relation and with the writing it gathered as a heading — the conversion they
asked for is not put back.

**This is the defect AC-660's fix introduced, found by the adversarial review
of issue #255 and not by the suite.** The carry reads a map of "which of these
blocks is really a reference", and the first spelling of it read that map from
`initialPage`, the page the editor was hydrated from. The comment above it
argued that the map could not go stale because the session remounts on a new
`initialPage`. **That is true of the map growing and false of it shrinking.**
The session does not remount after an ordinary save: `onCheckpoint` fires only
for a transaction carrying `create_task`, and the reconciliation effect returns
early while `page.revision === writer.revision`. So the map kept an entry for a
block long after a save had written `ref_folder_id: null` for it, BlockNote
keeps a block's id across a type conversion, and `dehydrateCanvas` re-applied
the entry to whatever was a paragraph under that id.

Driven through `FolderCanvas` against a real database before the fix, the rows
observed were these — the second transaction is the whole defect:

    SENT 1:  put_block {block_kind:"section", ref_folder_id:null, rich_content:{…}}
    AFTER 1: {"kind":"section","ref_folder_id":null,…}
    SENT 2:  put_block {block_kind:"folder_ref", ref_folder_id:"…", rich_content:null}
    AFTER 2: {"kind":"folder_ref","ref_folder_id":"…",…}

**Why it is worse than a surprise, and why it is a criterion rather than a
comment.** `page_blocks_ref_folder_id_fkey` is ON DELETE CASCADE, so after that
round trip deleting the named folder silently deletes the person's paragraph.
That is the exact hazard `folderRefsOf`'s own docstring gives as the reason not
to read the relation back out of the href, reached by a different door. And
**no criterion distinguished the two sources**: AC-660 to AC-662 were all green
with the map read from `initialPage`, because none of them saves twice in one
session.

The fix is one word — the map is read from `page`, the query row the writer
writes back after every save — and the first case below is the whole of the
evidence that it works. The second case is the other direction, which a fix
like this can break without anything noticing: a map that follows the server
must still *carry* a reference across the save that rewrote it.

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
import { editAndSave, mountCanvas, settled, typeInto } from '../support/folder-canvas-harness.js'
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
  viewer = await seedOwner(db, 'ac663')
  seededUsers.push(viewer)
}, 60_000)

afterAll(async () => {
  if ((client as DbClient | undefined) === undefined) return
  // 4.13's events name their actor under a RESTRICT foreign key and every
  // accepted transaction wrote one, so they go before the rows they point at.
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

async function seed(name: string, text: string | null = null): Promise<{ folder: string; referenced: string; reference: string; page: PageView }> {
  const seeded = await seedReferencePage(db, viewer, route, name, text)
  api.sent = []
  return seeded
}

describe('AC-663 a folder reference deliberately retyped is not restored by the carry', () => {
  test('reference to heading and back leaves a paragraph with no relation and its writing intact', async () => {
    const { folder, referenced, reference, page } = await seed('retyped and undone')
    expect(await storedBlock(db, reference)).toMatchObject({ kind: 'folder_ref', ref_folder_id: referenced })

    const container = mountCanvas(page, folder)
    await waitFor(() => { expect(surface.props).not.toBeNull() })
    const mounted = editorNow()

    const away = await editAndSave(surface, api, (editor) => {
      editor.updateBlock(reference, { type: 'heading', props: { level: 1 }, content: [{ type: 'text', text: 'Design', styles: {} }] })
    })
    await settled(container)
    expect(away.operations.flatMap((operation) => operation.op === 'put_block' && operation.id === reference ? [operation] : []))
      .toMatchObject([{ block_kind: 'section', ref_folder_id: null }])
    expect(await storedBlock(db, reference)).toMatchObject({ kind: 'section', ref_folder_id: null })

    /* The mechanism, measured rather than described: the session is still the
       one that mounted. If a save remounted it, a map read from `initialPage`
       would be refreshed by the remount and this criterion would be proving
       nothing about where the map comes from. */
    expect(editorNow()).toBe(mounted)

    const back = await editAndSave(surface, api, (editor) => {
      editor.updateBlock(reference, { type: 'paragraph', content: [{ type: 'text', text: 'Design notes', styles: {} }] })
    })
    await settled(container)
    expect(route.refusals).toEqual([])

    // The measurement above, inverted: `folder_ref` and the uuid here is the defect.
    expect(back.operations.flatMap((operation) => operation.op === 'put_block' && operation.id === reference ? [operation] : []))
      .toMatchObject([{ block_kind: 'paragraph', ref_folder_id: null }])
    const row = await storedBlock(db, reference)
    expect(row).toMatchObject({ kind: 'paragraph', ref_folder_id: null, text: 'Design notes' })
    /* The rich content the block gathered while it was not a reference. The
       defect dropped it, because `rich_content` travels with the kind and the
       restored kind refuses it — so the loss was the person's words as well as
       their gesture. */
    expect(row.rich_content).toEqual({ version: 1, runs: [{ text: 'Design notes' }] })
    /* And the hazard the relation carries, stated as the row that is left: a
       paragraph with no `ref_folder_id` is not taken by
       `page_blocks_ref_folder_id_fkey` when that folder is deleted. */
    expect(await rows(db, sql`SELECT id FROM page_blocks WHERE ref_folder_id=${referenced}::uuid`)).toEqual([])
  })

  /*
  The direction a fix of this shape breaks silently.

  Reading the map from the server's answer is right, and a map that came back
  *empty* after every save would also pass the case above while losing the
  relation on the second keystroke — which is issue #255's original defect,
  moved one save later. This is two edits to the reference in one mounted
  session, so the second one reads a map rebuilt from a page the save itself
  wrote.
  */
  test('two edits to the reference in one session both keep the relation', async () => {
    const { folder, referenced, reference, page } = await seed('typed in twice')

    const container = mountCanvas(page, folder)
    await waitFor(() => { expect(surface.props).not.toBeNull() })
    const mounted = editorNow()

    await editAndSave(surface, api, typeInto(reference, 'Studio archive'))
    await settled(container)
    expect(await storedBlock(db, reference)).toMatchObject({ kind: 'folder_ref', ref_folder_id: referenced, text: 'Studio archive' })

    await editAndSave(surface, api, typeInto(reference, 'Studio archive, 2026'))
    await settled(container)
    expect(route.refusals).toEqual([])
    expect(editorNow()).toBe(mounted)
    expect(await storedBlock(db, reference)).toMatchObject({ kind: 'folder_ref', ref_folder_id: referenced, text: 'Studio archive, 2026' })
  })
})
