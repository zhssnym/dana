/*
The contract as code, checked against the surface that answers.

A schema in app/src/shared is a promise about what the API sends. Nothing
makes that promise true except comparing it to a real answer from the real
mounted application, so this file boots createApp against the stub issuer and
parses what comes back with the shared schemas themselves. If the two ever
drift, exactly one of them is wrong and this says so.

It sits in src/server/http rather than src/shared because it starts a server:
src/shared is compiled by the client too, and the tests beside it should stay
free of anything the browser would never load.

Scope: shapes, statuses, and envelope conformance for the P1 surface of 7.1.
The behaviors behind those shapes are the acceptance suite's (AC-005 to
AC-010, AC-105 to AC-115) and the auth module's own tests'; nothing here
duplicates them.
*/
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { DbClient } from '../../../db/client.js'
import { cleanupUsers, createTestDb, rows } from '../../../tests/helpers.js'
import { TestBrowser, rawRequest } from '../../../tests/http-client.js'
import { startOidcStub } from '../../../tests/oidc-stub.js'
import type { OidcStub } from '../../../tests/oidc-stub.js'
import { errorEnvelope } from '../../shared/error-envelope.js'
import { meResponse } from '../../shared/me.js'
import { createApp } from '../index.js'

let dbClient: DbClient
let stub: OidcStub
let server: Server
let origin: string
const created: string[] = []
const domain = `contract-${randomUUID()}.test`

