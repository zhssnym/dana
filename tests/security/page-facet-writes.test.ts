import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { addMemberOk, Cast, connect, expectStatus } from '../support/folders-harness.js'
import { inTransaction } from '../../src/server/database.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'viewer', 'stranger'], 'pf671')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

interface Facet {
  id: string
  name: string
  position: string
  content_page_id: string | null
}
interface FacetResponse {
  page_id: string
  containing_facet_id: string | null
  facets: Facet[]
}

describe('Page Facet writes', () => {
  test('create, rename and reorder on nested Pages without moving Page content', async () => {
    const [owner, viewer, stranger] = await cast.of(app)
    if (!owner || !viewer || !stranger) throw new Error('Missing test actors')
    const made = await owner.browser.json('/folders', 'POST', { name: 'pf671 root', kind: 'work' })
    expectStatus(made, 201, 'root Page')
    const rootId = (made.json() as { id: string }).id
    const nested = await owner.browser.json('/folders', 'POST', {
      name: 'pf671 child', parent_folder_id: rootId,
    })
    expectStatus(nested, 201, 'nested Page')
    const nestedRecord = nested.json() as { id: string; parent_folder_id: string | null }
    const nestedId = nestedRecord.id
    const originalParentId = nestedRecord.parent_folder_id

    const rootBefore = await owner.browser.json(`/pages/${rootId}/facets`, 'GET')
    expectStatus(rootBefore, 200, 'root Facets')
    const rootMain = (rootBefore.json() as FacetResponse).facets[0]
    if (!rootMain) throw new Error('Root must have Main')
    expect(rootMain.name).toBe('Main')

    const renamed = await owner.browser.json(`/pages/${rootId}/facets/${rootMain.id}`, 'PATCH', {
      name: 'Overview',
    })
    expectStatus(renamed, 200, 'rename Main')
    expect((renamed.json() as FacetResponse).facets[0]?.name).toBe('Overview')
    const stillRoot = await owner.browser.json(`/folders/${rootId}`, 'GET')
    expectStatus(stillRoot, 200, 'same root Page')
    expect((stillRoot.json() as { name: string }).name).toBe('pf671 root')

    const first = await owner.browser.json(`/pages/${nestedId}/facets`, 'POST', {
      name: 'Notes',
    })
    expectStatus(first, 201, 'new nested Facet')
    const newFacets = (first.json() as FacetResponse).facets
    expect(newFacets.map((facet) => facet.name)).toEqual(['Main', 'Notes'])
    const notes = newFacets[1]
    if (!notes) throw new Error('Notes missing')
    expect(notes.content_page_id).toBeNull()

    const second = await owner.browser.json(`/pages/${nestedId}/facets`, 'POST', {
      name: 'Plan',
      after_facet_id: null,
    })
    expectStatus(second, 201, 'insert at start')
    expect((second.json() as FacetResponse).facets.map((facet) => facet.name)).toEqual([
      'Plan', 'Main', 'Notes',
    ])
    const beforeOrder = (second.json() as FacetResponse).facets
    const reversed = [...beforeOrder].reverse().map((facet) => facet.id)
    const ordered = await owner.browser.json(`/pages/${nestedId}/facets/order`, 'PUT', {
      order: reversed,
    })
    expectStatus(ordered, 200, 'reorder')
    expect((ordered.json() as FacetResponse).facets.map((facet) => facet.id)).toEqual(reversed)

    expectStatus(await owner.browser.json(`/pages/${nestedId}/facets/order`, 'PUT', {
      order: reversed.slice(0, 2),
    }), 409, 'reject incomplete ordering')
    expectStatus(await owner.browser.json(`/pages/${nestedId}/facets`, 'POST', {
      name: 'No',
      after_facet_id: rootMain.id,
    }), 422, 'refuse Facet from another Page')
    expectStatus(await owner.browser.json(`/pages/${nestedId}/facets/${rootMain.id}`, 'PATCH', {
      name: 'Moved',
    }), 404, 'cannot rename Facet from another Page')

    const nestedFolder = await owner.browser.json(`/folders/${nestedId}`, 'GET')
    expectStatus(nestedFolder, 200, 'nested Page remains')
    expect((nestedFolder.json() as { parent_folder_id: string | null }).parent_folder_id).toBe(originalParentId)
    expectStatus(await owner.browser.json(`/folders/${nestedId}/page`, 'GET'), 200, 'nested document remains')

    await connect(app.db, owner.id, viewer.id)
    await connect(app.db, owner.id, stranger.id)
    await addMemberOk(owner, rootId, viewer.id, 'can_view')
    expectStatus(await viewer.browser.json(`/pages/${nestedId}/facets`, 'GET'), 200, 'member may read')
    expectStatus(await viewer.browser.json(`/pages/${nestedId}/facets`, 'POST', {
      name: 'Not allowed',
    }), 403, 'viewer cannot create')
    expectStatus(await viewer.browser.json(`/pages/${nestedId}/facets/${notes.id}`, 'PATCH', {
      name: 'Not allowed',
    }), 403, 'viewer cannot rename')
    expectStatus(await viewer.browser.json(`/pages/${nestedId}/facets/order`, 'PUT', {
      order: reversed,
    }), 403, 'viewer cannot reorder')
    expectStatus(await stranger.browser.json(`/pages/${nestedId}/facets`, 'POST', {
      name: 'Not allowed',
    }), 404, 'stranger cannot discover Page')
  }, 60_000)

  test('legacy Page content tracks its Facet and a new Facet can own blocks without a new Page', async () => {
    const [owner] = await cast.of(app)
    if (!owner) throw new Error('Missing owner')
    const made = await owner.browser.json('/folders', 'POST', {
      name: 'pf671 content home', kind: 'work',
    })
    expectStatus(made, 201, 'created Page')
    const rootId = (made.json() as { id: string }).id
    const child = await owner.browser.json('/folders', 'POST', {
      name: 'pf671 child home', parent_folder_id: rootId,
    })
    expectStatus(child, 201, 'created nested Page')
    const childId = (child.json() as { id: string }).id

    const rootFacet = (await rows(app.db, sql`
      SELECT id FROM page_facets WHERE content_folder_id = ${rootId}::uuid
    `))[0]?.id
    const childFacet = (await rows(app.db, sql`
      SELECT id FROM page_facets WHERE content_folder_id = ${childId}::uuid
    `))[0]?.id
    expect(rootFacet).toBeDefined()
    expect(childFacet).toBeDefined()

    const task = await owner.browser.json('/tasks', 'POST', {
      folder_id: rootId, title: 'pf671 existing task',
    })
    expectStatus(task, 201, 'legacy Task created')
    const taskId = (task.json() as { id: string }).id
    await inTransaction(app.db, (tx) => tx.execute(sql`
      INSERT INTO page_blocks (folder_id, kind, position, text)
      VALUES (${rootId}::uuid, 'paragraph', 999, 'pf671 existing writing')
    `))
    const [taskRow] = await rows(app.db, sql`
      SELECT folder_id, page_facet_id FROM tasks WHERE id = ${taskId}::uuid
    `)
    expect(taskRow).toEqual({ folder_id: rootId, page_facet_id: rootFacet })
    const [block] = await rows(app.db, sql`
      SELECT id, folder_id, page_facet_id FROM page_blocks
       WHERE folder_id = ${rootId}::uuid AND text = 'pf671 existing writing'
    `)
    expect(block?.page_facet_id).toBe(rootFacet)

    // Moving legacy content between Page homes reassigns only the Facet link.
    await inTransaction(app.db, (tx) => tx.execute(sql`
      UPDATE page_blocks SET folder_id = ${childId}::uuid WHERE id = ${block?.id}::uuid
    `))
    expect(await rows(app.db, sql`
      SELECT folder_id, page_facet_id FROM page_blocks WHERE id = ${block?.id}::uuid
    `)).toEqual([{ folder_id: childId, page_facet_id: childFacet }])

    const [before] = await rows(app.db, sql`
      SELECT count(*)::int AS amount FROM folders WHERE project_id = ${rootId}::uuid
    `)
    const created = await owner.browser.json(`/pages/${childId}/facets`, 'POST', {
      name: 'pf671 Notes',
    })
    expectStatus(created, 201, 'created independent Facet')
    const notes = (created.json() as FacetResponse).facets.find((facet) => facet.name === 'pf671 Notes')
    expect(notes?.content_page_id).toBeNull()
    const [after] = await rows(app.db, sql`
      SELECT count(*)::int AS amount FROM folders WHERE project_id = ${rootId}::uuid
    `)
    expect(after).toEqual(before)

    // The future editor will supply the Facet id while retaining the parent Page id.
    await inTransaction(app.db, (tx) => tx.execute(sql`
      INSERT INTO page_blocks (folder_id, page_facet_id, kind, position, text)
      VALUES (${childId}::uuid, ${notes?.id}::uuid, 'paragraph', 1000, 'pf671 Notes draft')
    `))
    expect(await rows(app.db, sql`
      SELECT folder_id, page_facet_id FROM page_blocks
       WHERE text = 'pf671 Notes draft'
    `)).toEqual([{ folder_id: childId, page_facet_id: notes?.id }])
    // The same Facet cannot be used as another Page's content home.
    await expect(inTransaction(app.db, (tx) => tx.execute(sql`
      INSERT INTO page_blocks (folder_id, page_facet_id, kind, position, text)
      VALUES (${rootId}::uuid, ${notes?.id}::uuid, 'paragraph', 1001, 'invalid foreign Facet')
    `))).rejects.toThrow(/page_facet_not_here/)

    // Backfilled legacy records (including seeded data) cannot point to a
    // different Facet than their original content home.
    expect(await rows(app.db, sql`
      SELECT count(*)::int AS amount FROM page_blocks b JOIN page_facets pf
        ON pf.content_folder_id = b.folder_id
       WHERE b.page_facet_id IS DISTINCT FROM pf.id
         AND b.text IS DISTINCT FROM 'pf671 Notes draft'
    `)).toEqual([{ amount: 0 }])
  }, 60_000)
})
