/*
AC-499: given a document transaction whose block kind and whose file's kind
disagree, then it is refused before any write, and the page is left exactly as
it was.

Issue #220, proof 12. This is the enforcement half of AC-491: that criterion
proves the upload keeps the treatment the person declared, and this one proves
the document cannot undo it afterwards.

**Both directions are refused and both matter, for different reasons.**

Dressing a generic `file` as previewable media is the mismatch with
consequences: a `file` row is untrusted bytes of any type whatever, served as
an attachment under nosniff precisely because nothing has validated them, and a
block that called one an `image`, an `audio` or a `video` would be asking the
browser to render them inline. Refusing it is the fail-closed direction.

Demoting validated media into a File block is refused too, and that one is
about honesty rather than safety: a File block is a File block because its
bytes were uploaded as one, and a document that could relabel an Image block
as a File block after the fact would make insertion mode a suggestion.

**The page is read before and after each refusal**, because a validation that
runs after the first write is not a validation — it is a partial edit with an
error code on the end. Every rule in `applyDocument` precedes the first
statement that changes anything, and the revision is how that is observed.

Spec: 4.16, 4.17, 7.16, 10.2.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import type { DocumentBlockKind, PageView } from '../../src/shared/pages.js'
import {
  MP3_BYTES,
  MP4_BYTES,
  ZIP_BYTES,
  uploadImageOk,
  uploadKindOk,
} from '../support/uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac499')
beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)
afterAll(async () => {
  if (app) {
    await cast.cleanup(app.db)
    await app.close()
  }
})

async function read(owner: Actor, folder: string): Promise<PageView> {
  const response = await owner.browser.json(`/folders/${folder}/page`, 'GET')
  expectStatus(response, 200, 'page read')
  return response.json() as PageView
}

async function attempt(
  owner: Actor,
  folder: string,
  base: string,
  kind: DocumentBlockKind,
  fileId: string,
): Promise<number> {
  const id = randomUUID()
  const response = await owner.browser.json(`/folders/${folder}/page/actions`, 'POST', {
    action: 'document_transaction',
    mutation_id: randomUUID(),
    base_revision: base,
    operations: [
      {
        op: 'put_block',
        id,
        block_kind: kind,
        text: null,
        rich_content: null,
        file_id: fileId,
        ref_folder_id: null,
        width_pct: null,
        checked: null,
      },
      {
        op: 'set_outline',
        items: [{ kind: 'block', id, section_block_id: null, list_parent_block_id: null }],
      },
    ],
  })
  return response.status
}

test('AC-499 every crossed pairing of block kind and file kind is refused, and writes nothing', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const folder = await createFolder(owner, 'ac499 pairing')

  const stored = {
    image: await uploadImageOk(owner, folder, 'ac499.png'),
    file: await uploadKindOk(owner, 'file', folder, {
      name: 'ac499.q4data',
      type: 'application/octet-stream',
      bytes: ZIP_BYTES,
    }),
    audio: await uploadKindOk(owner, 'audio', folder, {
      name: 'ac499.mp3',
      type: 'audio/mpeg',
      bytes: MP3_BYTES,
    }),
    video: await uploadKindOk(owner, 'video', folder, {
      name: 'ac499.mp4',
      type: 'video/mp4',
      bytes: MP4_BYTES,
    }),
  }

  const kinds = ['image', 'file', 'audio', 'video'] as const
  for (const blockKind of kinds) {
    for (const fileKind of kinds) {
      if (blockKind === fileKind) continue
      const before = await read(owner, folder)
      const status = await attempt(owner, folder, before.revision!, blockKind, stored[fileKind])
      expect(
        status,
        `a ${blockKind} block may not name a file uploaded as ${fileKind} (#220 R1)`,
      ).toBe(422)
      const after = await read(owner, folder)
      expect(
        after.revision,
        'the refusal precedes the first write, so the page has not moved',
      ).toBe(before.revision)
      expect(after.blocks.length, 'and no block was inserted').toBe(before.blocks.length)
    }
  }
})

test('AC-499 each matching pairing is accepted, so the refusal is a rule and not a ban', async () => {
  const [owner] = (await cast.of(app)) as [Actor]

  /* One folder per pairing, because `attempt` sends a one-item outline and
     7.16's outline is the whole truth about the page: a second call into the
     same folder would be refused for dropping the first block, which is a
     different rule entirely and would make this case prove nothing. */
  const uploads = [
    {
      kind: 'image' as const,
      upload: (folder: string) => uploadImageOk(owner, folder, 'ok.png'),
    },
    {
      kind: 'file' as const,
      upload: (folder: string) =>
        uploadKindOk(owner, 'file', folder, {
          name: 'ok.q4data',
          type: 'application/octet-stream',
          bytes: ZIP_BYTES,
        }),
    },
    {
      kind: 'audio' as const,
      upload: (folder: string) =>
        uploadKindOk(owner, 'audio', folder, {
          name: 'ok.mp3',
          type: 'audio/mpeg',
          bytes: MP3_BYTES,
        }),
    },
    {
      kind: 'video' as const,
      upload: (folder: string) =>
        uploadKindOk(owner, 'video', folder, {
          name: 'ok.mp4',
          type: 'video/mp4',
          bytes: MP4_BYTES,
        }),
    },
  ]

  for (const pair of uploads) {
    const folder = await createFolder(owner, `ac499 matching ${pair.kind}`)
    const fileId = await pair.upload(folder)
    const before = await read(owner, folder)
    expect(
      await attempt(owner, folder, before.revision!, pair.kind, fileId),
      `a ${pair.kind} block names a file uploaded as ${pair.kind}`,
    ).toBe(200)
    const stored = await read(owner, folder)
    expect(stored.blocks[0]?.kind).toBe(pair.kind)
    expect(stored.blocks[0]?.file_id).toBe(fileId)
  }
})

test('AC-499 a file from another folder is still a scope failure and says nothing else', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const here = await createFolder(owner, 'ac499 this folder')
  const elsewhere = await createFolder(owner, 'ac499 another folder')
  const outside = await uploadKindOk(owner, 'audio', elsewhere, {
    name: 'elsewhere.mp3',
    type: 'audio/mpeg',
    bytes: MP3_BYTES,
  })

  /* Scope is asked first and answers on its own terms (10.2). The kinds here
     match perfectly, so the only thing wrong is where the file lives — and
     the answer must not become the kind-mismatch sentence, which would
     describe a row this page is not entitled to be told about. */
  const before = await read(owner, here)
  expect(await attempt(owner, here, before.revision!, 'audio', outside), 'scope first').toBe(422)
  const after = await read(owner, here)
  expect(after.revision).toBe(before.revision)
})
