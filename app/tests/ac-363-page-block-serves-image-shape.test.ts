/*
AC-363: given an image block on a folder page, then every member reading that
page is told the picture's width and height, not only the person who uploaded
it; given a block with no file, and a block whose file was stored before
migration 0009, then both are null; and given the page written back
unchanged, then the shape survives, because it is the file's and no write
carries it.

**The second reader is the criterion.** The client that uploads a picture
holds the `File` and knows its shape the moment it is chosen, so the space is
reserved correctly for the author on that one visit and the page still jumps
for everybody else and for the author on their next load. Issue #27 exists
because that half-fix is easy to ship and looks finished from the seat that
shipped it. A case that only ever read the page as the uploader would pass on
exactly that build, so this one reads it as somebody who has never seen the
bytes.

**The null cases are not padding.** No backfill has been run and none is
scheduled: every file stored before 0009 has null dimensions for as long as
that stays true, so "null behaves exactly as today" is a live contract rather
than a migration-week footnote, and a block that names no file at all must not
start answering a number either.

**The round trip matters because the write shape deliberately has no place to
put these.** `PageBlockWrite` carries `width_pct`, which is a decision about
the block, and not the dimensions, which are a fact about the file. A client
echoing blocks back — which is what 7.16's PUT-whole contract makes every
client do — therefore cannot send them, and must not lose them by not
sending them.

Spec: 4.16 as amended by migration 0009, 4.17, 7.16. Issue #27.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
  expectStatus,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { seedCoverFile } from './s22a-harness.js'
import { imagePng, upload } from './uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'reader'], 'i27c')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

interface Block extends Record<string, unknown> {
  id?: string
  kind?: string
  file_id?: unknown
  file_width?: unknown
  file_height?: unknown
  updated_at?: string
}

async function pageOf(actor: Actor, folderId: string): Promise<Block[]> {
  const response = await actor.browser.json(`/folders/${folderId}/page`, 'GET')
  expectStatus(response, 200, 'the folder page reads (spec 7.16)')
  return (response.json() as { blocks?: Block[] }).blocks ?? []
}

describe('AC-363 a page tells every reader the shape of its pictures', () => {
  test('the member who did not upload it is told; a fileless block and a pre-0009 file are null; a rewrite keeps it', async () => {
    const [owner, reader] = (await cast.of(app)) as [Actor, Actor]
    const folder = await createFolder(owner, 'i27c ac363 folder')
    await connect(app.db, owner.id, reader.id)
    await addMemberOk(owner, folder, reader.id)

    const stored = await upload(
      owner,
      '/files',
      { kind: 'image', folder_id: folder },
      { name: 'shape.png', type: 'image/png', bytes: await imagePng(60, 20) },
    )
    expectStatus(stored, 201, 'the picture uploads (spec 7.15)')
    const uploadedId = String((stored.json() as { id?: unknown }).id)

    // Seeded straight into the table, which is what every row stored before
    // migration 0009 looks like: bytes on disk and a shape nobody read.
    const legacyId = await seedCoverFile(app.db, owner.id, folder)

    const written = await owner.browser.json(`/folders/${folder}/page`, 'PUT', {
      blocks: [
        { kind: 'paragraph', position: 0, text: 'i27c ac363 words' },
        { kind: 'image', position: 1, file_id: uploadedId },
        { kind: 'image', position: 2, file_id: legacyId },
      ],
    })
    expectStatus(written, 200, 'the page is written (spec 7.16)')

    const asRead = await pageOf(reader, folder)
    const measured = asRead.find((block) => block.file_id === uploadedId)
    expect(
      measured?.file_width,
      'the reader who never held the bytes must be told the width, or the page jumps by the height of the picture for everyone but its author (issue #27)',
    ).toBe(60)
    expect(measured?.file_height, 'and the height').toBe(20)

    const legacy = asRead.find((block) => block.file_id === legacyId)
    expect(
      legacy?.file_width,
      'a file stored before 0009 has no recorded shape and no backfill has been run: null means unknown, and a client must draw exactly what it drew before these columns existed',
    ).toBeNull()
    expect(legacy?.file_height, 'the same, on the other half of the pair').toBeNull()

    const words = asRead.find((block) => block.kind === 'paragraph')
    expect(
      words?.file_width,
      'a block that names no file has no picture to be the shape of',
    ).toBeNull()
    expect(words?.file_height).toBeNull()

    // 7.16 is PUT-whole, so every client echoes what it read; the write shape
    // has no field for a dimension, and that must not cost the page one.
    const echoed = await owner.browser.json(`/folders/${folder}/page`, 'PUT', {
      blocks: asRead.map((block) => ({
        id: block.id,
        kind: block.kind,
        position: block.position,
        text: block.text ?? null,
        file_id: block.file_id ?? null,
        width_pct: block.width_pct ?? null,
        updated_at: block.updated_at,
      })),
    })
    expectStatus(echoed, 200, 'the page is written back unchanged (spec 7.16)')

    const after = await pageOf(reader, folder)
    const again = after.find((block) => block.file_id === uploadedId)
    expect(
      [again?.file_width, again?.file_height],
      'the shape is the file’s: a write that cannot carry it must not be able to erase it either',
    ).toEqual([60, 20])
  })
})
