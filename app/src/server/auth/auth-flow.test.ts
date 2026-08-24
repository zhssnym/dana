/*
The module's own integration test, and the only evidence available to this
session that the acceptance criteria will pass: app/src/server/index.ts is the
Platform engineer's file, the router is not mounted there yet (see README.md),
so AC-005 to AC-010 and AC-105 to AC-115 cannot run against the real
application until the boot-wiring session lands.

So the router is mounted here instead, on a bare Express app that composes it
exactly the way the wiring request asks the boot file to, and driven with the
Adversarial Test role's own stub provider and HTTP client, imported unchanged
from app/tests/. Reading those files is allowed and editing them is not; this
imports and edits nothing. Where an assertion mirrors an acceptance criterion,
the criterion is named, so a later change that breaks one breaks the other in
the same words.

This is not a substitute for the acceptance suite and does not claim to be:
it exercises the same module through the same stub, one composition layer
away from the real boot file.
*/
import { createHash, randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { sql } from 'drizzle-orm'
import express from 'express'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { DbClient } from '../../../db/client.js'
import { visibleText } from '../../../tests/auth-harness.js'
import { cleanupUsers, createTestDb, rows } from '../../../tests/helpers.js'
import { TestBrowser } from '../../../tests/http-client.js'
import { startOidcStub } from '../../../tests/oidc-stub.js'
import type { OidcStub } from '../../../tests/oidc-stub.js'
import { createAuthRouter } from './router.js'
import { pruneExpiredSessions } from './sessions.js'

let dbClient: DbClient
let stub: OidcStub
let server: Server
let origin: string

const domain = `authflow-${randomUUID()}.test`
const created: string[] = []

beforeAll(async () => {
  dbClient = await createTestDb()
  stub = await startOidcStub()

  // The origin has to exist before the application that polices redirects
  // against it, so the socket is bound first.
  server = express().listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', resolve))
  origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`

  const app = express()
  app.use(express.json())
  app.use(
    '/api/v1',
    createAuthRouter({
      dbClient,
      auth: {
        issuerUrl: stub.issuerUrl,
        clientId: stub.clientId,
        clientSecret: stub.clientSecret,
        appOrigin: origin,
        allowInsecureRequests: true,
      },
    }),
  )
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Not found.' } })
  })
  server.removeAllListeners('request')
  server.on('request', app)
}, 60_000)

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
  await stub.close()
  // Sessions cascade with the user rows; folders and tasks are handled by the
  // shared helper's RESTRICT-aware order.
  for (const id of created) {
    await dbClient.db.execute(sql`DELETE FROM folder_members WHERE user_id = ${id}`)
  }
  await cleanupUsers(dbClient.db, created)
  await dbClient.close()
})

function browser(): TestBrowser {
  return new TestBrowser(origin)
}

/** The whole flow, as a browser walks it. */
async function signIn(
  jar: TestBrowser = browser(),
  tz?: string,
): Promise<{ jar: TestBrowser; sessionCookie: string; csrfCookie: string }> {
  const start = new URL(`${origin}/api/v1/auth/google`)
  if (tz !== undefined) start.searchParams.set('tz', tz)

  const begun = await jar.request(start.toString())
  expect(begun.status, `authorization must redirect: ${begun.body}`).toBe(302)

  const authorizationUrl = new URL(begun.location ?? '')
  const provider = await fetch(authorizationUrl, { redirect: 'manual' })
  const callbackUrl = new URL(provider.headers.get('location') ?? '')

  const callback = await jar.request(callbackUrl.toString())
  expect(
    callback.status >= 300 && callback.status < 400,
    `the callback must establish a session and redirect: ${String(callback.status)} ${callback.body.slice(0, 200)}`,
  ).toBe(true)

  const session = jar.cookies().find((cookie) => cookie.httpOnly)
  const csrf = jar.cookies().find((cookie) => !cookie.httpOnly)
  expect(session?.value, 'the callback set no session cookie').toBeTruthy()
  expect(csrf?.value, 'the callback set no CSRF cookie').toBeTruthy()
  return {
    jar,
    sessionCookie: session?.value ?? '',
    csrfCookie: csrf?.value ?? '',
  }
}

async function userIdFor(sub: string): Promise<string> {
  const found = await rows(
    dbClient.db,
    sql`SELECT id FROM users WHERE google_sub = ${sub}`,
  )
  const id = found[0]?.id
  expect(id, `no account exists for ${sub}`).toBeDefined()
  const value = String(id)
  if (!created.includes(value)) created.push(value)
  return value
}

function identity(tag: string, overrides: Record<string, unknown> = {}): string {
  const sub = `${tag}-${randomUUID()}`
  stub.nextIdentity({
    sub,
    email: `${tag}@${domain}`,
    email_verified: true,
    name: 'Flow Person',
    ...overrides,
  })
  return sub
}

describe('the handshake (AC-005, AC-105 to AC-107)', () => {
  test('a first sign-in provisions the four rows and stores the reported zone', async () => {
    const sub = identity('first')
    const { jar } = await signIn(browser(), 'Asia/Karachi')
    const userId = await userIdFor(sub)

    const me = await jar.request(`${origin}/api/v1/me`)
    expect(me.status).toBe(200)
    const body = me.json() as {
      user: { id: string; email: string; timezone: string }
      settings: Record<string, boolean>
      pending_invite_count: number
    }
    expect(body.user.id).toBe(userId)
    expect(body.user.email, 'section 4.1 stores the email lowercased').toBe(
      `first@${domain}`,
    )
    expect(body.user.timezone).toBe('Asia/Karachi')
    expect(body.settings).toEqual({
      show_important: true,
      show_all: true,
      show_done: false,
    })
    expect(body.pending_invite_count).toBe(0)

    const folders = await rows(
      dbClient.db,
      sql`SELECT id, name, is_default FROM folders WHERE owner_id = ${userId}`,
    )
    expect(folders, 'one default folder').toHaveLength(1)
    expect(
      folders[0]?.name,
      'RFC 0005: provisioning names the catch-all Desk',
    ).toBe('Desk')
    expect(folders[0]?.is_default).toBe(true)
    const members = await rows(
      dbClient.db,
      sql`SELECT user_id FROM folder_members WHERE folder_id = ${String(folders[0]?.id)}`,
    )
    expect(members, 'the owner is a member of their Inbox (INV-3, INV-10)').toHaveLength(1)
  })

  test('the successful callback redirects into the app, not the landing page', async () => {
    // 7.1 says "redirects into the app"; 10.6 fixes the app's start_url at
    // /app. The landing page is a different surface with different copy.
    identity('destination')
    const jar = browser()
    const begun = await jar.request(`${origin}/api/v1/auth/google`)
    const provider = await fetch(new URL(begun.location ?? ''), { redirect: 'manual' })
    const callback = await jar.request(provider.headers.get('location') ?? '')

    const target = new URL(callback.location ?? '', origin)
    expect(target.origin).toBe(origin)
    expect(target.pathname, 'the callback must land in the app (7.1, 10.6)').toBe('/app')
  })

  test('an oversized provider claim does not break the sign-in (4.1 CHECKs)', async () => {
    // display_name and avatar_url carry CHECK constraints, and the values
    // arrive from Google rather than from this API's caller: an unusually
    // long profile must not turn a legitimate sign-in into a constraint
    // violation and a 5xx.
    const sub = identity('oversized', {
      name: 'N'.repeat(500),
      picture: `https://example.test/${'p'.repeat(2500)}.png`,
    })
    const { jar } = await signIn()
    const userId = await userIdFor(sub)
    expect((await jar.request(`${origin}/api/v1/me`)).status).toBe(200)

    const stored = await rows(
      dbClient.db,
      sql`SELECT display_name, avatar_url FROM users WHERE id = ${userId}`,
    )
    expect(String(stored[0]?.display_name).length).toBe(200)
    expect(String(stored[0]?.avatar_url).length).toBe(2000)
  })

  test('a sign-in reporting no zone provisions UTC, not the server zone', async () => {
    const sub = identity('zoneless')
    await signIn()
    const found = await rows(
      dbClient.db,
      sql`SELECT timezone FROM users WHERE google_sub = ${sub}`,
    )
    await userIdFor(sub)
    expect(found[0]?.timezone).toBe('UTC')
  })

  test('signing in again provisions nothing a second time (AC-005)', async () => {
    const sub = identity('repeat')
    await signIn()
    const userId = await userIdFor(sub)
    await signIn()

    const users = await rows(
      dbClient.db,
      sql`SELECT id FROM users WHERE google_sub = ${sub}`,
    )
    expect(users, 'a second login created a second account').toHaveLength(1)
    const folders = await rows(
      dbClient.db,
      sql`SELECT count(*)::int AS n FROM folders WHERE owner_id = ${userId}`,
    )
    expect(Number(folders[0]?.n), 'a second login created a second Inbox').toBe(1)
  })

  test('a forged state is refused and provisions nothing (AC-105)', async () => {
    const sub = identity('forged')
    const jar = browser()
    const begun = await jar.request(`${origin}/api/v1/auth/google`)
    const provider = await fetch(new URL(begun.location ?? ''), { redirect: 'manual' })
    const callbackUrl = new URL(provider.headers.get('location') ?? '')
    callbackUrl.searchParams.set('state', `forged-${randomUUID()}`)

    const callback = await jar.request(callbackUrl.toString())
    expect(callback.status, 'a forged state must be refused, not crash').toBeLessThan(500)
    expect(
      jar.cookies().filter((cookie) => cookie.httpOnly),
      'a forged state established a session',
    ).toEqual([])
    expect(
      await rows(dbClient.db, sql`SELECT id FROM users WHERE google_sub = ${sub}`),
      'a forged state provisioned an account',
    ).toHaveLength(0)
  })

  test('another browser cannot spend this browser\'s state (AC-105)', async () => {
    const sub = identity('hijack')
    const victim = browser()
    const begun = await victim.request(`${origin}/api/v1/auth/google`)
    const provider = await fetch(new URL(begun.location ?? ''), { redirect: 'manual' })
    const callbackUrl = new URL(provider.headers.get('location') ?? '')

    const attacker = browser()
    await attacker.request(`${origin}/api/v1/auth/google`)
    const hijacked = await attacker.request(callbackUrl.toString())
    expect(
      attacker.cookies().filter((cookie) => cookie.httpOnly && cookie.value !== ''),
      'one browser spent another browser\'s state',
    ).toEqual([])
    expect(hijacked.status).toBeLessThan(500)
    expect(
      await rows(dbClient.db, sql`SELECT id FROM users WHERE google_sub = ${sub}`),
    ).toHaveLength(0)
  })

  test('a spent state cannot be spent twice (AC-105)', async () => {
    const sub = identity('replay')
    const jar = browser()
    const begun = await jar.request(`${origin}/api/v1/auth/google`)
    const provider = await fetch(new URL(begun.location ?? ''), { redirect: 'manual' })
    const callbackUrl = new URL(provider.headers.get('location') ?? '')
    const replayer = jar.clone()

    const first = await jar.request(callbackUrl.toString())
    expect(first.status).toBeGreaterThanOrEqual(300)
    await userIdFor(sub)

    // A fresh code for the same authorization, so the only thing left to
    // refuse the replay is the spent state.
    const replayUrl = new URL(callbackUrl)
    replayUrl.searchParams.set('code', stub.mintExtraCode())
    await replayer.request(replayUrl.toString())
    expect(
      replayer.cookies().filter((cookie) => cookie.httpOnly && cookie.value !== ''),
      'a spent state was accepted a second time',
    ).toEqual([])
  })

  test('the authorization request carries state, nonce, and an S256 challenge (AC-107)', async () => {
    identity('pkce')
    // Asserted on the URL the application produced rather than on what the
    // provider recorded: nothing follows this redirect, so the stub has not
    // seen it yet, and the parameters are the application's own work either
    // way.
    const begun = await browser().request(`${origin}/api/v1/auth/google`)
    const params = new URL(begun.location ?? '').searchParams
    expect(params.get('code_challenge_method')).toBe('S256')
    expect(params.get('code_challenge')).toBeTruthy()
    expect(params.get('state')).toBeTruthy()
    expect(params.get('nonce')).toBeTruthy()
    expect(
      (params.get('scope') ?? '').split(' ').sort(),
      'no scope beyond openid, email, and profile (10.1)',
    ).toEqual(['email', 'openid', 'profile'])
  })
})

