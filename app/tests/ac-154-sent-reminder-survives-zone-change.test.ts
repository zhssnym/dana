/*
AC-154: given the assignee's timezone changes, then a reminder already in
state sent is left entirely untouched, its state, fire_at and fired_at all
unchanged, while a scheduled reminder recomputed by the same sync proves the
trigger ran.

**This one did not come from here, and the difference is worth keeping.** The
P7 tester session escalated the silence and deliberately asserted neither
reading of it, since frozen 7.1 scopes PATCH /me's recompute to "scheduled
reminders on tasks assigned to V" while 8.6's trigger sentence names no state
it resets from, so a delivered row read the second way returns to scheduled
and the loop mails it a second time. The change control of 2026-08-10 ruled
the narrow reading into 8.6 and appended the criterion from its own ruling,
the AC-124 and AC-141 shape, so the sentence above is settled text and only
this test is the Adversarial Test role's.

**The ground it was settled on is narrower than the one this suite argued,
and testing the wrong ground would produce a wrong test.** The escalation's
recommendation carried "a sent reminder is history", and the Steward declined
that as over-general: generalized across all five triggers it would mean a
user who pushes a deadline out by a week hears nothing at all while still
seeing a reminder configured on the task. The line the ruling draws instead is
what the trigger changes. Four of the five change the occasion the reminder is
about, its deadline through due_date or due_time, its lead time through the
reminder's own value or mode, or the person owed it through assignee_id, and a
new occasion earns a delivery of its own. A zone change alters neither the
deadline nor the recipient; it re-expresses an unchanged occasion on a
different wall clock. So this file is about the timezone trigger and no other,
and it does not assert that sent is terminal in general. AC-148 pins the
opposite where the opposite holds: a PUT, which changes the reminder's own
value, does return a sent row to scheduled.

**The second clause is what stops the first from passing for free.** A sync
that recomputed nothing at all, or a login that never wrote the zone, leaves
the sent row untouched exactly as the rule requires. So a scheduled reminder
on a second task rides every case here and must move in the same sync, which
makes the untouched row a scoping fact rather than an implementation that does
nothing. This is the pattern AC-086's three absence cases already carry and
the reason the criterion's own text names it.

**Entirely untouched means three columns, and fired_at is the one worth
naming.** 4.8 sets fired_at when state leaves scheduled, so a route that
recomputed the instant and then noticed the state and put it back would leave
fire_at moved with fired_at intact, which reads as a delivered reminder about
a moment it was never scheduled for. The ruling's own second consequence is
the other side of that column: where one of the other four triggers does
revive a sent row, fired_at is cleared with it, so 4.8's note stays true of
every row. That half is AC-148's territory, and its sent case asserts it; the
same question asked of a skipped row is routed to the Integration Steward from
that file rather than asserted in either.

**Both doors of the trigger are exercised**, the login sync the criterion
names and the PATCH /me that frozen 7.1 charges with the same recompute, for
the reason AC-086 gives: an implementation wiring one and not the other
satisfies whichever half is tested.

The skipped row rides along as the ruling's first recorded consequence, that a
skipped row is outside this trigger too, 7.1's scope taken at its word. It is
asserted in its own case rather than folded into the sent one, because the two
states reach terminal by different routes and an implementation filtering on
`state = 'scheduled'` and one filtering on `state <> 'sent'` differ exactly
there.

Zones here are Asia/Karachi, Pacific/Honolulu and Africa/Nairobi, none of
which observes DST, so every difference this file measures is a zone
difference and no fixture predicts a transition (section 13 item 25).

Spec: 8.6 (the trigger list, and the delivered-reminder ruling of 2026-08-10
with its two recorded consequences), 7.1 (the tz parameter, the callback's
sync, and PATCH /me's recompute scoped to scheduled reminders on tasks
assigned to V), 8.1 (users.timezone's one consumer), 4.8 (state, fire_at,
fired_at), 11.7.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { signIn, startAuthTestApp } from './auth-harness.js'
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
  ZoneCast,
  putReminderOk,
  requireReminderRow,
  setReminderState,
  storedZone,
} from './reminders-harness.js'
import type { ReminderRow } from './reminders-harness.js'
import { shiftDate, todayIn } from './views-harness.js'

let app: AuthTestApp
const cast = new ZoneCast('p7')

const HONOLULU = 'Pacific/Honolulu' // UTC-10, no DST
const NAIROBI = 'Africa/Nairobi' // UTC+3, no DST
const DUE_TIME = '12:00'

const taskIds: string[] = []
const folderIds: string[] = []
const actorIds: string[] = []

/**
 * One traveler with a folder of their own, so each case owns its fixture and
 * none depends on the order the others ran in. Every actor's zone is stated,
 * which 8.6 makes a precondition of having an expected answer at all.
 */
