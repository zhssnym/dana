/*
AC-008: given Google reports the email unverified, when the callback runs,
then sign-in is refused with the explanation page and no rows are created.

Section 10.1 states the rule without qualification: "Sign-ins with an
unverified Google email are rejected." The criterion is phrased around a first
sign-in, so it says "no rows are created", but the rule it comes from is not
limited to first sign-ins. The returning-account case is therefore asserted
too, with the stronger statement the situation allows: not merely that no rows
were created, but that the existing row is untouched. An implementation that
checks email_verified only on the provisioning branch passes the criterion as
literally written and still lets an unverified claim take over an existing
account, which is the attack worth closing.

Section 13 item 9 records the assumption behind this: every allowed Google
sign-in is expected to supply a verified email, and this rejection is the
containment if a Workspace edge case ever supplies otherwise.

The page's copy is asserted as of the 2026-07-31 amendment, which gave 9.2 the
rejection page's normative wording. Copy in section 9 is normative like every
other statement there ("design may restyle, not reword, without a spec
change"), so the heading, the body, and the action label are compared exactly,
against the words a reader would see rather than the raw markup: an apostrophe
served as &#39; or as a typographic quote is a rendering, not a rewording, and
a suite that failed on it would be enforcing an escaping choice nobody made.

Spec: 7.1, 10.1, 9.2, section 13 item 9.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import {
  attemptSignIn,
  cleanupAuthSubs,
  expectNoSession,
  rawRequest,
  signIn,
  startAuthTestApp,
  userForSub,
  usersForSub,
  visibleText,
} from './auth-harness.js'
import type { AuthTestApp, RawResponse, UserRow } from './auth-harness.js'

let app: AuthTestApp
const domain = `ac008-${randomUUID()}.test`
const strangerSub = `sub-unverified-${randomUUID()}`
const returningSub = `sub-returning-${randomUUID()}`
const verifiedSub = `sub-verified-${randomUUID()}`
const copySub = `sub-copy-${randomUUID()}`

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cleanupAuthSubs(app.db, [strangerSub, returningSub, verifiedSub, copySub])
  await app.close()
})

// Section 9.2, verbatim. Copy in section 9 is normative.
const HEADING = "We can't sign you in yet"
const BODY =
  "Your Google email address isn't verified. Dana uses your email for sharing " +
  'and invites, so it needs Google to confirm it first. Verify your email with ' +
  'Google, then try again.'
const ACTION_LABEL = 'Back to Dana'

/**
 * A refusal reaches the person as something readable, either directly or by
 * sending them somewhere on this origin that is.
 */
function expectExplanationPage(callback: RawResponse): void {
  const isPage = callback.contentType.includes('text/html')
  const isSameOriginRedirect =
    callback.status >= 300 &&
    callback.status < 400 &&
    callback.location !== null &&
    new URL(callback.location, app.origin).origin === app.origin
  expect(
    isPage || isSameOriginRedirect,
    `a refused sign-in must answer with the explanation page (spec 10.1), got ${String(callback.status)} ${callback.contentType}`,
  ).toBe(true)
}

/**
 * Follows one same-origin redirect if the callback used one, so the copy is
 * asserted wherever the page actually is. 9.2 says the callback renders it,
 * and rendering it after a redirect to a dedicated route is the same product
 * behavior; what matters is that the person arrives at these words.
 */
async function refusalPage(callback: RawResponse): Promise<RawResponse> {
  if (callback.contentType.includes('text/html')) return callback
  expect(
    callback.location,
    'the refusal neither rendered a page nor redirected to one (spec 9.2)',
  ).not.toBeNull()
  const target = new URL(callback.location ?? '', app.origin)
  expect(target.origin, 'the refusal redirected off the application origin').toBe(
    app.origin,
  )
  return rawRequest(target)
}

describe('AC-008: an unverified Google email is refused', () => {
  test('AC-008: sign-in is refused and no rows are created', async () => {
    app.stub.nextIdentity({
      sub: strangerSub,
      email: `unverified@${domain}`,
      email_verified: false,
      name: 'Unverified Person',
    })

    const { callback } = await attemptSignIn(app)

    expectNoSession(callback, 'Google reported the email unverified')
    expectExplanationPage(callback)
    expect(
      await usersForSub(app.db, strangerSub),
      'a refused sign-in created a user row (spec 10.1)',
    ).toHaveLength(0)
  })

  test('AC-008: the rejection page carries the normative copy of 9.2', async () => {
    app.stub.nextIdentity({
      sub: copySub,
      email: `copy@${domain}`,
      email_verified: false,
      name: 'Unverified Reader',
    })

    const { callback } = await attemptSignIn(app)
    const page = await refusalPage(callback)
    const text = visibleText(page.body)

    expect(text, `the 9.2 heading is missing from the rejection page: ${text}`).toContain(
      HEADING,
    )
    expect(text, 'the 9.2 body copy is missing or reworded').toContain(BODY)
    expect(text, 'the 9.2 action label is missing').toContain(ACTION_LABEL)

    // "one action, a link labeled Back to Dana, returning to the landing
    // page". A label with no link behind it is not the action 9.2 specifies.
    const links = [...page.body.matchAll(/<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    const action = links.find(
      (link) => visibleText(link[2] ?? '') === ACTION_LABEL,
    )
    expect(
      action,
      `no link is labeled ${ACTION_LABEL} (spec 9.2); found ${JSON.stringify(links.map((l) => visibleText(l[2] ?? '')))}`,
    ).toBeDefined()
    const href = new URL(action?.[1] ?? '', app.origin)
    expect(
      href.origin,
      'the rejection page action leaves the application origin',
    ).toBe(app.origin)
    expect(
      href.pathname,
      'the action must return to the landing page (spec 9.2)',
    ).toBe('/')
  })

  test('AC-008 adversarial: an unverified claim cannot take over an existing account', async () => {
    // The account is established normally first, so the second attempt
    // exercises the login branch rather than the provisioning branch.
    app.stub.nextIdentity({
      sub: returningSub,
      email: `returning@${domain}`,
      email_verified: true,
      name: 'Verified Once',
    })
    await signIn(app)
    const before = await userForSub(app.db, returningSub)
    expect(before, 'the account must exist before the attack').toBeDefined()

    app.stub.nextIdentity({ email_verified: false, name: 'Impostor' })
    const { callback } = await attemptSignIn(app)

    expectNoSession(callback, 'the returning account reported an unverified email')
    const after = await userForSub(app.db, returningSub)
    expect(
      after,
      'the refused sign-in modified the existing account (spec 10.1)',
    ).toEqual(before as UserRow)
  })

  test('AC-008 positive control: a verified email signs in', async () => {
    // Without this, every assertion above is satisfied by a callback that
    // refuses everyone.
    app.stub.nextIdentity({
      sub: verifiedSub,
      email: `verified@${domain}`,
      email_verified: true,
      name: 'Verified Person',
    })

    const { session } = await signIn(app)
    expect(session.value).not.toBe('')
    expect(await usersForSub(app.db, verifiedSub)).toHaveLength(1)
  })
})
