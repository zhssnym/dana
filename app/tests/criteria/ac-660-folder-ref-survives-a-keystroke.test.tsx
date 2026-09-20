// @vitest-environment jsdom
/*
AC-660: given a folder page carrying a `folder_ref` block, when the person
types inside it, then the row the server holds afterwards is still a
`folder_ref` naming the same folder, and only its words have changed.

**What this replaces, measured at `main` in issue #255.** One keystroke inside
that block sent `put_block {block_kind: 'paragraph', ref_folder_id: null}` and
the typed relation was gone. Nothing looked wrong: `hydrateCanvas` draws a
`folder_ref` as a paragraph carrying a link, the `/app/folders/<uuid>` href
survives as a rich-content run because it passes `richRun`'s href refinement,
and the person still sees a working link. What was destroyed is the relation
that `exportForViewer` reads and `duplicateFolder` copies, which is why AC-662
is the other half of this one and why neither stops at the transaction.

**Two gestures, and the second is the one an href could not have saved.** The
first types inside the link, which is the literal keystroke the issue measured
and leaves the href on the run. The second selects the link and types over it,
so the block's content is plain text with no href anywhere in it. A fix that
recovered the relation by reading `/app/folders/<uuid>` out of the content
would pass the first and fail the second — and it would also convert a
paragraph in which somebody merely wrote a folder link into a relation, which
`page_blocks_ref_folder_id_fkey` would then delete along with the folder, ON
DELETE CASCADE. The relation is carried from the page instead, which is what
`folderRefsOf` is.

**Why this drives the component and hands the result to the route.** The
harness header carries the first half; the second is that a transaction the
schema accepts is not one `applyDocument` accepts, and only the server can say
the row survived. So the transaction this criterion reads off the wire goes
through `pageActionBody` and `actOnFolderPage` against a real database, and the
assertion is the stored row rather than the request.

Spec 4.17, 7.16, 12.9. Issue #255.
*/
import { randomUUID } from 'node:crypto'

import { cleanup, waitFor } from '@testing-library/react'
import { sql } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

import { getPageResponse, pageActionBody } from '../../src/shared/pages.js'
import type { DocumentOperation, PageView } from '../../src/shared/pages.js'
import type { DocumentTransaction } from '../../src/shared/page-document.js'
import { actOnFolderPage, pageView } from '../../src/server/domain/pages.js'
import type { Db, DbClient } from '../../db/client.js'
import type { CanvasApiSpy, CanvasSurfaceSpy } from '../support/folder-canvas-harness.js'
import { editAndSave, mountCanvas, settled, typeInto } from '../support/folder-canvas-harness.js'
import { cleanupUsers, createTestDb, rows } from '../support/helpers.js'

const surface = vi.hoisted((): CanvasSurfaceSpy => ({ props: null }))
const api = vi.hoisted((): CanvasApiSpy => ({ sent: [], page: { blocks: [], items: [] }, revision: 1 }))
/* The one mutable seam: each case points this at its own folder before it
   mounts, because the mock factory is hoisted above every `let` in the file. */
const route = vi.hoisted((): { send: ((body: DocumentTransaction) => Promise<PageView>) | null; refusals: string[] } => ({ send: null, refusals: [] }))

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
  const found = await rows(db, sql`INSERT INTO users (google_sub,email,display_name)
    VALUES (${`ac660-${randomUUID()}`},${`ac660-${randomUUID()}@folder-ref.test`},${'AC-660 owner'}) RETURNING id`)
  viewer = String(found[0]?.id)
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

/**
 * The route, minus HTTP and the session it has already checked: the body
 * through `pageActionBody`, which is the schema `parseBody` runs, then 10.2's
 * gate, `applyDocument`, and the page read on the transaction's own snapshot.
 * The response goes through `getPageResponse` because that is what the client
 * does with the body before the writer ever sees it.
 */
async function send(folder: string, body: DocumentTransaction): Promise<PageView> {
  const parsed = pageActionBody.safeParse(body)
  if (!parsed.success) {
    route.refusals.push('validation_failed')
    throw new Error(`the contract refused this transaction: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`)
  }
  const outcome = await actOnFolderPage(db, viewer, folder, parsed.data)
  if (outcome.kind !== 'written') {
    route.refusals.push(outcome.kind)
    throw new Error(`the server refused this transaction: ${outcome.kind}`)
  }
  return getPageResponse.parse(JSON.parse(JSON.stringify(outcome.page)))
}