describe('the ID token is validated (AC-106)', () => {
  const crafted: [string, Record<string, unknown>][] = [
    ['a mismatched nonce', { nonce: 'wrong-nonce' }],
    ['no nonce at all', { nonce: null }],
    ['another audience', { aud: 'some-other-client' }],
    ['another issuer', { iss: 'https://accounts.example.invalid' }],
    ['an expired token', { expiresInSeconds: -60 }],
    ['a rogue signing key', { rogueKey: true }],
    ['alg none', { alg: 'none' }],
    ['HS256 with the client secret', { alg: 'HS256' }],
    ['no subject', { sub: null }],
    ['no email', { email: null }],
  ]

  for (const [what, overrides] of crafted) {
    test(`${what} is refused without crashing`, async () => {
      const sub = identity('crafted')
      stub.overrideNextIdToken(overrides)

      const jar = browser()
      const begun = await jar.request(`${origin}/api/v1/auth/google`)
      const provider = await fetch(new URL(begun.location ?? ''), { redirect: 'manual' })
      const callback = await jar.request(provider.headers.get('location') ?? '')

      expect(
        callback.status,
        `${what} must be refused, not answered 5xx (answered ${String(callback.status)})`,
      ).toBeLessThan(500)
      expect(
        jar.cookies().filter((cookie) => cookie.httpOnly && cookie.value !== ''),
        `${what} established a session`,
      ).toEqual([])
      expect(
        await rows(dbClient.db, sql`SELECT id FROM users WHERE google_sub = ${sub}`),
        `${what} provisioned an account`,
      ).toHaveLength(0)
    })
  }

  test('an untampered token still signs in, so the refusals mean something', async () => {
    const sub = identity('control')
    await signIn()
    await userIdFor(sub)
  })
})

