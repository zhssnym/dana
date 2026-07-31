/*
AC-115: given a completed sign-in, when the database is inspected, then no
Google access, refresh, or ID token is stored anywhere.

Section 11.6: "No Google access, refresh, or ID token is persisted once the
callback transaction completes." Anywhere is the word that shapes the test.
The obvious place to look is the users table, and that is the one place an
implementation is least likely to have put them; the plausible places are a
sessions table, which belongs to the Security engineer and lives outside the
section 4 model by 10.1, and any incidental audit or log table. So the sweep
is driven from information_schema rather than from a list: every text, varchar,
character, json, jsonb, and bytea column of every non-system schema, including
tables this suite has never heard of. bytea is read with escape encoding
rather than cast, because casting yields hex and would hide an ASCII token in
plain sight.

The stub issues tokens with distinctive, unique values for exactly this
reason, so a hit is unambiguous and a miss cannot be a coincidence.

Two guards keep the file from passing for the wrong reason, which matters more
here than anywhere else in the package, because searching for nothing and
finding nothing looks identical to success. The sign-in must have completed,
proved by the session working. And the provider must actually have issued
tokens, proved by counting them: if the callback never reached the token
endpoint, the sweep would search for an empty list and report a clean bill of
health on a flow that never happened.

The sweep runs again after a second sign-in. The criterion's window opens when
the callback transaction completes, and a refresh token that is written and
then cleaned up on the next login would slip past a single look.

Spec: 11.6, 10.1.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import {
  cleanupAuthSubs,
  signIn,
  startAuthTestApp,
  sweepForSecrets,
  usersForSub,
} from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'

let app: AuthTestApp
const domain = `ac115-${randomUUID()}.test`
const sub = `sub-tokens-${randomUUID()}`

beforeAll(async () => {
  app = await startAuthTestApp()
  app.stub.nextIdentity({
    sub,
    email: `tokenholder@${domain}`,
    email_verified: true,
    name: 'Token Holder',
  })
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cleanupAuthSubs(app.db, [sub])
  await app.close()
})

async function sweep(): Promise<void> {
  const tokens = app.stub.issuedTokens()
  expect(
    tokens.length,
    'the provider issued no tokens, so this sweep would search for nothing: the sign-in never reached the token endpoint',
  ).toBeGreaterThan(0)

  const hits = await sweepForSecrets(app.db, tokens)
  expect(
    hits,
    `a Google token is persisted in the database (spec 11.6): ${hits
      .map((hit) => `${hit.table}.${hit.column}`)
      .join(', ')}`,
  ).toEqual([])
}

describe('AC-115: no Google token is persisted', () => {
  test('AC-115: after a completed sign-in, no issued token appears anywhere', async () => {
    const { browser } = await signIn(app)

    // The sweep means nothing unless the sign-in it follows actually
    // happened, so the session is exercised before the database is read.
    expect(
      (await browser.api('/me')).status,
      'the sign-in did not establish a working session, so there is nothing to sweep after',
    ).toBe(200)
    expect(await usersForSub(app.db, sub)).toHaveLength(1)

    await sweep()
  })

  test('AC-115 adversarial: a second sign-in leaves nothing behind either', async () => {
    // Fresh access, refresh, and ID tokens, and a login path that is now the
    // returning-user branch rather than the provisioning one. A token written
    // during the callback and tidied away later would survive one look.
    const before = app.stub.issuedTokens().length
    const { browser } = await signIn(app)
    expect(
      app.stub.issuedTokens().length,
      'the second sign-in exchanged no new tokens',
    ).toBeGreaterThan(before)
    expect((await browser.api('/me')).status).toBe(200)

    await sweep()
  })
})
