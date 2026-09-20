/*
AC-600: given a folder page that already holds a block whose kind and whose
file's kind disagree, then a `document_transaction` that does not write that
block is accepted; and given a transaction that writes a mismatched pair
itself, then it is still refused before the first write.

Issue #220, and the adversarial review of the branch that added the pairing
gate. **Both halves are one criterion because either alone is satisfied by a
wrong server**: a gate that checks nothing passes the first and fails the
second, and the gate as it was written passed the second and failed the first.

**The trap this closes, and why it needed a page that was already wrong.**
`applyDocument` validated the block/file pairing over every block of the
merged document rather than over the blocks the transaction writes. Three
routes reach `page_blocks.file_id` without passing through it — `update_block`,
`insert_block` and 7.16's legacy whole-page `PUT` — and migration 0024 records
in terms why no CHECK stands behind them either. So a mismatched row is
reachable today, and the whole-document reading turned one into a page that
reads perfectly and can never be saved again: every later transaction was
refused 422 for a row it was not touching, including one editing an unrelated
paragraph. Deleting the offending block recovered it and nothing said so.

The first case below builds that row the way the review measured it — an
`audio` block repointed at an `image` row through `update_block`, 200 — and
then asserts that an edit to an unrelated paragraph still saves. **It is the
second edit that matters rather than the first**: the rule is about what a
write may store and never about auditing rows somebody else wrote.

**The second case is AC-499's rule restated at exactly the boundary that
moved.** Scoping a validation is the change most likely to scope it away, so
the mismatch is written by the transaction under test and must still be 422
with the page's revision and block count unmoved.

**The last case is the sibling rule in the same loop, and it moved with the
pairing gate rather than being left at a different scope.** A `folder_ref`
block naming a folder the viewer cannot reach is refused on the same terms,
and its unreachable state needs no bypassing route at all: trashing the
referenced folder is enough, which is an ordinary action anybody may take.
Under the whole-document reading that turned somebody else's trashed folder
into a page nobody could save. Nothing is weakened by the scope, because a
block the transaction does not write is not written: `set_outline` carries
placement and never a reference, so no unvalidated `ref_folder_id` reaches the
table. The case asserts both directions for that rule too.

Spec: 4.16, 4.17 as amended 2026-09-20, 7.16 as amended 2026-09-20, 10.2.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import type { DocumentOperation, PageView } from '../../src/shared/pages.js'
import { MP3_BYTES, uploadImageOk, uploadKindOk } from '../support/uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac600')
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
  kind: 'paragraph' | 'audio' | 'image' | 'folder_ref',
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

test('AC-600 a page already holding a mismatched pair still saves an unrelated edit', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const folder = await createFolder(owner, 'ac600 already wrong')

  const audioFile = await uploadKindOk(owner, 'audio', folder, {
    name: 'ac600.mp3',
    type: 'audio/mpeg',
    bytes: MP3_BYTES,
  })
  const imageFile = await uploadImageOk(owner, folder, 'ac600.png')

  const audio = randomUUID()
  const paragraph = randomUUID()
  const start = await read(owner, folder)
  expect(
    (
      await write(owner, folder, start.revision!, [
        put(audio, 'audio', { file_id: audioFile }),
        put(paragraph, 'paragraph', {
          text: 'before',
          rich_content: { version: 1, runs: [{ text: 'before' }] },
        }),
        {
          op: 'set_outline',
          items: [
            { kind: 'block', id: audio, section_block_id: null, list_parent_block_id: null },
            { kind: 'block', id: paragraph, section_block_id: null, list_parent_block_id: null },
          ],
        },
      ])
    ).status,
    'a matched audio block and a paragraph are an ordinary document',
  ).toBe(200)

  /* The row is made wrong through the route the review measured, which is the
     only way to make one: `document_transaction` refuses this pairing, and
     that refusal is the second case below. `update_block` checks that the file
     is in this folder and says nothing about its kind. */
  const written = await read(owner, folder)
  const stored = written.blocks.find((block) => block.id === audio)!
  expectStatus(
    await owner.browser.json(`/folders/${folder}/page/actions`, 'POST', {
      action: 'update_block',
      block_id: audio,
      updated_at: stored.updated_at,
      file_id: imageFile,
    }),
    200,
    'update_block repoints an audio block at an image row, as it does today',
  )

  const wrong = await read(owner, folder)
  expect(
    wrong.blocks.find((block) => block.id === audio)?.file_id,
    'the page now holds a pairing applyDocument would never have written',
  ).toBe(imageFile)

  /* The whole of the criterion. Nothing in this transaction touches the
     audio block: it edits a paragraph two rows away and carries the audio
     block through its outline exactly as 7.16 requires every save to. */
  const edit = await write(owner, folder, wrong.revision!, [
    put(paragraph, 'paragraph', {
      text: 'after',
      rich_content: { version: 1, runs: [{ text: 'after' }] },
    }),
    {
      op: 'set_outline',
      items: [
        { kind: 'block', id: audio, section_block_id: null, list_parent_block_id: null },
        { kind: 'block', id: paragraph, section_block_id: null, list_parent_block_id: null },
      ],
    },
  ])
  expect(
    edit.status,
    `an edit to an unrelated block is not an audit of rows it does not write; answered ${String(edit.status)} ${edit.body}`,
  ).toBe(200)

  const after = await read(owner, folder)
  expect(
    after.blocks.find((block) => block.id === paragraph)?.text,
    'and the edit landed rather than being quietly dropped',
  ).toBe('after')
  expect(
    after.blocks.find((block) => block.id === audio)?.file_id,
    'while the block nobody wrote is exactly as it was',
  ).toBe(imageFile)
})

