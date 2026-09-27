/*
AC-1521: `POST /folders` without `kind` makes a Work project, and with
`kind: null` an unpicked one. The first `POST /folders/:id/tabs` picks it:
`usual` gives Purpose, Work, Results and Discussion in that order. After that
a kind adds one tab after the last, `usual` answers 422, a second live
Discussion 409, and a Can-view member 403. Asserted on the stored rows (spec
7.4, 4.3).
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { addMemberOk, Cast, connect, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'viewer'], 'ac1521')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

async function stored(projectId: string): Promise<Record<string, unknown>[]> {
  return rows(app.db, sql`
    SELECT name, kind, (id = project_id) AS root, parent_folder_id, deleted_at IS NOT NULL AS trashed
      FROM folders WHERE project_id = ${projectId}::uuid AND tab_position IS NOT NULL
     ORDER BY tab_position, id`)
}

async function members(folderId: string): Promise<Record<string, unknown>[]> {
  return rows(app.db, sql`SELECT user_id, access FROM folder_members WHERE folder_id = ${folderId}::uuid ORDER BY user_id`)
}

describe('AC-1521 a new project and its tabs', () => {
  test('AC-1521: absent kind is Work, null is unpicked, and the first tabs call picks', async () => {
    const [owner, viewer] = (await cast.of(app)) as [Actor, Actor]

    const work = await owner.browser.json('/folders', 'POST', { name: 'ac1521 work' })
    expectStatus(work, 201, 'POST /folders without kind')
    const workId = (work.json() as { id: string }).id
    expect(work.json()).toMatchObject({ project_id: workId, kind: 'work', tab_position: 'a0' })
    expect(await stored(workId)).toEqual([
      { name: 'ac1521 work', kind: 'work', root: true, parent_folder_id: null, trashed: false },
    ])

    const made = await owner.browser.json('/folders', 'POST', { name: 'ac1521 trip', kind: null })
    expectStatus(made, 201, 'POST /folders with kind null')
    const project = (made.json() as { id: string }).id
    expect(await stored(project)).toEqual([
      { name: 'ac1521 trip', kind: null, root: true, parent_folder_id: null, trashed: false },
    ])
    await connect(app.db, owner.id, viewer.id)
    await addMemberOk(owner, project, viewer.id, 'can_view')

    const refused = await viewer.browser.json(`/folders/${project}/tabs`, 'POST', { kind: 'usual' })
    expectStatus(refused, 403, 'Can view adds no tab')
    expect((await stored(project)).length, 'the refusal wrote nothing').toBe(1)

    const picked = await owner.browser.json(`/folders/${project}/tabs`, 'POST', { kind: 'usual' })
    expectStatus(picked, 201, 'the usual project')
    expect((picked.json() as { name: string }[]).map((tab) => tab.name)).toEqual([
      'Purpose', 'ac1521 trip', 'Results', 'Discussion',
    ])
    expect(await stored(project)).toEqual([
      { name: 'Purpose', kind: 'doc', root: false, parent_folder_id: null, trashed: false },
      { name: 'ac1521 trip', kind: 'work', root: true, parent_folder_id: null, trashed: false },
      { name: 'Results', kind: 'doc', root: false, parent_folder_id: null, trashed: false },
      { name: 'Discussion', kind: 'discussion', root: false, parent_folder_id: null, trashed: false },
    ])
    // Step 8: a tab's people are the project's; it stores none of its own.
    const purposeId = (picked.json() as { id: string; name: string }[]).find((tab) => tab.name === 'Purpose')!.id
    expect(await members(purposeId)).toEqual([])
    expectStatus(await viewer.browser.json(`/folders/${purposeId}`, 'GET'), 200, "the project's viewer reads the tab")

    expectStatus(await owner.browser.json(`/folders/${project}/tabs`, 'POST', { kind: 'usual' }), 422, 'usual only picks')
    expectStatus(await owner.browser.json(`/folders/${project}/tabs`, 'POST', { kind: 'discussion' }), 409, 'one Discussion per project')
    expectStatus(await owner.browser.json(`/folders/${project}/tabs`, 'POST', { kind: 'nope' }), 422, 'an unknown kind')

    const added = await owner.browser.json(`/folders/${purposeId}/tabs`, 'POST', { kind: 'doc' })
    expectStatus(added, 201, 'any page of the project adds a tab')
    expect((await stored(project)).map((tab) => [tab.name, tab.kind])).toEqual([
      ['Purpose', 'doc'], ['ac1521 trip', 'work'], ['Results', 'doc'], ['Discussion', 'discussion'], ['Doc', 'doc'],
    ])

    // A Discussion tab trashed frees the one place for a new one.
    const discussion = (added.json() as { id: string; kind: string }[]).find((tab) => tab.kind === 'discussion')!.id
    expectStatus(await owner.browser.json(`/folders/${discussion}`, 'DELETE'), 200, 'the Discussion tab to Trash')
    expectStatus(await owner.browser.json(`/folders/${project}/tabs`, 'POST', { kind: 'discussion' }), 201, 'a new Discussion')
  }, 60_000)

  test('AC-1521: a project root to Trash takes its tabs, and a restore brings them back', async () => {
    const [owner] = (await cast.of(app)) as [Actor, Actor]
    const made = await owner.browser.json('/folders', 'POST', { name: 'ac1521 bin', kind: null })
    const project = (made.json() as { id: string }).id
    expectStatus(await owner.browser.json(`/folders/${project}/tabs`, 'POST', { kind: 'usual' }), 201, 'the usual project')
    expectStatus(await owner.browser.json(`/folders/${project}`, 'DELETE'), 200, 'the project to Trash')
    expect((await stored(project)).map((tab) => tab.trashed)).toEqual([true, true, true, true])
    expectStatus(await owner.browser.json(`/folders/${project}/restore`, 'POST'), 200, 'the project restored')
    expect((await stored(project)).map((tab) => tab.trashed)).toEqual([false, false, false, false])
  }, 60_000)
})
