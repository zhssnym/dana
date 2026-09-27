/*
AC-1523: until members move to the project (step 8), a project's other tabs
have exactly its root's people. Adding someone to the root adds them to every
tab, lowering their preset on the root lowers it on every tab, and removing
them from the root removes them from every tab, so they get 404 on the
Purpose tab they could read before (spec 4.3, 5.3). Asserted on the stored
rows and on the read.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { addMemberOk, Cast, connect, expectStatus, removeMember } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member'], 'ac1523')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

/** The member's preset on each tab of the project, root first, in tab order. */
async function presets(projectId: string, userId: string): Promise<unknown[]> {
  const found = await rows(app.db, sql`
    SELECT t.name, m.access FROM folders t
      LEFT JOIN folder_members m ON m.folder_id = t.id AND m.user_id = ${userId}::uuid
     WHERE t.project_id = ${projectId}::uuid AND t.tab_position IS NOT NULL
     ORDER BY t.tab_position, t.id`)
  return found.map((row) => [row.name, row.access])
}

describe("AC-1523 a project's tabs have its people", () => {
  test('AC-1523: add, lower and remove on the root reach every tab', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    const made = await owner.browser.json('/folders', 'POST', { name: 'ac1523 trip', kind: null })
    expectStatus(made, 201, 'an unpicked project')
    const project = (made.json() as { id: string }).id
    expectStatus(await owner.browser.json(`/folders/${project}/tabs`, 'POST', { kind: 'usual' }), 201, 'the usual project')
    const purpose = String((await rows(app.db, sql`
      SELECT id FROM folders WHERE project_id = ${project}::uuid AND name = 'Purpose'`))[0]?.id)

    await connect(app.db, owner.id, member.id)
    await addMemberOk(owner, project, member.id, 'can_edit')
    expect(await presets(project, member.id)).toEqual([
      ['Purpose', 'can_edit'], ['ac1523 trip', 'can_edit'], ['Results', 'can_edit'], ['Discussion', 'can_edit'],
    ])
    expectStatus(await member.browser.json(`/folders/${purpose}/page`, 'GET'), 200, 'a member reads Purpose')

    expectStatus(
      await owner.browser.json(`/folders/${project}/members/${member.id}`, 'PATCH', { access: 'can_view' }),
      200,
      'lowered on the root',
    )
    expect(await presets(project, member.id)).toEqual([
      ['Purpose', 'can_view'], ['ac1523 trip', 'can_view'], ['Results', 'can_view'], ['Discussion', 'can_view'],
    ])

    expectStatus(await removeMember(owner, project, member.id), 204, 'removed from the root')
    expect(await presets(project, member.id)).toEqual([
      ['Purpose', null], ['ac1523 trip', null], ['Results', null], ['Discussion', null],
    ])
    expectStatus(await member.browser.json(`/folders/${purpose}/page`, 'GET'), 404, 'Purpose is gone with the project')
    // The owner kept every tab.
    expect(await presets(project, owner.id)).toEqual([
      ['Purpose', 'full_control'], ['ac1523 trip', 'full_control'], ['Results', 'full_control'],
      ['Discussion', 'full_control'],
    ])
  }, 60_000)
})
