/*
AC-148: given a second PUT /tasks/:id/reminder over an existing row whose new
instant is in the future, then the single row carries the new value with
fire_at recomputed, state returns to scheduled from sent and from skipped, and
the response is the affected TaskDetail reporting it.

Proposed here with its test and numbered by the Integration Steward at P7's
mid-package change control on 2026-08-10, so the sentence above is section
12's own text now. It is the third of the six surfaces the RFC 0001 P7 row
named, and the row's phrasing is precise about what was missing: "PUT
upserting over an existing row and resetting state to scheduled from sent or
skipped, which 7.9 states and nothing checks".

**The criterion gained "whose new instant is in the future" at the same change
control, and it corrected nothing here.** Both cases below already used future
instants, deliberately and for a reason the header stated: the past-instant
case was a genuine disagreement between two texts and this file declined to
assert either reading of it. The owner then qualified frozen 7.9's bullet on
that escalation, so a PUT computing a past instant answers skipped, and the
criterion states the condition its test already met. The two texts agree now
rather than meeting later, and no fixture and no assertion moved.

**Upsert is a word doing real work.** 4.8 makes task_id the primary key, so
there is exactly one reminder per task and a second PUT has to update rather
than insert. An implementation written as a plain insert answers a constraint
violation on the second call, which is the shape of failure a user meets by
changing their mind about a reminder they already set, and no criterion in any
range makes that call twice.

**The state reset is the half with teeth.** A reminder that has already been
sent, or that was skipped when its date moved backwards, is a row with a
terminal state. 7.9 says a PUT resets it to scheduled unless the new instant
is already past, and without that reset a user who re-sets a reminder after
the first one fired gets a row that will never fire again, silently, with the
value they asked for sitting in it. Both terminal states are exercised,
because an implementation resetting from one is no evidence about the other.

That revival is also what makes AC-154 a narrower rule rather than a
contradiction of this one. A PUT changes the reminder's own value or mode,
which 8.6 counts as a new occasion and which returns a sent row to scheduled;
a timezone change alters neither the deadline nor the recipient, and 8.6 as
ruled at the same change control leaves a sent row alone for it.

**The revival clears fired_at, and that is asserted where the ruling states
it.** 8.6 as ruled records the consequence in its own words: where one of the
other four triggers returns a sent row to scheduled, fired_at is cleared with
it, so frozen 4.8's note that the column is set when state leaves scheduled
stays true of every row. The sent case below asserts it. The skipped case
deliberately does not, and the difference is a reading rather than an
oversight: the ruling names a sent row, 4.8 says only when the column is set
and never when it clears, and a skipped row revived with a stale fired_at
would leave that note untrue of exactly one row shape. It is routed to the
Integration Steward rather than asserted here, because asserting past the
words of a ruling this file also cites is the reinterpretation this role is
forbidden.

**The ruled response body is judged on every success**, in the harness, by the
same helper as the ruled 7.7 and 7.8 bodies: a whole TaskDetail equal to what
a fresh GET then answers. This file adds the value assertion the helper cannot
make, which is that the body reports the reminder just written rather than the
one it replaced. A route reading the row before its own update answers the old
value with a 200 and looks entirely correct.

**Every instant here is in the future, deliberately, and the reason has been
settled rather than removed.** Whether a PUT computing an instant already past
leaves the row scheduled or skipped was a genuine disagreement between frozen
7.9 and 8.6, escalated at this package's change control rather than asserted
in either direction. It is now 7.9's own qualifier, skipped, so confining this
file to future instants is what isolates the revival the criterion is about
from the refusal that shares its bullet. The past-instant answer has a
criterion of its own nowhere and needs none: AC-085 pins the same rule where
8.6 states it, on a recompute rather than on a write.

Spec: 7.9 (upserts the single row, computes fire_at, state resets to scheduled
unless that instant is already past; and the 2026-08-10 rulings on the
response body and on that qualifier), 4.8 (the primary
key, the mode columns, state and fired_at), 8.6 (the computation and the
recompute trigger on the reminder's own value or mode).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { sql } from 'drizzle-orm'
import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { countRows, createFolder } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  createTaskOk,
  expectSweptTasks,
  expectTaskInvariants,
  readTask,
} from './tasks-harness.js'
import {
  KARACHI,
  ZoneCast,
  expectFireAt,
  offsetFireInstant,
  putReminderOk,
  requireReminderRow,
  setReminderState,
} from './reminders-harness.js'
import { shiftDate, todayIn } from './views-harness.js'

let app: AuthTestApp
const cast = new ZoneCast('p7')

const DUE_TIME = '15:00'

interface Stage {
  owner: Actor
  folderId: string
}
let staged: Stage | undefined
const taskIds: string[] = []
const folderIds: string[] = []

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const owner = await cast.signIn(app, 'upserter', KARACHI)
    const folderId = await createFolder(owner, 'p7 ac148')
    folderIds.push(folderId)
    staged = { owner, folderId }
  }
  return staged
}

/** A task due well ahead, so every instant this file computes is in the
 * future and the state question 7.9 and 8.6 disagree about never arises. */
