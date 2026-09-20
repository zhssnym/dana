// @vitest-environment jsdom
/*
AC-662: given a folder page whose `folder_ref` block has been typed in, when
the account is exported and when the folder is duplicated, then both carry the
typed relation and not a link to a uuid.

**This is the half that makes issue #255 worth fixing.** A `folder_ref` that
has been flattened to a paragraph still *looks* right: `richRun`'s href
refinement admits `/app/folders/<uuid>`, so the link survives as rich content
and the page reads exactly as it did. Nothing surfaces at the keystroke. What
is gone is `ref_folder_id`, and its three readers are all round trips — the
export document, the duplicate, and a workflow import remapping the reference
into the new account. So the loss appears later, somewhere else, in a document
that has been through one of them, and AC-660 stopping at the block's own row
would leave exactly the failure the issue describes unpinned.

**Two readers, chosen because they read the relation differently.**
`exportForViewer` projects the column straight out (`blockFrom`), so a
flattened block exports as `kind: "paragraph"` with `ref_folder_id: null` and
a href buried in `rich_content` — an export that names no folder at all.
`duplicateFolder` copies `kind` and `ref_folder_id` verbatim while remapping
both parent relations through its own id map, so the copy of a flattened block
is a paragraph for ever: there is nothing left for any later rewrite to find.
**The third reader, workflow import, is deliberately not driven here, and the
reason is worth writing down rather than leaving as an omission.** Its two
paths behave differently. The legacy `folder.blocks` path writes `section` and
`paragraph` only and cannot carry a reference at all. The version 2
`folder.document` path carries `documentOperation`s, so a `folder_ref` does
travel in the file — and `applyDocument` requires the referenced folder to be
one the *importer* is a member of, so an import into another account is refused
whole with `not_found` rather than landing a reference to a folder that is not
there. That refusal is `applyDocument`'s rule and predates this change; pinning
it here would be pinning somebody else's decision under this issue's number.

Spec 4.17, 7.16, 7.22, 12.9. Issue #255.
*/
import { randomUUID } from 'node:crypto'

import { cleanup, waitFor } from '@testing-library/react'
import { sql } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

import { getPageResponse, pageActionBody } from '../../src/shared/pages.js'
import type { DocumentOperation, PageView } from '../../src/shared/pages.js'
import type { DocumentTransaction } from '../../src/shared/page-document.js'
import { actOnFolderPage, pageView } from '../../src/server/domain/pages.js'
import { duplicateFolder } from '../../src/server/domain/acts.js'
import { exportForViewer } from '../../src/server/domain/export.js'
import type { ObjectStore } from '../../src/server/files/store.js'
import type { Db, DbClient } from '../../db/client.js'
import type { CanvasApiSpy, CanvasSurfaceSpy } from '../support/folder-ref-canvas-harness.js'
import { editAndSave, mountCanvas, settled, typeInto } from '../support/folder-ref-canvas-harness.js'
import { cleanupUsers, createTestDb, rows } from '../support/helpers.js'

const surface = vi.hoisted((): CanvasSurfaceSpy => ({ props: null }))
const api = vi.hoisted((): CanvasApiSpy => ({ sent: [], page: { blocks: [], items: [] } }))
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

/** No block here carries a file, so this exists only to satisfy the signature. */
const store: ObjectStore = {
  put: async () => { throw new Error('this criterion copies no bytes') },
  get: async () => null,
  remove: async () => undefined,
}

let client: DbClient
let db: Db
let viewer = ''
const seededUsers: string[] = []

beforeAll(async () => {
  client = await createTestDb()
  db = client.db
  const found = await rows(db, sql`INSERT INTO users (google_sub,email,display_name)
    VALUES (${`ac662-${randomUUID()}`},${`ac662-${randomUUID()}@folder-ref.test`},${'AC-662 owner'}) RETURNING id`)
  viewer = String(found[0]?.id)
  seededUsers.push(viewer)
  /* Provisioning writes this row for a real account and `readBundle` throws
     INV-14 without it, so an account seeded with one INSERT cannot be
     exported. Defaults throughout; nothing here reads a flag. */
  await db.execute(sql`INSERT INTO user_settings (user_id) VALUES (${viewer}::uuid)`)
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

/**
 * A folder page holding a reference to another folder, typed in through the
 * canvas — which is the gesture under test — and left settled.
 */
async function pageEditedThroughTheCanvas(name: string): Promise<{ folder: string; referenced: string; reference: string }> {
  const folder = await seedFolder(`${name} page`)
  const referenced = await seedFolder(`${name} target`)
  const reference = randomUUID()
  const empty = getPageResponse.parse(JSON.parse(JSON.stringify(await pageView(db, viewer, { folderId: folder, shelfId: null }))))
  const operations: DocumentOperation[] = [
    { op: 'put_block', id: reference, block_kind: 'folder_ref', text: null, rich_content: null, file_id: null, ref_folder_id: referenced, width_pct: null, checked: null },
    { op: 'set_outline', items: [{ kind: 'block' as const, id: reference, section_block_id: null, list_parent_block_id: null }] },
  ]
  const page = await send(folder, { action: 'document_transaction', mutation_id: randomUUID(), base_revision: empty.revision!, operations })
  route.send = (body) => send(folder, body)
  api.sent = []

  const container = mountCanvas(page, folder)
  await waitFor(() => { expect(surface.props).not.toBeNull() })
  await editAndSave(surface, api, typeInto(reference, 'The studio archive'))
  await settled(container)
  expect(route.refusals).toEqual([])
  return { folder, referenced, reference }
}

describe('AC-662 a folder reference typed in survives the round trips that read it', () => {
  test('the export carries the relation rather than a link to a uuid', async () => {
    const { folder, referenced, reference } = await pageEditedThroughTheCanvas('exported')

    const document = await exportForViewer(db, viewer)
    const exported = document?.folders.find((each) => each.id === folder)
    const block = exported?.blocks.find((each) => each.id === reference)
    expect(block).toMatchObject({ kind: 'folder_ref', ref_folder_id: referenced, text: 'The studio archive' })
    /* The defect's shape, asserted as absent rather than implied: a flattened
       block exports as prose whose only trace of the folder is an href. Note
       what the line above already settles — `page_blocks_rich_content_check`
       admits rich content on seven kinds and `folder_ref` is not one, so once
       the kind is right the null is the database's and not this fix's. It is
       here because the pair reads as one sentence, not because either half
       needs the other. */
    expect(block?.rich_content ?? null).toBeNull()
    expect(JSON.stringify(block).includes(`/app/folders/${referenced}`)).toBe(false)
  })

  test('the duplicate carries the relation, so there is something left for a rewrite to find', async () => {
    const { folder, referenced } = await pageEditedThroughTheCanvas('duplicated')

    const copy = await duplicateFolder(db, store, viewer, folder, null)
    expect(copy.kind).toBe('duplicated')
    const copied = await rows(db, sql`SELECT kind, ref_folder_id, text FROM page_blocks
      WHERE folder_id=${copy.kind === 'duplicated' ? copy.id : ''}::uuid`)
    expect(copied).toHaveLength(1)
    expect(String(copied[0]?.kind)).toBe('folder_ref')
    // `duplicateFolder` copies `ref_folder_id` verbatim while remapping both
    // parent relations through its own id map, so the copy names the original
    // target. That is the behaviour on `main` and this criterion does not move
    // it; what it pins is that the relation is there to be read at all.
    expect(String(copied[0]?.ref_folder_id)).toBe(referenced)
    expect(String(copied[0]?.text)).toBe('The studio archive')
  })
})
