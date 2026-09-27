/*
AC-1530: the 10.3 cap counts projects. Step 8 gives a sub-page its project
owner's owner_id whoever makes it, so a Can edit member who adds sub-pages
to someone else's project must not use up that owner's cap. Goes red when
the cap counts sub-pages again: the member's page would make the owner's
200th row and the owner's own next project would answer 422.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { addMemberOk, Cast, connect, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member'], 'ac1530')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-1530 collaborators do not spend the owner\'s cap', () => {
  test('AC-1530: a member\'s sub-pages leave the owner able to make a project', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    const made = await owner.browser.json('/folders', 'POST', { name: 'ac1530 home', kind: 'doc' })
    expectStatus(made, 201, 'a project')
    const project = (made.json() as { id: string }).id
    await connect(app.db, owner.id, member.id)
    await addMemberOk(owner, project, member.id, 'can_edit')

    // The owner stands at 199 projects: this one and 198 more.
    await app.db.execute(sql`
      INSERT INTO folders (id, owner_id, name, project_id, kind, tab_position)
      SELECT g, ${owner.id}::uuid, 'ac1530 filler', g, 'doc', 'a0'
        FROM (SELECT gen_random_uuid() AS g FROM generate_series(1, 198)) s`)

    const sub = await member.browser.json('/folders', 'POST', { name: 'ac1530 by member', parent_folder_id: project })
    expectStatus(sub, 201, 'the member adds a sub-page')
    const subId = (sub.json() as { id: string }).id
    const stored = await rows(app.db, sql`SELECT owner_id, project_id FROM folders WHERE id = ${subId}::uuid`)
    expect(stored[0], 'the sub-page belongs to the owner\'s project').toMatchObject({ owner_id: owner.id, project_id: project })

    const mine = await owner.browser.json('/folders', 'POST', { name: 'ac1530 200th', kind: 'doc' })
    expectStatus(mine, 201, 'the owner\'s 200th project')
    const over = await owner.browser.json('/folders', 'POST', { name: 'ac1530 201st', kind: 'doc' })
    expectStatus(over, 422, 'the 201st project is over the cap')
    const count = await rows(app.db, sql`SELECT count(*)::int AS n FROM folders
      WHERE owner_id = ${owner.id}::uuid AND id = project_id AND NOT is_default AND deleted_at IS NULL`)
    expect(count[0]?.n, 'the refusal wrote nothing').toBe(200)
  }, 60_000)
})
