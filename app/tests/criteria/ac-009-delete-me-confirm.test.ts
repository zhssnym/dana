/*
AC-009: given DELETE /me without the literal confirm string, when called,
then 422 and no change.

Section 7.1: 'Body { confirm: "DELETE" }, literal string required, else 422'.
Literal is the whole content of the criterion, so the cases are the ways an
implementation drifts off literal: the wrong case, the absent field, and the
wrong type. A check written as a truthiness test, a case-insensitive compare,
or a loose equality passes a test that only sends an empty body.

Two details keep the failures attributable. Every request carries a valid CSRF
token, because 7.0 requires one on mutations and a missing header would answer
403 (11.6), which would make this file red for a reason that has nothing to do
with the confirm guard. And the last test spends a separate account on the
successful call, because without it every 422 above is equally well explained
by a DELETE /me that rejects everything.

The successful call is asserted only on its status. Section 8.10's deletion
transaction belongs to the Collaboration engineer and arrives as a stub in
this package (RFC 0001 implementation plan, P1), so asserting the scrubbed row
here would be testing work that is not in this package. What DELETE /me owes
P1 is its route, its confirm guard, and session destruction; the last of those
is AC-112.

Spec: 7.1, 7.0, 10.3.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import {
  cleanupAuthSubs,
  signIn,
  startAuthTestApp,
  userForSub,
} from '../support/auth-harness.js'
import type { AuthTestApp, SignedIn, UserRow } from '../support/auth-harness.js'

let app: AuthTestApp
let held: SignedIn | undefined
const domain = `ac009-${randomUUID()}.test`
const holdSub = `sub-hold-${randomUUID()}`
const spendSub = `sub-spend-${randomUUID()}`

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

/*
The account the rejected shapes are aimed at, signed in on first use rather
than in beforeAll. A failure in beforeAll reports the whole file as one error
and marks its tests skipped, which hides which criteria were being asserted;
signing in lazily makes each test fail under its own name instead.
*/
async function holder(): Promise<SignedIn> {
  if (held === undefined) {
    app.stub.nextIdentity({
      sub: holdSub,
      email: `holder@${domain}`,
      email_verified: true,
      name: 'Careful Person',
    })
    held = await signIn(app)
  }
  return held
}

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cleanupAuthSubs(app.db, [holdSub, spendSub])
  await app.close()
})

/** Every rejected shape must leave the account and the session exactly as they were. */
async function expectNoChange(before: UserRow): Promise<void> {
  const after = await userForSub(app.db, holdSub)
  expect(after, 'a rejected DELETE /me changed the account row').toEqual(before)
  const me = await (await holder()).browser.api('/me')
  expect(me.status, 'a rejected DELETE /me destroyed the session').toBe(200)
}

describe('AC-009: DELETE /me requires the literal confirm string', () => {
  test('AC-009: a missing confirm field answers 422 and changes nothing', async () => {
    const signedIn = await holder()
    const before = await userForSub(app.db, holdSub)
    expect(before, 'the account must exist before the attempt').toBeDefined()

    const response = await signedIn.browser.json('/me', 'DELETE', {})
    expect(
      response.status,
      'DELETE /me without confirm must answer 422 (spec 7.1)',
    ).toBe(422)
    await expectNoChange(before as UserRow)
  })

  test('AC-009 adversarial: the wrong case answers 422', async () => {
    const signedIn = await holder()
    const before = await userForSub(app.db, holdSub)
    for (const confirm of ['delete', 'Delete', 'DELETE ', ' DELETE']) {
      const response = await signedIn.browser.json('/me', 'DELETE', { confirm })
      expect(
        response.status,
        `confirm ${JSON.stringify(confirm)} is not the literal string and must answer 422`,
      ).toBe(422)
    }
    await expectNoChange(before as UserRow)
  })

  test('AC-009 adversarial: a non-string confirm answers 422', async () => {
    const signedIn = await holder()
    const before = await userForSub(app.db, holdSub)
    // A truthiness check passes true and 1; a loose compare passes neither
    // but a zod schema missing .literal() would take any string.
    for (const confirm of [true, 1, ['DELETE'], { value: 'DELETE' }, null]) {
      const response = await signedIn.browser.json('/me', 'DELETE', { confirm })
      expect(
        response.status,
        `confirm ${JSON.stringify(confirm)} is not a literal string and must answer 422`,
      ).toBe(422)
    }
    await expectNoChange(before as UserRow)
  })

  test('AC-009 positive control: the literal string is accepted', async () => {
    // A separate account, because this one is spent. Without this test the
    // three above are satisfied by an endpoint that answers 422 always.
    app.stub.nextIdentity({
      sub: spendSub,
      email: `spender@${domain}`,
      email_verified: true,
      name: 'Departing Person',
    })
    const departing = await signIn(app)

    const response = await departing.browser.json('/me', 'DELETE', {
      confirm: 'DELETE',
    })
    expect(
      response.status,
      'DELETE /me with the literal confirm string must answer 204 (spec 7.1)',
    ).toBe(204)
  })
})