async function futureTask(label: string): Promise<{ id: string; due: string }> {
  const { owner, folderId } = await stage()
  const due = shiftDate(todayIn(KARACHI), 30)
  const created = await createTaskOk(
    owner,
    {
      title: `p7 ac148 ${label}`,
      folder_id: folderId,
      due_date: due,
      due_time: DUE_TIME,
    },
    'a dated, timed task thirty days out is creatable (spec 7.6)',
  )
  taskIds.push(created.id)
  return { id: created.id, due }
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-148: a second PUT replaces the row and revives it', () => {
  test('AC-148: the second PUT updates the single row rather than inserting a second', async () => {
    const { owner } = await stage()
    const { id, due } = await futureTask('upsert')

    await putReminderOk(
      owner,
      id,
      { offset_minutes: 30 },
      'the first PUT creates the row (spec 7.9)',
    )
    const second = await putReminderOk(
      owner,
      id,
      { offset_minutes: 120 },
      '7.9 upserts the single row, so a second PUT with a different value is an update and not a constraint violation. This is the call a user makes by changing their mind, and no criterion in any range made it twice',
    )

    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM reminders WHERE task_id = ${id}`,
      ),
      '4.8 makes task_id the primary key: one reminder per task, however many times it is written',
    ).toBe(1)

    const row = await requireReminderRow(app.db, id, 'the row exists')
    expect(row.offset_minutes, 'and it carries the new value').toBe(120)
    expectFireAt(
      row,
      offsetFireInstant(KARACHI, due, DUE_TIME, 120),
      '8.6 lists the reminder\'s own value as a recompute trigger, so the instant moved with it. A route that wrote the value and left fire_at alone leaves a reminder that fires at the old moment and reports the new one',
    )
    expect(
      second.reminder,
      '7.9 as ruled on 2026-08-10 answers the affected TaskDetail, and the affected task is the one carrying the value just written. A route reading the row before its own update answers the value it replaced, with a 200 on it',
    ).toEqual({ offset_minutes: 120, time_of_day: null })
    expect(
      (await readTask(owner, id)).reminder,
      'and a fresh GET agrees, which is what the ruled body promises',
    ).toEqual({ offset_minutes: 120, time_of_day: null })
  })

  test('AC-148: a sent reminder returns to scheduled', async () => {
    const { owner } = await stage()
    const { id, due } = await futureTask('sent then rewritten')
    await putReminderOk(
      owner,
      id,
      { offset_minutes: 30 },
      'the first PUT (spec 7.9)',
    )
    await setReminderState(app.db, id, 'sent')
    const delivered = await requireReminderRow(app.db, id, 'the row exists')
    expect(
      delivered.state,
      'the positive control for this case: the row really is terminal before the second PUT',
    ).toBe('sent')
    expect(
      delivered.fired_at,
      'and it carries the fired_at 4.8 sets when state leaves scheduled, which is what the revival below has to undo',
    ).not.toBeNull()

    await putReminderOk(
      owner,
      id,
      { offset_minutes: 60 },
      'a second PUT over a reminder that has already fired (spec 7.9)',
    )
    const row = await requireReminderRow(app.db, id, 'the row survives')
    expect(
      row.state,
      '7.9: state resets to scheduled unless that instant is already past, and this instant is thirty days out. Without the reset, a user who sets a new reminder after the first one fired gets a row that will never fire again, holding exactly the value they asked for',
    ).toBe('scheduled')
    expect(
      row.fired_at,
      '8.6 as ruled on 2026-08-10 records this consequence in its own words: where one of the other four triggers returns a sent row to scheduled, fired_at is cleared with it, so frozen 4.8\'s note that the column is set when state leaves scheduled stays true of every row rather than of most of them. A revival that moved the state and the instant and left the old fired_at standing reads as a reminder delivered at a moment it was never scheduled for',
    ).toBeNull()
    expectFireAt(
      row,
      offsetFireInstant(KARACHI, due, DUE_TIME, 60),
      'and the instant is the new one, thirty days out',
    )
  })

  test('AC-148: a skipped reminder returns to scheduled too', async () => {
    const { owner } = await stage()
    const { id, due } = await futureTask('skipped then rewritten')
    await putReminderOk(
      owner,
      id,
      { offset_minutes: 30 },
      'the first PUT (spec 7.9)',
    )
    await setReminderState(app.db, id, 'skipped')
    expect(
      (await requireReminderRow(app.db, id, 'the row exists')).state,
      'the control: the row is terminal in the other of 4.8\'s two ways',
    ).toBe('skipped')

    await putReminderOk(
      owner,
      id,
      { offset_minutes: 90 },
      'a second PUT over a reminder the loop skipped (spec 7.9)',
    )
    const row = await requireReminderRow(app.db, id, 'the row survives')
    expect(
      row.state,
      '7.9 says state resets to scheduled unless that instant is already past, and it names no state it resets from, so an implementation reviving one of 4.8\'s two terminal states is no evidence at all about the other',
    ).toBe('scheduled')
    expectFireAt(
      row,
      offsetFireInstant(KARACHI, due, DUE_TIME, 90),
      'with the new instant on it',
    )
  })

  test('AC-148: the mode columns stay exclusive across a rewrite', async () => {
    const { owner, folderId } = await stage()
    const due = shiftDate(todayIn(KARACHI), 30)
    const created = await createTaskOk(
      owner,
      {
        title: 'p7 ac148 date only rewritten',
        folder_id: folderId,
        due_date: due,
      },
      'a dated task with no due_time is creatable (spec 7.6)',
    )
    taskIds.push(created.id)

    await putReminderOk(
      owner,
      created.id,
      { time_of_day: '09:00' },
      'the date-only mode first (spec 7.9)',
    )
    await putReminderOk(
      owner,
      created.id,
      { time_of_day: '18:30' },
      'and rewritten with another wall time (spec 7.9)',
    )
    const row = await requireReminderRow(app.db, created.id, 'the row exists')
    expect(
      { offset_minutes: row.offset_minutes, time_of_day: row.time_of_day },
      '4.8 admits exactly one non-null mode column, so an upsert that wrote the new value without clearing the other would violate the CHECK it is written under',
    ).toEqual({ offset_minutes: null, time_of_day: '18:30:00' })
  })

  test('AC-148: invariants hold afterwards', async () => {
    const { owner } = await stage()
    expectSweptTasks(taskIds)
    await expectTaskInvariants(app.db, taskIds, folderIds, [owner.id])
  })
})
