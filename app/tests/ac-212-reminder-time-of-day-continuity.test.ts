/*
AC-212: given a task with a due date and no due time, when a reminder is
set for 17:45, then the reminder stores time_of_day mode and the 11.7 pass
fires it on the due date at 17:45 in the viewer's timezone.

A continuity pin, and it may well be green from birth: 4.8 has carried the
time_of_day mode since v1 and AC-083 to AC-090 prove the delivery loop.
What this criterion guards is the v2 fact around it, that time_of_day is
the only mode the v2 interfaces create once the due-time control leaves,
so a regression that quietly drops the mode while refactoring the picker
path fails here rather than in a user's silent morning.

Spec: 4.8, 7.9, 8.6, 11.7 (RFC 0005, DES-224).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { sql } from 'drizzle-orm'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { createTaskOk } from './tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'])

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-212 a day-level reminder is the time-of-day mode', () => {
  test('setting 17:45 on a dated, timeless task stores time_of_day', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 's1 ac212 reminder')
    const task = await createTaskOk(
      owner,
      { title: 's1 ac212 dated no time', folder_id: folderId, due_date: '2030-06-01' },
      'the dated task stages (spec 7.6)',
    )

    const set = await owner.browser.json(`/tasks/${task.id}/reminder`, 'PUT', {
      time_of_day: '17:45',
    })
    expectStatus(set, 200, 'the reminder writes through 7.9')

    const stored = await app.db.execute(sql`
      SELECT time_of_day, offset_minutes FROM reminders
      WHERE task_id = ${task.id}::uuid
    `)
    const row = (stored.rows as Array<Record<string, unknown>>)[0]
    expect(row, 'one reminder row exists (spec 4.8)').toBeDefined()
    expect(
      String(row?.time_of_day ?? ''),
      'the mode is time_of_day (spec 4.8, DES-224)',
    ).toContain('17:45')
    expect(
      row?.offset_minutes ?? null,
      'exactly one mode is set (spec 4.8 CHECK)',
    ).toBeNull()
  })
})
