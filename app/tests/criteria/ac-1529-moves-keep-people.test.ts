/*
AC-1529: moving a page between projects never widens or narrows who sees it
(step 8, spec 7.4). A move into a project whose owner or people (with their
presets) differ is refused with 422 and changes nothing, whoever asks; so a
Can edit member cannot take someone else's project. Between projects with the
same owner and people it moves, its tasks carry the new project, and a moved
project root's Responsibilities go with it, ended. A page moved out to the
Library becomes a project that keeps the people who saw it, each recorded as
added by the mover. Asserted on the stored rows.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { addMemberOk, Cast, connect, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'
import { createTaskOk } from '../support/tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member', 'stranger'], 'ac1529')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

async function subPage(actor: Actor, parent: string, name: string): Promise<string> {
  const made = await actor.browser.json('/folders', 'POST', { name, parent_folder_id: parent })
  expectStatus(made, 201, `a sub-page ${name}`)
  return (made.json() as { id: string }).id
}

describe('AC-1529 a moved page keeps who sees it honest', () => {
  test('AC-1529: a Can edit member cannot move a page into a project with other people', async () => {
    const [owner, member, stranger] = (await cast.of(app)) as [Actor, Actor, Actor]
    const theirs = await createFolder(owner, 'ac1529 theirs', 'doc')
    await connect(app.db, owner.id, member.id)
    await addMemberOk(owner, theirs, member.id, 'can_edit')
    const page = await subPage(owner, theirs, 'ac1529 theirs page')
    const hers = await createFolder(member, 'ac1529 hers', 'doc')
    await connect(app.db, member.id, stranger.id)
    await addMemberOk(member, hers, stranger.id, 'can_edit')
    const facts = sql`SELECT f.id, f.project_id, f.parent_folder_id, f.owner_id,
      (SELECT json_agg(m.user_id ORDER BY m.user_id) FROM folder_members m WHERE m.folder_id = f.id) AS people
      FROM folders f WHERE f.id IN (${theirs}::uuid, ${page}::uuid) ORDER BY f.id`
    const before = await rows(app.db, facts)

    for (const moved of [theirs, page]) {
      const refused = await member.browser.json(`/folders/${moved}/location`, 'PATCH', { parent_folder_id: hers })
      expectStatus(refused, 422, 'a move into a project with other people')
    }
    expect(await rows(app.db, facts)).toEqual(before)
    expectStatus(await owner.browser.json(`/folders/${page}`, 'GET'), 200, 'the owner keeps it')
    expectStatus(await stranger.browser.json(`/folders/${page}`, 'GET'), 404, 'the stranger never gains it')
  }, 60_000)

  test('AC-1529: between projects with the same people a root moves, its Responsibilities ended with it', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    const from = await createFolder(owner, 'ac1529 from', 'doc')
    const into = await createFolder(owner, 'ac1529 into', 'doc')
    await connect(app.db, owner.id, member.id)
    await addMemberOk(owner, from, member.id, 'can_edit')
    await addMemberOk(owner, into, member.id, 'can_edit')
    const task = await createTaskOk(owner, { title: 'ac1529 carried', folder_id: from, assignee_id: member.id }, 'a task')
    const [resp] = await rows(app.db, sql`INSERT INTO folder_responsibilities
      (folder_id, member_id, content, content_hash, current_revision_no, updated_by)
      VALUES (${from}::uuid, ${member.id}::uuid, '{"items":[]}'::jsonb, 'h', 1, ${owner.id}::uuid) RETURNING id`)

    expectStatus(
      await member.browser.json(`/folders/${from}/location`, 'PATCH', { parent_folder_id: into }),
      200,
      'moved between projects with the same people',
    )
    expect(await rows(app.db, sql`SELECT project_id, parent_folder_id FROM folders WHERE id = ${from}::uuid`)).toEqual([
      { project_id: into, parent_folder_id: into },
    ])
    expect(await rows(app.db, sql`SELECT project_id, assignee_id FROM tasks WHERE id = ${task.id}::uuid`)).toEqual([
      { project_id: into, assignee_id: member.id },
    ])
    expect(await rows(app.db, sql`SELECT folder_id, ended_at IS NOT NULL AS ended FROM folder_responsibilities
      WHERE id = ${String(resp?.id)}::uuid`)).toEqual([{ folder_id: into, ended: true }])
    expect(await rows(app.db, sql`SELECT folder_id, actor_id FROM folder_responsibility_history
      WHERE responsibility_id = ${String(resp?.id)}::uuid AND transition = 'responsibility_ended'`)).toEqual([
      { folder_id: into, actor_id: member.id },
    ])
    expectStatus(await member.browser.json(`/folders/${from}`, 'GET'), 200, 'the member still reads it')
  }, 60_000)

  test('AC-1529: out to the Library, a page keeps its people as a project of its own', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    const shared = await createFolder(owner, 'ac1529 library', 'doc')
    await connect(app.db, owner.id, member.id)
    await addMemberOk(owner, shared, member.id, 'can_comment')
    const page = await subPage(owner, shared, 'ac1529 leaving')
    const child = await subPage(owner, page, 'ac1529 leaving child')
    const task = await createTaskOk(owner, { title: 'ac1529 kept', folder_id: child, assignee_id: member.id }, 'a task for the member')

    expectStatus(
      await owner.browser.json(`/folders/${page}/location`, 'PATCH', { parent_folder_id: null }),
      200,
      'moved to the Library',
    )
    expect(await rows(app.db, sql`SELECT id, project_id, parent_folder_id FROM folders
      WHERE id IN (${page}::uuid, ${child}::uuid) ORDER BY parent_folder_id NULLS FIRST`)).toEqual([
      { id: page, project_id: page, parent_folder_id: null },
      { id: child, project_id: page, parent_folder_id: page },
    ])
    expect(await rows(app.db, sql`SELECT user_id, access FROM folder_members WHERE folder_id = ${page}::uuid
      ORDER BY access DESC`)).toEqual([
      { user_id: owner.id, access: 'full_control' },
      { user_id: member.id, access: 'can_comment' },
    ])
    expect(await rows(app.db, sql`SELECT member_id, actor_id, transition FROM folder_access_history
      WHERE folder_id = ${page}::uuid ORDER BY member_id`)).toEqual(
      [owner.id, member.id].sort().map((id) => ({ member_id: id, actor_id: owner.id, transition: 'member_added' })),
    )
    expect(await rows(app.db, sql`SELECT project_id, assignee_id FROM tasks WHERE id = ${task.id}::uuid`)).toEqual([
      { project_id: page, assignee_id: member.id },
    ])
    expectStatus(await member.browser.json(`/folders/${child}`, 'GET'), 200, 'the member still reads it')
  }, 60_000)
})
