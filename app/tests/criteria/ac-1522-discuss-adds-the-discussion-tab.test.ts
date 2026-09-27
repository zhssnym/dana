/*
AC-1522: Discuss on a task in a project with no Discussion tab adds that tab
(one, however often it is pressed) and answers its id beside the thread, and
the tab lists the project's threads though they live on other pages (spec
7.28, 4.3). A member of a sub-page who cannot see the project root adds no
tab there and is never answered its id. Asserted on the stored rows.
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
const cast = new Cast(['owner', 'outsider'], 'ac1522')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-1522 Discuss adds the Discussion tab', () => {
  test('AC-1522: the first Discuss adds the tab, the second finds it, and the tab lists the thread', async () => {
    const [owner] = (await cast.of(app)) as [Actor, Actor]
    const project = await createFolder(owner, 'ac1522 plans', 'doc')
    const sub = await owner.browser.json('/folders', 'POST', { name: 'ac1522 sub', parent_folder_id: project })
    expectStatus(sub, 201, 'a sub-page')
    const subId = (sub.json() as { id: string }).id
    const task = await createTaskOk(owner, { title: 'ac1522 book the hut', folder_id: subId }, 'a task on the sub-page')
    const discussionTabs = () => rows(app.db, sql`
      SELECT id, name, tab_position FROM folders
       WHERE project_id = ${project}::uuid AND kind = 'discussion'`)
    expect(await discussionTabs()).toEqual([])

    const first = await owner.browser.json(`/tasks/${task.id}/discussion`, 'POST')
    expectStatus(first, 201, 'Discuss starts the thread')
    const answer = first.json() as { discussion: { id: string; folder_id: string }; discussion_tab_id: string }
    const tabs = await discussionTabs()
    expect(tabs).toEqual([{ id: answer.discussion_tab_id, name: 'Discussion', tab_position: 'a1' }])
    expect(answer.discussion.folder_id, 'the thread stays on the task page').toBe(subId)

    const again = await owner.browser.json(`/tasks/${task.id}/discussion`, 'POST')
    expectStatus(again, 200, 'Discuss again finds the thread')
    expect((again.json() as { discussion_tab_id: string }).discussion_tab_id).toBe(answer.discussion_tab_id)
    expect(await discussionTabs(), 'still one Discussion tab').toEqual(tabs)

    // A thread started on the sub-page is listed on the project's tab. (A
    // task's thread is listed once somebody posts in it.)
    const started = await owner.browser.json(`/folders/${subId}/discussions`, 'POST', { title: 'ac1522 which hut' })
    expectStatus(started, 201, 'a thread on the sub-page')
    const threadId = (started.json() as { id: string }).id
    const listed = await owner.browser.json(`/folders/${answer.discussion_tab_id}/discussions`, 'GET')
    expectStatus(listed, 200, 'the Discussion tab lists the project')
    expect((listed.json() as { discussions: { id: string }[] }).discussions.map((d) => d.id)).toContain(threadId)
  }, 60_000)

  test("AC-1522: a sub-page's member who cannot see the root adds no tab and learns no id", async () => {
    const [owner, outsider] = (await cast.of(app)) as [Actor, Actor]
    const project = await createFolder(owner, 'ac1522 hidden root')
    const sub = await owner.browser.json('/folders', 'POST', { name: 'ac1522 shared sub', parent_folder_id: project })
    expectStatus(sub, 201, 'a sub-page')
    const subId = (sub.json() as { id: string }).id
    await connect(app.db, owner.id, outsider.id)
    await addMemberOk(owner, subId, outsider.id, 'can_edit')
    const task = await createTaskOk(owner, { title: 'ac1522 fix the gate', folder_id: subId }, 'a task on the sub-page')

    const discussed = await outsider.browser.json(`/tasks/${task.id}/discussion`, 'POST')
    expectStatus(discussed, 201, 'the sub-page member starts the thread')
    expect((discussed.json() as { discussion_tab_id: unknown }).discussion_tab_id).toBeNull()
    expect(await rows(app.db, sql`SELECT id FROM folders
      WHERE project_id = ${project}::uuid AND kind = 'discussion'`), 'no tab added to a root they cannot see').toEqual([])

    // Once the owner has added it, the outsider is still not told its id.
    const added = await owner.browser.json(`/tasks/${task.id}/discussion`, 'POST')
    expectStatus(added, 200, 'the owner finds the thread')
    expect((added.json() as { discussion_tab_id: unknown }).discussion_tab_id).toEqual(expect.any(String))
    const again = await outsider.browser.json(`/tasks/${task.id}/discussion`, 'POST')
    expectStatus(again, 200, 'the outsider finds the thread')
    expect((again.json() as { discussion_tab_id: unknown }).discussion_tab_id).toBeNull()
  }, 60_000)
})
