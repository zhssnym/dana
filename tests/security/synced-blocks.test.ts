// #720: a synced block never shows or links an original that its reader cannot open.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, test } from 'vitest'

import type { DocumentOperation, DocumentTransaction, PageView } from '../../src/shared/pages.js'
import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'stranger'], 'synced720')
beforeAll(async () => { app = await startAuthTestApp() }, 60000)
afterAll(async () => { if (app) { await cast.cleanup(app.db); await app.close() } })

async function read(actor: Actor, folder: string): Promise<PageView> {
  const response = await actor.browser.json(`/folders/${folder}/page`, 'GET')
  expectStatus(response, 200, 'page')
  return response.json() as PageView
}

function put(id: string, kind: 'paragraph' | 'synced', text: string): DocumentOperation {
  return {
    op: 'put_block', id, block_kind: kind, text,
    rich_content: kind === 'paragraph' ? { version: 1, runs: [{ text }] } : null,
    file_id: null, ref_folder_id: null, width_pct: null, checked: null,
  }
}

/** Writes `operations` and keeps the page's other blocks; `ids` is the final block order. */
async function write(actor: Actor, folder: string, operations: DocumentOperation[], ids: string[]) {
  const page = await read(actor, folder)
  const kept = page.blocks.map((block) => block.id).filter((id) => !ids.includes(id))
  const body: DocumentTransaction = {
    action: 'document_transaction', mutation_id: randomUUID(), base_revision: page.revision!,
    operations: [...operations, { op: 'set_outline', items: [...kept, ...ids].map((id) => ({ kind: 'block' as const, id, section_block_id: null, list_parent_block_id: null })) }],
  }
  return actor.browser.json(`/folders/${folder}/page/actions`, 'POST', body)
}

test('a stranger can neither locate an original nor sync it into their own page', async () => {
  const [owner, stranger] = await cast.of(app) as [Actor, Actor]
  const source = await createFolder(owner, 'synced source')
  const target = await createFolder(owner, 'synced target')
  const theirs = await createFolder(stranger, 'stranger page')
  const original = randomUUID()
  const copy = randomUUID()
  expectStatus(await write(owner, source, [put(original, 'paragraph', 'Shared plan')], [original]), 200, 'original')
  expectStatus(await write(owner, target, [put(copy, 'synced', original)], [copy]), 200, 'copy')

  const located = await owner.browser.json(`/synced-blocks/${original}`, 'GET')
  expectStatus(located, 200, 'owner locates the original')
  expect(located.json()).toMatchObject({ block_id: original, home: 'folder', copies: 1 })
  expect((await read(owner, source)).synced_copies).toEqual({ [original]: 1 })

  expectStatus(await stranger.browser.json(`/synced-blocks/${original}`, 'GET'), 404, 'stranger cannot locate it')
  const stolen = randomUUID()
  expectStatus(await write(stranger, theirs, [put(stolen, 'synced', original)], [stolen]), 404, 'stranger cannot sync it')
  expect((await read(stranger, theirs)).blocks.some((block) => block.id === stolen)).toBe(false)
})
