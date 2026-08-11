/*
AC-147: given PUT /tasks/:id/reminder against a task with no due_date, or with
a body carrying the wrong mode, both modes, neither mode, or an offset outside
4.8's range, then 422 naming the field and no row is written or changed.

Proposed here with its test and numbered by the Integration Steward at P7's
mid-package change control on 2026-08-10, so the sentence above is section
12's own text now, transcribed unchanged. It is the second of the six surfaces
the RFC 0001 P7 row named, and the row is explicit about why it is not
AC-090's: 7.9 names the no-due_date refusal separately from the wrong-mode
one, and AC-090 covers one arm of the second.

**The no-due_date refusal is INV-6 on the only path that can still violate
it.** The invariant says due_time, a recurrence rule and a reminder row exist
only while due_date is set, and every other route to a reminder is closed:
8.4's cascade deletes the row when the date is cleared, which AC-028 proves,
and 4.8 notes that a reminder for a dateless task is therefore impossible. It
is impossible *through that path*. This endpoint writes a reminder directly,
so it is the one place a dateless task can acquire one, and nothing asserted
that it refuses.

**Both modes are refused on a dateless task, not just one.** With no due_date
there is no legal mode at all: the offset arm needs a due_time that INV-6
forbids, and the date-only arm needs a due_date to attach a time to. An
implementation that reads only "the task has no due_time, so time_of_day is
the mode here" accepts the date-only body and writes a row 4.8's own note says
cannot exist.

**4.8's exclusive-or is a body rule as well as a column rule.** A body with
both modes and a body with neither each satisfy no branch of 7.9's sentence,
and the column CHECK would refuse them at the very end. The difference between
422 and a constraint violation surfacing as a 500 is the difference between a
validation this contract states and a database error a client cannot act on,
which is why 10.3's numbers are described as server-enforced with field
errors.

**The offset range is 4.8's CHECK and 4.11's stated cap**, zero to 10080. The
boundaries themselves are asserted as accepted in AC-083; what is asserted
here is that one below and one above are refused, and refused as validation.

**Every refusal is measured beside a success on the same URL**, the standing
rule since P4, and every refusal is checked to have written nothing: 4.8 makes
fire_at NOT NULL, so a rejected write has no half-row to leave, and where a
row already exists the stored row must be byte for byte what it was.

Spec: 7.9 (the mode rules, the no-due_date refusal, and the 2026-08-10
ruling), 4.8 (the CHECK constraints and the cross-table mode rule), 4.11 (the
seven day cap), INV-6, 10.3, 7.0 (422 with the field named; an inaccessible
resource answers 404), 10.2.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  createTaskOk,
  expectSweptTasks,
  expectTaskInvariants,
} from './tasks-harness.js'
import {
  KARACHI,
  LONDON,
  ZoneCast,
  expectNoReminderRow,
  putReminder,
  putReminderOk,
  requireReminderRow,
} from './reminders-harness.js'
import { shiftDate, todayIn } from './views-harness.js'

let app: AuthTestApp
const cast = new ZoneCast('p7')

interface Stage {
  owner: Actor
  stranger: Actor
  folderId: string
}
let staged: Stage | undefined
const taskIds: string[] = []
const folderIds: string[] = []

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const owner = await cast.signIn(app, 'guard-owner', KARACHI)
    const stranger = await cast.signIn(app, 'guard-stranger', LONDON)
    const folderId = await createFolder(owner, 'p7 ac147')
    folderIds.push(folderId)
    staged = { owner, stranger, folderId }
  }
  return staged
}

async function task(
  label: string,
  body: Record<string, unknown>,
): Promise<string> {
  const { owner, folderId } = await stage()
  const created = await createTaskOk(
    owner,
    { title: `p7 ac147 ${label}`, folder_id: folderId, ...body },
    'the fixture task is creatable (spec 7.6)',
  )
  taskIds.push(created.id)
  return created.id
}

const DUE = (): string => shiftDate(todayIn(KARACHI), 3)

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-147: the 7.9 write guards AC-090 does not cover', () => {
  test('AC-147: a task with no due_date refuses both modes, and INV-6 holds', async () => {
    const { owner } = await stage()
    const dateless = await task('no due date', {})

    for (const [what, body] of [
      ['the date-only mode', { time_of_day: '09:00' }],
      ['the offset mode', { offset_minutes: 30 }],
    ] as const) {
      const refused = await putReminder(owner, dateless, body)
      expectStatus(
        refused,
        422,
        `7.9 refuses a reminder on a task without due_date, INV-6, and this is ${what}. With no date there is no legal mode at all: an implementation reading only "no due_time, so time_of_day is the mode here" accepts the first body and writes a row 4.8's own note calls impossible`,
      )
      await expectNoReminderRow(
        app.db,
        dateless,
        'and the refusal wrote nothing',
      )
    }

    // The control on the same URL: give the task a date and the same body is
    // accepted, so the refusals above are about INV-6 rather than about a
    // route that refuses everything.
    const dated = await task('dated control', { due_date: DUE() })
    await putReminderOk(
      owner,
      dated,
      { time_of_day: '09:00' },
      'the same body against a dated task (spec 7.9)',
    )
  })

  test('AC-147: time_of_day on a task that has due_time is the converse wrong mode', async () => {
    const { owner } = await stage()
    const timed = await task('has due_time', {
      due_date: DUE(),
      due_time: '15:00',
    })

    const refused = await putReminder(owner, timed, { time_of_day: '09:00' })
    expectStatus(
      refused,
      422,
      '7.9: { offset_minutes } when the task has due_time, { time_of_day } when it does not. AC-090 asserts one direction of that sentence and this is the other, which an implementation checking only for a missing due_time never reaches',
    )
    expect(
      JSON.stringify(refused.json()).toLowerCase(),
      '7.0 names the field on a validation failure',
    ).toMatch(/time_of_day|time/)
    await expectNoReminderRow(app.db, timed, 'and it wrote nothing')

    await putReminderOk(
      owner,
      timed,
      { offset_minutes: 30 },
      'the control on the same URL: the mode this task does admit (spec 7.9)',
    )
  })

  test('AC-147: a body with both modes or neither is refused, and an existing row is untouched', async () => {
    const { owner } = await stage()
    const taskId = await task('exclusive or', {
      due_date: DUE(),
      due_time: '15:00',
    })
    await putReminderOk(
      owner,
      taskId,
      { offset_minutes: 30 },
      'a legal reminder first, so each refusal below has a row it must not disturb (spec 7.9)',
    )
    const before = await requireReminderRow(app.db, taskId, 'the row exists')

    for (const [what, body] of [
      ['both modes at once', { offset_minutes: 30, time_of_day: '09:00' }],
      ['neither mode', {}],
      ['a null in place of a mode', { offset_minutes: null }],
    ] as const) {
      expectStatus(
        await putReminder(owner, taskId, body),
        422,
        `4.8 admits exactly one mode per row, CHECK ((offset_minutes IS NULL) <> (time_of_day IS NULL)), and 7.9's sentence has no branch for ${what}. 10.3's limits are server-enforced with field errors, so this is a 422 and not a constraint violation surfacing as a 500`,
      )
      expect(
        await requireReminderRow(app.db, taskId, 'the row survives'),
        `and the row is exactly what it was before ${what} was tried`,
      ).toEqual(before)
    }
  })

  test('AC-147: an offset outside 4.8\'s range is a validation failure', async () => {
    const { owner } = await stage()
    const taskId = await task('offset range', {
      due_date: DUE(),
      due_time: '15:00',
    })

    for (const offset of [-1, 10_081, 1_000_000]) {
      const refused = await putReminder(owner, taskId, {
        offset_minutes: offset,
      })
      expectStatus(
        refused,
        422,
        `4.8 CHECKs offset_minutes BETWEEN 0 AND 10080 and 4.11 records the seven day cap as deliberate, so ${String(offset)} is a validation failure. Left to the column, it arrives as a database error the client cannot act on`,
      )
      await expectNoReminderRow(app.db, taskId, 'and nothing was written')
    }

    await putReminderOk(
      owner,
      taskId,
      { offset_minutes: 10_080 },
      'the control on the same URL: the boundary itself is admitted (spec 4.8)',
    )
  })

  test('AC-147: a caller outside the folder cannot write a reminder or learn the task exists', async () => {
    const { owner, stranger } = await stage()
    const taskId = await task('inaccessible', {
      due_date: DUE(),
      due_time: '15:00',
    })

    expectStatus(
      await putReminder(stranger, taskId, { offset_minutes: 30 }),
      404,
      '10.2 is the one chokepoint and 7.0 makes an inaccessible resource answer 404 rather than 403 or 422, since a 422 about the body would confirm the task exists',
    )
    await expectNoReminderRow(app.db, taskId, 'and nothing was written')

    await putReminderOk(
      owner,
      taskId,
      { offset_minutes: 30 },
      'the control on the same URL: a member writes it (spec 7.9)',
    )
  })

  test('AC-147: invariants hold afterwards', async () => {
    const { owner, stranger } = await stage()
    expectSweptTasks(taskIds)
    await expectTaskInvariants(app.db, taskIds, folderIds, [
      owner.id,
      stranger.id,
    ])
  })
})
