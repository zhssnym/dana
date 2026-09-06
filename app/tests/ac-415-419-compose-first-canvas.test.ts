/*
AC-415 to AC-419: issue #184's composed folder page. These criteria share one
HTTP fixture because the feature is one persistence invariant: real blocks and
real tasks occupy one durable order, while Section membership remains a field
on the item and every gesture commits under the folder lock.

Spec: 4.5, 4.17, 7.16, 8.3, 9.6, 10.2, 10.3.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import type { RawResponse } from './http-client.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'stranger'], 'ac415')

interface Item { kind: 'block' | 'task'; id: string }
interface Block {
  id: string
  kind: string
  text: string | null
  page_position: string | null
  section_block_id: string | null
  updated_at: string
}
interface Page { items: Item[]; blocks: Block[] }

function pageOf(response: RawResponse): Page {
  expectStatus(response, 200, 'the composed page action succeeds (7.16)')
  return response.json() as Page
}

async function action(owner: Actor, folderId: string, body: object): Promise<Page> {
  return pageOf(await owner.browser.json(`/folders/${folderId}/page/actions`, 'POST', body))
}

function blockNamed(page: Page, text: string): Block {
  const block = page.blocks.find((entry) => entry.text === text)
  expect(block, `the page contains ${text}`).toBeDefined()
  return block as Block
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-415 to AC-419: the compose-first page is one transactionally ordered document', () => {
  test('AC-415: the existing whole-page writer leaves no unkeyed or stale-membership blocks', async () => {
    const [owner] = await cast.of(app) as [Actor, Actor]
    const folderId = await createFolder(owner, 'ac415 legacy page compatibility')
    const written = pageOf(await owner.browser.json(`/folders/${folderId}/page`, 'PUT', {
      blocks: [
        { kind: 'section', position: 0, text: 'Legacy Section' },
        { kind: 'paragraph', position: 1, text: 'Legacy paragraph' },
      ],
    }))
    const section = blockNamed(written, 'Legacy Section')
    const paragraph = blockNamed(written, 'Legacy paragraph')
    expect(written.blocks.every((block) => block.page_position !== null)).toBe(true)
    expect(paragraph.section_block_id).toBe(section.id)

    const reordered = pageOf(await owner.browser.json(`/folders/${folderId}/page`, 'PUT', {
      blocks: [
        {
          id: paragraph.id, kind: 'paragraph', position: 0,
          text: paragraph.text, updated_at: paragraph.updated_at,
        },
        {
          id: section.id, kind: 'section', position: 1,
          text: section.text, updated_at: section.updated_at,
        },
      ],
    }))
    expect(blockNamed(reordered, 'Legacy paragraph').section_block_id).toBeNull()
    expect(reordered.items.map((item) => `${item.kind}:${item.id}`)).toEqual([
      `block:${paragraph.id}`,
      `block:${section.id}`,
    ])
  })

  test('AC-415/416/417: mixed order, loose collapsed insertion, and task Section moves survive a fresh read', async () => {
    const [owner] = await cast.of(app) as [Actor, Actor]
    const folderId = await createFolder(owner, 'ac415 mixed page')

    let page = await action(owner, folderId, {
      action: 'insert_block', block_kind: 'section', text: 'First',
      section_block_id: null, after: null, before: null,
    })
    const first = blockNamed(page, 'First')
    page = await action(owner, folderId, {
      action: 'insert_block', block_kind: 'paragraph', text: 'Inside first',
      section_block_id: first.id, after: { kind: 'block', id: first.id }, before: null,
    })
    const inside = blockNamed(page, 'Inside first')
    page = await action(owner, folderId, {
      action: 'insert_task', title: 'Real mixed task', section_block_id: first.id,
      after: { kind: 'block', id: inside.id }, before: null,
    })
    const task = page.items.find((item) => item.kind === 'task') as Item
    page = await action(owner, folderId, {
      action: 'insert_block', block_kind: 'section', text: 'Second',
      section_block_id: null, after: { kind: 'task', id: task.id }, before: null,
    })
    const second = blockNamed(page, 'Second')

    /* This is the collapsed-Section seam: visually after First's complete
       hidden span, but explicitly loose even though First precedes it. */
    page = await action(owner, folderId, {
      action: 'insert_block', block_kind: 'paragraph', text: 'Loose after collapse',
      section_block_id: null,
      after: { kind: 'task', id: task.id },
      before: { kind: 'block', id: second.id },
    })
    const loose = blockNamed(page, 'Loose after collapse')
    expect(loose.section_block_id).toBeNull()
    expect(page.items.map((item) => `${item.kind}:${item.id}`)).toEqual([
      `block:${first.id}`,
      `block:${inside.id}`,
      `task:${task.id}`,
      `block:${loose.id}`,
      `block:${second.id}`,
    ])

    page = await action(owner, folderId, {
      action: 'move_item', item: { kind: 'task', id: task.id },
      section_block_id: null, after: { kind: 'block', id: loose.id },
      before: { kind: 'block', id: second.id },
    })
    const refreshed = pageOf(await owner.browser.json(`/folders/${folderId}/page`, 'GET'))
    expect(refreshed.items).toEqual(page.items)
    const open = await owner.browser.json(`/folders/${folderId}/tasks?tz=UTC`, 'GET')
    expectStatus(open, 200, 'the existing Q7 task read still answers')
    const rows = open.json() as { scheduled: { id: string; section_block_id: string | null }[]; unscheduled: { id: string; section_block_id: string | null }[] }
    expect([...rows.scheduled, ...rows.unscheduled].find((row) => row.id === task.id)?.section_block_id).toBeNull()
  })

  test('AC-418: prose conversion is failure-atomic and rejects stale evidence', async () => {
    const [owner] = await cast.of(app) as [Actor, Actor]
    const folderId = await createFolder(owner, 'ac418 conversion')
    let page = await action(owner, folderId, {
      action: 'insert_block', block_kind: 'paragraph', text: 'Become a real task',
      section_block_id: null, after: null, before: null,
    })
    const paragraph = blockNamed(page, 'Become a real task')
    page = await action(owner, folderId, {
      action: 'convert_paragraph_to_task', block_id: paragraph.id,
      updated_at: paragraph.updated_at,
    })
    expect(page.blocks.some((block) => block.id === paragraph.id)).toBe(false)
    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.kind).toBe('task')

    page = await action(owner, folderId, {
      action: 'insert_block', block_kind: 'paragraph', text: 'Keep the winner',
      section_block_id: null, after: page.items[0] ?? null, before: null,
    })
    const stale = blockNamed(page, 'Keep the winner')
    await action(owner, folderId, {
      action: 'update_block', block_id: stale.id, updated_at: stale.updated_at,
      text: 'Winner text',
    })
    const refused = await owner.browser.json(`/folders/${folderId}/page/actions`, 'POST', {
      action: 'convert_paragraph_to_task', block_id: stale.id,
      updated_at: stale.updated_at,
    })
    expectStatus(refused, 409, 'stale conversion evidence is refused before either write')
    const after = pageOf(await owner.browser.json(`/folders/${folderId}/page`, 'GET'))
    expect(blockNamed(after, 'Winner text').id).toBe(stale.id)
  })

  test('AC-417: two placements into one mixed gap both survive with one stable read order', async () => {
    const [owner] = await cast.of(app) as [Actor, Actor]
    const folderId = await createFolder(owner, 'ac417 concurrent gap')
    const initial = await action(owner, folderId, {
      action: 'insert_block', block_kind: 'paragraph', text: 'Anchor',
      section_block_id: null, after: null, before: null,
    })
    const anchor = blockNamed(initial, 'Anchor')
    const bodies = ['Concurrent one', 'Concurrent two'].map((title) => ({
      action: 'insert_task', title, section_block_id: null,
      after: { kind: 'block', id: anchor.id }, before: null,
    }))
    const results = await Promise.all(
      bodies.map((body) => owner.browser.json(`/folders/${folderId}/page/actions`, 'POST', body)),
    )
    expect(results.map((response) => response.status).sort()).toEqual([200, 200])
    const first = pageOf(await owner.browser.json(`/folders/${folderId}/page`, 'GET'))
    const second = pageOf(await owner.browser.json(`/folders/${folderId}/page`, 'GET'))
    expect(first.items).toEqual(second.items)
    expect(first.items.filter((item) => item.kind === 'task')).toHaveLength(2)
  })

  test('AC-419: authorization and cross-folder anchors refuse without a partial write', async () => {
    const [owner, stranger] = await cast.of(app) as [Actor, Actor]
    const folderA = await createFolder(owner, 'ac419 a')
    const folderB = await createFolder(owner, 'ac419 b')
    const pageA = await action(owner, folderA, {
      action: 'insert_block', block_kind: 'paragraph', text: 'A remains',
      section_block_id: null, after: null, before: null,
    })
    const pageB = await action(owner, folderB, {
      action: 'insert_block', block_kind: 'paragraph', text: 'B anchor',
      section_block_id: null, after: null, before: null,
    })
    const foreign = blockNamed(pageB, 'B anchor')
    const refused = await owner.browser.json(`/folders/${folderA}/page/actions`, 'POST', {
      action: 'insert_task', title: 'must not exist', section_block_id: null,
      after: { kind: 'block', id: foreign.id }, before: null,
    })
    expectStatus(refused, 422, 'an anchor from another folder is rejected')
    expect(pageOf(await owner.browser.json(`/folders/${folderA}/page`, 'GET'))).toEqual(pageA)

    const trespass = await stranger.browser.json(`/folders/${folderA}/page/actions`, 'POST', {
      action: 'insert_task', title: 'also must not exist', section_block_id: null,
      after: null, before: null,
    })
    expectStatus(trespass, 404, 'a non-member cannot name the folder page')

    const sectionPage = await action(owner, folderA, {
      action: 'insert_block', block_kind: 'section', text: 'A boundary',
      section_block_id: null, after: pageA.items[0] ?? null, before: null,
    })
    const section = blockNamed(sectionPage, 'A boundary')
    const headingMove = await owner.browser.json(`/folders/${folderA}/page/actions`, 'POST', {
      action: 'move_item', item: { kind: 'block', id: section.id },
      section_block_id: null, after: null, before: pageA.items[0] ?? null,
    })
    expectStatus(headingMove, 422, 'a Section heading cannot be detached from its semantic span')
  })
})
