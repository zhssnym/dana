/*
AC-142: Given two identical overdue recurring occurrences completed at one
instant with tz values a calendar day apart, then their successors are dated
exactly a day apart; given a present tz that is not an IANA identifier on
complete or abandon, then 422 naming tz whatever the row holds; given an
absent tz where the transition would run generation, then 422 naming tz with
the row unchanged and no successor, and the same call with a zone
transitions.

Proposed here with its test and numbered by the Integration Steward at P6's
mid-package change control on 2026-08-10, so the sentence above is section
12's own text now; it is transcribed unchanged, the AC-125 to AC-130 and
AC-133 to AC-140 precedent for a batch authored on the branch and numbered
additively so nothing moves.

**Why it is a number rather than an assertion inside AC-072.** The human
owner ruled on 2026-08-10 that POST /tasks/:id/complete and
/tasks/:id/abandon take tz, and frozen 7.6 carries the ruling in three
appended paragraphs. Nothing numbered touched any of it. That was the
same hole AC-132 was written to close one package earlier, and its header
records what the hole cost: the pull's zone went unpinned for three packages,
the implementation read users.timezone because no criterion could tell the
difference, and the failure surfaced as an acceptance suite that passed at
21:00 UTC and failed at 22:00 for four sessions running. The shape here is
identical and the arithmetic is worse. AC-072 to AC-075 pin the cutoff's
value, but every one of them is satisfiable from the wrong zone for most of
every day: due dates dominate the max in AC-072 and AC-075, and in AC-073 and
AC-074 a cutoff one day early still lands on the same instance for the fixture
they use. So an engine reading users.timezone passes the whole range and
fails somewhere in it, unpredictably, whenever a run crosses the window where
the account's zone and the request's disagree.

**The first case is what no other zone source can satisfy.** Two identical
occurrences, overdue by a month so the cutoff dominates the max, completed at
one instant with Pacific/Kiritimati and Pacific/Honolulu. Those two zones are
exactly 24 hours apart with neither observing DST, measured hourly across
2026 by the P4 session that added them, so their civil dates differ by one at
every instant. The successors must therefore be dated exactly one day apart,
and no implementation reading the zone from anywhere else can produce that:
users.timezone is one value, the process clock is one value, the database
clock is one value, and each yields the same date for both calls. The two
completions are issued together rather than in sequence, so the pair cannot
straddle a local midnight between them.

**The two refusals are different rules and are asserted separately.** A
present value that is not an IANA name is refused always, on either endpoint
and whatever the row holds, because 7.0 refuses a value outside what a
parameter admits rather than narrowing it to a default; that includes the
rows where no date would have been evaluated at all. An absent value is
refused exactly where the transition would run generation, which is the
winning guarded update landing on a pending row that carries a rule, and
nowhere else: a rule-less row still completes with no tz, a repeat complete
on a settled row still answers 200, and a complete on an abandoned row still
answers 409. Getting this backwards in either direction is a live risk. Made
required always, it turns every tz-less transition in P3's passing files red;
made optional in effect, it puts the defect back.

**The absent-tz refusal is a rollback assertion as much as a status
assertion.** 7.6 says the transaction changes nothing: the row does not
transition, no successor is created, and the same call retried with a zone
gets the transition it asked for. A route that refused after writing would
answer 422 over a completed row, which is worse than either behavior on its
own, and only the retry proves the refusal was the zone rather than the
request.

Spec: 7.6 as ruled on 2026-08-10 (the three appended paragraphs), 8.5 (cutoff
= max(due_date, current_date(actor.tz)), and the sentence binding actor.tz to
the request's zone), 8.1 (today from the request's zone; users.timezone
reserved for reminder instants), 7.0 (422 naming the field; a parameter is
never narrowed to a default), 5.1, 11.15 (Intl accepts offset identifiers
that are not IANA names).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  createTaskOk,
  expectSweptTasks,
  expectTaskInvariants,
  requireTaskRow,
  transition,
} from './tasks-harness.js'
import {
  requireGenerated,
  requireOneSuccessor,
  seedRecurringTask,
  successorsOf,
  transitionRecurringOk,
  transitionWithTz,
  transitionWithoutTz,
} from './recurrence-harness.js'
import type { RecurringFixture } from './recurrence-harness.js'
import {
  ZONE_AHEAD,
  ZONE_BEHIND,
  daysBetween,
  middayZone,
  shiftDate,
  todayIn,
} from './views-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'p6')

const tz = middayZone()

/*
Values that are not IANA names, the list AC-130 measured for the view
endpoints. The first two are the ECMA-402 offset identifiers 11.15 names,
which bare Intl accepts and the shared validator refuses through its sign
guard; the rest are what a client sends when something upstream went wrong.
*/
const NOT_IANA = ['+05:30', '-08:00', 'Not/AZone', 'UTC+2', 'Etc/GMT+99']

