/*
AC-380: given migration 0013, then a value outside 9.5's three zooms is
refused twice over — the settings bundle answers 422 naming `calendar_zoom`
and leaves the stored value as it was, and the database itself refuses the row
by `user_settings_calendar_zoom_check` when the column is written directly —
while each of `day`, `week` and `month` is admitted.

**This case exists because AC-001 cannot see what a CHECK does.** The catalog
test asserts every constraint by name and by which columns it mentions, and a
toothless CHECK carrying the right name over the right column is green across
the entire suite. `docs/workflow/backend/README.md`'s fifth bullet is that
lesson, learned on issue #27, and AC-372 is the same case one migration back:
a migration that adds a CHECK owes a behavioural case that tries the bad row.

**The two refusals are separate facts and the endpoint one is not enough.**
`patchSettingsBody` refuses a value outside the enum before anything reaches
the database, so nothing on the wire can produce a bad row today. The
constraint is there so that nothing can produce one tomorrow either — a seed,
a fixture, a future migration, a later endpoint — and a criterion that only
drove the endpoint would stay green on a schema that had lost it. This is
AC-372's reasoning, and AC-362's before it.

**"Names the field" is asserted rather than assumed.** 10.3 requires a 422 to
name every failing field, and the whole reason this class of bug is expensive
here is that a request field can be dropped in silence: a schema that had
never declared `calendar_zoom` would answer 200 to the same body and change
nothing, which is what 11.15 calls the first of the two loss shapes. A 422
that names the field is the difference between a caller who can fix their
request and a caller who is told nothing at all.

**The refusal is read from the constraint's name and the SQLSTATE, never from
the server's prose.** The Postgres leg's per-worker databases answer in this
cluster's language, which is French; a constraint name survives every
translation verbatim (spec 11.10, issue #92).

Spec: 4.10 as annotated 2026-09-04, 7.2 as annotated the same day, 9.5, 10.3,
12.1. Issues #140 and #142.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { CALENDAR_ZOOMS } from '../src/shared/bundle.js'
import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { expectRejectedBy, rows } from './helpers.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'i142c')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

async function storedZoom(userId: string): Promise<unknown> {
  const found = await rows(
    app.db,
    sql`SELECT calendar_zoom FROM user_settings WHERE user_id = ${userId}::uuid`,
  )
  return found[0]?.calendar_zoom
}

describe('AC-380 a zoom the calendar cannot draw is refused, by name', () => {
  test('the endpoint answers 422 naming the field and writes nothing', async () => {
    const [owner] = (await cast.of(app)) as [Actor]

    const chosen = await owner.browser.json('/settings', 'PATCH', {
      calendar_zoom: 'week',
    })
    expectStatus(chosen, 200, 'a real zoom writes first, so "unchanged" means something')

    // 'year' is the honest adversary: Q3C cut it for v1, so it is the value a
    // client written against an older or a newer product would actually send.
    for (const refused of ['year', 'Month', '', 'month ', 42, null]) {
      const answer = await owner.browser.json('/settings', 'PATCH', {
        calendar_zoom: refused,
      })
      expectStatus(
        answer,
        422,
        `${JSON.stringify(refused)} is not one of 9.5's three zooms and must be refused rather than narrowed to the default (spec 7.10's enumerated-value rule)`,
      )
      const message = String(
        (answer.json() as { error?: { message?: unknown } }).error?.message ?? '',
      )
      expect(
        message.includes('calendar_zoom'),
        `the 422 must name the field (10.3); answered: ${message}`,
      ).toBe(true)
      expect(
        await storedZoom(owner.id),
        'and a refusal writes nothing: the zoom the person had is the zoom they still have',
      ).toBe('week')
    }

    await owner.browser.json('/settings', 'PATCH', { calendar_zoom: 'month' })
  })

  test('the database refuses the row the endpoint can no longer send', async () => {
    const [owner] = (await cast.of(app)) as [Actor]

    for (const bad of ['year', 'MONTH', 'fortnight', '']) {
      await expectRejectedBy(
        () =>
          app.db.execute(
            sql`UPDATE user_settings SET calendar_zoom = ${bad}
                WHERE user_id = ${owner.id}::uuid`,
          ),
        'user_settings_calendar_zoom_check',
      )
    }

    // And the three the rule admits, so the constraint is proved to refuse
    // the row rather than to refuse everything.
    for (const zoom of CALENDAR_ZOOMS) {
      await app.db.execute(
        sql`UPDATE user_settings SET calendar_zoom = ${zoom}
            WHERE user_id = ${owner.id}::uuid`,
      )
      expect(
        await storedZoom(owner.id),
        `${zoom} is one of 9.5's three and the column must hold it`,
      ).toBe(zoom)
    }

    await app.db.execute(
      sql`UPDATE user_settings SET calendar_zoom = 'month'
          WHERE user_id = ${owner.id}::uuid`,
    )
  })
})
