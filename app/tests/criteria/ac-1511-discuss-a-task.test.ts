/*
Issue #497 replaces M5's singular task-thread ownership with a persisted
many-to-many Discussion ↔ Task reference. These acceptance checks keep the
old create-new convenience while proving the new relation, lifecycle and
move semantics through the HTTP contract and stored rows.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, addMemberOk, connect, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'editor', 'stranger'], 'ac1511')
const folders: string[] = []
let owner: Actor
let editor: Actor
let stranger: Actor

beforeAll(async () => {
  app = await startAuthTestApp()
  ;[owner, editor, stranger] = (await cast.of(app)) as [Actor, Actor, Actor]
  await connect(app.db, owner.id, editor.id)
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  for (const folderId of folders) await app.db.execute(sql`DELETE FROM folders WHERE id = ${folderId}::uuid`)
  await cast.cleanup(app.db)
  await app.close()
})

async function folder(actor: Actor, name: string): Promise<string> {
  const id = await createFolder(actor, name)
  folders.push(id)
  return id
}

async function task(actor: Actor, folderId: string, title: string): Promise<string> {
  const made = await actor.browser.json('/tasks', 'POST', { title, folder_id: folderId })
  expectStatus(made, 201, 'POST /tasks')
  return String((made.json() as { id?: unknown }).id)
}

async function discussion(actor: Actor, folderId: string, title: string): Promise<string> {
  const made = await actor.browser.json(`/folders/${folderId}/discussions`, 'POST', { title })
  expectStatus(made, 201, 'POST Discussion')
  return String((made.json() as { id?: unknown }).id)
}

async function edges(): Promise<Array<{ discussion_id: string; task_id: string; created_via_task: boolean }>> {
  return rows(app.db, sql`SELECT discussion_id, task_id, created_via_task FROM discussion_tasks ORDER BY discussion_id, task_id`) as Promise<Array<{ discussion_id: string; task_id: string; created_via_task: boolean }>>
}

describe('AC-1511 / #497 plural Discussion ↔ Task relation', () => {
  test('one Discussion links many Tasks and one Task links many Discussions; duplicate link is idempotent', async () => {
    const folderId = await folder(owner, 'ac1511 plural')
    await addMemberOk(owner, folderId, editor.id, 'can_edit')
    const firstTask = await task(owner, folderId, 'first linked task')
    const secondTask = await task(owner, folderId, 'second linked task')
    const firstDiscussion = await discussion(owner, folderId, 'first discussion')
    const secondDiscussion = await discussion(owner, folderId, 'second discussion')

    const a = await owner.browser.json(`/discussions/${firstDiscussion}/tasks`, 'POST', { task_id: firstTask })
    expectStatus(a, 201, 'new edge')
    expect((a.json() as { created?: unknown }).created).toBe(true)
    const duplicate = await owner.browser.json(`/discussions/${firstDiscussion}/tasks`, 'POST', { task_id: firstTask })
    expectStatus(duplicate, 200, 'duplicate edge')
    expect((duplicate.json() as { created?: unknown }).created).toBe(false)
    expectStatus(await owner.browser.json(`/discussions/${firstDiscussion}/tasks`, 'POST', { task_id: secondTask }), 201, 'one Discussion to another Task')
    expectStatus(await owner.browser.json(`/discussions/${secondDiscussion}/tasks`, 'POST', { task_id: firstTask }), 201, 'another Discussion to same Task')

    expect((await rows(app.db, sql`SELECT count(*)::int AS n FROM discussion_tasks WHERE discussion_id = ${firstDiscussion}::uuid AND task_id = ${firstTask}::uuid`))[0]?.n).toBe(1)

    const readDiscussion = await owner.browser.json(`/discussions/${firstDiscussion}`, 'GET')
    expectStatus(readDiscussion, 200, 'Discussion detail')
    expect((readDiscussion.json() as { linked_tasks: Array<{ id: string }> }).linked_tasks.map((item) => item.id).sort()).toEqual([firstTask, secondTask].sort())

    const readTask = await owner.browser.json(`/tasks/${firstTask}`, 'GET')
    expectStatus(readTask, 200, 'Task detail')
    expect((readTask.json() as { linked_discussions: Array<{ id: string }> }).linked_discussions.map((item) => item.id).sort()).toEqual([firstDiscussion, secondDiscussion].sort())
  })

  test('explicit unlink removes only the edge and is idempotent', async () => {
    const folderId = await folder(owner, 'ac1511 unlink')
    const taskId = await task(owner, folderId, 'unlink task')
    const discussionId = await discussion(owner, folderId, 'unlink discussion')
    expectStatus(await owner.browser.json(`/discussions/${discussionId}/tasks`, 'POST', { task_id: taskId }), 201, 'link')

    expectStatus(await owner.browser.json(`/discussions/${discussionId}/tasks/${taskId}`, 'DELETE'), 204, 'unlink')
    expectStatus(await owner.browser.json(`/discussions/${discussionId}/tasks/${taskId}`, 'DELETE'), 204, 'repeat unlink')
    expect(await rows(app.db, sql`SELECT 1 FROM discussion_tasks WHERE discussion_id = ${discussionId}::uuid AND task_id = ${taskId}::uuid`)).toEqual([])
    expect(await rows(app.db, sql`SELECT 1 FROM discussions WHERE id = ${discussionId}::uuid`)).toHaveLength(1)
    expect(await rows(app.db, sql`SELECT 1 FROM tasks WHERE id = ${taskId}::uuid`)).toHaveLength(1)
  })

  test('authorization hides inaccessible Discussions and resolved Discussions refuse relation edits', async () => {
    const folderId = await folder(owner, 'ac1511 permissions')
    const taskId = await task(owner, folderId, 'permission task')
    const discussionId = await discussion(owner, folderId, 'permission discussion')
    expectStatus(await stranger.browser.json(`/discussions/${discussionId}/tasks`, 'POST', { task_id: taskId }), 404, 'stranger link')
    expectStatus(await stranger.browser.json(`/discussions/${discussionId}/tasks/${taskId}`, 'DELETE'), 404, 'stranger unlink')

    expectStatus(await owner.browser.json(`/discussions/${discussionId}/resolve`, 'POST', { statement: 'decided' }), 200, 'resolve')
    expectStatus(await owner.browser.json(`/discussions/${discussionId}/tasks`, 'POST', { task_id: taskId }), 409, 'resolved link')
  })

  test('soft Trash preserves relation rows; restore re-exposes readable live endpoints; purge cascades the edge only', async () => {
    const folderId = await folder(owner, 'ac1511 lifecycle')
    const taskId = await task(owner, folderId, 'lifecycle task')
    const discussionId = await discussion(owner, folderId, 'lifecycle discussion')
    expectStatus(await owner.browser.json(`/discussions/${discussionId}/tasks`, 'POST', { task_id: taskId }), 201, 'link')

    expectStatus(await owner.browser.json(`/tasks/${taskId}`, 'DELETE'), 204, 'trash task')
    expect(await rows(app.db, sql`SELECT 1 FROM discussion_tasks WHERE discussion_id = ${discussionId}::uuid AND task_id = ${taskId}::uuid`)).toHaveLength(1)
    const hidden = await owner.browser.json(`/discussions/${discussionId}`, 'GET')
    expect((hidden.json() as { linked_tasks: unknown[] }).linked_tasks).toEqual([])

    expectStatus(await owner.browser.json(`/tasks/${taskId}/restore`, 'POST'), 200, 'restore task')
    const restored = await owner.browser.json(`/discussions/${discussionId}`, 'GET')
    expect((restored.json() as { linked_tasks: Array<{ id: string }> }).linked_tasks.map((item) => item.id)).toContain(taskId)

    expectStatus(await owner.browser.json(`/tasks/${taskId}`, 'DELETE'), 204, 'trash task for purge')
    expectStatus(await owner.browser.json(`/trash/tasks/${taskId}`, 'DELETE'), 204, 'purge task')
    expect(await rows(app.db, sql`SELECT 1 FROM discussion_tasks WHERE discussion_id = ${discussionId}::uuid AND task_id = ${taskId}::uuid`)).toEqual([])
    expect(await rows(app.db, sql`SELECT 1 FROM discussions WHERE id = ${discussionId}::uuid`)).toHaveLength(1)
  })

  test('moving a Task keeps the Discussion in its original Folder and leaves a removable durable edge', async () => {
    const from = await folder(owner, 'ac1511 move from')
    const to = await folder(owner, 'ac1511 move to')
    const taskId = await task(owner, from, 'moving task')
    const discussionId = await discussion(owner, from, 'stationary discussion')
    expectStatus(await owner.browser.json(`/discussions/${discussionId}/tasks`, 'POST', { task_id: taskId }), 201, 'link')
    expectStatus(await owner.browser.json(`/tasks/${taskId}`, 'PATCH', { folder_id: to }), 200, 'move task')

    expect((await rows(app.db, sql`SELECT folder_id FROM discussions WHERE id = ${discussionId}::uuid`))[0]?.folder_id).toBe(from)
    expect(await rows(app.db, sql`SELECT 1 FROM discussion_tasks WHERE discussion_id = ${discussionId}::uuid AND task_id = ${taskId}::uuid`)).toHaveLength(1)
    expectStatus(await owner.browser.json(`/discussions/${discussionId}/tasks/${taskId}`, 'DELETE'), 204, 'unlink moved task')
  })
})

describe('AC-1512 / #497 create-new compatibility', () => {
  test('Start a discussion creates/reuses only its task-origin Discussion and stores a relation edge', async () => {
    const folderId = await folder(owner, 'ac1512 task origin')
    const taskId = await task(owner, folderId, 'origin task')
    const unrelated = await discussion(owner, folderId, 'unrelated')
    expectStatus(await owner.browser.json(`/discussions/${unrelated}/tasks`, 'POST', { task_id: taskId }), 201, 'ordinary link does not claim the helper')

    const first = await owner.browser.json(`/tasks/${taskId}/discussion`, 'POST')
    expectStatus(first, 201, 'create task-origin Discussion')
    const madeId = (first.json() as { discussion: { id: string } }).discussion.id
    const again = await owner.browser.json(`/tasks/${taskId}/discussion`, 'POST')
    expectStatus(again, 200, 'reuse task-origin Discussion')
    expect((again.json() as { discussion: { id: string } }).discussion.id).toBe(madeId)

    expect((await rows(app.db, sql`SELECT created_via_task FROM discussion_tasks WHERE discussion_id = ${madeId}::uuid AND task_id = ${taskId}::uuid`))[0]?.created_via_task).toBe(true)
  })

  test('creating a task from a Discussion stays compatible through PATCH task_id, which adds rather than replaces', async () => {
    const folderId = await folder(owner, 'ac1512 discussion origin')
    const discussionId = await discussion(owner, folderId, 'turn into task')
    const firstTask = await task(owner, folderId, 'created from discussion')
    const secondTask = await task(owner, folderId, 'also linked')

    expectStatus(await owner.browser.json(`/discussions/${discussionId}`, 'PATCH', { task_id: firstTask }), 200, 'legacy create-new link')
    expectStatus(await owner.browser.json(`/discussions/${discussionId}`, 'PATCH', { task_id: secondTask }), 200, 'second compatibility link')
    const read = await owner.browser.json(`/discussions/${discussionId}`, 'GET')
    expect((read.json() as { linked_tasks: Array<{ id: string }> }).linked_tasks.map((item) => item.id).sort()).toEqual([firstTask, secondTask].sort())
  })
})