test('AC-600 a transaction that writes a mismatched pair is still refused before any write', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const folder = await createFolder(owner, 'ac600 writes the mismatch')

  const imageFile = await uploadImageOk(owner, folder, 'ac600-direct.png')
  const before = await read(owner, folder)
  const audio = randomUUID()

  const refused = await write(owner, folder, before.revision!, [
    put(audio, 'audio', { file_id: imageFile }),
    {
      op: 'set_outline',
      items: [{ kind: 'block', id: audio, section_block_id: null, list_parent_block_id: null }],
    },
  ])
  expect(
    refused.status,
    `scoping the gate to the write must not scope it away; answered ${String(refused.status)} ${refused.body}`,
  ).toBe(422)

  const after = await read(owner, folder)
  expect(after.revision, 'the refusal precedes the first statement that changes anything').toBe(
    before.revision,
  )
  expect(after.blocks.length, 'and no block was inserted').toBe(before.blocks.length)
})

test('AC-600 a mismatched row already on the page may also be repaired or removed', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const folder = await createFolder(owner, 'ac600 repair')

  const audioFile = await uploadKindOk(owner, 'audio', folder, {
    name: 'ac600-repair.mp3',
    type: 'audio/mpeg',
    bytes: MP3_BYTES,
  })
  const imageFile = await uploadImageOk(owner, folder, 'ac600-repair.png')

  const audio = randomUUID()
  const start = await read(owner, folder)
  expect(
    (
      await write(owner, folder, start.revision!, [
        put(audio, 'audio', { file_id: audioFile }),
        {
          op: 'set_outline',
          items: [{ kind: 'block', id: audio, section_block_id: null, list_parent_block_id: null }],
        },
      ])
    ).status,
  ).toBe(200)

  const written = await read(owner, folder)
  expectStatus(
    await owner.browser.json(`/folders/${folder}/page/actions`, 'POST', {
      action: 'update_block',
      block_id: audio,
      updated_at: written.blocks.find((block) => block.id === audio)!.updated_at,
      file_id: imageFile,
    }),
    200,
    'the row is made wrong again',
  )

  /* A block the transaction *does* write is validated, so repairing the
     pairing is the way out and naming the wrong file again is not. Both are
     asserted because the first is the recovery a person needs and the second
     is the rule that would be gone if the scope were read as "never check a
     block that already existed". */
  const wrong = await read(owner, folder)
  const stillRefused = await write(owner, folder, wrong.revision!, [
    put(audio, 'audio', { file_id: imageFile }),
    {
      op: 'set_outline',
      items: [{ kind: 'block', id: audio, section_block_id: null, list_parent_block_id: null }],
    },
  ])
  expect(
    stillRefused.status,
    're-writing the same wrong pairing is a write, and it is refused',
  ).toBe(422)

  const repaired = await write(owner, folder, wrong.revision!, [
    put(audio, 'audio', { file_id: audioFile }),
    {
      op: 'set_outline',
      items: [{ kind: 'block', id: audio, section_block_id: null, list_parent_block_id: null }],
    },
  ])
  expect(repaired.status, `repointing it at its own kind saves; ${repaired.body}`).toBe(200)
  expect((await read(owner, folder)).blocks.find((block) => block.id === audio)?.file_id).toBe(
    audioFile,
  )
})

