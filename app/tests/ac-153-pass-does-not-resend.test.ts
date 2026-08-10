/*
AC-153: given a reminder the pass has already settled, then a later pass sends
nothing more for it, while a reminder that becomes due between the two passes
is sent by the second.

Proposed here with its test and numbered by the Integration Steward at P7's
mid-package change control on 2026-08-10, so the sentence above is section
12's own text now, transcribed unchanged. Like AC-151 and AC-152 it comes from
the floor rather than from the list, and it is the one with the worst
consequence of the three.

**8.6's poll is over state = 'scheduled' and nothing asserted the state half.**
Every criterion in this range that runs a pass runs one pass. A loop that
polls on `fire_at <= now()` alone, or that sends before it marks, or that
marks in a transaction it then rolls back, sends the same reminder every sixty
seconds for six hours and then, when the row crosses the stale window, stops.
That is 360 emails for one deadline, from the only background process in the
system, on a free provider tier 11.8 records as 100 emails a day.

**At-least-once is not the same as at-least-once-per-tick.** 8.6 accepts a
duplicate and says exactly which one: "a crash between send and the state
write can duplicate one email". That is a tolerated outcome of a fault, not a
licence for a pass that re-sends what it has already delivered, and the
difference between the two is precisely what this criterion pins. Nothing here
injects a crash; two ordinary passes over a settled row is the whole case.

**Both terminal states are asserted**, because a poll filtering on `state <>
'sent'` reads correctly for the sent row and reconsiders every skipped one, of
which the range produces plenty: a completed task, an unassigned one, a stale
one, and every reminder whose date moved backwards.

**The second pass must not be inert.** A reminder that becomes due between the
two passes is delivered by the second one, so "nothing more was sent" is a
statement about the settled rows rather than about a pass that stopped
working. Without it this criterion is satisfied by any implementation that
runs the loop once and never again.

Spec: 8.6 (the poll predicate, the state writes, and the exact duplicate it
accepts), 11.7 (the sixty second interval, the self-healing poll), 11.8 (one
provider, and the daily cap worth watching), 4.8 (state and fired_at).
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
  transition,
} from './tasks-harness.js'
import {
  KARACHI,
  ZoneCast,
  minutesAgo,
  minutesAhead,
  reminderEmails,
  requireReminderRow,
  runPass,
  seedReminderRow,
  setFireAt,
} from './reminders-harness.js'
import { shiftDate, todayIn } from './views-harness.js'

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
    const owner = await cast.signIn(app, 'resend-owner', KARACHI)
    const folderId = await createFolder(owner, 'p7 ac153')
    folderIds.push(folderId)
    staged = { owner, folderId }
  }
  return staged
}

async function dueReminder(label: string, fireAt: Date): Promise<string> {
  const { owner, folderId } = await stage()
  const created = await createTaskOk(
    owner,
    {
      title: `p7 ac153 ${label}`,
      folder_id: folderId,
      due_date: shiftDate(todayIn(KARACHI), 3),
      due_time: '12:00',
    },
    'a dated, timed task is creatable (spec 7.6)',
  )
  taskIds.push(created.id)
  await seedReminderRow(app.db, {
    taskId: created.id,
    createdBy: owner.id,
    offsetMinutes: 30,
    fireAt,
  })
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

describe('AC-153: a settled reminder is not reconsidered', () => {
  test('AC-153: a sent reminder is not sent again by the next pass', async () => {
    const { owner } = await stage()
    const taskId = await dueReminder('sent once', minutesAgo(5))

    let before = reminderEmails(app).length
    await runPass(app)
    expect(
      reminderEmails(app).slice(before).map((email) => email.to),
      'the first pass delivers it',
    ).toEqual([owner.email])
    const settled = await requireReminderRow(app.db, taskId, 'the row settled')
    expect(settled.state, '4.8: the row records the send').toBe('sent')

    before = reminderEmails(app).length
    await runPass(app)
    await runPass(app)
    expect(
      reminderEmails(app).length - before,
      '8.6 polls state = scheduled, so a sent row is not due however long ago its instant was. A loop polling on fire_at alone sends this every sixty seconds until the row crosses the six hour window: 360 emails for one deadline, from a provider whose free tier 11.8 caps at 100 a day',
    ).toBe(0)
    expect(
      await requireReminderRow(app.db, taskId, 'the row survives'),
      'and nothing about the settled row moved, fired_at included: at-least-once accepts one duplicate from a crash between send and mark, which is a fault, not two ordinary passes',
    ).toEqual(settled)
  })

  test('AC-153: a skipped reminder is not reconsidered either', async () => {
    const { owner } = await stage()
    const taskId = await dueReminder('skipped once', minutesAhead(60))
    expectStatus(
      await transition(owner, taskId, 'complete'),
      200,
      'the task is completed, so the loop will skip its reminder (spec 5.1, 8.6)',
    )
    await setFireAt(app.db, taskId, minutesAgo(5))

    let before = reminderEmails(app).length
    await runPass(app)
    const settled = await requireReminderRow(app.db, taskId, 'the row settled')
    expect(
      settled.state,
      'the first pass skips it, which AC-087 is about and this file takes as its starting point',
    ).toBe('skipped')
    expect(reminderEmails(app).length - before, 'sending nothing').toBe(0)

    before = reminderEmails(app).length
    await runPass(app)
    expect(
      await requireReminderRow(app.db, taskId, 'the row survives'),
      'a poll written as state <> sent reads correctly for a delivered row and reconsiders every skipped one, and this range produces plenty of those: a completed task, an unassigned one, a stale one, and every reminder whose date moved backwards',
    ).toEqual(settled)
    expect(
      reminderEmails(app).length - before,
      'and still nothing is sent',
    ).toBe(0)
  })

  test('AC-153: the later pass is not inert, and delivers what became due since', async () => {
    const { owner } = await stage()
    const settled = await dueReminder('settled early', minutesAgo(5))
    const later = await dueReminder('due later', minutesAhead(60))

    let before = reminderEmails(app).length
    await runPass(app)
    expect(
      reminderEmails(app).slice(before).map((email) => email.to),
      'the first pass delivers the one that was due',
    ).toEqual([owner.email])

    // The second reminder's instant arrives between the passes.
    await setFireAt(app.db, later, minutesAgo(1))
    before = reminderEmails(app).length
    await runPass(app)
    expect(
      reminderEmails(app).slice(before).map((email) => email.to),
      'the second pass delivers exactly one email, for the row that became due since. Without this case the two above are satisfied by a loop that runs once and never works again',
    ).toEqual([owner.email])
    expect(
      (await requireReminderRow(app.db, later, 'the second row')).state,
      'and that row is now settled too',
    ).toBe('sent')
    expect(
      (await requireReminderRow(app.db, settled, 'the first row')).state,
      'while the first stays exactly as it was',
    ).toBe('sent')
  })

  test('AC-153: invariants hold afterwards', async () => {
    const { owner } = await stage()
    expectSweptTasks(taskIds)
    await expectTaskInvariants(app.db, taskIds, folderIds, [owner.id])
  })
})
