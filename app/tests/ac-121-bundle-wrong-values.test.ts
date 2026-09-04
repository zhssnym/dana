/*
AC-121, rewritten on 2026-09-04 for issue #113: given PATCH
/api/v1/settings carrying a value outside a field's enumeration, of the wrong
type, or null, then 422 naming the field and nothing written.

**Rewritten rather than retired, because 7.23 states the rule and only
AC-380 asserted it, for one field.** The criterion was frozen 7.2's three
booleans and the reading that null is a wrong-typed value there rather than a
clear: 4.10's columns are NOT NULL with defaults, so there is nothing to
clear back to, unlike the label and colour of 7.4's my-membership, which the
frozen text itself marks nullable. Every one of those sentences is 7.23's for
the bundle, over eight fields instead of three, and 7.23 adds the
enumerated-value half explicitly on 7.10's precedent: absent and wrong are
different states, and a wrong value is never quietly narrowed to the default.
AC-380 pins that for `calendar_zoom` beside migration 0013's CHECK. This is
the general case.

**The refusal must be total, and that is the arm worth having.** 7.23 says
nothing is written, the whole PATCH being one statement, so a body carrying
one good field and one bad one writes neither. An implementation that
validated field by field and applied what parsed would pass a single-bad-field
case and lose data on a mixed one, and no other criterion on this endpoint
looks.

**The 400 half of the taxonomy is deliberately not probed here** —
unparseable, non-object, over-limit. Body parsing is one boot-level
middleware, AC-118 pins it from the /me routes, and `bundle-contract.test.ts`
asserts it reaches this surface.

Spec: 7.23, 7.0, 7.10, 4.10, 10.3. Issue #113; the criterion is 12.3's.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  expectEnvelopedStatus,
  patchBundle,
  readBundle,
  storedBundle,
} from './bundle-harness.js'

let app: AuthTestApp
const cast = new Cast(['sender'], 'i113c')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

async function sender(): Promise<Actor> {
  const [actor] = (await cast.of(app)) as [Actor]
  return actor
}

/** One refusal per shape a wrong value can take, each naming its field. */
const REFUSED: readonly { field: string; body: Record<string, unknown>; what: string }[] = [
  { field: 'theme', body: { theme: 'midnight' }, what: 'a value outside the enumeration' },
  { field: 'calendar_zoom', body: { calendar_zoom: 'year' }, what: 'a zoom Q3C cut for v1' },
  { field: 'row_density', body: { row_density: 'cosy' }, what: 'a density nobody built' },
  { field: 'clock', body: { clock: 24 }, what: 'a number where a string is fixed' },
  { field: 'task_open', body: { task_open: null }, what: 'null, which 4.10 admits no state for' },
  { field: 'theme', body: { theme: true }, what: 'a boolean' },
  { field: 'pinned_views', body: { pinned_views: ['desk', 'nowhere'] }, what: 'a view that is not one of the nine' },
  { field: 'pinned_views', body: { pinned_views: 'desk' }, what: 'a bare string where an array is fixed' },
  { field: 'sidebar_order', body: { sidebar_order: ['not-a-uuid'] }, what: 'an entry that is not a uuid' },
  { field: 'arrangements', body: { arrangements: { 'not-a-uuid': 'grid' } }, what: 'a key that is not a uuid' },
  {
    field: 'arrangements',
    body: { arrangements: { '3f1a2b4c-5d6e-4f70-8901-234567890abc': 'x'.repeat(41) } },
    what: 'a value past the 40-character cap',
  },
]

describe('AC-121: a wrong value is 422 naming the field, and writes nothing', () => {
  test('every wrong value is refused, named, and leaves the row alone', async () => {
    const actor = await sender()
    const before = await storedBundle(app.db, actor.id)

    for (const { field, body, what } of REFUSED) {
      const response = await patchBundle(actor, body)
      expectEnvelopedStatus(response, 422, `PATCH /settings with ${what}`)
      const message = (
        response.json() as { error?: { code?: unknown; message?: unknown } }
      ).error
      expect(
        message?.code,
        `${what} must be refused as validation_failed (spec 7.0)`,
      ).toBe('validation_failed')
      expect(
        String(message?.message).includes(field),
        `${what} must name ${field} in the message (spec 10.3, 7.23); got: ${String(message?.message)}`,
      ).toBe(true)
    }

    expect(
      await storedBundle(app.db, actor.id),
      'eleven refusals wrote nothing at all',
    ).toEqual(before)
  })

  test('a good field beside a bad one is not applied either', async () => {
    // 7.23: nothing is written, the whole PATCH being one statement. An
    // implementation validating field by field and applying what parsed
    // passes every case above and loses this one.
    const actor = await sender()
    const before = await readBundle(actor)

    expectEnvelopedStatus(
      await patchBundle(actor, { theme: 'dark', clock: 'half past' }),
      422,
      'PATCH /settings carrying one valid field and one refused one',
    )
    expect(
      await readBundle(actor),
      'the valid field must not have landed beside the refused one',
    ).toEqual(before)
  })

  test('a value the enumeration does admit still lands, so the refusals are not blanket', async () => {
    // The control. A build that answered 422 to every PATCH would pass both
    // cases above, which is the way an over-eager refusal hides.
    const actor = await sender()
    const response = await patchBundle(actor, { theme: 'dark' })
    expect(response.status, 'a valid value is accepted').toBe(200)
    expect((await readBundle(actor)).theme).toBe('dark')
  })
})
