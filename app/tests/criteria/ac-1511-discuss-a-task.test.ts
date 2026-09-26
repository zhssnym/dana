/*
AC-1511 to AC-1513 (M5): a task's conversation is one Discussion of its
Folder, linked both ways.

- AC-1511: `POST /tasks/:id/discussion` finds or makes the task's one live
  Discussion (201 once, 200 after, one stored row); a stranger is 404 and a
  Can view member 403, neither storing a row; the task reads `discussion_id`;
  a post there reaches the task's creator.
- AC-1512: `PATCH /discussions/:id {task_id}` ("Turn into a task") stores the
  link; a task outside the Discussion's Folder is 422 and a task that already
  has a live Discussion is 409, the row unchanged either way.
- AC-1513: moving the task carries its Discussion and that Discussion's
  comments to the new Folder.

Asserted on stored rows. Spec: 4.31, 7.28.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
  expectStatus,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'talker', 'viewer', 'stranger'], 'ac1511')
const folders: string[] = []
let owner: Actor
let talker: Actor
let viewer: Actor
let stranger: Actor

beforeAll(async () => {
  app = await startAuthTestApp()
  ;[owner, talker, viewer, stranger] = (await cast.of(app)) as [Actor, Actor, Actor, Actor]
  await connect(app.db, owner.id, talker.id)
  await connect(app.db, owner.id, viewer.id)
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  for (const folderId of folders) {
    await app.db.execute(sql`DELETE FROM discussions WHERE folder_id = ${folderId}::uuid`)
    await app.db.execute(sql`DELETE FROM folders WHERE id = ${folderId}::uuid`)
  }
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

async function linked(taskId: string): Promise<Record<string, unknown>[]> {
  return rows(
    app.db,
    sql`SELECT id, folder_id, created_by, title FROM discussions WHERE task_id = ${taskId}::uuid`,
  )
}

describe('AC-1511 Discuss finds or makes the task\'s one Discussion', () => {
  test('201 then 200 with one stored row; strangers 404 and Can view 403 store nothing', async () => {
    const folderId = await folder(owner, 'ac1511 trip')
    await addMemberOk(owner, folderId, talker.id, 'can_comment')
    await addMemberOk(owner, folderId, viewer.id, 'can_view')
    const taskId = await task(owner, folderId, 'ac1511 book the van')

    expectStatus(
      await stranger.browser.json(`/tasks/${taskId}/discussion`, 'POST'),
      404,
      'a stranger',
    )
    expectStatus(
      await viewer.browser.json(`/tasks/${taskId}/discussion`, 'POST'),
      403,
      'Can view may not open one',
    )
    expect(await linked(taskId), 'neither stored a Discussion').toEqual([])

    const first = await talker.browser.json(`/tasks/${taskId}/discussion`, 'POST')
    expectStatus(first, 201, 'the first Discuss makes it')
    const made = (first.json() as { discussion: { id: string; task: unknown } }).discussion
    expect(made.task).toEqual({ id: taskId, title: 'ac1511 book the van', status: 'pending' })
    expect(await linked(taskId)).toEqual([
      { id: made.id, folder_id: folderId, created_by: talker.id, title: 'ac1511 book the van' },
    ])

    const again = await owner.browser.json(`/tasks/${taskId}/discussion`, 'POST')
    expectStatus(again, 200, 'the second Discuss finds it')
    expect((again.json() as { discussion: { id: string } }).discussion.id).toBe(made.id)
    const seen = await viewer.browser.json(`/tasks/${taskId}/discussion`, 'POST')
    expectStatus(seen, 200, 'Can view is shown the one that exists')
    expect(await linked(taskId), 'still one row').toHaveLength(1)

    // Nobody has written in it yet: the task links nothing and the list
    // skips it, so opening and leaving leaves no empty thread behind.
    const listed = async (): Promise<string[]> => {
      const list = await owner.browser.json(`/folders/${folderId}/discussions?state=all`, 'GET')
      expectStatus(list, 200, 'the list')
      return (list.json() as { discussions: { id: string }[] }).discussions.map((d) => d.id)
    }
    const linkOf = async (): Promise<unknown> => {
      const read = await owner.browser.json(`/tasks/${taskId}`, 'GET')
      expectStatus(read, 200, 'GET /tasks/:id')
      return (read.json() as { discussion_id?: unknown }).discussion_id
    }
    expect(await linkOf()).toBeNull()
    expect(await listed()).not.toContain(made.id)

    // A post there reaches the task's creator, who has not spoken yet.
    const posted = await talker.browser.json(`/discussions/${made.id}/comments`, 'POST', {
      body: 'ac1511 I can drive',
    })
    expectStatus(posted, 201, 'a post in the task Discussion')
    const postId = String((posted.json() as { id?: unknown }).id)
    expect(
      await rows(
        app.db,
        sql`SELECT n.user_id FROM notifications n JOIN events e ON e.id = n.event_id
             WHERE e.subject_kind = 'comment' AND e.subject_id = ${postId}::uuid`,
      ),
    ).toEqual([{ user_id: owner.id }])
    expect(await linkOf()).toBe(made.id)
    expect(await listed()).toContain(made.id)

    // Its task in Trash, the thread still says it is linked, so "Turn into
    // a task" is not offered; only the task itself is withheld.
    expectStatus(await owner.browser.json(`/tasks/${taskId}`, 'DELETE'), 204, 'trash the linked task')
    const orphan = await owner.browser.json(`/discussions/${made.id}`, 'GET')
    expectStatus(orphan, 200, 'GET the thread')
    expect(orphan.json()).toMatchObject({ task_id: taskId, task: null })

    // A trashed task is 404, and makes nothing.
    const other = await task(owner, folderId, 'ac1511 gone')
    expectStatus(await owner.browser.json(`/tasks/${other}`, 'DELETE'), 204, 'trash the task')
    expectStatus(
      await owner.browser.json(`/tasks/${other}/discussion`, 'POST'),
      404,
      'a trashed task',
    )
    expect(await linked(other)).toEqual([])
  })
})

describe('AC-1512 Turn into a task links the Discussion to the task', () => {
  test('stores task_id; another Folder\'s task is 422 and a second link 409, unchanged', async () => {
    const folderId = await folder(owner, 'ac1512 plans')
    const elsewhere = await folder(owner, 'ac1512 elsewhere')
    const strangersFolder = await folder(stranger, 'ac1512 strangers')
    const started = await owner.browser.json(`/folders/${folderId}/discussions`, 'POST', {
      title: 'ac1512 where do we sleep',
    })
    expectStatus(started, 201, 'a Discussion')
    const discussionId = String((started.json() as { id?: unknown }).id)
    const taskId = await task(owner, folderId, 'ac1512 book the hut')
    const foreign = await task(owner, elsewhere, 'ac1512 not here')
    const strangers = await task(stranger, strangersFolder, 'ac1512 private')

    for (const [other, why] of [
      [foreign, "a task of the owner's other Folder"],
      [strangers, "a stranger's task"],
    ] as const) {
      expectStatus(
        await owner.browser.json(`/discussions/${discussionId}`, 'PATCH', { task_id: other }),
        422,
        why,
      )
    }
    const stored = async (): Promise<unknown> =>
      (
        await rows(app.db, sql`SELECT task_id FROM discussions WHERE id = ${discussionId}::uuid`)
      )[0]?.task_id
    expect(await stored(), 'refusals left the row unlinked').toBeNull()

    const patched = await owner.browser.json(`/discussions/${discussionId}`, 'PATCH', {
      task_id: taskId,
    })
    expectStatus(patched, 200, 'the link')
    expect((patched.json() as { task?: { id?: unknown } }).task?.id).toBe(taskId)
    expect(await stored()).toBe(taskId)
    const read = await owner.browser.json(`/tasks/${taskId}`, 'GET')
    expect((read.json() as { discussion_id?: unknown }).discussion_id).toBe(discussionId)

    const second = await owner.browser.json(`/folders/${folderId}/discussions`, 'POST', {
      title: 'ac1512 second',
    })
    const secondId = String((second.json() as { id?: unknown }).id)
    expectStatus(
      await owner.browser.json(`/discussions/${secondId}`, 'PATCH', { task_id: taskId }),
      409,
      'the task already has a live Discussion',
    )
    expect(
      (await rows(app.db, sql`SELECT task_id FROM discussions WHERE id = ${secondId}::uuid`))[0]
        ?.task_id,
    ).toBeNull()
  })
})

describe('AC-1513 a moved task takes its Discussion along', () => {
  test('the Discussion and its comments land in the new Folder', async () => {
    const from = await folder(owner, 'ac1513 from')
    const to = await folder(owner, 'ac1513 to')
    const taskId = await task(owner, from, 'ac1513 moving')
    const made = await owner.browser.json(`/tasks/${taskId}/discussion`, 'POST')
    const discussionId = (made.json() as { discussion: { id: string } }).discussion.id
    expectStatus(
      await owner.browser.json(`/discussions/${discussionId}/comments`, 'POST', {
        body: 'ac1513 before the move',
      }),
      201,
      'a post',
    )
    expectStatus(
      await owner.browser.json(`/tasks/${taskId}`, 'PATCH', { folder_id: to }),
      200,
      'the move',
    )
    expect(
      await rows(app.db, sql`SELECT folder_id FROM discussions WHERE id = ${discussionId}::uuid`),
    ).toEqual([{ folder_id: to }])
    expect(
      await rows(
        app.db,
        sql`SELECT DISTINCT folder_id FROM comments WHERE discussion_id = ${discussionId}::uuid`,
      ),
    ).toEqual([{ folder_id: to }])
  })
})