beforeAll(async () => {
  dbClient = await createTestDb()
  stub = await startOidcStub()

  server = createServer()
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`

  // The real construction seam, with the real mount: this file is about what
  // the application answers, so it builds the application rather than a
  // stand-in for it.
  server.on(
    'request',
    createApp({
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
}, 60_000)

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
  await stub.close()
  for (const id of created) {
    await dbClient.db.execute(sql`DELETE FROM folder_members WHERE user_id = ${id}`)
  }
  await cleanupUsers(dbClient.db, created)
  await dbClient.close()
})

async function signIn(tz?: string): Promise<TestBrowser> {
  const sub = `contract-${randomUUID()}`
  // One address per account. Reusing one across subjects walks into the
  // collision on users_email_active_idx, which refuses the sign-in with 9.2's
  // claimed-email page (issue #17), and every assertion after it would then be
  // measuring the refusal.
  stub.nextIdentity({
    sub,
    email: `${sub}@${domain}`,
    email_verified: true,
    name: 'Contract Person',
  })
  const jar = new TestBrowser(origin)
  const start = new URL(`${origin}/api/v1/auth/google`)
  if (tz !== undefined) start.searchParams.set('tz', tz)
  const begun = await jar.request(start.toString())
  const provider = await fetch(new URL(begun.location ?? ''), { redirect: 'manual' })
  await jar.request(provider.headers.get('location') ?? '')

  const found = await rows(
    dbClient.db,
    sql`SELECT id FROM users WHERE google_sub = ${sub}`,
  )
  created.push(String(found[0]?.id))
  return jar
}

describe('GET /me answers the 7.1 shape', () => {
  test('the response parses against the shared schema, exactly', async () => {
    const jar = await signIn('Asia/Karachi')
    const response = await jar.request(`${origin}/api/v1/me`)
    expect(response.status).toBe(200)
    expect(response.contentType).toContain('application/json')

    const parsed = meResponse.safeParse(response.json())
    expect(
      parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      'the /me body does not match app/src/shared/me.ts',
    ).toEqual([])
  })

  test('it carries exactly the keys 7.1 names, and no others', async () => {
    // The schema strips unknown keys, so parsing alone cannot notice an extra
    // one. 7.1 fixes the body, and a field nobody documented is a field the
    // client will eventually depend on.
    const jar = await signIn()
    const body = (await jar.request(`${origin}/api/v1/me`)).json() as Record<
      string,
      Record<string, unknown>
    >

    expect(Object.keys(body).sort()).toEqual([
      'pending_invite_count',
      'settings',
      'user',
    ])
    expect(Object.keys(body.user ?? {}).sort()).toEqual([
      'avatar_url',
      'display_name',
      'email',
      'id',
      'timezone',
    ])
    // 7.2's three booleans, which is what 7.1's unqualified "settings" means.
    expect(Object.keys(body.settings ?? {}).sort()).toEqual([
      'show_all',
      'show_done',
      'show_important',
    ])
  })

  test('the settings object carries 4.10 defaults for a fresh account', async () => {
    const jar = await signIn()
    const body = (await jar.request(`${origin}/api/v1/me`)).json() as {
      settings: Record<string, boolean>
      pending_invite_count: number
    }
    expect(body.settings).toEqual({
      show_important: true,
      show_all: true,
      show_done: false,
    })
    expect(body.pending_invite_count).toBe(0)
  })

  test('pending_invite_count is Q12: pending invites addressed to this email', async () => {
    // Q12 (section 6): invites where email = the viewer's lowercased email and
    // status = 'pending'. Counted rather than assumed: a count that ignored
    // status or address would pass every other assertion in this file.
    const jar = await signIn()
    const me = (await jar.request(`${origin}/api/v1/me`)).json() as {
      user: { id: string; email: string }
    }
    const inviter = me.user.id

    await dbClient.db.execute(
      sql`INSERT INTO invites (inviter_id, email, status)
          VALUES (${inviter}, ${me.user.email}, 'pending')`,
    )
    await dbClient.db.execute(
      sql`INSERT INTO invites (inviter_id, email, status)
          VALUES (${inviter}, ${me.user.email}, 'declined')`,
    )
    await dbClient.db.execute(
      sql`INSERT INTO invites (inviter_id, email, status)
          VALUES (${inviter}, ${`someone.else@${domain}`}, 'pending')`,
    )

    const after = (await jar.request(`${origin}/api/v1/me`)).json() as {
      pending_invite_count: number
    }
    expect(
      after.pending_invite_count,
      'the count must be pending invites for this address only (Q12)',
    ).toBe(1)

    await dbClient.db.execute(sql`DELETE FROM invites WHERE inviter_id = ${inviter}`)
  })
})

describe('the 7.0 envelope and status taxonomy', () => {
  const TAXONOMY = new Set([400, 401, 403, 404, 409, 422, 429])

  test('every refusal on the JSON surface carries the envelope', async () => {
    const jar = await signIn()
    const cases: [string, Promise<{ status: number; contentType: string; json(): unknown }>][] = [
      ['unauthenticated', rawRequest(`${origin}/api/v1/me`)],
      ['unknown path', rawRequest(`${origin}/api/v1/nowhere`)],
      [
        'validation',
        jar.request(`${origin}/api/v1/me`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ timezone: 'Not/AZone' }),
        }),
      ],
      [
        'csrf',
        jar.request(`${origin}/api/v1/me`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ timezone: 'UTC' }),
          csrf: 'omit',
        }),
      ],
      [
        'malformed body',
        jar.request(`${origin}/api/v1/me`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: '{',
        }),
      ],
    ]

    for (const [label, pending] of cases) {
      const response = await pending
      expect(response.contentType, `${label} did not answer JSON`).toContain(
        'application/json',
      )
      const parsed = errorEnvelope.safeParse(response.json())
      expect(parsed.success, `${label} did not answer the 7.0 envelope`).toBe(true)
      expect(
        TAXONOMY.has(response.status),
        `${label} answered ${String(response.status)}, which 7.0's uniform status list does not contain`,
      ).toBe(true)
    }
  })

  test('the status and its code agree, one code per status', async () => {
    const jar = await signIn()
    const expected: [number, string, Promise<{ status: number; json(): unknown }>][] = [
      [401, 'unauthenticated', rawRequest(`${origin}/api/v1/me`)],
      [404, 'not_found', rawRequest(`${origin}/api/v1/nowhere`)],
      [
        403,
        'forbidden',
        jar.request(`${origin}/api/v1/me`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ timezone: 'UTC' }),
          csrf: 'omit',
        }),
      ],
      [
        422,
        'validation_failed',
        jar.request(`${origin}/api/v1/me`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ timezone: 42 }),
        }),
      ],
      [
        400,
        'bad_request',
        jar.request(`${origin}/api/v1/me`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: '{',
        }),
      ],
    ]

    for (const [status, code, pending] of expected) {
      const response = await pending
      expect(response.status).toBe(status)
      expect((response.json() as { error: { code: string } }).error.code).toBe(code)
    }
  })

  test('a parseable body with a bad field is 422 and names it; an unparseable one is 400', async () => {
    // The reading the Steward settled in 5e01e49, pinned on the surface that
    // has to honor it rather than only in the schemas underneath.
    const jar = await signIn()

    for (const body of ['{"timezone":"Not/AZone"}', '{"timezone":42}', '{}']) {
      const response = await jar.request(`${origin}/api/v1/me`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body,
      })
      expect(response.status, `${body} must answer 422`).toBe(422)
      const message = (response.json() as { error: { message: string } }).error.message
      expect(message, `${body} must name the field`).toContain('timezone')
    }

    for (const body of ['{', '{"timezone":', 'not json at all']) {
      const response = await jar.request(`${origin}/api/v1/me`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body,
      })
      expect(response.status, `${body} must answer 400`).toBe(400)
    }
  })

  test('unknown fields are tolerated, wrong-typed known fields are not (7.0)', async () => {
    const jar = await signIn()
    const tolerated = await jar.request(`${origin}/api/v1/me`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ timezone: 'Europe/London', nickname: 'ignored', nested: { a: 1 } }),
    })
    expect(tolerated.status, '7.0 tolerates unknown fields').toBe(200)

    const refused = await jar.request(`${origin}/api/v1/me`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ timezone: ['Europe/London'] }),
    })
    expect(refused.status).toBe(422)
  })

  test('a body-level failure says so in words a caller can act on', async () => {
    // No JSON content type, so nothing parsed a body and the schema sees
    // undefined. The answer must not surface the validator's own phrasing.
    const jar = await signIn()
    const response = await jar.request(`${origin}/api/v1/me`, {
      method: 'PATCH',
      headers: { 'content-type': 'text/plain' },
      body: '{"timezone":"UTC"}',
    })
    expect(response.status).toBe(422)
    const message = (response.json() as { error: { message: string } }).error.message
    expect(message).toBe('A JSON object body is required.')
    expect(message, 'the validator\'s phrasing reached the caller').not.toContain('expected object')
  })
})