test('AC-600 a folder_ref to a trashed folder does not make the page unsaveable', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const here = await createFolder(owner, 'ac600 referring page')
  const elsewhere = await createFolder(owner, 'ac600 referenced folder')
  const unreachable = await createFolder(owner, 'ac600 never referenced')

  const reference = randomUUID()
  const paragraph = randomUUID()
  const outline: DocumentOperation = {
    op: 'set_outline',
    items: [
      { kind: 'block', id: reference, section_block_id: null, list_parent_block_id: null },
      { kind: 'block', id: paragraph, section_block_id: null, list_parent_block_id: null },
    ],
  }
  const start = await read(owner, here)
  expect(
    (
      await write(owner, here, start.revision!, [
        put(reference, 'folder_ref', { text: 'Open folder', ref_folder_id: elsewhere }),
        put(paragraph, 'paragraph', {
          text: 'before',
          rich_content: { version: 1, runs: [{ text: 'before' }] },
        }),
        outline,
      ])
    ).status,
    'a folder_ref to a folder the viewer is in is an ordinary block',
  ).toBe(200)

  /* Trashing the referenced folder needs no bypassing route: it is an
     ordinary action, and it makes the stored reference unreachable. */
  expectStatus(
    await owner.browser.json(`/folders/${elsewhere}`, 'DELETE'),
    200,
    'the referenced folder is trashed',
  )

  const orphaned = await read(owner, here)
  const edit = await write(owner, here, orphaned.revision!, [
    put(paragraph, 'paragraph', {
      text: 'after',
      rich_content: { version: 1, runs: [{ text: 'after' }] },
    }),
    outline,
  ])
  expect(
    edit.status,
    `trashing a folder must not make another page permanently unsaveable; answered ${String(edit.status)} ${edit.body}`,
  ).toBe(200)
  expect((await read(owner, here)).blocks.find((block) => block.id === paragraph)?.text).toBe(
    'after',
  )

  /* And the rule itself is intact for a block this transaction writes: a
     reference the viewer cannot reach is refused before the first write. It
     answers 404 rather than 422 and always has — a folder you cannot reach and
     a folder that does not exist say the same thing (10.2), which is a
     different refusal from the file pairing's and stays that way. */
  expectStatus(
    await owner.browser.json(`/folders/${unreachable}`, 'DELETE'),
    200,
    'a second folder is trashed, to be named by a write',
  )
  const before = await read(owner, here)
  const refused = await write(owner, here, before.revision!, [
    put(reference, 'folder_ref', { text: 'Open folder', ref_folder_id: unreachable }),
    outline,
  ])
  expect(refused.status, 'writing an unreachable reference is still refused').toBe(404)
  const after = await read(owner, here)
  expect(after.revision, 'and the refusal precedes the first write').toBe(before.revision)
})