async function seedFolder(name: string): Promise<string> {
  const found = await rows(db, sql`INSERT INTO folders (owner_id,name) VALUES (${viewer}::uuid,${name}) RETURNING id`)
  const id = String(found[0]?.id)
  /* `full_control` spelled rather than left to the default, because the gate
     `send` goes through reads it. `createFolder` writes exactly this preset
     for whoever created the Folder (`domain/folders.ts`, R8A and R5), so a
     membership row without it seeds a state the product cannot produce:
     migration 0023 made the column NOT NULL DEFAULT 'can_view', which is the
     safe floor, and `actOnFolderPage` then refuses `folder.page.edit` so
     that every transaction below answers `forbidden` before it has written
     anything (issue #228). Nothing in this criterion is about Access -- it
     is the keystroke inside a `folder_ref` -- so the preset is the one this
     folder's owner would really hold. The same line is in
     `tests/support/folder-ref-page.ts`; the header there says why the
     spelling is duplicated, and anything that changes the seed's meaning
     moves both. */
  await db.execute(sql`INSERT INTO folder_members (folder_id,user_id,access) VALUES (${id}::uuid,${viewer}::uuid,'full_control')`)
  return id
}

/**
 * A folder page holding prose and a reference to another folder, written
 * through the endpoint rather than with an INSERT.
 *
 * That it can be written at all is part of what this criterion establishes.
 * `page_blocks_one_home_check` lets a `folder_ref` sit on a `folder_id`, the
 * seed writes exactly such a row on a folder, and `put_block` accepts the kind
 * — `DOCUMENT_BLOCK_KINDS` carries it and `documentOperation` refuses
 * `ref_folder_id` only on the six structured kinds.
 *
 * **What is not established, and this criterion does not pretend to: whether
 * any real folder page holds one.** Three doors write a `folder_ref` onto a
 * folder page — this one, 7.16's whole-page PUT, and `duplicateFolder`, which
 * copies kind and `ref_folder_id` verbatim — and **no screen drives any of
 * them.** `insert_block` refuses the kind outright
 * (`z.enum(['section','paragraph','image'])`), `usePutFolderPage` has no
 * caller left in the client, and `canvasOperations` emitted no `folder_ref`
 * before this change; the one screen that *makes* them, `shelfWritesOf`,
 * writes shelf pages, which are not this editor's. So the defect is real on
 * the path and its population is a question only production data answers.
 * Issue #255 says so and calls it the multiplier on the whole thing.
 *
 * **And what 4.17's "shelf pages only" means, which is the fourth thing and
 * the one a reader of this file will ask about first.** 4.17 gives
 * `ref_folder_id` as "FK folders(id) ON DELETE CASCADE; folder_ref kind,
 * shelf pages only", and this change makes the folder-page client emit
 * `block_kind: 'folder_ref'` for the first time. **Hassan ruled on 2026-09-20,
 * on issue #255, that the clause describes where these blocks are *authored*
 * and not where they may be stored, and that 4.17 therefore does not move**;
 * no frozen section changes with this work. Three facts settle it and each is
 * checkable from this tree. The branch **preserves rather than composes** — the
 * paragraph above is that finding, and it is why carrying a relation the person
 * did not ask to destroy is not the same act as creating one. Folder-page
 * `folder_ref` rows **already exist**: `app/db/seed.ts` writes one
 * (`blockNadiaFolderRef`) with `folder_id` set and `shelf_id` NULL, and the
 * only constraints on the column are `page_blocks_ref_folder_id_fkey` and a
 * partial index — **no CHECK forbids it** — so reading the clause as a storage
 * constraint would make Dana's own seeded database non-conforming. And 7.16
 * admits `ref_folder_id` on a folder-page transaction and says nothing about
 * shelves. The clause does not license destroying a reference that is already
 * there, which is what `main` did.
 */
async function seedReferencePage(name: string): Promise<{ folder: string; referenced: string; prose: string; reference: string; page: PageView }> {
  const folder = await seedFolder(`${name} page`)
  const referenced = await seedFolder(`${name} target`)
  const prose = randomUUID(), reference = randomUUID()
  const empty = getPageResponse.parse(JSON.parse(JSON.stringify(await pageView(db, viewer, { folderId: folder, shelfId: null }))))
  const operations: DocumentOperation[] = [
    { op: 'put_block', id: prose, block_kind: 'paragraph', text: 'What the studio is for.', rich_content: { version: 1, runs: [{ text: 'What the studio is for.' }] }, file_id: null, ref_folder_id: null, width_pct: null, checked: null },
    /* `text` null and `rich_content` null: a reference names a folder and
       carries no words of its own, and `page_blocks_rich_content_check`
       refuses rich content on this kind outright. */
    { op: 'put_block', id: reference, block_kind: 'folder_ref', text: null, rich_content: null, file_id: null, ref_folder_id: referenced, width_pct: null, checked: null },
    { op: 'set_outline', items: [prose, reference].map((id) => ({ kind: 'block' as const, id, section_block_id: null, list_parent_block_id: null })) },
  ]
  const page = await send(folder, { action: 'document_transaction', mutation_id: randomUUID(), base_revision: empty.revision!, operations })
  route.send = (body) => send(folder, body)
  api.sent = []
  return { folder, referenced, prose, reference, page }
}

