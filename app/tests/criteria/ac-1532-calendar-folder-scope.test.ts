import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import { createTaskOk } from '../support/tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'stranger'], 'ac1532')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 120_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

test('AC-1532: calendar scope constrains real rows and recurrence sources to one accessible Work', async () => {
  const [owner, stranger] = await cast.of(app)
  if (owner === undefined || stranger === undefined) throw new Error('cast needs two actors')

  const first = await createFolder(owner, 'ac1532 first Work')
  const second = await createFolder(owner, 'ac1532 second Work')
  const span = await createTaskOk(owner, {
    title: 'ac1532 overlapping span', folder_id: first,
    start_date: '2026-09-29', due_date: '2026-10-02',
  }, 'the first Work must accept a Task whose span overlaps the range')
  const completed = await createTaskOk(owner, {
    title: 'ac1532 completed', folder_id: first, due_date: '2026-10-01',
  }, 'the first Work must accept a completed fixture')
  const dropped = await createTaskOk(owner, {
    title: 'ac1532 dropped', folder_id: first, due_date: '2026-10-02',
  }, 'the first Work must accept a dropped fixture')
  const other = await createTaskOk(owner, {
    title: 'ac1532 other Work', folder_id: second, due_date: '2026-10-01',
  }, 'the second Work must accept a dated Task')
  const firstSeries = await createTaskOk(owner, {
    title: 'ac1532 first series', folder_id: first,
    due_date: '2026-09-25', recurrence_rule: 'FREQ=DAILY',
  }, 'the first Work must accept a repeating Task anchored before the range')
  const secondSeries = await createTaskOk(owner, {
    title: 'ac1532 second series', folder_id: second,
    due_date: '2026-09-25', recurrence_rule: 'FREQ=DAILY',
  }, 'the second Work must accept a repeating Task anchored before the range')

  await app.db.execute(sql`UPDATE tasks SET status = 'completed', completed_at = now(),
    completed_by = ${owner.id}::uuid WHERE id = ${completed.id}::uuid`)
  await app.db.execute(sql`UPDATE tasks SET status = 'abandoned' WHERE id = ${dropped.id}::uuid`)

  const query = '?tz=America/Toronto&start=2026-10-01&end=2026-10-03'
  const read = async (suffix = '') => {
    const response = await owner.browser.api(`/views/planned/calendar${query}${suffix}`)
    expectStatus(response, 200, 'the calendar request must succeed')
    return response.json() as {
      real: { id: string; status: string }[]
      virtual: { task_id: string; date: string }[]
    }
  }

  const global = await read()
  expect(global.real.map((task) => task.id)).toEqual(expect.arrayContaining([
    span.id, completed.id, dropped.id, other.id,
  ]))
  expect(new Set(global.virtual.map((instance) => instance.task_id))).toEqual(
    new Set([firstSeries.id, secondSeries.id]),
  )

  const scoped = await read(`&folder_id=${first}`)
  expect(scoped.real.map((task) => task.id).sort()).toEqual(
    [span.id, completed.id, dropped.id].sort(),
  )
  expect(scoped.real.find((task) => task.id === completed.id)?.status).toBe('completed')
  expect(scoped.real.find((task) => task.id === dropped.id)?.status).toBe('abandoned')
  expect(scoped.real.filter((task) => task.id === span.id)).toHaveLength(1)
  expect(new Set(scoped.virtual.map((instance) => instance.task_id))).toEqual(
    new Set([firstSeries.id]),
  )
  expect(scoped.virtual.map((instance) => instance.date)).toEqual([
    '2026-10-01', '2026-10-02', '2026-10-03',
  ])

  const otherScope = await read(`&folder_id=${second}`)
  expect(otherScope.real.map((task) => task.id)).toEqual([other.id])
  expect(new Set(otherScope.virtual.map((instance) => instance.task_id))).toEqual(
    new Set([secondSeries.id]),
  )

  const missing = randomUUID()
  for (const [actor, folderId] of [[stranger, first], [owner, missing]] as const) {
    const response = await actor.browser.api(`/views/planned/calendar${query}&folder_id=${folderId}`)
    expectStatus(response, 404, 'an inaccessible or missing Work scope must be hidden')
  }
  const invalid = await owner.browser.api(`/views/planned/calendar${query}&folder_id=bad`)
  expectStatus(invalid, 422, 'a malformed Work scope must be rejected')
})