describe('the 7.1 statuses and redirects', () => {
  test('the documented statuses are what the endpoints answer', async () => {
    const jar = await signIn()

    expect((await jar.request(`${origin}/api/v1/me`)).status, 'GET /me').toBe(200)
    expect(
      (
        await jar.request(`${origin}/api/v1/me`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ timezone: 'Europe/London' }),
        })
      ).status,
      'PATCH /me',
    ).toBe(200)
    expect(
      (await jar.request(`${origin}/api/v1/auth/logout`, { method: 'POST' })).status,
      'POST /auth/logout',
    ).toBe(204)

    const departing = await signIn()
    expect(
      (
        await departing.request(`${origin}/api/v1/me`, {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ confirm: 'DELETE' }),
        })
      ).status,
      'DELETE /me',
    ).toBe(204)
  })

  test('both redirects stay on this origin and land where the spec says', async () => {
    const jar = new TestBrowser(origin)
    const sub = `contract-redirect-${randomUUID()}`
    stub.nextIdentity({
      sub,
      email: `${sub}@${domain}`,
      email_verified: true,
      name: 'Redirected',
    })

    const begun = await jar.request(`${origin}/api/v1/auth/google`)
    expect(begun.status, 'GET /auth/google redirects to the issuer').toBe(302)
    expect(new URL(begun.location ?? '').origin).toBe(stub.issuerUrl)

    const provider = await fetch(new URL(begun.location ?? ''), { redirect: 'manual' })
    const callback = await jar.request(provider.headers.get('location') ?? '')
    const target = new URL(callback.location ?? '', origin)
    expect(target.origin, 'the callback left this origin').toBe(origin)
    // 7.1 redirects into the app; 10.6 fixes the app's start_url at /app.
    expect(target.pathname).toBe('/app')

    const found = await rows(
      dbClient.db,
      sql`SELECT id FROM users WHERE google_sub = ${sub}`,
    )
    created.push(String(found[0]?.id))
  })
})
