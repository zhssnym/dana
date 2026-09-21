/*
AC-498: given the folder canvas, when a document transaction writes a `file`,
`audio` or `video` block naming a stored file, then each is stored as its own
Dana kind with its `file_id` and reads back as that kind after a reload.

AC-500: an `image` block's persisted width still round-trips exactly as it did
before #220.

AC-501: a `video` block persists a width and round-trips it; an `audio` block
and a `file` block refuse one.

AC-502: a document holding only image blocks, written the way it was written
before #220, still reads and still saves.

Issue #220, R1's "Canonical composer block kinds" and "Block presentation
state", proofs 11, 13, 14 and 17.

**A block carries the file's identity and none of its metadata**, which is the
sentence the issue puts in bold and which AC-498 asserts directly: the stored
block has a `file_id` and no copied filename, no copied MIME and no copied byte
size. The `files` row is the one authority on all three, and a second
authoritative payload is two facts free to disagree.

**AC-501 is the width contract and it is narrow on purpose.** R1 extends the
restrained centred width to previewable video and stops: audio uses its natural
compact player width and a generic file block does not resize in M1. Nothing
persists player state — position, volume or speed — at all, which is why no
case here writes any.

**AC-502 is the compatibility case and it is the cheap one to forget.** Every
document in production today is image-only, and the change that widens a
vocabulary is exactly the change that can narrow it by accident.

Spec: 4.17, 7.16.
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
const cast = new Cast(['owner'], 'ac498')
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
): Promise<number> {
  const response = await owner.browser.json(`/folders/${folder}/page/actions`, 'POST', {
    action: 'document_transaction',
    mutation_id: randomUUID(),
    base_revision: base,
    operations,
  })
  return response.status
}

test('AC-498 a file, an audio and a video block save and reload as themselves', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const folder = await createFolder(owner, 'ac498 media blocks')

  const fileId = await uploadKindOk(owner, 'file', folder, {
    name: 'contract.q4data',
    type: 'application/octet-stream',
    bytes: ZIP_BYTES,
  })
  const audioId = await uploadKindOk(owner, 'audio', folder, {
    name: 'theme.mp3',
    type: 'audio/mpeg',
    bytes: MP3_BYTES,
  })
  const videoId = await uploadKindOk(owner, 'video', folder, {
    name: 'demo.mp4',
    type: 'video/mp4',
    bytes: MP4_BYTES,
  })
  const imageId = await uploadImageOk(owner, folder, 'ac498.png')

  const blocks = [
    { kind: 'file' as const, id: randomUUID(), file: fileId },
    { kind: 'audio' as const, id: randomUUID(), file: audioId },
    { kind: 'video' as const, id: randomUUID(), file: videoId },
    { kind: 'image' as const, id: randomUUID(), file: imageId },
  ]

  const before = await read(owner, folder)
  expect(
    await write(owner, folder, before.revision!, [
      ...blocks.map((block) => put(block.id, block.kind, { file_id: block.file })),
      {
        op: 'set_outline',
        items: blocks.map((block) => ({
          kind: 'block' as const,
          id: block.id,
          section_block_id: null,
          list_parent_block_id: null,
        })),
      },
    ]),
    'the four media kinds are accepted (#220 R1)',
  ).toBe(200)

  const stored = await read(owner, folder)
  expect(stored.items.map((item) => item.id)).toEqual(blocks.map((block) => block.id))
  for (const block of blocks) {
    const found = stored.blocks.find((candidate) => candidate.id === block.id)
    expect(found?.kind, `${block.kind} reads back as itself`).toBe(block.kind)
    expect(found?.file_id, `${block.kind} keeps its file reference`).toBe(block.file)
    /* And carries nothing of the file's own. A block that copied the name,
       the MIME or the byte size would be a second authoritative payload,
       which the issue forbids by name. The read shape has no field for any of
       them; `file_width` and `file_height` are the file's, read-only, and are
       null for everything that is not a picture. */
    expect(found?.ref_folder_id).toBeNull()
    if (block.kind !== 'image') {
      expect(found?.text, `${block.kind} carries no text of its own`).toBeNull()
      expect(found?.rich_content ?? null).toBeNull()
      expect(found?.file_width, `${block.kind} has no picture dimensions`).toBeNull()
      expect(found?.file_height).toBeNull()
    }
  }
})