describe('the unverified email refusal (AC-008)', () => {
  test('the 9.2 page is rendered and no rows are created', async () => {
    const sub = identity('unverified', { email_verified: false })
    const jar = browser()
    const begun = await jar.request(`${origin}/api/v1/auth/google`)
    const provider = await fetch(new URL(begun.location ?? ''), { redirect: 'manual' })
    const callback = await jar.request(provider.headers.get('location') ?? '')

    expect(callback.contentType).toContain('text/html')
    expect(callback.status).toBeLessThan(500)
    // Through the harness's own reader, because an escaped apostrophe is not
    // a copy difference and AC-008 compares the same way.
    const text = visibleText(callback.body)
    expect(text).toContain("We can't sign you in yet")
    expect(text).toContain(
      "Your Google email address isn't verified. Dana uses your email for sharing and invites, so it needs Google to confirm it first. Verify your email with Google, then try again.",
    )
    expect(text).toContain('Back to Dana')
    expect(
      await rows(dbClient.db, sql`SELECT id FROM users WHERE google_sub = ${sub}`),
      'a refused sign-in created a user row',
    ).toHaveLength(0)
  })
})

describe('sessions (AC-010, AC-110, AC-113)', () => {
  test('the session cookie is httpOnly, Secure, SameSite=Lax and opaque', async () => {
    const sub = identity('cookie')
    const { jar } = await signIn()
    const userId = await userIdFor(sub)

    const session = jar.cookies().find((cookie) => cookie.httpOnly)
    expect(session?.secure, 'Secure is set unconditionally (11.6)').toBe(true)
    expect(session?.sameSite?.toLowerCase()).toBe('lax')
    expect(session?.value).not.toContain(userId)
    expect(session?.value).not.toContain(sub)
    expect(session?.value).not.toMatch(/^eyJ/)
  })

  test('the stored key is the sha256 of the cookie token, and the token is nowhere (AC-113)', async () => {
    const sub = identity('digest')
    const { sessionCookie } = await signIn()
    const userId = await userIdFor(sub)

    const stored = await rows(
      dbClient.db,
      sql`SELECT token_hash FROM sessions WHERE user_id = ${userId}`,
    )
    expect(stored).toHaveLength(1)
    expect(String(stored[0]?.token_hash)).toBe(
      createHash('sha256').update(sessionCookie).digest('hex'),
    )
    expect(String(stored[0]?.token_hash)).toMatch(/^[0-9a-f]{64}$/)
  })

  test('an expired session answers 401 and is not revived by presenting it (AC-113)', async () => {
    const sub = identity('expiry')
    const { jar } = await signIn()
    const userId = await userIdFor(sub)
    expect((await jar.request(`${origin}/api/v1/me`)).status).toBe(200)

    const expiredAt = new Date(Date.now() - 24 * 60 * 60 * 1000)
    await dbClient.db.execute(
      sql`UPDATE sessions SET expires_at = ${expiredAt.toISOString()}::timestamptz WHERE user_id = ${userId}`,
    )

    expect((await jar.request(`${origin}/api/v1/me`)).status).toBe(401)
    const after = await rows(
      dbClient.db,
      sql`SELECT expires_at FROM sessions WHERE user_id = ${userId}`,
    )
    for (const row of after) {
      expect(
        new Date(String(row.expires_at)).getTime(),
        'a rejected request rolled the expiry: expiry is being extended before it is checked',
      ).toBeLessThanOrEqual(expiredAt.getTime())
    }
  })

  test('a live session rolls to 30 days on use (AC-113)', async () => {
    const sub = identity('rolling')
    const { jar } = await signIn()
    const userId = await userIdFor(sub)

    const near = new Date(Date.now() + 24 * 60 * 60 * 1000)
    await dbClient.db.execute(
      sql`UPDATE sessions SET expires_at = ${near.toISOString()}::timestamptz WHERE user_id = ${userId}`,
    )
    expect((await jar.request(`${origin}/api/v1/me`)).status).toBe(200)

    const after = await rows(
      dbClient.db,
      sql`SELECT expires_at FROM sessions WHERE user_id = ${userId}`,
    )
    const rolled = new Date(String(after[0]?.expires_at)).getTime()
    expect(rolled).toBeGreaterThan(near.getTime())
    expect(Math.abs(rolled - (Date.now() + 30 * 24 * 60 * 60 * 1000))).toBeLessThan(
      60 * 60 * 1000,
    )
  })

  test('a fresh sign-in issues a new identifier every time (AC-108)', async () => {
    identity('fixation')
    const first = await signIn()
    const second = await signIn()
    expect(second.sessionCookie).not.toBe(first.sessionCookie)

    // A value planted before sign-in is neither adopted nor honored.
    const planted = `attacker-chosen-${randomUUID()}`
    const victim = browser()
    victim.plant('dana_session', planted)
    const third = await signIn(victim)
    expect(third.sessionCookie).not.toBe(planted)

    const attacker = browser()
    attacker.plant('dana_session', planted)
    expect((await attacker.request(`${origin}/api/v1/me`)).status).toBe(401)
  })

  test('logout destroys one session, and the identifier stays dead (AC-010)', async () => {
    identity('logout')
    const first = await signIn()
    const second = await signIn()
    expect((await first.jar.request(`${origin}/api/v1/me`)).status).toBe(200)

    const logout = await first.jar.request(`${origin}/api/v1/auth/logout`, {
      method: 'POST',
    })
    expect(logout.status).toBe(204)
    expect((await first.jar.request(`${origin}/api/v1/me`)).status).toBe(401)

    const replay = browser()
    replay.plant('dana_session', first.sessionCookie)
    expect(
      (await replay.request(`${origin}/api/v1/me`)).status,
      'the identifier still works: the cookie was cleared but the row was not deleted',
    ).toBe(401)

    expect(
      (await second.jar.request(`${origin}/api/v1/me`)).status,
      'logging out of one client signed the person out of the other',
    ).toBe(200)
  })

  test('the logout response does not also reissue the session it destroys', async () => {
    // Every authenticated request refreshes the cookie's lifetime, and logout
    // is an authenticated request, so the response carried both a fresh
    // 30-day session cookie and its deletion. Browsers apply the last line
    // and the row was gone regardless, but a response that contradicts itself
    // and comes out right only because of header order is one nobody should
    // have to reason about. Platform found it reading the mounted app.
    identity('logout-headers')
    const { jar } = await signIn()

    const logout = await jar.request(`${origin}/api/v1/auth/logout`, {
      method: 'POST',
    })
    expect(logout.status).toBe(204)

    for (const name of ['dana_session', 'dana_csrf']) {
      const lines = logout.setCookie.filter((line) => line.startsWith(`${name}=`))
      expect(
        lines.length,
        `the logout response carries ${String(lines.length)} instructions for ${name}: ${lines.join(' | ')}`,
      ).toBe(1)
      expect(
        lines[0],
        `the one ${name} line must be a deletion, not a reissue`,
      ).toMatch(/Expires=Thu, 01 Jan 1970/)
    }
  })

  test('the account deletion response does not reissue cookies either', async () => {
    identity('delete-headers')
    const { jar } = await signIn()

    const deletion = await jar.request(`${origin}/api/v1/me`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: 'DELETE' }),
    })
    expect(deletion.status).toBe(204)

    for (const name of ['dana_session', 'dana_csrf']) {
      expect(
        deletion.setCookie.filter((line) => line.startsWith(`${name}=`)),
      ).toHaveLength(1)
    }
  })

  test('a forged or malformed identifier answers 401, never 500 (AC-110)', async () => {
    for (const value of [
      `forged-${randomUUID()}`,
      '../../etc/passwd',
      '',
      // Malformed percent-encoding, which an adversarial review found took
      // every route behind the session middleware down with a URIError: a
      // cookie is attacker-controlled input, and a browser holding one goes
      // on resending it, so the 500 repeated until the person cleared it by
      // hand. Neither suite's hostile values contained a percent sign.
      '%',
      '%ZZ',
      '50%off',
      '%E0%A4%A',
    ]) {
      const jar = browser()
      jar.plant('dana_session', value)
      expect(
        (await jar.request(`${origin}/api/v1/me`)).status,
        `session cookie ${JSON.stringify(value)} must answer 401, not crash`,
      ).toBe(401)
    }
  })

  test('a malformed pending cookie refuses the callback without crashing', async () => {
    for (const value of ['%', '%ZZ']) {
      const jar = browser()
      const begun = await jar.request(`${origin}/api/v1/auth/google`)
      const provider = await fetch(new URL(begun.location ?? ''), {
        redirect: 'manual',
      })
      jar.plant('dana_pending', value)
      const callback = await jar.request(provider.headers.get('location') ?? '')
      expect(
        callback.status,
        `pending cookie ${JSON.stringify(value)} must refuse, not crash`,
      ).toBeLessThan(500)
    }
  })

  test('an active session keeps a full lifetime on the cookie, not only the row', async () => {
    // 10.1's expiry is rolling on both sides: a row extended to 30 days out
    // behind a cookie that still expires on the original deadline signs an
    // active person out on day 30.
    identity('rolling-cookie')
    const { jar } = await signIn()
    const response = await jar.request(`${origin}/api/v1/me`)
    expect(response.status).toBe(200)

    const reissued = response.setCookie.map((line) => line.toLowerCase())
    const session = reissued.find((line) => line.startsWith('dana_session='))
    expect(
      session,
      'an authenticated request did not refresh the session cookie, so its lifetime never rolls',
    ).toBeDefined()
    expect(session).toContain('max-age=2592000')
  })

  test('pruning removes expired rows and leaves live ones (11.6, 11.7)', async () => {
    const sub = identity('prune')
    const { jar } = await signIn()
    const userId = await userIdFor(sub)
    await dbClient.db.execute(
      sql`UPDATE sessions SET expires_at = now() - interval '1 day' WHERE user_id = ${userId}`,
    )

    const removed = await pruneExpiredSessions(dbClient.db)
    expect(removed).toBeGreaterThanOrEqual(1)
    expect(
      await rows(dbClient.db, sql`SELECT token_hash FROM sessions WHERE user_id = ${userId}`),
    ).toHaveLength(0)
    expect((await jar.request(`${origin}/api/v1/me`)).status).toBe(401)
  })
})

