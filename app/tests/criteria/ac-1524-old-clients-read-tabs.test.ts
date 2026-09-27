/*
AC-1524: for one release after step 7, a client from before it (an installed
PWA on the old bundle) still draws a project. GET /folders lists no tab but
the root, and a page under a tab under its project root; `?tabs=1` lists every
tab as it is stored. The retired facet reads answer from the tab rows: the
listing gives the root as `main` and each Doc or Discussion tab by its id, the
facet page read gives the tab's page, and the location read gives the tab's
project (spec 7.4, 7.27).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import type { Folder } from '../../src/shared/folders.js'
import type { Facet } from '../../src/shared/facets.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac1524')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-1524 an old client still reads a project', () => {
  test('AC-1524: the folder list, the facet listing, the facet page and the location', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const made = await owner.browser.json('/folders', 'POST', { name: 'ac1524 trip', kind: null })
    expectStatus(made, 201, 'an unpicked project')
    const project = (made.json() as { id: string }).id
    expectStatus(await owner.browser.json(`/folders/${project}/tabs`, 'POST', { kind: 'usual' }), 201, 'the usual project')

    const all = (await owner.browser.json('/folders?tabs=1', 'GET')).json() as Folder[]
    const tabs = all.filter((f) => f.project_id === project && f.tab_position !== null && f.id !== project)
    expect(tabs.map((t) => t.name).sort()).toEqual(['Discussion', 'Purpose', 'Results'])
    const purpose = tabs.find((t) => t.name === 'Purpose')!.id
    const discussion = tabs.find((t) => t.name === 'Discussion')!.id
    const child = await owner.browser.json('/folders', 'POST', { name: 'ac1524 under purpose', parent_folder_id: purpose })
    expectStatus(child, 201, 'a page under the Purpose tab')
    const childId = (child.json() as { id: string }).id

    const legacy = (await owner.browser.json('/folders', 'GET')).json() as Folder[]
    const ids = legacy.map((f) => f.id)
    expect(ids).toContain(project)
    for (const tab of tabs) expect(ids, `${tab.name} is left out`).not.toContain(tab.id)
    expect(legacy.find((f) => f.id === childId)?.parent_folder_id, 'listed under the root').toBe(project)
    const stored = (await owner.browser.json('/folders?tabs=1', 'GET')).json() as Folder[]
    expect(stored.find((f) => f.id === childId)?.parent_folder_id, 'stored under the tab').toBe(purpose)
    expectStatus(await owner.browser.json('/folders?tabs=yes', 'GET'), 422, 'tabs takes only 1')

    const listed = await owner.browser.json(`/folders/${project}/facets`, 'GET')
    expectStatus(listed, 200, 'the facet listing')
    const facets = (listed.json() as { facets: Facet[] }).facets
    expect(facets.map((f) => [f.kind, f.name])).toEqual([
      ['shared_blank', 'Purpose'], ['main', 'Work'], ['shared_blank', 'Results'], ['consultation', 'Discussion'],
    ])
    expect(facets.find((f) => f.kind === 'consultation')?.id).toBe(discussion)

    const page = await owner.browser.json(`/folders/${project}/facets/${purpose}/page`, 'GET')
    expectStatus(page, 200, 'the facet page is the tab page')
    expect(page.json()).toEqual((await owner.browser.json(`/folders/${purpose}/page`, 'GET')).json())
    expectStatus(
      await owner.browser.json(`/folders/${childId}/facets/${purpose}/page`, 'GET'),
      404,
      'a tab read through a page of another project',
    )

    const location = await owner.browser.json(`/facets/${purpose}/location`, 'GET')
    expectStatus(location, 200, 'the location')
    expect(location.json()).toEqual({ folder_id: project })
  }, 60_000)
})
