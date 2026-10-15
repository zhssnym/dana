/*
people belong to the project (step 8, spec 4.4, 7.4). A membership
act named on any page of a project -- a tab or a sub-page -- acts on the
project: an add, a preset change, a removal and an invite are stored on the
project root, and no page but the root holds a membership row. When the
owner's account is deleted, every page of a shared project follows the
project's heir (8.10 step 2's automatic transfer). Asserted on the stored
rows.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { addMemberOk, Cast, connect, expectStatus, removeMember } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { deleteAccountData } from '../../src/server/domain/account-deletion.js'
import { inTransaction } from '../../src/server/database.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member', 'third', 'leaver', 'heir', 'viewer'], 'ac1523')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

/** Every membership row of the project's pages, as [folder, user, access]. */
async function stored(projectId: string): Promise<unknown[]> {
  const found = await rows(app.db, sql`
    SELECT m.folder_id, m.user_id, m.access FROM folder_members m
      JOIN folders f ON f.id = m.folder_id
     WHERE f.project_id = ${projectId}::uuid
     ORDER BY m.folder_id, m.user_id`)
  return found.map((row) => [row.folder_id, row.user_id, row.access])
}

describe("a project's tabs have its people", () => {
  test('an add, a preset change, a removal and an invite named on a tab or a sub-page land on the project', async () => {
    const [owner, member, third] = (await cast.of(app)) as [Actor, Actor, Actor]
    const made = await owner.browser.json('/folders', 'POST', { name: 'ac1523 trip', kind: null })
    expectStatus(made, 201, 'an unpicked project')
    const project = (made.json() as { id: string }).id
    expectStatus(await owner.browser.json(`/folders/${project}/tabs`, 'POST', { kind: 'usual' }), 201, 'the usual project')
    const results = String((await rows(app.db, sql`
      SELECT id FROM folders WHERE project_id = ${project}::uuid AND name = 'Results'`))[0]?.id)
    const facets = await rows(app.db, sql`
      SELECT pf.id, pf.page_id, pf.content_folder_id, pf.name
        FROM page_facets pf
       WHERE pf.content_folder_id IN (${project}::uuid, ${results}::uuid)
       ORDER BY pf.name
    `)
    expect(facets).toHaveLength(2)
    expect(facets).toEqual(expect.arrayContaining([
      expect.objectContaining({ page_id: project, content_folder_id: project, name: 'Main' }),
      expect.objectContaining({ page_id: project, content_folder_id: results, name: 'Results' }),
    ]))
    expect(facets.every((facet) => facet.id !== facet.content_folder_id)).toBe(true)
    const resultsFacet = facets.find((facet) => facet.content_folder_id === results)
    expect(resultsFacet).toBeDefined()

    const sub = await owner.browser.json('/folders', 'POST', { name: 'ac1523 sub', parent_folder_id: results })
    expectStatus(sub, 201, 'a sub-page under Results')
    const subId = (sub.json() as { id: string }).id
    expect(await rows(app.db, sql`
      SELECT f.containing_facet_id, pf.page_id AS home_page_id, pf.name AS home_name
        FROM folders f JOIN page_facets pf ON pf.content_folder_id = f.id
       WHERE f.id = ${subId}::uuid
    `)).toEqual([{
      containing_facet_id: resultsFacet?.id,
      home_page_id: subId,
      home_name: 'Main',
    }])
    await inTransaction(app.db, (tx) => tx.execute(sql`
      UPDATE folders SET name = 'Resources' WHERE id = ${results}::uuid
    `))
    expect(await rows(app.db, sql`
      SELECT name FROM page_facets WHERE id = ${resultsFacet?.id}::uuid
    `)).toEqual([{ name: 'Resources' }])
    await connect(app.db, owner.id, member.id)
    await connect(app.db, owner.id, third.id)

    await addMemberOk(owner, results, member.id, 'can_edit')
    await addMemberOk(owner, subId, third.id, 'can_view')
    expect(await stored(project)).toEqual([
      [project, owner.id, 'full_control'], [project, member.id, 'can_edit'], [project, third.id, 'can_view'],
    ].sort((x, y) => String(x[1]).localeCompare(String(y[1]))))

    expectStatus(
      await owner.browser.json(`/folders/${subId}/members/${member.id}`, 'PATCH', { access: 'can_comment' }),
      200,
      'lowered from the sub-page',
    )
    expect(await rows(app.db, sql`SELECT access FROM folder_members
      WHERE folder_id = ${project}::uuid AND user_id = ${member.id}::uuid`)).toEqual([{ access: 'can_comment' }])

    expectStatus(await removeMember(owner, results, third.id), 204, 'removed from the Results tab')
    expect(await rows(app.db, sql`SELECT user_id FROM folder_members m JOIN folders f ON f.id = m.folder_id
      WHERE f.project_id = ${project}::uuid AND m.user_id = ${third.id}::uuid`)).toEqual([])

    const invited = await owner.browser.json('/invites', 'POST', {
      email: 'ac1523-tab-invite@example.test',
      folder_id: subId,
      access: 'can_view',
    })
    expectStatus(invited, 201, 'an invite from the sub-page')
    expect(await rows(app.db, sql`SELECT folder_id FROM invites
      WHERE email = 'ac1523-tab-invite@example.test' AND status = 'pending'`)).toEqual([{ folder_id: project }])
    expectStatus(await member.browser.json(`/folders/${subId}/my-membership`, 'DELETE'), 204, 'leaving from the sub-page')
    expect(await rows(app.db, sql`SELECT user_id FROM folder_members
      WHERE folder_id = ${project}::uuid AND user_id = ${member.id}::uuid`)).toEqual([])
  }, 60_000)

  test("a removed owner's pages all follow the project's heir", async () => {
    const [, , , leaver, heir, viewer] = (await cast.of(app)) as [Actor, Actor, Actor, Actor, Actor, Actor]
    const made = await leaver.browser.json('/folders', 'POST', { name: 'ac1523 heir', kind: null })
    expectStatus(made, 201, 'an unpicked project')
    const project = (made.json() as { id: string }).id
    expectStatus(await leaver.browser.json(`/folders/${project}/tabs`, 'POST', { kind: 'usual' }), 201, 'the usual project')
    await connect(app.db, leaver.id, heir.id)
    await connect(app.db, leaver.id, viewer.id)
    await addMemberOk(leaver, project, heir.id, 'full_control')
    await addMemberOk(leaver, project, viewer.id, 'can_view')
    const sub = await leaver.browser.json('/folders', 'POST', { name: 'ac1523 heir sub', parent_folder_id: project })
    expectStatus(sub, 201, 'a sub-page')

    // 8.10 step 2's automatic transfer: the interactive DELETE /me refuses a
    // shared project first, so this is the forced-removal path it keeps.
    await inTransaction(app.db, (tx) => deleteAccountData(tx, leaver.id))
    const owners = await rows(app.db, sql`
      SELECT DISTINCT owner_id FROM folders WHERE project_id = ${project}::uuid`)
    expect(owners).toEqual([{ owner_id: heir.id }])
  }, 60_000)
})
