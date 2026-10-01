import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, addMemberOk, connect, createFolder, expectStatus, removeMember } from '../support/folders-harness.js'
import { createTaskOk, readTask } from '../support/tasks-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'alex', 'sam'], 'ac1536')

beforeAll(async () => { app = await startAuthTestApp() }, 60_000)
afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

test('AC-1536 adds a second assignee, keeps the first, and removes only the departing member', async () => {
  const [owner, alex, sam] = await cast.of(app)
  if (!owner || !alex || !sam) throw new Error('three actors are required')
  const folderId = await createFolder(owner, 'shared task')
  await connect(app.db, owner.id, alex.id)
  await connect(app.db, owner.id, sam.id)
  await addMemberOk(owner, folderId, alex.id)
  await addMemberOk(owner, folderId, sam.id, 'assigned_work')

  const task = await createTaskOk(owner, {
    title: 'Pack together', folder_id: folderId, assignee_id: alex.id,
    start_date: new Date().toISOString().slice(0, 10),
  }, 'a task starts with one assignee')
  expectStatus(await owner.browser.json(`/tasks/${task.id}`, 'PATCH', {
    assignee_ids: [alex.id, randomUUID()],
  }), 422, 'a non-member cannot be added')
  expect((await readTask(owner, task.id)).assignees.map((person) => person.id))
    .toEqual([alex.id])
  expectStatus(await owner.browser.json(`/tasks/${task.id}`, 'PATCH', {
    assignee_add_id: randomUUID(),
  }), 422, 'an atomic add still requires folder membership')
  const changed = await owner.browser.json(`/tasks/${task.id}`, 'PATCH', {
    assignee_add_id: sam.id,
  })
  expectStatus(changed, 200, 'the owner adds a second assignee')
  expect((changed.json() as { assignees: { id: string }[] }).assignees.map((person) => person.id))
    .toEqual([alex.id, sam.id])
  const stored = await rows(app.db, sql`SELECT assignee_id, assignee_ids FROM tasks WHERE id = ${task.id}::uuid`)
  expect(stored[0]?.assignee_id).toBe(alex.id)
  expect(stored[0]?.assignee_ids).toEqual([alex.id, sam.id])
  expect((await readTask(sam, task.id)).assignees.map((person) => person.id))
    .toEqual([alex.id, sam.id])
  expectStatus(await owner.browser.json(`/tasks/${task.id}`, 'PATCH', {
    assignee_ids: [alex.id, alex.id],
  }), 422, 'an assignee cannot be repeated')
  expect((await readTask(owner, task.id)).assignees.map((person) => person.id))
    .toEqual([alex.id, sam.id])
  expectStatus(await owner.browser.json(`/tasks/${task.id}`, 'PATCH', {
    assignee_remove_id: sam.id,
  }), 200, 'removing one assignee keeps the other')
  expect((await readTask(owner, task.id)).assignees.map((person) => person.id))
    .toEqual([alex.id])
  expectStatus(await owner.browser.json(`/tasks/${task.id}`, 'PATCH', {
    assignee_add_id: sam.id,
  }), 200, 'adding the second assignee restores both')
  const day = await sam.browser.api('/views/my-day?tz=UTC')
  expectStatus(day, 200, 'the second assignee reads their Today view')
  expect((day.json() as { today: { id: string }[] }).today.some((row) => row.id === task.id))
    .toBe(true)
  expectStatus(await sam.browser.json(`/tasks/${task.id}/complete`, 'POST', {}), 200,
    'the second assignee may complete assigned work')

  expectStatus(await removeMember(owner, folderId, alex.id), 204,
    'the owner removes one assignee from the folder')
  const after = await readTask(sam, task.id)
  expect(after.assignees.map((person) => person.id)).toEqual([sam.id])
  const remaining = await rows(app.db, sql`SELECT assignee_id, assignee_ids FROM tasks WHERE id = ${task.id}::uuid`)
  expect(remaining[0]?.assignee_id).toBe(sam.id)
  expect(remaining[0]?.assignee_ids).toEqual([sam.id])
})
