/*
AC-460: given the folder canvas, when a document transaction writes a bullet,
numbered, checklist, quote, callout or code block, then each is stored as its
own Dana kind and reads back as that kind after a reload, with inline rich
content preserved on the five that carry formatting and refused on `code`.

Issue #219, M1-B2. The decision this pins is R1 decision 1: the six structured
kinds are Dana-native storage, not opaque BlockNote document JSON. So the
assertions read the persisted `kind` and the persisted `rich_content` of each
block rather than any editor payload, and the reload is a second GET rather
than the write's own response, because a write that answered correctly and
stored a paragraph would otherwise pass.

`code` is the one kind that refuses rich content, in the schema and in
`page_blocks_rich_content_check`, and R1 decision 6 is why: a code block is
plain code text and nothing in Dana formats it.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import type { DocumentBlockKind, DocumentOperation, PageView } from '../../src/shared/pages.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac460')
beforeAll(async () => { app = await startAuthTestApp() }, 60000)
afterAll(async () => { if (app) { await cast.cleanup(app.db); await app.close() } })

const put = (
  id: string,
  kind: DocumentBlockKind,
  text: string,
  extra: Partial<Extract<DocumentOperation, { op: 'put_block' }>> = {},
): DocumentOperation => ({
  op: 'put_block', id, block_kind: kind, text,
  rich_content: null, file_id: null, ref_folder_id: null, width_pct: null, checked: null,
  ...extra,
})

async function read(owner: Actor, folder: string): Promise<PageView> {
  const response = await owner.browser.json(`/folders/${folder}/page`, 'GET')
  expectStatus(response, 200, 'page read')
  return response.json() as PageView
}

test('AC-460 each structured block kind survives save and reload as itself', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const folder = await createFolder(owner, 'structured kinds')
  const url = `/folders/${folder}/page/actions`
  const initial = await read(owner, folder)

  const kinds = ['bullet', 'numbered', 'checklist', 'quote', 'callout', 'code'] as const
  const ids = Object.fromEntries(kinds.map((kind) => [kind, randomUUID()])) as Record<typeof kinds[number], string>
  // Every kind but `code` carries the same run, so the reload proves the
  // projection rather than the kind's own leniency.
  const rich = (text: string) => ({ version: 1 as const, runs: [{ text, bold: true }] })
  const operations: DocumentOperation[] = [
    ...kinds.map((kind) => put(
      ids[kind], kind, `A ${kind}`,
      kind === 'code' ? {} : { rich_content: rich(`A ${kind}`) },
    )),
    { op: 'set_outline', items: kinds.map((kind) => ({ kind: 'block' as const, id: ids[kind], section_block_id: null, list_parent_block_id: null })) },
  ]
  expectStatus(
    await owner.browser.json(url, 'POST', { action: 'document_transaction', mutation_id: randomUUID(), base_revision: initial.revision!, operations }),
    200,
    'six structured kinds accepted',
  )

  const stored = await read(owner, folder)
  expect(stored.items.map((item) => item.id)).toEqual(kinds.map((kind) => ids[kind]))
  for (const kind of kinds) {
    const block = stored.blocks.find((candidate) => candidate.id === ids[kind])
    expect(block?.kind, `${kind} reads back as itself`).toBe(kind)
    expect(block?.text).toBe(`A ${kind}`)
    expect(block?.rich_content ?? null, `${kind} rich content`).toEqual(kind === 'code' ? null : rich(`A ${kind}`))
    // Nothing about a structured text block is a picture or a reference.
    expect(block?.file_id).toBeNull()
    expect(block?.ref_folder_id).toBeNull()
    expect(block?.width_pct).toBeNull()
  }
  // Only a checklist item records a tick; the other five carry none at all.
  expect(stored.blocks.filter((block) => block.checked !== null).map((block) => block.kind)).toEqual(['checklist'])
})

test('AC-460 a code block refuses inline formatting, and the refusal writes nothing', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const folder = await createFolder(owner, 'plain code only')
  const url = `/folders/${folder}/page/actions`
  const before = await read(owner, folder)
  const id = randomUUID()
  expectStatus(
    await owner.browser.json(url, 'POST', {
      action: 'document_transaction', mutation_id: randomUUID(), base_revision: before.revision!,
      operations: [
        put(id, 'code', 'not = formatted', { rich_content: { version: 1, runs: [{ text: 'not = formatted', bold: true }] } }),
        { op: 'set_outline', items: [{ kind: 'block', id, section_block_id: null, list_parent_block_id: null }] },
      ],
    }),
    422,
    'rich content on a code block is refused',
  )
  const after = await read(owner, folder)
  expect(after.revision).toBe(before.revision)
  expect(after.blocks.some((block) => block.id === id)).toBe(false)

  // The same block without formatting is ordinary content.
  expectStatus(
    await owner.browser.json(url, 'POST', {
      action: 'document_transaction', mutation_id: randomUUID(), base_revision: after.revision!,
      operations: [
        put(id, 'code', 'const answer = 42'),
        { op: 'set_outline', items: [{ kind: 'block', id, section_block_id: null, list_parent_block_id: null }] },
      ],
    }),
    200,
    'plain code accepted',
  )
  expect((await read(owner, folder)).blocks.find((block) => block.id === id)?.text).toBe('const answer = 42')
})

test('AC-460 a structured text block carries neither a picture nor a folder reference', async () => {
  const [owner] = (await cast.of(app)) as [Actor]
  const folder = await createFolder(owner, 'writing is not media')
  const before = await read(owner, folder)
  const id = randomUUID()
  expectStatus(
    await owner.browser.json(`/folders/${folder}/page/actions`, 'POST', {
      action: 'document_transaction', mutation_id: randomUUID(), base_revision: before.revision!,
      operations: [
        put(id, 'callout', 'Read me', { ref_folder_id: folder }),
        { op: 'set_outline', items: [{ kind: 'block', id, section_block_id: null, list_parent_block_id: null }] },
      ],
    }),
    422,
    'a callout is not a folder reference',
  )
  expect((await read(owner, folder)).blocks.some((block) => block.id === id)).toBe(false)
})