test('AC-500 and AC-501 a width belongs to an image and a video, and to nothing else', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const folder = await createFolder(owner, 'ac501 widths')

  const imageId = await uploadImageOk(owner, folder, 'ac501.png')
  const videoId = await uploadKindOk(owner, 'video', folder, {
    name: 'wide.mp4',
    type: 'video/mp4',
    bytes: MP4_BYTES,
  })
  const audioId = await uploadKindOk(owner, 'audio', folder, {
    name: 'narrow.mp3',
    type: 'audio/mpeg',
    bytes: MP3_BYTES,
  })

  const image = randomUUID()
  const video = randomUUID()
  const audio = randomUUID()

  const before = await read(owner, folder)
  expect(
    await write(owner, folder, before.revision!, [
      put(image, 'image', { file_id: imageId, width_pct: 40 }),
      put(video, 'video', { file_id: videoId, width_pct: 75 }),
      put(audio, 'audio', { file_id: audioId }),
      {
        op: 'set_outline',
        items: [image, video, audio].map((id) => ({
          kind: 'block' as const,
          id,
          section_block_id: null,
          list_parent_block_id: null,
        })),
      },
    ]),
    'an image width and a video width are both persisted (4.17, #220 R1)',
  ).toBe(200)

  const stored = await read(owner, folder)
  expect(
    stored.blocks.find((block) => block.id === image)?.width_pct,
    'AC-500: the image width round-trip is exactly what it was before #220',
  ).toBe(40)
  expect(
    stored.blocks.find((block) => block.id === video)?.width_pct,
    'AC-501: a video persists its restrained centred width',
  ).toBe(75)
  expect(
    stored.blocks.find((block) => block.id === audio)?.width_pct,
    'an audio uses its natural compact player width and persists none',
  ).toBeNull()

  // And the refusals, which are what make the sentence above a rule rather
  // than a description of what a client happened to send.
  for (const kind of ['audio', 'file'] as const) {
    const id = randomUUID()
    const base = await read(owner, folder)
    expect(
      await write(owner, folder, base.revision!, [
        put(id, kind, { width_pct: 50 }),
        {
          op: 'set_outline',
          items: [
            ...base.items.map((item) => ({
              kind: item.kind,
              id: item.id,
              section_block_id:
                base.blocks.find((block) => block.id === item.id)?.section_block_id ?? null,
              list_parent_block_id: null,
            })),
            { kind: 'block' as const, id, section_block_id: null, list_parent_block_id: null },
          ],
        },
      ]),
      `a ${kind} block does not resize in M1 (#220 R1)`,
    ).toBe(422)
  }
})

test('AC-502 an image-only document written the pre-#220 way still reads and still saves', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const folder = await createFolder(owner, 'ac502 legacy image document')
  const imageId = await uploadImageOk(owner, folder, 'ac502.png')

  /* The legacy whole-page writer, which is what every document in production
     was written with. It must still work, and the page it writes must still
     be readable, or #220 has narrowed a vocabulary while widening it. */
  const legacy = await owner.browser.json(`/folders/${folder}/page`, 'PUT', {
    blocks: [
      { kind: 'section', position: 0, text: 'Pictures' },
      { kind: 'paragraph', position: 1, text: 'One picture below.' },
      { kind: 'image', position: 2, file_id: imageId, width_pct: 60 },
    ],
  })
  expectStatus(legacy, 200, 'the legacy whole-page writer still writes an image page')

  const stored = await read(owner, folder)
  const image = stored.blocks.find((block) => block.kind === 'image')
  expect(image?.file_id).toBe(imageId)
  expect(image?.width_pct).toBe(60)
  // The picture's own shape still rides across, read-only and the file's
  // (issue #27, migration 0009), which #220 leaves exactly alone.
  expect(image?.file_width).toBe(1)
  expect(image?.file_height).toBe(1)

  // And the same page still takes a modern document transaction on top.
  const base = await read(owner, folder)
  const added = randomUUID()
  expect(
    await write(owner, folder, base.revision!, [
      put(added, 'paragraph', { text: 'and a sentence after it' }),
      {
        op: 'set_outline',
        items: [
          ...base.items.map((item) => ({
            kind: item.kind,
            id: item.id,
            section_block_id:
              base.blocks.find((block) => block.id === item.id)?.section_block_id ?? null,
            list_parent_block_id: null,
          })),
          { kind: 'block' as const, id: added, section_block_id: null, list_parent_block_id: null },
        ],
      },
    ]),
    'an image-only document is still editable after #220',
  ).toBe(200)
})