describe('CSRF and the account endpoints (AC-009, AC-111, AC-112)', () => {
  test('a mutation without the token answers 403 and changes nothing (AC-111)', async () => {
    const sub = identity('csrf')
    const { jar } = await signIn(browser(), 'Asia/Karachi')
    const userId = await userIdFor(sub)

    const refused = await jar.request(`${origin}/api/v1/me`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ timezone: 'Europe/London' }),
      csrf: 'omit',
    })
    expect(refused.status).toBe(403)
    const after = await rows(
      dbClient.db,
      sql`SELECT timezone FROM users WHERE id = ${userId}`,
    )
    expect(after[0]?.timezone, 'the mutation was applied despite the 403').toBe(
      'Asia/Karachi',
    )
  })

  test('another session\'s token does not authorize this session (AC-111)', async () => {
    identity('csrf-subject')
    const subject = await signIn()
    identity('csrf-other')
    const other = await signIn()

    const response = await subject.jar.request(`${origin}/api/v1/me`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ timezone: 'Europe/London' }),
      csrf: other.csrfCookie,
    })
    expect(response.status).toBe(403)
  })

  test('the session\'s own token lets the mutation proceed (AC-111)', async () => {
    const sub = identity('csrf-ok')
    const { jar } = await signIn()
    const userId = await userIdFor(sub)

    const response = await jar.request(`${origin}/api/v1/me`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ timezone: 'Europe/London' }),
    })
    expect(response.status).toBe(200)
    const after = await rows(
      dbClient.db,
      sql`SELECT timezone FROM users WHERE id = ${userId}`,
    )
    expect(after[0]?.timezone).toBe('Europe/London')
  })

  test('an unauthenticated mutation answers 401, not 403 (AC-111, 11.3 order)', async () => {
    const response = await browser().request(`${origin}/api/v1/me`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ timezone: 'Europe/London' }),
      csrf: 'omit',
    })
    expect(response.status).toBe(401)
  })

  test('reads never require the token (AC-111)', async () => {
    identity('csrf-read')
    const { jar } = await signIn()
    expect(
      (await jar.request(`${origin}/api/v1/me`, { csrf: 'omit' })).status,
    ).toBe(200)
  })

  test('PATCH /me leaves a tzdb alias of the stored zone alone (8.1)', async () => {
    // "a reported zone that is a tzdb alias of the stored one is not a
    // different zone: no write, and no 8.6 recompute". The endpoint reads the
    // same sentence as the login path, and writing US/Eastern over
    // America/New_York would hand the account a zone nobody chose and, from
    // P7, recompute every reminder for nothing.
    const sub = identity('patch-alias')
    const { jar } = await signIn()
    const userId = await userIdFor(sub)

    const set = await jar.request(`${origin}/api/v1/me`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ timezone: 'America/New_York' }),
    })
    expect(set.status).toBe(200)

    const aliased = await jar.request(`${origin}/api/v1/me`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ timezone: 'US/Eastern' }),
    })
    expect(aliased.status).toBe(200)

    const stored = await rows(
      dbClient.db,
      sql`SELECT timezone FROM users WHERE id = ${userId}`,
    )
    expect(
      stored[0]?.timezone,
      'US/Eastern was written over its canonical name (spec 8.1)',
    ).toBe('America/New_York')
  })

  test('PATCH /me answers 422 naming the field for a bad zone (7.1, 10.3)', async () => {
    identity('patch-invalid')
    const { jar } = await signIn()
    for (const timezone of ['Not/AZone', '+05:30', 42, null]) {
      const response = await jar.request(`${origin}/api/v1/me`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ timezone }),
      })
      expect(response.status, `timezone ${JSON.stringify(timezone)}`).toBe(422)
      const body = response.json() as { error: { code: string; message: string } }
      expect(body.error.code).toBe('validation_failed')
      expect(body.error.message).toContain('timezone')
    }
  })

  test('DELETE /me requires the literal confirm string (AC-009)', async () => {
    const sub = identity('delete-guard')
    const { jar } = await signIn()
    const userId = await userIdFor(sub)

    for (const confirm of ['delete', 'Delete', 'DELETE ', true, 1, null, undefined]) {
      const response = await jar.request(`${origin}/api/v1/me`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(confirm === undefined ? {} : { confirm }),
      })
      expect(response.status, `confirm ${JSON.stringify(confirm)}`).toBe(422)
    }
    expect((await jar.request(`${origin}/api/v1/me`)).status, 'the session survived').toBe(200)
    const still = await rows(
      dbClient.db,
      sql`SELECT google_sub FROM users WHERE id = ${userId}`,
    )
    expect(still[0]?.google_sub, 'a refused deletion scrubbed the row').toBe(sub)
  })

  test('DELETE /me revokes every session immediately (AC-009, AC-112)', async () => {
    const sub = identity('delete')
    const laptop = await signIn()
    const phone = await signIn()
    const userId = await userIdFor(sub)
    identity('bystander')
    const bystander = await signIn()

    expect((await laptop.jar.request(`${origin}/api/v1/me`)).status).toBe(200)
    expect((await phone.jar.request(`${origin}/api/v1/me`)).status).toBe(200)

    const deletion = await laptop.jar.request(`${origin}/api/v1/me`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: 'DELETE' }),
    })
    expect(deletion.status).toBe(204)

    expect((await laptop.jar.request(`${origin}/api/v1/me`)).status).toBe(401)
    expect(
      (await phone.jar.request(`${origin}/api/v1/me`)).status,
      'the other client still authenticates after deletion (8.10 step 8)',
    ).toBe(401)
    for (const token of [laptop.sessionCookie, phone.sessionCookie]) {
      const replay = browser()
      replay.plant('dana_session', token)
      expect((await replay.request(`${origin}/api/v1/me`)).status).toBe(401)
    }
    expect(
      (await bystander.jar.request(`${origin}/api/v1/me`)).status,
      'deleting one account revoked an unrelated session',
    ).toBe(200)

    // Step 7: the row is scrubbed rather than deleted, so surviving
    // references still resolve and the google_sub is free again.
    const scrubbed = await rows(
      dbClient.db,
      sql`SELECT google_sub, email, display_name, deleted_at FROM users WHERE id = ${userId}`,
    )
    expect(scrubbed[0]?.google_sub).toBeNull()
    expect(scrubbed[0]?.email).toBeNull()
    expect(scrubbed[0]?.deleted_at).not.toBeNull()
  })
})

