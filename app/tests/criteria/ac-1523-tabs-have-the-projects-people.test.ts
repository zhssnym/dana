/*
AC-1523: until members move to the project (step 8), a project's other tabs
have exactly its root's people. Adding someone to the root adds them to every
tab, lowering their preset on the root lowers it on every tab, and removing
them from the root removes them from every tab, so they get 404 on the
Purpose tab they could read before (spec 4.3, 5.3). A membership or invite
write aimed at a tab alone is refused (422), so the next write on the root
cannot quietly undo it. When the owner's account is deleted, every tab
follows the root's heir (8.10 step 2's automatic transfer), so no Can view
member inherits a tab and with it owner recovery (8.9). Asserted on the stored rows and on the read.
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

  test('AC-1523: a tab alone takes no membership write, and a root write leaves the tabs as the root', async () => {
    const [owner, member, third] = (await cast.of(app)) as [Actor, Actor, Actor]
    const made = await owner.browser.json('/folders', 'POST', { name: 'ac1523 tab refusal', kind: null })
    expectStatus(made, 201, 'an unpicked project')
    const project = (made.json() as { id: string }).id
    expectStatus(await owner.browser.json(`/folders/${project}/tabs`, 'POST', { kind: 'usual' }), 201, 'the usual project')
    const results = String((await rows(app.db, sql`
      SELECT id FROM folders WHERE project_id = ${project}::uuid AND name = 'Results'`))[0]?.id)
    await connect(app.db, owner.id, member.id)
    await connect(app.db, owner.id, third.id)
    await addMemberOk(owner, project, member.id, 'can_edit')

    expectStatus(await removeMember(owner, results, member.id), 422, 'no removal from a tab alone')
    expectStatus(
      await owner.browser.json(`/folders/${results}/members/${member.id}`, 'PATCH', { access: 'can_view' }),
      422,
      'no preset change on a tab alone',
    )
    expectStatus(await member.browser.json(`/folders/${results}/my-membership`, 'DELETE'), 422, 'no leaving a tab alone')
    const invited = await owner.browser.json('/invites', 'POST', {
      email: 'ac1523-tab-invite@example.test',
      folder_id: results,
      access: 'can_view',
    })
    expectStatus(invited, 422, 'no invite to a tab alone')
    expect((await rows(app.db, sql`SELECT id FROM invites WHERE folder_id = ${results}::uuid`)).length).toBe(0)

    await addMemberOk(owner, project, third.id, 'can_view')
    expect(await presets(project, member.id)).toEqual([
      ['Purpose', 'can_edit'], ['ac1523 tab refusal', 'can_edit'], ['Results', 'can_edit'], ['Discussion', 'can_edit'],
    ])
    expect(await presets(project, third.id)).toEqual([
      ['Purpose', 'can_view'], ['ac1523 tab refusal', 'can_view'], ['Results', 'can_view'], ['Discussion', 'can_view'],
    ])
    expectStatus(await member.browser.json(`/folders/${results}/page`, 'GET'), 200, 'the member still reads Results')
  }, 60_000)

  test("AC-1523: a removed owner's tabs follow the root's heir, not their own earliest member", async () => {
    const [, , , leaver, heir, viewer] = (await cast.of(app)) as [Actor, Actor, Actor, Actor, Actor, Actor]
    const made = await leaver.browser.json('/folders', 'POST', { name: 'ac1523 heir', kind: null })
    expectStatus(made, 201, 'an unpicked project')
    const project = (made.json() as { id: string }).id
    expectStatus(await leaver.browser.json(`/folders/${project}/tabs`, 'POST', { kind: 'usual' }), 201, 'the usual project')
    await connect(app.db, leaver.id, heir.id)
    await connect(app.db, leaver.id, viewer.id)
    await addMemberOk(leaver, project, heir.id, 'full_control')
    await addMemberOk(leaver, project, viewer.id, 'can_view')
    // A tab whose rows order differently from the root's (as rows copied
    // without their join time did): the viewer looks earliest there.
    await app.db.execute(sql`UPDATE folder_members SET created_at = now() - interval '1 day'
      WHERE user_id = ${viewer.id}::uuid
        AND folder_id IN (SELECT id FROM folders WHERE project_id = ${project}::uuid AND id <> ${project}::uuid)`)

    // 8.10 step 2's automatic transfer: the interactive DELETE /me refuses a
    // shared project first, so this is the forced-removal path it keeps.
    await inTransaction(app.db, (tx) => deleteAccountData(tx, leaver.id))
    const owners = await rows(app.db, sql`
      SELECT DISTINCT owner_id FROM folders WHERE project_id = ${project}::uuid`)
    expect(owners).toEqual([{ owner_id: heir.id }])
  }, 60_000)
})
