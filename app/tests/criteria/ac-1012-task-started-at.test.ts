/*
AC-1012: a task's In progress is `started_at`, written by an ordinary PATCH
(4.5, 7.6, migration 0036). PATCH { started_at: <instant> } answers 200 and
the instant rides the answered TaskDetail, a fresh GET /tasks/:id and the
folder's task-list card; PATCH { started_at: null } sends the task back to Not
started on all three. It is a `task.edit`: a stranger is 404 and a Can-view
member 403, and neither changes the row. Status stays the transitions' own
(409 on PATCH), and a transition leaves started_at where it was. The same
migration moves user_settings.task_open's default to 'panel' (4.10, 9.7).

Spec: 4.5, 7.0, 7.6.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  Cast,
  createFolder,
  seedMembership,
  seedTask,
} from '../support/folders-harness.js'
import { rows } from '../support/helpers.js'
import {
  patchTask,
  patchTaskOk,
  readTask,
  transitionOk,
} from '../support/tasks-harness.js'
import { folderOpen, middayZone } from '../support/views-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'viewer', 'stranger'], 'e4')
const tz = middayZone()

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

async function storedStartedAt(taskId: string): Promise<string | null> {
  const found = await rows(
    app.db,
    sql`SELECT started_at FROM tasks WHERE id = ${taskId}::uuid`,
  )
  const value = found[0]?.started_at
  if (value === null || value === undefined) return null
  return new Date(value as string | Date).toISOString()
}

describe('AC-1012: started_at is In progress', () => {
  test('AC-1012: PATCH sets and clears started_at, every read carries it, and only an editor may write it', async () => {
    const [owner, viewer, stranger] = await cast.of(app)
    if (owner === undefined || viewer === undefined || stranger === undefined) {
      throw new Error('cast must produce three actors')
    }
    const folderId = await createFolder(owner, 'e4 ac1012 board')
    await seedMembership(app.db, folderId, viewer.id, { access: 'can_view' })
    const taskId = await seedTask(app.db, { folderId, createdBy: owner.id })

    const fresh = await readTask(owner, taskId)
    expect(fresh.started_at, 'a task starts Not started').toBeNull()

    const instant = '2026-09-24T09:30:00.000Z'
    const patched = await patchTaskOk(
      owner,
      taskId,
      { started_at: instant },
      'PATCH { started_at } must answer 200 to an editor',
    )
    expect(patched.status).toBe('pending')
    expect(new Date(String(patched.started_at)).toISOString()).toBe(instant)
    expect(await storedStartedAt(taskId)).toBe(instant)

    const reread = await readTask(owner, taskId)
    expect(new Date(String(reread.started_at)).toISOString()).toBe(instant)

    const open = await folderOpen(owner, folderId, tz)
    const card = [...open.scheduled, ...open.unscheduled].find((c) => c.id === taskId)
    expect(card, 'the task must be on its folder list').toBeDefined()
    expect(new Date(String(card?.started_at)).toISOString()).toBe(instant)

    // Neither a stranger nor a Can-view member may move it.
    const strangerWrite = await patchTask(stranger, taskId, { started_at: null })
    expect(strangerWrite.status, 'a stranger is 404').toBe(404)
    const viewerWrite = await patchTask(viewer, taskId, { started_at: null })
    expect(viewerWrite.status, 'a Can-view member may not edit').toBe(403)
    expect(await storedStartedAt(taskId)).toBe(instant)

    // Status stays the transitions' own, and they leave started_at alone.
    const statusWrite = await patchTask(owner, taskId, { status: 'completed' })
    expect(statusWrite.status, 'status on PATCH is still 409').toBe(409)
    const done = await transitionOk(owner, taskId, 'complete', 'complete must answer 200')
    expect(done.task.status).toBe('completed')
    expect(new Date(String(done.task.started_at)).toISOString()).toBe(instant)
    const reopened = await transitionOk(owner, taskId, 'uncomplete', 'uncomplete must answer 200')
    expect(new Date(String(reopened.task.started_at)).toISOString()).toBe(instant)

    // Null is back to Not started, on the answer, the detail and the card.
    const cleared = await patchTaskOk(
      owner,
      taskId,
      { started_at: null },
      'PATCH { started_at: null } must answer 200',
    )
    expect(cleared.started_at).toBeNull()
    expect((await readTask(owner, taskId)).started_at).toBeNull()
    const after = await folderOpen(owner, folderId, tz)
    const clearedCard = [...after.scheduled, ...after.unscheduled].find(
      (c) => c.id === taskId,
    )
    expect(clearedCard?.started_at).toBeNull()
    expect(await storedStartedAt(taskId)).toBeNull()

    // A malformed instant is the validator's 422, not a stored value.
    const malformed = await patchTask(owner, taskId, { started_at: 'soon' })
    expect(malformed.status).toBe(422)
  })

  test('AC-1012: a freshly provisioned account opens tasks in the side peek (0036 reverses 0010)', async () => {
    const [owner] = await cast.of(app)
    if (owner === undefined) throw new Error('cast must produce an owner')
    const found = await rows(
      app.db,
      sql`SELECT task_open FROM user_settings WHERE user_id = ${owner.id}::uuid`,
    )
    expect(found[0]?.task_open).toBe('panel')
  })
})
