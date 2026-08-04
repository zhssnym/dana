/*
Harness for the P2S settings criteria (AC-119 to AC-123), the thin layer the
five files share, built on the P1 auth harness and the P2 actor pattern. The
criteria landed verbatim by the Steward's section 12 amendment (RFC 0001,
P2S row).

Three decisions worth the words:

**The exact shape is restated here, once.** AC-119's word is exactly, so the
check is an exact key set with strictly boolean values, restated from frozen
7.2 rather than imported from app/src/shared/me.ts, by the standing Steward
ruling: this suite measures that surface and cannot borrow its definition of
correct. The 4.10 defaults are restated for the same reason.

**The ruled PATCH response body is judged in exactly one place**,
patchSettingsOk below. Frozen 7.2 named no body while these files were
written, so nothing judged it and the place was held open; the owner ruled
it at the same amendment that landed the criteria, and 7.2 now carries the
fresh-GET sentence. Refusals and AC-120's raced pair stay on the unjudged
transport, for the two reasons recorded there.

**The stored row is read beside the wire.** A settings endpoint that answers
200 without writing, or writes without answering, must fail on whichever
half lied, so the files assert both sides against the same expectation
rather than trusting either alone.
*/
import { sql } from 'drizzle-orm'
import { expect } from 'vitest'

import type { Db } from '../db/client.js'
import type { Actor } from './folders-harness.js'
import type { RawResponse } from './http-client.js'
import { rows } from './helpers.js'

/** The three 7.2 booleans. */
export interface SettingsBooleans {
  show_important: boolean
  show_all: boolean
  show_done: boolean
}

/** The 4.10 column defaults: Done ships hidden, the other two ship shown. */
export const SETTINGS_DEFAULTS: SettingsBooleans = {
  show_important: true,
  show_all: true,
  show_done: false,
}

export const SETTINGS_KEYS = [
  'show_all',
  'show_done',
  'show_important',
] as const

/** The whole of AC-119's shape clause, applied to one body. */
export function expectExactSettingsShape(
  body: unknown,
  source: string,
): SettingsBooleans {
  expect(
    typeof body === 'object' && body !== null && !Array.isArray(body),
    `${source} must answer a JSON object (spec 7.2)`,
  ).toBe(true)
  expect(
    Object.keys(body as Record<string, unknown>).sort(),
    `${source} must carry exactly the three 7.2 booleans, nothing extra, nothing missing`,
  ).toEqual([...SETTINGS_KEYS])
  const record = body as Record<string, unknown>
  for (const key of SETTINGS_KEYS) {
    expect(
      typeof record[key],
      `${source} ${key} must be a boolean (spec 7.2, 4.10)`,
    ).toBe('boolean')
  }
  return record as unknown as SettingsBooleans
}

export function getSettings(actor: Actor): Promise<RawResponse> {
  return actor.browser.api('/me/settings')
}

/** GET /me/settings asserted: 200 and exactly the 7.2 shape. */
export async function readSettings(actor: Actor): Promise<SettingsBooleans> {
  const response = await getSettings(actor)
  expect(
    response.status,
    `GET /me/settings must answer 200 with the three booleans (spec 7.2); answered ${String(response.status)} with body: ${response.body.slice(0, 160)}`,
  ).toBe(200)
  return expectExactSettingsShape(response.json(), 'GET /me/settings')
}

/** PATCH /me/settings, unjudged: the transport the refusals and the raced
 * pair use, where the response body is not the settings object. */
export function patchSettings(
  actor: Actor,
  body: unknown,
  options: { csrf?: 'auto' | 'omit' | string } = {},
): Promise<RawResponse> {
  return actor.browser.json('/me/settings', 'PATCH', body, options)
}