interface Stage {
  owner: Actor
  folderId: string
}
let staged: Stage | undefined
const taskIds: string[] = []

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner] = await cast.of(app)
    if (owner === undefined) throw new Error('cast must produce one actor')
    const folderId = await createFolder(owner, 'p6 ac142 zone')
    staged = { owner, folderId }
  }
  return staged
}

/**
 * A daily occurrence a month overdue in every zone on earth, so cutoff =
 * max(due_date, current_date(actor.tz)) is the current date rather than the
 * due date and the successor is tomorrow in whichever zone the request
 * named. The due date is computed in the behind zone and pushed a further
 * month back, so no zone's today can be at or before it.
 */
async function overdueDaily(label: string): Promise<RecurringFixture> {
  const { owner, folderId } = await stage()
  const fixture = await seedRecurringTask(app.db, owner, {
    folderId,
    title: `p6 ac142 ${label}`,
    dueDate: shiftDate(todayIn(ZONE_BEHIND), -30),
    rule: 'FREQ=DAILY',
  })
  taskIds.push(fixture.taskId)
  return fixture
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-142: the cutoff is computed in the request\'s zone', () => {
  test('AC-142: two zones a day apart produce successors a day apart', async () => {
    const { owner } = await stage()
    const ahead = await overdueDaily('completed from the ahead zone')
    const behind = await overdueDaily('completed from the behind zone')

    // Issued together: the pair must not straddle a local midnight, and
    // sequential calls are the only way it could.
    const [aheadBody, behindBody] = await Promise.all([
      transitionWithTz(owner, ahead.taskId, 'complete', ZONE_AHEAD),
      transitionWithTz(owner, behind.taskId, 'complete', ZONE_BEHIND),
    ])
    expectStatus(
      aheadBody,
      200,
      `a complete carrying a valid IANA zone is accepted (spec 7.6 as ruled 2026-08-10); ${ZONE_AHEAD}`,
    )
    expectStatus(
      behindBody,
      200,
      `the same from the other side of the date line; ${ZONE_BEHIND}`,
    )

    const aheadSuccessor = await requireOneSuccessor(
      app.db,
      ahead.seriesId,
      ahead.taskId,
      'the completion in the ahead zone generated',
    )
    const behindSuccessor = await requireOneSuccessor(
      app.db,
      behind.seriesId,
      behind.taskId,
      'the completion in the behind zone generated',
    )
    taskIds.push(aheadSuccessor.id, behindSuccessor.id)

    expect(
      daysBetween(
        String(behindSuccessor.due_date),
        String(aheadSuccessor.due_date),
      ),
      `8.5 computes cutoff from current_date(actor.tz), and 8.1 makes that the request's zone. ${ZONE_AHEAD} and ${ZONE_BEHIND} are 24 hours apart with no DST, so their civil dates differ by one at every instant and the two successors must too. Any single zone source, the account's column, the process clock, the database clock, dates both the same. Got ${String(behindSuccessor.due_date)} and ${String(aheadSuccessor.due_date)}`,
    ).toBe(1)
  })

  test('AC-142: each successor is tomorrow in the zone its request named', async () => {
    const { owner } = await stage()
    const fixture = await overdueDaily('named zone')
    // The account is provisioned UTC, the harness signing in without the 7.1
    // parameter, so a zone that is not UTC is the discriminator against the
    // stored column even on its own.
    const zone = ZONE_AHEAD
    await transitionRecurringOk(
      owner,
      fixture.taskId,
      'complete',
      zone,
      'the completion is accepted (spec 5.1, 7.6)',
    )
    const successor = await requireOneSuccessor(
      app.db,
      fixture.seriesId,
      fixture.taskId,
      'the completion generated',
    )
    taskIds.push(successor.id)
    expect(
      String(successor.due_date),
      `8.5: the next daily instance strictly after today in ${zone}`,
    ).toBe(shiftDate(todayIn(zone), 1))
  })

  test('AC-142: a present tz that is not an IANA name is refused, whatever the row holds', async () => {
    const { owner, folderId } = await stage()
    const recurring = await overdueDaily('invalid zone, rule-carrying')
    const plain = await createTaskOk(
      owner,
      {
        title: 'p6 ac142 no rule at all',
        folder_id: folderId,
        due_date: todayIn(tz),
      },
      'a dated task with no rule is creatable (spec 7.6)',
    )
    taskIds.push(plain.id)

    const answered: string[] = []
    for (const zone of NOT_IANA) {
      for (const event of ['complete', 'abandon'] as const) {
        for (const [what, taskId] of [
          ['a rule-carrying pending row', recurring.taskId],
          ['a rule-less pending row', plain.id],
        ] as const) {
          const response = await transitionWithTz(
            owner,
            taskId,
            event,
            zone,
          )
          if (response.status !== 422) {
            answered.push(
              `${event} on ${what} with ${JSON.stringify(zone)} answered ${String(response.status)}`,
            )
          }
        }
      }
    }
    expect(
      answered,
      '7.6 as ruled on 2026-08-10: a present value that fails validation answers 422 naming tz always, on either endpoint and whatever the row holds, because 7.0 refuses a value outside what a parameter admits rather than narrowing it to a default',
    ).toEqual([])

    expect(
      String((await requireTaskRow(app.db, plain.id)).status),
      'and none of those refusals transitioned anything',
    ).toBe('pending')
    expect(
      await successorsOf(app.db, recurring.seriesId, recurring.taskId),
      'nor generated anything',
    ).toEqual([])
  })

  test('AC-142: the refusal names tz in the 7.0 envelope', async () => {
    const { owner } = await stage()
    const fixture = await overdueDaily('named field')
    const response = await transitionWithTz(
      owner,
      fixture.taskId,
      'complete',
      '+05:30',
    )
    expectStatus(
      response,
      422,
      '11.15: an ECMA-402 offset identifier is not an IANA name, and the shared validator refuses it through its sign guard',
    )
    const envelope = response.json() as {
      error?: { code?: unknown; message?: unknown }
    }
    expect(
      typeof envelope.error?.code === 'string' &&
        (envelope.error.code as string).length > 0,
      '7.0 gives every 4xx the envelope { error: { code, message } } (AC-117)',
    ).toBe(true)
    expect(
      JSON.stringify(response.json()).toLowerCase(),
      '7.6 and 7.0: the 422 names tz',
    ).toMatch(/\btz\b|timezone|time_zone|zone/)
  })

  test('AC-142: an absent tz is refused exactly where generation would run', async () => {
    const { owner } = await stage()
    for (const event of ['complete', 'abandon'] as const) {
      const fixture = await overdueDaily(`absent zone on ${event}`)
      const refused = await transitionWithoutTz(owner, fixture.taskId, event)
      expectStatus(
        refused,
        422,
        `7.6 as ruled on 2026-08-10: an absent tz answers 422 naming tz exactly when the transition would run generation, which is the winning guarded update of 5.1 landing on a pending row carrying a recurrence_rule. This is that call, on ${event}`,
      )
      expect(
        JSON.stringify(refused.json()).toLowerCase(),
        'and the refusal names the field it is about',
      ).toMatch(/\btz\b|timezone|time_zone|zone/)

      // The rollback half. 7.6: the transaction changes nothing.
      const row = await requireTaskRow(app.db, fixture.taskId)
      expect(
        String(row.status),
        'the row did not transition (spec 7.6: the transaction changes nothing)',
      ).toBe('pending')
      expect(
        row.recurrence_rule,
        'and it still carries its rule, so the refusal cannot have run half of generation',
      ).toBe(fixture.rule)
      expect(
        await successorsOf(app.db, fixture.seriesId, fixture.taskId),
        'no successor was created',
      ).toEqual([])

      // And the retry, which is what proves the refusal was the zone.
      const retried = await transitionRecurringOk(
        owner,
        fixture.taskId,
        event,
        tz,
        `7.6: the same call retried with a zone gets the transition it asked for, on ${event}`,
      )
      const generated = requireGenerated(
        retried,
        'the retry runs generation, the refusal having left everything to do',
      )
      taskIds.push(String(generated.id))
    }
  })

  test('AC-142: every other call these two endpoints serve is untouched', async () => {
    const { owner, folderId } = await stage()
    const plain = await createTaskOk(
      owner,
      {
        title: 'p6 ac142 untouched calls',
        folder_id: folderId,
        due_date: todayIn(tz),
      },
      'a dated task with no rule is creatable (spec 7.6)',
    )
    taskIds.push(plain.id)

    // A rule-less row evaluates no date, so the tz-less call P3 has always
    // made still works. transition() is the P3 transport, which sends no
    // query string at all, so this is that same call byte for byte.
    expectStatus(
      await transition(owner, plain.id, 'complete'),
      200,
      '7.6 as ruled: a row with no rule evaluates no date, so nothing about this call changes. Every transition in P3\'s passing files is this call',
    )
    expectStatus(
      await transition(owner, plain.id, 'complete'),
      200,
      '5.1: a repeat complete on a settled row answers what it always answered',
    )
    expectStatus(
      await transition(owner, plain.id, 'abandon'),
      409,
      '5.1: completed plus abandon is refused, and the ruling does not turn that refusal into a 422 about a parameter',
    )

    const abandoned = await createTaskOk(
      owner,
      {
        title: 'p6 ac142 abandoned row',
        folder_id: folderId,
        due_date: todayIn(tz),
      },
      'a second dated task is creatable (spec 7.6)',
    )
    taskIds.push(abandoned.id)
    expectStatus(
      await transition(owner, abandoned.id, 'abandon'),
      200,
      'abandoning a rule-less row needs no zone either',
    )
    expectStatus(
      await transition(owner, abandoned.id, 'complete'),
      409,
      '5.1: abandoned plus complete is refused, unchanged by the ruling',
    )
  })

  test('AC-142: invariants hold afterwards', async () => {
    const { owner, folderId } = await stage()
    expectSweptTasks(taskIds)
    await expectTaskInvariants(app.db, taskIds, [folderId], [owner.id])
  })
})