async function storedBlock(id: string): Promise<{ kind: string; ref_folder_id: string | null; text: string | null; rich_content: unknown }> {
  const found = await rows(db, sql`SELECT kind, ref_folder_id, text, rich_content FROM page_blocks WHERE id=${id}::uuid`)
  const row = found[0]
  if (row === undefined) throw new Error(`the page no longer carries ${id}`)
  return {
    kind: String(row.kind),
    ref_folder_id: row.ref_folder_id === null || row.ref_folder_id === undefined ? null : String(row.ref_folder_id),
    text: row.text === null || row.text === undefined ? null : String(row.text),
    rich_content: row.rich_content ?? null,
  }
}

describe('AC-660 typing in a folder reference does not convert it to a paragraph', () => {
  test('a keystroke inside the link leaves the row a folder_ref naming the same folder', async () => {
    const { folder, referenced, reference, page } = await seedReferencePage('keystroke inside the link')
    expect(await storedBlock(reference)).toMatchObject({ kind: 'folder_ref', ref_folder_id: referenced, text: null })

    const container = mountCanvas(page, folder)
    await waitFor(() => { expect(surface.props).not.toBeNull() })
    const sent = await editAndSave(surface, api, (editor) => {
      // Typing inside the link text: the run keeps its href, which is the
      // gesture the issue measured and the one that read as harmless.
      editor.updateBlock(reference, { content: [{ type: 'link', href: `/app/folders/${referenced}`, content: 'Open folder!' }] })
    })

    const written = sent.operations.flatMap((operation) => operation.op === 'put_block' && operation.id === reference ? [operation] : [])
    expect(written).toHaveLength(1)
    // The measurement in #255, inverted: `paragraph` and null here is the defect.
    expect(written[0]).toMatchObject({ block_kind: 'folder_ref', ref_folder_id: referenced, rich_content: null })
    // `settled` rather than a bare await: the request is made many awaits
    // before the row moves, and the status region is where that is legible.
    await settled(container)
    expect(route.refusals).toEqual([])
    expect(await storedBlock(reference)).toMatchObject({ kind: 'folder_ref', ref_folder_id: referenced, text: 'Open folder!', rich_content: null })
  })

  test('typing over the link, so no href is left anywhere in the block, keeps the relation too', async () => {
    const { folder, referenced, reference, page } = await seedReferencePage('typed over the link')

    const container = mountCanvas(page, folder)
    await waitFor(() => { expect(surface.props).not.toBeNull() })
    const sent = await editAndSave(surface, api, typeInto(reference, 'Studio archive'))

    // Nothing in what is sent names the folder except `ref_folder_id`, which is
    // the whole point: the relation is carried from the page, never read back
    // out of the words.
    expect(JSON.stringify(sent).includes(`/app/folders/${referenced}`)).toBe(false)
    await settled(container)
    expect(route.refusals).toEqual([])
    expect(await storedBlock(reference)).toMatchObject({ kind: 'folder_ref', ref_folder_id: referenced, text: 'Studio archive' })
  })

  /*
  **This case is pinned by nothing in the carry and it is kept anyway.** It
  passes on `main` too: `folderRefsOf` is consulted only for a block the editor
  still holds, so there is no shape of this fix that could resurrect a removed
  one, and removing the carry entirely leaves it green. What it guards against
  is a later carry keyed on the stored page rather than on the document — the
  obvious next spelling — which would restore a deleted reference and read as a
  block that will not go away. Said plainly rather than left to look like
  evidence for the fix, which it is not.
  */
  test('deleting the block is still a deletion, so the carry does not resurrect what somebody removed', async () => {
    const { folder, reference, prose, page } = await seedReferencePage('deleted reference')

    const container = mountCanvas(page, folder)
    await waitFor(() => { expect(surface.props).not.toBeNull() })
    const sent = await editAndSave(surface, api, (editor) => { editor.removeBlocks([reference]) })

    expect(sent.operations.some((operation) => operation.op === 'delete_block' && operation.id === reference)).toBe(true)
    await settled(container)
    expect(route.refusals).toEqual([])
    expect(await rows(db, sql`SELECT id FROM page_blocks WHERE id=${reference}::uuid`)).toEqual([])
    expect(await storedBlock(prose)).toMatchObject({ kind: 'paragraph' })
  })
})