describe('timezone sync (AC-007)', () => {
  test('a returning login from a different zone writes it, an alias does not', async () => {
    const sub = identity('traveler')
    await signIn(browser(), 'America/New_York')
    const userId = await userIdFor(sub)
    const zone = async (): Promise<string> =>
      String(
        (
          await rows(dbClient.db, sql`SELECT timezone FROM users WHERE id = ${userId}`)
        )[0]?.timezone,
      )
    expect(await zone()).toBe('America/New_York')

    // A tzdb alias of the stored zone is not a different zone (8.1).
    await signIn(browser(), 'US/Eastern')
    expect(await zone()).toBe('America/New_York')

    await signIn(browser(), 'Europe/London')
    expect(await zone()).toBe('Europe/London')

    // A login carrying no tz syncs nothing.
    await signIn()
    expect(await zone()).toBe('Europe/London')

    // An unparseable zone is treated as absent, and never refuses the sign-in.
    for (const rubbish of ['Not/AZone', 'UTC+5', '+05:30', '', '../../etc']) {
      await signIn(browser(), rubbish)
      expect(await zone(), `tz=${JSON.stringify(rubbish)} was stored`).toBe(
        'Europe/London',
      )
    }
  })

  test('the reported zone never rides a redirect (AC-007, 11.6)', async () => {
    identity('carrier')
    const jar = browser()
    const begun = await jar.request(
      `${origin}/api/v1/auth/google?tz=${encodeURIComponent('Europe/London')}`,
    )
    const authorization = new URL(begun.location ?? '')
    expect(authorization.toString()).not.toContain('Europe')
    expect(authorization.toString()).not.toContain('London')
    expect(
      authorization.searchParams.get('redirect_uri'),
      'the zone rode redirect_uri',
    ).not.toContain('London')
  })
})