async function traveler(
  slug: string,
): Promise<{ actor: Actor; folderId: string; due: string }> {
  const actor = await cast.signIn(app, slug, KARACHI)
  const folderId = await createFolder(actor, `p7 ac154 ${slug}`)
  folderIds.push(folderId)
  actorIds.push(actor.id)
  // Thirty days out, so the instant is in the future and a recompute that
  // does run leaves the moved row scheduled rather than skipped.
  return { actor, folderId, due: shiftDate(todayIn(KARACHI), 30) }
}

async function remindedTask(
  actor: Actor,
  folderId: string,
  label: string,
  due: string,
): Promise<string> {
  const created = await createTaskOk(
    actor,
    {
      title: `p7 ac154 ${label}`,
      folder_id: folderId,
      due_date: due,
      due_time: DUE_TIME,
    },
    'a dated, timed task thirty days out is creatable (spec 7.6)',
  )
  taskIds.push(created.id)
  await putReminderOk(
    actor,
    created.id,
    { offset_minutes: 0 },
    `a reminder at the due instant on ${label} (spec 7.9)`,
  )
  return created.id
}

/**
 * A reminder that has already been delivered: the row is written through the
 * write path so its instant is 8.6's own, then moved into the terminal state
 * the loop would have left it in, fired_at and all. Seeding the state rather
 * than running a pass keeps this file's red attributable to the trigger under
 * test instead of to the scheduler module.
 */
async function deliveredReminder(
  actor: Actor,
  folderId: string,
  label: string,
  due: string,
): Promise<{ taskId: string; before: ReminderRow }> {
  const taskId = await remindedTask(actor, folderId, label, due)
  await setReminderState(app.db, taskId, 'sent')
  const before = await requireReminderRow(
    app.db,
    taskId,
    'the delivered reminder exists before the zone changes',
  )
  expect(
    before.state,
    'the fixture must genuinely be delivered, or this file asserts nothing',
  ).toBe('sent')
  expect(
    before.fired_at,
    '4.8 sets fired_at when state leaves scheduled, so a delivered row carries one and that is the third column this criterion names',
  ).not.toBeNull()
  return { taskId, before }
}

/** The whole of what "entirely untouched" means, in one place, so no case
 * can assert two of the three columns and look complete. */
