/*
AC-1250: given a project's Results tab, when a member writes a native Result
(#213), then it is stored as a `result` block of that Doc page, a Result
written on a Work page leaves no row, its Dana Link resolves with its
statement for a member and is a bare 404 for a stranger (resolver and picker
alike), and a Duplicate of the project carries no Result (R2: Results follow
historical truth, not reusable structure). Since step 7 the Results tab is a
Doc page.

Spec: 4.3, 7.24, 10.2.
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

async function write(actor: Actor, pageId: string, id: string) {
  const page = `/folders/${pageId}/page`
  const read = await actor.browser.json(page, 'GET')
  expectStatus(read, 200, 'the writer reads the document')
  return actor.browser.json(`${page}/actions`, 'POST', putResult((read.json() as PageView).revision!, id, STATEMENT))
}

describe('AC-1250 a native Result', () => {
  test('AC-1250: stored on Results only, linked for members only, never duplicated', async () => {
    const [owner, member, stranger] = (await cast.of(app)) as [Actor, Actor, Actor]
    const folderId = await createFolder(owner, 'ac1250 results')
    await seedMembership(app.db, folderId, member.id)
    const added = await owner.browser.json(`/folders/${folderId}/tabs`, 'POST', { kind: 'doc' })
    expectStatus(added, 201, 'a Doc tab for Results')
    const resultsId = (added.json() as { id: string; kind: string }[]).find((tab) => tab.kind === 'doc')!.id

    const resultId = randomUUID()
    expectStatus(await write(owner, resultsId, resultId), 200, 'the owner writes a Result on Results')
    const stored = await countRows(
      app.db,
      sql`SELECT count(*)::int AS n FROM page_blocks
           WHERE id = ${resultId}::uuid AND folder_id = ${resultsId}::uuid
             AND kind = 'result' AND text = ${STATEMENT}`,
    )
    expect(stored, 'the Result is a result block of the Results tab').toBe(1)

    const stray = randomUUID()
    expectStatus(await write(owner, folderId, stray), 422, 'a Work page holds no Result')
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
              JOIN folders f ON f.id = pb.folder_id
             WHERE f.project_id = ${copyId}::uuid AND pb.kind = 'result'`,
      ),
      'a Duplicate starts with an empty Results tab (R2)',
    ).toBe(0)
  })
})