describe('redirect targets stay on this origin (AC-109)', () => {
  const EVIL = 'evil.example.invalid'

  test('a crafted Host moves neither the redirect_uri nor the issuer', async () => {
    identity('redirect')
    const crafted: Record<string, string>[] = [
      { 'x-forwarded-host': EVIL },
      { 'x-forwarded-host': EVIL, 'x-forwarded-proto': 'https' },
      { forwarded: `host=${EVIL};proto=https` },
    ]
    for (const headers of crafted) {
      const begun = await browser().request(`${origin}/api/v1/auth/google`, {
        headers,
        hostHeader: EVIL,
      })
      const authorization = new URL(begun.location ?? '')
      expect(authorization.origin, 'the authorization request left the issuer').toBe(
        stub.issuerUrl,
      )
      const redirectUri = authorization.searchParams.get('redirect_uri') ?? ''
      expect(new URL(redirectUri).origin, 'the redirect_uri left this origin').toBe(
        origin,
      )
    }
  })

  test('crafted return targets do not escape on success or refusal', async () => {
    identity('return-target')
    for (const param of ['next', 'redirect', 'return_to', 'continue']) {
      const jar = browser()
      const start = new URL(`${origin}/api/v1/auth/google`)
      start.searchParams.set(param, `https://${EVIL}/`)
      const begun = await jar.request(start.toString())
      const provider = await fetch(new URL(begun.location ?? ''), {
        redirect: 'manual',
      })
      const callbackUrl = new URL(provider.headers.get('location') ?? '')
      callbackUrl.searchParams.set(param, `https://${EVIL}/`)

      const callback = await jar.request(callbackUrl.toString(), {
        hostHeader: EVIL,
        headers: { 'x-forwarded-host': EVIL },
      })
      expect(callback.status).toBeLessThan(500)
      const location = callback.location
      expect(
        location === null ? origin : new URL(location, origin).origin,
        `${param} escaped the application origin`,
      ).toBe(origin)
    }
  })

  test('the provider error path refuses without escaping', async () => {
    identity('cancelled')
    stub.failNextAuthorization('access_denied')
    const jar = browser()
    const begun = await jar.request(`${origin}/api/v1/auth/google`)
    const provider = await fetch(new URL(begun.location ?? ''), { redirect: 'manual' })
    const callbackUrl = new URL(provider.headers.get('location') ?? '')
    callbackUrl.searchParams.set('next', `https://${EVIL}/`)

    const callback = await jar.request(callbackUrl.toString(), { hostHeader: EVIL })
    expect(callback.status, 'a cancelled authorization answered 5xx').toBeLessThan(500)
    const location = callback.location
    expect(location === null ? origin : new URL(location, origin).origin).toBe(origin)
  })
})

