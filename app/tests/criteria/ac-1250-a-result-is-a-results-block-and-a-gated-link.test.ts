/*
AC-1250: given a Folder's Results tab, when a member writes a native Result
(#213), then it is stored as a `result` block of that Results facet, a Result
written anywhere else leaves no row, its Dana Link resolves with its statement
for a member and is a bare 404 for a stranger (resolver and picker alike), and
a Duplicate of the Folder carries no Result (R2: Results follow historical
truth, not reusable structure).

Spec: 4.30, 7.24, 10.2.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { DocumentTransaction, PageView } from '../../src/shared/pages.js'
import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  Cast,
  countRows,
  createFolder,
  expectStatus,
  seedMembership,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member', 'stranger'], 'ac1250')
const STATEMENT = 'ac1250 quokka median load 1.6 s'

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

function putResult(base: string, id: string, text: string): DocumentTransaction {
  return {
    action: 'document_transaction',
    mutation_id: randomUUID(),
    base_revision: base,
    operations: [
      {
        op: 'put_block',
        id,
        block_kind: 'result',
        text,
        rich_content: null,
        file_id: null,
        ref_folder_id: null,
        width_pct: null,
        checked: null,
      },
      {
        op: 'set_outline',
        items: [{ kind: 'block', id, section_block_id: null, list_parent_block_id: null }],
      },
    ],
  }
}

async function facetOf(owner: Actor, folderId: string, kind: string): Promise<string> {
  const listed = await owner.browser.json(`/folders/${folderId}/facets`, 'GET')
  expectStatus(listed, 200, 'the owner lists the facets (7.27)')
  const found = (listed.json() as { facets: { id: string; kind: string }[] }).facets.find(
    (facet) => facet.kind === kind,
  )
  expect(found, `every Folder has a native ${kind} facet (4.30)`).toBeDefined()
  return found!.id
}

async function write(actor: Actor, folderId: string, facetId: string, id: string) {
  const page = `/folders/${folderId}/facets/${facetId}/page`
  const read = await actor.browser.json(page, 'GET')
  expectStatus(read, 200, 'the writer reads the document')
  return actor.browser.json(`${page}/actions`, 'POST', putResult((read.json() as PageView).revision!, id, STATEMENT))
}

describe('AC-1250 a native Result', () => {
  test('AC-1250: stored on Results only, linked for members only, never duplicated', async () => {
    const [owner, member, stranger] = (await cast.of(app)) as [Actor, Actor, Actor]
    const folderId = await createFolder(owner, 'ac1250 results')
    await seedMembership(app.db, folderId, member.id)
    const resultsId = await facetOf(owner, folderId, 'results')
    const purposeId = await facetOf(owner, folderId, 'purpose')

    const resultId = randomUUID()
    expectStatus(await write(owner, folderId, resultsId, resultId), 200, 'the owner writes a Result on Results')
    const stored = await countRows(
      app.db,
      sql`SELECT count(*)::int AS n FROM page_blocks
           WHERE id = ${resultId}::uuid AND facet_id = ${resultsId}::uuid
             AND kind = 'result' AND text = ${STATEMENT}`,
    )
    expect(stored, 'the Result is a result block of the Results facet').toBe(1)

    const stray = randomUUID()
    expectStatus(await write(owner, folderId, purposeId, stray), 422, 'a Result lives on Results alone')
    expect(
      await countRows(app.db, sql`SELECT count(*)::int AS n FROM page_blocks WHERE id = ${stray}::uuid`),
      'the refused Result left no row',
    ).toBe(0)

    const link = `/references/result/${resultId}`
    const resolved = await member.browser.json(link, 'GET')
    expectStatus(resolved, 200, 'a member resolves the Result (7.24)')
    expect(resolved.json()).toEqual({ kind: 'result', id: resultId, label: STATEMENT, path: `/app/results/${resultId}` })
    const refused = await stranger.browser.json(link, 'GET')
    expectStatus(refused, 404, 'a Dana Link grants nothing (7.24, 10.2)')
    expect(refused.body).not.toContain('quokka')

    const q = `/references/search?q=${encodeURIComponent('quokka')}`
    const found = await member.browser.json(q, 'GET')
    expect(found.body, 'a member finds the Result in the picker').toContain(resultId)
    const hidden = await stranger.browser.json(q, 'GET')
    expectStatus(hidden, 200, 'a stranger may search their own scope (7.24)')
    expect(hidden.body, 'a stranger never finds it').not.toContain(resultId)

    const copy = await owner.browser.json(`/folders/${folderId}/duplicate`, 'POST', {})
    expectStatus(copy, 201, 'the owner duplicates the Folder')
    const copyId = (copy.json() as { id: string }).id
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM page_blocks pb
              JOIN folder_facets ff ON ff.id = pb.facet_id
             WHERE ff.folder_id = ${copyId}::uuid AND ff.kind = 'results'`,
      ),
      'a Duplicate starts with an empty Results tab (R2)',
    ).toBe(0)
  })
})
