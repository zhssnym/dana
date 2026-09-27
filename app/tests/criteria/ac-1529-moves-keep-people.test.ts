/*
AC-1529: moving a page between projects never widens or narrows who sees it
unseen (step 8, spec 4.5). Moved into another project, a task whose assignee
is not a member there is unassigned, and the task carries the new project; a
page moved out to the Library becomes a project that keeps the people who
saw it, each recorded as added by the mover. Asserted on the stored rows.
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
const cast = new Cast(['owner', 'member'], 'ac1529')

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
  test('AC-1529: into another project, an assignee who is not a member there is unassigned', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    const shared = await createFolder(owner, 'ac1529 shared', 'doc')
    const mine = await createFolder(owner, 'ac1529 mine', 'doc')
    await connect(app.db, owner.id, member.id)
    await addMemberOk(owner, shared, member.id, 'can_edit')
    const page = await subPage(owner, shared, 'ac1529 moving')
    const theirs = await createTaskOk(owner, { title: 'ac1529 theirs', folder_id: page, assignee_id: member.id }, 'a task for the member')
    const own = await createTaskOk(owner, { title: 'ac1529 own', folder_id: page, assignee_id: owner.id }, 'a task for the owner')

    expectStatus(
      await owner.browser.json(`/folders/${page}/location`, 'PATCH', { parent_folder_id: mine }),
      200,
      'moved into a project the member is not on',
    )
    expect(await rows(app.db, sql`SELECT id, project_id, assignee_id FROM tasks
      WHERE id IN (${theirs.id}::uuid, ${own.id}::uuid) ORDER BY title DESC`)).toEqual([
      { id: theirs.id, project_id: mine, assignee_id: null },
      { id: own.id, project_id: mine, assignee_id: owner.id },
    ])
    expectStatus(await member.browser.json(`/folders/${page}`, 'GET'), 404, 'the member no longer sees it')
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
