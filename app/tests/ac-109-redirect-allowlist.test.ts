/*
AC-109: given crafted return-target parameters or Host headers on the auth
endpoints, when they respond with redirects, then every redirect target is on
the application origin.

Read literally the criterion would forbid the one redirect the flow cannot do
without, the one to Google, so "every redirect target" means every target the
request can influence. Section 11.6 says it without the ambiguity: "Auth
endpoints never redirect off the application origin, whatever the request
carries in parameters or Host headers." Three targets are influenceable and
all three are asserted here: the redirect_uri carried inside the authorization
request, the redirect after a callback succeeds, and the redirect after one is
refused. The outward redirect is asserted too, in the other direction, that it
goes to the configured issuer and not to a host the request supplied, because
an authorization request assembled from the Host header sends the user and
their authorization code to whoever set it.

Host headers cannot be sent with fetch, which silently drops them as a
forbidden header; the harness speaks node:http for this reason.

Every case begins by asserting the redirect exists. Without that the whole
file passes vacuously against an endpoint that returns nothing at all, which
is exactly what it does today.

Spec: 11.6, 7.1, 10.2.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import {
  authUrl,
  beginAuthorization,
  cleanupAuthSubs,
  completeCallback,
  expectRedirect,
  followAuthorization,
  startAuthTestApp,
} from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'

let app: AuthTestApp
const domain = `ac109-${randomUUID()}.test`
const sub = `sub-redirect-${randomUUID()}`
const refusedSub = `sub-redirect-refused-${randomUUID()}`

const EVIL = 'evil.example.invalid'

// The shapes that defeat a naive "starts with /" or "not http" check. The
// backslash forms matter because browsers normalize them to slashes.
const RETURN_TARGETS = [
  `https://${EVIL}/`,
  `http://${EVIL}/`,
  `//${EVIL}/`,
  `/\\${EVIL}/`,
  `\\\\${EVIL}/`,
  `https://127.0.0.1.${EVIL}/`,
  `/%09/${EVIL}`,
  `https:${EVIL}`,
]

const RETURN_PARAMS = [
  'next',
  'redirect',
  'redirect_uri',
  'redirect_to',
  'return',
  'return_to',
  'returnTo',
  'continue',
  'url',
  'dest',
]

const CRAFTED_HOST_HEADERS: Record<string, string>[] = [
  { 'x-forwarded-host': EVIL },
  { 'x-forwarded-host': EVIL, 'x-forwarded-proto': 'https' },
  { 'x-forwarded-server': EVIL },
  { forwarded: `host=${EVIL};proto=https` },
]

beforeAll(async () => {
  app = await startAuthTestApp()
  app.stub.nextIdentity({
    sub,
    email: `redirected@${domain}`,
    email_verified: true,
  })
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cleanupAuthSubs(app.db, [sub, refusedSub])
  await app.close()
})

/** A relative target is on this origin by construction; an absolute one must say so. */
function expectOnAppOrigin(location: string, why: string): void {
  const resolved = new URL(location, app.origin)
  expect(
    resolved.origin,
    `${why}: redirect target ${location} leaves the application origin (spec 11.6)`,
  ).toBe(app.origin)
}

/**
 * For the paths where the specification does not require a redirect at all.
 * The assertion always runs: a response with no Location cannot have escaped,
 * so its resolved origin is this one, and a response with a Location is held
 * to it. That keeps the case from being written as a conditional that quietly
 * asserts nothing when the header is absent.
 */
function expectNoOffOriginRedirect(location: string | null, why: string): void {
  expect(
    location === null ? app.origin : new URL(location, app.origin).origin,
    `${why}: redirect target ${String(location)} leaves the application origin (spec 11.6)`,
  ).toBe(app.origin)
}

