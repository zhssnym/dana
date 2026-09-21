/*
AC-602: given a `document_transaction` writing a `file`, an `audio` or a
`video` block with no `file_id`, then it is refused before the first write;
and given a page that already holds such a row, then an edit that does not
write it still saves.

Issue #220, and the adversarial review of the branch that added the three
kinds. 4.17 as amended 2026-09-20 says a media block **references one stored
file by `file_id`**, and until this landed the `put_block` schema,
`applyDocument` and the database each accepted a `file`, `audio` or `video`
block naming nothing at all, all three answering 200. A block whose whole
content is a file it does not name is a player with no track under it.

**Three things this criterion fixes in place, and each is a decision rather
than an accident.**

*The refusal is in the document contract, ahead of the write.* Migration 0024
records why it is not a CHECK: a constraint is validated against every
existing row the moment it is added, migrations here are forward only, and a
production row may already carry the shape. The same sentence applies with
more force here than it did there, which is the second point.

*A null `file_id` on a media row is not merely possible but routine.*
`page_blocks_file_id_fkey` is `ON DELETE SET NULL`, so deleting the file —
7.19's ordinary lifetime, and `DELETE /api/v1/files/:id` refuses nothing for
being referenced — nulls every media block that named it. `update_block`
reaches the column directly and takes a null besides. So a rule read over the
merged document would turn deleting a picture into a page that can never be
saved again, which is the trap AC-600 closes for the pairing gate. The
refusal is scoped to what the transaction writes, and the second case is what
says so.

*`image` is deliberately not in the rule, and this is where a later reader
would otherwise see an oversight.* Every picture in the composer begins as an
empty image block: BlockNote's own image block is inserted with no URL and a
file-picker panel, `hydrateCanvas` draws a fileless one with `url: ''`, and
`dehydrateCanvas` projects it straight back to `file_id: null` — so the
canvas saves fileless image blocks today, on the keystroke after a person
inserts one. Refusing them would break image insertion in a way `npm test`
cannot see, the suite being `environment: 'node'`. The three kinds #220 added
have no such placeholder state: each is inserted from a file that already
exists. The third case pins the exemption so that it is a decision somebody
made rather than a gap somebody left.

Spec: 4.16 as amended 2026-09-20, 4.17 as amended 2026-09-20, 7.16 as amended
2026-09-20, 7.19 as amended 2026-09-20.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import type { DocumentBlockKind, DocumentOperation, PageView } from '../../src/shared/pages.js'
import {
  MP3_BYTES,
  MP4_BYTES,
  ZIP_BYTES,
  uploadImageOk,
  uploadKindOk,
} from '../support/uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac602')
beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)
afterAll(async () => {
  if (app) {
    await cast.cleanup(app.db)
    await app.close()
  }
})

const put = (
  id: string,
  kind: DocumentBlockKind,
  extra: Partial<Extract<DocumentOperation, { op: 'put_block' }>> = {},
): DocumentOperation => ({
  op: 'put_block',
  id,
  block_kind: kind,
  text: null,
  rich_content: null,
  file_id: null,
  ref_folder_id: null,
  width_pct: null,
  checked: null,
  ...extra,
})

async function read(owner: Actor, folder: string): Promise<PageView> {
  const response = await owner.browser.json(`/folders/${folder}/page`, 'GET')
  expectStatus(response, 200, 'page read')
  return response.json() as PageView
}

async function write(
  owner: Actor,
  folder: string,
  base: string,
  operations: DocumentOperation[],
): Promise<{ status: number; body: string }> {
  const response = await owner.browser.json(`/folders/${folder}/page/actions`, 'POST', {
    action: 'document_transaction',
    mutation_id: randomUUID(),
    base_revision: base,
    operations,
  })
  return { status: response.status, body: response.body.slice(0, 240) }
}

test('AC-602 a file, audio or video block naming nothing is refused before any write', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const folder = await createFolder(owner, 'ac602 names nothing')

  for (const kind of ['file', 'audio', 'video'] as const) {
    const before = await read(owner, folder)
    const id = randomUUID()
    const refused = await write(owner, folder, before.revision!, [
      put(id, kind),
      {
        op: 'set_outline',
        items: [{ kind: 'block', id, section_block_id: null, list_parent_block_id: null }],
      },
    ])
    expect(
      refused.status,
      `a ${kind} block references one stored file by file_id (4.17); answered ${String(refused.status)} ${refused.body}`,
    ).toBe(422)

    const after = await read(owner, folder)
    expect(after.revision, 'the refusal precedes the first write').toBe(before.revision)
    expect(after.blocks.length, 'and nothing was inserted').toBe(before.blocks.length)
  }
})

test('AC-602 a page already holding a fileless media row still saves an unrelated edit', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const folder = await createFolder(owner, 'ac602 already fileless')

  const audioFile = await uploadKindOk(owner, 'audio', folder, {
    name: 'ac602.mp3',
    type: 'audio/mpeg',
    bytes: MP3_BYTES,
  })
  const videoFile = await uploadKindOk(owner, 'video', folder, {
    name: 'ac602.mp4',
    type: 'video/mp4',
    bytes: MP4_BYTES,
  })

  const audio = randomUUID()
  const video = randomUUID()
  const paragraph = randomUUID()
  const outline: DocumentOperation = {
    op: 'set_outline',
    items: [
      { kind: 'block', id: audio, section_block_id: null, list_parent_block_id: null },
      { kind: 'block', id: video, section_block_id: null, list_parent_block_id: null },
      { kind: 'block', id: paragraph, section_block_id: null, list_parent_block_id: null },
    ],
  }
  const start = await read(owner, folder)
  expect(
    (
      await write(owner, folder, start.revision!, [
        put(audio, 'audio', { file_id: audioFile }),
        put(video, 'video', { file_id: videoFile }),
        put(paragraph, 'paragraph', {
          text: 'before',
          rich_content: { version: 1, runs: [{ text: 'before' }] },
        }),
        outline,
      ])
    ).status,
  ).toBe(200)

  /* Two routes to a fileless media row, and neither is a bypass anybody
     forgot. The first is 7.19's ordinary lifetime: a file is deleted and
     `page_blocks_file_id_fkey` nulls every block that named it. */
  expectStatus(
    await owner.browser.request(`/api/v1/files/${audioFile}`, { method: 'DELETE' }),
    204,
    'the audio file is deleted, which refuses nothing for being referenced',
  )

  /* The second reaches the column directly, and takes a null. */
  const written = await read(owner, folder)
  expectStatus(
    await owner.browser.json(`/folders/${folder}/page/actions`, 'POST', {
      action: 'update_block',
      block_id: video,
      updated_at: written.blocks.find((block) => block.id === video)!.updated_at,
      file_id: null,
    }),
    200,
    'update_block clears a video block’s file_id',
  )

  const fileless = await read(owner, folder)
  expect(fileless.blocks.find((block) => block.id === audio)?.file_id).toBeNull()
  expect(fileless.blocks.find((block) => block.id === video)?.file_id).toBeNull()

  const edit = await write(owner, folder, fileless.revision!, [
    put(paragraph, 'paragraph', {
      text: 'after',
      rich_content: { version: 1, runs: [{ text: 'after' }] },
    }),
    outline,
  ])
  expect(
    edit.status,
    `deleting a file must not make a page permanently unsaveable; answered ${String(edit.status)} ${edit.body}`,
  ).toBe(200)
  expect((await read(owner, folder)).blocks.find((block) => block.id === paragraph)?.text).toBe(
    'after',
  )
})

