/*
AC-086: given the assignee's timezone changes via login sync, then scheduled
fire_at values recompute.

**This is the one trigger of the five that fires outside the Collaboration
engineer's endpoints.** The P7 kickoff added it to the reminders seam of
docs/team/README.md because no file named it: the fifth trigger lives in the
Security engineer's auth module, at the login sync and at PATCH /me, and that
persona mentions reminders nowhere. Frozen 7.1 carries the obligation in its
own text for the second of those two doors, "Recomputes fire_at for scheduled
reminders on tasks assigned to V", and the criterion names the first. Both are
asserted here, in cases that say which door they went through, because an
implementation that wires one and not the other satisfies whichever half is
tested and leaves a traveler's reminders an hour or five wrong through the
other.

**The zone change is asserted as a relationship, not as a shift.** Two tasks,
due dates either side of a transition in the new zone, both moved by one
login. Before the change both instants sit at the same UTC time of day, the
old zone having no DST; after it they must differ by exactly the DST hour. An
implementation that applies one offset delta to every affected row keeps them
identical and passes any single-task fixture. The dates are historical
(section 13 item 25) and the transition is asserted before the arithmetic
leans on it.

**Three absences, each with its positive control in the same case.** A
reminder on a task assigned to someone else must not move, which is 7.1's own
scoping and the difference between recomputing V's reminders and recomputing
the folder's. A tzdb alias of the stored zone is not a different zone (8.1),
so US/Eastern arriving over America/New_York writes nothing and recomputes
nothing; AC-007 pins the column half of that rule and nothing pinned the
reminder half. And a login carrying no tz syncs nothing, so it triggers
nothing. All three are absences, and on a branch with no implementation
nothing moves anyway, so each one first shows the same fixture moving under a
real change: without that control these cases would pass today and go on
passing against an implementation that never recomputed at all.

**One case is deliberately absent and is escalated instead.** Whether a
reminder already in state = sent recomputes is not settled: 7.1 scopes the
recompute to "scheduled reminders" and this criterion's own text says
"scheduled fire_at values", while 8.6's trigger sentence resets state to
scheduled whenever the new instant is in the future and names no state it
starts from. Read the second way, a delivered reminder returns to scheduled
and is delivered again. This file asserts neither reading; the question is
routed to the Integration Steward with a recommendation.

Spec: 8.6 (the trigger list), 7.1 (the tz parameter, the callback's sync, and
PATCH /me's recompute), 8.1 (users.timezone's one consumer, and the alias
rule), 4.1, section 13 item 25.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { signIn, startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { addMemberOk, connect, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  createTaskOk,
  expectSweptTasks,
  expectTaskInvariants,
} from './tasks-harness.js'
import {
  KARACHI,
  NEW_YORK,
  ZoneCast,
  expectFireAt,
  offsetAt,
  putReminderOk,
  requireReminderRow,
  storedZone,
} from './reminders-harness.js'
import { shiftDate, todayIn } from './views-harness.js'

let app: AuthTestApp
const cast = new ZoneCast('p7')

const HONOLULU = 'Pacific/Honolulu' // UTC-10, no DST, measured across 2026 at P4
const CANONICAL = 'America/New_York'
const ALIAS = 'US/Eastern' // a tzdb link to the line above, not a second zone

const WINTER_DUE = '2010-01-15'
const SUMMER_DUE = '2010-07-15'
const DUE_TIME = '09:00'

const taskIds: string[] = []
const folderIds: string[] = []
const actorIds: string[] = []

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

/** An actor with a folder of their own, so each case owns its fixture and no
 * case depends on the order the others ran in. */
async function traveler(
  slug: string,
  zone: string,
): Promise<{ actor: Actor; folderId: string }> {
  const actor = await cast.signIn(app, slug, zone)
  const folderId = await createFolder(actor, `p7 ac086 ${slug}`)
  folderIds.push(folderId)
  actorIds.push(actor.id)
  return { actor, folderId }
}

async function remindedTask(
  actor: Actor,
  folderId: string,
  label: string,
  dueDate: string,
  dueTime = DUE_TIME,
): Promise<string> {
  const task = await createTaskOk(
    actor,
    {
      title: `p7 ac086 ${label}`,
      folder_id: folderId,
      due_date: dueDate,
      due_time: dueTime,
    },
    'a dated, timed task is creatable (spec 7.6)',
  )
  taskIds.push(task.id)
  await putReminderOk(
    actor,
    task.id,
    { offset_minutes: 0 },
    `a reminder at the due instant on ${label} (spec 7.9)`,
  )
  return task.id
}

