/*
AC-271: an image block on a folder page takes a width of 25 to 100 through
the page contract and reads it back; a width outside those bounds, or a width
on a block that is not an image, answers 422 and leaves the page exactly as
it was.

Item 44's B7 overturned the rulings sheet's recommendation in the owner's own
words, "I want the inserted images to be resized if user wants", so the
prototype's dragged handle is taken and it needs a number per block. The
bounds are the prototype's own clamp, a quarter of the column to full width
(ledger L-194), and they are a CHECK rather than a client rule because a
client rule is one somebody can edit out.

**Null is not 100.** A block nobody has dragged carries no width, which is a
different fact from a block somebody dragged to full width, and only one of
the two is a decision a person made. The first case here asserts that a
freshly written image block reads null rather than a default.

**The refusal must leave the page whole**, because 7.16's PUT is one unit: a
body that fails on any block applies none of itself, which is the rule the
409 arm already follows and which a new field is the easiest thing to break.

Spec: 4.17 as amended, 7.16's page contract, 10.3, RFC 0005 change control
item 44 B7.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { seedCoverFile } from './s22a-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 's22a')

interface Block extends Record<string, unknown> {
  id?: string
  kind?: string
  width_pct?: unknown
  updated_at?: string
}

async function pageOf(actor: Actor, folderId: string): Promise<Block[]> {
  const response = await actor.browser.json(`/folders/${folderId}/page`, 'GET')
  expectStatus(response, 200, 'the folder page reads (spec 7.16)')
  return (response.json() as { blocks?: Block[] }).blocks ?? []
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-271 an image block carries the width a person dragged', () => {
  test('25 to 100 stores and reads; out of bounds and off an image refuse whole', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folder = await createFolder(owner, 's22a ac271 folder')
    const fileId = await seedCoverFile(app.db, owner.id, folder)

    const written = await owner.browser.json(
      `/folders/${folder}/page`,
      'PUT',
      {
        blocks: [
          { kind: 'paragraph', position: 0, text: 's22a ac271 words' },
          { kind: 'image', position: 1, file_id: fileId },
        ],
      },
    )
    expectStatus(written, 200, 'the page is written (spec 7.16)')

    const fresh = await pageOf(owner, folder)
    const image = fresh.find((block) => block.kind === 'image') as Block
    expect(
      image.width_pct,
      'a block nobody dragged carries no width, which is not the same as full width',
    ).toBeNull()

    const dragged = await owner.browser.json(`/folders/${folder}/page`, 'PUT', {
      blocks: fresh.map((block) =>
        block.kind === 'image' ? { ...block, width_pct: 40 } : block,
      ),
    })
    expectStatus(dragged, 200, 'the width is written through the page contract')
    const after = await pageOf(owner, folder)
    expect(
      (after.find((block) => block.kind === 'image') as Block).width_pct,
      'the dragged width reads back',
    ).toBe(40)

    const settled = await pageOf(owner, folder)
    for (const [bad, why] of [
      [24, 'below a quarter of the column is refused (ledger L-194’s clamp)'],
      [101, 'above full width is refused'],
    ] as const) {
      expectStatus(
        await owner.browser.json(`/folders/${folder}/page`, 'PUT', {
          blocks: settled.map((block) =>
            block.kind === 'image' ? { ...block, width_pct: bad } : block,
          ),
        }),
        422,
        why,
      )
    }
    expectStatus(
      await owner.browser.json(`/folders/${folder}/page`, 'PUT', {
        blocks: settled.map((block) =>
          block.kind === 'paragraph' ? { ...block, width_pct: 50 } : block,
        ),
      }),
      422,
      'a width on a block that is not an image is refused (4.17’s second CHECK)',
    )
    expect(
      await pageOf(owner, folder),
      'every refusal left the page exactly as it was: a PUT is one unit (spec 7.16)',
    ).toEqual(settled)
  })
})
