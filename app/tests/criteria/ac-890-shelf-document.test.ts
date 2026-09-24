/*
AC-890..AC-893: a Shelf's contextual content is read and written through
7.16's `document_transaction` (issue #221, Shelf half), losing nothing that
the legacy Shelf editor stored, in the order it stored it.

- AC-890: content written by the legacy whole-page PUT (the deployed client)
  is the document's first revision: a document transaction that inserts one
  block between existing ones keeps every existing row, its text and its
  folder reference, and the stored order is the outline's.
- AC-891: a transaction on a stale revision is 409 and writes nothing; a
  replay of a committed mutation is answered from its receipt and writes
  nothing twice.
- AC-892: once the document path has written a Shelf, the legacy PUT is
  refused 409 and the stored rows are unchanged -- it would otherwise delete
  every block kind it cannot draw.
- AC-893: another person's POST to the Shelf's document route is 404 and
  writes nothing; a Folder row may place only a Folder that is on this Shelf.

Spec: 4.17, 4.18, 7.16, 10.2.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'stranger'])
const SHELF = 'ac890 shelf'

interface Stage {
  owner: Actor
  stranger: Actor
  shelfId: string
  onShelf: string
  offShelf: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged !== undefined) return staged
  const [owner, stranger] = await cast.of(app)
  if (owner === undefined || stranger === undefined) throw new Error('two actors')
  const made = await owner.browser.json('/shelves', 'POST', { name: SHELF })
  expectStatus(made, 201, 'the owner creates a shelf')
  const shelfId = String((made.json() as { id: unknown }).id)
  const onShelf = await createFolder(owner, 'ac890 on shelf')
  const offShelf = await createFolder(owner, 'ac890 off shelf')
  expectStatus(
    await owner.browser.json(`/folders/${onShelf}/my-membership`, 'PATCH', { shelf: SHELF }),
    200,
    'the folder is filed on the shelf',
  )
  staged = { owner, stranger, shelfId, onShelf, offShelf }
  return staged
}

interface StoredBlock {
  id: string
  kind: string
  text: string | null
  ref_folder_id: string | null
}
async function storedBlocks(shelfId: string): Promise<StoredBlock[]> {
  const found = await rows(
    app.db,
    sql`SELECT id, kind, text, ref_folder_id FROM page_blocks
         WHERE shelf_id = ${shelfId}::uuid
         ORDER BY page_position ASC NULLS LAST, position, id`,
  )
  return found.map((row) => ({
    id: String(row.id),
    kind: String(row.kind),
    text: row.text == null ? null : String(row.text),
    ref_folder_id: row.ref_folder_id == null ? null : String(row.ref_folder_id),
  }))
}

interface Read {
  revision: string
  blocks: { id: string }[]
}
async function read(actor: Actor, shelfId: string): Promise<Read> {
  const page = await actor.browser.json(`/shelves/${shelfId}/page`, 'GET')
  expectStatus(page, 200, 'the owner reads the shelf page')
  return page.json() as Read
}

function paragraph(id: string, text: string) {
  return {
    op: 'put_block',
    id,
    block_kind: 'paragraph',
    text,
    rich_content: null,
    file_id: null,
    ref_folder_id: null,
    width_pct: null,
  }
}
function outline(ids: readonly string[]) {
  return {
    op: 'set_outline',
    items: ids.map((id) => ({ kind: 'block', id, section_block_id: null })),
  }
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-890..AC-893 the Shelf document', () => {
  let legacy: StoredBlock[] = []
  let inserted = ''
  let committed = { mutation_id: '', body: {} as Record<string, unknown> }

  test('AC-890: legacy shelf content and its order survive a document transaction', async () => {
    const { owner, shelfId, onShelf } = await stage()
    const put = await owner.browser.json(`/shelves/${shelfId}/page`, 'PUT', {
      blocks: [
        { kind: 'section', position: 0, text: 'ac890 heading' },
        { kind: 'paragraph', position: 1, text: 'ac890 first' },
        { kind: 'folder_ref', position: 2, ref_folder_id: onShelf },
        { kind: 'paragraph', position: 3, text: 'ac890 last' },
      ],
    })
    expectStatus(put, 200, 'the deployed client writes the shelf page')
    legacy = await storedBlocks(shelfId)
    expect(legacy.map((b) => b.kind)).toEqual(['section', 'paragraph', 'folder_ref', 'paragraph'])

    const before = await read(owner, shelfId)
    expect(before.blocks.map((b) => b.id)).toEqual(legacy.map((b) => b.id))

    inserted = randomUUID()
    const ids = legacy.map((b) => b.id)
    const order = [ids[0], ids[1], inserted, ids[2], ids[3]] as string[]
    committed = {
      mutation_id: randomUUID(),
      body: {},
    }
    committed.body = {
      action: 'document_transaction',
      mutation_id: committed.mutation_id,
      base_revision: before.revision,
      operations: [paragraph(inserted, 'ac890 inserted'), outline(order)],
    }
    const written = await owner.browser.json(`/shelves/${shelfId}/page/actions`, 'POST', committed.body)
    expectStatus(written, 200, 'the document transaction commits')

    const after = await storedBlocks(shelfId)
    expect(after.map((b) => b.id), 'stored order is the outline').toEqual(order)
    for (const block of legacy) {
      expect(after.find((b) => b.id === block.id), `legacy block ${block.kind} kept as it was`).toEqual(block)
    }
    expect(after.find((b) => b.id === inserted)?.text, 'the new block text arrives').toBe('ac890 inserted')
    const receipts = await rows(
      app.db,
      sql`SELECT committed_revision FROM shelf_document_receipts WHERE shelf_id = ${shelfId}::uuid`,
    )
    expect(receipts).toHaveLength(1)
    expect(String(receipts[0]?.committed_revision)).toBe((await read(owner, shelfId)).revision)
  })

  test('AC-891: a stale revision writes nothing; a replay writes nothing twice', async () => {
    const { owner, shelfId } = await stage()
    const snapshot = await storedBlocks(shelfId)
    const stale = await owner.browser.json(`/shelves/${shelfId}/page/actions`, 'POST', {
      action: 'document_transaction',
      mutation_id: randomUUID(),
      base_revision: 'not-the-revision',
      operations: [outline([])],
    })
    expectStatus(stale, 409, 'a stale base revision conflicts')
    expect(await storedBlocks(shelfId)).toEqual(snapshot)

    const replay = await owner.browser.json(`/shelves/${shelfId}/page/actions`, 'POST', committed.body)
    expectStatus(replay, 200, 'a retried mutation is answered from its receipt')
    expect((replay.json() as { mutation?: { replayed?: boolean } }).mutation?.replayed).toBe(true)
    expect(await storedBlocks(shelfId)).toEqual(snapshot)
  })

  test('AC-892: the legacy PUT is refused once the document path owns the shelf', async () => {
    const { owner, shelfId } = await stage()
    const snapshot = await storedBlocks(shelfId)
    const put = await owner.browser.json(`/shelves/${shelfId}/page`, 'PUT', { blocks: [] })
    expectStatus(put, 409, 'the legacy writer would delete the document; it is refused')
    expect(await storedBlocks(shelfId)).toEqual(snapshot)
  })

  test('AC-893: a stranger is 404 and a Folder row must be on this Shelf', async () => {
    const { owner, stranger, shelfId, offShelf } = await stage()
    const snapshot = await storedBlocks(shelfId)
    const { revision } = await read(owner, shelfId)
    const ids = snapshot.map((b) => b.id)

    const foreign = await stranger.browser.json(`/shelves/${shelfId}/page/actions`, 'POST', {
      action: 'document_transaction',
      mutation_id: randomUUID(),
      base_revision: revision,
      operations: [outline([])],
    })
    expectStatus(foreign, 404, "another person's shelf reads as nonexistent")
    expect(foreign.body).not.toContain(SHELF)
    expect(await storedBlocks(shelfId)).toEqual(snapshot)

    const refId = randomUUID()
    const offShelfRef = await owner.browser.json(`/shelves/${shelfId}/page/actions`, 'POST', {
      action: 'document_transaction',
      mutation_id: randomUUID(),
      base_revision: revision,
      operations: [
        {
          op: 'put_block',
          id: refId,
          block_kind: 'folder_ref',
          text: null,
          rich_content: null,
          file_id: null,
          ref_folder_id: offShelf,
          width_pct: null,
        },
        outline([...ids, refId]),
      ],
    })
    expectStatus(offShelfRef, 422, 'a folder not on this shelf is not a Shelf row')
    expect(JSON.stringify(offShelfRef.json())).toContain('ref_folder_id')
    expect(await storedBlocks(shelfId)).toEqual(snapshot)
  })
})
