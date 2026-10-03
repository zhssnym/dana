/*
AC-1522: Discuss on a task in a project with no Discussion tab adds that tab
(one, however often it is pressed) and answers its id beside the thread, and
the tab lists the project's threads though they live on other pages (spec
7.28, 4.3). Asserted on the stored rows. (Since step 8 nobody sees a
sub-page without its project root, so the case of one who did is gone.)
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
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

  test('an existing Discussion-tab thread links to a readable Task elsewhere in the same project', async () => {
    const [owner] = (await cast.of(app)) as [Actor, Actor]
    const project = await createFolder(owner, 'ac1522 cross-tab link', 'doc')
    const sub = await owner.browser.json('/folders', 'POST', { name: 'ac1522 work page', parent_folder_id: project })
    expectStatus(sub, 201, 'a project page')
    const subId = (sub.json() as { id: string }).id
    const task = await createTaskOk(owner, { title: 'ac1522 linked task', folder_id: subId }, 'task on another project page')

    const discussed = await owner.browser.json(`/tasks/${task.id}/discussion`, 'POST')
    expectStatus(discussed, 201, 'create the project Discussion tab')
    const tabId = (discussed.json() as { discussion_tab_id: string }).discussion_tab_id

    const started = await owner.browser.json(`/folders/${tabId}/discussions`, 'POST', { title: 'ac1522 standalone thread' })
    expectStatus(started, 201, 'thread created on Discussion tab')
    const threadId = (started.json() as { id: string }).id

    const linked = await owner.browser.json(`/discussions/${threadId}/tasks`, 'POST', { task_id: task.id })
    expectStatus(linked, 201, 'cross-tab relation inside one project')
    expect((linked.json() as { discussion: { linked_tasks: Array<{ id: string }> } }).discussion.linked_tasks.map((item) => item.id)).toContain(task.id)

    const otherProject = await createFolder(owner, 'ac1522 other project', 'doc')
    const otherTask = await createTaskOk(owner, { title: 'ac1522 foreign task', folder_id: otherProject }, 'task in another project')
    expectStatus(
      await owner.browser.json(`/discussions/${threadId}/tasks`, 'POST', { task_id: otherTask.id }),
      422,
      'a readable task from another project is still outside the relation scope',
    )
  }, 60_000)
})
