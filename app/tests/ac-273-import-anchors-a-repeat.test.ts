/*
AC-273: an imported task carrying a repeat or a reminder is dated on the
import day in the zone tz names; the same file with no tz answers 422 naming
tz and creates nothing; and a file carrying neither imports with no tz
exactly as it did before, its tasks undated.

This asserts the one reading of item 44 that could go the other way, and it
is written so that overturning it is a visible criterion change rather than a
silent behaviour change. B3 asks the workflow file to carry each task's
repeat and reminder and excludes due dates; frozen 4.5 checks that a
`recurrence_rule` implies a `due_date` and 8.6 computes a reminder's instant
from the task's `due_date` on both arms, so neither value is storable on a
dateless task and the ruling's two halves cannot both be taken literally.
The anchor satisfies the reason the ruling gives for the exclusion, which is
that a template holds no moment: the file still carries no date, and the date
the task gets is the day its run began.

**tz follows 7.6's precedent and not 7.0's view rule**, which is why the
third case matters as much as the second: every workflow file that imports
today evaluates no date, so requiring tz unconditionally would break the
starter workflows of 9.13 and AC-226 for a parameter they have no use for.
Present and invalid is refused always; absent is refused exactly where a date
is evaluated.

**Nothing is created by the refusal.** The import is one transaction over a
whole file, so a file refused for its zone must leave no folder behind, which
is the failure mode of validating per task inside the loop.

Spec: 7.16 as amended, 7.6's tz ruling of 2026-08-10, 4.5, 8.6, 4.11,
RFC 0005 change control items 44 B3 and 46(a).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, expectStatus, listFolders } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { importedFolderId, workflowFile } from './s22a-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 's22a')

/** The calendar date it is right now in a zone, which is what 8.1 calls
 * today(V) and what the anchor must equal. */
function todayIn(zone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

async function firstCard(
  actor: Actor,
  folderId: string,
): Promise<Record<string, unknown>> {
  const listed = await actor.browser.json(
    `/folders/${folderId}/tasks?tz=UTC`,
    'GET',
  )
  expectStatus(listed, 200, 'the imported folder reads (spec 6 Q7)')
  const body = listed.json() as {
    scheduled?: Array<Record<string, unknown>>
    unscheduled?: Array<Record<string, unknown>>
  }
  return (body.scheduled?.[0] ?? body.unscheduled?.[0]) as Record<
    string,
    unknown
  >
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-273 a repeat needs an anchor, so the import day is one', () => {
  test('anchored in the named zone, refused without one, and untouched where no date is evaluated', async () => {
    const [owner] = (await cast.of(app)) as [Actor]

    const repeating = workflowFile('s22a ac273 weekly', [
      {
        title: 's22a ac273 the weekly one',
        recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO',
      },
    ])

    const zone = 'Pacific/Kiritimati'
    const anchored = await owner.browser.json(
      `/workflows/import?tz=${encodeURIComponent(zone)}`,
      'POST',
      repeating,
    )
    expectStatus(anchored, 201, 'a file carrying a repeat imports with a zone')
    const card = await firstCard(owner, importedFolderId(anchored.json()))
    expect(
      card.due_date,
      'the repeat is anchored on the import day in the zone the request named (8.1, 4.5)',
    ).toBe(todayIn(zone))
    expect(
      card.is_recurring,
      'and the repeat itself is stored against that anchor',
    ).toBe(true)

    const before = (await listFolders(owner)).length
    expectStatus(
      await owner.browser.json('/workflows/import', 'POST', repeating),
      422,
      'a file that evaluates a date and names no zone is refused (7.6’s precedent)',
    )
    expectStatus(
      await owner.browser.json(
        '/workflows/import?tz=Mars/Olympus',
        'POST',
        repeating,
      ),
      422,
      'a zone that is not an IANA identifier is refused whatever the file holds',
    )
    expectStatus(
      await owner.browser.json('/workflows/import?tz=%2B05%3A30', 'POST', {
        ...repeating,
        name: 's22a ac273 offset',
      }),
      422,
      'an offset identifier is not an IANA name (11.15’s Intl hole)',
    )
    expect(
      (await listFolders(owner)).length,
      'a refused import creates nothing: the file is one transaction',
    ).toBe(before)

    const plain = await owner.browser.json(
      '/workflows/import',
      'POST',
      workflowFile('s22a ac273 plain', [{ title: 's22a ac273 plain task' }]),
    )
    expectStatus(
      plain,
      201,
      'a file that evaluates no date needs no zone, as it never did',
    )
    const plainCard = await firstCard(owner, importedFolderId(plain.json()))
    expect(
      plainCard.due_date,
      'and its task stays undated, which is what the exclusion is about',
    ).toBeNull()
  })
})
