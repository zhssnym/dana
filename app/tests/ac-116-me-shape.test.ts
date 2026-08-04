/*
AC-116: given GET /me or PATCH /me answers 200, when the body is inspected,
then it is exactly the 7.1 object: the same keys and shapes, nothing extra,
nothing missing.

Exactly is the criterion's word, so the assertions are exact key sets at
every level, not presence checks: an extra key is as much a drift as a
missing one, because a client shipped against the drifted body breaks when
the accident is fixed. The shape is restated here from section 7.1 rather
than imported from app/src/shared/me.ts, by the same Steward ruling that
keeps the timezone predicate independent: this suite measures that module's
surface and cannot borrow its definition of correct.

The 7.1 sentence added at the P1 merge is pinned too: PATCH /me returns the
GET /me object, so the two bodies for an unchanged account are equal, and
after a timezone change the PATCH body equals what a fresh GET then says.

Spec: 7.1, 7.2, 4.10, 10.3; section 12 amendment ddd391b.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import {
  cleanupAuthSubs,
  isIanaTimezone,
  signIn,
  startAuthTestApp,
  userForSub,
} from './auth-harness.js'
import type { AuthTestApp, SignedIn, UserRow } from './auth-harness.js'

let app: AuthTestApp
let held: SignedIn | undefined
const sub = `ac116-${randomUUID()}`
const email = `holder-${randomUUID()}@ac116.test`

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

async function holder(): Promise<SignedIn> {
  if (held === undefined) {
    app.stub.nextIdentity({
      sub,
      email,
      email_verified: true,
      name: 'Shape Holder',
    })
    held = await signIn(app)
  }
  return held
}

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cleanupAuthSubs(app.db, [sub])
  await app.close()
})

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function sortedKeys(value: unknown): string[] {
  expect(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    'the inspected value must be a JSON object (spec 7.1)',
  ).toBe(true)
  return Object.keys(value as Record<string, unknown>).sort()
}

/** The whole of AC-116's then-clause, applied to one 200 body. */
function expectExactMeShape(body: unknown, source: string): void {
  expect(
    sortedKeys(body),
    `${source} must carry exactly user, settings, pending_invite_count (spec 7.1: nothing extra, nothing missing)`,
  ).toEqual(['pending_invite_count', 'settings', 'user'])

  const me = body as {
    user: unknown
    settings: unknown
    pending_invite_count: unknown
  }

  expect(
    sortedKeys(me.user),
    `${source} user must carry exactly the five 7.1 fields`,
  ).toEqual(['avatar_url', 'display_name', 'email', 'id', 'timezone'])
  const user = me.user as Record<string, unknown>
  expect(
    typeof user.id === 'string' && UUID_SHAPE.test(user.id),
    `${source} user.id must be a uuid string`,
  ).toBe(true)
  expect(
    typeof user.email === 'string' || user.email === null,
    `${source} user.email is a string, null only after the 8.10 scrub (spec 4.1)`,
  ).toBe(true)
  expect(
    typeof user.display_name === 'string' || user.display_name === null,
    `${source} user.display_name is string or null (spec 4.1)`,
  ).toBe(true)
  expect(
    typeof user.avatar_url === 'string' || user.avatar_url === null,
    `${source} user.avatar_url is string or null (spec 4.1)`,
  ).toBe(true)
  expect(
    isIanaTimezone(user.timezone),
    `${source} user.timezone must be a valid IANA identifier (INV-14)`,
  ).toBe(true)

  expect(
    sortedKeys(me.settings),
    `${source} settings must carry exactly the three 7.2 booleans`,
  ).toEqual(['show_all', 'show_done', 'show_important'])
  const settings = me.settings as Record<string, unknown>
  for (const key of ['show_important', 'show_all', 'show_done']) {
    expect(
      typeof settings[key],
      `${source} settings.${key} must be a boolean (spec 7.2)`,
    ).toBe('boolean')
  }

  expect(
    typeof me.pending_invite_count === 'number' &&
      Number.isInteger(me.pending_invite_count) &&
      me.pending_invite_count >= 0,
    `${source} pending_invite_count must be a non-negative integer (spec 7.1)`,
  ).toBe(true)
}

describe('AC-116: the /me bodies are exactly the 7.1 object', () => {
  test('AC-116: GET /me answers exactly the 7.1 object', async () => {
    const signedIn = await holder()
    const response = await signedIn.browser.api('/me')
    expect(response.status, 'GET /me must answer 200 (spec 7.1)').toBe(200)
    expectExactMeShape(response.json(), 'GET /me')
  })

  test('AC-116 adversarial: the body describes this account, not just any shape', async () => {
    // A wrong-user body with the right keys would pass a pure shape check.
    const signedIn = await holder()
    const body = (await signedIn.browser.api('/me')).json() as {
      user: { id: string; email: string | null }
      pending_invite_count: number
    }
    const row = (await userForSub(app.db, sub)) as UserRow
    expect(
      body.user.id,
      'user.id must be the provisioned row for this session (spec 7.1)',
    ).toBe(row.id)
    expect(
      body.user.email,
      'user.email is the lowercased provisioned address (spec 7.1)',
    ).toBe(email)
    expect(
      body.pending_invite_count,
      'a fresh account with no invites counts zero (spec 7.1, Q12)',
    ).toBe(0)
  })

  test('AC-116: PATCH /me answers exactly the 7.1 object', async () => {
    const signedIn = await holder()
    const response = await signedIn.browser.json('/me', 'PATCH', {
      timezone: 'Asia/Karachi',
    })
    expect(
      response.status,
      'PATCH /me with a valid IANA zone must answer 200 (spec 7.1)',
    ).toBe(200)
    expectExactMeShape(response.json(), 'PATCH /me')
    const body = response.json() as { user: { timezone: string } }
    expect(
      body.user.timezone,
      'the PATCH body already carries the new zone (spec 7.1)',
    ).toBe('Asia/Karachi')
  })

  test('AC-116: the PATCH body equals what a fresh GET then answers', async () => {
    // The P1 merge amendment's whole point: a client that changed the
    // timezone holds the same truth a fresh GET would give it.
    const signedIn = await holder()
    const patched = (
      await signedIn.browser.json('/me', 'PATCH', { timezone: 'Europe/London' })
    ).json()
    const fetched = (await signedIn.browser.api('/me')).json()
    expect(
      patched,
      'PATCH /me returns the GET /me object (spec 7.1, P1 merge amendment)',
    ).toEqual(fetched)
  })
})
