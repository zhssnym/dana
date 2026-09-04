/*
AC-200: given a folder duplicated, then the copy carries tasks, sections,
paragraphs, and section assignments; carries no members, comments,
assignees, or completion; and belongs to the duplicator alone. When the
folder's earliest date has passed, the whole plan re-anchors on today with
its intervals kept; a plan still ahead copies untouched.

DES-198's rules as one criterion, because they are one rule: a copy takes
the structure, never the grants or the progress. The staging builds a
folder with every kind of thing a copy must and must not carry.

**Today is the caller's day, and this file pins the zone. Rewritten 2026-09-04
with issue #76.** The re-anchor used to be computed from SQL current_date, in
the database session's zone, and this file's assertions were written as SQL so
that "the assertion and the implementation share a clock" — true, and a clock
8.1 says is the wrong one: today is the current date in the request's tz, and
an endpoint that evaluates a date and takes no tz is an incomplete surface.
`POST /folders/:id/duplicate` now takes tz, so the database's day is not
consulted at all and the arithmetic here is done against the day the request
named, read from the process clock the endpoint itself reads.

The zone is Pacific/Kiritimati, UTC+14, chosen because it is the extreme: if
the endpoint were still anchoring on the machine's own day, the copy would land
on a date this file's zone reaches up to a day earlier, and the interval
assertion below would say so. AC-277 proves the honouring directly with a
second zone twenty-six hours away; here one zone plus exact arithmetic is
enough, and AC-376 carries the refusals.

Spec: 7.16 as annotated for issue #76, 8.1, 9.6 (RFC 0005), DES-198 as
recorded in v2-decisions.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
  expectStatus,
  membershipUserIds,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { rows } from './helpers.js'
import { createTaskOk, zoneDaysAcross } from './tasks-harness.js'

/** The zone the copy is anchored in: UTC+14, the furthest a caller's day can
 * be from the machine's own. */
const ZONE = 'Pacific/Kiritimati'

let app: AuthTestApp
const cast = new Cast(['owner', 'member'])

/** The copy's dates by title, read as the plain dates 4.5 stores. */
async function copyDates(copyId: string): Promise<Map<string, string>> {
  const found = await rows(
    app.db,
    sql`SELECT title, to_char(due_date, 'YYYY-MM-DD') AS due_date FROM tasks
        WHERE folder_id = ${copyId}::uuid AND due_date IS NOT NULL`,
  )
  return new Map(found.map((row) => [String(row.title), String(row.due_date)]))
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

const DAY_MS = 86_400_000

/** Calendar arithmetic on the plain dates the API answers, done in UTC because
 * a `YYYY-MM-DD` is a civil date with no zone of its own; the zone question is
 * settled before it gets here, by the tz the request carried. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10)
}

describe('AC-200 the copy takes the shape and leaves the life', () => {
  test('structure copies; grants, progress and people do not', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    await connect(app.db, owner.id, member.id)
    const folderId = await createFolder(owner, 's1 ac200 original')
    await addMemberOk(owner, folderId, member.id)

    const spent = await createTaskOk(
      owner,
      {
        title: 's1 ac200 spent deadline',
        folder_id: folderId,
        due_date: '2026-08-01',
        assignee_id: member.id,
      },
      'a spent, assigned task must stage (spec 7.6)',
    )
    const future = await createTaskOk(
      owner,
      {
        title: 's1 ac200 future deadline',
        folder_id: folderId,
        due_date: '2030-01-15',
      },
      'a future-dated task must stage (spec 7.6)',
    )

    const { result: duplicated, days: anchorDays } = await zoneDaysAcross(
      ZONE,
      () =>
        owner.browser.json(
          `/folders/${folderId}/duplicate?tz=${encodeURIComponent(ZONE)}`,
          'POST',
        ),
    )
    expectStatus(duplicated, 201, 'duplicate answers the copy (spec 7.16)')
    const copyId = String((duplicated.json() as { id?: unknown }).id)

    const memberIds = await membershipUserIds(app.db, copyId)
    expect(memberIds, 'the copy has one member, its maker (DES-198)').toEqual([
      owner.id,
    ])

    const copyTasks = await owner.browser.json(
      `/folders/${copyId}/tasks?tz=UTC`,
      'GET',
    )
    expectStatus(copyTasks, 200, 'the copy’s tasks read (spec 6 Q7)')
    const text = JSON.stringify(copyTasks.json())
    expect(text.includes('s1 ac200 spent deadline'), 'tasks copied').toBe(true)
    expect(text.includes(spent.id), 'copied rows are new rows').toBe(false)
    expect(
      text.includes(member.id),
      'assignees do not travel (DES-198)',
    ).toBe(false)
    /*
    DES-198's date rule as the design record settles it: when the folder's
    earliest date has passed, the whole plan re-anchors so the intervals hold,
    the earliest date landing on today and every other date moving by the same
    days. This test first asserted the future date verbatim, which was the
    per-date rule DES-198 rejected; corrected at S5's change control. The day
    is now the caller's rather than the database's (#76), so the arithmetic is
    done here against the zone the request named, and current_date does not
    appear in this file at all.
    */
    const anchored = await copyDates(copyId)
    expect(
      anchorDays,
      'the earliest spent date lands on today in the zone the request named (DES-198, 8.1)',
    ).toContain(anchored.get('s1 ac200 spent deadline'))
    const landedOn = anchored.get('s1 ac200 spent deadline') as string
    const shift = daysBetween('2026-08-01', landedOn)
    expect(
      anchored.get('s1 ac200 future deadline'),
      `every other date moves by the same days, the intervals being what a template keeps (DES-198): the plan moved ${String(shift)} days`,
    ).toBe(addDays('2030-01-15', shift))
    expect(
      text.includes('2026-08-01'),
      'the spent date itself never survives verbatim (DES-198)',
    ).toBe(false)
    void future
  })
})
