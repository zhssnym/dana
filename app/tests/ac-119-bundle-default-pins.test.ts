/*
AC-119, rewritten on 2026-09-04 for issue #113: given a fresh account, when
GET /api/v1/settings, then 200 and `pinned_views` is 9.1's six, which is what
the three 4.10 defaults derive to, and every other field is its own column
default; and given the three v1 flags set directly in the table, then the
pins move with them, the endpoint reading the row rather than answering a
constant.

**What this criterion was, and why it is rewritten rather than retired.** It
read `GET /me/settings` and asserted the body was exactly the three 7.2
booleans at their 4.10 defaults, `show_important` true, `show_all` true,
`show_done` false. That endpoint is gone. The defaults are not: `pinned_views`
is null until somebody first chooses pins, and while it is,
`domain/bundle.ts` derives the pin list from those same three columns
(4.19, 7.23). So the fact the old criterion protected is still observable and
still worth protecting — it is simply observable in one place now instead of
two, and this is that place.

**The adversarial arm is carried across unchanged in spirit.** The original
flipped the stored row directly and read it back, because a handler that
answers hardcoded defaults passes every fresh-account check while never
reading the table. The same defect is available here in a worse form: a build
that returned `DEFAULT_PINNED` without consulting the flags would give every
v1 account with Done shown a sidebar it did not choose, and would pass every
other case in this file. Seeding through the table rather than through a
PATCH is now the only option — nothing writes those three columns any more —
which is what the original preferred anyway, so that one endpoint's defect
could not fail two criteria in a shape neither names.

Spec: 7.23, 4.19, 4.10, 9.1, 9.7. Issue #113; the criterion is 12.3's.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  BUNDLE_DEFAULTS,
  DEFAULT_PINS,
  readBundle,
  storedFlags,
} from './bundle-harness.js'

let app: AuthTestApp
const cast = new Cast(['newcomer', 'veteran'], 'i113a')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

async function member(which: 0 | 1): Promise<Actor> {
  const [newcomer, veteran] = (await cast.of(app)) as [Actor, Actor]
  return which === 0 ? newcomer : veteran
}

/** Sets the three v1 flags in the table, which no endpoint can do since
 * issue #113, and leaves `pinned_views` null so the derivation still runs. */
async function seedFlags(
  actor: Actor,
  flags: { important: boolean; all: boolean; done: boolean },
): Promise<void> {
  await app.db.execute(
    sql`UPDATE user_settings
        SET show_important = ${flags.important},
            show_all = ${flags.all},
            show_done = ${flags.done},
            pinned_views = NULL
        WHERE user_id = ${actor.id}`,
  )
}

describe('AC-119: a fresh account reads its own defaults through the bundle', () => {
  test('the pins are 9.1s six, and every other field is its column default', async () => {
    const actor = await member(0)
    const bundle = await readBundle(actor)

    expect(
      bundle.pinned_views,
      'a fresh account has never chosen pins, so 7.23 derives them from the 4.10 defaults: ' +
        'show_important and show_all true put Important and All in 9.1s order, show_done ' +
        'false keeps Done out',
    ).toEqual([...DEFAULT_PINS])

    for (const [field, expected] of Object.entries(BUNDLE_DEFAULTS)) {
      expect(
        bundle[field],
        `spec 7.23: a fresh account reads the 4.10 DEFAULT for ${field}. A build that ` +
          'hard-codes an answer here passes while the column says something else, which ' +
          'is the defect migrations 0010 and 0013 each closed once',
      ).toEqual(expected)
    }
  })

  test('the derivation reads the row, it does not answer a constant', async () => {
    // The adversarial arm. Done shown and All hidden is a state no fresh
    // account is in and no endpoint can produce any more, which is exactly
    // why it is seeded here: a handler returning DEFAULT_PINNED unconditionally
    // passes the case above and fails this one.
    const actor = await member(1)
    await seedFlags(actor, { important: true, all: false, done: true })

    expect(
      (await readBundle(actor)).pinned_views,
      'spec 4.19 and 7.23: All is dropped because show_all is false and Done is appended ' +
        'because show_done is true, the rest keeping 9.1s order',
    ).toEqual(['desk', 'today', 'scheduled', 'assignments', 'important', 'done'])

    await seedFlags(actor, { important: false, all: false, done: false })
    expect(
      (await readBundle(actor)).pinned_views,
      'and with all three off, only the permanent pages remain — Desk among them, which ' +
        '9.7 locks pinned whatever anything else says',
    ).toEqual(['desk', 'today', 'scheduled', 'assignments'])

    expect(
      await storedFlags(app.db, actor.id),
      'and nothing derived was written back: the flags are still the record while ' +
        'pinned_views is null, which is 4.19s "two records of one fact are not kept"',
    ).toEqual({ show_important: false, show_all: false, show_done: false })
  })
})