function expectUntouched(
  after: ReminderRow,
  before: ReminderRow,
  why: string,
): void {
  expect(
    {
      state: after.state,
      fire_at: after.fire_at,
      fired_at: after.fired_at,
      offset_minutes: after.offset_minutes,
      time_of_day: after.time_of_day,
    },
    why,
  ).toEqual({
    state: before.state,
    fire_at: before.fire_at,
    fired_at: before.fired_at,
    offset_minutes: before.offset_minutes,
    time_of_day: before.time_of_day,
  })
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-154: a delivered reminder is not revived by a zone change', () => {
  test('AC-154: a login sync leaves the sent row alone and moves the scheduled one', async () => {
    const { actor, folderId, due } = await traveler('login-sync')
    const { taskId: sent, before } = await deliveredReminder(
      actor,
      folderId,
      'already delivered',
      due,
    )
    const scheduled = await remindedTask(
      actor,
      folderId,
      'still scheduled',
      due,
    )
    const scheduledBefore = await requireReminderRow(
      app.db,
      scheduled,
      'the scheduled reminder exists',
    )
    expect(
      scheduledBefore.fire_at,
      `${DUE_TIME} on ${due} in ${KARACHI}, which is UTC+5 all year`,
    ).toBe(`${due}T07:00:00.000000Z`)

    await cast.reLogin(app, actor, HONOLULU)
    expect(
      await storedZone(app.db, actor.id),
      '7.1 and 8.1: a returning login reporting a different zone writes it, which AC-007 pins and this criterion depends on',
    ).toBe(HONOLULU)

    // The second clause first, because it is what makes the first mean
    // anything: a sync that recomputed nothing at all would satisfy the
    // untouched half perfectly.
    expect(
      (await requireReminderRow(app.db, scheduled, 'the scheduled reminder'))
        .fire_at,
      `8.6: the assignee's users.timezone is a recompute trigger, so a scheduled row moves to ${DUE_TIME} on ${due} in ${HONOLULU}. This is the proof that the trigger ran at all, and without it the case below passes against a login that syncs nothing`,
    ).toBe(`${due}T22:00:00.000000Z`)

    expectUntouched(
      await requireReminderRow(app.db, sent, 'the delivered reminder survives'),
      before,
      '8.6 as ruled on 2026-08-10: a reminder already delivered is not revived by a timezone change. The trigger alters neither the deadline nor the recipient, it re-expresses an unchanged occasion on a different wall clock, so reviving the row sends one person the same reminder about the same deadline twice. State, fire_at and fired_at all stand',
    )
  })

  test('AC-154: PATCH /me is the other door, and answers the same way', async () => {
    const { actor, folderId, due } = await traveler('patch-me')
    const { taskId: sent, before } = await deliveredReminder(
      actor,
      folderId,
      'delivered before the patch',
      due,
    )
    const scheduled = await remindedTask(
      actor,
      folderId,
      'scheduled through the patch',
      due,
    )

    const response = await actor.browser.json('/me', 'PATCH', {
      timezone: NAIROBI,
    })
    expectStatus(
      response,
      200,
      'PATCH /me with an IANA zone answers 200 with the /me object (spec 7.1)',
    )
    expect(await storedZone(app.db, actor.id), 'and the column moved').toBe(
      NAIROBI,
    )

    expect(
      (await requireReminderRow(app.db, scheduled, 'the scheduled reminder'))
        .fire_at,
      `7.1 charges PATCH /me with the recompute in its own text, so the scheduled row moves to ${DUE_TIME} on ${due} in ${NAIROBI}`,
    ).toBe(`${due}T09:00:00.000000Z`)

    expectUntouched(
      await requireReminderRow(app.db, sent, 'the delivered reminder survives'),
      before,
      '7.1 scopes its recompute to "scheduled reminders on tasks assigned to V", which is the same rule through the other door. An implementation wiring the narrow reading at the login and the wide one here fails exactly this case',
    )
  })

  test('AC-154: a skipped reminder is outside the trigger too', async () => {
    const { actor, folderId, due } = await traveler('skipped')
    const skipped = await remindedTask(actor, folderId, 'skipped row', due)
    await setReminderState(app.db, skipped, 'skipped')
    const before = await requireReminderRow(
      app.db,
      skipped,
      'the skipped reminder exists',
    )
    const scheduled = await remindedTask(
      actor,
      folderId,
      'scheduled beside it',
      due,
    )

    await cast.reLogin(app, actor, HONOLULU)

    expect(
      (await requireReminderRow(app.db, scheduled, 'the scheduled reminder'))
        .fire_at,
      'the control again: the trigger ran',
    ).toBe(`${due}T22:00:00.000000Z`)
    expectUntouched(
      await requireReminderRow(app.db, skipped, 'the skipped reminder survives'),
      before,
      '8.6 as ruled records this consequence explicitly: a skipped row is outside the timezone trigger too, that being 7.1\'s scope taken at its word. An implementation filtering on state <> sent moves this row and passes every other case in this file',
    )
  })

  test('AC-154: an alias zone and a tz-less login leave the sent row alone for the other reason', async () => {
    const { actor, folderId, due } = await traveler('no-op syncs')
    const { taskId: sent, before } = await deliveredReminder(
      actor,
      folderId,
      'delivered, no-op syncs',
      due,
    )
    const scheduled = await remindedTask(
      actor,
      folderId,
      'scheduled, no-op syncs',
      due,
    )
    const scheduledBefore = await requireReminderRow(
      app.db,
      scheduled,
      'the scheduled reminder exists',
    )

    // A login carrying no tz syncs nothing (8.1), so nothing recomputes and
    // the sent row is untouched for a reason that is not this criterion's.
    // Asserted so a passing file cannot be read as evidence of the rule when
    // the trigger never fired.
    app.stub.nextIdentity({
      sub: actor.sub,
      email: actor.email,
      email_verified: true,
      name: 'P7 silent',
    })
    await signIn(app)
    expect(
      await storedZone(app.db, actor.id),
      '8.1: a login carrying no tz syncs nothing',
    ).toBe(KARACHI)
    expect(
      (await requireReminderRow(app.db, scheduled, 'the scheduled reminder'))
        .fire_at,
      'so the scheduled row does not move either, which is the shape of a case that proves nothing about this criterion',
    ).toBe(scheduledBefore.fire_at)
    expectUntouched(
      await requireReminderRow(app.db, sent, 'the delivered reminder'),
      before,
      'and the sent row stands, for the trigger not having fired rather than for the ruling',
    )

    // Now a real change, on the same fixture: the scheduled row moves and the
    // sent row still does not. This is the pair the criterion is about.
    await cast.reLogin(app, actor, HONOLULU)
    expect(
      (await requireReminderRow(app.db, scheduled, 'the scheduled reminder'))
        .fire_at,
      'the trigger fires now',
    ).not.toBe(scheduledBefore.fire_at)
    expectUntouched(
      await requireReminderRow(app.db, sent, 'the delivered reminder survives'),
      before,
      '8.6 as ruled: and this is the sent row untouched under a trigger that demonstrably ran, which is the whole criterion in one pair',
    )
  })

  test('AC-154: invariants hold afterwards', async () => {
    expectSweptTasks(taskIds)
    await expectTaskInvariants(app.db, taskIds, folderIds, actorIds)
  })
})
