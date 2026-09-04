/*
AC-120, rewritten on 2026-09-04 for issue #113: given PATCH
/api/v1/settings with any subset of the eight 7.23 fields, the empty subset
included, then 200, present fields take the sent values, absent fields keep
theirs, and the answer is the GET /settings object read fresh.

**Rewritten rather than retired, because the rule is 7.23's word for word.**
The criterion was frozen 7.2's "any subset of the three booleans" and the
ratified section 7 PATCH reading behind it: absent unchanged, every present
value valid, and the empty subset a subset — an implementation refusing it
with an at-least-one-field rule refuses a body the contract admits. 7.23
carries every one of those sentences for the surviving endpoint, and nothing
asserted them there: AC-379 pins one field's round trip and AC-409 pins the
document against the schemas, and neither can see a `PATCH` that quietly
rewrote a field it was not sent.

**The concurrent case is carried across and it is the reason this is a
criterion rather than a unit test.** Two disjoint single-field PATCHes must
compose under any interleaving, because a conforming implementation never
writes an absent field: `writeBundle` names only the columns the body
carried, exactly as `writeSettings` did. A read-merge-write implementation
rewrites all eight columns from a stale read and loses one side. The rounds
give it repeated chances to interleave, on both database legs, and the
postgres:18 leg is the authority (11.10). The catch is probabilistic per
round, which is the nature of race tests; the rounds make it reliable in
practice.

**One clause the old criterion had is deliberately gone**: it also asserted
that the settings key of `GET /me` read the new values, because 7.1 and 7.2
answered one row through two endpoints. 7.1 still answers the three v1
booleans and this endpoint no longer touches them, so there is nothing left
for the two to agree about.

Spec: 7.23, 7.0, 4.10, 4.19. Issue #113; the criterion is 12.3's.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { rows } from './helpers.js'
import {
  BUNDLE_DEFAULTS,
  expectEnvelopedStatus,
  patchBundle,
  patchBundleOk,
  readBundle,
  storedBundle,
} from './bundle-harness.js'

let app: AuthTestApp
const cast = new Cast(['writer'], 'i113b')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

async function writer(): Promise<Actor> {
  const [actor] = (await cast.of(app)) as [Actor]
  return actor
}

/** The five scalar fields, which are what a subset is exercised over: the
 * two collections and the derived pin list have their own criteria. */
const SCALARS = ['theme', 'row_density', 'clock', 'task_open', 'calendar_zoom'] as const

describe('AC-120: any subset of the 7.23 bundle, the empty one included', () => {
  test('one field lands and the other four are untouched, on the wire and in the row', async () => {
    const actor = await writer()
    const before = await readBundle(actor)

    const answered = await patchBundleOk(
      actor,
      { clock: '24h' },
      'a one-field subset must answer 200 (spec 7.23, any subset)',
    )
    expect(answered.clock, 'the present field takes the sent value').toBe('24h')
    for (const field of SCALARS) {
      if (field === 'clock') continue
      expect(
        answered[field],
        `${field} was absent from the body, so it must keep its value (7.23, absent unchanged)`,
      ).toEqual(before[field])
    }
    expect(
      (await storedBundle(app.db, actor.id)).clock,
      'and the row moved with the answer: an endpoint that answers without writing is the ' +
        'half this asserts the wire cannot see',
    ).toBe('24h')
  })

  test('the full subset lands, every scalar at once', async () => {
    const actor = await writer()
    const full = {
      theme: 'dark',
      row_density: 'compact',
      clock: '12h',
      task_open: 'tab',
      calendar_zoom: 'week',
    }
    const answered = await patchBundleOk(
      actor,
      full,
      'the full subset must answer 200',
    )
    for (const [field, value] of Object.entries(full)) {
      expect(answered[field], `${field} must take the sent value`).toBe(value)
    }
    expect(
      await readBundle(actor),
      'and a fresh read agrees with the answer, which is 7.23s fresh-GET convention',
    ).toEqual(answered)
  })

  test('the empty subset answers the whole object and writes nothing at all', async () => {
    // The empty subset is a subset. It answers 200 with the unchanged object
    // rather than being refused, and it must not move `updated_at` either: a
    // no-op UPDATE for a request that changed nothing is still a write.
    const actor = await writer()
    const whole = sql`SELECT * FROM user_settings WHERE user_id = ${actor.id}`
    const before = await rows(app.db, whole)
    const answered = await patchBundleOk(
      actor,
      {},
      'the empty subset is a subset and must answer 200 (spec 7.23)',
    )
    expect(
      answered,
      'it answers the whole object, not a thinner one',
    ).toEqual(await readBundle(actor))
    expect(
      await rows(app.db, whole),
      'a body carrying nothing changed nothing, updated_at included',
    ).toEqual(before)
  })

  test('AC-120 adversarial: concurrent disjoint subsets both persist', async () => {
    const actor = await writer()
    // A known base, so every round's expectation is closed-form.
    await patchBundleOk(
      actor,
      { theme: BUNDLE_DEFAULTS.theme, clock: BUNDLE_DEFAULTS.clock },
      'before the rounds',
    )

    for (let round = 0; round < 8; round += 1) {
      const theme = round % 2 === 0 ? 'light' : 'dark'
      const clock = round % 2 === 0 ? '24h' : '12h'
      const [first, second] = await Promise.all([
        patchBundle(actor, { theme }),
        patchBundle(actor, { clock }),
      ])
      expectStatus(first, 200, `round ${String(round)}: the theme PATCH must answer 200`)
      expectStatus(second, 200, `round ${String(round)}: the clock PATCH must answer 200`)
      const stored = await storedBundle(app.db, actor.id)
      expect(
        { theme: stored.theme, clock: stored.clock },
        `round ${String(round)}: two concurrent disjoint subsets must compose, because ` +
          'absent fields are never written (spec 7.23, any subset); losing one is the ' +
          'read-merge-write defect',
      ).toEqual({ theme, clock })
    }
  })

  test('AC-120 adversarial: a mutation without the session token answers 403 and changes nothing', async () => {
    // 11.6's rule is every mutation; AC-111 pins the mechanism on PATCH /me,
    // this pins that this mutation is behind it too.
    const actor = await writer()
    const before = await storedBundle(app.db, actor.id)
    const flipped = { row_density: before.row_density === 'compact' ? 'comfortable' : 'compact' }

    expectEnvelopedStatus(
      await patchBundle(actor, flipped, { csrf: 'omit' }),
      403,
      'PATCH /settings with no X-CSRF-Token',
    )
    expectEnvelopedStatus(
      await patchBundle(actor, flipped, { csrf: 'forged-token-for-ac-120' }),
      403,
      'PATCH /settings with a forged X-CSRF-Token',
    )
    expect(
      await storedBundle(app.db, actor.id),
      'a refused mutation writes nothing',
    ).toEqual(before)
  })
})