test('AC-602 an image block with no file is still accepted, because that is how one starts', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const folder = await createFolder(owner, 'ac602 empty image')

  const empty = randomUUID()
  const before = await read(owner, folder)
  const inserted = await write(owner, folder, before.revision!, [
    put(empty, 'image'),
    {
      op: 'set_outline',
      items: [{ kind: 'block', id: empty, section_block_id: null, list_parent_block_id: null }],
    },
  ])
  expect(
    inserted.status,
    `the composer saves a fileless image block on the keystroke after one is inserted; answered ${String(inserted.status)} ${inserted.body}`,
  ).toBe(200)
  expect((await read(owner, folder)).blocks.find((block) => block.id === empty)?.file_id).toBeNull()

  /* And the placeholder becomes a picture the ordinary way, so the exemption
     costs nothing: the same block, written again with a file. */
  const picture = await uploadImageOk(owner, folder, 'ac602.png')
  const filled = await write(owner, folder, (await read(owner, folder)).revision!, [
    put(empty, 'image', { file_id: picture }),
    {
      op: 'set_outline',
      items: [{ kind: 'block', id: empty, section_block_id: null, list_parent_block_id: null }],
    },
  ])
  expect(filled.status, `and then names one; ${filled.body}`).toBe(200)
  expect((await read(owner, folder)).blocks.find((block) => block.id === empty)?.file_id).toBe(
    picture,
  )

  /* The generic File block, by contrast, has no such state — which is what
     makes the rule above a rule rather than a ban. */
  const generic = randomUUID()
  const fileId = await uploadKindOk(owner, 'file', folder, {
    name: 'ac602.q4data',
    type: 'application/octet-stream',
    bytes: ZIP_BYTES,
  })
  const named = await write(owner, folder, (await read(owner, folder)).revision!, [
    put(generic, 'file', { file_id: fileId }),
    {
      op: 'set_outline',
      items: [
        { kind: 'block', id: empty, section_block_id: null, list_parent_block_id: null },
        { kind: 'block', id: generic, section_block_id: null, list_parent_block_id: null },
      ],
    },
  ])
  expect(named.status, `a File block that names its file is ordinary; ${named.body}`).toBe(200)
})
