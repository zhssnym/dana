/*
AC-292: given a folder duplicated, then the answer carries `shifted_days`:
the number of days the plan moved when its earliest date was spent, and 0
when every date kept; and the copy's History line says "dates moved to start
today" exactly when the number is positive.

9.6 says "spent due dates re-anchor on today and future ones keep, and the
bar says which happened" (ledger L-055). AC-200 pins the rule; this pins the
one fact the bar needs, put on 7.16's answer by RFC 0005 change control
item 58 (E) because a client that re-derived it from the copy's dates would
be a second copy of the rule.

The spent case names a zone, because since issue #76 (2026-09-04) the day a
plan re-anchors on is the caller's rather than the database session's, and a
duplicate that would move a date and names no zone is refused rather than
guessed at. The case that follows it names none on purpose: 2040 is ahead of
today everywhere on earth, so there is nothing for a zone to decide, and the
undated path staying open is part of what this file is for.

Spec: 7.16 (as widened by item 58, and as annotated for issue #76), 8.1, 9.6,
4.13.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { rows } from './helpers.js'
import { createTaskOk } from './tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'loose')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

async function historyDetail(copyId: string): Promise<string> {
  const found = await rows(
    app.db,
    sql`SELECT detail FROM events
        WHERE subject_id = ${copyId}::uuid AND verb = 'duplicated'`,
  )
  return String(found[0]?.detail ?? '')
}

describe('AC-292 the duplicate answer says whether the dates moved', () => {
  test('a spent plan answers the shift and its History line says so', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'loose ac292 spent')
    await createTaskOk(
      owner,
      { title: 'loose ac292 long past', folder_id: folderId, due_date: '2020-01-01' },
      'a spent date stages (spec 7.6)',
    )
    const copied = await owner.browser.json(
      `/folders/${folderId}/duplicate?tz=Pacific/Kiritimati`,
      'POST',
    )
    expectStatus(copied, 201, 'the duplicate (spec 7.16)')
    const made = copied.json() as { id: string; shifted_days: number }
    expect(made.shifted_days, '2020 is spent, so the plan moved a positive number of days').toBeGreaterThan(0)
    expect(await historyDetail(made.id), '4.13: the line says which happened').toMatch(
      /dates moved to start today$/,
    )
  })

  test('a plan still ahead answers 0 and its History line says only where it came from', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'loose ac292 ahead')
    await createTaskOk(
      owner,
      { title: 'loose ac292 far off', folder_id: folderId, due_date: '2040-06-01' },
      'a future date stages (spec 7.6)',
    )
    const copied = await owner.browser.json(`/folders/${folderId}/duplicate`, 'POST')
    expectStatus(copied, 201, 'the duplicate (spec 7.16)')
    const made = copied.json() as { id: string; shifted_days: number }
    expect(made.shifted_days, 'every date kept').toBe(0)
    expect(await historyDetail(made.id)).toBe('from loose ac292 ahead')
  })
})
