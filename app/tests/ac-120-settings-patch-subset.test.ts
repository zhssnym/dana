/*
AC-120 (P2S): Given PATCH /me/settings with any subset of the
three booleans, the empty subset included, then 200, present fields take the
sent values, absent fields keep theirs, and both GET /me/settings and the
settings key of GET /me read the new values afterwards.

Any subset is frozen 7.2's own phrase, and the P2 merge ratified what a
section 7 subset PATCH means: absent unchanged, a present value must be
valid. The empty subset is a subset, so {} answers 200 and changes nothing;
an implementation that refuses it with at-least-one-field is refusing a
body the frozen sentence admits.

Absent unchanged is also why the concurrent case is here rather than a
convenience: two disjoint single-field PATCHes must compose under any
interleaving, because a conforming implementation never writes an absent
field. A read-merge-write implementation rewrites all three columns from a
stale read and loses one side; the rounds below give it repeated chances to
interleave, on both database legs, and the postgres:18 leg is the authority
(11.10). The catch is probabilistic per round, which is the nature of race
tests; the rounds make it reliable in practice.

Every post-state assertion reads a fresh GET and the stored row. Nothing
here judges the PATCH response body beyond its status: frozen 7.2 names
none, and the gap rides to the Steward as this session's escalation (see
settings-harness.ts).

This file was red until P2S landed the endpoint; it passes since that merge.

Spec: 7.2 (frozen), 7.0, 4.10, 11.6, 11.10; the P2 merge's ratified
any-subset reading; RFC 0001 P2S row; proposed here and numbered by
the Steward's section 12 amendment on 2026-08-04.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  expectEnvelopedStatus,
  expectSettingsState,
  patchSettings,
  patchSettingsOk,
  readSettings,
  storedSettings,
} from './settings-harness.js'
import type { SettingsBooleans } from './settings-harness.js'

let app: AuthTestApp
const cast = new Cast(['settings-writer'])

async function writer(): Promise<Actor> {
  const [actor] = await cast.of(app)
  if (actor === undefined) throw new Error('cast must produce one actor')
  return actor
}

/** PATCH asserted 200 with the ruled body, post-state asserted on wire,
 * /me, and row. */
async function patchTo(
  actor: Actor,
  body: Partial<SettingsBooleans>,
  expected: SettingsBooleans,
  why: string,
): Promise<void> {
  await patchSettingsOk(
    actor,
    body,
    `PATCH /me/settings with ${JSON.stringify(body)} is a subset of the three booleans and must answer 200 (spec 7.2)`,
  )
  await expectSettingsState(app.db, actor, expected, why)
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-120: PATCH /me/settings takes any subset, absent unchanged', () => {
  test('AC-120: the full subset changes all three, durably', async () => {
    const actor = await writer()
    await patchTo(
      actor,
      { show_important: false, show_all: false, show_done: true },
      { show_important: false, show_all: false, show_done: true },
      'after the full-subset PATCH',
    )
  })

  test('AC-120: a single-field subset changes that field and keeps the others', async () => {
    const actor = await writer()
    // A base this case sets itself, so it cannot inherit a neighbor's state.
    await patchTo(
      actor,
      { show_important: false, show_all: false, show_done: true },
      { show_important: false, show_all: false, show_done: true },
      'the base for the single-field steps',
    )
    await patchTo(
      actor,
      { show_important: true },
      { show_important: true, show_all: false, show_done: true },
      'after PATCH {show_important: true}, the absent fields must keep their values',
    )
    await patchTo(
      actor,
      { show_done: false },
      { show_important: true, show_all: false, show_done: false },
      'after PATCH {show_done: false}, the absent fields must keep their values',
    )
  })

  test('AC-120: the empty subset is a subset, 200 and nothing changes', async () => {
    const actor = await writer()
    const before = await readSettings(actor)
    await patchTo(
      actor,
      {},
      before,
      'after PATCH {}, every field is absent and every field must keep its value',
    )
  })

  test('AC-120: repeating one subset lands the same state, 200 both times', async () => {
    const actor = await writer()
    const body = { show_all: true } as const
    const expected: SettingsBooleans = {
      ...(await readSettings(actor)),
      show_all: true,
    }
    await patchTo(actor, body, expected, 'after the first PATCH {show_all: true}')
    await patchTo(actor, body, expected, 'after repeating the same PATCH')
  })

  test('AC-120: unknown fields beside a valid one are ignored and the field lands', async () => {
    // 7.0 tolerates unknown fields on a parsed object; AC-118 pins that
    // taxonomy surface-wide, and this pins it on this package's schema,
    // where stripping happens per body rather than at boot.
    const actor = await writer()
    const before = await readSettings(actor)
    await patchSettingsOk(
      actor,
      {
        show_done: !before.show_done,
        theme: 'dark',
        nested: { anything: ['at', 'all'] },
      },
      'unknown fields beside a valid subset are tolerated (spec 7.0)',
    )
    await expectSettingsState(
      app.db,
      actor,
      { ...before, show_done: !before.show_done },
      'the request must be processed as if the unknown fields were absent',
    )
  })

  test('AC-120 adversarial: concurrent disjoint subsets both persist', async () => {
    const actor = await writer()
    // A known base, so every round's expectation is closed-form.
    await patchTo(
      actor,
      { show_important: true, show_all: true, show_done: false },
      { show_important: true, show_all: true, show_done: false },
      'before the rounds',
    )

    for (let round = 0; round < 8; round += 1) {
      const important = round % 2 === 0
      const done = round % 2 === 1
      const [first, second] = await Promise.all([
        patchSettings(actor, { show_important: important }),
        patchSettings(actor, { show_done: done }),
      ])
      expectStatus(first, 200, `round ${String(round)}: the show_important PATCH must answer 200`)
      expectStatus(second, 200, `round ${String(round)}: the show_done PATCH must answer 200`)
      expect(
        await storedSettings(app.db, actor.id),
        `round ${String(round)}: two concurrent disjoint subsets must compose, because absent fields are never written (spec 7.2 any subset, the ratified absent-unchanged reading); losing one is the read-merge-write defect`,
      ).toEqual({ show_important: important, show_all: true, show_done: done })
    }
  })

  test('AC-120 adversarial: a mutation without the session\'s token answers 403 and changes nothing', async () => {
    // 11.6's rule is every mutation; AC-111 pins the mechanism on PATCH
    // /me, this pins that the new mutation is behind it too.
    const actor = await writer()
    const before = await storedSettings(app.db, actor.id)
    const flipped = { show_all: before.show_all !== true }

    const omitted = await patchSettings(actor, flipped, { csrf: 'omit' })
    expectEnvelopedStatus(omitted, 403, 'PATCH /me/settings with no X-CSRF-Token')
    const forged = await patchSettings(actor, flipped, {
      csrf: 'forged-token-for-ac-120',
    })
    expectEnvelopedStatus(forged, 403, 'PATCH /me/settings with a mismatched X-CSRF-Token')

    expect(
      await storedSettings(app.db, actor.id),
      'a refused mutation must have no side effects (spec 11.6)',
    ).toEqual(before)
  })

  test('AC-120 adversarial: no session answers 401 in the envelope', async () => {
    const stranger = app.browser()
    const response = await stranger.json(
      '/me/settings',
      'PATCH',
      { show_done: true },
      { csrf: 'omit' },
    )
    expectEnvelopedStatus(response, 401, 'PATCH /me/settings without a session')
  })
})
