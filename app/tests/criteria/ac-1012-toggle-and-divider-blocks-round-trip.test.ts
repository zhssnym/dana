/*
AC-1012: a Toggle block and a Divider block round-trip through the Folder
document. A paragraph nested under a toggle keeps its toggle as its list
parent; a divider carries no text; a paragraph may not nest under a bullet.

Data-loss class: a toggle's children are held by `list_parent_block_id`, so a
save path that forgot a paragraph may hold one would flatten the toggle on the
next write — the SQL upsert's `list_parent_block_id=CASE ...` and migration
0037's `page_blocks_list_parent_kind_check` are the two places that decide it.

Spec: 4.17, 7.16.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import type { DocumentOperation } from '../../src/shared/pages.js'
import { at, compose, put, readPage } from '../support/workflow-page-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac1012')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

const transact = async (
  owner: Actor,
  folderId: string,
  operations: DocumentOperation[],
): Promise<number> => {
  const base = await readPage(owner, folderId)
  const response = await owner.browser.json(`/folders/${folderId}/page/actions`, 'POST', {
    action: 'document_transaction',
    mutation_id: randomUUID(),
    base_revision: base.revision as string,
    operations,
  })
  return response.status
}

describe('AC-1012 toggle and divider blocks round-trip', () => {
  test('a toggle holds a paragraph, a divider stands alone, a bullet holds no paragraph', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'ac1012 the fold')
    const toggle = randomUUID()
    const inside = randomUUID()
    const divider = randomUUID()
    const page = await compose(
      owner,
      folderId,
      [
        put(toggle, 'toggle', 'Details', {
          rich_content: { version: 1, runs: [{ text: 'Details', bold: true }] },
        }),
        put(inside, 'paragraph', 'Hidden until opened'),
        put(divider, 'divider', null),
        { op: 'set_outline', items: [at(toggle), at(inside, null, toggle), at(divider)] },
      ],
      'a toggle holding a paragraph and a divider must save through the document transaction (7.16)',
    )
    expect(page.blocks.map((b) => b.id)).toEqual([toggle, inside, divider])
    const byId = new Map(page.blocks.map((b) => [b.id, b]))
    expect(byId.get(toggle)?.kind).toBe('toggle')
    expect(byId.get(toggle)?.text).toBe('Details')
    expect(byId.get(toggle)?.rich_content).toEqual({
      version: 1,
      runs: [{ text: 'Details', bold: true }],
    })
    expect(byId.get(toggle)?.list_parent_block_id).toBeNull()
    expect(byId.get(inside)?.kind).toBe('paragraph')
    expect(byId.get(inside)?.list_parent_block_id).toBe(toggle)
    expect(byId.get(divider)?.kind).toBe('divider')
    expect(byId.get(divider)?.text ?? null).toBeNull()
    expect(byId.get(divider)?.list_parent_block_id).toBeNull()

    // A second save that re-sends the paragraph keeps it inside the toggle.
    const resaved = await compose(
      owner,
      folderId,
      [
        put(inside, 'paragraph', 'Still hidden'),
        { op: 'set_outline', items: [at(toggle), at(inside, null, toggle), at(divider)] },
      ],
      'editing a paragraph inside a toggle must save',
    )
    expect(resaved.blocks.find((b) => b.id === inside)?.list_parent_block_id).toBe(toggle)

    // A divider carries no text.
    expect(
      await transact(owner, folderId, [
        put(divider, 'divider', 'not a rule'),
        { op: 'set_outline', items: [at(toggle), at(inside, null, toggle), at(divider)] },
      ]),
    ).toBeGreaterThanOrEqual(400)

    // A paragraph nests under a toggle and nothing else: under a bullet it is refused.
    const bullet = randomUUID()
    const stray = randomUUID()
    expect(
      await transact(owner, folderId, [
        put(bullet, 'bullet', 'a point'),
        put(stray, 'paragraph', 'not a list item'),
        {
          op: 'set_outline',
          items: [at(toggle), at(inside, null, toggle), at(divider), at(bullet), at(stray, null, bullet)],
        },
      ]),
    ).toBeGreaterThanOrEqual(400)

    const after = await readPage(owner, folderId)
    expect(after.blocks.map((b) => [b.id, b.kind, b.text, b.list_parent_block_id])).toEqual([
      [toggle, 'toggle', 'Details', null],
      [inside, 'paragraph', 'Still hidden', toggle],
      [divider, 'divider', null, null],
    ])
  })
})
