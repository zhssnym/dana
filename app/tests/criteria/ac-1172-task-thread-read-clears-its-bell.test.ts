/*
AC-1172: `PUT /tasks/:id/thread/read` clears the bell for that task's thread,
and only for it.

Hassan and Bilal are members of a Folder; Hassan made two Tasks, so Bilal's
post in each Task's thread notifies Hassan. After Hassan's PUT on the first:

- a `task_thread_reads` row for (first Task, Hassan) is stored, and none for
  Bilal;
- Hassan's notification for Bilal's post on the first Task has `read_at` set;
- Hassan's notification for Bilal's post on the second Task is still unread;
- the first PUT answers `read_at` null, and a second PUT answers the time
  the first stored.

Asserted on stored rows. Spec: 4.35 task_thread_reads, 7.28.
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
const cast = new Cast(['hassan', 'bilal'], 'ac1172')
const folders: string[] = []

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  for (const folderId of folders) {
    await app.db.execute(sql`DELETE FROM folders WHERE id = ${folderId}::uuid`)
  }
  await cast.cleanup(app.db)
  await app.close()
})

async function createTask(actor: Actor, folderId: string, title: string): Promise<string> {
  const made = await actor.browser.json('/tasks', 'POST', { title, folder_id: folderId })
  expectStatus(made, 201, 'POST /tasks creates the Task')
  return String((made.json() as { id?: unknown }).id)
}

async function postOnTask(actor: Actor, folderId: string, taskId: string, body: string): Promise<string> {
  const posted = await actor.browser.json(`/folders/${folderId}/comments?task=${taskId}`, 'POST', { body })
  expectStatus(posted, 201, 'POST /folders/:id/comments?task= posts in the Task thread')
  return String((posted.json() as { id?: unknown }).id)
}

async function notificationReadAt(userId: string, commentId: string): Promise<unknown[]> {
  const found = await rows(
    app.db,
    sql`SELECT n.read_at FROM notifications n JOIN events e ON e.id = n.event_id
         WHERE n.user_id = ${userId}::uuid AND e.subject_kind = 'comment'
           AND e.subject_id = ${commentId}::uuid`,
  )
  return found.map((row) => row.read_at)
}

describe('AC-1172 a task thread read clears its bell', () => {
  test("Hassan's PUT stores his row, clears that thread's notification, and no other", async () => {
    const [hassan, bilal] = (await cast.of(app)) as [Actor, Actor]
    await connect(app.db, hassan.id, bilal.id)
    const folderId = await createFolder(hassan, 'ac1172 folder')
    folders.push(folderId)
    await addMemberOk(hassan, folderId, bilal.id, 'can_edit')

    const taskId = await createTask(hassan, folderId, 'ac1172 book the hall')
    const otherTaskId = await createTask(hassan, folderId, 'ac1172 order chairs')
    const onTask = await postOnTask(bilal, folderId, taskId, 'ac1172 booked for Friday')
    const onOther = await postOnTask(bilal, folderId, otherTaskId, 'ac1172 forty chairs')

    expect(await notificationReadAt(hassan.id, onTask), "Hassan is told about Bilal's post, unread").toEqual([null])
    expect(await notificationReadAt(hassan.id, onOther), 'and about the other Task, unread').toEqual([null])

    const first = await hassan.browser.json(`/tasks/${taskId}/thread/read`, 'PUT')
    expectStatus(first, 200, 'PUT /tasks/:id/thread/read records the read')
    expect((first.json() as { read_at?: unknown }).read_at, 'never opened before').toBeNull()

    const stored = await rows(
      app.db,
      sql`SELECT user_id, read_at FROM task_thread_reads WHERE task_id = ${taskId}::uuid`,
    )
    expect(stored.map((row) => String(row.user_id)), "only Hassan's row is stored").toEqual([hassan.id])
    expect(stored[0]?.read_at).not.toBeNull()
    const firstReadAt = new Date(stored[0]?.read_at as string | Date).toISOString()

    const cleared = await notificationReadAt(hassan.id, onTask)
    expect(cleared, "Hassan's notification for this thread is marked read").toHaveLength(1)
    expect(cleared[0]).not.toBeNull()
    expect(await notificationReadAt(hassan.id, onOther), "the other Task's notification stays unread").toEqual([null])

    const again = await hassan.browser.json(`/tasks/${taskId}/thread/read`, 'PUT')
    expectStatus(again, 200, 'a second PUT records the read again')
    const previous = (again.json() as { read_at?: unknown }).read_at
    expect(typeof previous, 'the second PUT answers the first read').toBe('string')
    expect(new Date(String(previous)).toISOString()).toBe(firstReadAt)

    const after = await rows(
      app.db,
      sql`SELECT count(*)::int AS n FROM task_thread_reads
           WHERE task_id = ${taskId}::uuid AND user_id = ${hassan.id}::uuid`,
    )
    expect(Number(after[0]?.n), 'the second PUT updates the one row').toBe(1)
  })
})