describe('AC-109: auth endpoints never redirect off the application origin', () => {
  test('AC-109: a crafted Host does not move the redirect_uri off this origin', async () => {
    for (const headers of CRAFTED_HOST_HEADERS) {
      const authorization = await beginAuthorization(app, app.browser(), {
        headers,
        hostHeader: EVIL,
      })
      const redirectUri = authorization.searchParams.get('redirect_uri')
      expect(
        redirectUri,
        `the authorization request carries no redirect_uri (headers ${JSON.stringify(headers)})`,
      ).not.toBeNull()
      expectOnAppOrigin(
        redirectUri as string,
        `with Host ${EVIL} and ${JSON.stringify(headers)}`,
      )
    }
  })

  test('AC-109: a crafted Host does not move the authorization request off the issuer', async () => {
    // The other direction, and the more expensive mistake: an authorization
    // URL built from the request's own Host sends the person, and then their
    // authorization code, to whoever set that header.
    const authorization = await beginAuthorization(app, app.browser(), {
      hostHeader: EVIL,
      headers: { 'x-forwarded-host': EVIL, 'x-forwarded-proto': 'https' },
    })
    expect(
      authorization.origin,
      'the authorization request was addressed to a host the request supplied',
    ).toBe(app.stub.issuerUrl)
  })

  test('AC-109: crafted return targets do not escape on a successful callback', async () => {
    // Every parameter name against one payload, then every payload against
    // one parameter name. The full cross-product would be eighty sign-in
    // flows to cover the same two axes.
    const cases: { param: string; target: string }[] = [
      ...RETURN_PARAMS.map((param, index) => ({
        param,
        target: RETURN_TARGETS[index % RETURN_TARGETS.length] as string,
      })),
      ...RETURN_TARGETS.map((target) => ({ param: 'next', target })),
    ]

    for (const { param, target } of cases) {
      const browser = app.browser()
      const start = new URL(authUrl(app, '/auth/google'))
      start.searchParams.set(param, target)

      const begun = await browser.request(start.toString())
      expectRedirect(
        begun,
        `GET /auth/google?${param} must still redirect to Google (spec 7.1)`,
      )

      const callbackUrl = await followAuthorization(
        app,
        new URL(begun.location as string),
      )
      const callback = await completeCallback(browser, callbackUrl)

      // Section 7.1 requires the completed callback to redirect into the app,
      // so here the redirect's existence is asserted rather than tolerated.
      expect(
        callback.location,
        `the completed callback carries no Location (${param}=${target})`,
      ).not.toBeNull()
      expectOnAppOrigin(callback.location as string, `after ${param}=${target}`)
    }
  }, 120_000)

  test('AC-109 adversarial: a refused callback does not escape either', async () => {
    // The refusal path is the one an implementer writes last and tests least,
    // and it is reachable without any valid credential at all.
    app.stub.nextIdentity({
      sub: refusedSub,
      email: `refused@${domain}`,
      email_verified: false,
    })

    const browser = app.browser()
    const callbackUrl = await followAuthorization(
      app,
      await beginAuthorization(app, browser),
    )
    for (const param of ['next', 'return_to']) {
      const crafted = new URL(callbackUrl)
      crafted.searchParams.set(param, `https://${EVIL}/`)
      const callback = await completeCallback(browser.clone(), crafted, {
        hostHeader: EVIL,
        headers: { 'x-forwarded-host': EVIL },
      })
      expectNoOffOriginRedirect(
        callback.location,
        `on the refusal path with ${param}`,
      )
      expect(
        callback.status,
        'a refused callback must not answer 5xx',
      ).toBeLessThan(500)
    }
  })

  test('AC-109 adversarial: the provider error path does not escape', async () => {
    // Google redirects back with error=access_denied whenever someone cancels
    // at the consent screen, so this path is walked by real users and not
    // only by attackers.
    app.stub.failNextAuthorization('access_denied')
    const browser = app.browser()
    const callbackUrl = await followAuthorization(
      app,
      await beginAuthorization(app, browser),
    )
    const crafted = new URL(callbackUrl)
    crafted.searchParams.set('next', `https://${EVIL}/`)

    const callback = await completeCallback(browser, crafted, {
      hostHeader: EVIL,
    })
    expect(
      callback.status,
      'a cancelled authorization must not answer 5xx',
    ).toBeLessThan(500)
    expectNoOffOriginRedirect(callback.location, 'on the provider error path')
  })
})
