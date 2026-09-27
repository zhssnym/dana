/*
AC-1015: a dragged tab lands where it was dropped. `PATCH /folders/:id/location`
with `parent_folder_id: null` on a tab moves it along its project's tab row:
after `after_id` (a tab of the same project), first for null, last when
absent; every member reads the same row. A tab never goes under a page, and a
project with more than one tab never becomes a sub-page; a sub-page moved to
the top level becomes a project and carries its sub-pages with it.

Spec: 7.4 (location), 4.3 (projects and tabs), 9.6 (tab row). Step 7 moved
this criterion from 7.27's facet order routes to the tab rows.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Folder } from '../../src/shared/folders.js'
import { projectTabs } from '../../src/shared/folders.js'
import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { addMemberOk, Cast, connect, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member'], 'ac1015')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

async function row(actor: Actor, projectId: string): Promise<string[]> {
  const listed = await actor.browser.json('/folders', 'GET')
  expectStatus(listed, 200, 'a member lists the folders (7.4)')
  return projectTabs(listed.json() as Folder[], projectId).map((tab) => tab.name)
}

async function tabIds(actor: Actor, projectId: string): Promise<Map<string, string>> {
  const listed = await actor.browser.json('/folders', 'GET')
  return new Map(projectTabs(listed.json() as Folder[], projectId).map((tab) => [tab.name, tab.id]))
}

async function usualProject(owner: Actor, name: string): Promise<string> {
  const made = await owner.browser.json('/folders', 'POST', { name, kind: null })
  expectStatus(made, 201, 'an unpicked project (7.4)')
  const id = (made.json() as { id: string }).id
  expectStatus(await owner.browser.json(`/folders/${id}/tabs`, 'POST', { kind: 'usual' }), 201, 'the usual project')
  return id
}

describe('AC-1015 a dragged tab lands where it was dropped', () => {
  test('AC-1015: a tab moves along its row, the same row for every member', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    // The member joins first: until step 8 a new tab copies the root's people.
    const made = await owner.browser.json('/folders', 'POST', { name: 'ac1015 tabs', kind: null })
    expectStatus(made, 201, 'an unpicked project (7.4)')
    const project = (made.json() as { id: string }).id
    await connect(app.db, owner.id, member.id)
    await addMemberOk(owner, project, member.id, 'can_edit')
    expectStatus(await owner.browser.json(`/folders/${project}/tabs`, 'POST', { kind: 'usual' }), 201, 'the usual project')
    expectStatus(await owner.browser.json(`/folders/${project}/tabs`, 'POST', { kind: 'doc' }), 201, 'a Doc tab')
    expect(await row(owner, project)).toEqual(['Purpose', 'ac1015 tabs', 'Results', 'Discussion', 'Doc'])
    const ids = await tabIds(owner, project)

    const move = (id: string, body: Record<string, unknown>) =>
      owner.browser.json(`/folders/${id}/location`, 'PATCH', { parent_folder_id: null, ...body })
    expectStatus(await move(ids.get('Doc')!, { after_id: ids.get('Purpose') }), 200, 'the Doc tab dropped after Purpose')
    expect(await row(owner, project)).toEqual(['Purpose', 'Doc', 'ac1015 tabs', 'Results', 'Discussion'])
    expectStatus(await move(ids.get('Discussion')!, { after_id: null }), 200, 'Discussion dropped first')
    expect(await row(owner, project)).toEqual(['Discussion', 'Purpose', 'Doc', 'ac1015 tabs', 'Results'])
    expectStatus(await move(ids.get('Discussion')!, {}), 200, 'Discussion dropped last')
    expect(await row(member, project), 'every member reads the one row').toEqual([
      'Purpose', 'Doc', 'ac1015 tabs', 'Results', 'Discussion',
    ])

    const other = await usualProject(owner, 'ac1015 elsewhere')
    const elsewhere = await tabIds(owner, other)
    expectStatus(await move(ids.get('Doc')!, { after_id: elsewhere.get('Purpose') }), 422, 'after_id must be a tab of the same project')
    expectStatus(
      await owner.browser.json(`/folders/${ids.get('Doc')!}/location`, 'PATCH', { parent_folder_id: other }),
      422,
      'a tab never goes under a page',
    )
    expectStatus(
      await owner.browser.json(`/folders/${project}/location`, 'PATCH', { parent_folder_id: other }),
      422,
      'a project with more than one tab never becomes a sub-page',
    )
    expect(await row(owner, project)).toEqual(['Purpose', 'Doc', 'ac1015 tabs', 'Results', 'Discussion'])
  }, 60_000)

  test('AC-1015: a sub-page moved to the top level becomes a project with its sub-pages', async () => {
    const [owner] = (await cast.of(app)) as [Actor, Actor]
    const project = await usualProject(owner, 'ac1015 tree')
    const sub = await owner.browser.json('/folders', 'POST', { name: 'ac1015 sub', parent_folder_id: project })
    expectStatus(sub, 201, 'a sub-page')
    const subId = (sub.json() as { id: string }).id
    const grand = await owner.browser.json('/folders', 'POST', { name: 'ac1015 grand', parent_folder_id: subId })
    expectStatus(grand, 201, 'a sub-sub-page')
    const grandId = (grand.json() as { id: string }).id

    expectStatus(
      await owner.browser.json(`/folders/${subId}/location`, 'PATCH', { parent_folder_id: null }),
      200,
      'the sub-page moves to the top level',
    )
    expect(
      await rows(app.db, sql`SELECT id, parent_folder_id, project_id, tab_position FROM folders
        WHERE id IN (${subId}::uuid, ${grandId}::uuid) ORDER BY tab_position NULLS LAST`),
    ).toEqual([
      { id: subId, parent_folder_id: null, project_id: subId, tab_position: 'a0' },
      { id: grandId, parent_folder_id: subId, project_id: subId, tab_position: null },
    ])

    // Back under a page of the first project: both follow.
    expectStatus(
      await owner.browser.json(`/folders/${subId}/location`, 'PATCH', { parent_folder_id: project }),
      200,
      'the one-tab project goes back under a page',
    )
    expect(
      await rows(app.db, sql`SELECT id, project_id, tab_position FROM folders
        WHERE id IN (${subId}::uuid, ${grandId}::uuid) ORDER BY id`),
    ).toEqual(
      [
        { id: subId, project_id: project, tab_position: null },
        { id: grandId, project_id: project, tab_position: null },
      ].sort((a, b) => (a.id < b.id ? -1 : 1)),
    )
  }, 60_000)
})
