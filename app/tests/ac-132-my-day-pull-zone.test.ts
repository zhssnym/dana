/*
AC-132: Given POST /tasks/:id/my-day with tz, then added_on is today in that
zone rather than in the account's stored zone, and the pulled task appears in
the Today group of a My Day read in the same zone; given an absent or invalid
tz, then 422 naming the field and no entry is written.

Authored here at the Steward's strong recommendation and numbered by it as
the next additive number. Its reasoning, which is the criterion's whole
justification: this defect survived three packages because no criterion
pinned the pull's zone. 7.8 said added_on = today(V) and 8.1 said today(V)
comes from the request's tz, but the pull took no tz, so the implementation
read users.timezone and nothing in section 12 could tell the difference. The
two civil dates differ for a large part of every UTC day, so a pulled task
landed in Carried instead of Today and AC-047 and AC-048 failed whenever a
run crossed that window. Four sessions carried it as a non-deterministic
failure. It was never load-dependent or backend-dependent, only
clock-dependent, and this file is the guard that would have named it on the
first run.

The first case is what makes the criterion worth a number rather than an
assertion inside AC-047. Two tasks pulled at one instant with two different
tz values must receive added_on values exactly one calendar day apart, and
that is impossible for any implementation reading the zone from anywhere but
the request: users.timezone is one value, the process clock is one value, the
database clock is one value, and every one of them yields the same civil date
for both calls. The pair is Pacific/Kiritimati and Pacific/Honolulu, whose
offsets differ by exactly 24 hours with neither observing DST, measured at
every hour of 2026 with no exception, so the one-day gap holds at every
instant rather than in a window. No clock is owned and no run time is
assumed.

The account is provisioned UTC, because the harness signs in without the 7.1
tz parameter. UTC's civil date always equals one of those two zones' and
never both, since they straddle it, so at every instant at least one of the
two pulls below is dated in a zone the account does not hold. That is what
makes the pair a discriminator against the stored zone as well as against
each other.

The second case is the defect end to end, in the register a reader will
recognise: pull in a zone, read My Day in the same zone, and the task is in
Today. Under the old behavior it was in Carried for a large part of the day.

Spec: 7.8 as ruled on 2026-08-08 (the tz parameter, and 422 for absent or
invalid), 8.1 (today(V) from the request's tz), 8.2, 6 Q1, INV-12, 7.0 (the
422 envelope with the field named), 11.15 (Intl accepts offset identifiers
that are not IANA names).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, defaultFolderOf, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  dropFromMyDay,
  expectTaskInvariants,
  myDayAddedOn,
  myDayRows,
  pullIntoMyDay,
  pullWithoutTz,
} from './tasks-harness.js'
import {
  ZONE_AHEAD,
  ZONE_BEHIND,
  daysBetween,
  idsOf,
  localDateIn,
  myDay,
  seedViewTask,
} from './views-harness.js'

let app: AuthTestApp
const cast = new Cast(['viewer'], 'p4')

interface Stage {
  viewer: Actor
  inboxId: string
  ahead: string
  behind: string
  today: string
  refused: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [viewer] = await cast.of(app)
    if (viewer === undefined) throw new Error('cast must produce one actor')
    const inboxId = await defaultFolderOf(app.db, viewer.id)
    const seed = (title: string) =>
      seedViewTask(app.db, {
        folderId: inboxId,
        createdBy: viewer.id,
        assigneeId: viewer.id,
        title,
      })
    staged = {
      viewer,
      inboxId,
      ahead: await seed('p4 ac132 pulled in the ahead zone'),
      behind: await seed('p4 ac132 pulled in the behind zone'),
      today: await seed('p4 ac132 undated, pulled and read in one zone'),
      refused: await seed('p4 ac132 the pull that must be refused'),
    }
  }
  return staged
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-132: the pull dates its entry in the zone the request names', () => {
  test('AC-132: two pulls at one instant in two zones are one day apart', async () => {
    const { viewer, ahead, behind } = await stage()
    expectStatus(
      await pullIntoMyDay(viewer, ahead, ZONE_AHEAD),
      200,
      `the pull in ${ZONE_AHEAD} must be accepted (spec 7.8)`,
    )
    expectStatus(
      await pullIntoMyDay(viewer, behind, ZONE_BEHIND),
      200,
      `the pull in ${ZONE_BEHIND} must be accepted (spec 7.8)`,
    )
    const aheadOn = await myDayAddedOn(app.db, ahead, viewer.id)
    const behindOn = await myDayAddedOn(app.db, behind, viewer.id)
    expect(
      [aheadOn, behindOn].every((value) => value !== undefined),
      'both pulls must have written an entry to compare',
    ).toBe(true)

    expect(
      daysBetween(String(behindOn), String(aheadOn)),
      `7.8 dates the entry today(V) and 8.1 takes today(V) from the request's tz, so two pulls moments apart in ${ZONE_AHEAD} and ${ZONE_BEHIND} are exactly one calendar day apart. Any implementation reading the zone from somewhere else fails here and cannot pass by luck: users.timezone is one value, the process clock is one value, and the database clock is one value, and each of them gives these two calls the same civil date. The zone pair's offsets differ by exactly 24 hours with neither observing DST, measured at every hour of 2026, so the gap holds at every instant rather than in a window`,
    ).toBe(1)
  })

  test('AC-132: each entry carries that zone\'s own civil date', async () => {
    const { viewer, ahead, behind } = await stage()
    await pullIntoMyDay(viewer, ahead, ZONE_AHEAD)
    await pullIntoMyDay(viewer, behind, ZONE_BEHIND)
    const now = new Date()
    expect(
      [
        await myDayAddedOn(app.db, ahead, viewer.id),
        await myDayAddedOn(app.db, behind, viewer.id),
      ],
      'stated as the two values rather than as their difference, so a failure names the dates. The account is provisioned UTC, and UTC always equals one of these two and never both since they straddle it, so at every instant at least one entry is dated in a zone the account does not hold',
    ).toEqual([localDateIn(ZONE_AHEAD, now), localDateIn(ZONE_BEHIND, now)])
  })

  test('AC-132: a pulled task is in Today when My Day is read in the same zone', async () => {
    const { viewer, today } = await stage()
    expectStatus(
      await pullIntoMyDay(viewer, today, ZONE_AHEAD),
      200,
      'the pull must be accepted',
    )
    const body = await myDay(viewer, ZONE_AHEAD)
    expect(
      idsOf(body.today),
      `8.2 sets qualify_date to the entry's added_on for an undated task, and Q1 puts qualify_date = today in Today. This is the defect end to end: while the pull dated from users.timezone and the page computed today(V) from tz, the two disagreed for a large part of every UTC day and the row rendered in Carried, which is the non-deterministic failure four sessions carried`,
    ).toContain(today)
    expect(
      idsOf(body.carried),
      'and it is not in Carried, which is exactly where it used to land',
    ).not.toContain(today)
  })

  test('AC-132: an absent tz is refused and writes nothing', async () => {
    const { viewer, refused } = await stage()
    const response = await pullWithoutTz(viewer, refused)
    expectStatus(
      response,
      422,
      '7.8 as ruled on 2026-08-08: an absent tz answers 422 naming the field. There is no defensible default, since 8.1 makes tz the input today(V) is computed from and UTC would date the entry in a zone the caller never named, which is the defect the ruling repairs rather than a fallback',
    )
    expect(
      await myDayRows(app.db, refused),
      'a refused pull is not a pull: INV-12 counts entries, and a 422 that still wrote one would put the row on a page in a zone nobody chose',
    ).toEqual([])
  })

  test('AC-132: an invalid tz is refused and writes nothing', async () => {
    const { viewer, refused } = await stage()
    for (const value of ['+05:30', 'Not/AZone', '']) {
      const response = await pullIntoMyDay(viewer, refused, value)
      expectStatus(
        response,
        422,
        `7.8 as ruled on 2026-08-08 refuses an invalid tz as well as an absent one, and ${JSON.stringify(value)} is not an IANA name. The offset identifier is 11.15's hole: Intl.DateTimeFormat accepts +05:30, so a pull validating with bare Intl accepts a value the 11.9 zone math cannot use and dates the entry from whatever it falls back to`,
      )
    }
    expect(
      await myDayRows(app.db, refused),
      'and none of the three wrote an entry',
    ).toEqual([])
  })

  test('AC-132: the refusal carries the 7.0 envelope naming the field', async () => {
    const { viewer, refused } = await stage()
    const response = await pullWithoutTz(viewer, refused)
    expectStatus(response, 422, 'the pull with no tz is refused')
    const envelope = response.json() as {
      error?: { code?: unknown; message?: unknown }
    }
    expect(
      typeof envelope.error?.code === 'string' &&
        (envelope.error.code as string).length > 0,
      '7.0 gives every 4xx the envelope { error: { code, message } } with both non-empty (AC-117)',
    ).toBe(true)
    expect(
      JSON.stringify(response.json()).toLowerCase(),
      '7.8 says the refusal names the field',
    ).toMatch(/\btz\b|timezone|zone/)
  })

  test('AC-132: DELETE gains nothing, because it evaluates no date', async () => {
    const { viewer, today } = await stage()
    expectStatus(
      await pullIntoMyDay(viewer, today, ZONE_AHEAD),
      200,
      'the entry to remove must exist',
    )
    expectStatus(
      await dropFromMyDay(viewer, today),
      200,
      '7.8 gives tz to the pull alone. The drop removes V\'s entry and computes no civil date, so requiring a zone of it would be a parameter with nothing to do; asserted rather than assumed, because the symmetric change is the easy one to make by reflex',
    )
    expect(
      await myDayAddedOn(app.db, today, viewer.id),
      'and it really did remove the entry',
    ).toBeUndefined()
  })

  test('AC-132: the fixture satisfies section 3', async () => {
    const { viewer, inboxId, ahead, behind, today, refused } = await stage()
    await expectTaskInvariants(
      app.db,
      [ahead, behind, today, refused],
      [inboxId],
      [viewer.id],
    )
  })
})
