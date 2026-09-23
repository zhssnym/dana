/*
AC-875: given a Folder's native Results facet, when its members write and read
its document and name it by Dana Link, then a stranger is answered 404 on the
document read, the document write and the link, a Can-view member may read but
not write, and no refused write leaves a row.

**Why this criterion exists.** #213 opened `facetPageGate` and the `facet`
reference resolver to the Results kind. Both gates are hand-written; this is
the behavioural case behind them for the new kind. 404 and never 403 for a
stranger (7.0, 10.2); 403 for a member without `folder.page.edit` (7.27).
The write assertions read `page_blocks`, not just the status.

Spec: 4.30, 7.24, 7.27, 10.2.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { DocumentTransaction, PageView } from '../../src/shared/pages.js'
import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  addMemberOk,
  Cast,
  connect,
  countRows,
  createFolder,
  expectStatus,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'viewer', 'stranger'], 'ac875')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

function write(base: string, id: string, text: string): DocumentTransaction {
  return {
    action: 'document_transaction',
    mutation_id: randomUUID(),
    base_revision: base,
    operations: [
      {
        op: 'put_block',
        id,
        block_kind: 'paragraph',
        text,
        rich_content: null,
        file_id: null,
        ref_folder_id: null,
        width_pct: null,
        checked: null,
      },
      {
        op: 'set_outline',
        items: [
          {
            kind: 'block',
            id,
            section_block_id: null,
            list_parent_block_id: null,
          },
        ],
      },
    ],
  }
}

const blocksIn = (facetId: string) =>
  countRows(
    app.db,
    sql`SELECT count(*)::int AS n FROM page_blocks
         WHERE facet_id = ${facetId}::uuid`,
  )

describe('AC-875 the Results document and link refuse a stranger', () => {
  test('AC-875: members read, editors write, strangers see nothing', async () => {
    const [owner, viewer, stranger] = (await cast.of(app)) as [
      Actor,
      Actor,
      Actor,
    ]
    const folderId = await createFolder(owner, 'ac875 outcomes')
    await connect(app.db, owner.id, viewer.id)
    await addMemberOk(owner, folderId, viewer.id, 'can_view')

    const listed = await owner.browser.json(`/folders/${folderId}/facets`, 'GET')
    expectStatus(listed, 200, 'the owner lists the facets (7.27)')
    const results = (
      listed.json() as { facets: { id: string; kind: string }[] }
    ).facets.find((facet) => facet.kind === 'results')
    expect(results, 'every Folder has one native Results facet (4.30)').toBeDefined()
    const facetId = results!.id
    const page = `/folders/${folderId}/facets/${facetId}/page`

    const initial = await owner.browser.json(page, 'GET')
    expectStatus(initial, 200, 'the owner reads the Results document (#213)')
    const base = (initial.json() as PageView).revision!

    const blockId = randomUUID()
    expectStatus(
      await owner.browser.json(`${page}/actions`, 'POST', write(base, blockId, 'Shipped v1')),
      200,
      'the owner writes the Results document (#213)',
    )
    const stored = await countRows(
      app.db,
      sql`SELECT count(*)::int AS n FROM page_blocks
           WHERE id = ${blockId}::uuid AND facet_id = ${facetId}::uuid
             AND folder_id IS NULL AND text = 'Shipped v1'`,
    )
    expect(stored, 'the write lands as a facet-homed block').toBe(1)

    const after = await owner.browser.json(page, 'GET')
    const revision = (after.json() as PageView).revision!

    /* A Can-view member reads and may not write. */
    expectStatus(await viewer.browser.json(page, 'GET'), 200, 'a member reads (7.27)')
    expectStatus(
      await viewer.browser.json(`${page}/actions`, 'POST', write(revision, randomUUID(), 'viewer')),
      403,
      'Can view lacks folder.page.edit (7.27)',
    )

    /* A stranger: 404 on every door, and nothing written or disclosed. */
    const strangerRead = await stranger.browser.json(page, 'GET')
    expectStatus(strangerRead, 404, 'a stranger reads nothing (10.2)')
    expect(strangerRead.body).not.toContain('Shipped v1')
    expectStatus(
      await stranger.browser.json(`${page}/actions`, 'POST', write(revision, randomUUID(), 'stranger')),
      404,
      'a stranger writes nothing (10.2)',
    )
    expect(await blocksIn(facetId), 'no refused write left a row').toBe(1)

    const link = `/references/facet/${facetId}`
    const resolved = await owner.browser.json(link, 'GET')
    expectStatus(resolved, 200, 'a member resolves the Results link (7.24)')
    expect((resolved.json() as { label?: unknown }).label).toBe('Results')
    const refused = await stranger.browser.json(link, 'GET')
    expectStatus(refused, 404, 'a Dana Link grants nothing (7.24, 10.2)')
    expect(refused.body).not.toContain('Results')

    const search = `/references/search?q=Results&folder=${folderId}`
    const found = await owner.browser.json(search, 'GET')
    expectStatus(found, 200, 'the picker searches (7.24)')
    expect(found.body, 'a member finds the Results facet').toContain(facetId)
    const hidden = await stranger.browser.json(`/references/search?q=Results`, 'GET')
    expectStatus(hidden, 200, 'a stranger may search their own scope (7.24)')
    expect(hidden.body, 'a stranger never finds it').not.toContain(facetId)
  })
})
