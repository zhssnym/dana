/*
AC-603: given a stored `video` block, when `update_block` sends a
`width_pct`, then it is stored and reads back; and given an `audio` or a
`file` block, then it is refused. The set `update_block` admits is exactly
`WIDTH_BLOCK_KINDS`.

Issue #220, and the adversarial review of the branch that widened the width.
Migration 0024 widened `page_blocks_width_pct_kind_check` to `image` and
`video`, and `WIDTH_BLOCK_KINDS` in `shared/page-document.ts` says the same
thing for the document contract — but `update_block` still compared the
stored kind against the literal `'image'`, so a width dragged onto a video
through the incremental path was refused by a server whose database, whose
shared constant and whose document transaction all admitted it.

**It failed closed, so this is a gap rather than a hazard**, and it is worth a
criterion for the reason the gap existed at all: the rule was written down in
three places and the fourth repeated a literal. The assertion below is over
the admitted set in both directions — the two that may, and two that may not —
because a fix that reads the shared constant and a fix that swaps one literal
for two are indistinguishable until something asserts the kinds that stay
out.

Spec: 4.17 as amended 2026-09-20, 7.16 as amended 2026-09-20.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import type { DocumentBlockKind, DocumentOperation, PageView } from '../../src/shared/pages.js'
import { WIDTH_BLOCK_KINDS } from '../../src/shared/pages.js'
import {
  MP3_BYTES,
  MP4_BYTES,
  ZIP_BYTES,
  uploadImageOk,
  uploadKindOk,
} from '../support/uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac603')
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

test('AC-603 update_block admits a width on exactly the kinds that persist one', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const folder = await createFolder(owner, 'ac603 width by kind')

  const files: Record<'image' | 'video' | 'audio' | 'file', string> = {
    image: await uploadImageOk(owner, folder, 'ac603.png'),
    video: await uploadKindOk(owner, 'video', folder, {
      name: 'ac603.mp4',
      type: 'video/mp4',
      bytes: MP4_BYTES,
    }),
    audio: await uploadKindOk(owner, 'audio', folder, {
      name: 'ac603.mp3',
      type: 'audio/mpeg',
      bytes: MP3_BYTES,
    }),
    file: await uploadKindOk(owner, 'file', folder, {
      name: 'ac603.q4data',
      type: 'application/octet-stream',
      bytes: ZIP_BYTES,
    }),
  }

  const kinds = ['image', 'video', 'audio', 'file'] as const
  const ids = Object.fromEntries(kinds.map((kind) => [kind, randomUUID()])) as Record<
    (typeof kinds)[number],
    string
  >
  const before = await read(owner, folder)
  const operations: DocumentOperation[] = [
    ...kinds.map(
      (kind): DocumentOperation => ({
        op: 'put_block',
        id: ids[kind],
        block_kind: kind as DocumentBlockKind,
        text: null,
        rich_content: null,
        file_id: files[kind],
        ref_folder_id: null,
        width_pct: null,
        checked: null,
      }),
    ),
    {
      op: 'set_outline',
      items: kinds.map((kind) => ({
        kind: 'block' as const,
        id: ids[kind],
        section_block_id: null,
        list_parent_block_id: null,
      })),
    },
  ]
  expectStatus(
    await owner.browser.json(`/folders/${folder}/page/actions`, 'POST', {
      action: 'document_transaction',
      mutation_id: randomUUID(),
      base_revision: before.revision!,
      operations,
    }),
    200,
    'four media blocks, each naming a file of its own kind',
  )

  /* Read the admitted set off the shared constant rather than restating it,
     because restating it is what this criterion is about. */
  const admitted = new Set<string>(WIDTH_BLOCK_KINDS)
  expect(admitted, 'the constant migration 0024 matches').toEqual(new Set(['image', 'video']))

  for (const kind of kinds) {
    const page = await read(owner, folder)
    const block = page.blocks.find((candidate) => candidate.id === ids[kind])!
    const answer = await owner.browser.json(`/folders/${folder}/page/actions`, 'POST', {
      action: 'update_block',
      block_id: ids[kind],
      updated_at: block.updated_at,
      width_pct: 60,
    })
    if (admitted.has(kind)) {
      expect(
        answer.status,
        `a ${kind} persists a dragged width (4.17, migration 0024); answered ${String(answer.status)} ${answer.body.slice(0, 200)}`,
      ).toBe(200)
      const stored = await read(owner, folder)
      expect(
        stored.blocks.find((candidate) => candidate.id === ids[kind])?.width_pct,
        'and it reads back',
      ).toBe(60)
    } else {
      expect(
        answer.status,
        `an ${kind} block does not resize in M1, so the incremental path refuses it too`,
      ).toBe(422)
      const stored = await read(owner, folder)
      expect(
        stored.blocks.find((candidate) => candidate.id === ids[kind])?.width_pct,
        'and nothing was stored',
      ).toBeNull()
    }
  }
})
