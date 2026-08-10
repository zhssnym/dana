/*
AC-144 (proposed): given a reminder whose local fire time falls inside a
spring-forward gap, then fire_at is the first valid instant after the gap.

Proposed here with its test. The number is the Integration Steward's to assign
at this package's change control, the AC-125, AC-133 and AC-142 precedent; the
file spells AC-144 because a range has to be greppable and AC-143 is the last
number section 12 carries. Numbering additively changes no existing number and
so invalidates no criterion, which is what places it with the Steward rather
than with the human owner, whose are the frozen texts of sections 4 and 7.

**Why this is a number rather than a case inside AC-084.** 11.9 closes by
saying AC-083 to AC-086 pin both DST rules of 8.6, and section 13 item 25
records that none of the four instantiates either: AC-083 runs in Asia/Karachi,
which has observed no DST since 2009, AC-084 names no zone, AC-085 moves a due
date and AC-086 changes one. Those four now carry DST arithmetic, which is the
tzdb half. This rule is the other half and is not arithmetic at all: a local
time inside the gap exists on no instant, so there is no answer to compute and
8.6 chooses one. Item 25 records the expectation that the two policy rules
arrive as numbers of their own, because 11.9 points at numbers and a reader
checking coverage by number finds nothing, and because a case buried inside
another criterion is invisible to the grep this role's First moves prescribe.

**There is no oracle, by construction, and this file does not pretend to be
one.** Item 25 rules out every candidate: no library implements a policy
chosen where the standard is silent, Luxon is an anti-oracle for exactly this
case per 11.9, and Intl is Luxon's own engine so the comparison would be
circular. What is available instead is the transition itself, which is a
matter of historical record, and the expected instant follows from it by hand:
America/New_York moved 02:00 to 03:00 local on 2010-03-14, so the first valid
instant after the gap is the transition instant, 07:00Z, reading 03:00 local.
The fixture is asserted before the arithmetic leans on it, and both the
required answer and the answer 11.9 records raw Luxon gives, 03:30 local at
07:30Z, are named, so this case discriminates against the documented wrong
behavior rather than merely against a wrong number.

**Both arms of 8.6 reach the gap and both are asserted.** The date-only arm
puts time_of_day directly inside it; the offset arm lands there by
subtraction, from a due_time of 03:00 minus thirty minutes. An implementation
that clamps in one code path and not the other is exactly what two arms
computing one instant invites, and the two arms are written in 8.6 as separate
branches.

**Two controls keep the clamp from being a blanket.** 01:59 local on the same
date is an ordinary unambiguous time an hour before the transition, and 03:00
local is the first valid time itself; both must answer their own instants. A
module that resolved every local time on a transition date to the transition
instant would satisfy the criterion and fail these.

Section 13 item 25's fixture rule is honored: 2010-03-14 is historical, under
a United States rule unchanged since the 2007 Energy Policy Act took effect,
so no runtime is predicting anything and a tzdb release cannot move it.

Spec: 8.6 (the computation, and the comment that fixes both rules), 11.9
(Luxon guarantees neither, and what it does instead), section 13 item 25
(no oracle, and the fixture rule), 4.8, 7.9 as ruled on 2026-08-10.
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
  GAP,
  ZoneCast,
  expectFireAt,
  expectGapFixture,
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
    const owner = await cast.signIn(app, 'gap-owner', GAP.zone)
    const folderId = await createFolder(owner, 'p7 ac144 spring forward')
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
      title: `p7 ac144 ${label}`,
      folder_id: folderId,
      due_date: GAP.date,
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

describe('AC-144 (proposed): a nonexistent local time resolves forward', () => {
  test('AC-144: the gap is still a gap on this runtime', () => {
    expectGapFixture()
  })

  test('AC-144: the date-only arm resolves 02:30 to the first valid instant after the gap', async () => {
    const { owner } = await stage()
    const taskId = await taskOn('date only in the gap', {})
    await putReminderOk(
      owner,
      taskId,
      { time_of_day: GAP.localTime },
      `PUT with time_of_day ${GAP.localTime} on ${GAP.date}, a local time that exists on no instant in ${GAP.zone} (spec 7.9)`,
    )
    const row = await requireReminderRow(app.db, taskId, 'the PUT upserted a row')
    expectFireAt(
      row,
      GAP.resolved,
      `8.6: a nonexistent local time in a spring-forward gap resolves to the first valid instant after the gap, which is the transition itself at 03:00 local`,
    )
    expectNotFireAt(
      row,
      GAP.luxonRaw,
      '11.9 records what Luxon does instead: it advances by the gap length, so 02:30 becomes 03:30 local, which is 07:30Z. The module detects the gap and clamps, and this is the answer that proves it did',
    )
  })

  test('AC-144: the offset arm reaches the same gap by subtraction and resolves it the same way', async () => {
    const { owner } = await stage()
    const taskId = await taskOn('offset into the gap', { due_time: '03:00' })
    await putReminderOk(
      owner,
      taskId,
      { offset_minutes: 30 },
      'PUT with a 30 minute offset against a 03:00 due_time, which lands inside the gap (spec 7.9)',
    )
    const row = await requireReminderRow(app.db, taskId, 'the PUT upserted a row')
    expectFireAt(
      row,
      GAP.resolved,
      '8.6 subtracts first and resolves the zone second, so both of its arms arrive at the same nonexistent local time and must resolve it identically. A clamp written into one branch and not the other passes the case above and fails here',
    )
    expectNotFireAt(
      row,
      GAP.luxonRaw,
      'and not by advancing the gap length',
    )
  })

  test('AC-144: an ordinary local time on the same date is untouched', async () => {
    const { owner } = await stage()
    const before = await taskOn('an hour before the gap', {})
    await putReminderOk(
      owner,
      before,
      { time_of_day: '01:59' },
      'the last minute before the transition, which is an ordinary local time (spec 7.9)',
    )
    expectFireAt(
      await requireReminderRow(app.db, before, 'the row exists'),
      GAP.beforeGap,
      `01:59 on ${GAP.date} in ${GAP.zone} exists exactly once, at UTC-5. A module resolving every local time on a transition date to the transition instant satisfies this criterion and fails here`,
    )

    const after = await taskOn('the first valid time itself', {})
    await putReminderOk(
      owner,
      after,
      { time_of_day: '03:00' },
      'the first local time the gap admits (spec 7.9)',
    )
    expectFireAt(
      await requireReminderRow(app.db, after, 'the row exists'),
      GAP.resolved,
      'and 03:00 is its own instant, which is also what 02:30 resolves to: the rule says the first valid instant after the gap rather than some instant near it',
    )
    expect(
      instantAtWallTime(GAP.zone, GAP.date, '03:00').getTime(),
      'the two are the same instant, computed here through Intl for the unambiguous half where Intl is admissible',
    ).toBe(GAP.resolved.getTime())
  })

  test('AC-144: invariants hold afterwards', async () => {
    const { owner } = await stage()
    expectSweptTasks(taskIds)
    await expectTaskInvariants(app.db, taskIds, folderIds, [owner.id])
  })
})
