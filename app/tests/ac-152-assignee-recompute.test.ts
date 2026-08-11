/*
AC-152: given assignee_id changes, then fire_at is recomputed in the new
assignee's zone, an unassigned task falls back to the reminder creator's zone,
and a creator who travels moves nothing.

Proposed here with its test and numbered by the Integration Steward at P7's
mid-package change control on 2026-08-10, so the sentence above is section
12's own text now, transcribed unchanged. Like AC-151 it comes from the floor
rather than from the list: assignee_id is the fourth of 8.6's five recompute
triggers and no number asserted it.

**This trigger is the one that changes the zone, so getting it wrong is worth
hours.** The other four move a local time inside one zone. This one moves the
zone itself, and a task handed from a colleague in Karachi to one in New York
carries a reminder ten hours out of place until someone touches its date. The
row still says what the user asked for; only the instant is wrong, and nothing
in section 7 reports the instant.

**It is also what makes the kickoff's fallback ruling safe, and this file
asserts both halves of that ruling.** 8.6 records, from the P7 kickoff on
2026-08-10, that the creator's zone is a fallback for the computation and not
a sixth trigger, and the argument is that an unassigned task's reminder either
never fires, the loop skipping it, or is recomputed in the new assignee's zone
before it does. That argument is only true if assignee_id really is a trigger,
so the two cases belong together: assignment recomputes, and the creator
travelling does not. The second is an absence, so it runs its control in the
same case, the same fixture moving when the assignee's zone changes.

**Unassignment recomputes as well**, in the other direction: 8.6's second arm
takes the reminder creator's zone the moment there is no assignee, and 4.8's
NOT NULL fire_at means the row must still carry an instant. An implementation
that recomputes on assignment and leaves the old assignee's zone in place on
unassignment keeps a fire instant belonging to somebody who can no longer see
the task in their own list.

Zones here are all DST-free (Asia/Karachi, Pacific/Honolulu, Africa/Nairobi),
so every difference this file measures is a zone difference and never a
transition, and no fixture predicts anything.

Spec: 8.6 (the trigger list, the two computation arms, and the creator
fallback recorded at the P7 kickoff), 7.6 (PATCH assignee_id, and INV-5's
refusal in a single-member folder), 4.8, INV-5.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { addMemberOk, connect, createFolder } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  createTaskOk,
  expectSweptTasks,
  expectTaskInvariants,
  patchTaskOk,
  requireTaskRow,
} from './tasks-harness.js'
import {
  KARACHI,
  ZoneCast,
  expectFireAt,
  offsetFireInstant,
  putReminderOk,
  requireReminderRow,
  storedZone,
} from './reminders-harness.js'
import { shiftDate, todayIn } from './views-harness.js'

let app: AuthTestApp
const cast = new ZoneCast('p7')

const HONOLULU = 'Pacific/Honolulu' // UTC-10, no DST
const NAIROBI = 'Africa/Nairobi' // UTC+3, no DST
const DUE_TIME = '15:00'
const OFFSET = 30

interface Stage {
  creator: Actor
  first: Actor
  second: Actor
  folderId: string
}
let staged: Stage | undefined
const taskIds: string[] = []
const folderIds: string[] = []

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const creator = await cast.signIn(app, 'assignment-creator', NAIROBI)
    const first = await cast.signIn(app, 'first-assignee', KARACHI)
    const second = await cast.signIn(app, 'second-assignee', HONOLULU)
    await connect(app.db, creator.id, first.id)
    await connect(app.db, creator.id, second.id)
    const folderId = await createFolder(creator, 'p7 ac152 three zones')
    await addMemberOk(creator, folderId, first.id)
    await addMemberOk(creator, folderId, second.id)
    folderIds.push(folderId)
    staged = { creator, first, second, folderId }
  }
  return staged
}

/** A task assigned to one member, carrying an offset reminder written by the
 * creator, so the assignee and the reminder's creator are different people
 * in different zones throughout this file. */
