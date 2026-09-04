/*
AC-376: given a duplicate that would re-anchor a spent due date, when the
request names no timezone, then 422 naming tz and nothing is created; given
one that names a timezone which is not an IANA identifier, then 422 naming tz
whether or not a date would have moved; and given a source with no date, or
one whose date is ahead of today everywhere on earth, then the duplicate works
with no timezone at all.

**This is 7.8's precedent, which 7.16's own import already follows.** A
date-evaluating endpoint takes tz; a present value that fails IANA validation
is refused always; an absent one is refused exactly when a date would be
evaluated, so every request that worked before the parameter existed still
works. Issue #76 is the defect that made this necessary: both duplicates
re-anchored on SQL `current_date`, which reads in the database session's zone,
while spec 8.1 defines today as the current date in the request's tz and says
in terms that an endpoint which evaluates a date and takes no tz is an
incomplete surface rather than an invitation to substitute the stored zone
below. The code carried a comment defending the old behaviour; 8.1 forbids that
reasoning by name, and CLAUDE.md's first warning is that a comment here is a
claim about intent.

**Whether a date "would be evaluated" is decided without a zone**, which it has
to be, the zone being the thing that may be missing. Today in the furthest zone
is at most the UTC date plus a day, so a due date after that is ahead of the
caller wherever they are and nothing can re-anchor it; anything on or before
the UTC date might be spent in some zone, and the server asks rather than
guesses. That is why 2099 and a task with no date at all need no tz here, and a
date in 2020 does.

**Refusing must leave nothing behind**, because a copy is one act: the folder
case counts the caller's folders across the refusal, and the task case counts
the folder's tasks, so a duplicate that wrote half of itself and then refused
would fail here rather than in production.

Spec: 7.16 as annotated 2026-09-04, 7.8's precedent, 8.1, 9.6, 10.3; issue #76.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  createFolder,
  expectStatus,
  listFolders,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import type { RawResponse } from './http-client.js'
import { createTaskOk } from './tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac376')

/** The zone the honoured requests name. Any valid one would do here; the
 * proof that the value is actually read is AC-277's pair of zones. */
const ZONE = 'Pacific/Kiritimati'

function sentenceOf(response: RawResponse): string {
  return String(
    (response.json() as { error?: { message?: unknown } }).error?.message ?? '',
  )
}

/** Q7's two open sections, counted together: the refusals below must leave
 * this number exactly where they found it. */
async function taskCount(actor: Actor, folderId: string): Promise<number> {
  const read = await actor.browser.json(`/folders/${folderId}/tasks?tz=UTC`, 'GET')
  expectStatus(read, 200, 'the folder’s tasks read (spec 6 Q7)')
  const body = read.json() as { scheduled?: unknown[]; unscheduled?: unknown[] }
  const counted = (body.scheduled?.length ?? 0) + (body.unscheduled?.length ?? 0)
  expect(
    counted,
    'the count must see the staged task, or the assertions it guards are vacuous',
  ).toBeGreaterThan(0)
  return counted
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-376 a duplicate that moves a date asks which day it is', () => {
  test('a task duplicate: refused without a zone, refused with a bad one, and free where no date moves', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'ac376 tasks')

    const spent = await createTaskOk(
      owner,
      { title: 'ac376 spent', folder_id: folderId, due_date: '2020-01-01' },
      'a spent date stages (spec 7.6)',
    )
    const before = await taskCount(owner, folderId)

    const noZone = await owner.browser.json(`/tasks/${spent.id}/duplicate`, 'POST')
    expectStatus(
      noZone,
      422,
      'a spent date would re-anchor and the request named no day to anchor it on (8.1)',
    )
    expect(sentenceOf(noZone), '10.3: the 422 names the field').toContain('tz')
    expect(
      await taskCount(owner, folderId),
      'and the refusal wrote nothing: a copy is one act',
    ).toBe(before)

    for (const bad of ['Not/AZone', '+05:30', 'utc/1']) {
      const refused = await owner.browser.json(
        `/tasks/${spent.id}/duplicate?tz=${encodeURIComponent(bad)}`,
        'POST',
      )
      expectStatus(refused, 422, `${bad} is not an IANA identifier (11.15)`)
      expect(sentenceOf(refused), 'and the field is named').toContain('tz')
    }
    expect(
      await taskCount(owner, folderId),
      'none of those wrote anything either',
    ).toBe(before)

    const named = await owner.browser.json(
      `/tasks/${spent.id}/duplicate?tz=${encodeURIComponent(ZONE)}`,
      'POST',
    )
    expectStatus(named, 201, 'with a zone, the copy is made (spec 7.16)')

    // The two shapes that need no zone, because no date can move.
    const undated = await createTaskOk(
      owner,
      { title: 'ac376 undated', folder_id: folderId },
      'a task with no date stages (spec 7.6)',
    )
    expectStatus(
      await owner.browser.json(`/tasks/${undated.id}/duplicate`, 'POST'),
      201,
      'nothing to re-anchor, so nothing to ask: the endpoint works as it did before the parameter existed',
    )
    const ahead = await createTaskOk(
      owner,
      { title: 'ac376 ahead', folder_id: folderId, due_date: '2099-06-15' },
      'a future date stages (spec 7.6)',
    )
    expectStatus(
      await owner.browser.json(`/tasks/${ahead.id}/duplicate`, 'POST'),
      201,
      '2099 is ahead of today in every zone on earth, so no zone is needed to know it does not move',
    )
  })

  test('a folder duplicate: the same three answers, and a bad zone is refused even where no date would move', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'ac376 folder spent')
    await createTaskOk(
      owner,
      { title: 'ac376 folder spent task', folder_id: folderId, due_date: '2020-01-01' },
      'a spent date stages (spec 7.6)',
    )
    const before = (await listFolders(owner)).length

    const noZone = await owner.browser.json(`/folders/${folderId}/duplicate`, 'POST')
    expectStatus(
      noZone,
      422,
      'the plan would re-anchor and the request named no day (8.1, 9.6)',
    )
    expect(sentenceOf(noZone), '10.3: the 422 names the field').toContain('tz')
    expect(
      (await listFolders(owner)).length,
      'and no folder was made: the copy is refused whole (7.16)',
    ).toBe(before)

    const named = await owner.browser.json(
      `/folders/${folderId}/duplicate?tz=${encodeURIComponent(ZONE)}`,
      'POST',
    )
    expectStatus(named, 201, 'with a zone, the copy is made')

    /* A folder with no dates at all: no tz is needed, and an invalid one is
       still refused. That is the half of 7.8's precedent that is easy to lose
       — the value is validated because it was sent, not because it was
       needed. */
    const undated = await createFolder(owner, 'ac376 folder undated')
    await createTaskOk(
      owner,
      { title: 'ac376 folder undated task', folder_id: undated },
      'an undated task stages (spec 7.6)',
    )
    const bad = await owner.browser.json(
      `/folders/${undated}/duplicate?tz=Mars/Olympus`,
      'POST',
    )
    expectStatus(
      bad,
      422,
      'a present value that is not an IANA zone is refused whether or not a date would have moved (7.6’s precedent of 2026-08-10)',
    )
    expect(sentenceOf(bad), 'and the field is named').toContain('tz')
    expectStatus(
      await owner.browser.json(`/folders/${undated}/duplicate`, 'POST'),
      201,
      'and with no zone at all it copies, nothing being evaluated',
    )
  })
})
