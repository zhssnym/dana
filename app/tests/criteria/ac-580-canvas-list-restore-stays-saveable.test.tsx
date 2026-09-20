// @vitest-environment jsdom
/*
AC-580: given a folder page carrying list nesting this editor cannot draw, when
a gesture moves a nested item above its list parent or retypes that parent as a
heading, then the transaction the canvas sends is accepted and the writer
returns to Saved — the nesting is dropped and the child promoted rather than an
outline the server refuses being sent.

**Why this criterion runs the server and AC-464 to AC-466 do not.** Those three
check what they send with `refusalOf`, which runs `documentTransaction` — the
zod layer and nothing else. `applyDocument` states seven further refusals that
no schema can see, because each reads the outline as a whole, and issue #250's
review found the restore emitting two of them with all three criteria green: an
outline whose list parent comes *after* the item nested under it
(page-document.ts's "A list parent must precede the items nested under it"),
and one whose parent is no longer a list item at all ("A list item nests under
another list item of this page"). Both answered 422, the first from the drag
handle menu's Move up and the second from a block retyped as a heading. So the API this file
doubles is the route's own composition, `actOnFolderPage`, which is what
`POST /folders/:id/page/actions` calls, against a real database; a refusal
becomes the throw that a 422 becomes in `mutateApi`. The two gestures are
driven through the component so that the composition is what is measured, for
the reason the harness header gives.

**Why a refusal is worse than the loss it replaces**, which is the decision this
criterion pins. `CanvasWriter.flush` latches `failed` on a rejected send,
returns early on `failed` forever, and `change()` cannot move it off, so one
refused save stops every later keystroke from reaching the server for as long as
the tab is open while "Retry save" re-sends the identical payload for the
identical refusal. Losing one list's indentation is recoverable by re-indenting.
A page that will not save is not recoverable at all. So every condition in
`restoreCanvas` fails closed, and the third case below is the other half of that
sentence: a nesting the server would accept is still restored, so "fail closed"
cannot be read as "send nothing".

Spec 4.17, 7.16, 12.9. Issue #250.
*/
import { randomUUID } from 'node:crypto'

import { cleanup, waitFor, within } from '@testing-library/react'
import { sql } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