describe('AC-086: the assignee\'s zone changes and the instants follow', () => {
  test('AC-086: a returning login from another zone recomputes a scheduled reminder', async () => {
    const { actor, folderId } = await traveler('login-sync', KARACHI)
    // A future due date in two zones that observe no DST, so nothing here
    // depends on a transition anyone has to predict (section 13 item 25).
    const due = shiftDate(todayIn(KARACHI), 30)
    const taskId = await remindedTask(actor, folderId, 'login sync', due, '12:00')

    const before = await requireReminderRow(app.db, taskId, 'the reminder exists')
    expect(before.state, 'a future instant leaves the row scheduled').toBe(
      'scheduled',
    )
    expect(
      before.fire_at,
      `12:00 on ${due} in ${KARACHI}, which is UTC+5 all year`,
    ).toBe(`${due}T07:00:00.000000Z`)

    await cast.reLogin(app, actor, HONOLULU)
    expect(
      await storedZone(app.db, actor.id),
      '7.1 and 8.1: a returning login reporting a different zone writes it, which AC-007 already pins and this criterion depends on',
    ).toBe(HONOLULU)

    const after = await requireReminderRow(app.db, taskId, 'the reminder survives')
    expect(
      after.fire_at,
      `8.6: the assignee's users.timezone is a recompute trigger, so 12:00 on ${due} in ${HONOLULU}, which is UTC-10`,
    ).toBe(`${due}T22:00:00.000000Z`)
    expect(after.state, 'and the new instant is still in the future').toBe(
      'scheduled',
    )
  })

  test('AC-086: PATCH /me recomputes through the other door 7.1 names', async () => {
    const { actor, folderId } = await traveler('patch-me', KARACHI)
    const due = shiftDate(todayIn(KARACHI), 30)
    const taskId = await remindedTask(actor, folderId, 'patch me', due, '12:00')

    const response = await actor.browser.json('/me', 'PATCH', {
      timezone: HONOLULU,
    })
    expectStatus(
      response,
      200,
      'PATCH /me with an IANA zone answers 200 with the /me object (spec 7.1)',
    )
    expect(
      await storedZone(app.db, actor.id),
      'and the column moved',
    ).toBe(HONOLULU)
    expect(
      (await requireReminderRow(app.db, taskId, 'the reminder survives')).fire_at,
      '7.1 states the obligation on this endpoint in its own text: PATCH /me recomputes fire_at for scheduled reminders on tasks assigned to V. The criterion names the login door and this is the other one, and an implementation wiring one of the two passes half of this file',
    ).toBe(`${due}T22:00:00.000000Z`)
  })

  test('AC-086: one login recomputes two due dates either side of a transition', async () => {
    expect(
      offsetAt(NEW_YORK, new Date(`${WINTER_DUE}T12:00:00Z`)),
      `${NEW_YORK} must still be UTC-5 on ${WINTER_DUE} (section 13 item 25)`,
    ).toBe(-300)
    expect(
      offsetAt(NEW_YORK, new Date(`${SUMMER_DUE}T12:00:00Z`)),
      `and UTC-4 on ${SUMMER_DUE}`,
    ).toBe(-240)

    const { actor, folderId } = await traveler('two-seasons', KARACHI)
    const winter = await remindedTask(actor, folderId, 'winter', WINTER_DUE)
    const summer = await remindedTask(actor, folderId, 'summer', SUMMER_DUE)

    // Karachi has no DST, so before the change the two instants sit at the
    // same UTC time of day. That is what makes the hour appear only after.
    expectFireAt(
      await requireReminderRow(app.db, winter, 'the winter row'),
      new Date('2010-01-15T04:00:00Z'),
      `09:00 on ${WINTER_DUE} in ${KARACHI}`,
    )
    expectFireAt(
      await requireReminderRow(app.db, summer, 'the summer row'),
      new Date('2010-07-15T04:00:00Z'),
      `09:00 on ${SUMMER_DUE} in the same zone, at the same UTC time of day`,
    )

    await cast.reLogin(app, actor, NEW_YORK)
    expectFireAt(
      await requireReminderRow(app.db, winter, 'the winter row'),
      new Date('2010-01-15T14:00:00Z'),
      `09:00 on ${WINTER_DUE} in ${NEW_YORK}, at UTC-5`,
    )
    expectFireAt(
      await requireReminderRow(app.db, summer, 'the summer row'),
      new Date('2010-07-15T13:00:00Z'),
      `09:00 on ${SUMMER_DUE} in the same new zone, at UTC-4. One login moved both, and 8.6 resolves each local time in the zone as it stood on that row's own due date. An implementation applying one offset delta to every affected row leaves these two at the same UTC time of day, as they were before the login`,
    )
  })

  test('AC-086: the recompute is scoped to tasks assigned to the traveler', async () => {
    const { actor: traveling, folderId } = await traveler('scoped', KARACHI)
    const other = await cast.signIn(app, 'stay-at-home', HONOLULU)
    actorIds.push(other.id)
    await connect(app.db, traveling.id, other.id)
    await addMemberOk(traveling, folderId, other.id)

    const due = shiftDate(todayIn(KARACHI), 30)
    const mine = await remindedTask(traveling, folderId, 'mine', due, '12:00')
    const theirs = await createTaskOk(
      traveling,
      {
        title: 'p7 ac086 theirs',
        folder_id: folderId,
        due_date: due,
        due_time: '12:00',
        assignee_id: other.id,
      },
      'a task in the same folder assigned to the other member (spec 7.6)',
    )
    taskIds.push(theirs.id)
    await putReminderOk(
      traveling,
      theirs.id,
      { offset_minutes: 0 },
      'a reminder on the other member\'s task (spec 7.9)',
    )
    const theirsBefore = await requireReminderRow(
      app.db,
      theirs.id,
      'the other member\'s row',
    )
    expect(
      theirsBefore.fire_at,
      `computed in the assignee's zone, ${HONOLULU}`,
    ).toBe(`${due}T22:00:00.000000Z`)

    await cast.reLogin(app, traveling, NEW_YORK)

    // The control first: this row must have moved, or the case below proves
    // nothing at all.
    expect(
      (await requireReminderRow(app.db, mine, 'the traveler\'s own row')).fire_at,
      `12:00 on ${due} in ${NEW_YORK} after the login`,
    ).not.toBe(`${due}T07:00:00.000000Z`)
    expect(
      (await requireReminderRow(app.db, theirs.id, 'the other member\'s row'))
        .fire_at,
      '7.1 scopes the recompute to scheduled reminders on tasks assigned to V, and 8.6 computes every instant in the assignee\'s zone. This task is assigned to someone who did not travel, so a recompute that swept the folder, or every task the traveler created, moves it and breaks the other member\'s reminder',
    ).toBe(theirsBefore.fire_at)
  })

  test('AC-086: a tzdb alias of the stored zone changes nothing', async () => {
    const { actor, folderId } = await traveler('alias', CANONICAL)
    const due = shiftDate(todayIn(CANONICAL), 30)
    const taskId = await remindedTask(actor, folderId, 'alias', due, '12:00')
    const before = await requireReminderRow(app.db, taskId, 'the reminder exists')

    await cast.reLogin(app, actor, ALIAS)
    expect(
      await storedZone(app.db, actor.id),
      `8.1: a reported zone that is a tzdb alias of the stored one is not a different zone, so ${ALIAS} over ${CANONICAL} writes nothing (AC-007 pins this half)`,
    ).toBe(CANONICAL)
    expect(
      (await requireReminderRow(app.db, taskId, 'the reminder survives')).fire_at,
      '8.1 says no write and no 8.6 recompute, and this is the half no criterion pinned',
    ).toBe(before.fire_at)

    // The control, in the same case: a genuine change moves the same row, so
    // the equality above is a scoping fact rather than an implementation that
    // recomputes nothing ever.
    await cast.reLogin(app, actor, HONOLULU)
    expect(
      (await requireReminderRow(app.db, taskId, 'the reminder survives')).fire_at,
      'the same fixture under a real zone change',
    ).not.toBe(before.fire_at)
  })

  test('AC-086: a login carrying no tz triggers no recompute', async () => {
    const { actor, folderId } = await traveler('silent-login', KARACHI)
    const due = shiftDate(todayIn(KARACHI), 30)
    const taskId = await remindedTask(actor, folderId, 'silent', due, '12:00')
    const before = await requireReminderRow(app.db, taskId, 'the reminder exists')

    app.stub.nextIdentity({
      sub: actor.sub,
      email: actor.email,
      email_verified: true,
      name: 'P7 silent',
    })
    // No tz on the authorization, which is its own case in 8.1.
    await signIn(app)

    expect(
      await storedZone(app.db, actor.id),
      '8.1: a login carrying no tz syncs nothing',
    ).toBe(KARACHI)
    expect(
      (await requireReminderRow(app.db, taskId, 'the reminder survives')).fire_at,
      'and a column that did not change triggers nothing, so the instant stands',
    ).toBe(before.fire_at)

    await cast.reLogin(app, actor, HONOLULU)
    expect(
      (await requireReminderRow(app.db, taskId, 'the reminder survives')).fire_at,
      'the control: a login that does carry a zone moves the same row',
    ).not.toBe(before.fire_at)
  })

  test('AC-086: invariants hold afterwards', async () => {
    expectSweptTasks(taskIds)
    await expectTaskInvariants(app.db, taskIds, folderIds, actorIds)
  })
})
