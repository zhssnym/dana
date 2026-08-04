/*
AC-122 (proposed, P2S): given two users, when one PATCHes their settings,
then the other's stored settings and GET bodies are unchanged.

Settings are a per-user row keyed by user_id (4.10), and the endpoint takes
no id: the viewer is the row. The two defects this criterion exists for are
an UPDATE missing its WHERE, which flips every account's settings at once,
and a read resolving some other row than the session's. Both directions are
asserted, the ac-023 pattern, and the stored rows are read beside the wire
so a bleed in either layer fails on the half that lied.

This file is red until P2S lands the endpoint: the route answers 404 today.

Spec: 7.2 (frozen), 4.10, 10.2; RFC 0001 P2S row; criteria proposed to the
Steward for the section 12 amendment.
*/
import { afterAll, beforeAll, describe, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  SETTINGS_DEFAULTS,
  expectSettingsState,
  patchSettingsOk,
} from './settings-harness.js'

let app: AuthTestApp
const cast = new Cast(['settings-first', 'settings-second'])

interface Pair {
  first: Actor
  second: Actor
}
let staged: Pair | undefined

async function pair(): Promise<Pair> {
  if (staged === undefined) {
    const [first, second] = await cast.of(app)
    if (first === undefined || second === undefined) {
      throw new Error('cast must produce two actors')
    }
    staged = { first, second }
  }
  return staged
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-122: settings are personal to the account that set them', () => {
  test('AC-122: one user\'s PATCH leaves the other account untouched', async () => {
    const { first, second } = await pair()
    await patchSettingsOk(
      first,
      { show_important: false, show_done: true },
      'PATCH /me/settings with a valid subset must answer 200 (spec 7.2)',
    )
    await expectSettingsState(
      app.db,
      first,
      { show_important: false, show_all: true, show_done: true },
      'the writer reads their own change back',
    )
    await expectSettingsState(
      app.db,
      second,
      SETTINGS_DEFAULTS,
      'the other account must still read its untouched defaults (spec 4.10; an UPDATE missing its WHERE fails here)',
    )
  })

  test('AC-122 adversarial: independence holds in the other direction too', async () => {
    const { first, second } = await pair()
    await patchSettingsOk(
      second,
      { show_all: false },
      'the second account sets its own row (spec 7.2)',
    )
    await expectSettingsState(
      app.db,
      second,
      { show_important: true, show_all: false, show_done: false },
      'the second account reads its own change back',
    )
    await expectSettingsState(
      app.db,
      first,
      { show_important: false, show_all: true, show_done: true },
      'the first account\'s earlier values must survive the second account\'s write',
    )
  })

  test('AC-122: each GET answers the caller\'s own row, not the other\'s', async () => {
    // The two accounts now hold different values in every field position,
    // so a session resolving the wrong row cannot agree with both.
    const { first, second } = await pair()
    await expectSettingsState(
      app.db,
      first,
      { show_important: false, show_all: true, show_done: true },
      'the first account\'s GET must answer the first account\'s row',
    )
    await expectSettingsState(
      app.db,
      second,
      { show_important: true, show_all: false, show_done: false },
      'the second account\'s GET must answer the second account\'s row',
    )
  })
})