import { moveCanvasBlock } from '../../src/client/components/page/canvas/commands.js'
import { getPageResponse, pageActionBody } from '../../src/shared/pages.js'
import type { DocumentBlockKind, DocumentOperation, DocumentOutlineItem, PageView } from '../../src/shared/pages.js'
import type { DocumentTransaction } from '../../src/shared/page-document.js'
import { actOnFolderPage, pageView } from '../../src/server/domain/pages.js'
import type { Db, DbClient } from '../../db/client.js'
import type { CanvasApiSpy, CanvasSurfaceSpy } from '../support/folder-canvas-harness.js'
import { blockOf, editAndSave, mountCanvas } from '../support/folder-canvas-harness.js'
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
    VALUES (${`ac580-${randomUUID()}`},${`ac580-${randomUUID()}@canvas-save.test`},${'AC-580 owner'}) RETURNING id`)
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
 * through `pageActionBody`, which is the schema `parseBody` runs and the whole
 * of what AC-464 to AC-466 check, then 10.2's gate, `applyDocument`, and the
 * page read on the transaction's own snapshot. The response is put through
 * `getPageResponse` because that is what the client does with the body before
 * the writer ever sees it. Both schemas are in the path so that a failure here
 * cannot be dismissed as the double being stricter than the route.
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
  await db.execute(sql`INSERT INTO folder_members (folder_id,user_id) VALUES (${id}::uuid,${viewer}::uuid)`)
  return id
}

const put = (id: string, kind: DocumentBlockKind, text: string, checked: boolean | null = null): DocumentOperation =>
  ({ op: 'put_block', id, block_kind: kind, text, rich_content: null, file_id: null, ref_folder_id: null, width_pct: null, checked })
const at = (id: string, section: string | null = null, listParent: string | null = null): DocumentOutlineItem =>
  ({ kind: 'block', id, section_block_id: section, list_parent_block_id: listParent })

/** A page written through the real endpoint, and the folder it lives on. */
async function seedPage(name: string, operations: DocumentOperation[]): Promise<{ folder: string; page: PageView }> {
  const folder = await seedFolder(name)
  const empty = getPageResponse.parse(JSON.parse(JSON.stringify(await pageView(db, viewer, { folderId: folder, shelfId: null }))))
  const page = await send(folder, { action: 'document_transaction', mutation_id: randomUUID(), base_revision: empty.revision!, operations })
  route.send = (body) => send(folder, body)
  api.sent = []
  return { folder, page }
}

/** What the person is shown: FolderCanvas's own save status region.

    The timeout is deliberately wider than `waitFor`'s 1000 ms default. What
    this waits on is FolderCanvas's 450 ms autosave debounce, then a real
    Postgres round trip through the document route, then the writer's
    `committed` and a re-render to "Saved". A second is enough on a quiet
    machine and not on a 12-worker CI leg: run 201 on `d5f5b3d` failed here
    with `expected 'Saving…' to be 'Saved'` and passed on re-run, and the
    same assertion had already failed and re-passed twice that evening on a
    loaded container (issue #284). The assertion is unchanged; only the room
    it gives the mechanism it observes. */
async function savedStatus(container: HTMLElement): Promise<void> {
  await waitFor(() => { expect(within(container).getByRole('status').textContent).toBe('Saved') }, { timeout: 5000 })
}

describe('AC-580 a restored list parent never makes a page unsaveable', () => {
  test('Move up on a nested checklist item is accepted, and promotes the item', async () => {
    const section = randomUUID(), prose = randomUUID(), bullet = randomUUID(), tick = randomUUID(), code = randomUUID()
    const { folder, page } = await seedPage('move up above the list parent', [
      put(section, 'section', 'Shopping'), put(prose, 'paragraph', 'Before we go'),
      put(bullet, 'bullet', 'Groceries'), put(tick, 'checklist', 'Milk', true), put(code, 'code', 'npm run gate'),
      { op: 'set_outline', items: [at(section), at(prose, section), at(bullet, section), at(tick, section, bullet), at(code, section)] },
    ])
    expect(blockOf(page, tick).list_parent_block_id).toBe(bullet)

    const container = mountCanvas(page, folder)
    await waitFor(() => { expect(surface.props).not.toBeNull() })
    // The drag handle menu's own call, with its own argument: `commands.explain`
    // takes what it returns, and null is the success it reports.
    await editAndSave(surface, api, (editor) => {
      expect(moveCanvasBlock(editor, editor.getBlock(tick)!, 'up')).toBeNull()
    })

    // The status region is what the person reads, and it is the assertion that
    // waits; `refusals` names what the server said when it does not reach Saved.
    await savedStatus(container)
    expect(route.refusals).toEqual([])
    // Promoted, not refused, and everything the kind decides is still there.
    expect(blockOf(api.page, tick)).toMatchObject({ kind: 'checklist', checked: true, list_parent_block_id: null })
    expect(blockOf(api.page, bullet).kind).toBe('bullet')
    expect(api.page.items.map((item) => item.id)).toEqual([section, prose, tick, bullet, code])
  })

  test('retyping the list parent as a heading is accepted, and promotes the child', async () => {
    const section = randomUUID(), bullet = randomUUID(), tick = randomUUID()
    const { folder, page } = await seedPage('the list parent becomes a heading', [
      put(section, 'section', 'Shopping'), put(bullet, 'bullet', 'Groceries'), put(tick, 'checklist', 'Milk', true),
      { op: 'set_outline', items: [at(section), at(bullet, section), at(tick, section, bullet)] },
    ])
    expect(blockOf(page, tick).list_parent_block_id).toBe(bullet)

    const container = mountCanvas(page, folder)
    await waitFor(() => { expect(surface.props).not.toBeNull() })
    // Retyping the block in place — the same id, a new type — which is what
    // leaves a checklist item naming a `section` as its list parent. **Which
    // affordance in this build reaches that was not established**: the drag
    // handle menu has no heading item, and the slash menu's Heading 1 inserted
    // a new heading rather than converting the block when it was driven here.
    // So this case pins the shape rather than a route to it. The shape is what
    // `applyDocument` refuses and what the restore put on the wire, and an
    // editor that cannot produce it today is one BlockNote version away from
    // producing it.
    await editAndSave(surface, api, (editor) => { editor.updateBlock(bullet, { type: 'heading', props: { level: 2 } }) })

    // The status region is what the person reads, and it is the assertion that
    // waits; `refusals` names what the server said when it does not reach Saved.
    await savedStatus(container)
    expect(route.refusals).toEqual([])
    expect(blockOf(api.page, bullet).kind).toBe('section')
    expect(blockOf(api.page, tick)).toMatchObject({ kind: 'checklist', checked: true, list_parent_block_id: null })
  })

  test('a nesting the server would accept is still restored, so failing closed is not sending nothing', async () => {
    const section = randomUUID(), prose = randomUUID(), bullet = randomUUID(), tick = randomUUID()
    const { folder, page } = await seedPage('an edit that touches neither end', [
      put(section, 'section', 'Shopping'), put(prose, 'paragraph', 'Before we go'),
      put(bullet, 'bullet', 'Groceries'), put(tick, 'checklist', 'Milk', true),
      { op: 'set_outline', items: [at(section), at(prose, section), at(bullet, section), at(tick, section, bullet)] },
    ])

    const container = mountCanvas(page, folder)
    await waitFor(() => { expect(surface.props).not.toBeNull() })
    await editAndSave(surface, api, (editor) => { editor.updateBlock(prose, { content: 'Before we leave' }) })

    // The status region is what the person reads, and it is the assertion that
    // waits; `refusals` names what the server said when it does not reach Saved.
    await savedStatus(container)
    expect(route.refusals).toEqual([])
    expect(blockOf(api.page, tick)).toMatchObject({ kind: 'checklist', checked: true, list_parent_block_id: bullet })
    expect(blockOf(api.page, prose).text).toBe('Before we leave')
  })
})
