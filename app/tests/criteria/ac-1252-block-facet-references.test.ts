/*
AC-1252 (#488): a whole persisted block may belong to one or more facet tabs.
The edge is exact (never the block beside it), project-local, authorized like
the source block, and converges with an inline Dana Link into one Connected
work source. This is the media/file half AC-1251 could not express because a
media block intentionally carries no inline rich text.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { GetProjectBlockFacetsResponse } from '../../src/shared/block-facets.js'
import type { GetConnectedWorkResponse } from '../../src/shared/connected-work.js'
import type { GetReferenceSearchResponse } from '../../src/shared/references.js'
import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { makeFile } from '../support/authorization-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'stranger'], 'ac1252')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

async function makeUsualProject(owner: Actor, name: string): Promise<{ projectId: string; resultsId: string }> {
  const made = await owner.browser.json('/folders', 'POST', { name, kind: null })
  expectStatus(made, 201, 'the project is created')
  const projectId = (made.json() as { id: string }).id
  const tabs = await owner.browser.json(`/folders/${projectId}/tabs`, 'POST', { kind: 'usual' })
  expectStatus(tabs, 201, 'the usual project tabs are created')
  const results = (tabs.json() as { id: string; name: string }[]).find((tab) => tab.name === 'Results')
  expect(results, 'the usual project has Results').toBeDefined()
  return { projectId, resultsId: results!.id }
}

async function imageBlock(owner: Actor, projectId: string, name: string): Promise<{ blockId: string; fileId: string }> {
  const fileId = await makeFile(owner, projectId, name)
  const blockId = randomUUID()
  await app.db.execute(sql`
    INSERT INTO page_blocks (id, folder_id, kind, position, page_position, file_id)
    VALUES (${blockId}::uuid, ${projectId}::uuid, 'image', 0, 'a0', ${fileId}::uuid)
  `)
  return { blockId, fileId }
}

async function inlineParagraph(projectId: string, facetId: string): Promise<string> {
  const blockId = randomUUID()
  const rich = JSON.stringify({
    version: 1,
    runs: [
      { text: 'Approved ' },
      { text: 'Results', href: `/app/facets/${facetId}` },
      { text: ' package' },
    ],
  })
  await app.db.execute(sql`
    INSERT INTO page_blocks
      (id, folder_id, kind, position, page_position, text, rich_content)
    VALUES
      (${blockId}::uuid, ${projectId}::uuid, 'paragraph', 1, 'a1',
       'Approved Results package', ${rich}::jsonb)
  `)
  return blockId
}

function connectedSource(answer: GetConnectedWorkResponse, blockId: string) {
  return answer.results.flatMap((row) => row.sources).find((source) => source.id === blockId)
}

describe('AC-1252 whole-block facet references', () => {
  test('an image owns its facet edge and Connected work carries the exact file source', async () => {
    const [owner, stranger] = (await cast.of(app)) as [Actor, Actor]
    const { projectId, resultsId } = await makeUsualProject(owner, 'ac1252 media')
    const { blockId, fileId } = await imageBlock(owner, projectId, 'final-render.png')

    const linked = await owner.browser.json('/block-facets', 'PUT', {
      block_id: blockId,
      facet_ids: [resultsId],
    })
    expectStatus(linked, 200, 'an editor can connect the exact media block')
    expect(linked.json()).toEqual({
      block_id: blockId,
      facets: [{ id: resultsId, name: 'Results' }],
    })

    const read = await owner.browser.json(`/block-facets?folder=${projectId}`, 'GET')
    expectStatus(read, 200, 'the project relation projection is readable')
    const relations = read.json() as GetProjectBlockFacetsResponse
    expect(relations.project_id).toBe(projectId)
    expect(relations.blocks).toContainEqual({
      block_id: blockId,
      facets: [{ id: resultsId, name: 'Results' }],
    })

    const backlinks = await owner.browser.json(`/facets/${resultsId}/backlinks`, 'GET')
    expectStatus(backlinks, 200, 'Results projects its block-owned sources')
    const source = connectedSource(backlinks.json() as GetConnectedWorkResponse, blockId)
    expect(source).toEqual({
      id: blockId,
      kind: 'block',
      block_kind: 'image',
      text: 'final-render.png',
      files: [{ id: fileId, name: 'final-render.png' }],
    })

    const strangerRead = await stranger.browser.json(`/block-facets?folder=${projectId}`, 'GET')
    expectStatus(strangerRead, 404, 'a stranger cannot enumerate a project relation graph')
    expect(strangerRead.body).not.toContain(blockId)
    expect(strangerRead.body).not.toContain(resultsId)

    const strangerWrite = await stranger.browser.json('/block-facets', 'PUT', {
      block_id: blockId,
      facet_ids: [resultsId],
    })
    expectStatus(strangerWrite, 404, 'a stranger cannot learn a source block through the write route')
  })

  test('the relation is project-local, duplicate-safe, removable, and de-duplicates an inline source', async () => {
    const [owner] = (await cast.of(app)) as [Actor, Actor]
    const a = await makeUsualProject(owner, 'ac1252 project A')
    const b = await makeUsualProject(owner, 'ac1252 project B')
    const { blockId: imageId } = await imageBlock(owner, a.projectId, 'a.png')

    const crossProject = await owner.browser.json('/block-facets', 'PUT', {
      block_id: imageId,
      facet_ids: [b.resultsId],
    })
    expectStatus(crossProject, 422, 'a block cannot name a facet outside its Work directory')
    expect(crossProject.body).not.toContain(b.resultsId)

    const duplicate = await owner.browser.json('/block-facets', 'PUT', {
      block_id: imageId,
      facet_ids: [a.resultsId, a.resultsId],
    })
    expectStatus(duplicate, 422, 'one block/facet pair cannot be submitted twice')

    const paragraphId = await inlineParagraph(a.projectId, a.resultsId)
    const explicitToo = await owner.browser.json('/block-facets', 'PUT', {
      block_id: paragraphId,
      facet_ids: [a.resultsId],
    })
    expectStatus(explicitToo, 200, 'the whole paragraph may also be explicitly connected')

    const connected = await owner.browser.json(`/facets/${a.resultsId}/backlinks`, 'GET')
    expectStatus(connected, 200, 'inline and whole-block forms converge')
    const body = connected.json() as GetConnectedWorkResponse
    const rows = body.results.filter((row) => row.block_ids.includes(paragraphId))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.block_ids.filter((id) => id === paragraphId)).toHaveLength(1)
    expect(rows[0]?.sources.filter((source) => source.id === paragraphId)).toHaveLength(1)
    expect(rows[0]?.sources.find((source) => source.id === paragraphId)?.text).toBe('Approved package')

    const search = await owner.browser.json(`/references/search?folder=${a.projectId}&q=Results`, 'GET')
    expectStatus(search, 200, 'the inline picker searches in the current Work context')
    const references = (search.json() as GetReferenceSearchResponse).results
    expect(references.some((reference) => reference.kind === 'facet' && reference.id === b.resultsId)).toBe(false)

    const removed = await owner.browser.json('/block-facets', 'PUT', {
      block_id: imageId,
      facet_ids: [],
    })
    expectStatus(removed, 200, 'empty replacement explicitly unlinks the whole block')
    expect(removed.json()).toEqual({ block_id: imageId, facets: [] })
  })

  test('moving a Task to another Work severs its old block facet edges', async () => {
    const [owner] = (await cast.of(app)) as [Actor, Actor]
    const a = await makeUsualProject(owner, 'ac1252 move A')
    const b = await makeUsualProject(owner, 'ac1252 move B')
    const made = await owner.browser.json('/tasks', 'POST', {
      title: 'Move this task',
      folder_id: a.projectId,
    })
    expectStatus(made, 201, 'the source task is created')
    const taskId = (made.json() as { id: string }).id
    const blockId = randomUUID()
    await app.db.execute(sql`
      INSERT INTO page_blocks (id, task_id, kind, position, page_position, text)
      VALUES (${blockId}::uuid, ${taskId}::uuid, 'paragraph', 0, 'a0', 'Task attachment context')
    `)

    const linked = await owner.browser.json('/block-facets', 'PUT', {
      block_id: blockId,
      facet_ids: [a.resultsId],
    })
    expectStatus(linked, 200, 'the Task body block is connected inside Work A')

    const moved = await owner.browser.json(`/tasks/${taskId}`, 'PATCH', {
      folder_id: b.projectId,
    })
    expectStatus(moved, 200, 'the Task moves to Work B')

    const edges = await app.db.execute(sql`
      SELECT facet_id FROM page_block_facets WHERE block_id = ${blockId}::uuid
    `)
    expect(edges.rows).toHaveLength(0)

    const oldResults = await owner.browser.json(`/facets/${a.resultsId}/backlinks`, 'GET')
    expectStatus(oldResults, 200, 'Work A Results remains readable')
    expect(connectedSource(oldResults.json() as GetConnectedWorkResponse, blockId)).toBeUndefined()
  })
})
