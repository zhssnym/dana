/*
AC-121 (proposed, P2S): given PATCH /me/settings carrying a non-boolean
value for any of the three fields, null included since 4.10 admits no null
state, then 422 naming the field and no setting changes.

Null earns its own sentence because the nearest precedent points the wrong
way: the P2 merge ratified null-clears for the my-membership PATCH, whose
label and color are nullable by contract. The 4.10 settings columns are NOT
NULL booleans with a default, there is nothing to clear back to, so null
here is a wrong-typed value like any other, answering 422 by amended 7.0.
An implementation borrowing the my-membership convention, or coercing
truthy strings and numbers the way a lax boolean parser does, fails here.

The 400 half of the taxonomy (unparseable, non-object, over-limit) is
deliberately not probed again: body parsing is one boot-level middleware
and AC-118 pins it for the whole surface from the /me routes.

This file is red until P2S lands the endpoint: the route answers 404 today.

Spec: 7.2 (frozen), 7.0, 4.10, 10.3; RFC 0001 P2S row; criteria proposed to
the Steward for the section 12 amendment.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  SETTINGS_KEYS,
  expectEnvelopedStatus,
  expectSettingsState,
  patchSettings,
  patchSettingsOk,
  storedSettings,
} from './settings-harness.js'
import type { SettingsBooleans } from './settings-harness.js'

let app: AuthTestApp
const cast = new Cast(['settings-typist'])

/** A state no case below sends, so a landed refusal is unmistakable. */
const BASELINE: SettingsBooleans = {
  show_important: true,
  show_all: true,
  show_done: true,
}

let based: Actor | undefined

async function basedActor(): Promise<Actor> {
  if (based === undefined) {
    const [actor] = await cast.of(app)
    if (actor === undefined) throw new Error('cast must produce one actor')
    await patchSettingsOk(
      actor,
      BASELINE,
      'settling the baseline through a valid full subset must answer 200 before the refusals (spec 7.2)',
    )
    based = actor
  }
  return based
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-121: non-boolean settings values answer 422 naming the field', () => {
  test('AC-121: every non-boolean shape is refused, per field, with the field named', async () => {
    const actor = await basedActor()
    const wrongs: readonly [unknown, string][] = [
      ['true', 'the string "true" is not a boolean, and coercion would accept it'],
      ['false', 'the string "false" coerces to true under Boolean(), the worst of both'],
      [1, 'the number 1 is truthy, not a boolean'],
      [0, 'the number 0 is falsy, not a boolean'],
      [[], 'an array is not a boolean'],
      [{ value: true }, 'an object is not a boolean'],
    ]
    for (const key of SETTINGS_KEYS) {
      for (const [value, what] of wrongs) {
        const response = await patchSettings(actor, { [key]: value })
        expectEnvelopedStatus(response, 422, `PATCH /me/settings where ${key} is ${JSON.stringify(value)} (${what})`)
        expect(
          response.body.includes(key),
          `the 422 must name ${key} as the failing field (spec 7.0, 10.3)`,
        ).toBe(true)
      }
    }
    await expectSettingsState(
      app.db,
      actor,
      BASELINE,
      'after every refusal, no setting may have changed',
    )
  })

  test('AC-121: null is refused too, because 4.10 admits no null state', async () => {
    const actor = await basedActor()
    for (const key of SETTINGS_KEYS) {
      const response = await patchSettings(actor, { [key]: null })
      expectEnvelopedStatus(
        response,
        422,
        `PATCH /me/settings where ${key} is null (the my-membership null-clears reading does not transfer: these columns are NOT NULL with a default)`,
      )
      expect(
        response.body.includes(key),
        `the 422 must name ${key} as the failing field (spec 7.0, 10.3)`,
      ).toBe(true)
    }
    await expectSettingsState(
      app.db,
      actor,
      BASELINE,
      'after the null refusals, no setting may have changed',
    )
  })

  test('AC-121 adversarial: one wrong field refuses the whole write', async () => {
    // A field-at-a-time applier would land show_all before rejecting
    // show_done; a refused write changes nothing, valid fields included.
    const actor = await basedActor()
    const response = await patchSettings(actor, {
      show_all: false,
      show_done: 'yes',
    })
    expectEnvelopedStatus(
      response,
      422,
      'PATCH /me/settings with one valid and one wrong-typed field',
    )
    expect(
      response.body.includes('show_done'),
      'the 422 must name show_done as the failing field (spec 7.0, 10.3)',
    ).toBe(true)
    expect(
      await storedSettings(app.db, actor.id),
      'the valid field must not have landed beside the refusal (spec 10.3: a refused write changes nothing)',
    ).toEqual(BASELINE)
  })
})