describe('no Google token is persisted (AC-115)', () => {
  test('nothing the provider issued appears anywhere in the database', async () => {
    const sub = identity('tokens')
    // Only this sign-in's three tokens: every sign-in in this file walks the
    // same code path, so sweeping the dozens issued by earlier cases buys no
    // evidence and multiplies the query count by column until the case times
    // out, which would report as an error rather than as an assertion.
    const before = stub.issuedTokens().length
    const { jar } = await signIn()
    await userIdFor(sub)
    expect((await jar.request(`${origin}/api/v1/me`)).status).toBe(200)

    const issued = stub.issuedTokens().slice(before)
    expect(issued.length, 'the sign-in never reached the token endpoint').toBeGreaterThan(0)

    const columns = (await rows(
      dbClient.db,
      sql`SELECT table_schema, table_name, column_name
          FROM information_schema.columns
          WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
            AND data_type IN ('text', 'character varying', 'character', 'json', 'jsonb')`,
    )) as unknown as {
      table_schema: string
      table_name: string
      column_name: string
    }[]

    for (const column of columns) {
      for (const token of issued) {
        const found = await rows(
          dbClient.db,
          sql`SELECT count(*)::int AS n
              FROM ${sql.raw(`"${column.table_schema}"."${column.table_name}"`)}
              WHERE strpos(${sql.raw(`"${column.column_name}"::text`)}, ${token}) > 0`,
        )
        expect(
          Number(found[0]?.n),
          `a Google token is stored in ${column.table_name}.${column.column_name}`,
        ).toBe(0)
      }
    }
  }, 60_000)
})