/*
PATCH /me/settings asserted, which is where the ruled response body is
judged, once, for every sequential success in this package.

Frozen 7.2 was silent on this body while the criteria were written, so
this place was held open rather than guessed at. The owner ruled it at
the section 12 amendment and 7.2 now carries the sentence: PATCH
/me/settings answers the GET /me/settings object, the same fresh-GET
convention 7.1 carries on PATCH /me and 7.4 on each of its mutations. So
a success is judged twice over, the way ac-116 and ac-023 judge theirs:
the body is exactly the three booleans, and it equals what a fresh GET
then answers.

Two callers stay on the unjudged transport above, each for a reason the
ruling does not reach. A refusal answers the 7.0 envelope, not the
settings object. And AC-120's raced pair cannot assert the fresh-GET
half at all: each response is the truth at its own commit, and a GET
after both reflects both, so an equality there would be asserting a
coincidence and would fail on correct implementations.
*/
export async function patchSettingsOk(
  actor: Actor,
  body: unknown,
  why: string,
): Promise<SettingsBooleans> {
  const response = await patchSettings(actor, body)
  expect(
    response.status,
    `${why}; answered ${String(response.status)} with body: ${response.body.slice(0, 160)}`,
  ).toBe(200)
  const patched = expectExactSettingsShape(
    response.json(),
    'the PATCH /me/settings body',
  )
  expect(
    patched,
    'PATCH /me/settings answers the GET /me/settings object, so its body must equal what a fresh GET then answers (spec 7.2, owner ruling at the P2S amendment)',
  ).toEqual(await readSettings(actor))
  return patched
}

/** The settings key of GET /me, whose shape AC-116 already pins; these files
 * read it only to assert the two endpoints tell one truth. */
export async function meSettingsKey(actor: Actor): Promise<unknown> {
  const response = await actor.browser.api('/me')
  expect(
    response.status,
    'GET /me must answer 200 (spec 7.1; P1 is merged, so this is expected to hold)',
  ).toBe(200)
  return (response.json() as { settings?: unknown }).settings
}

/** The stored row, raw: values compare against literal booleans so a wrong
 * storage type fails visibly rather than being coerced into agreement. */
export async function storedSettings(
  db: Db,
  userId: string,
): Promise<Record<string, unknown>> {
  const found = await rows(
    db,
    sql`SELECT show_important, show_all, show_done
        FROM user_settings WHERE user_id = ${userId}`,
  )
  const first = found[0]
  expect(
    first,
    'the user_settings row must exist for a provisioned user (INV-14; P1 is merged)',
  ).toBeDefined()
  return {
    show_important: first?.show_important,
    show_all: first?.show_all,
    show_done: first?.show_done,
  }
}

/** Wire, /me agreement, and stored row against one expectation. */
export async function expectSettingsState(
  db: Db,
  actor: Actor,
  expected: SettingsBooleans,
  why: string,
): Promise<void> {
  expect(await readSettings(actor), `${why}: GET /me/settings disagrees`).toEqual(
    expected,
  )
  expect(
    await meSettingsKey(actor),
    `${why}: the settings key of GET /me disagrees (7.1 and 7.2 read one row)`,
  ).toEqual(expected)
  expect(
    await storedSettings(db, actor.id),
    `${why}: the stored user_settings row disagrees`,
  ).toEqual(expected)
}

/** AC-117's envelope, asserted beside a status the way ac-118 does it. */
export function expectEnvelopedStatus(
  response: RawResponse,
  expected: number,
  source: string,
): void {
  expect(
    response.status,
    `${source} must answer ${String(expected)} (spec 7.0, 7.2); answered ${String(response.status)} with body: ${response.body.slice(0, 160)}`,
  ).toBe(expected)
  let body: unknown
  try {
    body = response.json()
  } catch {
    body = undefined
  }
  const error = (
    body as { error?: { code?: unknown; message?: unknown } } | undefined
  )?.error
  expect(
    typeof error?.code === 'string' &&
      error.code.length > 0 &&
      typeof error.message === 'string' &&
      error.message.length > 0,
    `${source} must carry the 7.0 envelope (AC-117)`,
  ).toBe(true)
}