async function assignedTask(
  label: string,
  assigneeId: string,
): Promise<{ id: string; due: string }> {
  const { creator, folderId } = await stage()
  const due = shiftDate(todayIn(KARACHI), 30)
  const created = await createTaskOk(
    creator,
    {
      title: `p7 ac152 ${label}`,
      folder_id: folderId,
      due_date: due,
      due_time: DUE_TIME,
      assignee_id: assigneeId,
    },
    'a dated, timed task in a three-member folder is creatable (spec 7.6)',
  )
  taskIds.push(created.id)
  await putReminderOk(
    creator,
    created.id,
    { offset_minutes: OFFSET },
    `the creator writes the reminder on ${label} (spec 7.9)`,
  )
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

describe('AC-152: assignee_id is the trigger that changes the zone', () => {
  test('AC-152: reassignment recomputes in the new assignee\'s zone', async () => {
    const { creator, first, second } = await stage()
    const { id, due } = await assignedTask('handed over', first.id)

    expectFireAt(
      await requireReminderRow(app.db, id, 'the reminder exists'),
      offsetFireInstant(KARACHI, due, DUE_TIME, OFFSET),
      `computed in the first assignee's zone, ${KARACHI}`,
    )

    await patchTaskOk(
      creator,
      id,
      { assignee_id: second.id },
      'PATCH /tasks/:id handing the task to another member (spec 7.6)',
    )
    expectFireAt(
      await requireReminderRow(app.db, id, 'the reminder survives'),
      offsetFireInstant(HONOLULU, due, DUE_TIME, OFFSET),
      `8.6 names assignee_id in its trigger list, and this is the trigger that moves the zone itself rather than a local time inside one. Left unrecomputed the reminder sits ${String(
        Math.round(
          (offsetFireInstant(HONOLULU, due, DUE_TIME, OFFSET).getTime() -
            offsetFireInstant(KARACHI, due, DUE_TIME, OFFSET).getTime()) /
            3_600_000,
        ),
      )} hours out of place, with the row still saying exactly what the user asked for`,
    )
  })

  test('AC-152: unassignment falls back to the reminder creator\'s zone', async () => {
    const { creator, first } = await stage()
    const { id, due } = await assignedTask('unassigned', first.id)

    await patchTaskOk(
      creator,
      id,
      { assignee_id: null },
      '7.6 admits a null assignee wherever INV-5 does not forbid it, which is any folder with more than one member',
    )
    expect(
      (await requireTaskRow(app.db, id)).assignee_id,
      'the fixture must genuinely be unassigned',
    ).toBeNull()

    expectFireAt(
      await requireReminderRow(app.db, id, 'the reminder survives'),
      offsetFireInstant(NAIROBI, due, DUE_TIME, OFFSET),
      `8.6's second arm takes users.timezone of reminder.created_by once the task is unassigned, which is ${NAIROBI}. An implementation recomputing on assignment and leaving the old assignee's zone in place here keeps a fire instant belonging to someone who can no longer see the task in their own list, and 4.8's NOT NULL fire_at means there is always an instant to be wrong`,
    )
  })

  test('AC-152: assigning an unassigned task recomputes out of the fallback', async () => {
    const { creator, first, second } = await stage()
    const { id, due } = await assignedTask('fallback then assigned', first.id)
    await patchTaskOk(
      creator,
      id,
      { assignee_id: null },
      'unassigned first (spec 7.6)',
    )
    await patchTaskOk(
      creator,
      id,
      { assignee_id: second.id },
      'and assigned to a third zone (spec 7.6)',
    )
    expectFireAt(
      await requireReminderRow(app.db, id, 'the reminder survives'),
      offsetFireInstant(HONOLULU, due, DUE_TIME, OFFSET),
      '8.6 reads the assignee first and the creator only as a fallback, so an assignment out of the fallback state must leave the creator\'s zone behind entirely',
    )
  })

  test('AC-152: a creator who travels moves nothing, and an assignee who travels moves everything', async () => {
    const { creator, first } = await stage()
    const { id, due } = await assignedTask('creator travels', first.id)
    await patchTaskOk(
      creator,
      id,
      { assignee_id: null },
      'unassigned, so the creator\'s zone is the one in force (spec 7.6, 8.6)',
    )
    const before = await requireReminderRow(app.db, id, 'the reminder exists')
    expectFireAt(
      before,
      offsetFireInstant(NAIROBI, due, DUE_TIME, OFFSET),
      'the fallback instant, in the creator\'s zone',
    )

    await cast.reLogin(app, creator, HONOLULU)
    expect(
      await storedZone(app.db, creator.id),
      'the creator really did travel, or this case asserts nothing',
    ).toBe(HONOLULU)
    expect(
      (await requireReminderRow(app.db, id, 'the reminder survives')).fire_at,
      '8.6, from the P7 kickoff on 2026-08-10: the creator\'s zone is a fallback for the computation and not a sixth trigger, so a creator who travels moves nothing any user can observe. The row is only ever read by the loop, which skips an unassigned task anyway',
    ).toBe(before.fire_at)

    // The control in the same case: the trigger that does exist moves it.
    await patchTaskOk(
      creator,
      id,
      { assignee_id: first.id },
      'assigned back (spec 7.6)',
    )
    await cast.reLogin(app, first, NAIROBI)
    expectFireAt(
      await requireReminderRow(app.db, id, 'the reminder survives'),
      offsetFireInstant(NAIROBI, due, DUE_TIME, OFFSET),
      'the assignee\'s zone is a trigger and the creator\'s is not, which is the asymmetry 8.6 records as deliberate rather than as an omission',
    )
  })

  test('AC-152: invariants hold afterwards', async () => {
    const { creator, first, second } = await stage()
    expectSweptTasks(taskIds)
    await expectTaskInvariants(app.db, taskIds, folderIds, [
      creator.id,
      first.id,
      second.id,
    ])
  })
})
