import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { addMemberOk, Cast, connect, expectStatus } from '../support/folders-harness.js'

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
    const nestedId = (nested.json() as { id: string }).id

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
    expect((nestedFolder.json() as { parent_folder_id: string | null }).parent_folder_id).toBe(rootId)
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
})
