/*
AC-1251 (#488): a facet reference belongs to the exact object that contains
its chip. The facet backlink read answers that source's authored words (not
the chip's own label), keeps the exact block id for navigation, accepts the
historical Page spelling beside the canonical Facet spelling, and leaks neither
target nor source to a stranger.

No relationship row is seeded here: the only durable relation is the href in
the task document, as in #214/#223.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { GetConnectedWorkResponse } from '../../src/shared/connected-work.js'
import type { DocumentTransaction, PageView } from '../../src/shared/pages.js'
import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, expectStatus, seedTask } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'stranger'], 'ac1251')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

function putBlock(base: string, id: string, href: string): DocumentTransaction {
  return {
    action: 'document_transaction',
    mutation_id: randomUUID(),
    base_revision: base,
    operations: [
      {
        op: 'put_block',
        id,
        block_kind: 'paragraph',
        text: 'Final drawings Results approved',
        rich_content: {
          version: 1,
          runs: [
            { text: 'Final drawings ' },
            { text: 'Results', href },
            { text: ' approved' },
          ],
        },
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

async function makeUsualProject(owner: Actor): Promise<{ projectId: string; resultsId: string }> {
  const made = await owner.browser.json('/folders', 'POST', { name: 'ac1251 source aware', kind: null })
  expectStatus(made, 201, 'the project is created')
  const projectId = (made.json() as { id: string }).id
  const tabs = await owner.browser.json(`/folders/${projectId}/tabs`, 'POST', { kind: 'usual' })
  expectStatus(tabs, 201, 'the usual facets are created')
  const results = (tabs.json() as { id: string; name: string }[]).find((tab) => tab.name === 'Results')
  expect(results, 'the usual project has Results').toBeDefined()
  return { projectId, resultsId: results!.id }
}

async function writeTaskReference(owner: Actor, taskId: string, href: string): Promise<string> {
  const read = await owner.browser.json(`/tasks/${taskId}/document`, 'GET')
  expectStatus(read, 200, 'the task document is readable')
  const blockId = randomUUID()
  const written = await owner.browser.json(
    `/tasks/${taskId}/document`,
    'PUT',
    putBlock((read.json() as PageView).revision!, blockId, href),
  )
  expectStatus(written, 200, 'the facet chip is persisted in the exact task block')
  return blockId
}

describe('AC-1251 facet Connected work keeps the exact source object', () => {
  test('canonical facet links answer the source block without echoing the chip label', async () => {
    const [owner, stranger] = (await cast.of(app)) as [Actor, Actor]
    const { projectId, resultsId } = await makeUsualProject(owner)
    const taskId = await seedTask(app.db, {
      folderId: projectId,
      createdBy: owner.id,
      title: 'Prepare structural drawings',
    })
    const blockId = await writeTaskReference(owner, taskId, `/app/facets/${resultsId}`)

    const answer = await owner.browser.json(`/facets/${resultsId}/backlinks`, 'GET')
    expectStatus(answer, 200, 'a member reads source-aware facet backlinks')
    const connected = answer.json() as GetConnectedWorkResponse
    expect(connected.truncated).toBe(false)
    expect(connected.results).toHaveLength(1)
    expect(connected.results[0]).toEqual(expect.objectContaining({
      surface: 'page',
      home: 'task',
      home_id: taskId,
      folder_id: projectId,
      label: 'Prepare structural drawings',
      block_ids: [blockId],
    }))
    expect(connected.results[0]?.sources).toEqual([
      {
        id: blockId,
        kind: 'block',
        block_kind: 'paragraph',
        text: 'Final drawings approved',
        files: [],
      },
    ])

    const refused = await stranger.browser.json(`/facets/${resultsId}/backlinks`, 'GET')
    expectStatus(refused, 404, 'a stranger cannot learn the facet or its connected sources')
    expect(refused.body).not.toContain('Prepare structural drawings')
    expect(refused.body).not.toContain(blockId)
  })

  test('the historical Page spelling converges on the same facet projection', async () => {
    const [owner] = (await cast.of(app)) as [Actor, Actor]
    const { projectId, resultsId } = await makeUsualProject(owner)
    const taskId = await seedTask(app.db, {
      folderId: projectId,
      createdBy: owner.id,
      title: 'Legacy linked task',
    })
    const blockId = await writeTaskReference(owner, taskId, `/app/folders/${resultsId}`)

    const answer = await owner.browser.json(`/facets/${resultsId}/backlinks`, 'GET')
    expectStatus(answer, 200, 'old Page links still project as facet Connected work')
    const connected = answer.json() as GetConnectedWorkResponse
    const row = connected.results.find((item) => item.home_id === taskId)
    expect(row?.block_ids).toEqual([blockId])
    expect(row?.sources.map((source) => source.id)).toEqual([blockId])
    expect(row?.sources[0]?.text).toBe('Final drawings approved')
  })
})
