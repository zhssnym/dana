/*
AC-423 / issue #487: Start has a real persisted optional wall-clock endpoint
without changing Due's existing reminder, recurrence or overdue semantics.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import {
  asRecord,
  createTask,
  createTaskOk,
  patchTask,
  patchTaskOk,
  readTask,
  reminderRow,
  requireTaskRow,
} from '../support/tasks-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac423')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

function errorText(value: unknown): string {
  return JSON.stringify(value)
}

describe('AC-423: persisted Start endpoint time', () => {
  test('create/read/PATCH persist start_time and date-only tasks stay date-only', async () => {
    const [owner] = await cast.of(app)
    if (owner === undefined) throw new Error('cast must produce an owner')
    const folderId = await createFolder(owner, 'ac423 persistence')

    const made = await createTaskOk(owner, {
      title: 'ac423 timed start', folder_id: folderId,
      start_date: '2026-10-10', start_time: '09:30',
    }, 'a Start-only task may carry a Start time')
    expect(made.start_date).toBe('2026-10-10')
    expect(made.start_time).toBe('09:30')
    expect(made.due_date).toBeNull()
    expect(made.due_time).toBeNull()
    const row = await requireTaskRow(app.db, made.id)
    expect(row.start_date).toBe('2026-10-10')
    expect(row.start_time).toBe('09:30:00')
    expect((await readTask(owner, made.id)).start_time).toBe('09:30')

    const patched = await patchTaskOk(owner, made.id, { start_time: '10:15:00' },
      'PATCH persists Start time against the stored Start date')
    expect(patched.start_time).toBe('10:15')
    expect((await requireTaskRow(app.db, made.id)).start_time).toBe('10:15:00')

    const dateOnly = await createTaskOk(owner, {
      title: 'ac423 date only', folder_id: folderId, start_date: '2026-10-11',
    }, 'a date-only Start remains valid')
    expect(dateOnly.start_time).toBeNull()
    expect((await requireTaskRow(app.db, dateOnly.id)).start_time).toBeNull()
  })

  test('start_time requires Start date and clearing Start clears its time atomically', async () => {
    const [owner] = await cast.of(app)
    if (owner === undefined) throw new Error('cast must produce an owner')
    const folderId = await createFolder(owner, 'ac423 dependency')

    const noDate = await createTask(owner, {
      title: 'ac423 no date', folder_id: folderId, start_time: '09:00',
    })
    expectStatus(noDate, 422, 'start_time without start_date is invalid')
    expect(errorText(noDate.json())).toContain('start_time')

    const task = await createTaskOk(owner, {
      title: 'ac423 clear start', folder_id: folderId,
      start_date: '2026-10-12', start_time: '08:00',
      due_date: '2026-10-13', due_time: '17:00',
    }, 'the two endpoints may both be timed')

    const contradiction = await patchTask(owner, task.id, {
      start_date: null, start_time: '10:00',
    })
    expectStatus(contradiction, 422, 'a body cannot clear Start and set Start time')
    expect(errorText(contradiction.json())).toContain('start_time')
    expect((await requireTaskRow(app.db, task.id)).start_time).toBe('08:00:00')

    const cleared = await patchTaskOk(owner, task.id, { start_date: null },
      'clearing Start clears only the Start endpoint')
    expect(cleared.start_date).toBeNull()
    expect(cleared.start_time).toBeNull()
    expect(cleared.due_date).toBe('2026-10-13')
    expect(cleared.due_time).toBe('17:00')
    const row = await requireTaskRow(app.db, task.id)
    expect(row.start_date).toBeNull()
    expect(row.start_time).toBeNull()
    expect(row.due_date).toBe('2026-10-13')
    expect(row.due_time).toBe('17:00:00')
  })

  test('same-day explicit endpoint times are ordered against merged PATCH state', async () => {
    const [owner] = await cast.of(app)
    if (owner === undefined) throw new Error('cast must produce an owner')
    const folderId = await createFolder(owner, 'ac423 order')

    const badCreate = await createTask(owner, {
      title: 'ac423 bad create', folder_id: folderId,
      start_date: '2026-10-14', start_time: '18:00',
      due_date: '2026-10-14', due_time: '17:00',
    })
    expectStatus(badCreate, 422, 'same-day Start time after Due time is invalid')
    expect(errorText(badCreate.json())).toContain('start_time')

    const task = await createTaskOk(owner, {
      title: 'ac423 ordered', folder_id: folderId,
      start_date: '2026-10-14', start_time: '09:00',
      due_date: '2026-10-14', due_time: '17:00',
    }, 'an ordered same-day window is valid')

    const badStart = await patchTask(owner, task.id, { start_time: '18:00' })
    expectStatus(badStart, 422, 'PATCH start_time is checked against stored due_time')
    expect(errorText(badStart.json())).toContain('start_time')
    expect((await requireTaskRow(app.db, task.id)).start_time).toBe('09:00:00')

    const badDue = await patchTask(owner, task.id, { due_time: '08:00' })
    expectStatus(badDue, 422, 'PATCH due_time is checked against stored start_time')
    expect(errorText(badDue.json())).toContain('due_time')
    expect((await requireTaskRow(app.db, task.id)).due_time).toBe('17:00:00')

    const crossDay = await patchTaskOk(owner, task.id, {
      due_date: '2026-10-15', due_time: '08:00',
    }, 'clock ordering does not compare endpoints on different dates')
    expect(crossDay.start_time).toBe('09:00')
    expect(crossDay.due_time).toBe('08:00')

    const collapse = await patchTask(owner, task.id, { due_date: '2026-10-14' })
    expectStatus(collapse, 422, 'moving a date can make stored endpoint times invalid')
    expect(errorText(collapse.json())).toContain('due_date')
  })

  test('Start time does not recompute Due reminders and recurrence remains Due-anchored', async () => {
    const [owner] = await cast.of(app)
    if (owner === undefined) throw new Error('cast must produce an owner')
    const folderId = await createFolder(owner, 'ac423 due semantics')

    const task = await createTaskOk(owner, {
      title: 'ac423 reminder', folder_id: folderId,
      start_date: '2030-01-09', start_time: '09:00',
      due_date: '2030-01-10', due_time: '17:00',
      reminder: { offset_minutes: 30 },
    }, 'a timed Due reminder may coexist with Start time')
    const reminderBefore = await reminderRow(app.db, task.id)
    await patchTaskOk(owner, task.id, { start_time: '10:00' },
      'changing Start time alone is a plain task edit')
    expect(await reminderRow(app.db, task.id)).toEqual(reminderBefore)

    const recurring = await createTaskOk(owner, {
      title: 'ac423 recurring', folder_id: folderId,
      start_date: '2026-10-01', start_time: '09:00',
      due_date: '2026-10-02', due_time: '17:00',
      recurrence_rule: 'FREQ=DAILY',
    }, 'a recurring task may have an authored Start endpoint')
    const completed = await owner.browser.json(`/tasks/${recurring.id}/complete?tz=UTC`, 'POST', {})
    expectStatus(completed, 200, 'completion generates the Due-anchored successor')
    const generated = asRecord(asRecord(completed.json(), 'transition body').generated_task, 'generated_task')
    expect(generated.start_date).toBeNull()
    expect(generated.start_time).toBeNull()
    const next = await requireTaskRow(app.db, String(generated.id))
    expect(next.start_date).toBeNull()
    expect(next.start_time).toBeNull()
  })

  test('task/folder duplication and account export preserve start_time', async () => {
    const [owner] = await cast.of(app)
    if (owner === undefined) throw new Error('cast must produce an owner')
    const folderId = await createFolder(owner, 'ac423 copies')
    const task = await createTaskOk(owner, {
      title: 'ac423 copied task', folder_id: folderId,
      start_date: '2030-02-01', start_time: '07:45',
      due_date: '2030-02-02',
    }, 'a copy source carries a Start time')

    const copied = await owner.browser.json(`/tasks/${task.id}/duplicate?tz=UTC`, 'POST', {})
    expectStatus(copied, 201, 'task duplication succeeds')
    const copiedId = String(asRecord(copied.json(), 'task duplicate').id)
    expect((await requireTaskRow(app.db, copiedId)).start_time).toBe('07:45:00')

    const folderCopy = await owner.browser.json(`/folders/${folderId}/duplicate?tz=UTC`, 'POST', {})
    expectStatus(folderCopy, 201, 'folder duplication succeeds')
    const copiedFolderId = String(asRecord(folderCopy.json(), 'folder duplicate').id)
    const copiedRows = await rows(app.db, sql`
      SELECT id, to_char(start_time, 'HH24:MI:SS') AS start_time
        FROM tasks WHERE folder_id = ${copiedFolderId}::uuid
          AND title = 'ac423 copied task'
    `)
    expect(copiedRows).toHaveLength(1)
    expect(copiedRows[0]?.start_time).toBe('07:45:00')

    const exported = await owner.browser.json('/me/export', 'GET')
    expectStatus(exported, 200, 'account export succeeds')
    const document = asRecord(exported.json(), 'account export')
    expect(document.version).toBe(11)
    const folders = document.folders as unknown[]
    const sourceFolder = folders.map((value) => asRecord(value, 'export folder'))
      .find((value) => value.id === folderId)
    expect(sourceFolder).toBeDefined()
    const exportedTask = (sourceFolder?.tasks as unknown[])
      .map((value) => asRecord(value, 'export task'))
      .find((value) => value.id === task.id)
    expect(exportedTask?.start_time).toBe('07:45')
  })
})
