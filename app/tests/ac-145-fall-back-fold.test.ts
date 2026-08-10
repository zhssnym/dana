/*
AC-145 (proposed): given a reminder whose local fire time falls inside a
fall-back overlap, then fire_at is the earlier of the two instants.

Proposed here with its test, and numbered by the Integration Steward at this
package's change control like its sibling AC-144. The two are separate numbers
rather than one because they are separate rules with separate failure modes:
the gap has no answer and 8.6 invents one, the fold has two and 8.6 chooses,
and a module can implement either correctly while getting the other wrong. 8.6
writes them as two sentences and 11.9 records two distinct Luxon behaviors
behind them, an advance by the gap length in one case and a documented
undefined choice in the other.

**The wrong answer here is exactly one hour late, and nothing else about the
row looks wrong.** That is what makes it worth a number. A reminder resolved
to the later instant still fires on the right day, still fires at the right
wall clock as the recipient reads it afterwards, and still passes every shape
and state assertion in this range. The only observable difference is that it
arrives an hour after the moment the user asked for, twice a year, on the
night the clocks change.

**The expected instant is derived by hand from the transition, not computed.**
Section 13 item 25 rules out every oracle for this case and gives the reason:
a library agreeing with the module would be Luxon or Luxon's engine, and a
library disagreeing with it would be disagreeing about policy rather than
about tzdb. So the fixture is the record: Europe/London moved 02:00 BST to
01:00 GMT on 2010-10-31, so 01:30 local happens first at 00:30Z on the summer
offset and again at 01:30Z on the winter one, and 8.6 takes the first. The
harness asserts both readings on this runtime before the file depends on
either, and the later instant is named in the assertion so the case
discriminates against the specific wrong answer.

**Both arms of 8.6 reach the fold, and two controls bound it.** The date-only
arm names 01:30 outright; the offset arm subtracts thirty minutes from a 02:00
due_time and lands there. 00:30 local, half an hour earlier, and 02:30 local,
half an hour after the clocks have gone back, are both unambiguous and must
answer their own instants, so a module resolving everything on a transition
date to the start of the overlap fails them.

Europe/London under the EU rule, unchanged since 1996, and a historical date:
item 25's fixture constraint, which exists because the Node runtime and the
embedded engine of 11.10 carry tzdb copies that move independently.

Spec: 8.6 (an ambiguous time in a fall-back overlap resolves to the earlier
instant), 11.9 (Luxon's documentation declares the choice undefined, so the
module selects the earlier instant itself), section 13 item 25, 4.8, 7.9 as
ruled on 2026-08-10.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { createFolder } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  createTaskOk,
  expectSweptTasks,
  expectTaskInvariants,
} from './tasks-harness.js'
import {
  FOLD,
  ZoneCast,
  expectFireAt,
  expectFoldFixture,
  expectNotFireAt,
  instantAtWallTime,
  putReminderOk,
  requireReminderRow,
} from './reminders-harness.js'

let app: AuthTestApp
const cast = new ZoneCast('p7')

interface Stage {
  owner: Actor
  folderId: string
}
let staged: Stage | undefined
const taskIds: string[] = []
const folderIds: string[] = []

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const owner = await cast.signIn(app, 'fold-owner', FOLD.zone)
    const folderId = await createFolder(owner, 'p7 ac145 fall back')
    folderIds.push(folderId)
    staged = { owner, folderId }
  }
  return staged
}

async function taskOn(
  label: string,
  body: Record<string, unknown>,
): Promise<string> {
  const { owner, folderId } = await stage()
  const created = await createTaskOk(
    owner,
    {
      title: `p7 ac145 ${label}`,
      folder_id: folderId,
      due_date: FOLD.date,
      ...body,
    },
    'a task due on the transition date is creatable (spec 7.6)',
  )
  taskIds.push(created.id)
  return created.id
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-145 (proposed): an ambiguous local time resolves to the earlier instant', () => {
  test('AC-145: the fold is still a fold on this runtime', () => {
    expectFoldFixture()
  })

  test('AC-145: the date-only arm resolves 01:30 to the earlier of its two instants', async () => {
    const { owner } = await stage()
    const taskId = await taskOn('date only in the fold', {})
    await putReminderOk(
      owner,
      taskId,
      { time_of_day: FOLD.localTime },
      `PUT with time_of_day ${FOLD.localTime} on ${FOLD.date}, a local time that happens twice in ${FOLD.zone} (spec 7.9)`,
    )
    const row = await requireReminderRow(app.db, taskId, 'the PUT upserted a row')
    expectFireAt(
      row,
      FOLD.resolved,
      '8.6: an ambiguous time in a fall-back overlap resolves to the earlier instant, which is the one still on the summer offset',
    )
    expectNotFireAt(
      row,
      FOLD.later,
      '11.9: Luxon declares the choice undefined, so the module selects the earlier instant itself. The later one is an hour after the moment the user asked for, on the one night a year when it is wrong, and it looks correct in every other assertion this range makes',
    )
  })

  test('AC-145: the offset arm reaches the same fold by subtraction and chooses the same instant', async () => {
    const { owner } = await stage()
    const taskId = await taskOn('offset into the fold', { due_time: '02:00' })
    await putReminderOk(
      owner,
      taskId,
      { offset_minutes: 30 },
      'PUT with a 30 minute offset against a 02:00 due_time, which lands inside the overlap (spec 7.9)',
    )
    const row = await requireReminderRow(app.db, taskId, 'the PUT upserted a row')
    expectFireAt(
      row,
      FOLD.resolved,
      '8.6 subtracts first and resolves the zone second, so both arms arrive at the same ambiguous local time and must choose the same instant',
    )
    expectNotFireAt(row, FOLD.later, 'and not the later one')
  })

  test('AC-145: unambiguous local times either side of the overlap are untouched', async () => {
    const { owner } = await stage()

    const before = await taskOn('half an hour before the overlap', {})
    await putReminderOk(
      owner,
      before,
      { time_of_day: '00:30' },
      'a local time before the clocks go back, which happens once (spec 7.9)',
    )
    expectFireAt(
      await requireReminderRow(app.db, before, 'the row exists'),
      instantAtWallTime(FOLD.zone, FOLD.date, '00:30'),
      `00:30 on ${FOLD.date} in ${FOLD.zone} exists exactly once, on the summer offset, so it is ordinary arithmetic and Intl is admissible for it`,
    )

    const after = await taskOn('half an hour after the overlap', {})
    await putReminderOk(
      owner,
      after,
      { time_of_day: '02:30' },
      'a local time after the clocks have gone back, which also happens once (spec 7.9)',
    )
    expectFireAt(
      await requireReminderRow(app.db, after, 'the row exists'),
      instantAtWallTime(FOLD.zone, FOLD.date, '02:30'),
      'and 02:30 exists once on the winter offset. A module resolving every local time on a transition date to the start of the overlap satisfies the criterion and fails both of these',
    )

    expect(
      instantAtWallTime(FOLD.zone, FOLD.date, '02:30').getTime() -
        FOLD.resolved.getTime(),
      'the two instants either side of the overlap are two hours apart in UTC although their wall clocks are one hour apart, which is the hour that happened twice',
    ).toBe(2 * 60 * 60 * 1000)
  })

  test('AC-145: invariants hold afterwards', async () => {
    const { owner } = await stage()
    expectSweptTasks(taskIds)
    await expectTaskInvariants(app.db, taskIds, folderIds, [owner.id])
  })
})
