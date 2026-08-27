/*
AC-272: a workflow file's task carries its notes, star, repeat, reminder and
step titles into the import; and the same file's ids, people, due dates,
statuses and ticked steps still reach nothing.

Item 44's B3 widened frozen 7.16 from "structure and titles only" to the
folder's page blocks beside each task's title, notes, star, repeat, reminder
and steps. The three exclusions it kept are principled and are recorded in
the ruling: a due date is a moment in one run of the work and a template has
no run, a person is an account that may not exist wherever the file is
opened, and a conversation is a record of what was said rather than of what
to do. A state is excluded too, and a step's tick is a state, which is the
half of AC-201 that a widened file is most likely to lose.

**This file is AC-201's sibling and deliberately overlaps it.** AC-201
asserts that a hostile file's smuggled fields are ignored rather than
refused, because refusing would make honest exports from older versions
unimportable. The widening changes what is honest and leaves what is
smuggled exactly where it was, so both assertions have to hold at once and a
session that widened the schema by relaxing it would pass one and fail the
other.

Spec: 7.16 as amended, 10.3, 4.5, 4.6, RFC 0005 change control item 44 B3.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { importedFolderId, workflowFile } from './s22a-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 's22a')

interface Detail extends Record<string, unknown> {
  notes?: unknown
  important?: unknown
  recurrence_rule?: unknown
  due_date?: unknown
  status?: unknown
  reminder?: { time_of_day?: unknown; offset_minutes?: unknown } | null
  steps?: Array<{ title?: unknown; done?: unknown }>
  assignee?: { id?: unknown } | null
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-272 the widened workflow file carries the task and still refuses the account', () => {
  test('notes, star, repeat, reminder and steps travel; ids, people, dates, states and ticks do not', async () => {
    const [owner] = (await cast.of(app)) as [Actor]

    const response = await owner.browser.json(
      '/workflows/import?tz=UTC',
      'POST',
      workflowFile(
        's22a ac272 routine',
        [
          {
            title: 's22a ac272 task',
            notes: 's22a ac272 the way this is done',
            important: true,
            recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO',
            reminder: { time_of_day: '08:30' },
            steps: [
              { title: 's22a ac272 step one', done: true },
              { title: 's22a ac272 step two' },
            ],
            // Everything below is what the ruling excludes, smuggled in the
            // shapes an honest older export would use.
            id: '00000000-0000-4000-8000-000000000042',
            status: 'completed',
            due_date: '2026-01-01',
            assignee_id: '00000000-0000-4000-8000-000000000043',
            created_by: '00000000-0000-4000-8000-000000000044',
          },
        ],
        [{ kind: 'section', text: 's22a ac272 how it goes' }],
      ),
    )
    expectStatus(response, 201, 'the widened file imports (spec 7.16)')
    const folderId = importedFolderId(response.json())

    const listed = await owner.browser.json(
      `/folders/${folderId}/tasks?tz=UTC`,
      'GET',
    )
    expectStatus(listed, 200, 'the imported folder reads (spec 6 Q7)')
    const cards = (
      listed.json() as {
        scheduled?: Array<{ id?: unknown }>
        unscheduled?: Array<{ id?: unknown }>
      }
    )
    const taskId = String(
      cards.scheduled?.[0]?.id ?? cards.unscheduled?.[0]?.id,
    )
    expect(taskId, 'the import created exactly one task to read').not.toBe(
      'undefined',
    )

    const read = await owner.browser.json(`/tasks/${taskId}`, 'GET')
    expectStatus(read, 200, 'the imported task reads (spec 7.6)')
    const detail = read.json() as Detail

    expect(detail.notes, 'the notes travel').toBe(
      's22a ac272 the way this is done',
    )
    expect(detail.important, 'the star travels').toBe(true)
    expect(detail.recurrence_rule, 'the repeat travels').toBe(
      'FREQ=WEEKLY;BYDAY=MO',
    )
    expect(detail.reminder?.time_of_day, 'the reminder travels').toBe('08:30')
    expect(
      (detail.steps ?? []).map((step) => String(step.title)),
      'the steps travel in the file’s own order',
    ).toEqual(['s22a ac272 step one', 's22a ac272 step two'])

    expect(
      (detail.steps ?? []).map((step) => step.done),
      'a step’s tick is a state and states do not travel',
    ).toEqual([false, false])
    expect(detail.status, 'nor does the task’s own state').toBe('pending')
    expect(taskId, 'the file’s id is never honored').not.toBe(
      '00000000-0000-4000-8000-000000000042',
    )
    expect(
      (detail.assignee as { id?: unknown } | null)?.id,
      'people do not travel: the importer owns what they imported',
    ).toBe(owner.id)
    expect(detail.due_date, 'the file’s own due date does not travel').not.toBe(
      '2026-01-01',
    )
  })
})
