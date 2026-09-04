/*
AC-378: given an account provisioned after migration 0013, then the v2
settings bundle reads `calendar_zoom` as `month` — 9.5's default zoom and
what the calendar has always opened at — and the column's own DEFAULT is
`month` as well.

**Both halves of the default are asserted and they are different facts**,
which is AC-365's lesson one column over. The read through the bundle proves
what a person gets; `information_schema` proves what the column itself says,
which is what the next row written by anything that does not go through
provisioning — the seed, a fixture, a future migration — will carry. Reading
only the endpoint would pass on a build that hard-coded `month` in
`domain/bundle.ts` and left the column saying something else, and that is
exactly the shape 0010 had to be written to correct: a DEFAULT chosen while
nothing consumed the column, disagreeing with every surface that drew it,
costing 42 browser cases on the day the column was finally read.

**And the field is asserted to have been written rather than merely
declared.** `app/src/shared/` has no `.strict()` anywhere, so a request field
the server does not act on is accepted, dropped, and answered 200; the reverse
holds for a response key that was added to the schema and never to the SELECT,
which reads back as the fallback value and looks correct until somebody
changes the stored one. AC-379 is the case that separates those, and this one
pins the starting point it measures from.

Spec: 4.10 as annotated 2026-09-04, 7.2 as annotated the same day, 9.5,
12.3. Issues #140 and #142.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { DEFAULT_CALENDAR_ZOOM } from '../src/shared/bundle.js'
import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { rows } from './helpers.js'

let app: AuthTestApp
const cast = new Cast(['fresh'], 'i142a')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-378 a fresh account opens the calendar where it always did', () => {
  test('the bundle reads month, and the column itself defaults to month', async () => {
    const [fresh] = (await cast.of(app)) as [Actor]

    expect(
      DEFAULT_CALENDAR_ZOOM,
      'the constant the schema, the read and this case share must be 9.5’s default zoom; if the product default ever moves, it moves here and in migration 0013 together',
    ).toBe('month')

    const read = await fresh.browser.json('/settings', 'GET')
    expectStatus(read, 200, 'the v2 settings bundle reads (spec 7.2 as annotated)')
    expect(
      (read.json() as { calendar_zoom?: unknown }).calendar_zoom,
      'spec 9.5: the calendar opens at the month grid, and the account must say so from its first read',
    ).toBe('month')

    const stored = await rows(
      app.db,
      sql`SELECT calendar_zoom FROM user_settings
          WHERE user_id = ${fresh.id}::uuid`,
    )
    expect(
      stored[0]?.calendar_zoom,
      'provisioning writes no value for this column, so the row carries whatever the DEFAULT is',
    ).toBe('month')

    const declared = await rows(
      app.db,
      sql`SELECT column_default, is_nullable, data_type
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'user_settings'
            AND column_name = 'calendar_zoom'`,
    )
    expect(
      String(declared[0]?.column_default ?? ''),
      'the column’s own DEFAULT, not the endpoint’s answer: a build that hard-coded month in domain/bundle.ts and left the column saying something else would pass every assertion above',
    ).toContain("'month'")
    expect(
      declared[0]?.is_nullable,
      '4.10 as annotated: NOT NULL, so the CHECK over it is never UNKNOWN and there is no third state for a reader to guess at',
    ).toBe('NO')
  })
})
